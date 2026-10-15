// contract tests for the query-parameter parsing of guard thresholds
// the matcher accepts user-supplied thresholds, so the validation rules
// (numeric, bounded, noOverlap >= similarity) are pinned here without a DB
const { parseThresholdQuery } = require('../src/utils/thresholds');

const DEFAULTS = { similarity: 0.55, noOverlap: 0.65, confidence: 0.70 };

describe('parseThresholdQuery', () => {
    test('returns defaults when no parameters are sent', () => {
        const result = parseThresholdQuery({}, DEFAULTS);
        expect(result.ok).toBe(true);
        expect(result.thresholds).toEqual(DEFAULTS);
    });

    test('accepts valid overrides and keeps untouched defaults', () => {
        const result = parseThresholdQuery({ similarity: '0.40', confidence: '0.5' }, DEFAULTS);
        expect(result.ok).toBe(true);
        expect(result.thresholds).toEqual({ similarity: 0.40, noOverlap: 0.65, confidence: 0.5 });
    });

    test('parses numeric strings from req.query', () => {
        const result = parseThresholdQuery({ similarity: '0.62', noOverlap: '0.71', confidence: '0.66' }, DEFAULTS);
        expect(result.ok).toBe(true);
        expect(result.thresholds).toEqual({ similarity: 0.62, noOverlap: 0.71, confidence: 0.66 });
    });

    test('rejects non-numeric values', () => {
        const result = parseThresholdQuery({ similarity: 'abc' }, DEFAULTS);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/must be a number/);
    });

    test('rejects values outside the 0.01 to 0.99 bounds', () => {
        expect(parseThresholdQuery({ similarity: '0' }, DEFAULTS).ok).toBe(false);
        expect(parseThresholdQuery({ confidence: '1.5' }, DEFAULTS).ok).toBe(false);
        expect(parseThresholdQuery({ noOverlap: '-0.2' }, DEFAULTS).ok).toBe(false);
    });

    test('rejects a noOverlap line below the similarity line', () => {
        const result = parseThresholdQuery({ noOverlap: '0.30' }, DEFAULTS);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/noOverlap/);
    });

    test('accepts equal similarity and noOverlap lines', () => {
        const result = parseThresholdQuery({ similarity: '0.6', noOverlap: '0.6' }, DEFAULTS);
        expect(result.ok).toBe(true);
        expect(result.thresholds.noOverlap).toBe(0.6);
    });

    test('does not mutate the defaults object', () => {
        parseThresholdQuery({ similarity: '0.2' }, DEFAULTS);
        expect(DEFAULTS.similarity).toBe(0.55);
    });
});
