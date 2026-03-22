import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  loadDictionary, loadCoreForms, loadFullFormsWorker,
  getFavorites, toggleFavorite, getHistory, addToHistory,
  type WordEntry, type FormsMap
} from './db';
import {
  Search, AlertCircle, Loader2, ArrowRight,
  Heart, Clock, Volume2
} from 'lucide-react';

interface SearchResult {
  entry: WordEntry;
  matchedForm?: string;
}

function App() {
  const [dictionary, setDictionary] = useState<WordEntry[]>([]);
  const [dictIndex, setDictIndex] = useState<Map<string, WordEntry>>(new Map());
  const [forms, setForms] = useState<FormsMap>({});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [formsLevel, setFormsLevel] = useState<'none' | 'core' | 'full'>('none');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const [data, coreForms, favs, hist] = await Promise.all([
          loadDictionary(),
          loadCoreForms(),
          getFavorites(),
          getHistory(),
        ]);
        setDictionary(data);
        setFavorites(favs);
        setHistory(hist);

        const idx = new Map<string, WordEntry>();
        for (const entry of data) {
          idx.set(entry.word.toLowerCase(), entry);
        }
        setDictIndex(idx);

        setForms(coreForms);
        setFormsLevel('core');
        setStatus('ready');

        loadFullFormsWorker().then(fullForms => {
          setForms(fullForms);
          setFormsLevel('full');
        }).catch(err => {
          console.warn('Full forms load failed (core still active):', err);
        });
      } catch (err: unknown) {
        console.error(err);
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load dictionary data.');
      }
    }
    init();
  }, []);

  const handleToggleFavorite = useCallback(async (word: string) => {
    const updated = await toggleFavorite(word);
    setFavorites(new Set(updated));
  }, []);

  const handleWordClick = useCallback(async (word: string) => {
    setQuery(word);
    setShowFavorites(false);
    setShowHistory(false);
    const updated = await addToHistory(word);
    setHistory(updated);
  }, []);

  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'sl-SI';
      utterance.rate = 0.85;
      speechSynthesis.speak(utterance);
    }
  }, []);

  const searchResults = useMemo((): SearchResult[] => {
    if (!query) return [];
    const q = query.toLowerCase().trim();
    if (q.length < 1) return [];

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // 1. Exact lemma match
    const exact = dictIndex.get(q);
    if (exact) {
      seen.add(q);
      results.push({ entry: exact });
    }

    // 2. Form→lemma lookup
    if (!seen.has(q)) {
      const lemma = forms[q];
      if (lemma) {
        const entry = dictIndex.get(lemma);
        if (entry && !seen.has(lemma)) {
          seen.add(lemma);
          results.unshift({ entry, matchedForm: q });
        }
      }
    }

    // 3. Prefix match
    for (const entry of dictionary) {
      if (results.length >= 50) break;
      const w = entry.word.toLowerCase();
      if (!seen.has(w) && w.startsWith(q)) {
        seen.add(w);
        results.push({ entry });
      }
    }

    // 4. Substring match
    if (results.length < 50 && q.length >= 2) {
      for (const entry of dictionary) {
        if (results.length >= 50) break;
        const w = entry.word.toLowerCase();
        if (!seen.has(w) && w.includes(q)) {
          seen.add(w);
          results.push({ entry });
        }
      }
    }

    return results;
  }, [query, dictionary, dictIndex, forms]);

  // Track history when results change
  useEffect(() => {
    if (searchResults.length > 0 && query.length >= 2) {
      const topWord = searchResults[0].entry.word;
      addToHistory(topWord).then(setHistory);
    }
  }, [searchResults, query]);

  const favoriteEntries = useMemo(() => {
    return dictionary.filter(e => favorites.has(e.word));
  }, [dictionary, favorites]);

  const historyEntries = useMemo(() => {
    const entries: WordEntry[] = [];
    for (const w of history) {
      const entry = dictIndex.get(w.toLowerCase());
      if (entry) entries.push(entry);
    }
    return entries;
  }, [history, dictIndex]);

  return (
    <div className="min-h-screen p-2 sm:p-4 md:p-8 flex justify-center">
      <div className="w-full max-w-2xl flex flex-col gap-3 sm:gap-5">

        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl overflow-hidden shrink-0">
              <svg viewBox="0 0 128 128" className="w-full h-full">
                <rect width="128" height="128" rx="24" fill="#111827" />
                <g transform="translate(7,0)">
                  <path d="M38 88V86h4V42h-4V40h24c12 0 20 8 20 18s-7 17-17 18l18 12H69L55 76H54v10h4v2H38zM54 66h10c6 0 10-4 10-10s-4-8-10-8H54v18z" fill="#ffffff" fillRule="evenodd"/>
                  <circle cx="32" cy="96" r="16" fill="#79be15" stroke="#111827" strokeWidth="4" />
                </g>
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-base-content truncate">Slovenian Dictionary</h1>
              <p className="text-[10px] sm:text-xs text-base-content/50 font-medium">
                {formsLevel === 'full' ? '2.9M forms indexed' : formsLevel === 'core' ? 'Loading full index...' : 'Offline-first'}
              </p>
            </div>
          </div>
          <div className="flex gap-0.5 sm:gap-1 shrink-0">
            <button
              onClick={() => { setShowFavorites(!showFavorites); setShowHistory(false); }}
              className={`btn btn-xs sm:btn-sm btn-ghost ${showFavorites ? 'text-red-500' : 'text-base-content/40'}`}
              title="Favorites"
            >
              <Heart size={16} fill={showFavorites ? 'currentColor' : 'none'} />
              {favorites.size > 0 && <span className="text-xs">{favorites.size}</span>}
            </button>
            <button
              onClick={() => { setShowHistory(!showHistory); setShowFavorites(false); }}
              className={`btn btn-xs sm:btn-sm btn-ghost ${showHistory ? 'text-primary' : 'text-base-content/40'}`}
              title="History"
            >
              <Clock size={16} />
            </button>
          </div>
        </header>

        {/* Loading / Error */}
        {status === 'loading' && (
          <div className="alert alert-info shadow-xl rounded-2xl border-none">
            <Loader2 className="animate-spin" size={20} />
            <span>Loading offline database...</span>
          </div>
        )}
        {status === 'error' && (
          <div className="alert alert-error shadow-xl rounded-2xl border-none">
            <AlertCircle size={20} />
            <span>{errorMsg}</span>
          </div>
        )}

        {status === 'ready' && (
          <>
            {/* Search */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-4 pointer-events-none text-base-content/40 group-focus-within:text-primary transition-colors">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="Search Slovenian..."
                value={query}
                onChange={e => { setQuery(e.target.value); setShowFavorites(false); setShowHistory(false); }}
                className="input w-full pl-10 sm:pl-12 h-11 sm:h-14 text-base sm:text-lg bg-base-100 border-transparent focus:border-primary focus:outline-none placeholder:text-base-content/30 rounded-xl sm:rounded-2xl transition-all font-medium"
                autoFocus
                spellCheck={false}
              />
            </div>

            {/* Favorites Panel */}
            {showFavorites && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-base-content/50 uppercase tracking-widest">
                  Saved Words ({favoriteEntries.length})
                </h3>
                {favoriteEntries.length === 0 && (
                  <p className="text-base-content/40 text-sm py-4 text-center">No saved words yet. Tap the heart icon on any word.</p>
                )}
                {favoriteEntries.map(entry => (
                  <button
                    key={entry.word}
                    onClick={() => handleWordClick(entry.word)}
                    className="flex items-center gap-3 p-3 bg-base-100 rounded-xl shadow-sm hover:shadow-md transition-shadow text-left"
                  >
                    <span className="font-semibold text-base-content">{entry.word}</span>
                    {entry.partOfSpeech && <span className="text-xs text-base-content/40">{entry.partOfSpeech}</span>}
                    {entry.definitions && <span className="text-sm text-base-content/60 truncate flex-1">{entry.definitions[0]}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* History Panel */}
            {showHistory && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-base-content/50 uppercase tracking-widest">
                  Recent ({historyEntries.length})
                </h3>
                {historyEntries.length === 0 && (
                  <p className="text-base-content/40 text-sm py-4 text-center">No search history yet.</p>
                )}
                {historyEntries.map(entry => (
                  <button
                    key={entry.word}
                    onClick={() => handleWordClick(entry.word)}
                    className="flex items-center gap-3 p-3 bg-base-100 rounded-xl shadow-sm hover:shadow-md transition-shadow text-left"
                  >
                    <Clock size={14} className="text-base-content/30 shrink-0" />
                    <span className="font-semibold text-base-content">{entry.word}</span>
                    {entry.definitions && <span className="text-sm text-base-content/60 truncate flex-1">{entry.definitions[0]}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Results */}
            {!showFavorites && !showHistory && (
              <div className="flex flex-col gap-4">
                {query && searchResults.length === 0 && (
                  <div className="text-center py-12 text-base-content/40">
                    <p className="text-lg">No results found for &ldquo;{query}&rdquo;.</p>
                  </div>
                )}

                {searchResults.map(({ entry: result, matchedForm }, idx) => (
                  <WordCard
                    key={`${result.word}-${idx}`}
                    result={result}
                    matchedForm={matchedForm}
                    isFavorite={favorites.has(result.word)}
                    onToggleFavorite={handleToggleFavorite}
                    onSpeak={speak}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WordCard({
  result,
  matchedForm,
  isFavorite,
  onToggleFavorite,
  onSpeak,
}: {
  result: WordEntry;
  matchedForm?: string;
  isFavorite: boolean;
  onToggleFavorite: (word: string) => void;
  onSpeak: (text: string) => void;
}) {
  return (
    <div className="card bg-base-100 overflow-hidden border border-base-200 hover:border-primary/30 transition-colors">
      <div className="card-body p-3 sm:p-5">

        {/* Form → Lemma indicator */}
        {matchedForm && (
          <div className="flex items-center gap-1.5 mb-1 text-xs sm:text-sm text-base-content/50">
            <span className="font-medium italic">{matchedForm}</span>
            <ArrowRight size={12} />
            <span className="font-semibold text-primary">{result.word}</span>
          </div>
        )}

        {/* Header: Word + Actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-base-content break-all">{result.word}</h2>
            {result.accent && result.accent !== result.word && (
              <span className="text-base sm:text-lg text-primary/70 font-medium">{result.accent}</span>
            )}
            {result.partOfSpeech && (
              <span className="badge badge-primary badge-outline font-semibold tracking-wide uppercase text-[10px] px-2 py-0.5">
                {result.partOfSpeech}
              </span>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onSpeak(result.word)}
              className="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-primary"
              title="Pronounce"
            >
              <Volume2 size={16} />
            </button>
            <button
              onClick={() => onToggleFavorite(result.word)}
              className={`btn btn-ghost btn-xs btn-circle ${isFavorite ? 'text-red-500' : 'text-base-content/40 hover:text-red-400'}`}
              title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
            >
              <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* IPA */}
        {result.ipa && (
          <p className="text-sm text-base-content/40 font-mono mt-0.5">/{result.ipa}/</p>
        )}

        {/* Inflection */}
        {result.inflection && (
          <p className="text-sm text-base-content/50 italic">{result.inflection}</p>
        )}

        {/* Definitions */}
        {result.definitions && result.definitions.length > 0 && (
          <>
            <div className="divider my-1 opacity-20"></div>
            <div className="flex flex-col gap-1.5">
              {result.definitions.map((def, i) => (
                <div key={i} className="flex gap-2.5 text-base-content/80">
                  <span className="text-primary font-bold text-sm mt-0.5">{i + 1}.</span>
                  <p className="text-[15px] leading-relaxed">{def}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Examples */}
        {result.examples && result.examples.length > 0 && (
          <div className="mt-3 p-3 bg-base-200/50 rounded-xl">
            <ul className="space-y-1 text-sm text-base-content/60 italic">
              {result.examples.map((ex, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-base-content/30">&bull;</span>
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
