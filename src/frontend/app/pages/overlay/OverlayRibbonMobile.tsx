import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { MODES, STAGES } from "../../components/tournament/splatoonData";

const API_URL  = import.meta.env.VITE_API_URL  ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const DISCORD  = "discord.gg/gmJeQefe5X";
// Games in the private battle rotation before the lobby is remade
const ROTATION_LENGTH = 5;

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
  return `R${round}`;
}

// ── Idle slides ────────────────────────────────────────────────────────────────

const IDLE_SLIDES = [
  { icon: "🎮", eyebrow: "sneakyonnightmode",        headline: "twitch.tv/sneakyonnightmode",          sub: null as string | null, accent: "rgba(145,70,255,0.85)" },
  { icon: "🟣", eyebrow: "WATCHING ON TWITCH? (1/2)", headline: "!splattag YourName#1234",              sub: "then join Discord & do /profile link twitch:yourname", accent: "rgba(145,70,255,0.85)" },
  { icon: "✅", eyebrow: "WATCHING ON TWITCH? (2/2)", headline: "!in  — you're entered!",               sub: "sneakyofficial.com/tournament  to confirm results", accent: "rgba(145,70,255,0.85)" },
  { icon: "💬", eyebrow: "YOUTUBE / TIKTOK?",         headline: DISCORD,                                sub: "/tournament signup  in Discord to enter", accent: "rgba(88,101,242,0.90)" },
  { icon: "🏆", eyebrow: "HOW IT WORKS",              headline: "Sign up solo · Play 4v4 · Win!",       sub: "Auto-matched into teams  ·  climb the leaderboard", accent: "rgba(52,211,153,0.75)" },
];

const SLIDE_MS = 4800;
const FADE_MS  = 360;

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

