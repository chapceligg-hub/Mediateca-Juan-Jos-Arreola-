import React, { useMemo, useState, useEffect, useRef } from "react";

interface CinematicBackgroundProps {
  selectedGenre?: string;
}

export const CinematicBackground: React.FC<CinematicBackgroundProps> = ({ selectedGenre = "Todos" }) => {
  const [showVideo2, setShowVideo2] = useState(false);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // 1. Reset state
    setShowVideo2(false);

    // 2. Play Video 1 from second zero with source reloading
    const v1 = video1Ref.current;
    if (v1) {
      try {
        v1.load();
        v1.currentTime = 0;
        v1.play().catch((err) => console.log("Video 1 playback caught:", err));
      } catch (err) {
        console.log("Video 1 load err:", err);
      }
    }

    // 3. Preplay / Play Video 2 from second zero with source reloading
    const v2 = video2Ref.current;
    if (v2) {
      try {
        v2.load();
        v2.currentTime = 0;
        v2.play().catch((err) => console.log("Video 2 playback caught:", err));
      } catch (err) {
        console.log("Video 2 load err:", err);
      }
    }

    // 4. Timer at exactly 3000ms leads to a crossfade transition to Video 2
    const timer = setTimeout(() => {
      setShowVideo2(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [selectedGenre]);

  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-72 z-0 pointer-events-none overflow-hidden select-none bg-[#030305]" id="cinematic-background">
      {/* Video 1 (Introducción - Silla de Director, Cámara y Claqueta) */}
      <video
        ref={video1Ref}
        autoPlay
        muted
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-contain object-center transition-opacity duration-1000 ease-in-out z-0 ${
          showVideo2 ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <source src="https://res.cloudinary.com/dz2olvb1m/video/upload/v1780380884/Video_1_redblc.mp4" type="video/mp4" />
        <source src="/video1.mp4" type="video/mp4" />
        <source src="https://assets.mixkit.co/videos/preview/mixkit-clapperboard-on-a-movie-set-41945-large.mp4" type="video/mp4" />
      </video>

      {/* Video 2 (Bucle Infinito - Nebulosa Cósmica Roja) */}
      <video
        ref={video2Ref}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-contain object-center transition-opacity duration-1000 ease-in-out z-0 ${
          showVideo2 ? "opacity-[0.35]" : "opacity-0 pointer-events-none"
        }`}
      >
        <source src="https://res.cloudinary.com/dz2olvb1m/video/upload/v1780380932/Video_2_vlw4d5.mp4" type="video/mp4" />
        <source src="/video2.mp4" type="video/mp4" />
        <source src="https://assets.mixkit.co/videos/preview/mixkit-space-nebula-background-41483-large.mp4" type="video/mp4" />
      </video>

      {/* Pitch Dark Edge Vignette to frame content cleanly and isolate text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#030305]/95 via-transparent to-[#030305]/95" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#030305]/95 via-transparent to-[#030305]/5" />
    </div>
  );
};
