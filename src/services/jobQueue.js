// tiny in-process job queue for upload intake
// uploads return a job id immediately and the UI polls the status,
// so a slow vision call never hangs an HTTP request
const jobs = new Map();
let nextId = 1;
let chain = Promise.resolve();

const processors = {};

function registerProcessor(type, fn) {
    processors[type] = fn;
}

function enqueueJob(type, payload) {
    const job = {
        id: nextId++,
        type,
        status: 'queued', // queued | processing | done | failed
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        result: null,
        error: null
    };
    jobs.set(job.id, job);

    // jobs run strictly one at a time so free tier quotas are never exceeded
    chain = chain.then(() => runJob(job, payload));
    job.promise = chain;

    return job;
}

async function runJob(job, payload) {
    const processor = processors[job.type];

    if (!processor) {
        job.status = 'failed';
        job.error = `No processor registered for job type "${job.type}"`;
        job.finishedAt = new Date().toISOString();
        return;
    }

    job.status = 'processing';
    job.startedAt = new Date().toISOString();

    try {
        job.result = await processor(payload);
        job.status = 'done';
    } catch (error) {
        job.status = 'failed';
        job.error = error.message;
    }
    job.finishedAt = new Date().toISOString();
}

function getJobById(id) {
    const job = jobs.get(Number(id));
    return job ? { ...job, promise: undefined } : null;
}

function listRecentJobs(limit = 20) {
    return [...jobs.values()]
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(job => ({ ...job, promise: undefined }));
}

module.exports = {
    registerProcessor,
    enqueueJob,
    getJobById,
    listRecentJobs
};
