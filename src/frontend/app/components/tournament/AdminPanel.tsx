import { useState, useCallback, useRef, useEffect } from "react";
import axios from "axios";
import { Plus, Trash2, Lock, X, RefreshCw, ChevronDown, ChevronUp, Users, Map as MapIcon, Pencil, Check, Crown, UserPlus, Swords, Pin, PinOff, Minus, RotateCcw, Monitor, UserMinus } from "lucide-react";
import MapModePicker, { type RoundMapMode } from "./MapModePicker";
import { STAGES, MODES } from "./splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";

// ---- Types ---------------------------------------------------------------

export interface Signup {
  id: number;
  display_name: string;
  discord_id: string | null;
  twitch_username: string | null;
  assigned_team_id: number | null;
  rating: number;
  rank: number | null;
  rank_tier: number | null;
  splattag: string | null;
  is_sub?: boolean;
}

export const RANK_NAMES: Record<number, string> = {
  1: "Starter Squid", 2: "Amateur Squid", 3: "Cool Squid",
  4: "Pro Squid", 5: "Legendary Squid", 6: "God Squid",
};
export const RANK_EMOJIS: Record<number, string> = {
  1: "🦑", 2: "🦑🦑", 3: "⭐", 4: "⭐⭐", 5: "💎", 6: "👑",
};
export const TIER_ROMAN: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

export const RANK_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Unranked" },
  ...[1, 2, 3, 4, 5, 6].flatMap((r) =>
    [1, 2, 3].map((t) => ({
      value: `${r}-${t}`,
      label: `${RANK_EMOJIS[r]} ${RANK_NAMES[r]} ${TIER_ROMAN[t]}`,
    }))
  ),
];

export function rankScore(rank: number | null | undefined, tier: number | null | undefined): number {
  if (!rank) return 0;
  return (rank - 1) * 3 + (tier ?? 1);
}

export function rankLabel(rank: number | null | undefined, tier: number | null | undefined): string {
  if (!rank) return "Unranked";
  return `${RANK_EMOJIS[rank]} ${RANK_NAMES[rank]} ${TIER_ROMAN[tier ?? 1]}`;
}

export interface PreTeam {
  id: number;
  team_name: string;
  captain_discord_id: string | null;
  name_confirmed: boolean;
}

interface AdminTournament {
  id: number;
  name: string;
  status: string;
  team_size?: number;
  special_rules?: string | null;
  affects_rating?: boolean;
}

interface GameMap {
  game_number: number;
  stage_name: string | null;
  mode_id?: string | null;
  mode_name?: string | null;
}

interface RoundSchedule {
  best_of: number;
  mode_name: string | null;
  games: GameMap[];
}

interface AdminMatch {
  id: number;
  round: number;
  match_number: number;
  team1: { id: number; name: string } | null;
  team2: { id: number; name: string } | null;
  status: string;
  team1_games?: number;
  team2_games?: number;
  room_code?: string | null;
  schedule?: RoundSchedule | null;
}

interface LocalTeam {
  localId: string; // temporary client-side id
  name: string;
  signupIds: number[];
  captainSignupId: number | null;
  subSignupIds: number[];
}

// ---- Helpers -------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2);

function buildLocalTeams(signups: Signup[], preTeams: PreTeam[]): { teams: LocalTeam[]; unassigned: number[] } {
  const teams: LocalTeam[] = preTeams.map((pt) => {
    const teamSignups = signups.filter((s) => s.assigned_team_id === pt.id);
    const mainIds = teamSignups.filter((s) => !s.is_sub).map((s) => s.id);
    const subIds  = teamSignups.filter((s) =>  s.is_sub).map((s) => s.id);
    // Restore captain: match captain_discord_id to signup discord_id
    const captainSignup = pt.captain_discord_id
      ? teamSignups.find((s) => s.discord_id === pt.captain_discord_id)
      : null;
    return {
      localId: String(pt.id),
      name: pt.team_name,
      signupIds: mainIds,
      captainSignupId: captainSignup?.id ?? null,
      subSignupIds: subIds,
    };
  });

  const assigned = new Set(teams.flatMap((t) => [...t.signupIds, ...t.subSignupIds]));
  const unassigned = signups.filter((s) => !assigned.has(s.id)).map((s) => s.id);

  return { teams, unassigned };
}

// ---- Drag ghost label ----------------------------------------------------

