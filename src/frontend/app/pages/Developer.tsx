import PageWrapper from "../components/PageWrapper";
import Section from "../components/Section";
import marineAiLogo from "../assets/marineai.png";
import sneakyLogo from "../assets/sneaky.jpg";
import oce4MansLogo from "../assets/oce4mans.png";
import private6mansLogo from "../assets/private6mans.png"
import TitlePage from "../components/TitlePage";
import Project from "../components/Project";
import TypewriterText from "../components/TypewriterText";
import GitHubCard from "../components/GithubCard";
import { useEffect } from "react";

const Developer = () => {
  useEffect(() => {
    document.title = "Developer | Sneaky's Website";
  }, []);

  const personalProjects = [
    {
      title: "Pet-Ascension",
      description: `A goofy spiritual-themed game where you help a pet reach ascension—
      built using Express.js for the backend and plain JavaScript, HTML, and CSS on the front.
      It's raw, hand-rolled, and somehow earned the top mark of the year for my first-year uni project.`,
      repo: "Pet-Ascension",
    },
    {
      title: "You're Fat Stop That",
      description: `A brutally honest weight tracker web app with a sarcastic twist.
      Built using Express.js and pure HTML/CSS/JS, with no frameworks—just vibes and HTTP.
      It gamifies health with some tough love, and yes, it got a first-class grade. No regrets.`,
      repo: "youre-fat-stop-that",
    },
    {
      title: "CPP Snake",
      description: `A console-based Snake game built in **C++**. This was my first C++ project, created right before I started at MarineAI
      to get hands-on experience with the language. It helped me solidify fundamentals like input handling, game loops, and basic terminal rendering.
      Nothing fancy—just good ol' ASCII-based gameplay.`,
      repo: "CPP-Snake",
    },
    {
      title: "University Work",
      description: `A public archive of various problem-solving tasks from university, including my solutions to **Haskell**, **SQL**, and logic-based challenges.
      It's not flashy, but it shows my growth across different paradigms—from functional programming to relational querying.`,
      repo: "university-work",
    }
  ];

  const professionalProjects = [
    {
      title: "Marine AI",
      imgSrc: marineAiLogo,
      imgAlt: "Marine AI Logo",
      description: `During my placement year at Marine AI, I've worked on cutting-edge robotics and autonomous systems.
      My role involves developing scalable backend services in C++ and Python, working on systems that interact with real-time sensor data,
      and deploying solutions with Docker and Kubernetes. It's been a deep dive into high-performance systems and production-grade software.`,
    },
    {
      title: "OCE 4 Mans",
      imgSrc: oce4MansLogo,
      imgAlt: "OCE 4 Mans Logo",
      description: `An ongoing side project for the Rocket League OCE community. It's a full-stack matchmaking platform
      for 4 mans and 2v2s with automated rank tracking, Discord integration, and player history.
      I've built the entire platform from scratch using TypeScript, Node.js, Express, and React.`,
    },
    {
      title: "Private6Mans",
      imgSrc: private6mansLogo,
      imgAlt: "Private6Mans Logo",
      description: `Joined the development team for **Private6Mans**, a well-established bot used in competitive Rocket League scenes for structured matchmaking and stat tracking.
      My contributions so far include implementing match history views in the stats system and adding a **/fixteams** command to manually set teams after issues with auto-balance.
      Still learning the codebase but actively shipping features and fixes.`,
    }
  ];

  return (
    <PageWrapper>
      <main className="w-full overflow-x-hidden">
        <TitlePage
          imgSrc={sneakyLogo}
          imgAlt="Sneaky Logo"
          verb="<Develops/>"
          colour='#00ff88'
          loop={true}
          TextAnimationComponent={TypewriterText}
        />
        
        <Section title="This website!">
          <div className="flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-center gap-4 lg:gap-6">
              <div className="w-full lg:w-1/2 text-neutral-300 text-sm px-2 sm:px-0">
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-white break-words">
                  Sneaky Official website
                </h3>
                <p className="leading-relaxed break-words">
                  This page was made using React, Typescript and Tailwind. The backend is in Python with a MySQL database. 
                  The discord bot is also programmed in python using the interactions library. If you want to roast my code, 
                  or even suggest changes It's much appreciated! You might even find secret pages ;).
                </p>
              </div>
              <div className="w-full lg:w-1/2 flex justify-center px-2 sm:px-0">
                <GitHubCard username="Sneakynarnar" repo="sneakyofficial.com"/>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Professional Projects">
          <div className="space-y-6 sm:space-y-8">
            {professionalProjects.map((project) => (
              <div key={project.title} className="w-full">
                <Project
                  title={project.title}
                  imgSrc={project.imgSrc}
                  imgAlt={project.imgAlt}
                >
                  <div className="break-words leading-relaxed">
                    {project.description}
                  </div>
                </Project>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Personal Projects">
          <div className="flex flex-col gap-6 sm:gap-8">
            {personalProjects.map((project) => (
              <div key={project.repo} className="flex flex-col lg:flex-row items-start lg:items-center justify-center gap-4 lg:gap-6">
                <div className="w-full lg:w-1/2 text-neutral-300 text-sm px-2 sm:px-0">
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-white break-words">
                    {project.title}
                  </h3>
                  <p className="leading-relaxed break-words">
                    {project.description}
                  </p>
                </div>
                <div className="w-full lg:w-1/2 flex justify-center px-2 sm:px-0">
                  <GitHubCard username="Sneakynarnar" repo={project.repo} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 sm:mt-8 text-center text-neutral-400 px-2 sm:px-0 break-words">
            More chaotic projects are always brewing.
          </p>
        </Section>
      </main>
    </PageWrapper>
  );
};

export default Developer;