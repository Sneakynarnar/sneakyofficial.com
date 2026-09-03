/**
 * Canvas rendering for Splatoon Bingo cards.
 *
 * The card is drawn in the game's own idiom: neon ink in Splatoon 3's palette
 * splattered under and around the grid, with the squares sitting on top like
 * turf that has just been rolled over. Every mark is drawn rather than loaded,
 * so there is no artwork to ship and nothing of Nintendo's is redistributed.
 *
 * A download is rendered at print resolution; a preview is rendered at the size
 * it is shown, since a browser shrinking a huge canvas into a small box is what
 * makes text look chewed.
 */

export interface BingoCell {
  id: number | null;
  text: string;
  display_name: string | null;
  free: boolean;
}

export interface CardTheme {
  id: string;
  label: string;
  background: string;
  /** The tile a square's text sits on. */
  cell: string;
  text: string;
  muted: string;
  /** Fill and outline for the header and the free square's lettering. */
  headerText: string;
  headerOutline: string;
}

// The theme is the paper the ink lands on; the inks themselves come from the
// pairing chosen in INK_PAIRS, so any pairing works on either paper.
export const CARD_THEMES: CardTheme[] = [
  {
    id: "night",
    label: "Night",
    background: "#121026",
    cell: "#1d1a38",
    text: "#f7f5ff",
    muted: "#9b95c4",
    headerText: "#121026",
    headerOutline: "#f7f5ff",
  },
  {
    id: "paper",
    label: "Paper (for printing)",
    background: "#fbfbf4",
    cell: "#ffffff",
    text: "#141327",
    muted: "#6b6a85",
    headerText: "#ffffff",
    headerOutline: "#141327",
  },
];

// Everything below is in layout pixels. A download is backed at EXPORT_SCALE
// times that so it holds up blown up on a stream or printed; a preview is
// backed at the screen's own density instead.
const EXPORT_SCALE = 4;

// Browsers refuse to allocate a canvas past a certain size, and a refusal is
// silent: the canvas comes back blank. A 5x5 at four times size is about 48
// megapixels, so the cap only bites on the largest grids, which fall back to
// whatever multiple does fit.
const MAX_EXPORT_PIXELS = 60_000_000;
const MAX_EXPORT_DIMENSION = 12_000;

/** The largest whole-ish multiple of the layout size a browser will allocate. */
function exportScale(width: number, height: number): number {
  return Math.min(
    EXPORT_SCALE,
    Math.sqrt(MAX_EXPORT_PIXELS / (width * height)),
    MAX_EXPORT_DIMENSION / Math.max(width, height),
  );
}

const CELL_SIZE = 300;
const PADDING = 56;
const HEADER_HEIGHT = 190;
const FOOTER_HEIGHT = 70;
const CELL_PADDING = 22;
// How far the tile sits inside its square, leaving a rim of ink on show.
const TILE_INSET = 15;
const TAU = Math.PI * 2;

// Titan One is the closest free stand-in for Splatoon's fat brush lettering,
// with Fredoka carrying the squares, because a whole sentence set in a display
// face is unreadable at square size. Both are fetched by ensureCardFonts.
const DISPLAY_FONT =
  '"Titan One", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
const BODY_FONT =
  '"Fredoka", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Wait for the card's webfonts, so the first draw is not laid out in Arial.
 *
 * Wrapping is measured against whatever font the canvas has at the time, so a
 * draw that starts before the fonts arrive gets its line breaks wrong as well
 * as its shapes. Failures are swallowed: the fallback stack still renders.
 */
export async function ensureCardFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('400 76px "Titan One"'),
      document.fonts.load('600 34px "Fredoka"'),
      document.fonts.load('500 21px "Fredoka"'),
    ]);
  } catch {
    /* The fallback stack still renders. */
  }
}

/* ------------------------------------------------------------------ */
/*  Ink                                                                */
/* ------------------------------------------------------------------ */

/**
 * A tiny deterministic generator, so a card splatters the same way every time.
 *
 * The preview and the download are two separate renders; without a fixed seed
 * they would disagree, and every redraw would shuffle the ink about.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn a string into a seed, so each square splatters to suit its own text. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

interface SplatOptions {
  /** How many lobes ring the body of the splat. */
  points?: number;
  /** How far those lobes stray from the radius, 0 to 1. */
  wobble?: number;
  /** Flying droplets thrown clear of the splat. */
  droplets?: number;
  /** Curling arms of ink flung off the body. */
  arms?: number;
  /** Squash, for ink that hit at an angle. */
  squash?: number;
  rotation?: number;
}

