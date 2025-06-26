import SneakyLogo from "../assets/sneaky.jpg";
            
type TitlePageProps = {
  verb: string;
  colour: string;
  imgSrc?: string;
  imgAlt?: string;
  loop?: boolean;
  TextAnimationComponent: React.ComponentType<{
      text: string;
      colour: string;
      delay: number;
      loop: boolean;
}>;
};

const TitlePage = ({verb, colour, imgSrc, imgAlt, TextAnimationComponent, loop}: TitlePageProps) => {
//   const isDevelops = verb === "<Develops/>";
//   const fontClass = isDevelops ? 'font-fira-code' : 'font-sans'
  
  return (
    <section className="bg-transparent relative">
      <div className="min-h-screen flex flex-col items-center justify-center text-white text-center px-4 relative pb-20">
          <img 
              src={imgSrc || SneakyLogo} 
              alt={imgAlt || "Sneaky's profile"} 
              className="w-32 h-32 sm:w-40 sm:h-40 md:w-56 md:h-56 lg:w-64 lg:h-64 mb-4 rounded-full shadow-lg hover:scale-105 transition-transform duration-300 ease-in-out object-cover" 
          />
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-8xl font-bold text-center pb-4 min-h-[80px] sm:min-h-[100px] md:min-h-[120px] flex items-center justify-center">
              <div className="relative inline-flex items-center">
                  <span className="block">Sneaky{" "}</span>
                  <div className="pl-4 sm:pl-5">
                      <TextAnimationComponent 
                          text={verb}
                          colour={colour}
                          loop={!!loop}
                          delay={200}
                      />
                  </div>
              </div>
          </div>
          <p className="max-w-xl sm:max-w-2xl md:max-w-4xl pt-2 mb-8 text-base sm:text-lg md:text-xl">
              Nana Adepa Nuamah "Sneaky" Adjei's portfolio website.
          </p>
          
          {/* Scroll indicator - only visible on this section */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
              <div className="flex flex-col items-center animate-bounce">
                  <span className="text-xs sm:text-sm mb-2 opacity-70">Scroll for more</span>
                  <svg 
                      className="w-5 h-5 sm:w-6 sm:h-6 opacity-70" 
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
  );
};

export default TitlePage;