/**
 * Extracts unique Slovenian words from Gutenberg text files,
 * strips headers/footers and non-alphabetic content,
 * then checks each word against the dictionary.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATA_DIR = join(__dirname, '..', 'test-data');
const DICT_PATH = join(__dirname, '..', 'public', 'slovenian_dictionary.json');
const OUTPUT_PATH = join(__dirname, '..', 'test-data', 'analysis.json');

// Slovenian alphabet includes č, š, ž and accented vowels
const WORD_RE = /[a-zA-ZčšžČŠŽáéíóúàèìòùâêîôûäëïöüÁÉÍÓÚ]+/g;

function stripGutenbergBoilerplate(text: string): string {
  const startMarker = '*** START OF THE PROJECT GUTENBERG EBOOK';
  const endMarker = '*** END OF THE PROJECT GUTENBERG EBOOK';
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx !== -1) {
    const afterStart = text.indexOf('\n', startIdx);
    text = text.slice(afterStart + 1);
  }
  if (endIdx !== -1) {
    text = text.slice(0, endIdx);
  }
  return text;
}

function extractWords(text: string): Set<string> {
  const words = new Set<string>();
  const matches = text.match(WORD_RE);
  if (!matches) return words;
  for (const m of matches) {
    const lower = m.toLowerCase();
    // Skip very short words and common non-Slovenian artifacts
    if (lower.length >= 2) {
      words.add(lower);
    }
  }
  return words;
}

interface DictEntry {
  word: string;
  partOfSpeech?: string;
  inflection?: string;
}

function main() {
  // Load dictionary
  const dictRaw: DictEntry[] = JSON.parse(readFileSync(DICT_PATH, 'utf-8'));
  const dictWords = new Set(dictRaw.map(e => e.word.toLowerCase().replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o').replace(/[úùûü]/g, 'u')));
  // Also keep original accented forms
  const dictWordsAccented = new Set(dictRaw.map(e => e.word.toLowerCase()));

  console.log(`Dictionary: ${dictRaw.length} entries`);

  // Process each text file
  const files = readdirSync(TEST_DATA_DIR).filter(f => f.endsWith('.txt'));
  const results: Record<string, { total: number; found: number; missing: string[] }> = {};
  const allMissing = new Set<string>();
  const allFound = new Set<string>();

  for (const file of files) {
    const raw = readFileSync(join(TEST_DATA_DIR, file), 'utf-8');
    const text = stripGutenbergBoilerplate(raw);
    const words = extractWords(text);

    const missing: string[] = [];
    let found = 0;

    for (const w of words) {
      // Normalize: strip accents for matching
      const normalized = w
        .replace(/[áàâä]/g, 'a')
        .replace(/[éèêë]/g, 'e')
        .replace(/[íìîï]/g, 'i')
        .replace(/[óòôö]/g, 'o')
        .replace(/[úùûü]/g, 'u');

      if (dictWords.has(normalized) || dictWordsAccented.has(w) || dictWords.has(w)) {
        found++;
        allFound.add(w);
      } else {
        missing.push(w);
        allMissing.add(w);
      }
    }

    results[file] = {
      total: words.size,
      found,
      missing: missing.sort(),
    };

    const pct = ((found / words.size) * 100).toFixed(1);
    console.log(`${file}: ${words.size} unique words, ${found} found (${pct}%), ${missing.length} missing`);
  }

  // Summary
  const totalUnique = new Set([...allFound, ...allMissing]);
  console.log(`\n--- SUMMARY ---`);
  console.log(`Total unique words across all texts: ${totalUnique.size}`);
  console.log(`Found in dictionary: ${allFound.size}`);
  console.log(`Missing from dictionary: ${allMissing.size}`);
  console.log(`Coverage: ${((allFound.size / totalUnique.size) * 100).toFixed(1)}%`);

  // Save results
  writeFileSync(OUTPUT_PATH, JSON.stringify({
    summary: {
      totalUnique: totalUnique.size,
      found: allFound.size,
      missing: allMissing.size,
      coveragePct: ((allFound.size / totalUnique.size) * 100).toFixed(1),
    },
    perBook: results,
    allMissingWords: [...allMissing].sort(),
  }, null, 2));
  console.log(`\nFull results saved to ${OUTPUT_PATH}`);
}

main();
