// Modificaciones completas a App.tsx basadas en el diseño original del usuario
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Film, Star, Clock, User, Calendar, X, Plus, Edit2, Check, Trash2, Video,
  Sparkles, Loader2, AlertTriangle, Clapperboard, MonitorPlay, Trophy, Quote as QuoteIcon, 
  Zap, ImageIcon, Landmark, History as HistoryIcon, Type, ChevronRight, ChevronLeft, ChevronDown, Globe, 
  DatabaseBackup, LogIn, LogOut, MapPin, Quote, ShieldAlert, Copy, ClipboardPaste, Upload, Download,
  ArrowDownAZ, CalendarDays, LayoutGrid, Users, Menu, Eye, Library, ClipboardList, FilePlus2, Music, Tv,
  Play, Compass, Heart, Skull, Smile, Laugh, Fingerprint, Flame, Sun, Moon, BookOpen, Shield, Orbit, Flag, Activity,
  Award, Palette, Swords, Rocket, HeartCrack, Home, Wand2, HelpCircle, Mountain
} from 'lucide-react';
import { 
  getAdminByEmail, initAuth, signInWithGoogle, logout, onAuthStateChanged,
  upsertMovie, updateMovie, deleteMovie, upsertAdmin, deleteAdmin,
  fetchMoviesOptimized, fetchAdminsOptimized, generateMovieId, subscribeToMovies, getCachedMovies
} from './lib/firebase';
import { Movie, Quote as QuoteType } from './types';
import { ALPHABET, YEAR_RANGES, DEMO_POSTER } from './constants';
import { catalogMovieAI, fetchIconicQuote } from './lib/aiService';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAutoScrollVertical } from './hooks/useAutoScrollVertical';
import { CinematicBackground } from './components/CinematicBackground';
import emptyChairImage from './assets/images/cinematic_director_chair_red_1782020262837.jpg';

