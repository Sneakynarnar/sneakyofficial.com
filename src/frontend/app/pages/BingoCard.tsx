/**
 * The public bingo card player.
 *
 * Open a .bingo file, cross squares off as they happen, keep a few counters,
 * and export the whole run as a video of the card filling in. Everything is
 * done in the browser: the file is never uploaded anywhere, and the video is
 * recorded off a canvas on the machine that played the run.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import {
  ArrowLeftRight, Download, Film, Flag, Loader2, Minus, Plus, RotateCcw, Upload, X,
} from "lucide-react";
import PageWrapper from "../components/PageWrapper";
import {
  CARD_THEMES, cardGeometry, cardToPngBlob, drawBingoCard, ensureCardFonts,
  type BingoCell, type DrawOptions,
} from "../components/bingo/bingoCanvas";
import { INK_PAIRS, inkPairsByGame, DEFAULT_PAIR } from "../components/bingo/inkPairs";
import {
  decodeBingoFile, encodeBingoFile, ENCODINGS, FILE_EXTENSION,
  type BingoFile, type Encoding,
} from "../components/bingo/bingoFile";
import {
  buildTimeline, drawFrame, findLine, liveTimeline, markedSet, recordingSupported,
  recordRun, squareAt,
  type Counter, type Mark, type PlaybackStyle, type Tick,
} from "../components/bingo/playback";

/** Downloads without leaving the page, which is all any of these are. */
function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoking immediately cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const slug = (text: string) =>
  text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bingo";

