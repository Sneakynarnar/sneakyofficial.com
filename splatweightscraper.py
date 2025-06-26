#!/usr/bin/env python3
"""
Splatoon Weapon Weight Updater
Updates the weight field in weapons.json based on Splatoon wiki mobility data
"""

import json
import re
from pathlib import Path

# Weight/mobility classifications based on Splatoon wiki data
WEAPON_WEIGHTS = {
    "Splatoon": {
        # Rainmaker weapons
        "Rainmaker": "Rainmaker",

        # Slow weapons (10% decrease in swim speed)
        "Dynamo Roller": "Slow",
        "Gold Dynamo Roller": "Slow",
        "Tempered Dynamo Roller": "Slow",
        "E-liter 3K": "Slow",
        "Custom E-liter 3K": "Slow",
        "E-liter 3K Scope": "Slow",
        "Custom E-liter 3K Scope": "Slow",
        "Hydra Splatling": "Slow",
        "Custom Hydra Splatling": "Slow",

        # All other weapons are Normal
        "_default": "Normal"
    },

    "Splatoon 2": {
        # Rainmaker weapons
        "Rainmaker": "Rainmaker",

        # Slow weapons (10% decrease swim, 8.3% decrease run)
        "Dynamo Roller": "Slow",
        "Gold Dynamo Roller": "Slow",
        "Kensa Dynamo Roller": "Slow",
        "E-liter 4K": "Slow",
        "Custom E-liter 4K": "Slow",
        "E-liter 4K Scope": "Slow",
        "Custom E-liter 4K Scope": "Slow",
        "Explosher": "Slow",
        "Custom Explosher": "Slow",
        "Hydra Splatling": "Slow",
        "Custom Hydra Splatling": "Slow",
        "Tenta Brella": "Slow",
        "Tenta Sorella Brella": "Slow",
        "Tenta Camo Brella": "Slow",

        # Fast weapons (5% increase swim, 8.3% increase run)
        "Aerospray MG": "Fast",
        "Aerospray RG": "Fast",
        "Aerospray PG": "Fast",
        "Bamboozler 14 Mk I": "Fast",
        "Bamboozler 14 Mk II": "Fast",
        "Bamboozler 14 Mk III": "Fast",
        "Carbon Roller": "Fast",
        "Carbon Roller Deco": "Fast",
        "Clash Blaster": "Fast",
        "Clash Blaster Neo": "Fast",
        "Dapple Dualies": "Fast",
        "Dapple Dualies Nouveau": "Fast",
        "Clear Dapple Dualies": "Fast",
        "Inkbrush": "Fast",
        "Inkbrush Nouveau": "Fast",
        "Permanent Inkbrush": "Fast",
        "Luna Blaster": "Fast",
        "Luna Blaster Neo": "Fast",
        "Kensa Luna Blaster": "Fast",
        "N-ZAP '85": "Fast",
        "N-ZAP '89": "Fast",
        "N-ZAP '83": "Fast",
        "Splash-o-matic": "Fast",
        "Neo Splash-o-matic": "Fast",
        "Splattershot Jr.": "Fast",
        "Custom Splattershot Jr.": "Fast",
        "Kensa Splattershot Jr.": "Fast",
        "Sploosh-o-matic": "Fast",
        "Neo Sploosh-o-matic": "Fast",
        "Sploosh-o-matic 7": "Fast",
        "Tri-Slosher": "Fast",
        "Tri-Slosher Nouveau": "Fast",
        "Undercover Brella": "Fast",
        "Undercover Sorella Brella": "Fast",
        "Kensa Undercover Brella": "Fast",

        # All other weapons are Normal
        "_default": "Normal"
    },

    "Splatoon 3": {
        # Rainmaker weapons
        "Rainmaker": "Rainmaker",

        # Slow weapons (10% decrease swim, 8.3% decrease run)
        "Dynamo Roller": "Slow",
        "Gold Dynamo Roller": "Slow",
        "E-liter 4K": "Slow",
        "Custom E-liter 4K": "Slow",
        "E-liter 4K Scope": "Slow",
        "Custom E-liter 4K Scope": "Slow",
        "Explosher": "Slow",
        "Custom Explosher": "Slow",
        "Hydra Splatling": "Slow",
        "Custom Hydra Splatling": "Slow",
        "Tenta Brella": "Slow",
        "Tenta Sorella Brella": "Slow",
        "Wellstring V": "Slow",
        "Custom Wellstring V": "Slow",

        # Fast weapons (5% increase swim, 8.3% increase run)
        "Aerospray MG": "Fast",
        "Aerospray RG": "Fast",
        "Bamboozler 14 Mk I": "Fast",
        "Bamboozler 14 Mk II": "Fast",
        "Carbon Roller": "Fast",
        "Carbon Roller Deco": "Fast",
        "Clash Blaster": "Fast",
        "Clash Blaster Neo": "Fast",
        "Dapple Dualies": "Fast",
        "Dapple Dualies Nouveau": "Fast",
        "Inkbrush": "Fast",
        "Inkbrush Nouveau": "Fast",
        "Luna Blaster": "Fast",
        "Luna Blaster Neo": "Fast",
        "N-ZAP '85": "Fast",
        "N-ZAP '89": "Fast",
        "REEF-LUX 450": "Fast",
        "REEF-LUX 450 Deco": "Fast",
        "Splash-o-matic": "Fast",
        "Neo Splash-o-matic": "Fast",
        "Splatana Wiper": "Fast",
        "Splatana Wiper Deco": "Fast",
        "Splattershot Jr.": "Fast",
        "Custom Splattershot Jr.": "Fast",
        "Sploosh-o-matic": "Fast",
        "Neo Sploosh-o-matic": "Fast",
        "Tri-Slosher": "Fast",
        "Tri-Slosher Nouveau": "Fast",
        "Undercover Brella": "Fast",
        "Undercover Sorella Brella": "Fast",

        # All other weapons are Normal
        "_default": "Normal"
    }
}