const toTitleCase = (str: string): string => {
  if (!str) return '';
  
  // Clean multiple spaces and trim
  const cleanStr = str.replace(/\s+/g, ' ').trim();
  
  // If the title is already in mixed case (contains both uppercase and lowercase letters),
  // we assume it is already professionally formatted and we return it as is.
  const hasUppercase = /[A-ZÑÁÉÍÓÚ]/.test(cleanStr);
  const hasLowercase = /[a-zñáéíóú]/.test(cleanStr);
  
  if (hasUppercase && hasLowercase) {
    return cleanStr;
  }
  
  // If it is all uppercase or all lowercase, let's apply high-level grammatical title case rules.
  const words = cleanStr.toLowerCase().split(' ');
  const spanishMinors = ["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "en", "y", "o", "u", "con", "por", "para", "a", "e", "ni", "que", "sin", "desde", "hasta", "contra", "sobre", "tras"];
  const englishMinors = ["the", "a", "an", "and", "but", "or", "nor", "for", "at", "by", "of", "in", "to", "on", "with", "from", "into", "onto", "as", "about"];
  const minorWords = new Set([...spanishMinors, ...englishMinors]);
  
  const formattedWords = words.map((word, index) => {
    if (!word) return '';
    
    // Check if the word is a roman numeral (e.g., i, ii, iii, iv, v, vi, vii, viii, ix, x, etc.)
    const isRoman = /^[ivxldcm]+$/.test(word);
    if (isRoman) {
      return word.toUpperCase();
    }
    
    // Keep minor words lowercase, EXCEPT if it is the first word, or if it follows punctuation (like : - . )
    const isFirstWord = index === 0;
    let isAfterPunctuation = false;
    if (index > 0) {
      const prevWord = words[index - 1];
      if (prevWord.endsWith(':') || prevWord.endsWith('-') || prevWord.endsWith('.')) {
        isAfterPunctuation = true;
      }
    }
    
    if (minorWords.has(word) && !isFirstWord && !isAfterPunctuation) {
      return word;
    }
    
    // Capitalize first letter
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  
  return formattedWords.join(' ');
};

const getGenrePillClasses = (genreStr: string): { bg: string, text: string, border: string } => {
  const normalized = genreStr.toLowerCase().trim();
  
  // 1. CIENCIA FICCIÓN / SCI-FI
  if (normalized.includes('sci-fi') || normalized.includes('scifi') || normalized.includes('ciencia ficción') || normalized.includes('ciencia ficcion')) {
    return { bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' }; // Emerald
  }
  // 2. FANTASÍA / FANTÁSTICO / FANTASY
  if (normalized.includes('fantasía') || normalized.includes('fantasia') || normalized.includes('fantástico') || normalized.includes('fantastico') || normalized.includes('fantasy')) {
    return { bg: 'rgba(99, 102, 241, 0.12)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)' }; // Indigo
  }
  // 3. ACCIÓN / ACTION
  if (normalized.includes('acción') || normalized.includes('accion') || normalized.includes('action')) {
    return { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' }; // Purple
  }
  // 4. AVENTURA / ADVENTURE
  if (normalized.includes('aventura') || normalized.includes('adventure')) {
    return { bg: 'rgba(14, 165, 233, 0.12)', text: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)' }; // Sky Blue
  }
  // 5. DRAMA
  if (normalized.includes('drama')) {
    return { bg: 'rgba(249, 115, 22, 0.12)', text: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' }; // Orange
  }
  // 6. HISTÓRICO / HISTORIA / HISTORY / HISTORICO
  if (normalized.includes('histórico') || normalized.includes('historico') || normalized.includes('historia') || normalized.includes('history')) {
    return { bg: 'rgba(133, 77, 14, 0.12)', text: '#eab308', border: 'rgba(133, 77, 14, 0.3)' }; // Dark Yellow/Bronze
  }
  // 7. TERROR / HORROR / SANGRIENTO
  if (normalized.includes('terror') || normalized.includes('horror')) {
    return { bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' }; // Red
  }
  // 8. SUSPENSO / THRILLER / SUSPENSE
  if (normalized.includes('suspenso') || normalized.includes('suspense') || normalized.includes('thriller')) {
    return { bg: 'rgba(244, 63, 94, 0.12)', text: '#f472b6', border: 'rgba(244, 63, 94, 0.3)' }; // Pink/Rose
  }
  // 9. MISTERIO / MYSTERY
  if (normalized.includes('misterio') || normalized.includes('mystery')) {
    return { bg: 'rgba(217, 70, 239, 0.12)', text: '#e879f9', border: 'rgba(217, 70, 239, 0.3)' }; // Fuchsia
  }
  // 10. COMEDIA / COMEDY
  if (normalized.includes('comedia') || normalized.includes('comedy')) {
    return { bg: 'rgba(234, 179, 8, 0.12)', text: '#fef08a', border: 'rgba(234, 179, 8, 0.3)' }; // Light Yellow
  }
  // 11. ROMANCE / ROMÁNTICO / ROMANTICO / ROMANTIC
  if (normalized.includes('romance') || normalized.includes('románico') || normalized.includes('romántico') || normalized.includes('romantico') || normalized.includes('romantic')) {
    return { bg: 'rgba(236, 72, 153, 0.12)', text: '#fda4af', border: 'rgba(236, 72, 153, 0.3)' }; // Soft Rose
  }
  // 12. MUSICAL / MÚSICA / MUSICA / MUSIC
  if (normalized.includes('musical') || normalized.includes('música') || normalized.includes('musica') || normalized.includes('music')) {
    return { bg: 'rgba(124, 58, 237, 0.12)', text: '#a78bfa', border: 'rgba(124, 58, 237, 0.3)' }; // Violet/Purple
  }
  // 13. DOCUMENTAL / DOCUMENTARY
  if (normalized.includes('documental') || normalized.includes('documentary')) {
    return { bg: 'rgba(20, 184, 166, 0.12)', text: '#2dd4bf', border: 'rgba(20, 184, 166, 0.3)' }; // Teal
  }
  // 14. CRIMEN / POLICIAL / CRIME / POLICIACA / POLICIACO
  if (normalized.includes('crimen') || normalized.includes('crime') || normalized.includes('policial') || normalized.includes('policiaca') || normalized.includes('policiaco') || normalized.includes('police')) {
    return { bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' }; // Slate
  }
  // 15. WESTERN
  if (normalized.includes('western') || normalized.includes('vaqueros')) {
    return { bg: 'rgba(180, 83, 9, 0.12)', text: '#f59e0b', border: 'rgba(180, 83, 9, 0.3)' }; // Dark Orange/Brown
  }
  // 16. ANIMACIÓN / ANIMATION
  if (normalized.includes('animación') || normalized.includes('animacion') || normalized.includes('animation')) {
    return { bg: 'rgba(132, 204, 22, 0.12)', text: '#a3e635', border: 'rgba(132, 204, 22, 0.3)' }; // Lime
  }
  // 17. GUERRA / WAR / BÉLICO / BELICO
  if (normalized.includes('guerra') || normalized.includes('war') || normalized.includes('bélico') || normalized.includes('belico')) {
    return { bg: 'rgba(120, 113, 108, 0.12)', text: '#a8a29e', border: 'rgba(120, 113, 108, 0.3)' }; // Warm Gray / Stone
  }
  // 18. BIOGRAFÍA / REALEZA / BIOGRAPHY
  if (normalized.includes('biograf') || normalized.includes('biography')) {
    return { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' }; // Amber
  }
  // 19. FAMILIAR / FAMILIA / FAMILY
  if (normalized.includes('famil') || normalized.includes('family')) {
    return { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' }; // Green
  }
  // 20. CLÁSICO / CLASSIC
  if (normalized.includes('clásic') || normalized.includes('clasic') || normalized.includes('classic')) {
    return { bg: 'rgba(161, 161, 170, 0.12)', text: '#a1a1aa', border: 'rgba(161, 161, 170, 0.3)' }; // Zinc/Silver
  }
  // 21. DEPORTES / SPORT
  if (normalized.includes('deporte') || normalized.includes('sport')) {
    return { bg: 'rgba(6, 182, 212, 0.12)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' }; // Cyan
  }

  // Fallback: Generar color dinámico en lugar de "negro" usando hash del nombre
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return { 
    bg: `hsla(${hue}, 70%, 50%, 0.12)`, 
    text: `hsl(${hue}, 80%, 70%)`, 
    border: `hsla(${hue}, 70%, 50%, 0.3)` 
  };
};

/**
 * Normaliza un texto convirtiéndolo a minúsculas y eliminando tildes/acentos
 */
export const normalizeText = (text: string | null | undefined): string => {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

export const getNormalizedGenres = (genreData: any): string[] => {
  if (!genreData) return [];
  
  let genreStr = "";
  if (typeof genreData === 'string') {
    genreStr = genreData;
  } else if (Array.isArray(genreData)) {
    genreStr = genreData.join('/');
  } else {
    genreStr = String(genreData);
  }
  
  const parts = genreStr.split(/\s*[\/,\|;]\s*|\s+-\s+| y /);
  const ALLOWED = [
    'Clásico', 'Acción', 'Aventuras', 'Animación', 'Biografía', 'Bélico', 
    'Sci-Fi', 'Comedia', 'Crimen', 'Documental', 'Drama', 'Familia', 
    'Fantasía', 'Historia', 'Misterio', 'Musical', 'Romance', 'Suspenso', 
    'Terror', 'Thriller', 'Western', 'Mexicanas'
  ];
  const normalizedGenres = new Set<string>();
  
  parts.forEach(part => {
    let cleanGenre = part.trim();
    if (!cleanGenre) return;
    
    cleanGenre = cleanGenre.replace(/\.$/, '');
    const cleanLower = cleanGenre.toLowerCase();
    
    let targetGenre: string | null = null;
    
    if (["satira", "sátira", "sátira política", "satira politica", "comedia negra", "comedia dramática", "humor absurdo", "farsa", "comedias", "comedy", "comedia"].includes(cleanLower)) {
      targetGenre = "Comedia";
    } else if (["histórico", "historico", "historia / biografía", "drama histórico", "mitología", "bíblico", "holocausto", "historia / biografia", "épico", "epico", "history", "historia"].includes(cleanLower)) {
      targetGenre = "Historia";
    } else if (["biografía", "biografia", "biográfico", "biografico", "biography", "biographical"].includes(cleanLower)) {
      targetGenre = "Biografía";
    } else if (["intriga / suspenso", "suspense", "suspenso", "intriga", "suspenso psicológico", "intrigas", "psicológico", "psicologico", "drama psicológico", "judicial", "drama judicial", "police", "policiaca", "policíaca"].includes(cleanLower)) {
      targetGenre = "Suspenso";
    } else if (["terror", "horror", "terror psicológico", "sobrenatural", "slasher", "miedo", "paranormal", "gótico", "gotico"].includes(cleanLower)) {
      targetGenre = "Terror";
    } else if (["thriller", "thriller médico", "thriller político", "thriller psicológico", "thrillers"].includes(cleanLower)) {
      targetGenre = "Thriller";
    } else if (["crimen", "crimen / noir", "neo-noir", "cine negro", "film noir", "espionaje", "policial", "policiaco", "crime", "gangster", "gangsters"].includes(cleanLower)) {
      targetGenre = "Crimen";
    } else if (["cine de arte y culto", "cine de arte", "arte", "ensayo", "experimental", "filosófico", "espiritual", "culto", "social", "transgresión", "road movie", "folklore", "inspiracional", "antología", "antologia", "político", "politico", "politicos", "politica", "drama", "dramas"].includes(cleanLower)) {
      targetGenre = "Drama";
    } else if (["familia", "familiar", "family", "juvenil", "infantil", "juvenil / infantil", "coming-of-age", "kids"].includes(cleanLower)) {
      targetGenre = "Familia";
    } else if (["documental", "documentary", "docudrama", "mockumentary", "falso documental", "metraje encontrado", "found footage", "documentales"].includes(cleanLower)) {
      targetGenre = "Documental";
    } else if (["ciencia ficción", "ciencia ficcion", "sci-fi", "scifi", "ficción", "ficcion", "superhéroes", "superheroes", "distopía", "distopia", "science fiction", "fiction"].includes(cleanLower)) {
      targetGenre = "Sci-Fi";
    } else if (["comedia musical", "musical ranchero", "musical", "música", "musica", "music", "ranchera", "cine de rumberas", "rumberas", "musicales", "bso", "soundtrack"].includes(cleanLower)) {
      targetGenre = "Musical";
    } else if (["clásico", "clásica", "clásicas", "classic", "vintage", "antiguo", "antigua"].includes(cleanLower)) {
      targetGenre = "Clásico";
    } else if (["comedia romántica", "romance", "romantico", "romántico", "romantic", "amor"].includes(cleanLower)) {
      targetGenre = "Romance";
    } else if (["deporte", "deportes", "deportivo", "lucha libre", "artes marciales", "acción", "accion", "action"].includes(cleanLower)) {
      targetGenre = "Acción";
    } else if (["mexicana", "mexicanas", "mexicano", "cine mexicano", "película mexicana", "mexican"].includes(cleanLower) || cleanLower.includes("méxico") || cleanLower.includes("mexico")) {
      targetGenre = "Mexicanas";
    } else if (["aventura", "aventuras", "adventure", "catástrofe", "catastrofe"].includes(cleanLower)) {
      targetGenre = "Aventuras";
    } else if (["animacion", "animación", "animation", "anime"].includes(cleanLower)) {
      targetGenre = "Animación";
    } else if (["belico", "bélico", "guerra", "war"].includes(cleanLower)) {
      targetGenre = "Bélico";
    } else if (["fantasía", "fantasia", "fantastico", "fantástico", "fantasy"].includes(cleanLower)) {
      targetGenre = "Fantasía";
    } else if (["misterio", "mystery", "enigma"].includes(cleanLower)) {
      targetGenre = "Misterio";
    } else if (["western", "vaqueros", "del oeste", "oeste"].includes(cleanLower)) {
      targetGenre = "Western";
    } else {
      const matched = ALLOWED.find(allowedGenre => allowedGenre.toLowerCase() === cleanLower);
      if (matched) {
        targetGenre = matched;
      }
    }
    
    if (targetGenre && ALLOWED.includes(targetGenre)) {
      normalizedGenres.add(targetGenre);
    }
  });
  
  return Array.from(normalizedGenres);
};

export const formatGenreDisplay = (genreData: any): string => {
  const normalized = getNormalizedGenres(genreData);
  if (normalized.length > 0) {
    return normalized.join(', ');
  }
  if (!genreData) return "Película";
  let str = Array.isArray(genreData) ? genreData.join('/') : String(genreData);
  return str
    .replace(/documentary/gi, 'Documental')
    .replace(/documentales/gi, 'Documental')
    .replace(/suspense/gi, 'Suspenso')
    .replace(/action/gi, 'Acción')
    .replace(/adventure/gi, 'Aventuras')
    .replace(/animation/gi, 'Animación')
    .replace(/biography/gi, 'Biografía')
    .replace(/comedy/gi, 'Comedia')
    .replace(/crime/gi, 'Crimen')
    .replace(/family/gi, 'Familia')
    .replace(/fantasy/gi, 'Fantasía')
    .replace(/history/gi, 'Historia')
    .replace(/mystery/gi, 'Misterio')
    .replace(/horror/gi, 'Terror')
    .replace(/war/gi, 'Bélico')
    .replace(/classic/gi, 'Clásico')
    .replace(/\//g, ', ')
    .trim();
};

const curatorGenresList = [
  { id: 'Todos', label: 'Todos', icon: (color: string) => <Film size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Clásico', label: 'Clásico', icon: (color: string) => <Award size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Acción', label: 'Acción', icon: (color: string) => <Flame size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Aventuras', label: 'Aventuras', icon: (color: string) => <Compass size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Animación', label: 'Animación', icon: (color: string) => <Palette size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Biografía', label: 'Biografía', icon: (color: string) => <User size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Bélico', label: 'Bélico', icon: (color: string) => <Swords size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Sci-Fi', label: 'Sci-Fi', icon: (color: string) => <Rocket size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Comedia', label: 'Comedia', icon: (color: string) => <Laugh size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Crimen', label: 'Crimen', icon: (color: string) => <Fingerprint size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Documental', label: 'Documental', icon: (color: string) => <Video size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Drama', label: 'Drama', icon: (color: string) => <HeartCrack size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Familia', label: 'Familia', icon: (color: string) => <Home size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Fantasía', label: 'Fantasía', icon: (color: string) => <Wand2 size={16} color={color} className="shrink-0" /> },
  { id: 'Historia', label: 'Historia', icon: (color: string) => <HistoryIcon size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Misterio', label: 'Misterio', icon: (color: string) => <HelpCircle size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Musical', label: 'Musical', icon: (color: string) => <Music size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Romance', label: 'Romance', icon: (color: string) => <Heart size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Suspenso', label: 'Suspenso', icon: (color: string) => <Eye size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Terror', label: 'Terror', icon: (color: string) => <Skull size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Thriller', label: 'Thriller', icon: (color: string) => <Zap size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Western', label: 'Western', icon: (color: string) => <Mountain size={16} color={color} className="shrink-0 transition-colors duration-300" /> },
  { id: 'Mexicanas', label: 'Mexicanas', icon: (color: string) => <Flag size={16} color={color} className="shrink-0 transition-colors duration-300" /> }
];

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [showHistoryOnly, setShowHistoryOnly] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState("Todos");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedYearRange, setSelectedYearRange] = useState<{ label: string, start: number, end: number } | null>(null);
  const [isDayMode, setIsDayMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("videoteca_day_mode");
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("videoteca_day_mode", JSON.stringify(isDayMode));
    } catch (e) {
      console.error("Error saving day mode preference:", e);
    }
  }, [isDayMode]);
  
  // Director Filter premium curate state
  const [isDirectorFilterActive, setIsDirectorFilterActive] = useState(false);
  const [isFavoriteOfMonthActive, setIsFavoriteOfMonthActive] = useState(false);
  const [activeFavIndex, setActiveFavIndex] = useState(0);
  const favContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const [isDraggingFav, setIsDraggingFav] = useState(false);
  const [dragStartXFav, setDragStartXFav] = useState(0);
  const [dragScrollLeftFav, setDragScrollLeftFav] = useState(0);

  // Auto hover scroll states and refs for smooth hands-free scrolling
  const hoverScrollVelRef = useRef<number>(0);
  const hoverLoopActiveRef = useRef<boolean>(false);
  const [isHoverScrolling, setIsHoverScrolling] = useState(false);

  const startHoverScrollLoop = () => {
    if (hoverLoopActiveRef.current) return;
    hoverLoopActiveRef.current = true;

    const tick = () => {
      if (!hoverLoopActiveRef.current || !favContainerRef.current) {
        setIsHoverScrolling(false);
        return;
      }

      const vel = hoverScrollVelRef.current;
      const absVel = Math.abs(vel);
      const deadZone = 0.35; // Center 70% is dead zone to view the movies beautifully without drifting

      if (absVel > deadZone) {
        // Smooth exponent speed curve
        const intensity = (absVel - deadZone) / (1 - deadZone); // 0 to 1
        const speed = Math.sign(vel) * Math.pow(intensity, 1.5) * 16; // multiplier controls max speed (16px per frame)

        favContainerRef.current.scrollLeft += speed;
        setIsHoverScrolling(true);
      } else {
        setIsHoverScrolling(false);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const stopHoverScrollLoop = () => {
    hoverLoopActiveRef.current = false;
    setIsHoverScrolling(false);
    hoverScrollVelRef.current = 0;
  };

  useEffect(() => {
    if (!isFavoriteOfMonthActive) {
      stopHoverScrollLoop();
    }
    return () => {
      stopHoverScrollLoop();
    };
  }, [isFavoriteOfMonthActive]);
  const [curatorSala, setCuratorSala] = useState<'Solo' | 'Dúo' | 'Grupo' | null>(null);
  const [curatorTono, setCuratorTono] = useState<'Ligero' | 'Trama' | 'Intenso' | null>(null);
  const [curatorGenero, setCuratorGenero] = useState<string>('Todos');
  const [curatorEpoca, setCuratorEpoca] = useState<string>('Todas');
  const [isEpochDropdownOpen, setIsEpochDropdownOpen] = useState(false);

  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  const [isClapping, setIsClapping] = useState(false);
  const [curationError, setCurationError] = useState<string | null>(null);
  const [curatedSessionIds, setCuratedSessionIds] = useState<string[]>([]);
  const [curatorRecommendations, setCuratorRecommendations] = useState<any[]>([]);

  // Synthesizes a real wooden clapperboard snap sound
  const playClapSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.08);
      
      gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      
      const bufferSize = audioCtx.sampleRate * 0.05;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noiseNode = audioCtx.createBufferSource();
      noiseNode.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;
      filter.Q.value = 2;
      
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      
      noiseNode.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start();
      noiseNode.start();
      
      osc.stop(audioCtx.currentTime + 0.09);
      noiseNode.stop(audioCtx.currentTime + 0.09);
    } catch (e) {
      console.warn("AudioContext not supported or blocked by user gesture", e);
    }
  };

  const handleCurate = async () => {
    if (movies.length === 0) return;
    setIsCurating(true);
    setCurationError(null);
    setIsClapping(true);
    playClapSound();

    // Give some time for the clapper clack animation snap to play before launching local curation
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsClapping(false);

    try {
      const isStrictMatch = (m: Movie) => {
        const movieGenreUpper = getNormalizedGenres(m.genre).map(g => g.toUpperCase());
        const movieGenreStrRaw = (Array.isArray(m.genre) ? m.genre.join(' ') : String(m.genre || '')).toUpperCase();
        
        let matchesGenre = true;
        if (curatorGenero !== 'Todos' && curatorGenero !== 'Cualquier género') {
          const genUpper = curatorGenero.toUpperCase();
          if (genUpper === "SUSPENSE" || genUpper === "SUSPENSO") {
            matchesGenre = movieGenreUpper.includes("SUSPENSO") || movieGenreUpper.includes("SUSPENSE") || movieGenreStrRaw.includes("INTRIGA");
          } else {
            matchesGenre = movieGenreUpper.includes(genUpper);
          }
        }

        let matchesEpoch = true;
        if (curatorEpoca !== 'Todas' && curatorEpoca !== 'Cualquier época') {
          const matchedRange = YEAR_RANGES.find(r => r.label === curatorEpoca);
          if (matchedRange) {
            const mYear = m.year ? parseInt(String(m.year)) : 0;
            matchesEpoch = mYear >= matchedRange.start && mYear < matchedRange.end;
          } else {
            matchesEpoch = false;
          }
        }

        let matchesTone = false;
        const toneToMatch = curatorTono || 'Trama';
        if (toneToMatch === 'Ligero') {
          matchesTone = movieGenreUpper.some(g => ['COMEDIA', 'ANIMACIÓN', 'AVENTURAS', 'FAMILIA', 'FANTASÍA', 'MUSICAL'].includes(g));
        } else if (toneToMatch === 'Trama') {
          matchesTone = movieGenreUpper.some(g => ['DRAMA', 'MISTERIO', 'HISTORIA', 'ROMANCE', 'DOCUMENTAL', 'BIOGRAFÍA'].includes(g)) || movieGenreStrRaw.includes('INTRIGA');
        } else if (toneToMatch === 'Intenso') {
          matchesTone = movieGenreUpper.some(g => ['TERROR', 'THRILLER', 'CRIMEN', 'ACCIÓN', 'SUSPENSO', 'BÉLICO'].includes(g));
        }

        let matchesSala = false;
        const salaToMatch = curatorSala || 'Solo';
        if (salaToMatch === 'Solo') {
          matchesSala = movieGenreUpper.some(g => ['DRAMA', 'DOCUMENTAL', 'MISTERIO', 'THRILLER', 'SCI-FI', 'BIOGRAFÍA', 'SUSPENSO'].includes(g)) || movieGenreStrRaw.includes('INDIE');
        } else if (salaToMatch === 'Dúo') {
          matchesSala = movieGenreUpper.some(g => ['ROMANCE', 'COMEDIA', 'TERROR', 'SUSPENSO', 'THRILLER', 'MUSICAL', 'DRAMA'].includes(g));
        } else if (salaToMatch === 'Grupo') {
          matchesSala = movieGenreUpper.some(g => ['ACCIÓN', 'COMEDIA', 'TERROR', 'AVENTURAS', 'FAMILIA', 'FANTASÍA', 'ANIMACIÓN', 'SCI-FI'].includes(g));
        }

        return matchesGenre && matchesEpoch && matchesTone && matchesSala;
      };

      const strictlyMatchingMovies = movies.filter(isStrictMatch);

      if (strictlyMatchingMovies.length === 0) {
        setCurationError("El Director no encontró películas que cumplan exactamente con esos parámetros en el catálogo.");
        setIsCurating(false);
        return;
      }

      let availablePool = strictlyMatchingMovies.filter(m => !curatedSessionIds.includes(m.id));

      if (availablePool.length === 0) {
        const strictMatchIds = strictlyMatchingMovies.map(m => m.id);
        setCuratedSessionIds(prev => prev.filter(id => !strictMatchIds.includes(id)));
        availablePool = strictlyMatchingMovies; 
      }

      const prevIds = curatorRecommendations.map(r => r.id);
      
      const candidates = availablePool.map(m => {
        let finalScore = 0;
        finalScore += (m.rating || 0) * 10;

        const normalizedTitle = m.title?.toLowerCase().trim() || "";
        const normalizedOriginal = m.originalTitle?.toLowerCase().trim() || "";

        let titleSeenRecently = false;
        if (prevIds.some(id => {
          const pm = movies.find(x => x.id === id);
          if (!pm) return false;
          const pTitle = pm.title?.toLowerCase().trim() || "";
          const pOrig = pm.originalTitle?.toLowerCase().trim() || "";
          return (pTitle && pTitle === normalizedTitle) || (pOrig && pOrig === normalizedOriginal);
        })) {
          titleSeenRecently = true;
        }

        if (titleSeenRecently) {
          finalScore -= 10000;
        }

        // Add significant random noise to ensure perfect randomness
        finalScore += Math.random() * 10000;

        return { 
          movie: m, 
          score: finalScore
        };
      });

      const sorted = candidates.sort((a, b) => b.score - a.score);
      
      const selectedMovies: any[] = [];
      const seenTitles = new Set<string>();
      const seenIds = new Set<string>();

      for (const item of sorted) {
        if (selectedMovies.length >= 3) break;
        const m = item.movie;
        const normalizedTitle = m.title?.toLowerCase().trim() || "";
        const normalizedOriginal = m.originalTitle?.toLowerCase().trim() || "";
        
        if (seenIds.has(m.id)) continue;
        if (normalizedTitle && seenTitles.has(normalizedTitle)) continue;
        if (normalizedOriginal && seenTitles.has(normalizedOriginal)) continue;

        selectedMovies.push(m);
        seenIds.add(m.id);
        if (normalizedTitle) seenTitles.add(normalizedTitle);
        if (normalizedOriginal) seenTitles.add(normalizedOriginal);
      }

      const generatedRecs = selectedMovies.map(m => {
        const salaLabels = {
          'Solo': 'en la soledad del cinéfilo',
          'Dúo': 'en la calidez de un dúo cinéfilo',
          'Grupo': 'compartiendo la fascinación colectiva en grupo'
        };
        const tonoLabels = {
          'Ligero': 'divertido, relajado y lleno de vitalidad humorística',
          'Trama': 'interesante, cautivador y de fina intriga dramática',
          'Intenso': 'fuerte, electrizante y de una inmensa emoción cinematográfica'
        };
        const templates = [
          `Una obra ideal para consagrar ${curatorSala ? salaLabels[curatorSala] : 'tu sesión'}. Su estructura posee un pulso ${curatorTono ? tonoLabels[curatorTono] : 'exquisito'}, que florece con gran madurez visual. Un retrato de inestabilidad y fascinación ordinaria que desafía al conformismo cotidiano.`,
          `El director compone aquí un viaje existencial de carretera que cruza parajes inhóspitos. Es un lienzo idóneo para ver ${curatorSala ? salaLabels[curatorSala] : 'disfrutar'}, calibrando un compás ${curatorTono ? tonoLabels[curatorTono] : 'magnífico'}, estructurado a la perfección. Puro cine de altísimo nivel.`,
          `Una gema de incalculable valor estético que brota de la claustrofobia de la vida urbana. Altamente recomendada para ver ${curatorSala ? salaLabels[curatorSala] : 'en tu sala'}; despliega un carácter singular que rompe con la rutina tradicional con su característica destreza.`
        ];
        
        const idx = Math.abs((m.title.length + m.year) % templates.length);
        const reason = templates[idx];

        return {
          id: m.id,
          title: m.title,
          reason
        };
      });

      setCuratorRecommendations(generatedRecs);

      setCuratedSessionIds(prev => [...prev, ...selectedMovies.map(sm => sm.id)]);

    } catch (err: any) {
      console.error("Error al curar de forma local:", err);
      setCurationError(err.message || "Error al realizar la recomendación cinematográfica.");
    } finally {
      setIsCurating(false);
    }
  };

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchQuery);
      if (searchQuery.trim() !== "") {
        setIsDirectorFilterActive(false);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const clearFiltersAndSearch = (keepCurrentTab: boolean = true) => {
    if (!keepCurrentTab) {
      setActiveExploreTab('peliculas');
    }
    setSelectedLetter(null);
    setSelectedYearRange(null);
    setSelectedGenre("Todos");
    setSearchQuery("");
    setSearchTerm("");
    setShowReviewOnly(false);
    setShowHistoryOnly(false);
    setIsDirectorFilterActive(false);
    setIsFavoriteOfMonthActive(false);
    setCuratorRecommendations([]);
    setCurrentPage(1);
    setIsMobileMenuOpen(false);
  };

  const activeHistory = () => {
    setSelectedLetter(null);
    setSelectedYearRange(null);
    setSelectedGenre("Todos");
    setSearchQuery("");
    setSearchTerm("");
    setShowReviewOnly(false);
    setShowHistoryOnly(true);
    setIsDirectorFilterActive(false);
    setIsFavoriteOfMonthActive(false);
    setCuratorRecommendations([]);
    setCurrentPage(1);
    setIsMobileMenuOpen(false);
  };

  // Sidebar Expand/Collapse State
  const [isAlphabetOpen, setIsAlphabetOpen] = useState(false);
  const [isErasOpen, setIsErasOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  
  // Click History State
  const [clickedMovieIds, setClickedMovieIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("clicked_movies_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Record clicked movie to history
  useEffect(() => {
    if (selectedMovie && selectedMovie.id) {
      setClickedMovieIds(prev => {
        const filtered = prev.filter(id => id !== selectedMovie.id);
        const next = [selectedMovie.id, ...filtered];
        try {
          localStorage.setItem("clicked_movies_history", JSON.stringify(next));
        } catch (e) {
          console.error("Failed to save click history", e);
        }
        return next;
      });
    }
  }, [selectedMovie]);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncError, setSyncError] = useState("");
  const [editForm, setEditForm] = useState<Partial<Movie>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingMove, setIsConfirmingMove] = useState(false);
  const [syncInput, setSyncInput] = useState("");
  const [randomQuote, setRandomQuote] = useState<QuoteType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const [animateCategory, setAnimateCategory] = useState(false);
  const prevGenreRef = useRef(selectedGenre);

  const [isEnglish, setIsEnglish] = useState(false);

  const t = (key: string): string => {
    if (!isEnglish) return key;
    const dictionary: Record<string, string> = {
      "Explorar": "Explore",
      "ALFABÉTICO": "Alphabetical",
      "ÉPOCAS": "Eras",
      "CATEGORÍAS": "Categories",
      "FILTRO DEL DIRECTOR": "Director's Pick",
      "Actividad": "Activity",
      "Gestión": "Management",
      "MULTI PEGADO": "Multi Paste",
      "GESTIONAR ADMINS": "Manage Admins",
      "PARA REVISIÓN": "Under Review",
      "NUEVA ENTRADA": "New Entry",
      "Buscar título o año...": "Search title or year...",
      "Cualquier Año": "Any Year",
      "Administrador": "Administrator",
      "Editor": "Editor",
      "Todos": "All",
      "Todos los géneros": "All genres",
      "Cualquier época": "Any era",
      "Todas": "All",
      "DIALS DE CALIBRACIÓN": "Calibration Dials",
      "LA SALA": "The Venue",
      "EL TONO": "The Mood",
      "LA DURACIÓN": "The Duration",
      "Solo": "Solo / Alone",
      "Pareja": "Couple",
      "Grupo / Amigos": "Group / Friends",
      "Trama / Intelectual": "Plot / Intellectual",
      "Acción / Ritmo": "Action / Pace",
      "Comedia / Ligera": "Comedy / Light",
      "Drama / Emotivo": "Drama / Emotional",
      "Suspenso / Tensión": "Suspense / Tension",
      "Terror / Atmosférico": "Horror / Atmospheric",
      "Menos de 90 min": "Under 90 min",
      "Entre 90 y 120 min": "90 to 120 min",
      "Más de 120 min": "Over 120 min",
      "PROYECTAR SELECCIÓN": "Project Selection",
      "Diseña la experiencia cinematográfica perfecta": "Design the perfect cinematic experience",
      "Elige con quién estás, el ritmo de historia que deseas, los géneros y las épocas. Nuestro recomendador inteligente elegirá de la mediateca la obra idónea para tu momento.": "Choose your company, narrative pace, genres, and eras. Our recommendation engine will hand-pick the ideal film.",
      "OBRAS EN REVISIÓN": "Films Under Review",
      "HISTORIAL DE CONSULTA": "Query History",
      "Ubicación": "Location",
      "Ubicación en Estante": "Shelf Location",
      "Recomendaciones": "Recommendations",
      "obra en exhibición": "film on display",
      "obras en exhibición": "films on display",
      "RECOMENDACIÓN DEL DIRECTOR": "DIRECTOR'S PICK",
      "NUESTRO TOP 3 PARA TI": "OUR TOP 3 FOR YOU",
      "No hay recomendaciones que coincidan exactamente. Ajusta los diales para encontrar otras obras del catálogo.": "No recommendations found. Try adjusting calibration dials.",
      "REVISAR": "REVIEW",
      "CLÁSICO": "CLASSIC",
      "ARCHIVO": "ARCHIVE",
      "PELÍCULAS": "MOVIES",
      "Peliculas": "Movies",
      "SERIES": "SERIES",
      "Series": "Series",
      "CENTAURO": "CENTAURO",
      "Centauro": "Centauro",
      "HISTORIAL": "HISTORY",
    };
    return dictionary[key] || key;
  };


  const [activeExploreTab, setActiveExploreTab] = useState<'peliculas' | 'series' | 'centauro'>('peliculas');
  const [pasteTargetSection, setPasteTargetSection] = useState<'peliculas' | 'centauro' | 'series'>('peliculas');
  const [batchProgress, setBatchProgress] = useState({ active: false, total: 0, current: 0, currentMovie: "" });
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [duplicateWarningModal, setDuplicateWarningModal] = useState<{
    open: boolean;
    title: string;
    year: number;
    onConfirm: (() => void) | null;
    onCancel?: (() => void) | null;
  }>({ open: false, title: "", year: 0, onConfirm: null, onCancel: null });
  const [authDenied, setAuthDenied] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pasteLimit, setPasteLimit] = useState<5 | 10>(5);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const moviesPerPage = 24;

  const isArchiveActive = activeExploreTab === 'peliculas' && !selectedLetter && !selectedYearRange && selectedGenre === "Todos" && !showReviewOnly && !showHistoryOnly && !isDirectorFilterActive && !isFavoriteOfMonthActive;

  const getSidebarItemClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-black bg-white border border-transparent rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out scale-[1.02] shadow-md group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-[#a11818]/45 hover:shadow-[0_0_12px_rgba(161,24,24,0.35)] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out hover:scale-[1.03] hover:translate-x-0.5 active:scale-95 group";
  };

  const getArchiveSidebarClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-white bg-white/[0.04] border-l-[3px] border-l-[#e53e3e] border-y border-r border-transparent rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out scale-[1.02] group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-[#a11818]/45 hover:shadow-[0_0_12px_rgba(161,24,24,0.35)] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out hover:scale-[1.03] hover:translate-x-0.5 active:scale-95 group";
  };

  const getHistorySidebarClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-white bg-white/[0.04] border-l-[3px] border-l-[#e53e3e] border-y border-r border-transparent rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out scale-[1.02] group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-[#a11818]/45 hover:shadow-[0_0_12px_rgba(161,24,24,0.35)] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out hover:scale-[1.03] hover:translate-x-0.5 active:scale-95 group";
  };

  const getReviewSidebarClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-white bg-[rgba(229,62,62,0.15)] border-l-[3px] border-l-[#e53e3e] border-y border-r border-transparent rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out scale-[1.02] group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-[#a11818]/45 hover:shadow-[0_0_12px_rgba(161,24,24,0.35)] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out hover:scale-[1.03] hover:translate-x-0.5 active:scale-95 group";
  };

  const getAccordionHeaderClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center justify-between w-full text-[#ffffff] bg-[rgba(229,62,62,0.12)] border-l-[3px] border-l-[#e53e3e] border-y border-r border-transparent rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out scale-[1.02] group"
      : "flex items-center justify-between w-full text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-[#a11818]/45 hover:shadow-[0_0_12px_rgba(161,24,24,0.35)] px-5 py-3 font-bold text-sm transition-all duration-300 ease-out hover:scale-[1.03] hover:translate-x-0.5 active:scale-95 group";
  };

  const handleManualPosterUpdate = async (newPoster: string) => {
    if (isAddingNew || isEditing) {
      setEditForm(prev => ({ ...prev, poster: newPoster }));
      if (selectedMovie) {
        setSelectedMovie(prev => prev ? ({ ...prev, poster: newPoster }) : null);
      }
    } else if (selectedMovie) {
      const updatedAt = new Date().toISOString();
      const payload = { ...selectedMovie, poster: newPoster, updatedAt };
      setSelectedMovie(payload);
      setMovies(prev => prev.map(m => m.id === payload.id ? payload : m));
      
      try {
        await upsertMovie(payload);
      } catch (error: any) {
        console.warn("Aviso al actualizar póster:", error);
      }
    }
  };

  const handleImageUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_SIZE = 800;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          handleManualPosterUpdate(base64);
        }
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handleCopyFicha = () => {
    if (!selectedMovie) return;
    
    const orderIndex = filteredMovies.findIndex(m => m.id === selectedMovie.id);
    const orderNumber = orderIndex !== -1 ? orderIndex + 1 : movies.findIndex(m => m.id === selectedMovie.id) + 1 || 1;
    
    // Genres separated by bar (slash) e.g. Drama / Comedia
    const cleanGenres = String(selectedMovie.genre || 'No disponible')
      .split(/[,/|]+/)
      .map(g => g.trim())
      .filter(Boolean)
      .join(' / ') || 'No disponible';

    const cleanCast = Array.isArray(selectedMovie.cast) ? selectedMovie.cast.join(', ') : String(selectedMovie.cast || 'No disponible');
    
    let cleanDuration = selectedMovie.duration || 'No disponible';
    if (cleanDuration && cleanDuration !== 'No disponible' && selectedMovie.section !== 'series') {
      const numOnly = parseInt(String(cleanDuration));
      if (!isNaN(numOnly)) {
        cleanDuration = `${numOnly} minutos`;
      }
    }

    const displayTitle = selectedMovie.title || 'No disponible';
    const headerTitle = displayTitle.replace(/^⚠️\s*/, '').toUpperCase();

    let ficha = "";
    if (selectedMovie.section === 'series') {
      const durationVal = selectedMovie.duration || 'No disponible';
      const seasonVal = selectedMovie.season || 'Primera y única';
      ficha = `${orderNumber}) ${headerTitle}
🎬 Título Mediateca: ${headerTitle}
🏷️ Título Original: ${selectedMovie.originalTitle || 'No disponible'}
📅 Año: ${selectedMovie.year || 'No disponible'}
⭐ Rating Global: ${selectedMovie.rating ? `${selectedMovie.rating}/10 IMDb` : '0/10 IMDb'}
🎭 Género: ${cleanGenres}
📺 Temporadas : ${seasonVal}
⏱️ Capítulos y Duración: ${durationVal}
🌍 País: ${selectedMovie.country || 'No disponible'}
🔞 Clasificación: ${selectedMovie.ageRating || 'No disponible'}
✍️ Guion: ${selectedMovie.script || 'No disponible'}
📀 Formato y Edición: ${selectedMovie.format || 'No disponible'}
🎬 Dirección: ${selectedMovie.director || 'No disponible'}
🎵 Banda Sonora: ${selectedMovie.music || 'No disponible'}
📸 Fotografía: ${selectedMovie.photography || 'No disponible'}
🏢 Estudio / Productora: ${selectedMovie.companies || 'No disponible'}
📚 Sección (Localización): ${selectedMovie.estante || ''}
👥 Elenco Principal: ${cleanCast}
📖 Argumento:
Sinopsis: ${selectedMovie.synopsis || 'No disponible'}

Reseñas críticas: ${selectedMovie.reviews || 'No disponible'}

Premios históricos: ${selectedMovie.awards || 'No disponible'}`;
    } else {
      ficha = `${orderNumber}) ${headerTitle} (${selectedMovie.year || ''})
🖼️ Póster: ${selectedMovie.poster || 'No disponible'}
🎬 Título Mediateca: ${headerTitle}
🏷️ Título Original: ${selectedMovie.originalTitle || 'No disponible'}
📅 Año: ${selectedMovie.year || 'No disponible'}
⭐ Rating Global: ${selectedMovie.rating || '0'}/10 IMDb
🎭 Género: ${cleanGenres}
⏱️ Duración: ${cleanDuration}
🌍 País: ${selectedMovie.country || 'No disponible'}
🔞 Clasificación: ${selectedMovie.ageRating || 'No disponible'}
✍️ Guion: ${selectedMovie.script || 'No disponible'}
📺 Formato: ${selectedMovie.format || 'No disponible'}
🎬 Dirección: ${selectedMovie.director || 'No disponible'}
🎵 Banda Sonora: ${selectedMovie.music || 'No disponible'}
📸 Fotografía: ${selectedMovie.photography || 'No disponible'}
🏢 Estudio: ${selectedMovie.companies || 'No disponible'}
📚 Estante (Localización): ${selectedMovie.estante || ''}
👥 Elenco: ${cleanCast}
📖 Argumento:
Sinopsis: ${selectedMovie.synopsis || 'No disponible'}
Reseñas críticas: ${selectedMovie.reviews || 'No disponible'}
Premios históricos: ${selectedMovie.awards || 'No disponible'}`;
    }

    navigator.clipboard.writeText(ficha);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProcessPastedText = async () => {
    if (!pastedText.trim()) return;
    setShowPasteModal(false);
    setBatchProgress({ active: true, total: 1, current: 0, currentMovie: "Interpretando texto con IA..." });

    const targetSec = pasteTargetSection || 'peliculas';

    try {
      const response = await fetch('/api/batch-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `[PESTAÑA DESTINO: ${targetSec.toUpperCase()}]\n` + pastedText, limit: pasteLimit })
      });
      
      const textResponse = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(textResponse);
      } catch (e) {
        responseData = { error: textResponse || "Error en el servidor" };
      }
      
      if (!response.ok) {
        throw new Error(responseData.error || "Error en el servidor");
      }
      
      const parsedMovies: any[] = responseData;

      setBatchProgress({ active: true, total: parsedMovies.length, current: 0, currentMovie: "Iniciando descarga y catalogación..." });

      let skipped: string[] = [];
      let addedInBatch: Movie[] = [];

      let index = 0;
      for (const m of parsedMovies) {
        if (!m || !m.title) {
          index++;
          continue;
        }
        
        const titleTrim = m.title?.toLowerCase().trim();
        const yearVal = m.year;

        const isDuplicate = movies.some(existingMovie => 
          existingMovie.title?.toLowerCase().trim() === titleTrim && 
          existingMovie.year == yearVal
        ) || addedInBatch.some(bMovie =>
          bMovie.title?.toLowerCase().trim() === titleTrim &&
          bMovie.year == yearVal
        );

        if (isDuplicate) {
          const shouldUploadAnyway = await new Promise<boolean>((resolve) => {
            setDuplicateWarningModal({
              open: true,
              title: m.title || "Obra sin título",
              year: Number(m.year) || 0,
              onConfirm: () => {
                setDuplicateWarningModal({ open: false, title: "", year: 0, onConfirm: null, onCancel: null });
                resolve(true);
              },
              onCancel: () => {
                setDuplicateWarningModal({ open: false, title: "", year: 0, onConfirm: null, onCancel: null });
                resolve(false);
              }
            });
          });

          if (!shouldUploadAnyway) {
            skipped.push(`"${m.title}" (${m.year || "S/A"})`);
            setBatchProgress(p => ({ ...p, current: index + 1, currentMovie: `Omitiendo duplicado: ${m.title}` }));
            await new Promise(r => setTimeout(r, 200));
            index++;
            continue;
          }
        }

        setBatchProgress(p => ({ ...p, currentMovie: `Procesando y reordenando: ${m.title}...`, current: index }));

        const finalId = generateMovieId();
        
        let normalizedCast: string[] = [];
        if (Array.isArray(m.cast)) {
          normalizedCast = m.cast.map((c: any) => String(c || "").trim()).filter(Boolean);
        } else if (typeof m.cast === 'string' && m.cast) {
          normalizedCast = String(m.cast).split(/[,/]+/).map(s => s.trim()).filter(Boolean);
        }

        const finalMovie: Movie = {
          id: finalId,
          title: m.title || "Obra sin título",
          originalTitle: m.originalTitle || m.title || "No disponible",
          year: Number(m.year) || 0,
          rating: Number(m.rating) || 0,
          duration: m.duration || "No disponible",
          country: m.country || "No disponible",
          director: m.director || "No disponible",
          script: m.script || "No disponible",
          cast: normalizedCast,
          music: m.music || "No disponible",
          photography: m.photography || "No disponible",
          companies: m.companies || "No disponible",
          genre: m.genre || "No disponible",
          synopsis: m.synopsis || "Sin argumento registrado.",
          poster: m.poster || DEMO_POSTER,
          reviews: m.reviews || "Sin reseñas verificadas.",
          awards: m.awards || "Sin premios registrados.",
          ageRating: m.ageRating || "No disponible",
          format: m.format || "No disponible",
          estante: m.estante || "N/A",
          season: m.season || (targetSec === 'series' ? 'Primera y única' : ''),
          section: targetSec,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          needsReview: false
        };

        await upsertMovie(finalMovie);
        addedInBatch.push(finalMovie);
        setMovies(prev => {
          const exists = prev.some(m => m.id === finalMovie.id);
          if (exists) return prev.map(m => m.id === finalMovie.id ? finalMovie : m);
          return [finalMovie, ...prev];
        });

        setBatchProgress(p => ({ ...p, current: index + 1 }));
        await new Promise(r => setTimeout(r, 100)); // Breve pausa visual
        index++;
      }

      setPastedText("");
      setTimeout(() => {
        setBatchProgress({ active: false, total: 0, current: 0, currentMovie: "" });
        if (addedInBatch.length > 0) {
          setActiveExploreTab(targetSec);
          clearFiltersAndSearch(true);
        }
        if (skipped.length > 0) {
          alert(`Se procesó el lote correctamente. Se omitieron algunas películas por duplicidad con el catálogo:\n\n${skipped.join("\n")}`);
        }
      }, 1000);

    } catch (error) {
      console.error(error);
      setBatchProgress({ active: true, total: 1, current: 1, currentMovie: "¡Error al procesar el texto!" });
      setTimeout(() => setBatchProgress({ active: false, total: 0, current: 0, currentMovie: "" }), 3000);
    }
  };

  const [isBypassActive, setIsBypassActive] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(async (currentUser: any) => {
      if (isBypassActive) return; // Prevent overwriting bypass session
      
      if (currentUser) {
        const normalizedUser = {
          ...currentUser,
          displayName: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || '',
          photoURL: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || '',
        };

        if (normalizedUser.email === 'chapceligg@gmail.com') {
          setUser(normalizedUser);
          setIsAdmin(true);
          setUserRole('admin');
        } else {
          try {
            const admin = await getAdminByEmail(normalizedUser.email || '');
            if (admin) {
              setUser(normalizedUser);
              setIsAdmin(true);
              setUserRole(admin.role || 'editor');
            } else {
              await logout();
              if (!isBypassActive) {
                setUser(null);
                setIsAdmin(false);
                setUserRole(null);
                setAuthDenied(true);
                setTimeout(() => setAuthDenied(false), 8000);
              }
            }
          } catch (e) {
            await logout();
            if (!isBypassActive) {
              setUser(null);
              setIsAdmin(false);
              setUserRole(null);
              setAuthDenied(true);
              setTimeout(() => setAuthDenied(false), 8000);
            }
          }
        }
      } else {
        if (!isBypassActive) {
          setUser(null);
          setIsAdmin(false);
          setUserRole(null);
        }
      }
      setIsAuthChecking(false);
    });

    return () => unsub(); // REFUERZO: Evitar memory leaks e infinitos loops de verificación
  }, [isBypassActive]);

  // Rotación periódica de las 123 frases icónicas de cine (cada minuto) 100% client-side sin lecturas en base de datos
  useEffect(() => {
    fetchIconicQuote().then(setRandomQuote);
    const quoteInterval = setInterval(() => {
      fetchIconicQuote().then(setRandomQuote);
    }, 60000);
    return () => clearInterval(quoteInterval);
  }, []);

  useEffect(() => {
    if (isAuthChecking) {
      return;
    }

    // 1. TRÍPTICO DE CARGA INCREMENTAL (FUSIÓN DE CACHÉ)
    // RECUPERACIÓN DE MEMORIA CACHÉ GUARDADA: Leemos inmediatamente por si Firestore tarda en conectar
    (async () => {
      try {
        const offlineData = await getCachedMovies();
        if (offlineData && offlineData.length > 0) {
          setMovies(offlineData);
        }
      } catch (e) {
        console.warn("Error leyendo la caché inicial de películas:", e);
      }
    })();

    // REFUERZO ANTI-AGOTAMIENTO DE LECTURAS:
    // Sustituimos el sync pasivo por un onSnapshot respaldado por IndexedDB (persistentLocalCache).
    // Esto GARANTIZA que el servidor solo sea consultado por los DELTAS (cambios) desde la última conexión.
    // También recupera TODAS las películas que ya llevábamos al no filtrar localmente por createdAt.
    const unsub = subscribeToMovies(
      (unifiedMovies: Movie[]) => {
        setMovies(unifiedMovies);
        setFirestoreError(null);
      },
      (err: any) => {
        console.error("Error en sincronización en tiempo real:", err);
        setFirestoreError(err.message || "Error al sincronizar datos");
      }
    );

    return () => unsub(); // Fundamental para no crear listeners infinitos y agotar lecturas
  }, [isAuthChecking]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedGenre, selectedLetter, selectedYearRange, showReviewOnly]);

  const dynamicGenres = useMemo(() => {
    // 21 categorías + Todos + Clásico + Mexicanas como se solicita
    const STANDARD_GENRES = [
      "Acción", "Aventuras", "Animación", "Biografía", "Bélico", "Sci-Fi",
      "Comedia", "Crimen", "Documental", "Drama", "Familia", "Fantasía", "Historia", 
      "Misterio", "Musical", "Romance", "Suspenso", "Terror", "Thriller", "Western", "Mexicanas"
    ];
    
    return ["Todos", "Clásico", ...STANDARD_GENRES];
  }, []);

  const filteredMovies = useMemo(() => {
    return movies.filter(m => {
      const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/);
      const matchSearch = searchTerms.every(term => {
        if (!term) return true;
        const normTerm = normalizeText(term);
        const inTitle = normalizeText(m.title).includes(normTerm);
        const inOriginalTitle = normalizeText(m.originalTitle).includes(normTerm);
        const inDirector = normalizeText(m.director).includes(normTerm);
        const isYearExact = String(m.year || "").includes(term);
        const inCast = Array.isArray(m.cast)
          ? m.cast.some(actor => actor.toLowerCase().includes(term))
          : String(m.cast || "").toLowerCase().includes(term);
        return inTitle || inOriginalTitle || inDirector || isYearExact || inCast;
      });
      const currentGenreLower = (selectedGenre || "").toLowerCase();
      let matchGenre = selectedGenre === "Todos" || false;
      
      if (selectedGenre !== "Todos" && selectedGenre !== "Clásico") {
        const movieNormalizedGenres = getNormalizedGenres(m.genre).map(g => g.toLowerCase());
        if (currentGenreLower === "mexicanas" && (movieNormalizedGenres.includes("mexicana") || movieNormalizedGenres.includes("mexicanas"))) {
          matchGenre = true;
        } else {
          matchGenre = movieNormalizedGenres.includes(currentGenreLower);
        }
      }
      
      if (selectedGenre === "Clásico") {
        matchGenre = String(m.genre || "").toLowerCase().includes("clásico") || (m.year < 1980);
      }
      
      const movieTitle = String(m.title || "").trim();
      let matchLetter = true;
      if (selectedLetter) {
        if (selectedLetter === "#") {
          matchLetter = /^[0-9]/.test(movieTitle);
        } else {
          matchLetter = movieTitle.toUpperCase().startsWith(selectedLetter);
        }
      }
      
      const movieYear = m.year || 0;
      const matchYear = !selectedYearRange || (movieYear >= selectedYearRange.start && movieYear < selectedYearRange.end);
      const matchReview = showReviewOnly ? !!m.needsReview : true;

      const movieSec = String(m.section || 'peliculas').toLowerCase().trim();
      const isSearching = searchTerm.trim() !== "";
      const matchTab = isSearching
        ? true
        : activeExploreTab === 'centauro'
        ? movieSec === 'centauro'
        : activeExploreTab === 'series'
        ? movieSec === 'series'
        : (movieSec === 'peliculas' || movieSec === '');

      return matchSearch && matchGenre && matchLetter && matchYear && matchReview && matchTab;
    }).sort((a, b) => {
      if (searchTerm.trim() !== "") {
        const normSearch = normalizeText(searchTerm);
        
        const getScore = (m: Movie) => {
          const normTitle = normalizeText(m.title);
          const normOrig = normalizeText(m.originalTitle);

          // 1. Exact matches (highest priority)
          if (normTitle === normSearch) return 1000;
          if (normOrig === normSearch) return 950;
          
          // 2. Starts with phrase
          if (normTitle.startsWith(normSearch)) return 900;
          if (normOrig.startsWith(normSearch)) return 850;

          // 3. Substring containment of entire phrase
          if (normTitle.includes(normSearch)) return 800;
          if (normOrig.includes(normSearch)) return 750;

          // 4. Individual word matching counts on title/original title
          const searchWords = normSearch.split(/\s+/).filter(Boolean);
          if (searchWords.length > 0) {
            let titleMatchCount = 0;
            searchWords.forEach(w => {
              if (normTitle.includes(w)) titleMatchCount++;
            });
            if (titleMatchCount === searchWords.length) return 700;
            if (titleMatchCount > 0) return 400 + titleMatchCount * 10;
          }

          if (searchWords.length > 0) {
            let origMatchCount = 0;
            searchWords.forEach(w => {
              if (normOrig.includes(w)) origMatchCount++;
            });
            if (origMatchCount === searchWords.length) return 600;
            if (origMatchCount > 0) return 300 + origMatchCount * 10;
          }

          // 5. Director containing entire search phrase
          const normDirector = normalizeText(m.director);
          if (normDirector.includes(normSearch)) return 200;

          // 6. Year matches
          const mYear = String(m.year || "");
          if (mYear === searchTerm.trim() || mYear.includes(searchTerm.trim())) return 150;

          // 7. Cast containing entire search phrase
          const inCast = Array.isArray(m.cast)
            ? m.cast.some(actor => normalizeText(actor).includes(normSearch))
            : normalizeText(m.cast).includes(normSearch);
          if (inCast) return 100;

          return 0;
        };

        const scoreA = getScore(a);
        const scoreB = getScore(b);
        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Descending order of score
        }
      }

      if (showHistoryOnly) {
        // En modo Historial, ordenamos por última modificación (updatedAt), cayendo de regreso en fecha de alta (createdAt)
        const timeA = a.updatedAt || a.createdAt || "";
        const timeB = b.updatedAt || b.createdAt || "";
        return timeB.localeCompare(timeA);
      } else {
        // En modo Archivo, mantenemos el orden inalterado por fecha de alta (createdAt)
        const timeA = a.createdAt || a.updatedAt || "";
        const timeB = b.createdAt || b.updatedAt || "";
        return timeB.localeCompare(timeA);
      }
    });
  }, [searchTerm, movies, selectedGenre, selectedLetter, selectedYearRange, showReviewOnly, showHistoryOnly, activeExploreTab]);

  console.log('RENDER', { movies: movies.length, filtered: filteredMovies.length });

  const totalPages = Math.max(1, Math.ceil(filteredMovies.length / moviesPerPage));

  // Si la página actual excede el total de páginas de la pestaña/filtro activo, corregir automáticamente
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  // Restablecer a página 1 de inmediato al alternar entre Películas, Series o Centauro
  useEffect(() => {
    setCurrentPage(1);
  }, [activeExploreTab]);

  const paginatedMovies = useMemo(() => {
    const pageToUse = (currentPage > totalPages && totalPages > 0) ? 1 : Math.max(1, currentPage);
    const startIndex = (pageToUse - 1) * moviesPerPage;
    return filteredMovies.slice(startIndex, startIndex + moviesPerPage);
  }, [filteredMovies, currentPage, totalPages]);

  const exportToCSV = () => {
    if (filteredMovies.length === 0) {
      alert("No hay películas en el listado actual para exportar.");
      return;
    }

    const headers = [
      "ID", "Título Español", "Título Original", "Año", "Rating Global", "Duración", 
      "País", "Dirección", "Género", "Clasificación", "Formato", "Póster", 
      "Argumento/Sinopsis", "Elenco", "Guion", "Banda Sonora", "Fotografía", 
      "Estudio/Compañías", "Reseñas", "Premios", "Estante", "Última Actualización"
    ];

    const csvRows = [headers.join(",")];

    for (const m of filteredMovies) {
      const castStr = Array.isArray(m.cast) ? m.cast.join(" / ") : (m.cast || "");
      const row = [
        m.id || "",
        m.title || "",
        m.originalTitle || "",
        m.year || "",
        m.rating || "",
        m.duration || "",
        m.country || "",
        m.director || "",
        m.genre || "",
        m.ageRating || "",
        m.format || "",
        m.poster || "",
        m.synopsis || "",
        castStr,
        m.script || "",
        m.music || "",
        m.photography || "",
        m.companies || "",
        m.reviews || "",
        m.awards || "",
        m.estante || "",
        m.updatedAt || m.createdAt || ""
      ];

      const escapedRow = row.map(val => {
        const stringVal = String(val).replace(/"/g, '""');
        return `"${stringVal}"`;
      });

      csvRows.push(escapedRow.join(","));
    }

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `catalogo_videoteca_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const persistMovieData = async (dataToUse?: any) => {
    const data = dataToUse || editForm;
    const id = isAddingNew ? generateMovieId() : (data.id || selectedMovie?.id || "");
    if (!id) {
      setSyncError("No se pudo referenciar la obra. Intenta de nuevo.");
      return;
    }
    const rawTarget = data.section || editForm.section || selectedMovie?.section || (activeExploreTab === 'centauro' ? 'centauro' : 'peliculas');
    const targetSection = String(rawTarget).toLowerCase().trim() as 'peliculas' | 'centauro' | 'series';
    try {
      const payload: Movie = {
        id,
        title: data.title || "Obra sin título",
        originalTitle: data.originalTitle || data.title || "Original Title",
        year: parseInt(data.year as any) || new Date().getFullYear(),
        rating: Math.min(10, Math.max(0, parseFloat(data.rating as any) || 0)),
        duration: data.duration || "N/A",
        country: data.country || "N/A",
        director: data.director || "Desconocido",
        script: data.script || "N/A",
        cast: Array.isArray(data.cast) ? data.cast : String(data.cast || "").split(',').map((s: string) => s.trim()).filter(Boolean),
        music: data.music || "N/A",
        photography: data.photography || "N/A",
        companies: data.companies || "N/A",
        genre: data.genre || "Cine",
        synopsis: data.synopsis || "Sin argumento registrado.",
        poster: data.poster || editForm.poster || selectedMovie?.poster || DEMO_POSTER,
        reviews: data.reviews || "Sin reseñas verificadas.",
        awards: data.awards || "Sin premios registrados.",
        ageRating: data.ageRating || "N/A",
        format: data.format || "No disponible",
        estante: data.estante || "N/A",
        season: data.season ?? editForm.season ?? selectedMovie?.season ?? (targetSection === 'series' ? 'Primera y única' : ''),
        section: targetSection,
        createdAt: isAddingNew ? new Date().toISOString() : (data.createdAt || selectedMovie?.createdAt || data.updatedAt || new Date().toISOString()),
        updatedAt: new Date().toISOString(),
        needsReview: false
      };
      
      setMovies(prev => {
        const index = prev.findIndex(m => m.id === payload.id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = payload;
          return updated;
        } else {
          return [payload, ...prev];
        }
      });
      setIsAddingNew(false);
      setIsEditing(false);
      setSelectedMovie({ ...selectedMovie, ...payload } as Movie);
      setSyncInput("");
      setSyncError("");
      setSyncStatus("¡Guardado exitoso!");
      setActiveExploreTab(targetSection);
      clearFiltersAndSearch(true);

      await upsertMovie(payload);
    } catch (e: any) {
      setSyncError("Fallo al persistir registro: " + e.message);
    }
  };

  const handleSave = async (forceSave = false) => {
    if (!isAdmin || !user) return;

    if (isAddingNew && !forceSave) {
      const titleToSave = editForm.title || "Obra sin título";
      const yearToSave = parseInt(editForm.year as any) || new Date().getFullYear();
      const isDuplicate = movies.some(m => 
        m.title?.toLowerCase().trim() === titleToSave.toLowerCase().trim() && 
        m.year == yearToSave
      );
      if (isDuplicate) {
        setDuplicateWarningModal({
          open: true,
          title: titleToSave,
          year: yearToSave,
          onConfirm: () => {
            setDuplicateWarningModal({ open: false, title: "", year: 0, onConfirm: null });
            persistMovieData();
          }
        });
        return;
      }
    }

    await persistMovieData();
  };

  const handleSync = async (autoSave: boolean = false) => {
    if (!syncInput) return;
    setIsSyncing(true); setSyncError("");
    setSyncStatus("Analizando texto con IA...");
    const targetSec = editForm.section || (activeExploreTab === 'series' ? 'series' : activeExploreTab === 'centauro' ? 'centauro' : 'peliculas');
    try {
      const response = await fetch('/api/batch-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `MODO NUEVA ENTRADA (Pestaña destino: ${targetSec.toUpperCase()}): ` + syncInput, limit: 1 })
      });
      const textResponse = await response.text();
      let parsedData;
      try {
        parsedData = JSON.parse(textResponse);
      } catch (e) {
        parsedData = { error: textResponse || "Error al catalogar" };
      }
      if (!response.ok) throw new Error(parsedData.error || "Error al catalogar");

      if (!Array.isArray(parsedData) || parsedData.length === 0) {
         throw new Error("No se pudo extraer ninguna información.");
      }

      const data = parsedData[0];

      // Calculate merged state synchronously
      const merged = { ...editForm };
      for (const key in data) {
        if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
          merged[key] = data[key];
        }
      }
      if (data.poster && data.poster !== "No disponible" && data.poster !== "No encontrado") {
        merged.poster = data.poster;
      } else if (!merged.poster) {
        merged.poster = editForm.poster;
      }
      merged.section = targetSec;

      setEditForm(merged);
      
      const cleanCast = Array.isArray(merged.cast)
        ? merged.cast.join(', ')
        : (merged.cast || 'No disponible');
        
      let formattedFicha = "";
      if (targetSec === 'series') {
        formattedFicha = `🎬 Título Mediateca: ${merged.title || 'No disponible'}
🏷️ Título Original: ${merged.originalTitle || 'No disponible'}
📅 Año: ${merged.year || 'No disponible'}
⭐ Rating Global: ${merged.rating ? `${merged.rating}/10 IMDb` : '0/10 IMDb'}
🎭 Género: ${merged.genre || 'No disponible'}
📺 Temporadas : ${merged.season || 'Primera y única'}
⏱️ Capítulos y Duración: ${merged.duration || 'No disponible'}
🌍 País: ${merged.country || 'No disponible'}
🔞 Clasificación: ${merged.ageRating || 'No disponible'}
✍️ Guion: ${merged.script || 'No disponible'}
📀 Formato y Edición: ${merged.format || 'No disponible'}
🎬 Dirección: ${merged.director || 'No disponible'}
🎵 Banda Sonora: ${merged.music || 'No disponible'}
📸 Fotografía: ${merged.photography || 'No disponible'}
🏢 Estudio / Productora: ${merged.companies || 'No disponible'}
📚 Sección (Localización): ${merged.estante || ''}
👥 Elenco Principal: ${cleanCast}
📖 Argumento:
Sinopsis: ${merged.synopsis || 'No disponible'}

Reseñas críticas: ${merged.reviews || 'No disponible'}

Premios históricos: ${merged.awards || 'No disponible'}`;
      } else {
        formattedFicha = `🖼️ Póster: ${merged.poster || 'No disponible'}
🎬 Título Mediateca: ${merged.title || 'No disponible'}
🏷️ Título Original: ${merged.originalTitle || 'No disponible'}
📅 Año: ${merged.year || 'No disponible'}
⭐ Rating Global: ${merged.rating || '0'}/10 IMDb
🎭 Género: ${merged.genre || 'No disponible'}
⏱️ Duración: ${merged.duration || 'No disponible'}
🌍 País: ${merged.country || 'No disponible'}
🔞 Clasificación: ${merged.ageRating || 'No disponible'}
✍️ Guion: ${merged.script || 'No disponible'}
📺 Formato: ${merged.format || 'No disponible'}
🎬 Dirección: ${merged.director || 'No disponible'}
🎵 Banda Sonora: ${merged.music || 'No disponible'}
📸 Fotografía: ${merged.photography || 'No disponible'}
🏢 Estudio: ${merged.companies || 'No disponible'}
📚 Estante (Localización): ${merged.estante || ''}
👥 Elenco: ${cleanCast}
📖 Argumento:
Sinopsis: ${merged.synopsis || 'No disponible'}
Reseñas críticas: ${merged.reviews || 'No disponible'}
Premios históricos: ${merged.awards || 'No disponible'}`;
      }

      setSyncInput(formattedFicha);
      setSyncStatus("¡Ficha extraída correctamente!");

      if (autoSave) {
        const titleToSave = merged.title || "Obra sin título";
        const yearToSave = parseInt(merged.year as any) || new Date().getFullYear();

        if (isAddingNew) {
          const isDuplicate = movies.some(m => 
            m.title?.toLowerCase().trim() === titleToSave.toLowerCase().trim() && 
            m.year == yearToSave
          );
          if (isDuplicate) {
            setIsSyncing(false);
            setSyncStatus("");
            setDuplicateWarningModal({
              open: true,
              title: titleToSave,
              year: yearToSave,
              onConfirm: () => {
                setDuplicateWarningModal({ open: false, title: "", year: 0, onConfirm: null });
                setSyncStatus("Guardando en la bóveda...");
                persistMovieData(merged);
              }
            });
            return;
          }
        }
        setSyncStatus("Guardando en la bóveda...");
        await persistMovieData(merged);
      }
    } catch (err: any) { setSyncError(err.message); } finally { setIsSyncing(false); setTimeout(() => setSyncStatus(""), 3000); }
  };

  const handleDelete = async () => {
    if (!isAdmin || !user || !selectedMovie) return;
    const deletedId = selectedMovie.id;
    try {
      setMovies(prev => prev.filter(m => m.id !== deletedId));
      setSelectedMovie(null); 
      setIsDeleting(false);
      await deleteMovie(deletedId);
    } catch (e: any) { setSyncError("Error al intentar eliminar la obra: " + e.message); }
  };

  const handleToggleReview = async (movie: Movie, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isAdmin || !user) return;
    const newValue = !movie.needsReview;
    try {
      const updatedAt = new Date().toISOString();
      setMovies(prev => prev.map(m => m.id === movie.id ? { ...m, needsReview: newValue, updatedAt } : m));
      if (selectedMovie && selectedMovie.id === movie.id) {
        setSelectedMovie({ ...selectedMovie, needsReview: newValue, updatedAt });
      }
      await updateMovie(movie.id, { needsReview: newValue, updatedAt });
    } catch(e: any) {
      console.warn("Error al actualizar estado de revisión:", e);
    }
  };

  const isFichaOpen = !!selectedMovie || isAddingNew;

  const {
    containerRef: genreStripRef,
    handleMouseMove: handleGenreMouseMove,
    handleMouseLeave: handleGenreMouseLeave
  } = useAutoScroll(isFichaOpen);

  const {
    containerRef: infoBoxesRef,
    handleMouseMove: handleInfoBoxesMouseMove,
    handleMouseLeave: handleInfoBoxesMouseLeave
  } = useAutoScroll(isFichaOpen);

  const {
    containerRef: mainContentRef,
    handleMouseMove: handleMainMouseMove,
    handleMouseLeave: handleMainMouseLeave
  } = useAutoScrollVertical(isFichaOpen);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isDirectorFilterActive || isFavoriteOfMonthActive || isFichaOpen) {
      handleMainMouseLeave();
      handleGenreMouseLeave();
      handleInfoBoxesMouseLeave();
    }
  }, [isDirectorFilterActive, isFavoriteOfMonthActive, isFichaOpen]);

  useEffect(() => {
    if (selectedGenre !== prevGenreRef.current) {
      setAnimateCategory(true);
      prevGenreRef.current = selectedGenre;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (mainContentRef.current) {
        mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      setAnimateCategory(false);
    }
  }, [selectedGenre, currentPage, selectedLetter, selectedYearRange, showHistoryOnly, showReviewOnly, searchTerm]);

  return (
    <div className={`flex flex-col md:flex-row h-screen font-sans selection:bg-[var(--color-brand-main)]/40 overflow-hidden antialiased scroll-smooth transition-colors duration-500 ${isDayMode ? 'bg-zinc-100 text-zinc-900 day-mode' : 'bg-[#0a0a0a] text-zinc-100'}`}>
      
      {/* SIDEBAR */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/80 z-[60] md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <aside className={`w-72 bg-[#050505] border-r border-white/5 flex-col h-full shrink-0 z-[70] transition-transform duration-300 ${isFavoriteOfMonthActive ? 'hidden' : isMobileMenuOpen ? 'fixed left-0 translate-x-0 flex' : 'fixed -translate-x-full md:relative md:translate-x-0 md:flex'}`}>
        <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          
          {/* Logo & Theme Toggle */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-6 mb-2 relative">
            <div className="flex flex-col items-center cursor-pointer group mx-auto w-[140px]" onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); clearFiltersAndSearch(); }}>
              <img 
                src="/android-chrome-512x512.png" 
                alt="Mediateca Logo" 
                className="w-full h-auto rounded-2xl object-cover border border-white/10 group-hover:scale-105 transition-transform duration-500 shadow-xl" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=128&auto=format&fit=crop&q=60';
                }}
              />
            </div>
            <button 
              onClick={() => setIsDayMode(!isDayMode)} 
              className="absolute left-0 top-0 p-2 border border-white/10 hover:bg-white/10 rounded-xl transition-all text-amber-400 hover:scale-105"
              title={isDayMode ? "Cambiar a Modo Noche" : "Cambiar a Modo Día"}
            >
              {isDayMode ? <Moon size={16} className="text-indigo-500" /> : <Sun size={16} className="text-amber-400" />}
            </button>
            <button className="md:hidden text-white absolute right-2 top-0" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>

          {/* Search */}
          <div className="relative group shrink-0 w-full transition-all duration-300">
            {/* Container for the laser gradient beam that sweeps the circular outline */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden p-[1.5px] pointer-events-none z-0">
              {/* Static default border when not focused, fades out on focus */}
              <div className="absolute inset-0 bg-white/[0.04] rounded-2xl group-hover:bg-white/[0.08] transition-colors duration-300 group-focus-within:opacity-0" />
              {/* Spinning gradient beam with wider and more brilliant crimson/white colors */}
              <div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_30%,#e53e3e_45%,#ffffff_50%,#e53e3e_55%,transparent_70%)] opacity-0 group-focus-within:opacity-100 group-focus-within:animate-[spin_2.5s_linear_infinite] transition-opacity duration-500" />
              {/* Inner solid background masking the center */}
              <div className="absolute inset-[1.5px] bg-[#0c0c0e] rounded-[15px]" />
            </div>

            {/* Main visually non-clipped container to allow overflow of shadow, has border on idle but transparent on focus to show laser behind it */}
            <div className="relative w-full bg-[#08080a] group-focus-within:bg-transparent border border-white/[0.06] group-focus-within:border-transparent rounded-2xl transition-all duration-300 group-focus-within:shadow-[0_0_30px_rgba(229,62,62,0.45)] z-10 flex items-center">
              <Search className="search-icon-sidebar absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400/80 group-focus-within:text-[#e53e3e] group-focus-within:scale-110 transition-all duration-300 ease-out z-30" />
              <input 
                id="sidebar-search-input"
                type="text" 
                placeholder={t("Buscar título o año...")} 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                onKeyDown={(e) => { e.stopPropagation(); if(e.key === 'Enter') setIsMobileMenuOpen(false); }} 
                className="w-full bg-transparent py-3 pl-12 pr-10 text-sm text-white outline-none font-semibold placeholder:text-zinc-500 rounded-2xl z-20" 
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setSearchTerm(""); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors z-30"
                  title="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Primary Menu & Filters Organized by Groups */}
          <div className="flex flex-col gap-5 shrink-0">
             
             {/* GROUP: EXPLORAR */}
             <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/[0.28] font-bold px-5 mb-1 mt-5 select-none block">{t("Explorar")}</span>
                <div className="flex flex-col gap-1">
                   {/* Películas */}
                   <button 
                     className={getArchiveSidebarClass(activeExploreTab === 'peliculas' && isArchiveActive)} 
                     onClick={() => {
                       setActiveExploreTab('peliculas');
                       clearFiltersAndSearch();
                       scrollToTop();
                     }}
                   >
                     <Clapperboard className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" /> 
                     <span>{t("PELÍCULAS")}</span>
                   </button>

                   {/* Series */}
                   <button 
                     className={getArchiveSidebarClass(activeExploreTab === 'series')} 
                     onClick={() => {
                       setActiveExploreTab('series');
                       setSelectedLetter(null);
                       setSelectedYearRange(null);
                       setSelectedGenre("Todos");
                       setSearchQuery("");
                       setSearchTerm("");
                       setShowReviewOnly(false);
                       setShowHistoryOnly(false);
                       setIsDirectorFilterActive(false);
                       setIsFavoriteOfMonthActive(false);
                       setCurrentPage(1);
                       scrollToTop();
                     }}
                   >
                     <Tv className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" /> 
                     <span>{t("SERIES")}</span>
                   </button>

                   {/* Centauro */}
                   <button 
                     className={getArchiveSidebarClass(activeExploreTab === 'centauro')} 
                     onClick={() => {
                       setActiveExploreTab('centauro');
                       setSelectedLetter(null);
                       setSelectedYearRange(null);
                       setSelectedGenre("Todos");
                       setSearchQuery("");
                       setSearchTerm("");
                       setShowReviewOnly(false);
                       setShowHistoryOnly(false);
                       setIsDirectorFilterActive(false);
                       setIsFavoriteOfMonthActive(false);
                       setCurrentPage(1);
                       scrollToTop();
                     }}
                   >
                     <Compass className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" /> 
                     <span>{t("CENTAURO")}</span>
                   </button>
                   
                   {/* ALFABÉTICO */}
                   <div>
                     <button 
                       className={getAccordionHeaderClass(selectedLetter !== null)}
                       onClick={() => setIsAlphabetOpen(!isAlphabetOpen)}
                     >
                       <span className="flex items-center gap-4">
                         <ArrowDownAZ className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" /> 
                         <span>{t("ALFABÉTICO")}</span>
                       </span>
                       <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isAlphabetOpen ? 'rotate-180' : ''}`} />
                     </button>
                     <div className={`flex flex-wrap gap-1.5 px-5 overflow-hidden transition-all duration-300 ${isAlphabetOpen ? 'max-h-48 opacity-100 mt-3 mb-2' : 'max-h-0 opacity-0'}`}>
                       <button onClick={() => { setSelectedLetter(null); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); setIsDirectorFilterActive(false); setIsFavoriteOfMonthActive(false); }} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${!selectedLetter ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>{t("Todos")}</button>
                       {ALPHABET.map(l => (
                         <button key={l} onClick={() => { setSelectedLetter(l); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); setIsDirectorFilterActive(false); setIsFavoriteOfMonthActive(false); }} className={`w-7 h-7 rounded-lg text-[11px] font-bold flex items-center justify-center transition-all ${selectedLetter === l ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>{l}</button>
                       ))}
                     </div>
                   </div>

                   {/* ÉPOCAS */}
                   <div>
                     <button 
                       className={getAccordionHeaderClass(selectedYearRange !== null)}
                       onClick={() => setIsErasOpen(!isErasOpen)}
                     >
                       <span className="flex items-center gap-4">
                         <CalendarDays className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" /> 
                         <span>{t("ÉPOCAS")}</span>
                       </span>
                       <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isErasOpen ? 'rotate-180' : ''}`} />
                     </button>
                     <div className={`flex flex-col gap-1 px-5 overflow-hidden transition-all duration-300 ${isErasOpen ? 'max-h-[800px] opacity-100 mt-3 mb-2' : 'max-h-0 opacity-0'}`}>
                       <button onClick={() => { setSelectedYearRange(null); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); setIsDirectorFilterActive(false); setIsFavoriteOfMonthActive(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${!selectedYearRange ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Cualquier Año</button>
                       {YEAR_RANGES.map(range => (
                         <button key={range.label} onClick={() => { setSelectedYearRange(range); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); setIsDirectorFilterActive(false); setIsFavoriteOfMonthActive(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${selectedYearRange?.label === range.label ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>{range.label}</button>
                       ))}
                     </div>
                   </div>

                   {/* CATEGORÍAS */}
                   <div>
                     <button 
                       className={getAccordionHeaderClass(selectedGenre !== "Todos")}
                       onClick={() => setIsCategoriesOpen(!isCategoriesOpen)}
                     >
                       <span className="flex items-center gap-4">
                         <LayoutGrid className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" /> 
                         <span>{t("CATEGORÍAS")}</span>
                       </span>
                       <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isCategoriesOpen ? 'rotate-180' : ''}`} />
                     </button>
                     <div className={`flex flex-col gap-1 px-5 overflow-hidden transition-all duration-300 ${isCategoriesOpen ? 'max-h-[3000px] opacity-100 mt-3 mb-2' : 'max-h-0 opacity-0'}`}>
                       {dynamicGenres.map(g => (
                         <button key={g} onClick={() => { setSelectedGenre(g); setShowHistoryOnly(false); setShowReviewOnly(false); setCurrentPage(1); setIsMobileMenuOpen(false); setIsDirectorFilterActive(false); setIsFavoriteOfMonthActive(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all flex justify-between items-center ${selectedGenre === g ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                           <span>{g}</span>
                         </button>
                       ))}
                     </div>
                   </div>

                   {/* FILTRO DEL DIRECTOR */}
                   <button 
                     className={getArchiveSidebarClass(isDirectorFilterActive)} 
                     onClick={() => {
                       setSelectedLetter(null);
                       setSelectedYearRange(null);
                       setSelectedGenre("Todos");
                       setSearchQuery("");
                       setSearchTerm("");
                       setShowReviewOnly(false);
                       setShowHistoryOnly(false);
                       setIsFavoriteOfMonthActive(false);
                       setIsDirectorFilterActive(true);
                        setCuratorSala(null);
                        setCuratorTono(null);
                        setCuratorGenero("Todos");
                        setCuratorEpoca("Todas");
                       setCuratorRecommendations([]);
                       setCurrentPage(1);
                       setIsMobileMenuOpen(false);
                       scrollToTop();
                     }}
                   >
                     <Video className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" strokeWidth={1.5} /> 
                     <span className="font-extrabold tracking-widest text-[11px]">{t("FILTRO DEL DIRECTOR")}</span>
                   </button>

                   {/* PELÍCULAS DEL MES */}
                   <button 
                     className={getArchiveSidebarClass(isFavoriteOfMonthActive)} 
                     onClick={() => {
                       setSelectedLetter(null);
                       setSelectedYearRange(null);
                       setSelectedGenre("Todos");
                       setSearchQuery("");
                       setSearchTerm("");
                       setShowReviewOnly(false);
                       setShowHistoryOnly(false);
                       setIsDirectorFilterActive(false);
                       setIsFavoriteOfMonthActive(true);
                       setCurrentPage(1);
                       setIsMobileMenuOpen(false);
                       scrollToTop();
                     }}
                   >
                     <Star className={`w-5 h-5 transition-all duration-300 ease-out ${isFavoriteOfMonthActive ? 'text-[#DFB15B]' : 'text-zinc-400'} group-hover:scale-125 group-hover:text-[#DFB15B]`} strokeWidth={1.5} /> 
                     <span className="font-extrabold tracking-widest text-[11px] uppercase">Películas del mes</span>
                   </button>
                </div>
             </div>

             {/* Separator 1 */}
             <div className="border-t border-white/[0.06] my-1 mx-2" />

             {/* GROUP: ACTIVIDAD */}
             <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/[0.28] font-bold px-5 mb-1 mt-5 select-none block">Actividad</span>
                <div className="flex flex-col gap-1">
                   <button 
                     onClick={activeHistory} 
                     className={getHistorySidebarClass(showHistoryOnly)}
                   >
                     <HistoryIcon className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-125 group-hover:text-red-500" /> 
                     <span>{t("HISTORIAL")}</span>
                   </button>
                </div>
             </div>

             {/* GROUP: GESTIÓN (Conditional on isAdmin) */}
             {isAdmin && (
                <>
                   {/* Separator 2 */}
                   <div className="border-t border-white/[0.06] my-1 mx-2" />

                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-white/[0.28] font-bold px-5 mb-1 mt-5 select-none block">Gestión</span>
                      <div className="flex flex-col gap-1">
                         <button 
                           onClick={() => { setPasteTargetSection(activeExploreTab === 'series' ? 'series' : activeExploreTab === 'centauro' ? 'centauro' : 'peliculas'); setShowPasteModal(true); }} 
                           disabled={batchProgress.active} 
                           className={`${getSidebarItemClass(false)} disabled:opacity-50`}
                         >
                           <ClipboardList className="w-5 h-5 transition-colors group-hover:text-red-500" /> 
                           <span>{t("MULTI PEGADO")}</span>
                         </button>
                         <button 
                           onClick={() => setShowAdminsModal(true)} 
                           className={getSidebarItemClass(false)}
                         >
                           <Users className="w-5 h-5 transition-colors group-hover:text-red-500" /> 
                           <span>{t("GESTIONAR ADMINS")}</span>
                         </button>
                         <button 
                           onClick={() => { const newVal = !showReviewOnly; setShowReviewOnly(newVal); if (newVal) setShowHistoryOnly(false); }} 
                           className={getReviewSidebarClass(showReviewOnly)}
                         >
                           <AlertTriangle className="w-5 h-5 transition-colors group-hover:text-red-500" /> 
                           <span>{t("PARA REVISIÓN")}</span>
                         </button>
                         <button 
                           onClick={exportToCSV} 
                           className={getSidebarItemClass(false)}
                         >
                           <Download className="w-5 h-5 transition-colors group-hover:text-red-500" /> 
                           <span>{t("EXPORTAR CSV")}</span>
                         </button>

                      </div>
                   </div>
                </>
             )}

          </div>
        </div>

        {/* Action Button & Profile */}
        <div className="p-6 flex flex-col gap-6 mt-auto border-t border-white/5 bg-[#030303] shrink-0">
          {isAdmin && (
            <button 
              onClick={() => { setEditForm({ title: "", year: 2026, rating: 0, synopsis: "", cast: [], poster: "", duration: "", script: "", photography: "", music: "", companies: "", originalTitle: "", country: "", genre: "", ageRating: "", format: "", reviews: "", awards: "", director: "", needsReview: false, section: activeExploreTab === 'series' ? 'series' : activeExploreTab === 'centauro' ? 'centauro' : 'peliculas' }); setSyncInput(""); setIsAddingNew(true); }} 
              className="relative group overflow-hidden w-full h-14 rounded-xl z-10 flex items-center justify-center p-[2px] transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(180,29,29,0.15)] hover:shadow-[0_0_30px_rgba(180,29,29,0.3)]"
            >
              {/* Repeating animated conic gradient background */}
              <span className="absolute inset-[-400%] bg-[conic-gradient(from_0deg,#b41d1d_0deg,#0a0a0c_90deg,#27272a_180deg,#b41d1d_240deg,#0a0a0c_270deg,#b41d1d_360deg)] animate-[spin_3s_linear_infinite] z-0" />
              
              {/* Inner container to mask and display the premium label */}
              <span className="absolute inset-[1.5px] bg-[#0c0c0e] rounded-[10px] group-hover:bg-[#121215] transition-colors duration-300 z-10 flex items-center justify-center gap-2 text-white font-black uppercase tracking-[0.2em] text-xs">
                <Plus size={16} className="text-[#b41d1d] group-hover:text-white transition-colors duration-300" />
                <span>{t("NUEVA ENTRADA")}</span>
              </span>
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-4 pt-2 cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-colors">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=random`} alt="Avatar" className="w-10 h-10 rounded-full border border-white/10" />
              <div className="flex flex-col overflow-hidden">
                 <span className="text-white font-bold text-xs truncate">{user.displayName || 'Curator Profile'}</span>
                 <span className="text-zinc-500 text-[10px] truncate uppercase tracking-widest">{isAdmin ? `${t("Administrador")} / ${t("Editor")}` : 'Mediateca Viewer'}</span>
              </div>
              <button onClick={() => { setIsBypassActive(false); logout(); }} className="ml-auto text-zinc-600 hover:text-brand-light p-1"><LogOut size={14}/></button>
            </div>
          ) : (
             <button onClick={async () => {
               if (window.confirm("¿Deseas iniciar sesión oficialmente con Google OAuth?\n\n(Haz clic en 'Cancelar' si estás en modo Dev y prefieres hacer un BYPASS LOCAL para usar las herramientas de administrador).")) {
                 try {
                   await signInWithGoogle();
                 } catch (err: any) {
                   alert("Error de inicio de sesión: " + err.message);
                 }
               } else {
                 setIsBypassActive(true);
                 setUser({ email: 'chapceligg@gmail.com', displayName: 'Admin Maestro (Bypass Dev)', photoURL: '' });
                 setIsAdmin(true);
                 setUserRole('admin');
                 setIsAuthChecking(false);
               }
             }} className="app-login-btn flex items-center justify-center gap-3 pt-2 cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-colors text-white font-bold w-full">
                <LogIn size={18} /> Acceso Editores
             </button>
          )}
        </div>
      </aside>

       {/* MOBILE NAV BURGER */}
      <nav className={`md:hidden sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-white/5 p-4 flex flex-row items-center justify-between ${isFavoriteOfMonthActive ? 'hidden' : ''}`}>
         <div className="flex items-center gap-2 cursor-pointer" onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); clearFiltersAndSearch(); }}>
           <img 
             src="/android-chrome-512x512.png" 
             alt="Mediateca Logo" 
             className="w-10 h-10 rounded-lg object-cover border border-white/10" 
             onError={(e) => {
               (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=128&auto=format&fit=crop&q=60';
             }}
           />
         </div>
         <div className="flex gap-2 items-center">
            <button 
              onClick={() => setIsDayMode(!isDayMode)} 
              className="p-2 border border-white/10 rounded-xl text-amber-400 hover:bg-white/5 transition-colors"
              title={isDayMode ? "Modo Noche" : "Modo Día"}
            >
              {isDayMode ? <Moon size={18} className="text-indigo-500" /> : <Sun size={18} />}
            </button>
            {isAdmin && <button onClick={() => { setPasteTargetSection(activeExploreTab === 'series' ? 'series' : activeExploreTab === 'centauro' ? 'centauro' : 'peliculas'); setShowPasteModal(true); }} className="p-2 border border-white/10 rounded-xl"><ClipboardPaste size={18}/></button>}
            {isAdmin && <button onClick={() => { setEditForm({ title: "", year: 2026, rating: 0, synopsis: "", cast: [], poster: "", duration: "", script: "", photography: "", music: "", companies: "", originalTitle: "", country: "", genre: "", ageRating: "", format: "", reviews: "", awards: "", director: "", needsReview: false, section: activeExploreTab === 'series' ? 'series' : activeExploreTab === 'centauro' ? 'centauro' : 'peliculas' }); setSyncInput(""); setIsAddingNew(true); }} className="p-2 bg-[#b91c1c] hover:bg-[#dc2626] transition-colors text-white rounded-xl"><Plus size={18}/></button>}
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 border border-white/10 rounded-xl text-zinc-400 hover:text-white"><Menu size={18}/></button>
         </div>
      </nav>

      {/* MAIN LAYOUT */}
      <main 
        ref={mainContentRef as any}
        onMouseMove={(e) => {
          if (!isDirectorFilterActive && !isFavoriteOfMonthActive && !isFichaOpen) {
            handleMainMouseMove(e as any);
          } else {
            handleMainMouseLeave();
          }
        }}
        onMouseLeave={handleMainMouseLeave}
        className={`flex-1 overflow-x-hidden overflow-y-auto scroll-smooth relative transition-colors duration-500 ${
          isFavoriteOfMonthActive ? 'bg-black' : ''
        }`}
      >
        {isFavoriteOfMonthActive && (
          <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-black">
            <img 
              id="theatre-bg"
              src="https://drive.google.com/uc?export=download&id=1Bjnw0n4r_iRwpphEtKS4veUPJiCq2h2C" 
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes('/ImFondo.png')) {
                  target.src = "/ImFondo.png";
                } else if (!target.src.includes('unsplash.com')) {
                  target.src = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop";
                }
              }}
              className="w-full h-full object-cover opacity-100 transition-opacity duration-1000"
              alt="Sala de Cine"
              referrerPolicy="no-referrer"
            />
            {/* Subtle overlay gradient to maintain text readability without obscuring the background details */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />
          </div>
        )}

        {!searchTerm && !showHistoryOnly && !showReviewOnly && (!selectedLetter || selectedLetter === "Todos") && selectedGenre !== "Todos" && (
          <CinematicBackground selectedGenre={selectedGenre} />
        )}
      
      {/* Auth Denied Alert */}
      {authDenied && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] max-w-sm w-full px-4 animate-in slide-in-from-bottom-5 fade-in duration-500">
          <div className="bg-white text-black p-4 rounded-xl shadow-2xl flex items-start gap-4">
            <div className="flex flex-col gap-1 w-full pr-4">
               <span className="font-bold text-[13px] tracking-tight flex items-center gap-2">
                 <AlertTriangle size={14} className="text-brand-main" /> Área Privada
               </span>
               <p className="text-xs font-medium text-zinc-600 leading-relaxed">
                 Acceso exclusivo para equipo. Puedes seguir usando el catálogo.
               </p>
            </div>
            <button onClick={() => setAuthDenied(false)} className="text-zinc-400 hover:text-black shrink-0 relative top-0.5">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {batchProgress.active && (() => {
        const progressPercentage = Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100);
        return (
          <div className="fixed bottom-10 right-10 z-[200] bg-[#050507]/95 border border-[#b41d1d]/30 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_40px_rgba(180,29,29,0.15)] rounded-2xl w-[380px] animate-in slide-in-from-bottom-5 fade-in duration-500 overflow-hidden backdrop-blur-xl">
            {/* Tira de celuloide superior (Sprockets) */}
            <div className="flex justify-between items-center px-4 py-2 bg-black/60 border-b border-white/[0.06] select-none">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="w-2.5 h-3.5 bg-zinc-800 rounded-sm border border-black/40" />
              ))}
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse inline-block" />
                    <span className="text-zinc-500 font-mono text-[9px] font-black tracking-[0.25em] uppercase">RODAJE EN PROGRESO</span>
                  </div>
                  <h3 className="text-white font-black uppercase tracking-widest text-[13px] font-sans">
                    PROCESO DE LOTE
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-500/20 px-2 py-1 rounded-md">
                  <Clapperboard className="w-3.5 h-3.5 text-[#b41d1d] animate-pulse" />
                  <span className="text-[10px] font-mono font-black text-red-400">{progressPercentage}%</span>
                </div>
              </div>
              
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest font-mono">Título Actual</span>
                <p className="text-white text-xs font-bold font-sans tracking-wide truncate max-w-full">
                  {batchProgress.currentMovie || "Sincronizando obra..."}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="w-full bg-black/80 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/[0.05]">
                  <div 
                    className="bg-gradient-to-r from-[#b41d1d] via-[#ff4d4d] to-[#ff9999] h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                  <span>TOMA {batchProgress.current}</span>
                  <span>TOTAL: {batchProgress.total}</span>
                </div>
              </div>
            </div>

            {/* Tira de celuloide inferior (Sprockets) */}
            <div className="flex justify-between items-center px-4 py-2 bg-black/60 border-t border-white/[0.06] select-none">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="w-2.5 h-3.5 bg-zinc-800 rounded-sm border border-black/40" />
              ))}
            </div>
          </div>
        );
      })()}

      {/* MODAL MÚLTIPLE PEGADO */}
      {showPasteModal && (
        <div className="fixed inset-0 z-[300] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-4 animate-in fade-in duration-300 font-sans">
          <div className="bg-zinc-950/80 border border-white/[0.08] rounded-[2rem] max-w-2xl w-full p-8 shadow-[0_0_150px_rgba(180,29,29,0.12)] flex flex-col relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-[#b41d1d]/40 via-[#b41d1d] to-[#b41d1d]/40 left-0" />
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#b41d1d]/10 border border-[#b41d1d]/30 text-[#b41d1d] rounded-xl">
                  <ClipboardPaste size={28} />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-white font-sans">
                  Pegado Maestro <span className="text-[#b41d1d]">x{pasteLimit}</span>
                </h2>
              </div>
              <div className="flex items-center bg-white/[0.02] border border-white/[0.07] rounded-xl p-1 shrink-0">
                <button 
                  onClick={() => setPasteLimit(5)} 
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-extrabold tracking-[0.2em] uppercase transition-all duration-300 ${pasteLimit === 5 ? 'bg-[#b41d1d] text-white shadow-md' : 'text-zinc-500 hover:text-white'}`}
                >
                  x5
                </button>
                <button 
                  onClick={() => setPasteLimit(10)} 
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-extrabold tracking-[0.2em] uppercase transition-all duration-300 ${pasteLimit === 10 ? 'bg-[#b41d1d] text-white shadow-md' : 'text-zinc-500 hover:text-white'}`}
                >
                  x10
                </button>
              </div>
            </div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-zinc-500 mb-4 pl-1 font-sans">
              Convierte texto plano en fichas mágicamente usando IA
            </p>

            {/* SELECCIÓN DE PESTAÑA DESTINO */}
            <div className="mb-5 flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                <span>Pestaña Destino:</span>
              </label>
              <div className="grid grid-cols-3 gap-2 bg-white/[0.02] border border-white/[0.07] p-1.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPasteTargetSection('peliculas')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                    pasteTargetSection === 'peliculas'
                      ? 'bg-[#b41d1d] text-white shadow-lg shadow-[#b41d1d]/30 font-extrabold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Clapperboard size={16} />
                  <span>Películas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPasteTargetSection('centauro')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                    pasteTargetSection === 'centauro'
                      ? 'bg-[#b41d1d] text-white shadow-lg shadow-[#b41d1d]/30 font-extrabold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Compass size={16} />
                  <span>Centauro</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPasteTargetSection('series')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                    pasteTargetSection === 'series'
                      ? 'bg-[#b41d1d] text-white shadow-lg shadow-[#b41d1d]/30 font-extrabold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Tv size={16} />
                  <span>Series</span>
                </button>
              </div>
            </div>
            
            <div className="relative group w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-2xl p-6 shadow-inner">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full h-80 bg-transparent border-none p-0 text-zinc-100 text-sm font-semibold tracking-normal outline-none focus:ring-0 placeholder-zinc-700 transition-all resize-none font-sans leading-relaxed custom-scrollbar"
                placeholder={
                  pasteTargetSection === 'series'
                    ? `Pega aquí la información de tus series...\n\n1) 13 MIEDOS\n🎬 Título Mediateca: 13 MIEDOS\n🏷️ Título Original: 13 Miedos\n📅 Año: 2007\n⭐ Rating Global: 7.2/10 IMDb\n🎭 Género: Terror / Suspenso / Mexicanas\n📺 Temporadas : Primera y única\n⏱️ Capítulos y Duración: 13 Capítulos / 45 min\n🌍 País: México\n🔞 Clasificación: C\n✍️ Guion: Constantino Morán / Ricardo Campos\n📀 Formato y Edición: DVD (4 discos - Copia)\n🎬 Dirección: Varios directores (Lemon Films)\n🎵 Banda Sonora: Música incidental de terror y suspenso\n📸 Fotografía: Televisión / Cine digital\n🏢 Estudio / Productora: Televisa / Lemon Films\n📚 Sección (Localización): Terror\n👥 Elenco Principal: Constantino Morán, Ricardo Campos y reparto\n📖 Argumento:\nSinopsis: ...\n\n(Soporta hasta ${pasteLimit} series al mismo tiempo)`
                    : `Pega aquí la información de tus películas...\n\n🖼️ Póster: https://...\n🎬 Título Mediateca: El Padrino\n📅 Año: 1972\n... (Soporta hasta ${pasteLimit} películas al mismo tiempo)`
                }
              />
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full">
              <button 
                type="button"
                onClick={() => setShowPasteModal(false)} 
                className="flex-1 select-none outline-none border border-white/10 hover:border-[#b41d1d] text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 rounded-xl py-4 font-sans font-extrabold uppercase text-[10px] tracking-[0.25em] transition-all h-14"
              >
                Cancelar
              </button>
              
              <button 
                type="button"
                onClick={handleProcessPastedText} 
                disabled={!pastedText.trim()} 
                className="relative group/btn shadow-[0_4px_24px_rgba(180,29,29,0.15)] hover:shadow-[0_4px_30px_rgba(180,29,29,0.35)] flex-1 h-14 rounded-xl z-10 flex items-center justify-center p-[1.5px] transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none bg-gradient-to-r from-[#b41d1d]/60 via-white/40 to-[#b41d1d]/60 hover:from-[#b41d1d] hover:via-white hover:to-[#b41d1d]"
              >
                <span className="absolute inset-[1px] bg-[#0c0c0e] rounded-[11px] group-hover/btn:bg-[#121215] transition-all duration-300 z-10 flex items-center justify-center gap-2 text-white font-extrabold uppercase tracking-[0.25em] text-[10px] font-sans w-[calc(100%-2px)] h-[calc(100%-2px)]">
                  <Sparkles size={14} className="text-[#b41d1d] group-hover/btn:text-white transition-colors duration-300" />
                  <span>Extraer y Guardar</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isSyncing && !isAddingNew && !selectedMovie && !batchProgress.active && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] bg-black/90 backdrop-blur-xl border border-brand-main shadow-[0_0_30px_rgba(179,5,0,0.5)] px-8 py-4 rounded-full flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-500">
          <Loader2 className="animate-spin text-brand-light" size={24} />
          <p className="text-[12px] font-black text-white uppercase tracking-[0.2em]">{syncStatus}</p>
        </div>
      )}

      {/* GALERÍA PAGINADA (CUADRÍCULA 7x3) O VISTAS DE PESTAÑAS */}
      {!isDirectorFilterActive && !isFavoriteOfMonthActive && (
        <div className={`relative z-10 max-w-7xl mx-auto p-6 md:p-12 pb-2 ${selectedGenre !== "Todos" ? "category-section-view" : "archivo-section-view"}`}>
        
        {activeExploreTab === 'series' && filteredMovies.length === 0 && !searchTerm && selectedGenre === "Todos" && !selectedLetter && !selectedYearRange && !showHistoryOnly && !showReviewOnly && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 animate-in fade-in duration-500 my-12">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,0,0,0.5)] group">
              <Tv size={38} className="text-[#b41d1d] transition-transform duration-500 group-hover:scale-110" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-widest font-barlow-condensed mb-3">
              Series
            </h2>
            <p className="text-xs md:text-sm text-zinc-400 font-extrabold uppercase tracking-[0.25em] max-w-md">
              Sección vacía por el momento
            </p>
          </div>
        )}

        {activeExploreTab === 'centauro' && filteredMovies.length === 0 && !searchTerm && selectedGenre === "Todos" && !selectedLetter && !selectedYearRange && !showHistoryOnly && !showReviewOnly && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 animate-in fade-in duration-500 my-12">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,0,0,0.5)] group">
              <Compass size={38} className="text-[#b41d1d] transition-transform duration-500 group-hover:scale-110" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-widest font-barlow-condensed mb-3">
              Centauro
            </h2>
            <p className="text-xs md:text-sm text-zinc-400 font-extrabold uppercase tracking-[0.25em] max-w-md">
              Sección vacía por el momento
            </p>
          </div>
        )}

        {(activeExploreTab === 'peliculas' || filteredMovies.length > 0 || searchTerm || selectedGenre !== "Todos" || selectedLetter || selectedYearRange || showHistoryOnly || showReviewOnly) && (
          <>
            {/* ENCABEZADO DE SECCIÓN CENTAURO */}
            {/* Removido según solicitud de usuario */}
        {/* ENCABEZADO DE CATEGORÍA CINEASTA */}
        {!searchTerm && !showHistoryOnly && !showReviewOnly && (!selectedLetter || selectedLetter === "Todos") && selectedGenre !== "Todos" && (
          <div id="category-header-section" key={selectedGenre} className="mb-10 flex flex-col gap-1 relative pt-4 select-none">

            <h2 className="relative z-10 text-[36px] md:text-[64px] flex items-center gap-4 text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.95)]">
              {/* Dynamic elegant filmmaker laser beam with a non-distracting slow shimmer */}
              <div className="relative flex items-center shrink-0 self-stretch py-1">
                <span className="w-[5px] h-full bg-gradient-to-b from-[#ff4d4d] via-[#b41d1d] to-[#450a0a] rounded-full shadow-[0_0_20px_rgba(239,68,68,0.75)] animate-beam-subtle" />
                <span className="absolute inset-0 w-full h-[60%] bg-[#ef4444] rounded-full blur-[2px] opacity-15" />
              </div>
              
              <span className="stranger-title-text animate-stranger-reveal inline-block hover:scale-[1.01] transition-transform duration-500">
                {selectedGenre}
              </span>
            </h2>

            <p className="relative z-10 text-[10px] md:text-xs text-zinc-400 font-extrabold tracking-[0.35em] uppercase ml-6 mt-2 animate-cinematic-subtitle drop-shadow-md flex items-center gap-2">
              <span className="text-[#ef4444] font-black">•</span>
              <span>{filteredMovies.length} {filteredMovies.length === 1 ? "obra" : "obras"} en exhibición</span>
            </p>
          </div>
        )}

        {paginatedMovies.length > 0 ? (
          <>
            <div 
              key={`grid-${selectedGenre}`} 
              className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12 pt-4 ${
                animateCategory && !searchTerm && !showHistoryOnly && !showReviewOnly && (!selectedLetter || selectedLetter === "Todos") && selectedGenre !== "Todos"
                  ? "animate-grid-emergence" 
                  : ""
              }`}
            >
              {paginatedMovies.map((movie, idx) => (
                <div 
                  key={movie.id} 
                  onClick={() => { setSelectedMovie(movie); setIsEditing(false); setIsDeleting(false); }} 
                  className={`group relative flex flex-col gap-3 cursor-pointer ${
                    animateCategory ? "animate-in fade-in slide-in-from-bottom-8" : ""
                  }`}
                  style={animateCategory ? { animationDelay: `${idx * 40}ms` } : undefined}
                >
                  <div className="aspect-[2/3] w-full overflow-hidden relative rounded-lg shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/5 transition-all duration-500 group-hover:border-white/20 group-hover:-translate-y-2 group-hover:shadow-[0_20px_50px_rgba(220,38,38,0.15)] bg-zinc-900 shimmer-placeholder">
                    <img 
                      src={movie.poster || DEMO_POSTER} 
                      className="w-full h-full object-cover bg-zinc-900 card-scale-img" 
                      alt={movie.title} 
                      referrerPolicy="no-referrer"
                      onError={(e: any) => { if (e.target.src !== DEMO_POSTER) e.target.src = DEMO_POSTER; }} 
                      loading="lazy"
                    />
                    
                    {/* Gradient Overlay & details trigger */}
                    <div className="absolute inset-0 card-hover-gradient pointer-events-none z-10" />

                    {/* Reveal content on hover */}
                    <div className="absolute inset-0 flex flex-col justify-end p-3.5 reveal-on-hover pointer-events-none z-20">
                      {/* Bottom row: rating only with high-legibility shading */}
                      <div className="flex items-center justify-end w-full">
                        <div className="flex items-center gap-1 text-[12px] text-white font-bold bg-black/40 px-2 py-1 rounded-md border border-white/5 shadow-[0_2px_8px_rgba(0,0,0,0.2)] backdrop-blur-sm">
                          <Star size={11} fill="currentColor" className="text-[#f59e0b]" />
                          <span>{Number(movie.rating || 0).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && movie.needsReview && (
                      <div className="absolute top-3 left-3 bg-[var(--color-brand-main)]/90 backdrop-blur-md px-2 py-1.5 rounded-md text-[9px] font-black text-white uppercase tracking-widest flex items-center gap-1 shadow-[0_0_20px_rgba(179,5,0,0.5)] z-30">
                        <AlertTriangle size={10}/> REVISAR
                      </div>
                    )}
                    {movie.year < 1980 && !movie.needsReview && (
                      <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md border border-white/20 px-2 py-1.5 rounded-md text-[9px] font-black text-white uppercase tracking-widest flex items-center gap-1 z-30">
                         <Landmark size={10}/> CLÁSICO
                      </div>
                    )}
                  </div>

                  <div translate="no" className="flex flex-col gap-1 px-1 notranslate">
                    <h3 className="text-zinc-100 font-medium text-[13px] leading-tight line-clamp-2 group-hover:text-brand-light transition-colors drop-shadow-sm tracking-normal">{toTitleCase(movie.title)}</h3>
                    <div className={`flex items-center text-[11px] tracking-wide gap-2 mt-0.5 font-bold ${isDayMode ? '' : 'text-zinc-400 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]'}`}>
                      <span className={isDayMode ? 'text-[#b41d1d]' : ''}>{movie.year}</span>
                      <span className={`w-1 h-1 rounded-full ${isDayMode ? 'bg-slate-400' : 'bg-zinc-500'}`} />
                      <span className={`truncate ${isDayMode ? 'text-slate-900 font-semibold' : ''}`}>{movie.director?.split(',')[0] || "Unknown"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-32 px-4 text-center flex flex-col items-center justify-center gap-6 max-w-md mx-auto relative">
            {/* Highly Polished Circular Celluloid Film Reel Logo */}
            <div className="relative mb-2 group select-none flex items-center justify-center">
              {/* Soft dark red cinema light glow behind the reel - only visible on hover */}
              <div className="absolute -inset-10 bg-[#b41d1d]/15 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              
              {/* Outer Reel Disk Container */}
              <div className="relative w-24 h-24 rounded-full bg-[#121214] border border-zinc-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex items-center justify-center overflow-hidden transition-all duration-700 group-hover:border-[#b41d1d]/50 group-hover:scale-105 group-hover:rotate-[45deg]">
                
                {/* Radial Sprocket Holes (Circular Perforaciones) */}
                {[...Array(12)].map((_, i) => (
                  <div 
                    key={i} 
                    className="absolute w-2 h-2.5 bg-[#08080a] border border-zinc-800/60 rounded-[1.5px] before:absolute before:inset-[1.2px] before:bg-zinc-950"
                    style={{
                      transform: `rotate(${i * 30}deg) translateY(-38px)`
                    }}
                  />
                ))}

                {/* Inner Metallic Spokes of the Cinema Reel */}
                {[...Array(6)].map((_, i) => (
                  <div 
                    key={i}
                    className="absolute h-[64px] w-[1px] bg-zinc-800/40 pointer-events-none"
                    style={{ transform: `rotate(${i * 30}deg)` }}
                  />
                ))}

                {/* Inner Central Film Cartridge Core */}
                <div className="relative w-13 h-13 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center z-10 shadow-inner transition-all duration-700 group-hover:border-[#b41d1d]/40 group-hover:rotate-[-45deg]">
                  <Film size={20} className="text-zinc-500 group-hover:text-[#b41d1d] group-hover:drop-shadow-[0_0_8px_rgba(180,29,29,0.73)] transition-all duration-500" />
                </div>
                
                {/* Glossy overlay reflection across the circular reel disk */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent pointer-events-none" />
              </div>
            </div>

            <h2 className="text-lg font-bold text-white tracking-tight leading-snug">
              {searchTerm ? `No se encontraron películas para "${searchTerm}"` : "No se encontraron películas"}
            </h2>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-xs -mt-2">
              Prueba un término más general, verifica la ortografía o cambia los filtros de Épocas y Categorías seleccionados.
            </p>
            {(searchTerm || selectedGenre !== "Todos" || selectedLetter || selectedYearRange || showReviewOnly) && (
              <button 
                onClick={clearFiltersAndSearch}
                className="mt-2 px-5 py-2.5 bg-white text-black hover:bg-brand-main hover:text-white rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                Limpiar Filtros y Búsqueda
              </button>
            )}
          </div>
        )}

        </>
        )}


        </div>
      )}

      {/* MODAL DETALLES / CATALOGACIÓN */}
      {(selectedMovie || isAddingNew) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/[0.45] backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto">
          <div className={`bg-[#050507] border border-[#b41d1d]/20 w-full max-w-7xl rounded-2xl overflow-hidden relative shadow-[0_30px_100px_rgba(0,0,0,0.95),0_0_80px_rgba(180,29,29,0.15)] flex flex-col ${(isEditing || isAddingNew) ? 'md:flex-row-reverse' : 'md:flex-row'} max-h-[95vh] my-auto animate-in zoom-in-95 duration-500`}>
            <button 
              onClick={() => { setSelectedMovie(null); setIsAddingNew(false); setIsEditing(false); setIsDeleting(false); setIsConfirmingMove(false); }} 
              className="absolute top-6 right-6 p-2.5 bg-neutral-900/60 text-neutral-400 border border-neutral-800/80 rounded-full z-[110] transition-all duration-300 hover:scale-110 hover:bg-neutral-950 hover:text-white hover:border-[#b41d1d] hover:shadow-[0_0_12px_rgba(180,29,29,0.59)] active:scale-95"
            >
              <X size={20} />
            </button>
            <div className={`w-full md:w-[350px] shrink-0 ${(isEditing || isAddingNew) ? 'bg-[#09090b]/80 backdrop-blur-xl border border-[#b41d1d]/25 md:m-6 m-3 rounded-2xl shadow-[0_0_50px_rgba(180,29,29,0.22)]' : 'bg-[#050505] border-r border-white/5'} relative flex flex-col overflow-hidden transition-all duration-500`}>
              {/* VISOR AUTOMÁTICO DE PÓSTER CON IA - Agregado key reactiva para forzar refresco de imagen */}
              <div className="flex-1 overflow-hidden group relative flex items-center justify-center px-2 py-6 bg-black/[0.1]">
                <img 
                  key={(isAddingNew || isEditing) ? editForm.poster : selectedMovie?.poster}
                  src={(isAddingNew || isEditing) ? (editForm.poster || DEMO_POSTER) : (selectedMovie?.poster || DEMO_POSTER)} 
                  referrerPolicy="no-referrer"
                  className={`w-full max-h-[500px] object-contain transition-all duration-700 cursor-pointer ${
                    isEditing || isAddingNew 
                      ? 'rounded-xl shadow-[0_15px_40px_rgba(0,0,0,0.85)]' 
                      : 'rounded-2xl border border-[#b41d1d]/35 shadow-[0_0_40px_rgba(180,29,29,0.38)]'
                  } opacity-95 group-hover:opacity-100`} 
                  onClick={() => setFullscreenImage((isAddingNew || isEditing) ? (editForm.poster || DEMO_POSTER) : (selectedMovie?.poster || DEMO_POSTER))}
                  alt="Poster Preview" 
                  onError={(e: any) => { if (e.target.src !== DEMO_POSTER) e.target.src = DEMO_POSTER; }} 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/20 via-transparent to-transparent pointer-events-none" />
                {/* INDICADOR DE CARGA DE PÓSTER */}
                {(isAddingNew || isEditing) && isSyncing && (
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8 space-y-4 animate-in fade-in duration-500 rounded-2xl">
                    <Sparkles className="w-10 h-10 text-[#b41d1d] animate-bounce" />
                    <p className="text-[10px] font-sans font-black text-white uppercase tracking-[0.3em] leading-relaxed">
                      Rastreando dirección de imagen...
                    </p>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="p-6 bg-black/40 border-t border-white/5 w-full space-y-3 z-10 font-sans">
                  <span className="text-[9px] font-extrabold uppercase tracking-[0.25em] text-zinc-400 flex items-center gap-2 drop-shadow-md font-sans">
                    <ImageIcon size={14} className="text-[#b41d1d]"/> PÓSTER (MANUAL / URL)
                  </span>
                  <div className="flex gap-2 font-sans">
                    <input 
                      type="text" 
                      value={isEditing || isAddingNew ? (editForm.poster || "") : (selectedMovie?.poster || "")} 
                      onChange={(e) => handleManualPosterUpdate(e.target.value)} 
                      onKeyDown={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent border-b border-t-0 border-l-0 border-r-0 border-white/20 focus:border-[#b41d1d] py-2 px-1 text-xs font-sans text-zinc-300 outline-none transition-colors" 
                      placeholder="Pegar dirección del póster..."
                    />
                    <label className="bg-white/5 hover:bg-[#b41d1d]/15 border border-white/10 text-white p-3 rounded-lg flex items-center justify-center cursor-pointer transition-all shrink-0">
                      <Upload size={14} />
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 md:p-14 flex-1 overflow-y-auto custom-scrollbar">
              {isEditing || isAddingNew ? (
                <div className="space-y-12 pb-10 font-sans">
                  <div className="flex items-center gap-4 border-b border-[#b41d1d]/20 pb-6">
                    <div className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 group/icon select-none overflow-hidden">
                      {/* Premium Ambient Aura behind the lens badge */}
                      <div className="absolute -inset-1 bg-gradient-to-tr from-[#b41d1d] to-[#fa5252] rounded-full blur-[10px] opacity-40 group-hover/icon:opacity-75 transition-opacity duration-500 pointer-events-none" />
                      
                      {/* Shiny Outer Chrome/Reflective Ring */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#3f3f46] via-[#18181b] to-zinc-700 p-[1px] shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
                        {/* Deep Dark Mirror Core */}
                        <div className="w-full h-full rounded-full bg-black flex items-center justify-center relative overflow-hidden">
                          {/* Subtle Circular Highlight */}
                          <div className="absolute inset-[3px] rounded-full border border-white/[0.04]" />
                          <div className="absolute inset-[6px] rounded-full border border-[#b41d1d]/20" />
                          
                          {/* Lens Flare Glow overlay */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-[#b41d1d]/10 via-transparent to-white/[0.05] pointer-events-none" />
                          
                          {/* Centered Premium Clapperboard and gentle hover scaling */}
                          <Clapperboard size={18} className="text-[#e23636] relative z-10 transition-all duration-300 drop-shadow-[0_0_6px_rgba(180,29,29,0.7)] group-hover/icon:scale-110 group-hover/icon:text-white group-hover/icon:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                        </div>
                      </div>
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-[0.15em] text-white font-sans">{isAddingNew ? "NUEVA PELÍCULA" : "EDITAR PELÍCULA"}</h2>
                  </div>
                  
                  {/* SELECCIÓN DE PESTAÑA DESTINO (NUEVA ENTRADA / EDITAR) */}
                  <div className="bg-white/[0.01] border border-white/[0.05] p-5 rounded-2xl space-y-3 font-sans shadow-lg">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                      <span>Pestaña Destino:</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2 bg-white/[0.02] border border-white/[0.07] p-1.5 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, section: 'peliculas' })}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                          (editForm.section || 'peliculas') === 'peliculas'
                            ? 'bg-[#b41d1d] text-white shadow-lg shadow-[#b41d1d]/30 font-extrabold'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Clapperboard size={16} />
                        <span>Películas</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, section: 'centauro' })}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                          editForm.section === 'centauro'
                            ? 'bg-[#b41d1d] text-white shadow-lg shadow-[#b41d1d]/30 font-extrabold'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Compass size={16} />
                        <span>Centauro</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, section: 'series' })}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                          editForm.section === 'series'
                            ? 'bg-[#b41d1d] text-white shadow-lg shadow-[#b41d1d]/30 font-extrabold'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Tv size={16} />
                        <span>Series</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-white/[0.01] border border-white/[0.05] p-6 rounded-2xl space-y-5 font-sans shadow-lg">
                    <div className="flex items-center gap-3 text-white font-extrabold text-xs uppercase tracking-[0.25em]"><Sparkles size={16} className="text-[#b41d1d]" /> Extracción Inteligente</div>
                    <div className="flex flex-col gap-4">
                      <textarea 
                        placeholder={
                          editForm.section === 'series'
                            ? "Pega aquí los datos de la serie...\nEj: ### 1 BREAKING BAD (TEMPORADA 1)\n🎬 Título Mediateca: BREAKING BAD\n..."
                            : "Pega aquí los datos de la película..."
                        } 
                        value={syncInput} 
                        onChange={(e) => setSyncInput(e.target.value)} 
                        onKeyDown={(e) => e.stopPropagation()} 
                        className="w-full h-28 bg-white/[0.02] border border-white/[0.07] hover:border-white/[0.15] focus:border-[#b41d1d] focus:ring-1 focus:ring-[#b41d1d]/20 focus:bg-[#b41d1d]/[0.01] rounded-xl p-4 text-xs font-sans text-zinc-300 outline-none transition-all resize-none" 
                      />
                      <div className="flex flex-col sm:flex-row gap-3">
                        {/* ANALIZAR / EXTRAER BUTTON */}
                        <button 
                          type="button"
                          onClick={() => handleSync(false)} 
                          disabled={isSyncing || !syncInput} 
                          className="relative group/btn overflow-hidden flex-1 h-12 rounded-xl z-10 flex items-center justify-center p-[1.5px] transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_12px_rgba(0,0,0,0.4)] bg-gradient-to-r from-[#b41d1d]/40 via-white/10 to-[#b41d1d]/40 hover:from-[#b41d1d] hover:via-white hover:to-[#b41d1d] hover:shadow-[0_0_15px_rgba(180,29,29,0.3)]"
                        >
                          <span className="absolute inset-[1px] bg-[#0c0c0e] rounded-[11px] group-hover/btn:bg-[#121215] transition-all duration-300 z-10 flex items-center justify-center gap-2 text-zinc-400 group-hover/btn:text-white font-extrabold uppercase tracking-[0.25em] text-[10px] font-sans w-[calc(100%-2px)] h-[calc(100%-2px)]">
                            {isSyncing ? (
                              <><Loader2 className="animate-spin text-[#b41d1d]" size={14} /> ANALIZANDO...</>
                            ) : (
                              <><Sparkles size={14} className="text-zinc-500 group-hover/btn:text-[#b41d1d] transition-colors duration-300" /> EXTRAER</>
                            )}
                          </span>
                        </button>

                        {/* PROCESANDO / EXTRAER Y APLICAR BUTTON */}
                        <button 
                          type="button"
                          onClick={() => handleSync(true)} 
                          disabled={isSyncing || !syncInput} 
                          className="relative group/btn overflow-hidden flex-1 h-12 rounded-xl z-10 flex items-center justify-center p-[1.5px] transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_12px_rgba(180,29,29,0.15)] bg-gradient-to-r from-[#b41d1d]/60 via-white/40 to-[#b41d1d]/60 hover:from-[#b41d1d] hover:via-white hover:to-[#b41d1d] hover:shadow-[0_0_20px_rgba(180,29,29,0.35)]"
                        >
                          <span className="absolute inset-[1px] bg-[#0c0c0e] rounded-[11px] group-hover/btn:bg-[#121215] transition-all duration-300 z-10 flex items-center justify-center gap-2 text-white font-extrabold uppercase tracking-[0.25em] text-[10px] font-sans w-[calc(100%-2px)] h-[calc(100%-2px)]">
                            {isSyncing ? (
                              <><Loader2 className="animate-spin text-[#b41d1d]" size={14} /> PROCESANDO...</>
                            ) : (
                              <><Check size={14} className="text-[#b41d1d] group-hover/btn:text-white transition-colors duration-300" /> EXTRAER Y APLICAR</>
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
                    {isSyncing && <p className="text-zinc-500 text-[10px] font-extrabold animate-pulse tracking-[0.3em] uppercase font-sans">{syncStatus}</p>}
                    {syncError && <p className="text-red-400 text-[11px] font-bold bg-red-500/10 p-4 rounded-xl border border-[#b41d1d]/20 font-sans">{syncError}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 font-sans">
                    <EditField label="Título" value={editForm.title} onChange={(v: string) => setEditForm({...editForm, title: v})} />
                    <EditField label="Título Original" value={editForm.originalTitle} onChange={(v: string) => setEditForm({...editForm, originalTitle: v})} />
                    <EditField label="Año" value={editForm.year} onChange={(v: string) => setEditForm({...editForm, year: parseInt(v) || 0})} type="number" />
                    <EditField label="Rating" value={editForm.rating} onChange={(v: string) => setEditForm({...editForm, rating: parseFloat(v) || 0})} type="number" />
                    <EditField label="Género" value={editForm.genre} onChange={(v: string) => setEditForm({...editForm, genre: v})} />
                    {editForm.section === 'series' ? (
                      <>
                        <EditField label="Temporada" value={editForm.season || ""} onChange={(v: string) => setEditForm({...editForm, season: v})} placeholder="Ej: Primera y única o Temporada 1" />
                        <EditField label="Capítulos y Duración" value={editForm.duration} onChange={(v: string) => setEditForm({...editForm, duration: v})} placeholder="Ej: 13 Capítulos / 45 min" />
                      </>
                    ) : (
                      <EditField label="Duración" value={editForm.duration} onChange={(v: string) => setEditForm({...editForm, duration: v})} placeholder="Ej: 120 minutos" />
                    )}
                    <EditField label="País" value={editForm.country} onChange={(v: string) => setEditForm({...editForm, country: v})} />
                    <EditField label="Clasificación" value={editForm.ageRating} onChange={(v: string) => setEditForm({...editForm, ageRating: v})} />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 pt-6 border-t border-white/5 font-sans font-sans">
                    <EditField label="Dirección" value={editForm.director} onChange={(v: string) => setEditForm({...editForm, director: v})} />
                    <EditField label="Guion" value={editForm.script} onChange={(v: string) => setEditForm({...editForm, script: v})} />
                    <EditField label="Música" value={editForm.music} onChange={(v: string) => setEditForm({...editForm, music: v})} />
                    <EditField label="Fotografía" value={editForm.photography} onChange={(v: string) => setEditForm({...editForm, photography: v})} />
                    <EditField label={editForm.section === 'series' ? "Estudio / Productora" : "Estudio"} value={editForm.companies} onChange={(v: string) => setEditForm({...editForm, companies: v})} />
                    <EditField label={editForm.section === 'series' ? "Sección (Localización)" : "Estante"} value={editForm.estante} onChange={(v: string) => setEditForm({...editForm, estante: v})} placeholder={editForm.section === 'series' ? "Ej: Sección: 4.1" : "Ej: Estante: 6.2"} />
                    <EditField label={editForm.section === 'series' ? "Formato y Edición" : "Formato"} value={editForm.format} onChange={(v: string) => setEditForm({...editForm, format: v})} className="col-span-1 md:col-span-2" placeholder={editForm.section === 'series' ? "Ej: BLU-RAY (3 Original)" : "Ej: DVD (Original)"} />
                  </div>

                  <div className="relative group w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-xl p-4 flex flex-col gap-2 shadow-md">
                    <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-[0.25em] select-none flex items-center gap-2">
                      <Users size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />
                      <span>{editForm.section === 'series' ? "ELENCO PRINCIPAL" : "ELENCO (ACTORES)"}</span>
                    </label>
                    <textarea 
                      value={Array.isArray(editForm.cast) ? editForm.cast.join(", ") : (editForm.cast || "")} 
                      onChange={(e) => setEditForm({...editForm, cast: e.target.value})} 
                      onKeyDown={(e) => e.stopPropagation()} 
                      placeholder="Actor 1 (Personaje), Actor 2 (Personaje)..."
                      className="w-full bg-transparent border-none p-0 text-zinc-100 text-sm font-semibold tracking-normal outline-none focus:ring-0 placeholder-zinc-700 transition-all resize-none h-24 font-sans leading-relaxed" 
                    />
                  </div>

                  <div className="relative group w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-xl p-4 flex flex-col gap-2 shadow-md">
                    <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-[0.25em] select-none flex items-center gap-2">
                      <ClipboardList size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />
                      <span>SINOPSIS DE LA OBRA</span>
                    </label>
                    <textarea 
                      value={editForm.synopsis || ""} 
                      onChange={(e) => setEditForm({...editForm, synopsis: e.target.value})} 
                      onKeyDown={(e) => e.stopPropagation()} 
                      placeholder="Resumen profesional sin descarrilar spoilers..."
                      className="w-full bg-transparent border-none p-0 text-zinc-100 text-sm font-semibold tracking-normal outline-none focus:ring-0 placeholder-zinc-700 transition-all h-32 font-sans leading-relaxed" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="relative group w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-xl p-4 flex flex-col gap-2 shadow-md font-sans">
                      <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-[0.25em] select-none flex items-center gap-2">
                        <QuoteIcon size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />
                        <span>RESEÑAS CRÍTICAS</span>
                      </label>
                      <textarea 
                        value={editForm.reviews || ""} 
                        onChange={(e) => setEditForm({...editForm, reviews: e.target.value})} 
                        onKeyDown={(e) => e.stopPropagation()} 
                        placeholder="Recepción y consenso de la crítica..."
                        className="w-full bg-transparent border-none p-0 text-zinc-100 text-sm font-semibold tracking-normal outline-none focus:ring-0 placeholder-zinc-700 transition-all h-28 font-sans leading-relaxed" 
                      />
                    </div>
                    <div className="relative group w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-xl p-4 flex flex-col gap-2 shadow-md font-sans">
                      <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-[0.25em] select-none flex items-center gap-2">
                        <Trophy size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />
                        <span>PREMIOS HISTÓRICOS</span>
                      </label>
                      <textarea 
                        value={editForm.awards || ""} 
                        onChange={(e) => setEditForm({...editForm, awards: e.target.value})} 
                        onKeyDown={(e) => e.stopPropagation()} 
                        placeholder="Menciones o premios históricos..."
                        className="w-full bg-transparent border-none p-0 text-zinc-100 text-sm font-semibold tracking-normal outline-none focus:ring-0 placeholder-zinc-700 transition-all h-28 font-sans leading-relaxed" 
                      />
                    </div>
                  </div>

                  {/* BUTTON ACTIONS IN MODAL */}
                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => { setSelectedMovie(null); setIsAddingNew(false); setIsEditing(false); }} 
                      className="flex-1 select-none outline-none border border-white/10 hover:border-[#b41d1d] text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 rounded-xl py-4 font-sans font-extrabold uppercase text-[10px] tracking-[0.25em] transition-all h-14"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button"
                      onClick={handleSave} 
                      className="relative group/btn-save overflow-hidden flex-1 h-14 rounded-xl z-10 flex items-center justify-center p-[1.5px] transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(180,29,29,0.15)] hover:shadow-[0_0_30px_rgba(180,29,29,0.35)] font-sans bg-gradient-to-r from-[#b41d1d]/60 via-white/40 to-[#b41d1d]/60 hover:from-[#b41d1d] hover:via-white hover:to-[#b41d1d]"
                    >
                      <span className="absolute inset-[1px] bg-[#0c0c0e] rounded-[11px] group-hover/btn-save:bg-[#121215] transition-colors duration-300 z-10 flex items-center justify-center gap-2 text-white font-black uppercase tracking-[0.2em] text-[10px] w-[calc(100%-2px)] h-[calc(100%-2px)]">
                        <Check size={14} className="text-[#b41d1d] group-hover/btn-save:text-white transition-colors duration-300" />
                        <span>{isAddingNew ? "Guardar película" : "Guardar película"}</span>
                      </span>
                    </button>
                  </div>
                </div>
              ) : selectedMovie ? (
                /* VISTA DETALLADA */
                <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-700 pb-10">
                  {/* Badges & Duration */}
                  <div className="flex flex-wrap items-center gap-3">
                    {getNormalizedGenres(selectedMovie.genre).map((genre, index) => {
                      return (
                        <span 
                          key={index}
                          className="rounded-full px-4 py-1.5 flex items-center justify-center bg-neutral-950 text-white border border-[#b41d1d] shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 text-[11px] font-semibold uppercase tracking-[0.06em] cursor-default"
                        >
                          {genre}
                        </span>
                      );
                    })}
                    <span className="text-zinc-400 font-bold text-[10px] tracking-widest flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-md border border-white/5"><Clock size={14} /> {selectedMovie.duration || "N/A"}</span>
                  </div>
                  
                  {/* Title & Prominent Rating Box */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-6">
                    <div translate="no" className="flex flex-col gap-1 notranslate">
                      <h2 
                        className={`font-bebas leading-[0.95] tracking-[0.02em] drop-shadow-lg text-white uppercase ${
                          (selectedMovie.title || "").length > 25 
                            ? "text-[44px] md:text-[48px]" 
                            : (selectedMovie.title || "").length > 15 
                              ? "text-[50px] md:text-[56px]" 
                              : "text-[56px] md:text-[64px]"
                        }`}
                      >
                        {selectedMovie.title}
                      </h2>
                      <h3 className={`font-barlow-condensed text-sm md:text-base font-semibold uppercase tracking-[0.25em] ${isDayMode ? 'text-[#b41d1d]' : 'text-zinc-400'}`}>{selectedMovie.originalTitle}</h3>
                    </div>

                    {/* Prominent Rating Unit */}
                    <div className="flex flex-col items-center justify-center shrink-0 select-none bg-white/[0.03] border border-white/[0.05] p-2.5 px-4 rounded-xl min-w-[110px] text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Star size={20} fill="#f59e0b" className="text-[#f59e0b]" />
                        <span className="font-bebas text-3xl tracking-[0.02em] text-white leading-none">
                          {Number(selectedMovie.rating || 0).toFixed(1)}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-extrabold mt-1.5">Calificación</span>
                    </div>
                  </div>
                  
                  {/* Info bar: Premium, cine-themed containers with sleek glassmorphic card design */}
                  {((searchTerm && searchTerm.trim() !== "") || (searchQuery && searchQuery.trim() !== "")) ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 py-2">
                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <Clapperboard size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">Dirección</span>
                        <span translate="no" className="notranslate text-white font-extrabold text-sm tracking-tight leading-snug pr-2 break-words" title={selectedMovie.director}>{selectedMovie.director}</span>
                      </div>

                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <CalendarDays size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">Año</span>
                        <span className="text-white font-extrabold text-sm tracking-tight pr-4">{selectedMovie.year}</span>
                      </div>

                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <Globe size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">País</span>
                        <span className="text-white font-extrabold text-sm tracking-tight leading-snug pr-2 break-words" title={selectedMovie.country}>{selectedMovie.country}</span>
                      </div>

                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <Eye size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">Clasificación</span>
                        <span className="text-white font-extrabold text-sm tracking-tight pr-4">{selectedMovie.ageRating || "No disponible"}</span>
                      </div>

                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans col-span-2 md:col-span-1">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          {selectedMovie.section === 'centauro' ? <Compass size={14} className="text-[#b41d1d]" /> : <Clapperboard size={14} />}
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">Pestaña</span>
                        <span className="text-white font-extrabold text-sm tracking-tight pr-4 capitalize flex items-center gap-1.5">
                          {selectedMovie.section === 'centauro' ? (
                            <span className="text-[#e23636] font-black">Centauro</span>
                          ) : selectedMovie.section === 'series' ? (
                            <span className="text-indigo-400 font-black">Series</span>
                          ) : (
                            <span>Películas</span>
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2">
                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <Clapperboard size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">Dirección</span>
                        <span translate="no" className="notranslate text-white font-extrabold text-sm tracking-tight leading-snug pr-2 break-words" title={selectedMovie.director}>{selectedMovie.director}</span>
                      </div>

                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <CalendarDays size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">Año</span>
                        <span className="text-white font-extrabold text-sm tracking-tight pr-4">{selectedMovie.year}</span>
                      </div>

                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <Globe size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">País</span>
                        <span className="text-white font-extrabold text-sm tracking-tight leading-snug pr-2 break-words" title={selectedMovie.country}>{selectedMovie.country}</span>
                      </div>

                      <div className="group bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d] hover:bg-black/85 hover:shadow-[0_0_12px_rgba(180,29,29,0.5)] transition-all duration-300 relative overflow-hidden font-sans">
                        <div className="absolute top-2 right-2 text-zinc-500 group-hover:text-[#b41d1d] transition-colors duration-300">
                          <Eye size={14} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-extrabold">Clasificación</span>
                        <span className="text-white font-extrabold text-sm tracking-tight pr-4">{selectedMovie.ageRating || "No disponible"}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Synopsis */}
                  <section className="space-y-4">
                     <h4 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-4"><div className="w-10 h-px bg-white/10" /> SINOPSIS</h4>
                     <p className="text-zinc-300 text-sm md:text-base leading-relaxed font-medium max-w-3xl">{selectedMovie.synopsis}</p>
                  </section>
                  
                  {/* Reviews & Awards with Left borders */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-white/5 border border-l-[3px] border-y-white/5 border-r-white/5 border-l-[#b41d1d] rounded-r-xl p-6 flex flex-col gap-3">
                       <h5 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2"><Quote size={14} className="text-[#b41d1d]"/> Reseñas Críticas</h5>
                       <p className="text-sm text-zinc-300 leading-relaxed font-medium">{selectedMovie.reviews}</p>
                     </div>
                     <div className="bg-white/5 border border-l-[3px] border-y-white/5 border-r-white/5 border-l-[#f59e0b] rounded-r-xl p-6 flex flex-col gap-3">
                       <h5 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2"><Trophy size={14} className="text-[#f59e0b]"/> Premios históricos</h5>
                       <p className="text-sm text-zinc-300 leading-relaxed font-medium">{selectedMovie.awards}</p>
                     </div>
                  </div>

                  {/* Tech Specs */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8 pt-8 border-t border-white/5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5">
                        <MonitorPlay size={12} className="text-[#b41d1d]" /> {selectedMovie.section === 'series' ? "Formato y Edición" : "Formato"}
                      </span>
                      <span className="text-zinc-400 font-medium text-xs">{selectedMovie.format || "No disponible"}</span>
                    </div>
                    {selectedMovie.section === 'series' ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5">
                          <Tv size={12} className="text-[#b41d1d]" /> Temporada
                        </span>
                        <span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.season || "Primera y única"}>
                          {selectedMovie.season || "Primera y única"}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><ClipboardList size={12} className="text-[#b41d1d]" /> Guion</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.script}>{selectedMovie.script}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Music size={12} className="text-[#b41d1d]" /> {selectedMovie.section === 'series' ? "Banda Sonora" : "Música"}</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.music}>{selectedMovie.music}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><ImageIcon size={12} className="text-[#b41d1d]" /> Fotografía</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.photography}>{selectedMovie.photography}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Landmark size={12} className="text-[#b41d1d]" /> {selectedMovie.section === 'series' ? "Estudio / Productora" : "Estudio"}</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.companies}>{selectedMovie.companies}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Library size={12} className="text-[#b41d1d]" /> {selectedMovie.section === 'series' ? "Sección (Localización)" : "Estante"}</span><span className="text-zinc-400 font-medium text-xs">{selectedMovie.estante || "N/A"}</span></div>
                    
                    {/* Clickable Cast Section */}
                    <div className="flex flex-col gap-3 col-span-full pt-6 border-t border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Users size={12} className="text-[#b41d1d]" /> {selectedMovie.section === 'series' ? "Elenco Principal" : "Elenco"}</span>
                      <div className="flex flex-wrap gap-2 text-zinc-400 font-medium text-xs leading-relaxed">
                        {(Array.isArray(selectedMovie.cast) ? selectedMovie.cast : String(selectedMovie.cast || "").split('/').map(s => s.trim()).filter(Boolean)).map((actor, aIdx) => (
                          <button 
                            key={aIdx} 
                            onClick={() => {
                              const cleanActor = actor.split('(')[0].trim();
                              setSearchQuery(cleanActor);
                              setSearchTerm(cleanActor);
                              setSelectedMovie(null); // Close modal automatically to filter
                              setIsMobileMenuOpen(false);
                            }}
                            className="bg-white/[0.07] hover:bg-white/[0.13] text-zinc-200 hover:text-white px-3 py-1.5 text-[13px] rounded-[20px] transition-all font-medium border border-white/5 active:scale-95 flex items-center gap-1.5"
                          >
                            <User size={12} className="text-zinc-500" />
                            <span translate="no" className="notranslate">{actor}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="pt-8 border-t border-white/5 flex flex-wrap gap-4 items-center">
                      {/* Button: FAVORITA DEL MES SWITCH */}
                      <button
                        type="button"
                        onClick={async () => {
                          const newVal = !selectedMovie.favoriteOfMonth;
                          setSelectedMovie({ ...selectedMovie, favoriteOfMonth: newVal });
                          setMovies(prev => prev.map(m => m.id === selectedMovie.id ? { ...m, favoriteOfMonth: newVal } : m));
                          try {
                            await updateMovie(selectedMovie.id, { favoriteOfMonth: newVal });
                          } catch (err) {
                            console.error("Error setting favorite:", err);
                          }
                        }}
                        className="relative inline-block w-14 h-8 shrink-0 rounded-full bg-[#212121] transition-all duration-300 outline-none cursor-pointer"
                        title="Destacar película en panel Favoritas del Mes"
                      >
                         <div className={`absolute left-1 top-1 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-500 ease-out ${
                           selectedMovie.favoriteOfMonth 
                             ? 'translate-x-6 bg-[#b41d1d] shadow-[0_0_8px_rgba(180,29,29,0.6)] text-white' 
                             : 'translate-x-0 bg-[#4a4a4a] text-zinc-400'
                         }`}>
                           <Star size={12} fill="currentColor" strokeWidth={0.5} />
                         </div>
                      </button>

                      {/* Button: MARCAR / QUITAR REVISIÓN */}
                      <button 
                        type="button"
                        onClick={(e) => handleToggleReview(selectedMovie, e)} 
                        className="relative group/btn-review overflow-hidden flex-1 min-w-[200px] h-14 rounded-xl z-10 flex items-center justify-center p-[1px] transition-all duration-300 active:scale-95 shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
                      >
                        {/* Spin border only visible on hover */}
                        <span className="absolute inset-[-400%] bg-[conic-gradient(from_0deg,#b41d1d_0deg,#ffffff_120deg,#0a0a0c_180deg,#b41d1d_240deg,#ffffff_300deg,#b41d1d_360deg)] animate-[spin_4s_linear_infinite] z-0 opacity-0 group-hover/btn-review:opacity-100 transition-opacity duration-300" />
                        <span className={`absolute inset-[1px] rounded-[11px] group-hover/btn-review:bg-[#121215] transition-all duration-300 z-10 flex items-center justify-center gap-2.5 text-white font-extrabold uppercase tracking-[0.2em] text-[10px] font-sans w-[calc(100%-2px)] h-[calc(100%-2px)] ${
                          selectedMovie.needsReview 
                            ? 'bg-[#b41d1d] group-hover/btn-review:text-white' 
                            : 'bg-[#0c0c0e] border border-white/5 group-hover/btn-review:border-transparent text-zinc-350'
                        }`}>
                          <AlertTriangle size={14} className={selectedMovie.needsReview ? 'text-white' : 'text-[#b41d1d]'} /> 
                          <span>{selectedMovie.needsReview ? 'QUITAR REVISIÓN' : 'MARCAR REVISIÓN'}</span>
                        </span>
                      </button>

                      {/* Button: MOVER DE SECCIÓN (PELÍCULAS <-> CENTAURO) */}
                      {selectedMovie.section !== 'series' && (
                        <button 
                          type="button"
                          onClick={() => { setIsDeleting(false); setIsConfirmingMove(true); }}
                          className="h-14 px-5 bg-[#0c0c0e] hover:bg-[#121215] border border-white/5 hover:border-[#b41d1d]/40 text-zinc-350 hover:text-white rounded-xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 shadow-[0_4px_12px_rgba(0,0,0,0.4)] shrink-0"
                          title={`Mover obra a pestaña ${selectedMovie.section === 'centauro' ? 'Películas' : 'Centauro'}`}
                        >
                          {selectedMovie.section === 'centauro' ? (
                            <>
                              <Clapperboard size={15} className="text-zinc-400 group-hover:text-[#b41d1d]" />
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-300">MOVER A PELÍCULAS</span>
                            </>
                          ) : (
                            <>
                              <Compass size={15} className="text-[#b41d1d]" />
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-300">MOVER A CENTAURO</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Button: EDITAR */}
                      <button 
                        type="button"
                        onClick={() => { setEditForm({ ...selectedMovie, section: selectedMovie.section || 'peliculas' }); setIsEditing(true); }} 
                        className="relative group/btn-edit overflow-hidden flex-1 min-w-[150px] h-14 rounded-xl z-10 flex items-center justify-center p-[1px] transition-all duration-300 active:scale-95 shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
                      >
                        {/* Spin border only visible on hover */}
                        <span className="absolute inset-[-400%] bg-[conic-gradient(from_0deg,#b41d1d_0deg,#ffffff_120deg,#0a0a0c_180deg,#b41d1d_240deg,#ffffff_300deg,#b41d1d_360deg)] animate-[spin_4s_linear_infinite] z-0 opacity-0 group-hover/btn-edit:opacity-100 transition-opacity duration-300" />
                        <span className="absolute inset-[1px] bg-[#0c0c0e] rounded-[11px] group-hover/btn-edit:bg-[#121215] border border-white/5 group-hover/btn-edit:border-transparent transition-all duration-300 z-10 flex items-center justify-center gap-2.5 text-zinc-300 group-hover/btn-edit:text-white font-extrabold uppercase tracking-[0.2em] text-[10px] font-sans w-[calc(100%-2px)] h-[calc(100%-2px)]">
                          <Edit2 size={13} className="text-[#b41d1d] group-hover/btn-edit:text-white transition-colors duration-300" /> 
                          <span>EDITAR OBRA</span>
                        </span>
                      </button>

                      {/* Button: COPIAR FICHA */}
                      <button 
                        type="button"
                        onClick={handleCopyFicha} 
                        className="h-14 px-5 bg-[#0c0c0e] hover:bg-[#121215] border border-white/5 hover:border-[#b41d1d]/40 text-zinc-350 hover:text-white rounded-xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 shadow-[0_4px_12px_rgba(0,0,0,0.4)] shrink-0"
                      >
                        {copied ? (
                          <Check size={16} className="text-[#b41d1d] animate-bounce" />
                        ) : (
                          <Copy size={16} className="text-zinc-500 hover:text-[#b41d1d] transition-colors" />
                        )}
                      </button>

                      {/* Button: ELIMINAR */}
                      <button 
                        type="button"
                        onClick={() => setIsDeleting(true)} 
                        className="h-14 w-14 bg-[#0c0c0e] hover:bg-[#121215] border border-white/5 hover:border-[#b41d1d]/40 text-neutral-400 hover:text-[#b41d1d] hover:shadow-[0_0_12px_rgba(180,29,29,0.35)] rounded-xl transition-all duration-300 flex items-center justify-center active:scale-95 shadow-[0_4px_12px_rgba(0,0,0,0.4)] shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                  {isDeleting && (
                    <div className="flex flex-col gap-4 p-5 bg-neutral-950/60 border border-[#b41d1d]/30 shadow-[0_0_15px_rgba(180,29,29,0.15)] rounded-xl animate-in zoom-in-95 font-sans">
                      <div className="flex items-center gap-2.5 text-[#b41d1d] font-bold uppercase text-[11px] tracking-[0.2em] select-none">
                        <AlertTriangle size={14} />
                        <span>Confirmar Eliminación</span>
                      </div>
                      <p className="text-zinc-300 text-sm font-medium leading-relaxed">
                        ¿Estás seguro de que deseas eliminar <span translate="no" className="text-white font-bold notranslate">"{selectedMovie.title}"</span>? Esta acción es permanente.
                      </p>
                      <div className="flex gap-3 pt-1">
                        <button 
                          onClick={handleDelete} 
                          className="flex-1 py-3 rounded-lg bg-[#b41d1d]/10 hover:bg-[#b41d1d] text-[#b41d1d] hover:text-white border border-[#b41d1d]/40 hover:border-[#b41d1d] shadow-[0_0_10px_rgba(180,29,29,0.1)] hover:shadow-[0_0_15px_rgba(180,29,29,0.4)] text-[10px] font-extrabold uppercase tracking-[0.2em] transition-all duration-300 active:scale-95"
                        >
                          Eliminar
                        </button>
                        <button 
                          onClick={() => setIsDeleting(false)} 
                          className="flex-1 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-350 hover:text-white border border-white/5 hover:border-white/10 text-[10px] font-extrabold uppercase tracking-[0.2em] transition-all duration-300 active:scale-95"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {isConfirmingMove && (
                    <div className="flex flex-col gap-4 p-5 bg-neutral-950/80 border border-[#b41d1d]/40 shadow-[0_0_20px_rgba(180,29,29,0.2)] rounded-xl animate-in zoom-in-95 font-sans mt-4">
                      <div className="flex items-center gap-2.5 text-white font-bold uppercase text-[11px] tracking-[0.2em] select-none">
                        <Compass size={15} className="text-[#b41d1d]" />
                        <span>Confirmar Traslado de Sección</span>
                      </div>
                      <p className="text-zinc-300 text-sm font-medium leading-relaxed">
                        ¿Estás seguro de que deseas mover <span translate="no" className="text-white font-bold notranslate">"{selectedMovie.title}"</span> a la pestaña <span className="text-[#b41d1d] font-black uppercase">{(selectedMovie.section || 'peliculas').toLowerCase() === 'centauro' ? 'Películas' : 'Centauro'}</span>?
                      </p>
                      <div className="flex gap-3 pt-1">
                        <button 
                          type="button"
                          onClick={async () => {
                            const currentSec = (selectedMovie.section || 'peliculas').toLowerCase();
                            const nextSec = currentSec === 'centauro' ? 'peliculas' : 'centauro';
                            const updated = { ...selectedMovie, section: nextSec, updatedAt: new Date().toISOString() };
                            setSelectedMovie(updated);
                            setMovies(prev => prev.map(m => m.id === selectedMovie.id ? updated : m));
                            setIsConfirmingMove(false);
                            try {
                              await updateMovie(selectedMovie.id, { section: nextSec, updatedAt: new Date().toISOString() });
                            } catch (err) {
                              console.error("Error updating movie section:", err);
                            }
                          }}
                          className="flex-1 py-3 rounded-lg bg-[#b41d1d]/20 hover:bg-[#b41d1d] text-white border border-[#b41d1d]/50 hover:border-[#b41d1d] shadow-[0_0_10px_rgba(180,29,29,0.2)] hover:shadow-[0_0_20px_rgba(180,29,29,0.5)] text-[10px] font-extrabold uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 cursor-pointer"
                        >
                          Confirmar Traslado
                        </button>
                        <button 
                          type="button"
                          onClick={() => setIsConfirmingMove(false)} 
                          className="flex-1 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-350 hover:text-white border border-white/5 hover:border-white/10 text-[10px] font-extrabold uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* FOOTER (PAGINACIÓN ESTILO PELISPLUS) */}
      <footer className={`relative z-10 w-full transition-all duration-500 ${
        isFavoriteOfMonthActive 
          ? 'bg-transparent mt-0 pt-1 pb-4 border-t border-transparent shadow-none px-0' 
          : 'pb-12 px-6 mt-1 border-t border-transparent'
      }`}>
        <div className={`max-w-7xl mx-auto flex flex-col items-center space-y-6 transition-all duration-500 ${
          isFavoriteOfMonthActive ? 'pt-0' : 'pt-0'
        }`}>
          
          {/* BOTONES DE PAGINACIÓN */}
          {totalPages > 1 && !isDirectorFilterActive && !isFavoriteOfMonthActive && (
            <div className="flex flex-col items-center gap-4 mt-8 mb-2 font-sans">
              <div className="flex flex-wrap justify-center items-center gap-2">
                <button 
                  onClick={() => { if(currentPage > 1) { setCurrentPage(currentPage - 1); window.scrollTo({ top: 300, behavior: 'smooth' }); }}}
                  disabled={currentPage === 1}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-900/60 border border-white/[0.05] text-zinc-500 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all duration-200 disabled:opacity-20 disabled:pointer-events-none z-20 select-none shadow-md"
                >
                  <ChevronLeft size={18} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => {
                  if (pageNumber === 1 || pageNumber === totalPages || (pageNumber >= currentPage - 2 && pageNumber <= currentPage + 2)) {
                    const isActive = currentPage === pageNumber;
                    if (isActive) {
                      return (
                        <div 
                          key={pageNumber}
                          className="relative w-[76px] h-[42px] flex items-center justify-center group select-none z-20 mr-1"
                        >
                          {/* Gentle cinematic ticket glow from previous design */}
                          <div className="absolute inset-0 bg-[#b41d1d]/20 rounded-lg blur-md animate-pulse pointer-events-none" />
                          
                          <svg 
                            viewBox="0 0 72 40" 
                            className="absolute inset-0 w-full h-full cinema-ticket-glowing transition-all duration-300"
                            fill="#16161a" 
                            stroke="#b41d1d" 
                            strokeWidth="1.5"
                          >
                            <path d="M 6,0 L 66,0 A 6,6 0 0,1 72,6 L 72,13 A 7,7 0 0,0 72,27 L 72,34 A 6,6 0 0,1 66,40 L 6,40 A 6,6 0 0,1 0,34 L 0,27 A 7,7 0 0,0 0,13 L 0,6 A 6,6 0 0,1 6,0 Z" />
                            {/* Inner crimson frame detail */}
                            <path 
                              d="M 6,2 L 66,2 A 4,4 0 0,1 70,6 L 70,13 A 5,5 0 0,0 70,27 L 70,34 A 4,4 0 0,1 66,38 L 6,38 A 4,4 0 0,1 2,34 L 2,27 A 5,5 0 0,0 2,13 L 2,6 A 4,4 0 0,1 6,2 Z" 
                              fill="none" 
                              stroke="#ef4444" 
                              strokeWidth="0.8" 
                              strokeDasharray="2,2" 
                              opacity="0.45" 
                            />
                            {/* Barcode line stamps */}
                            <g fill="#b41d1d" opacity="0.3">
                              <rect x="5" y="6" width="1" height="28" />
                              <rect x="7" y="6" width="1.5" height="28" />
                              <rect x="10" y="6" width="0.7" height="28" />
                              <rect x="12" y="6" width="1.2" height="28" />
                            </g>
                            {/* Right stub star decorations */}
                            <g fill="#ef4444" opacity="0.5">
                              <circle cx="64" cy="12" r="1.2" />
                              <circle cx="64" cy="20" r="1.2" />
                              <circle cx="64" cy="28" r="1.2" />
                            </g>
                            {/* Ticket perforations */}
                            <line x1="15" y1="3" x2="15" y2="37" stroke="#b41d1d" strokeWidth="1" strokeDasharray="1,2" opacity="0.6" />
                            <line x1="57" y1="3" x2="57" y2="37" stroke="#b41d1d" strokeWidth="1" strokeDasharray="1,2" opacity="0.6" />
                          </svg>

                          <div className="relative z-10 flex flex-col items-center justify-center leading-none">
                            <span className="text-[6.5px] font-mono text-zinc-400 font-extrabold uppercase tracking-widest opacity-60">TKT</span>
                            <span className="text-white font-black text-sm tracking-wide font-mono mt-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                              {pageNumber < 10 ? `0${pageNumber}` : pageNumber}
                            </span>
                            <span className="text-[6.5px] font-mono text-[#ef4444] font-bold uppercase tracking-widest mt-0.5 opacity-80">ADMIT</span>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <button 
                          key={pageNumber} 
                          onClick={() => { setCurrentPage(pageNumber); window.scrollTo({ top: 300, behavior: 'smooth' }); }} 
                          className="relative w-[76px] h-[42px] flex items-center justify-center group select-none z-20 outline-none mr-1"
                        >
                          <svg 
                            viewBox="0 0 72 40" 
                            className="absolute inset-0 w-full h-full transition-all duration-300"
                            fill="#16161a" 
                            stroke="rgba(255,255,255,0.08)" 
                            strokeWidth="1.2"
                          >
                            <path d="M 6,0 L 66,0 A 6,6 0 0,1 72,6 L 72,13 A 7,7 0 0,0 72,27 L 72,34 A 6,6 0 0,1 66,40 L 6,40 A 6,6 0 0,1 0,34 L 0,27 A 7,7 0 0,0 0,13 L 0,6 A 6,6 0 0,1 6,0 Z" className="group-hover:stroke-zinc-500/60 transition-colors" />
                            <path 
                              d="M 6,2 L 66,2 A 4,4 0 0,1 70,6 L 70,13 A 5,5 0 0,0 70,27 L 70,34 A 4,4 0 0,1 66,38 L 6,38 A 4,4 0 0,1 2,34 L 2,27 A 5,5 0 0,0 2,13 L 2,6 A 4,4 0 0,1 6,2 Z" 
                              fill="none" 
                              stroke="rgba(255,255,255,0.02)" 
                              strokeWidth="0.8" 
                              strokeDasharray="2,2" 
                            />
                            <line x1="15" y1="3" x2="15" y2="37" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="1,2" />
                            <line x1="57" y1="3" x2="57" y2="37" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="1,2" />
                          </svg>

                          <div className="relative z-10 flex flex-col items-center justify-center leading-none transition-transform group-hover:scale-105 duration-200">
                            <span className="text-[6.5px] font-mono text-zinc-500 font-semibold uppercase tracking-widest opacity-40 transition-colors group-hover:text-zinc-400">TKT</span>
                            <span className="text-zinc-500 group-hover:text-zinc-200 font-bold text-sm tracking-wide font-mono mt-0.5 transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                              {pageNumber < 10 ? `0${pageNumber}` : pageNumber}
                            </span>
                            <span className="text-[6.5px] font-mono text-zinc-500 font-semibold uppercase tracking-widest mt-0.5 opacity-40 transition-colors group-hover:text-zinc-400">PASS</span>
                          </div>
                        </button>
                      );
                    }
                  }
                  if (pageNumber === currentPage - 3 || pageNumber === currentPage + 3) {
                    return <span key={pageNumber} className="text-zinc-600 px-2 text-sm select-none tracking-[2px] font-semibold">...</span>;
                  }
                  return null;
                })}
                <button 
                  onClick={() => { if(currentPage < totalPages) { setCurrentPage(currentPage + 1); window.scrollTo({ top: 300, behavior: 'smooth' }); }}}
                  disabled={currentPage === totalPages}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-900/60 border border-white/[0.05] text-zinc-500 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all duration-200 disabled:opacity-20 disabled:pointer-events-none z-20 select-none shadow-md"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <p className={`pagination-summary-text text-[10px] md:text-xs font-bold uppercase tracking-[0.25em] mt-3 select-none ${isDayMode ? 'text-slate-600' : 'text-zinc-500'}`}>
                TOTAL: <span className={`total-movies-count font-black ${isDayMode ? 'text-black' : 'text-white'}`}>{filteredMovies.length}</span> PELÍCULAS • PÁGINA <span className="current-page-num text-[#b41d1d] font-black">{currentPage}</span> DE <span className={`total-pages-count font-extrabold ${isDayMode ? 'text-black' : 'text-zinc-400'}`}>{totalPages}</span>
              </p>
            </div>
          )}

          {/* SECCIÓN CURACIÓN: FILTRO DEL DIRECTOR / DIAL DEL DIRECTOR */}
          {isDirectorFilterActive && (
            <div className="w-full flex flex-col items-center relative z-10 mt-8 mb-4">
              {/* STANDALONE CURATION ERROR */}
              {curationError && !isCurating && (
                <div className="p-6 sm:p-8 bg-[#080808] border border-zinc-800/60 rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 w-full max-w-2xl mx-auto relative overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Subtle red cinematic glow at the top */}
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#b30500]/70 to-transparent" />
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-24 bg-[#b30500] blur-[60px] opacity-10 pointer-events-none" />
                  
                  <div className="w-full sm:w-52 h-52 shrink-0 rounded-lg overflow-hidden relative border border-zinc-800/80 shadow-2xl bg-[#050505]">
                    <img src={emptyChairImage} alt="Silla de Director y Claqueta" className="absolute inset-0 w-full h-full object-cover opacity-90" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-lg pointer-events-none" />
                  </div>
                  
                  <div className="flex flex-col items-center sm:items-start flex-1 text-center sm:text-left py-1 sm:py-2">
                    <h3 className="font-sans text-xs text-[#b30500] font-bold tracking-[0.25em] uppercase mb-4 sm:mb-3">Corte del Director</h3>
                    <p className="font-sans font-light text-zinc-300 text-sm tracking-wide leading-relaxed mb-6 sm:mb-5">
                      {curationError}
                    </p>
                    
                    <button 
                      onClick={() => { setCurationError(null); }}
                      className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-zinc-300 text-[10px] sm:text-xs font-semibold tracking-[0.2em] uppercase transition-all flex items-center gap-2 group mt-auto"
                    >
                      <span>Repetir Toma</span>
                      <Clapperboard size={14} className="text-zinc-400 group-hover:text-white transition-colors" />
                    </button>
                  </div>
                </div>
              )}

              {/* CURATION DIALS AND RESULTS (Only show if no error) */}
              {!curationError && (
                <div 
                  className="w-full max-w-5xl font-sans bg-black/40 border border-neutral-800/80 rounded-3xl p-8 backdrop-blur-md overflow-visible transition-all duration-500 shadow-2xl"
                  style={{ backgroundImage: 'radial-gradient(circle at center, rgba(180, 29, 29, 0.05) 0%, transparent 85%)' }}
                >
                  {/* Header Content */}
                  {curatorRecommendations.length === 0 && !isCurating && (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/[0.04] pb-6 text-left animate-in fade-in duration-300">
                      <div className="flex flex-col gap-1.5 items-start">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#b41d1d] animate-pulse inline-block shadow-[0_0_8px_rgba(180,29,29,0.8)]" />
                          <span className="text-[#b41d1d] font-mono text-[9px] tracking-[0.35em] uppercase font-bold">FILTRO DEL DIRECTOR</span>
                        </div>
                        <h3 
                          className="text-[#eeeeee] uppercase tracking-[0.06em] text-3xl md:text-4xl lg:text-5xl mt-1.5 leading-tight"
                          style={{ fontFamily: "'Cinematografica', 'Cinematografica Bold', sans-serif", fontWeight: "bold" }}
                        >
                          Diseña la experiencia cinematográfica perfecta
                        </h3>
                        <p className="text-xs md:text-sm text-neutral-400 font-light tracking-wide mt-1.5 max-w-2xl leading-relaxed">
                          Elige con quién estás, el ritmo de historia que deseas, los géneros y las épocas. Nuestro recomendador inteligente elegirá de la mediateca la obra idónea para tu momento.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* CURATING IMMERSIVE STATE */}
                  {isCurating && (
                    <div className="flex flex-col items-center justify-center text-center gap-5 py-12 animate-in fade-in duration-500 w-full">
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        {/* Projector Light Beam Glow Effect (ambient backdrop) */}
                        <div className="absolute inset-x-[-30px] top-1/2 -translate-y-1/2 h-16 bg-gradient-to-r from-[#b41d1d]/30 via-transparent to-[#b41d1d]/10 opacity-40 blur-xl rounded-full" />
                        
                        {/* Pulsing Cinema Lens Core */}
                        <div className="absolute inset-3.5 bg-neutral-950 rounded-full border border-neutral-800/80 flex items-center justify-center shadow-inner z-10">
                          <Video className="text-[#b41d1d] animate-pulse" size={18} />
                        </div>

                        {/* Outer film-reel sprockets resembling frame boundaries rotating smoothly */}
                        <div className="absolute inset-0.5 border-2 border-dashed border-neutral-700/60 rounded-full animate-[spin_15s_linear_infinite]" />
                        
                        {/* Fast track cinematic accent indicator indicating active scanning */}
                        <div className="absolute inset-0 border-t-2 border-b-2 border-transparent border-l-2 border-[#b41d1d] rounded-full animate-spin" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-neutral-300 text-xs font-mono font-light uppercase tracking-widest animate-pulse">
                          EL DIRECTOR ESTÁ BUSCANDO LAS MEJORES PELÍCULAS...
                        </p>
                        <p className="text-[10px] text-neutral-500 font-light font-sans">
                          Filtrando el catálogo para recomendarte las películas perfectas...
                        </p>
                      </div>
                    </div>
                  )}

                  {/* DIALS ENGINE (Show ONLY if no recommendations and not curating) */}
                  {curatorRecommendations.length === 0 && !isCurating && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center text-left animate-in fade-in duration-300">
                  
                  {/* Selectors Column */}
                  <div className="col-span-1 md:col-span-8 space-y-8">
                    
                    {/* Line 1: LA SALA */}
                    <div className="space-y-3">
                      <div className="text-[10px] tracking-[0.2em] font-light text-neutral-400 uppercase">
                        1. ¿CON QUIÉN VERÁS LA PELÍCULA?
                      </div>
                      <div className="flex flex-col sm:flex-row border border-neutral-800/80 bg-[#09090b]/60 rounded-2xl p-1 gap-1 max-w-lg">
                        {(['Solo', 'Dúo', 'Grupo'] as const).map((opt) => {
                          const active = curatorSala === opt;
                          const displayLabels = {
                            'Solo': 'Solo',
                            'Dúo': 'Duo',
                            'Grupo': 'En grupo'
                          };
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setCuratorSala(opt)}
                              className={`flex-1 px-5 py-2.5 rounded-xl text-xs font-light tracking-wide transition-all duration-300 ${
                                active 
                                  ? 'bg-neutral-950 text-white border border-[#b41d1d] shadow-[0_0_15px_rgba(180,29,29,0.75)] scale-[1.03]'
                                  : 'bg-neutral-900/60 border border-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:scale-[1.02] shadow-[0_0_8px_rgba(180,29,29,0.2)]'
                              }`}
                            >
                              {displayLabels[opt]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Line 2: EL TONO */}
                    <div className="space-y-3">
                      <div className="text-[10px] tracking-[0.2em] font-light text-neutral-400 uppercase">
                        2. ¿QUÉ RITMO O ÁNIMO BUSCAS?
                      </div>
                      <div className="flex flex-col sm:flex-row border border-neutral-800/80 bg-[#09090b]/60 rounded-2xl p-1 gap-1 max-w-xl w-full">
                        {(['Ligero', 'Trama', 'Intenso'] as const).map((opt) => {
                          const active = curatorTono === opt;
                          const displayLabels = {
                            'Ligero': 'Divertido y relajado',
                            'Trama': 'Interesante y de intriga',
                            'Intenso': 'Fuerte y emocionante'
                          };
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setCuratorTono(opt)}
                              className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-light tracking-wide transition-all duration-300 whitespace-nowrap ${
                                active 
                                  ? 'bg-neutral-950 text-white border border-[#b41d1d] shadow-[0_0_15px_rgba(180,29,29,0.75)] scale-[1.03]'
                                  : 'bg-neutral-900/60 border border-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:scale-[1.02] shadow-[0_0_8px_rgba(180,29,29,0.2)]'
                              }`}
                            >
                              {displayLabels[opt]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Line 3: EL GÉNERO */}
                    <div className="space-y-3 relative">
                      <div className="text-[10px] tracking-[0.2em] font-light text-neutral-400 uppercase">
                        3. ¿QUÉ GÉNERO PREFIERES?
                      </div>
                      <div className="relative inline-block w-full sm:w-80">
                        {/* Selector principal en forma de píldora que se abre */}
                        <button
                          type="button"
                          onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                          className={`w-full rounded-2xl px-5 py-3 text-xs font-light tracking-wide transition-all duration-300 flex items-center justify-between focus:outline-none ${
                            curatorGenero !== 'Todos'
                              ? 'bg-neutral-950 text-white border border-[#b41d1d] shadow-[0_0_15px_rgba(180,29,29,0.75)] scale-[1.03]'
                              : 'bg-[#09090b]/60 border border-neutral-800/80 text-white hover:text-white hover:border-[#b41d1d]/40 shadow-[0_0_15px_rgba(0,0,0,0.5)]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {(() => {
                              const currentSelected = curatorGenresList.find(g => g.id === curatorGenero) || curatorGenresList[0];
                              return currentSelected.icon("rgb(239, 68, 68)");
                            })()}
                            <span>{curatorGenero === 'Todos' ? 'Todos los géneros' : curatorGenero}</span>
                          </div>
                          <svg className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${isGenreDropdownOpen ? 'rotate-180 text-white' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>

                        {/* Listado de géneros flotante con scroll */}
                        {isGenreDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsGenreDropdownOpen(false)} />
                            <div className="absolute left-0 right-0 mt-2 z-50 max-h-60 overflow-y-auto bg-neutral-950/95 border border-neutral-800/95 rounded-2xl p-2 shadow-[0_15px_30px_rgba(0,0,0,0.9)] backdrop-blur-md flex flex-col gap-1 custom-scrollbar">
                              {curatorGenresList.map((g) => {
                                const active = curatorGenero === g.id;
                                return (
                                  <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => {
                                      setCuratorGenero(g.id);
                                      setIsGenreDropdownOpen(false);
                                    }}
                                    className={`w-full rounded-xl px-4 py-2.5 text-xs font-light transition-all duration-200 flex items-center justify-between ${
                                      active
                                        ? "bg-neutral-950 border border-[#b41d1d] text-white font-medium shadow-[0_0_15px_rgba(180,29,29,0.75)]"
                                        : "hover:bg-neutral-900/60 text-neutral-400 hover:text-white"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      {g.icon(active ? "rgb(239, 68, 68)" : "rgb(163, 163, 163)")}
                                      <span>{g.label}</span>
                                    </div>
                                    {active && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#b41d1d] shadow-[0_0_6px_rgba(180,29,29,0.8)]" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Line 4: LA ÉPOCA */}
                    <div className="space-y-3 relative">
                      <div className="text-[10px] tracking-[0.2em] font-light text-neutral-400 uppercase">
                        4. ¿QUÉ ÉPOCA PREFIERES?
                      </div>
                      <div className="relative inline-block w-full sm:w-80">
                        {/* Selector principal en forma de píldora que se abre */}
                        <button
                          type="button"
                          onClick={() => setIsEpochDropdownOpen(!isEpochDropdownOpen)}
                          className={`w-full rounded-2xl px-5 py-3 text-xs font-light tracking-wide transition-all duration-300 flex items-center justify-between focus:outline-none ${
                            curatorEpoca !== 'Todas'
                              ? 'bg-neutral-950 text-white border border-[#b41d1d] shadow-[0_0_15px_rgba(180,29,29,0.75)] scale-[1.03]'
                              : 'bg-[#09090b]/60 border border-neutral-800/80 text-white hover:text-white hover:border-[#b41d1d]/40 shadow-[0_0_15px_rgba(0,0,0,0.5)]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <CalendarDays size={16} color="rgb(239, 68, 68)" className="shrink-0 transition-colors duration-300" />
                            <span>{curatorEpoca === 'Todas' ? 'Cualquier época' : `Años ${curatorEpoca}`}</span>
                          </div>
                          <svg className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${isEpochDropdownOpen ? 'rotate-180 text-white' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>

                        {/* Listado de décadas flotante con scroll */}
                        {isEpochDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsEpochDropdownOpen(false)} />
                            <div className="absolute left-0 right-0 mt-2 z-50 max-h-60 overflow-y-auto bg-neutral-950/95 border border-neutral-800/95 rounded-2xl p-2 shadow-[0_15px_30px_rgba(0,0,0,0.9)] backdrop-blur-md flex flex-col gap-1 custom-scrollbar">
                              <button
                                type="button"
                                onClick={() => {
                                  setCuratorEpoca('Todas');
                                  setIsEpochDropdownOpen(false);
                                }}
                                className={`w-full rounded-xl px-4 py-2.5 text-xs font-light transition-all duration-200 flex items-center justify-between ${
                                  curatorEpoca === 'Todas'
                                    ? "bg-neutral-950 border border-[#b41d1d] text-white font-medium shadow-[0_0_15px_rgba(180,29,29,0.75)]"
                                    : "hover:bg-neutral-900/60 text-neutral-400 hover:text-white"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <CalendarDays size={16} color={curatorEpoca === 'Todas' ? "rgb(239, 68, 68)" : "rgb(163, 163, 163)"} className="shrink-0 transition-colors duration-300" />
                                  <span>Cualquier época</span>
                                </div>
                                {curatorEpoca === 'Todas' && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#b41d1d] shadow-[0_0_6px_rgba(180,29,29,0.8)]" />
                                )}
                              </button>
                              
                              {YEAR_RANGES.map((r) => {
                                const active = curatorEpoca === r.label;
                                return (
                                  <button
                                    key={r.label}
                                    type="button"
                                    onClick={() => {
                                      setCuratorEpoca(r.label);
                                      setIsEpochDropdownOpen(false);
                                    }}
                                    className={`w-full rounded-xl px-4 py-2.5 text-xs font-light transition-all duration-200 flex items-center justify-between ${
                                      active
                                        ? "bg-neutral-950 border border-[#b41d1d] text-white font-medium shadow-[0_0_15px_rgba(180,29,29,0.75)]"
                                        : "hover:bg-neutral-900/60 text-neutral-400 hover:text-white"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <CalendarDays size={16} color={active ? "rgb(239, 68, 68)" : "rgb(163, 163, 163)"} className="shrink-0 transition-colors duration-300" />
                                      <span>Años {r.label}</span>
                                    </div>
                                    {active && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#b41d1d] shadow-[0_0_6px_rgba(180,29,29,0.8)]" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Trigger Column */}
                  <div className="col-span-1 md:col-span-4 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-neutral-800/60 pt-8 md:pt-0 md:pl-8">
                    <button
                      type="button"
                      onClick={handleCurate}
                      disabled={isCurating || movies.length === 0}
                      className="group flex flex-col items-center gap-5 transition-all duration-300 disabled:opacity-40"
                    >
                      <div className="relative w-36 h-36 flex items-center justify-center p-4 border border-neutral-800/50 rounded-full bg-neutral-950/20 group-hover:bg-neutral-950/40 group-hover:border-[#b41d1d]/30 transition-all duration-300 shadow-[0_0_30px_rgba(180,29,29,0.01)] group-hover:shadow-[0_0_40px_rgba(180,29,29,0.15)]">
                        
                        {/* Clean Vector Clapperboard SVG */}
                        <svg 
                          viewBox="0 0 100 100" 
                          className="w-20 h-20 transition-transform duration-300 group-active:scale-95"
                        >
                          {/* Top Arm of clapperboard */}
                          <g 
                            className={`origin-[20px_45px] transition-transform duration-300 ease-out ${
                              isClapping 
                                ? 'rotate-0' 
                                : 'group-hover:rotate-[-16deg]'
                            }`}
                          >
                            {/* Top arm of clapperboard with white stripes */}
                            <path 
                              d="M 21 28 L 79 28 L 79 40 L 21 40 Z" 
                              fill="#0c0c0e" 
                              stroke="#b41d1d" 
                              strokeWidth="2" 
                            />
                            {/* Clean minimal stripes painted as lines */}
                            <line x1="32" y1="28" x2="40" y2="40" stroke="#b41d1d" strokeWidth="2.5" />
                            <line x1="48" y1="28" x2="56" y2="40" stroke="#b41d1d" strokeWidth="2.5" />
                            <line x1="64" y1="28" x2="72" y2="40" stroke="#b41d1d" strokeWidth="2.5" />
                          </g>
                          
                          {/* Bottom Main Board */}
                          <g className={isClapping ? 'translate-y-[-1px]' : ''}>
                            <path 
                              d="M 21 44 L 79 44 L 79 76 L 21 76 Z" 
                              fill="#030303" 
                              stroke="#b41d1d" 
                              strokeWidth="2" 
                              strokeLinejoin="round"
                            />
                            {/* Slates white chalk stripes on body */}
                            <line x1="32" y1="44" x2="24" y2="56" stroke="#b41d1d" strokeWidth="2" opacity="0.4" />
                            <line x1="48" y1="44" x2="40" y2="56" stroke="#b41d1d" strokeWidth="2" opacity="0.4" />
                            <line x1="64" y1="44" x2="56" y2="56" stroke="#b41d1d" strokeWidth="2" opacity="0.4" />
                            
                            {/* Subtle play geometry inside board body */}
                            <polygon points="48,56 48,64 55,60" fill="#b41d1d" opacity="0.8" />
                          </g>
                          
                          {/* Pivot screw */}
                          <circle cx="21" cy="44" r="3" fill="#b41d1d" />
                        </svg>
                        
                      </div>
                      
                      <span 
                        className="text-xl md:text-[24px] tracking-[0.15em] md:tracking-[0.2em] text-[#eeeeee]/80 text-center uppercase italic"
                        style={{ 
                          fontFamily: "'Cinematografica', 'Cinematografica Bold', sans-serif", 
                          fontWeight: "bold",
                          fontFeatureSettings: '"liga" 1, "dlig" 1, "calt" 1',
                          fontVariantLigatures: 'common-ligatures discretionary-ligatures'
                        }}
                      >
                        {(() => {
                          const text = isCurating ? 'BUSCANDO...' : '¡BUSCAR RECOMENDACIONES!';
                          let globalIdx = 0;
                          return text.split(' ').map((word, wordIdx, wordArr) => {
                            return (
                              <span key={wordIdx} className="inline-block whitespace-nowrap">
                                {word.split('').map((char, charIdx) => {
                                  const idx = globalIdx++;
                                  return (
                                    <span 
                                      key={charIdx} 
                                      className="inline-block transition-all duration-300 group-hover:scale-110 group-hover:text-white recommendation-char-std"
                                      style={{ 
                                        transitionDelay: `${idx * 25}ms`
                                      }}
                                    >
                                      {char}
                                    </span>
                                  );
                                })}
                                {wordIdx < wordArr.length - 1 && (
                                  <span className="inline-block">&nbsp;</span>
                                )}
                              </span>
                            );
                          });
                        })()}
                      </span>
                    </button>
                  </div>

                </div>
              )}

              {/* TOP 3 PREMIUM RENDERED (Show only if recommendations exist and not curating) */}
              {curatorRecommendations.length > 0 && !isCurating && (
                <div className="w-full space-y-10 animate-in fade-in duration-500 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <h2 
                      className="text-4xl md:text-6xl tracking-[0.12em] text-[#eeeeee] uppercase"
                      style={{ 
                        fontFamily: "'Cinematografica', 'Cinematografica Regular', sans-serif", 
                        fontWeight: "normal",
                        fontVariantLigatures: "none"
                      }}
                    >
                      NUESTRO <span style={{ color: '#901313' }}>TOP</span> PARA TI
                    </h2>
                    <p className="text-[10px] text-neutral-500 tracking-wide font-normal">Aquí tienes las 3 mejores opciones que seleccionó el Director de acuerdo a lo que buscas.</p>
                  </div>

                  {/* CAROUSEL/GRID DUAL LAYOUT: Horizontal scroll in mobile, 3 columns grid on desktop */}
                  <div 
                    className="flex flex-row md:grid md:grid-cols-3 gap-6 overflow-x-auto md:overflow-visible pb-6 md:pb-0 pt-28 snap-x snap-mandatory scrollbar-none max-w-5xl mx-auto px-4 [&::-webkit-scrollbar]:hidden mt-6 md:mt-10"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {(() => {
                      const recs = curatorRecommendations.slice(0, 3);
                      if (recs.length === 0) return null;

                      return recs.map((rec, index) => {
                        // Lookup details
                        const movieDetails = movies.find(m => 
                           m.id === rec.id || 
                           m.title?.toLowerCase().trim() === rec.title?.toLowerCase().trim() ||
                           m.originalTitle?.toLowerCase().trim() === rec.title?.toLowerCase().trim()
                        );
                        
                        const titleToUse = movieDetails?.title || rec.title;
                        const cleanTitle = titleToUse.replace(/\s*\(.*?\)\s*/g, "").trim();
                        const posterToUse = movieDetails?.poster || DEMO_POSTER;
                        const yearToUse = movieDetails?.year || "N/A";
                        const ratingToUse = movieDetails?.rating || 0;
                        const genreToUse = movieDetails?.genre || rec.genre || "Drama";
                        let normalizedGenreList = getNormalizedGenres(genreToUse);
                        if (normalizedGenreList.length === 0) {
                          normalizedGenreList = ["Drama"];
                        }
                        // Si el usuario eligió un género en el filtro del director, lo colocamos primero
                        const chosen = curatorGenero;
                        if (chosen && chosen !== "Todos") {
                          const idx = normalizedGenreList.findIndex(g => g.toLowerCase() === chosen.toLowerCase());
                          if (idx > -1) {
                            const [matched] = normalizedGenreList.splice(idx, 1);
                            normalizedGenreList.unshift(matched);
                          }
                        }
                        const displayGenre = normalizedGenreList.join(", ");
                        const romanRanks = ["I", "II", "III"];
                        
                        const directorToUse = movieDetails?.director || "Director Desconocido";
                        const originalTitleToUse = movieDetails?.originalTitle || "";
                        const durationToUse = movieDetails?.duration ? `${movieDetails.duration}` : "Cine";
                        const ageRatingToUse = movieDetails?.ageRating || "N/A";
                        const countryToUse = movieDetails?.country || "Internacional";

                        return (
                          <div 
                            key={rec.id || index}
                            onClick={() => {
                              if (movieDetails) {
                                setSelectedMovie(movieDetails);
                                setIsEditing(false);
                                setIsDeleting(false);
                              }
                            }}
                            className="group relative flex flex-col bg-[#050507] border border-neutral-900/60 hover:border-white/80 rounded-xl overflow-visible cursor-pointer transition-all duration-500 hover:-translate-y-2 shadow-[0_12px_40px_rgba(0,0,0,0.85)] hover:shadow-[0_20px_50px_rgba(255,255,255,0.08)] text-left snap-start min-w-[290px] sm:min-w-[340px] md:min-w-0 isolate"
                          >

                            {/* Huge Background Silhouette Number in front of the card sticking out */}
                            <div 
                              className="recommendation-number absolute -top-28 left-1/2 -translate-x-1/2 z-30 select-none pointer-events-none opacity-80 font-sans font-black tracking-normal px-2 text-[7.5rem] sm:text-[9.5rem] leading-none transition-all duration-500 group-hover:opacity-100 group-hover:-translate-y-1 text-center"
                              style={{
                                marginLeft: index === 0 ? "-9px" : "0px"
                              }}
                            >
                              {index + 1}
                            </div>

                            {/* Complete uncropped Poster Section inside standard portrait 2:3 container with transparent top-left gradient */}
                            <div className="relative z-10 aspect-[2/3] w-full overflow-hidden bg-gradient-to-b from-transparent via-neutral-950/20 to-neutral-950/70 border-b border-neutral-900/60 flex items-center justify-center p-3 rounded-t-xl">
                              {/* Blurred ambient background image to fill gaps premium style */}
                              <img 
                                src={posterToUse} 
                                  alt="" 
                                  className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-35 scale-110 pointer-events-none"
                                  style={{
                                    maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 10%, rgba(0,0,0,1) 30%)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 10%, rgba(0,0,0,1) 30%)'
                                  }}
                                  referrerPolicy="no-referrer"
                                  onError={(e: any) => e.target.src = DEMO_POSTER}
                              />
                                
                              {/* Sharp foreground complete uncropped vertical poster */}
                              <img 
                                src={posterToUse} 
                                  alt={cleanTitle} 
                                  className="relative z-10 w-full h-full object-contain rounded-md shadow-[0_12px_24px_rgba(0,0,0,0.5)] transition-transform duration-700 group-hover:scale-[1.02]"
                                  style={{
                                    maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 10%, rgba(0,0,0,1) 30%)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 10%, rgba(0,0,0,1) 30%)'
                                  }}
                                  referrerPolicy="no-referrer"
                                  onError={(e: any) => e.target.src = DEMO_POSTER}
                              />
                                
                              {/* Subtle dark cinematic vignette overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-transparent to-transparent opacity-40 z-15" />

                              {/* Film score badge (matched to archive version) */}
                              {ratingToUse > 0 && (
                                <div className="absolute bottom-4 right-4 flex items-center gap-1.5 text-[11px] text-white font-bold bg-black/80 border border-neutral-800/80 px-2.5 py-1 rounded shadow-md backdrop-blur-sm z-20">
                                  <Star size={10} fill="currentColor" className="text-yellow-500" />
                                  <span>{Number(ratingToUse).toFixed(1)}</span>
                                </div>
                              )}
                            </div>

                            {/* Premium Info Panel */}
                            <div className="p-6 flex-1 flex flex-col justify-between bg-gradient-to-b from-[#050508] to-neutral-950 relative z-10 rounded-b-xl">
                              <div className="space-y-4">
                                {/* Metadata Strip */}
                                <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono tracking-wider gap-2">
                                  <span className="truncate pr-2 max-w-[150px] uppercase font-bold text-neutral-300 bg-neutral-900/30 border border-neutral-800/60 px-2.5 py-1 rounded">{displayGenre}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {ageRatingToUse && ageRatingToUse !== "N/A" && ageRatingToUse !== "No disponible" && (
                                      <span className="border border-neutral-700/60 bg-neutral-900/40 px-2 py-1 text-neutral-300 font-mono text-[9px] font-bold tracking-wider rounded">
                                        {ageRatingToUse}
                                      </span>
                                    )}
                                    <span className="text-[9px] tracking-[0.12em] font-bold text-white bg-[#b41d1d]/80 border border-[#b41d1d] px-2.5 py-1 rounded">{yearToUse}</span>
                                  </div>
                                </div>

                                {/* Title & Original Title */}
                                <div translate="no" className="space-y-1 notranslate">
                                  <h3 className="text-base md:text-lg font-bold tracking-tight text-neutral-100 group-hover:text-white transition-colors duration-300 uppercase">
                                    {cleanTitle}
                                  </h3>
                                  {originalTitleToUse && originalTitleToUse !== cleanTitle && (
                                    <p className="text-xs text-neutral-400 font-light truncate italic uppercase">
                                      {originalTitleToUse}
                                    </p>
                                  )}
                                </div>

                                {/* Technical details list (Country, director and duration) */}
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-neutral-400 border-t border-neutral-900/60 pt-3.5">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <User size={12} className="text-[#b41d1d]/80 shrink-0" />
                                    <span translate="no" className="notranslate truncate font-medium">{directorToUse}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 justify-end shrink-0">
                                    <Clock size={12} className="text-[#b41d1d]/80 shrink-0" />
                                    <span>{durationToUse}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 truncate col-span-2">
                                    <Globe size={11} className="text-[#b41d1d]/80 shrink-0" />
                                    <span className="truncate text-[10px] text-neutral-400">{countryToUse}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Visual cue to open specs details */}
                              <div className="mt-5 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[9px] font-mono text-zinc-500 group-hover:text-white transition-all duration-300">
                                <span className="tracking-widest">VER MÁS</span>
                                <ChevronRight size={11} className="transform group-hover:translate-x-1.5 text-[#b41d1d] transition-transform duration-300" />
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Reset selection bottom button */}
                  <div className="flex justify-center pt-4">
                    <button 
                      onClick={() => { setCuratorRecommendations([]); setCurationError(null); }} 
                      className="px-6 py-2.5 border border-neutral-800 hover:border-[#b41d1d]/40 rounded-xl text-[10px] font-medium tracking-[0.2em] text-neutral-400 hover:text-white transition-all uppercase active:scale-95 shrink-0"
                    >
                      Cambiar Opciones / Volver a Empezar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FAVORITAS DEL MES */}
      {isFavoriteOfMonthActive && (
        <div id="fav-of-month-section" className="relative z-10 w-full min-h-screen px-0 pt-0 pb-10 md:pb-16 select-none animate-in fade-in duration-1000 bg-transparent overflow-hidden">
          
          <div className="relative z-10 max-w-[100vw] overflow-hidden flex flex-col items-center pt-2 sm:pt-3 md:pt-4">
            
            {/* Premium Header/Navigation Control Bar */}
            <div className="w-full px-4 sm:px-6 md:px-8 flex items-center justify-between mb-1 z-20">
              <button 
                onClick={() => setIsFavoriteOfMonthActive(false)}
                className="group flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-950/80 border border-white/15 text-zinc-300 hover:text-white hover:bg-zinc-900/90 hover:border-white/30 hover:scale-105 active:scale-95 transition-all duration-300 text-[10px] md:text-xs font-black tracking-widest uppercase shadow-xl shadow-black/60 backdrop-blur-md hover:shadow-[0_0_10px_rgba(255,255,255,0.06)]"
              >
                <ChevronLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1 text-red-500" />
                Volver a la Mediateca
              </button>
              
              <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black tracking-[0.4em] text-white/75 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
                Exhibición Especial
              </div>
            </div>

            {/* Header Content Exactly Copied from Boceto */}
            <div className="flex flex-col items-center w-full px-4 text-center mt-1 mb-2 z-10">
              <span className="text-[#b41d1d] font-extrabold text-[10px] sm:text-xs tracking-[0.45em] uppercase mt-1 sm:mt-2 mb-1">
                DISFRUTA DE NUESTRAS
              </span>
              
              <div className="flex items-center justify-center w-full gap-4 sm:gap-6 md:gap-8 my-2">
                {/* Gold-amber decorative flank line left */}
                <div className="hidden sm:block flex-1 h-[2.5px] bg-gradient-to-r from-transparent via-[#DFB15B]/25 to-[#DFB15B]/60" />
                
                <h2 className="text-[44px] sm:text-[62px] md:text-[84px] font-bold uppercase tracking-[0.18em] text-white select-none leading-none pt-2" style={{ fontFamily: '"Cinematografica", "Bebas Neue", "Barlow Condensed", sans-serif' }}>
                  PELÍCULAS DEL MES
                </h2>
                
                {/* Gold-amber decorative flank line right */}
                <div className="hidden sm:block flex-1 h-[2.5px] bg-gradient-to-l from-transparent via-[#DFB15B]/25 to-[#DFB15B]/60" />
              </div>

              {/* Star Icon below title with beautiful gold decorative flank lines on both sides, exactly like the image */}
              <div className="flex items-center justify-center w-full max-w-[280px] sm:max-w-md gap-4 text-[#DFB15B]/90 mt-1 mb-4">
                {/* Gold-amber decorative flank line left */}
                <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-[#DFB15B]/20 to-[#DFB15B]/80" />
                
                <div className="scale-110 shrink-0">
                  <Star className="w-4.5 h-4.5 fill-[#DFB15B] stroke-[#DFB15B]" />
                </div>
                
                {/* Gold-amber decorative flank line right */}
                <div className="flex-1 h-[1.5px] bg-gradient-to-l from-transparent via-[#DFB15B]/20 to-[#DFB15B]/80" />
              </div>

              {/* Dramatic Subtitle */}
              <p className="text-zinc-400 text-xs sm:text-sm font-medium tracking-wide max-w-xl leading-relaxed mb-3">
                Historias que te atrapan. Emociones que se quedan contigo.
              </p>

              {/* Selection status tag */}
              {movies.filter(m => m.favoriteOfMonth).length > 0 && (
                <div className="mt-5 mb-2">
                  <span className="px-5 py-2 bg-zinc-950/80 border border-white/15 rounded-full text-[9px] md:text-[10px] font-extrabold tracking-[0.25em] text-zinc-300 uppercase shadow-md shadow-black/40">
                    {activeFavIndex + 1} DE {movies.filter(m => m.favoriteOfMonth).length} SELECCIONADAS
                  </span>
                </div>
              )}
            </div>

            {movies.filter(m => m.favoriteOfMonth).length === 0 ? (
              <div className="w-full flex-col flex items-center justify-center py-20 text-zinc-500 font-sans font-bold text-center gap-4 animate-pulse relative z-10">
                <Star size={48} className="opacity-40" />
                <p className="tracking-widest uppercase text-xs">No hay favoritas seleccionadas aún.</p>
              </div>
            ) : (
              <div className="relative w-full overflow-visible px-4 flex justify-center items-center pt-0 pb-4 mt-2 md:mt-3">
                
                {/* Left navigation arrow button (Boceto Style) */}
                <button 
                  onClick={() => {
                    const newIndex = Math.max(0, activeFavIndex - 1);
                    setActiveFavIndex(newIndex);
                  }}
                  className={`hidden md:flex absolute left-4 sm:left-6 md:left-14 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full border border-white/20 bg-black/60 text-white items-center justify-center transition-all duration-300 hover:bg-transparent hover:border-red-800/80 hover:shadow-[0_0_15px_rgba(153,27,27,0.65)] hover:scale-110 active:scale-95 group ${
                    activeFavIndex === 0 ? 'opacity-20 pointer-events-none' : 'opacity-100 cursor-pointer shadow-[0_0_15px_rgba(0,0,0,0.5)]'
                  }`}
                  aria-label="Anterior película"
                >
                  <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform text-white/90 group-hover:text-red-500/90" />
                </button>

                {/* Right navigation arrow button (Boceto Style) */}
                <button 
                  onClick={() => {
                    const favList = movies.filter(m => m.favoriteOfMonth);
                    const newIndex = Math.min(favList.length - 1, activeFavIndex + 1);
                    setActiveFavIndex(newIndex);
                  }}
                  className={`hidden md:flex absolute right-4 sm:right-6 md:right-14 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full border border-white/20 bg-black/60 text-white items-center justify-center transition-all duration-300 hover:bg-transparent hover:border-red-800/80 hover:shadow-[0_0_15px_rgba(153,27,27,0.65)] hover:scale-110 active:scale-95 group ${
                    activeFavIndex === movies.filter(m => m.favoriteOfMonth).length - 1 ? 'opacity-20 pointer-events-none' : 'opacity-100 cursor-pointer shadow-[0_0_15px_rgba(0,0,0,0.5)]'
                  }`}
                  aria-label="Siguiente película"
                >
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform text-white/90 group-hover:text-red-500/90" />
                </button>

                {/* Horizontal fixed-width 3D absolute slider without native scrolling to match Boceto reference */}
                <div 
                  ref={favContainerRef}
                  className="w-full max-w-[1200px] h-[340px] sm:h-[400px] md:h-[460px] lg:h-[500px] relative overflow-visible flex justify-center items-center select-none z-10 touch-pan-y"
                  style={{
                    perspective: '1000px',
                    transformStyle: 'preserve-3d'
                  }}
                  onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX;
                    touchEndX.current = e.touches[0].clientX;
                  }}
                  onTouchMove={(e) => {
                    touchEndX.current = e.touches[0].clientX;
                  }}
                  onTouchEnd={() => {
                    if (touchStartX.current === null || touchEndX.current === null) return;
                    const diffX = touchStartX.current - touchEndX.current;
                    const threshold = 45; // Safe threshold for single card advance
                    const favList = movies.filter(m => m.favoriteOfMonth);
                    
                    if (diffX > threshold) {
                      // Swipe left -> Next
                      setActiveFavIndex(prev => Math.min(favList.length - 1, prev + 1));
                    } else if (diffX < -threshold) {
                      // Swipe right -> Previous
                      setActiveFavIndex(prev => Math.max(0, prev - 1));
                    }
                    
                    touchStartX.current = null;
                    touchEndX.current = null;
                  }}
                >
                  {movies.filter(m => m.favoriteOfMonth).map((movie, idx) => {
                    const diff = idx - activeFavIndex;
                    const isActive = diff === 0;
                    
                    // Show up to 5 cards (2 left, 1 active, 2 right)
                    const isVisible = Math.abs(diff) <= 2;
                    
                    // Computed dynamic parameters for real-time 3D perspective depth matching the reference image perfectly
                    const scale = isActive ? 1.05 : Math.abs(diff) === 1 ? 0.85 : 0.68;
                    const rotateY = isActive ? 0 : diff < 0 ? 22 : -22;
                    const zIndex = 30 - Math.abs(diff);
                    const opacity = 1.0;
                    
                    // Horizontal offset based on diff to create the precise overlapping from the reference image
                    let translateX = 0;
                    if (diff !== 0) {
                      // Adjust spacing dynamically per screen width to match reference photo perfectly with clean, wider spacing
                      const isSmall = window.innerWidth < 640;
                      const isMD = window.innerWidth < 768;
                      const isLG = window.innerWidth < 1024;
                      
                      const baseOffset = isSmall ? 100 : isMD ? 150 : isLG ? 210 : 260;
                      if (Math.abs(diff) === 1) {
                        translateX = (diff < 0 ? -1 : 1) * baseOffset;
                      } else {
                        translateX = (diff < 0 ? -1 : 1) * (baseOffset * 1.8);
                      }
                    }
                    
                    // translateZ creates deep 3D perspective layer separation with perfect screen alignment
                    const translateZ = isActive ? 60 : Math.abs(diff) === 1 ? -45 : -140;
                    
                    return (
                      <div 
                        key={`${movie.id}-${idx}`} 
                        className={`absolute left-1/2 top-1/2 -translate-y-1/2 w-[46vw] sm:w-[210px] md:w-[240px] lg:w-[270px] aspect-[2/3] rounded-[12px] md:rounded-[14px] bg-[#0c0c0e] overflow-hidden group/card cursor-pointer transition-all duration-[800ms] ease-[cubic-bezier(0.25,1,0.5,1)] ${
                          isActive 
                            ? 'border-2 border-[#a11818]/95 shadow-[0_0_35px_rgba(239,68,68,0.85),_inset_0_0_15px_rgba(239,68,68,0.4)]' 
                            : 'border border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.6)]'
                        }`}
                        style={{
                          transform: `translateX(calc(-50% + ${translateX}px)) rotateY(${rotateY}deg) scale(${scale}) translateZ(${translateZ}px)`,
                          zIndex: zIndex,
                          opacity: opacity,
                          transformStyle: 'preserve-3d',
                          pointerEvents: isVisible ? 'auto' : 'none',
                        }}
                        onClick={() => {
                          if (isActive) {
                            setSelectedMovie(movie);
                            setIsEditing(false);
                            setIsDeleting(false);
                          } else {
                            setActiveFavIndex(idx);
                          }
                        }}
                      >
                        {/* Film Poster Image */}
                        <img 
                          src={movie.poster || DEMO_POSTER} 
                          alt={movie.title} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:scale-105 pointer-events-none"
                          onError={(e) => { e.currentTarget.src = DEMO_POSTER; e.currentTarget.classList.add('opacity-40', 'grayscale'); }} 
                          draggable="false"
                        />
                        
                        {/* Shading/Fade Overlay for film titles (high contrast on active, dimmer on inactive) */}
                        <div className={`absolute inset-0 transition-all duration-750 ${
                          isActive 
                            ? 'bg-gradient-to-t from-black/85 via-black/10 to-black/35' 
                            : 'bg-gradient-to-t from-black/95 via-black/40 to-black/60 bg-black/25'
                        }`} />
                        
                        {/* Beautifully aligned overlay elements matching the image */}
                        <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end select-none z-10 pointer-events-none">
                          
                          {/* Bottom Content: Styled exactly like the reference screenshot */}
                          {isActive ? (
                            /* Active Card: Centered typography with capsule pill */
                            <div className="flex flex-col items-center space-y-2 md:space-y-3 pb-1 animate-in fade-in duration-500">
                              <span className="text-white font-mono text-xs md:text-sm tracking-widest block font-black text-center">
                                {movie.year}
                              </span>
                              
                              {/* Aligned capsule details for genres */}
                              <div className="px-4 py-1.5 border border-white/20 rounded-full bg-black/60 shadow-[0_0_15px_rgba(255,255,255,0.05)] max-w-[95%]">
                                <span className="text-white/90 text-[8px] md:text-[9px] font-extrabold tracking-[0.18em] uppercase block truncate">
                                  {formatGenreDisplay(movie.genre).toUpperCase()}
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* Inactive Card: Muted, clean, left-aligned year and genre with NO title or pill clutter */
                            <div className="flex flex-col items-start space-y-0.5 pb-1 text-left animate-in fade-in duration-500">
                              <span className="text-white/60 font-mono text-[10px] md:text-xs tracking-wider block font-bold text-left">
                                {movie.year}
                              </span>
                              <span className="text-white/40 text-[8px] md:text-[9.5px] font-extrabold tracking-[0.12em] uppercase block text-left truncate max-w-[90%]">
                                {formatGenreDisplay(movie.genre).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Slider bottom description & dot pagination exactly styled as Boceto */}
            {movies.filter(m => m.favoriteOfMonth).length > 0 && (
              <div className="mt-8 flex flex-col items-center space-y-5 z-20">
                <span className="text-[10px] font-extrabold tracking-[0.38em] text-[#DFB15B]/90 uppercase select-none">
                  NAVEGA PARA DESCUBRIR MÁS PELÍCULAS
                </span>
                
                <div className="flex items-center gap-3">
                  {movies.filter(m => m.favoriteOfMonth).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveFavIndex(idx);
                      }}
                      className={`h-2 md:h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                        idx === activeFavIndex 
                          ? 'w-6 md:w-8 bg-[#a11818] shadow-[0_0_8px_rgba(161,24,24,0.85)]' 
                          : 'w-2 md:w-2.5 bg-neutral-700 hover:bg-neutral-500'
                      }`}
                      aria-label={`Ir a película ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
            
          </div>
        </div>
      )}

      {/* DIVISOR CINTA DE CINE */}
          {selectedGenre === "Todos" && !isDirectorFilterActive && !isFavoriteOfMonthActive && (
            <div className="w-full h-12 opacity-80 my-12">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="film-strip" x="0" y="0" width="80" height="48" patternUnits="userSpaceOnUse">
                    <animate attributeName="x" from="0" to="80" dur="6s" repeatCount="indefinite" />
                    <rect x="0" y="0" width="80" height="48" fill="#27272a" />
                    <rect x="8" y="4" width="14" height="8" fill="#000" rx="1" />
                    <rect x="48" y="4" width="14" height="8" fill="#000" rx="1" />
                    <rect x="8" y="36" width="14" height="8" fill="#000" rx="1" />
                    <rect x="48" y="36" width="14" height="8" fill="#000" rx="1" />
                    <rect x="4" y="16" width="72" height="16" fill="#18181b" rx="1" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" fill="url(#film-strip)" />
              </svg>
            </div>
          )}

          {selectedGenre === "Todos" && !isDirectorFilterActive && !isFavoriteOfMonthActive && (
            <div className="w-full flex flex-col items-center text-center space-y-10 animate-in fade-in duration-1000">
              {randomQuote ? (
                <>
                  <QuoteIcon className="text-brand-main/60 w-12 h-12" />
                  <p key={randomQuote.text} className="text-glow-animate text-lg md:text-xl font-black italic tracking-tighter leading-relaxed text-zinc-100 max-w-2xl px-4">"{randomQuote.text}"</p>
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-px w-20 bg-brand-main mb-2 shadow-[0_0_10px_rgba(179,5,0,0.5)]" />
                    <span translate="no" className="notranslate text-brand-main text-[10px] font-black uppercase tracking-[0.5em]">{randomQuote.character}</span>
                    <span translate="no" className="notranslate text-zinc-600 text-[9px] font-black uppercase tracking-widest italic">{randomQuote.movie}</span>
                  </div>
                </>
              ) : (
                 <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-900" size={32} /></div>
              )}
            </div>
          )}

          <div className={`flex flex-col items-center space-y-8 w-full pt-16 opacity-40 transition-all duration-500 ${
            isFavoriteOfMonthActive 
              ? 'border-t border-transparent text-red-500' 
              : 'border-t border-white/5'
          }`}>
            <div className="flex flex-col items-center space-y-3">
              <img 
                src="/android-chrome-512x512.png" 
                alt="Mediateca Logo" 
                className={`w-12 h-12 rounded-xl object-cover border opacity-80 transition-all duration-500 ${
                  isFavoriteOfMonthActive ? 'border-red-600/35 shadow-[0_0_15px_rgba(180,29,29,0.25)]' : 'border-white/10'
                }`}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=128&auto=format&fit=crop&q=60';
                }}
              />
            </div>
            <p className={`text-[8px] font-bold tracking-[0.6em] uppercase text-center leading-relaxed transition-colors duration-500 ${
              isFavoriteOfMonthActive ? 'text-red-500/80' : 'text-zinc-600'
            }`}>© MMXXVI — MEDIATECA PROFESIONAL — ALL RIGHTS RESERVED</p>
          </div>
        </div>
      </footer>
      
      {/* MODAL DE ADVERTENCIA DE DUPLICADO */}
      {duplicateWarningModal.open && (
        <div className="fixed inset-0 z-[350] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300 font-sans">
          <div className="bg-[#0c0c0e] border border-amber-500/30 rounded-[2rem] max-w-md w-full p-6 sm:p-8 shadow-[0_0_80px_rgba(245,158,11,0.15)] flex flex-col relative overflow-hidden text-center">
            {/* Ambient top glowing line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/20 via-amber-500 to-amber-500/20" />
            
            <div className="mx-auto mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 w-fit">
              <AlertTriangle size={36} className="animate-pulse" />
            </div>

            <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white mb-2 font-sans">
              Película Duplicada
            </h3>
            
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mb-6 font-medium">
              La obra <span className="font-extrabold text-amber-400">"{duplicateWarningModal.title}" ({duplicateWarningModal.year || "S/A"})</span> ya se encuentra registrada en el catálogo.
            </p>

            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-6">
              ¿Deseas subirla de todas formas o cancelar la acción?
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  if (duplicateWarningModal.onCancel) {
                    duplicateWarningModal.onCancel();
                  } else {
                    setDuplicateWarningModal({ open: false, title: "", year: 0, onConfirm: null, onCancel: null });
                  }
                }}
                className="flex-1 px-5 py-3.5 rounded-xl border border-white/10 hover:border-white/20 text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 font-sans font-extrabold uppercase text-[10px] tracking-[0.2em] transition-all active:scale-95"
              >
                Cancelar
              </button>
              
              <button
                type="button"
                onClick={() => {
                  if (duplicateWarningModal.onConfirm) {
                    duplicateWarningModal.onConfirm();
                  }
                }}
                className="flex-1 px-5 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-sans font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] active:scale-95"
              >
                Subir de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMINS MODAL */}
      {showAdminsModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setShowAdminsModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X size={20}/></button>
            <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2 mb-2"><Users className="text-brand-light" size={24} /> Gestionar Admins</h3>
            <p className="text-xs text-zinc-400 mb-6 font-medium leading-relaxed">Agrega administradores para que puedan editar el catálogo. Sus correos deben coincidir con la cuenta de Google con la que inicien sesión.</p>
            <AdminManager currentUser={user} userRole={userRole} />
          </div>
        </div>
      )}

      {/* FULLSCREEN IMAGE MODAL */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 cursor-zoom-out animate-in fade-in duration-300"
          onClick={() => setFullscreenImage(null)}
        >
          <img 
            src={fullscreenImage} 
            alt="Fullscreen Poster" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-500"
          />
          <button 
            className="absolute top-6 right-6 p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors"
            onClick={() => setFullscreenImage(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}
      </main>
    </div>
  );
}

const EditField = ({ label, value, onChange, type = "text", className = "", placeholder = "" }: any) => {
  const getFieldIcon = (l: string) => {
    const norm = l.toLowerCase();
    if (norm.includes('original')) return <Type size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('título') || norm.includes('titulo')) return <Clapperboard size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('año') || norm.includes('fecha')) return <Calendar size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('rating') || norm.includes('calific') || norm.includes('nota')) return <Star size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('género') || norm.includes('genero')) return <LayoutGrid size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('durac')) return <Clock size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('país') || norm.includes('pais')) return <Globe size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('clasific')) return <Eye size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('direcc')) return <User size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('guion')) return <ClipboardList size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('música') || norm.includes('musica')) return <Music size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('fotografía') || norm.includes('foto')) return <ImageIcon size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('estudio') || norm.includes('compan')) return <Landmark size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('estante') || norm.includes('localiz')) return <Library size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('formato')) return <MonitorPlay size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    return <Film size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
  };

  return (
    <div className={`flex flex-col gap-1 group relative ${className} font-sans`}>
      <div className="relative w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-md">
        <div className="shrink-0 flex items-center justify-center text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300">
          {getFieldIcon(label)}
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 font-extrabold select-none mb-0.5 leading-none font-sans">
            {label}
          </span>
          <input 
            type={type} 
            step={type === "number" ? "0.1" : undefined} 
            value={value || ""} 
            onChange={(e) => onChange(e.target.value)} 
            onKeyDown={(e) => e.stopPropagation()} 
            placeholder={placeholder}
            className="w-full bg-transparent border-none p-0 text-zinc-100 text-sm font-semibold tracking-tight outline-none focus:ring-0 placeholder-zinc-700 font-sans transition-all leading-normal"
          />
        </div>
      </div>
    </div>
  );
};

const InfoBox = ({ icon, label, value }: any) => (
  <div className="flex flex-col gap-2 shrink-0 px-8 border-r border-white/5 last:border-0 group min-w-[150px]">
    <span className="text-[10px] font-black text-brand-main uppercase tracking-[0.3em] flex items-center gap-3 group-hover:translate-x-1 transition-transform">{icon} {label}</span>
    <span className="text-sm font-black text-white tracking-tight">{value || "N/A"}</span>
  </div>
);

const DetailBlock = ({ label, value, icon }: any) => (
  <div className="space-y-6 bg-white/5 p-8 rounded-[2.5rem] border border-white/5 shadow-inner group hover:border-brand-main/30 transition-all duration-500">
    <h4 className="text-[11px] font-black text-brand-light uppercase tracking-widest flex items-center gap-4"><div className="p-2 bg-[var(--color-brand-main)]/10 rounded-lg group-hover:scale-110 transition-transform">{icon}</div> {label}</h4>
    <p className="text-xs md:text-sm text-zinc-400 italic leading-relaxed font-semibold antialiased">{value || "Sin registro."}</p>
  </div>
);

const TechItem = ({ label, value, className = "", icon = null }: any) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-1">{icon} {label}</span>
    <span className="text-xs font-bold text-zinc-300">{value || "N/A"}</span>
  </div>
);

const AdminManager = ({ currentUser, userRole }: any) => {
  const [admins, setAdmins] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("editor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const isSuper = userRole === 'admin';

  useEffect(() => {
    // Estrategia Cache-First Obligatoria: Solo una carga inicial única
    const loadAdmins = async () => {
      try {
        const cachedAdmins = await fetchAdminsOptimized(false);
        if (cachedAdmins && cachedAdmins.length > 0) {
          setAdmins(cachedAdmins);
        } else {
          const serverAdmins = await fetchAdminsOptimized(true);
          setAdmins(serverAdmins || []);
        }
      } catch (err) {
        console.error("Error al cargar admins:", err);
      }
    };

    loadAdmins();
  }, []);

  const handleAdd = async (e: any) => {
    e.preventDefault();
    if (!newEmail.trim() || !currentUser || !isSuper) return;
    setLoading(true);
    setError("");
    try {
      const email = newEmail.trim().toLowerCase();
      const payload = {
        email,
        createdAt: new Date().toISOString(),
        addedBy: currentUser.id,
        name: email.split('@')[0],
        photoURL: "",
        role: newRole,
        id: email
      };
      
      await upsertAdmin(payload);
      // Actualización optimista de administradores locales (Lecturas = 0)
      setAdmins(prev => {
        const index = prev.findIndex(a => a.id === payload.id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = payload;
          return updated;
        } else {
          return [...prev, payload];
        }
      });
      setNewEmail("");
      setNewRole("editor");
    } catch (err: any) {
      setError(err.message || "Error al agregar.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (!isSuper) return;
    if (email === currentUser.email) {
      setError("No puedes eliminarte a ti mismo.");
      return;
    }
    setUserToDelete(email);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setLoading(true);
    try {
      await deleteAdmin(userToDelete);
      // Actualización optimista (Lecturas = 0)
      setAdmins(prev => prev.filter(a => a.email !== userToDelete));
      setUserToDelete(null);
    } catch (err: any) {
      setError(err.message || "Error al eliminar.");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (email: string, role: string) => {
    if (!isSuper) return;
    if (email === currentUser.email) {
       setError("No puedes cambiarte el rol a ti mismo.");
       return;
    }
    setLoading(true);
    try {
       await upsertAdmin({ email, role });
       // Actualización optimista (Lecturas = 0)
       setAdmins(prev => prev.map(a => a.email === email ? { ...a, role } : a));
    } catch (err: any) {
       setError(err.message || "Error al actualizar rol.");
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {isSuper && (
        <form onSubmit={handleAdd} className="flex gap-2 w-full">
          <input 
            type="email" 
            placeholder="nuevo.admin@gmail.com" 
            value={newEmail} 
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-brand-main outline-none text-white min-w-0"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-2 py-2.5 text-sm focus:border-brand-main outline-none text-white"
          >
            <option value="editor">Editor</option>
            <option value="admin">Super Admin</option>
          </select>
          <button disabled={loading} type="submit" className="bg-white text-black px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center justify-center shrink-0">
            <Plus size={18} />
          </button>
        </form>
      )}
      
      {error && <p className="text-brand-light text-xs font-bold bg-red-500/10 p-2 rounded-lg">{error}</p>}
      
      <div className="flex flex-col gap-2 mt-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-brand-main/20">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white max-w-[200px] truncate">chapceligg@gmail.com</span>
            <span className="text-[10px] text-zinc-500 uppercase font-black">Fundador / Owner</span>
          </div>
        </div>
        
        {admins.map(a => (
          <div key={a.id} className="flex flex-col bg-white/5 rounded-lg border border-white/5 gap-2 w-full overflow-hidden">
            <div className="flex items-center justify-between p-3 gap-2">
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-bold text-white truncate" title={a.email}>{a.email}</span>
                {isSuper && a.email !== currentUser.email ? (
                  <select 
                    value={a.role || 'editor'}
                    onChange={(e) => handleRoleChange(a.email, e.target.value)}
                    disabled={loading}
                    className="mt-1 text-[10px] font-black uppercase tracking-widest bg-transparent text-zinc-400 border border-white/10 rounded px-1 py-0.5 outline-none focus:border-white/30 cursor-pointer w-fit"
                  >
                    <option value="editor">EDITOR INVITADO</option>
                    <option value="admin">SUPER ADMIN</option>
                  </select>
                ) : (
                  <span className="text-[10px] text-zinc-500 uppercase font-black">{a.role === 'admin' ? 'Super Admin' : 'Editor Invitado'}</span>
                )}
              </div>
              {isSuper && (
                <button onClick={() => handleRemove(a.id)} disabled={loading} className="text-zinc-500 hover:text-brand-light transition-colors p-2 disabled:opacity-50 shrink-0">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            
            {userToDelete === a.id && (
              <div className="bg-red-500/10 border-t border-brand-main/20 p-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <p className="text-xs text-red-400 font-bold">¿Eliminar acceso de {a.email}?</p>
                <div className="flex gap-2">
                   <button onClick={confirmDelete} disabled={loading} className="flex-1 bg-[#b91c1c] hover:bg-[#dc2626] text-white text-xs font-bold py-1.5 rounded disabled:opacity-50 transition-colors">Confirmar</button>
                   <button onClick={() => setUserToDelete(null)} disabled={loading} className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-1.5 rounded disabled:opacity-50 transition-colors">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {admins.length === 0 && <p className="text-zinc-500 text-xs italic text-center py-4">No hay editores adicionales.</p>}
      </div>
    </div>
  );
};
