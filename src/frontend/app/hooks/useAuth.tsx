import React, { useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Search,
  Target,
  Zap,
  Weight,
  Bomb,
  Star,
  Trophy,
  RotateCcw,
  Gamepad2,
  Image,
  X,
  Copy,
  ExternalLink,
  CheckCircle,
  LogOut,
} from "lucide-react";
import axios from "axios";

const apiUrl = import.meta.env.VITE_API_URL || "https://www.sneakyofficial.com";

type WeaponClass =
  | "Shooter"
  | "Charger"
  | "Roller"
  | "Brush"
  | "Slosher"
  | "Splatling"
  | "Dualies"
  | "Splatana"
  | "Brella"
  | "Rainmaker";

interface Weapon {
  name: string;
  class: WeaponClass;
  game: "Splatoon" | "Splatoon 2" | "Splatoon 3";
  image: string;
  firerate: number;
  range: number;
  damage: number;
  weight: "Super Slow" | "Slow" | "Normal" | "Fast";
  sub: string;
  special: string;
  hint_released: string;
  hint_base_damage: string;
}

interface GameData {
  weapons: Weapon[];
  answer: string;
}

interface Guess {
  weapon: Weapon;
  isCorrect: boolean;
}

type WeaponImageProps = {
  weapon: Weapon;
  className?: string;
};

type FlipCardProps = {
  children: React.ReactNode;
  isAnimating: boolean;
  delay?: number;
  className?: string;
  shouldStayFlipped?: boolean;
};

interface UserData {
  userId: string;
  profileName: string;
  avatarUrl: string;
}

interface UseAuthReturn {
  loggedIn: boolean;
  userData: UserData | null;
  setLoggedIn: Dispatch<SetStateAction<boolean>>;
  setUserData: Dispatch<SetStateAction<UserData | null>>;
  isLoading: boolean;
}