export default function BingoCardPage() {
  const [card, setCard] = useState<BingoFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The card's look, seeded from the file and editable here afterwards.
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [accent, setAccent] = useState(DEFAULT_PAIR.a);
  const [secondary, setSecondary] = useState(DEFAULT_PAIR.b);
  const [themeId, setThemeId] = useState(CARD_THEMES[0].id);
  const [freeText, setFreeText] = useState("Booyah!");
  const [credits, setCredits] = useState(true);
  const [encoding, setEncoding] = useState<Encoding>("deflate");

  // The run.
  const [marks, setMarks] = useState<Mark[]>([]);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(performance.now());

  // The video.
  const [pace, setPace] = useState(1.1);
  const [size, setSize] = useState(1440);
  const [marksOnly, setMarksOnly] = useState(false);
  const [withCounters, setWithCounters] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [viewHeight, setViewHeight] = useState(
    typeof window === "undefined" ? 900 : window.innerHeight,
  );

  const theme = CARD_THEMES.find((t) => t.id === themeId) ?? CARD_THEMES[0];
  const cells: BingoCell[] = useMemo(() => card?.cells ?? [], [card]);
  const geometry = useMemo(
    () => cardGeometry(card?.rows ?? 5, card?.cols ?? 5, Boolean(subtitle)),
    [card, subtitle],
  );
  const counterHeight = counters.length && withCounters ? geometry.cellSize * 0.52 : 0;

  const style: PlaybackStyle = useMemo(() => ({
    theme,
    mark: secondary,
    line: accent,
  }), [theme, secondary, accent]);

  const session = useMemo(() => ({ marks, ticks, counters }), [marks, ticks, counters]);
  const drawOptions: DrawOptions | null = useMemo(() => (
    card
      ? {
          cells, rows: card.rows, cols: card.cols, title, subtitle, accent, secondary,
          freeText, theme, showCredits: credits,
        }
      : null
  ), [card, cells, title, subtitle, accent, secondary, freeText, theme, credits]);

  const line = useMemo(
    () => (card ? findLine(cells, marks, card.rows, card.cols) : null),
    [card, cells, marks],
  );
  const marked = useMemo(() => markedSet(cells, marks), [cells, marks]);

  /* ---------------------------------------------------------------- */
  /*  Opening a file                                                   */
  /* ---------------------------------------------------------------- */

  const open = useCallback(async (file: File) => {
    try {
      const loaded = await decodeBingoFile(await file.text());
      setCard(loaded);
      setTitle(loaded.title ?? "Splatoon Bingo");
      setSubtitle(loaded.subtitle ?? "");
      setAccent(loaded.accent ?? DEFAULT_PAIR.a);
      setSecondary(loaded.secondary ?? DEFAULT_PAIR.b);
      setThemeId(CARD_THEMES.some((t) => t.id === loaded.themeId) ? loaded.themeId : CARD_THEMES[0].id);
      setFreeText(loaded.freeText || "Booyah!");
      setCredits(loaded.showCredits ?? true);
      setMarks([]);
      setTicks([]);
      setFinished(false);
      setVideo(null);
      startedAt.current = performance.now();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file wouldn't open.");
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Drawing                                                          */
  /* ---------------------------------------------------------------- */

  // The finished card is drawn once and reused as the backdrop for every
  // frame, since only the marks on top of it change.
  useEffect(() => {
    let live = true;
    if (!drawOptions) { baseRef.current = null; return; }
    ensureCardFonts().then(() => {
      if (!live) return;
      const base = document.createElement("canvas");
      drawBingoCard(base, drawOptions, { scale: 2 });
      baseRef.current = base;
    });
    return () => { live = false; };
  }, [drawOptions]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, [card]);

  useEffect(() => {
    const onResize = () => setViewHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // One loop for the life of the page: marks animate in, the counters pop, and
  // a finished line strikes itself through.
  useEffect(() => {
    if (!card) return;
    let frame = 0;
    const timeline = liveTimeline(session, cells, card.rows, card.cols);

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const layoutHeight = geometry.height + counterHeight;
        const width = boxWidth || geometry.width;
        const density = Math.min(window.devicePixelRatio || 1, 2);
        // Sized to fit the window, not the column: a card as tall as this one
        // would otherwise run off the bottom of the screen and be scrolled
        // rather than played.
        const shrink = Math.min(
          1,
          width / geometry.width,
          (viewHeight - 260) / layoutHeight,
        );
        canvas.width = Math.round(geometry.width * shrink * density);
        canvas.height = Math.round(layoutHeight * shrink * density);
        canvas.style.width = `${Math.round(geometry.width * shrink)}px`;
        canvas.style.height = "auto";

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(shrink * density, 0, 0, shrink * density, 0, 0);
          drawFrame(ctx, performance.now() - startedAt.current, {
            base: baseRef.current, geometry, timeline, style, counterHeight, marksOnly: false,
          });
        }
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [card, cells, session, geometry, counterHeight, style, boxWidth, viewHeight]);

  /* ---------------------------------------------------------------- */
  /*  Playing                                                          */
  /* ---------------------------------------------------------------- */

  const toggle = (index: number) => {
    if (finished || !card || cells[index]?.free) return;
    setVideo(null);
    setMarks((prev) => (
      prev.some((mark) => mark.index === index)
        // Taking a cross back erases it: the video should show a square that
        // was crossed by mistake as never having been crossed at all.
        ? prev.filter((mark) => mark.index !== index)
        : [...prev, { index, at: performance.now() - startedAt.current }]
    ));
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const scale = geometry.width / box.width;
    const index = squareAt(
      geometry,
      (event.clientX - box.left) * scale,
      (event.clientY - box.top) * scale,
    );
    if (index !== null && index < cells.length) toggle(index);
  };

  const bump = (id: string, by: number) => {
    setVideo(null);
    setCounters((prev) => prev.map((counter) => (
      counter.id === id ? { ...counter, value: Math.max(0, counter.value + by) } : counter
    )));
    const counter = counters.find((c) => c.id === id);
    if (!counter) return;
    const value = Math.max(0, counter.value + by);
    if (value === counter.value) return;
    setTicks((prev) => [...prev, { id, value, at: performance.now() - startedAt.current }]);
  };

  const addCounter = () => {
    const label = prompt("What are you counting?")?.trim();
    if (!label) return;
    setCounters((prev) => [
      ...prev,
      { id: `c${Date.now().toString(36)}`, label: label.slice(0, 24), value: 0 },
    ]);
  };

  const dropCounter = (id: string) => {
    setCounters((prev) => prev.filter((counter) => counter.id !== id));
    setTicks((prev) => prev.filter((tick) => tick.id !== id));
  };

  const restart = () => {
    setMarks([]);
    setTicks([]);
    setCounters((prev) => prev.map((counter) => ({ ...counter, value: 0 })));
    setFinished(false);
    setVideo(null);
    startedAt.current = performance.now();
  };

  /* ---------------------------------------------------------------- */
  /*  Saving                                                           */
  /* ---------------------------------------------------------------- */

  const savePng = async () => {
    if (!drawOptions) return;
    const blob = await cardToPngBlob(drawOptions);
    if (blob) saveBlob(blob, `${slug(title)}.png`);
  };

  const saveCard = async () => {
    if (!card) return;
    const text = await encodeBingoFile({
      title, subtitle, rows: card.rows, cols: card.cols, freeText,
      accent, secondary, themeId, showCredits: credits, cells,
    }, encoding);
    saveBlob(new Blob([text], { type: "text/plain" }), `${slug(title)}${FILE_EXTENSION}`);
  };

  const exportVideo = async () => {
    if (!card) return;
    setExporting(true);
    setProgress(0);
    setVideo(null);
    try {
      const timeline = buildTimeline(session, cells, card.rows, card.cols, {
        pace: pace * 1000,
        leadIn: 900,
        leadOut: line ? 2400 : 1400,
      });
      const blob = await recordRun({
        timeline, cells, geometry, style,
        counterHeight: withCounters && counters.length ? geometry.cellSize * 0.52 : 0,
        marksOnly,
        base: marksOnly ? null : baseRef.current,
        size,
        onProgress: setProgress,
      });
      setVideo({ url: URL.createObjectURL(blob), name: `${slug(title)}-run.webm` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The recording failed.");
    } finally {
      setExporting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Page                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <PageWrapper>
      <Helmet>
        <title>Bingo card | Sneaky</title>
        <meta
          name="description"
          content="Open a .bingo card, cross the squares off as you go, and export the run as a video."
        />
      </Helmet>

      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">Bingo card</h1>
        <p className="text-sm text-slate-400 mb-6">
          Everything here happens in your browser. The card never leaves your machine,
          and neither does the video.
        </p>

        {error && (
          <div className="mb-4 text-sm px-3 py-2 rounded border bg-red-900/40 text-red-200 border-red-700/40">
            {error}
          </div>
        )}

        {!card ? (
          <DropZone onFile={open} />
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start justify-center">
            <div className="flex flex-col items-center gap-3">
              <div
                ref={boxRef}
                className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/40 p-3 flex justify-center"
              >
                <canvas
                  ref={canvasRef}
                  onClick={onCanvasClick}
                  className={`rounded-lg shadow-2xl ${finished ? "" : "cursor-pointer"}`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-slate-400 mr-1">
                  {marked.size - cells.filter((c) => c.free).length} of {cells.length} crossed
                  {line ? " · line complete" : ""}
                </span>
                <button onClick={() => setFinished((was) => !was)} className={miniButton}>
                  {finished ? <RotateCcw className="w-3.5 h-3.5" /> : <Flag className="w-3.5 h-3.5" />}
                  {finished ? "Keep playing" : "Finish here"}
                </button>
                <button onClick={restart} className={miniButton}>
                  <RotateCcw className="w-3.5 h-3.5" /> Start over
                </button>
                <button onClick={() => { setCard(null); setVideo(null); }} className={miniButton}>
                  <Upload className="w-3.5 h-3.5" /> Open another
                </button>
              </div>

            </div>

            <div className="flex flex-col gap-5">
              <Panel title="The video">
                <label className="text-xs text-slate-400 block">
                  A square every {pace.toFixed(1)}s
                  <input
                    type="range" min={0.4} max={3} step={0.1} value={pace}
                    onChange={(e) => setPace(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </label>

                <label className="text-xs text-slate-400 block">
                  Size
                  <select
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    className={inputClass}
                  >
                    <option value={1080}>1080px long edge</option>
                    <option value={1440}>1440px long edge</option>
                    <option value={2160}>2160px long edge</option>
                  </select>
                </label>

                <Check2
                  checked={withCounters}
                  onChange={setWithCounters}
                  label="Show the counters in the video"
                />
                <Check2
                  checked={marksOnly}
                  onChange={setMarksOnly}
                  label="Crosses only, no card"
                  note="For laying over your own footage of the card. Chrome keeps the transparency; other browsers may fill it in."
                />

                <button
                  onClick={exportVideo}
                  disabled={exporting || marks.length === 0 || !recordingSupported()}
                  className={primaryButton}
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                  {exporting ? `Recording ${Math.round(progress * 100)}%` : "Record the run"}
                </button>

                {!recordingSupported() && (
                  <p className="text-[11px] text-amber-300">
                    This browser can't record video. Chrome or Firefox can.
                  </p>
                )}
                {exporting && (
                  <p className="text-[11px] text-slate-500">
                    The recording plays out in real time, so it takes about as long as the
                    video itself. Leave this tab in front.
                  </p>
                )}
                {video && (
                  <div className="flex flex-col gap-2">
                    <video src={video.url} controls loop className="w-full rounded-lg border border-slate-700/50" />
                    <a href={video.url} download={video.name} className={secondaryButton}>
                      <Download className="w-4 h-4" /> Save the video
                    </a>
                  </div>
                )}
              </Panel>

              <Panel title="How it looks">
                <label className="text-xs text-slate-400 block">
                  Ink
                  <select
                    value={INK_PAIRS.find((p) => p.a === accent && p.b === secondary)?.id ?? ""}
                    onChange={(e) => {
                      const picked = INK_PAIRS.find((p) => p.id === e.target.value);
                      if (picked) { setAccent(picked.a); setSecondary(picked.b); }
                    }}
                    className={inputClass}
                  >
                    <option value="">Custom</option>
                    {inkPairsByGame().map((group) => (
                      <optgroup key={group.game} label={group.game}>
                        {group.pairs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <div className="flex items-end gap-2">
                  <input
                    type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
                    className={swatchClass} title="First ink"
                  />
                  <button
                    onClick={() => { setAccent(secondary); setSecondary(accent); }}
                    className={miniButton} title="Swap the inks"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)}
                    className={swatchClass} title="Second ink"
                  />
                  <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className={inputClass}>
                    {CARD_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>

                <label className="text-xs text-slate-400 block">
                  Title
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className={inputClass} />
                </label>
                <label className="text-xs text-slate-400 block">
                  Caption
                  <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} className={inputClass} />
                </label>
                <label className="text-xs text-slate-400 block">
                  Free square says
                  <input value={freeText} onChange={(e) => setFreeText(e.target.value)} maxLength={24} className={inputClass} />
                </label>
                <Check2 checked={credits} onChange={setCredits} label="Credit each suggester" />

                <div className="flex flex-wrap gap-2">
                  <button onClick={savePng} className={secondaryButton}>
                    <Download className="w-4 h-4" /> PNG
                  </button>
                  <button onClick={saveCard} className={secondaryButton}>
                    <Download className="w-4 h-4" /> {FILE_EXTENSION}
                  </button>
                  <select
                    value={encoding}
                    onChange={(e) => setEncoding(e.target.value as Encoding)}
                    className={`${inputClass} w-auto`}
                  >
                    {ENCODINGS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
              </Panel>

              <Panel title="Counters">
                <Counters
                  counters={counters}
                  onBump={bump}
                  onAdd={addCounter}
                  onDrop={dropCounter}
                />
              </Panel>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      onClick={() => input.current?.click()}
      className={`rounded-2xl border-2 border-dashed p-16 text-center cursor-pointer transition-colors ${
        over ? "border-indigo-400 bg-indigo-900/20" : "border-slate-600/60 bg-slate-900/30 hover:border-slate-500"}`}
    >
      <Upload className="w-8 h-8 mx-auto mb-3 text-slate-400" />
      <p className="text-slate-200 font-medium">Drop a {FILE_EXTENSION} card here</p>
      <p className="text-sm text-slate-500 mt-1">or click to pick one</p>
      <input
        ref={input}
        type="file"
        accept={`${FILE_EXTENSION},.json,.txt`}
        className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); }}
      />
    </div>
  );
}

function Counters({ counters, onBump, onAdd, onDrop }: {
  counters: Counter[];
  onBump: (id: string, by: number) => void;
  onAdd: () => void;
  onDrop: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
        {counters.map((counter) => (
          <div key={counter.id} className="flex items-center gap-1 rounded-lg bg-slate-800/70 border border-slate-700/50 px-2 py-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">{counter.label}</span>
            <button onClick={() => onBump(counter.id, -1)} className={iconButton} title="Down one">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-lg font-bold text-slate-100 w-8 text-center tabular-nums">{counter.value}</span>
            <button onClick={() => onBump(counter.id, 1)} className={iconButton} title="Up one">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDrop(counter.id)} className={iconButton} title="Remove this counter">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      <button onClick={onAdd} className={miniButton}>
        <Plus className="w-3.5 h-3.5" /> Add a counter
      </button>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </section>
  );
}

function Check2({ checked, onChange, label, note }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  note?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-indigo-500"
      />
      <span>
        {label}
        {note && <span className="block text-[11px] text-slate-500">{note}</span>}
      </span>
    </label>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-sm text-slate-200 " +
  "placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors";

const swatchClass =
  "w-full h-[38px] rounded-lg bg-slate-900/60 border border-slate-700 cursor-pointer";

const primaryButton =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 " +
  "disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors";

const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 " +
  "text-slate-100 text-sm font-medium transition-colors";

const miniButton =
  "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-300 " +
  "bg-slate-800/80 hover:bg-slate-700 transition-colors";

const iconButton =
  "p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors";
