import { describe, it, expect } from 'vitest';
import { WordSchema, DictionarySchema } from './db';

describe('WordSchema', () => {
  it('accepts a minimal entry with just a word', () => {
    const result = WordSchema.parse({ word: 'hiša' });
    expect(result).toEqual({ word: 'hiša' });
  });

  it('accepts a full entry with all fields', () => {
    const entry = {
      word: 'hiša',
      partOfSpeech: 'ž',
      inflection: '-e',
      definitions: ['house'],
      examples: ['Velika hiša.'],
    };
    const result = WordSchema.parse(entry);
    expect(result).toEqual(entry);
  });

  it('rejects an entry missing the word field', () => {
    expect(() => WordSchema.parse({ partOfSpeech: 'ž' })).toThrow();
  });

  it('rejects an entry where word is not a string', () => {
    expect(() => WordSchema.parse({ word: 123 })).toThrow();
  });

  it('rejects definitions that are not an array of strings', () => {
    expect(() =>
      WordSchema.parse({ word: 'hiša', definitions: [1, 2] })
    ).toThrow();
  });
});

describe('DictionarySchema', () => {
  it('accepts a valid array of entries', () => {
    const data = [
      { word: 'hiša', partOfSpeech: 'ž' },
      { word: 'miza' },
    ];
    const result = DictionarySchema.parse(data);
    expect(result).toHaveLength(2);
  });

  it('accepts an empty array', () => {
    expect(DictionarySchema.parse([])).toEqual([]);
  });

  it('rejects if any entry is invalid', () => {
    const data = [{ word: 'hiša' }, { notAWord: true }];
    expect(() => DictionarySchema.parse(data)).toThrow();
  });

  it('rejects a non-array', () => {
    expect(() => DictionarySchema.parse('not an array')).toThrow();
  });
});
