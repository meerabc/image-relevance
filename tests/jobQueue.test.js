const { enqueueJob, registerProcessor, getJobById } = require('../src/services/jobQueue');

describe('jobQueue', () => {
    test('runs a queued job from queued through processing to done', async () => {
        let receivedPayload = null;
        registerProcessor('demo', async (payload) => {
            receivedPayload = payload;
            return { ok: true };
        });

        const job = enqueueJob('demo', { value: 7 });
        expect(job.status).toBe('queued');

        await job.promise;

        expect(job.status).toBe('done');
        expect(job.result).toEqual({ ok: true });
        expect(receivedPayload).toEqual({ value: 7 });
        expect(job.startedAt).not.toBeNull();
        expect(job.finishedAt).not.toBeNull();
    });

    test('records a failure when the processor throws', async () => {
        registerProcessor('boom', async () => {
            throw new Error('kaput');
        });

        const job = enqueueJob('boom', {});
        await job.promise;

        expect(job.status).toBe('failed');
        expect(job.error).toBe('kaput');
    });

    test('fails a job whose type has no registered processor', async () => {
        const job = enqueueJob('missing-type', {});
        await job.promise;

        expect(job.status).toBe('failed');
        expect(job.error).toMatch(/no processor/i);
    });

    test('getJobById returns a copy without the internal promise', async () => {
        registerProcessor('copy-demo', async () => 'fine');
        const job = enqueueJob('copy-demo', {});
        await job.promise;

        const fetched = getJobById(job.id);
        expect(fetched.status).toBe('done');
        expect(fetched.promise).toBeUndefined();
    });
});
