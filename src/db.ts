import localforage from 'localforage';
import { z } from 'zod';

export const WordSchema = z.object({
  word: z.string(),
  partOfSpeech: z.string().optional(),
  inflection: z.string().optional(),
  definitions: z.array(z.string()).optional(),
  definitionsSl: z.array(z.string()).optional(),
  examples: z.array(z.string()).optional(),
  accent: z.string().optional(),
  ipa: z.string().optional(),
});

export const DictionarySchema = z.array(WordSchema);
export type WordEntry = z.infer<typeof WordSchema>;

export type FormsMap = Record<string, string>;

const DICT_KEY = 'slo_dict_data';
const EXTRA_LEMMAS_KEY = 'slo_extra_lemmas';
const CORE_FORMS_KEY = 'slo_forms_core';
const FULL_FORMS_KEY = 'slo_forms_full';
const FAVORITES_KEY = 'slo_favorites';
const HISTORY_KEY = 'slo_history';
const MAX_HISTORY = 30;

localforage.config({
  name: 'SlovenianDictionaryApp',
  storeName: 'dictionary'
});

export async function loadDictionary(): Promise<WordEntry[]> {
  const cached = await localforage.getItem<WordEntry[]>(DICT_KEY);
  if (cached) {
    console.log('Loaded dictionary from IndexedDB.');
    return cached;
  }

  console.log('Fetching dictionary JSON...');
  const response = await fetch('/slovenian_dictionary.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  const validData = DictionarySchema.parse(data);
  await localforage.setItem(DICT_KEY, validData);
  console.log(`Cached ${validData.length} dictionary entries.`);
  return validData;
}

export async function loadCoreForms(): Promise<FormsMap> {
  const cached = await localforage.getItem<FormsMap>(CORE_FORMS_KEY);
  if (cached) {
    console.log('Loaded core forms from IndexedDB.');
    return cached;
  }

  console.log('Fetching core forms...');
  const response = await fetch('/slovenian_forms_core.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: FormsMap = await response.json();

  await localforage.setItem(CORE_FORMS_KEY, data);
  console.log(`Cached ${Object.keys(data).length} core forms.`);
  return data;
}

export async function loadFullForms(): Promise<FormsMap> {
  const cached = await localforage.getItem<FormsMap>(FULL_FORMS_KEY);
  if (cached) {
    console.log('Loaded full forms from IndexedDB.');
    return cached;
  }

  console.log('Fetching full forms (gzipped)...');
  const response = await fetch('/slovenian_forms_full.json.gz');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // Browser auto-decompresses gzip if server sends correct Content-Encoding.
  // Vite dev server may not, so handle both cases.
  const contentType = response.headers.get('content-type') || '';
  let data: FormsMap;

  if (contentType.includes('json')) {
    data = await response.json();
  } else {
    const ds = new DecompressionStream('gzip');
    const decompressed = response.body!.pipeThrough(ds);
    data = await new Response(decompressed).json();
  }

  await localforage.setItem(FULL_FORMS_KEY, data);
  console.log(`Cached ${Object.keys(data).length} full forms.`);
  return data;
}

export function loadFullFormsWorker(): Promise<FormsMap> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./forms-worker.ts', import.meta.url),
      { type: 'module' }
    );
    const accumulated: FormsMap = {};
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'chunk') {
        Object.assign(accumulated, e.data.data);
      } else if (e.data.type === 'done') {
        worker.terminate();
        resolve(accumulated);
      } else if (e.data.type === 'error') {
        worker.terminate();
        reject(new Error(e.data.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Worker failed'));
    };
    worker.postMessage('load');
  });
}

export async function loadExtraLemmas(): Promise<WordEntry[]> {
  const cached = await localforage.getItem<WordEntry[]>(EXTRA_LEMMAS_KEY);
  if (cached) {
    console.log('Loaded extra lemmas from IndexedDB.');
    return cached;
  }

  console.log('Fetching extra lemmas (gzipped)...');
  const response = await fetch('/slovenian_lemmas_extra.json.gz');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  let data: WordEntry[];

  if (contentType.includes('json')) {
    data = await response.json();
  } else {
    const ds = new DecompressionStream('gzip');
    const decompressed = response.body!.pipeThrough(ds);
    data = await new Response(decompressed).json();
  }

  await localforage.setItem(EXTRA_LEMMAS_KEY, data);
  console.log(`Cached ${data.length} extra lemmas.`);
  return data;
}

// --- Favorites ---

export async function getFavorites(): Promise<Set<string>> {
  const data = await localforage.getItem<string[]>(FAVORITES_KEY);
  return new Set(data || []);
}

export async function toggleFavorite(word: string): Promise<Set<string>> {
  const favs = await getFavorites();
  if (favs.has(word)) {
    favs.delete(word);
  } else {
    favs.add(word);
  }
  await localforage.setItem(FAVORITES_KEY, [...favs]);
  return favs;
}

// --- History ---

export async function getHistory(): Promise<string[]> {
  return (await localforage.getItem<string[]>(HISTORY_KEY)) || [];
}

export async function addToHistory(word: string): Promise<string[]> {
  const history = await getHistory();
  const filtered = history.filter(w => w !== word);
  filtered.unshift(word);
  const trimmed = filtered.slice(0, MAX_HISTORY);
  await localforage.setItem(HISTORY_KEY, trimmed);
  return trimmed;
}
