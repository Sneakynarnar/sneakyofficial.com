#!/usr/bin/env python3
"""
Splatoon Weapon Image Downloader with Hash Prediction
Downloads weapon images using MediaWiki hash prediction and standardizes filenames
"""

import json
import hashlib
import urllib.parse
import requests
import re
import os
from pathlib import Path

# Configuration
BASE_URL = "https://cdn.wikimg.net/en/splatoonwiki/images"
OUTPUT_DIR = Path("images")
OUTPUT_DIR.mkdir(exist_ok=True)


def sanitize_filename(name):
    """Create a safe filename from weapon name"""
    # Convert to lowercase and replace problematic characters
    name = name.lower()
    # Remove special chars except spaces and hyphens
    name = re.sub(r'[^\w\s-]', '', name)
    name = re.sub(r'\s+', '_', name)      # Replace spaces with underscores
    name = re.sub(r'-+', '_', name)       # Replace hyphens with underscores
    name = re.sub(r'_+', '_', name)       # Collapse multiple underscores
    return name.strip('_')


def predict_mediawiki_url(filename, base_url=BASE_URL):
    """
    Predict MediaWiki image URL using hash-based directory structure
    """
    # Clean filename like MediaWiki does
    if filename.startswith('File:'):
        filename = filename[5:]

    # Normalize: capitalize first character, spaces to underscores
    if filename:
        filename = filename[0].upper() + filename[1:]
    filename = filename.replace(' ', '_')

    # Calculate MD5 hash of the ORIGINAL filename (before URL encoding)
    md5_hash = hashlib.md5(filename.encode('utf-8')).hexdigest()

    # URL encode the filename for the final URL
    encoded_filename = urllib.parse.quote(filename)

    # Build URL using hash-based directories
    predicted_url = f"{base_url}/{md5_hash[0]}/{md5_hash[:2]}/{encoded_filename}"

    return predicted_url


def generate_wiki_filename(weapon_name, game):
    """
    Generate the expected wiki filename based on weapon name and game
    """
    # Game prefixes used in Splatoon wiki
    game_prefixes = {
        "Splatoon": "S",
        "Splatoon 2": "S2",
        "Splatoon 3": "S3"
    }

    # Clean up game name to get prefix
    game_clean = game.strip() if game else ""
    prefix = game_prefixes.get(game_clean, "S3")  # Default to S3 if unknown

    # Clean weapon name for wiki format - keep apostrophes!
    wiki_name = weapon_name.strip()
    wiki_name = re.sub(r'\s+', '_', wiki_name)  # Spaces to underscores
    # Don't remove apostrophes - MediaWiki keeps them

    # Standard wiki filename format
    wiki_filename = f"{prefix}_Weapon_Main_{wiki_name}.png"

    return wiki_filename


def generate_local_filename(weapon_name, game):
    """
    Generate standardized local filename: {weapon_name} ({game}).png
    """
    clean_name = sanitize_filename(weapon_name)

    if game and game.strip():
        game_clean = game.strip()
        return f"{clean_name} ({game_clean}).png"
    else:
        return f"{clean_name}.png"


def download_image(url, local_path, weapon_name):
    """
    Download image from URL to local path
    """
    try:
        print(f"🌐 Downloading: {weapon_name}")
        print(f"    URL: {url}")
        print(f"    → {local_path}")

        response = requests.get(url, timeout=30)
        response.raise_for_status()

        # Check if it's actually an image
        content_type = response.headers.get('content-type', '').lower()
        if not any(img_type in content_type for img_type in ['image/', 'application/octet-stream']):
            print(f"    ❌ Not an image (Content-Type: {content_type})")
            return False

        # Save the image
        with open(local_path, 'wb') as f:
            f.write(response.content)

        print(f"    ✅ Downloaded ({len(response.content)} bytes)")
        return True

    except requests.exceptions.RequestException as e:
        print(f"    ❌ Download failed: {e}")
        return False
    except Exception as e:
        print(f"    ❌ Error: {e}")
        return False


