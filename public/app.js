// Frontend for the image relevance API. Talks only to existing endpoints plus GET /posts and GET /images.
// Thresholds mirror src/services/mismatchGuard.js, used here only to draw the guard markers.
const SIMILARITY_THRESHOLD = 0.55;
const CONFIDENCE_THRESHOLD = 0.70;
const PREVIEW_COUNT = 10;

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const imgUrl = (file) => `/media/${encodeURIComponent(file)}`;
const pct = (n) => `${Math.max(0, Math.min(1, n)) * 100}%`;

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast' + (isError ? ' err' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ---------- tabs ---------- */
const loaded = {};
document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `tab-${name}`; });
  if (name === 'library' && !loaded.library) loadLibrary();
  if (name === 'costs') loadCosts();
}

/* ---------- posts + matching ---------- */
let currentResult = null;
let showAll = false;

async function loadPosts() {
  const list = $('#post-list');
  try {
    const posts = await api('/posts');
    list.innerHTML = posts.map((p) => `
      <li><button class="post-btn" data-id="${p.id}">
        <b>${esc(p.title)}</b><small>topic: ${esc(p.topic)}${p.has_embedding ? '' : ' · no embedding yet'}</small>
      </button></li>`).join('') || '<li class="loading">No posts yet. Run node src/seedPosts.js first.</li>';
    list.querySelectorAll('.post-btn').forEach((b) => b.addEventListener('click', () => runMatch(b.dataset.id)));
  } catch (e) {
    list.innerHTML = `<li class="loading">Could not load posts: ${esc(e.message)}</li>`;
  }
}

async function runMatch(id) {
  document.querySelectorAll('.post-btn').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === String(id))));
  const stage = $('#match-stage');
  stage.innerHTML = '<p class="loading">Scoring every image against this post…</p>';
  try {
    currentResult = await api(`/posts/${encodeURIComponent(id)}/images`);
    showAll = false;
    renderResult();
  } catch (e) {
    stage.innerHTML = `<div class="empty"><h1>Matching failed</h1><p>${esc(e.message)}. Check that this post has an embedding and the server logs for details.</p></div>`;
  }
}

function reviewChip(status) {
  if (status === 'approved') return '<span class="chip ok">Approved</span>';
  if (status === 'rejected') return '<span class="chip bad">Rejected</span>';
  return '<span class="chip">Needs review</span>';
}

function meter(score, tone) {
  return `<div class="meter ${tone || ''}" role="img" aria-label="Similarity ${score.toFixed(2)}, guard threshold ${SIMILARITY_THRESHOLD}">
    <i style="width:${pct(score)}"></i><u style="left:${pct(SIMILARITY_THRESHOLD)}" title="Guard threshold ${SIMILARITY_THRESHOLD}"></u></div>`;
}

function actionButtons(item) {
  return `<div class="actions">
    <button class="btn approve" data-act="approve" data-id="${item.suggestionId}" aria-pressed="${item.reviewStatus === 'approved'}">Approve</button>
    <button class="btn reject" data-act="reject" data-id="${item.suggestionId}" aria-pressed="${item.reviewStatus === 'rejected'}">Reject</button>
  </div>`;
}

