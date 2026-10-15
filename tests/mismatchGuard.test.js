const { evaluateMatch, DEFAULT_THRESHOLDS } = require('../src/services/mismatchGuard');

describe('evaluateMatch', () => {
    test('approves a high confidence, high similarity, matching subject', () => {
        const result = evaluateMatch(0.9, { subject: 'red fox', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(true);
        expect(result.reason).toMatch(/APPROVED/);
        expect(result.checks.every((check) => check.passed)).toBe(true);
    });

    test('rejects when AI confidence is below threshold, regardless of similarity', () => {
        const result = evaluateMatch(0.99, { subject: 'red fox', confidence: 0.5 }, 'red fox');

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/confidence/i);
        expect(result.checks[0].passed).toBe(false);
    });

    test('rejects when similarity score is below threshold', () => {
        const result = evaluateMatch(0.2, { subject: 'red fox', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/semantic similarity/);
    });

    test('rejects a fox-post candidate at moderate similarity when nothing in the tags mentions the topic', () => {
        const result = evaluateMatch(0.6, { subject: 'gray wolf', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(false);
        expect(result.reason).toMatch(/0\.65/);
    });

    test('approves a moderate similarity score when subject and topic actually match', () => {
        const result = evaluateMatch(0.6, { subject: 'red fox', confidence: 0.9 }, 'red fox');

        expect(result.isMatch).toBe(true);
    });

    test('a themed attribute rescues a candidate whose subject never mentions the topic, the raised-fist case', () => {
        const result = evaluateMatch(
            0.57,
            {
                subject: 'silhouette of a person with a raised fist',
                category: 'photography',
                attributes: ['sunset', 'protest', 'empowerment'],
                caption: 'A person raises a fist against an orange sky.',
                confidence: 0.9
            },
            'women empowerment'
        );

        expect(result.isMatch).toBe(true);
        expect(result.checks.find((c) => c.name === 'topic').passed).toBe(true);
    });

    test('accepts a custom threshold operating point, used by the sweep script', () => {
        const thresholds = { ...DEFAULT_THRESHOLDS, similarity: 0.40 };
        const result = evaluateMatch(0.45, { subject: 'red fox', confidence: 0.9 }, 'red fox', thresholds);

        expect(result.isMatch).toBe(true);
    });
});
