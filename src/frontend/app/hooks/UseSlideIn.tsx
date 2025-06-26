import { useState, useEffect } from "react";

const useSlideIn = (text: string, delay: number = 0) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(false);
    
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [text, delay]);

  return isVisible;
};

export default useSlideIn;