/**
 * Canvas rendering for Splatoon Bingo cards.
 *
 * The card is drawn at print resolution and handed back as a PNG blob, so what
 * the admin previews on the page is byte for byte what downloads.
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
  cell: string;
  cellAlt: string;
  text: string;
  muted: string;
  grid: string;
  headerText: string;
}

export const CARD_THEMES: CardTheme[] = [
  {
    id: "paper",
    label: "Paper",
    background: "#ffffff",
    cell: "#ffffff",
    cellAlt: "#f4f6fb",
    text: "#0f172a",
    muted: "#64748b",
    grid: "#0f172a",
    headerText: "#ffffff",
  },
  {
    id: "ink",
    label: "Ink",
    background: "#0b1120",
    cell: "#141d33",
    cellAlt: "#101829",
    text: "#f8fafc",
    muted: "#94a3b8",
    grid: "#334155",
    headerText: "#ffffff",
  },
];

// Everything below is in layout pixels; the canvas is backed at SCALE times
// that, so text is rasterised with enough detail to survive both the shrunken
// on-page preview and a full size print.
const SCALE = 2;

const CELL_SIZE = 300;
const PADDING = 44;
const HEADER_HEIGHT = 170;
const FOOTER_HEIGHT = 60;
const CELL_PADDING = 22;
const BORDER = 6;

const FONT_STACK =
  '"Segoe UI", "Helvetica Neue", Helvetica, Roboto, Arial, sans-serif';

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
  weight: string,
  maxFont: number,
  minFont: number,
): WrappedText {
  for (let size = maxFont; size >= minFont; size -= 1) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length * size * 1.24 <= maxHeight) return { lines, fontSize: size };
  }
  ctx.font = `${weight} ${minFont}px ${FONT_STACK}`;
  return { lines: wrap(ctx, text, maxWidth), fontSize: minFont };
}

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

export interface DrawOptions {
  cells: BingoCell[];
  rows: number;
  cols: number;
  title: string;
  subtitle: string;
  accent: string;
  theme: CardTheme;
  showCredits: boolean;
}

/** Draw a finished bingo card onto a canvas, sizing the canvas to fit. */
export function drawBingoCard(canvas: HTMLCanvasElement, options: DrawOptions): void {
  const { cells, rows, cols, title, subtitle, accent, theme, showCredits } = options;

  const gridWidth = cols * CELL_SIZE;
  const gridHeight = rows * CELL_SIZE;
  const width = gridWidth + PADDING * 2;
  const height = gridHeight + PADDING * 2 + HEADER_HEIGHT + (subtitle ? FOOTER_HEIGHT : 0);

  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  // The preview is laid out at the design size and downscaled by the browser
  // only when the column is narrower, so it never renders below the backing
  // resolution.
  canvas.style.width = `${width}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.textBaseline = "top";
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  // Header band
  roundedRect(ctx, PADDING, PADDING, gridWidth, HEADER_HEIGHT - 34, 18);
  ctx.fillStyle = accent;
  ctx.fill();

  const headerText = title.trim() || "SPLATOON BINGO";
  const headerBox = { w: gridWidth - 60, h: HEADER_HEIGHT - 34 - 40 };
  const header = fitText(ctx, headerText.toUpperCase(), headerBox.w, headerBox.h, "800", 76, 26);
  ctx.fillStyle = theme.headerText;
  ctx.textAlign = "center";
  const headerLineHeight = header.fontSize * 1.18;
  const headerStart = PADDING + (HEADER_HEIGHT - 34 - header.lines.length * headerLineHeight) / 2;
  header.lines.forEach((line, i) => {
    ctx.fillText(line, snap(PADDING + gridWidth / 2), snap(headerStart + i * headerLineHeight));
  });

  // Grid
  const gridTop = PADDING + HEADER_HEIGHT;
  const centreIndex = Math.floor((rows * cols) / 2);

  cells.forEach((cell, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = PADDING + col * CELL_SIZE;
    const y = gridTop + row * CELL_SIZE;
    const isFree = cell.free || (cell.id === null && index === centreIndex);

    ctx.fillStyle = isFree ? accent : (row + col) % 2 === 0 ? theme.cell : theme.cellAlt;
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    const credit = showCredits && !isFree && cell.display_name ? cell.display_name : "";
    const creditSpace = credit ? 34 : 0;
    const boxWidth = CELL_SIZE - CELL_PADDING * 2;
    const boxHeight = CELL_SIZE - CELL_PADDING * 2 - creditSpace;

    const body = fitText(
      ctx,
      isFree ? "FREE" : cell.text,
      boxWidth,
      boxHeight,
      isFree ? "800" : "600",
      isFree ? 72 : 36,
      isFree ? 40 : 18,
    );

    ctx.fillStyle = isFree ? theme.headerText : theme.text;
    ctx.textAlign = "center";
    const lineHeight = body.fontSize * 1.24;
    const blockHeight = body.lines.length * lineHeight;
    const startY = y + CELL_PADDING + (boxHeight - blockHeight) / 2;
    body.lines.forEach((line, i) => {
      ctx.fillText(line, snap(x + CELL_SIZE / 2), snap(startY + i * lineHeight));
    });

    if (credit) {
      ctx.font = `500 20px ${FONT_STACK}`;
      ctx.fillStyle = theme.muted;
      const label = `— ${credit}`;
      const trimmed = ctx.measureText(label).width > boxWidth
        ? `${label.slice(0, 24)}…`
        : label;
      ctx.fillText(trimmed, snap(x + CELL_SIZE / 2), snap(y + CELL_SIZE - CELL_PADDING - 22));
    }
  });

  // Outer frame, drawn last so it sits over the cell borders
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = BORDER;
  ctx.strokeRect(PADDING, gridTop, gridWidth, gridHeight);

  if (subtitle) {
    ctx.font = `500 26px ${FONT_STACK}`;
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "center";
    ctx.fillText(subtitle, snap(PADDING + gridWidth / 2), snap(gridTop + gridHeight + 20));
  }
}

/** Render the card and hand back a PNG blob ready to download. */
export function cardToPngBlob(options: DrawOptions): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  drawBingoCard(canvas, options);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
