import { useState } from 'react';

type TimelineEvent = {
    id: number;
    year: string;
    title: string;
    location: string;
    description: string;
    image: string;
    details: string;
    icon: string;
}

const LifeTimeline = () => {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const timelineEvents: TimelineEvent[] = [
  {
    id: 1,
    year: "2004",
    title: "Born",
    location: "Plymouth, UK",
    description: "Spawned into existence in the southwest coast of England.",
    image: "/plymouth.jpg",
    details: "Born in Plymouth, UK—where the journey truly began.",
    icon: "🍼"
  },
  {
    id: 2,
    year: "2015",
    title: "Started Programming",
    location: "Plymouth College",
    description: "Broke out of Scratch and started real coding with Python.",
    image: "/plymouth college.jpg",
    details: "Started using Python in Computer Science at Plymouth College, where I quickly became one of the top-performing students.",
    icon: "💻"
  },
  {
    id: 3,
    year: "2020",
    title: "Sixth Form at DHSG",
    location: "Devonport High School for Girls",
    description: "Enrolled in sixth form at DHSG—yes, it's mixed.",
    image: "/dhsg.jpg",
    details: "Took Computer Science (A*), Maths (B), and Physics (B). Also wrote an EPQ on whether quantum computers will replace classical ones.",
    icon: "📚"
  },
  {
    id: 4,
    year: "2022",
    title: "University Begins",
    location: "University of Portsmouth",
    description: "Started studying Software Engineering at uni.",
    image: "/portsmouth.jpg",
    details: "In my first year, I got the top project mark for 'Pet-Ascension'. The code may be rough, but the vibes were immaculate.",
    icon: "🎓"
  },
  {
    id: 5,
    year: "2023",
    title: "Another First-Class Project",
    location: "University of Portsmouth",
    description: "Built You're Fat Stop That, earned a first-class grade.",
    image: "/programming.jpg",
    details: "Developed a web app that was cheeky in title but solid in execution. Earned another top mark.",
    icon: "🏅"
  },
  {
    id: 6,
    year: "2024",
    title: "Internship & OCE-4 Mans",
    location: "MarineAI + Online",
    description: "Started my placement year + built a Rocket League platform.",
    image: "/Marine AI.jpg",
    details: "Began an internship at MarineAI working on real-world software systems, while also launching OCE-4 Mans—a competitive matchmaking platform for Rocket League players.",
    icon: "🚀"
  },
  {
    id: 7,
    year: "2025",
    title: "Still Placing, Still Cooking",
    location: "MarineAI",
    description: "Currently completing my placement year and prepping for final year.",
    image: "/Marine AI title.jpg",
    details: "Wrapping up my internship and getting ready to enter final year at uni—more projects, more coffee, more chaos incoming.",
    icon: "⚙️"
  }
];


  const handleEventClick = (event: TimelineEvent) => {
    setSelectedEvent(selectedEvent?.id === event.id ? null : event);
  };

  return (
    <section className="text-white py-8 md:py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl lg:text-6xl font-bold text-center mb-8 md:mb-16">
          My <span className="text-blue-400">Journey</span>
        </h2>
        
        <div className="relative">
          <div className="absolute left-8 md:left-1/2 md:transform md:-translate-x-1/2 w-1 bg-gradient-to-b from-blue-400 via-purple-500 to-pink-500 h-full"></div>
          
          <div className="space-y-8 md:space-y-16">
            {timelineEvents.map((event, index) => (
              <div key={event.id} className="relative">
                <div className="absolute left-8 md:left-1/2 transform -translate-x-1/2 w-4 h-4 md:w-6 md:h-6 bg-white rounded-full border-2 md:border-4 border-blue-400 z-10 shadow-lg">
                  <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20"></div>
                </div>
                
                <div className={`md:flex md:items-center ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} md:gap-8`}>
                  <div className={`w-full md:w-1/2 pl-16 md:pl-0 ${index % 2 === 0 ? 'md:text-right md:pr-8' : 'md:text-left md:pl-8'}`}>
                    <div 
                      className={`bg-gray-800 rounded-lg p-4 md:p-6 shadow-xl cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-gray-700 hover:border-blue-400 ${
                        selectedEvent?.id === event.id ? 'ring-2 ring-blue-400 scale-105' : ''
                      }`}
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xl md:text-2xl">{event.icon}</span>
                        <span className="text-blue-400 font-bold text-base md:text-lg">{event.year}</span>
                      </div>
                      <h3 className="text-lg md:text-xl font-bold mb-2">{event.title}</h3>
                      <p className="text-gray-300 text-xs md:text-sm mb-2">{event.location}</p>
                      <p className="text-gray-400 text-sm md:text-base">{event.description}</p>
                      <div className="mt-3 md:mt-4 text-blue-400 text-xs md:text-sm font-medium">
                        Tap for more details →
                      </div>
                    </div>
                  </div>
                  
                  <div className="hidden md:block md:w-1/2">
                    <div className="relative">
                      <img 
                        src={event.image} 
                        alt={event.title}
                        className="w-full h-48 object-cover rounded-lg shadow-lg"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-lg"></div>
                    </div>
                  </div>
                </div>
                
                <div className="hidden md:block">
                  {index % 2 === 0 ? (
                    // Right arrow
                    <div className="absolute left-1/2 top-1/2 transform -translate-y-1/2 ml-6">
                      <div className="w-0 h-0 border-l-[20px] border-l-blue-400 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent"></div>
                    </div>
                  ) : (
                    // Left arrow
                    <div className="absolute left-1/2 top-1/2 transform -translate-y-1/2 -ml-6">
                      <div className="w-0 h-0 border-r-[20px] border-r-blue-400 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent"></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {selectedEvent && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 md:p-4 z-50">
            <div className="bg-gray-800 rounded-lg p-4 md:p-8 max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto m-2">
              <div className="flex items-start justify-between mb-4 md:mb-6">
                <div className="flex items-center gap-3 flex-1 pr-4">
                  <span className="text-2xl md:text-3xl">{selectedEvent.icon}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl md:text-2xl font-bold truncate">{selectedEvent.title}</h3>
                    <p className="text-blue-400 font-medium text-sm md:text-base">{selectedEvent.year} • {selectedEvent.location}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-400 hover:text-white text-2xl md:text-3xl flex-shrink-0 w-8 h-8 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
              
              <img 
                src={selectedEvent.image} 
                alt={selectedEvent.title}
                className="w-full h-48 md:h-64 object-cover rounded-lg mb-4 md:mb-6"
              />
              
              <p className="text-gray-300 leading-relaxed text-base md:text-lg mb-4">
                {selectedEvent.details}
              </p>
              
              <div className="pt-4 border-t border-gray-700">
                <p className="text-sm text-gray-400">
                  {selectedEvent.description}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default LifeTimeline;