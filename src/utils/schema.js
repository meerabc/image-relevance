const { z } = require('zod');

const imageMetadataSchema = z.object({
  subject: z.string(),
  category: z.string(),
  attributes: z.array(z.string()),
  caption: z.string(),
  confidence: z.number().min(0).max(1)
});

module.exports = {
  imageMetadataSchema
};