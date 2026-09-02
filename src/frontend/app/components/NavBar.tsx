import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

type NavbarProps = {
  className?: string;
};

const NAV_ITEMS = [
  { path: '/', label: 'Home', color: 'rainbow', external: false },
  { path: '/developer', label: 'Developer', color: '#00ff88', external: false },
  { path: '/entertainer', label: 'Entertainer', color: '#ff6b6b', external: false },
  { path: '/musician', label: 'Musician', color: '#4ecdc4', external: false },
  // Splatdle has its own domain now, so this one leaves the app.
  { path: 'https://splatdle.ink', label: 'Splatdle', color: '#f97316', external: true },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

/** A nav entry, routed in-app or handed to the browser for another site. */
function NavItemLink({
  item, className, onClick, onMouseEnter, onMouseLeave, children,
}: {
  item: NavItem;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}) {
  const props = { className, onClick, onMouseEnter, onMouseLeave };
  return item.external
    ? <a href={item.path} {...props}>{children}</a>
    : <Link to={item.path} {...props}>{children}</Link>;
}

function getUnderlineStyle(item: NavItem, isActive: boolean): React.CSSProperties {
  if (!isActive) return {};
  if (item.color === 'rainbow') {
    return {
      background: 'linear-gradient(90deg, #00ff88, #ff6b6b, #4ecdc4)',
      backgroundSize: '200% 100%',
      animation: 'rainbow-slide 4s ease-in-out infinite',
    };
  }
  return {
    backgroundColor: item.color,
    boxShadow: `0 0 20px ${item.color}40, 0 0 40px ${item.color}20`,
  };
}

function getTextStyle(item: NavItem, isActive: boolean): React.CSSProperties {
  if (!isActive) return { color: '#cbd5e1' };
  if (item.color === 'rainbow') {
    return {
      background: 'linear-gradient(90deg, #00ff88, #ff6b6b, #4ecdc4)',
      backgroundSize: '200% 100%',
      animation: 'rainbow-slide 4s ease-in-out infinite',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    };
  }
  return {
    color: item.color,
    textShadow: `0 0 16px ${item.color}60`,
  };
}

const Navbar = ({ className }: NavbarProps) => {
  const location = useLocation();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const activeIndex = NAV_ITEMS.findIndex(item => item.path === location.pathname);
  const displayIndex = hoveredIndex !== null ? hoveredIndex : (activeIndex !== -1 ? activeIndex : 0);

  return (
    <div className={`w-full ${className ?? ''}`}>
      <nav className="w-full glass-dark border-b border-white/10">
        {/* Desktop */}
        <div className="hidden md:flex justify-center py-5 px-8">
          <div className="flex gap-10">
            {NAV_ITEMS.map((item, index) => {
              const isActive = index === displayIndex;
              return (
                <NavItemLink
                  key={item.path}
                  item={item}
                  className="relative px-3 py-2 text-sm font-semibold tracking-wide transition-all duration-300 hover:scale-105"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <span
                    className="relative z-10 transition-all duration-300"
                    style={getTextStyle(item, isActive)}
                  >
                    {item.label}
                  </span>
                  <div
                    className={`absolute -bottom-1 left-0 h-0.5 w-full rounded-full transition-all duration-300 ${
                      isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                    }`}
                    style={getUnderlineStyle(item, isActive)}
                  />
                </NavItemLink>
              );
            })}
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <div className="flex justify-between items-center px-4 py-4">
            <span
              className="text-base font-semibold"
              style={getTextStyle(
                NAV_ITEMS[activeIndex !== -1 ? activeIndex : 0],
                true
              )}
            >
              {NAV_ITEMS[activeIndex !== -1 ? activeIndex : 0].label}
            </span>
            <button
              onClick={() => setIsMobileMenuOpen(prev => !prev)}
              className="text-slate-300 p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {isMobileMenuOpen && (
            <div className="animate-fade-in-up border-t border-white/10 px-4 py-2 space-y-1">
              {NAV_ITEMS.map((item, index) => {
                const isActive = activeIndex === index;
                return (
                  <NavItemLink
                    key={item.path}
                    item={item}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-3 text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <span style={getTextStyle(item, isActive)}>{item.label}</span>
                  </NavItemLink>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
