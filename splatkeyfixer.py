#!/usr/bin/env python3
"""
Splatoon Weapon Data Cleaner
Cleans up hint_base_damage and hint_released fields
"""

import json
import re
import html
from pathlib import Path
from datetime import datetime


def clean_damage_text(damage_text):
    """Clean up damage text by removing Salmon Run data and fixing HTML entities"""
    if not damage_text or not isinstance(damage_text, str):
        return ""

    # Decode HTML entities
    cleaned = html.unescape(damage_text)

    # Split by <br> tags
    parts = re.split(r'<br\s*/?>', cleaned, flags=re.IGNORECASE)

    # Handle cases where &lt;br&gt; wasn't properly decoded
    if len(parts) == 1:
        parts = re.split(r'&lt;br&gt;', cleaned, flags=re.IGNORECASE)

    multiplayer_parts = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Skip Salmon Run related parts
        salmon_indicators = [
            'File:S3_Icon_Mr_Grizz.png',
            'File:S2_Icon_Mr_Grizz.png',
            'File:S_Icon_Mr_Grizz.png',
            'Salmon_Run_Next_Wave',
            'Salmon Run Next Wave',
            'SRNW',
            'Salmon Run'
        ]

        # Check if this part contains any Salmon Run indicators
        is_salmon_run = any(
            indicator in part for indicator in salmon_indicators)

        if not is_salmon_run:
            # Clean up any remaining wiki markup
            cleaned_part = clean_wiki_markup(part)
            if cleaned_part:
                multiplayer_parts.append(cleaned_part)

    # Join with separators
    result = ' / '.join(multiplayer_parts) if multiplayer_parts else ""

    # Final cleanup
    result = re.sub(r'\s+', ' ', result).strip()

    return result


def clean_release_date(release_text):
    """Clean up release date text by fixing wiki templates and formatting"""
    if not release_text or not isinstance(release_text, str):
        return ""

    # Decode HTML entities
    cleaned = html.unescape(release_text)

    # Remove italic markup
    cleaned = re.sub(r"''([^']+)''", r'\1', cleaned)

    # Game code mapping
    game_map = {
        'S': 'Splatoon',
        's': 'Splatoon',
        'S2': 'Splatoon 2',
        's2': 'Splatoon 2',
        'S3': 'Splatoon 3',
        's3': 'Splatoon 3'
    }

    # Handle incomplete templates with parentheses: ({{Ver|game|version
    paren_pattern = r'\(\{\{[Vv]er\|([^|]+)\|([^}\s]+)'
    match = re.search(paren_pattern, cleaned)
    if match:
        game_code = match.group(1).strip()
        version = match.group(2).strip()
        game_name = game_map.get(game_code, game_code)
        replacement = '(' + game_name + ' - ' + version + ')'
        cleaned = cleaned[:match.start()] + replacement + cleaned[match.end():]

    # Handle complete version templates: {{Ver|game|version}}
    complete_pattern = r'\{\{[Vv]er\|([^|]+)\|([^}]+)\}\}'
    match = re.search(complete_pattern, cleaned)
    if match:
        game_code = match.group(1).strip()
        version = match.group(2).strip()
        game_name = game_map.get(game_code, game_code)
        replacement = game_name + ' - ' + version
        cleaned = cleaned[:match.start()] + replacement + cleaned[match.end():]

    # Handle incomplete version templates at end: {{Ver|game|version
    end_pattern = r'\{\{[Vv]er\|([^|]+)\|([^}\s]+)$'
    match = re.search(end_pattern, cleaned)
    if match:
        game_code = match.group(1).strip()
        version = match.group(2).strip()
        game_name = game_map.get(game_code, game_code)
        replacement = game_name + ' - ' + version
        cleaned = cleaned[:match.start()] + replacement + cleaned[match.end():]

    # Handle complete date templates: {{date|YYYY-MM-DD}}
    date_pattern = r'\{\{date\|(\d{4}-\d{2}-\d{2})\}\}'
    match = re.search(date_pattern, cleaned)
    if match:
        date_str = match.group(1)
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            formatted_date = date_obj.strftime('%B %d, %Y')
            cleaned = cleaned[:match.start()] + formatted_date + \
                cleaned[match.end():]
        except ValueError:
            cleaned = cleaned[:match.start()] + date_str + \
                cleaned[match.end():]

    # Handle incomplete date templates: {{date|YYYY-MM-DD
    incomplete_date_pattern = r'\{\{date\|(\d{4}-\d{2}-\d{2})'
    match = re.search(incomplete_date_pattern, cleaned)
    if match:
        date_str = match.group(1)
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            formatted_date = date_obj.strftime('%B %d, %Y')
            cleaned = cleaned[:match.start()] + formatted_date + \
                cleaned[match.end():]
        except ValueError:
            cleaned = cleaned[:match.start()] + date_str + \
                cleaned[match.end():]

    # Remove any remaining incomplete templates
    cleaned = re.sub(r'\{\{[^}]*$', '', cleaned)
    cleaned = re.sub(r'\{\{[^}]*\}\}', '', cleaned)

    # Clean up whitespace and empty parentheses
    cleaned = re.sub(r'\s*\(\s*\)', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned)

    return cleaned.strip()


def clean_wiki_markup(text):
    """Remove wiki markup from text"""
    if not text:
        return ""

    # Remove File references
    text = re.sub(r'File:[^\s\]]+(?:\.[a-zA-Z]{3,4})?', '', text)

    # Remove wiki links
    text = re.sub(r'\[\[([^|\]]+)\|?[^\]]*\]\]', r'\1', text)

    # Remove templates
    text = re.sub(r'\{\{[^}]*\}\}', '', text)

    # Remove HTML tags
    text = re.sub(r'<[^>]*>', '', text)

    # Clean up whitespace and parentheses
    text = re.sub(r'\s*\(\s*\)', '', text)
    text = re.sub(r'\s+', ' ', text)

    return text.strip()


