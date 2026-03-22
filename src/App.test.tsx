import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { WordEntry } from './db';

const mockData: WordEntry[] = [
  { word: 'hiša', partOfSpeech: 'sam.', inflection: '-e', definitions: ['house'] },
  { word: 'miza', partOfSpeech: 'sam.', inflection: '-e', definitions: ['table'] },
  { word: 'knjiga', partOfSpeech: 'sam.', inflection: '-e', definitions: ['book'] },
  { word: 'voda', partOfSpeech: 'sam.', definitions: ['water'] },
  { word: 'govoriti', partOfSpeech: 'gl.', definitions: ['to speak', 'to talk'] },
];

const mockCoreForms: Record<string, string> = {
  'hišo': 'hiša',
  'hiši': 'hiša',
  'govoril': 'govoriti',
  'govorim': 'govoriti',
  'vode': 'voda',
};

vi.mock('./db', () => ({
  loadDictionary: vi.fn(() => Promise.resolve(mockData)),
  loadCoreForms: vi.fn(() => Promise.resolve(mockCoreForms)),
  loadFullForms: vi.fn(() => Promise.resolve(mockCoreForms)),
  loadFullFormsWorker: vi.fn(() => Promise.resolve(mockCoreForms)),
  getFavorites: vi.fn(() => Promise.resolve(new Set<string>())),
  toggleFavorite: vi.fn(() => Promise.resolve(new Set<string>())),
  getHistory: vi.fn(() => Promise.resolve([])),
  addToHistory: vi.fn((word: string) => Promise.resolve([word])),
}));

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows search input after loading', async () => {
    render(<App />);
    const input = await screen.findByPlaceholderText(
      'Search for a Slovenian word...'
    );
    expect(input).toBeInTheDocument();
  });

  it('shows results matching the query', async () => {
    render(<App />);
    const input = await screen.findByPlaceholderText(
      'Search for a Slovenian word...'
    );
    await userEvent.type(input, 'hiš');

    expect(screen.getByText('hiša')).toBeInTheDocument();
    expect(screen.queryByText('miza')).not.toBeInTheDocument();
  });

  it('resolves inflected form to lemma', async () => {
    render(<App />);
    const input = await screen.findByPlaceholderText(
      'Search for a Slovenian word...'
    );
    await userEvent.type(input, 'govoril');

    // Should show the lemma entry with the form->lemma indicator
    // "govoriti" appears in both the form badge and the card title
    expect(screen.getAllByText('govoriti').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('govoril')).toBeInTheDocument(); // the matched form
    expect(screen.getByText('to speak')).toBeInTheDocument();
  });

  it('shows no results message for unmatched query', async () => {
    render(<App />);
    const input = await screen.findByPlaceholderText(
      'Search for a Slovenian word...'
    );
    await userEvent.type(input, 'zzzzz');
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  it('displays definitions when present', async () => {
    render(<App />);
    const input = await screen.findByPlaceholderText(
      'Search for a Slovenian word...'
    );
    await userEvent.type(input, 'knjiga');
    expect(screen.getByText('book')).toBeInTheDocument();
  });
});
