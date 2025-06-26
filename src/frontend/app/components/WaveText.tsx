import useWaveText from "../hooks/useWaveText.tsx";

type WaveTextProps = {
  text: string,
  colour: string,
  delay: number
}
const WaveText = ({ text, colour, delay = 0 } : WaveTextProps) => {
  const { activeIndex, isVisible } = useWaveText(text, delay);

  return (
    <span 
      style={{ color: colour }} 
      className={`font-bold transition-all duration-500 ease-out whitespace-nowrap  ${
        isVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'
      }`}
    >
      {text.split('').map((char: string, index: number) => (
        <span
          key={index}
          className={`inline-block transition-all duration-300 ease-out ${
            activeIndex === index 
              ? 'transform -translate-y-2 scale-110' 
              : 'transform translate-y-0 scale-100'
          }`}
          style={{
            textShadow: activeIndex === index 
              ? `0 0 10px ${colour}` 
              : 'none'
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
};

export default WaveText;