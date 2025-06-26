import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

type NavbarProps = {
  className?: string
}

const Navbar = ({ className }: NavbarProps) => {
  const location = useLocation();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const navItems = [
    { path: '/', label: 'Home', color: 'rainbow' },
    { path: '/developer', label: 'Developer', color: '#00ff88' },
    { path: '/entertainer', label: 'Entertainer', color: '#ff6b6b' },
    { path: '/musician', label: 'Musician', color: '#4ecdc4' }
  ];

  const activeIndex = navItems.findIndex(item => item.path === location.pathname);
  const currentActiveIndex = hoveredIndex !== null ? hoveredIndex : (activeIndex !== -1 ? activeIndex : 0);

  const getUnderlineStyle = (index: number) => {
    const isActive = index === currentActiveIndex;
    const item = navItems[index];
    
    if (!isActive) return {};
    
    if (item.color === 'rainbow') {
      return {
        background: 'linear-gradient(90deg, #00ff88, #ff6b6b, #4ecdc4,)',
        backgroundSize: '200% 100%',
        animation: 'rainbow-slide 4s ease-in-out infinite'
      };
    }
    
    return {
      backgroundColor: item.color,
      boxShadow: `0 0 20px ${item.color}40, 0 0 40px ${item.color}20`
    };
  };

  const getTextStyle = (index: number) => {
    const isActive = index === currentActiveIndex;
    const item = navItems[index];
    
    if (!isActive) return { color: '#e5e7eb' };
    
    if (item.color === 'rainbow') {
      return {
        background: 'linear-gradient(90deg, #00ff88, #ff6b6b, #4ecdc4)',
        backgroundSize: '200% 100%',
        animation: 'rainbow-slide 4s ease-in-out infinite',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        textShadow: '0 0 30px rgba(255,255,255,0.3)'
      };
    }
    
    return {
      color: item.color,
      textShadow: `0 0 20px ${item.color}60`
    };
  };

  const getGlowStyle = (index: number) => {
    const isActive = index === currentActiveIndex;
    const item = navItems[index];
    
    if (!isActive) return {};
    
    if (item.color === 'rainbow') {
      return {
        background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
        filter: 'blur(10px)'
      };
    }
    
    return {
      background: `radial-gradient(circle, ${item.color}15 0%, transparent 70%)`,
      filter: 'blur(8px)'
    };
  };

  const handleMobileNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className={`w-full ${className ?? ''}`}>
      <style>{`
        @keyframes rainbow-slide {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .mobile-menu-enter {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
      
      <nav className="w-full bg-gradient-to-b from-gray-900 to-black">
        <div className="hidden md:flex justify-center p-8">
          <div className="relative flex gap-12">
            {navItems.map((item, index) => (
              <div key={item.path} className="relative">
                <div
                  className={`absolute inset-0 -m-2 rounded-full transition-all duration-500 ${
                    currentActiveIndex === index ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={getGlowStyle(index)}
                />
                
                <Link
                  to={item.path}
                  className="relative block px-4 py-2 text-lg font-semibold transition-all duration-300 hover:scale-105 cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <span 
                    className="relative z-10 transition-all duration-300"
                    style={getTextStyle(index)}
                  >
                    {item.label}
                  </span>
                  
                  <div
                    className={`absolute -bottom-1 left-0 h-0.5 w-full transform transition-all duration-300 ease-out rounded-full ${
                      currentActiveIndex === index ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                    }`}
                    style={getUnderlineStyle(index)}
                  />
                  
                  <div
                    className={`absolute -top-1 left-1/2 h-0.5 w-8 transform -translate-x-1/2 transition-all duration-300 ease-out rounded-full ${
                      currentActiveIndex === index ? 'scale-x-100 opacity-60' : 'scale-x-0 opacity-0'
                    }`}
                    style={getUnderlineStyle(index)}
                  />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          {/* Mobile Header */}
          <div className="flex justify-between items-center p-4">
            <div className="text-xl font-bold text-white">
              <span style={getTextStyle(activeIndex !== -1 ? activeIndex : 0)}>
                {navItems[activeIndex !== -1 ? activeIndex : 0].label}
              </span>
            </div>
            
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="Toggle menu"
            >
              <div className="w-6 h-6 flex flex-col justify-center items-center">
                <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${
                  isMobileMenuOpen ? 'rotate-45 translate-y-0.5' : '-translate-y-1'
                }`}></span>
                <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${
                  isMobileMenuOpen ? 'opacity-0' : 'opacity-100'
                }`}></span>
                <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${
                  isMobileMenuOpen ? '-rotate-45 -translate-y-0.5' : 'translate-y-1'
                }`}></span>
              </div>
            </button>
          </div>
  
          {isMobileMenuOpen && (
            <div className="mobile-menu-enter border-t border-gray-800">
              <div className="px-4 py-2 space-y-1">
                {navItems.map((item, index) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={handleMobileNavClick}
                    className="block px-4 py-3 text-lg font-medium transition-all duration-200 rounded-lg hover:bg-gray-800"
                  >
                    <div className="relative">
                      <span 
                        className="transition-all duration-300"
                        style={activeIndex === index ? getTextStyle(index) : { color: '#e5e7eb' }}
                      >
                        {item.label}
                      </span>
                      
                      {activeIndex === index && (
                        <div
                          className="absolute -bottom-1 left-0 h-0.5 w-full rounded-full"
                          style={getUnderlineStyle(index)}
                        />
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}

export default Navbar;