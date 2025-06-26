import { useState, useEffect } from "react";

const useTypewriter = (
  text: string,
  speed = 80,
  delay = 0,
  deleteSpeed = 50,
  pauseTime = 2000,
  loop = true
) => {
  const [displayedText, setDisplayedText] = useState("");
  const [phase, setPhase] = useState("waiting"); // waiting, typing, paused, deleting, finished
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    setDisplayedText("");
    setPhase("waiting");
    setCharIndex(0);
  }, [text]);

  useEffect(() => {
    if (phase === "waiting") {
      const timer = setTimeout(() => {
        setPhase("typing");
        setCharIndex(0);
      }, delay);
      return () => clearTimeout(timer);
    }

    if (phase === "typing") {
      if (charIndex < text.length) {
        const timer = setTimeout(() => {
          setDisplayedText(text.substring(0, charIndex + 1));
          setCharIndex((prev) => prev + 1);
        }, speed);
        return () => clearTimeout(timer);
      } else {
        // Finished typing, pause then start deleting
        const timer = setTimeout(() => {
          setPhase("deleting");
        }, pauseTime);
        return () => clearTimeout(timer);
      }
    }

    if (phase === "deleting") {
      if (displayedText.length > 0) {
        const timer = setTimeout(() => {
          setDisplayedText((prev) => prev.substring(0, prev.length - 1));
        }, deleteSpeed);
        return () => clearTimeout(timer);
      } else {
        if (loop) {
          setPhase("waiting");
        } else {
          setPhase("finished");
        }
      }
    }
  }, [
    phase,
    charIndex,
    displayedText,
    text,
    speed,
    delay,
    deleteSpeed,
    pauseTime,
    loop,
  ]);

  return {
    displayedText,
    isCompleted:
      phase === "paused" || (phase === "typing" && charIndex >= text.length),
    isDeleting: phase === "deleting",
    isFinished: phase === "finished",
  };
};

export default useTypewriter;