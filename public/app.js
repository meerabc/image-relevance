// Frontend for the image relevance API.
// Guard thresholds: the server reports its configured defaults through /health
// and this UI keeps browser-local overrides on top of them. Every match run
// sends the active thresholds as query parameters, so the results, the meter
// markers and the review actions always reflect exactly the operating point
// shown in the guard panel.
const THRESHOLD_FALLBACK = { similarity: 0.55, noOverlap: 0.65, confidence: 0.70 };
const STORAGE_KEY = 'guard-thresholds';
const PREVIEW_COUNT = 10;

let SERVER_DEFAULTS = { ...THRESHOLD_FALLBACK };
let THRESHOLDS = loadSavedThresholds() || { ...THRESHOLD_FALLBACK };

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const imgUrl = (file) => `/media/${encodeURIComponent(file)}`;
const pct = (n) => `${Math.max(0, Math.min(1, n)) * 100}%`;

function loadSavedThresholds() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return null;
    const t = {
      similarity: Number(saved.similarity),
      noOverlap: Number(saved.noOverlap),
      confidence: Number(saved.confidence)
    };
    const valid = Object.values(t).every((n) => Number.isFinite(n) && n > 0 && n < 1);
    // the stricter no-overlap line is part of the guard's contract
    if (!valid || t.noOverlap < t.similarity) return null;
    return t;
  } catch {
    return null;
  }
}

function saveThresholds() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(THRESHOLDS));
}

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

/* ---------- styled confirmation dialog (same look as the rest of the UI) ---------- */
// resolves true when the user confirms, false on cancel, backdrop click or Escape
function confirmDialog({ title, text, okLabel = 'Delete' }) {
  return new Promise((resolve) => {
    const box = $('#confirm');
    const okBtn = $('#confirm-ok');
    const cancelBtn = $('#confirm-cancel');
    const opener = document.activeElement;

    function onClick(e) {
      if (e.target === okBtn) done(true);
      else if (e.target === cancelBtn || e.target === box) done(false);
    }
    function onKey(e) { if (e.key === 'Escape') done(false); }
    function done(answer) {
      box.hidden = true;
      box.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus();
      resolve(answer);
    }

    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    okBtn.textContent = okLabel;
    box.hidden = false;
    cancelBtn.focus();
    box.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  });
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
  if (name === 'search') setTimeout(() => $('#search-input').focus(), 60);
  if (name === 'costs') loadCosts();
  if (name === 'review') loadReviewStats();
}

/* ---------- add-content sub-tabs: post / image ---------- */
document.querySelectorAll('.subtabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtabs button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    $('#sub-post').hidden = btn.dataset.sub !== 'post';
    $('#sub-image').hidden = btn.dataset.sub !== 'image';
  });
});

/* ---------- server defaults for the guard panel ---------- */
async function loadHealth() {
  try {
    const h = await api('/health');

    // the server's tuned thresholds become the reset point of the guard panel
    if (h.guard && Number.isFinite(h.guard.similarity)) {
      SERVER_DEFAULTS = {
        similarity: Number(h.guard.similarity),
        noOverlap: Number(h.guard.noOverlap ?? h.guard.similarity),
        confidence: Number(h.guard.confidence ?? 0.7)
      };
    }

    // no browser override saved yet: follow the server defaults from the start
    if (!localStorage.getItem(STORAGE_KEY)) {
      THRESHOLDS = { ...SERVER_DEFAULTS };
    }
    syncGuardPanel();
  } catch {
    // the API is unreachable; each tab shows the error when it is used
  }
}

/* ---------- guard panel: user-adjustable thresholds ---------- */
const TH_CONTROLS = [
  { key: 'similarity', input: 'th-similarity', out: 'th-similarity-out', def: 'th-similarity-def' },
  { key: 'noOverlap', input: 'th-no-overlap', out: 'th-no-overlap-out', def: 'th-no-overlap-def' },
  { key: 'confidence', input: 'th-confidence', out: 'th-confidence-out', def: 'th-confidence-def' }
];

function syncGuardPanel() {
  for (const c of TH_CONTROLS) {
    $(`#${c.input}`).value = THRESHOLDS[c.key];
    $(`#${c.out}`).textContent = THRESHOLDS[c.key].toFixed(2);
    $(`#${c.def}`).textContent = SERVER_DEFAULTS[c.key].toFixed(2);
  }
}