/**
 * Trace one ink splat: a round body, fat lobes bulging off it, a couple of
 * arms curling away and some droplets thrown clear.
 *
 * The whole thing is one path filled in a single pass. Circles laid over each
 * other in the same winding direction merge into one outline, which is what
 * gives the curling, bulbous edge the game's ink has, and it means the shape
 * can be painted at less than full opacity without seams showing where the
 * pieces overlap. Drawing the outline point by point instead gives you
 * triangular spikes, which is what ink emphatically does not look like.
 */
function splat(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  rng: () => number,
  options: SplatOptions = {},
): void {
  const {
    points = 7, wobble = 0.4, droplets = 3, arms = 2,
    squash = 1, rotation = rng() * TAU,
  } = options;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(1, squash);
  ctx.beginPath();

  const blob = (x: number, y: number, r: number) => {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  };

  // The body, then lobes bulging out of it at uneven angles.
  blob(0, 0, radius * 0.62);
  const step = TAU / points;
  for (let i = 0; i < points; i += 1) {
    const angle = i * step + (rng() - 0.5) * step * 0.8;
    const reach = radius * (0.42 + rng() * wobble);
    blob(Math.cos(angle) * reach, Math.sin(angle) * reach,
         radius * (0.3 + rng() * 0.22));
  }

  // Arms: a chain of shrinking blobs walking outwards while it turns, which is
  // what makes the ink curl rather than point.
  for (let i = 0; i < arms; i += 1) {
    let angle = rng() * TAU;
    const turn = (rng() - 0.5) * 0.9;
    let distance = radius * 0.6;
    let size = radius * (0.2 + rng() * 0.12);
    const links = 3 + Math.floor(rng() * 3);
    for (let link = 0; link < links; link += 1) {
      distance += size * 1.35;
      angle += turn;
      size *= 0.72 + rng() * 0.12;
      blob(Math.cos(angle) * distance, Math.sin(angle) * distance, size);
    }
  }

  // Droplets are stretched along the line they flew out on, so they read as
  // thrown ink rather than as spots.
  for (let i = 0; i < droplets; i += 1) {
    const angle = rng() * TAU;
    const distance = radius * (1.02 + rng() * 0.55);
    const size = radius * (0.045 + rng() * 0.075);
    ctx.moveTo(Math.cos(angle) * distance + size, Math.sin(angle) * distance);
    ctx.ellipse(
      Math.cos(angle) * distance, Math.sin(angle) * distance,
      size * (1 + rng() * 0.5), size, angle, 0, TAU,
    );
  }

  ctx.fill();
  ctx.restore();
}

/**
 * Draw a drip running down from a point: a fat head, a narrowing tail and a
 * bead about to fall off the end of it.
 */
function drip(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, length: number,
  rng: () => number,
): void {
  const waist = width * (0.3 + rng() * 0.25);
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.bezierCurveTo(
    x - width / 2, y + length * 0.55,
    x - waist, y + length * 0.7,
    x, y + length,
  );
  ctx.bezierCurveTo(
    x + waist, y + length * 0.7,
    x + width / 2, y + length * 0.55,
    x + width / 2, y,
  );
  ctx.closePath();
  ctx.fill();

  const bead = waist * (0.6 + rng() * 0.5);
  ctx.beginPath();
  ctx.ellipse(x, y + length + bead * 1.6, bead, bead * 1.25, 0, 0, TAU);
  ctx.fill();
}

/**
 * How strongly to lay an ink down so it reads on the paper.
 *
 * Splatoon's inks run from near black blue to acid yellow. At one opacity the
 * yellow vanishes into a light card and the blue swamps it, so the weight is
 * set from the colour's own brightness against the paper.
 */
function inkAlpha(colour: string, background: string, base: number): number {
  const contrast = Math.abs(luminance(colour) - luminance(background));
  return base * (0.55 + 1.35 * (1 - Math.min(1, contrast * 1.6)));
}

