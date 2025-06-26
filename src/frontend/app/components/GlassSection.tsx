import React from 'react';

interface GlassSectionProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  imgSrc?: string;
  imgAlt?: string;
}

const GlassSection: React.FC<GlassSectionProps> = ({ 
  children, 
  className = "", 
  title,
  imgSrc,
  imgAlt 
}) => {
  return (
    <section className={`
      relative w-full py-16 px-4 sm:px-6 lg:px-8
      bg-white/8 backdrop-blur-md
      border-y border-white/15
      ${className}
    `}>
      <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-transparent to-white/5 pointer-events-none" />
      
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-start gap-12">
          <div className="flex-1 order-2 lg:order-1">
            {title && (
              <h2 className="text-4xl lg:text-5xl font-bold text-white mb-8 drop-shadow-lg">
                {title}
              </h2>
            )}
            
            <div className="text-white/90 space-y-6 text-lg leading-relaxed">
              {children}
            </div>
          </div>
          
          {imgSrc && (
            <div className="flex-shrink-0 order-1 lg:order-2">
              <img 
                src={imgSrc} 
                alt={imgAlt || ""} 
                className="w-50 h-50 lg:w-100 lg:h-100 rounded-full object-cover border-4 border-white/30 shadow-xl mx-auto"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default GlassSection;