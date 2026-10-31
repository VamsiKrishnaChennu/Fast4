import mongoose from 'mongoose';
import { CATEGORIES } from '@fastfour/shared';

const dictionaryEntrySchema = new mongoose.Schema(
  {
    category: { type: String, enum: CATEGORIES, required: true },
    word: { type: String, required: true },
    displayWord: { type: String },
    source: { type: String, enum: ['seed', 'external'], default: 'seed' },
    overturnedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

dictionaryEntrySchema.index({ category: 1, word: 1 }, { unique: true });

export const DictionaryEntry =
  mongoose.models.DictionaryEntry ?? mongoose.model('DictionaryEntry', dictionaryEntrySchema);