function useAuth(): UseAuthReturn {
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isMounted = useRef<boolean>(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  console.log(`Using API URL: ${apiUrl}`);
  const refreshToken = async (): Promise<string | null> => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/discord/refresh-token`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }

      const data: { access_token: string } = await response.json();
      console.log("Token refreshed successfully");
      if (isMounted.current) {
        await fetchAuthStatus();
      }

      return data.access_token;
    } catch (error) {
      console.error("Error refreshing token:", error);
      setLoggedIn(false);
      setUserData(null);
      setIsLoading(false);
      return null;
    }
  };

  const fetchAuthStatus = async (retry = true): Promise<void> => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/discord/status`, {
        method: "GET",
        credentials: "include",
      });

      if (response.status === 401 && retry) {
        const newToken = await refreshToken();
        if (newToken) {
          return fetchAuthStatus(false);
        }
      }

      if (!response.ok) {
        throw new Error("Failed to fetch auth status");
      }

      const data: {
        logged_in: boolean;
        player?: {
          id: string;
          username: string;
          avatar?: string;
        };
      } = await response.json();

      if (isMounted.current) {
        setLoggedIn(data.logged_in);
        console.log(data);
        setUserData(
          data.logged_in && data.player
            ? {
                userId: data.player.id,
                profileName: data.player.username,
                avatarUrl: data.player.avatar
                  ? `https://cdn.discordapp.com/avatars/${data.player.id}/${data.player.avatar}.png`
                  : "/default-avatar.png",
              }
            : null
        );
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error fetching authentication status:", error);
      if (isMounted.current) {
        setLoggedIn(false);
        setUserData(null);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAuthStatus();

    const interval = setInterval(async () => {
      await refreshToken();
    }, 55 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { loggedIn, userData, setLoggedIn, setUserData, isLoading };
}

function useLogout() {
  const logout = async () => {
    await fetch(`${apiUrl}/api/auth/discord/logout`, {
      method: "POST",
      credentials: "include",
    });
    window.location.reload();
  };

  return { logout };
}

const Splatdle = () => {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [selectedWeapon, setSelectedWeapon] = useState("");
  const [gameWon, setGameWon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [animatingGuess, setAnimatingGuess] = useState<number | null>(null);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Discord Auth hooks
  const { loggedIn, userData, isLoading: authLoading } = useAuth();
  const { logout } = useLogout();

  // Get today's date string for cache key (UTC-based)
  const getTodayKey = () => {
    const today = new Date();
    const utcDate = new Date(
      today.getTime() + today.getTimezoneOffset() * 60000
    );
    return `splatdle_${utcDate.getFullYear()}_${utcDate.getMonth()}_${utcDate.getDate()}`;
  };

  // Load game state from localStorage
  const loadGameState = () => {
    const todayKey = getTodayKey();
    const savedState = localStorage.getItem(todayKey);

    if (savedState) {
      const gameState = JSON.parse(savedState);
      return gameState;
    }
    return null;
  };

  // Save game state to localStorage
  const saveGameState = (
    guesses: Guess[],
    gameWon: boolean,
    answer: string
  ) => {
    const todayKey = getTodayKey();
    const gameState = {
      guesses,
      gameWon,
      answer,
      completedAt: new Date().toISOString(),
    };
    localStorage.setItem(todayKey, JSON.stringify(gameState));
  };

  // Advanced search algorithm with fuzzy matching and relevance scoring
  const searchWeapons = (query: string, weapons: Weapon[]) => {
    if (!query.trim()) return [];

    const normalizedQuery = query.toLowerCase().trim();

    return weapons
      .filter(
        (weapon) => !guesses.some((guess) => guess.weapon.name === weapon.name)
      )
      .map((weapon) => {
        const name = weapon.name.toLowerCase();
        let score = 0;

        if (name === normalizedQuery) {
          score = 1000;
        } else if (name.startsWith(normalizedQuery)) {
          score = 900;
        } else if (
          name.includes(` ${normalizedQuery}`) ||
          name.includes(`-${normalizedQuery}`) ||
          name.includes(`'${normalizedQuery}`)
        ) {
          score = 700;
        } else if (name.includes(normalizedQuery)) {
          score = 500;
        } else {
          const words = normalizedQuery.split(" ");
          let wordMatchScore = 0;
          words.forEach((word) => {
            if (name.includes(word)) {
              wordMatchScore += 100;
            }
          });
          score = wordMatchScore;
        }

        score += Math.max(0, 50 - weapon.name.length);

        return { weapon, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.weapon);
  };

  // Check if there are duplicate weapon names in the list
  const hasDuplicateNames = (weapons: Weapon[]) => {
    const nameCount = new Map<string, number>();
    weapons.forEach((weapon) => {
      nameCount.set(weapon.name, (nameCount.get(weapon.name) || 0) + 1);
    });
    return Array.from(nameCount.values()).some((count) => count > 1);
  };

  // Get display name with game info if needed
  const getDisplayName = (weapon: Weapon) => {
    if (!gameData) return weapon.name;

    const showGame = hasDuplicateNames(gameData.weapons);
    if (showGame) {
      return `${weapon.name} (${weapon.game})`;
    }
    return weapon.name;
  };

  // Get filtered weapons for search dropdown
  const filteredWeapons = searchWeapons(
    searchTerm,
    gameData?.weapons || []
  ).slice(0, 8);

  // Generate share text for results
  const generateShareText = () => {
    const guessCount = guesses.length;
    const correctWeapon = gameData?.weapons.find(
      (w) => w.name === gameData.answer
    );

    if (!correctWeapon) {
      return "🦑 SPLATDLE 🐙\\nError generating results - please contact sneaky!\\n\\nPlay at: https://sneakyofficial.com/splatdle";
    }

    const emojis = guesses
      .map((guess) => {
        const results = [
          guess.weapon.class === correctWeapon.class ? "🟢" : "🔴",
          guess.weapon.firerate === -1 || correctWeapon.firerate === -1
            ? "⚫"
            : Math.abs(guess.weapon.firerate - correctWeapon.firerate) === 0
            ? "🟢"
            : Math.abs(guess.weapon.firerate - correctWeapon.firerate) <= 10
            ? "🟡"
            : "🔴",
          guess.weapon.range === -1 || correctWeapon.range === -1
            ? "⚫"
            : Math.abs(guess.weapon.range - correctWeapon.range) === 0
            ? "🟢"
            : Math.abs(guess.weapon.range - correctWeapon.range) <= 10
            ? "🟡"
            : "🔴",
          guess.weapon.damage === -1 || correctWeapon.damage === -1
            ? "⚫"
            : Math.abs(guess.weapon.damage - correctWeapon.damage) === 0
            ? "🟢"
            : Math.abs(guess.weapon.damage - correctWeapon.damage) <= 10
            ? "🟡"
            : "🔴",
          guess.weapon.weight === correctWeapon.weight ? "🟢" : "🔴",
          guess.weapon.sub === correctWeapon.sub ? "🟢" : "🔴",
          guess.weapon.special === correctWeapon.special ? "🟢" : "🔴",
        ];
        return results.join("");
      })
      .join("\\n");

    return `🦑 SPLATDLE 🐙\\nGuessed in ${guessCount} ${
      guessCount === 1 ? "try" : "tries"
    }!\\n\\n${emojis}\\n\\nPlay at: https://sneakyofficial.com/splatdle`;
  };

  // Copy results to clipboard
  const copyToClipboard = async () => {
    try {
      const shareText = generateShareText();
      await navigator.clipboard.writeText(shareText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.log(err);
      const textArea = document.createElement("textarea");
      textArea.value = generateShareText();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Fetch game data
  const fetchGameData = async () => {
    setLoading(true);

    const savedState = loadGameState();
    let data: GameData;

    try {
      const response = await axios.get(`${apiUrl}/api/splatdle`);
      data = response.data;
    } catch (error) {
      data = { weapons: [], answer: "" };
      console.error("Failed to fetch game data:", error);
    }

    setGameData(data);

    if (savedState) {
      setGuesses(savedState.guesses);
      setGameWon(savedState.gameWon);
      if (savedState.gameWon) {
        setShowWinPopup(true);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchGameData();
  }, []);

  // Handle unknown stats (-1 values)
  const formatStat = (value: number): string => {
    if (value === -1) {
      return "?";
    }
    return value.toString();
  };

  const getComparisonClass = (
    guessValue: string | number | undefined,
    correctValue: string | number | undefined
  ) => {
    if (guessValue === -1 || correctValue === -1) {
      return "bg-slate-500";
    }

    const guessNum = Number(guessValue);
    const correctNum = Number(correctValue);
    const isNumeric = !isNaN(guessNum) && !isNaN(correctNum);

    if (isNumeric) {
      const diff = Math.abs(guessNum - correctNum);
      if (diff === 0) return "bg-emerald-500";
      if (diff <= 10) return "bg-amber-500";
      return "bg-rose-500";
    } else {
      return guessValue === correctValue ? "bg-emerald-500" : "bg-rose-500";
    }
  };

  const getArrowIcon = (
    guessValue: number | undefined,
    correctValue: number | undefined
  ) => {
    if (
      guessValue === undefined ||
      correctValue === undefined ||
      guessValue === -1 ||
      correctValue === -1
    ) {
      return "?";
    }
    if (guessValue < correctValue) return "↑";
    if (guessValue > correctValue) return "↓";
    return "✓";
  };

  const makeGuess = async () => {
    if (!selectedWeapon || !gameData || gameWon) return;

    const weapon = gameData.weapons.find((w) => w.name === selectedWeapon);
    if (!weapon) return;

    const newGuess = {
      weapon,
      isCorrect: weapon.name === gameData.answer,
    };

    const newGuesses = [...guesses, newGuess];
    setGuesses(newGuesses);
    setAnimatingGuess(newGuesses.length - 1);

    setSelectedWeapon("");
    setSearchTerm("");
    setShowDropdown(false);

    setTimeout(() => {
      setAnimatingGuess(null);
    }, 3600);

    if (newGuess.isCorrect) {
      setTimeout(() => {
        setGameWon(true);
        setShowWinPopup(true);
        saveGameState(newGuesses, true, gameData.answer);
      }, 3600);
    } else {
      saveGameState(newGuesses, false, gameData.answer);
    }
  };

  const resetGame = () => {
    return;
  };

  const correctWeapon = gameData?.weapons.find(
    (w) => w.name === gameData.answer
  );

  // Discord login handler
  const handleDiscordLogin = () => {
    window.location.href = `${apiUrl}/api/auth/discord/login`;
  };

  // Mock weapon image component
  const WeaponImage = ({ weapon, className = "" }: WeaponImageProps) => {
    const [imageError, setImageError] = useState(false);

    const getClassGradient = (weaponClass: WeaponClass) => {
      const gradients: Record<WeaponClass, string> = {
        Shooter: "from-orange-400 to-red-500",
        Charger: "from-blue-400 to-purple-500",
        Roller: "from-green-400 to-teal-500",
        Brush: "from-pink-400 to-purple-500",
        Slosher: "from-cyan-400 to-blue-500",
        Splatling: "from-yellow-400 to-orange-500",
        Dualies: "from-purple-400 to-pink-500",
        Brella: "from-gray-400 to-blue-600",
        Splatana: "from-lime-400 to-emerald-500",
        Rainmaker: "from-red-400 to-orange-500",
      };
      return gradients[weaponClass] || "from-gray-400 to-gray-600";
    };

    return (
      <div className={`relative ${className}`}>
        {!imageError ? (
          <img
            src={`/images/${weapon.image}`}
            alt={weapon.name}
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${getClassGradient(
              weapon.class
            )} rounded-lg flex items-center justify-center`}
          >
            <div className="text-center text-white">
              <Gamepad2 className="h-8 w-8 mx-auto mb-1 opacity-80" />
              <div className="text-xs font-semibold opacity-90">
                {weapon.class}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-400 mb-4"></div>
          <div className="text-white text-2xl font-bold animate-pulse">
            Loading Splatdle...
          </div>
        </div>
      </div>
    );
  }

  const FlipCard = ({
    children,
    isAnimating,
    delay = 0,
    className = "",
    shouldStayFlipped = false,
  }: FlipCardProps) => {
    const [isFlipped, setIsFlipped] = useState(shouldStayFlipped);

    useEffect(() => {
      if (isAnimating) {
        const timer = setTimeout(() => {
          setIsFlipped(true);
        }, delay);
        return () => clearTimeout(timer);
      } else if (!shouldStayFlipped) {
        setIsFlipped(false);
      }
    }, [isAnimating, delay, shouldStayFlipped]);

    useEffect(() => {
      if (shouldStayFlipped) {
        setIsFlipped(true);
      }
    }, [shouldStayFlipped]);

    return (
      <div
        className={`flip-card ${className}`}
        style={{ height: "80px", minWidth: "120px" }}
      >
        <div className={`flip-card-inner ${isFlipped ? "flipped" : ""}`}>
          <div className="flip-card-front">
            <div className="w-full h-full bg-slate-700 border border-slate-600 rounded-xl flex items-center justify-center text-slate-400">
              <Gamepad2 className="h-6 w-6" />
            </div>
          </div>
          <div className="flip-card-back">
            <div className="w-full h-full">{children}</div>
          </div>
        </div>
      </div>
    );
  };

  // Winning Popup Component
  const WinningPopup = () => {
    if (!showWinPopup) return null;

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-xl border border-emerald-500/30 rounded-3xl p-8 max-w-md w-full mx-4 relative">
          <button
            onClick={() => setShowWinPopup(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="text-center mb-6">
            <div className="text-8xl mb-4 animate-bounce">🎉</div>
            <h2 className="text-4xl font-bold text-emerald-400 mb-2">
              Booyah!
            </h2>
            <p className="text-xl text-slate-300 mb-2">
              You found{" "}
              <span className="font-bold text-emerald-400">
                {gameData?.answer}
              </span>
            </p>
            <p className="text-lg text-slate-400">
              in {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}!
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={copyToClipboard}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-lg hover:from-blue-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              {copySuccess ? (
                <>
                  <CheckCircle className="h-6 w-6" />
                  Copied to Clipboard!
                </>
              ) : (
                <>
                  <Copy className="h-6 w-6" />
                  Copy Results
                </>
              )}
            </button>

            <button
              onClick={() => window.open("https://discord.gg/sneaky", "_blank")}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold text-lg hover:from-indigo-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.210.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.010c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.120.098.246.195.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Join Discord Community
            </button>

            <button
              onClick={() =>
                window.open("https://sneakyofficial.com/splatdle", "_blank")
              }
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-bold text-lg hover:from-orange-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <ExternalLink className="h-6 w-6" />
              Visit sneakyofficial.com/splatdle
            </button>
          </div>

          <div className="text-center mt-6">
            <p className="text-sm text-slate-400">
              Next puzzle available at midnight UTC
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <style>{`
        .flip-card {
          background-color: transparent;
          perspective: 1000px;
        }

        .flip-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          text-align: center;
          transition: transform 1.2s ease-in-out;
          transform-style: preserve-3d;
        }

        .flip-card-inner.flipped {
          transform: rotateY(180deg);
        }

        .flip-card-front,
        .flip-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          text-align: center;
        }

        .flip-card-back {
          transform: rotateY(180deg);
        }
      `}</style>

      {/* Winning Popup */}
      <WinningPopup />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header with Auth */}
        <div className="flex justify-between items-start mb-8">
          <div className="text-center flex-1">
            <div className="inline-flex items-center gap-4 mb-6">
              <div className="text-6xl">🦑</div>
              <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 drop-shadow-2xl">
                SPLATDLE
              </h1>
              <div className="text-6xl">🐙</div>
            </div>
            <div className="space-y-2">
              <p className="text-xl text-slate-300 font-medium">
                Guess the Splatoon weapon with unlimited tries!
              </p>
              <div className="flex items-center justify-center gap-6 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                  <span>Correct</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-amber-500 rounded"></div>
                  <span>Close (±10)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-rose-500 rounded"></div>
                  <span>Wrong</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-slate-500 rounded"></div>
                  <span>Unknown</span>
                </div>
              </div>
            </div>
          </div>

          {/* Auth Section */}
          <div className="flex items-center gap-4">
            {loggedIn && userData ? (
              <div className="flex items-center gap-3 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2">
                <img
                  src={userData.avatarUrl}
                  alt={userData.profileName}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-white font-medium">
                  {userData.profileName}
                </span>
                <button
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleDiscordLogin}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-3 rounded-xl font-bold hover:from-indigo-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.210.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.010c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.120.098.246.195.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                </svg>
                Login with Discord
              </button>
            )}
          </div>
        </div>

        {/* Game Won Message */}
        {gameWon && (
          <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-8 mb-8 text-center">
            <div className="text-8xl mb-4 animate-bounce">🎉</div>
            <h2 className="text-4xl font-bold text-emerald-400 mb-3">
              Booyah!
            </h2>
            <p className="text-xl text-slate-300 mb-6">
              You found the weapon in {guesses.length}{" "}
              {guesses.length === 1 ? "guess" : "guesses"}!
            </p>
            <button
              onClick={() => setShowWinPopup(true)}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-lg hover:from-emerald-600 hover:to-teal-600 transform hover:scale-105 transition-all duration-200 shadow-lg mr-4"
            >
              <Trophy className="h-6 w-6" />
              View Results
            </button>
            <button
              onClick={resetGame}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-slate-500 to-slate-600 text-white rounded-xl font-bold text-lg hover:from-slate-600 hover:to-slate-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <RotateCcw className="h-6 w-6" />
              Play Again Tomorrow
            </button>
          </div>
        )}

        {/* Game Input */}
        {!gameWon && (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 mb-8 relative z-50">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <div className="relative">
                  <Search className="absolute left-4 top-4 h-6 w-6 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search for a weapon..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 text-lg"
                  />
                </div>

                {showDropdown && searchTerm && filteredWeapons.length > 0 && (
                  <div className="absolute z-50 w-full mt-2 bg-slate-800/95 backdrop-blur-xl border border-slate-600 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                    {filteredWeapons.map((weapon) => (
                      <button
                        key={weapon.name}
                        onClick={() => {
                          setSelectedWeapon(weapon.name);
                          setSearchTerm(weapon.name);
                          setShowDropdown(false);
                        }}
                        className="w-full text-left px-6 py-4 hover:bg-slate-700/50 border-b border-slate-700 last:border-b-0 transition-colors duration-150 flex items-center gap-4"
                      >
                        <WeaponImage
                          weapon={weapon}
                          className="w-12 h-12 flex-shrink-0"
                        />
                        <div>
                          <div className="font-bold text-white text-lg">
                            {getDisplayName(weapon)}
                          </div>
                          <div className="text-slate-400 text-sm">
                            {weapon.class}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={makeGuess}
                disabled={!selectedWeapon}
                className="px-8 py-4 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-bold text-lg hover:from-orange-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200 shadow-lg disabled:transform-none"
              >
                Guess!
              </button>
            </div>
          </div>
        )}

        {/* Already Won Today Message */}
        {gameWon && !loading && (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-emerald-500/50 rounded-2xl p-8 mb-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-emerald-400 mb-3">
              You already completed today's Splatdle!
            </h2>
            <p className="text-lg text-slate-300 mb-4">
              You found{" "}
              <span className="font-bold text-emerald-400">
                {gameData?.answer}
              </span>{" "}
              in {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}!
            </p>
            <div className="text-sm text-slate-400">
              Next puzzle available at midnight UTC
            </div>
          </div>
        )}

        {/* Guess Headers */}
        {guesses.length > 0 && (
          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/30 rounded-2xl p-6 mb-6">
            <div className="grid grid-cols-9 gap-3 text-center text-sm font-bold text-slate-300">
              <div className="flex items-center justify-center gap-1">
                <Image className="h-4 w-4" />
                <span>Image</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Target className="h-4 w-4" />
                <span>Name</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Gamepad2 className="h-4 w-4" />
                <span>Class</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Zap className="h-4 w-4" />
                <span>Fire Rate</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Target className="h-4 w-4" />
                <span>Range</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Star className="h-4 w-4" />
                <span>Damage</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Weight className="h-4 w-4" />
                <span>Weight</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Bomb className="h-4 w-4" />
                <span>Sub</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Star className="h-4 w-4" />
                <span>Special</span>
              </div>
            </div>
          </div>
        )}

        {/* Guesses */}
        <div className="space-y-4">
          {guesses.map((guess, index) => (
            <div
              key={index}
              className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/30 rounded-2xl p-4"
            >
              <div className="grid grid-cols-9 gap-3 text-center text-sm font-medium items-center">
                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={0}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div className="w-full h-full bg-slate-600 rounded-xl flex items-center justify-center p-2">
                    <WeaponImage
                      weapon={guess.weapon}
                      className="w-full h-full"
                    />
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={200}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.name,
                      correctWeapon?.name
                    )} text-white rounded-xl h-full w-full flex items-center justify-center font-bold text-xs px-2`}
                  >
                    <div className="truncate">
                      {getDisplayName(guess.weapon)}
                    </div>
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={400}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.class,
                      correctWeapon?.class
                    )} text-white rounded-xl h-full w-full flex items-center justify-center font-semibold text-xs px-2`}
                  >
                    {guess.weapon.class}
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={600}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.firerate,
                      correctWeapon?.firerate
                    )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-bold px-2`}
                  >
                    <div className="text-lg">
                      {formatStat(guess.weapon.firerate)}
                    </div>
                    <div className="text-xs opacity-75">
                      {getArrowIcon(
                        guess.weapon.firerate,
                        correctWeapon?.firerate
                      )}
                    </div>
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={800}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.range,
                      correctWeapon?.range
                    )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-bold px-2`}
                  >
                    <div className="text-lg">
                      {formatStat(guess.weapon.range)}
                    </div>
                    <div className="text-xs opacity-75">
                      {getArrowIcon(guess.weapon.range, correctWeapon?.range)}
                    </div>
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={1000}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.damage,
                      correctWeapon?.damage
                    )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-bold px-2`}
                  >
                    <div className="text-lg">
                      {formatStat(guess.weapon.damage)}
                    </div>
                    <div className="text-xs opacity-75">
                      {getArrowIcon(guess.weapon.damage, correctWeapon?.damage)}
                    </div>
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={1200}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.weight,
                      correctWeapon?.weight
                    )} text-white rounded-xl h-full w-full flex items-center justify-center font-semibold text-xs px-2`}
                  >
                    {guess.weapon.weight}
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={1400}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.sub,
                      correctWeapon?.sub
                    )} text-white rounded-xl h-full w-full flex items-center justify-center font-semibold text-xs px-1`}
                  >
                    <div className="truncate">{guess.weapon.sub}</div>
                  </div>
                </FlipCard>

                <FlipCard
                  isAnimating={animatingGuess === index}
                  delay={1600}
                  shouldStayFlipped={animatingGuess !== index}
                >
                  <div
                    className={`${getComparisonClass(
                      guess.weapon.special,
                      correctWeapon?.special
                    )} text-white rounded-xl h-full w-full flex items-center justify-center font-semibold text-xs px-1`}
                  >
                    <div className="truncate">{guess.weapon.special}</div>
                  </div>
                </FlipCard>
              </div>
            </div>
          ))}
        </div>

        {/* Attempts Counter */}
        {guesses.length > 0 && (
          <div className="text-center mt-8">
            <div className="inline-flex items-center gap-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl px-6 py-3">
              <Target className="h-5 w-5 text-orange-400" />
              <span className="text-slate-300 text-lg font-semibold">
                Attempts: {guesses.length}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Splatdle;
