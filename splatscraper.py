# Splatoon Wiki Scraper using wikitext from `action=edit`

import requests
import re
import json
import logging
import os
import signal
from pathlib import Path
from urllib.parse import quote
from bs4 import BeautifulSoup

# ----------- Config -----------
BASE_EDIT_URL = "https://splatoonwiki.org/w/index.php?title={title}&action=edit"
IMG_BASE_URL = "https://cdn.wikimg.net/en/splatoonwiki/images"
FILE_URL = "https://splatoonwiki.org/wiki/File:{filename}"
OUTPUT_DIR = Path("images")
OUTPUT_DIR.mkdir(exist_ok=True)

# ----------- Logging -----------
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# ----------- Globals -----------
weapons = []
running = True

# ----------- Helpers -----------
def sanitize_filename(name):
    return re.sub(r'[^a-z0-9 ()-]+', '', name.lower())

def extract_image_filename(field_value):
    # Handle both File: prefix and plain filenames
    match = re.search(r"(?:File:)?([^|\n\s]+\.(?:png|jpg|jpeg))", field_value, re.IGNORECASE)
    return match.group(1) if match else ""

def extract_fire_rate(block):
    # Look for fire_rate, fire rate, or similar patterns
    match = re.search(r"fire[_\s]?rate\s*=\s*(\d+)", block, re.IGNORECASE)
    return int(match.group(1)) if match else 50

def extract_range(data_block):
    match = re.search(r"range\s*=\s*(\d+)", data_block)
    return int(match.group(1)) if match else 50

def extract_damage(data_block):
    match = re.search(r"damage\s*=\s*(\d+)", data_block)
    return int(match.group(1)) if match else 50

def extract_field_value(block, field_name):
    """Extract a field value from the infobox block"""
    # Split block into lines and process each line
    lines = block.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line or '=' not in line:
            continue
            
        # Split on first = only
        parts = line.split('=', 1)
        if len(parts) != 2:
            continue
            
        key = parts[0].strip()
        value = parts[1].strip()
        
        # Remove leading | from key (wiki infobox format)
        if key.startswith('|'):
            key = key[1:].strip()
        
        # Check if this is the field we're looking for
        if key.lower() == field_name.lower():
            # Clean up the value
            value = re.sub(r'\s*<!--.*?-->', '', value)  # Remove HTML comments
            # Remove wiki markup
            value = re.sub(r'\[\[([^|\]]+)\|?[^\]]*\]\]', r'\1', value)  # Remove wiki links
            value = re.sub(r'\{\{[^}]*\}\}', '', value)  # Remove templates
            value = re.sub(r'<[^>]*>', '', value)  # Remove HTML tags
            return value.strip()
    
    return ""

def get_real_image_url(filename):
    url = FILE_URL.format(filename=quote(filename))
    res = requests.get(url)
    soup = BeautifulSoup(res.text, "html.parser")
    for a in soup.select(".fullImageLink a"):
        href = a.get("href")
        if href and href.endswith((".png", ".jpg", ".jpeg")):
            return "https:" + href
    return None

# ----------- Scraping -----------
def get_weapon_list():
    res = requests.get("https://splatoonwiki.org/wiki/Weapon")
    res.raise_for_status()
    soup = BeautifulSoup(res.text, "html.parser")
    links = []
    for table in soup.select("table.wikitable"):
        for a in table.select("td a"):
            href = a.get("href")
            title = a.get("title")
            if href and title:
                links.append((title, href))
    logging.info(f"🔗 Found {len(links)} weapons")
    return list(dict(links).items())

def fetch_wikitext(title):
    url = BASE_EDIT_URL.format(title=quote(title))
    logging.info(f"📄 Fetching wikitext for {title}")
    res = requests.get(url)
    res.raise_for_status()
    match = re.search(r'<textarea.*?>([\s\S]+?)</textarea>', res.text)
    if match:
        return match.group(1)
    logging.warning(f"⚠️ Could not extract wikitext for {title}")
    return ""

