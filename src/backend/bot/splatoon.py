"""Splatoon game commands for the Discord bot.

Provides commands related to Splatoon games including random weapon
generation and other Splatoon-related utilities.
"""
import aiohttp
import difflib
import json
import logging
import os
import random
import re
from typing import Optional
from urllib.parse import urljoin, quote

import interactions
from interactions import slash_command, slash_option, OptionType, SlashCommandChoice
from interactions.api.events import Startup
from backend.util import global_config

logger = logging.getLogger("OCE-4Mans")


class Splatoon(interactions.Extension):
    """Splatoon commands extension.

    Provides Splatoon-related commands including random weapon generation.
    Weapons are loaded once at startup for performance optimization.

    Attributes:
        bot: The Discord bot client instance.
        weapons: List of all weapons loaded from weapons.json.
    """

    def __init__(self, bot: interactions.Client) -> None:
        """Initialize the Splatoon extension.

        Args:
            bot: The Discord bot client instance.
        """
        self.bot = bot
        self.weapons: list[dict] = []
        self.weapon_names: list[str] = []

    @interactions.listen(Startup)
    async def load_weapons(self) -> None:
        """Load weapons from JSON file on startup.

        This runs once when the bot starts to avoid reading the file
        every time the command is called.
        """
        try:
            weapons_file = os.path.join(os.getcwd(), "src", "backend", "resources", "weapons.json")
            with open(weapons_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.weapons = data["weapons"]
                # Create a unique list of weapon names for fuzzy matching
                self.weapon_names = list(set([w["name"] for w in self.weapons]))
            logger.info(f"Loaded {len(self.weapons)} weapons from weapons.json")
        except FileNotFoundError:
            logger.error("weapons.json not found!")
            self.weapons = []
            self.weapon_names = []
        except Exception as e:
            logger.error(f"Error loading weapons: {e}")
            self.weapons = []
            self.weapon_names = []

    @slash_command(
        name="random-weapon",
        description="Generate random weapon(s) from Splatoon"
    )
    @slash_option(
        name="preset",
        description="Quick preset for common scenarios (overrides count)",
        required=False,
        opt_type=OptionType.STRING,
        choices=[
            SlashCommandChoice(name="Team (4 weapons)", value="team"),
            SlashCommandChoice(name="Match (2 teams of 4)", value="match")
        ]
    )
    @slash_option(
        name="game",
        description="Which game to select from (default: Splatoon 3)",
        required=False,
        opt_type=OptionType.STRING,
        choices=[
            SlashCommandChoice(name="Splatoon 3", value="splatoon3"),
            SlashCommandChoice(name="Splatoon 2", value="splatoon2"),
            SlashCommandChoice(name="Splatoon", value="splatoon"),
            SlashCommandChoice(name="All Games", value="all")
        ]
    )
    @slash_option(
        name="include_grizzco",
        description="Include Grizzco weapons (default: False)",
        required=False,
        opt_type=OptionType.BOOLEAN
    )
    @slash_option(
        name="count",
        description="Number of weapons to generate (default: 1, max: 10)",
        required=False,
        opt_type=OptionType.INTEGER,
        min_value=1,
        max_value=10
    )
    @slash_option(
        name="allow_duplicates",
        description="Allow duplicate weapons in results (default: True)",
        required=False,
        opt_type=OptionType.BOOLEAN
    )
    async def random_weapon(self, ctx: interactions.SlashContext, preset: str = None, game: str = "splatoon3", include_grizzco: bool = False, count: int = 1, allow_duplicates: bool = True) -> None:
        """Generate random weapon(s) from Splatoon.

        Selects random weapon(s) from the specified game(s) with options to
        include or exclude Grizzco weapons. Can generate unique or allow duplicate weapons.

        Args:
            ctx: The slash command context.
            preset: Quick preset (team or match) that overrides count.
            game: Which game to select from (splatoon, splatoon2, splatoon3, all).
            include_grizzco: Whether to include Grizzco weapons.
            count: Number of weapons to generate (1-10).
            allow_duplicates: Whether to allow duplicate weapons in the results.
        """
        await ctx.defer()

        try:
            if not self.weapons:
                await ctx.send("❌ Weapons database not loaded. Please contact an administrator.")
                return

            # Handle preset overrides
            is_match_mode = False
            if preset == "team":
                count = 4
            elif preset == "match":
                count = 8
                is_match_mode = True

            # Filter weapons based on game selection
            if game == "all":
                filtered_weapons = self.weapons
            else:
                game_map = {
                    "splatoon": "Splatoon",
                    "splatoon2": "Splatoon 2",
                    "splatoon3": "Splatoon 3"
                }
                game_name = game_map.get(game, "Splatoon 3")
                filtered_weapons = [w for w in self.weapons if w["game"] == game_name]

            # Filter out Grizzco weapons if not included
            if not include_grizzco:
                filtered_weapons = [w for w in filtered_weapons if not w["name"].startswith("Grizzco")]

            if not filtered_weapons:
                await ctx.send("❌ No weapons found with the selected filters.")
                return

            # Select random weapons based on allow_duplicates setting
            if allow_duplicates:
                # Allow duplicates - use random.choice multiple times
                selected_weapons = [random.choice(filtered_weapons) for _ in range(count)]
                actual_count = count
            else:
                # No duplicates - use random.sample (adjust if count exceeds available weapons)
                actual_count = min(count, len(filtered_weapons))
                if actual_count < count:
                    logger.warning(f"Requested {count} unique weapons but only {actual_count} available")
                    await ctx.send(f"ℹ️ Only {actual_count} unique weapons available with these filters.", ephemeral=True)
                selected_weapons = random.sample(filtered_weapons, actual_count)

            # Display format depends on count
            if actual_count == 1:
                # Single weapon - use detailed format with image
                selected_weapon = selected_weapons[0]
                embed = interactions.Embed(
                    title=f"🎲 Random Weapon: {selected_weapon['name']}",
                    color=global_config.theme_colour
                )

                # Add sub and special weapons
                if selected_weapon.get("sub") and selected_weapon["sub"] != "N/A":
                    embed.add_field(name="Sub Weapon", value=selected_weapon["sub"], inline=True)

                if selected_weapon.get("special") and selected_weapon["special"] != "N/A":
                    embed.add_field(name="Special", value=selected_weapon["special"], inline=True)

                # Add image if available
                if selected_weapon.get("image"):
                    image_url = urljoin("https://sneakyofficial.com/images/", quote(selected_weapon["image"]))
                    embed.set_image(image_url)

                await ctx.send(embed=embed)
            elif is_match_mode:
                # Match mode - split into 2 teams of 4
                embed = interactions.Embed(
                    title="🎲 Match Setup",
                    description="Random weapons generated for both teams",
                    color=global_config.theme_colour
                )

                # Split weapons into two teams
                team1_weapons = selected_weapons[:4]
                team2_weapons = selected_weapons[4:8]

                # Format Team 1
                team1_content = []
                for i, weapon in enumerate(team1_weapons, 1):
                    weapon_text = f"**{i}.** {weapon['name']}"
                    kit_parts = []
                    if weapon.get("sub") and weapon["sub"] != "N/A":
                        kit_parts.append(f"Sub: {weapon['sub']}")
                    if weapon.get("special") and weapon["special"] != "N/A":
                        kit_parts.append(f"Special: {weapon['special']}")
                    if kit_parts:
                        weapon_text += "\n" + " │ ".join(kit_parts)
                    team1_content.append(weapon_text)

                embed.add_field(
                    name="🟦 Team 1",
                    value="\n".join(team1_content),
                    inline=False
                )

                # Format Team 2
                team2_content = []
                for i, weapon in enumerate(team2_weapons, 1):
                    weapon_text = f"**{i}.** {weapon['name']}"
                    kit_parts = []
                    if weapon.get("sub") and weapon["sub"] != "N/A":
                        kit_parts.append(f"Sub: {weapon['sub']}")
                    if weapon.get("special") and weapon["special"] != "N/A":
                        kit_parts.append(f"Special: {weapon['special']}")
                    if kit_parts:
                        weapon_text += "\n" + " │ ".join(kit_parts)
                    team2_content.append(weapon_text)

                embed.add_field(
                    name="🟧 Team 2",
                    value="\n".join(team2_content),
                    inline=False
                )

                # Add footer
                if allow_duplicates:
                    embed.set_footer(text="Duplicates allowed • Use allow_duplicates:False for unique weapons only")
                else:
                    embed.set_footer(text="All weapons are unique")

                await ctx.send(embed=embed)
            else:
                # Multiple weapons - use compact list format
                embed = interactions.Embed(
                    title=f"🎲 Random Weapons × {actual_count}",
                    color=global_config.theme_colour
                )

                # Group weapons into fields (3 per field to keep it compact)
                weapons_per_field = 3
                for i in range(0, len(selected_weapons), weapons_per_field):
                    weapons_batch = selected_weapons[i:i + weapons_per_field]
                    field_content = []

                    for j, weapon in enumerate(weapons_batch):
                        weapon_num = i + j + 1
                        weapon_text = f"**{weapon_num}.** {weapon['name']}"

                        # Add kit information in compact format
                        kit_parts = []
                        if weapon.get("sub") and weapon["sub"] != "N/A":
                            kit_parts.append(f"**Sub:** {weapon['sub']}")
                        if weapon.get("special") and weapon["special"] != "N/A":
                            kit_parts.append(f"**Special:** {weapon['special']}")

                        if kit_parts:
                            weapon_text += "\n" + " │ ".join(kit_parts)

                        field_content.append(weapon_text)

                    # Determine field name based on position
                    if i == 0:
                        field_name = "Weapons"
                    else:
                        field_name = "\u200b"  # Zero-width space for continuation

                    embed.add_field(
                        name=field_name,
                        value="\n".join(field_content),
                        inline=False
                    )

                # Add footer with duplicate info if relevant
                if allow_duplicates and actual_count > 1:
                    embed.set_footer(text="Duplicates allowed • Use allow_duplicates:False for unique weapons only")
                elif not allow_duplicates:
                    embed.set_footer(text="All weapons are unique")

                await ctx.send(embed=embed)

        except Exception as e:
            logger.error(f"Error in random_weapon command: {e}")
            await ctx.send("❌ An error occurred while generating a random weapon.")

    def find_closest_weapon(self, weapon_name: str) -> Optional[str]:
        """Find the closest matching weapon name using fuzzy matching.

        Args:
            weapon_name: The weapon name to search for.

        Returns:
            The closest matching weapon name or None if no match found.
        """
        if not self.weapon_names:
            return weapon_name

        # Try exact match first (case insensitive)
        for name in self.weapon_names:
            if name.lower() == weapon_name.lower():
                return name

        # Use fuzzy matching to find closest match
        matches = difflib.get_close_matches(weapon_name, self.weapon_names, n=1, cutoff=0.6)
        return matches[0] if matches else None

    def create_wiki_embed(self, wiki_data: dict, current_game: str, matched_weapon: str) -> interactions.Embed:
        """Create a wiki embed for a specific game version.

        Args:
            wiki_data: The wiki data dictionary.
            current_game: The current game to display description for.
            matched_weapon: The matched weapon name.

        Returns:
            The formatted Discord embed.
        """
        # Get description for current game
        description = wiki_data['game_descriptions'].get(current_game, "No description available.")

        embed = interactions.Embed(
            title=f"📖 {wiki_data['name']}",
            description=description,
            color=global_config.theme_colour,
            url=wiki_data['url']
        )

        # Add game indicator if multiple games
        if len(wiki_data['game_descriptions']) > 1:
            embed.set_author(name=f"Viewing: {current_game}")

        # Prefer the kit for the game being viewed, falling back to the newest one
        kit = wiki_data.get('game_kits', {}).get(current_game, {})
        sub_weapon = kit.get('sub_weapon', wiki_data['sub_weapon'])
        special_weapon = kit.get('special_weapon', wiki_data['special_weapon'])
        stats = kit.get('stats', wiki_data['stats'])

        # Add kit information
        if sub_weapon:
            embed.add_field(
                name="Sub Weapon",
                value=sub_weapon,
                inline=True
            )

        if special_weapon:
            embed.add_field(
                name="Special Weapon",
                value=special_weapon,
                inline=True
            )

        # Add stats
        if stats:
            stats_text = "\n".join([f"**{key}:** {value}" for key, value in stats.items()])
            embed.add_field(
                name="Stats",
                value=stats_text if stats_text else "No stats available",
                inline=False
            )

        # Add variants with clickable links (limit to 10 to avoid embed limits)
        if wiki_data['variants']:
            # Limit to first 10 variants to avoid hitting Discord's field value limit
            variants_to_show = wiki_data['variants'][:10]
            variants_text = "\n".join([f"• [{var['name']}]({var['url']})" for var in variants_to_show])

            if len(wiki_data['variants']) > 10:
                variants_text += f"\n*...and {len(wiki_data['variants']) - 10} more*"

            embed.add_field(
                name=f"Variants ({len(wiki_data['variants'])})",
                value=variants_text if variants_text else "No variants found",
                inline=False
            )

        # Add weapon image (prefer image from current game being viewed)
        weapon_image = self.get_weapon_image(matched_weapon, current_game)
        if weapon_image:
            image_url = urljoin("https://sneakyofficial.com/images/", quote(weapon_image))
            embed.set_image(image_url)

        # Add footer with link
        embed.set_footer(text="Click variant names to view their wiki pages")

        return embed

    def get_weapon_image(self, weapon_name: str, preferred_game: str = "Splatoon 3") -> Optional[str]:
        """Get the image filename for a weapon.

        Args:
            weapon_name: The name of the weapon.
            preferred_game: The game to prefer when selecting the image (e.g., "Splatoon 3", "Splatoon 2", "Splatoon").

        Returns:
            The image filename or None if not found.
        """
        # Find the weapon image, preferring the specified game version
        preferred_image = None
        any_image = None

        for weapon in self.weapons:
            if weapon["name"] == weapon_name and weapon.get("image"):
                any_image = weapon["image"]
                if weapon.get("game") == preferred_game:
                    preferred_image = weapon["image"]
                    break

        result = preferred_image or any_image
        if result:
            logger.info(f"Found image for {weapon_name} (preferred game: {preferred_game}): {result}")
        else:
            logger.warning(f"No image found for {weapon_name}")
        return result

    @staticmethod
    def clean_wiki_value(value: str) -> str:
        """Turn a raw infobox wikitext value into plain readable text.

        Args:
            value: The raw value from an infobox parameter.

        Returns:
            The value with wiki markup removed, or an empty string.
        """
        # Split on line breaks first so entries stay separable
        parts = re.split(r'<br\s*/?>', value)
        cleaned_parts = []

        for part in parts:
            # Drop entries that are only there for their icon (Salmon Run rows)
            if re.search(r'\[\[File:', part, re.IGNORECASE):
                continue

            # [[Page|Label]] -> Label, [[Page]] -> Page
            part = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]|]+)\]\]', r'\1', part)
            # Drop templates and any remaining markup
            part = re.sub(r'\{\{[^{}]*\}\}', '', part)
            part = re.sub(r'<ref[^>]*>.*?</ref>', '', part, flags=re.DOTALL)
            part = re.sub(r'<[^>]+>', '', part)
            part = re.sub(r"'{2,}", '', part)
            part = re.sub(r'\s+', ' ', part).strip()

            if part:
                cleaned_parts.append(part)

        return ", ".join(cleaned_parts)

    @classmethod
    def parse_weapon_infoboxes(cls, wikitext: str) -> dict:
        """Extract per-game kit and stat data from a weapon page's wikitext.

        Args:
            wikitext: The raw wikitext of the weapon page.

        Returns:
            Mapping of game name to its kit and stats, e.g.
            {'Splatoon 3': {'sub_weapon': ..., 'special_weapon': ..., 'stats': {...}}}.
        """
        # Stat parameters to surface, in display order
        stat_fields = [
            ('base', 'Damage'),
            ('range', 'Range'),
            ('impact', 'Impact'),
            ('fire_rate', 'Fire Rate'),
            ('ink', 'Ink Consumption'),
        ]

        game_kits = {}

        for infobox_match in re.finditer(r'\{\{Infobox/Weapon\b(.*?)\n\}\}', wikitext, re.DOTALL | re.IGNORECASE):
            params = {}

            for line in infobox_match.group(1).split('\n|'):
                if '=' not in line:
                    continue
                key, raw_value = line.split('=', 1)
                params[key.strip().lower()] = raw_value.strip()

            game = cls.clean_wiki_value(params.get('game', ''))
            if not game:
                continue

            stats = {}
            for param, label in stat_fields:
                value = cls.clean_wiki_value(params.get(param, ''))
                if value:
                    stats[label] = value

            game_kits[game] = {
                'sub_weapon': cls.clean_wiki_value(params.get('sub', '')) or None,
                'special_weapon': cls.clean_wiki_value(params.get('special', '')) or None,
                'stats': stats,
            }

        return game_kits

    async def fetch_wiki_data(self, weapon_name: str) -> Optional[dict]:
        """Fetch weapon data from Splatoon Wiki.

        Args:
            weapon_name: The name of the weapon to look up.

        Returns:
            Dictionary containing weapon data or None if not found.
        """
        # Format the weapon name for the URL (replace spaces with underscores)
        formatted_name = weapon_name.replace(" ", "_")
        wiki_url = f"https://splatoonwiki.org/wiki/{quote(formatted_name)}"

        # The article URLs sit behind a bot challenge, so read the rendered
        # article HTML through the MediaWiki API instead.
        api_url = "https://splatoonwiki.org/w/api.php"
        api_params = {
            "action": "parse",
            "page": formatted_name,
            "prop": "text|wikitext",
            "redirects": "1",
            "format": "json",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(api_url, params=api_params) as response:
                    if response.status != 200:
                        logger.warning(f"Wiki request failed for {weapon_name} (HTTP {response.status})")
                        return None

                    payload = await response.json(content_type=None)

                    if "error" in payload:
                        logger.warning(f"Wiki page not found for {weapon_name}: {payload['error'].get('code')}")
                        return None

                    html = payload.get("parse", {}).get("text", {}).get("*")

                    if not html:
                        logger.warning(f"Wiki page returned no content for {weapon_name}")
                        return None

                    # Extract game-specific descriptions
                    game_descriptions = {}

                    # Look for game sections - they're organized as <h2> headings with id/span
                    # Multiple patterns to catch different wiki formatting
                    game_section_ids = [
                        ('Splatoon', ['Splatoon', 'In_Splatoon']),
                        ('Splatoon 2', ['Splatoon_2', 'In_Splatoon_2']),
                        ('Splatoon 3', ['Splatoon_3', 'In_Splatoon_3']),
                    ]

                    for game, possible_ids in game_section_ids:
                        for section_id in possible_ids:
                            # Look for section with this ID
                            pattern = rf'<span[^>]*(?:id|name)="{section_id}"[^>]*>.*?</span>.*?</h\d>(.*?)(?=<h2|<h3|<div class="printfooter"|$)'
                            match = re.search(pattern, html, re.DOTALL | re.IGNORECASE)

                            if match:
                                section_content = match.group(1)
                                # Extract first non-empty paragraph from this section
                                paras = re.findall(r'<p[^>]*>(.*?)</p>', section_content, re.DOTALL)

                                for para in paras:
                                    desc_text = re.sub(r'<[^>]+>', '', para)
                                    desc_text = re.sub(r'\s+', ' ', desc_text).strip()
                                    desc_text = re.sub(r'\[\d+\]', '', desc_text)  # Remove references

                                    # Skip very short paragraphs or navigation text
                                    if len(desc_text) > 30 and 'main article' not in desc_text.lower():
                                        game_descriptions[game] = desc_text[:500] + ("..." if len(desc_text) > 500 else "")
                                        logger.info(f"Found {game} description: {desc_text[:100]}...")
                                        break

                                if game in game_descriptions:
                                    break  # Found description for this game, move to next

                    # Fallback to first paragraph if no game-specific descriptions found
                    if not game_descriptions:
                        logger.warning(f"No game-specific descriptions found for {weapon_name}, using general description")
                        description_match = re.search(r'<p[^>]*>(.*?)</p>', html, re.DOTALL)
                        if description_match:
                            desc_text = description_match.group(1)
                            desc_text = re.sub(r'<[^>]+>', '', desc_text)
                            desc_text = re.sub(r'\s+', ' ', desc_text).strip()
                            desc_text = re.sub(r'\[\d+\]', '', desc_text)
                            if len(desc_text) > 20:
                                game_descriptions['General'] = desc_text[:500] + ("..." if len(desc_text) > 500 else "")

                    # Extract variants from "Other variants" rows
                    variants = []

                    # Look for "Other variants" rows directly in the HTML
                    # Pattern: <td>...<b>Other variants</b>...</td> followed by <td> with links
                    # The wiki uses <td><b>Other variants</b></td> format in table rows
                    variant_row_pattern = r'<(?:th|td)[^>]*>\s*(?:<b>\s*)?(?:Other )?[Vv]ariants?\s*(?:</b>\s*)?</(?:th|td)>\s*<td[^>]*>(.*?)</td>'

                    # Find all variant rows (there might be multiple for different games)
                    for variant_row_match in re.finditer(variant_row_pattern, html, re.DOTALL | re.IGNORECASE):
                        variants_content = variant_row_match.group(1)

                        # Extract all weapon links from this cell
                        # Find all <a> tags and extract href and title more flexibly
                        link_pattern = r'<a\s+([^>]*)>([^<]*)</a>'
                        for link_match in re.finditer(link_pattern, variants_content):
                            attrs = link_match.group(1)

                            # Extract href and title from attributes
                            href_match = re.search(r'href="/wiki/([^"#]+)"', attrs)
                            title_match = re.search(r'title="([^"]+)"', attrs)

                            if not href_match or not title_match:
                                continue

                            url_part = href_match.group(1)
                            title = title_match.group(1)

                            # Exclude non-weapon pages (files, categories, etc.)
                            if any(exclude in url_part.lower() for exclude in ['file:', 'category:', 'template:', 'user:', 'talk:', 'special:']):
                                continue

                            if any(exclude in title.lower() for exclude in ['category', 'template', 'user:', 'talk:', 'special:']):
                                continue

                            # Add the variant (avoid duplicates)
                            if title not in [v['name'] for v in variants]:
                                variants.append({
                                    'name': title,
                                    'url': f"https://splatoonwiki.org/wiki/{url_part}"
                                })

                    # Always include the current weapon as a variant
                    if weapon_name not in [v['name'] for v in variants]:
                        variants.insert(0, {
                            'name': weapon_name,
                            'url': wiki_url
                        })

                    logger.info(f"Found {len(variants)} variants for {weapon_name}: {[v['name'] for v in variants]}")

                    # The rendered infobox is built client side, so kit and stat
                    # values are only available from the page source.
                    wikitext = payload.get("parse", {}).get("wikitext", {}).get("*", "")
                    game_kits = self.parse_weapon_infoboxes(wikitext)

                    if not game_kits:
                        logger.warning(f"No weapon infobox found for {weapon_name}")

                    # Fall back to the newest game's kit for callers that want a
                    # single set of values.
                    latest_kit = {}
                    for game in ('Splatoon 3', 'Splatoon 2', 'Splatoon'):
                        if game in game_kits:
                            latest_kit = game_kits[game]
                            break

                    return {
                        'name': weapon_name,
                        'game_descriptions': game_descriptions,
                        'variants': variants,
                        'game_kits': game_kits,
                        'stats': latest_kit.get('stats', {}),
                        'sub_weapon': latest_kit.get('sub_weapon'),
                        'special_weapon': latest_kit.get('special_weapon'),
                        'url': wiki_url
                    }

        except Exception as e:
            logger.error(f"Error fetching wiki data for {weapon_name}: {e}")
            return None

    @slash_command(
        name="wiki",
        description="Look up weapon information from Splatoon Wiki"
    )
    @slash_option(
        name="weapon",
        description="Name of the weapon to look up (e.g., Range Blaster)",
        required=True,
        opt_type=OptionType.STRING
    )
    async def wiki(self, ctx: interactions.SlashContext, weapon: str) -> None:
        """Look up weapon information from Splatoon Wiki.

        Fetches and displays weapon description, stats, variations, and kit
        information in a formatted embed with a link to the wiki page.

        Args:
            ctx: The slash command context.
            weapon: The name of the weapon to look up.
        """
        await ctx.defer()

        try:
            # Use fuzzy matching to find closest weapon name
            matched_weapon = self.find_closest_weapon(weapon)

            if not matched_weapon:
                await ctx.send(f"❌ Could not find a weapon matching '{weapon}'. Please check the weapon name and try again.")
                return

            # Notify user if we matched a different weapon name
            if matched_weapon.lower() != weapon.lower():
                await ctx.send(f"ℹ️ Searching for closest match: **{matched_weapon}**")

            # Fetch data from wiki
            wiki_data = await self.fetch_wiki_data(matched_weapon)

            if not wiki_data:
                await ctx.send(f"❌ Could not find information for '{matched_weapon}' on Splatoon Wiki.")
                return

            # Store wiki data for button callbacks
            if not hasattr(self, '_wiki_cache'):
                self._wiki_cache = {}
            cache_key = f"{ctx.author.id}_{matched_weapon}"
            self._wiki_cache[cache_key] = wiki_data

            # Create initial embed with first available game description (in order)
            available_games = list(wiki_data['game_descriptions'].keys())
            # Use games in proper order: Splatoon -> Splatoon 2 -> Splatoon 3 -> General
            game_order = ['Splatoon', 'Splatoon 2', 'Splatoon 3', 'General']
            current_game = next((g for g in game_order if g in available_games), available_games[0] if available_games else 'General')

            embed = self.create_wiki_embed(wiki_data, current_game, matched_weapon)

            # Create components (buttons + select menu)
            components = []

            # Add game switching buttons if multiple games available
            if len(available_games) > 1:
                buttons = []
                for game in ['Splatoon', 'Splatoon 2', 'Splatoon 3']:
                    if game in wiki_data['game_descriptions']:
                        button = interactions.Button(
                            style=interactions.ButtonStyle.PRIMARY if game == current_game else interactions.ButtonStyle.SECONDARY,
                            label=game,
                            custom_id=f"wiki_game_{game.replace(' ', '_')}_{cache_key}"
                        )
                        buttons.append(button)
                if buttons:
                    components.append(interactions.ActionRow(*buttons))

            # Add variant selector if there are variants
            if wiki_data['variants'] and len(wiki_data['variants']) > 1:
                # Create select menu options (max 25 options)
                options = []
                for i, variant in enumerate(wiki_data['variants'][:25]):
                    # Mark current weapon as default
                    is_current = variant['name'].lower() == matched_weapon.lower()
                    options.append(
                        interactions.StringSelectOption(
                            label=variant['name'][:100],  # Discord limit
                            value=f"{i}",
                            description=f"View {variant['name'][:50]}" if not is_current else "Currently viewing",
                            default=is_current
                        )
                    )

                select_menu = interactions.StringSelectMenu(
                    *options,
                    placeholder="Select a variant to view...",
                    custom_id=f"wiki_variant_{cache_key}"
                )
                components.append(interactions.ActionRow(select_menu))

            await ctx.send(embed=embed, components=components)

        except Exception as e:
            logger.error(f"Error in wiki command: {e}")
            await ctx.send("❌ An error occurred while fetching weapon information.")

    @interactions.component_callback(re.compile(r"wiki_game_.*"))
    async def on_game_button(self, ctx: interactions.ComponentContext):
        """Handle game switching button clicks."""
        try:
            # Parse custom_id to get game and cache key
            custom_id = ctx.custom_id

            # Remove "wiki_game_" prefix
            remaining = custom_id[len("wiki_game_"):]

            # Try to match known games (check longer names first to avoid partial matches)
            game = None
            cache_key = None

            for game_name in ['Splatoon_3', 'Splatoon_2', 'Splatoon']:
                if remaining.startswith(game_name + '_'):
                    game = game_name.replace('_', ' ')
                    cache_key = remaining[len(game_name) + 1:]  # +1 for the underscore
                    break

            if not game or not cache_key:
                await ctx.send("❌ Invalid button interaction", ephemeral=True)
                return

            # Get cached wiki data
            if not hasattr(self, '_wiki_cache') or cache_key not in self._wiki_cache:
                await ctx.send("❌ Wiki data expired. Please run the command again.", ephemeral=True)
                return

            wiki_data = self._wiki_cache[cache_key]
            matched_weapon = wiki_data['name']

            # Create new embed with selected game
            embed = self.create_wiki_embed(wiki_data, game, matched_weapon)

            # Rebuild components
            components = []

            # Update button styles to highlight selected game
            buttons = []
            available_games = list(wiki_data['game_descriptions'].keys())
            for g in ['Splatoon', 'Splatoon 2', 'Splatoon 3']:
                if g in available_games:
                    button = interactions.Button(
                        style=interactions.ButtonStyle.PRIMARY if g == game else interactions.ButtonStyle.SECONDARY,
                        label=g,
                        custom_id=f"wiki_game_{g.replace(' ', '_')}_{cache_key}"
                    )
                    buttons.append(button)

            if buttons:
                components.append(interactions.ActionRow(*buttons))

            # Re-add variant selector
            if wiki_data['variants'] and len(wiki_data['variants']) > 1:
                options = []
                for i, variant in enumerate(wiki_data['variants'][:25]):
                    is_current = variant['name'].lower() == matched_weapon.lower()
                    options.append(
                        interactions.StringSelectOption(
                            label=variant['name'][:100],
                            value=f"{i}",
                            description=f"View {variant['name'][:50]}" if not is_current else "Currently viewing",
                            default=is_current
                        )
                    )
                select_menu = interactions.StringSelectMenu(
                    *options,
                    placeholder="Select a variant to view...",
                    custom_id=f"wiki_variant_{cache_key}"
                )
                components.append(interactions.ActionRow(select_menu))

            await ctx.edit_origin(embed=embed, components=components)

        except Exception as e:
            logger.error(f"Error in game button callback: {e}")
            await ctx.send("❌ An error occurred while switching games.", ephemeral=True)

    @interactions.component_callback(re.compile(r"wiki_variant_.*"))
    async def on_variant_select(self, ctx: interactions.ComponentContext):
        """Handle variant selection from dropdown."""
        try:
            await ctx.defer(edit_origin=True)

            # Get the selected variant index
            selected_index = int(ctx.values[0])

            # Parse cache key from custom_id
            cache_key_parts = ctx.custom_id.split('_', 2)  # wiki_variant_<cache_key>
            if len(cache_key_parts) < 3:
                await ctx.send("❌ Invalid selection", ephemeral=True)
                return

            old_cache_key = cache_key_parts[2]

            # Get original wiki data
            if not hasattr(self, '_wiki_cache') or old_cache_key not in self._wiki_cache:
                await ctx.send("❌ Wiki data expired. Please run the command again.", ephemeral=True)
                return

            old_wiki_data = self._wiki_cache[old_cache_key]
            selected_variant = old_wiki_data['variants'][selected_index]
            variant_name = selected_variant['name']

            # Fetch wiki data for the selected variant
            new_wiki_data = await self.fetch_wiki_data(variant_name)

            if not new_wiki_data:
                await ctx.send(f"❌ Could not fetch data for {variant_name}", ephemeral=True)
                return

            # Create new cache key for this variant
            new_cache_key = f"{ctx.author.id}_{variant_name}"
            self._wiki_cache[new_cache_key] = new_wiki_data

            # Create embed with first available game
            available_games = list(new_wiki_data['game_descriptions'].keys())
            current_game = available_games[0] if available_games else 'General'
            embed = self.create_wiki_embed(new_wiki_data, current_game, variant_name)

            # Rebuild components
            components = []

            # Add game buttons
            if len(available_games) > 1:
                buttons = []
                for game in ['Splatoon', 'Splatoon 2', 'Splatoon 3']:
                    if game in new_wiki_data['game_descriptions']:
                        button = interactions.Button(
                            style=interactions.ButtonStyle.PRIMARY if game == current_game else interactions.ButtonStyle.SECONDARY,
                            label=game,
                            custom_id=f"wiki_game_{game.replace(' ', '_')}_{new_cache_key}"
                        )
                        buttons.append(button)
                if buttons:
                    components.append(interactions.ActionRow(*buttons))

            # Add variant selector with updated selection
            if new_wiki_data['variants'] and len(new_wiki_data['variants']) > 1:
                options = []
                for i, variant in enumerate(new_wiki_data['variants'][:25]):
                    is_current = variant['name'].lower() == variant_name.lower()
                    options.append(
                        interactions.StringSelectOption(
                            label=variant['name'][:100],
                            value=f"{i}",
                            description=f"View {variant['name'][:50]}" if not is_current else "Currently viewing",
                            default=is_current
                        )
                    )
                select_menu = interactions.StringSelectMenu(
                    *options,
                    placeholder="Select a variant to view...",
                    custom_id=f"wiki_variant_{new_cache_key}"
                )
                components.append(interactions.ActionRow(select_menu))

            await ctx.edit_origin(embed=embed, components=components)

        except Exception as e:
            logger.error(f"Error in variant select callback: {e}")
            await ctx.send("❌ An error occurred while switching variants.", ephemeral=True)


def setup(bot: interactions.Client) -> None:
    """Set up the Splatoon extension for the bot.

    Args:
        bot: The Discord bot client instance.
    """
    Splatoon(bot)