function renderResult() {
  const r = currentResult;
  const head = `<div class="post-head"><h1>${esc(r.postTitle)}</h1><p>Topic: ${esc(r.postTopic)}</p></div>`;
  let verdict;

  if (r.topMatch) {
    const t = r.topMatch;
    verdict = `<div class="verdict">
      <figure><img src="${imgUrl(t.file)}" alt="${esc(t.subject)}"></figure>
      <div class="verdict-body">
        <div><span class="chip ok">Recommended image</span> ${reviewChip(t.reviewStatus)}</div>
        <h2>${esc(t.subject)}</h2>
        <div>${meter(t.score, 'ok')}<div class="meter-label"><span>Similarity <b>${t.score.toFixed(2)}</b></span><span>Guard line ${SIMILARITY_THRESHOLD}</span></div></div>
        <ul class="checks">
          <li><span class="dot ${t.confidence >= CONFIDENCE_THRESHOLD ? '' : 'fail'}"></span>AI confidence ${Number(t.confidence).toFixed(2)} (needs ${CONFIDENCE_THRESHOLD})</li>
          <li><span class="dot ${t.score >= SIMILARITY_THRESHOLD ? '' : 'fail'}"></span>Similarity ${t.score.toFixed(2)} (needs ${SIMILARITY_THRESHOLD})</li>
          <li><span class="dot"></span>Subject matches post topic</li>
        </ul>
        <p class="reason">${esc(t.reason)}</p>
        ${actionButtons(t)}
      </div></div>`;
  } else {
    const best = r.allCandidates[0];
    verdict = `<div class="verdict refused"><div class="verdict-body">
      <div><span class="chip bad">No confident match</span></div>
      <h2>The guard found nothing safe to recommend</h2>
      <p class="reason">${esc(r.reason)}</p>
      ${best ? `<p class="reason">Closest image was “${esc(best.subject)}” at similarity ${best.score.toFixed(2)}, below the ${SIMILARITY_THRESHOLD} line. Showing no image is the intended behavior here.</p>` : ''}
    </div></div>`;
  }

  const cands = r.allCandidates;
  const shown = showAll ? cands : cands.slice(0, PREVIEW_COUNT);
  const passed = cands.filter((c) => c.isMatch).length;
  const list = `<section class="cands">
    <div class="cands-head"><h2>All candidates, best score first</h2><span>${passed} of ${cands.length} passed the guard</span></div>
    ${shown.map(candidateHtml).join('')}
    ${cands.length > PREVIEW_COUNT ? `<button class="btn more" id="toggle-all">${showAll ? 'Show top ' + PREVIEW_COUNT : 'Show all ' + cands.length}</button>` : ''}
  </section>`;

  $('#match-stage').innerHTML = head + verdict + list;
  wireResult();
}

function candidateHtml(c) {
  return `<div class="cand" data-sid="${c.suggestionId}">
    <button class="cand-row" aria-expanded="false">
      <img src="${imgUrl(c.file)}" alt="" loading="lazy">
      <span><b>${esc(c.subject)}</b><small>${esc(c.file)}</small></span>
      <span class="meter-cell">${meter(c.score, c.isMatch ? 'ok' : 'bad')}</span>
      <span>${c.isMatch ? '<span class="chip ok">Passed</span>' : '<span class="chip bad">Blocked</span>'} ${reviewChip(c.reviewStatus)}</span>
    </button>
    <div class="cand-detail" hidden></div>
  </div>`;
}

function wireResult() {
  const stage = $('#match-stage');
  const toggle = $('#toggle-all');
  if (toggle) toggle.addEventListener('click', () => { showAll = !showAll; renderResult(); });

  stage.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => review(btn)));

  stage.querySelectorAll('.cand').forEach((card) => {
    const row = card.querySelector('.cand-row');
    const detail = card.querySelector('.cand-detail');
    row.addEventListener('click', async () => {
      const open = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', String(!open));
      detail.hidden = open;
      if (open || detail.dataset.loaded) return;
      detail.textContent = 'Loading…';
      try {
        const s = await api(`/suggestions/${card.dataset.sid}`);
        const item = currentResult.allCandidates.find((c) => String(c.suggestionId) === card.dataset.sid);
        detail.innerHTML = `<dl>
            <dt>Guard decision</dt><dd>${s.is_match ? 'Approved' : 'Rejected'} (score ${Number(s.score).toFixed(3)})</dd>
            <dt>Reason</dt><dd>${esc(s.reason)}</dd>
            <dt>Image</dt><dd>${esc(s.subject)} · ${esc(s.category)} · confidence ${Number(s.confidence).toFixed(2)}</dd>
            <dt>Human review</dt><dd>${esc(s.review_status)}${s.reviewed_at ? ' on ' + new Date(s.reviewed_at).toLocaleString() : ''}</dd>
          </dl>${actionButtons(item)}`;
        detail.dataset.loaded = '1';
        detail.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => review(b)));
      } catch (e) {
        detail.textContent = `Could not load details: ${e.message}`;
      }
    });
  });
}

