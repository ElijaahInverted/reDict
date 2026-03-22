"""
Builds the final dictionary data for the PWA by combining:
1. Kaikki.org Slovene Wiktionary (definitions + examples)
2. Sloleks 3.1 form->lemma mappings (inflection recognition)

Output (all in public/):
- slovenian_dictionary.json:    Lemma entries with definitions (~0.7 MB)
- slovenian_forms_core.json:    Forms pointing to defined lemmas (~0.9 MB, loads first)
- slovenian_forms_full.json.gz: ALL 2.7M forms (~7.4 MB, loaded in background)
"""
import json
import gzip
import os
from collections import defaultdict

KAIKKI_INPUT = 'test-data/kaikki-slovene.jsonl'
SLOLEKS_INPUT = 'test-data/sloleks-form-to-lemma.json'
SLOLEKS_PRONUN = 'test-data/sloleks-pronunciation.json'
DICT_OUTPUT = 'public/slovenian_dictionary.json'
CORE_FORMS_OUTPUT = 'public/slovenian_forms_core.json'
FULL_FORMS_OUTPUT = 'public/slovenian_forms_full.json.gz'

POS_MAP = {
    'noun': 'sam.', 'verb': 'gl.', 'adj': 'prid.', 'adv': 'prisl.',
    'pron': 'zaim.', 'prep': 'predl.', 'conj': 'vez.', 'intj': 'medm.',
    'num': 'štev.', 'particle': 'člen.', 'det': 'dol.', 'character': 'znak',
    'symbol': 'simb.', 'phrase': 'fraza', 'prefix': 'predp.', 'suffix': 'prip.',
    'name': 'ime', 'proverb': 'pregovor',
}

def build_kaikki_dict():
    entries_map = defaultdict(lambda: {
        'word': '', 'partOfSpeech': [], 'definitions': [], 'examples': [],
    })
    with open(KAIKKI_INPUT, 'r', encoding='utf-8') as f:
        for line in f:
            entry = json.loads(line)
            word = entry.get('word', '').strip()
            if not word or '/' in word or len(word) > 50:
                continue
            pos = entry.get('pos', '')
            key = word.lower()
            rec = entries_map[key]
            rec['word'] = word
            mapped_pos = POS_MAP.get(pos, pos)
            if mapped_pos and mapped_pos not in rec['partOfSpeech']:
                rec['partOfSpeech'].append(mapped_pos)
            for sense in entry.get('senses', []):
                for g in sense.get('glosses', []):
                    if g and g not in rec['definitions']:
                        rec['definitions'].append(g)
                for ex in sense.get('examples', []):
                    text = ex.get('text', '')
                    if text and text not in rec['examples']:
                        rec['examples'].append(text)

    dictionary = []
    for rec in entries_map.values():
        entry = {'word': rec['word']}
        if rec['partOfSpeech']:
            entry['partOfSpeech'] = ', '.join(rec['partOfSpeech'])
        if rec['definitions']:
            entry['definitions'] = rec['definitions']
        if rec['examples']:
            entry['examples'] = rec['examples'][:3]
        dictionary.append(entry)

    dictionary.sort(key=lambda e: e['word'].lower())
    return dictionary


def main():
    print('1. Building dictionary from Kaikki.org...')
    dictionary = build_kaikki_dict()
    defined_lemmas = {e['word'].lower() for e in dictionary}

    print('2. Loading Sloleks data...')
    with open(SLOLEKS_INPUT, 'r', encoding='utf-8') as f:
        all_forms = json.load(f)
    with open(SLOLEKS_PRONUN, 'r', encoding='utf-8') as f:
        pronunciation = json.load(f)

    # Enrich dictionary entries with pronunciation from Sloleks
    pron_count = 0
    for entry in dictionary:
        key = entry['word'].lower()
        pron = pronunciation.get(key)
        if pron:
            if 'a' in pron:
                entry['accent'] = pron['a']
            if 'i' in pron:
                entry['ipa'] = pron['i']
            pron_count += 1

    # Remove identity mappings (form == lemma)
    all_forms = {k: v for k, v in all_forms.items() if k != v}

    # Split into core (defined) and full
    core_forms = {k: v for k, v in all_forms.items() if v in defined_lemmas}

    print('3. Writing output files...')

    # Dictionary
    with open(DICT_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(dictionary, f, ensure_ascii=False, separators=(',', ':'))

    # Core forms (small, loads immediately)
    with open(CORE_FORMS_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(core_forms, f, ensure_ascii=False, separators=(',', ':'))

    # Full forms (gzipped, background load)
    with gzip.open(FULL_FORMS_OUTPUT, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(all_forms, f, ensure_ascii=False, separators=(',', ':'))

    # Report
    dict_kb = os.path.getsize(DICT_OUTPUT) / 1024
    core_kb = os.path.getsize(CORE_FORMS_OUTPUT) / 1024
    full_mb = os.path.getsize(FULL_FORMS_OUTPUT) / (1024 * 1024)
    with_defs = sum(1 for e in dictionary if 'definitions' in e)

    print(f'\n=== Build Complete ===')
    print(f'Dictionary:  {len(dictionary)} entries ({dict_kb:.0f} KB), {with_defs} with definitions, {pron_count} with pronunciation')
    print(f'Core forms:  {len(core_forms)} forms ({core_kb:.0f} KB) — instant load')
    print(f'Full forms:  {len(all_forms)} forms ({full_mb:.1f} MB gzipped) — background load')
    print(f'Initial payload: {(dict_kb + core_kb)/1024:.1f} MB')


if __name__ == '__main__':
    main()
