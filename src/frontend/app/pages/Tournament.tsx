import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import confetti from "canvas-confetti";
import { Helmet } from "react-helmet";
import axios from "axios";
import { Trophy, Users, Clock, Swords, CheckCircle, AlertCircle, LogIn, Crown, ChevronLeft, ChevronRight, Maximize2, List, X, History, MapPin } from "lucide-react";
import PageWrapper from "../components/PageWrapper";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { MODES, STAGES } from "../components/tournament/splatoonData";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const ADMIN_DISCORD_IDS = ["339866237922181121"];
const POLL_MS = 30_000;

function getWsUrl(): string {
  const base = (API_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + "/api/tournament/ws";
}

interface PublicSignup {
  display_name: string;
  discord_id: string | null;
  twitch_username: string | null;
}

interface WsEvent {
  event: string;
  tournament_id?: number;
  match_id?: number;
  winner_team_id?: number;
  winner_name?: string;
  display_name?: string;
  discord_id?: string | null;
  twitch_username?: string | null;
  count?: number;
  signups?: PublicSignup[];
  team1_games?: number;
  team2_games?: number;
  game_number?: number;
  stage_name?: string;
}

interface MyMatch {
  id: number;
  round: number;
  status: "pending" | "awaiting_confirmation";
  team1_id: number | null;
  team2_id: number | null;
  team1_name: string | null;
  team2_name: string | null;
  player_team_id: number;
  opposing_team_id: number | null;
  reported_winner_id: number | null;
  is_home_team: boolean;
  is_captain: boolean;
  room_code: string | null;
  schedule?: { mode_id: string | null; mode_name: string | null; best_of: number } | null;
  games?: { game_number: number; stage_name: string | null; mode_id?: string | null; mode_name?: string | null }[];
  game_results?: { game_number: number; winner_team_id: number }[];
  team1_games?: number;
  team2_games?: number;
  current_game_number?: number;
  pending_game?: { game_number: number; reported_winner_id: number } | null;
  needs_counterpick?: boolean;
  opponent_needs_counterpick?: boolean;
  counterpick_game_number?: number | null;
  allowed_stages?: string[];
}

const CARD_H  = 84; // estimated match-card height (px) used for gap maths
const R1_GAP  = 4;  // gap between cards in the outermost round (px)

// ---- Types ----------------------------------------------------------------

interface Team {
  id: number;
  name: string;
  seed: number;
  members: string[];
  captain?: string | null;
}

interface Match {
  id: number;
  match_number: number;
  team1: Team | null;
  team2: Team | null;
  winner_id: number | null;
  status: "pending" | "awaiting_confirmation" | "complete";
  is_bye: boolean;
  feeder1_match_id?: number | null;
  feeder2_match_id?: number | null;
  team1_games?: number;
  team2_games?: number;
}

interface RoundSchedule {
  stage_name: string | null;
  mode_id: string | null;
  mode_name: string | null;
  best_of?: number | null;
}

interface Round {
  round: number;
  matches: Match[];
  schedule?: RoundSchedule | null;
}

interface Tournament {
  id: number;
  name: string;
  status: "signup" | "active" | "complete" | "cancelled";
  team_size?: number;
  special_rules?: string | null;
  affects_rating?: boolean;
  created_at: string;
}

interface BracketData {
  tournament: Tournament;
  rounds: Round[];
}

interface TournamentSummary {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

type RegisterMatchFn = (roundNum: number, matchNum: number, el: HTMLDivElement | null) => void;

// ---- Status badge ---------------------------------------------------------

function StatusBadge({ status }: { status: Tournament["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    signup:    { label: "Sign-ups open", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
    active:    { label: "In progress",   cls: "bg-green-500/20 text-green-300 border-green-500/40" },
    complete:  { label: "Completed",     cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
    cancelled: { label: "Cancelled",     cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-500/20 text-slate-300" };
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

// ---- Match status icon ----------------------------------------------------

function MatchStatusIcon({ status }: { status: Match["status"] }) {
  if (status === "complete")              return <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />;
  if (status === "awaiting_confirmation") return <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
}

// ---- Team slot inside a match card ----------------------------------------

function TeamSlot({
  team, isWinner, isBye, isRecentWinner = false, isRecentLoser = false, isPlayerTeam = false, onTeamClick,
}: {
  team: Team | null;
  isWinner: boolean;
  isBye?: boolean;
  isRecentWinner?: boolean;
  isRecentLoser?: boolean;
  isPlayerTeam?: boolean;
  onTeamClick?: (team: Team) => void;
}) {
  if (isBye || !team) {
    return <div className="px-3 py-2 rounded text-slate-600 italic text-xs bg-slate-900/30">BYE</div>;
  }
  return (
    <div
      className={`px-3 py-2 rounded transition-all duration-500 ${onTeamClick ? "cursor-pointer hover:brightness-110" : ""} ${
        isRecentWinner
          ? "bg-green-500/25 border border-green-400/60 text-green-100 scale-[1.02] shadow-green-500/20 shadow"
          : isRecentLoser
          ? "bg-red-500/15 border border-red-500/30 text-red-300 opacity-60"
          : isWinner
          ? "bg-green-500/15 border border-green-500/40 text-green-200"
          : isPlayerTeam
          ? "bg-blue-500/20 border border-blue-400/50 text-blue-100 shadow shadow-blue-500/20"
          : "bg-slate-900/40 border border-slate-700/40 text-slate-300"
      }`}
      onClick={onTeamClick ? () => onTeamClick(team) : undefined}
    >
      <div className="flex items-center gap-1.5">
        {isWinner && <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />}
        {isRecentWinner && <span className="text-xs">🏆</span>}
        <span className="font-semibold text-sm truncate leading-tight">{team.name}</span>
      </div>
      <div className="text-xs text-slate-500 mt-0.5 truncate">{(team.members ?? []).join(", ")}</div>
    </div>
  );
}

// ---- Match card -----------------------------------------------------------

function MatchCard({
  match,
  isFinal,
  roundNum,
  registerMatch,
  flashMatchId,
  recentWinnerTeamId,
  playerTeamId,
  onTeamClick,
  wide = false,
  bestOf = 1,
}: {
  match: Match;
  isFinal: boolean;
  roundNum: number;
  registerMatch: RegisterMatchFn;
  flashMatchId: number | null;
  recentWinnerTeamId: number | null;
  playerTeamId: number | null;
  onTeamClick?: (team: Team) => void;
  wide?: boolean;
  bestOf?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isFlashing = flashMatchId === match.id;

  useLayoutEffect(() => {
    if (ref.current) registerMatch(roundNum, match.match_number, ref.current);
    return () => registerMatch(roundNum, match.match_number, null);
  }, [roundNum, match.match_number, registerMatch]);

  const isBye      = match.is_bye;
  const awaitingT1 = !match.team1 && !isBye;
  const awaitingT2 = !match.team2 && !isBye;
  const hasPlayerTeam = playerTeamId != null && (match.team1?.id === playerTeamId || match.team2?.id === playerTeamId);

  return (
    <div
      ref={ref}
      style={{ minHeight: CARD_H }}
      className={`rounded-lg border p-1.5 flex flex-col gap-1 shadow-lg transition-all duration-500 ${wide ? "w-full" : "w-52"} ${
        isFlashing
          ? "border-green-400/80 shadow-green-500/30 shadow-md scale-[1.03]"
          : isFinal && hasPlayerTeam
          ? "border-blue-400/70 bg-yellow-900/10 shadow-blue-500/20 shadow-md"
          : isFinal
          ? "border-yellow-500/50 bg-yellow-900/10 shadow-yellow-900/10"
          : hasPlayerTeam
          ? "border-blue-500/60 bg-slate-800/70 shadow-blue-500/15 shadow-md"
          : "border-slate-600/50 bg-slate-800/70"
      }`}
    >
      <div className="flex items-center justify-between px-0.5 mb-0.5">
        {isFinal
          ? <span className="text-xs font-bold text-yellow-400/80 tracking-widest uppercase">Final</span>
          : <span />
        }
        <span className="text-[10px] text-slate-600 font-mono">#{match.id}</span>
      </div>

      {awaitingT1 ? (
        <div className="px-3 py-2 rounded bg-slate-900/30 text-slate-600 italic text-xs">
          {match.feeder1_match_id ? `Match #${match.feeder1_match_id} winner` : "TBD"}
        </div>
      ) : (
        <TeamSlot
          team={match.team1}
          isWinner={match.winner_id === match.team1?.id}
          isRecentWinner={recentWinnerTeamId === match.team1?.id && match.status === "complete"}
          isRecentLoser={isFlashing && match.winner_id !== null && match.winner_id !== match.team1?.id}
          isPlayerTeam={playerTeamId === match.team1?.id}
          onTeamClick={onTeamClick}
        />
      )}

      <div className="flex items-center gap-1 px-1">
        <div className="flex-1 border-t border-slate-700/30" />
        <div className="flex items-center gap-1 text-slate-600">
          {bestOf > 1 && match.team1 && match.team2 && match.status !== "complete" ? (
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {match.team1_games ?? 0}–{match.team2_games ?? 0}
            </span>
          ) : (
            <Swords className="w-3 h-3" />
          )}
          <MatchStatusIcon status={match.status} />
        </div>
        <div className="flex-1 border-t border-slate-700/30" />
      </div>

      {isBye ? (
        <TeamSlot team={null} isWinner={false} isBye />
      ) : awaitingT2 ? (
        <div className="px-3 py-2 rounded bg-slate-900/30 text-slate-600 italic text-xs">
          {match.feeder2_match_id ? `Match #${match.feeder2_match_id} winner` : "TBD"}
        </div>
      ) : (
        <TeamSlot
          team={match.team2}
          isWinner={match.winner_id === match.team2?.id}
          isRecentWinner={recentWinnerTeamId === match.team2?.id && match.status === "complete"}
          isRecentLoser={isFlashing && match.winner_id !== null && match.winner_id !== match.team2?.id}
          isPlayerTeam={playerTeamId === match.team2?.id}
          onTeamClick={onTeamClick}
        />
      )}
    </div>
  );
}

// ---- Round column ---------------------------------------------------------

function RoundColumn({
  round,
  matches,
  totalRounds,
  schedule,
  registerMatch,
  n1half,
  flashMatchId,
  recentWinnerTeamId,
  playerTeamId,
  onTeamClick,
}: {
  round: number;
  matches: Match[];
  totalRounds: number;
  schedule?: RoundSchedule | null;
  registerMatch: RegisterMatchFn;
  n1half: number;
  flashMatchId: number | null;
  recentWinnerTeamId: number | null;
  playerTeamId: number | null;
  onTeamClick?: (team: Team) => void;
}) {
  const isFinalRound = round === totalRounds;
  const modeData  = schedule?.mode_id    ? MODES.find((m) => m.id === schedule.mode_id)       : null;
  const stageData = schedule?.stage_name ? STAGES.find((s) => s.name === schedule.stage_name) : null;

  // Gap formula: ensure all columns in a half share the same total height
  const totalH  = n1half * CARD_H + Math.max(0, n1half - 1) * R1_GAP;
  const nrHalf  = matches.length;
  const gapPx   = nrHalf > 1 ? Math.max(R1_GAP, Math.round((totalH - nrHalf * CARD_H) / (nrHalf - 1))) : 0;

  const roundLabel =
    isFinalRound
      ? "Final"
      : round === totalRounds - 1 && totalRounds > 2
      ? "Semis"
      : `Round ${round}`;

  return (
    <div className="flex flex-col items-center min-w-[220px]">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
        {roundLabel}
      </div>

      {(stageData || modeData) && (
        <div className="flex flex-col items-center gap-1 mb-3 w-full">
          {stageData && (
            <img
              src={stageData.image}
              alt={stageData.name}
              className="w-full max-w-[200px] h-[52px] object-cover rounded-lg border border-slate-700/40"
            />
          )}
          {(schedule?.stage_name || modeData) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              {modeData && (
                <div className="relative group">
                  <img src={modeData.icon} alt={modeData.name} className="w-4 h-4 object-contain" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {modeData.name}
                  </div>
                </div>
              )}
              {schedule?.stage_name && <span className="truncate max-w-[160px]">{schedule.stage_name}</span>}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col w-full" style={{ gap: `${gapPx}px` }}>
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            isFinal={isFinalRound}
            roundNum={round}
            registerMatch={registerMatch}
            flashMatchId={flashMatchId}
            recentWinnerTeamId={recentWinnerTeamId}
            playerTeamId={playerTeamId}
            onTeamClick={onTeamClick}
            bestOf={schedule?.best_of ?? 1}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Bracket with SVG connector lines ------------------------------------

function BracketView({ rounds, totalRounds, flashMatchId, recentWinnerTeamId, playerTeamId, onTeamClick }: { rounds: Round[]; totalRounds: number; flashMatchId: number | null; recentWinnerTeamId: number | null; playerTeamId: number | null; onTeamClick?: (team: Team) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const matchEls     = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerMatch: RegisterMatchFn = useCallback((roundNum, matchNum, el) => {
    const key = `${roundNum}-${matchNum}`;
    if (el) matchEls.current.set(key, el);
    else    matchEls.current.delete(key);
  }, []);

  const drawLines = useCallback(() => {
    const svg       = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const cRect = container.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${cRect.width} ${cRect.height}`);
    svg.setAttribute("width",  String(cRect.width));
    svg.setAttribute("height", String(cRect.height));
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const addPath = (d: string, gold = false) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", gold ? "#d97706" : "#475569");
      p.setAttribute("stroke-width", gold ? "2" : "1.5");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
    };

    for (let r = 0; r < rounds.length - 1; r++) {
      const cur  = rounds[r];
      const next = rounds[r + 1];
      const gold = r === rounds.length - 2;

      for (let i = 0; i < next.matches.length; i++) {
        const mA = cur.matches[i * 2];
        const mB = cur.matches[i * 2 + 1];
        const mC = next.matches[i];
        if (!mA || !mC) continue;

        const elA = matchEls.current.get(`${cur.round}-${mA.match_number}`);
        const elC = matchEls.current.get(`${next.round}-${mC.match_number}`);
        if (!elA || !elC) continue;

        const rA = elA.getBoundingClientRect();
        const rC = elC.getBoundingClientRect();

        const xAl = rA.left  - cRect.left;
        const xAr = rA.right - cRect.left;
        const xCl = rC.left  - cRect.left;
        const xCr = rC.right - cRect.left;
        const xAcx = (xAl + xAr) / 2;
        const xCcx = (xCl + xCr) / 2;
        const yA   = rA.top + rA.height / 2 - cRect.top;
        const yC   = rC.top + rC.height / 2 - cRect.top;

        const elB = mB ? matchEls.current.get(`${cur.round}-${mB.match_number}`) : null;

        if (elB) {
          const rB  = elB.getBoundingClientRect();
          const xBl = rB.left  - cRect.left;
          const xBr = rB.right - cRect.left;
          const xBcx = (xBl + xBr) / 2;
          const yB   = rB.top + rB.height / 2 - cRect.top;

          const aLeft = xAcx < xCcx;
          const bLeft = xBcx < xCcx;

          if (aLeft && !bLeft) {
            // A on left, B on right → separate arms into opposite edges of Final
            const mL = xAr + (xCl - xAr) / 2;
            const mR = xCr + (xBl - xCr) / 2;
            addPath(`M ${xAr} ${yA} H ${mL} V ${yC} H ${xCl}`, gold);
            addPath(`M ${xBl} ${yB} H ${mR} V ${yC} H ${xCr}`, gold);
          } else if (!aLeft && !bLeft) {
            // Both right of C → reversed U-bracket
            const xMid = xCr + (xAl - xCr) / 2;
            addPath(`M ${xAl} ${yA} H ${xMid} V ${yB} H ${xBl}`, gold);
            addPath(`M ${xMid} ${yC} H ${xCr}`, gold);
          } else {
            // Both left of C → normal U-bracket
            const xMid = xAr + (xCl - xAr) / 2;
            addPath(`M ${xAr} ${yA} H ${xMid} V ${yB} H ${xBr}`, gold);
            addPath(`M ${xMid} ${yC} H ${xCl}`, gold);
          }
        } else {
          // Single feeder (bye edge-case)
          if (xAcx < xCcx) {
            const xMid = xAr + (xCl - xAr) / 2;
            addPath(`M ${xAr} ${yA} H ${xMid} V ${yC} H ${xCl}`, gold);
          } else {
            const xMid = xCr + (xAl - xCr) / 2;
            addPath(`M ${xAl} ${yA} H ${xMid} V ${yC} H ${xCr}`, gold);
          }
        }
      }
    }
  }, [rounds]);

  // Children's useLayoutEffect (match registration) runs before parent's, so refs are ready
  useLayoutEffect(() => { drawLines(); }, [drawLines]);

  useEffect(() => {
    const obs = new ResizeObserver(drawLines);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [drawLines]);

  const n1     = rounds[0]?.matches.length ?? 0;
  const n1half = Math.ceil(n1 / 2);

  // Split each round into left half and right half
  const leftRounds  = rounds.slice(0, totalRounds - 1);
  const finalRound  = rounds[totalRounds - 1];
  const rightRounds = [...rounds.slice(0, totalRounds - 1)].reverse();

  return (
    <div ref={containerRef} className="relative">
      <svg
        ref={svgRef}
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: "visible" }}
        aria-hidden="true"
      />
      {/* items-center vertically aligns shorter inner columns with the taller outer columns */}
      <div className="flex gap-10 items-center min-w-max py-6 px-4">
        {/* Left half: rounds fanning out left, first half of matches */}
        {leftRounds.map((r) => {
          const half = Math.ceil(r.matches.length / 2);
          return (
            <RoundColumn
              key={`L${r.round}`}
              round={r.round}
              matches={r.matches.slice(0, half)}
              totalRounds={totalRounds}
              schedule={r.schedule}
              registerMatch={registerMatch}
              n1half={n1half}
              flashMatchId={flashMatchId}
              recentWinnerTeamId={recentWinnerTeamId}
              playerTeamId={playerTeamId}
              onTeamClick={onTeamClick}
            />
          );
        })}

        {/* Final */}
        {finalRound && (
          <RoundColumn
            key="final"
            round={finalRound.round}
            matches={finalRound.matches}
            totalRounds={totalRounds}
            schedule={finalRound.schedule}
            registerMatch={registerMatch}
            n1half={1}
            flashMatchId={flashMatchId}
            recentWinnerTeamId={recentWinnerTeamId}
            playerTeamId={playerTeamId}
          />
        )}

        {/* Right half: rounds fanning out right (reversed), second half of matches */}
        {rightRounds.map((r) => {
          const half = Math.ceil(r.matches.length / 2);
          return (
            <RoundColumn
              key={`R${r.round}`}
              round={r.round}
              matches={r.matches.slice(half)}
              totalRounds={totalRounds}
              schedule={r.schedule}
              registerMatch={registerMatch}
              n1half={n1half}
              flashMatchId={flashMatchId}
              recentWinnerTeamId={recentWinnerTeamId}
              playerTeamId={playerTeamId}
              onTeamClick={onTeamClick}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---- Mobile round-by-round bracket view -----------------------------------

const noopRegister: RegisterMatchFn = () => {};

function MobileBracketView({ rounds, totalRounds, flashMatchId, recentWinnerTeamId, playerTeamId, onTeamClick }: {
  rounds: Round[];
  totalRounds: number;
  flashMatchId: number | null;
  recentWinnerTeamId: number | null;
  playerTeamId: number | null;
  onTeamClick?: (team: Team) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const round = rounds[activeIdx];
  if (!round) return null;

  const isFinalRound = round.round === totalRounds;
  const roundLabel =
    isFinalRound
      ? "Final"
      : round.round === totalRounds - 1 && totalRounds > 2
      ? "Semis"
      : `Round ${round.round}`;

  const modeData  = round.schedule?.mode_id    ? MODES.find((m) => m.id === round.schedule!.mode_id)          : null;
  const stageData = round.schedule?.stage_name ? STAGES.find((s) => s.name === round.schedule!.stage_name) : null;

  const visibleMatches = round.matches.filter((m) => !m.is_bye);

  return (
    <div>
      {/* Round navigation */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
          disabled={activeIdx === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-30 text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>

        <div className="text-center">
          <div className="font-bold text-slate-200 text-sm">{roundLabel}</div>
          <div className="text-xs text-slate-500">{activeIdx + 1} / {rounds.length}</div>
        </div>

        <button
          onClick={() => setActiveIdx((i) => Math.min(rounds.length - 1, i + 1))}
          disabled={activeIdx === rounds.length - 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-30 text-sm"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Round schedule */}
      {(stageData || modeData) && (
        <div className="flex items-center gap-2 mb-4 px-1">
          {stageData && (
            <img src={stageData.image} alt={stageData.name} className="h-10 w-20 object-cover rounded border border-slate-700/40" />
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {modeData && <img src={modeData.icon} alt={modeData.name} className="w-4 h-4 object-contain" />}
            {round.schedule?.stage_name && <span>{round.schedule.stage_name}</span>}
            {modeData && <span>· {modeData.name}</span>}
          </div>
        </div>
      )}

      {/* Matches */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleMatches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            isFinal={isFinalRound}
            roundNum={round.round}
            registerMatch={noopRegister}
            flashMatchId={flashMatchId}
            recentWinnerTeamId={recentWinnerTeamId}
            playerTeamId={playerTeamId}
            onTeamClick={onTeamClick}
            wide
            bestOf={round.schedule?.best_of ?? 1}
          />
        ))}
        {visibleMatches.length === 0 && (
          <p className="text-slate-500 text-sm italic col-span-2 text-center py-4">No matches scheduled yet.</p>
        )}
      </div>

      {/* Round dots */}
      <div className="flex justify-center gap-1.5 mt-5">
        {rounds.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIdx(i)}
            className={`rounded-full transition-all ${i === activeIdx ? "bg-purple-400 w-4 h-2" : "bg-slate-600 w-2 h-2 hover:bg-slate-500"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Team detail modal ----------------------------------------------------

function TeamModal({ team, rounds, onClose }: { team: Team; rounds: Round[]; onClose: () => void }) {
  const matchHistory = rounds.flatMap((r) =>
    r.matches
      .filter((m) => m.team1?.id === team.id || m.team2?.id === team.id)
      .map((m) => ({ round: r.round, match: m }))
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">{team.name}</h2>
            <p className="text-xs text-slate-500">Seed #{team.seed}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">
          {/* Players */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Players</h3>
            <div className="flex flex-col gap-1.5">
              {(team.captain
                ? [team.captain, ...(team.members ?? []).filter((m) => m !== team.captain)]
                : (team.members ?? [])
              ).map((m) => {
                const isCaptain = m === team.captain;
                return (
                  <div key={m} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
                    {isCaptain
                      ? <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      : <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                    <span className={`text-sm ${isCaptain ? "text-yellow-300 font-semibold" : "text-slate-200"}`}>{m}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Match history */}
          {matchHistory.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Match History</h3>
              <div className="flex flex-col gap-2">
                {matchHistory.map(({ round, match }) => {
                  const opponent = match.team1?.id === team.id ? match.team2 : match.team1;
                  const won = match.winner_id === team.id;
                  const lost = match.winner_id !== null && match.winner_id !== team.id;
                  const isFinal = round === Math.max(...rounds.map((r) => r.round));
                  const roundLabel = isFinal ? "Final" : round === Math.max(...rounds.map((r) => r.round)) - 1 && rounds.length > 2 ? "Semis" : `Round ${round}`;
                  return (
                    <div
                      key={match.id}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${
                        won  ? "bg-green-900/20 border-green-700/40 text-green-200"
                        : lost ? "bg-red-900/20 border-red-700/40 text-red-300"
                        : "bg-slate-800/40 border-slate-700/40 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {won  && <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                        {lost && <X className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        {!won && !lost && <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                        <span className="font-medium">{opponent?.name ?? "BYE"}</span>
                      </div>
                      <span className="text-xs text-slate-500">{roundLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Winner banner --------------------------------------------------------

function WinnerBanner({ team }: { team: Team }) {
  return (
    <div className="mb-8 rounded-2xl border border-yellow-500/40 bg-gradient-to-br from-yellow-950/70 via-amber-900/30 to-slate-900/50 backdrop-blur-sm p-10 text-center shadow-2xl shadow-yellow-900/30">
      <Crown className="w-16 h-16 text-yellow-400 mx-auto mb-4 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]" />
      <p className="text-xs font-bold text-yellow-500/80 uppercase tracking-[0.3em] mb-3">
        Tournament Champion
      </p>
      <p className="text-4xl font-black text-white mb-2">{team.name}</p>
      <p className="text-sm text-slate-400">{(team.members ?? []).join(" · ")}</p>
    </div>
  );
}

// ---- Sign-up list ---------------------------------------------------------

function SignupList({ signups, newSignupKeys, exitingSignupKeys }: {
  signups: PublicSignup[];
  newSignupKeys?: Set<string>;
  exitingSignupKeys?: Set<string>;
}) {
  const visibleCount = signups.filter((s) => {
    const key = s.discord_id ?? s.twitch_username ?? s.display_name;
    return !(exitingSignupKeys?.has(key) ?? false);
  }).length;

  return (
    <div className="py-8 px-6 rounded-2xl mb-8" style={{
      background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)",
      backdropFilter: "blur(32px) saturate(180%)",
      WebkitBackdropFilter: "blur(32px) saturate(180%)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "inset 0 1.5px 0 rgba(255,255,255,0.18), 0 8px 32px rgba(0,0,0,0.35)",
    }}>
      <div className="text-center mb-6">
        <Users className="w-12 h-12 mx-auto mb-3 text-slate-500" />
        <p className="text-lg font-semibold text-slate-300">
          Sign-ups are open!{" "}
          {visibleCount > 0 && (
            <span className="text-blue-400">({visibleCount} signed up)</span>
          )}
        </p>
        <p className="text-sm mt-1 text-slate-400">
          Join on Discord with{" "}
          <code className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300">/tournament signup</code>
          {" "}or Twitch with{" "}
          <code className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300">!signup</code>
        </p>
      </div>
      {signups.length > 0 && (
        <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
          {signups.map((s, i) => {
            const key = s.discord_id ?? s.twitch_username ?? i.toString();
            const isNew = newSignupKeys?.has(key) ?? false;
            const isExiting = exitingSignupKeys?.has(key) ?? false;
            return (
              <div
                key={key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-slate-300 ${
                  isExiting
                    ? "bg-slate-800/60 border-red-700/30 animate-signup-exit"
                    : isNew
                    ? "bg-green-950/40 border-green-600/50 animate-signup-enter"
                    : "bg-slate-800/60 border-slate-700/40 animate-fade-in"
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isExiting ? "bg-red-500" : isNew ? "bg-green-400" : "bg-green-500"}`} />
                <span className="truncate">{s.display_name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Confirm dialog -------------------------------------------------------

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="rounded-xl border border-slate-700 bg-slate-900 shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className={`flex-1 py-2 rounded-lg text-white text-sm font-semibold transition-colors ${danger ? "bg-red-600 hover:bg-red-500" : "bg-purple-600 hover:bg-purple-500"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Counterpick stage picker ---------------------------------------------

function CounterpickPicker({ gameNumber, isHomePick, modeName, onPick, loading, allowedStages }: {
  gameNumber: number;
  isHomePick: boolean;
  modeName?: string | null;
  onPick: (stage: string) => void;
  loading: boolean;
  allowedStages?: string[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const stageList = allowedStages && allowedStages.length > 0
    ? STAGES.filter((s) => allowedStages.includes(s.name))
    : STAGES;

  const modeLabel = modeName ? ` (${modeName})` : "";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-semibold text-purple-300">
          {isHomePick ? `Pick the map for Game ${gameNumber}${modeLabel}` : `Your counterpick for Game ${gameNumber}${modeLabel}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-3 max-h-60 overflow-y-auto pr-0.5">
        {stageList.map((stage) => (
          <button
            key={stage.name}
            onClick={() => setSelected(stage.name)}
            className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
              selected === stage.name
                ? "border-purple-500 ring-2 ring-purple-500/40"
                : "border-slate-700/50 hover:border-slate-500"
            }`}
          >
            <img src={stage.image} alt={stage.name} className="w-full h-14 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <span className="absolute bottom-1 left-2 right-2 text-[10px] font-semibold text-white leading-tight truncate">
              {stage.name}
            </span>
            {selected === stage.name && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                <CheckCircle className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={() => selected && setConfirm(true)}
        disabled={!selected || loading}
        className="w-full py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
      >
        {selected ? `Lock in ${selected}` : "Select a map first"}
      </button>

      {confirm && selected && (
        <ConfirmDialog
          title={isHomePick ? "Lock in your pick?" : "Lock in counterpick?"}
          message={`${selected} will be the map for Game ${gameNumber}. This cannot be changed once confirmed.`}
          confirmLabel="Lock it in"
          onConfirm={() => { setConfirm(false); onPick(selected); }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

// ---- Match report card (for logged-in players) ----------------------------

function MatchReportCard({
  match,
  opponentMatchId,
  loading,
  message,
  isAdmin,
  onReportGame,
  onConfirmGame,
  onDisputeGame,
  onCounterpick,
}: {
  match: MyMatch;
  opponentMatchId?: number | null;
  loading: boolean;
  message: string | null;
  isAdmin?: boolean;
  onReportGame: (gameNumber: number, result: "win" | "loss") => void;
  onConfirmGame: (gameNumber: number) => void;
  onDisputeGame: (gameNumber: number) => void;
  onCounterpick: (gameNumber: number, stage: string) => void;
}) {
  const [reportDialog, setReportDialog] = useState<{ gameNumber: number; result: "win" | "loss" } | null>(null);

  const modeData = match.schedule?.mode_id ? MODES.find((m) => m.id === match.schedule!.mode_id) : null;
  const bestOf = match.schedule?.best_of ?? 1;
  const myTeamName    = match.player_team_id === match.team1_id ? match.team1_name : match.team2_name;
  const theirTeamName = match.player_team_id === match.team1_id ? match.team2_name : match.team1_name;
  const hasOpponent   = !!match.opposing_team_id;

  const gameResults  = match.game_results ?? [];
  const t1Wins = match.team1_games ?? 0;
  const t2Wins = match.team2_games ?? 0;
  const myWins   = match.player_team_id === match.team1_id ? t1Wins : t2Wins;
  const theirWins = match.player_team_id === match.team1_id ? t2Wins : t1Wins;

  const pendingGame = match.pending_game ?? null;
  const pendingWinnerIsMe   = pendingGame?.reported_winner_id === match.player_team_id;
  const pendingWinnerIsThem = pendingGame != null && pendingGame.reported_winner_id !== match.player_team_id;

  const currentGame = match.current_game_number ?? 1;

  const hasPerGameModes = (match.games ?? []).some((g) => g.mode_id);

  const gameSlots = Array.from({ length: bestOf }, (_, i) => {
    const gameNum = i + 1;
    const gameData = match.games?.find((g) => g.game_number === gameNum);
    const stageName = gameData?.stage_name ?? null;
    const modeName = gameData?.mode_name ?? null;
    const modeId = gameData?.mode_id ?? null;
    const result = gameResults.find((r) => r.game_number === gameNum);
    const didMyTeamWin = result ? result.winner_team_id === match.player_team_id : null;
    return { gameNum, stageName, modeName, modeId, didMyTeamWin };
  });

  return (
    <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-950/20 backdrop-blur-sm p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-blue-300">Your Match</span>
        {hasOpponent && (
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ml-1 ${
            match.is_home_team
              ? "bg-amber-900/30 text-amber-300 border-amber-600/40"
              : "bg-slate-800/60 text-slate-400 border-slate-600/40"
          }`}>
            {match.is_home_team ? "Home" : "Away"}
          </span>
        )}
        <span className="text-xs text-slate-500 ml-auto">Round {match.round}</span>
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-white font-semibold text-sm">{myTeamName ?? "Your Team"}</span>
        {hasOpponent && bestOf > 1 && (
          <span className="text-xl font-black text-white tabular-nums mx-3">{myWins} – {theirWins}</span>
        )}
        {hasOpponent && bestOf === 1 && <span className="text-slate-500 mx-3 text-sm">vs</span>}
        {theirTeamName
          ? <span className="text-white font-semibold text-sm">{theirTeamName}</span>
          : <span className="text-slate-500 italic text-xs">{opponentMatchId ? `Match #${opponentMatchId} winner` : "Opponent TBD"}</span>
        }
      </div>

      {/* Game pips */}
      {bestOf > 1 && (
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {gameSlots.map(({ gameNum, didMyTeamWin }) => (
            <div key={gameNum} className={`w-3 h-3 rounded-full border transition-all ${
              didMyTeamWin === true
                ? "bg-green-400 border-green-400"
                : didMyTeamWin === false
                ? "bg-red-500/70 border-red-500/70"
                : gameNum === currentGame && pendingGame
                ? "bg-yellow-400/60 border-yellow-400/60 animate-pulse"
                : gameNum <= currentGame
                ? "bg-slate-600 border-slate-500"
                : "bg-slate-800 border-slate-700"
            }`} title={`Game ${gameNum}`} />
          ))}
        </div>
      )}

      {/* Mode + game map list */}
      {(modeData || bestOf > 0) && (
        <div className="mb-4 rounded-lg bg-slate-800/50 border border-slate-700/50 overflow-hidden">
          {(!hasPerGameModes && (modeData || bestOf > 1)) && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
              {modeData?.icon && <img src={modeData.icon} alt="" className="w-4 h-4 object-contain" />}
              {modeData && <span className="text-xs font-medium text-purple-300">{match.schedule!.mode_name}</span>}
              {bestOf > 1 && <span className="text-xs text-slate-500 ml-auto">Best of {bestOf}</span>}
            </div>
          )}
          {hasPerGameModes && bestOf > 1 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
              <span className="text-xs text-slate-500 ml-auto">Best of {bestOf}</span>
            </div>
          )}
          <div className="divide-y divide-slate-700/40">
            {gameSlots.map(({ gameNum, stageName, modeName, modeId, didMyTeamWin }) => {
              const label = gameNum === 1
                ? bestOf === 1 ? "Stage" : "G1 — Home pick"
                : `G${gameNum} — Counterpick`;
              const gameModeData = modeId ? MODES.find((m) => m.id === modeId) : null;
              return (
                <div key={gameNum} className={`flex items-center gap-2 px-3 py-1.5 ${gameNum === currentGame ? "bg-blue-950/30" : ""}`}>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide w-28 shrink-0">{label}</span>
                  {didMyTeamWin === true && <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />}
                  {didMyTeamWin === false && <X className="w-3 h-3 text-red-400 shrink-0" />}
                  {gameModeData && (
                    <span className="flex items-center gap-1 text-xs text-purple-300 shrink-0">
                      <img src={gameModeData.icon} alt="" className="w-3 h-3 object-contain" />
                      {modeName}
                    </span>
                  )}
                  {stageName
                    ? <span className="text-xs text-slate-200">{stageName}</span>
                    : <span className="text-xs text-slate-500 italic">TBD</span>
                  }
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pool name — constant lobby identifier for in-game private battle */}
      {hasOpponent && (
        <div className="mb-3 px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/40">
          <p className="text-xs text-slate-400 mb-0.5">Your match Pool</p>
          <p className="text-base font-mono font-bold tracking-widest text-white">sneakyn</p>
        </div>
      )}

      {/* Room code — shown to home team, away team, and admins */}
      {hasOpponent && match.room_code && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-900/20 border border-amber-600/30">
          <p className="text-xs text-amber-400/80 mb-1">
            {match.is_home_team
              ? "You are the home team. Create the private lobby."
              : "You are the away team. Join the private lobby."}
          </p>
          <p className="text-lg font-mono font-bold tracking-widest text-amber-300">{match.room_code}</p>
        </div>
      )}
      {hasOpponent && !match.room_code && (
        <p className="mb-4 text-xs text-slate-500">Room code not yet assigned — check back shortly.</p>
      )}
      {!hasOpponent && (
        <p className="mb-4 text-xs text-slate-500">Waiting for your opponent to be decided from the previous match.</p>
      )}

      {/* ---- Action area ---- */}

      {/* Counterpick picker — this player needs to pick */}
      {match.needs_counterpick && match.counterpick_game_number != null && hasOpponent && (
        <div className="mb-3 p-3 rounded-lg bg-purple-950/30 border border-purple-700/40">
          <CounterpickPicker
            gameNumber={match.counterpick_game_number}
            isHomePick={match.counterpick_game_number === 1}
            modeName={match.schedule?.mode_name}
            onPick={(stage) => onCounterpick(match.counterpick_game_number!, stage)}
            loading={loading}
            allowedStages={match.allowed_stages}
          />
        </div>
      )}

      {/* Opponent needs to counterpick */}
      {match.opponent_needs_counterpick && !match.needs_counterpick && hasOpponent && (
        <p className="text-sm text-purple-400/80 text-center py-2">
          Waiting for {theirTeamName ?? "opponents"} to pick a map for Game {match.counterpick_game_number}…
        </p>
      )}

      {/* Game result awaiting confirmation — I reported */}
      {pendingGame && pendingWinnerIsMe && (
        <p className="text-sm text-yellow-400/80 text-center py-1">
          Game {pendingGame.game_number} result reported — waiting for {theirTeamName ?? "opponents"} to confirm…
        </p>
      )}

      {/* Game result awaiting confirmation — opponent reported */}
      {pendingGame && pendingWinnerIsThem && (
        <div>
          <p className="text-sm text-slate-400 mb-3">
            {theirTeamName ?? "Opponents"} reported a win for Game {pendingGame.game_number}. Do you confirm?
          </p>
          <div className="flex gap-2">
            <button onClick={() => onConfirmGame(pendingGame.game_number)} disabled={loading}
              className="flex-1 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              Confirm
            </button>
            <button onClick={() => onDisputeGame(pendingGame.game_number)} disabled={loading}
              className="flex-1 py-2 rounded-lg bg-red-600/50 hover:bg-red-600/70 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              Dispute
            </button>
          </div>
        </div>
      )}

      {/* Report game win/loss buttons — captain only (or admin) */}
      {match.status !== "awaiting_confirmation"
        && !pendingGame
        && !match.needs_counterpick
        && !match.opponent_needs_counterpick
        && hasOpponent && (
        (match.is_captain || isAdmin) ? (
          <div className="flex gap-2">
            <button
              onClick={() => setReportDialog({ gameNumber: currentGame, result: "win" })}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              We Won Game {currentGame}
            </button>
            <button
              onClick={() => setReportDialog({ gameNumber: currentGame, result: "loss" })}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-red-600/50 hover:bg-red-600/70 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              We Lost
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-1">Only the team captain can report game results.</p>
        )
      )}

      {message && (
        <p className="text-xs text-slate-400 mt-3 text-center">{message}</p>
      )}

      {/* Report confirmation dialog */}
      {reportDialog && (
        <ConfirmDialog
          title={reportDialog.result === "win" ? "Report Game Win?" : "Report Game Loss?"}
          message={`You're reporting that ${reportDialog.result === "win" ? (myTeamName ?? "your team") : (theirTeamName ?? "the opponents")} won Game ${reportDialog.gameNumber}. The opposing team will need to confirm.`}
          confirmLabel="Report"
          danger={reportDialog.result === "loss"}
          onConfirm={() => {
            const d = reportDialog;
            setReportDialog(null);
            onReportGame(d.gameNumber, d.result);
          }}
          onCancel={() => setReportDialog(null)}
        />
      )}
    </div>
  );
}

// ---- Main page ------------------------------------------------------------

export default function Tournament() {
  const { loggedIn, userData, isLoading: authLoading } = useAuth();
  const isAdmin = loggedIn && userData && ADMIN_DISCORD_IDS.includes(userData.userId);

  const [data, setData]               = useState<BracketData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);


  const [publicSignups,       setPublicSignups]       = useState<PublicSignup[]>([]);
  const [newSignupKeys,       setNewSignupKeys]       = useState<Set<string>>(new Set());
  const [exitingSignupKeys,   setExitingSignupKeys]   = useState<Set<string>>(new Set());
  const [flashMatchId,        setFlashMatchId]        = useState<number | null>(null);
  const [recentWinnerTeamId,  setRecentWinnerTeamId]  = useState<number | null>(null);
  const [myMatch,             setMyMatch]             = useState<MyMatch | null>(null);
  const [playerTeamId,        setPlayerTeamId]        = useState<number | null>(null);
  const [bracketMode,         setBracketMode]         = useState<"full" | "rounds">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "rounds" : "full"
  );
  const [selectedTeam,        setSelectedTeam]        = useState<Team | null>(null);
  const [myMatchLoading,      setMyMatchLoading]      = useState(false);
  const [reportLoading,       setReportLoading]       = useState(false);
  const [reportMsg,           setReportMsg]           = useState<string | null>(null);
  const [history,             setHistory]             = useState<TournamentSummary[]>([]);
  const [historyOpen,         setHistoryOpen]         = useState(false);
  const [viewingId,           setViewingId]           = useState<number | null>(null);
  const reportMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdminRef    = useRef(isAdmin);
  const fetchDataRef  = useRef<(id?: number | null) => Promise<void>>(() => Promise.resolve());
  isAdminRef.current  = !!isAdmin;

  const fetchData = useCallback(async (tournamentId?: number | null) => {
    try {
      let params: Record<string, string | number>;
      if (tournamentId) {
        params = { id: tournamentId };
      } else {
        params = GUILD_ID ? { guild_id: GUILD_ID } : {};
      }
      const { data: res } = await axios.get<BracketData>(`${API_URL}/api/tournament`, { params });
      if (res?.tournament) {
        setData(res);
        setLastUpdated(new Date());
        setError(null);
      } else {
        setData(null);
      }
    } catch {
      setError("Could not load tournament data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!GUILD_ID) return;
    try {
      const { data: res } = await axios.get<{ tournaments: TournamentSummary[] }>(`${API_URL}/api/tournament/list`, {
        params: { guild_id: GUILD_ID },
      });
      setHistory(res.tournaments ?? []);
    } catch { /* non-critical */ }
  }, []);


  const fetchMyMatch = useCallback(async () => {
    if (!GUILD_ID || !loggedIn) return;
    setMyMatchLoading(true);
    try {
      const { data: res } = await axios.get(`${API_URL}/api/tournament/my-match`, {
        params: { guild_id: GUILD_ID },
        withCredentials: true,
      });
      const m = res.match ?? null;
      setMyMatch(m);
      const teamId = m?.player_team_id ?? res.player_team_id ?? null;
      if (teamId != null) setPlayerTeamId(teamId);
    } catch {
      setMyMatch(null);
    } finally {
      setMyMatchLoading(false);
    }
  }, [loggedIn]);

  const fetchMyMatchRef = useRef(fetchMyMatch);
  fetchDataRef.current      = fetchData;
  fetchMyMatchRef.current   = fetchMyMatch;

  // WebSocket for real-time updates
  useEffect(() => {
    if (!GUILD_ID) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    const connect = () => {
      if (dead) return;
      ws = new WebSocket(`${getWsUrl()}?guild_id=${GUILD_ID}`);

      ws.onmessage = (e: MessageEvent) => {
        try {
          const msg: WsEvent = JSON.parse(e.data as string);
          if (msg.event === "hello") {
            setPublicSignups(msg.signups ?? []);
          } else if (msg.event === "signup") {
            const newSignup = { display_name: msg.display_name!, discord_id: msg.discord_id ?? null, twitch_username: msg.twitch_username ?? null };
            const key = newSignup.discord_id ?? newSignup.twitch_username ?? newSignup.display_name;
            setPublicSignups((prev) => [...prev, newSignup]);
            setNewSignupKeys((prev) => new Set([...prev, key]));
            setTimeout(() => setNewSignupKeys((prev) => { const next = new Set(prev); next.delete(key); return next; }), 2000);
          } else if (msg.event === "leave") {
            const leaveKey = msg.discord_id ?? msg.twitch_username ?? null;
            if (leaveKey) {
              setExitingSignupKeys((prev) => new Set([...prev, leaveKey]));
              setTimeout(() => {
                setPublicSignups((prev) =>
                  prev.filter((s) => {
                    if (msg.discord_id) return s.discord_id !== msg.discord_id;
                    if (msg.twitch_username) return s.twitch_username !== msg.twitch_username;
                    return true;
                  })
                );
                setExitingSignupKeys((prev) => { const next = new Set(prev); next.delete(leaveKey); return next; });
              }, 350);
            } else {
              setPublicSignups((prev) =>
                prev.filter((s) => {
                  if (msg.discord_id) return s.discord_id !== msg.discord_id;
                  if (msg.twitch_username) return s.twitch_username !== msg.twitch_username;
                  return true;
                })
              );
            }
          } else if (msg.event === "game_reported" || msg.event === "game_confirmed" || msg.event === "counterpick_set") {
            fetchMyMatchRef.current();
            if (msg.event === "game_confirmed") fetchDataRef.current();
          } else if (msg.event === "match_reported") {
            fetchDataRef.current();
            fetchMyMatchRef.current();
          } else if (msg.event === "match_complete") {
            fetchDataRef.current().then(() => {
              if (msg.match_id != null) {
                setFlashMatchId(msg.match_id);
                setTimeout(() => setFlashMatchId(null), 2500);
              }
              if (msg.winner_team_id != null) {
                setRecentWinnerTeamId(msg.winner_team_id);
                setTimeout(() => setRecentWinnerTeamId(null), 3000);
              }
            });
            fetchMyMatchRef.current();
          } else if (msg.event === "game_score" && msg.match_id != null) {
            setData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                rounds: prev.rounds.map((r) => ({
                  ...r,
                  matches: r.matches.map((m) =>
                    m.id === msg.match_id
                      ? { ...m, team1_games: msg.team1_games ?? 0, team2_games: msg.team2_games ?? 0 }
                      : m
                  ),
                })),
              };
            });
          } else if (msg.event === "tournament_locked" || msg.event === "tournament_cancelled") {
            fetchDataRef.current();
            fetchMyMatchRef.current();
          }
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        if (!dead) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    // Also fetch initial signup list via HTTP in case WS hello races
    axios.get<{ signups: PublicSignup[]; count: number }>(`${API_URL}/api/tournament/signups`, {
      params: { guild_id: GUILD_ID },
    }).then(({ data: res }) => {
      setPublicSignups(res.signups ?? []);
    }).catch(() => {});

    return () => {
      dead = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (viewingId) {
      fetchData(viewingId);
    } else {
      fetchData();
      const id = setInterval(fetchData, POLL_MS);
      return () => clearInterval(id);
    }
  }, [fetchData, viewingId]);

  useEffect(() => {
    if (loggedIn && data?.tournament?.status === "active") {
      fetchMyMatch();
    } else {
      setMyMatch(null);
      setPlayerTeamId(null);
    }
  }, [loggedIn, data?.tournament?.status, fetchMyMatch]);

  const setMsg = useCallback((msg: string | null) => {
    setReportMsg(msg);
    if (reportMsgTimerRef.current) clearTimeout(reportMsgTimerRef.current);
    if (msg) reportMsgTimerRef.current = setTimeout(() => setReportMsg(null), 5000);
  }, []);

  const handleReportGame = useCallback(async (gameNumber: number, result: "win" | "loss") => {
    if (!GUILD_ID) return;
    setReportLoading(true);
    setMsg(null);
    try {
      const { data: res } = await axios.post(
        `${API_URL}/api/tournament/report-game`,
        { guild_id: GUILD_ID, game_number: gameNumber, result },
        { withCredentials: true }
      );
      setMsg(res.message);
      if (res.ok) fetchMyMatch();
    } catch {
      setMsg("Failed to report result. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [fetchMyMatch, setMsg]);

  const handleConfirmGame = useCallback(async (gameNumber: number) => {
    if (!myMatch) return;
    setReportLoading(true);
    setMsg(null);
    try {
      const { data: res } = await axios.post(
        `${API_URL}/api/tournament/confirm-game`,
        { match_id: myMatch.id, game_number: gameNumber },
        { withCredentials: true }
      );
      setMsg(res.message);
      if (res.ok) {
        if (res.series_complete) { setMyMatch(null); fetchData(); }
        else fetchMyMatch();
      }
    } catch {
      setMsg("Failed to confirm. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [myMatch, fetchData, fetchMyMatch, setMsg]);

  const handleDisputeGame = useCallback(async (gameNumber: number) => {
    if (!myMatch) return;
    setReportLoading(true);
    setMsg(null);
    try {
      const { data: res } = await axios.post(
        `${API_URL}/api/tournament/dispute-game`,
        { match_id: myMatch.id, game_number: gameNumber },
        { withCredentials: true }
      );
      setMsg(res.message);
      if (res.ok) fetchMyMatch();
    } catch {
      setMsg("Failed to dispute. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [myMatch, fetchMyMatch, setMsg]);

  const handleCounterpick = useCallback(async (gameNumber: number, stage: string) => {
    if (!myMatch) return;
    setReportLoading(true);
    setMsg(null);
    try {
      const { data: res } = await axios.post(
        `${API_URL}/api/tournament/counterpick`,
        { match_id: myMatch.id, game_number: gameNumber, stage_name: stage },
        { withCredentials: true }
      );
      setMsg(res.message);
      if (res.ok) fetchMyMatch();
    } catch {
      setMsg("Failed to lock in counterpick. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [myMatch, fetchMyMatch, setMsg]);

  const tournament  = data?.tournament;
  const rounds      = data?.rounds ?? [];
  const totalRounds = rounds.length;

  const opponentMatchId = useMemo(() => {
    if (!myMatch) return null;
    for (const round of rounds) {
      const m = round.matches.find((m) => m.id === myMatch.id);
      if (m) {
        return myMatch.player_team_id === myMatch.team1_id ? m.feeder2_match_id : m.feeder1_match_id;
      }
    }
    return null;
  }, [myMatch, rounds]);

  // ---- Drag-to-pan for full bracket view ----------------------------------
  const bracketScrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleBracketPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest("button, a, input")) return;
    const el = bracketScrollRef.current;
    if (!el) return;
    const pointerId   = e.pointerId;
    const startScrollX = el.scrollLeft;
    const startScrollY = el.scrollTop;
    const originX      = e.clientX;
    const originY      = e.clientY;
    let dragging = false;
    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - originX;
      const dy = me.clientY - originY;
      if (!dragging && Math.sqrt(dx * dx + dy * dy) > 5) {
        dragging = true;
        setIsDragging(true);
        el.setPointerCapture(pointerId);
      }
      if (dragging) {
        el.scrollLeft = startScrollX - dx;
        el.scrollTop  = startScrollY - dy;
      }
    };
    const onUp = () => {
      if (dragging) setIsDragging(false);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup",   onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup",   onUp);
  }, []);

  const winner = (() => {
    if (tournament?.status !== "complete" || rounds.length === 0) return null;
    const fm = rounds[rounds.length - 1]?.matches[0];
    if (!fm?.winner_id) return null;
    return fm.winner_id === fm.team1?.id ? fm.team1 : fm.team2;
  })();

  const confettiFiredRef = useRef(false);
  useEffect(() => {
    if (!winner || viewingId || confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    const burst = (x: number, angle: number) =>
      confetti({ particleCount: 80, spread: 70, angle, origin: { x, y: 0.6 }, colors: ["#facc15","#fbbf24","#a78bfa","#60a5fa","#34d399","#f87171"] });
    burst(0.2, 60);
    burst(0.8, 120);
    setTimeout(() => { burst(0.1, 80); burst(0.9, 100); }, 400);
    setTimeout(() => { burst(0.5, 90); }, 900);
  }, [winner, viewingId]);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = () => setHistoryOpen(false);
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [historyOpen]);

  return (
    <PageWrapper>
      <Helmet>
        <title>Tournament | sneakyofficial.com</title>
      </Helmet>

      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-8">
          <Trophy className="w-8 h-8 text-yellow-400 shrink-0" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">
              {tournament ? tournament.name : "Community Tournament"}
            </h1>
            {tournament && (
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status={tournament.status} />
                {viewingId && (
                  <button
                    onClick={() => { setViewingId(null); setData(null); setLoading(true); confettiFiredRef.current = false; }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                  >
                    ← Back to current
                  </button>
                )}
                {!viewingId && lastUpdated && (
                  <span className="text-xs text-slate-500">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {history.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setHistoryOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
                >
                  <History className="w-3.5 h-3.5" /> Past Tournaments
                </button>
                {historyOpen && (
                  <div className="absolute right-0 top-full mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-30 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                      Previous Tournaments
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {history.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setViewingId(t.id); setData(null); setLoading(true); setHistoryOpen(false); confettiFiredRef.current = false; }}
                          className={`w-full text-left px-3 py-2.5 hover:bg-slate-800 transition-colors border-b border-slate-800/60 last:border-0 ${viewingId === t.id ? "bg-slate-800/80" : ""}`}
                        >
                          <div className="text-sm text-slate-200 font-medium truncate">{t.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(t.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!authLoading && !loggedIn && (
              <a
                href={`${API_URL}/api/auth/discord/login`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" /> Log in with Discord
              </a>
            )}
            {!authLoading && isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-yellow-600/40 text-yellow-400 hover:text-yellow-300 hover:border-yellow-500/60 text-xs font-medium transition-colors"
              >
                <Trophy className="w-3.5 h-3.5" /> Admin
              </Link>
            )}
          </div>
        </div>

        {/* Match report card — logged-in non-admin players in an active match */}
        {loggedIn && !myMatchLoading && myMatch && (
          <MatchReportCard
            match={myMatch}
            opponentMatchId={opponentMatchId}
            loading={reportLoading}
            message={reportMsg}
            isAdmin={!!isAdmin}
            onReportGame={handleReportGame}
            onConfirmGame={handleConfirmGame}
            onDisputeGame={handleDisputeGame}
            onCounterpick={handleCounterpick}
          />
        )}

        {/* States */}
        {loading && (
          <div className="text-slate-400 text-center py-16 text-sm">Loading bracket…</div>
        )}
        {!loading && error && (
          <div className="text-red-400 text-center py-16 text-sm">{error}</div>
        )}
        {!loading && !error && !tournament && (
          <div className="text-center py-16">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-slate-700" />
            <p className="text-slate-400 text-lg">No tournament is currently active.</p>
            <p className="text-slate-500 text-sm mt-1">Check back during a stream!</p>
          </div>
        )}

        {/* Winner banner (above bracket when complete) */}
        {winner && <WinnerBanner team={winner} />}

        {/* Special rules banner */}
        {tournament?.special_rules && (
          <div className={`mb-6 rounded-xl border p-4 text-sm ${
            tournament.affects_rating === false
              ? "border-amber-600/40 bg-amber-900/10 text-amber-200"
              : "border-blue-600/40 bg-blue-900/10 text-blue-200"
          }`}>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-1">
                  Special Rules
                  {tournament.affects_rating === false && (
                    <span className="ml-2 text-xs font-normal text-amber-400">(does not affect rating)</span>
                  )}
                </p>
                <p className="text-slate-300 whitespace-pre-wrap">{tournament.special_rules}</p>
              </div>
            </div>
          </div>
        )}

        {/* Sign-up mode */}
        {tournament?.status === "signup" && (
          <>
            {tournament.team_size && (
              <p className="text-center text-sm text-purple-300 mb-2">
                Format: {tournament.team_size}v{tournament.team_size}
              </p>
            )}
            <SignupList signups={publicSignups} newSignupKeys={newSignupKeys} exitingSignupKeys={exitingSignupKeys} />
          </>
        )}

        {/* Bracket */}
        {tournament && rounds.length > 0 && (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/60 backdrop-blur-sm shadow-2xl">
            {/* View toggle */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-700/40">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Bracket</span>
              <div className="flex gap-1 p-0.5 rounded-lg bg-slate-900/60 border border-slate-700/50">
                <button
                  onClick={() => setBracketMode("rounds")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    bracketMode === "rounds"
                      ? "bg-slate-700 text-white shadow"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Round View
                </button>
                <button
                  onClick={() => setBracketMode("full")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    bracketMode === "full"
                      ? "bg-slate-700 text-white shadow"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Full Bracket
                </button>
              </div>
            </div>

            {bracketMode === "rounds" ? (
              <div className="p-5">
                <MobileBracketView
                  rounds={rounds}
                  totalRounds={totalRounds}
                  flashMatchId={flashMatchId}
                  recentWinnerTeamId={recentWinnerTeamId}
                  playerTeamId={playerTeamId}
                  onTeamClick={setSelectedTeam}
                />
              </div>
            ) : (
              <div
                ref={bracketScrollRef}
                className={`overflow-auto p-6 select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                onPointerDown={handleBracketPointerDown}
              >
                <BracketView
                  rounds={rounds}
                  totalRounds={totalRounds}
                  flashMatchId={flashMatchId}
                  recentWinnerTeamId={recentWinnerTeamId}
                  playerTeamId={playerTeamId}
                  onTeamClick={setSelectedTeam}
                />
              </div>
            )}
          </div>
        )}

        {/* Team modal */}
        {selectedTeam && (
          <TeamModal team={selectedTeam} rounds={rounds} onClose={() => setSelectedTeam(null)} />
        )}

        {/* Commands footer */}
        <div className="mt-10 border-t border-slate-800 pt-6 text-xs text-slate-500 space-y-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div>
              <span className="text-slate-400 font-semibold">Discord</span>
              <div className="mt-1 space-y-0.5">
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament signup</code> — enter the tournament</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament leave</code> — withdraw from sign-ups</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament status</code> — current round info &amp; your match</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament bracket</code> — bracket link</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament matchinfo</code> — your map, mode &amp; opponent</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament room</code> — get your lobby code (home team)</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament report win/loss</code> — report match result</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament nameteam</code> — set team name (captains)</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">/tournament players</code> — list all signed-up players</p>
              </div>
            </div>
            <div>
              <span className="text-slate-400 font-semibold">Twitch</span>
              <div className="mt-1 space-y-0.5">
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!signup</code> <span className="text-slate-600">· !in · !join · !enter</span> — enter the tournament</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!unsignup</code> <span className="text-slate-600">· !out · !leave · !exit</span> — withdraw from sign-ups</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!splattag Name#1234</code> — set your Splatoon tag (required once)</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!confirmtag</code> / <code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!canceltag</code> — confirm or cancel tag change</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!bracket</code> — bracket link</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!tournament</code> — current status</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!report win/loss</code> — report match result</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!confirm</code> / <code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!dispute</code> — confirm or dispute result</p>
                <p><code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!rank</code> / <code className="bg-slate-800/80 px-1.5 py-0.5 rounded text-purple-300">!stats</code> — your rank &amp; match stats</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-slate-600">Sign-ups and match results update in real time via WebSocket.</p>
        </div>
      </div>
    </PageWrapper>
  );
}