// the stricter line must stay the stricter one; whichever slider is moved
// drags the other along so the invariant holds without server round-trip errors
function enforceThresholdOrder(changedKey) {
  if (THRESHOLDS.noOverlap < THRESHOLDS.similarity) {
    const merged = THRESHOLDS[changedKey];
    THRESHOLDS.similarity = merged;
    THRESHOLDS.noOverlap = merged;
  }
}

function wireGuardPanel() {
  for (const c of TH_CONTROLS) {
    const input = $(`#${c.input}`);
    input.addEventListener('input', () => {
      $(`#${c.out}`).textContent = Number(input.value).toFixed(2);
    });
    // change fires on release, so one adjustment is one re-score, not a stream
    input.addEventListener('change', () => {
      THRESHOLDS[c.key] = Number(input.value);
      enforceThresholdOrder(c.key);
      saveThresholds();
      syncGuardPanel();
      if (selectedPostId) runMatch(selectedPostId);
    });
  }

  $('#guard-reset').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    THRESHOLDS = { ...SERVER_DEFAULTS };
    syncGuardPanel();
    toast('Guard thresholds reset to server defaults');
    if (selectedPostId) runMatch(selectedPostId);
  });

  syncGuardPanel();
}

/* ---------- posts + matching ---------- */
let currentResult = null;
let showAll = false;
let selectedPostId = null;

async function loadPosts() {
  const list = $('#post-list');
  try {
    const posts = await api('/posts');
    list.innerHTML = posts.map((p) => `
      <li><button class="post-btn" data-id="${p.id}">
        <b>${esc(p.title)}</b><small>topic: ${esc(p.topic)}${p.has_embedding ? '' : ' · no embedding yet'}</small>
      </button></li>`).join('')
      || '<li class="loading">No posts yet. Add one in "Add content".</li>';
    list.querySelectorAll('.post-btn').forEach((b) => b.addEventListener('click', () => runMatch(b.dataset.id)));
  } catch (e) {
    list.innerHTML = `<li class="loading">Could not load posts: ${esc(e.message)}</li>`;
  }
}

// thresholds travel with every match request, so the guard scores against the
// exact operating point the user sees in the panel
function thresholdsQuery() {
  const params = new URLSearchParams({
    similarity: THRESHOLDS.similarity,
    noOverlap: THRESHOLDS.noOverlap,
    confidence: THRESHOLDS.confidence
  });
  return params.toString();
}

async function runMatch(id) {
  selectedPostId = id;
  document.querySelectorAll('.post-btn').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === String(id))));
  const stage = $('#match-stage');
  stage.innerHTML = '<p class="loading">Scoring every image against this post…</p>';
  try {
    currentResult = await api(`/posts/${encodeURIComponent(id)}/images?${thresholdsQuery()}`);
    showAll = false;
    renderResult();
  } catch (e) {
    currentResult = null;
    stage.innerHTML = `<div class="empty"><h1>Matching failed</h1><p>${esc(e.message)}. Check that this post has an embedding and the server logs for details.</p></div>`;
  }
}

// a freshly indexed image changes the candidate pool, so a match that is
// already on screen is re-run instead of showing a stale count
function refreshActiveMatch() {
  if (selectedPostId) runMatch(selectedPostId);
}

