import { useState, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet";
import axios from "axios";
import { Trophy, Swords, Users, Map as MapIcon, UserPlus, ChevronLeft, AlertCircle, Monitor, Gamepad2 } from "lucide-react";
import { Link } from "react-router-dom";
import PageWrapper from "../components/PageWrapper";
import { useAuth } from "../hooks/useAuth";
import AdminPanel, {
  type Signup,
  type PreTeam,
  AdminMatchReporter,
  RoundScheduleSection,
  MapPoolSection,
  MapPoolPresetsSection,
  PlayerProfilesSection,
  OverlaySettingsSection,
  SplatdleActivitySection,
} from "../components/tournament/AdminPanel";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const ADMIN_DISCORD_IDS = ["339866237922181121"];

type Tab = "organise" | "matches" | "schedule" | "players" | "overlay" | "splatdle";

interface AdminTournament {
  id: number;
  name: string;
  status: string;
  team_size?: number;
  special_rules?: string | null;
  affects_rating?: boolean;
}

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "organise", label: "Organise",        icon: Users   },
  { id: "matches",  label: "Matches",         icon: Swords  },
  { id: "schedule", label: "Schedule & Maps", icon: MapIcon },
  { id: "players",  label: "Players",         icon: UserPlus },
  { id: "overlay",  label: "Overlay",         icon: Monitor },
  { id: "splatdle", label: "Splatdle",        icon: Gamepad2 },
];

export default function TournamentAdmin() {
  const { loggedIn, userData, isLoading: authLoading } = useAuth();
  const isAdmin = loggedIn && userData && ADMIN_DISCORD_IDS.includes(userData.userId);

  const [tab, setTab]               = useState<Tab>("organise");
  const [tournament, setTournament] = useState<AdminTournament | null>(null);
  const [signups, setSignups]       = useState<Signup[]>([]);
  const [preTeams, setPreTeams]     = useState<PreTeam[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [flashMsg, setFlashMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  const flash = useCallback((text: string, ok: boolean) => {
    setFlashMsg({ text, ok });
    setTimeout(() => setFlashMsg(null), 4000);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!GUILD_ID) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/tournament/admin`, {
        params: { guild_id: GUILD_ID },
        withCredentials: true,
      });
      setTournament(data.tournament ?? null);
      setSignups(data.signups ?? []);
      setPreTeams(data.pre_teams ?? []);
    } catch {
      // silently fail — access denied shows below
    } finally {
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchAll();
    else if (!authLoading) setDataLoaded(true);
  }, [isAdmin, authLoading, fetchAll]);

  if (authLoading || (!dataLoaded && isAdmin)) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      </PageWrapper>
    );
  }

  if (!isAdmin) {
    return (
      <PageWrapper>
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 text-sm mb-6">You need to be a tournament admin to view this page.</p>
          <a
            href={`${API_URL}/api/auth/discord/login`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
          >
            <DiscordIcon />
            Log in with Discord
          </a>
        </div>
      </PageWrapper>
    );
  }

  const noTournament = !tournament || tournament.id === 0;
  const isActive = tournament?.status === "active";

  return (
    <PageWrapper>
      <Helmet>
        <title>Tournament Admin | sneakyofficial.com</title>
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Link to="/tournament" className="text-slate-500 hover:text-slate-300 transition-colors shrink-0" title="Back to tournament">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <Trophy className="w-6 h-6 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white leading-tight">Tournament Admin</h1>
            {tournament && (
              <p className="text-xs text-slate-400 truncate">
                {tournament.name}
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  isActive
                    ? "bg-green-900/40 text-green-400"
                    : tournament.status === "signup"
                    ? "bg-blue-900/40 text-blue-400"
                    : "bg-slate-700/60 text-slate-400"
                }`}>{tournament.status}</span>
              </p>
            )}
            {noTournament && dataLoaded && (
              <p className="text-xs text-slate-500">No active tournament</p>
            )}
          </div>
          {tournament?.special_rules && (
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
              tournament.affects_rating === false
                ? "bg-amber-900/30 text-amber-300 border-amber-600/40"
                : "bg-blue-900/30 text-blue-300 border-blue-600/40"
            }`}>
              {tournament.affects_rating === false ? "Special rules · no rating" : "Special rules"}
            </span>
          )}
        </div>

        {flashMsg && (
          <div className={`mb-4 text-sm px-3 py-2 rounded border ${flashMsg.ok ? "bg-green-900/40 text-green-300 border-green-700/40" : "bg-red-900/40 text-red-300 border-red-700/40"}`}>
            {flashMsg.text}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 p-1 rounded-xl bg-slate-800/60 border border-slate-700/50 max-w-max">
          {TABS.map(({ id, label, icon: Icon }) => {
            if (id === "matches" && !isActive) return null;
            if (id === "schedule" && noTournament) return null;
            return ( // overlay tab always visible
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === id
                    ? "bg-slate-700 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm p-6">

          {tab === "organise" && (
            <AdminPanel
              tournament={tournament ?? { id: 0, name: "No active tournament", status: "signup" }}
              signups={tournament ? signups : []}
              preTeams={tournament ? preTeams : []}
              onRefresh={fetchAll}
              onCancel={fetchAll}
            />
          )}

          {tab === "matches" && isActive && (
            <AdminMatchReporter onRefresh={fetchAll} flash={flash} />
          )}

          {tab === "schedule" && !noTournament && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-slate-400" /> Round Schedule
                </h2>
                <RoundScheduleSection
                  tournamentId={tournament!.id}
                  signupCount={signups.length}
                  teamSize={tournament?.team_size ?? 4}
                  initialOpen
                />
              </div>
              <div className="border-t border-slate-700/40 pt-6">
                <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-slate-400" /> Map Pool Presets
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Save named map pools (e.g. "Competitive", "Meme") and apply them to the tournament in one click.
                </p>
                <MapPoolPresetsSection tournamentId={tournament!.id} />
              </div>
              <div className="border-t border-slate-700/40 pt-6">
                <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-slate-400" /> Map Pool
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Restrict which stages players can choose for each mode. Leave a mode empty to allow all stages.
                </p>
                <MapPoolSection tournamentId={tournament!.id} initialOpen />
              </div>
            </div>
          )}

          {tab === "players" && (
            <PlayerProfilesSection />
          )}

          {tab === "overlay" && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-slate-400" /> Overlay Settings
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Control what the stream ribbon overlay displays. Changes take effect immediately for all connected overlays.
              </p>
              <OverlaySettingsSection />
            </div>
          )}

          {tab === "splatdle" && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-slate-400" /> Splatdle Activity
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                How many people are on Splatdle right now, and how the day is going.
              </p>
              <SplatdleActivitySection />
            </div>
          )}

        </div>
      </div>
    </PageWrapper>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.034.055a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
