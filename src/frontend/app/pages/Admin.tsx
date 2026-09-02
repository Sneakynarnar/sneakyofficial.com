import { useState, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet";
import axios from "axios";
import {
  AlertCircle, ChevronLeft, Dices, Gamepad2, Gauge, Map as MapIcon, Monitor,
  Swords, Trophy, UserPlus, Users,
} from "lucide-react";
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
import BingoSection from "../components/admin/BingoSection";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const GUILD_ID = import.meta.env.VITE_GUILD_ID ?? "";
const ADMIN_DISCORD_IDS = ["339866237922181121"];

type Section =
  | "overview" | "organise" | "matches" | "schedule"
  | "players" | "bingo" | "overlay" | "splatdle";

interface AdminTournament {
  id: number;
  name: string;
  status: string;
  team_size?: number;
  special_rules?: string | null;
  affects_rating?: boolean;
}

interface BingoStats {
  available: number;
  pending: number;
  total: number;
  submitters: number;
  cards: number;
}

interface NavItem {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Hidden when there is no tournament, or none in progress. */
  needs?: "tournament" | "active";
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Dashboard",
    items: [{ id: "overview", label: "Overview", icon: Gauge }],
  },
  {
    group: "Tournament",
    items: [
      { id: "organise", label: "Organise",        icon: Users                          },
      { id: "matches",  label: "Matches",         icon: Swords,  needs: "active"       },
      { id: "schedule", label: "Schedule & Maps", icon: MapIcon, needs: "tournament"   },
      { id: "players",  label: "Players",         icon: UserPlus                       },
    ],
  },
  {
    group: "Content",
    items: [
      { id: "bingo",    label: "Splatoon Bingo", icon: Dices    },
      { id: "splatdle", label: "Splatdle",       icon: Gamepad2 },
    ],
  },
  {
    group: "Stream",
    items: [{ id: "overlay", label: "Overlay", icon: Monitor }],
  },
];

const SECTION_BLURB: Record<Section, { title: string; blurb: string }> = {
  overview: { title: "Overview", blurb: "Everything that's running right now, at a glance." },
  organise: { title: "Organise", blurb: "Create tournaments, manage sign-ups and build teams." },
  matches:  { title: "Matches",  blurb: "Report results, fix scores and revert mistakes." },
  schedule: { title: "Schedule & Maps", blurb: "Round schedule, map pool presets and the active pool." },
  players:  { title: "Players",  blurb: "Player profiles, ranks, Splattags and Discord links." },
  bingo:    { title: "Splatoon Bingo", blurb: "Curate community suggestions and build bingo cards." },
  splatdle: { title: "Splatdle", blurb: "Who's playing right now, and how the day is going." },
  overlay:  { title: "Overlay",  blurb: "Control what the stream ribbon shows. Changes apply instantly." },
};