function PlayerPill({
  signup,
  onRemove,
  draggable,
  onDragStart,
}: {
  signup: Signup;
  onRemove?: () => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-700/60 border border-slate-600/50 text-sm text-slate-200 cursor-grab active:cursor-grabbing select-none"
    >
      <span className="truncate max-w-[120px]">{signup.display_name}</span>
      {signup.rank && (
        <span className="text-xs text-slate-400 shrink-0">{rankLabel(signup.rank, signup.rank_tier)}</span>
      )}
      {signup.twitch_username && !signup.rank && (
        <span className="text-xs text-purple-400 shrink-0">twitch</span>
      )}
      {onRemove && (
        <button onClick={onRemove} className="ml-auto text-slate-500 hover:text-red-400 shrink-0">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ---- Team slot -----------------------------------------------------------

function TeamSlot({
  team,
  signupsById,
  onDrop,
  onDropSub,
  onRemovePlayer,
  onRemoveSub,
  onRemoveTeam,
  onRename,
  onAutoFill,
  onSetCaptain,
  unassignedPool,
  teamSize,
}: {
  team: LocalTeam;
  signupsById: Map<number, Signup>;
  onDrop: (teamLocalId: string, signupId: number) => void;
  onDropSub: (teamLocalId: string, signupId: number) => void;
  onRemovePlayer: (teamLocalId: string, signupId: number) => void;
  onRemoveSub: (teamLocalId: string, signupId: number) => void;
  onRemoveTeam: (teamLocalId: string) => void;
  onRename: (teamLocalId: string, name: string) => void;
  onAutoFill: (teamLocalId: string) => void;
  onSetCaptain: (teamLocalId: string, signupId: number | null) => void;
  unassignedPool: number[];
  teamSize: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [subDragOver, setSubDragOver] = useState(false);
  const full = team.signupIds.length >= teamSize;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 transition-colors flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-transparent border-b border-slate-600 text-sm font-semibold text-white focus:outline-none focus:border-purple-400 pb-0.5 min-w-0"
          value={team.name}
          placeholder="Team name…"
          onChange={(e) => onRename(team.localId, e.target.value)}
        />
        <span className={`text-xs shrink-0 ${full ? "text-green-400" : "text-slate-500"}`}>
          {team.signupIds.length}/{teamSize}
        </span>
        {!full && unassignedPool.length > 0 && (
          <button title="Auto-fill remaining spots" onClick={() => onAutoFill(team.localId)} className="text-slate-500 hover:text-blue-400 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => onRemoveTeam(team.localId)} className="text-slate-500 hover:text-red-400 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main roster drop zone */}
      <div
        className={`flex flex-col gap-1 min-h-[60px] rounded p-1 transition-colors ${
          dragOver && !full ? "bg-purple-900/20 ring-1 ring-purple-500/50" : ""
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const sid = parseInt(e.dataTransfer.getData("signupId"), 10);
          if (!isNaN(sid)) onDrop(team.localId, sid);
        }}
      >
        {team.signupIds.map((sid) => {
          const s = signupsById.get(sid);
          if (!s) return null;
          const isCaptain = team.captainSignupId === sid;
          return (
            <div key={sid} className="flex items-center gap-1 group">
              <button
                title={isCaptain ? "Remove captain" : "Set as captain"}
                onClick={() => onSetCaptain(team.localId, isCaptain ? null : sid)}
                className={`shrink-0 transition-colors ${isCaptain ? "text-yellow-400 hover:text-slate-500" : "text-slate-700 hover:text-yellow-400 opacity-0 group-hover:opacity-100"}`}
              >
                <Crown className="w-3 h-3" />
              </button>
              <div className="flex-1 min-w-0">
                <PlayerPill
                  signup={s}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("signupId", String(sid))}
                  onRemove={() => onRemovePlayer(team.localId, sid)}
                />
              </div>
            </div>
          );
        })}
        {!full && (
          <div className="text-xs text-slate-600 italic text-center py-1">
            {dragOver ? "Drop here" : "Drag player here"}
          </div>
        )}
      </div>

      {/* Subs drop zone */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <UserPlus className="w-3 h-3 text-slate-600" />
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">Subs</span>
          {team.subSignupIds.length > 0 && (
            <span className="text-[10px] text-slate-500">({team.subSignupIds.length})</span>
          )}
        </div>
        <div
          className={`flex flex-col gap-1 min-h-[32px] rounded p-1 transition-colors border border-dashed ${
            subDragOver ? "border-blue-500/50 bg-blue-900/15" : "border-slate-700/40"
          }`}
          onDragOver={(e) => { e.preventDefault(); setSubDragOver(true); }}
          onDragLeave={() => setSubDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSubDragOver(false);
            const sid = parseInt(e.dataTransfer.getData("signupId"), 10);
            if (!isNaN(sid)) onDropSub(team.localId, sid);
          }}
        >
          {team.subSignupIds.map((sid) => {
            const s = signupsById.get(sid);
            if (!s) return null;
            return (
              <PlayerPill
                key={sid}
                signup={s}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("signupId", String(sid))}
                onRemove={() => onRemoveSub(team.localId, sid)}
              />
            );
          })}
          {team.subSignupIds.length === 0 && (
            <div className="text-[10px] text-slate-700 italic text-center py-0.5">
              {subDragOver ? "Drop sub here" : "Drag overflow players here"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Confirm modal -------------------------------------------------------

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  danger = false,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 max-w-sm w-full mx-4">
        <p className="text-sm text-slate-200 mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-300 hover:border-slate-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded text-white font-semibold ${
              danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-purple-600 hover:bg-purple-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Admin match reporter ------------------------------------------------

export function AdminMatchReporter({ onRefresh, flash }: {
  onRefresh: () => void;
  flash: (text: string, ok: boolean) => void;
}) {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [completedMatches, setCompletedMatches] = useState<AdminMatch[]>([]);
  const [reporting, setReporting] = useState<number | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<number | null>(null);
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<number, [number, number]>>({});
  const [mapsOpen, setMapsOpen] = useState<Record<number, boolean>>({});
  // matchId → gameNumber → stageName (local overrides shown after counterpick picks)
  const [gameStages, setGameStages] = useState<Record<number, Record<number, string | null>>>({});
  const [gameReporting, setGameReporting] = useState<string | null>(null); // "matchId-gameNum"
  const [pendingGameReport, setPendingGameReport] = useState<{
    matchId: number; gameNumber: number; winnerTeamId: number; winnerName: string;
  } | null>(null);
  const [revertingGame, setRevertingGame] = useState<string | null>(null); // "matchId-gameNum"

  const fetchMatches = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament`, {
        params: { guild_id: GUILD_ID },
      });
      const pending: AdminMatch[] = [];
      const completed: AdminMatch[] = [];
      const scoreMap: Record<number, [number, number]> = {};

      (data.rounds ?? []).forEach((r: { round: number; matches: AdminMatch[]; schedule?: { best_of?: number; mode_name?: string; games?: GameMap[] } | null }) => {
        const sched: RoundSchedule | null = r.schedule
          ? { best_of: r.schedule.best_of ?? 1, mode_name: r.schedule.mode_name ?? null, games: r.schedule.games ?? [] }
          : null;
        r.matches.forEach((m) => {
          scoreMap[m.id] = [m.team1_games ?? 0, m.team2_games ?? 0];
          const mapped = { ...m, round: r.round, schedule: sched };
          if ((m.status === "pending" || m.status === "awaiting_confirmation") && m.team1 && m.team2) {
            pending.push(mapped);
          } else if (m.status === "complete" && m.team1 && m.team2) {
            completed.push(mapped);
          }
        });
      });

      setMatches(pending);
      setCompletedMatches(completed);
      setScores(scoreMap);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  const reportWinner = async (matchId: number, winnerId: number) => {
    setReporting(matchId);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/match/complete`,
        { match_id: matchId, winner_team_id: winnerId },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) { await fetchMatches(); onRefresh(); }
    } catch {
      flash("Failed to report match.", false);
    } finally {
      setReporting(null);
    }
  };

  const pinMatch = async (matchId: number | null) => {
    try {
      await axios.post(`${API_URL}/api/tournament/admin/pin-match`, { guild_id: GUILD_ID, match_id: matchId }, { withCredentials: true });
      setPinnedId(matchId);
    } catch {
      flash("Failed to pin match.", false);
    }
  };

  const setGameStage = async (matchId: number, gameNumber: number, stageName: string | null) => {
    setGameStages((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? {}), [gameNumber]: stageName },
    }));
    try {
      await axios.post(
        `${API_URL}/api/tournament/admin/match-game-stage`,
        { match_id: matchId, game_number: gameNumber, stage_name: stageName },
        { withCredentials: true }
      );
    } catch {
      flash("Failed to set counterpick stage.", false);
    }
  };

  const updateScore = async (matchId: number, t1: number, t2: number) => {
    const clamped: [number, number] = [Math.max(0, t1), Math.max(0, t2)];
    setScores((prev) => ({ ...prev, [matchId]: clamped }));
    try {
      await axios.post(`${API_URL}/api/tournament/admin/game-score`,
        { match_id: matchId, team1_games: clamped[0], team2_games: clamped[1] },
        { withCredentials: true }
      );
    } catch {
      flash("Failed to update score.", false);
    }
  };

  const revertMatch = async (matchId: number) => {
    setReverting(matchId);
    setRevertConfirm(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/match/revert`,
        { match_id: matchId },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) { await fetchMatches(); onRefresh(); }
    } catch {
      flash("Failed to revert match.", false);
    } finally {
      setReverting(null);
    }
  };

  const reportGame = async (matchId: number, gameNumber: number, winnerTeamId: number) => {
    const key = `${matchId}-${gameNumber}`;
    setGameReporting(key);
    setPendingGameReport(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/report-game`,
        { match_id: matchId, game_number: gameNumber, winner_team_id: winnerTeamId },
        { withCredentials: true }
      );
      flash(data.message ?? "Game result set.", data.ok ?? true);
      if (data.ok) await fetchMatches();
    } catch {
      flash("Failed to set game result.", false);
    } finally {
      setGameReporting(null);
    }
  };

  const revertGame = async (matchId: number, gameNumber: number) => {
    const key = `${matchId}-${gameNumber}`;
    setRevertingGame(key);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/game/revert`,
        { match_id: matchId, game_number: gameNumber },
        { withCredentials: true }
      );
      flash(data.message ?? "Game reverted.", data.ok ?? true);
      if (data.ok) { await fetchMatches(); onRefresh(); }
    } catch {
      flash("Failed to revert game.", false);
    } finally {
      setRevertingGame(null);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-300">Pending Matches</span>
        <button onClick={fetchMatches} className="ml-auto text-slate-500 hover:text-slate-300">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {matches.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No pending matches.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {matches.map((m) => {
            const isPinned = pinnedId === m.id;
            const sc = scores[m.id] ?? [0, 0];
            return (
              <div key={m.id} className={`rounded-lg border p-3 transition-colors ${isPinned ? "border-purple-500/50 bg-purple-900/10" : "border-slate-700/50 bg-slate-800/40"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">Round {m.round} · Match #{m.id}</span>
                  <div className="flex items-center gap-2">
                    {m.room_code && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-600/40 bg-amber-900/20 text-amber-300 tracking-widest select-all">
                        {m.room_code}
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      m.status === "awaiting_confirmation"
                        ? "text-yellow-300 border-yellow-600/40 bg-yellow-900/20"
                        : "text-slate-400 border-slate-600/40"
                    }`}>
                      {m.status === "awaiting_confirmation" ? "Awaiting confirm" : "Pending"}
                    </span>
                    <button
                      onClick={() => pinMatch(isPinned ? null : m.id)}
                      title={isPinned ? "Unpin from overlay" : "Pin to overlay"}
                      className={`p-1 rounded transition-colors ${isPinned ? "text-purple-400 hover:text-purple-300" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Game score controls */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide shrink-0">Games</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateScore(m.id, sc[0] - 1, sc[1])} className="w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs"><Minus className="w-3 h-3" /></button>
                    <span className="text-xs font-mono text-slate-200 w-4 text-center">{sc[0]}</span>
                    <button onClick={() => updateScore(m.id, sc[0] + 1, sc[1])} className="w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs"><Plus className="w-3 h-3" /></button>
                  </div>
                  <span className="text-xs text-slate-600">–</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateScore(m.id, sc[0], sc[1] - 1)} className="w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs"><Minus className="w-3 h-3" /></button>
                    <span className="text-xs font-mono text-slate-200 w-4 text-center">{sc[1]}</span>
                    <button onClick={() => updateScore(m.id, sc[0], sc[1] + 1)} className="w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs"><Plus className="w-3 h-3" /></button>
                  </div>
                  <span className="text-[10px] text-slate-600 ml-1">{m.team1?.name} · {m.team2?.name}</span>
                </div>

                {/* Stage pickers — collapsible */}
                {(() => {
                  const bestOf = m.schedule?.best_of ?? 1;
                  const isOpen = mapsOpen[m.id] ?? false;
                  const slots = Array.from({ length: bestOf }, (_, i) => {
                    const gameNum = i + 1;
                    const overrideName = gameStages[m.id]?.[gameNum];
                    const existingStage = m.schedule?.games.find((g) => g.game_number === gameNum)?.stage_name ?? null;
                    return { game_number: gameNum, stage_name: overrideName !== undefined ? overrideName : existingStage };
                  });
                  return (
                    <div className="mb-2 flex flex-col gap-1">
                      <button
                        onClick={() => setMapsOpen(prev => ({ ...prev, [m.id]: !isOpen }))}
                        className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wide hover:text-slate-300 transition-colors"
                      >
                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Maps
                      </button>
                      {isOpen && slots.map((gm) => {
                        const label = gm.game_number === 1
                          ? bestOf === 1 ? "Stage" : "G1 — Home pick"
                          : `G${gm.game_number} — Counterpick`;
                        const gKey = `${m.id}-${gm.game_number}`;
                        const gReporting = gameReporting === gKey;
                        return (
                          <div key={gm.game_number} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-600 shrink-0 w-28">{label}</span>
                              <select
                                value={gm.stage_name ?? ""}
                                onChange={(e) => setGameStage(m.id, gm.game_number, e.target.value || null)}
                                className="flex-1 text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-purple-500"
                              >
                                <option value="">? (not set)</option>
                                {STAGES.map((s) => (
                                  <option key={s.name} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-1 pl-28">
                              {pendingGameReport?.matchId === m.id && pendingGameReport.gameNumber === gm.game_number ? (
                                <>
                                  <span className="text-[10px] text-amber-400 shrink-0">
                                    Confirm: <strong>{pendingGameReport.winnerName}</strong> won G{gm.game_number}?
                                  </span>
                                  <button
                                    onClick={() => reportGame(pendingGameReport.matchId, pendingGameReport.gameNumber, pendingGameReport.winnerTeamId)}
                                    disabled={gReporting !== null}
                                    className="text-[10px] px-2 py-0.5 rounded bg-green-900/40 border border-green-600/50 text-green-300 hover:bg-green-900/70 disabled:opacity-40"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={() => setPendingGameReport(null)}
                                    className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600/40 text-slate-400 hover:text-slate-200"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] text-slate-600 shrink-0">Winner:</span>
                                  <button
                                    onClick={() => m.team1 && setPendingGameReport({ matchId: m.id, gameNumber: gm.game_number, winnerTeamId: m.team1.id, winnerName: m.team1.name })}
                                    disabled={gReporting !== null || !m.team1}
                                    className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 border border-blue-700/40 text-blue-300 hover:bg-blue-900/60 disabled:opacity-40 truncate"
                                  >
                                    {m.team1?.name ?? "T1"}
                                  </button>
                                  <button
                                    onClick={() => m.team2 && setPendingGameReport({ matchId: m.id, gameNumber: gm.game_number, winnerTeamId: m.team2.id, winnerName: m.team2.name })}
                                    disabled={gReporting !== null || !m.team2}
                                    className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 border border-purple-700/40 text-purple-300 hover:bg-purple-900/60 disabled:opacity-40 truncate"
                                  >
                                    {m.team2?.name ?? "T2"}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <button
                    onClick={() => reportWinner(m.id, m.team1!.id)}
                    disabled={reporting === m.id}
                    className="flex-1 text-xs px-2 py-2 rounded border border-blue-700/50 bg-blue-900/20 text-blue-300 hover:bg-blue-900/40 disabled:opacity-50 truncate"
                  >
                    {m.team1?.name ?? "Team 1"} wins
                  </button>
                  <button
                    onClick={() => reportWinner(m.id, m.team2!.id)}
                    disabled={reporting === m.id}
                    className="flex-1 text-xs px-2 py-2 rounded border border-purple-700/50 bg-purple-900/20 text-purple-300 hover:bg-purple-900/40 disabled:opacity-50 truncate"
                  >
                    {m.team2?.name ?? "Team 2"} wins
                  </button>
                </div>
                {(() => {
                  const confirmedGames = sc[0] + sc[1];
                  if (confirmedGames === 0) return null;
                  const lastGame = confirmedGames;
                  const rKey = `${m.id}-${lastGame}`;
                  return (
                    <button
                      onClick={() => revertGame(m.id, lastGame)}
                      disabled={revertingGame === rKey}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1 rounded border border-slate-600/30 text-slate-500 hover:border-red-600/40 hover:text-red-300 transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      {revertingGame === rKey ? "Reverting…" : `Revert last game (G${lastGame})`}
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed matches — revert section */}
      {completedMatches.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-400">Completed Matches</span>
          </div>
          <div className="flex flex-col gap-2">
            {completedMatches.map((m) => (
              <div key={m.id} className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">Round {m.round} · Match #{m.id}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border text-green-300 border-green-600/40 bg-green-900/20">Complete</span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-slate-300">{m.team1?.name}</span>
                  <span className="text-xs text-slate-600 mx-2">vs</span>
                  <span className="text-sm font-semibold text-slate-300">{m.team2?.name}</span>
                </div>
                {revertConfirm === m.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => revertMatch(m.id)}
                      disabled={reverting === m.id}
                      className="flex-1 text-xs px-2 py-1.5 rounded border border-red-600/50 bg-red-900/20 text-red-300 hover:bg-red-900/40 disabled:opacity-50"
                    >
                      {reverting === m.id ? "Reverting…" : "Confirm revert"}
                    </button>
                    <button
                      onClick={() => setRevertConfirm(null)}
                      className="text-xs px-2 py-1.5 rounded border border-slate-600/40 text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => setRevertConfirm(m.id)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded border border-slate-600/40 text-slate-400 hover:border-red-600/40 hover:text-red-300 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Revert Series
                    </button>
                    {(() => {
                      const total = (m.team1_games ?? 0) + (m.team2_games ?? 0);
                      if (total === 0) return null;
                      const rKey = `${m.id}-${total}`;
                      return (
                        <button
                          onClick={() => revertGame(m.id, total)}
                          disabled={revertingGame === rKey}
                          className="w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1 rounded border border-slate-600/30 text-slate-500 hover:border-amber-600/40 hover:text-amber-300 transition-colors disabled:opacity-40"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          {revertingGame === rKey ? "Reverting…" : `Revert last game only (G${total})`}
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main panel ----------------------------------------------------------

export default function AdminPanel({
  tournament,
  signups,
  preTeams,
  onRefresh,
  onCancel,
}: {
  tournament: AdminTournament;
  signups: Signup[];
  preTeams: PreTeam[];
  onRefresh: () => void;
  onCancel: () => void;
}
) {
  const teamSize = tournament.team_size ?? 4;
  const signupsById = new Map(signups.map((s) => [s.id, s]));

  const init = buildLocalTeams(signups, preTeams);
  const [teams, setTeams]       = useState<LocalTeam[]>(init.teams);
  const [unassigned, setUnassigned] = useState<number[]>(init.unassigned);
  const emptyTeam = (): LocalTeam => ({ localId: uid(), name: "", signupIds: [], captainSignupId: null, subSignupIds: [] });
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [locking, setLocking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newTeamSize, setNewTeamSize] = useState(4);
  const [newSpecialRules, setNewSpecialRules] = useState("");
  const [newAffectsRating, setNewAffectsRating] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ message: string; label: string; danger: boolean; action: () => void } | null>(null);

  // Manage signups section
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [addName, setAddName] = useState("");
  const [addDiscordId, setAddDiscordId] = useState("");
  const [addingSave, setAddingSave] = useState(false);
  const [removingSave, setRemovingSave] = useState(false);
  const [pendingTeamSize, setPendingTeamSize] = useState(teamSize);
  const [teamSizeSaving, setTeamSizeSaving] = useState(false);

  // Keep pendingTeamSize in sync if parent re-fetches a different team_size
  useEffect(() => { setPendingTeamSize(teamSize); }, [teamSize]);

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  // Ref so drag callbacks can read current teams without stale closure values
  const teamsRef = useRef(teams);
  teamsRef.current = teams;

  // ---- Sync new/removed signups into the unassigned pool -----------------
  const prevSignupIdsRef = useRef<Set<number>>(new Set(signups.map((s) => s.id)));
  useEffect(() => {
    const incomingIds = new Set(signups.map((s) => s.id));
    const prev = prevSignupIdsRef.current;
    const added   = signups.filter((s) => !prev.has(s.id)).map((s) => s.id);
    const removed = new Set([...prev].filter((id) => !incomingIds.has(id)));
    prevSignupIdsRef.current = incomingIds;
    if (added.length > 0)
      setUnassigned((p) => [...p, ...added.filter((id) => !p.includes(id))]);
    if (removed.size > 0) {
      setTeams((p) => p.map((t) => ({
        ...t,
        signupIds:    t.signupIds.filter((id) => !removed.has(id)),
        subSignupIds: t.subSignupIds.filter((id) => !removed.has(id)),
        captainSignupId: removed.has(t.captainSignupId ?? -1) ? null : t.captainSignupId,
      })));
      setUnassigned((p) => p.filter((id) => !removed.has(id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signups]);

  // ---- Warn on unsaved changes -------------------------------------------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ---- Drag from unassigned pool ----------------------------------------

  // Drop onto the unassigned pool — remove from any team and place back in pool
  const removeSignupFromAll = (signupId: number) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) => ({
      ...t,
      signupIds:       t.signupIds.filter((id) => id !== signupId),
      subSignupIds:    t.subSignupIds.filter((id) => id !== signupId),
      captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId,
    })));
    // ADD to pool (was incorrectly filtering it out)
    setUnassigned((prev) => prev.includes(signupId) ? prev : [...prev, signupId]);
  };

  const moveToTeam = useCallback((teamLocalId: string, signupId: number) => {
    // Read current state via ref to check capacity before touching anything
    const target = teamsRef.current.find((t) => t.localId === teamLocalId);
    if (!target || target.signupIds.length >= teamSize) return; // full — abort entirely
    setIsDirty(true);
    setTeams((prev) => {
      const stripped = prev.map((t) => ({
        ...t,
        signupIds:       t.signupIds.filter((id) => id !== signupId),
        subSignupIds:    t.subSignupIds.filter((id) => id !== signupId),
        captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId,
      }));
      return stripped.map((t) =>
        t.localId === teamLocalId ? { ...t, signupIds: [...t.signupIds, signupId] } : t
      );
    });
    setUnassigned((prev) => prev.filter((id) => id !== signupId));
  }, [teamSize]);

  const moveToSub = useCallback((teamLocalId: string, signupId: number) => {
    // Check target exists before modifying anything
    if (!teamsRef.current.find((t) => t.localId === teamLocalId)) return;
    setIsDirty(true);
    setTeams((prev) => {
      const stripped = prev.map((t) => ({
        ...t,
        signupIds:       t.signupIds.filter((id) => id !== signupId),
        subSignupIds:    t.subSignupIds.filter((id) => id !== signupId),
        captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId,
      }));
      return stripped.map((t) =>
        t.localId === teamLocalId && !t.subSignupIds.includes(signupId)
          ? { ...t, subSignupIds: [...t.subSignupIds, signupId] }
          : t
      );
    });
    setUnassigned((prev) => prev.filter((id) => id !== signupId));
  }, []);

  const removeFromTeam = useCallback((teamLocalId: string, signupId: number) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) =>
      t.localId === teamLocalId
        ? { ...t, signupIds: t.signupIds.filter((id) => id !== signupId), captainSignupId: t.captainSignupId === signupId ? null : t.captainSignupId }
        : t
    ));
    setUnassigned((prev) => (prev.includes(signupId) ? prev : [...prev, signupId]));
  }, []);

  const removeSubFromTeam = useCallback((teamLocalId: string, signupId: number) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) =>
      t.localId === teamLocalId ? { ...t, subSignupIds: t.subSignupIds.filter((id) => id !== signupId) } : t
    ));
    setUnassigned((prev) => (prev.includes(signupId) ? prev : [...prev, signupId]));
  }, []);

  const setCaptain = useCallback((teamLocalId: string, signupId: number | null) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) =>
      t.localId === teamLocalId ? { ...t, captainSignupId: signupId } : t
    ));
  }, []);

  const addTeam = () => {
    setIsDirty(true);
    setTeams((prev) => [...prev, emptyTeam()]);
  };

  const removeTeam = (localId: string) => {
    setIsDirty(true);
    const team = teams.find((t) => t.localId === localId);
    if (team) {
      const allIds = [...team.signupIds, ...team.subSignupIds];
      setUnassigned((prev) => [...prev, ...allIds.filter((id) => !prev.includes(id))]);
    }
    setTeams((prev) => prev.filter((t) => t.localId !== localId));
  };

  const renameTeam = (localId: string, name: string) => {
    setIsDirty(true);
    setTeams((prev) => prev.map((t) => (t.localId === localId ? { ...t, name } : t)));
  };

  const autoFill = (localId: string) => {
    setIsDirty(true);
    const team = teams.find((t) => t.localId === localId);
    if (!team) return;
    const needed = teamSize - team.signupIds.length;
    if (needed <= 0) return;
    const toAdd = unassigned.slice(0, needed);
    setUnassigned((prev) => prev.slice(toAdd.length));
    setTeams((prev) => prev.map((t) => (t.localId === localId ? { ...t, signupIds: [...t.signupIds, ...toAdd] } : t)));
  };

  const autoAssignAll = () => {
    // Collect everyone: unassigned + anyone already in teams (full re-draft)
    const allPlayerIds = [
      ...unassigned,
      ...teams.flatMap((t) => [...t.signupIds, ...t.subSignupIds]),
    ];

    // Sort by rank score desc (best first); unranked (0) go last
    const sortedPool = [...new Set(allPlayerIds)].sort((a, b) => {
      const sA = rankScore(signupsById.get(a)?.rank, signupsById.get(a)?.rank_tier);
      const sB = rankScore(signupsById.get(b)?.rank, signupsById.get(b)?.rank_tier);
      return sB - sA;
    });

    // Snake-draft all players into new teams from scratch
    const numNew = Math.floor(sortedPool.length / teamSize);
    const leftover = sortedPool.slice(numNew * teamSize);
    const created: LocalTeam[] = Array.from({ length: numNew }, () => emptyTeam());

    sortedPool.slice(0, numNew * teamSize).forEach((sid, i) => {
      const round = Math.floor(i / numNew);
      const pos   = i % numNew;
      const idx   = round % 2 === 0 ? pos : numNew - 1 - pos;
      created[idx].signupIds.push(sid);
    });

    setIsDirty(true);
    setTeams(created);
    setUnassigned(leftover);
  };

  // ---- Manage signups ----------------------------------------------------

  const toggleSelectId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllSignups = () => setSelectedIds(new Set(signups.map((s) => s.id)));
  const deselectAllSignups = () => setSelectedIds(new Set());

  const addSignup = async () => {
    if (!addName.trim()) return;
    setAddingSave(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/signup/add`,
        { tournament_id: tournament.id, display_name: addName.trim(), discord_id: addDiscordId.trim() || null },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) { setAddName(""); setAddDiscordId(""); onRefresh(); }
    } catch {
      flash("Failed to add signup.", false);
    } finally {
      setAddingSave(false);
    }
  };

  const removeSelected = async () => {
    if (selectedIds.size === 0) return;
    setRemovingSave(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/signup/remove`,
        { tournament_id: tournament.id, signup_ids: [...selectedIds] },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) { setSelectedIds(new Set()); onRefresh(); }
    } catch {
      flash("Failed to remove signups.", false);
    } finally {
      setRemovingSave(false);
    }
  };

  const saveTeamSize = async () => {
    if (pendingTeamSize === teamSize) return;
    setTeamSizeSaving(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/team-size`,
        { tournament_id: tournament.id, team_size: pendingTeamSize },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) onRefresh();
    } catch {
      flash("Failed to update team size.", false);
    } finally {
      setTeamSizeSaving(false);
    }
  };

  // ---- API calls ---------------------------------------------------------

  const saveTeams = async () => {
    setSaving(true);
    try {
      const payload = {
        tournament_id: tournament.id,
        teams: teams.map((t) => ({
          name: t.name,
          signup_ids: t.signupIds,
          captain_signup_id: t.captainSignupId ?? null,
          sub_signup_ids: t.subSignupIds,
        })),
      };
      const { data } = await axios.post(`${API_URL}/api/tournament/admin/teams`, payload, { withCredentials: true });
      flash(data.message, data.ok);
      if (data.ok) { setIsDirty(false); onRefresh(); }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      flash(msg ?? "Failed to save teams.", false);
    } finally {
      setSaving(false);
    }
  };

  const lockTournament = () => {
    setConfirmModal({
      message: "This will close sign-ups and generate the bracket. Continue?",
      label: "Lock & Generate",
      danger: false,
      action: async () => {
        setLocking(true);
        try {
          const { data } = await axios.post(`${API_URL}/api/tournament/admin/lock`, { guild_id: GUILD_ID }, { withCredentials: true });
          flash(data.message, data.ok);
          if (data.ok) onRefresh();
        } catch {
          flash("Failed to lock tournament.", false);
        } finally {
          setLocking(false);
        }
      },
    });
  };

  const createTournament = async () => {
    if (!newTournamentName.trim()) return;
    setCreating(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/create`,
        {
          guild_id: GUILD_ID,
          name: newTournamentName.trim(),
          team_size: newTeamSize,
          special_rules: newSpecialRules.trim() || null,
          affects_rating: newAffectsRating,
        },
        { withCredentials: true }
      );
      flash(data.message, data.ok);
      if (data.ok) {
        setShowCreate(false);
        setNewTournamentName("");
        setNewSpecialRules("");
        setNewAffectsRating(true);
        onRefresh();
      }
    } catch {
      flash("Failed to create tournament.", false);
    } finally {
      setCreating(false);
    }
  };

  const endTournament = () => {
    setConfirmModal({
      message: `End "${tournament.name}"? This will award tournament wins to the final-match winner and lock the results.`,
      label: "End Tournament",
      danger: false,
      action: async () => {
        setEnding(true);
        try {
          const { data } = await axios.post(`${API_URL}/api/admin/tournament/end`, { guild_id: GUILD_ID }, { withCredentials: true });
          flash(data.message, data.ok);
          if (data.ok) onCancel();
        } catch {
          flash("Failed to end tournament.", false);
        } finally {
          setEnding(false);
        }
      },
    });
  };

  const cancelTournament = () => {
    setConfirmModal({
      message: `Cancel "${tournament.name}"? This cannot be undone.`,
      label: "Cancel Tournament",
      danger: true,
      action: async () => {
        setCancelling(true);
        try {
          const { data } = await axios.post(`${API_URL}/api/tournament/admin/cancel`, { guild_id: GUILD_ID }, { withCredentials: true });
          flash(data.message, data.ok);
          if (data.ok) {
            setTeams([]);
            setUnassigned([]);
            onCancel();
          }
        } catch {
          flash("Failed to cancel tournament.", false);
        } finally {
          setCancelling(false);
        }
      },
    });
  };

  // ---- Render ------------------------------------------------------------

  const isSignup = tournament.id !== 0 && tournament.status === "signup";

  return (
    <>
    {confirmModal && (
      <ConfirmModal
        message={confirmModal.message}
        confirmLabel={confirmModal.label}
        danger={confirmModal.danger}
        onConfirm={() => { setConfirmModal(null); confirmModal.action(); }}
        onCancel={() => setConfirmModal(null)}
      />
    )}
    <div className="flex flex-col gap-4">
      {isDirty && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded bg-amber-900/30 border border-amber-600/40 text-amber-300">
          <span>Unsaved changes — click Save Teams to persist.</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-slate-400"
          >
            New Tournament
          </button>
        )}
        {tournament.id !== 0 && tournament.status === "active" && (
          <button
            onClick={endTournament}
            disabled={ending}
            className="text-xs px-3 py-1.5 rounded border border-green-700/50 text-green-400 hover:border-green-600 disabled:opacity-50"
          >
            {ending ? "Ending…" : "End Tournament 🏆"}
          </button>
        )}
        {tournament.id !== 0 && (
          <button
            onClick={cancelTournament}
            disabled={cancelling}
            className="text-xs px-3 py-1.5 rounded border border-red-700/50 text-red-400 hover:border-red-500 disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel Tournament"}
          </button>
        )}
      </div>

      {msg && (
        <div className={`text-sm px-3 py-2 rounded ${msg.ok ? "bg-green-900/40 text-green-300 border border-green-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
          {msg.text}
        </div>
      )}

      {/* Create new tournament form */}
      {showCreate && (
        <div className="mb-4 p-3 rounded-lg border border-slate-700 bg-slate-800/40 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              className="flex-1 min-w-[160px] bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
              placeholder="Tournament name…"
              value={newTournamentName}
              onChange={(e) => setNewTournamentName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !newSpecialRules && createTournament()}
            />
            <select
              className="bg-slate-900/60 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
              value={newTeamSize}
              onChange={(e) => setNewTeamSize(parseInt(e.target.value))}
              title="Team size"
            >
              <option value={4}>4v4</option>
              <option value={3}>3v3</option>
              <option value={2}>2v2</option>
            </select>
            <button onClick={createTournament} disabled={creating} className="px-3 py-1.5 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50">
              {creating ? "…" : "Create"}
            </button>
            <button onClick={() => { setShowCreate(false); setNewSpecialRules(""); setNewAffectsRating(true); }} className="text-slate-500 hover:text-slate-300 px-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            className="w-full bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400 resize-none"
            rows={2}
            placeholder="Special rules (optional) - e.g. no chargers, specific weapon restrictions..."
            value={newSpecialRules}
            onChange={(e) => setNewSpecialRules(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newAffectsRating}
              onChange={(e) => setNewAffectsRating(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <span>Counts towards rating &amp; normal tournament wins</span>
            {!newAffectsRating && (
              <span className="text-xs text-amber-400 ml-1">(special wins only)</span>
            )}
          </label>
        </div>
      )}

      {/* Team builder (signup phase only) */}
      {isSignup && (
        <>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-400">
                Drag players into teams · Teams need exactly {teamSize} players
              </p>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-800/40 border border-purple-600/40 text-purple-300">
                {teamSize}v{teamSize}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={autoAssignAll} className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:border-slate-400">
                Auto-assign all
              </button>
              <button onClick={addTeam} className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:border-slate-400 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add team
              </button>
            </div>
          </div>

          {/* Manage signups collapsible */}
          <div className="mb-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <button
              onClick={() => setManageOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="font-medium">Manage Sign-ups</span>
              <span className="ml-1 text-slate-600">({signups.length} players)</span>
              {manageOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </button>

            {manageOpen && (
              <div className="px-3 pb-3 flex flex-col gap-3 border-t border-slate-700/40 pt-3">

                {/* Team size changer */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 shrink-0">Team size:</span>
                  {([2, 3, 4] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setPendingTeamSize(s)}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        pendingTeamSize === s
                          ? "border-purple-500 bg-purple-700/30 text-purple-200"
                          : "border-slate-600 text-slate-400 hover:border-slate-400"
                      }`}
                    >
                      {s}v{s}
                    </button>
                  ))}
                  {pendingTeamSize !== teamSize && (
                    <button
                      onClick={saveTeamSize}
                      disabled={teamSizeSaving}
                      className="text-xs px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                    >
                      {teamSizeSaving ? "Saving…" : "Save"}
                    </button>
                  )}
                </div>

                {/* Add signup */}
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wide">Display name</label>
                    <input
                      className="bg-slate-900/60 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-400 w-40"
                      placeholder="Player name…"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSignup()}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wide">Discord ID (optional)</label>
                    <input
                      className="bg-slate-900/60 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-400 w-40"
                      placeholder="123456789…"
                      value={addDiscordId}
                      onChange={(e) => setAddDiscordId(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSignup()}
                    />
                  </div>
                  <button
                    onClick={addSignup}
                    disabled={addingSave || !addName.trim()}
                    className="text-xs px-3 py-1.5 rounded bg-green-700/60 border border-green-600/50 text-green-200 hover:bg-green-700/80 disabled:opacity-40 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    {addingSave ? "Adding…" : "Add"}
                  </button>
                </div>

                {/* Bulk remove checklist */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">Remove players</span>
                    <button onClick={selectAllSignups} className="text-[10px] text-slate-500 hover:text-purple-400 underline">All</button>
                    <button onClick={deselectAllSignups} className="text-[10px] text-slate-500 hover:text-slate-300 underline">None</button>
                    {selectedIds.size > 0 && (
                      <button
                        onClick={removeSelected}
                        disabled={removingSave}
                        className="ml-auto text-xs px-2.5 py-1 rounded bg-red-800/50 border border-red-600/50 text-red-200 hover:bg-red-800/70 disabled:opacity-40 flex items-center gap-1"
                      >
                        <UserMinus className="w-3 h-3" />
                        {removingSave ? "Removing…" : `Remove ${selectedIds.size}`}
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 pr-1">
                    {signups.length === 0 ? (
                      <p className="text-xs text-slate-600 italic">No sign-ups yet.</p>
                    ) : (
                      signups.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-700/40 select-none">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleSelectId(s.id)}
                            className="accent-red-500 w-3.5 h-3.5 shrink-0"
                          />
                          <span className="text-sm text-slate-300 truncate">{s.display_name}</span>
                          {s.rank && (
                            <span className="text-xs text-slate-500 shrink-0">{rankLabel(s.rank, s.rank_tier)}</span>
                          )}
                          {s.discord_id && (
                            <span className="text-[10px] text-slate-600 shrink-0 ml-auto">Discord</span>
                          )}
                          {s.twitch_username && !s.discord_id && (
                            <span className="text-[10px] text-purple-600 shrink-0 ml-auto">Twitch</span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
            {teams.map((team) => (
              <TeamSlot
                key={team.localId}
                team={team}
                signupsById={signupsById}
                onDrop={moveToTeam}
                onDropSub={moveToSub}
                onRemovePlayer={removeFromTeam}
                onRemoveSub={removeSubFromTeam}
                onRemoveTeam={removeTeam}
                onRename={renameTeam}
                onAutoFill={autoFill}
                onSetCaptain={setCaptain}
                unassignedPool={unassigned}
                teamSize={teamSize}
              />
            ))}
          </div>

          {/* Unassigned pool */}
          {unassigned.length > 0 && (
            <div
              className="rounded-lg border border-dashed border-slate-600/60 p-3 mb-4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const sid = parseInt(e.dataTransfer.getData("signupId"), 10);
                if (!isNaN(sid)) removeSignupFromAll(sid);
              }}
            >
              <p className="text-xs text-slate-500 mb-2">{unassigned.length} unassigned player(s) - drag into a team</p>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((sid) => {
                  const s = signupsById.get(sid);
                  if (!s) return null;
                  return (
                    <PlayerPill
                      key={sid}
                      signup={s}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("signupId", String(sid))}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={saveTeams}
              disabled={saving}
              className="px-4 py-2 text-sm rounded bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Teams"}
            </button>
            <button
              onClick={lockTournament}
              disabled={locking}
              className="px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              {locking ? "Locking…" : "Lock & Generate Bracket"}
            </button>
          </div>
        </>
      )}

    </div>
    </>
  );
}

// ---- Round schedule panel ------------------------------------------------

export function RoundScheduleSection({ tournamentId, signupCount, teamSize, initialOpen = false }: {
  tournamentId: number;
  signupCount: number;
  teamSize: number;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [rounds, setRounds] = useState(0);
  const [schedule, setSchedule] = useState<RoundMapMode[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const estimatedRounds = Math.ceil(Math.log2(Math.max(Math.floor(signupCount / teamSize), 2)));
  const [manualRounds, setManualRounds] = useState(estimatedRounds);

  const displayRounds = rounds > 0 ? rounds : manualRounds;

  useEffect(() => { if (initialOpen) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (loaded) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament`, { params: { id: tournamentId } });
      const r: number = data.rounds?.length ?? 0;
      setRounds(r);
      const existing: RoundMapMode[] = (data.rounds ?? []).map((rd: { round: number; schedule?: { stage_name?: string; mode_id?: string; mode_name?: string; best_of?: number; games?: { game_number: number; stage_name: string | null; mode_id?: string | null; mode_name?: string | null }[] } }) => {
        const bestOf = (rd.schedule?.best_of ?? 1) as 1 | 3 | 5 | 7;
        const rawGames = rd.schedule?.games ?? [];
        const game_maps = Array.from({ length: bestOf }, (_, i) => {
          const existing = rawGames.find((g) => g.game_number === i + 1);
          return { game_number: i + 1, stage_name: existing?.stage_name ?? null, mode_id: existing?.mode_id ?? null, mode_name: existing?.mode_name ?? null };
        });
        return {
          round: rd.round,
          stage: null,
          mode: rd.schedule?.mode_id
            ? { id: rd.schedule.mode_id, name: rd.schedule.mode_name ?? "", icon: "" }
            : null,
          best_of: bestOf,
          game_maps,
        };
      });
      setSchedule(existing);
      setLoaded(true);
    } catch { /* best-effort */ }
  }, [loaded, tournamentId]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        tournament_id: tournamentId,
        schedule: schedule.map((r) => ({
          round: r.round,
          stage_name: r.game_maps?.[0]?.stage_name ?? null,
          mode_id: r.mode?.id ?? null,
          mode_name: r.mode?.name ?? null,
          best_of: r.best_of ?? 1,
          game_maps: (r.game_maps ?? []).map((g) => ({ game_number: g.game_number, stage_name: g.stage_name, mode_id: g.mode_id ?? null, mode_name: g.mode_name ?? null })),
        })),
      };
      const { data } = await axios.post(`${API_URL}/api/tournament/admin/schedule`, payload, { withCredentials: true });
      setMsg({ text: data.message, ok: data.ok });
      setTimeout(() => setMsg(null), 3500);
    } catch {
      setMsg({ text: "Failed to save schedule.", ok: false });
      setTimeout(() => setMsg(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-700/40 pt-4">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <MapIcon className="w-4 h-4" />
        <span className="font-medium">Round Schedule</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-3">
          {rounds === 0 && (
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
              <span>Estimated rounds:</span>
              <input
                type="number"
                min={1}
                max={8}
                value={manualRounds}
                onChange={(e) => setManualRounds(Math.max(1, Math.min(8, Number(e.target.value))))}
                className="w-12 px-1 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
              />
              {signupCount > 0 && (
                <span className="text-slate-500">
                  ({Math.floor(signupCount / teamSize)} teams signed up)
                </span>
              )}
            </div>
          )}
          {msg && (
            <div className={`mb-3 text-xs px-3 py-2 rounded ${msg.ok ? "bg-green-900/40 text-green-300 border border-green-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
              {msg.text}
            </div>
          )}
          <MapModePicker rounds={displayRounds} value={schedule} onChange={setSchedule} />
          <button
            onClick={save}
            disabled={saving}
            className="mt-3 px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Schedule"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Map pool section ---------------------------------------------------

export function MapPoolSection({ tournamentId, initialOpen = false }: { tournamentId: number; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [activeMode, setActiveMode] = useState(MODES[0].id);
  // pool: mode_id → Set of allowed stage names (empty Set = all allowed)
  const [pool, setPool] = useState<Record<string, Set<string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { if (initialOpen) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (loaded) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/admin/map-pool`, {
        params: { guild_id: GUILD_ID },
        withCredentials: true,
      });
      const loaded_pool: Record<string, Set<string>> = {};
      for (const [modeId, stages] of Object.entries(data.pool ?? {})) {
        loaded_pool[modeId] = new Set(stages as string[]);
      }
      setPool(loaded_pool);
      setLoaded(true);
    } catch { /* ignore */ }
  }, [loaded]);

  const toggle = (modeId: string, stageName: string) => {
    setPool((prev) => {
      const cur = new Set(prev[modeId] ?? []);
      if (cur.has(stageName)) cur.delete(stageName); else cur.add(stageName);
      return { ...prev, [modeId]: cur };
    });
  };

  const selectAll = (modeId: string) => {
    setPool((prev) => ({ ...prev, [modeId]: new Set(STAGES.map((s) => s.name)) }));
  };

  const clearAll = (modeId: string) => {
    setPool((prev) => ({ ...prev, [modeId]: new Set() }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const serialized: Record<string, string[]> = {};
      for (const [modeId, stages] of Object.entries(pool)) {
        if (stages.size > 0) serialized[modeId] = [...stages];
      }
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/map-pool`,
        { tournament_id: tournamentId, pool: serialized },
        { withCredentials: true }
      );
      setMsg({ text: data.message, ok: data.ok });
      setTimeout(() => setMsg(null), 3500);
    } catch {
      setMsg({ text: "Failed to save.", ok: false });
      setTimeout(() => setMsg(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  const currentAllowed = pool[activeMode] ?? new Set<string>();
  const modeData = MODES.find((m) => m.id === activeMode);

  return (
    <div className="mt-4 border-t border-slate-700/40 pt-4">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <MapIcon className="w-4 h-4" />
        <span className="font-medium">Map Pool</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-3">
            Select which stages are allowed for each mode. If none are selected for a mode, all stages are available.
          </p>

          {msg && (
            <div className={`mb-3 text-xs px-3 py-2 rounded ${msg.ok ? "bg-green-900/40 text-green-300 border border-green-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
              {msg.text}
            </div>
          )}

          {/* Mode tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {MODES.map((m) => {
              const cnt = pool[m.id]?.size ?? 0;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveMode(m.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeMode === m.id
                      ? "bg-purple-600 text-white"
                      : "bg-slate-700/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <img src={m.icon} alt="" className="w-3.5 h-3.5 object-contain" />
                  {m.name}
                  {cnt > 0 && (
                    <span className="text-[10px] opacity-70">({cnt})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Per-mode controls */}
          <div className="flex items-center gap-2 mb-2">
            {modeData && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <img src={modeData.icon} alt="" className="w-3.5 h-3.5 object-contain" />
                {modeData.name}
              </span>
            )}
            <span className="text-xs text-slate-600 ml-auto">
              {currentAllowed.size === 0 ? "All stages allowed" : `${currentAllowed.size} selected`}
            </span>
            <button onClick={() => selectAll(activeMode)} className="text-[10px] text-slate-500 hover:text-purple-400 underline">
              All
            </button>
            <button onClick={() => clearAll(activeMode)} className="text-[10px] text-slate-500 hover:text-red-400 underline">
              None
            </button>
          </div>

          {/* Stage grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 mb-3">
            {STAGES.map((stage) => {
              const selected = currentAllowed.has(stage.name);
              return (
                <button
                  key={stage.name}
                  onClick={() => toggle(activeMode, stage.name)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                    selected
                      ? "border-purple-500 ring-1 ring-purple-500/30"
                      : "border-slate-700/50 opacity-50 hover:opacity-80 hover:border-slate-500"
                  }`}
                >
                  <img src={stage.image} alt={stage.name} className="w-full h-10 object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <span className="absolute bottom-0.5 left-1 right-1 text-[9px] font-semibold text-white leading-tight truncate">
                    {stage.name}
                  </span>
                  {selected && (
                    <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-purple-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Map Pool"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Player profiles panel (admin-only) ----------------------------------

export interface ProfileRow {
  id: number;
  discord_id: string | null;
  display_name: string;
  twitch_username: string | null;
  twitch_native: boolean;
  splattag: string | null;
  rank: number | null;
  rank_tier: number | null;
  predicted_rank: number | null;
  predicted_rank_tier: number | null;
  rank_name: string;
  rank_emoji: string;
  rating: number;
  trueskill_mu: number;
  trueskill_sigma: number;
  matches_won: number;
  matches_lost: number;
  games_won: number;
  games_lost: number;
  win_rate: number;
  tournament_wins: number;
  tournaments_played: number;
}

export function PlayerProfilesSection() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [rankSaving, setRankSaving] = useState<Record<string, boolean>>({});
  const [splattagEdit, setSplattagEdit] = useState<Record<string, string | null>>({});
  const [splattagSaving, setSplattagSaving] = useState<Record<string, boolean>>({});
  const [nativeToggling, setNativeToggling] = useState<Record<number, boolean>>({});
  const [discordEdit, setDiscordEdit] = useState<Record<number, string | null>>({});
  const [discordSaving, setDiscordSaving] = useState<Record<number, boolean>>({});
  const [discordSaveError, setDiscordSaveError] = useState<Record<number, string>>({});
  const [discordInfo, setDiscordInfo] = useState<Record<number, { discord_id: string; username: string; avatar_url: string | null }>>({});
  const [discordLookupLoading, setDiscordLookupLoading] = useState<Record<number, boolean>>({});
  const discordLookupTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [winAdjusting, setWinAdjusting] = useState<Record<number, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<ProfileRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/players`, {
        params: q ? { search: q } : {},
        withCredentials: true,
      });
      setProfiles(data.players ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) load();
      return next;
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(search || undefined);
  };

  const setRank = async (playerId: number, value: string, rankType: "actual" | "predicted") => {
    const key = `${playerId}-${rankType}`;
    setRankSaving((prev) => ({ ...prev, [key]: true }));
    try {
      let rank: number | null = null;
      let rank_tier: number | null = null;
      if (value) {
        const [r, t] = value.split("-").map(Number);
        rank = r; rank_tier = t;
      }
      await axios.post(
        `${API_URL}/api/admin/player/${playerId}/rank`,
        { rank, rank_tier, rank_type: rankType },
        { withCredentials: true },
      );
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p;
          if (rankType === "predicted") {
            return { ...p, predicted_rank: rank, predicted_rank_tier: rank_tier };
          }
          return { ...p, rank, rank_tier, rank_name: rank ? rankLabel(rank, rank_tier) : "Unranked" };
        })
      );
    } finally {
      setRankSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const saveSplattag = async (playerId: number) => {
    const key = String(playerId);
    const tag = splattagEdit[key]?.trim();
    if (!tag) return;
    setSplattagSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await axios.post(
        `${API_URL}/api/admin/player/${playerId}/splattag`,
        { splattag: tag },
        { withCredentials: true },
      );
      setProfiles((prev) => prev.map((p) => p.id === playerId ? { ...p, splattag: tag } : p));
      setSplattagEdit((prev) => ({ ...prev, [key]: null }));
    } catch {
      // leave edit open on failure
    } finally {
      setSplattagSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const lookupDiscordUser = useCallback(async (playerId: number, q: string) => {
    setDiscordLookupLoading((prev) => ({ ...prev, [playerId]: true }));
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/discord-lookup`, {
        params: { q, guild_id: GUILD_ID || undefined },
        withCredentials: true,
      });
      if (data.ok) {
        setDiscordInfo((prev) => ({ ...prev, [playerId]: { discord_id: data.discord_id, username: data.username, avatar_url: data.avatar_url ?? null } }));
      } else {
        setDiscordInfo((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
      }
    } catch {
      setDiscordInfo((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    } finally {
      setDiscordLookupLoading((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    }
  }, []);

  const saveDiscordId = useCallback(async (playerId: number, val: string) => {
    if (!val || !/^\d{17,20}$/.test(val)) return;
    setDiscordSaving((prev) => ({ ...prev, [playerId]: true }));
    setDiscordSaveError((prev) => ({ ...prev, [playerId]: "" }));
    try {
      const { data } = await axios.post(
        `${API_URL}/api/admin/player/${playerId}/discord`,
        { discord_id: val },
        { withCredentials: true }
      );
      if (data.ok) {
        setProfiles((prev) => prev.map((r) => r.id === playerId ? { ...r, discord_id: val } : r));
        setDiscordEdit((prev) => ({ ...prev, [playerId]: null }));
      } else {
        setDiscordSaveError((prev) => ({ ...prev, [playerId]: data.message ?? "Failed to save." }));
      }
    } catch {
      setDiscordSaveError((prev) => ({ ...prev, [playerId]: "Request failed." }));
    } finally {
      setDiscordSaving((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    }
  }, []);

  const adjustTournamentWins = async (playerId: number, delta: 1 | -1) => {
    setWinAdjusting((prev) => ({ ...prev, [playerId]: true }));
    try {
      const { data } = await axios.post(
        `${API_URL}/api/admin/player/${playerId}/tournament-wins`,
        { delta },
        { withCredentials: true }
      );
      if (data.ok) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === playerId
              ? { ...p, tournament_wins: Math.max(0, p.tournament_wins + delta) }
              : p
          )
        );
      }
    } finally {
      setWinAdjusting((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    }
  };

  const deletePlayer = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/api/admin/player/${deleteConfirm.id}`, { withCredentials: true });
      setProfiles((prev) => prev.filter((p) => p.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-700/40 pt-4">
      <button
        onClick={toggle}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <Users className="w-4 h-4" />
        <span className="font-medium">Player Profiles</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {profiles.length > 0 && (
          <span className="text-xs text-slate-600 ml-1">({profiles.length})</span>
        )}
      </button>

      {open && (
        <div className="mt-3">
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <input
              className="flex-1 bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
              placeholder="Search by name, splattag, or Twitch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-white">
              Search
            </button>
            {search && (
              <button type="button" onClick={() => { setSearch(""); load(); }} className="text-slate-500 hover:text-slate-300 px-1 text-xs">
                Clear
              </button>
            )}
          </form>

          {loading ? (
            <p className="text-xs text-slate-500 py-2">Loading…</p>
          ) : profiles.length === 0 ? (
            <p className="text-xs text-slate-600 py-2">No profiles found.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/40 bg-slate-900/40">
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Player</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Twitch</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Actual Rank</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Predicted Rank</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Rating</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Series W/L</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Games W/L</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide">Trophy Wins</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-white">{p.display_name || "-"}</div>
                        {splattagEdit[String(p.id)] != null ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              autoFocus
                              value={splattagEdit[String(p.id)] ?? ""}
                              onChange={(e) => setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveSplattag(p.id);
                                if (e.key === "Escape") setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: null }));
                              }}
                              placeholder="Name#1234"
                              className="w-28 bg-slate-900 border border-purple-500/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                            />
                            <button
                              onClick={() => saveSplattag(p.id)}
                              disabled={splattagSaving[String(p.id)]}
                              className="text-green-400 hover:text-green-300 disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: null }))} className="text-slate-500 hover:text-slate-300">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-0.5 group">
                            <span className={p.splattag ? "text-slate-500" : "text-red-500/60 text-[10px]"}>
                              {p.splattag ?? "no tag"}
                            </span>
                            <button
                              onClick={() => setSplattagEdit((prev) => ({ ...prev, [String(p.id)]: p.splattag ?? "" }))}
                              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-purple-400 transition-opacity"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                        {discordEdit[p.id] != null ? (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={String(discordEdit[p.id] ?? "")}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDiscordEdit((prev) => ({ ...prev, [p.id]: v }));
                                  clearTimeout(discordLookupTimers.current[p.id]);
                                  const trimmed = v.trim();
                                  if (trimmed.length >= 2) {
                                    discordLookupTimers.current[p.id] = setTimeout(
                                      () => lookupDiscordUser(p.id, trimmed), 800
                                    );
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") { setDiscordEdit((prev) => ({ ...prev, [p.id]: null })); setDiscordSaveError((prev) => ({ ...prev, [p.id]: "" })); return; }
                                  if (e.key === "Enter") {
                                    const val = discordInfo[p.id]?.discord_id ?? String(discordEdit[p.id] ?? "").trim();
                                    saveDiscordId(p.id, val);
                                  }
                                }}
                                placeholder="ID or username"
                                className="w-36 bg-slate-900 border border-purple-500/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none font-mono"
                              />
                              <button
                                disabled={discordSaving[p.id] || (
                                  !discordInfo[p.id]?.discord_id &&
                                  !/^\d{17,20}$/.test(String(discordEdit[p.id] ?? "").trim())
                                )}
                                onClick={() => {
                                  const val = discordInfo[p.id]?.discord_id ?? String(discordEdit[p.id] ?? "").trim();
                                  saveDiscordId(p.id, val);
                                }}
                                className="text-green-400 hover:text-green-300 disabled:opacity-30"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => { setDiscordEdit((prev) => ({ ...prev, [p.id]: null })); setDiscordSaveError((prev) => ({ ...prev, [p.id]: "" })); }}
                                className="text-slate-500 hover:text-slate-300"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            {discordLookupLoading[p.id] && (
                              <span className="text-slate-500 text-[10px] pl-0.5">Looking up…</span>
                            )}
                            {!discordLookupLoading[p.id] && discordInfo[p.id] && (
                              <div className="flex items-center gap-1 pl-0.5">
                                {discordInfo[p.id]!.avatar_url && (
                                  <img src={discordInfo[p.id]!.avatar_url!} alt="" className="w-4 h-4 rounded-full shrink-0" />
                                )}
                                <span className="text-indigo-300 text-[10px]">{discordInfo[p.id]!.username}</span>
                                <span className="text-slate-600 text-[10px] font-mono">{discordInfo[p.id]!.discord_id}</span>
                              </div>
                            )}
                            {discordSaveError[p.id] && (
                              <span className="text-red-400 text-[10px] pl-0.5">{discordSaveError[p.id]}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-0.5 group">
                            {p.discord_id ? (
                              <>
                                {discordInfo[p.id]?.avatar_url
                                  ? <img src={discordInfo[p.id]!.avatar_url!} alt="" className="w-3.5 h-3.5 rounded-full shrink-0" />
                                  : <AdminDiscordIcon />
                                }
                                <span className="text-[10px] select-all text-slate-400">
                                  {discordInfo[p.id]?.username ?? p.discord_id}
                                </span>
                              </>
                            ) : (
                              <span className="text-red-500/60 text-[10px]">no discord</span>
                            )}
                            <button
                              onClick={() => {
                                const existing = p.discord_id ? String(p.discord_id) : "";
                                setDiscordEdit((prev) => ({ ...prev, [p.id]: existing }));
                                if (existing && /^\d{17,20}$/.test(existing)) {
                                  lookupDiscordUser(p.id, existing);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-purple-400 transition-opacity"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.twitch_username ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-purple-400 flex items-center gap-1"><AdminTwitchIcon />{p.twitch_username}</span>
                            <button
                              disabled={nativeToggling[p.id]}
                              onClick={async () => {
                                setNativeToggling((prev) => ({ ...prev, [p.id]: true }));
                                try {
                                  const { data } = await axios.post(`${API_URL}/api/admin/player/${p.id}/twitch-native/toggle`, {}, { withCredentials: true });
                                  if (data.ok) setProfiles((prev) => prev.map((r) => r.id === p.id ? { ...r, twitch_native: data.twitch_native } : r));
                                } finally {
                                  setNativeToggling((prev) => ({ ...prev, [p.id]: false }));
                                }
                              }}
                              className="text-left disabled:opacity-50"
                            >
                              {p.twitch_native
                                ? <span className="text-green-500 text-[10px] hover:text-green-300">✓ verified from Twitch</span>
                                : <span className="text-yellow-500/80 text-[10px] hover:text-yellow-400">⚠ linked via Discord only</span>
                              }
                            </button>
                          </div>
                        ) : <span className="text-red-500/60 text-[10px]">not linked</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={p.rank && p.rank_tier ? `${p.rank}-${p.rank_tier}` : ""}
                          disabled={rankSaving[`${p.id}-actual`]}
                          onChange={(e) => setRank(p.id, e.target.value, "actual")}
                          className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
                        >
                          {RANK_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={p.predicted_rank && p.predicted_rank_tier ? `${p.predicted_rank}-${p.predicted_rank_tier}` : ""}
                          disabled={rankSaving[`${p.id}-predicted`]}
                          onChange={(e) => setRank(p.id, e.target.value, "predicted")}
                          className="bg-slate-800 border border-slate-500/50 rounded px-1.5 py-0.5 text-xs text-slate-300 italic focus:outline-none focus:border-yellow-400 disabled:opacity-50"
                        >
                          {RANK_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <div className="text-purple-300 font-mono font-semibold">{p.rating}</div>
                        <div className="text-[10px] text-slate-600">μ{p.trueskill_mu?.toFixed(1)} σ{p.trueskill_sigma?.toFixed(1)}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="text-green-400">{p.matches_won}</span>
                        <span className="text-slate-600 mx-0.5">/</span>
                        <span className="text-red-400/80">{p.matches_lost}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="text-green-400/80">{p.games_won ?? 0}</span>
                        <span className="text-slate-600 mx-0.5">/</span>
                        <span className="text-red-400/60">{p.games_lost ?? 0}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            disabled={winAdjusting[p.id]}
                            onClick={() => adjustTournamentWins(p.id, -1)}
                            className="w-5 h-5 rounded bg-slate-700 hover:bg-red-900/60 text-slate-400 hover:text-red-300 disabled:opacity-40 flex items-center justify-center text-xs font-bold transition-colors"
                            title="Retract win"
                          >−</button>
                          <span className={`min-w-[1.5rem] text-center font-semibold tabular-nums ${p.tournament_wins > 0 ? "text-yellow-400" : "text-slate-600"}`}>
                            {p.tournament_wins}
                          </span>
                          <button
                            disabled={winAdjusting[p.id]}
                            onClick={() => adjustTournamentWins(p.id, 1)}
                            className="w-5 h-5 rounded bg-slate-700 hover:bg-green-900/60 text-slate-400 hover:text-green-300 disabled:opacity-40 flex items-center justify-center text-xs font-bold transition-colors"
                            title="Award win"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setDeleteConfirm(p)}
                          className="w-5 h-5 rounded bg-slate-700 hover:bg-red-900/70 text-slate-500 hover:text-red-400 flex items-center justify-center transition-colors"
                          title="Delete player"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">Delete player?</h3>
            <p className="text-sm text-slate-400 mb-1">
              This will permanently delete <span className="text-white font-medium">{deleteConfirm.display_name}</span> and all their stats.
            </p>
            <p className="text-xs text-red-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-1.5 rounded-lg text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >Cancel</button>
              <button
                onClick={deletePlayer}
                disabled={deleting}
                className="px-4 py-1.5 rounded-lg text-sm bg-red-700 hover:bg-red-600 text-white font-semibold disabled:opacity-50 transition-colors"
              >{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Map pool presets section -------------------------------------------

interface MapPoolPreset {
  id: number;
  name: string;
  pool: Record<string, string[]>;
}

export function MapPoolPresetsSection({ tournamentId }: { tournamentId: number }) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<MapPoolPreset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPool, setEditingPool] = useState<Record<string, Set<string>>>({});
  const [activeMode, setActiveMode] = useState(MODES[0].id);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isNew, setIsNew] = useState(false);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const loadPresets = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/admin/map-pool-presets`, { withCredentials: true });
      setPresets(data.presets ?? []);
      setLoaded(true);
    } catch { /* ignore */ }
  }, []);

  const selectPreset = (preset: MapPoolPreset) => {
    setSelectedId(preset.id);
    setEditingName(preset.name);
    setIsNew(false);
    const pool: Record<string, Set<string>> = {};
    for (const [modeId, stages] of Object.entries(preset.pool)) {
      pool[modeId] = new Set(stages);
    }
    setEditingPool(pool);
    setActiveMode(MODES[0].id);
  };

  const startNew = () => {
    setSelectedId(null);
    setEditingName("");
    setEditingPool({});
    setActiveMode(MODES[0].id);
    setIsNew(true);
  };

  const toggleStage = (modeId: string, stageName: string) => {
    setEditingPool((prev) => {
      const cur = new Set(prev[modeId] ?? []);
      if (cur.has(stageName)) cur.delete(stageName); else cur.add(stageName);
      return { ...prev, [modeId]: cur };
    });
  };

  const selectAll = (modeId: string) => setEditingPool((p) => ({ ...p, [modeId]: new Set(STAGES.map((s) => s.name)) }));
  const clearAll  = (modeId: string) => setEditingPool((p) => ({ ...p, [modeId]: new Set() }));

  const save = async () => {
    if (!editingName.trim()) return;
    setSaving(true);
    try {
      const serialized: Record<string, string[]> = {};
      for (const [modeId, stages] of Object.entries(editingPool)) {
        if (stages.size > 0) serialized[modeId] = [...stages];
      }
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/map-pool-presets`,
        { id: isNew ? null : selectedId, name: editingName.trim(), pool: serialized },
        { withCredentials: true },
      );
      if (data.ok) {
        flash("Preset saved.", true);
        await loadPresets();
        if (isNew && data.id) {
          setSelectedId(data.id);
          setIsNew(false);
        }
      } else {
        flash(data.message ?? "Failed to save.", false);
      }
    } catch {
      flash("Failed to save.", false);
    } finally {
      setSaving(false);
    }
  };

  const applyToTournament = async () => {
    if (!selectedId) return;
    setApplying(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/map-pool-presets/apply`,
        { preset_id: selectedId, tournament_id: tournamentId },
        { withCredentials: true },
      );
      flash(data.message ?? (data.ok ? "Applied!" : "Failed."), data.ok);
    } catch {
      flash("Failed to apply.", false);
    } finally {
      setApplying(false);
    }
  };

  const deletePreset = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/map-pool-presets/delete`,
        { id: selectedId },
        { withCredentials: true },
      );
      if (data.ok) {
        flash("Preset deleted.", true);
        setSelectedId(null);
        setIsNew(false);
        setEditingName("");
        setEditingPool({});
        await loadPresets();
      } else {
        flash(data.message ?? "Failed.", false);
      }
    } catch {
      flash("Failed to delete.", false);
    } finally {
      setDeleting(false);
    }
  };

  const currentAllowed = editingPool[activeMode] ?? new Set<string>();
  const modeData = MODES.find((m) => m.id === activeMode);

  return (
    <div className="mt-4 border-t border-slate-700/40 pt-4">
      <button
        onClick={() => { setOpen((o) => !o); if (!open && !loaded) loadPresets(); }}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <MapIcon className="w-4 h-4" />
        <span className="font-medium">Map Pool Presets</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {presets.length > 0 && <span className="text-xs text-slate-600 ml-1">({presets.length})</span>}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          {msg && (
            <div className={`text-xs px-3 py-2 rounded border ${msg.ok ? "bg-green-900/40 text-green-300 border-green-700/40" : "bg-red-900/40 text-red-300 border-red-700/40"}`}>
              {msg.text}
            </div>
          )}

          {/* Preset list + new button */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPreset(p)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  selectedId === p.id && !isNew
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "bg-slate-700/60 border-slate-600/50 text-slate-300 hover:text-white"
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={startNew}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                isNew
                  ? "bg-green-700/50 border-green-600/50 text-green-200"
                  : "border-dashed border-slate-600/60 text-slate-500 hover:text-slate-300"
              }`}
            >
              <Plus className="w-3 h-3" /> New preset
            </button>
          </div>

          {/* Editor — shown when a preset is selected or new */}
          {(selectedId !== null || isNew) && (
            <div className="flex flex-col gap-3 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30">
              {/* Name row */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  className="flex-1 min-w-[160px] bg-slate-900/60 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400"
                  placeholder="Preset name…"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                />
                <button
                  onClick={save}
                  disabled={saving || !editingName.trim()}
                  className="px-3 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Preset"}
                </button>
                {!isNew && (
                  <>
                    <button
                      onClick={applyToTournament}
                      disabled={applying}
                      className="px-3 py-1.5 text-xs rounded bg-blue-700/60 border border-blue-600/50 text-blue-200 hover:bg-blue-700/80 disabled:opacity-50"
                    >
                      {applying ? "Applying…" : "Apply to Tournament"}
                    </button>
                    <button
                      onClick={deletePreset}
                      disabled={deleting}
                      className="px-3 py-1.5 text-xs rounded border border-red-700/50 text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                    >
                      {deleting ? "…" : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
              </div>

              {/* Mode tabs */}
              <div className="flex flex-wrap gap-1">
                {MODES.map((m) => {
                  const cnt = editingPool[m.id]?.size ?? 0;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setActiveMode(m.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeMode === m.id
                          ? "bg-purple-600 text-white"
                          : "bg-slate-700/60 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <img src={m.icon} alt="" className="w-3.5 h-3.5 object-contain" />
                      {m.name}
                      {cnt > 0 && <span className="text-[10px] opacity-70">({cnt})</span>}
                    </button>
                  );
                })}
              </div>

              {/* Per-mode controls */}
              <div className="flex items-center gap-2">
                {modeData && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <img src={modeData.icon} alt="" className="w-3.5 h-3.5 object-contain" />
                    {modeData.name}
                  </span>
                )}
                <span className="text-xs text-slate-600 ml-auto">
                  {currentAllowed.size === 0 ? "All stages allowed" : `${currentAllowed.size} selected`}
                </span>
                <button onClick={() => selectAll(activeMode)} className="text-[10px] text-slate-500 hover:text-purple-400 underline">All</button>
                <button onClick={() => clearAll(activeMode)} className="text-[10px] text-slate-500 hover:text-red-400 underline">None</button>
              </div>

              {/* Stage grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
                {STAGES.map((stage) => {
                  const selected = currentAllowed.has(stage.name);
                  return (
                    <button
                      key={stage.name}
                      onClick={() => toggleStage(activeMode, stage.name)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                        selected
                          ? "border-purple-500 ring-1 ring-purple-500/30"
                          : "border-slate-700/50 opacity-50 hover:opacity-80 hover:border-slate-500"
                      }`}
                    >
                      <img src={stage.image} alt={stage.name} className="w-full h-10 object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <span className="absolute bottom-0.5 left-1 right-1 text-[9px] font-semibold text-white leading-tight truncate">
                        {stage.name}
                      </span>
                      {selected && (
                        <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-purple-500 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {presets.length === 0 && !isNew && (
            <p className="text-xs text-slate-600 italic">No presets yet — click "New preset" to create one.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Overlay settings section -------------------------------------------

type RibbonMode = "idle" | "active" | "open_lobby";
type MatchType  = "open_battle" | "private_battle";

export function OverlaySettingsSection() {
  const [open, setOpen]           = useState(false);
  const [ribbonMode, setRibbonMode] = useState<RibbonMode>("active");
  const [matchType, setMatchType] = useState<MatchType>("open_battle");
  // Map slot 1
  const [stage,  setStage]  = useState("");
  const [modeId, setModeId] = useState("");
  // Map slot 2 (open battle)
  const [stage2,  setStage2]  = useState("");
  const [modeId2, setModeId2] = useState("");
  const [roomCode, setRoomCode]   = useState("");
  const [lobbyPool, setLobbyPool] = useState("sneakyn");
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);
  const [loaded, setLoaded]       = useState(false);

  const load = useCallback(async () => {
    if (loaded) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/overlay/settings`);
      setRibbonMode(data.ribbon_mode ?? "active");
      setMatchType(data.open_lobby_match_type ?? "open_battle");
      setStage(data.open_lobby_stage ?? "");
      setModeId(data.open_lobby_mode_id ?? "");
      setStage2(data.open_lobby_stage_2 ?? "");
      setModeId2(data.open_lobby_mode_id_2 ?? "");
      setRoomCode(data.open_lobby_room_code ?? "");
      setLobbyPool(data.lobby_pool ?? "");
      setLoaded(true);
    } catch { /* best-effort */ }
  }, [loaded]);

  const save = async () => {
    setSaving(true);
    const modeName  = MODES.find((m) => m.id === modeId)?.name  ?? null;
    const modeName2 = MODES.find((m) => m.id === modeId2)?.name ?? null;
    const isOpen = matchType === "open_battle";
    try {
      const { data } = await axios.post(
        `${API_URL}/api/tournament/admin/overlay-settings`,
        {
          ribbon_mode: ribbonMode,
          open_lobby_match_type: matchType,
          open_lobby_stage:      isOpen ? (stage  || null) : null,
          open_lobby_mode_id:    isOpen ? (modeId || null) : null,
          open_lobby_mode_name:  isOpen ? modeName          : null,
          open_lobby_stage_2:    isOpen ? (stage2  || null) : null,
          open_lobby_mode_id_2:  isOpen ? (modeId2 || null) : null,
          open_lobby_mode_name_2: isOpen ? modeName2        : null,
          open_lobby_room_code: roomCode || null,
          lobby_pool: lobbyPool.trim() || null,
        },
        { withCredentials: true },
      );
      setMsg({ text: data.ok ? "Saved!" : (data.error ?? "Failed"), ok: !!data.ok });
    } catch {
      setMsg({ text: "Failed to save.", ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const MODES_LABELS: { id: RibbonMode; label: string; hint: string }[] = [
    { id: "idle",       label: "Idle",         hint: "Forces idle slides regardless of match state." },
    { id: "active",     label: "Active Match",  hint: "Shows the pinned tournament match if one exists." },
    { id: "open_lobby", label: "Lobby",         hint: "Shows lobby info on both overlays — choose match type below." },
  ];

  return (
    <div className="mt-4 border-t border-slate-700/40 pt-4">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <Monitor className="w-4 h-4" />
        <span className="font-medium">Overlay Settings</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          {msg && (
            <div className={`text-xs px-3 py-2 rounded border ${msg.ok ? "bg-green-900/40 text-green-300 border-green-700/40" : "bg-red-900/40 text-red-300 border-red-700/40"}`}>
              {msg.text}
            </div>
          )}

          {/* Ribbon mode picker */}
          <div>
            <p className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Overlay Mode</p>
            <div className="flex gap-2 flex-wrap">
              {MODES_LABELS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setRibbonMode(id)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                    ribbonMode === id
                      ? "bg-purple-600 border-purple-500 text-white"
                      : "bg-slate-700/60 border-slate-600/50 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5">
              {MODES_LABELS.find((m) => m.id === ribbonMode)?.hint}
            </p>
          </div>

          {/* Lobby sub-settings */}
          {ribbonMode === "open_lobby" && (
            <div className="flex flex-col gap-3 pl-3 border-l border-slate-700/50">

              {/* Match type toggle */}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Match Type</p>
                <div className="flex gap-2">
                  {(["open_battle", "private_battle"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMatchType(t)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        matchType === t
                          ? t === "open_battle"
                            ? "bg-green-700/70 border-green-500/60 text-white"
                            : "bg-purple-700/70 border-purple-500/60 text-white"
                          : "bg-slate-700/60 border-slate-600/50 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {t === "open_battle" ? "Anarchy Open" : "Private Battle"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-600 mt-1.5">
                  {matchType === "open_battle"
                    ? "Viewers search the pool in Anarchy Open. Set the maps below to show them on the ribbon."
                    : "Viewers enter the pool and room code in-game. Host picks the maps."}
                </p>
              </div>

              {/* Open Battle: two map + mode slots */}
              {matchType === "open_battle" && (
                <div className="flex flex-col gap-2">
                  {/* Slot 1 */}
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Map 1</p>
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
                        <label className="text-[11px] text-slate-500 uppercase tracking-wide">Mode</label>
                        <select
                          value={modeId}
                          onChange={(e) => setModeId(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">— not set —</option>
                          {MODES.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                        <label className="text-[11px] text-slate-500 uppercase tracking-wide">Stage</label>
                        <select
                          value={stage}
                          onChange={(e) => setStage(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">— not set —</option>
                          {STAGES.map((s) => (
                            <option key={s.name} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* Slot 2 */}
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Map 2</p>
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
                        <label className="text-[11px] text-slate-500 uppercase tracking-wide">Mode</label>
                        <select
                          value={modeId2}
                          onChange={(e) => setModeId2(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">— not set —</option>
                          {MODES.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                        <label className="text-[11px] text-slate-500 uppercase tracking-wide">Stage</label>
                        <select
                          value={stage2}
                          onChange={(e) => setStage2(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">— not set —</option>
                          {STAGES.map((s) => (
                            <option key={s.name} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pool tag + room code — always shown for lobby */}
              <div className="flex gap-3 flex-wrap">
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[11px] text-slate-500 uppercase tracking-wide">Pool</label>
                  <input
                    value={lobbyPool}
                    onChange={(e) => setLobbyPool(e.target.value.slice(0, 16))}
                    placeholder="e.g. sneakyn"
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-purple-500 w-40"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[11px] text-slate-500 uppercase tracking-wide">Room Code</label>
                  <input
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.slice(0, 8))}
                    placeholder="e.g. 1234"
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-purple-500 w-40"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-600">
                Both show on the ribbon. Pool also powers the <code className="text-slate-500">!pool</code> Twitch command, room code powers <code className="text-slate-500">!code</code>.
              </p>
            </div>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="self-start px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminTwitchIcon() {
  return (
    <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

function AdminDiscordIcon() {
  return (
    <svg className="w-3 h-3 fill-current text-indigo-400 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.034.055a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
