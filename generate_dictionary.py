import xml.etree.ElementTree as ET
import json
import os
import sys
import argparse

# Target schema:
# [{ "word": "...", "partOfSpeech": "...", "inflection": "...", "definitions": ["..."] }]
# Only non-empty optional fields are included.

def main():
    parser = argparse.ArgumentParser(description='Generate dictionary JSON from XML.')
    parser.add_argument('--limit', type=int, default=0,
                        help='Max entries to export (0 = all)')
    args = parser.parse_args()

    xml_path = '/root/slovenian-dict/Dictionary_of_Lesser_Used_Slovenian_Words.xml'
    out_path = '/root/slovenian-dict-app/public/slovenian_dictionary.json'

    if not os.path.exists(xml_path):
        print(f"Error: {xml_path} not found.")
        sys.exit(1)

    print(f"Parsing {xml_path}...")

    tree = ET.parse(xml_path)
    root = tree.getroot()

    dictionary = []

    for de in root.findall('.//de'):
        if args.limit and len(dictionary) >= args.limit:
            break

        hw_elem = de.find('hw')
        po_elem = de.find('po')
        if_elem = de.find('if')

        if hw_elem is None or not hw_elem.text:
            continue

        word = hw_elem.text.strip()
        part_of_speech = po_elem.text.strip() if po_elem is not None and po_elem.text else ""
        inflection = if_elem.text.strip() if if_elem is not None and if_elem.text else ""

        entry = {"word": word}
        if part_of_speech:
            entry["partOfSpeech"] = part_of_speech
        if inflection:
            entry["inflection"] = inflection

        dictionary.append(entry)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(dictionary, f, ensure_ascii=False, separators=(',', ':'))

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"Generated {out_path} with {len(dictionary)} entries ({size_mb:.1f} MB).")

if __name__ == "__main__":
    main()
