import useTypewriter from "../hooks/UseTypewriter";

const TypewriterText = ({ 
  text = "", 
  speed = 100, 
  delay = 500, 
  colour = "#ae34eb",
  className = "",
  showCursor = true,
  cursorChar = "|"
}) => {
  const { displayedText, isDeleting, isCompleted } = useTypewriter(text, speed, delay);

  return (
    <span 
      className={`${className} font-fira-code font-thin whitespace-nowrap inline-block`} 
      style={{ color: colour }}
    >
      <span className="inline-block">
        {displayedText}
      </span>
      {showCursor && (
        <span className={`font-light inline-block ${isCompleted && !isDeleting ? 'animate-pulse' : 'animate-pulse'}`}>
          {cursorChar}
        </span>
      )}
    </span>
  );
};

export default TypewriterText;