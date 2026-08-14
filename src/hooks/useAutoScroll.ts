import React, { useRef, useEffect } from 'react';

export function useAutoScroll(disabled: boolean = false) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAnimationFrame = useRef<number | null>(null);
  const scrollIntensity = useRef<number>(0);

  const startScrolling = () => {
    if (disabled) return;
    if (scrollAnimationFrame.current === null) {
      const scrollStep = () => {
        if (containerRef.current && scrollIntensity.current !== 0) {
          containerRef.current.scrollLeft += scrollIntensity.current;
        }
        scrollAnimationFrame.current = requestAnimationFrame(scrollStep);
      };
      scrollAnimationFrame.current = requestAnimationFrame(scrollStep);
    }
  };

  const stopScrolling = () => {
    if (scrollAnimationFrame.current !== null) {
      cancelAnimationFrame(scrollAnimationFrame.current);
      scrollAnimationFrame.current = null;
    }
    scrollIntensity.current = 0;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      stopScrolling();
      return;
    }

    const isMobileOrTablet = typeof window !== 'undefined' && 
      (window.innerWidth < 1024 || window.matchMedia('(pointer: coarse)').matches);
    if (isMobileOrTablet) return;

    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const maxScrollSpeed = 10;
    const threshold = width * 0.2; // 20% de los bordes activa el scroll

    if (x < threshold) {
      const intensity = (threshold - x) / threshold;
      scrollIntensity.current = -maxScrollSpeed * Math.pow(intensity, 1.5);
    } else if (x > width - threshold) {
      const intensity = (x - (width - threshold)) / threshold;
      scrollIntensity.current = maxScrollSpeed * Math.pow(intensity, 1.5);
    } else {
      scrollIntensity.current = 0;
    }
    
    startScrolling();
  };

  const handleMouseLeave = () => {
    stopScrolling();
  };

  useEffect(() => {
    if (disabled) {
      stopScrolling();
    }
  }, [disabled]);

  useEffect(() => {
    return () => stopScrolling();
  }, []);

  return { containerRef, handleMouseMove, handleMouseLeave, stopScrolling };
}
