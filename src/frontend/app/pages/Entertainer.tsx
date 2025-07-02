import React, { useState } from "react";
import { Helmet } from "react-helmet";
import PageWrapper from "../components/PageWrapper";
import sneakyLogo from "../assets/sneaky.jpg";
import TitlePage from "../components/TitlePage";
import SlideInText from "../components/SlideInText";
import { Youtube, X, Gamepad2, Play, ExternalLink } from 'lucide-react';

type SocialAccount = {
  name: string;
  handle: string;
  description: string;
  url: string;
};

type SocialPlatform = {
  category: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  color: string;
  accounts: SocialAccount[];
};
type FeaturedVideo = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
};

const Entertainer = () => {
  const [selectedVideo, setSelectedVideo] = useState<FeaturedVideo | null>(null);
  const socialPlatforms: SocialPlatform[]= [
    {
      category: "YouTube",
      icon: Youtube,
      color: "from-red-500 to-red-600",
      accounts: [
        {
          name: "Guy On Nightmode",
          handle: "@guyonnightmode",
          description: "Anime analysis channel",
          url: "https://youtube.com/@guyonnightmode"
        },
        {
          name: "Sneakynarnar",
          handle: "@sneakynarnar",
          description: "Splatoon content (previously dev/gaming)",
          url: "https://youtube.com/@sneakynarnar"
        }
      ]
    },
    {
      category: "Social Media",
      icon: X,
      color: "from-blue-500 to-purple-600",
      accounts: [
        {
          name: "Twitter/X",
          handle: "@Sneakynarnar",
          description: "Main social updates",
          url: "https://twitter.com/Sneakynarnar"
        },
        {
          name: "Instagram",
          handle: "@nanaadjei6981",
          description: "Personal content",
          url: "https://instagram.com/nanaadjei6981"
        },
        {
          name: "Instagram",
          handle: "@guy_on_nightmode",
          description: "Anime content",
          url: "https://instagram.com/guy_on_nightmode"
        }
      ]
    },
    {
      category: "Short Form",
      icon: Play,
      color: "from-pink-500 to-violet-600",
      accounts: [
        {
          name: "TikTok",
          handle: "sneakynarnar",
          description: "Soon to be Splatoon content",
          url: "https://tiktok.com/@sneakynarnar"
        },
        {
          name: "TikTok",
          handle: "guy_on_nightmode",
          description: "Anime content",
          url: "https://tiktok.com/@guy_on_nightmode"
        }
      ]
    },
    {
      category: "Gaming & Music",
      icon: Gamepad2,
      color: "from-green-500 to-teal-600",
      accounts: [
        {
          name: "Steam",
          handle: "eliteprocrafter",
          description: "Steam profile",
          url: "https://steamcommunity.com/id/Sneakynarnar/"
        },
        {
          name: "SoundCloud",
          handle: "sneakyonnightmode",
          description: "Music content see musician page for more",
          url: "https://soundcloud.com/sneakyonnightmode"
        },
        {
          name: "Instagram",
          handle: "@sneakyonnightmode",
          description: "Music instagram",
          url: "https://instagram.com/sneakyonnigtmode"
        }
      ]
    }
  ];

  const featuredVideos: FeaturedVideo[] = [
    {
      id: "gr3sLTnwK00",
      title: "Promised Neverland Analysis Episode 1",
      channel: "Guy On Nightmode",
      thumbnail: "https://i.ytimg.com/an_webp/gr3sLTnwK00/mqdefault_6s.webp?du=3000&sqp=CNSO9MIG&rs=AOn4CLBkRqWqNJ3BjC7VaFslgiGtAmP75Q"
    },
    {
      id: "TX9AdMWifEA",
      title: "Promised Neverland Analysis Episode 2",
      channel: "Guy On Nightmode",
      thumbnail: "https://i.ytimg.com/an_webp/TX9AdMWifEA/mqdefault_6s.webp?du=3000&sqp=CODQ9MIG&rs=AOn4CLBvhEpG-AOyM7O1ZXreMPmdLFq_Ew"
    },
    {
      id: "Q3e07ghcepw",
      title: "Promised Neverland Analysis Episode 3",
      channel: "Guy On Nightmode",
      thumbnail: "https://i.ytimg.com/an_webp/Q3e07ghcepw/mqdefault_6s.webp?du=3000&sqp=CMSr9MIG&rs=AOn4CLBZ6QJ9q67o17YdBcfCecKfgdSI-w"
    }
  ];
 return (
    <PageWrapper>
      <Helmet>
        <title>Social & Content | Sneaky's Channels - Anime Analysis & Gaming</title>
        <meta name="description" content="Follow Sneaky's content! Anime analysis on Guy On Nightmode, Splatoon gaming content, and social media updates across YouTube, TikTok, and more." />
        <meta property="og:title" content="Sneaky's Content - Anime Analysis & Gaming" />
        <meta property="og:description" content="Follow Sneaky's content! Anime analysis, gaming videos, and social media updates across multiple platforms." />
        <meta property="og:image" content="/image.png" />
        <meta property="og:url" content="https://sneakyofficial.com/entertainer" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Sneaky's Content - Anime Analysis & Gaming" />
        <meta name="twitter:description" content="Follow Sneaky's content! Anime analysis, gaming videos, and social media updates across multiple platforms." />
        <meta name="twitter:image" content="/image.png" />
      </Helmet>
      <TitlePage
            imgSrc={sneakyLogo}
            imgAlt="Sneaky Logo"
            verb="Makes videos"
            colour='#ff6b6b'
            TextAnimationComponent={SlideInText}
          />
      <div className="min-h-screen text-white">

        {/* Social Platforms */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid gap-12">
            {socialPlatforms.map((platform: SocialPlatform, platformIndex) => (
              <div key={platformIndex} className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-r ${platform.color} shadow-lg`}>
                    <platform.icon className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-white">{platform.category}</h2>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {platform.accounts.map((account, accountIndex) => (
                    <div
                      key={accountIndex}
                      className="group relative bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-slate-600 transition-all duration-300 hover:transform hover:scale-105"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="relative">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-xl font-semibold text-white mb-1">{account.name}</h3>
                            <p className="text-purple-300 font-mono text-sm">{account.handle}</p>
                          </div>
                          <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-purple-400 transition-colors" />
                        </div>
                        <p className="text-slate-300 text-sm mb-4">{account.description}</p>
                        <a
                          href={account.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-medium hover:from-purple-500 hover:to-pink-500 transition-all duration-200"
                        >
                          {platform.category === "YouTube" ? "Subscribe" : "Follow"}
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Featured Videos Section */}
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-red-400 to-pink-400 bg-clip-text text-transparent">
              Featured Content
            </h2>
            <p className="text-slate-300 text-lg">Check out some of my latest videos</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {featuredVideos.map((video: FeaturedVideo, index: number) => (
              <div
                key={index}
                className="group cursor-pointer"
                onClick={() => setSelectedVideo(video)}
              >
                <div className="relative rounded-2xl overflow-hidden bg-slate-800 hover:transform hover:scale-105 transition-all duration-300">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <Play className="w-16 h-16 text-white" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-white mb-1">{video.title}</h3>
                    <p className="text-slate-400 text-sm">{video.channel}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedVideo && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="relative bg-slate-900 rounded-2xl overflow-hidden max-w-4xl w-full">
                <button
                  onClick={() => setSelectedVideo(null)}
                  className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
                >
                  ✕
                </button>
                <div className="aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${selectedVideo.id}`}
                    title={selectedVideo.title}
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{selectedVideo.title}</h3>
                  <p className="text-slate-300">{selectedVideo.channel}</p>
                </div>
              </div>
            </div>
          )}

          <div className="text-center">
            <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-2xl p-8 border border-purple-500/20">
              <h3 className="text-2xl font-bold text-white mb-4">Stay Updated</h3>
              <p className="text-slate-300 mb-6">
                Subscribe to my channels and follow my socials for the latest content on anime, gaming, and development!
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="https://youtube.com/@guyonnightmode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium transition-colors"
                >
                  Subscribe to Guy On Nightmode
                </a>
                <a
                  href="https://youtube.com/@sneakynarnar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium transition-colors"
                >
                  Subscribe to Sneakynarnar
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default Entertainer;
