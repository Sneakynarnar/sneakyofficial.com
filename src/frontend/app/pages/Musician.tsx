import PageWrapper from "../components/PageWrapper";
import TitlePage from "../components/TitlePage";
import sneakyLogo from "../assets/sneaky.jpg"
import { Music, Play, ExternalLink, Calendar, Clock, Volume2 } from 'lucide-react';
import { useState, useEffect } from "react";
import WaveText from "../components/WaveText";

type TeaserVideo = {
  id: string;
  title: string;
  thumbnail: string;
  description: string
}
type SoundCloudTrack = {
  title: string;
  url: string;
  embedId: string;
  description: string
}


const MusicianPage = () => {
  useEffect(() => {
        document.title = "Musician | Sneaky's Website";
      }, []);
  const [selectedTeaser, setSelectedTeaser] = useState<TeaserVideo | null>(null);
  const teaserVideos: TeaserVideo[] = [
  // {
  //   id: "teaser1",
  //   title: "Prophecy -",
  //   thumbnail: "idk dont have one",
  //   description: "Quick studio session clip"

];

  const soundcloudTracks: SoundCloudTrack[] = [
    {
      title: "Blast Zone",
      url: "https://soundcloud.com/sneakyonnightmode/blast-zone?utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing",
      embedId: "1879365222",
      description: "First self produced hip-hop song"
    },

  ];

  return (
    <PageWrapper>
      <TitlePage
        imgSrc={sneakyLogo}
        imgAlt="Sneaky Logo"
        verb="Makes Music"
        colour='#4ecdc4'
        TextAnimationComponent={WaveText}
      />
      
      <div className="text-white">
        {/* EP Announcement Section */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 px-6 py-2 rounded-full border border-teal-400/30 mb-8">
              <Music className="w-5 h-5 text-teal-400" />
              <span className="text-teal-300 font-medium">New EP Coming Soon</span>
            </div>
            
            <h1 className="text-6xl font-bold mb-6 pb-3 bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
              Prophecy
            </h1>
            
            <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
              My upcoming EP exploring my perception of who I'm meant to be
            </p>

            <div className="flex items-center justify-center gap-6 text-slate-400 mb-12">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                <span>Release Date: TBA</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <span>X Tracks</span>
              </div>
            </div>
          </div>

          {/* Album Cover Placeholder */}
          <div className="flex justify-center mb-16">
            <div className="relative group">
              <div className="w-80 h-80 bg-gradient-to-br from-teal-500/20 to-cyan-500/20 rounded-2xl border-2 border-teal-400/30 flex items-center justify-center backdrop-blur-sm">
                <div className="text-center">
                  <div className="text-8xl mb-4 text-teal-400/50">?</div>
                  <p className="text-teal-300 font-medium">Album Art</p>
                  <p className="text-slate-400 text-sm">Coming Soon</p>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-teal-400/10 to-cyan-400/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          </div>

          {/* Teaser Videos */}
          {teaserVideos.length > 0 && (
            <div className="mb-20">
              <h2 className="text-3xl font-bold text-center mb-12 text-teal-300">
                Behind the Scenes
              </h2>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
                {teaserVideos.map((video, index) => (
                  <div
                    key={index}
                    className="group cursor-pointer max-w-xs"
                    onClick={() => setSelectedTeaser(video)}
                  >
                    <div className="relative rounded-2xl overflow-hidden bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 hover:border-teal-400/50 transition-all duration-300 hover:transform hover:scale-105">
                      <div className="relative">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full aspect-[9/16] object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <div className="bg-teal-500 rounded-full p-4">
                            <Play className="w-8 h-8 text-white" />
                          </div>
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="text-lg font-semibold text-white mb-2">{video.title}</h3>
                        <p className="text-slate-400 text-sm">{video.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Video Modal */}
          {selectedTeaser && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="relative bg-slate-900 rounded-2xl overflow-hidden max-w-4xl w-full border border-teal-400/30">
                <button
                  onClick={() => setSelectedTeaser(null)}
                  className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
                >
                  ✕
                </button>
                <div className="aspect-[9/16] bg-slate-800 flex items-center justify-center max-w-sm mx-auto">
                  <div className="text-center text-slate-400">
                    <Play className="w-16 h-16 mx-auto mb-4" />
                    <p>TikTok video placeholder</p>
                    <p className="text-sm">Replace with actual TikTok embed</p>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{selectedTeaser.title}</h3>
                  <p className="text-slate-300">{selectedTeaser.description}</p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-700/50 pt-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                Previous Releases
              </h2>
              <p className="text-slate-300 text-lg">Check out my SoundCloud for more music</p>
            </div>

            <div className="flex-col gap-8 mb-12 place-items-center">
              {soundcloudTracks.map((track, index) => (
                <div
                  key={index}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-orange-400/50 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg">
                      <Volume2 className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{track.title}</h3>
                  </div>
                  
                  <p className="text-slate-400 text-sm mb-6">{track.description}</p>
                  
                  {/* SoundCloud Embed */}
                  <div className="mb-4">
                    <iframe
                      title={`SoundCloud Player - ${track.title}`}
                      width="100%"
                      height="166"
                      scrolling="no"
                      frameBorder="no"
                      allow="autoplay"
                      className="rounded-lg w-full"
                      src={`https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${track.embedId}&color=%234ecdc4&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`}
                    />
                  </div>
                  
                  <a
                    href={track.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg text-white font-medium hover:from-orange-500 hover:to-red-500 transition-all duration-200 w-full justify-center"
                  >
                    Listen on SoundCloud
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>

            {/* SoundCloud Profile Link */}
            <div className="text-center">
              <div className="bg-gradient-to-r from-orange-900/50 to-red-900/50 rounded-2xl p-8 border border-orange-500/20 max-w-2xl mx-auto">
                <Volume2 className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-4">Follow on SoundCloud</h3>
                <p className="text-slate-300 mb-6">
                  Stay updated with all my latest releases and get early access to new tracks
                </p>
                <a
                  href="https://soundcloud.com/sneakyonnightmode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg text-white font-bold hover:from-orange-500 hover:to-red-500 transition-all duration-200 text-lg"
                >
                  Follow sneaky
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default MusicianPage;