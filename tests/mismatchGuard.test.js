const { evaluateMatch } = require('../src/services/mismatchGuard');

describe('evaluateMatch', () => {
    test('approves a high confidence, high similarity, matching subject', () => {
        const result = evaluateMatch(
            [1, 0],
            [1, 0],
            { subject: 'red fox', confidence: 0.9 },
            'red fox'
        );

        expect(result.isMatch).toBe(true);
        expect(result.reason).toMatch(/APPROVED/);
    });

    test('rejects when AI confidence is below threshold, regardless of similarity', () => {
        const result = evaluateMatch(
            [1, 0],
            [1, 0],
            { subject: 'red fox', confidence: 0.5 },
            'red fox'
        );

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/confidence/i);
    });

    test('rejects when similarity score is below threshold', () => {
        const result = evaluateMatch(
            [1, 0],
            [0, 1],
            { subject: 'red fox', confidence: 0.9 },
            'red fox'
        );

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/below threshold/);
    });

    test('rejects a subject mismatch even at a moderately high similarity score, the fox versus wolf case', () => {
        const result = evaluateMatch(
            [1, 0],
            [0.6, 0.8],
            { subject: 'gray wolf', confidence: 0.9 },
            'red fox'
        );

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/Subject mismatch/);
    });

    test('approves a moderate similarity score when subject and topic actually match', () => {
        const result = evaluateMatch(
            [1, 0],
            [0.6, 0.8],
            { subject: 'red fox', confidence: 0.9 },
            'red fox'
        );

        expect(result.isMatch).toBe(true);
    });
});