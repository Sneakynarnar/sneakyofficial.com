import React from 'react';

type SectionProps = {
  title: string;
  children: React.ReactNode;
  bg?: string;
  imgSrc?: string; 
  imgAlt?: string; 
};

const Section = ({ 
    title,
    children,
    bg = "bg-transparent",
    imgSrc,
    imgAlt = "Section Image"
}: SectionProps) => {
  return (
    <section className={`w-full ${bg}  flex justify-start items-start`}>
      <div className="max-w-6xl py-16 px-6 mx-auto flex flex-col lg:flex-row items-start gap-12">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6 border-b border-gray-700 text-white">
            {title}
            </h2>
          <div className="text-gray-300 space-y-6">{children}</div>

    </div>

    {imgSrc && (
        <div className="flex-1">
            <img
            src={imgSrc}
            alt={imgAlt}
            className="w-full h-auto rounded-lg shadow-lg"
            />
        </div>
    )}
        </div>
      </div>
    </section>
  );
};

export default Section;