def process_weapons(input_file="weapons.json", output_file="weapons_with_images.json"):
    """
    Process all weapons: predict URLs, download images, update JSON
    """

    # Load weapons data
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ File {input_file} not found!")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        return False

    if "weapons" not in data:
        print("❌ Invalid JSON structure - missing 'weapons' key")
        return False

    weapons = data["weapons"]
    print(f"🎮 Processing {len(weapons)} weapons...")

    download_count = 0
    update_count = 0

    for i, weapon in enumerate(weapons, 1):
        weapon_name = weapon.get("name", "").strip()
        game = weapon.get("game", "").strip()

        if not weapon_name:
            print(f"[{i}/{len(weapons)}] ⚠️  Skipping weapon with no name")
            continue

        print(f"\n[{i}/{len(weapons)}] Processing: {weapon_name} ({game})")

        # Generate filenames
        wiki_filename = generate_wiki_filename(weapon_name, game)
        local_filename = generate_local_filename(weapon_name, game)
        local_path = OUTPUT_DIR / local_filename

        # Check if image already exists locally
        if local_path.exists() and local_path.stat().st_size > 0:
            print(
                f"    ✅ Image already exists: {local_filename} ({local_path.stat().st_size} bytes)")
            weapon["image"] = local_filename
            update_count += 1
            continue
        elif local_path.exists():
            # File exists but is empty - remove it and re-download
            print(f"    🗑️  Removing empty file: {local_filename}")
            local_path.unlink()

        # Predict MediaWiki URL
        predicted_url = predict_mediawiki_url(wiki_filename)

        # Try to download
        success = download_image(predicted_url, local_path, weapon_name)

        if success:
            weapon["image"] = local_filename
            download_count += 1
            update_count += 1
        else:
            # Try alternative formats if the first one fails
            alternative_formats = []

            # Different ways to handle apostrophes and special characters
            base_name = weapon_name.replace(' ', '_')
            alternatives = [
                base_name,  # Keep apostrophes
                base_name.replace("'", ""),  # Remove apostrophes
                base_name.replace("'", "'"),  # Try curly apostrophe
                base_name.replace("-", "_"),  # Hyphens to underscores
                base_name.replace(".", ""),   # Remove periods
            ]

            # Generate alternatives for each game
            for alt_name in alternatives:
                alternative_formats.extend([
                    f"S_Weapon_Main_{alt_name}.png",
                    f"S2_Weapon_Main_{alt_name}.png",
                    f"S3_Weapon_Main_{alt_name}.png",
                    f"{alt_name}.png"
                ])

            # Remove duplicates while preserving order
            seen = set()
            alternative_formats = [
                x for x in alternative_formats if not (x in seen or seen.add(x))]

            found = False
            # Limit to first 10 to avoid spam
            for alt_filename in alternative_formats[:10]:
                if found:
                    break

                alt_url = predict_mediawiki_url(alt_filename)
                print(f"    🔄 Trying alternative: {alt_filename}")

                if download_image(alt_url, local_path, weapon_name):
                    weapon["image"] = local_filename
                    download_count += 1
                    update_count += 1
                    found = True

            if not found:
                print(f"    ❌ Could not find image for {weapon_name}")
                weapon["image"] = ""  # Clear invalid image references

    # Save updated JSON
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"\n🎉 Processing complete!")
        print(f"📊 Summary:")
        print(f"   • Total weapons: {len(weapons)}")
        print(f"   • Images downloaded: {download_count}")
        print(f"   • JSON entries updated: {update_count}")
        print(f"   • Saved to: {output_file}")

        return True

    except Exception as e:
        print(f"❌ Error saving JSON: {e}")
        return False


def test_hash_prediction():
    """
    Test the hash prediction with known examples
    """
    print("🧪 Testing MediaWiki Hash Prediction")
    print("=" * 50)

    test_cases = [
        ("S2_Weapon_Main_Explosher.png",
         "https://cdn.wikimg.net/en/splatoonwiki/images/1/13/S2_Weapon_Main_Explosher.png"),
        ("S2_Weapon_Main_N-ZAP_'83.png",
         "https://cdn.wikimg.net/en/splatoonwiki/images/f/f6/S2_Weapon_Main_N-ZAP_%2783.png"),
        ("S3_Weapon_Main_Splattershot.png", None)  # We'll predict this
    ]

    for filename, expected in test_cases:
        predicted = predict_mediawiki_url(filename)

        print(f"\nFilename: {filename}")
        print(f"Predicted: {predicted}")

        if expected:
            match = predicted == expected
            print(f"Expected:  {expected}")
            print(f"Match: {'✅' if match else '❌'}")

        # Show hash calculation
        clean_filename = filename
        if clean_filename.startswith('File:'):
            clean_filename = clean_filename[5:]
        if clean_filename:
            clean_filename = clean_filename[0].upper() + clean_filename[1:]
        clean_filename = clean_filename.replace(' ', '_')

        md5_hash = hashlib.md5(clean_filename.encode('utf-8')).hexdigest()
        encoded_name = urllib.parse.quote(clean_filename)
        print(f"MD5: {md5_hash} → /{md5_hash[0]}/{md5_hash[:2]}/")
        print(f"Encoded filename: {encoded_name}")

        # Test if our encoding matches the expected URL
        if expected and '%' in expected:
            expected_encoded = expected.split('/')[-1]
            our_encoded = encoded_name
            print(f"Expected encoding: {expected_encoded}")
            print(f"Our encoding:      {our_encoded}")
            print(
                f"Encoding match: {'✅' if expected_encoded == our_encoded else '❌'}")


def main():
    """Main function"""
    print("🎮 Splatoon Weapon Image Downloader")
    print("=" * 50)

    # Test hash prediction first
    test_hash_prediction()

    print("\n" + "=" * 50)

    # Process weapons
    success = process_weapons()

    if success:
        print("\n✨ All done! Check the /images folder for downloaded images.")
    else:
        print("\n💥 Processing failed!")


if __name__ == "__main__":
    main()