def process_weapons_data(input_file="weapons.json", output_file="weapons_cleaned.json"):
    """Process all weapons and clean their damage and release data"""

    # Load weapons data
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("❌ File " + input_file + " not found!")
        return False
    except json.JSONDecodeError as e:
        print("❌ JSON decode error: " + str(e))
        return False

    if "weapons" not in data:
        print("❌ Invalid JSON structure - missing 'weapons' key")
        return False

    weapons = data["weapons"]
    print("🧹 Processing " + str(len(weapons)) + " weapons...")

    damage_cleaned_count = 0
    release_cleaned_count = 0
    examples = []

    for i, weapon in enumerate(weapons, 1):
        weapon_name = weapon.get("name", "Unknown")
        game = weapon.get("game", "")

        # Clean damage data
        original_damage = weapon.get("hint_base_damage", "")
        if original_damage:
            cleaned_damage = clean_damage_text(original_damage)
            if cleaned_damage != original_damage:
                weapon["hint_base_damage"] = cleaned_damage
                damage_cleaned_count += 1

        # Clean release date data
        original_release = weapon.get("hint_released", "")
        if original_release:
            cleaned_release = clean_release_date(original_release)
            if cleaned_release != original_release:
                weapon["hint_released"] = cleaned_release
                release_cleaned_count += 1

                # Collect examples for display
                if len(examples) < 5:
                    examples.append({
                        "name": weapon_name,
                        "game": game,
                        "original": original_release,
                        "cleaned": cleaned_release
                    })

        # Show progress for changes
        has_damage_change = original_damage and clean_damage_text(
            original_damage) != original_damage
        has_release_change = original_release and clean_release_date(
            original_release) != original_release

        if has_damage_change or has_release_change:
            changes = []
            if has_damage_change:
                changes.append("damage")
            if has_release_change:
                changes.append("release")
            print("[" + str(i) + "/" + str(len(weapons)) + "] ✅ Cleaned " +
                  "/".join(changes) + ": " + weapon_name + " (" + game + ")")

    # Save cleaned data
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print("\n🎉 Cleaning complete!")
        print("📊 Summary:")
        print("   • Total weapons: " + str(len(weapons)))
        print("   • Damage entries cleaned: " + str(damage_cleaned_count))
        print("   • Release entries cleaned: " + str(release_cleaned_count))
        print("   • Saved to: " + output_file)

        # Show examples
        if examples:
            print("\n📝 Examples of release date changes:")
            for example in examples:
                print("\n🎮 " + example['name'] + " (" + example['game'] + ")")
                print("   Before: " + example['original'])
                print("   After:  " + example['cleaned'])

        return True

    except Exception as e:
        print("❌ Error saving JSON: " + str(e))
        return False


def test_cleaning_functions():
    """Test the cleaning functions with sample data"""
    print("🧪 Testing Data Cleaning Functions")
    print("=" * 60)

    print("\n📅 Release Date Cleaning Tests:")
    release_test_cases = [
        "Drizzle Season 2022 ({{Ver|S3|1.1.0",
        "''Initial Release'' ({{ver|s|1.0.0",
        "Sizzle Season 2023 ({{Ver|S3|4.0.0",
        "{{date|2017-07-23",
        "{{Ver|S2|3.1.0}}",
        "{{Ver|S|2.7.0}} Launch Update",
        "{{date|2015-05-28}} - Initial Release",
        "Drizzle Season 2022 ({{Ver|S3|1.1.0}})",
        "''Launch Update'' ({{Ver|S|1.0.0}})",
        "Initial Release ({{ver|s2|1.0.0",
    ]

    for i, test_case in enumerate(release_test_cases, 1):
        print("\nRelease Test " + str(i) + ":")
        print("Input:  " + repr(test_case))

        result = clean_release_date(test_case)
        print("Output: " + repr(result))

        # Show expected results for key cases
        if i == 1:
            print("  ✅ Should show: 'Drizzle Season 2022 (Splatoon 3 - 1.1.0)'")
        elif i == 2:
            print("  ✅ Should show: 'Initial Release (Splatoon - 1.0.0)'")

    print("\n💥 Damage Cleaning Tests:")
    damage_test_cases = [
        "31-60 (Splash)&lt;br>30 (Roll)&lt;br>75-150 (File:S3_Icon_Mr_Grizz.png Salmon_Run_Next_Wave Splash)",
        "38&lt;br> 45 (File:S3_Icon_Mr_Grizz.png Salmon_Run_Next_Wave)",
        "35&lt;br>42 (Salmon Run Next Wave)",
        "50-100",
        "25 (Close)&lt;br>12.5 (Far)",
    ]

    for i, test_case in enumerate(damage_test_cases, 1):
        print("\nDamage Test " + str(i) + ":")
        print("Input:  " + repr(test_case))

        result = clean_damage_text(test_case)
        print("Output: " + repr(result))


def main():
    """Main function"""
    print("🧹 Splatoon Weapon Data Cleaner")
    print("=" * 50)

    # Test the cleaning functions first
    test_cleaning_functions()

    print("\n" + "=" * 50)

    # Process the actual weapons file
    success = process_weapons_data()

    if success:
        print("\n✨ All done! Weapon data has been cleaned.")
        print("📁 Check 'weapons_cleaned.json' for the results.")
    else:
        print("\n💥 Processing failed!")


if __name__ == "__main__":
    main()
