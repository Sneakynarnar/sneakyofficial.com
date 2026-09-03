/**
 * Crossing squares off, and playing the whole run back as a video.
 *
 * A run is kept as an ordered log of events with the times they happened, and
 * everything else is derived from it. Drawing a frame is a pure function of
 * the log and a clock, which is what lets the live card and the exported video
 * share one renderer: the live card feeds it real timestamps, and the export
 * feeds it a tidied timeline where each event is spaced evenly.
 *
 * Taking a cross back removes its event from the log outright rather than
 * recording an undo, so a square crossed by mistake never happened as far as
 * the video is concerned.
 */

import {
  hash, seeded, splat,
  type BingoCell, type CardGeometry, type CardTheme,
} from "./bingoCanvas";

/** One square crossed off, at the moment it was crossed. */
export interface Mark {
  index: number;
  at: number;
}

/** A counter's new reading, at the moment it changed. */
export interface Tick {
  id: string;
  at: number;
  value: number;
}

export interface Counter {
  id: string;
  label: string;
  value: number;
}

export interface Session {
  marks: Mark[];
  ticks: Tick[];
  counters: Counter[];
}

/* ------------------------------------------------------------------ */
/*  Lines                                                              */
/* ------------------------------------------------------------------ */

/** Every line a card of this size can be won on, as square indices. */
export function winningLines(rows: number, cols: number): number[][] {
  const lines: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    lines.push(Array.from({ length: cols }, (_, col) => row * cols + col));
  }
  for (let col = 0; col < cols; col += 1) {
    lines.push(Array.from({ length: rows }, (_, row) => row * cols + col));
  }
  // Diagonals only exist on a square card; on 4x5 they run off the edge.
  if (rows === cols) {
    lines.push(Array.from({ length: rows }, (_, i) => i * cols + i));
    lines.push(Array.from({ length: rows }, (_, i) => i * cols + (cols - 1 - i)));
  }
  return lines;
}

/** Which squares count as crossed: the marks, plus the free square. */
export function markedSet(cells: BingoCell[], marks: Mark[]): Set<number> {
  const marked = new Set(marks.map((mark) => mark.index));
  cells.forEach((cell, index) => { if (cell.free) marked.add(index); });
  return marked;
}

/**
 * The first line completed, and the mark that completed it.
 *
 * Returned rather than merely detected, because the video wants to strike the
 * line through at the moment it was won and stop there.
 */
