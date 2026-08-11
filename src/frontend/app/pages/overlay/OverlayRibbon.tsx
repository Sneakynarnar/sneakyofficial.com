import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL  = import.meta.env.VITE_API_URL  ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const DISCORD  = "discord.gg/gmJeQefe5X";
const PRIVATE_BATTLE_ICON = "/S2_Icon_Private_Battle.svg";
const ANARCHY_OPEN_ICON   = "/S2_Icon_Ranked_Battle.svg";

// ── Overlay settings ──────────────────────────────────────────────────────────

interface OverlaySettings {
  ribbon_mode: "idle" | "active" | "open_lobby";
  open_lobby_match_type: "open_battle" | "private_battle";
  // Anarchy Open uses one mode across both maps
  open_lobby_stage: string | null;
  open_lobby_mode_id: string | null;
  open_lobby_mode_name: string | null;
  open_lobby_stage_2: string | null;
  open_lobby_room_code: string | null;
  lobby_pool: string | null;
  // Private battle rotation
  private_rotation_mode_id: string | null;
  private_games_until_reset: number;
}

const DEFAULT_SETTINGS: OverlaySettings = {
  ribbon_mode: "open_lobby",
  open_lobby_match_type: "open_battle",
  open_lobby_stage: null,
  open_lobby_mode_id: null,
  open_lobby_mode_name: null,
  open_lobby_stage_2: null,
  open_lobby_room_code: null,
  lobby_pool: null,
  private_rotation_mode_id: null,
  private_games_until_reset: 0,
};

function parseSettings(data: Record<string, unknown>): OverlaySettings {
  return {
    ribbon_mode:               (data.ribbon_mode as OverlaySettings["ribbon_mode"]) ?? "open_lobby",
    open_lobby_match_type:     (data.open_lobby_match_type as OverlaySettings["open_lobby_match_type"]) ?? "open_battle",
    open_lobby_stage:          (data.open_lobby_stage as string | null) ?? null,
    open_lobby_mode_id:        (data.open_lobby_mode_id as string | null) ?? null,
    open_lobby_mode_name:      (data.open_lobby_mode_name as string | null) ?? null,
    open_lobby_stage_2:        (data.open_lobby_stage_2 as string | null) ?? null,
    open_lobby_room_code:      (data.open_lobby_room_code as string | null) ?? null,
    lobby_pool:                (data.lobby_pool as string | null) ?? null,
    private_rotation_mode_id:  (data.private_rotation_mode_id as string | null) ?? null,
    private_games_until_reset: (data.private_games_until_reset as number) ?? 0,
  };
}

// ── Tournament map pool ticker ────────────────────────────────────────────────

interface PoolEntry { modeId: string; modeName: string; modeIcon: string; stageName: string; stageImage: string }

const POOL_TICK_MS = 3200;
const POOL_FADE_MS = 300;

