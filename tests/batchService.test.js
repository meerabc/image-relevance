const { determineStatus } = require('../src/services/batchService');

describe('determineStatus', () => {
    test('flags a low confidence result instead of accepting it', () => {
        expect(determineStatus(0.5)).toBe('low_confidence');
    });

    test('flags a result right at the boundary as low confidence', () => {
        expect(determineStatus(0.69)).toBe('low_confidence');
    });

    test('accepts a result right at the threshold as processed', () => {
        expect(determineStatus(0.70)).toBe('processed');
    });

    test('accepts a high confidence result as processed', () => {
        expect(determineStatus(0.98)).toBe('processed');
    });
});