function useMobileKeyframes() {
  useEffect(() => {
    const id = "spl-mob-kf";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes mobRibbonIn {
        from { opacity: 0; transform: translateY(100%); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes mobScorePop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.18); }
        100% { transform: scale(1); }
      }
      @keyframes mobAccentCycle {
        0%   { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
      @keyframes mobIconGlow {
        0%, 100% { box-shadow: 0 0 12px rgba(145,70,255,0.6), 0 0 32px rgba(145,70,255,0.3); }
        50%      { box-shadow: 0 0 24px rgba(145,70,255,1), 0 0 60px rgba(145,70,255,0.5); }
      }
      .mob-ribbon-in  { animation: mobRibbonIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
      .mob-score-pop  { animation: mobScorePop 0.4s cubic-bezier(0.22,1,0.36,1) both; }
      .mob-icon-glow  { animation: mobIconGlow 2.8s ease-in-out infinite; }
      .mob-accent-cycle {
        background: linear-gradient(90deg, rgba(59,130,246,0.8), rgba(145,70,255,0.8), rgba(99,179,255,0.8), rgba(145,70,255,0.8), rgba(59,130,246,0.8));
        background-size: 200% auto;
        animation: mobAccentCycle 4s linear infinite;
      }
      @keyframes mobLobbyPulse {
        0%, 100% { box-shadow: 0 0 10px rgba(52,211,153,0.5), 0 0 28px rgba(52,211,153,0.25); }
        50%      { box-shadow: 0 0 22px rgba(52,211,153,1.0), 0 0 56px rgba(52,211,153,0.5); }
      }
      @keyframes mobPrivatePulse {
        0%, 100% { box-shadow: 0 0 10px rgba(145,70,255,0.5), 0 0 28px rgba(145,70,255,0.25); }
        50%      { box-shadow: 0 0 22px rgba(145,70,255,1.0), 0 0 56px rgba(145,70,255,0.5); }
      }
      @keyframes mobScan {
        0%   { transform: translateX(-100%); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateX(100vw); opacity: 0; }
      }
      .mob-lobby-glow   { animation: mobLobbyPulse 2.4s ease-in-out infinite; }
      .mob-private-glow { animation: mobPrivatePulse 2.4s ease-in-out infinite; }
      .mob-scan         { animation: mobScan 4.5s ease-in-out infinite; }
      .mob-green-cycle {
        background: linear-gradient(90deg, rgba(16,185,129,0.8), rgba(52,211,153,0.8), rgba(16,185,129,0.8));
        background-size: 200% auto;
        animation: mobAccentCycle 4s linear infinite;
      }
    `;
    document.head.appendChild(el);
  }, []);
}

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

const POOL_TICK_MS = 2600;
const POOL_FADE_MS = 300;

function usePoolTicker() {
  const [entries, setEntries] = useState<PoolEntry[]>([]);
  const [idx,     setIdx]     = useState(0);
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

  useEffect(() => {
    if (entries.length <= 1) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx((i) => (i + 1) % entries.length); setVisible(true); }, POOL_FADE_MS + 20);
    }, POOL_TICK_MS);
    return () => clearInterval(t);
  }, [entries.length]);

  const entry = entries.length > 0 ? entries[idx % entries.length] : null;
  return { entry, visible };
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useMatchData() {
  const [match,      setMatch]      = useState<OverlayMatchData | null>(null);
  const [settings,   setSettings]   = useState<OverlaySettings>(DEFAULT_SETTINGS);
  const [scoreFlash, setScoreFlash] = useState(false);
  const [stageKey,   setStageKey]   = useState(0);
  const scoreRef = { current: [0, 0] as [number, number] };

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
              ? { ...prev, team1_games: msg.team1_games ?? 0, team2_games: msg.team2_games ?? 0 }
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

// ── Root export ───────────────────────────────────────────────────────────────

export default function OverlayRibbonMobile() {
  useMobileKeyframes();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  const { match, settings, scoreFlash, stageKey } = useMatchData();
  const { slide, visible, total, idx } = useIdleSlide();
  const { entry: poolEntry, visible: poolVisible } = usePoolTicker();

  const ribbonMode  = settings.ribbon_mode;
  const isPrivate   = settings.open_lobby_match_type === "private_battle";

  // ── Open lobby ────────────────────────────────────────────────────────────
  if (ribbonMode === "open_lobby") {
    const lobbyStage    = settings.open_lobby_stage;
    const lobbyModeId   = settings.open_lobby_mode_id;
    const lobbyModeName = settings.open_lobby_mode_name;
    const lobbyStage2   = settings.open_lobby_stage_2;
    const lobbyCode     = settings.open_lobby_room_code;
    const lobbyPool     = settings.lobby_pool;
    const stageData     = lobbyStage  ? STAGES.find(s => s.name === lobbyStage)  : null;
    const modeData      = lobbyModeId ? MODES.find(m => m.id === lobbyModeId)   : null;
    const stageData2    = lobbyStage2  ? STAGES.find(s => s.name === lobbyStage2)  : null;
    // Private battles follow the stream rotation instead of fixed map slots
    const rotationMode  = settings.private_rotation_mode_id
      ? MODES.find(m => m.id === settings.private_rotation_mode_id)
      : null;
    const gamesLeft     = settings.private_games_until_reset;
    const isLastGame    = gamesLeft <= 1;

    const borderColor = isPrivate ? "rgba(145,70,255,0.55)" : "rgba(52,211,153,0.55)";
    const labelColor  = isPrivate ? "rgba(145,70,255,0.90)" : "rgba(52,211,153,0.90)";
    const logoClass   = isPrivate ? "mob-private-glow" : "mob-lobby-glow";
    const logoBorder  = isPrivate ? "2.5px solid rgba(145,70,255,0.85)" : "2.5px solid rgba(52,211,153,0.85)";
    const accentClass = isPrivate ? "mob-accent-cycle" : "mob-green-cycle";

    return (
      <div
        data-overlay
        className="mob-ribbon-in"
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center",
          // Tight vertical padding: the row is wide, so height is the scarce axis
          padding: "clamp(5px,1.2vh,10px) clamp(10px,2.5vw,20px)",
          boxSizing: "border-box",
          background: "rgba(6,6,18,0.95)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          borderTop: `3px solid ${borderColor}`,
          position: "relative", overflow: "hidden",
          gap: "clamp(6px,1.8vw,14px)",
        }}
      >
        <div className={accentClass} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, pointerEvents: "none" }} />
        <div className="mob-scan" style={{ position: "absolute", top: 0, left: 0, width: "30vw", height: "100%", background: isPrivate ? "linear-gradient(to right, transparent, rgba(145,70,255,0.08), transparent)" : "linear-gradient(to right, transparent, rgba(52,211,153,0.08), transparent)", pointerEvents: "none" }} />

        {/* Logo */}
        <div className={logoClass} style={{ width: "clamp(30px,7vw,46px)", height: "clamp(30px,7vw,46px)", borderRadius: "50%", overflow: "hidden", border: logoBorder, flexShrink: 0 }}>
          <img src="/android-chrome-512x512.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        {/* Match type + how to join, stacked to keep the row short */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "clamp(1px,0.4vh,4px)", maxWidth: "22vw" }}>
          <span style={{ fontSize: "clamp(8px,1.1vh,12px)", fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: labelColor, lineHeight: 1.1 }}>
            {isPrivate ? "PRIVATE BATTLE" : "ANARCHY OPEN"}
          </span>
          <span style={{ fontSize: "clamp(7px,1.5vw,10px)", fontWeight: 600, color: "rgba(255,255,255,0.38)", lineHeight: 1.2 }}>
            {isPrivate ? "Enter the pool + code in-game" : "Search the pool in Anarchy Open"}
          </span>
        </div>

        {/* Pool tag + room code, the two things viewers actually need to read */}
        {lobbyPool && (
          <div style={{
            flexShrink: 1, minWidth: 0,
            display: "flex", flexDirection: "column", gap: "clamp(0px,0.2vh,2px)",
            padding: "clamp(3px,0.7vh,7px) clamp(7px,1.8vw,13px)",
            borderRadius: 8,
            border: `2px solid ${labelColor}`,
            background: isPrivate ? "rgba(145,70,255,0.14)" : "rgba(52,211,153,0.14)",
          }}>
            <span style={{ fontSize: "clamp(7px,0.95vh,11px)", fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", lineHeight: 1 }}>POOL</span>
            <span style={{ fontSize: "clamp(18px,4vh,34px)", fontWeight: 900, color: "#fff", lineHeight: 1.05, fontFamily: "'Courier New', Courier, monospace", letterSpacing: "0.02em", textShadow: isPrivate ? "0 0 18px rgba(145,70,255,0.8)" : "0 0 18px rgba(52,211,153,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lobbyPool}</span>
          </div>
        )}
        {lobbyCode && (
          <div style={{
            flexShrink: 0,
            display: "flex", flexDirection: "column", gap: "clamp(0px,0.2vh,2px)",
            padding: "clamp(3px,0.7vh,7px) clamp(7px,1.8vw,13px)",
            borderRadius: 8,
            border: "2px solid rgba(255,255,255,0.55)",
            background: "rgba(255,255,255,0.10)",
          }}>
            <span style={{ fontSize: "clamp(7px,0.95vh,11px)", fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", lineHeight: 1 }}>ROOM CODE</span>
            <span style={{ fontSize: "clamp(18px,4vh,34px)", fontWeight: 900, color: "#fff", lineHeight: 1.05, fontFamily: "'Courier New', Courier, monospace", letterSpacing: "0.08em" }}>{lobbyCode}</span>
          </div>
        )}

        {/* Private battle: current mode, then the countdown to the lobby remake */}
        {isPrivate && rotationMode && (
          <>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "clamp(4px,1.2vw,9px)" }}>
              <img src={rotationMode.icon} alt={rotationMode.name} style={{ width: "clamp(14px,2.8vh,22px)", height: "clamp(14px,2.8vh,22px)", objectFit: "contain", flexShrink: 0 }} />
              <span style={{ fontSize: "clamp(11px,1.9vh,17px)", fontWeight: 900, color: "#fff", lineHeight: 1.1, whiteSpace: "nowrap" }}>{rotationMode.name}</span>
            </div>

            {/* Sized like the pool and code cards so it reads at a glance */}
            <div style={{
              flexShrink: 0,
              display: "flex", alignItems: "center", gap: "clamp(5px,1.4vw,10px)",
              padding: "clamp(3px,0.7vh,7px) clamp(7px,1.8vw,13px)",
              borderRadius: 8,
              border: isLastGame ? "2px solid rgba(251,146,60,0.95)" : "2px solid rgba(255,255,255,0.35)",
              background: isLastGame ? "rgba(251,146,60,0.18)" : "rgba(255,255,255,0.07)",
            }}>
              <span style={{
                fontSize: "clamp(20px,4.4vh,38px)", fontWeight: 900, lineHeight: 1,
                color: isLastGame ? "rgb(253,186,116)" : "#fff",
                fontVariantNumeric: "tabular-nums",
                textShadow: isLastGame ? "0 0 18px rgba(251,146,60,0.9)" : "none",
              }}>
                {gamesLeft}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0px,0.2vh,2px)" }}>
                <span style={{ fontSize: "clamp(8px,1.05vh,12px)", fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", lineHeight: 1, whiteSpace: "nowrap" }}>
                  {gamesLeft === 1 ? "GAME LEFT" : "GAMES LEFT"}
                </span>
                <span style={{ fontSize: "clamp(7px,0.95vh,11px)", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: isLastGame ? "rgb(253,186,116)" : "rgba(255,255,255,0.40)", lineHeight: 1, whiteSpace: "nowrap" }}>
                  {isLastGame ? "THEN LOBBY REMAKE" : "TILL LOBBY REMAKE"}
                </span>
              </div>
              {/* One pip per game in the rotation, filled for the ones still to play */}
              <div style={{ display: "flex", gap: "clamp(2px,0.5vw,4px)" }}>
                {Array.from({ length: ROTATION_LENGTH }, (_, i) => (
                  <div key={i} style={{
                    width: "clamp(4px,0.9vh,7px)", height: "clamp(4px,0.9vh,7px)", borderRadius: 9999,
                    background: i < gamesLeft ? (isLastGame ? "rgb(251,146,60)" : "rgba(255,255,255,0.85)") : "transparent",
                    border: i < gamesLeft ? "none" : "1px solid rgba(255,255,255,0.25)",
                  }} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Spacer keeps the map pool ticker and stages on the right */}
        <div style={{ flex: 1, minWidth: "clamp(4px,1vw,12px)" }} />

        {/* Tournament map pool ticker */}
        {poolEntry && (
          <div style={{ flexShrink: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "clamp(0px,0.2vh,2px)", opacity: poolVisible ? 1 : 0, transform: poolVisible ? "translateX(0)" : "translateX(6px)", transition: "opacity 0.3s ease, transform 0.3s ease" }}>
            <span style={{ fontSize: "clamp(7px,0.95vh,10px)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>MAP POOL</span>
            <div style={{ display: "flex", alignItems: "center", gap: "clamp(3px,0.8vw,6px)", minWidth: 0 }}>
              <img src={poolEntry.modeIcon} alt={poolEntry.modeName} style={{ width: "clamp(9px,2.2vw,13px)", height: "clamp(9px,2.2vw,13px)", objectFit: "contain", opacity: 0.65, flexShrink: 0 }} />
              <span style={{ fontSize: "clamp(8px,1.8vw,11px)", fontWeight: 600, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {poolEntry.stageName}
              </span>
            </div>
          </div>
        )}

        {/* Anarchy Open: the two stages side by side, both under the single mode */}
        {!isPrivate && (stageData || stageData2) && (
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "clamp(4px,1.2vw,10px)" }}>
            {(modeData || lobbyModeName) && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(1px,0.3vh,3px)" }}>
                {modeData && (
                  <img src={modeData.icon} alt={modeData.name} style={{ width: "clamp(14px,2.8vh,22px)", height: "clamp(14px,2.8vh,22px)", objectFit: "contain" }} />
                )}
                <span style={{ fontSize: "clamp(7px,1.5vw,10px)", fontWeight: 800, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", lineHeight: 1 }}>
                  {modeData ? modeData.name : lobbyModeName}
                </span>
              </div>
            )}
            {[{ sd: stageData, name: lobbyStage }, { sd: stageData2, name: lobbyStage2 }]
              .filter(s => s.sd)
              .map((slot, i) => (
                <div key={i} style={{ width: "clamp(52px,13vw,90px)", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(1px,0.3vh,3px)" }}>
                  <div style={{ position: "relative", width: "100%", height: "clamp(22px,4vh,34px)", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
                    <img src={slot.sd!.image} alt={slot.name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <span style={{ fontSize: "clamp(7px,1.5vw,10px)", fontWeight: 700, color: "rgba(255,255,255,0.75)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", lineHeight: 1 }}>
                    {slot.name ?? ""}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (ribbonMode === "idle" || !match) {
    return (
      <div
        data-overlay
        className="mob-ribbon-in"
        style={{
          width: "100%", height: "100%",
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "clamp(10px,2vh,18px) clamp(14px,4vw,28px)",
          boxSizing: "border-box",
          background: "rgba(6,6,18,0.95)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          borderTop: "3px solid rgba(145,70,255,0.5)",
          position: "relative", overflow: "hidden",
          gap: "clamp(4px,0.9vh,9px)",
        }}
      >
        <div className="mob-accent-cycle" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, pointerEvents: "none" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px,3vw,20px)" }}>
          <div className="mob-icon-glow" style={{ width: "clamp(36px,10vw,56px)", height: "clamp(36px,10vw,56px)", borderRadius: "50%", overflow: "hidden", border: "2.5px solid rgba(145,70,255,0.8)", flexShrink: 0 }}>
            <img src="/android-chrome-512x512.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>

          <div style={{ flex: 1, minWidth: 0, opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(4px)", transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`, display: "flex", flexDirection: "column", gap: "clamp(2px,0.5vh,5px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.7vw" }}>
              <span style={{ fontSize: "clamp(10px,1.4vh,15px)", lineHeight: 1 }}>{slide.icon}</span>
              <span style={{ fontSize: "clamp(8px,1.1vh,12px)", fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", color: slide.accent, lineHeight: 1 }}>{slide.eyebrow}</span>
            </div>
            <span style={{ fontSize: "clamp(14px,3vh,26px)", fontWeight: 900, color: "#fff", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Courier New', Courier, monospace" }}>
              {slide.headline}
            </span>
            {slide.sub && (
              <span style={{ fontSize: "clamp(10px,1.5vh,14px)", fontWeight: 600, color: "rgba(255,255,255,0.50)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {slide.sub}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "clamp(4px,1vw,8px)", alignSelf: "flex-end" }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ width: i === idx ? "clamp(14px,3vw,20px)" : "clamp(5px,1vw,7px)", height: "clamp(5px,1vw,7px)", borderRadius: 9999, background: i === idx ? slide.accent : "rgba(255,255,255,0.18)", transition: "width 0.3s ease, background 0.3s ease" }} />
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

  const curGameMap = match.games.find(g => g.game_number === currentGame);
  const stageName  = match.stage_name ?? curGameMap?.stage_name ?? null;
  const stageData  = stageName ? STAGES.find(s => s.name === stageName) : null;
  const modeData   = match.mode_name ? MODES.find(m => m.name === match.mode_name) : null;

  const pipsT1 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team1_games) : [];
  const pipsT2 = bestOf > 1 ? Array.from({ length: winsNeeded }, (_, i) => i < match.team2_games) : [];

  return (
    <div
      data-overlay
      className="mob-ribbon-in"
      style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        background: "rgba(6,6,18,0.95)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        borderTop: isLive ? "3px solid rgba(239,68,68,0.55)" : isComplete ? "3px solid rgba(52,211,153,0.45)" : "3px solid rgba(255,255,255,0.10)",
        position: "relative", overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2vw", paddingTop: "1.2vh", paddingBottom: "0.4vh", flexShrink: 0 }}>
        {isLive && (
          <div style={{ position: "relative", width: "clamp(7px,2vw,10px)", height: "clamp(7px,2vw,10px)", flexShrink: 0 }}>
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
            <div className="absolute inset-0 rounded-full bg-red-500" />
          </div>
        )}
        <span style={{ fontSize: "clamp(9px,2.8vw,15px)", fontWeight: 900, letterSpacing: "0.25em", textTransform: "uppercase", color: isLive ? "rgba(239,68,68,0.95)" : isComplete ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.35)" }}>
          {isLive ? "LIVE" : isComplete ? "DONE" : "CONF"}
        </span>
        <span style={{ fontSize: "clamp(8px,2.4vw,13px)", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>
          {roundLabel}{bestOf > 1 ? ` · BO${bestOf}` : ""}
        </span>
        <span style={{ fontSize: "clamp(8px,2.2vw,12px)", fontWeight: 600, color: "rgba(145,70,255,0.7)", letterSpacing: "0.05em" }}>
          {match.tournament_name}
        </span>
      </div>

      {/* Score row + map pick on right */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 3vw", gap: "2vw", minHeight: 0 }}>

        {/* Team 1 */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4vh" }}>
          <span style={{ fontSize: "clamp(13px,4.5vw,28px)", fontWeight: 900, lineHeight: 1, color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)", textShadow: isT1Winner ? "0 0 24px rgba(52,211,153,0.6)" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", textAlign: "right" }}>
            {match.team1.name}
          </span>
          {match.team1.members.length > 0 && (
            <span style={{ fontSize: "clamp(6px,1.8vw,9px)", fontWeight: 500, color: "rgba(255,255,255,0.30)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", textAlign: "right", letterSpacing: "0.04em" }}>
              {match.team1.members.join(" · ")}
            </span>
          )}
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "1.2vw", flexDirection: "row-reverse" }}>
              {pipsT1.map((f, i) => (
                <div key={i} style={{ width: "clamp(6px,1.8vw,10px)", height: "clamp(6px,1.8vw,10px)", borderRadius: "9999px", background: f ? (isT1Winner ? "rgb(52,211,153)" : "rgb(248,113,113)") : "transparent", border: f ? (isT1Winner ? "1.5px solid rgba(52,211,153,0.9)" : "1.5px solid rgba(248,113,113,0.7)") : "1.5px solid rgba(255,255,255,0.18)", boxShadow: f && isT1Winner ? "0 0 6px rgba(52,211,153,0.9)" : "none" }} />
              ))}
            </div>
          )}
        </div>

        {/* Score */}
        <div className={scoreFlash ? "mob-score-pop" : undefined} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "1.5vw" }}>
          <span style={{ fontSize: "clamp(24px,7.5vw,48px)", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: isT1Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)" }}>{match.team1_games}</span>
          <span style={{ fontSize: "clamp(12px,3vw,20px)", fontWeight: 100, color: "rgba(255,255,255,0.22)" }}>—</span>
          <span style={{ fontSize: "clamp(24px,7.5vw,48px)", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)" }}>{match.team2_games}</span>
        </div>

        {/* Team 2 */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.4vh" }}>
          <span style={{ fontSize: "clamp(13px,4.5vw,28px)", fontWeight: 900, lineHeight: 1, color: isT2Winner ? "rgb(110,231,183)" : "rgba(255,255,255,0.95)", textShadow: isT2Winner ? "0 0 24px rgba(52,211,153,0.6)" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {match.team2.name}
          </span>
          {match.team2.members.length > 0 && (
            <span style={{ fontSize: "clamp(6px,1.8vw,9px)", fontWeight: 500, color: "rgba(255,255,255,0.30)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", letterSpacing: "0.04em" }}>
              {match.team2.members.join(" · ")}
            </span>
          )}
          {bestOf > 1 && (
            <div style={{ display: "flex", gap: "1.2vw" }}>
              {pipsT2.map((f, i) => (
                <div key={i} style={{ width: "clamp(6px,1.8vw,10px)", height: "clamp(6px,1.8vw,10px)", borderRadius: "9999px", background: f ? (isT2Winner ? "rgb(52,211,153)" : "rgb(248,113,113)") : "transparent", border: f ? (isT2Winner ? "1.5px solid rgba(52,211,153,0.9)" : "1.5px solid rgba(248,113,113,0.7)") : "1.5px solid rgba(255,255,255,0.18)", boxShadow: f && isT2Winner ? "0 0 6px rgba(52,211,153,0.9)" : "none" }} />
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: "stretch", margin: "1vh 0", background: "rgba(255,255,255,0.09)", flexShrink: 0 }} />

        {/* Map pick */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5vh", width: "clamp(60px,18vw,110px)" }}>
          <div style={{ position: "relative", width: "100%", height: "clamp(28px,5.5vh,44px)", borderRadius: 5, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
            {stageData ? (
              <img key={`mob-map-${stageKey}`} src={stageData.image} alt={stageName ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "clamp(10px,2vw,14px)", color: "rgba(255,255,255,0.20)" }}>?</span>
              </div>
            )}
            {modeData && (
              <div style={{ position: "absolute", bottom: 2, right: 3 }}>
                <img src={modeData.icon} alt={modeData.name} style={{ width: "clamp(10px,2.5vw,16px)", height: "clamp(10px,2.5vw,16px)", objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))" }} />
              </div>
            )}
          </div>
          <span style={{ fontSize: "clamp(8px,2vw,11px)", fontWeight: 700, color: stageName ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.28)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", lineHeight: 1 }}>
            {stageName ?? "Counterpick…"}
          </span>
          <span style={{ fontSize: "clamp(7px,1.6vw,9px)", fontWeight: 600, color: "rgba(255,255,255,0.28)", letterSpacing: "0.12em" }}>
            G{currentGame}{bestOf > 1 ? `/${bestOf}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