/** Cycles the tournament map pool a page at a time — `pageSize` chips per page. */
function usePoolTicker(pageSize: number) {
  const [entries, setEntries] = useState<PoolEntry[]>([]);
  const [page,    setPage]    = useState(0);
  const [visible, setVisible] = useState(true);

  const fetchPool = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay/map-pool`, { params: { guild_id: GUILD_ID } });
      const pool: Record<string, string[]> = data.pool ?? {};
      const flat: PoolEntry[] = [];
      for (const [modeId, stages] of Object.entries(pool)) {
        const mode = MODES.find((m) => m.id === modeId);
        if (!mode) continue;
        for (const stageName of stages) {
          const stage = STAGES.find((s) => s.name === stageName);
          if (stage) flat.push({ modeId, modeName: mode.name, modeIcon: mode.icon, stageName, stageImage: stage.image });
        }
      }
      setEntries(flat);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchPool(); const t = setInterval(fetchPool, 30_000); return () => clearInterval(t); }, [fetchPool]);

  const size      = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(entries.length / size));

  useEffect(() => { setPage(0); }, [pageCount]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setPage((p) => (p + 1) % pageCount); setVisible(true); }, POOL_FADE_MS + 20);
    }, POOL_TICK_MS);
    return () => clearInterval(t);
  }, [pageCount]);

  const safePage = page % pageCount;
  const start    = safePage * size;
  return { page: entries.slice(start, start + size), visible, total: entries.length };
}

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface Team { id: number; name: string; members: string[]; captain: string | null }
interface GameMap { game_number: number; stage_name: string | null }

interface OverlayMatchData {
  match_id: number;
  round: number;
  total_rounds: number;
  tournament_name: string;
  status: string;
  team1: Team;
  team2: Team;
  team1_games: number;
  team2_games: number;
  best_of: number;
  stage_name: string | null;
  mode_name: string | null;
  games: GameMap[];
  game_results: { game_number: number; winner: 1 | 2 }[];
}

function getRoundLabel(round: number, total: number): string {
  if (round === total) return "FINAL";
  if (round === total - 1 && total > 2) return "SEMIS";
  return `ROUND ${round}`;
}

// ── Idle slides ────────────────────────────────────────────────────────────────

const IDLE_SLIDES = [
  { icon: "🎮", left: "sneakyonnightmode", right: "twitch.tv/sneakyonnightmode", accent: "rgba(145,70,255,0.85)" },
  { icon: "🟣", left: "TWITCH  →  !splattag YourName#1234", right: "then  !in  to enter", accent: "rgba(145,70,255,0.85)" },
  { icon: "4️⃣", left: "Need to link Discord first?", right: "/profile link twitch:yourname  in Discord", accent: "rgba(145,70,255,0.70)" },
  { icon: "💬", left: "YouTube / TikTok viewers:", right: `Join ${DISCORD}  →  /tournament signup`, accent: "rgba(88,101,242,0.90)" },
  { icon: "🌐", left: "In a match?", right: "sneakyofficial.com/tournament  ·  confirm results here", accent: "rgba(52,211,153,0.75)" },
];
const SLIDE_MS = 4500;
const FADE_MS  = 320;

function useIdleSlide() {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % IDLE_SLIDES.length); setVisible(true); }, FADE_MS + 20);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, []);
  return { slide: IDLE_SLIDES[idx], visible, total: IDLE_SLIDES.length, idx };
}

// ── Keyframes ─────────────────────────────────────────────────────────────────

function useRibbonKeyframes() {
  useEffect(() => {
    const id = "spl-ribbon-kf";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes splRibbonIn {
        from { opacity: 0; transform: translateY(100%); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes splRibbonScorePop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.22); }
        100% { transform: scale(1); }
      }
      @keyframes splRibbonStageSlide {
        from { opacity: 0; transform: translateX(8px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes splRibbonIconGlow {
        0%, 100% { box-shadow: 0 0 10px rgba(145,70,255,0.5), 0 0 28px rgba(145,70,255,0.25); }
        50%      { box-shadow: 0 0 20px rgba(145,70,255,0.9), 0 0 50px rgba(145,70,255,0.45), 0 0 80px rgba(145,70,255,0.15); }
      }
      @keyframes splRibbonShimmer {
        0%   { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      @keyframes splRibbonAccentCycle {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
      @keyframes splRibbonScan {
        0%   { transform: translateX(-100%); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateX(100vw); opacity: 0; }
      }
      @keyframes splRibbonIdleFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .spl-ribbon-in           { animation: splRibbonIn 0.55s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-score-pop    { animation: splRibbonScorePop 0.45s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-stage-slide  { animation: splRibbonStageSlide 0.4s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-idle-in      { animation: splRibbonIdleFadeIn 0.7s cubic-bezier(0.22,1,0.36,1) both; }
      .spl-ribbon-icon-glow    { animation: splRibbonIconGlow 2.8s ease-in-out infinite; }
      .spl-ribbon-shimmer-text {
        background: linear-gradient(90deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.85) 35%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.85) 65%, rgba(255,255,255,0.85) 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: splRibbonShimmer 3.5s linear infinite;
      }
      .spl-ribbon-scan         { animation: splRibbonScan 4.5s ease-in-out infinite; }
      .spl-ribbon-accent-cycle {
        background: linear-gradient(90deg, rgba(59,130,246,0.65), rgba(145,70,255,0.65), rgba(99,179,255,0.65), rgba(145,70,255,0.65), rgba(59,130,246,0.65));
        background-size: 200% auto;
        animation: splRibbonAccentCycle 5s linear infinite;
      }
      @keyframes splRibbonLobbyPulse {
        0%, 100% { box-shadow: 0 0 8px rgba(52,211,153,0.4), 0 0 22px rgba(52,211,153,0.18); }
        50%      { box-shadow: 0 0 18px rgba(52,211,153,0.8), 0 0 46px rgba(52,211,153,0.38), 0 0 80px rgba(52,211,153,0.12); }
      }
      @keyframes splRibbonPrivatePulse {
        0%, 100% { box-shadow: 0 0 8px rgba(145,70,255,0.4), 0 0 22px rgba(145,70,255,0.18); }
        50%      { box-shadow: 0 0 18px rgba(145,70,255,0.8), 0 0 46px rgba(145,70,255,0.38), 0 0 80px rgba(145,70,255,0.12); }
      }
      .spl-ribbon-lobby-glow   { animation: splRibbonLobbyPulse 2.4s ease-in-out infinite; }
      .spl-ribbon-private-glow { animation: splRibbonPrivatePulse 2.4s ease-in-out infinite; }
      @keyframes splResetFlash {
        0%, 100% {
          background: rgba(251,146,60,0.16);
          border-color: rgba(251,146,60,0.55);
          box-shadow: 0 0 6px rgba(251,146,60,0.35);
        }
        50% {
          background: rgba(251,146,60,0.55);
          border-color: rgba(251,146,60,1);
          box-shadow: 0 0 22px rgba(251,146,60,1), 0 0 46px rgba(251,146,60,0.45);
        }
      }
      .spl-reset-flash { animation: splResetFlash 1s ease-in-out infinite; }
      .spl-ribbon-green-cycle {
        background: linear-gradient(90deg, rgba(16,185,129,0.65), rgba(52,211,153,0.65), rgba(16,185,129,0.65));
        background-size: 200% auto;
        animation: splRibbonAccentCycle 4s linear infinite;
      }
    `;
    document.head.appendChild(el);
  }, []);
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useMatchData() {
  const [match,      setMatch]      = useState<OverlayMatchData | null>(null);
  const [settings,   setSettings]   = useState<OverlaySettings>(DEFAULT_SETTINGS);
  const [scoreFlash, setScoreFlash] = useState(false);
  const [stageKey,   setStageKey]   = useState(0);
  const scoreRef = useRef<[number, number]>([0, 0]);

  const fetchMatch = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay`, { params: { guild_id: GUILD_ID } });
      setMatch(data.match ?? null);
    } catch { /* ignore */ }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay/settings`);
      setSettings(parseSettings(data));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMatch(); fetchSettings(); }, [fetchMatch, fetchSettings]);

  useEffect(() => {
    if (!match) return;
    const cur: [number, number] = [match.team1_games, match.team2_games];
    if (cur[0] !== scoreRef.current[0] || cur[1] !== scoreRef.current[1]) {
      scoreRef.current = cur;
      setScoreFlash(true);
      setTimeout(() => setScoreFlash(false), 500);
    }
  }, [match?.team1_games, match?.team2_games]);

  useEffect(() => {
    if (!GUILD_ID) return;
    let ws: WebSocket | null = null;
    let dead = false;
    const connect = () => {
      if (dead) return;
      ws = new WebSocket(`${getWsUrl()}?guild_id=${GUILD_ID}`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (["match_pinned", "match_complete", "match_reported"].includes(msg.event)) {
            fetchMatch();
          } else if (msg.event === "game_score") {
            setMatch(prev => prev && prev.match_id === msg.match_id
              ? { ...prev, team1_games: msg.team1_games ?? 0, team2_games: msg.team2_games ?? 0, game_results: msg.game_results ?? prev.game_results }
              : prev);
          } else if (msg.event === "counterpick_stage" || msg.event === "counterpick_set") {
            setMatch(prev => {
              if (!prev || prev.match_id !== msg.match_id) return prev;
              const games = prev.games.map(g => g.game_number === msg.game_number ? { ...g, stage_name: msg.stage_name } : g);
              const currentGame = prev.team1_games + prev.team2_games + 1;
              return { ...prev, games, stage_name: msg.game_number === currentGame ? msg.stage_name : prev.stage_name };
            });
            setStageKey(k => k + 1);
          } else if (msg.event === "overlay_settings") {
            setSettings(parseSettings(msg));
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000); };
    };
    connect();
    return () => { dead = true; ws?.close(); };
  }, [fetchMatch]);

  return { match, settings, scoreFlash, stageKey };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, alignSelf: "stretch", margin: "0.9vh 0", background: "rgba(255,255,255,0.09)", flexShrink: 0 }} />;
}