async function review(btn) {
  const { act, id } = btn.dataset;
  btn.disabled = true;
  try {
    const updated = await api(`/suggestions/${id}/${act}`, { method: 'POST' });
    const item = currentResult.allCandidates.find((c) => String(c.suggestionId) === String(id));
    if (item) item.reviewStatus = updated.review_status;
    if (currentResult.topMatch && String(currentResult.topMatch.suggestionId) === String(id)) {
      currentResult.topMatch.reviewStatus = updated.review_status;
    }
    toast(act === 'approve' ? 'Approved' : 'Rejected');
    renderResult();
  } catch (e) {
    btn.disabled = false;
    toast(e.message, true);
  }
}

/* ---------- library ---------- */
let libImages = [];
let libFilter = 'all';

async function loadLibrary() {
  try {
    libImages = await api('/images');
    loaded.library = true;
    renderLibrary();
  } catch (e) {
    $('#lib-grid').innerHTML = `<p class="loading">Could not load images: ${esc(e.message)}</p>`;
  }
}

function statusChip(status) {
  if (status === 'processed') return '<span class="chip ok">Processed</span>';
  if (status === 'low_confidence') return '<span class="chip warn">Low confidence</span>';
  if (status === 'failed') return '<span class="chip bad">Failed</span>';
  return `<span class="chip">${esc(status)}</span>`;
}

function renderLibrary() {
  const cats = ['all', ...new Set(libImages.map((i) => i.category).filter(Boolean))];
  $('#lib-filters').innerHTML = cats.map((c) => `<button aria-pressed="${c === libFilter}" data-cat="${esc(c)}">${esc(c === 'all' ? `All (${libImages.length})` : c)}</button>`).join('');
  $('#lib-filters').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { libFilter = b.dataset.cat; renderLibrary(); }));
  const items = libFilter === 'all' ? libImages : libImages.filter((i) => i.category === libFilter);
  $('#lib-grid').innerHTML = items.map((i) => `<article class="card">
      <img src="${imgUrl(i.file_name)}" alt="${esc(i.caption || i.subject || i.file_name)}" loading="lazy">
      <div><b>${esc(i.subject || 'Unlabelled')}</b>
      <small>${esc(i.file_name)}${i.confidence != null ? ' · confidence ' + Number(i.confidence).toFixed(2) : ''}</small>
      ${statusChip(i.status)}</div></article>`).join('') || '<p class="loading">No images processed yet. Run node src/runBatch.js.</p>';
}

/* ---------- costs ---------- */
async function loadCosts() {
  try {
    const data = await api('/costs');
    const total = data.summary.reduce((n, s) => n + Number(s.total_calls), 0);
    const ok = data.summary.reduce((n, s) => n + Number(s.successful_calls), 0);
    $('#cost-summary').innerHTML = `<div class="stat"><b>${total}</b><span>AI calls logged</span></div>
      <div class="stat"><b>${total - ok}</b><span>calls failed</span></div>` +
      data.summary.map((s) => `<div class="stat"><b>${esc(s.total_calls)}</b><span>${esc(s.call_type)} calls (${esc(s.successful_calls)} succeeded)</span></div>`).join('');
    $('#cost-table').innerHTML = `<thead><tr><th>When</th><th>Type</th><th>Reference</th><th>Result</th></tr></thead><tbody>` +
      data.entries.map((e) => `<tr><td>${esc(new Date(e.created_at).toLocaleString())}</td><td>${esc(e.call_type)}</td><td>${esc(e.reference)}</td>
        <td>${e.success ? '<span class="chip ok">Success</span>' : '<span class="chip bad">Failed</span>'}</td></tr>`).join('') + '</tbody>';
  } catch (e) {
    $('#cost-summary').innerHTML = `<p class="loading">Could not load costs: ${esc(e.message)}</p>`;
  }
}

loadPosts();
