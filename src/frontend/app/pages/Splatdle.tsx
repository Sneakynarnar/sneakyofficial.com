import { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet";
import axios from "axios";
import {
  Search, Target, Weight, Bomb, Star, Trophy,
  RotateCcw, Gamepad2, LogOut,
  Calendar, ChevronDown, Infinity as InfinityIcon,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { WinningPopup } from "../components/splatdle/WinningPopup";
import { WeaponImage } from "../components/splatdle/WeaponImage";
import { FlipCard } from "../components/splatdle/FlipCard";
import { DiscordIcon } from "../components/splatdle/DiscordIcon";
import {
  getDailyKey, getComparisonClass, formatStat, getArrow, pickRandom,
} from "../utils/splatdle";
import type { GameMode, Weapon, GameData, Guess, SavedDailyState, UserStats } from "../types/splatdle";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const GUESS_COLUMNS = [
  { label: "Weapon", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { label: "Name",   icon: <Target   className="h-3.5 w-3.5" /> },
  { label: "Class",  icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { label: "Range",  icon: <Target   className="h-3.5 w-3.5" /> },
  { label: "Weight", icon: <Weight   className="h-3.5 w-3.5" /> },
  { label: "Sub",    icon: <Bomb     className="h-3.5 w-3.5" /> },
  { label: "Special",icon: <Star     className="h-3.5 w-3.5" /> },
  { label: "Game",   icon: <Gamepad2 className="h-3.5 w-3.5" /> },
];

const LEGEND = [
  { colour: "bg-emerald-600", label: "Correct" },
  { colour: "bg-amber-600",   label: "Close (±10)" },
  { colour: "bg-rose-600",    label: "Wrong" },
  { colour: "bg-slate-600",   label: "Unknown" },
];

function loadDailyState(): SavedDailyState | null {
  try {
    const raw = localStorage.getItem(getDailyKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const Splatdle = () => {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("daily");

  const [dailyGuesses, setDailyGuesses] = useState<Guess[]>([]);
  const [dailyWon, setDailyWon] = useState(false);
  const [statsPosted, setStatsPosted] = useState(false);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [hintsUsed, setHintsUsed] = useState({ releaseDate: false, baseDamage: false });

  const [infiniteAnswer, setInfiniteAnswer] = useState<string>("");
  const [infiniteGuesses, setInfiniteGuesses] = useState<Guess[]>([]);
  const [infiniteWon, setInfiniteWon] = useState(false);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [animatingGuess, setAnimatingGuess] = useState<number | null>(null);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);

  const { loggedIn, userData, isLoading: authLoading } = useAuth();

  const guesses = gameMode === "daily" ? dailyGuesses : infiniteGuesses;
  const gameWon = gameMode === "daily" ? dailyWon : infiniteWon;
  const effectiveAnswer = gameMode === "daily" ? (gameData?.answer ?? "") : infiniteAnswer;

  const correctWeapon = gameData?.weapons.find(w => {
    const parts = effectiveAnswer.split(" (");
    const name = parts[0];
    const game = parts[1]?.replace(")", "");
    return game ? w.name === name && w.game === game : w.name === name;
  });

  // ── Persistence ─────────────────────────────────────────────────────────────

  const saveDailyState = useCallback((
    gs: Guess[], won: boolean, answer: string, posted: boolean,
    hints = { releaseDate: false, baseDamage: false }
  ) => {
    try {
      localStorage.setItem(getDailyKey(), JSON.stringify({
        guesses: gs, gameWon: won, answer, statsPosted: posted,
        hintsUsed: hints, completedAt: new Date().toISOString(),
      } satisfies SavedDailyState));
    } catch { /* storage full */ }
  }, []);

  // ── Stats posting ────────────────────────────────────────────────────────────

  const postStats = useCallback(async (guessCount: number, currentGuesses: Guess[]) => {
    if (!loggedIn || !userData || statsPosted) return;
    try {
      const res = await fetch(`${API_URL}/api/splatdle/stats`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess_count: guessCount }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setStatsPosted(true);
      const stats: UserStats = {
        streak: data.streak,
        totalGames: data.totalGames,
        averageGuesses: data.averageGuesses,
        globalAverage: data.globalAverage,
        isNewStreak: data.status === "already_played" ? false : data.isNewStreak,
        guessCount: data.status === "already_played" ? data.todaysGuesses : data.guessCount,
        personalPerformance:
          data.status === "already_played"
            ? data.todaysGuesses < data.averageGuesses ? "above"
            : data.todaysGuesses > data.averageGuesses ? "below"
            : "equal"
            : data.personalPerformance,
        playedAt: data.playedAt,
        alreadyPlayed: data.status === "already_played",
      };
      setUserStats(stats);
      saveDailyState(currentGuesses, true, gameData?.answer ?? "", true, hintsUsed);
    } catch { /* network error */ }
  }, [loggedIn, userData, statsPosted, gameData, hintsUsed, saveDailyState]);

  // ── Data fetching ────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      let data: GameData = { weapons: [], answer: "" };
      try {
        const res = await axios.get(`${API_URL}/api/splatdle`);
        data = res.data;
      } catch { /* offline or API down */ }
      setGameData(data);

      const saved = loadDailyState();
      if (saved) {
        setDailyGuesses(saved.guesses);
        setDailyWon(saved.gameWon);
        setStatsPosted(saved.statsPosted ?? false);
        setHintsUsed(saved.hintsUsed ?? { releaseDate: false, baseDamage: false });
        if (saved.gameWon) setShowWinPopup(true);
      }
      setLoading(false);
    };
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gameMode === "daily" && loggedIn && dailyWon && !statsPosted && dailyGuesses.length > 0) {
      postStats(dailyGuesses.length, dailyGuesses);
    }
  }, [loggedIn, dailyWon, statsPosted, dailyGuesses, gameMode, postStats]);

  // ── Presence heartbeat ───────────────────────────────────────────────────────
  // Tells the backend this tab is open so the admin portal can show a live
  // player count. Anonymous players count too, hence a local session id.
  useEffect(() => {
    let sessionId = sessionStorage.getItem("splatdle_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("splatdle_session_id", sessionId);
    }
    // Kept between visits so returning players are not counted as new ones in
    // the monthly figures. Random, and tied to nothing else.
    let visitorId = localStorage.getItem("splatdle_visitor_id");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("splatdle_visitor_id", visitorId);
    }
    const beat = () => {
      if (document.hidden) return;
      axios
        .post(`${API_URL}/api/splatdle/heartbeat`, { session_id: sessionId, visitor_id: visitorId })
        .catch(() => { /* offline */ });
    };
    beat();
    const timer = setInterval(beat, 30_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  // ── Infinite mode ────────────────────────────────────────────────────────────

  const startInfiniteGame = useCallback(() => {
    if (!gameData || gameData.weapons.length === 0) return;
    const weapon = pickRandom(gameData.weapons);
    const hasDups = gameData.weapons.filter(w => w.name === weapon.name).length > 1;
    const answer = hasDups ? `${weapon.name} (${weapon.game})` : weapon.name;
    setInfiniteAnswer(answer);
    setInfiniteGuesses([]);
    setInfiniteWon(false);
    setShowWinPopup(false);
    setSearchTerm("");
    setSelectedWeapon(null);
  }, [gameData]);

  const switchToInfinite = () => {
    setGameMode("infinite");
    if (!infiniteAnswer && gameData) startInfiniteGame();
  };

  const switchToDaily = () => { setGameMode("daily"); setShowWinPopup(false); };

  // ── Search ───────────────────────────────────────────────────────────────────

  const hasDuplicateNames = (weapons: Weapon[]) => {
    const counts = new Map<string, number>();
    weapons.forEach(w => counts.set(w.name, (counts.get(w.name) ?? 0) + 1));
    return [...counts.values()].some(c => c > 1);
  };

  const getDisplayName = (weapon: Weapon) =>
    gameData && hasDuplicateNames(gameData.weapons)
      ? `${weapon.name} (${weapon.game})`
      : weapon.name;

  const isGuessedAlready = (w: Weapon) =>
    guesses.some(g => g.weapon.name === w.name && g.weapon.game === w.game);

  const filteredWeapons = (() => {
    if (!searchTerm.trim() || !gameData) return [];
    const q = searchTerm.toLowerCase().trim();
    const words = q.split(/\s+/);
    return gameData.weapons
      .filter(w => !isGuessedAlready(w))
      .filter(w => {
        const n = w.name.toLowerCase();
        return n.includes(q) || words.every(word => n.includes(word) || w.class.toLowerCase().includes(word));
      })
      .sort((a, b) => {
        const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
        if (an === q) return -1;
        if (bn === q) return 1;
        if (an.startsWith(q) && !bn.startsWith(q)) return -1;
        if (bn.startsWith(q) && !an.startsWith(q)) return 1;
        return an.localeCompare(bn);
      })
      .slice(0, 8);
  })();

  // ── Guessing ─────────────────────────────────────────────────────────────────

  const isCorrectGuess = (weapon: Weapon): boolean => {
    if (!effectiveAnswer) return false;
    const parts = effectiveAnswer.split(" (");
    const name = parts[0];
    const game = parts[1]?.replace(")", "");
    return game ? weapon.name === name && weapon.game === game : weapon.name === name;
  };

  const makeGuess = async () => {
    if (!selectedWeapon || !gameData || gameWon) return;
    const newGuess: Guess = { id: Date.now(), weapon: selectedWeapon, isCorrect: isCorrectGuess(selectedWeapon) };
    let newGuesses: Guess[];
    if (gameMode === "daily") {
      newGuesses = [newGuess, ...dailyGuesses];
      setDailyGuesses(newGuesses);
    } else {
      newGuesses = [newGuess, ...infiniteGuesses];
      setInfiniteGuesses(newGuesses);
    }
    setSelectedWeapon(null);
    setSearchTerm("");
    setShowDropdown(false);

    const animDelay = skipAnimation ? 0 : 3600;

    if (!skipAnimation) {
      setAnimatingGuess(0);
      setTimeout(() => setAnimatingGuess(null), 3600);
    }

    if (newGuess.isCorrect) {
      setTimeout(async () => {
        if (gameMode === "daily") {
          setDailyWon(true);
          saveDailyState(newGuesses, true, gameData.answer, false, hintsUsed);
          if (loggedIn && !statsPosted) await postStats(newGuesses.length, newGuesses);
        } else {
          setInfiniteWon(true);
        }
        setShowWinPopup(true);
      }, animDelay);
    } else if (gameMode === "daily") {
      saveDailyState(newGuesses, false, gameData.answer, false, hintsUsed);
    }
  };

  // ── Hints ────────────────────────────────────────────────────────────────────

  const revealHint = (type: "releaseDate" | "baseDamage") => {
    const next = { ...hintsUsed, [type]: true };
    setHintsUsed(next);
    saveDailyState(dailyGuesses, dailyWon, gameData?.answer ?? "", statsPosted, next);
  };

  const canRevealRelease = gameMode === "daily" && dailyGuesses.length >= 8 && !hintsUsed.releaseDate;
  const canRevealDamage  = gameMode === "daily" && dailyGuesses.length >= 16 && !hintsUsed.baseDamage;
  const showHints = gameMode === "daily" && !dailyWon &&
    (canRevealRelease || canRevealDamage || hintsUsed.releaseDate || hintsUsed.baseDamage);

  // ── Share ────────────────────────────────────────────────────────────────────

  const generateShareText = () => {
    if (!correctWeapon) return `SPLATDLE\nPlay at: https://sneakyofficial.com/splatdle`;
    const rows = guesses.slice().reverse().map(g => {
      const cells = [
        g.weapon.name === correctWeapon.name && g.weapon.game === correctWeapon.game ? "G" : "R",
        g.weapon.class === correctWeapon.class ? "G" : "R",
        g.weapon.range === -1 || correctWeapon.range === -1 ? "?"
          : Math.abs(g.weapon.range - correctWeapon.range) === 0 ? "G"
          : Math.abs(g.weapon.range - correctWeapon.range) <= 10 ? "Y" : "R",
        g.weapon.weight === correctWeapon.weight ? "G" : "R",
        g.weapon.sub === correctWeapon.sub ? "G" : "R",
        g.weapon.special === correctWeapon.special ? "G" : "R",
        g.weapon.game === correctWeapon.game ? "G" : "R",
      ];
      return cells.map(c => c === "G" ? "🟩" : c === "Y" ? "🟨" : c === "?" ? "⬛" : "🟥").join("");
    });
    const modeTag = gameMode === "infinite" ? " (INFINITE MODE)" : "";
    return `SPLATDLE${modeTag}: ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}\n\n||${rows.join("\n")}||\n\nhttps://sneakyofficial.com/splatdle`;
  };

  const copyToClipboard = async () => {
    const text = generateShareText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // ────────────────────────────────────────────────────────────────────────────

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400 mx-auto mb-4" />
          <p className="text-white text-lg font-semibold">Loading Splatdle...</p>
        </div>
      </div>
    );
  }

  if (!gameData || gameData.weapons.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="glass border border-rose-500/25 rounded-2xl p-8 max-w-sm w-full text-center">
          <Gamepad2 className="w-10 h-10 text-rose-400 mx-auto mb-4 opacity-60" />
          <h2 className="text-lg font-bold text-white mb-2">Couldn't load weapons</h2>
          <p className="text-slate-400 text-sm mb-5">The game data failed to load. Check your connection or try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-xl text-sm font-semibold hover:bg-orange-500/30 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative">
      <Helmet>
        <title>Splatdle: Daily Splatoon Weapon Puzzle</title>
        <meta name="description" content="Guess the Splatoon weapon of the day. A daily puzzle with unlimited tries and optional infinite mode." />
        <meta property="og:title" content="Splatdle: Daily Splatoon Weapon Puzzle" />
        <meta property="og:description" content="Guess the Splatoon weapon of the day." />
        <meta property="og:image" content="/splatdle.png" />
        <meta property="og:url" content="https://sneakyofficial.com/splatdle" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: "url(/background.jpg)", filter: "blur(2px)" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 to-slate-950/90" />
      </div>

      {/* Flip card animation CSS */}
      <style>{`
        .flip-card { perspective: 1000px; }
        .flip-card-inner { position: relative; width: 100%; height: 100%; transition: transform 1.2s ease-in-out; transform-style: preserve-3d; }
        .flip-card-inner.flipped { transform: rotateY(180deg); }
        .flip-card-front, .flip-card-back { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 4px 6px; }
        .flip-card-back { transform: rotateY(180deg); }
      `}</style>

      <WinningPopup
        show={showWinPopup}
        onClose={() => setShowWinPopup(false)}
        gameMode={gameMode}
        answer={effectiveAnswer}
        guesses={guesses}
        loggedIn={loggedIn}
        statsPosted={statsPosted}
        userStats={userStats}
        copySuccess={copySuccess}
        onCopy={copyToClipboard}
        onNewInfiniteGame={() => { startInfiniteGame(); setShowWinPopup(false); }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-6 sm:py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 mb-1">
              SPLATDLE
            </h1>
            <p className="text-slate-400 text-sm">Guess the Splatoon weapon of the day</p>
          </div>

          {/* Auth */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {loggedIn && userData ? (
              <div className="flex items-center gap-2 glass border border-white/10 rounded-xl px-3 py-2">
                <img src={userData.avatarUrl} alt={userData.profileName} className="w-6 h-6 rounded-full" />
                <span className="text-white text-sm font-medium max-w-28 truncate">{userData.profileName}</span>
                <button
                  onClick={async () => {
                    await fetch(`${API_URL}/api/auth/discord/logout`, { method: "POST", credentials: "include" });
                    window.location.reload();
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                  aria-label="Log out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => window.open(`${API_URL}/api/auth/discord/login`, "_blank")}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:opacity-90 hover:scale-[1.02] transition-all"
              >
                <DiscordIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Login with Discord</span>
                <span className="sm:hidden">Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex glass border border-white/10 rounded-xl p-1 gap-1">
            <button
              onClick={switchToDaily}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                gameMode === "daily"
                  ? "bg-orange-500/30 text-orange-300 border border-orange-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Daily
            </button>
            <button
              onClick={switchToInfinite}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                gameMode === "infinite"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <InfinityIcon className="h-3.5 w-3.5" />
              Infinite
            </button>
          </div>
          {gameMode === "infinite" && (
            <span className="text-xs text-amber-400 glass border border-amber-500/20 px-2.5 py-1 rounded-full">
              Stats not tracked
            </span>
          )}
        </div>

        {/* Legend + animation toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
            {LEGEND.map(({ colour, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded ${colour}`} />
                <span>{label}</span>
            </div>
          ))}
          </div>
          <button
            onClick={() => setSkipAnimation(v => !v)}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              skipAnimation
                ? "bg-orange-500/20 border-orange-500/30 text-orange-300"
                : "glass border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              skipAnimation ? "border-orange-400 bg-orange-400" : "border-slate-500"
            }`} />
            Skip animations
          </button>
        </div>

        {/* Win banner */}
        {gameWon && (
          <div className="glass border border-emerald-500/25 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold text-emerald-400 text-base">
                {effectiveAnswer}: {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}
              </p>
              {gameMode === "daily" && (
                <p className="text-slate-400 text-xs">Next puzzle at midnight UTC</p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setShowWinPopup(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-sm font-semibold hover:bg-emerald-500/30 transition-colors"
              >
                <Trophy className="h-4 w-4" />
                Results
              </button>
              {gameMode === "infinite" && (
                <button
                  onClick={startInfiniteGame}
                  className="flex items-center gap-1.5 px-4 py-2 glass border border-white/10 text-slate-300 rounded-xl text-sm font-semibold hover:text-white transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  New game
                </button>
              )}
            </div>
          </div>
        )}

        {/* Hints (daily only) */}
        {showHints && (
          <div className="glass border border-purple-500/20 rounded-2xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-purple-400 mb-4">Hints</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { type: "releaseDate" as const, label: "Release Date", unlockAt: 8,  canUse: canRevealRelease, used: hintsUsed.releaseDate, value: correctWeapon?.hint_released },
                { type: "baseDamage"  as const, label: "Base Damage",  unlockAt: 16, canUse: canRevealDamage,  used: hintsUsed.baseDamage,  value: correctWeapon?.hint_base_damage },
              ].map(hint => (
                <div key={hint.type} className="glass border border-white/8 rounded-xl p-4">
                  <p className="text-xs font-semibold text-white mb-1">{hint.label}</p>
                  <p className="text-xs text-slate-500 mb-3">Unlocks after {hint.unlockAt} guesses</p>
                  {hint.used ? (
                    <p className="text-xs text-emerald-400 font-semibold">{hint.value ?? "Unknown"}</p>
                  ) : hint.canUse ? (
                    <button
                      onClick={() => revealHint(hint.type)}
                      className="text-xs px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
                    >
                      Reveal
                    </button>
                  ) : (
                    <p className="text-xs text-slate-600">
                      {dailyGuesses.length < hint.unlockAt
                        ? `${hint.unlockAt - dailyGuesses.length} more guesses needed`
                        : "Already used"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        {!gameWon && (
          <div className="glass border border-white/10 rounded-2xl p-5 mb-6 relative z-40">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search for a weapon..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setShowDropdown(true); setSelectedWeapon(null); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/30 transition-all text-sm outline-none"
                />
                {showDropdown && searchTerm && filteredWeapons.length > 0 && (
                  <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-white/15 rounded-xl shadow-2xl max-h-72 overflow-y-auto">
                    {filteredWeapons.map(weapon => (
                      <button
                        key={`${weapon.name}-${weapon.game}`}
                        onClick={() => { setSelectedWeapon(weapon); setSearchTerm(getDisplayName(weapon)); setShowDropdown(false); }}
                        className="w-full text-left px-4 py-3 hover:bg-white/10 border-b border-white/8 last:border-0 transition-colors flex items-center gap-3"
                      >
                        <WeaponImage weapon={weapon} className="w-9 h-9 flex-shrink-0" />
                        <div>
                          <div className="font-semibold text-white text-sm">{getDisplayName(weapon)}</div>
                          <div className="text-slate-400 text-xs">{weapon.class}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={makeGuess}
                disabled={!selectedWeapon}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-bold text-sm hover:from-orange-600 hover:to-pink-600 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
              >
                Guess
              </button>
            </div>
          </div>
        )}

        {/* Column headers — desktop single row */}
        {guesses.length > 0 && (
          <div className="glass border border-white/8 rounded-xl px-4 py-3 mb-3 hidden lg:block">
            <div className="grid grid-cols-8 gap-2 text-center text-xs font-semibold text-slate-400">
              {GUESS_COLUMNS.map(col => (
                <div key={col.label} className="flex items-center justify-center gap-1">
                  {col.icon}
                  <span>{col.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Column headers — mobile two rows of 4 */}
        {guesses.length > 0 && (
          <div className="glass border border-white/8 rounded-xl px-2 py-2 mb-3 lg:hidden">
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-semibold text-slate-400">
              {GUESS_COLUMNS.map(col => (
                <div key={col.label} className="flex items-center justify-center gap-1">
                  {col.icon}
                  <span>{col.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attempt counter */}
        {guesses.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs text-slate-500">
              {guesses.length} {guesses.length === 1 ? "attempt" : "attempts"}, newest first
            </span>
          </div>
        )}

        {/* Guesses */}
        <div className="space-y-2">
          {guesses.map((guess, index) => (
            <div key={guess.id} className="glass border border-white/8 rounded-xl px-2 py-2 sm:px-3 sm:py-2">
              {/* Mobile: 2 rows of 4 — Desktop: 1 row of 8 */}
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-2 text-center font-medium items-center">

                {/* Row 1 on mobile: image · name · class · range */}
                <FlipCard isAnimating={animatingGuess === index} delay={0} shouldStayFlipped={animatingGuess !== index}>
                  <div className="w-full h-full glass rounded-lg flex items-center justify-center p-1">
                    <WeaponImage weapon={guess.weapon} className="w-full h-full" />
                  </div>
                </FlipCard>

                <FlipCard isAnimating={animatingGuess === index} delay={200} shouldStayFlipped={animatingGuess !== index}>
                  <div className={`${getComparisonClass(isCorrectGuess(guess.weapon) ? correctWeapon?.name : guess.weapon.name, correctWeapon?.name)} text-white rounded-lg h-full w-full flex items-center justify-center font-bold text-[10px] sm:text-xs px-1`}>
                    <span className="break-words text-center leading-tight">{getDisplayName(guess.weapon)}</span>
                  </div>
                </FlipCard>

                <FlipCard isAnimating={animatingGuess === index} delay={400} shouldStayFlipped={animatingGuess !== index}>
                  <div className={`${getComparisonClass(guess.weapon.class, correctWeapon?.class)} text-white rounded-lg h-full w-full flex items-center justify-center font-semibold text-[10px] sm:text-xs px-1`}>
                    <span className="break-words text-center leading-tight">{guess.weapon.class}</span>
                  </div>
                </FlipCard>

                <FlipCard isAnimating={animatingGuess === index} delay={600} shouldStayFlipped={animatingGuess !== index}>
                  <div className={`${getComparisonClass(guess.weapon.range, correctWeapon?.range)} text-white rounded-lg h-full w-full flex flex-col items-center justify-center font-bold text-[10px] sm:text-xs px-1`}>
                    <span>{formatStat(guess.weapon.range)}</span>
                    <span className="opacity-70 text-[9px]">{getArrow(guess.weapon.range, correctWeapon?.range)}</span>
                  </div>
                </FlipCard>

                {/* Row 2 on mobile: weight · sub · special · game */}
                <FlipCard isAnimating={animatingGuess === index} delay={800} shouldStayFlipped={animatingGuess !== index}>
                  <div className={`${getComparisonClass(guess.weapon.weight, correctWeapon?.weight)} text-white rounded-lg h-full w-full flex items-center justify-center font-semibold text-[10px] sm:text-xs px-1`}>
                    <span className="break-words text-center leading-tight">{guess.weapon.weight}</span>
                  </div>
                </FlipCard>

                <FlipCard isAnimating={animatingGuess === index} delay={1000} shouldStayFlipped={animatingGuess !== index}>
                  <div className={`${getComparisonClass(guess.weapon.sub, correctWeapon?.sub)} text-white rounded-lg h-full w-full flex items-center justify-center font-semibold text-[10px] sm:text-xs px-1`}>
                    <span className="break-words text-center leading-tight">{guess.weapon.sub}</span>
                  </div>
                </FlipCard>

                <FlipCard isAnimating={animatingGuess === index} delay={1200} shouldStayFlipped={animatingGuess !== index}>
                  <div className={`${getComparisonClass(guess.weapon.special, correctWeapon?.special)} text-white rounded-lg h-full w-full flex items-center justify-center font-semibold text-[10px] sm:text-xs px-1`}>
                    <span className="break-words text-center leading-tight">{guess.weapon.special}</span>
                  </div>
                </FlipCard>

                <FlipCard isAnimating={animatingGuess === index} delay={1400} shouldStayFlipped={animatingGuess !== index}>
                  <div className={`${getComparisonClass(guess.weapon.game, correctWeapon?.game)} text-white rounded-lg h-full w-full flex items-center justify-center font-semibold text-[10px] sm:text-xs px-1`}>
                    {guess.weapon.game === "Splatoon" ? "S1" : guess.weapon.game === "Splatoon 2" ? "S2" : "S3"}
                  </div>
                </FlipCard>

              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Splatdle;
