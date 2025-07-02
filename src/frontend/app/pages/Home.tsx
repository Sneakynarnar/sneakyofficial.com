import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import TypewriterText from "../components/TypewriterText";
import SlideInText from "../components/SlideInText";
import headShot from "../assets/headshot.webp";
import WaveText from "../components/WaveText";
import SneakyLogo from "../assets/sneaky.jpg";
import PageWrapper from "../components/PageWrapper";
import LifeTimeline from "../components/Timeline";
import GlassSection from "../components/GlassSection";

const HomePage = () => {

  const [currentIndex, setCurrentIndex] = useState(0);
  
  const animations = useMemo(() => [
    { 
      text: "<Develops/>", 
      colour: "#00ff88", 
      component: TypewriterText,
      duration: 5000 // Longer to account for delete animation
    },
    { 
      text: "Creates Content", 
      colour: "#ff6b6b", 
      component: SlideInText,
      duration: 4000 // Longer for exit animation
    },
    { 
      text: "Makes Music", 
      colour: "#4ecdc4", 
      component: WaveText,
      duration: 4000 // Longer for smooth wave cycles
    }
  ], []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % animations.length);
    }, animations[currentIndex].duration);

    return () => clearInterval(interval);
  }, [currentIndex, animations]);

  const CurrentComponent = animations[currentIndex].component;

  return (
    <PageWrapper>
      <Helmet>
        <title>Home | Sneaky's Website - Developer, Musician & Content Creator</title>
        <meta name="description" content="Welcome to Sneaky's portfolio! Full-stack developer, music producer, and content creator. Explore my projects, music, and YouTube channels." />
        <meta property="og:title" content="Sneaky's Website - Developer, Musician & Content Creator" />
        <meta property="og:description" content="Welcome to Sneaky's portfolio! Full-stack developer, music producer, and content creator." />
        <meta property="og:image" content="/image.png" />
        <meta property="og:url" content="https://sneakyofficial.com" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Sneaky's Website - Developer, Musician & Content Creator" />
        <meta name="twitter:description" content="Welcome to Sneaky's portfolio! Full-stack developer, music producer, and content creator." />
        <meta name="twitter:image" content="/image.png" />
      </Helmet>
      <div className="w-full overflow-x-hidden">
        <section className="bg-transparent relative">
          <div className="min-h-screen flex flex-col items-center justify-center text-white text-center px-4 sm:px-6 lg:px-8 relative">
            <img 
              src={SneakyLogo} 
              alt="Sneaky's profile" 
              className="w-24 h-24 xs:w-28 xs:h-28 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:w-56 lg:h-56 xl:w-64 xl:h-64 mb-4 sm:mb-6 rounded-full shadow-lg hover:scale-105 transition-transform duration-300 ease-in-out object-cover" 
            />
            
            <div className="w-full max-w-7xl">
              <div className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-8xl font-bold text-center pb-4 min-h-[60px] xs:min-h-[70px] sm:min-h-[80px] md:min-h-[100px] lg:min-h-[120px] flex items-center justify-center">
                <div className="relative flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 lg:gap-5 w-full">
                  <span className="block whitespace-nowrap">Sneaky</span>
                  <div className="flex-shrink-0 min-w-0">
                    <CurrentComponent 
                      text={animations[currentIndex].text}
                      colour={animations[currentIndex].colour}
                      delay={200}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="w-full max-w-xl sm:max-w-2xl md:max-w-4xl px-2">
              <p className="pt-2 mb-16 sm:mb-20 md:mb-24 text-sm xs:text-base sm:text-lg md:text-xl break-words leading-relaxed">
                Nana Adepa Nuamah "Sneaky" Adjei's portfolio website.
              </p>
            </div>
            
            {/* Scroll indicator - positioned outside the text container */}
            <div className="absolute bottom-8 sm:bottom-12 left-1/2 transform -translate-x-1/2">
              <div className="flex flex-col items-center animate-bounce">
                <span className="text-xs sm:text-sm mb-2 opacity-70 whitespace-nowrap">Scroll for more</span>
                <svg 
                  className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 opacity-70" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M19 14l-7 7m0 0l-7-7m7 7V3" 
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>

        <GlassSection 
          title="About Me" 
          imgSrc={headShot}
          imgAlt="Sneaky's headshot"
        >
          <div className="space-y-4 text-sm sm:text-base leading-relaxed">
            <p className="break-words">
              I'm a full-stack developer currently completing my placement year as part of a BSc in Software Engineering. 
              My current work focuses on C++ and Python, contributing to real-world systems that involve robotics, hardware integration, 
              and scalable backend infrastructure. I've gained hands-on experience with containerization (Docker, Kubernetes), REST APIs, 
              CI/CD workflows, and cross-platform development across both Windows and Linux.
            </p>
            <p className="break-words">
              I enjoy architecting clean, efficient systems and collaborating in team environments that follow modern software practices 
              like Gitflow, Agile, and professional documentation (including interface control documents and specs). Whether it's writing 
              multithreaded code or integrating with hardware over serial or IP, I take pride in delivering robust and maintainable solutions.
            </p>
            <p className="break-words">
              Outside of engineering, I'm also a music producer working on an upcoming EP, and I create content on YouTube. I run an anime 
              analysis channel where I break down storytelling, character design, and themes in my favorite series, and I'm launching a 
              Splatoon-focused channel with walkthroughs, tips, and gameplay breakdowns.
            </p>
            <p className="break-words">
              I'm always looking to grow, collaborate, and build cool things—whether that's a new feature, a new beat, or a new video essay. 
              Feel free to connect or check out my work on GitHub!
            </p>
          </div>
        </GlassSection>

        <LifeTimeline/>
      </div>
    </PageWrapper>
  );
};

export default HomePage;