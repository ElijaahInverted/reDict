"""
Stream-parses Sloleks XML files to build:
1. form->lemma lookup map
2. lemma->pronunciation map (accentuated form + IPA)
"""
import xml.etree.ElementTree as ET
import json
import os
import zipfile

ZIP_PATH = 'test-data/Sloleks.3.1.zip'
FORMS_OUTPUT = 'test-data/sloleks-form-to-lemma.json'
PRONUN_OUTPUT = 'test-data/sloleks-pronunciation.json'

def parse_xml_stream(filepath_or_fileobj, form_to_lemma, pronunciation, lemma_set):
    context = ET.iterparse(filepath_or_fileobj, events=('end',))
    current_lemma = None
    current_accent = None
    current_ipa = None
    first_form = True
    entry_count = 0

    for event, elem in context:
        if elem.tag == 'lemma':
            current_lemma = elem.text.strip() if elem.text else None

        elif elem.tag == 'entry':
            if current_lemma:
                lemma_set.add(current_lemma.lower())
                # Save pronunciation for lemma (first wordForm = infinitive/base)
                if current_lemma.lower() not in pronunciation:
                    pron = {}
                    if current_accent:
                        pron['a'] = current_accent
                    if current_ipa:
                        pron['i'] = current_ipa
                    if pron:
                        pronunciation[current_lemma.lower()] = pron
                entry_count += 1
            elem.clear()
            current_lemma = None
            current_accent = None
            current_ipa = None
            first_form = True

        elif elem.tag == 'wordForm':
            if first_form and current_lemma:
                # Extract pronunciation from first wordForm only
                acc_el = elem.find('.//accentuation/form')
                ipa_el = elem.find('.//pronunciation/form[@script="IPA"]')
                if acc_el is not None and acc_el.text:
                    current_accent = acc_el.text.strip()
                if ipa_el is not None and ipa_el.text:
                    current_ipa = ipa_el.text.strip()
                first_form = False

        elif elem.tag == 'orthography' and current_lemma:
            form_elem = elem.find('form')
            if form_elem is not None and form_elem.text:
                form = form_elem.text.strip().lower()
                if form and len(form) >= 2 and form not in form_to_lemma:
                    form_to_lemma[form] = current_lemma.lower()

    return entry_count

def main():
    form_to_lemma = {}
    pronunciation = {}
    lemma_set = set()
    total_entries = 0

    with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
        xml_files = sorted([n for n in zf.namelist() if n.endswith('.xml')])
        print(f'Found {len(xml_files)} XML files')

        for i, name in enumerate(xml_files):
            print(f'  [{i+1}/{len(xml_files)}] {name}...', end=' ', flush=True)
            with zf.open(name) as f:
                count = parse_xml_stream(f, form_to_lemma, pronunciation, lemma_set)
            total_entries += count
            print(f'{count} entries')

    print(f'\nTotal: {total_entries} entries, {len(lemma_set)} lemmas, {len(form_to_lemma)} forms, {len(pronunciation)} pronunciations')

    with open(FORMS_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(form_to_lemma, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Forms: {os.path.getsize(FORMS_OUTPUT)/1024/1024:.1f} MB')

    with open(PRONUN_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(pronunciation, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Pronunciation: {os.path.getsize(PRONUN_OUTPUT)/1024/1024:.1f} MB')

if __name__ == '__main__':
    main()