def parse_infobox_variants(title, wikitext):
    variants = []
    
    # Look for all infobox patterns - they vary by game
    infobox_patterns = [
        r'\{\{Infobox/Weapon([\s\S]*?)\}\}',  # Standard pattern
    ]
    
    # Find all infobox blocks
    infobox_blocks = []
    for pattern in infobox_patterns:
        matches = re.finditer(pattern, wikitext, re.MULTILINE)
        for match in matches:
            if len(match.groups()) >= 1:
                infobox_blocks.append(match.group(1))
    
    # Debug: Print first few lines of each block
    for i, block in enumerate(infobox_blocks):
        lines = block.strip().split('\n')[:10]  # First 10 lines
        logging.info(f"🔍 Debug - Infobox block {i+1} for {title}:")
        for line in lines:
            if '=' in line:
                logging.info(f"  Field line: {line.strip()}")
    
    # If no infobox blocks found, try a more general approach
    if not infobox_blocks:
        logging.warning(f"No infobox found for {title}, trying alternative extraction")
        variant = extract_from_general_text(title, wikitext)
        if variant:
            variants.append(variant)
        return variants
    
    for block_idx, block in enumerate(infobox_blocks):
        variant = {
            "name": title,
            "class": "",
            "game": "",
            "image": "",
            "firerate": extract_fire_rate(block),
            "range": extract_range(block),
            "damage": extract_damage(block),
            "weight": "",
            "sub": "",
            "special": "",
            "hint_released": "",
            "hint_base_damage": ""
        }
        
        # Extract fields using improved method
        variant["class"] = extract_field_value(block, "class")
        variant["game"] = extract_field_value(block, "game")
        variant["sub"] = extract_field_value(block, "sub")
        variant["special"] = extract_field_value(block, "special")
        variant["weight"] = extract_field_value(block, "weight")
        
        # Debug extracted values
        logging.info(f"🔍 Extracted from block {block_idx+1}: class='{variant['class']}', game='{variant['game']}', sub='{variant['sub']}'")
        
        # Handle image field (multiple possible names)
        for img_field in ["image", "3d-image", "3d-image-1"]:
            img_value = extract_field_value(block, img_field)
            if img_value and not variant["image"]:
                variant["image"] = extract_image_filename(img_value)
                logging.info(f"🔍 Found image field '{img_field}': {img_value} -> {variant['image']}")
                break
        
        # Handle release date/version info
        for release_field in ["introduced", "released", "level"]:
            release_value = extract_field_value(block, release_field)
            if release_value and not variant["hint_released"]:
                variant["hint_released"] = release_value
                break
        
        # Handle base damage
        for damage_field in ["base", "base_damage"]:
            damage_value = extract_field_value(block, damage_field)
            if damage_value and not variant["hint_base_damage"]:
                variant["hint_base_damage"] = damage_value
                break
        
        # Clean up values one more time
        for key, value in variant.items():
            if isinstance(value, str):
                variant[key] = value.strip()
        
        variants.append(variant)
        logging.info(f"✅ Parsed variant: {variant['name']} - Class: {variant['class']}, Game: {variant['game']}")
    
    return variants

def extract_from_general_text(title, wikitext):
    """Fallback method to extract info from general wikitext when infobox parsing fails"""
    variant = {
        "name": title,
        "class": "",
        "game": "",
        "image": "",
        "firerate": 50,
        "range": 50,
        "damage": 50,
        "weight": "",
        "sub": "",
        "special": "",
        "hint_released": "",
        "hint_base_damage": ""
    }
    
    # Try to find game mentions
    game_patterns = [
        r"in\s+''(Splatoon\s*[23]?)''",
        r"appears\s+in\s+''(Splatoon\s*[23]?)''",
        r"returns\s+in\s+''(Splatoon\s*[23]?)''",
    ]
    for pattern in game_patterns:
        match = re.search(pattern, wikitext, re.IGNORECASE)
        if match:
            variant["game"] = match.group(1)
            break
    
    # Try to find weapon class
    class_patterns = [
        r"is\s+a\s+\[\[([^|\]]+)\]\]",
        r"class\s*=\s*([A-Za-z]+)",
    ]
    for pattern in class_patterns:
        match = re.search(pattern, wikitext, re.IGNORECASE)
        if match:
            potential_class = match.group(1)
            # Check if it's a known weapon class
            known_classes = ["Shooter", "Charger", "Roller", "Brush", "Slosher", "Splatling", "Dualies", "Brella", "Wiper"]
            if any(cls.lower() in potential_class.lower() for cls in known_classes):
                variant["class"] = potential_class
                break
    
    return variant if variant["game"] or variant["class"] else None

def download_image(image_name, weapon_name):
    if not image_name:
        logging.warning(f"⚠️ No image found for {weapon_name}")
        return
    filename = sanitize_filename(weapon_name) + ".png"
    filepath = OUTPUT_DIR / filename
    real_url = get_real_image_url(image_name)
    if not real_url:
        logging.warning(f"❌ Could not resolve image URL for {image_name}")
        return
    logging.info(f"🌐 Actual image URL: {real_url}")
    if filepath.exists():
        logging.info(f"✅ Image exists: {filename}")
        return
    try:
        res = requests.get(real_url)
        res.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(res.content)
        logging.info(f"⬇️  Downloaded {filename}")
    except Exception as e:
        logging.warning(f"❌ Failed to download {filename} from {real_url}: {e}")

# ----------- Signal Handling -----------
def save_and_exit(*args):
    logging.warning("🛑 CTRL+C detected! Saving progress...")
    with open("weapons.json", "w", encoding="utf-8") as f:
        json.dump({"weapons": weapons}, f, indent=2, ensure_ascii=False)
    logging.info(f"💾 Saved {len(weapons)} weapons to weapons.json")
    os._exit(0)

signal.signal(signal.SIGINT, save_and_exit)

# ----------- Main -----------
def main():
    links = get_weapon_list()
    for i, (title, url) in enumerate(links):
        if not running:
            break
        logging.info(f"--- [{i+1}/{len(links)}] {title} ---")
        wikitext = fetch_wikitext(title)
        if not wikitext:
            continue
        variants = parse_infobox_variants(title, wikitext)
        if not variants:
            logging.warning(f"⚠️ No variants found for {title}")
        for v in variants:
            weapons.append(v)
            download_image(v["image"], v["name"])
    
    with open("weapons.json", "w", encoding="utf-8") as f:
        json.dump({"weapons": weapons}, f, indent=2, ensure_ascii=False)
    logging.info(f"💾 Saved {len(weapons)} weapons to weapons.json")

if __name__ == "__main__":
    main()