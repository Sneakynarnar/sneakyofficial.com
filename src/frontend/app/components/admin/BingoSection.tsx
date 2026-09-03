import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Check, Dices, Download, EyeOff, Grid3x3, Loader2, Pencil, Plus, RefreshCw,
  Save, Search, ThumbsDown, ThumbsUp, Trash2, Undo2, X,
} from "lucide-react";
import {
  CARD_THEMES, cardToPngBlob, drawBingoCard,
  type BingoCell, type DrawOptions,
} from "./bingoCanvas";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

type Status = "pending" | "approved" | "rejected";

interface Suggestion {
  id: number;
  /** Discord snowflakes arrive as strings; they overflow a JS number. */
  discord_id: string;
  message_id: string;
  display_name: string;
  position: number;
  suggestion: string;
  status: Status;
  reject_category: string | null;
  reject_reason: string | null;
  reviewed_at: string | null;
  excluded: boolean;
  used: boolean;
  used_card_id: number | null;
  used_card_name: string | null;
  /** Typed into this page rather than posted in the Discord channel. */
  manual: boolean;
  created_at: string | null;
}

interface SavedCard {
  id: number;
  name: string;
  card_rows: number;
  card_cols: number;
  free_space: boolean;
  cells: BingoCell[];
  created_at: string | null;
}

interface Stats {
  total: number;
  used: number;
  excluded: number;
  pending: number;
  approved: number;
  rejected: number;
  available: number;
  submitters: number;
  cards: number;
}

interface RejectCategory {
  id: string;
  label: string;
  explanation: string;
}

type Filter = "pending" | "available" | "rejected" | "excluded" | "used" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending",   label: "To review" },
  { id: "available", label: "Ready"     },
  { id: "rejected",  label: "Rejected"  },
  { id: "excluded",  label: "Excluded"  },
  { id: "used",      label: "Used"      },
  { id: "all",       label: "All"       },
];

/** A suggestion is drawable only once approved and not spent or excluded. */
const isReady = (s: Suggestion) => s.status === "approved" && !s.excluded && !s.used;

const SIZES = [2, 3, 4, 5, 6, 7, 8];

