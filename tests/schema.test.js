const { imageMetadataSchema } = require('../src/utils/schema');

describe('imageMetadataSchema', () => {
    test('accepts a valid image metadata object', () => {
        const validData = {
            subject: 'red fox',
            category: 'wildlife',
            attributes: ['orange fur', 'forest'],
            caption: 'A red fox in a forest',
            confidence: 0.95
        };

        const result = imageMetadataSchema.safeParse(validData);
        expect(result.success).toBe(true);
    });

    test('rejects an object missing required fields', () => {
        const invalidData = {
            subject: 'red fox',
            category: 'wildlife'
            // missing attributes, caption, confidence
        };

        const result = imageMetadataSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });

    test('rejects confidence values above 1', () => {
        const invalidData = {
            subject: 'red fox',
            category: 'wildlife',
            attributes: ['orange fur'],
            caption: 'A red fox',
            confidence: 1.5
        };

        const result = imageMetadataSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });

    test('rejects confidence values below 0', () => {
        const invalidData = {
            subject: 'red fox',
            category: 'wildlife',
            attributes: ['orange fur'],
            caption: 'A red fox',
            confidence: -0.1
        };

        const result = imageMetadataSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });

    test('rejects wrong types, like attributes as a string instead of an array', () => {
        const invalidData = {
            subject: 'red fox',
            category: 'wildlife',
            attributes: 'orange fur',
            caption: 'A red fox',
            confidence: 0.9
        };

        const result = imageMetadataSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });
});