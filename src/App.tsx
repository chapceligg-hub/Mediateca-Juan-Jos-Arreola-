// Modificaciones completas a App.tsx basadas en el diseño original del usuario
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Film, Star, Clock, User, Calendar, X, Plus, Edit2, Check, Trash2, 
  Sparkles, Loader2, AlertTriangle, Clapperboard, MonitorPlay, Trophy, Quote as QuoteIcon, 
  Zap, ImageIcon, Landmark, History as HistoryIcon, Type, ChevronRight, ChevronLeft, ChevronDown, Globe, 
  DatabaseBackup, LogIn, LogOut, MapPin, Quote, ShieldAlert, Copy, ClipboardPaste, Upload,
  ArrowDownAZ, CalendarDays, LayoutGrid, Users, Menu, Eye, Library, ClipboardList, FilePlus2, Music
} from 'lucide-react';
import { 
  getAdminByEmail, initAuth, signInWithGoogle, logout, onAuthStateChanged,
  upsertMovie, updateMovie, deleteMovie, upsertAdmin, deleteAdmin,
  fetchMoviesOptimized, fetchAdminsOptimized, subscribeMovies, generateMovieId
} from './lib/firebase';
import { Movie, Quote as QuoteType } from './types';
import { ALPHABET, YEAR_RANGES, DEMO_POSTER } from './constants';
import { catalogMovieAI, fetchIconicQuote } from './lib/aiService';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAutoScrollVertical } from './hooks/useAutoScrollVertical';
import { CinematicBackground } from './components/CinematicBackground';

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
  const normalizedGenres = new Set<string>();
  
  parts.forEach(part => {
    let cleanGenre = part.trim();
    if (!cleanGenre) return;
    
    cleanGenre = cleanGenre.replace(/\.$/, '');
    let cleanLower = cleanGenre.toLowerCase();
    
    if (["satira", "sátira", "sátira política", "satira politica", "comedia negra", "comedia dramática", "humor absurdo", "farsa", "comedias", "comedy"].includes(cleanLower)) {
      cleanGenre = "Comedia";
    } else if (["histórico", "historico", "historia / biografía", "drama histórico", "mitología", "bíblico", "holocausto", "historia / biografia", "épico", "epico"].includes(cleanLower)) {
      cleanGenre = "Historia";
    } else if (["biografía", "biografia", "biográfico", "biografico"].includes(cleanLower)) {
      cleanGenre = "Biografía";
    } else if (["intriga / suspenso", "suspense", "suspenso", "intriga", "suspenso psicológico", "intrigas", "psicológico", "psicologico", "drama psicológico", "judicial", "drama judicial"].includes(cleanLower)) {
      cleanGenre = "Suspense";
    } else if (["terror", "horror", "terror psicológico", "sobrenatural", "slasher"].includes(cleanLower)) {
      cleanGenre = "Terror";
    } else if (["thriller", "thriller médico", "thriller político", "thriller psicológico"].includes(cleanLower)) {
      cleanGenre = "Thriller";
    } else if (["crimen", "crimen / noir", "neo-noir", "cine negro", "film noir", "espionaje", "policial", "policiaco"].includes(cleanLower)) {
      cleanGenre = "Crimen";
    } else if (["cine de arte y culto", "cine de arte", "arte", "ensayo", "experimental", "filosófico", "espiritual", "culto", "social", "transgresión", "road movie", "folklore", "inspiracional", "antología", "antologia", "político", "politico", "politicos", "politica"].includes(cleanLower)) {
      cleanGenre = "Drama";
    } else if (["familia", "familiar", "family", "juvenil", "infantil", "juvenil / infantil", "coming-of-age"].includes(cleanLower)) {
      cleanGenre = "Familia";
    } else if (["documental", "documentary", "docudrama", "mockumentary", "falso documental", "metraje encontrado", "found footage"].includes(cleanLower)) {
      cleanGenre = "Documental";
    } else if (["ciencia ficción", "ciencia ficcion", "sci-fi", "scifi", "ficción", "ficcion", "superhéroes", "superheroes", "distopía", "distopia"].includes(cleanLower)) {
      cleanGenre = "Ciencia Ficción";
    } else if (["comedia", "comedia c"].includes(cleanLower)) {
      cleanGenre = "Comedia";
    } else if (["comedia musical", "musical ranchero", "musical", "música", "musica", "music", "ranchera", "cine de rumberas", "rumberas"].includes(cleanLower)) {
      cleanGenre = "Musical";
    } else if (["drama"].includes(cleanLower)) {
      cleanGenre = "Drama";
    } else if (["clásico", "clásica", "clásicas"].includes(cleanLower)) {
      cleanGenre = "Clásico";
    } else if (["comedia romántica", "romance", "romantico", "romántico", "romantic"].includes(cleanLower)) {
      cleanGenre = "Romance";
    } else if (["deporte", "deportes", "deportivo", "lucha libre", "artes marciales", "acción", "accion", "action"].includes(cleanLower)) {
      cleanGenre = "Acción";
    } else if (["mexicana", "mexicanas", "mexicano", "cine mexicano", "película mexicana"].includes(cleanLower) || cleanLower.includes("méxico") || cleanLower.includes("mexico")) {
      cleanGenre = "Mexicanas";
    } else if (["aventura", "aventuras", "adventure", "catástrofe", "catastrofe"].includes(cleanLower)) {
      cleanGenre = "Aventuras";
    } else if (["animacion", "animación", "animation"].includes(cleanLower)) {
      cleanGenre = "Animación";
    } else if (["belico", "bélico", "guerra", "war"].includes(cleanLower)) {
      cleanGenre = "Bélico";
    } else if (["fantasía", "fantasia", "fantastico", "fantástico", "fantasy"].includes(cleanLower)) {
      cleanGenre = "Fantasía";
    } else if (["misterio", "mystery", "enigma"].includes(cleanLower)) {
      cleanGenre = "Misterio";
    } else if (["western", "vaqueros"].includes(cleanLower)) {
      cleanGenre = "Western";
    } else {
      cleanGenre = cleanGenre.charAt(0).toUpperCase() + cleanGenre.slice(1).toLowerCase();
    }
    
    normalizedGenres.add(cleanGenre);
  });
  
  return Array.from(normalizedGenres);
};

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
  
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const clearFiltersAndSearch = () => {
    setSelectedLetter(null);
    setSelectedYearRange(null);
    setSelectedGenre("Todos");
    setSearchQuery("");
    setSearchTerm("");
    setShowReviewOnly(false);
    setShowHistoryOnly(false);
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
  const [syncInput, setSyncInput] = useState("");
  const [randomQuote, setRandomQuote] = useState<QuoteType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ active: false, total: 0, current: 0, currentMovie: "" });
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [authDenied, setAuthDenied] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pasteLimit, setPasteLimit] = useState<5 | 10>(5);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const moviesPerPage = 24;

  const isArchiveActive = !selectedLetter && !selectedYearRange && selectedGenre === "Todos" && !showReviewOnly && !showHistoryOnly;

  const getSidebarItemClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-black bg-white rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 px-5 py-3 font-bold text-sm transition-all group";
  };

  const getArchiveSidebarClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-white bg-white/[0.04] border-l-2 border-[#e53e3e] rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 px-5 py-3 font-bold text-sm transition-all group";
  };

  const getHistorySidebarClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-white bg-white/[0.04] border-l-2 border-[#e53e3e] rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 px-5 py-3 font-bold text-sm transition-all group";
  };

  const getReviewSidebarClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center gap-4 w-full text-white bg-[rgba(229,62,62,0.15)] border-l-2 border-[#e53e3e] rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all group"
      : "flex items-center gap-4 w-full text-zinc-400 hover:text-white hover:bg-white/5 px-5 py-3 font-bold text-sm transition-all group";
  };

  const getAccordionHeaderClass = (isActive: boolean) => {
    return isActive 
      ? "flex items-center justify-between w-full text-[#ffffff] bg-[rgba(229,62,62,0.12)] border-l-2 border-[#e53e3e] rounded-r-[8px] px-5 py-3 font-bold text-sm transition-all group"
      : "flex items-center justify-between w-full text-zinc-400 hover:text-white hover:bg-white/5 px-5 py-3 font-bold text-sm transition-all group";
  };

  const handleManualPosterUpdate = async (newPoster: string) => {
    if (isAddingNew || isEditing) {
      setEditForm({ ...editForm, poster: newPoster });
    } else if (selectedMovie) {
      const updatedAt = new Date().toISOString();
      const payload = { ...selectedMovie, poster: newPoster, updatedAt };
      setSelectedMovie(payload);
      
      try {
        await upsertMovie(payload);
      } catch (error: any) {
        setSyncError("Error actualizando póster");
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
    const ficha = `🖼️ Póster: ${selectedMovie.poster || 'No disponible'}
🎬 Título Videoteca: ⚠️ ${selectedMovie.title || 'No disponible'}
🏷️ Título Original: ${selectedMovie.originalTitle || 'No disponible'}
📅 Año: ${selectedMovie.year || 'No disponible'}
⭐ Rating Global: ${selectedMovie.rating || '0'}
🎭 Género: ${selectedMovie.genre || 'No disponible'}
⏱️ Duración: ${selectedMovie.duration || 'No disponible'}
🌍 País: ${selectedMovie.country || 'No disponible'}
🔞 Clasificación: ${selectedMovie.ageRating || 'No disponible'}
✍️ Guion: ${selectedMovie.script || 'No disponible'}
📺 Formato: ${selectedMovie.format || 'No disponible'}
🎬 Dirección: ${selectedMovie.director || 'No disponible'}
🎵 Banda Sonora: ${selectedMovie.music || 'No disponible'}
📸 Fotografía: ${selectedMovie.photography || 'No disponible'}
🏢 Estudio: ${selectedMovie.companies || 'No disponible'}
📚 Estante (Localización): ${selectedMovie.estante || ''}
👥 Elenco: ${Array.isArray(selectedMovie.cast) ? selectedMovie.cast.join(' / ') : selectedMovie.cast || 'No disponible'}
📖 Argumento:
Sinopsis: ${selectedMovie.synopsis || 'No disponible'}
Reseñas críticas: ${selectedMovie.reviews || 'No disponible'}
Premios históricos: ${selectedMovie.awards || 'No disponible'}`;

    navigator.clipboard.writeText(ficha);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProcessPastedText = async () => {
    if (!pastedText.trim()) return;
    setShowPasteModal(false);
    setBatchProgress({ active: true, total: 1, current: 0, currentMovie: "Interpretando texto con IA..." });

    try {
      const response = await fetch('/api/batch-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText, limit: pasteLimit })
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

      let index = 0;
      for (const m of parsedMovies) {
        if (!m || !m.title) {
          index++;
          continue;
        }
        
        const isDuplicate = movies.some(existingMovie => 
          existingMovie.title?.toLowerCase().trim() === m.title?.toLowerCase().trim() && 
          existingMovie.year == m.year
        );

        if (isDuplicate) {
          skipped.push(`"${m.title}" (${m.year || "S/A"})`);
          setBatchProgress(p => ({ ...p, current: index + 1, currentMovie: `Omitiendo duplicado: ${m.title}` }));
          await new Promise(r => setTimeout(r, 600));
          index++;
          continue;
        }

        setBatchProgress(p => ({ ...p, currentMovie: `Buscando ficha: ${m.title}...`, current: index }));

        // Realizamos la búsqueda profunda individual de forma secuencial con control de tasa / reintentos
        let detailedMovie: any = null;
        let retries = 3;
        let delay = 600;

        while (retries > 0) {
          try {
            const catRes = await fetch('/api/catalog', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: m.title, searchYear: m.year })
            });
            if (catRes.ok) {
              detailedMovie = await catRes.json();
              break;
            }
          } catch (e) {
            console.warn(`Error en consulta de película "${m.title}". Intentos restantes: ${retries - 1}`, e);
          }
          retries--;
          if (retries > 0) {
            await new Promise(r => setTimeout(r, delay));
            delay *= 2; // backoff exponencial
          }
        }

        // Si fallaron los reintentos, usamos los datos básicos de la extracción como fallback
        const baseMovie = detailedMovie || m;

        // Generamos un ID robusto nativo para evitar colisiones
        const finalId = generateMovieId();
        
        const finalMovie: Movie = {
          ...baseMovie,
          id: finalId,
          // fusionamos el formato, estante o rating si vinieron del texto manual pegado
          rating: m.rating !== undefined && m.rating !== null && !isNaN(Number(m.rating)) ? Number(m.rating) : (baseMovie.rating || 0),
          format: m.format || baseMovie.format || "No disponible",
          estante: m.estante || baseMovie.estante || "N/A",
          createdAt: baseMovie.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          needsReview: baseMovie.needsReview || false,
          poster: baseMovie.poster || DEMO_POSTER,
          synopsis: baseMovie.synopsis || "Sin argumento registrado."
        };

        await upsertMovie(finalMovie);
        // NO HACEMOS push manual a setMovies, onSnapshot se encarga en tiempo real

        setBatchProgress(p => ({ ...p, current: index + 1 }));
        await new Promise(r => setTimeout(r, 600)); // Pequeña pausa visual obligatoria entre llamadas
        index++;
      }

      setPastedText("");
      setTimeout(() => {
        setBatchProgress({ active: false, total: 0, current: 0, currentMovie: "" });
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
    onAuthStateChanged(async (currentUser: any) => {
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
    fetchIconicQuote().then(setRandomQuote);
  }, [isBypassActive]);

  useEffect(() => {
    if (isAuthChecking) {
      return;
    }

    // 1. Estrategia Cache-First Obligatoria: Cargar primero datos de forma instantánea de la caché local
    try {
      const offlineData = localStorage.getItem("videoteca_movies_cache");
      if (offlineData) {
        const parsed = JSON.parse(offlineData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMovies(parsed);
        }
      }
    } catch (e) {
      console.warn("Error leyendo la caché inicial de películas:", e);
    }

    // 2. Conectar la suscripción en tiempo real con limpieza correcta ante desmontaje
    const unsubscribe = subscribeMovies(
      (moviesList) => {
        setMovies(moviesList);
        setFirestoreError(null);
      },
      (err) => {
        console.error("Error en tiempo real al sincronizar películas:", err);
        setFirestoreError(err.message || "Error al sincronizar datos en tiempo real");
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthChecking]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedGenre, selectedLetter, selectedYearRange, showReviewOnly]);

  const dynamicGenres = useMemo(() => {
    // 21 categorías + Todos + Clásico + Mexicanas como se solicita
    const STANDARD_GENRES = [
      "Acción", "Aventuras", "Animación", "Biografía", "Bélico", "Ciencia Ficción",
      "Comedia", "Crimen", "Documental", "Drama", "Familia", "Fantasía", "Historia", 
      "Misterio", "Musical", "Romance", "Suspense", "Terror", "Thriller", "Western", "Mexicanas"
    ];
    
    return ["Todos", "Clásico", ...STANDARD_GENRES];
  }, []);

  const filteredMovies = useMemo(() => {
    return movies.filter(m => {
      const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/);
      const matchSearch = searchTerms.every(term => {
        if (!term) return true;
        const inTitle = (m.title || "").toLowerCase().includes(term);
        const inOriginalTitle = (m.originalTitle || "").toLowerCase().includes(term);
        const inDirector = (m.director || "").toLowerCase().includes(term);
        const isYearExact = String(m.year) === term;
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

      return matchSearch && matchGenre && matchLetter && matchYear && matchReview;
    }).sort((a, b) => {
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
  }, [searchTerm, movies, selectedGenre, selectedLetter, selectedYearRange, showReviewOnly, showHistoryOnly]);

  console.log('RENDER', { movies: movies.length, filtered: filteredMovies.length });

  const paginatedMovies = useMemo(() => {
    const startIndex = (currentPage - 1) * moviesPerPage;
    return filteredMovies.slice(startIndex, startIndex + moviesPerPage);
  }, [filteredMovies, currentPage]);

  const totalPages = Math.ceil(filteredMovies.length / moviesPerPage);

  const handleSave = async () => {
    if (!isAdmin || !user) return;

    if (isAddingNew) {
      const titleToSave = editForm.title || "Obra sin título";
      const yearToSave = parseInt(editForm.year as any) || new Date().getFullYear();
      const isDuplicate = movies.some(m => 
        m.title?.toLowerCase().trim() === titleToSave.toLowerCase().trim() && 
        m.year == yearToSave
      );
      if (isDuplicate) {
        alert(`La película "${titleToSave}" (${yearToSave}) ya existe en la videoteca.`);
        return;
      }
    }

    const id = isAddingNew ? generateMovieId() : (editForm.id || "");
    if (!id) {
      setSyncError("No se pudo referenciar la obra. Intenta de nuevo.");
      return;
    }
    try {
      const payload: Movie = {
        id,
        title: editForm.title || "Obra sin título",
        originalTitle: editForm.originalTitle || editForm.title || "Original Title",
        year: parseInt(editForm.year as any) || new Date().getFullYear(),
        rating: Math.min(10, Math.max(0, parseFloat(editForm.rating as any) || 0)),
        duration: editForm.duration || "N/A",
        country: editForm.country || "N/A",
        director: editForm.director || "Desconocido",
        script: editForm.script || "N/A",
        cast: Array.isArray(editForm.cast) ? editForm.cast : String(editForm.cast || "").split(',').map(s => s.trim()).filter(Boolean),
        music: editForm.music || "N/A",
        photography: editForm.photography || "N/A",
        companies: editForm.companies || "N/A",
        genre: editForm.genre || "Cine",
        synopsis: editForm.synopsis || "Sin argumento registrado.",
        poster: editForm.poster || DEMO_POSTER,
        reviews: editForm.reviews || "Sin reseñas verificadas.",
        awards: editForm.awards || "Sin premios registrados.",
        ageRating: editForm.ageRating || "N/A",
        format: editForm.format || "No disponible",
        estante: editForm.estante || "N/A",
        createdAt: isAddingNew ? new Date().toISOString() : (editForm.createdAt || editForm.updatedAt || new Date().toISOString()),
        updatedAt: new Date().toISOString(),
        needsReview: false
      };
      
      await upsertMovie(payload);
      
      setIsAddingNew(false); setIsEditing(false); setSelectedMovie({ ...selectedMovie, ...payload } as Movie); setSyncInput("");
      setSyncError("");
    } catch (e: any) { setSyncError("Fallo al persistir registro: " + e.message); }
  };

  const handleSync = async (autoSave: boolean = false) => {
    if (!syncInput) return;
    setIsSyncing(true); setSyncError("");
    setSyncStatus("Analizando texto con IA...");
    try {
      const response = await fetch('/api/batch-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: syncInput })
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
        if (data[key] && data[key] !== "No disponible" && data[key] !== "No encontrado") {
          merged[key] = data[key];
        }
      }
      if (data.poster && data.poster !== "No disponible" && data.poster !== "No encontrado") {
        merged.poster = data.poster;
      } else {
        merged.poster = editForm.poster;
      }

      setEditForm(merged);
      setSyncStatus("¡Ficha extraída correctamente!");

      if (autoSave) {
        if (isAddingNew) {
          const titleToSave = merged.title || "Obra sin título";
          const yearToSave = parseInt(merged.year as any) || new Date().getFullYear();
          const isDuplicate = movies.some(m => 
            m.title?.toLowerCase().trim() === titleToSave.toLowerCase().trim() && 
            m.year == yearToSave
          );
          if (isDuplicate) {
            setSyncError(`La película "${titleToSave}" (${yearToSave}) ya existe en la videoteca.`);
            setIsSyncing(false);
            return;
          }
        }
        setSyncStatus("Guardando en la bóveda...");
        const id = isAddingNew ? generateMovieId() : (merged.id || "");
        if (!id) throw new Error("No se pudo referenciar la obra. Intenta de nuevo.");

        const payload: Movie = {
          id,
          title: merged.title || "Obra sin título",
          originalTitle: merged.originalTitle || merged.title || "Original Title",
          year: parseInt(merged.year as any) || new Date().getFullYear(),
          rating: Math.min(10, Math.max(0, parseFloat(merged.rating as any) || 0)),
          duration: merged.duration || "N/A",
          country: merged.country || "N/A",
          director: merged.director || "Desconocido",
          script: merged.script || "N/A",
          cast: Array.isArray(merged.cast) ? merged.cast : String(merged.cast || "").split(',').map(s => s.trim()).filter(Boolean),
          music: merged.music || "N/A",
          photography: merged.photography || "N/A",
          companies: merged.companies || "N/A",
          genre: merged.genre || "Cine",
          synopsis: merged.synopsis || "Sin argumento registrado.",
          poster: merged.poster || DEMO_POSTER,
          reviews: merged.reviews || "Sin reseñas verificadas.",
          awards: merged.awards || "Sin premios registrados.",
          ageRating: merged.ageRating || "N/A",
          format: merged.format || "No disponible",
          estante: merged.estante || "N/A",
          createdAt: isAddingNew ? new Date().toISOString() : (merged.createdAt || merged.updatedAt || new Date().toISOString()),
          updatedAt: new Date().toISOString(),
          needsReview: false
        };
        await upsertMovie(payload);
        
        setIsAddingNew(false); setIsEditing(false); setSelectedMovie({ ...selectedMovie, ...payload } as Movie); setSyncInput("");
        setSyncStatus("¡Guardado exitoso!");
      }
    } catch (err: any) { setSyncError(err.message); } finally { setIsSyncing(false); setTimeout(() => setSyncStatus(""), 3000); }
  };

  const handleDelete = async () => {
    if (!isAdmin || !user || !selectedMovie) return;
    const deletedId = selectedMovie.id;
    try {
      await deleteMovie(deletedId);
      
      setSelectedMovie(null); setIsDeleting(false);
    } catch (e: any) { setSyncError("Error al intentar eliminar la obra: " + e.message); }
  };

  const handleToggleReview = async (movie: Movie, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isAdmin || !user) return;
    const newValue = !movie.needsReview;
    try {
      const updatedAt = new Date().toISOString();
      await updateMovie(movie.id, { needsReview: newValue, updatedAt });
      
      if (selectedMovie && selectedMovie.id === movie.id) {
        setSelectedMovie({ ...selectedMovie, needsReview: newValue, updatedAt });
      }
    } catch(e: any) {
      alert("Error al actualizar estado de revisión: " + e.message);
    }
  };

  const {
    containerRef: genreStripRef,
    handleMouseMove: handleGenreMouseMove,
    handleMouseLeave: handleGenreMouseLeave
  } = useAutoScroll();

  const {
    containerRef: infoBoxesRef,
    handleMouseMove: handleInfoBoxesMouseMove,
    handleMouseLeave: handleInfoBoxesMouseLeave
  } = useAutoScroll();

  const {
    containerRef: mainContentRef,
    handleMouseMove: handleMainMouseMove,
    handleMouseLeave: handleMainMouseLeave
  } = useAutoScrollVertical();

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-[var(--color-brand-main)]/40 overflow-hidden antialiased scroll-smooth">
      
      {/* SIDEBAR */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/80 z-[60] md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <aside className={`w-72 bg-[#050505] border-r border-white/5 flex-col h-full shrink-0 z-[70] transition-transform duration-300 ${isMobileMenuOpen ? 'fixed left-0 translate-x-0 flex' : 'fixed -translate-x-full md:relative md:translate-x-0 md:flex'}`}>
        <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          
          {/* Logo */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-6 mb-2">
            <div className="flex flex-col items-center cursor-pointer group mx-auto w-[140px]" onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); clearFiltersAndSearch(); }}>
              <img 
                src="/android-chrome-512x512.png" 
                alt="Videoteca Logo" 
                className="w-full h-auto rounded-2xl object-cover border border-white/10 group-hover:scale-105 transition-transform duration-500 shadow-xl" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=128&auto=format&fit=crop&q=60';
                }}
              />
            </div>
            <button className="md:hidden text-white absolute right-8 top-8" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={28} />
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
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400/80 group-focus-within:text-[#e53e3e] group-focus-within:scale-110 transition-all duration-300 ease-out z-20" />
              <input 
                type="text" 
                placeholder="Buscar título o año..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                onKeyDown={(e) => { e.stopPropagation(); if(e.key === 'Enter') setIsMobileMenuOpen(false); }} 
                className="w-full bg-transparent py-3 pl-12 pr-4 text-sm text-white outline-none font-semibold placeholder:text-zinc-500 rounded-2xl z-20" 
              />
            </div>
          </div>

          {/* Primary Menu & Filters Organized by Groups */}
          <div className="flex flex-col gap-5 shrink-0">
             
             {/* GROUP: EXPLORAR */}
             <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/[0.28] font-bold px-5 mb-1 mt-5 select-none block">Explorar</span>
                <div className="flex flex-col gap-1">
                   {/* Archive */}
                   <button 
                     className={getArchiveSidebarClass(isArchiveActive)} 
                     onClick={clearFiltersAndSearch}
                   >
                     <Clapperboard className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-110 group-hover:rotate-[8deg] group-hover:text-red-500" /> 
                     <span>ARCHIVE</span>
                   </button>
                   
                   {/* ALFABÉTICO */}
                   <div>
                     <button 
                       className={getAccordionHeaderClass(selectedLetter !== null)}
                       onClick={() => setIsAlphabetOpen(!isAlphabetOpen)}
                     >
                       <span className="flex items-center gap-4">
                         <ArrowDownAZ className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-110 group-hover:rotate-[8deg] group-hover:text-red-500" /> 
                         <span>ALFABÉTICO</span>
                       </span>
                       <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isAlphabetOpen ? 'rotate-180' : ''}`} />
                     </button>
                     <div className={`flex flex-wrap gap-1.5 px-5 overflow-hidden transition-all duration-300 ${isAlphabetOpen ? 'max-h-48 opacity-100 mt-3 mb-2' : 'max-h-0 opacity-0'}`}>
                       <button onClick={() => { setSelectedLetter(null); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); }} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${!selectedLetter ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>ALL</button>
                       {ALPHABET.map(l => (
                         <button key={l} onClick={() => { setSelectedLetter(l); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); }} className={`w-7 h-7 rounded-lg text-[11px] font-bold flex items-center justify-center transition-all ${selectedLetter === l ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>{l}</button>
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
                         <CalendarDays className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-110 group-hover:rotate-[8deg] group-hover:text-red-500" /> 
                         <span>ÉPOCAS</span>
                       </span>
                       <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isErasOpen ? 'rotate-180' : ''}`} />
                     </button>
                     <div className={`flex flex-col gap-1 px-5 overflow-hidden transition-all duration-300 ${isErasOpen ? 'max-h-[800px] opacity-100 mt-3 mb-2' : 'max-h-0 opacity-0'}`}>
                       <button onClick={() => { setSelectedYearRange(null); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${!selectedYearRange ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Cualquier Año</button>
                       {YEAR_RANGES.map(range => (
                         <button key={range.label} onClick={() => { setSelectedYearRange(range); setShowHistoryOnly(false); setShowReviewOnly(false); setIsMobileMenuOpen(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${selectedYearRange?.label === range.label ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>{range.label}</button>
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
                         <LayoutGrid className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-110 group-hover:rotate-[8deg] group-hover:text-red-500" /> 
                         <span>CATEGORÍAS</span>
                       </span>
                       <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isCategoriesOpen ? 'rotate-180' : ''}`} />
                     </button>
                     <div className={`flex flex-col gap-1 px-5 overflow-hidden transition-all duration-300 ${isCategoriesOpen ? 'max-h-[3000px] opacity-100 mt-3 mb-2' : 'max-h-0 opacity-0'}`}>
                       {dynamicGenres.map(g => (
                         <button key={g} onClick={() => { setSelectedGenre(g); setShowHistoryOnly(false); setShowReviewOnly(false); setCurrentPage(1); setIsMobileMenuOpen(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all flex justify-between items-center ${selectedGenre === g ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                           <span>{g}</span>
                         </button>
                       ))}
                     </div>
                   </div>
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
                     <HistoryIcon className="w-5 h-5 transition-all duration-300 ease-out group-hover:scale-110 group-hover:rotate-[8deg] group-hover:text-red-500" /> 
                     <span>HISTORY</span>
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
                           onClick={() => setShowPasteModal(true)} 
                           disabled={batchProgress.active} 
                           className={`${getSidebarItemClass(false)} disabled:opacity-50`}
                         >
                           <ClipboardList className="w-5 h-5 transition-colors group-hover:text-red-500" /> 
                           <span>MULTI PEGADO</span>
                         </button>
                         <button 
                           onClick={() => setShowAdminsModal(true)} 
                           className={getSidebarItemClass(false)}
                         >
                           <Users className="w-5 h-5 transition-colors group-hover:text-red-500" /> 
                           <span>GESTIONAR ADMINS</span>
                         </button>
                         <button 
                           onClick={() => { const newVal = !showReviewOnly; setShowReviewOnly(newVal); if (newVal) setShowHistoryOnly(false); }} 
                           className={getReviewSidebarClass(showReviewOnly)}
                         >
                           <AlertTriangle className="w-5 h-5 transition-colors group-hover:text-red-500" /> 
                           <span>PARA REVISIÓN</span>
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
              onClick={() => { setEditForm({ title: "", year: 2026, rating: 0, synopsis: "", cast: [], poster: "", duration: "", script: "", photography: "", music: "", companies: "", originalTitle: "", country: "", genre: "", ageRating: "", format: "", reviews: "", awards: "", director: "", needsReview: false }); setSyncInput(""); setIsAddingNew(true); }} 
              className="relative group overflow-hidden w-full h-14 rounded-xl z-10 flex items-center justify-center p-[2px] transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(180,29,29,0.15)] hover:shadow-[0_0_30px_rgba(180,29,29,0.3)]"
            >
              {/* Repeating animated conic gradient background */}
              <span className="absolute inset-[-400%] bg-[conic-gradient(from_0deg,#b41d1d_0deg,#0a0a0c_90deg,#27272a_180deg,#b41d1d_240deg,#0a0a0c_270deg,#b41d1d_360deg)] animate-[spin_3s_linear_infinite] z-0" />
              
              {/* Inner container to mask and display the premium label */}
              <span className="absolute inset-[1.5px] bg-[#0c0c0e] rounded-[10px] group-hover:bg-[#121215] transition-colors duration-300 z-10 flex items-center justify-center gap-2 text-white font-black uppercase tracking-[0.2em] text-xs">
                <Plus size={16} className="text-[#b41d1d] group-hover:text-white transition-colors duration-300" />
                <span>New Entry</span>
              </span>
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-4 pt-2 cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-colors">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=random`} alt="Avatar" className="w-10 h-10 rounded-full border border-white/10" />
              <div className="flex flex-col overflow-hidden">
                 <span className="text-white font-bold text-xs truncate">{user.displayName || 'Curator Profile'}</span>
                 <span className="text-zinc-500 text-[10px] truncate uppercase tracking-widest">{isAdmin ? 'Admin / Editor' : 'Videoteca Viewer'}</span>
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
      <nav className="md:hidden sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-white/5 p-4 flex flex-row items-center justify-between">
         <div className="flex items-center gap-2 cursor-pointer" onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); clearFiltersAndSearch(); }}>
           <img 
             src="/android-chrome-512x512.png" 
             alt="Videoteca Logo" 
             className="w-10 h-10 rounded-lg object-cover border border-white/10" 
             onError={(e) => {
               (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=128&auto=format&fit=crop&q=60';
             }}
           />
         </div>
         <div className="flex gap-2">
            {isAdmin && <button onClick={() => setShowPasteModal(true)} className="p-2 border border-white/10 rounded-xl"><ClipboardPaste size={18}/></button>}
            {isAdmin && <button onClick={() => { setEditForm({ title: "", year: 2026, rating: 0, synopsis: "", cast: [], poster: "", duration: "", script: "", photography: "", music: "", companies: "", originalTitle: "", country: "", genre: "", ageRating: "", format: "", reviews: "", awards: "", director: "", needsReview: false }); setSyncInput(""); setIsAddingNew(true); }} className="p-2 bg-[#b91c1c] hover:bg-[#dc2626] transition-colors text-white rounded-xl"><Plus size={18}/></button>}
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 border border-white/10 rounded-xl text-zinc-400 hover:text-white"><Menu size={18}/></button>
         </div>
      </nav>

      {/* MAIN LAYOUT */}
      <main 
        ref={mainContentRef as any}
        onMouseMove={handleMainMouseMove as any}
        onMouseLeave={handleMainMouseLeave}
        className="flex-1 overflow-x-hidden overflow-y-auto scroll-smooth relative"
      >
        {!searchTerm && !showHistoryOnly && !showReviewOnly && (!selectedLetter || selectedLetter === "Todos") && selectedGenre !== "Todos" && (
          <CinematicBackground selectedGenre={selectedGenre} />
        )}

      {/* Global Status Overlay */}
      {firestoreError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] max-w-md w-full px-4 animate-in slide-in-from-top-5 duration-300">
          <div className="bg-amber-900/90 backdrop-blur-xl border border-amber-500/50 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 mb-0.5">Estado de Conexión</p>
              <p className="text-[12px] font-bold text-amber-50 text-balance">{firestoreError}</p>
            </div>
            <button onClick={() => setFirestoreError(null)} className="ml-auto p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
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
      {batchProgress.active && (
        <div className="fixed bottom-10 right-10 z-[200] bg-zinc-900 border border-white/10 shadow-2xl rounded-2xl p-6 w-[400px] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-white font-black uppercase tracking-widest text-sm">Lote Activo</h3>
              <p className="text-zinc-400 text-xs mt-1">IA extrayendo datos...</p>
            </div>
            <Loader2 className="w-5 h-5 text-brand-main animate-spin" />
          </div>
          
          <div className="w-full bg-black rounded-full h-2 overflow-hidden border border-white/5">
            <div 
              className="bg-brand-main h-full transition-all duration-300" 
              style={{ width: `${(batchProgress.current / Math.max(1, batchProgress.total)) * 100}%` }}
            />
          </div>
          
          <div className="flex justify-between items-center mt-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            <span className="truncate pr-4 max-w-[250px]">{batchProgress.currentMovie}</span>
            <span className="text-brand-light shrink-0">{batchProgress.current} / {batchProgress.total}</span>
          </div>
        </div>
      )}

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
            <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-zinc-500 mb-6 pl-1 font-sans">
              Convierte texto plano en fichas mágicamente usando IA
            </p>
            
            <div className="relative group w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-2xl p-6 shadow-inner">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full h-80 bg-transparent border-none p-0 text-zinc-100 text-sm font-semibold tracking-normal outline-none focus:ring-0 placeholder-zinc-700 transition-all resize-none font-sans leading-relaxed custom-scrollbar"
                placeholder={`Pega aquí la información de tus películas...\n\nPóster: https://...\nTítulo Videoteca: El Padrino\nAño: 1972\n... (Soporta hasta ${pasteLimit} películas al mismo tiempo)`}
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

      {/* GALERÍA PAGINADA (CUADRÍCULA 7x3) */}
      <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-12 pb-20">
        
        {/* ENCABEZADO DE CATEGORÍA CINEASTA */}
        {!searchTerm && !showHistoryOnly && !showReviewOnly && (!selectedLetter || selectedLetter === "Todos") && selectedGenre !== "Todos" && (
          <div key={selectedGenre} className="mb-10 flex flex-col gap-1 relative pt-4 select-none">

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
              key={`grid-${selectedGenre}-${currentPage}`} 
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12 pt-4"
            >
              {paginatedMovies.map((movie, idx) => (
                <div 
                  key={movie.id} 
                  onClick={() => { setSelectedMovie(movie); setIsEditing(false); setIsDeleting(false); }} 
                  className="group relative flex flex-col gap-3 cursor-pointer animate-in fade-in slide-in-from-bottom-8" 
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="aspect-[2/3] w-full overflow-hidden relative rounded-lg shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/5 transition-all duration-500 group-hover:border-white/20 group-hover:-translate-y-2 group-hover:shadow-[0_20px_50px_rgba(220,38,38,0.15)] bg-zinc-900 shimmer-placeholder">
                    <img 
                      src={movie.poster || DEMO_POSTER} 
                      className="w-full h-full object-cover bg-zinc-900 card-scale-img" 
                      alt={movie.title} 
                      onError={(e: any) => e.target.src = DEMO_POSTER} 
                      loading="lazy"
                    />
                    
                    {/* Gradient Overlay & details trigger */}
                    <div className="absolute inset-0 card-hover-gradient pointer-events-none z-10" />

                    {/* Reveal content on hover */}
                    <div className="absolute inset-0 flex flex-col justify-end p-3.5 reveal-on-hover pointer-events-none z-20">
                      {/* Bottom row: rating only with high-legibility shading */}
                      <div className="flex items-center justify-end w-full">
                        <div className="flex items-center gap-1 text-[12px] text-[#f59e0b] font-bold bg-black/40 px-2 py-1 rounded-md border border-white/5 shadow-[0_2px_8px_rgba(0,0,0,0.2)] backdrop-blur-sm">
                          <Star size={11} fill="currentColor" className="text-[#f59e0b]" />
                          <span>{Number(movie.rating || 0).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>

                    {movie.needsReview && (
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

                  <div className="flex flex-col gap-1 px-1">
                    <h3 className="text-zinc-100 font-medium text-[13px] leading-tight line-clamp-2 group-hover:text-brand-light transition-colors drop-shadow-sm tracking-normal">{toTitleCase(movie.title)}</h3>
                    <div className="flex items-center text-zinc-500 text-[11px] font-semibold tracking-wide gap-2 mt-0.5">
                      <span>{movie.year}</span>
                      <span className="w-1 h-1 rounded-full bg-zinc-700" />
                      <span className="truncate">{movie.director?.split(',')[0] || "Unknown"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-32 px-4 text-center flex flex-col items-center justify-center gap-6 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/5 flex items-center justify-center text-zinc-500 mb-2">
              <Film size={28} />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight leading-snug">
              {searchTerm ? `Sin resultados para "${searchTerm}"` : "No se encontraron obras"}
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
      </div>

      {/* MODAL DETALLES / CATALOGACIÓN */}
      {(selectedMovie || isAddingNew) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/98 backdrop-blur-3xl animate-in fade-in duration-300 overflow-y-auto">
          <div className={`bg-[#050507] border border-[#b41d1d]/20 w-full max-w-7xl rounded-2xl overflow-hidden relative shadow-[0_30px_100px_rgba(0,0,0,0.95),0_0_80px_rgba(180,29,29,0.15)] flex flex-col ${(isEditing || isAddingNew) ? 'md:flex-row-reverse' : 'md:flex-row'} max-h-[95vh] my-auto animate-in zoom-in-95 duration-500`}>
            <button 
              onClick={() => { setSelectedMovie(null); setIsAddingNew(false); setIsEditing(false); setIsDeleting(false); }} 
              className="absolute top-6 right-6 p-2.5 bg-white/5 text-zinc-400 rounded-full z-[110] hover:bg-[#b41d1d]/10 hover:border-[#b41d1d]/80 hover:text-[#b41d1d] transition-all active:scale-95 border border-white/10"
            >
              <X size={20} />
            </button>
            <div className={`w-full md:w-[420px] shrink-0 ${(isEditing || isAddingNew) ? 'bg-[#09090b]/80 backdrop-blur-xl border border-[#b41d1d]/25 md:m-6 m-3 rounded-2xl shadow-[0_0_50px_rgba(180,29,29,0.22)]' : 'bg-[#050505] border-r border-white/5'} relative flex flex-col overflow-hidden transition-all duration-500`}>
              {/* VISOR AUTOMÁTICO DE PÓSTER CON IA - Agregado key reactiva para forzar refresco de imagen */}
              <div className="flex-1 overflow-hidden group relative flex items-center justify-center p-6 bg-black/[0.1]">
                <img 
                  key={(isAddingNew || isEditing) ? editForm.poster : selectedMovie?.poster}
                  src={(isAddingNew || isEditing) ? (editForm.poster || DEMO_POSTER) : (selectedMovie?.poster || DEMO_POSTER)} 
                  className={`w-full max-h-[500px] object-contain transition-all duration-700 cursor-pointer ${
                    isEditing || isAddingNew 
                      ? 'rounded-xl shadow-[0_15px_40px_rgba(0,0,0,0.85)]' 
                      : 'rounded-2xl border border-[#b41d1d]/35 shadow-[0_0_40px_rgba(180,29,29,0.38)]'
                  } opacity-95 group-hover:opacity-100`} 
                  onClick={() => setFullscreenImage((isAddingNew || isEditing) ? (editForm.poster || DEMO_POSTER) : (selectedMovie?.poster || DEMO_POSTER))}
                  alt="Poster Preview" 
                  onError={(e: any) => e.target.src = DEMO_POSTER} 
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
                    <div className="p-2.5 bg-[#b41d1d]/10 border border-[#b41d1d]/30 text-white rounded-xl">
                      <Clapperboard size={20} className="text-[#b41d1d] animate-pulse" />
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-[0.15em] text-white font-sans">{isAddingNew ? "NUEVA ENTRADA DE CINE" : "EDITAR REGISTRO TÉCNICO"}</h2>
                  </div>
                  
                  <div className="bg-white/[0.01] border border-white/[0.05] p-6 rounded-2xl space-y-5 font-sans shadow-lg">
                    <div className="flex items-center gap-3 text-white font-extrabold text-xs uppercase tracking-[0.25em]"><Sparkles size={16} className="text-[#b41d1d]" /> Extracción Inteligente</div>
                    <div className="flex flex-col gap-4">
                      <textarea 
                        placeholder="Pega aquí los datos en bruto..." 
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
                    <EditField label="Duración" value={editForm.duration} onChange={(v: string) => setEditForm({...editForm, duration: v})} />
                    <EditField label="País" value={editForm.country} onChange={(v: string) => setEditForm({...editForm, country: v})} />
                    <EditField label="Clasificación" value={editForm.ageRating} onChange={(v: string) => setEditForm({...editForm, ageRating: v})} />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 pt-6 border-t border-white/5 font-sans font-sans">
                    <EditField label="Dirección" value={editForm.director} onChange={(v: string) => setEditForm({...editForm, director: v})} />
                    <EditField label="Guion" value={editForm.script} onChange={(v: string) => setEditForm({...editForm, script: v})} />
                    <EditField label="Música" value={editForm.music} onChange={(v: string) => setEditForm({...editForm, music: v})} />
                    <EditField label="Fotografía" value={editForm.photography} onChange={(v: string) => setEditForm({...editForm, photography: v})} />
                    <EditField label="Estudio" value={editForm.companies} onChange={(v: string) => setEditForm({...editForm, companies: v})} />
                    <EditField label="Estante" value={editForm.estante} onChange={(v: string) => setEditForm({...editForm, estante: v})} placeholder="Ej: Estante: 6.2" />
                    <EditField label="Formato" value={editForm.format} onChange={(v: string) => setEditForm({...editForm, format: v})} className="col-span-1 sm:col-span-2" />
                  </div>

                  <div className="relative group w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.15] focus-within:border-[#b41d1d] focus-within:ring-1 focus-within:ring-[#b41d1d]/20 focus-within:bg-[#b41d1d]/[0.01] transition-all duration-300 rounded-xl p-4 flex flex-col gap-2 shadow-md">
                    <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-[0.25em] select-none flex items-center gap-2">
                      <Users size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />
                      <span>ELENCO (ACTORES)</span>
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
                        <span>{isAddingNew ? "Guardar Nueva Entrada" : "Actualizar Registro"}</span>
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
                      const colors = getGenrePillClasses(genre);
                      let displayGenre = genre;
                      if (genre.length > 0) {
                        displayGenre = genre.charAt(0).toUpperCase() + genre.slice(1).toLowerCase();
                      }
                      return (
                        <span 
                          key={index}
                          style={{
                            backgroundColor: colors.bg,
                            color: colors.text,
                            borderColor: colors.border,
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            letterSpacing: '0.06em',
                          }}
                          className="border uppercase transition-colors inline-block"
                        >
                          {displayGenre}
                        </span>
                      );
                    })}
                    <span className="text-zinc-400 font-bold text-[10px] tracking-widest flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-md border border-white/5"><Clock size={14} /> {selectedMovie.duration || "N/A"}</span>
                  </div>
                  
                  {/* Title & Prominent Rating Box */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-6">
                    <div className="flex flex-col gap-1">
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
                      <h3 className="text-sm md:text-base text-white/55 font-light tracking-[0.2em]">{selectedMovie.originalTitle}</h3>
                    </div>

                    {/* Prominent Rating Unit */}
                    <div className="flex flex-col items-start md:items-end shrink-0 select-none bg-white/[0.03] border border-white/[0.05] p-3 rounded-2xl md:text-right min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <Star size={24} fill="#f59e0b" className="text-[#f59e0b] -mt-1" />
                        <span className="font-bebas text-[28px] tracking-[0.02em] text-white leading-none">
                          {Number(selectedMovie.rating || 0).toFixed(1)}
                        </span>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mt-1">Calificación</span>
                    </div>
                  </div>
                  
                  {/* Info bar: Premium, cine-themed containers with sleek glassmorphism and custom indicators */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2">
                    <div className="group bg-white/[0.02] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d]/30 hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden">
                      <div className="absolute top-2 right-2 text-zinc-700/60 group-hover:text-[#b41d1d]/40 transition-colors duration-300">
                        <Clapperboard size={14} />
                      </div>
                      <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 font-extrabold">Dirección</span>
                      <span className="text-zinc-100 font-bold text-sm tracking-tight leading-snug pr-2 break-words" title={selectedMovie.director}>{selectedMovie.director}</span>
                    </div>

                    <div className="group bg-white/[0.02] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d]/30 hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden">
                      <div className="absolute top-2 right-2 text-zinc-700/60 group-hover:text-[#b41d1d]/40 transition-colors duration-300">
                        <CalendarDays size={14} />
                      </div>
                      <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 font-extrabold">Año</span>
                      <span className="text-zinc-100 font-bold text-sm tracking-tight pr-4">{selectedMovie.year}</span>
                    </div>

                    <div className="group bg-white/[0.02] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d]/30 hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden">
                      <div className="absolute top-2 right-2 text-zinc-700/60 group-hover:text-[#b41d1d]/40 transition-colors duration-300">
                        <Globe size={14} />
                      </div>
                      <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 font-extrabold">País</span>
                      <span className="text-zinc-100 font-bold text-sm tracking-tight leading-snug pr-2 break-words" title={selectedMovie.country}>{selectedMovie.country}</span>
                    </div>

                    <div className="group bg-white/[0.02] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-1 hover:border-[#b41d1d]/30 hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden">
                      <div className="absolute top-2 right-2 text-zinc-700/60 group-hover:text-[#b41d1d]/40 transition-colors duration-300">
                        <Eye size={14} />
                      </div>
                      <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 font-extrabold">Clasificación</span>
                      <span className="text-zinc-100 font-bold text-sm tracking-tight pr-4">{selectedMovie.ageRating || "No disponible"}</span>
                    </div>
                  </div>
                  
                  {/* Synopsis */}
                  <section className="space-y-4">
                     <h4 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-4"><div className="w-10 h-px bg-white/10" /> SINOPSIS</h4>
                     <p className="text-zinc-300 text-sm md:text-base leading-relaxed font-medium max-w-3xl">{selectedMovie.synopsis}</p>
                  </section>
                  
                  {/* Reviews & Awards with Left borders */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-white/5 border border-l-[3px] border-y-white/5 border-r-white/5 border-l-[#b41d1d] rounded-r-xl p-6 flex flex-col gap-3">
                       <h5 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2"><Quote size={14} className="text-[#b41d1d]"/> Investigación Crítica</h5>
                       <p className="text-sm text-zinc-300 leading-relaxed font-medium">{selectedMovie.reviews}</p>
                     </div>
                     <div className="bg-white/5 border border-l-[3px] border-y-white/5 border-r-white/5 border-l-[#f59e0b] rounded-r-xl p-6 flex flex-col gap-3">
                       <h5 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2"><Trophy size={14} className="text-[#f59e0b]"/> Palmarés Histórico</h5>
                       <p className="text-sm text-zinc-300 leading-relaxed font-medium">{selectedMovie.awards}</p>
                     </div>
                  </div>

                  {/* Tech Specs */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8 pt-8 border-t border-white/5">
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><MonitorPlay size={12} className="text-[#b41d1d]" /> Formato</span><span className="text-zinc-400 font-medium text-xs">{selectedMovie.format}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><ClipboardList size={12} className="text-[#b41d1d]" /> Guion</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.script}>{selectedMovie.script}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Music size={12} className="text-[#b41d1d]" /> Música</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.music}>{selectedMovie.music}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><ImageIcon size={12} className="text-[#b41d1d]" /> Fotografía</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.photography}>{selectedMovie.photography}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Landmark size={12} className="text-[#b41d1d]" /> Estudio</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.companies}>{selectedMovie.companies}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Library size={12} className="text-[#b41d1d]" /> Estante</span><span className="text-zinc-400 font-medium text-xs">{selectedMovie.estante || "N/A"}</span></div>
                    
                    {/* Clickable Cast Section */}
                    <div className="flex flex-col gap-3 col-span-full pt-6 border-t border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><Users size={12} className="text-[#b41d1d]" /> Elenco</span>
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
                            <span>{actor}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="pt-8 border-t border-white/5 flex flex-wrap gap-4 items-center">
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

                      {/* Button: EDITAR */}
                      <button 
                        type="button"
                        onClick={() => { setEditForm(selectedMovie); setIsEditing(true); }} 
                        className="relative group/btn-edit overflow-hidden flex-1 min-w-[150px] h-14 rounded-xl z-10 flex items-center justify-center p-[1px] transition-all duration-300 active:scale-95 shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
                      >
                        {/* Spin border only visible on hover */}
                        <span className="absolute inset-[-400%] bg-[conic-gradient(from_0deg,#b41d1d_0deg,#ffffff_120deg,#0a0a0c_180deg,#b41d1d_240deg,#ffffff_300deg,#b41d1d_360deg)] animate-[spin_4s_linear_infinite] z-0 opacity-0 group-hover/btn-edit:opacity-100 transition-opacity duration-300" />
                        <span className="absolute inset-[1px] bg-[#0c0c0e] rounded-[11px] group-hover/btn-edit:bg-[#121215] border border-white/5 group-hover/btn-edit:border-transparent transition-all duration-300 z-10 flex items-center justify-center gap-2.5 text-zinc-300 group-hover/btn-edit:text-white font-extrabold uppercase tracking-[0.2em] text-[10px] font-sans w-[calc(100%-2px)] h-[calc(100%-2px)]">
                          <Edit2 size={13} className="text-[#b41d1d] group-hover/btn-edit:text-white transition-colors duration-300" /> 
                          <span>EDITAR DE RESEÑA</span>
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
                        className="relative group/btn-delete overflow-hidden h-14 w-14 rounded-xl z-10 flex items-center justify-center p-[1px] transition-all duration-300 active:scale-90 shadow-[0_4px_12px_rgba(180,29,29,0.05)] shrink-0"
                      >
                        {/* Red spine border without white on hover */}
                        <span className="absolute inset-[-400%] bg-[conic-gradient(from_0deg,#b41d1d_0deg,#500a0a_120deg,#000000_180deg,#b41d1d_240deg,#500a0a_300deg,#b41d1d_360deg)] animate-[spin_4s_linear_infinite] z-0 opacity-0 group-hover/btn-delete:opacity-100 transition-opacity duration-300" />
                        <span className="absolute inset-[1px] bg-[#1a0808] group-hover/btn-delete:bg-[#250b0b] rounded-[11px] border border-[#b41d1d]/20 group-hover/btn-delete:border-transparent transition-all duration-300 z-10 flex items-center justify-center text-[#ff4444] group-hover/btn-delete:text-white font-sans w-[calc(100%-2px)] h-[calc(100%-2px)]">
                          <Trash2 size={16} />
                        </span>
                      </button>
                    </div>
                  )}
                  {isDeleting && (
                    <div className="flex flex-col gap-5 p-6 bg-[#b91c1c]/10 border border-[#b91c1c]/20 rounded-xl animate-in zoom-in-95">
                      <div className="flex items-center gap-3 text-red-400"><AlertTriangle size={24} /><h4 className="text-base font-bold uppercase tracking-tight">Confirmar Eliminación</h4></div>
                      <p className="text-zinc-300 text-sm font-medium">¿Estás seguro de que deseas eliminar <span className="text-white font-bold">"{selectedMovie.title}"</span>?</p>
                      <div className="flex gap-3"><button onClick={handleDelete} className="flex-1 bg-[#b91c1c] hover:bg-[#dc2626] text-white font-bold py-3 rounded-lg text-xs uppercase transition-all active:scale-95">ELIMINAR</button><button onClick={() => setIsDeleting(false)} className="flex-1 bg-white/10 text-white font-bold py-3 rounded-lg text-xs uppercase hover:bg-white/20 transition-all active:scale-95">CANCELAR</button></div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* FOOTER (PAGINACIÓN ESTILO PELISPLUS) */}
      <footer className="mt-6 pb-12 px-6 relative z-10 w-full">
        <div className="max-w-7xl mx-auto flex flex-col items-center pt-2 space-y-12">
          
          {/* BOTONES DE PAGINACIÓN */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-6 my-6 font-sans">
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
                          className="relative w-[72px] h-10 flex items-center justify-center group select-none z-20"
                        >
                          <svg 
                            viewBox="0 0 72 40" 
                            className="absolute inset-0 w-full h-full cinema-ticket-glowing transition-all duration-300"
                            fill="#16161a" 
                            stroke="#b41d1d" 
                            strokeWidth="1.5"
                          >
                            <path d="M 6,0 L 66,0 A 6,6 0 0,1 72,6 L 72,13 A 7,7 0 0,0 72,27 L 72,34 A 6,6 0 0,1 66,40 L 6,40 A 6,6 0 0,1 0,34 L 0,27 A 7,7 0 0,0 0,13 L 0,6 A 6,6 0 0,1 6,0 Z" />
                            {/* Perforation lines */}
                            <line x1="15" y1="4" x2="15" y2="36" stroke="#b41d1d" strokeWidth="1.2" strokeDasharray="2,3" opacity="0.45" />
                            <line x1="57" y1="4" x2="57" y2="36" stroke="#b41d1d" strokeWidth="1.2" strokeDasharray="2,3" opacity="0.45" />
                          </svg>
                          <span className="relative z-10 text-white font-black text-sm tracking-normal drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                            {pageNumber}
                          </span>
                        </div>
                      );
                    } else {
                      return (
                        <button 
                          key={pageNumber} 
                          onClick={() => { setCurrentPage(pageNumber); window.scrollTo({ top: 300, behavior: 'smooth' }); }} 
                          className="w-10 h-10 rounded-xl text-xs font-semibold bg-zinc-900/60 border border-white/[0.05] text-zinc-500 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all duration-200 flex items-center justify-center z-20 select-none shadow-md"
                        >
                          {pageNumber}
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
              <p className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-[0.25em] mt-2 select-none">
                TOTAL: <span className="text-white font-black">{filteredMovies.length}</span> PELÍCULAS • PÁGINA <span className="text-[#b41d1d] font-black">{currentPage}</span> DE <span className="text-zinc-400 font-extrabold">{totalPages}</span>
              </p>
            </div>
          )}

          {/* DIVISOR CINTA DE CINE */}
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

          <div className="w-full flex flex-col items-center text-center space-y-10 animate-in fade-in duration-1000">
            {randomQuote ? (
              <>
                <QuoteIcon className="text-brand-main/60 w-12 h-12" />
                <p className="text-lg md:text-xl font-black italic tracking-tighter leading-relaxed text-zinc-100 max-w-2xl px-4">"{randomQuote.text}"</p>
                <div className="flex flex-col items-center gap-2">
                  <div className="h-px w-20 bg-brand-main mb-2 shadow-[0_0_10px_rgba(179,5,0,0.5)]" /><span className="text-brand-main text-[10px] font-black uppercase tracking-[0.5em]">{randomQuote.character}</span><span className="text-zinc-600 text-[9px] font-black uppercase tracking-widest italic">{randomQuote.movie}</span>
                </div>
              </>
            ) : (
               <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin text-zinc-900" size={32} /></div>
            )}
          </div>

          <div className="flex flex-col items-center space-y-8 w-full pt-16 border-t border-white/5 opacity-40">
            <div className="flex flex-col items-center space-y-3">
              <img 
                src="/android-chrome-512x512.png" 
                alt="Videoteca Logo" 
                className="w-12 h-12 rounded-xl object-cover border border-white/10 opacity-80"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=128&auto=format&fit=crop&q=60';
                }}
              />
            </div>
            <p className="text-[8px] font-bold text-zinc-600 tracking-[0.6em] uppercase text-center leading-relaxed">© MMXXVI — VIDEOTECA PROFESIONAL — ALL RIGHTS RESERVED</p>
          </div>
        </div>
      </footer>
      
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
    if (norm.includes('clasific')) return <AlertTriangle size={14} className="text-zinc-500 group-focus-within:text-[#b41d1d] transition-colors duration-300" />;
    if (norm.includes('direcc')) return <User size={14} className="text-[#b41d1d] transition-colors duration-300" />;
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
