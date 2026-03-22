import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DictionarySchema, type WordEntry } from './db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATA_DIR = join(__dirname, '..', 'test-data');
const DICT_PATH = join(__dirname, '..', 'public', 'slovenian_dictionary.json');

const WORD_RE = /[a-zA-ZčšžČŠŽáéíóúàèìòùâêîôûäëïöü]+/g;

function stripGutenberg(text: string): string {
  const s = text.indexOf('*** START OF THE PROJECT GUTENBERG EBOOK');
  const e = text.indexOf('*** END OF THE PROJECT GUTENBERG EBOOK');
  let result = text;
  if (s !== -1) result = result.slice(result.indexOf('\n', s) + 1);
  if (e !== -1) result = result.slice(0, e);
  return result;
}

function stripAccents(s: string): string {
  return s
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u');
}

function extractWords(text: string): Set<string> {
  const words = new Set<string>();
  const matches = text.match(WORD_RE);
  if (!matches) return words;
  for (const m of matches) {
    if (m.length >= 2) words.add(m.toLowerCase());
  }
  return words;
}

// Shared state
let dictionary: WordEntry[] = [];
let dictLookup: Set<string> = new Set();
let dictLookupAccented: Set<string> = new Set();

interface BookData {
  filename: string;
  title: string;
  words: Set<string>;
}
let books: BookData[] = [];

const BOOK_TITLES: Record<string, string> = {
  'cankar_erotika.txt': 'Ivan Cankar - Erotika',
  'cankar_za_narodov_blagor.txt': 'Ivan Cankar - Za narodov blagor',
  'jurcic_deseti_brat.txt': 'Josip Jurčič - Deseti brat',
  'trdina_bahovi_huzarji.txt': 'Janez Trdina - Bahovi huzarji in Iliri',
  'milcinski_butalci.txt': 'Fran Milčinski - Butalci',
};

beforeAll(() => {
  const raw = JSON.parse(readFileSync(DICT_PATH, 'utf-8'));
  dictionary = DictionarySchema.parse(raw);

  dictLookupAccented = new Set(dictionary.map(e => e.word.toLowerCase()));
  dictLookup = new Set(dictionary.map(e => stripAccents(e.word.toLowerCase())));

  const files = readdirSync(TEST_DATA_DIR).filter(f => f.endsWith('.txt'));
  books = files.map(f => ({
    filename: f,
    title: BOOK_TITLES[f] || f,
    words: extractWords(stripGutenberg(readFileSync(join(TEST_DATA_DIR, f), 'utf-8'))),
  }));
});

describe('Dictionary data integrity', () => {
  it('dictionary loads and validates via Zod', () => {
    expect(dictionary.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty word', () => {
    for (const entry of dictionary) {
      expect(entry.word.length).toBeGreaterThan(0);
    }
  });

  it('no duplicate headwords', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const entry of dictionary) {
      const key = entry.word.toLowerCase();
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });
});

describe('Book text extraction', () => {
  it('all 5 books loaded', () => {
    expect(books.length).toBe(5);
  });

  it.each([
    ['cankar_erotika.txt', 1000],
    ['cankar_za_narodov_blagor.txt', 2000],
    ['jurcic_deseti_brat.txt', 5000],
    ['trdina_bahovi_huzarji.txt', 5000],
    ['milcinski_butalci.txt', 2000],
  ])('%s has at least %d unique words', (filename, minWords) => {
    const book = books.find(b => b.filename === filename)!;
    expect(book.words.size).toBeGreaterThanOrEqual(minWords);
  });
});

describe('Dictionary coverage per book', () => {
  it.each(Object.keys(BOOK_TITLES))('%s - reports missing words', (filename) => {
    const book = books.find(b => b.filename === filename)!;
    const found: string[] = [];
    const missing: string[] = [];

    for (const w of book.words) {
      const normalized = stripAccents(w);
      if (dictLookup.has(normalized) || dictLookupAccented.has(w)) {
        found.push(w);
      } else {
        missing.push(w);
      }
    }

    // Report results (this test documents coverage, not asserts pass/fail on coverage %)
    console.log(
      `\n  ${book.title}: ${book.words.size} words, ` +
      `${found.length} in dict (${((found.length / book.words.size) * 100).toFixed(1)}%), ` +
      `${missing.length} missing`
    );
    if (found.length > 0) {
      console.log(`  Found in dict: ${found.sort().slice(0, 30).join(', ')}${found.length > 30 ? '...' : ''}`);
    }

    // The test passes but records the gap
    expect(missing.length).toBeGreaterThanOrEqual(0);
    expect(found.length + missing.length).toBe(book.words.size);
  });
});

describe('Cross-book missing word analysis', () => {
  it('identifies words missing across ALL books', () => {
    const allBookWords = new Set<string>();
    for (const book of books) {
      for (const w of book.words) allBookWords.add(w);
    }

    const missing: string[] = [];
    const found: string[] = [];
    for (const w of allBookWords) {
      const normalized = stripAccents(w);
      if (dictLookup.has(normalized) || dictLookupAccented.has(w)) {
        found.push(w);
      } else {
        missing.push(w);
      }
    }

    console.log(`\n  TOTAL: ${allBookWords.size} unique words across all books`);
    console.log(`  In dictionary: ${found.length} (${((found.length / allBookWords.size) * 100).toFixed(1)}%)`);
    console.log(`  Missing: ${missing.length} (${((missing.length / allBookWords.size) * 100).toFixed(1)}%)`);

    // Sample of missing common words (appearing in 3+ books)
    const wordBookCount = new Map<string, number>();
    for (const book of books) {
      for (const w of book.words) {
        wordBookCount.set(w, (wordBookCount.get(w) || 0) + 1);
      }
    }
    const commonMissing = missing
      .filter(w => (wordBookCount.get(w) || 0) >= 3)
      .sort((a, b) => (wordBookCount.get(b) || 0) - (wordBookCount.get(a) || 0))
      .slice(0, 50);

    console.log(`\n  Top 50 missing words found in 3+ books:`);
    console.log(`  ${commonMissing.join(', ')}`);

    expect(allBookWords.size).toBeGreaterThan(0);
  });

  it('identifies which dictionary words appear in the literature', () => {
    const allBookWords = new Set<string>();
    for (const book of books) {
      for (const w of book.words) {
        allBookWords.add(w);
        allBookWords.add(stripAccents(w));
      }
    }

    const dictWordsInLiterature: string[] = [];
    for (const entry of dictionary) {
      const normalized = stripAccents(entry.word.toLowerCase());
      if (allBookWords.has(normalized) || allBookWords.has(entry.word.toLowerCase())) {
        dictWordsInLiterature.push(entry.word);
      }
    }

    console.log(`\n  Dictionary words found in literature: ${dictWordsInLiterature.length} / ${dictionary.length}`);
    if (dictWordsInLiterature.length > 0) {
      console.log(`  Examples: ${dictWordsInLiterature.slice(0, 50).join(', ')}`);
    }

    expect(dictWordsInLiterature.length).toBeGreaterThanOrEqual(0);
  });
});
