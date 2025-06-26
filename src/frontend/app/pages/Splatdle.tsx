import React, { useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import axios from "axios";
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

const apiUrl = "https://www.sneakyofficial.com";

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

interface SavedGameState {
  guesses: Guess[];
  gameWon: boolean;
  answer: string;
  statsPosted?: boolean;
  completedAt: string;
  hintsUsed?: {
    releaseDate: boolean;
    baseDamage: boolean;
  };
}

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
      if (isMounted.current) {
        await fetchAuthStatus();
      }
      return data.access_token;
    } catch (error) {
      console.error("Error refreshing token:", error);
      if (isMounted.current) {
        setLoggedIn(false);
        setUserData(null);
        setIsLoading(false);
      }
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
    try {
      await fetch(`${apiUrl}/api/auth/discord/logout`, {
        method: "POST",
        credentials: "include",
      });
      window.location.reload();
    } catch (error) {
      console.error("Error logging out:", error);
      window.location.reload();
    }
  };
  return { logout };
}

const Splatdle = () => {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [gameWon, setGameWon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [animatingGuess, setAnimatingGuess] = useState<number | null>(null);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [statsPosted, setStatsPosted] = useState(false);
  const [hintsUsed, setHintsUsed] = useState({
    releaseDate: false,
    baseDamage: false,
  });

  const { loggedIn, userData, isLoading: authLoading } = useAuth();
  const { logout } = useLogout();

  // Helper function to get the correct weapon object
  const getCorrectWeapon = (): Weapon | undefined => {
    if (!gameData) return undefined;
    
    // Parse the answer to extract name and game
    const answerParts = gameData.answer.split(" (");
    const weaponName = answerParts[0];
    let weaponGame = "";
    
    if (answerParts.length > 1) {
      weaponGame = answerParts[1].replace(")", "");
    }
    
    // Find the weapon that matches both name and game
    return gameData.weapons.find(weapon => {
      if (weaponGame) {
        return weapon.name === weaponName && weapon.game === weaponGame;
      } else {
        return weapon.name === weaponName;
      }
    });
  };

  // Check if guess is correct (must match both name and game)
  const isCorrectGuess = (weapon: Weapon): boolean => {
    if (!gameData) return false;
    const correctWeapon = getCorrectWeapon();
    return correctWeapon ? 
      weapon.name === correctWeapon.name && weapon.game === correctWeapon.game : 
      false;
  };

  // Get today's date string for cache key
  const getTodayKey = () => {
    const today = new Date();
    const utcDate = new Date(today.getTime() + today.getTimezoneOffset() * 60000);
    return `splatdle_${utcDate.getFullYear()}_${utcDate.getMonth()}_${utcDate.getDate()}`;
  };

  // Load game state from localStorage
  const loadGameState = () => {
    const todayKey = getTodayKey();
    try {
      const savedStateKey = `gameState_${todayKey}`;
      const savedState = localStorage.getItem(savedStateKey);
      if (savedState) {
        return JSON.parse(savedState);
      }
    } catch (error) {
      console.error("Error loading game state:", error);
    }
    return null;
  };

  // Save game state to localStorage
  const saveGameState = (
    guesses: Guess[],
    gameWon: boolean,
    answer: string,
    statsPosted: boolean = false,
    hintsUsed = { releaseDate: false, baseDamage: false }
  ) => {
    const todayKey = getTodayKey();
    const gameState: SavedGameState = {
      guesses,
      gameWon,
      answer,
      statsPosted,
      hintsUsed,
      completedAt: new Date().toISOString(),
    };

    try {
      const savedStateKey = `gameState_${todayKey}`;
      localStorage.setItem(savedStateKey, JSON.stringify(gameState));
    } catch (error) {
      console.error("Error saving game state:", error);
    }
  };

  // Post stats to server
  const postStats = async (guessCount: number) => {
    if (!loggedIn || !userData || statsPosted) return;

    try {
      const response = await fetch(`${apiUrl}/api/splatdle/stats`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guess_count: guessCount,
        }),
      });

      if (response.ok) {
        setStatsPosted(true);
        saveGameState(guesses, gameWon, gameData?.answer || "", true, hintsUsed);
      }
    } catch (error) {
      console.error("Error posting stats:", error);
    }
  };

  // Search weapons with comprehensive matching
  const searchWeapons = (query: string, weapons: Weapon[]) => {
    if (!query.trim()) return [];

    const normalizedQuery = query.toLowerCase().trim();
    
    return weapons
      .filter(weapon => 
        !guesses.some(guess => 
          guess.weapon.name === weapon.name && guess.weapon.game === weapon.game
        )
      )
      .filter(weapon => {
        const name = weapon.name.toLowerCase();
        const className = weapon.class.toLowerCase();
        const gameName = weapon.game.toLowerCase();
        
        return name.includes(normalizedQuery) || 
               className.includes(normalizedQuery) || 
               gameName.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        
        // Exact matches first
        if (aName === normalizedQuery && bName !== normalizedQuery) return -1;
        if (bName === normalizedQuery && aName !== normalizedQuery) return 1;
        
        // Starts with query
        if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) return -1;
        if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery)) return 1;
        
        // Alphabetical
        return aName.localeCompare(bName);
      });
  };

  // Check if there are duplicate weapon names
  const hasDuplicateNames = (weapons: Weapon[]) => {
    const nameCount = new Map<string, number>();
    weapons.forEach(weapon => {
      nameCount.set(weapon.name, (nameCount.get(weapon.name) || 0) + 1);
    });
    return Array.from(nameCount.values()).some(count => count > 1);
  };

  // Get display name with game info if needed
  const getDisplayName = (weapon: Weapon) => {
    if (!gameData) return weapon.name;
    const showGame = hasDuplicateNames(gameData.weapons);
    return showGame ? `${weapon.name} (${weapon.game})` : weapon.name;
  };

  // Get filtered weapons for search dropdown
  const filteredWeapons = searchWeapons(searchTerm, gameData?.weapons || []).slice(0, 8);

  // Generate share text for results
  const generateShareText = () => {
    const guessCount = guesses.length;
    const correctWeapon = getCorrectWeapon();

    if (!correctWeapon) {
      return "🦑 SPLATDLE 🐙\nError generating results - please contact sneaky!\n\nPlay at: https://sneakyofficial.com/splatdle";
    }

    const emojis = guesses
      .slice().reverse()
      .map(guess => {
        const results = [
          guess.weapon.name == correctWeapon.name && guess.weapon.game == guess.weapon.game ? "🟢" : "🔴",
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
          guess.weapon.game === correctWeapon.game ? "🟢" : "🔴",
        ];
        return results.join("");
      })
      .join("\n");

    return `🦑 SPLATDLE 🐙\nGuessed in ${guessCount} ${
      guessCount === 1 ? "try" : "tries"
    }!\n\n${emojis}\n\nPlay at: https://www.sneakyofficial.com/splatdle`;
  };

  // Copy results to clipboard
  const copyToClipboard = async () => {
    try {
      const shareText = generateShareText();
      await navigator.clipboard.writeText(shareText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
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

  const fetchGameData = async () => {
    setLoading(true);
    const savedState = loadGameState();
    let data: GameData;

    try {
      const response = await axios.get("https://www.sneakyofficial.com/api/splatdle");
      data = response.data;
    } catch (error) {
      data = { weapons: [], answer: "" };
      console.error("Failed to fetch game data:", error);
    }

    setGameData(data);

    if (savedState) {
      setGuesses(savedState.guesses);
      setGameWon(savedState.gameWon);
      setStatsPosted(savedState.statsPosted || false);
      setHintsUsed(savedState.hintsUsed || { releaseDate: false, baseDamage: false });
      if (savedState.gameWon) {
        setShowWinPopup(true);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchGameData();
  }, []);

  useEffect(() => {
    if (loggedIn && gameWon && !statsPosted && guesses.length > 0) {
      postStats(guesses.length);
    }
  }, [loggedIn, gameWon, statsPosted, guesses.length]);

  // Format stat values
  const formatStat = (value: number): string => {
    return value === -1 ? "?" : value.toString();
  };

  // Get comparison class for styling
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

  // Get arrow icon for numeric comparisons
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

  // Reveal hint
  const revealHint = (hintType: "releaseDate" | "baseDamage") => {
    const newHintsUsed = { ...hintsUsed, [hintType]: true };
    setHintsUsed(newHintsUsed);
    saveGameState(guesses, gameWon, gameData?.answer || "", statsPosted, newHintsUsed);
  };

  const canUseReleaseHint = guesses.length >= 8 && !hintsUsed.releaseDate;
  const canUseDamageHint = guesses.length >= 16 && !hintsUsed.baseDamage;

  // Make a guess
  const makeGuess = async () => {
    if (!selectedWeapon || !gameData || gameWon) return;

    const newGuess = {
      weapon: selectedWeapon,
      isCorrect: isCorrectGuess(selectedWeapon),
    };

    const newGuesses = [newGuess, ...guesses,];
    setGuesses(newGuesses);
    setAnimatingGuess(0);

    setSelectedWeapon(null);
    setSearchTerm("");
    setShowDropdown(false);

    setTimeout(() => {
      setAnimatingGuess(null);
    }, 3600);

    if (newGuess.isCorrect) {
      setTimeout(async () => {
        setGameWon(true);
        setShowWinPopup(true);
        saveGameState(newGuesses, true, gameData.answer, false, hintsUsed);

        if (loggedIn && !statsPosted) {
          await postStats(newGuesses.length);
        }
      }, 3600);
    } else {
      saveGameState(newGuesses, false, gameData.answer, false, hintsUsed);
    }
  };

  const correctWeapon = getCorrectWeapon();

  // Discord login handler
  const handleDiscordLogin = () => {
    window.open(`${apiUrl}/api/auth/discord/login`, "_blank");
  };

  // Tooltip Component to make things less confusing lol
  const Tooltip = ({ children, content }: { children: React.ReactNode; content: string }) => {
    return (
      <div className="relative group">
        {children}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
        </div>
      </div>
    );
  };

  // Weapon Image Component
  const WeaponImage = ({ weapon, className = "" }: { weapon: Weapon; className?: string }) => {
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
              <Gamepad2 className="h-4 w-4 sm:h-6 md:h-8 mx-auto mb-1 opacity-80" />
              <div className="text-xs font-semibold opacity-90">
                {weapon.class}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Flip Card Component
  const FlipCard = ({ 
    children, 
    isAnimating, 
    delay = 0, 
    className = "", 
    shouldStayFlipped = false 
  }: {
    children: React.ReactNode;
    isAnimating: boolean;
    delay?: number;
    className?: string;
    shouldStayFlipped?: boolean;
  }) => {
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
        style={{
          height: window.innerWidth < 768 ? "60px" : "80px",
          minWidth: window.innerWidth < 768 ? "60px" : "120px",
        }}
      >
        <div className={`flip-card-inner ${isFlipped ? "flipped" : ""}`}>
          <div className="flip-card-front">
            <div className="w-full h-full bg-slate-700 border border-slate-600 rounded-xl flex items-center justify-center text-slate-400">
              <Gamepad2 className="h-4 w-4 sm:h-6 sm:w-6" />
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
        <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 backdrop-blur-xl border border-emerald-500/30 rounded-3xl p-4 sm:p-8 max-w-md w-full mx-4 relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={() => setShowWinPopup(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="text-center mb-6">
            <div className="text-6xl sm:text-8xl mb-4 animate-bounce">🎉</div>
            <h2 className="text-2xl sm:text-4xl font-bold text-emerald-400 mb-2">
              Booyah!
            </h2>
            <p className="text-lg sm:text-xl text-slate-300 mb-2">
              You found{" "}
              <span className="font-bold text-emerald-400">
                {gameData?.answer}
              </span>
            </p>
            <p className="text-base sm:text-lg text-slate-400">
              in {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}!
            </p>

            {loggedIn && statsPosted && (
              <p className="text-sm text-emerald-400 mt-2">
                ✅ Stats posted to leaderboard!
              </p>
            )}
            {loggedIn && !statsPosted && (
              <p className="text-sm text-amber-400 mt-2">
                ⏳ Posting stats to leaderboard...
              </p>
            )}
            {!loggedIn && (
              <p className="text-sm text-slate-400 mt-2">
                Login with Discord to save your stats!
              </p>
            )}
          </div>

          <div className="space-y-3 sm:space-y-4">
            <button
              onClick={copyToClipboard}
              className="w-full flex items-center justify-center gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-base sm:text-lg hover:from-blue-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              {copySuccess ? (
                <>
                  <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                  Copied to Clipboard!
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5 sm:h-6 sm:w-6" />
                  Copy Results
                </>
              )}
            </button>

            {!loggedIn && (
              <button
                onClick={handleDiscordLogin}
                className="w-full flex items-center justify-center gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold text-base sm:text-lg hover:from-indigo-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
              >
                <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.210.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.010c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.120.098.246.195.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                </svg>
                Login & Save Stats
              </button>
            )}

            <button
              onClick={() => window.open("https://discord.gg/gmJeQefe5X", "_blank")}
              className="w-full flex items-center justify-center gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold text-base sm:text-lg hover:from-indigo-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.210.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.010c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.120.098.246.195.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Join Discord Community
            </button>

            <button
              onClick={() => window.open("https://www.sneakyofficial.com/", "_blank")}
              className="w-full flex items-center justify-center gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-bold text-base sm:text-lg hover:from-orange-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <ExternalLink className="h-5 w-5 sm:h-6 sm:w-6" />
              Visit sneakyofficial.com
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

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-32 sm:w-32 border-b-2 border-orange-400 mb-4"></div>
          <div className="text-white text-xl sm:text-2xl font-bold animate-pulse">
            Loading Splatdle...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
      {/* Fixed Background Image */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
          style={{
            backgroundImage: "url(/background.jpg)",
            filter: "blur(1px) brightness(0.7)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-purple-900/40 to-slate-900/60" />
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* CSS for flip animations */}
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
            padding: 4px 8px;
            text-align: center;
          }

          .flip-card-back {
            transform: rotateY(180deg);
          }

          @media (max-width: 768px) {
            .flip-card-front,
            .flip-card-back {
              padding: 2px 4px;
            }
          }
        `}</style>

        <WinningPopup />

        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
          {/* Header with Auth - FIXED LAYOUT */}
          <div className="flex flex-col gap-4 mb-6 sm:mb-8">
            {/* Auth Section - Now at top on mobile */}
            <div className="flex justify-end">
              {loggedIn && userData ? (
                <div className="flex items-center gap-2 sm:gap-3 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl px-3 sm:px-4 py-2">
                  <img
                    src={userData.avatarUrl}
                    alt={userData.profileName}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full"
                  />
                  <span className="text-white font-medium text-sm sm:text-base max-w-20 sm:max-w-32 truncate">
                    {userData.profileName}
                  </span>
                  <button
                    onClick={logout}
                    className="p-1 sm:p-2 text-slate-400 hover:text-white transition-colors"
                    title="Logout"
                  >
                    <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDiscordLogin}
                  className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold text-sm sm:text-base hover:from-indigo-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
                >
                  <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.210.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.010c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.120.098.246.195.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                  </svg>
                  <span className="hidden sm:inline">Login with Discord</span>
                  <span className="sm:hidden">Login</span>
                </button>
              )}
            </div>

            {/* Centered Title */}
            <div className="text-center">
              <div className="inline-flex items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
                <div className="text-3xl sm:text-6xl">🦑</div>
                <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 drop-shadow-2xl">
                  SPLATDLE
                </h1>
                <div className="text-3xl sm:text-6xl">🐙</div>
              </div>
              <div className="space-y-2">
                <p className="text-base sm:text-xl text-slate-300 font-medium px-4">
                  Guess the Splatoon weapon with unlimited tries!
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm text-slate-400 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 rounded" />
                    <span>Correct</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-amber-500 rounded" />
                    <span>Close (±10)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-rose-500 rounded" />
                    <span>Wrong</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-slate-500 rounded" />
                    <span>Unknown</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Game Won Message */}
          {gameWon && (
            <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-4 sm:p-8 mb-6 sm:mb-8 text-center">
              <div className="text-6xl sm:text-8xl mb-4 animate-bounce">🎉</div>
              <h2 className="text-2xl sm:text-4xl font-bold text-emerald-400 mb-3">
                Booyah!
              </h2>
              <p className="text-lg sm:text-xl text-slate-300 mb-6">
                You found the weapon in {guesses.length}{" "}
                {guesses.length === 1 ? "guess" : "guesses"}!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <button
                  onClick={() => setShowWinPopup(true)}
                  className="inline-flex items-center justify-center gap-3 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-base sm:text-lg hover:from-emerald-600 hover:to-teal-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
                >
                  <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
                  View Results
                </button>
                <button
                  onClick={() => {}}
                  className="inline-flex items-center justify-center gap-3 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-slate-500 to-slate-600 text-white rounded-xl font-bold text-base sm:text-lg hover:from-slate-600 hover:to-slate-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
                >
                  <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="hidden sm:inline">Play Again Tomorrow</span>
                  <span className="sm:hidden">Tomorrow</span>
                </button>
              </div>
            </div>
          )}

          {/* Hints Section */}
          {!gameWon &&
            (canUseReleaseHint ||
              canUseDamageHint ||
              hintsUsed.releaseDate ||
              hintsUsed.baseDamage) && (
              <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-xl sm:text-2xl font-bold text-purple-400 mb-2">
                    💡 Hints
                  </h3>
                  <p className="text-slate-300 text-sm sm:text-base">
                    Need some help? Use these hints to narrow down your guess!
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Release Date Hint */}
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-xl sm:text-2xl">📅</div>
                      <div>
                        <h4 className="font-bold text-white text-sm sm:text-base">
                          Release Date
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-400">
                          Available after 8 guesses
                        </p>
                      </div>
                    </div>

                    {hintsUsed.releaseDate ? (
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3">
                        <p className="text-emerald-400 font-semibold text-sm sm:text-base">
                          Released: {correctWeapon?.hint_released || "Unknown"}
                        </p>
                      </div>
                    ) : canUseReleaseHint ? (
                      <button
                        onClick={() => revealHint("releaseDate")}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-200 text-sm sm:text-base"
                      >
                        Reveal Release Date
                      </button>
                    ) : (
                      <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                        <p className="text-slate-400 text-xs sm:text-sm">
                          {guesses.length < 8
                            ? `${8 - guesses.length} more guesses needed`
                            : "Hint used"}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Base Damage Hint */}
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-xl sm:text-2xl">⚔️</div>
                      <div>
                        <h4 className="font-bold text-white text-sm sm:text-base">
                          Base Damage
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-400">
                          Available after 16 guesses
                        </p>
                      </div>
                    </div>

                    {hintsUsed.baseDamage ? (
                      <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3">
                        <p className="text-emerald-400 font-semibold text-sm sm:text-base">
                          Base Damage: {correctWeapon?.hint_base_damage || "Unknown"}
                        </p>
                      </div>
                    ) : canUseDamageHint ? (
                      <button
                        onClick={() => revealHint("baseDamage")}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-200 text-sm sm:text-base"
                      >
                        Reveal Base Damage
                      </button>
                    ) : (
                      <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                        <p className="text-slate-400 text-xs sm:text-sm">
                          {guesses.length < 16
                            ? `${16 - guesses.length} more guesses needed`
                            : "Hint used"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Game Input */}
          {!gameWon && (
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 sm:p-8 mb-6 sm:mb-8 relative z-50">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <div className="relative">
                    <Search className="absolute left-3 sm:left-4 top-3 sm:top-4 h-5 w-5 sm:h-6 sm:w-6 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search for a weapon..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowDropdown(true);
                        setSelectedWeapon(null);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 text-base sm:text-lg"
                    />
                  </div>

                  {showDropdown && searchTerm && filteredWeapons.length > 0 && (
                    <div className="absolute z-50 w-full mt-2 bg-slate-800/95 backdrop-blur-xl border border-slate-600 rounded-xl shadow-2xl max-h-60 sm:max-h-80 overflow-y-auto">
                      {filteredWeapons.map((weapon) => (
                        <button
                          key={`${weapon.name}-${weapon.game}`}
                          onClick={() => {
                            setSelectedWeapon(weapon);
                            setSearchTerm(getDisplayName(weapon));
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-4 sm:px-6 py-3 sm:py-4 hover:bg-slate-700/50 border-b border-slate-700 last:border-b-0 transition-colors duration-150 flex items-center gap-3 sm:gap-4"
                        >
                          <WeaponImage
                            weapon={weapon}
                            className="w-8 h-8 sm:w-12 sm:h-12 flex-shrink-0"
                          />
                          <div>
                            <div className="font-bold text-white text-sm sm:text-lg">
                              {getDisplayName(weapon)}
                            </div>
                            <div className="text-slate-400 text-xs sm:text-sm">
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
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-bold text-base sm:text-lg hover:from-orange-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200 shadow-lg disabled:transform-none"
                >
                  Guess!
                </button>
              </div>
            </div>
          )}

          {/* Guess Headers - Desktop */}
          {guesses.length > 0 && (
            <div className="hidden lg:block bg-slate-800/30 backdrop-blur-xl border border-slate-700/30 rounded-2xl p-6 mb-6">
              <div className="grid grid-cols-10 gap-3 text-center text-sm font-bold text-slate-300">
                <Tooltip content="Weapon Image">
                  <div className="flex items-center justify-center gap-1">
                    <Image className="h-4 w-4" />
                    <span>Image</span>
                  </div>
                </Tooltip>
                <Tooltip content="Weapon Name">
                  <div className="flex items-center justify-center gap-1">
                    <Target className="h-4 w-4" />
                    <span>Name</span>
                  </div>
                </Tooltip>
                <Tooltip content="Weapon Class/Type">
                  <div className="flex items-center justify-center gap-1">
                    <Gamepad2 className="h-4 w-4" />
                    <span>Class</span>
                  </div>
                </Tooltip>
                <Tooltip content="Rate of Fire (shots per second)">
                  <div className="flex items-center justify-center gap-1">
                    <Zap className="h-4 w-4" />
                    <span>Fire Rate</span>
                  </div>
                </Tooltip>
                <Tooltip content="Maximum effective range">
                  <div className="flex items-center justify-center gap-1">
                    <Target className="h-4 w-4" />
                    <span>Range</span>
                  </div>
                </Tooltip>
                <Tooltip content="Damage per shot">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="h-4 w-4" />
                    <span>Damage</span>
                  </div>
                </Tooltip>
                <Tooltip content="Movement speed class">
                  <div className="flex items-center justify-center gap-1">
                    <Weight className="h-4 w-4" />
                    <span>Weight</span>
                  </div>
                </Tooltip>
                <Tooltip content="Sub weapon type">
                  <div className="flex items-center justify-center gap-1">
                    <Bomb className="h-4 w-4" />
                    <span>Sub</span>
                  </div>
                </Tooltip>
                <Tooltip content="Special weapon type">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="h-4 w-4" />
                    <span>Special</span>
                  </div>
                </Tooltip>
                <Tooltip content="Which Splatoon game">
                  <div className="flex items-center justify-center gap-1">
                    <Gamepad2 className="h-4 w-4" />
                    <span>Game</span>
                  </div>
                </Tooltip>
              </div>
            </div>
          )}

          {/* Mobile Headers */}
          {guesses.length > 0 && (
            <div className="lg:hidden bg-slate-800/30 backdrop-blur-xl border border-slate-700/30 rounded-2xl p-3 mb-4">
              <div className="grid grid-cols-5 gap-1 text-center text-xs font-bold text-slate-300">
                <div className="flex flex-col items-center justify-center gap-1">
                  <Image className="h-3 w-3" />
                  <span>Img</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <Target className="h-3 w-3" />
                  <span>Name</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <Gamepad2 className="h-3 w-3" />
                  <span>Class</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <Zap className="h-3 w-3" />
                  <span>Stats</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <Star className="h-3 w-3" />
                  <span>Game</span>
                </div>
              </div>
              
              {/* Mobile Legend */}
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <div className="text-xs text-slate-400 mb-2 font-semibold">Stats Legend:</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    <span className="font-medium">FR:</span> Fire Rate
                  </div>
                  <div>
                    <span className="font-medium">RG:</span> Range
                  </div>
                  <div>
                    <span className="font-medium">DMG:</span> Damage
                  </div>
                  <div>
                    <span className="font-medium">Weight:</span> Movement Speed
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-700/30">
                  <div className="text-xs text-slate-400 mb-1 font-semibold">Game Codes:</div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                    <span><span className="font-medium">S1:</span> Splatoon</span>
                    <span><span className="font-medium">S2:</span> Splatoon 2</span>
                    <span><span className="font-medium">S3:</span> Splatoon 3</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Guesses */}
          <div className="space-y-4">
            {guesses.map((guess, index) => (
              <div
                key={index}
                className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/30 rounded-2xl p-2 sm:p-4"
              >
                {/* Desktop Layout */}
                <div className="hidden lg:grid grid-cols-10 gap-3 text-center text-sm font-medium items-center">
                  <FlipCard
                    isAnimating={animatingGuess === index}
                    delay={0}
                    shouldStayFlipped={animatingGuess !== index}
                  >
                    <div className="w-full h-full bg-slate-600 rounded-xl flex items-center justify-center p-2">
                      <WeaponImage weapon={guess.weapon} className="w-full h-full" />
                    </div>
                  </FlipCard>

                  <FlipCard
                    isAnimating={animatingGuess === index}
                    delay={200}
                    shouldStayFlipped={animatingGuess !== index}
                  >
                    <div
                      className={`${getComparisonClass(
                        isCorrectGuess(guess.weapon) ? correctWeapon?.name : guess.weapon.name,
                        correctWeapon?.name
                      )} text-white rounded-xl h-full w-full flex items-center justify-center font-bold text-xs px-2`}
                    >
                      <div className="truncate">{getDisplayName(guess.weapon)}</div>
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
                      <div className="text-lg">{formatStat(guess.weapon.firerate)}</div>
                      <div className="text-xs opacity-75">
                        {getArrowIcon(guess.weapon.firerate, correctWeapon?.firerate)}
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
                      <div className="text-lg">{formatStat(guess.weapon.range)}</div>
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
                      <div className="text-lg">{formatStat(guess.weapon.damage)}</div>
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

                  <FlipCard
                    isAnimating={animatingGuess === index}
                    delay={1800}
                    shouldStayFlipped={animatingGuess !== index}
                  >
                    <div
                      className={`${getComparisonClass(
                        guess.weapon.game,
                        correctWeapon?.game
                      )} text-white rounded-xl h-full w-full flex items-center justify-center font-semibold text-xs px-2`}
                    >
                      {guess.weapon.game}
                    </div>
                  </FlipCard>
                </div>

                {/* Mobile Layout */}
                <div className="lg:hidden">
                  {/* First Row - Image, Name, Class */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <FlipCard
                      isAnimating={animatingGuess === index}
                      delay={0}
                      shouldStayFlipped={animatingGuess !== index}
                    >
                      <div className="w-full h-full bg-slate-600 rounded-xl flex items-center justify-center p-1">
                        <WeaponImage weapon={guess.weapon} className="w-full h-full" />
                      </div>
                    </FlipCard>

                    <FlipCard
                      isAnimating={animatingGuess === index}
                      delay={200}
                      shouldStayFlipped={animatingGuess !== index}
                    >
                      <div
                        className={`${getComparisonClass(
                          isCorrectGuess(guess.weapon) ? correctWeapon?.name : guess.weapon.name,
                          correctWeapon?.name
                        )} text-white rounded-xl h-full w-full flex items-center justify-center font-bold text-xs px-1`}
                      >
                        <div className="truncate text-center">
                          {guess.weapon.name.length > 10
                            ? guess.weapon.name.substring(0, 10) + "..."
                            : guess.weapon.name}
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
                        )} text-white rounded-xl h-full w-full flex items-center justify-center font-semibold text-xs px-1`}
                      >
                        {guess.weapon.class}
                      </div>
                    </FlipCard>
                  </div>

                  {/* Second Row - Stats */}
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    <FlipCard
                      isAnimating={animatingGuess === index}
                      delay={600}
                      shouldStayFlipped={animatingGuess !== index}
                    >
                      <div
                        className={`${getComparisonClass(
                          guess.weapon.firerate,
                          correctWeapon?.firerate
                        )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-bold px-1`}
                      >
                        <div className="text-xs">FR</div>
                        <div className="text-sm">{formatStat(guess.weapon.firerate)}</div>
                        <div className="text-xs opacity-75">
                          {getArrowIcon(guess.weapon.firerate, correctWeapon?.firerate)}
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
                        )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-bold px-1`}
                      >
                        <div className="text-xs">RG</div>
                        <div className="text-sm">{formatStat(guess.weapon.range)}</div>
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
                        )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-bold px-1`}
                      >
                        <div className="text-xs">DMG</div>
                        <div className="text-sm">{formatStat(guess.weapon.damage)}</div>
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
                        )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-semibold text-xs px-1`}
                      >
                        <div className="text-xs opacity-75">Weight</div>
                        <div className="text-xs text-center leading-tight">
                          {guess.weapon.weight}
                        </div>
                      </div>
                    </FlipCard>

                    <FlipCard
                      isAnimating={animatingGuess === index}
                      delay={1800}
                      shouldStayFlipped={animatingGuess !== index}
                    >
                      <div
                        className={`${getComparisonClass(
                          guess.weapon.game,
                          correctWeapon?.game
                        )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-semibold text-xs px-1`}
                      >
                        <div className="text-xs opacity-75">Game</div>
                        <div className="text-xs">
                          {guess.weapon.game === "Splatoon"
                            ? "S1"
                            : guess.weapon.game === "Splatoon 2"
                            ? "S2"
                            : "S3"}
                        </div>
                      </div>
                    </FlipCard>
                  </div>

                  {/* Third Row - Sub and Special */}
                  <div className="grid grid-cols-2 gap-2">
                    <FlipCard
                      isAnimating={animatingGuess === index}
                      delay={1400}
                      shouldStayFlipped={animatingGuess !== index}
                    >
                      <div
                        className={`${getComparisonClass(
                          guess.weapon.sub,
                          correctWeapon?.sub
                        )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-semibold text-xs px-1`}
                      >
                        <div className="text-xs opacity-75 mb-1">SUB</div>
                        <div className="truncate text-center">
                          {guess.weapon.sub.length > 12
                            ? guess.weapon.sub.substring(0, 12) + "..."
                            : guess.weapon.sub}
                        </div>
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
                        )} text-white rounded-xl h-full w-full flex flex-col items-center justify-center font-semibold text-xs px-1`}
                      >
                        <div className="text-xs opacity-75 mb-1">SPECIAL</div>
                        <div className="truncate text-center">
                          {guess.weapon.special.length > 12
                            ? guess.weapon.special.substring(0, 12) + "..."
                            : guess.weapon.special}
                        </div>
                      </div>
                    </FlipCard>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Attempts Counter */}
          {guesses.length > 0 && (
            <div className="text-center mt-6 sm:mt-8">
              <div className="inline-flex items-center gap-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 sm:px-6 py-2 sm:py-3">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400" />
                <span className="text-slate-300 text-base sm:text-lg font-semibold">
                  Attempts: {guesses.length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Splatdle;