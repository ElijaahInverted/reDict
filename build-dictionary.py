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
SL_WIKTIONARY_INPUT = 'test-data/slwiktionary-definitions.json'
DICT_OUTPUT = 'public/slovenian_dictionary.json'
SLOLEKS_LEMMAS_OUTPUT = 'public/slovenian_lemmas_extra.json.gz'
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

    # Resolve "alternative form of X" / "form of X" cross-references
    import re
    alt_pattern = re.compile(r'^(?:alternative |obsolete |archaic )?form of ["\u201c]?(\w+)', re.IGNORECASE)
    dict_by_key = {rec['word'].lower(): rec for rec in entries_map.values()}

    for entry in dictionary:
        defs = entry.get('definitions', [])
        if len(defs) == 1:
            m = alt_pattern.match(defs[0])
            if m:
                # Strip diacritics for lookup
                ref = m.group(1).lower()
                # Try with and without accents
                target = dict_by_key.get(ref)
                if not target:
                    # Strip combining characters for accented refs like búkev
                    import unicodedata
                    stripped = unicodedata.normalize('NFD', ref)
                    stripped = ''.join(c for c in stripped if unicodedata.category(c) != 'Mn')
                    target = dict_by_key.get(stripped)
                if target and target['definitions']:
                    entry['definitions'] = defs + [d for d in target['definitions'] if d not in defs]

    dictionary.sort(key=lambda e: e['word'].lower())
    return dictionary


def main():
    print('1. Building dictionary from Kaikki.org...')
    dictionary = build_kaikki_dict()
    defined_lemmas = {e['word'].lower() for e in dictionary}

    print('2. Loading Sloleks + sl.wiktionary data...')
    with open(SLOLEKS_INPUT, 'r', encoding='utf-8') as f:
        all_forms = json.load(f)
    with open(SLOLEKS_PRONUN, 'r', encoding='utf-8') as f:
        pronunciation = json.load(f)
    with open(SL_WIKTIONARY_INPUT, 'r', encoding='utf-8') as f:
        sl_definitions = json.load(f)

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

    # Enrich ALL entries with Slovenian definitions from sl.wiktionary
    sl_def_count = 0
    for entry in dictionary:
        key = entry['word'].lower()
        sl_defs = sl_definitions.get(key)
        if sl_defs:
            entry['definitionsSl'] = sl_defs[:5]
            sl_def_count += 1
    print(f'   {sl_def_count} entries enriched with Slovenian definitions')

    # Add ALL Sloleks lemmas that aren't already in dictionary
    sloleks_lemmas = set(all_forms.values())
    added_count = 0
    sl_only_defs = 0
    for lemma in sorted(sloleks_lemmas):
        if lemma not in defined_lemmas:
            entry = {'word': lemma}
            pron = pronunciation.get(lemma)
            if pron:
                if 'a' in pron:
                    entry['accent'] = pron['a']
                if 'i' in pron:
                    entry['ipa'] = pron['i']
                pron_count += 1
            sl_defs = sl_definitions.get(lemma)
            if sl_defs:
                entry['definitionsSl'] = sl_defs[:5]
                sl_only_defs += 1
            dictionary.append(entry)
            defined_lemmas.add(lemma)
            added_count += 1
    print(f'   Added {added_count} Sloleks-only lemmas ({sl_only_defs} with Slovenian definitions)')
    dictionary.sort(key=lambda e: e['word'].lower())

    # Remove identity mappings (form == lemma)
    all_forms = {k: v for k, v in all_forms.items() if k != v}

    # Split into core — only forms pointing to lemmas WITH definitions (fast initial load)
    lemmas_with_defs = {e['word'].lower() for e in dictionary if 'definitions' in e}
    core_forms = {k: v for k, v in all_forms.items() if v in lemmas_with_defs}

    # Split dictionary: Kaikki entries (instant) vs Sloleks-only (background)
    kaikki_entries = [e for e in dictionary if 'definitions' in e or 'examples' in e]
    sloleks_entries = [e for e in dictionary if 'definitions' not in e and 'examples' not in e]

    print('3. Writing output files...')

    # Main dictionary (Kaikki entries with definitions — instant load)
    with open(DICT_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(kaikki_entries, f, ensure_ascii=False, separators=(',', ':'))

    # Extra lemmas (Sloleks-only, no definitions — background load, gzipped)
    with gzip.open(SLOLEKS_LEMMAS_OUTPUT, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(sloleks_entries, f, ensure_ascii=False, separators=(',', ':'))

    # Core forms (small, loads immediately)
    with open(CORE_FORMS_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(core_forms, f, ensure_ascii=False, separators=(',', ':'))

    # Full forms (gzipped, background load)
    with gzip.open(FULL_FORMS_OUTPUT, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(all_forms, f, ensure_ascii=False, separators=(',', ':'))

    # Report
    dict_kb = os.path.getsize(DICT_OUTPUT) / 1024
    extra_mb = os.path.getsize(SLOLEKS_LEMMAS_OUTPUT) / (1024 * 1024)
    core_kb = os.path.getsize(CORE_FORMS_OUTPUT) / 1024
    full_mb = os.path.getsize(FULL_FORMS_OUTPUT) / (1024 * 1024)

    print(f'\n=== Build Complete ===')
    print(f'Dictionary:  {len(kaikki_entries)} entries ({dict_kb:.0f} KB) with definitions — instant load')
    print(f'Extra lemmas: {len(sloleks_entries)} entries ({extra_mb:.1f} MB gzipped) — background load')
    print(f'Core forms:  {len(core_forms)} forms ({core_kb:.0f} KB) — instant load')
    print(f'Full forms:  {len(all_forms)} forms ({full_mb:.1f} MB gzipped) — background load')
    print(f'Total entries: {len(dictionary)}, {pron_count} with pronunciation')
    print(f'Initial payload: {(dict_kb + core_kb)/1024:.1f} MB')


if __name__ == '__main__':
    main()