export function findLine(cells: BingoCell[], marks: Mark[], rows: number, cols: number):
  { line: number[]; afterMarks: number } | null {
  const lines = winningLines(rows, cols);
  const marked = new Set<number>();
  cells.forEach((cell, index) => { if (cell.free) marked.add(index); });

  for (let count = 0; count <= marks.length; count += 1) {
    if (count > 0) marked.add(marks[count - 1].index);
    for (const line of lines) {
      if (line.every((index) => marked.has(index))) return { line, afterMarks: count };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Timelines                                                          */
/* ------------------------------------------------------------------ */

export interface Timeline {
  marks: Mark[];
  ticks: Tick[];
  counters: Counter[];
  /** When the winning line is struck through, if there is one. */
  lineAt: number | null;
  line: number[] | null;
  duration: number;
}

export const MARK_DURATION = 900;
const LINE_DURATION = 1500;

/**
 * Space a run's events evenly for the video.
 *
 * A run happens over however long it takes to play the game, most of which is
 * nothing happening. The video keeps the order and throws the waiting away:
 * one event every `pace` milliseconds, whatever the gaps were on the day.
 */
export function buildTimeline(
  session: Session, cells: BingoCell[], rows: number, cols: number,
  options: { pace: number; leadIn: number; leadOut: number },
): Timeline {
  const { pace, leadIn, leadOut } = options;

  // Counter changes and crosses share one running order, so a counter that
  // ticked between two squares still ticks between them in the video.
  const events = [
    ...session.marks.map((mark) => ({ kind: "mark" as const, at: mark.at, mark })),
    ...session.ticks.map((tick) => ({ kind: "tick" as const, at: tick.at, tick })),
  ].sort((a, b) => a.at - b.at);

  const marks: Mark[] = [];
  const ticks: Tick[] = [];
  events.forEach((event, order) => {
    const at = leadIn + order * pace;
    if (event.kind === "mark") marks.push({ ...event.mark, at });
    else ticks.push({ ...event.tick, at });
  });

  const won = findLine(cells, marks, rows, cols);
  const lineAt = won ? (marks[won.afterMarks - 1]?.at ?? leadIn) + MARK_DURATION * 0.7 : null;
  const lastEvent = [...marks, ...ticks]
    .reduce((latest, event) => Math.max(latest, event.at), leadIn);

  return {
    marks,
    ticks,
    counters: session.counters,
    lineAt,
    line: won ? won.line : null,
    duration: Math.max(lastEvent + MARK_DURATION, (lineAt ?? 0) + LINE_DURATION) + leadOut,
  };
}

/** The timeline for the card as it is being played, in real time. */
export function liveTimeline(session: Session, cells: BingoCell[], rows: number, cols: number): Timeline {
  const won = findLine(cells, session.marks, rows, cols);
  return {
    marks: session.marks,
    ticks: session.ticks,
    counters: session.counters,
    lineAt: won ? session.marks[won.afterMarks - 1]?.at ?? 0 : null,
    line: won ? won.line : null,
    duration: Infinity,
  };
}

/* ------------------------------------------------------------------ */
/*  Easing                                                             */
/* ------------------------------------------------------------------ */

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Overshoot and settle, which is how ink lands rather than fades in. */
function backOut(t: number): number {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* ------------------------------------------------------------------ */
/*  Drawing                                                            */
/* ------------------------------------------------------------------ */

export interface PlaybackStyle {
  theme: CardTheme;
  /** Ink the crosses are painted in. */
  mark: string;
  /** Ink the winning line is struck through in. */
  line: string;
}

/** Centre of a square, in layout pixels. */
export function squareCentre(geometry: CardGeometry, index: number): { x: number; y: number } {
  const row = Math.floor(index / geometry.cols);
  const col = index % geometry.cols;
  return {
    x: geometry.padding + (col + 0.5) * geometry.cellSize,
    y: geometry.gridTop + (row + 0.5) * geometry.cellSize,
  };
}

/** Which square a point is over, or null if it is off the grid. */
export function squareAt(geometry: CardGeometry, x: number, y: number): number | null {
  const col = Math.floor((x - geometry.padding) / geometry.cellSize);
  const row = Math.floor((y - geometry.gridTop) / geometry.cellSize);
  if (col < 0 || row < 0 || col >= geometry.cols || row >= geometry.rows) return null;
  return row * geometry.cols + col;
}

/**
 * Paint one cross at whatever stage it has got to.
 *
 * The ink lands first and the two strokes are dragged through it afterwards,
 * because that is the order it would happen with a real brush, and doing it in
 * that order is most of why it reads as ink rather than as a graphic.
 */
function drawMark(
  ctx: CanvasRenderingContext2D, geometry: CardGeometry,
  index: number, progress: number, style: PlaybackStyle,
): void {
  const { x, y } = squareCentre(geometry, index);
  const size = geometry.cellSize;
  const rng = seeded(hash(`mark${index}`));
  const tilt = (rng() - 0.5) * 0.24;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // The splat landing.
  const landing = clamp01(progress / 0.34);
  if (landing > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, landing * 2) * 0.92;
    const scale = backOut(landing);
    ctx.scale(scale, scale);
    ctx.fillStyle = style.mark;
    splat(ctx, 0, 0, size * 0.36, seeded(hash(`splat${index}`)), {
      points: 9, wobble: 0.45, droplets: 4, arms: 2,
    });
    ctx.restore();
  }

  // The two strokes, dragged through it.
  const reach = size * 0.3;
  const strokes: [number, number][] = [[-1, -1], [1, -1]];
  strokes.forEach(([dx, dy], stroke) => {
    const from = 0.2 + stroke * 0.24;
    const drawn = easeOut(clamp01((progress - from) / 0.34));
    if (drawn <= 0) return;

    const startX = dx * reach;
    const startY = dy * reach;
    const endX = -dx * reach;
    const endY = -dy * reach;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // The outline colour is the one the theme guarantees stands off its own
    // paper, which is exactly what a cross has to do over a square of ink.
    ctx.strokeStyle = style.theme.headerOutline;
    ctx.lineWidth = size * 0.13;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    // A slight bow, so the stroke looks dragged rather than ruled.
    ctx.quadraticCurveTo(
      (startX + endX) / 2 + dy * size * 0.05,
      (startY + endY) / 2 - dx * size * 0.05,
      startX + (endX - startX) * drawn,
      startY + (endY - startY) * drawn,
    );
    ctx.stroke();
    ctx.restore();
  });

  ctx.restore();
}

/**
 * Strike the winning line through, end to end.
 *
 * Drawn as a run of overlapping blobs rather than a line, thickening towards
 * the middle and tapering at the ends, so it reads as a brush dragged across
 * the card rather than a bar laid over it.
 */
function drawWinningLine(
  ctx: CanvasRenderingContext2D, geometry: CardGeometry,
  line: number[], progress: number, style: PlaybackStyle,
): void {
  const first = squareCentre(geometry, line[0]);
  const last = squareCentre(geometry, line[line.length - 1]);
  const drawn = easeOut(clamp01(progress / 0.55));
  if (drawn <= 0) return;

  const rng = seeded(hash(`line${line[0]}x${line.length}`));
  const steps = 48;
  const thickness = geometry.cellSize * 0.15;

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = style.line;
  ctx.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const along = (step / steps) * drawn;
    const x = first.x + (last.x - first.x) * along;
    const y = first.y + (last.y - first.y) * along;
    // Fat through the middle of the sweep, thin where the brush lands and
    // leaves, with a little unevenness along the way.
    const taper = Math.sin(Math.PI * Math.min(1, along / Math.max(drawn, 0.001)) * 0.5 + 0.35);
    const radius = thickness * (0.55 + 0.75 * taper) * (0.88 + rng() * 0.24);
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.fill();

  // Ink thrown off the end of the stroke as it lands.
  if (drawn > 0.7) {
    ctx.globalAlpha = 0.92 * clamp01((drawn - 0.7) / 0.3);
    splat(ctx, last.x, last.y, geometry.cellSize * 0.28, rng,
          { points: 8, wobble: 0.5, droplets: 5, arms: 2 });
  }
  ctx.restore();
}

/** The BINGO! call, dropped over the card once the line is struck. */
function drawFanfare(
  ctx: CanvasRenderingContext2D, geometry: CardGeometry,
  progress: number, style: PlaybackStyle, line: number[],
): void {
  const entrance = backOut(clamp01(progress / 0.45));
  if (entrance <= 0) return;

  const x = geometry.width / 2;
  // Sit the call clear of the line it is celebrating, so the line it just
  // struck through is still there to be seen.
  const lineRows = line.map((index) => Math.floor(index / geometry.cols));
  const middle = (geometry.rows - 1) / 2;
  const away = lineRows.every((row) => row <= middle) ? geometry.rows - 1 : 0;
  const onTheMiddle = lineRows.some((row) => Math.abs(row - middle) < 0.6);
  const band = onTheMiddle ? (away + middle) / 2 : middle;
  const y = geometry.gridTop + (band + 0.5) * geometry.cellSize;
  const size = Math.min(geometry.width * 0.24, geometry.cellSize * 0.9);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.05);
  ctx.scale(entrance, entrance);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `400 ${size}px "Titan One", sans-serif`;
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = style.theme.headerOutline;
  ctx.strokeText("BINGO!", 0, 0);
  ctx.fillStyle = style.line;
  ctx.fillText("BINGO!", 0, 0);
  ctx.restore();
}

/** The counters, as a strip of pills under the card. */
function drawCounters(
  ctx: CanvasRenderingContext2D, geometry: CardGeometry,
  timeline: Timeline, time: number, style: PlaybackStyle, height: number,
): void {
  const counters = timeline.counters;
  if (counters.length === 0) return;

  const pillHeight = height * 0.62;
  const gap = height * 0.22;
  const top = geometry.height + (height - pillHeight) / 2;
  const font = pillHeight * 0.42;

  ctx.save();
  ctx.textBaseline = "middle";

  const widths = counters.map((counter) => {
    ctx.font = `500 ${font}px "Fredoka", sans-serif`;
    const label = ctx.measureText(counter.label.toUpperCase()).width;
    ctx.font = `400 ${font * 1.4}px "Titan One", sans-serif`;
    const value = ctx.measureText("00").width;
    return label + value + pillHeight * 1.1;
  });
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (counters.length - 1);

  let x = (geometry.width - total) / 2;
  counters.forEach((counter, index) => {
    const ticks = timeline.ticks.filter((tick) => tick.id === counter.id && tick.at <= time);
    const value = ticks.length ? ticks[ticks.length - 1].value : 0;
    const since = ticks.length ? time - ticks[ticks.length - 1].at : Infinity;
    // A short pop on the pill that just changed, so the eye is taken to it.
    const pop = since < 320 ? 1 + 0.09 * (1 - easeOut(since / 320)) : 1;
    const width = widths[index];

    ctx.save();
    ctx.translate(x + width / 2, top + pillHeight / 2);
    ctx.scale(pop, pop);

    ctx.beginPath();
    ctx.roundRect(-width / 2, -pillHeight / 2, width, pillHeight, pillHeight / 2);
    ctx.fillStyle = style.theme.cell;
    ctx.fill();
    ctx.lineWidth = pillHeight * 0.07;
    ctx.strokeStyle = style.mark;
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = `500 ${font}px "Fredoka", sans-serif`;
    ctx.fillStyle = style.theme.muted;
    ctx.fillText(counter.label.toUpperCase(), -width / 2 + pillHeight * 0.55, 0);

    ctx.textAlign = "right";
    ctx.font = `400 ${font * 1.4}px "Titan One", sans-serif`;
    ctx.fillStyle = style.theme.text;
    ctx.fillText(String(value), width / 2 - pillHeight * 0.5, 0);
    ctx.restore();

    x += width + gap;
  });
  ctx.restore();
}

export interface FrameOptions {
  /** The finished card, already drawn, to sit under the marks. */
  base: HTMLCanvasElement | null;
  geometry: CardGeometry;
  timeline: Timeline;
  style: PlaybackStyle;
  /** Height of the counter strip below the card, zero to leave it off. */
  counterHeight: number;
  /** Draw only the marks, for overlaying the video on other footage. */
  marksOnly: boolean;
}

/**
 * Whether anything is still moving at this point on the timeline.
 *
 * The live card redraws only while something is animating: a phone repainting
 * a canvas sixty times a second to show a picture that is not changing is a
 * good way to flatten its battery.
 */
export function isAnimating(timeline: Timeline, time: number): boolean {
  if (timeline.marks.some((mark) => time - mark.at < MARK_DURATION && time >= mark.at - 50)) {
    return true;
  }
  if (timeline.ticks.some((tick) => time - tick.at < 400 && time >= tick.at - 50)) return true;
  if (timeline.lineAt !== null) {
    const since = time - timeline.lineAt;
    if (since > -50 && since < LINE_DURATION) return true;
  }
  return false;
}

/** Draw one frame of a run at a given point on its timeline. */
export function drawFrame(
  ctx: CanvasRenderingContext2D, time: number, options: FrameOptions,
): void {
  const { base, geometry, timeline, style, counterHeight, marksOnly } = options;

  ctx.clearRect(0, 0, geometry.width, geometry.height + counterHeight);
  if (!marksOnly) {
    // The paper runs under the counter strip as well, or the strip comes out
    // as a transparent band across the bottom of the video.
    ctx.fillStyle = style.theme.background;
    ctx.fillRect(0, 0, geometry.width, geometry.height + counterHeight);
    if (base) ctx.drawImage(base, 0, 0, geometry.width, geometry.height);
  }

  for (const mark of timeline.marks) {
    if (mark.at > time) continue;
    drawMark(ctx, geometry, mark.index, clamp01((time - mark.at) / MARK_DURATION), style);
  }

  if (timeline.line && timeline.lineAt !== null && time >= timeline.lineAt) {
    const progress = clamp01((time - timeline.lineAt) / LINE_DURATION);
    drawWinningLine(ctx, geometry, timeline.line, progress, style);
    if (progress > 0.45) {
      drawFanfare(ctx, geometry, (progress - 0.45) / 0.55, style, timeline.line);
    }
  }

  if (counterHeight > 0 && !marksOnly) {
    drawCounters(ctx, geometry, timeline, time, style, counterHeight);
  }
}

/* ------------------------------------------------------------------ */
/*  Video                                                              */
/* ------------------------------------------------------------------ */

// The codecs worth trying, best first. WebM is what Chrome and Firefox give
// you and the only one that can carry transparency; Safari, including every
// browser on iOS, records MP4 or nothing, so it is worth asking for.
const CODECS = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

export function recordingSupported(): boolean {
  return typeof MediaRecorder !== "undefined"
    && typeof HTMLCanvasElement.prototype.captureStream === "function"
    && CODECS.some((type) => MediaRecorder.isTypeSupported(type));
}

/** Whether a recording on this browser can keep a transparent background. */
export function transparencySupported(): boolean {
  return typeof MediaRecorder !== "undefined"
    && MediaRecorder.isTypeSupported("video/webm;codecs=vp9");
}

/** The file extension for whatever the recorder handed back. */
export function extensionFor(blob: Blob): string {
  return blob.type.includes("mp4") ? ".mp4" : ".webm";
}

export interface RecordOptions {
  timeline: Timeline;
  cells: BingoCell[];
  geometry: CardGeometry;
  style: PlaybackStyle;
  counterHeight: number;
  marksOnly: boolean;
  base: HTMLCanvasElement | null;
  /** Long edge of the video in pixels. */
  size: number;
  onProgress?: (fraction: number) => void;
}

/**
 * Play the run through an offscreen canvas and record it as it goes.
 *
 * Recording the canvas live is the only way a browser will give you a video
 * file, so the export takes as long as the video does. That is a few seconds
 * per square, and the caller is handed the progress so it can say so.
 */
export async function recordRun(options: RecordOptions): Promise<Blob> {
  const { timeline, geometry, style, counterHeight, marksOnly, base, size, onProgress } = options;

  const layoutHeight = geometry.height + counterHeight;
  const scale = size / Math.max(geometry.width, layoutHeight);
  const canvas = document.createElement("canvas");
  // Encoders want even dimensions; an odd one is quietly rounded and shifts
  // every frame by half a pixel.
  canvas.width = Math.round(geometry.width * scale / 2) * 2;
  canvas.height = Math.round(layoutHeight * scale / 2) * 2;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("This browser wouldn't give us a canvas to record.");

  const type = CODECS.find((codec) => MediaRecorder.isTypeSupported(codec));
  if (!type) throw new Error("This browser can't record video. Chrome and Firefox can.");

  const stream = canvas.captureStream(60);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type }));
  });

  recorder.start();
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const time = performance.now() - startedAt;
      ctx.setTransform(canvas.width / geometry.width, 0, 0, canvas.width / geometry.width, 0, 0);
      drawFrame(ctx, time, { base, geometry, timeline, style, counterHeight, marksOnly });
      onProgress?.(Math.min(1, time / timeline.duration));
      if (time >= timeline.duration) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  return finished;
}
