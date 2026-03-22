"""
Parses Slovenian Wiktionary (sl.wiktionary.org) XML dump to extract
Slovenian-language definitions for dictionary entries.

Output: test-data/slwiktionary-definitions.json
  { "lemma": ["definition1", "definition2", ...], ... }
"""
import bz2
import json
import re
import xml.etree.ElementTree as ET

DUMP_PATH = 'test-data/slwiktionary-articles.xml.bz2'
OUTPUT_PATH = 'test-data/slwiktionary-definitions.json'

# MediaWiki XML namespace
NS = '{http://www.mediawiki.org/xml/export-0.11/}'

def clean_wikitext(text: str) -> str:
    """Strip wiki markup from a definition line."""
    # Remove templates like {{foo|bar}} but keep simple ones
    text = re.sub(r"\{\{IPA\|[^}]*\}\}", '', text)
    text = re.sub(r"\{\{[^}]*\}\}", '', text)
    # Remove [[ ]] links, keeping display text
    text = re.sub(r"\[\[[^\]]*\|([^\]]*)\]\]", r'\1', text)
    text = re.sub(r"\[\[([^\]]*)\]\]", r'\1', text)
    # Remove '' (italic markup)
    text = text.replace("'''", '').replace("''", '')
    # Clean up whitespace
    text = text.strip()
    return text


def extract_definitions(wikitext: str) -> list[str]:
    """Extract Slovenian definitions from wikitext."""
    defs = []
    in_pomeni = False

    for line in wikitext.split('\n'):
        stripped = line.strip()

        # Start of definitions section
        if '{{Pomeni}}' in stripped or '{{pomeni}}' in stripped:
            in_pomeni = True
            continue

        # End of definitions section (next section template)
        if in_pomeni and stripped.startswith('{{') and stripped.endswith('}}'):
            break

        # Definition line (# but not #: which is an example)
        if in_pomeni and stripped.startswith('#') and not stripped.startswith('#:'):
            # Remove the # prefix
            def_text = stripped.lstrip('#').strip()
            cleaned = clean_wikitext(def_text)
            if cleaned and len(cleaned) >= 2:
                defs.append(cleaned)

    return defs


def main():
    definitions = {}
    page_count = 0
    with_defs = 0

    print('Parsing sl.wiktionary.org dump...')
    with bz2.open(DUMP_PATH, 'rb') as f:
        tree = ET.parse(f)

    root = tree.getroot()
    for page in root.findall(f'{NS}page'):
        title_el = page.find(f'{NS}title')
        if title_el is None:
            continue
        title = title_el.text or ''

        # Skip non-article pages
        ns_el = page.find(f'{NS}ns')
        if ns_el is not None and ns_el.text != '0':
            continue

        # Skip titles with special chars
        if ':' in title or '/' in title:
            continue

        text_el = page.find(f'.//{NS}text')
        if text_el is None or not text_el.text:
            continue

        page_count += 1
        wikitext = text_el.text

        # Only process entries that have Slovenian content
        defs = extract_definitions(wikitext)
        if defs:
            definitions[title.lower()] = defs
            with_defs += 1

    print(f'Pages processed: {page_count}')
    print(f'Entries with definitions: {with_defs}')

    # Sample
    samples = list(definitions.items())[:10]
    for word, d in samples:
        print(f'  {word}: {d[:2]}')

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(definitions, f, ensure_ascii=False, separators=(',', ':'))

    import os
    print(f'\nOutput: {OUTPUT_PATH} ({os.path.getsize(OUTPUT_PATH)/1024:.0f} KB)')


if __name__ == '__main__':
    main()
