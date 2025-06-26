import useSlideIn from "../hooks/UseSlideIn";

type SlideInTextProps = {
  text: string
  colour: string
  delay: number
}

const SlideInText = ({ text, colour, delay = 0 } : SlideInTextProps) => {
  const isVisible = useSlideIn(text, delay);

  return (
    <span 
      className={`inline-block transition-transform duration-700 ease-out font-bold whitespace-nowrap ${
        isVisible ? 'translate-x-0' : 'translate-x-8'
      }`}
      style={{ color: colour }}
    >
      {text}
    </span>
  );
};

export default SlideInText;