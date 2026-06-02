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
      {/* Highly synchronized cinematic grid-emergence keyframes and global animations */}
      <style>{`
        @keyframes gridEmergence {
          0% {
            opacity: 0;
            transform: scale(0.3);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-grid-emergence {
          transform-origin: center;
          animation: gridEmergence 1300ms cubic-bezier(0.4, 0, 1, 1) 1700ms both;
        }

        /* Premium hardware-accelerated crisper playback for background videos */
        .premium-video-render {
          image-rendering: -webkit-optimize-contrast;
          image-rendering: auto;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          transform: translate3d(0, 0, 0);
          will-change: opacity;
        }
      `}</style>

      {/* Subtle red neon radial respray watermark */}
      <div 
        className={`absolute inset-0 pointer-events-none z-10 transition-opacity duration-1000 ${
          showVideo2 ? "opacity-30" : "opacity-15"
        }`}
        style={{
          background: "radial-gradient(circle at center, rgba(180, 30, 30, 0.45) 0%, transparent 80%)",
          mixBlendMode: "screen"
        }}
      />

      {/* Subtle eye-friendly theater tint overlay to tone down harsh reflections and glare */}
      <div className="absolute inset-0 bg-[#030305]/25 pointer-events-none z-10" />

      {/* Video 1 (Introducción - Silla de Director, Cámara y Claqueta) */}
      <video
        ref={video1Ref}
        autoPlay
        muted
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out z-0 premium-video-render brightness-[1.08] contrast-[1.05] ${
          showVideo2 ? "opacity-0 pointer-events-none" : "opacity-[0.88]"
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
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out z-0 premium-video-render ${
          showVideo2 ? "opacity-[0.52]" : "opacity-0 pointer-events-none"
        }`}
      >
        <source src="https://res.cloudinary.com/dz2olvb1m/video/upload/v1780380932/Video_2_vlw4d5.mp4" type="video/mp4" />
        <source src="/video2.mp4" type="video/mp4" />
        <source src="https://assets.mixkit.co/videos/preview/mixkit-space-nebula-background-41483-large.mp4" type="video/mp4" />
      </video>

      {/* Pitch Dark Edge Vignette to frame content cleanly and isolate text readability */}
      <div className={`absolute inset-0 bg-gradient-to-t from-[#030305] via-transparent to-[#030305] transition-opacity duration-1000 ${
        showVideo2 ? "opacity-[0.85]" : "opacity-[0.40]"
      }`} />
      <div className={`absolute inset-0 bg-gradient-to-r from-[#030305] via-transparent to-[#030305]/5 transition-opacity duration-1000 ${
        showVideo2 ? "opacity-[0.85]" : "opacity-[0.40]"
      }`} />
    </div>
  );
};