export default function Admin() {
  const { loggedIn, userData, isLoading: authLoading } = useAuth();
  const isAdmin = loggedIn && userData && ADMIN_DISCORD_IDS.includes(userData.userId);

  const [section, setSection]       = useState<Section>("overview");
  const [tournament, setTournament] = useState<AdminTournament | null>(null);
  const [signups, setSignups]       = useState<Signup[]>([]);
  const [preTeams, setPreTeams]     = useState<PreTeam[]>([]);
  const [bingoStats, setBingoStats] = useState<BingoStats | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [flashMsg, setFlashMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  const flash = useCallback((text: string, ok: boolean) => {
    setFlashMsg({ text, ok });
    setTimeout(() => setFlashMsg(null), 4000);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      if (GUILD_ID) {
        const { data } = await axios.get(`${API_URL}/api/tournament/admin`, {
          params: { guild_id: GUILD_ID },
          withCredentials: true,
        });
        setTournament(data.tournament ?? null);
        setSignups(data.signups ?? []);
        setPreTeams(data.pre_teams ?? []);
      }
    } catch {
      // Access denied is surfaced by the gate below rather than here.
    } finally {
      setDataLoaded(true);
    }

    try {
      const { data } = await axios.get(`${API_URL}/api/bingo/admin`, {
        params: GUILD_ID ? { guild_id: GUILD_ID } : {},
        withCredentials: true,
      });
      setBingoStats(data.stats ?? null);
    } catch {
      setBingoStats(null);
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
          <p className="text-slate-400 text-sm mb-6">You need to be an admin to view this page.</p>
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

  const isVisible = (item: NavItem) => {
    if (item.needs === "active") return isActive;
    if (item.needs === "tournament") return !noTournament;
    return true;
  };

  // A tournament ending while the page is open would otherwise strand the user
  // on a section that no longer has anything to show.
  const current = NAV.flatMap((g) => g.items).find((i) => i.id === section);
  const activeSection: Section = current && !isVisible(current) ? "overview" : section;
  const meta = SECTION_BLURB[activeSection];

  return (
    <PageWrapper>
      <Helmet>
        <title>Admin | sneakyofficial.com</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* One translucent slab holds the whole dashboard, so the animated
            background reads through it as a single surface rather than through
            a scatter of separate cards. */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl shadow-black/40 p-4 sm:p-6">

          {/* Page header */}
          <div className="flex items-center gap-3 pb-4 mb-6 border-b border-white/10 flex-wrap">
            <Link to="/" className="text-slate-500 hover:text-slate-300 transition-colors shrink-0" title="Back to site">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <Gauge className="w-6 h-6 text-indigo-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight">Admin Dashboard</h1>
              <p className="text-xs text-slate-400 truncate">
                {tournament && !noTournament ? (
                  <>
                    {tournament.name}
                    <StatusPill status={tournament.status} />
                  </>
                ) : (
                  "No active tournament"
                )}
              </p>
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
            <div className={`mb-4 text-sm px-3 py-2 rounded border ${
              flashMsg.ok ? "bg-green-900/40 text-green-300 border-green-700/40"
                          : "bg-red-900/40 text-red-300 border-red-700/40"}`}>
              {flashMsg.text}
            </div>
          )}

          <div className="grid lg:grid-cols-[220px_1fr] gap-6">
            {/* Sidebar */}
            <nav className="lg:sticky lg:top-6 lg:self-start">
              <div className="flex lg:flex-col gap-4 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                {NAV.map((group) => {
                  const items = group.items.filter(isVisible);
                  if (items.length === 0) return null;
                  return (
                    <div key={group.group} className="shrink-0 lg:shrink">
                      <p className="hidden lg:block text-[10px] uppercase tracking-wider text-slate-600 font-semibold px-2 mb-1">
                        {group.group}
                      </p>
                      <div className="flex lg:flex-col gap-1">
                        {items.map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            onClick={() => setSection(id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                              activeSection === id
                                ? "bg-indigo-600/20 text-indigo-200 border border-indigo-500/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </nav>

            {/* Content */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 min-w-0">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">{meta.title}</h2>
                <p className="text-xs text-slate-500">{meta.blurb}</p>
              </div>

              {activeSection === "overview" && (
                <Overview
                  tournament={noTournament ? null : tournament}
                  signupCount={signups.length}
                  bingoStats={bingoStats}
                  onGo={setSection}
                />
              )}

              {activeSection === "organise" && (
                <AdminPanel
                  tournament={tournament ?? { id: 0, name: "No active tournament", status: "signup" }}
                  signups={tournament ? signups : []}
                  preTeams={tournament ? preTeams : []}
                  onRefresh={fetchAll}
                  onCancel={fetchAll}
                />
              )}

              {activeSection === "matches" && (
                <AdminMatchReporter onRefresh={fetchAll} flash={flash} />
              )}

              {activeSection === "schedule" && !noTournament && (
                <div className="flex flex-col gap-8">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                      <MapIcon className="w-4 h-4 text-slate-400" /> Round Schedule
                    </h3>
                    <RoundScheduleSection
                      tournamentId={tournament!.id}
                      signupCount={signups.length}
                      teamSize={tournament?.team_size ?? 4}
                      initialOpen
                    />
                  </div>
                  <div className="border-t border-slate-700/40 pt-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                      <MapIcon className="w-4 h-4 text-slate-400" /> Map Pool Presets
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Save named map pools (e.g. "Competitive", "Meme") and apply them to the tournament in one click.
                    </p>
                    <MapPoolPresetsSection tournamentId={tournament!.id} />
                  </div>
                  <div className="border-t border-slate-700/40 pt-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                      <MapIcon className="w-4 h-4 text-slate-400" /> Map Pool
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Restrict which stages players can choose for each mode. Leave a mode empty to allow all stages.
                    </p>
                    <MapPoolSection tournamentId={tournament!.id} initialOpen />
                  </div>
                </div>
              )}

              {activeSection === "players"  && <PlayerProfilesSection />}
              {activeSection === "bingo"    && <BingoSection />}
              {activeSection === "overlay"  && <OverlaySettingsSection />}
              {activeSection === "splatdle" && <SplatdleActivitySection />}
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

/* ------------------------------------------------------------------ */

function StatusPill({ status }: { status: string }) {
  const tone = status === "active"
    ? "bg-green-900/40 text-green-400"
    : status === "signup"
    ? "bg-blue-900/40 text-blue-400"
    : "bg-slate-700/60 text-slate-400";
  return (
    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}

function Overview({ tournament, signupCount, bingoStats, onGo }: {
  tournament: AdminTournament | null;
  signupCount: number;
  bingoStats: BingoStats | null;
  onGo: (section: Section) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <OverviewCard
          icon={Trophy}
          title="Tournament"
          onClick={() => onGo("organise")}
          lines={tournament
            ? [`${tournament.name}`, `${signupCount} signed up · ${tournament.status}`]
            : ["Nothing running", "Create one from Organise"]}
        />
        <OverviewCard
          icon={Dices}
          title="Splatoon Bingo"
          onClick={() => onGo("bingo")}
          lines={bingoStats
            ? [
                bingoStats.pending > 0
                  ? `${bingoStats.pending} awaiting review`
                  : `${bingoStats.available} approved and ready`,
                `${bingoStats.total} total from ${bingoStats.submitters} people · ${bingoStats.cards} cards made`,
              ]
            : ["No suggestions yet", "They arrive as people post in the channel"]}
        />
        <OverviewCard
          icon={Monitor}
          title="Stream overlay"
          onClick={() => onGo("overlay")}
          lines={["Ribbon, bracket and map pool sources", "Changes apply to live overlays instantly"]}
        />
        <OverviewCard
          icon={Gamepad2}
          title="Splatdle"
          onClick={() => onGo("splatdle")}
          lines={["Live player activity", "Daily completion and streak history"]}
        />
      </div>

      <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Quick links</h3>
        <div className="flex flex-wrap gap-2">
          <QuickLink to="/tournament">Public bracket</QuickLink>
          <QuickLink to="/leaderboard">Leaderboard</QuickLink>
          <QuickLink to="/players">Players</QuickLink>
          <QuickLink to="/overlay">Overlay index</QuickLink>
          <QuickLink to="/splatdle">Splatdle</QuickLink>
        </div>
      </div>
    </div>
  );
}

function OverviewCard({ icon: Icon, title, lines, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  lines: string[];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border border-slate-700/40 bg-slate-900/40 hover:border-indigo-500/40 hover:bg-slate-900/70 p-4 transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-semibold text-slate-200">{title}</span>
      </div>
      <p className="text-sm text-slate-300 truncate">{lines[0]}</p>
      <p className="text-xs text-slate-500 mt-0.5">{lines[1]}</p>
    </button>
  );
}

function QuickLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-2.5 py-1 rounded text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 transition-colors"
    >
      {children}
    </Link>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.034.055a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