function ScorePip({ filled, win }: { filled: boolean; win: boolean }) {
  return (
    <div style={{
      width: "clamp(5px,0.55vw,7px)", height: "clamp(5px,0.55vw,7px)", borderRadius: "9999px",
      border: filled ? win ? "1px solid rgba(52,211,153,0.9)" : "1px solid rgba(248,113,113,0.7)" : "1px solid rgba(255,255,255,0.15)",
      background: filled ? win ? "rgb(52,211,153)" : "rgb(248,113,113)" : "transparent",
      boxShadow: filled && win ? "0 0 5px rgba(52,211,153,0.8)" : "none",
      flexShrink: 0,
    }} />
  );
}

const CROWN = (
  <svg viewBox="0 0 20 14" style={{ width: "clamp(8px,1vw,11px)", height: "auto", flexShrink: 0 }} fill="none">
    <path d="M1 13L4 5L7.5 9L10 2L12.5 9L16 5L19 13H1Z" fill="rgb(250,204,21)" stroke="rgb(234,179,8)" strokeWidth="1" strokeLinejoin="round"/>
  </svg>
);

function PlayerTicker({ team, align, tick, tickVisible }: { team: Team; align: "left" | "right"; tick: number; tickVisible: boolean }) {
  const members = team.captain ? [team.captain, ...team.members.filter(m => m !== team.captain)] : team.members;
  const idx = members.length > 0 ? tick % members.length : 0;
  const member = members[idx] ?? "";
  const isCaptain = member === team.captain;
  return (
    <div style={{ flexShrink: 0, width: "clamp(100px,14vw,210px)", display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-end" : "flex-start", gap: "0.2vh" }}>
      <span style={{ fontSize: "clamp(6px,0.7vw,8px)", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.20)", lineHeight: 1 }}>{team.name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35vw", flexDirection: align === "left" ? "row-reverse" : "row", opacity: tickVisible ? 1 : 0, transform: tickVisible ? "translateY(0)" : `translateY(${align === "left" ? "-" : ""}4px)`, transition: "opacity 0.28s ease, transform 0.28s ease" }}>
        {isCaptain && CROWN}
        <span style={{ fontSize: "clamp(9px,1.1vw,13px)", fontWeight: isCaptain ? 800 : 500, color: isCaptain ? "rgb(250,204,21)" : "rgba(255,255,255,0.72)", textShadow: isCaptain ? "0 0 10px rgba(250,204,21,0.4)" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1, maxWidth: "clamp(90px,13vw,195px)" }}>
          {member}
        </span>
      </div>
    </div>
  );
}

// ── Map pick (right-side section) ─────────────────────────────────────────────

function MapPick({ stageName, stageKey, modeData, currentGame, bestOf }: {
  stageName: string | null;
  stageKey: number;
  modeData: { icon: string; name: string } | null | undefined;
  currentGame: number;
  bestOf: number;
}) {
  const stageData = stageName ? STAGES.find(s => s.name === stageName) : null;
  return (
    <div
      className="spl-ribbon-stage-slide"
      style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.6vw" }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", width: "clamp(60px,8vw,110px)", height: "clamp(22px,3.2vh,40px)", borderRadius: 5, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
        {stageData ? (
          <img key={`map-thumb-${stageKey}`} src={stageData.image} alt={stageName ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "clamp(8px,1vw,11px)", color: "rgba(255,255,255,0.20)" }}>?</span>
          </div>
        )}
        {/* Game label overlay — hidden in lobby mode (bestOf=0) */}
        {bestOf > 0 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.55)", padding: "1px 3px", textAlign: "center" }}>
            <span style={{ fontSize: "clamp(6px,0.7vw,8px)", fontWeight: 800, color: "rgba(255,255,255,0.70)", letterSpacing: "0.12em" }}>
              G{currentGame}{bestOf > 1 ? `/${bestOf}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Stage name + mode */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2vh", alignItems: "flex-start", minWidth: 0 }}>
        {modeData && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3vw" }}>
            <img src={modeData.icon} alt={modeData.name} style={{ width: "clamp(8px,1vw,11px)", height: "clamp(8px,1vw,11px)", objectFit: "contain", opacity: 0.60 }} />
            <span style={{ fontSize: "clamp(6px,0.7vw,8px)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", whiteSpace: "nowrap" }}>{modeData.name}</span>
          </div>
        )}
        <span style={{ fontSize: "clamp(8px,1.05vw,12px)", fontWeight: 800, color: stageName ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "clamp(70px,9vw,130px)" }}>
          {stageName ?? "Counterpick…"}
        </span>
      </div>
    </div>
  );
}

// ── Map pool chips (desktop ribbon) ──────────────────────────────────────────

function PoolChip({ entry }: { entry: PoolEntry }) {
  const stageData = STAGES.find(s => s.name === entry.stageName);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4vw", flexShrink: 0 }}>
      <div style={{ width: "clamp(44px,5vw,70px)", height: "clamp(17px,2.3vh,28px)", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", flexShrink: 0, position: "relative", background: "rgba(255,255,255,0.05)" }}>
        {stageData && <img src={stageData.image} alt={entry.stageName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        <img src={entry.modeIcon} alt={entry.modeName} style={{ position: "absolute", bottom: 1, right: 2, width: "clamp(8px,0.85vw,11px)", height: "clamp(8px,0.85vw,11px)", objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))" }} />
      </div>
      <span style={{ fontSize: "clamp(8px,0.9vw,11px)", fontWeight: 700, color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "clamp(54px,6.5vw,94px)" }}>
        {entry.stageName}
      </span>
    </div>
  );
}

function PoolStrip({ page, visible }: { page: PoolEntry[]; visible: boolean }) {
  if (page.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(4px)", transition: `opacity ${POOL_FADE_MS}ms ease, transform ${POOL_FADE_MS}ms ease` }}>
      {page.map((e) => <PoolChip key={`${e.modeId}-${e.stageName}`} entry={e} />)}
    </div>
  );
}

export default function OverlayRibbon() {
  useRibbonKeyframes();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const { match, settings, scoreFlash, stageKey } = useMatchData();
  const { slide, visible, total, idx } = useIdleSlide();

  // Private battles have no map slots, so the pool ticker gets the extra room.
  const isPrivate = settings.open_lobby_match_type === "private_battle";
  const { page: poolPage, visible: poolVisible } = usePoolTicker(isPrivate ? 3 : 1);

  const [tickSignal,  setTickSignal]  = useState(0);
  const [tickVisible, setTickVisible] = useState(true);

  const maxMembers = match ? Math.max(
    (match.team1.captain ? [match.team1.captain, ...match.team1.members.filter(m => m !== match.team1.captain)] : match.team1.members).length,
    (match.team2.captain ? [match.team2.captain, ...match.team2.members.filter(m => m !== match.team2.captain)] : match.team2.members).length,
  ) : 0;

  useEffect(() => {
    if (maxMembers <= 1) return;
    const t = setInterval(() => {
      setTickVisible(false);
      setTimeout(() => { setTickSignal(s => s + 1); setTickVisible(true); }, 280);
    }, 2800);
    return () => clearInterval(t);
  }, [maxMembers]);

  // ── Open Lobby ────────────────────────────────────────────────────────────
  if (settings.ribbon_mode === "open_lobby") {
    const lobbyCode  = settings.open_lobby_room_code;
    const lobbyPool  = settings.lobby_pool;
    const lobbyStage  = settings.open_lobby_stage;
    const lobbyModeId = settings.open_lobby_mode_id;
    const lobbyStage2  = settings.open_lobby_stage_2;
    const stageData  = lobbyStage  ? STAGES.find(s => s.name === lobbyStage)  : null;
    const modeData   = lobbyModeId ? MODES.find(m => m.id === lobbyModeId)   : null;
    const stageData2 = lobbyStage2  ? STAGES.find(s => s.name === lobbyStage2)  : null;
    // Private battles follow the stream rotation instead of fixed map slots
    const rotationMode = settings.private_rotation_mode_id
      ? MODES.find(m => m.id === settings.private_rotation_mode_id)
      : null;
    const gamesLeft = settings.private_games_until_reset;
    const accentTop = isPrivate
      ? "linear-gradient(to right, transparent, rgba(145,70,255,0.55) 30%, rgba(145,70,255,0.55) 70%, transparent)"
      : "linear-gradient(to right, transparent, rgba(52,211,153,0.55) 30%, rgba(52,211,153,0.55) 70%, transparent)";

    return (
      <div
        data-overlay
        className="spl-ribbon-in"
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center",
          gap: "1.6vw", padding: "0 2vw",
          boxSizing: "border-box",
          background: "rgba(6,6,18,0.93)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          borderTop: isPrivate ? "1.5px solid rgba(145,70,255,0.40)" : "1.5px solid rgba(52,211,153,0.40)",
          position: "relative", overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accentTop, pointerEvents: "none" }} />
        <div className="spl-ribbon-scan" style={{ position: "absolute", top: 0, left: 0, width: "8vw", height: "100%", background: isPrivate ? "linear-gradient(to right, transparent, rgba(145,70,255,0.10), transparent)" : "linear-gradient(to right, transparent, rgba(52,211,153,0.10), transparent)", pointerEvents: "none" }} />

        {/* Logo */}
        <div
          className={isPrivate ? "spl-ribbon-private-glow" : "spl-ribbon-lobby-glow"}
          style={{ width: "clamp(28px,4vh,44px)", height: "clamp(28px,4vh,44px)", borderRadius: "50%", overflow: "hidden", border: isPrivate ? "2px solid rgba(145,70,255,0.80)" : "2px solid rgba(52,211,153,0.80)", flexShrink: 0 }}
        >
          <img src="/android-chrome-512x512.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        {/* Match type icon. Both icons have dark parts that match the ribbon's
            own background, so they get a faint outline to lift them. */}
        <img
          src={isPrivate ? PRIVATE_BATTLE_ICON : ANARCHY_OPEN_ICON}
          alt=""
          style={{
            width: "clamp(20px,3vh,34px)", height: "clamp(20px,3vh,34px)",
            objectFit: "contain", flexShrink: 0,
            filter: "drop-shadow(0 0 3px rgba(255,255,255,0.55))",
          }}
        />

        {/* Match type label */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.2vh" }}>
          <span style={{ fontSize: "clamp(6px,0.72vw,9px)", fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: isPrivate ? "rgba(145,70,255,0.90)" : "rgba(52,211,153,0.90)", whiteSpace: "nowrap" }}>
            {isPrivate ? "PRIVATE" : "ANARCHY"}
          </span>
          <span style={{ fontSize: "clamp(6px,0.65vw,8px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>
            {isPrivate ? "BATTLE" : "OPEN"}
          </span>
        </div>

        <Divider />

        {/* Pool tag — what viewers type in-game to find the room */}
        {lobbyPool && (
          <>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.15vh" }}>
              <span style={{ fontSize: "clamp(6px,0.65vw,8px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>POOL</span>
              <span style={{ fontSize: "clamp(12px,1.8vw,22px)", fontWeight: 900, fontFamily: "'Courier New', Courier, monospace", color: isPrivate ? "rgb(196,150,255)" : "rgb(110,231,183)", letterSpacing: "0.06em", lineHeight: 1, whiteSpace: "nowrap" }}>{lobbyPool}</span>
            </div>
            <Divider />
          </>
        )}

        {/* Room code */}
        {lobbyCode && (
          <>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.15vh" }}>
              <span style={{ fontSize: "clamp(6px,0.65vw,8px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>ROOM CODE</span>
              <span style={{ fontSize: "clamp(12px,1.8vw,22px)", fontWeight: 900, fontFamily: "'Courier New', Courier, monospace", color: "#fff", letterSpacing: "0.1em", lineHeight: 1 }}>{lobbyCode}</span>
            </div>
            <Divider />
          </>
        )}

        {/* Anarchy Open: one mode across both maps */}
        {!isPrivate && (stageData || modeData) && (
          <>
            <MapPick stageName={lobbyStage} stageKey={0} modeData={modeData} currentGame={1} bestOf={0} />
            {stageData2 && (
              <>
                <div style={{ width: 1, alignSelf: "stretch", margin: "0.9vh 0", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
                <MapPick stageName={lobbyStage2} stageKey={1} modeData={modeData} currentGame={2} bestOf={0} />
              </>
            )}
            <Divider />
          </>
        )}

        {/* Private battle: current rotation mode and games left before the remake */}
        {isPrivate && rotationMode && (
          <>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.6vw" }}>
              <img src={rotationMode.icon} alt={rotationMode.name} style={{ width: "clamp(16px,2.4vh,26px)", height: "clamp(16px,2.4vh,26px)", objectFit: "contain", flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.15vh" }}>
                <span style={{ fontSize: "clamp(6px,0.65vw,8px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>NOW PLAYING</span>
                <span style={{ fontSize: "clamp(11px,1.3vw,18px)", fontWeight: 900, color: "#fff", lineHeight: 1, whiteSpace: "nowrap" }}>{rotationMode.name}</span>
              </div>
            </div>
            <Divider />
            {/* Countdown to the remake, boxed so it reads at a glance. It
                flashes orange on the last game before the lobby is remade. */}
            <div
              className={gamesLeft <= 1 ? "spl-reset-flash" : undefined}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: "0.5vw",
                padding: "0.5vh 0.7vw", borderRadius: 6,
                border: gamesLeft <= 1 ? "1.5px solid rgba(251,146,60,0.95)" : "1.5px solid rgba(255,255,255,0.30)",
                background: gamesLeft <= 1 ? "rgba(251,146,60,0.18)" : "rgba(255,255,255,0.06)",
              }}
            >
              <span style={{
                fontSize: "clamp(16px,2vw,30px)", fontWeight: 900, lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                color: gamesLeft <= 1 ? "rgb(253,186,116)" : "#fff",
                textShadow: gamesLeft <= 1 ? "0 0 16px rgba(251,146,60,0.9)" : "none",
              }}>
                {gamesLeft}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.15vh" }}>
                <span style={{ fontSize: "clamp(6px,0.7vw,9px)", fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>
                  {gamesLeft === 1 ? "GAME LEFT" : "GAMES LEFT"}
                </span>
                <span style={{ fontSize: "clamp(6px,0.65vw,8px)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: gamesLeft <= 1 ? "rgb(253,186,116)" : "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
                  {gamesLeft <= 1 ? "THEN LOBBY REMAKE" : "TILL LOBBY REMAKE"}
                </span>
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* Tournament map pool ticker */}
        {poolPage.length > 0 && (
          <>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.15vh", minWidth: 0 }}>
              <span style={{ fontSize: "clamp(6px,0.65vw,8px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>MAP POOL</span>
              <PoolStrip page={poolPage} visible={poolVisible} />
            </div>
            <Divider />
          </>
        )}

        {/* Filler so layout doesn't collapse */}
        <div style={{ flex: 1 }} />

        {/* How to join */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.15vh" }}>
          <span style={{ fontSize: "clamp(8px,0.9vw,10px)", fontWeight: 700, color: "rgba(255,255,255,0.38)", whiteSpace: "nowrap" }}>
            {isPrivate ? "Enter the pool + code in-game to join" : "Search the pool in Anarchy Open to find the room"}
          </span>
          <span style={{ fontSize: "clamp(8px,0.9vw,10px)", fontWeight: 600, color: "rgba(255,255,255,0.20)", whiteSpace: "nowrap" }}>
            {DISCORD}
          </span>
        </div>
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (settings.ribbon_mode === "idle" || !match) {
    return (
      <div
        data-overlay
        className="spl-ribbon-idle-in"
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center",
          gap: "1.8vw", padding: "0 2.2vw",
          boxSizing: "border-box",
          background: "rgba(6,6,18,0.93)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          borderTop: "1.5px solid rgba(145,70,255,0.35)",
          position: "relative", overflow: "hidden",
        }}
      >
        <div className="spl-ribbon-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, pointerEvents: "none" }} />
        <div className="spl-ribbon-scan" style={{ position: "absolute", top: 0, left: 0, width: "8vw", height: "100%", background: "linear-gradient(to right, transparent, rgba(145,70,255,0.12), transparent)", pointerEvents: "none" }} />

        <div className="spl-ribbon-icon-glow" style={{ width: "clamp(28px,4vh,44px)", height: "clamp(28px,4vh,44px)", borderRadius: "50%", overflow: "hidden", border: "2px solid rgba(145,70,255,0.7)", flexShrink: 0 }}>
          <img src="/android-chrome-512x512.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "1.2vw", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(3px)", transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease` }}>
          <span style={{ fontSize: "clamp(11px,1.5vh,16px)", lineHeight: 1, flexShrink: 0 }}>{slide.icon}</span>
          <span style={{ fontSize: "clamp(10px,1.45vh,15px)", fontWeight: 700, color: "rgba(255,255,255,0.80)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slide.left}</span>
          <span style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0, fontSize: "clamp(8px,1.1vh,11px)" }}>·</span>
          <span style={{ fontSize: "clamp(10px,1.45vh,15px)", fontWeight: 600, color: slide.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>{slide.right}</span>
        </div>

        <div style={{ display: "flex", gap: "0.35vw", alignItems: "center", flexShrink: 0 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ width: i === idx ? "clamp(10px,1.4vw,14px)" : "clamp(4px,0.5vw,6px)", height: "clamp(4px,0.5vw,6px)", borderRadius: 9999, background: i === idx ? slide.accent : "rgba(255,255,255,0.15)", transition: "width 0.3s ease, background 0.3s ease" }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Active match ──────────────────────────────────────────────────────────
  const bestOf      = match.best_of ?? 1;
  const winsNeeded  = Math.ceil(bestOf / 2);
  const currentGame = match.team1_games + match.team2_games + 1;
  const roundLabel  = getRoundLabel(match.round, match.total_rounds);
  const isComplete  = match.status === "complete";
  const isT1Winner  = isComplete && match.team1_games > match.team2_games;
  const isT2Winner  = isComplete && match.team2_games > match.team1_games;
  const isLive      = !isComplete && match.status !== "awaiting_confirmation";

  const curGameMap  = match.games.find(g => g.game_number === currentGame);
  const stageName   = match.stage_name ?? curGameMap?.stage_name ?? null;
  const modeData    = match.mode_name ? MODES.find(m => m.name === match.mode_name) : null;

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  return (
    <div
      data-overlay
      className="spl-ribbon-in"
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center",
        gap: "1.6vw", padding: "0 2vw",
        boxSizing: "border-box",
        background: "rgba(6,6,18,0.91)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        borderTop: "1.5px solid rgba(255,255,255,0.08)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Cycling top accent */}
      <div
        className={!isLive && !isComplete ? "spl-ribbon-accent-cycle" : undefined}
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2, pointerEvents: "none",
          background: isLive
            ? "linear-gradient(to right, transparent, rgba(239,68,68,0.55) 30%, rgba(239,68,68,0.55) 70%, transparent)"
            : isComplete
            ? "linear-gradient(to right, transparent, rgba(52,211,153,0.40) 30%, rgba(52,211,153,0.40) 70%, transparent)"
            : undefined,
        }}
      />

      {/* Team 1 player ticker */}
      <PlayerTicker team={match.team1} align="left" tick={tickSignal} tickVisible={tickVisible} />

      <Divider />

      {/* Live / status + Round */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4vw" }}>
          {isLive && (
            <div style={{ position: "relative", width: "clamp(5px,0.55vw,6px)", height: "clamp(5px,0.55vw,6px)", flexShrink: 0 }}>
              <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
              <div className="absolute inset-0 rounded-full bg-red-500" />
            </div>
          )}
          <span style={{ fontSize: "clamp(7px,0.8vw,9px)", fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: isLive ? "rgba(239,68,68,0.90)" : isComplete ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.30)" }}>
            {isLive ? "LIVE" : isComplete ? "DONE" : "CONF"}
          </span>
        </div>
        <span style={{ fontSize: "clamp(6px,0.72vw,8px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", lineHeight: 1 }}>
          {roundLabel}{bestOf > 1 ? ` · BO${bestOf}` : ""}
        </span>
      </div>

      <Divider />

      {/* Team 1 name + pips */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3vh" }}>
        <span style={{ fontSize: "clamp(11px,1.5vw,17px)", fontWeight: 900, lineHeight: 1, color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)", textShadow: isT1Winner ? "0 0 20px rgba(52,211,153,0.5)" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {match.team1.name}
        </span>
        {bestOf > 1 && (
          <div style={{ display: "flex", gap: "0.3vw", flexDirection: "row-reverse" }}>
            {pipsT1.map((f, i) => <ScorePip key={i} filled={f} win={isT1Winner} />)}
          </div>
        )}
      </div>

      {/* Score */}
      <div className={scoreFlash ? "spl-ribbon-score-pop" : undefined} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.7vw" }}>
        <span style={{ fontSize: "clamp(18px,2.8vw,34px)", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.92)" }}>{match.team1_games}</span>
        <span style={{ fontSize: "clamp(10px,1.2vw,14px)", fontWeight: 100, color: "rgba(255,255,255,0.20)" }}>—</span>
        <span style={{ fontSize: "clamp(18px,2.8vw,34px)", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.92)" }}>{match.team2_games}</span>
      </div>

      {/* Team 2 name + pips */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.3vh" }}>
        <span style={{ fontSize: "clamp(11px,1.5vw,17px)", fontWeight: 900, lineHeight: 1, color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.90)", textShadow: isT2Winner ? "0 0 20px rgba(52,211,153,0.5)" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {match.team2.name}
        </span>
        {bestOf > 1 && (
          <div style={{ display: "flex", gap: "0.3vw" }}>
            {pipsT2.map((f, i) => <ScorePip key={i} filled={f} win={isT2Winner} />)}
          </div>
        )}
      </div>

      <Divider />

      {/* Team 2 player ticker */}
      <PlayerTicker team={match.team2} align="right" tick={tickSignal} tickVisible={tickVisible} />

      <Divider />

      {/* Map pick — right side */}
      <MapPick stageName={stageName} stageKey={stageKey} modeData={modeData} currentGame={currentGame} bestOf={bestOf} />
    </div>
  );
}