/** Rough perceived brightness of a #rrggbb colour, 0 to 1. */
function luminance(colour: string): number {
  const hex = colour.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const value = parseInt(full, 16);
  if (Number.isNaN(value)) return 0.5;
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Paint a splat in one colour at a given opacity. */
function inkSplat(
  ctx: CanvasRenderingContext2D,
  colour: string, alpha: number,
  cx: number, cy: number, radius: number,
  rng: () => number,
  options: SplatOptions = {},
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  splat(ctx, cx, cy, radius, rng, options);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Text                                                               */
/* ------------------------------------------------------------------ */

/** Text sits on whole pixels; half a pixel is what makes a glyph look furry. */
function snap(value: number): number {
  return Math.round(value);
}

interface WrappedText {
  lines: string[];
  fontSize: number;
}

/** Break a single over-long word across lines so it can never overflow. */
function splitLongWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of word) {
    if (current && ctx.measureText(current + char).width > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Greedily wrap text to a width at the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width > maxWidth) {
      const pieces = splitLongWord(ctx, word, maxWidth);
      line = pieces.pop() ?? "";
      lines.push(...pieces);
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Find the largest font size at which the text still fits the box.
 *
 * Squares hold anything from four words to a full sentence, so a fixed size
 * would either overflow the long ones or waste the short ones.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  font: string,
  weight: string,
  maxFont: number,
  minFont: number,
): WrappedText {
  const words = text.split(/\s+/).filter(Boolean);
  for (let size = maxFont; size >= minFont; size -= 1) {
    ctx.font = `${weight} ${size}px ${font}`;
    // A word too wide for the box would be broken mid-word, which looks like a
    // mistake. Shrinking until it fits is what a human would do instead, so a
    // size is only accepted once every word fits on a line of its own.
    if (words.some((word) => ctx.measureText(word).width > maxWidth)) continue;
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length * size * 1.24 <= maxHeight) return { lines, fontSize: size };
  }
  ctx.font = `${weight} ${minFont}px ${font}`;
  return { lines: wrap(ctx, text, maxWidth), fontSize: minFont };
}

/** Draw text with an ink outline, the way the game sets its own lettering. */
function outlined(
  ctx: CanvasRenderingContext2D,
  line: string, x: number, y: number,
  fill: string, outline: string, thickness: number,
): void {
  ctx.lineJoin = "round";
  ctx.lineWidth = thickness;
  ctx.strokeStyle = outline;
  ctx.strokeText(line, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(line, x, y);
}

/** Trace a rounded rectangle, for the tile a square's text sits on. */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/*  The card                                                           */
/* ------------------------------------------------------------------ */

export interface DrawOptions {
  cells: BingoCell[];
  rows: number;
  cols: number;
  title: string;
  subtitle: string;
  /** The first ink: the header band and the free square. */
  accent: string;
  /** The ink it clashes with, alternating with it across the grid. */
  secondary: string;
  /** What the free square says. Splatoon's own answer is "Booyah!". */
  freeText: string;
  theme: CardTheme;
  showCredits: boolean;
}

/**
 * Draw a finished bingo card onto a canvas, sizing the canvas to fit.
 *
 * @param view How the canvas is destined to be seen. `displayWidth` is the CSS
 *   pixels it will occupy on the page: given one, the card is drawn to that
 *   size at the screen's own pixel density, so every glyph is rasterised rather
 *   than resampled. `scale` overrides the multiple of the layout size a
 *   download is backed at, for retrying smaller when a canvas is refused.
 *   Given neither, the card is drawn at full export size.
 */
export function drawBingoCard(
  canvas: HTMLCanvasElement,
  options: DrawOptions,
  view: { displayWidth?: number; scale?: number } = {},
): void {
  const { displayWidth, scale: forced } = view;
  const {
    cells, rows, cols, title, subtitle, accent, secondary, freeText, theme, showCredits,
  } = options;

  const gridWidth = cols * CELL_SIZE;
  const gridHeight = rows * CELL_SIZE;
  const width = gridWidth + PADDING * 2;
  const height = gridHeight + PADDING * 2 + HEADER_HEIGHT + (subtitle ? FOOTER_HEIGHT : 0);

  // How much of a layout pixel one backing pixel covers.
  const shrink = displayWidth ? Math.min(1, displayWidth / width) : 1;
  const density = displayWidth
    ? Math.min(window.devicePixelRatio || 1, 2)
    : forced ?? exportScale(width, height);
  const scale = shrink * density;

  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  if (displayWidth) {
    canvas.style.width = `${Math.round(width * shrink)}px`;
    canvas.style.height = "auto";
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "top";
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const gridTop = PADDING + HEADER_HEIGHT;
  const inks = [accent, secondary];

  // Ink under everything: big lazy splats in both team colours, faint enough
  // that the squares still read, seeded on the card so it never reshuffles.
  const backdrop = seeded(hash(`${title}|${rows}x${cols}|${subtitle}`));
  for (let i = 0; i < 9; i += 1) {
    inkSplat(
      ctx, inks[i % 2], inkAlpha(inks[i % 2], theme.background, 0.14),
      backdrop() * width, backdrop() * height,
      CELL_SIZE * (0.3 + backdrop() * 0.55), backdrop,
      { points: 9, wobble: 0.7, droplets: 3, arms: 3, squash: 0.55 + backdrop() * 0.7 },
    );
  }
  // Two roller sweeps across the paper, because a turf war is not all splats.
  for (let i = 0; i < 2; i += 1) {
    inkSplat(
      ctx, inks[i % 2], inkAlpha(inks[i % 2], theme.background, 0.12),
      backdrop() * width, PADDING + backdrop() * (height - PADDING),
      CELL_SIZE * (0.9 + backdrop() * 0.5), backdrop,
      {
        points: 11, wobble: 0.35, droplets: 2, arms: 1,
        squash: 0.16 + backdrop() * 0.1,
        rotation: (backdrop() - 0.5) * 1.2,
      },
    );
  }

  // Header: a broad splat of ink with the title struck across it.
  const bandHeight = HEADER_HEIGHT - 46;
  const bandCentre = { x: PADDING + gridWidth / 2, y: PADDING + bandHeight / 2 };
  const band = seeded(hash(title || "bingo"));
  ctx.save();
  ctx.fillStyle = accent;
  splat(ctx, bandCentre.x, bandCentre.y, gridWidth / 2, band, {
    points: 23, wobble: 0.5, droplets: 5, arms: 4,
    squash: (bandHeight / gridWidth) * 1.85, rotation: 0,
  });
  // Ink running off the underside of the band, towards the grid.
  for (let i = 0; i < 5; i += 1) {
    const at = PADDING + gridWidth * (0.08 + band() * 0.84);
    drip(ctx, at, bandCentre.y + bandHeight * 0.3,
         18 + band() * 26, 20 + band() * 46, band);
  }
  ctx.restore();

  const headerText = (title.trim() || "SPLATOON BINGO").toUpperCase();
  const header = fitText(
    ctx, headerText, gridWidth - 140, bandHeight - 46, DISPLAY_FONT, "400", 84, 28,
  );
  ctx.textAlign = "center";
  const headerLineHeight = header.fontSize * 1.14;
  const headerStart = PADDING + (bandHeight - header.lines.length * headerLineHeight) / 2;
  ctx.save();
  // The game never sets a title straight, so neither does this.
  ctx.translate(bandCentre.x, bandCentre.y);
  ctx.rotate(-0.022);
  ctx.translate(-bandCentre.x, -bandCentre.y);
  header.lines.forEach((line, i) => {
    outlined(
      ctx, line, snap(bandCentre.x), snap(headerStart + i * headerLineHeight),
      theme.headerText, theme.headerOutline, Math.max(6, header.fontSize * 0.14),
    );
  });
  ctx.restore();

  // Grid
  const centreIndex = Math.floor((rows * cols) / 2);

  // Ink first, every square of it, then the tiles: a splat spreads past its own
  // square, and drawing each square complete in turn would let one square's ink
  // land on top of its neighbour's text.
  const geometry = (index: number) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = PADDING + col * CELL_SIZE;
    const y = gridTop + row * CELL_SIZE;
    return { row, col, x, y, centreX: x + CELL_SIZE / 2, centreY: y + CELL_SIZE / 2 };
  };
  const isFreeSquare = (cell: BingoCell, index: number) =>
    cell.free || (cell.id === null && index === centreIndex);

  cells.forEach((cell, index) => {
    const { row, col, centreX, centreY } = geometry(index);
    const rng = seeded(hash(`${index}|${cell.text}`));
    const free = isFreeSquare(cell, index);

    // The two inks alternate like a chequerboard, laid at full strength: the
    // tile, not the paper, is what has to carry the text.
    ctx.save();
    ctx.fillStyle = free ? accent : inks[(row + col) % 2];
    splat(ctx, centreX, centreY, CELL_SIZE * (free ? 0.5 : 0.46), rng, {
      points: 9, wobble: 0.42, droplets: 3, arms: 2,
    });
    ctx.restore();
  });

  cells.forEach((cell, index) => {
    const { x, y, centreX, centreY } = geometry(index);
    const rng = seeded(hash(`${index}|${cell.text}`));
    const isFree = isFreeSquare(cell, index);

    const credit = showCredits && !isFree && cell.display_name ? cell.display_name : "";
    const creditSpace = credit ? 38 : 0;
    const boxWidth = CELL_SIZE - CELL_PADDING * 2 - TILE_INSET * 2;
    const boxHeight = CELL_SIZE - CELL_PADDING * 2 - TILE_INSET * 2 - creditSpace;

    const body = isFree
      ? fitText(ctx, freeText.trim() || "FREE",
                CELL_SIZE - CELL_PADDING * 2, CELL_SIZE - CELL_PADDING * 2,
                DISPLAY_FONT, "400", 82, 28)
      : fitText(ctx, cell.text, boxWidth, boxHeight, BODY_FONT, "600", 34, 17);

    ctx.save();
    // Tiles land a degree or two out of true, the way a sticker would.
    ctx.translate(centreX, centreY);
    ctx.rotate((rng() - 0.5) * 0.05);
    ctx.translate(-centreX, -centreY);
    ctx.textAlign = "center";

    if (!isFree) {
      roundedRect(
        ctx,
        x + TILE_INSET, y + TILE_INSET,
        CELL_SIZE - TILE_INSET * 2, CELL_SIZE - TILE_INSET * 2,
        18,
      );
      ctx.fillStyle = theme.cell;
      ctx.fill();
    }

    const lineHeight = body.fontSize * 1.24;
    const blockHeight = body.lines.length * lineHeight;
    const top = y + TILE_INSET + CELL_PADDING;
    const startY = isFree
      ? centreY - blockHeight / 2
      : top + (boxHeight - blockHeight) / 2;
    body.lines.forEach((line, i) => {
      const at = { x: snap(centreX), y: snap(startY + i * lineHeight) };
      if (isFree) {
        outlined(ctx, line, at.x, at.y, theme.headerText, theme.headerOutline,
                 body.fontSize * 0.16);
      } else {
        ctx.fillStyle = theme.text;
        ctx.fillText(line, at.x, at.y);
      }
    });

    if (credit) {
      ctx.font = `500 21px ${BODY_FONT}`;
      ctx.fillStyle = theme.muted;
      const label = `— ${credit}`;
      const trimmed = ctx.measureText(label).width > boxWidth
        ? `${label.slice(0, 24)}…`
        : label;
      ctx.fillText(trimmed, snap(centreX),
                   snap(y + CELL_SIZE - TILE_INSET - CELL_PADDING - 20));
    }
    ctx.restore();
  });

  if (subtitle) {
    ctx.font = `500 28px ${BODY_FONT}`;
    ctx.textAlign = "center";
    outlined(
      ctx, subtitle,
      snap(PADDING + gridWidth / 2), snap(gridTop + gridHeight + 24),
      theme.muted, theme.background, 8,
    );
  }
}

/** Render the card and hand back a PNG blob ready to download. */
export async function cardToPngBlob(options: DrawOptions): Promise<Blob | null> {
  await ensureCardFonts();

  const gridWidth = options.cols * CELL_SIZE;
  const width = gridWidth + PADDING * 2;
  const height = options.rows * CELL_SIZE + PADDING * 2 + HEADER_HEIGHT
    + (options.subtitle ? FOOTER_HEIGHT : 0);

  // Browsers differ on how big a canvas they will hand over, and one that is
  // too big fails quietly rather than throwing: you get a blank image. So the
  // biggest size is tried first and each failure halves it, down to a size
  // nothing refuses.
  let scale = exportScale(width, height);
  for (;;) {
    const canvas = document.createElement("canvas");
    try {
      drawBingoCard(canvas, options, { scale });
      const blob = await new Promise<Blob | null>(
        (resolve) => canvas.toBlob(resolve, "image/png"),
      );
      // One opaque pixel is enough to know the canvas was really painted.
      const painted = canvas.getContext("2d")?.getImageData(0, 0, 1, 1).data[3];
      if (blob && painted) return blob;
    } catch {
      /* Refused outright, which the smaller size below may not be. */
    }
    if (scale <= 1) return null;
    scale = Math.max(1, scale / 2);
  }
}
