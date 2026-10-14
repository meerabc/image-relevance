const { evaluateMatch } = require('../src/services/mismatchGuard');

describe('evaluateMatch', () => {
    test('approves a high confidence, high similarity, matching subject', () => {
        const result = evaluateMatch(0.9, { subject: 'red fox', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(true);
        expect(result.reason).toMatch(/APPROVED/);
    });

    test('rejects when AI confidence is below threshold, regardless of similarity', () => {
        const result = evaluateMatch(0.99, { subject: 'red fox', confidence: 0.5 }, 'red fox');

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/confidence/i);
    });

    test('rejects when similarity score is below threshold', () => {
        const result = evaluateMatch(0.2, { subject: 'red fox', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/below threshold/);
    });

    test('rejects a subject mismatch at a moderate similarity score, the fox versus wolf case', () => {
        const result = evaluateMatch(0.6, { subject: 'gray wolf', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/Subject mismatch/);
    });

    test('approves a moderate similarity score when subject and topic actually match', () => {
        const result = evaluateMatch(0.6, { subject: 'red fox', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(true);
    });
});