import React, { useRef, useEffect } from 'react';

export function useAutoScrollVertical() {
  const containerRef = useRef<HTMLElement>(null);
  const scrollAnimationFrame = useRef<number | null>(null);
  const scrollIntensity = useRef<number>(0);

  const startScrolling = () => {
    if (scrollAnimationFrame.current === null) {
      const scrollStep = () => {
        if (containerRef.current && scrollIntensity.current !== 0) {
          containerRef.current.scrollTop += scrollIntensity.current;
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

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const isMobileOrTablet = typeof window !== 'undefined' && 
      (window.innerWidth < 1024 || window.matchMedia('(pointer: coarse)').matches);
    if (isMobileOrTablet) return;

    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    const maxScrollSpeed = 15;
    const threshold = height * 0.15; // 15% from top/bottom

    if (y < threshold) {
      const intensity = (threshold - y) / threshold;
      scrollIntensity.current = -maxScrollSpeed * Math.pow(intensity, 1.5);
    } else if (y > height - threshold) {
      const intensity = (y - (height - threshold)) / threshold;
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
    return () => stopScrolling();
  }, []);

  return { containerRef, handleMouseMove, handleMouseLeave };
}