export default function BingoSection() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [cards, setCards]             = useState<SavedCard[]>([]);
  const [stats, setStats]             = useState<Stats | null>(null);
  const [categories, setCategories]   = useState<RejectCategory[]>([]);
  const [loading, setLoading]         = useState(true);
  const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null);

  const flash = useCallback((text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/bingo/admin`, {
        params: GUILD_ID ? { guild_id: GUILD_ID } : {},
        withCredentials: true,
      });
      setSuggestions(data.suggestions ?? []);
      setCards(data.cards ?? []);
      setStats(data.stats ?? null);
      setCategories(data.reject_categories ?? []);
    } catch {
      flash("Couldn't load the bingo pool.", false);
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading suggestions…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {msg && (
        <div className={`text-sm px-3 py-2 rounded border ${
          msg.ok ? "bg-green-900/40 text-green-300 border-green-700/40"
                 : "bg-red-900/40 text-red-300 border-red-700/40"}`}>
          {msg.text}
        </div>
      )}

      {stats && <StatsRow stats={stats} />}

      <ResyncBar onDone={load} flash={flash} />

      <CardStudio suggestions={suggestions} onSaved={load} flash={flash} />

      <SuggestionPool
        suggestions={suggestions}
        categories={categories}
        onChanged={load}
        flash={flash}
      />

      {cards.length > 0 && <SavedCards cards={cards} onChanged={load} flash={flash} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Headline counts                                                    */
/* ------------------------------------------------------------------ */

function StatsRow({ stats }: { stats: Stats }) {
  const tiles: { label: string; value: number; tone: string }[] = [
    { label: "To review",   value: stats.pending,    tone: "text-violet-300"  },
    { label: "Ready",       value: stats.available,  tone: "text-emerald-300" },
    { label: "Rejected",    value: stats.rejected,   tone: "text-red-300"     },
    { label: "Used",        value: stats.used,       tone: "text-sky-300"     },
    { label: "Excluded",    value: stats.excluded,   tone: "text-amber-300"   },
    { label: "Total",       value: stats.total,      tone: "text-slate-200"   },
    { label: "Submitters",  value: stats.submitters, tone: "text-slate-200"   },
    { label: "Cards made",  value: stats.cards,      tone: "text-slate-200"   },
  ];
  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2">
          <div className={`text-xl font-bold ${t.tone}`}>{t.value}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Discord catch-up                                                   */
/* ------------------------------------------------------------------ */

function ResyncBar({ onDone, flash }: { onDone: () => void; flash: (t: string, ok: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [tidy, setTidy] = useState(true);

  const resync = async () => {
    if (tidy && !confirm(
      "This will DM people about anything the bot missed, and delete messages it " +
      "can't use once the author has been sent their text back. Continue?"
    )) return;

    setBusy(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/bingo/admin/resync`,
        { notify: tidy },
        { withCredentials: true },
      );
      flash(data.message ?? "Resynced.", data.ok !== false);
      if (data.ok !== false) onDone();
    } catch {
      flash("Couldn't reach the bot to resync.", false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/40">
      <p className="text-xs text-slate-400 flex-1 min-w-[220px]">
        The bot catches up automatically on startup. Run this to pull in anything posted
        since and go back over every submission correcting its reactions
        (✅ read · 👁️ awaiting review · ☑️ all approved · 🔶❌ partly approved ·
        ❌ nothing approved).
      </p>
      <label className="flex items-center gap-1.5 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={tidy}
          onChange={(e) => setTidy(e.target.checked)}
          className="accent-indigo-500"
        />
        DM people and tidy the channel
      </label>
      <button onClick={resync} disabled={busy} className={miniButton}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Catch up now
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card studio                                                        */
/* ------------------------------------------------------------------ */

interface StudioProps {
  suggestions: Suggestion[];
  onSaved: () => void;
  flash: (text: string, ok: boolean) => void;
}

function CardStudio({ suggestions, onSaved, flash }: StudioProps) {
  const [rows, setRows]           = useState(5);
  const [cols, setCols]           = useState(5);
  const [freeSpace, setFreeSpace] = useState(true);
  const [title, setTitle]         = useState("Splatoon Bingo");
  const [subtitle, setSubtitle]   = useState("");
  const [accent, setAccent]       = useState("#7e32f0");
  const [themeId, setThemeId]     = useState(CARD_THEMES[0].id);
  const [credits, setCredits]     = useState(true);
  const [cells, setCells]         = useState<BingoCell[] | null>(null);
  const [drawing, setDrawing]     = useState(false);
  const [saving, setSaving]       = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const theme = CARD_THEMES.find((t) => t.id === themeId) ?? CARD_THEMES[0];
  const oddDimensions = rows % 2 === 1 && cols % 2 === 1;
  const available = suggestions.filter(isReady).length;
  const needed = rows * cols - (freeSpace && oddDimensions ? 1 : 0);

  // A free space needs a middle square, so an even dimension rules it out.
  useEffect(() => {
    if (!oddDimensions && freeSpace) setFreeSpace(false);
  }, [oddDimensions, freeSpace]);

  const drawOptions: DrawOptions | null = useMemo(() => (
    cells ? { cells, rows, cols, title, subtitle, accent, theme, showCredits: credits } : null
  ), [cells, rows, cols, title, subtitle, accent, theme, credits]);

  useEffect(() => {
    if (canvasRef.current && drawOptions) drawBingoCard(canvasRef.current, drawOptions);
  }, [drawOptions]);

  const draw = async () => {
    setDrawing(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/bingo/admin/draw`,
        {
          rows, cols,
          free_space: freeSpace && oddDimensions,
          guild_id: GUILD_ID || null,
        },
        { withCredentials: true },
      );
      if (data.ok) {
        setCells(data.cells);
        flash(data.message ?? "Card drawn.", true);
      } else {
        flash(data.message ?? "Couldn't draw a card.", false);
      }
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : null;
      flash(message ?? "Couldn't draw a card.", false);
    } finally {
      setDrawing(false);
    }
  };

  const download = async () => {
    if (!drawOptions) return;
    const blob = await cardToPngBlob(drawOptions);
    if (!blob) { flash("Couldn't render the PNG.", false); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title.trim() || "bingo-card").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${rows}x${cols}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const save = async () => {
    if (!cells) return;
    setSaving(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/bingo/admin/card`,
        {
          name: title, rows, cols,
          free_space: freeSpace && oddDimensions,
          cells,
        },
        { withCredentials: true },
      );
      flash(data.message ?? (data.ok ? "Card saved." : "Couldn't save."), data.ok);
      if (data.ok) { setCells(null); onSaved(); }
    } catch {
      flash("Couldn't save the card.", false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-2">
        <Grid3x3 className="w-4 h-4 text-slate-400" /> Card studio
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Draw a random card from the available pool, tweak how it looks, then download the PNG.
        Saving the card marks its squares as used so they never turn up on a future card.
      </p>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* Controls */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rows">
              <select value={rows} onChange={(e) => setRows(Number(e.target.value))} className={inputClass}>
                {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Columns">
              <select value={cols} onChange={(e) => setCols(Number(e.target.value))} className={inputClass}>
                {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={60} />
          </Field>

          <Field label="Caption (optional)">
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Episode 1 — Sneaky vs friend"
              className={inputClass}
              maxLength={80}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Theme">
              <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className={inputClass}>
                {CARD_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Accent">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-full h-[38px] rounded-lg bg-slate-900/60 border border-slate-700 cursor-pointer"
              />
            </Field>
          </div>

          <label className={`flex items-center gap-2 text-sm ${oddDimensions ? "text-slate-300" : "text-slate-600"}`}>
            <input
              type="checkbox"
              checked={freeSpace && oddDimensions}
              disabled={!oddDimensions}
              onChange={(e) => setFreeSpace(e.target.checked)}
              className="accent-indigo-500"
            />
            Free space in the middle
            {!oddDimensions && <span className="text-[11px] text-slate-600">(needs odd rows and columns)</span>}
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={credits}
              onChange={(e) => setCredits(e.target.checked)}
              className="accent-indigo-500"
            />
            Credit each suggester on their square
          </label>

          <div className={`text-xs px-3 py-2 rounded border ${
            available >= needed
              ? "bg-slate-900/40 text-slate-400 border-slate-700/50"
              : "bg-amber-900/30 text-amber-300 border-amber-700/40"}`}>
            This card needs <strong>{needed}</strong> squares and <strong>{available}</strong> approved
            suggestion{available === 1 ? " is" : "s are"} ready. Only approved squares are drawn.
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={draw} disabled={drawing} className={primaryButton}>
              {drawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />}
              {cells ? "Redraw" : "Draw card"}
            </button>
            <button onClick={download} disabled={!cells} className={secondaryButton}>
              <Download className="w-4 h-4" /> PNG
            </button>
            <button onClick={save} disabled={!cells || saving} className={secondaryButton}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save &amp; mark used
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 flex items-center justify-center min-h-[280px]">
          {cells ? (
            <canvas ref={canvasRef} className="max-w-full h-auto rounded shadow-lg" />
          ) : (
            <p className="text-sm text-slate-500 text-center">
              Draw a card to preview it here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Suggestion pool                                                    */
/* ------------------------------------------------------------------ */

interface PoolProps {
  suggestions: Suggestion[];
  categories: RejectCategory[];
  onChanged: () => void;
  flash: (text: string, ok: boolean) => void;
}

function SuggestionPool({ suggestions, categories, onChanged, flash }: PoolProps) {
  const [filter, setFilter]     = useState<Filter>("available");
  const [query, setQuery]       = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingId, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [rejecting, setRejecting] = useState<number[] | null>(null);
  const [category, setCategory] = useState("");
  const [reason, setReason]     = useState("");
  const [busy, setBusy]         = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return suggestions.filter((s) => {
      if (filter === "pending" && s.status !== "pending") return false;
      if (filter === "available" && !isReady(s)) return false;
      if (filter === "rejected" && s.status !== "rejected") return false;
      if (filter === "excluded" && !s.excluded) return false;
      if (filter === "used" && !s.used) return false;
      if (!needle) return true;
      return s.suggestion.toLowerCase().includes(needle)
        || s.display_name.toLowerCase().includes(needle);
    });
  }, [suggestions, filter, query]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const post = async (path: string, body: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/bingo/admin/${path}`, body, { withCredentials: true });
      flash(data.message ?? (data.ok ? success : "That didn't work."), data.ok !== false);
      if (data.ok !== false) { setSelected(new Set()); onChanged(); }
    } catch {
      flash("That didn't work.", false);
    } finally {
      setBusy(false);
    }
  };

  const ids = [...selected];

  return (
    <section className="border-t border-slate-700/40 pt-6">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Suggestion pool</h3>
      <p className="text-xs text-slate-500 mb-4">
        Excluded suggestions stay in the database but never get drawn. Used ones were
        consumed by a saved card; release one to put it back in the pool.
      </p>

      <AddSuggestions onAdded={onChanged} flash={flash} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 p-1 rounded-lg bg-slate-800/60 border border-slate-700/50">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filter === f.id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search suggestions or people…"
            className={`${inputClass} pl-8`}
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <span className="text-xs text-slate-400 px-1">{selected.size} selected</span>
          <button
            disabled={busy}
            onClick={() => post("review", { ids, status: "approved" }, "Approved.")}
            className={`${miniButton} !text-emerald-300 hover:!bg-emerald-900/40`}
          >
            <ThumbsUp className="w-3.5 h-3.5" /> Approve
          </button>
          <button disabled={busy} onClick={() => { setRejecting(ids); setCategory(""); setReason(""); }} className={`${miniButton} !text-red-300 hover:!bg-red-900/40`}>
            <ThumbsDown className="w-3.5 h-3.5" /> Decline
          </button>
          <button disabled={busy} onClick={() => post("exclude", { ids, excluded: true }, "Excluded.")} className={miniButton}>
            <EyeOff className="w-3.5 h-3.5" /> Exclude
          </button>
          <button disabled={busy} onClick={() => post("exclude", { ids, excluded: false }, "Restored.")} className={miniButton}>
            <Undo2 className="w-3.5 h-3.5" /> Restore
          </button>
          <button disabled={busy} onClick={() => post("used", { ids, used: false }, "Released.")} className={miniButton}>
            <Check className="w-3.5 h-3.5" /> Mark unused
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (confirm(`Permanently delete ${selected.size} suggestion(s)?`)) {
                post("delete", { ids }, "Deleted.");
              }
            }}
            className={`${miniButton} !text-red-300 hover:!bg-red-900/40`}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className={miniButton}>
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {rejecting && (
        <div className="mb-3 p-3 rounded-lg bg-red-950/30 border border-red-800/40">
          <p className="text-xs text-slate-300 mb-2">
            Why {rejecting.length === 1 ? "isn't this one" : `aren't these ${rejecting.length}`} going
            on a card? The submitter gets this by DM, and the suggestion stops
            counting towards their allowance.
          </p>

          <div className="flex flex-wrap gap-1.5 mb-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                title={c.explanation || "Write your own explanation below"}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  category === c.id
                    ? "bg-red-900/50 text-red-200 border-red-600/60"
                    : "bg-slate-800/80 text-slate-300 border-transparent hover:bg-slate-700"}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {category && (
            <p className="text-[11px] text-slate-400 mb-2 italic">
              {categories.find((c) => c.id === category)?.explanation
                || "Nothing is sent unless you write it below."}
            </p>
          )}

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder={
              category === "other"
                ? "Required: explain the decision in your own words."
                : "Optional: anything to add, in your own words."
            }
            className={`${inputClass} resize-y`}
          />

          <div className="flex flex-wrap gap-2 mt-2">
            <button
              disabled={busy || !category || (category === "other" && reason.trim().length < 3)}
              onClick={async () => {
                await post("review", { ids: rejecting, status: "rejected", category, reason }, "Declined.");
                setRejecting(null);
                setCategory("");
                setReason("");
              }}
              className={`${miniButton} !text-red-300 hover:!bg-red-900/40`}
            >
              <ThumbsDown className="w-3.5 h-3.5" /> Decline and tell them
            </button>
            <button
              onClick={() => { setRejecting(null); setCategory(""); setReason(""); }}
              className={miniButton}
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">
          {suggestions.length === 0
            ? "No suggestions yet. They'll appear here as people post in the channel."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((s) => (
            <li
              key={s.id}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg border transition-colors ${
                selected.has(s.id)
                  ? "bg-indigo-900/30 border-indigo-600/50"
                  : "bg-slate-900/40 border-slate-700/40 hover:border-slate-600/60"}`}
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggle(s.id)}
                className="mt-1 accent-indigo-500 shrink-0"
              />
              <div className="flex-1 min-w-0">
                {editingId === s.id ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={`${inputClass} flex-1 min-w-[200px]`}
                      maxLength={200}
                      autoFocus
                    />
                    <button
                      className={miniButton}
                      onClick={async () => {
                        await post("edit", { id: s.id, text: editText }, "Updated.");
                        setEditing(null);
                      }}
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button className={miniButton} onClick={() => setEditing(null)}>
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                ) : (
                  <p className={`text-sm leading-snug ${s.excluded || s.used ? "text-slate-500" : "text-slate-200"}`}>
                    {s.suggestion}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>{s.display_name}</span>
                  {s.manual && <span className="text-slate-400">added here</span>}
                  <StatusBadge status={s.status} />
                  {s.excluded && <span className="text-amber-400">excluded</span>}
                  {s.used && (
                    <span className="text-sky-400">
                      used{s.used_card_name ? ` on ${s.used_card_name}` : ""}
                    </span>
                  )}
                </p>
                {s.status === "rejected" && (s.reject_category || s.reject_reason) && (
                  <p className="text-[11px] text-red-300/80 mt-1 italic">
                    {categories.find((c) => c.id === s.reject_category)?.label ?? "Declined"}
                    {s.reject_reason ? ` — ${s.reject_reason}` : ""}
                  </p>
                )}
              </div>
              {editingId !== s.id && (
                <div className="flex items-center gap-1 shrink-0">
                  {s.status !== "approved" && (
                    <button
                      title="Approve for the card pool"
                      className={`${iconButton} hover:!text-emerald-300`}
                      disabled={busy}
                      onClick={() => post("review", { ids: [s.id], status: "approved" }, "Approved.")}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {s.status !== "rejected" && (
                    <button
                      title="Reject and tell the submitter why"
                      className={`${iconButton} hover:!text-red-300`}
                      disabled={busy}
                      onClick={() => { setRejecting([s.id]); setCategory(""); setReason(""); }}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    title="Edit wording"
                    className={iconButton}
                    onClick={() => { setEditing(s.id); setEditText(s.suggestion); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title={s.excluded ? "Put back in the pool" : "Exclude from draws"}
                    className={iconButton}
                    disabled={busy}
                    onClick={() => post("exclude", { ids: [s.id], excluded: !s.excluded },
                      s.excluded ? "Restored." : "Excluded.")}
                  >
                    {s.excluded ? <Undo2 className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Adding your own                                                    */
/* ------------------------------------------------------------------ */

function AddSuggestions({ onAdded, flash }: {
  onAdded: () => void;
  flash: (text: string, ok: boolean) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [text, setText]       = useState("");
  const [author, setAuthor]   = useState("");
  const [approve, setApprove] = useState(true);
  const [busy, setBusy]       = useState(false);

  const lines = text.split("\n").filter((line) => line.trim()).length;

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/bingo/admin/add`,
        { text, author, approved: approve, guild_id: GUILD_ID || null },
        { withCredentials: true },
      );
      flash(data.message ?? "Added.", data.ok !== false);
      if (data.ok !== false) { setText(""); onAdded(); }
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : null;
      flash(message ?? "Couldn't add those.", false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${miniButton} mb-3`}>
        <Plus className="w-3.5 h-3.5" /> Add my own suggestions
      </button>
    );
  }

  return (
    <div className="mb-3 p-3 rounded-lg bg-slate-900/40 border border-slate-700/50">
      <p className="text-xs text-slate-400 mb-2">
        One per line. Numbered or bulleted lists work too, and anything already in
        the pool word for word is skipped.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        autoFocus
        placeholder={"Splat a Booyah Bomb out of the air\nWin a match without dying"}
        className={`${inputClass} resize-y font-mono text-[13px]`}
      />

      <div className="flex flex-wrap items-center gap-3 mt-2">
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          maxLength={100}
          placeholder="Credit as (defaults to you)"
          className={`${inputClass} flex-1 min-w-[200px]`}
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={approve}
            onChange={(e) => setApprove(e.target.checked)}
            className="accent-indigo-500"
          />
          Approve straight away
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button disabled={busy || lines === 0} onClick={submit} className={primaryButton}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add {lines || ""} {lines === 1 ? "suggestion" : "suggestions"}
        </button>
        <button onClick={() => { setOpen(false); setText(""); }} className={miniButton}>
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <span className="text-[11px] text-slate-500">
          These sit outside the ten-per-person limit.
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Saved cards                                                        */
/* ------------------------------------------------------------------ */

function SavedCards({ cards, onChanged, flash }: {
  cards: SavedCard[];
  onChanged: () => void;
  flash: (text: string, ok: boolean) => void;
}) {
  const remove = async (card: SavedCard, release: boolean) => {
    try {
      const { data } = await axios.post(
        `${API_URL}/api/bingo/admin/card/delete`,
        { card_id: card.id, release },
        { withCredentials: true },
      );
      flash(data.message ?? "Card deleted.", data.ok !== false);
      if (data.ok !== false) onChanged();
    } catch {
      flash("Couldn't delete that card.", false);
    }
  };

  const download = async (card: SavedCard) => {
    const blob = await cardToPngBlob({
      cells: card.cells,
      rows: card.card_rows,
      cols: card.card_cols,
      title: card.name,
      subtitle: "",
      accent: "#7e32f0",
      theme: CARD_THEMES[0],
      showCredits: true,
    });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="border-t border-slate-700/40 pt-6">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Saved cards</h3>
      <p className="text-xs text-slate-500 mb-4">
        Deleting a card can hand its squares back to the pool, if you'd rather they
        stayed in the running.
      </p>
      <ul className="flex flex-col gap-1.5">
        {cards.map((card) => (
          <li key={card.id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/40">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 truncate">{card.name}</p>
              <p className="text-[11px] text-slate-500">
                {card.card_rows}×{card.card_cols}
                {card.free_space ? " · free space" : ""}
                {card.created_at ? ` · ${new Date(card.created_at).toLocaleDateString("en-GB")}` : ""}
              </p>
            </div>
            <button className={miniButton} onClick={() => download(card)}>
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
            <button
              className={miniButton}
              onClick={() => { if (confirm("Delete this card and return its squares to the pool?")) remove(card, true); }}
            >
              <Undo2 className="w-3.5 h-3.5" /> Delete &amp; release
            </button>
            <button
              className={`${miniButton} !text-red-300 hover:!bg-red-900/40`}
              onClick={() => { if (confirm("Delete this card and keep its squares marked used?")) remove(card, false); }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared bits                                                        */
/* ------------------------------------------------------------------ */

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-sm text-slate-200 " +
  "placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors";

const primaryButton =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 " +
  "disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors";

const secondaryButton =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 " +
  "disabled:opacity-40 disabled:cursor-not-allowed text-slate-100 text-sm font-medium transition-colors";

const miniButton =
  "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-300 " +
  "bg-slate-800/80 hover:bg-slate-700 disabled:opacity-50 transition-colors";

const iconButton =
  "p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 " +
  "disabled:opacity-40 transition-colors";

function StatusBadge({ status }: { status: Status }) {
  const tone = status === "approved"
    ? "text-emerald-400"
    : status === "rejected"
    ? "text-red-400"
    : "text-violet-400";
  const label = status === "pending" ? "awaiting review" : status;
  return <span className={tone}>{label}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