// the delete action lives in the open post's detail view, guarded by the
// styled confirmation dialog instead of the browser's own confirm()
async function deletePost(id, title) {
  const ok = await confirmDialog({
    title: 'Delete this post?',
    text: `"${title}" is removed together with its embedding, every suggestion and the review history. This cannot be undone.`,
    okLabel: 'Delete post'
  });
  if (!ok) return;

  try {
    const res = await api(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast(`Post "${res.title}" deleted`);

    if (selectedPostId === String(id)) {
      selectedPostId = null;
      currentResult = null;
      $('#match-stage').innerHTML = `<div class="empty"><h1>Pick a post to find its image</h1><p>The engine scores every image in the library against the post, then the mismatch guard decides whether any of them is good enough to recommend.</p></div>`;
    }
    await loadPosts();
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteImage(id, fileName) {
  const ok = await confirmDialog({
    title: 'Delete this image?',
    text: `"${fileName}" is removed from the library, its embedding and any suggestions go with it. The image file is deleted from disk. This cannot be undone.`,
    okLabel: 'Delete image'
  });
  if (!ok) return;

  try {
    const res = await api(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' });

    libImages = libImages.filter((i) => String(i.id) !== String(id));
    if (libFilter !== 'all' && !libImages.some((i) => i.category === libFilter)) libFilter = 'all';
    renderLibrary();
    toast(res.fileDeleted ? `Image "${fileName}" deleted` : `Image "${fileName}" deleted from the library (file was already gone)`);

    // a match view that still shows the deleted image would hold a broken
    // thumbnail, so it is re-scored immediately when a post is selected
    if (currentResult && currentResult.allCandidates.some((c) => c.file === fileName)) {
      refreshActiveMatch();
    }
  } catch (e) {
    toast(e.message, true);
  }
}

function reviewChip(status) {
  if (status === 'approved') return '<span class="chip ok">Approved</span>';
  if (status === 'rejected') return '<span class="chip bad">Rejected</span>';
  return '<span class="chip">Needs review</span>';
}

// the similarity line a candidate is judged against depends on whether its
// tags relate to the topic, so the marker is drawn per candidate
function thresholdLineFor(item) {
  const topic = Array.isArray(item?.checks) && item.checks.find((c) => c.name === 'topic');
  return topic && topic.passed ? THRESHOLDS.similarity : THRESHOLDS.noOverlap;
}

function meter(score, tone, line = THRESHOLDS.similarity) {
  return `<div class="meter ${tone || ''}" role="img" aria-label="Similarity ${score.toFixed(2)}, guard threshold ${line.toFixed(2)}">
    <i style="width:${pct(score)}"></i><u style="left:${pct(line)}" title="Guard threshold ${line.toFixed(2)}"></u></div>`;
}

// the guard's per-check verdict, straight from evaluation.checks
function checksHtml(checks) {
  if (!Array.isArray(checks) || !checks.length) return '';
  return `<ul class="checks">${checks.map((c) =>
    `<li><span class="dot ${c.passed ? '' : 'fail'}"></span>${esc(c.label)}: ${esc(c.detail)}</li>`).join('')}</ul>`;
}

function actionButtons(item) {
  return `<div class="actions">
    <button class="btn approve" data-act="approve" data-id="${item.suggestionId}" aria-pressed="${item.reviewStatus === 'approved'}">Approve</button>
    <button class="btn reject" data-act="reject" data-id="${item.suggestionId}" aria-pressed="${item.reviewStatus === 'rejected'}">Reject</button>
  </div>`;
}

function unscoredNotice(count) {
  if (!count) return '';
  return `<p class="unscored-note"><span class="chip warn">${count} not scored</span> that many library image${count === 1 ? ' has' : 's have'} no embedding yet, so the guard could not judge ${count === 1 ? 'it' : 'them'}. They are embedded automatically in the background and join the results on the next match run.</p>`;
}

function renderResult() {
  const r = currentResult;
  // the selected post's own content is readable right here, and its delete
  // button lives in the same header instead of the sidebar list
  const contentHtml = r.postContent
    ? `<details class="post-content"><summary>View post content</summary><p>${esc(r.postContent)}</p></details>`
    : '';
  const head = `<div class="post-head">
    <div class="post-head-main">
      <h1>${esc(r.postTitle)}</h1>
      <p>Topic keyword: ${esc(r.postTopic)}</p>
      ${contentHtml}
    </div>
    <button class="btn danger" id="delete-post-btn" type="button">Delete post</button>
  </div>`;
  let verdict;

  if (r.topMatch) {
    const t = r.topMatch;
    verdict = `<div class="verdict">
      <figure><img class="zoomable" data-file="${esc(t.file)}" data-cap="${esc(t.subject)}" src="${imgUrl(t.file)}" alt="${esc(t.subject)}"></figure>
      <div class="verdict-body">
        <div><span class="chip ok">Recommended image</span> ${reviewChip(t.reviewStatus)}</div>
        <h2>${esc(t.subject)}</h2>
        <div>${meter(t.score, 'ok', thresholdLineFor(t))}<div class="meter-label"><span>Similarity <b>${t.score.toFixed(2)}</b></span><span>Guard line ${thresholdLineFor(t).toFixed(2)}</span></div></div>
        ${checksHtml(t.checks)}
        <p class="reason">${esc(t.reason)}</p>
        ${actionButtons(t)}
      </div></div>`;
  } else {
    const best = r.allCandidates[0];
    verdict = `<div class="verdict refused"><div class="verdict-body">
      <div><span class="chip bad">No confident match</span></div>
      <h2>The guard found nothing safe to recommend</h2>
      <p class="reason">${esc(r.reason)}</p>
      ${best ? `<p class="reason">Closest image was “${esc(best.subject)}” at similarity ${best.score.toFixed(2)}, below the ${thresholdLineFor(best).toFixed(2)} requirement. No image is recommended when every candidate fails the guard checks.</p>` : ''}
    </div></div>`;
  }

  const cands = r.allCandidates;
  const shown = showAll ? cands : cands.slice(0, PREVIEW_COUNT);
  const passed = cands.filter((c) => c.isMatch).length;
  const list = `<section class="cands">
    <div class="cands-head"><h2>All candidates, best score first</h2><span>${passed} of ${cands.length} passed the guard</span></div>
    ${unscoredNotice(r.unscored)}
    ${shown.map(candidateHtml).join('')}
    ${cands.length > PREVIEW_COUNT ? `<button class="btn more" id="toggle-all">${showAll ? 'Show top ' + PREVIEW_COUNT : 'Show all ' + cands.length}</button>` : ''}
  </section>`;

  $('#match-stage').innerHTML = head + verdict + list;
  wireResult();
}

function candidateHtml(c) {
  return `<div class="cand" data-sid="${c.suggestionId}">
    <button class="cand-row" aria-expanded="false">
      <img class="zoomable" data-file="${esc(c.file)}" data-cap="${esc(c.subject || c.file)}" src="${imgUrl(c.file)}" alt="" loading="lazy">
      <span><b>${esc(c.subject)}</b><small>${esc(c.file)}</small></span>
      <span class="meter-cell">${meter(c.score, c.isMatch ? 'ok' : 'bad', thresholdLineFor(c))}</span>
      <span>${c.isMatch ? '<span class="chip ok">Passed</span>' : '<span class="chip bad">Blocked</span>'} ${reviewChip(c.reviewStatus)}</span>
    </button>
    <div class="cand-detail" hidden></div>
  </div>`;
}

function wireResult() {
  const stage = $('#match-stage');
  const toggle = $('#toggle-all');
  if (toggle) toggle.addEventListener('click', () => { showAll = !showAll; renderResult(); });

  const deleteBtn = $('#delete-post-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', () => deletePost(selectedPostId, currentResult.postTitle));

  stage.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => review(btn)));

  stage.querySelectorAll('.cand').forEach((card) => {
    const row = card.querySelector('.cand-row');
    const detail = card.querySelector('.cand-detail');
    const item = currentResult.allCandidates.find((c) => String(c.suggestionId) === card.dataset.sid);
    row.addEventListener('click', (e) => {
      if (e.target.closest('.zoomable')) return; // thumbnail click previews the image, not expand
      const open = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', String(!open));
      detail.hidden = open;
      if (open || detail.dataset.loaded) return;
      // the match response already carries the full guard breakdown, rendered locally
      detail.innerHTML = `
          ${checksHtml(item.checks)}
          <p class="reason">${esc(item.reason)}</p>
          <dl>
            <dt>Image</dt><dd>${esc(item.subject)} · ${esc(item.category)} · confidence ${Number(item.confidence).toFixed(2)}</dd>
            <dt>Human review</dt><dd>${esc(item.reviewStatus || 'pending')}</dd>
          </dl>${actionButtons(item)}`;
      detail.dataset.loaded = '1';
      detail.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => review(b)));
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

/* ---------- add content: new post ---------- */
function wirePostForm() {
  $('#post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: $('#post-title').value.trim(),
      topic: $('#post-topic').value.trim(),
      content: $('#post-content').value.trim()
    };
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const post = await api('/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      toast(`Post "${post.title}" saved and embedded`);
      e.target.reset();
      await loadPosts();
      // the post is embedded and matchable the moment it is saved
      runMatch(post.id);
      showTab('match');
    } catch (err) {
      const detail = err.message + ($('#post-form').dataset.details || '');
      toast(detail, true);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- add content: image upload ---------- */
let selectedFile = null;

function resetUpload() {
  const input = $('#image-input');
  input.value = '';
  selectedFile = null;
  $('#upload-preview').src = '';
  $('#upload-preview').hidden = true;
  $('#dropzone-text').textContent = 'Choose a JPG or PNG, up to 10 MB';
  $('#upload-btn').disabled = true;
  $('#upload-status').innerHTML = '';
}

// after a terminal upload state, offer a clean slate instead of a stale preview
function offerAnother(statusEl) {
  statusEl.insertAdjacentHTML('beforeend', '<button class="btn more" id="upload-another">Upload another image</button>');
  statusEl.querySelector('#upload-another').addEventListener('click', resetUpload);
}

function wireUpload() {
  const input = $('#image-input');
  const preview = $('#upload-preview');
  const dropText = $('#dropzone-text');
  const btn = $('#upload-btn');

  input.addEventListener('change', () => {
    selectedFile = input.files[0] || null;
    if (selectedFile) {
      preview.src = URL.createObjectURL(selectedFile);
      preview.hidden = false;
      dropText.textContent = selectedFile.name;
      btn.disabled = false;
      $('#upload-status').innerHTML = '';
    } else {
      preview.hidden = true;
      dropText.textContent = 'Choose a JPG or PNG, up to 10 MB';
      btn.disabled = true;
    }
  });

  btn.addEventListener('click', async () => {
    if (!selectedFile) return;
    btn.disabled = true;
    const status = $('#upload-status');
    status.innerHTML = '<span class="chip">Uploading…</span>';
    try {
      const fd = new FormData();
      fd.append('image', selectedFile);
      const res = await api('/images', { method: 'POST', body: fd });

      if (res.duplicate) {
        status.innerHTML = `<span class="chip warn">Duplicate</span> <span>already in the library as <b>${esc(res.image.file_name)}</b>. No vision call was spent.</span>`;
        offerAnother(status);
        toast('Duplicate image, skipped');
        return;
      }

      status.innerHTML = '<span class="chip">Queued</span> <span>waiting for the vision job…</span>';
      pollJob(res.jobId, status);
    } catch (e) {
      status.innerHTML = `<span class="chip bad">Upload failed</span> <span>${esc(e.message)}</span>`;
      btn.disabled = false;
    }
  });
}

function pollJob(jobId, statusEl) {
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  const timer = setInterval(async () => {
    try {
      const job = await api(`/jobs/${jobId}`);
      if (job.status === 'queued' || job.status === 'processing') {
        statusEl.innerHTML = `<span class="chip">${spinner[frame++ % spinner.length]} ${job.status}</span> <span>the vision model is tagging your image…</span>`;
        return;
      }
      clearInterval(timer);

      if (job.status === 'done') {
        const d = job.result.data;
        statusEl.innerHTML = `
          <div class="result-line"><span class="chip ok">Indexed</span> <b>${esc(d.subject)}</b></div>
          <div class="result-line"><small>${esc(d.category)} · confidence ${Number(d.confidence).toFixed(2)} · ${job.result.embedded ? 'embedded locally' : 'embedding failed, the library will retry it automatically'}</small></div>
          <div class="result-line"><small class="muted">${esc(d.caption)}</small></div>`;
        offerAnother(statusEl);
        toast('Image tagged and indexed');

        // the candidate pool just changed: invalidate the library cache and
        // re-score the post that is currently open so its counts move now,
        // not after the next manual click
        loaded.library = false;
        if (!$('#tab-library').hidden) loadLibrary();
        loadPosts();
        refreshActiveMatch();
      } else {
        statusEl.innerHTML = `<span class="chip bad">Failed</span> <span>${esc(job.error)}</span>`;
        offerAnother(statusEl);
      }
      $('#upload-btn').disabled = false;
    } catch (e) {
      clearInterval(timer);
      statusEl.innerHTML = `<span class="chip bad">Job tracking failed</span> <span>${esc(e.message)}</span>`;
      $('#upload-btn').disabled = false;
    }
  }, 1500);
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
      <img class="zoomable" data-file="${esc(i.file_name)}" data-cap="${esc(i.caption || i.subject || i.file_name)}" src="${imgUrl(i.file_name)}" alt="${esc(i.caption || i.subject || i.file_name)}" loading="lazy">
      <div><b>${esc(i.subject || 'Unlabelled')}</b>
      <small>${esc(i.file_name)}${i.confidence != null ? ' · confidence ' + Number(i.confidence).toFixed(2) : ''}</small>
      ${statusChip(i.status)}${i.has_embedding ? '' : '<span class="chip warn">not scored</span>'}
      <button class="card-delete" data-id="${i.id}" data-file="${esc(i.file_name)}" aria-label="Delete image ${esc(i.file_name)}" title="Delete this image">&times;</button></div></article>`).join('')
    || '<p class="loading">No images processed yet.</p>';
  $('#lib-grid').querySelectorAll('.card-delete').forEach((b) => b.addEventListener('click', () => deleteImage(b.dataset.id, b.dataset.file)));
}

/* ---------- semantic search ---------- */
function scoreChip(score) {
  const label = `${Math.round(score * 100)}% match`;
  if (score >= THRESHOLDS.similarity) return `<span class="chip ok">${label}</span>`;
  if (score >= 0.45) return `<span class="chip warn">${label}</span>`;
  return `<span class="chip">${label}</span>`;
}

async function runSearch(event) {
  event.preventDefault();
  const q = $('#search-input').value.trim();
  if (q.length < 2) return;

  const meta = $('#search-meta');
  const grid = $('#search-grid');
  meta.textContent = 'Embedding your query and ranking the library…';
  grid.innerHTML = '';

  try {
    const data = await api(`/search?q=${encodeURIComponent(q)}&limit=36`);
    meta.textContent = `${data.results.length} results · query embedded in ${data.embeddingMs} ms · ranked in ${data.searchMs} ms`;
    grid.innerHTML = data.results.map((r) => `<article class="card">
      <img class="zoomable" data-file="${esc(r.file_name)}" data-cap="${esc(r.caption || r.subject || r.file_name)}" src="${imgUrl(r.file_name)}" alt="${esc(r.caption || r.subject || r.file_name)}" loading="lazy">
      <div><b>${esc(r.subject || 'Unlabelled')}</b>
      <small>${esc(r.category || '')}</small>
      ${scoreChip(r.score)}</div></article>`).join('')
      || '<p class="loading">No library image matched that description. Different wording or additional images may help.</p>';
  } catch (e) {
    meta.textContent = '';
    grid.innerHTML = `<p class="loading">Search failed: ${esc(e.message)}</p>`;
  }
}

/* ---------- lightbox: full-size preview for any zoomable image ---------- */
function openLightbox(file, caption) {
  $('#lightbox-img').src = imgUrl(file);
  $('#lightbox-cap').textContent = caption || file;
  $('#lightbox').hidden = false;
}

function closeLightbox() {
  $('#lightbox').hidden = true;
  $('#lightbox-img').src = '';
}

document.addEventListener('click', (e) => {
  const zoomable = e.target.closest('.zoomable');
  if (zoomable) {
    openLightbox(zoomable.dataset.file, zoomable.dataset.cap);
    return;
  }
  if (e.target.closest('.lightbox-close') || e.target.id === 'lightbox') closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#lightbox').hidden) closeLightbox();
});

/* ---------- review insights ---------- */
async function loadReviewStats() {
  const summaryEl = $('#review-summary');
  const tableEl = $('#review-table');
  try {
    const data = await api('/review/stats');
    const s = data.summary;
    summaryEl.innerHTML = `
      <div class="stat"><b>${Number(s.total_approved)}</b><span>approved by humans</span></div>
      <div class="stat"><b>${Number(s.total_rejected)}</b><span>rejected by humans</span></div>
      <div class="stat ${Number(s.approved_against_guard) ? 'alert' : ''}"><b>${Number(s.approved_against_guard)}</b><span>approved against the guard</span></div>
      <div class="stat ${Number(s.rejected_against_guard) ? 'alert' : ''}"><b>${Number(s.rejected_against_guard)}</b><span>rejected against the guard</span></div>`;

    tableEl.innerHTML = `<thead><tr><th>Post</th><th>Image</th><th>Guard said</th><th>Human said</th><th>Why</th></tr></thead><tbody>` +
      (data.disagreements.map((d) => `<tr>
        <td>${esc(d.post_title)}</td>
        <td>${esc(d.file_name)}<small class="muted"> · ${esc(d.subject || '')}</small></td>
        <td>${d.is_match ? '<span class="chip ok">Approved</span>' : '<span class="chip bad">Rejected</span>'}</td>
        <td>${d.review_status === 'approved' ? '<span class="chip ok">Approved</span>' : '<span class="chip bad">Rejected</span>'}</td>
        <td class="why">${esc(d.reason)}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="loading">No disagreements recorded yet. Approve or reject candidates to populate this table.</td></tr>') +
      '</tbody>';
  } catch (e) {
    summaryEl.innerHTML = `<p class="loading">Could not load review stats: ${esc(e.message)}</p>`;
  }
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
loadHealth();
wireGuardPanel();
wirePostForm();
wireUpload();
document.querySelector('#search-form').addEventListener('submit', runSearch);