def normalize_game_name(game_name):
    """Normalize game names to match our weight data keys"""
    if not game_name:
        return None

    game_name = game_name.strip()

    # Handle various game name formats
    if "splatoon 3" in game_name.lower():
        return "Splatoon 3"
    elif "splatoon 2" in game_name.lower():
        return "Splatoon 2"
    elif "splatoon" in game_name.lower() and "2" not in game_name and "3" not in game_name:
        return "Splatoon"

    return None


def get_weapon_weight(weapon_name, game_name):
    """Get the weight/mobility type for a weapon"""
    normalized_game = normalize_game_name(game_name)
    if not normalized_game or normalized_game not in WEAPON_WEIGHTS:
        return "Unknown"

    game_weights = WEAPON_WEIGHTS[normalized_game]

    # Check for exact match first
    if weapon_name in game_weights:
        return game_weights[weapon_name]

    # Check for partial matches (for variant weapons)
    base_name = weapon_name

    # Remove common suffixes to find base weapon
    suffixes_to_remove = [
        " Replica", " Hero Shot Replica", " Octo Shot Replica", " Order Shot Replica",
        " Nouveau", " Deco", " Neo", " Custom", " Kensa", " Vanilla", " Cherry",
        " Sorella", " Camo", " Clear", " Permanent", " Tempered", " Gold",
        " '85", " '89", " '83", " PG", " RG", " MG", " 7",
        " Mk I", " Mk II", " Mk III", " 14", " 3K", " 4K", " Scope",
        " V", " 450"
    ]

    for suffix in suffixes_to_remove:
        if base_name.endswith(suffix):
            base_name = base_name[:-len(suffix)].strip()
            break

    # Check if base name matches
    if base_name in game_weights:
        return game_weights[base_name]

    # Try some common variations
    variations = [
        base_name.replace("-", " "),
        base_name.replace(" ", "-"),
        base_name.replace("'", ""),
    ]

    for variation in variations:
        if variation in game_weights:
            return game_weights[variation]

    # Return default weight
    return game_weights.get("_default", "Normal")


def update_weapons_json(input_file="weapons_with_images.json", output_file="weapons_with_weights.json"):
    """Update the weapons JSON file with weight data"""

    # Check if input file exists
    if not Path(input_file).exists():
        print(f"❌ Input file {input_file} not found!")
        return False

    try:
        # Load the weapons data
        with open(input_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        if "weapons" not in data:
            print("❌ Invalid JSON structure. Expected 'weapons' key.")
            return False

        weapons = data["weapons"]
        updated_count = 0

        print(f"🔧 Processing {len(weapons)} weapons...")

        # Update each weapon
        for weapon in weapons:
            old_weight = weapon.get("weight", "")
            weapon_name = weapon.get("name", "")
            game_name = weapon.get("game", "")

            # Get the new weight
            new_weight = get_weapon_weight(weapon_name, game_name)

            # Update if different
            if old_weight != new_weight:
                weapon["weight"] = new_weight
                updated_count += 1
                print(
                    f"✅ Updated {weapon_name} ({game_name}): '{old_weight}' → '{new_weight}'")

        # Save the updated data
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"\n🎉 Successfully updated {updated_count} weapons!")
        print(f"💾 Saved to {output_file}")

        # Print summary statistics
        weight_counts = {}
        for weapon in weapons:
            weight = weapon.get("weight", "Unknown")
            weight_counts[weight] = weight_counts.get(weight, 0) + 1

        print("\n📊 Weight distribution:")
        for weight, count in sorted(weight_counts.items()):
            print(f"  {weight}: {count} weapons")

        return True

    except json.JSONDecodeError as e:
        print(f"❌ Error parsing JSON: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    print("🎮 Splatoon Weapon Weight Updater")
    print("=" * 40)

    # Run the update
    success = update_weapons_json()

    if success:
        print("\n✨ Update completed successfully!")
    else:
        print("\n💥 Update failed!")


if __name__ == "__main__":
    main()
