import { useState, useEffect } from "react";

const useWaveText = (text: string, delay: number = 0, cycleDuration: number = 3000) => {
  const [phase, setPhase] = useState("waiting"); // waiting, appearing, entering, active, exiting
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setPhase("waiting");
    setActiveIndex(-1);
    setIsVisible(false);

    const startTimer = setTimeout(() => {
      setPhase("appearing");
      setIsVisible(true);

      setTimeout(() => {
        setPhase("entering");
      }, 500); //
    }, delay);

    return () => clearTimeout(startTimer);
  }, [text, delay]);

  useEffect(() => {
    if (phase === "entering") {
      // Enter wave effect
      let index = 0;
      const enterInterval = setInterval(() => {
        setActiveIndex(index);
        index++;
        if (index >= text.length) {
          clearInterval(enterInterval);
          setActiveIndex(-1); // Stop glowing
          setPhase("active");

          setTimeout(() => {
            setPhase("exiting");
          }, cycleDuration * 0.3); 
        }
      }, 80);

      return () => clearInterval(enterInterval);
    } else if (phase === "exiting") {
      let index = text.length - 1;
      const exitInterval = setInterval(() => {
        setActiveIndex(index);
        index--;
        if (index < 0) {
          clearInterval(exitInterval);
          setActiveIndex(-1);
          setPhase("waiting");
        }
      }, 60);

      return () => clearInterval(exitInterval);
    }
  }, [phase, text.length, cycleDuration]);

  return { activeIndex, phase, isVisible };
};

export default useWaveText;