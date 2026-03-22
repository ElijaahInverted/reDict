/**
 * Web Worker that handles fetching, decompressing, parsing, and caching
 * the full forms index (~2.7M entries) off the main thread.
 * Sends results back in chunks to avoid freezing the main thread
 * during structured clone deserialization.
 */
import localforage from 'localforage';
import type { FormsMap } from './db';

const FULL_FORMS_KEY = 'slo_forms_full';
const CHUNK_SIZE = 50_000;

localforage.config({
  name: 'SlovenianDictionaryApp',
  storeName: 'dictionary',
});

async function load(): Promise<FormsMap> {
  const cached = await localforage.getItem<FormsMap>(FULL_FORMS_KEY);
  if (cached) {
    return cached;
  }

  const response = await fetch('/slovenian_forms_full.json.gz');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
  return data;
}

function sendInChunks(data: FormsMap) {
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk: FormsMap = {};
    const end = Math.min(i + CHUNK_SIZE, keys.length);
    for (let j = i; j < end; j++) {
      chunk[keys[j]] = data[keys[j]];
    }
    self.postMessage({ type: 'chunk', data: chunk });
  }
  self.postMessage({ type: 'done' });
}

self.onmessage = async () => {
  try {
    const data = await load();
    sendInChunks(data);
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to load full forms',
    });
  }
};
