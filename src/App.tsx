// Modificaciones completas a App.tsx basadas en el diseño original del usuario
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Film, Star, Clock, User, Calendar, X, Plus, Edit2, Check, Trash2, 
  Sparkles, Loader2, AlertTriangle, Clapperboard, MonitorPlay, Trophy, Quote as QuoteIcon, 
  Zap, ImageIcon, Landmark, History as HistoryIcon, Type, ChevronRight, ChevronLeft, ChevronDown, Globe, 
  DatabaseBackup, LogIn, LogOut, MapPin, Quote, ShieldAlert, Copy, ClipboardPaste, Upload,
  ArrowDownAZ, CalendarDays, LayoutGrid, Users, Menu
} from 'lucide-react';
import { 
  getAdminByEmail, initAuth, signInWithGoogle, logout, onAuthStateChanged,
  subscribeToMovies, subscribeToAdmins, upsertMovie, updateMovie, deleteMovie, upsertAdmin, deleteAdmin,
  fetchMoviesOptimized, fetchAdminsOptimized
} from './lib/firebase';
import { Movie, Quote as QuoteType } from './types';
import { ALPHABET, YEAR_RANGES, DEMO_POSTER } from './constants';
import { catalogMovieAI, fetchIconicQuote } from './lib/aiService';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAutoScrollVertical } from './hooks/useAutoScrollVertical';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState("Todos");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedYearRange, setSelectedYearRange] = useState<{ label: string, start: number, end: number } | null>(null);
  
  // Sidebar Expand/Collapse State
  const [isAlphabetOpen, setIsAlphabetOpen] = useState(false);
  const [isErasOpen, setIsErasOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
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

  const handleManualPosterUpdate = async (newPoster: string) => {
    if (isAddingNew || isEditing) {
      setEditForm({ ...editForm, poster: newPoster });
    } else if (selectedMovie) {
      setSelectedMovie({ ...selectedMovie, poster: newPoster });
      try {
        await upsertMovie({ id: selectedMovie.id, poster: newPoster });
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

      setBatchProgress({ active: true, total: parsedMovies.length, current: 0, currentMovie: "Iniciando guardado..." });

      let skipped: string[] = [];

      for (let i = 0; i < parsedMovies.length; i++) {
        const m = parsedMovies[i];
        
        const isDuplicate = movies.some(existingMovie => 
          existingMovie.title?.toLowerCase().trim() === m.title?.toLowerCase().trim() && 
          existingMovie.year == m.year
        );

        if (isDuplicate) {
          skipped.push(`"${m.title}" (${m.year})`);
          setBatchProgress(p => ({ ...p, current: i + 1, currentMovie: `Omitiendo duplicado: ${m.title}` }));
          await new Promise(r => setTimeout(r, 600));
          continue;
        }

        setBatchProgress(p => ({ ...p, currentMovie: m.title || "Guardando peli..." }));

        if (!m.id) {
          m.id = `mov_${Date.now()}_${i}`;
        }
        
        await upsertMovie({ ...m, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

        setBatchProgress(p => ({ ...p, current: i + 1 }));
        await new Promise(r => setTimeout(r, 600)); // Pequeña pausa visual
      }

      setPastedText("");
      setTimeout(() => {
        setBatchProgress({ active: false, total: 0, current: 0, currentMovie: "" });
        if (skipped.length > 0) {
          alert(`Se procesó el texto, pero las siguientes películas ya estaban en el catálogo y fueron omitidas:\n\n${skipped.join("\n")}`);
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

    let unsubscribeFn: (() => void) | null = null;
    
    // Estrategia 1: Cargar primero desde caché
    const loadData = async () => {
      const cachedMovies = await fetchMoviesOptimized(false);
      if (cachedMovies && cachedMovies.length > 0) {
        setMovies(cachedMovies);
        setFirestoreError(null);
      }
      
      // Estrategia 2: Solo suscribir si la pestaña está visible
      if (!document.hidden && !unsubscribeFn) {
        unsubscribeFn = subscribeToMovies((list) => {
          setMovies(list);
          setFirestoreError(null);
        });
      }
    };

    loadData();

    // Estrategia 2: Desmontaje de Listeners según visibilidad (evitar lecturas fantasma)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (unsubscribeFn) {
          unsubscribeFn();
          unsubscribeFn = null;
          console.log("Pestaña oculta: suscripción a películas pausada");
        }
      } else {
        if (!unsubscribeFn) {
          console.log("Pestaña visible: suscripción a películas reanudada");
          unsubscribeFn = subscribeToMovies((list) => {
            setMovies(list);
            setFirestoreError(null);
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
        unsubscribeFn = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthChecking, user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedGenre, selectedLetter, selectedYearRange, showReviewOnly]);

  const dynamicGenres = useMemo(() => {
    const STANDARD_GENRES = [
      "Acción", "Aventuras", "Animación", "Biografía", "Bélico", "Ciencia Ficción",
      "Comedia", "Crimen", "Documental", "Drama", "Familia", "Fantasía", "Historia", 
      "Misterio", "Musical", "Romance", "Suspense", "Terror", "Thriller", "Western"
    ];
    const foundGenres = new Set<string>(["Drama", "Acción", "Ciencia Ficción", "Terror", "Animación", "Documental"]);
    
    movies.forEach(m => {
      if (!m.genre) return;
      const genreStr = String(m.genre).toLowerCase();
      STANDARD_GENRES.forEach(sg => {
        // Tolerancia para plurales como "Aventuras" -> "aventura"
        const searchWord = sg === "Aventuras" ? "aventura" : sg.toLowerCase();
        if (genreStr.includes(searchWord)) {
          foundGenres.add(sg);
        }
      });
    });
    
    const sorted = Array.from(foundGenres).sort((a, b) => a.localeCompare(b));
    return ["Todos", "Clásico", ...sorted];
  }, [movies]);

  const filteredMovies = useMemo(() => {
    return movies.filter(m => {
      const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/);
      const matchSearch = searchTerms.every(term => {
        if (!term) return true;
        const inTitle = (m.title || "").toLowerCase().includes(term);
        const inOriginalTitle = (m.originalTitle || "").toLowerCase().includes(term);
        const inDirector = (m.director || "").toLowerCase().includes(term);
        const isYearExact = String(m.year) === term;
        return inTitle || inOriginalTitle || inDirector || isYearExact;
      });
      const currentGenreLower = (selectedGenre || "").toLowerCase();
      let matchGenre = selectedGenre === "Todos" || String(m.genre || "").toLowerCase().includes(currentGenreLower);
      
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
    }).sort((a, b) => (b.createdAt || b.updatedAt || "").localeCompare(a.createdAt || a.updatedAt || ""));
  }, [searchTerm, movies, selectedGenre, selectedLetter, selectedYearRange, showReviewOnly]);

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

    const id = isAddingNew ? `mov_${Date.now()}` : (editForm.id || "");
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
        const id = isAddingNew ? `mov_${Date.now()}` : (merged.id || "");
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
    try {
      await deleteMovie(selectedMovie.id);
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
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-center gap-1 cursor-pointer group mx-auto" onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); setSelectedLetter(null); setSelectedYearRange(null); setSelectedGenre("Todos"); setSearchTerm(""); setCurrentPage(1); setIsMobileMenuOpen(false); }}>
              <img src="/logo.svg" alt="Videoteca Logo" className="w-48 h-auto group-hover:scale-105 transition-transform duration-500 mix-blend-lighten rounded-3xl" />
            </div>
            <button className="md:hidden text-white absolute right-8 top-8" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={28} />
            </button>
          </div>

          {/* Search */}
          <div className="relative group shrink-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-white transition-colors" />
            <input type="text" placeholder="Buscar título o año..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if(e.key === 'Enter') setIsMobileMenuOpen(false); }} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:border-zinc-500 transition-all font-semibold placeholder:text-zinc-600" />
          </div>

          {/* Primary Menu & Filters */}
          <nav className="flex flex-col gap-6 shrink-0">
             <button className="flex items-center gap-4 bg-white text-black px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-lg hover:bg-zinc-200 active:scale-95" onClick={() => { setSelectedLetter(null); setSelectedYearRange(null); setSelectedGenre("Todos"); setIsMobileMenuOpen(false); }}><Clapperboard className="w-5 h-5" /> ARCHIVE</button>
             
             {/* ALPHABET */}
             <div>
               <h4 
                 className="flex items-center justify-between text-zinc-400 hover:text-white px-2 font-bold text-[13px] transition-all tracking-wider cursor-pointer uppercase"
                 onClick={() => setIsAlphabetOpen(!isAlphabetOpen)}
               >
                 <span className="flex items-center gap-3"><ArrowDownAZ className="w-4 h-4 text-brand-main" /> ALFABÉTICO</span>
                 <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isAlphabetOpen ? 'rotate-180' : ''}`} />
               </h4>
               <div className={`flex flex-wrap gap-1.5 px-2 overflow-hidden transition-all duration-300 ${isAlphabetOpen ? 'max-h-48 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                 <button onClick={() => { setSelectedLetter(null); setIsMobileMenuOpen(false); }} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${!selectedLetter ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>ALL</button>
                 {ALPHABET.map(l => (
                   <button key={l} onClick={() => { setSelectedLetter(l); setIsMobileMenuOpen(false); }} className={`w-7 h-7 rounded-lg text-[11px] font-bold flex items-center justify-center transition-all ${selectedLetter === l ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>{l}</button>
                 ))}
               </div>
             </div>

             {/* ERAS */}
             <div>
               <h4 
                 className="flex items-center justify-between text-zinc-400 hover:text-white px-2 font-bold text-[13px] transition-all tracking-wider cursor-pointer uppercase"
                 onClick={() => setIsErasOpen(!isErasOpen)}
               >
                 <span className="flex items-center gap-3"><CalendarDays className="w-4 h-4 text-brand-main" /> ÉPOCAS</span>
                 <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isErasOpen ? 'rotate-180' : ''}`} />
               </h4>
               <div className={`flex flex-col gap-1 px-2 overflow-hidden transition-all duration-300 ${isErasOpen ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                 <button onClick={() => { setSelectedYearRange(null); setIsMobileMenuOpen(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${!selectedYearRange ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Cualquier Año</button>
                 {YEAR_RANGES.map(range => (
                   <button key={range.label} onClick={() => { setSelectedYearRange(range); setIsMobileMenuOpen(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${selectedYearRange?.label === range.label ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>{range.label}</button>
                 ))}
               </div>
             </div>

             {/* CATEGORIES */}
             <div>
               <h4 
                 className="flex items-center justify-between text-zinc-400 hover:text-white px-2 font-bold text-[13px] transition-all tracking-wider cursor-pointer uppercase"
                 onClick={() => setIsCategoriesOpen(!isCategoriesOpen)}
               >
                 <span className="flex items-center gap-3"><LayoutGrid className="w-4 h-4 text-brand-main" /> CATEGORÍAS</span>
                 <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isCategoriesOpen ? 'rotate-180' : ''}`} />
               </h4>
               <div className={`flex flex-col gap-1 px-2 overflow-hidden transition-all duration-300 ${isCategoriesOpen ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                 {dynamicGenres.map(g => (
                   <button key={g} onClick={() => { setSelectedGenre(g); setCurrentPage(1); setIsMobileMenuOpen(false); }} className={`text-left px-4 py-2.5 rounded-lg text-xs font-semibold transition-all flex justify-between items-center ${selectedGenre === g ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                     <span>{g}</span>
                   </button>
                 ))}
               </div>
             </div>
          </nav>

          <div className="h-px w-full bg-white/5 shrink-0" />

          {/* Secondary Menu */}
          <nav className="flex flex-col gap-2 shrink-0">
             <button disabled className="flex items-center justify-start gap-4 text-zinc-500/50 cursor-not-allowed px-5 py-3 rounded-2xl font-bold text-sm transition-all"><HistoryIcon className="w-5 h-5" /> HISTORY (Próximamente)</button>
             {isAdmin && (
                <>
                <button onClick={() => setShowPasteModal(true)} disabled={batchProgress.active} className="flex items-center justify-start gap-4 text-zinc-500 hover:text-white hover:bg-white/5 px-5 py-3 rounded-2xl font-bold text-sm transition-all disabled:opacity-50"><ClipboardPaste className="w-5 h-5" /> MULTI PEGADO</button>
                <button onClick={() => setShowAdminsModal(true)} className="flex items-center justify-start gap-4 text-zinc-500 hover:text-white hover:bg-white/5 px-5 py-3 rounded-2xl font-bold text-sm transition-all"><Users className="w-5 h-5" /> GESTIONAR ADMINS</button>
                <button onClick={() => setShowReviewOnly(!showReviewOnly)} className={`flex items-center justify-start gap-4 px-5 py-3 rounded-2xl font-bold text-sm transition-all ${showReviewOnly ? 'text-brand-light bg-red-500/10' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}><AlertTriangle className="w-5 h-5" /> PARA REVISIÓN</button>
                </>
             )}
          </nav>
        </div>

        {/* Action Button & Profile */}
        <div className="p-6 flex flex-col gap-6 mt-auto border-t border-white/5 bg-[#030303] shrink-0">
          {isAdmin && (
            <button onClick={() => { setEditForm({ title: "", year: 2026, rating: 0, synopsis: "", cast: [], poster: "", duration: "", script: "", photography: "", music: "", companies: "", originalTitle: "", country: "", genre: "", ageRating: "", format: "", reviews: "", awards: "", director: "", needsReview: false }); setSyncInput(""); setIsAddingNew(true); }} className="w-full bg-brand-main text-white font-bold px-4 py-4 rounded-xl hover:bg-brand-light transition-all flex items-center justify-center gap-2 text-sm shadow-[0_0_25px_rgba(179,5,0,0.5)] active:scale-95">
              <Plus size={20} /> New Entry
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
                 // BYPASS LOCAL: Faking admin session for Development.
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
         <div className="flex items-center gap-2 cursor-pointer" onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); setSelectedLetter(null); setSelectedYearRange(null); setSelectedGenre("Todos"); setSearchTerm(""); setCurrentPage(1); setIsMobileMenuOpen(false); }}>
           <img src="/logo.svg" alt="Videoteca Logo" className="w-16 h-auto mix-blend-lighten" />
         </div>
         <div className="flex gap-2">
            {isAdmin && <button onClick={() => setShowPasteModal(true)} className="p-2 border border-white/10 rounded-xl"><ClipboardPaste size={18}/></button>}
            {isAdmin && <button onClick={() => { setEditForm({ title: "", year: 2026, rating: 0, synopsis: "", cast: [], poster: "", duration: "", script: "", photography: "", music: "", companies: "", originalTitle: "", country: "", genre: "", ageRating: "", format: "", reviews: "", awards: "", director: "", needsReview: false }); setSyncInput(""); setIsAddingNew(true); }} className="p-2 bg-brand-main text-white rounded-xl"><Plus size={18}/></button>}
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
        <div className="fixed inset-0 z-[300] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-950 border border-white/10 rounded-[2rem] max-w-2xl w-full p-8 shadow-[0_0_150px_rgba(220,38,38,0.15)] flex flex-col relative overflow-hidden">
             <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-red-800 via-red-500 to-red-800 left-0" />
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[var(--color-brand-main)]/20 text-brand-light rounded-xl">
                  <ClipboardPaste size={28} />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Pegado Maestro <span className="text-brand-main">x{pasteLimit}</span></h2>
              </div>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 shrink-0">
                <button onClick={() => setPasteLimit(5)} className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-widest transition-all ${pasteLimit === 5 ? 'bg-brand-main text-white shadow-lg' : 'text-zinc-500 hover:text-white'}`}>x5</button>
                <button onClick={() => setPasteLimit(10)} className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-widest transition-all ${pasteLimit === 10 ? 'bg-brand-main text-white shadow-lg' : 'text-zinc-500 hover:text-white'}`}>x10</button>
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-6">Convierte texto plano en fichas mágicamente usando IA</p>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full h-80 bg-black border border-white/10 rounded-2xl p-6 text-xs text-zinc-300 font-mono focus:outline-none focus:border-brand-main transition-colors resize-none placeholder:text-zinc-700 shadow-inner custom-scrollbar"
              placeholder={`Pega aquí la información de tus películas...\n\nPóster: https://...\nTítulo Videoteca: El Padrino\nAño: 1972\n... (Soporta hasta ${pasteLimit} películas al mismo tiempo)`}
            />
            <div className="flex justify-end gap-4 mt-8">
              <button onClick={() => setShowPasteModal(false)} className="px-8 py-4 text-[10px] uppercase font-black tracking-widest text-zinc-500 hover:text-white transition-colors">Cancelar</button>
              <button 
                onClick={handleProcessPastedText} 
                disabled={!pastedText.trim()} 
                className="px-8 py-4 bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-brand-main hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-black flex items-center gap-2 active:scale-95 shadow-xl"
              >
                <Sparkles size={16} /> Extraer y Guardar
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
      <main className="max-w-7xl mx-auto p-6 md:p-12 pb-20">
        {paginatedMovies.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12 pt-4">
              {paginatedMovies.map((movie, idx) => (
                <div 
                  key={movie.id} 
                  onClick={() => { setSelectedMovie(movie); setIsEditing(false); setIsDeleting(false); }} 
                  className="group relative flex flex-col gap-3 cursor-pointer animate-in fade-in slide-in-from-bottom-8" 
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="aspect-[2/3] w-full overflow-hidden relative rounded-lg shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-white/5 transition-all duration-500 group-hover:border-white/20 group-hover:-translate-y-2 group-hover:shadow-[0_20px_50px_rgba(220,38,38,0.15)]">
                    <img src={movie.poster || DEMO_POSTER} className="w-full h-full object-cover bg-zinc-900 transition-transform duration-700 group-hover:scale-105" alt={movie.title} onError={(e: any) => e.target.src = DEMO_POSTER} />
                    
                    {/* Subtle Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    {/* Badges */}
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-md border border-white/10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 translate-y-2 group-hover:translate-y-0">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span className="text-[11px] font-black text-white">{Number(movie.rating || 0).toFixed(1)}</span>
                    </div>

                    {movie.needsReview && (
                      <div className="absolute top-3 left-3 bg-[var(--color-brand-main)]/90 backdrop-blur-md px-2 py-1.5 rounded-md text-[9px] font-black text-white uppercase tracking-widest flex items-center gap-1 shadow-[0_0_20px_rgba(179,5,0,0.5)]">
                        <AlertTriangle size={10}/> REVISAR
                      </div>
                    )}
                    {movie.year < 1980 && !movie.needsReview && (
                      <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md border border-white/20 px-2 py-1.5 rounded-md text-[9px] font-black text-white uppercase tracking-widest flex items-center gap-1">
                         <Landmark size={10}/> CLÁSICO
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 px-1">
                    <h3 className="text-zinc-100 font-bold text-[13px] leading-tight line-clamp-2 group-hover:text-brand-light transition-colors drop-shadow-sm uppercase">{movie.title}</h3>
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
          <div className="py-40 text-center flex flex-col items-center gap-6 opacity-30"><Film size={64} className="text-zinc-500" /><h2 className="text-2xl font-black uppercase tracking-widest">Sin coincidencias</h2></div>
        )}
      </main>

      {/* MODAL DETALLES / CATALOGACIÓN */}
      {(selectedMovie || isAddingNew) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/98 backdrop-blur-3xl animate-in fade-in duration-300 overflow-y-auto">
          <div className="bg-[#0a0a0a] border border-white/5 w-full max-w-6xl rounded-2xl overflow-hidden relative shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col md:flex-row max-h-[95vh] my-auto animate-in zoom-in-95 duration-500">
            <button onClick={() => { setSelectedMovie(null); setIsAddingNew(false); setIsEditing(false); setIsDeleting(false); }} className="absolute top-6 right-6 p-2.5 bg-white/5 text-zinc-400 rounded-full z-[110] hover:bg-white hover:text-black transition-all active:scale-95 border border-white/10"><X size={20} /></button>
            <div className="w-full md:w-[400px] shrink-0 bg-[#050505] border-r border-white/5 relative flex flex-col overflow-hidden">
              {/* VISOR AUTOMÁTICO DE PÓSTER CON IA - Agregado key reactiva para forzar refresco de imagen */}
              <div className="flex-1 overflow-hidden group relative">
                <img 
                  key={(isAddingNew || isEditing) ? editForm.poster : selectedMovie?.poster}
                  src={(isAddingNew || isEditing) ? (editForm.poster || DEMO_POSTER) : (selectedMovie?.poster || DEMO_POSTER)} 
                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-700 cursor-pointer" 
                  onClick={() => setFullscreenImage((isAddingNew || isEditing) ? (editForm.poster || DEMO_POSTER) : (selectedMovie?.poster || DEMO_POSTER))}
                  alt="Poster Preview" 
                  onError={(e: any) => e.target.src = DEMO_POSTER} 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-black/40 to-transparent pointer-events-none" />
                {/* INDICADOR DE CARGA DE PÓSTER */}
                {(isAddingNew || isEditing) && isSyncing && (
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8 space-y-4 animate-in fade-in duration-500">
                    <Sparkles className="w-10 h-10 text-brand-main animate-bounce" />
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] leading-relaxed">
                      Rastreando dirección de imagen...
                    </p>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="p-6 bg-transparent absolute bottom-0 w-full space-y-4 z-10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2 drop-shadow-md">
                    <ImageIcon size={14} className="text-brand-light"/> URL o Archivo del Póster (Manual)
                  </span>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={isEditing || isAddingNew ? (editForm.poster || "") : (selectedMovie?.poster || "")} 
                      onChange={(e) => handleManualPosterUpdate(e.target.value)} 
                      onKeyDown={(e) => e.stopPropagation()}
                      className="flex-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl py-3 px-4 text-xs font-mono text-zinc-300 outline-none focus:border-brand-main transition-colors shadow-lg" 
                      placeholder="URL del póster..."
                    />
                    <label className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-3 rounded-xl flex items-center justify-center cursor-pointer hover:bg-white hover:text-black transition-all shrink-0 shadow-lg">
                      <Upload size={16} />
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 md:p-14 flex-1 overflow-y-auto custom-scrollbar">
              {isEditing || isAddingNew ? (
                <div className="space-y-12 pb-10">
                  <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                    <div className="px-3 py-1.5 bg-[var(--color-brand-main)]/10 border border-brand-main/20 rounded-md text-brand-light"><HistoryIcon size={18} /></div>
                    <h2 className="text-2xl font-black uppercase tracking-widest text-white">{isAddingNew ? "Nueva Entrada" : "Editar Registro"}</h2>
                  </div>
                  
                  <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5 space-y-6">
                    <div className="flex items-center gap-3 text-brand-light font-black text-xs uppercase tracking-widest"><Sparkles size={16} /> Extracción Inteligente</div>
                    <div className="flex flex-col gap-4">
                      <textarea placeholder="Pega aquí los datos en bruto..." value={syncInput} onChange={(e) => setSyncInput(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm font-mono text-zinc-400 outline-none focus:border-brand-main resize-none" />
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={() => handleSync(false)} disabled={isSyncing || !syncInput} className="flex-1 bg-zinc-800 text-white py-3.5 rounded-xl font-black flex justify-center items-center gap-2 active:scale-95 border border-white/5 hover:bg-zinc-700 transition-colors uppercase text-[10px] tracking-widest shadow-md">{isSyncing ? <><Loader2 className="animate-spin" size={14} /> ANALIZANDO...</> : <><Sparkles size={14} /> EXTRAER</>}</button>
                        <button onClick={() => handleSync(true)} disabled={isSyncing || !syncInput} className="flex-1 bg-brand-main text-white py-3.5 rounded-xl font-black flex justify-center items-center gap-2 active:scale-95 hover:bg-brand-light transition-colors uppercase text-[10px] tracking-widest shadow-lg shadow-[0_0_20px_rgba(179,5,0,0.5)]">{isSyncing ? <><Loader2 className="animate-spin" size={14} /> PROCESANDO...</> : <><Check size={14} /> EXTRAER Y APLICAR</>}</button>
                      </div>
                    </div>
                    {isSyncing && <p className="text-zinc-500 text-[10px] font-black animate-pulse tracking-[0.3em] uppercase">{syncStatus}</p>}
                    {syncError && <p className="text-red-400 text-[11px] font-bold bg-red-500/10 p-4 rounded-xl border border-brand-main/20">{syncError}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                    <EditField label="Título" value={editForm.title} onChange={(v: string) => setEditForm({...editForm, title: v})} />
                    <EditField label="Título Original" value={editForm.originalTitle} onChange={(v: string) => setEditForm({...editForm, originalTitle: v})} />
                    <EditField label="Año" value={editForm.year} onChange={(v: string) => setEditForm({...editForm, year: parseInt(v) || 0})} type="number" />
                    <EditField label="Rating" value={editForm.rating} onChange={(v: string) => setEditForm({...editForm, rating: parseFloat(v) || 0})} type="number" />
                    <EditField label="Género" value={editForm.genre} onChange={(v: string) => setEditForm({...editForm, genre: v})} />
                    <EditField label="Duración" value={editForm.duration} onChange={(v: string) => setEditForm({...editForm, duration: v})} />
                    <EditField label="País" value={editForm.country} onChange={(v: string) => setEditForm({...editForm, country: v})} />
                    <EditField label="Clasificación" value={editForm.ageRating} onChange={(v: string) => setEditForm({...editForm, ageRating: v})} />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-6 border-t border-white/5">
                    <EditField label="Dirección" value={editForm.director} onChange={(v: string) => setEditForm({...editForm, director: v})} />
                    <EditField label="Guion" value={editForm.script} onChange={(v: string) => setEditForm({...editForm, script: v})} />
                    <EditField label="Música" value={editForm.music} onChange={(v: string) => setEditForm({...editForm, music: v})} />
                    <EditField label="Fotografía" value={editForm.photography} onChange={(v: string) => setEditForm({...editForm, photography: v})} />
                    <EditField label="Estudio" value={editForm.companies} onChange={(v: string) => setEditForm({...editForm, companies: v})} />
                    <EditField label="Estante" value={editForm.estante} onChange={(v: string) => setEditForm({...editForm, estante: v})} />
                    <EditField label="Formato" value={editForm.format} onChange={(v: string) => setEditForm({...editForm, format: v})} className="col-span-1 sm:col-span-2" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Elenco</label>
                    <textarea value={Array.isArray(editForm.cast) ? editForm.cast.join(", ") : (editForm.cast || "")} onChange={(e) => setEditForm({...editForm, cast: e.target.value})} onKeyDown={(e) => e.stopPropagation()} className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-zinc-300 outline-none focus:border-brand-main resize-none h-24" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Sinopsis</label>
                    <textarea value={editForm.synopsis || ""} onChange={(e) => setEditForm({...editForm, synopsis: e.target.value})} onKeyDown={(e) => e.stopPropagation()} className="w-full bg-zinc-900/50 border border-white/10 rounded-xl p-5 text-sm h-40 resize-none font-medium text-zinc-300 outline-none focus:border-brand-main" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Reseñas</label>
                      <textarea value={editForm.reviews || ""} onChange={(e) => setEditForm({...editForm, reviews: e.target.value})} onKeyDown={(e) => e.stopPropagation()} className="w-full bg-zinc-900/50 border border-white/10 rounded-xl p-4 text-sm h-32 resize-none outline-none focus:border-brand-main text-zinc-300" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Premios</label>
                      <textarea value={editForm.awards || ""} onChange={(e) => setEditForm({...editForm, awards: e.target.value})} onKeyDown={(e) => e.stopPropagation()} className="w-full bg-zinc-900/50 border border-white/10 rounded-xl p-4 text-sm h-32 resize-none outline-none focus:border-brand-main text-zinc-300" />
                    </div>
                  </div>

                  <button onClick={handleSave} className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-zinc-200 transition-all uppercase tracking-widest active:scale-95 flex items-center justify-center gap-2 mt-4 text-sm shadow-xl"><Check size={18} /> {isAddingNew ? "Guardar Nueva Entrada" : "Actualizar Registro"}</button>
                </div>
              ) : selectedMovie ? (
                /* VISTA DETALLADA */
                <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-700 pb-10">
                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="bg-[var(--color-brand-main)]/10 text-brand-light border border-brand-main/20 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest">{selectedMovie.genre}</span>
                    <span className="text-zinc-400 font-bold text-[10px] tracking-widest flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-md border border-white/5"><Clock size={14} /> {selectedMovie.duration || "N/A"}</span>
                    <div className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-md text-[10px] font-black tracking-widest ml-auto flex items-center gap-1.5"><Star size={14} fill="currentColor"/> {Number(selectedMovie.rating || 0).toFixed(1)}</div>
                  </div>
                  
                  {/* Title */}
                  <div className="flex flex-col gap-1">
                     <h2 className="text-4xl md:text-6xl font-black uppercase leading-[0.9] tracking-tighter drop-shadow-lg text-white">{selectedMovie.title}</h2>
                     <h3 className="text-sm md:text-base text-zinc-500 font-bold uppercase tracking-[0.2em]">{selectedMovie.originalTitle}</h3>
                  </div>
                  
                  {/* Info bar */}
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-6 border-y border-white/5">
                     <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black">Dirección</span><span className="text-zinc-200 font-bold text-sm">{selectedMovie.director}</span></div>
                     <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black">Año</span><span className="text-zinc-200 font-bold text-sm">{selectedMovie.year}</span></div>
                     <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black">País</span><span className="text-zinc-200 font-bold text-sm">{selectedMovie.country}</span></div>
                     <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black">Clasificación</span><span className="text-zinc-200 font-bold text-sm">{selectedMovie.ageRating}</span></div>
                  </div>
                  
                  {/* Synopsis */}
                  <section className="space-y-4">
                     <h4 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-4"><div className="w-10 h-px bg-white/10" /> SINOPSIS</h4>
                     <p className="text-zinc-300 text-sm md:text-base leading-relaxed font-medium max-w-3xl">{selectedMovie.synopsis}</p>
                  </section>
                  
                  {/* Reviews & Awards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-white/5 border border-white/5 rounded-xl p-6 flex flex-col gap-3">
                       <h5 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2"><Quote size={14} className="text-brand-light"/> Investigación Crítica</h5>
                       <p className="text-sm text-zinc-300 leading-relaxed font-medium">{selectedMovie.reviews}</p>
                     </div>
                     <div className="bg-white/5 border border-white/5 rounded-xl p-6 flex flex-col gap-3">
                       <h5 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Palmarés Histórico</h5>
                       <p className="text-sm text-zinc-300 leading-relaxed font-medium">{selectedMovie.awards}</p>
                     </div>
                  </div>

                  {/* Tech Specs */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8 pt-8 border-t border-white/5">
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><MonitorPlay size={12} className="text-brand-main" /> Formato</span><span className="text-zinc-400 font-medium text-xs">{selectedMovie.format}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5">Guion</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.script}>{selectedMovie.script}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5">Música</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.music}>{selectedMovie.music}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5">Fotografía</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.photography}>{selectedMovie.photography}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5">Estudio</span><span className="text-zinc-400 font-medium text-xs truncate" title={selectedMovie.companies}>{selectedMovie.companies}</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5"><DatabaseBackup size={12} className="text-zinc-500" /> Estante</span><span className="text-zinc-400 font-medium text-xs">{selectedMovie.estante || "N/A"}</span></div>
                    
                    <div className="flex flex-col gap-1 col-span-full pt-4 border-t border-white/5"><span className="text-[10px] uppercase tracking-widest text-zinc-600 font-black flex items-center gap-1.5">Elenco</span><span className="text-zinc-400 font-medium text-xs leading-relaxed">{Array.isArray(selectedMovie.cast) ? selectedMovie.cast.join(", ") : selectedMovie.cast}</span></div>
                  </div>

                  {isAdmin && (
                    <div className="pt-8 border-t border-white/5 flex flex-wrap gap-4">
                      <button onClick={(e) => handleToggleReview(selectedMovie, e)} className={`flex-1 min-w-[200px] border font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-3 text-xs active:scale-95 shadow-sm ${selectedMovie.needsReview ? 'bg-brand-main text-white border-brand-main' : 'bg-white/5 border-white/10 text-white hover:bg-white hover:text-black'}`}>
                        <AlertTriangle size={16} /> {selectedMovie.needsReview ? 'QUIRAR REVISIÓN' : 'MARCAR REVISIÓN'}
                      </button>
                      <button onClick={() => { setEditForm(selectedMovie); setIsEditing(true); }} className="flex-1 min-w-[150px] bg-white text-black font-bold py-3.5 rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 text-xs active:scale-95 shadow-md">
                        <Edit2 size={16} /> EDITAR
                      </button>
                      <button onClick={handleCopyFicha} className="bg-white/5 border border-white/10 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 text-xs active:scale-95 shadow-sm">
                        {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />} 
                      </button>
                      <button onClick={() => setIsDeleting(true)} className="p-3.5 bg-[var(--color-brand-main)]/10 text-brand-light hover:bg-brand-main hover:text-white rounded-xl transition-all active:scale-90 border border-brand-main/20 shadow-sm">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                  {isDeleting && (
                    <div className="flex flex-col gap-5 p-6 bg-[var(--color-brand-main)]/10 border border-brand-main/20 rounded-xl animate-in zoom-in-95">
                      <div className="flex items-center gap-3 text-brand-light"><AlertTriangle size={24} /><h4 className="text-base font-bold uppercase tracking-tight">Confirmar Eliminación</h4></div>
                      <p className="text-zinc-300 text-sm font-medium">¿Estás seguro de que deseas eliminar <span className="text-white font-bold">"{selectedMovie.title}"</span>?</p>
                      <div className="flex gap-3"><button onClick={handleDelete} className="flex-1 bg-brand-main text-white font-bold py-3 rounded-lg text-xs uppercase hover:bg-brand-light transition-all active:scale-95">ELIMINAR</button><button onClick={() => setIsDeleting(false)} className="flex-1 bg-white/10 text-white font-bold py-3 rounded-lg text-xs uppercase hover:bg-white/20 transition-all active:scale-95">CANCELAR</button></div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* FOOTER (PAGINACIÓN ESTILO PELISPLUS) */}
      <footer className="mt-20 pb-12 px-6 border-t border-white/5 relative z-10 w-full">
        <div className="max-w-7xl mx-auto flex flex-col items-center pt-16 space-y-16">
          
          {/* BOTONES DE PAGINACIÓN */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-8">
              <div className="flex flex-wrap justify-center items-center gap-2">
                <button 
                  onClick={() => { if(currentPage > 1) { setCurrentPage(currentPage - 1); window.scrollTo({ top: 300, behavior: 'smooth' }); }}}
                  disabled={currentPage === 1}
                  className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-brand-main transition-all disabled:opacity-20"
                ><ChevronLeft size={20} /></button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => {
                  if (pageNumber === 1 || pageNumber === totalPages || (pageNumber >= currentPage - 2 && pageNumber <= currentPage + 2)) {
                    return (
                      <button key={pageNumber} onClick={() => { setCurrentPage(pageNumber); window.scrollTo({ top: 300, behavior: 'smooth' }); }} className={`w-10 h-10 rounded-lg text-xs font-black transition-all border flex items-center justify-center ${currentPage === pageNumber ? "bg-brand-main text-white border-brand-light shadow-[0_0_25px_rgba(179,5,0,0.5)] scale-110" : "bg-white/5 border-white/10 text-zinc-500 hover:text-white hover:bg-white/10"}`}>{pageNumber}</button>
                    );
                  }
                  if (pageNumber === currentPage - 3 || pageNumber === currentPage + 3) {
                    return <span key={pageNumber} className="text-zinc-700 px-1">...</span>;
                  }
                  return null;
                })}
                <button 
                  onClick={() => { if(currentPage < totalPages) { setCurrentPage(currentPage + 1); window.scrollTo({ top: 300, behavior: 'smooth' }); }}}
                  disabled={currentPage === totalPages}
                  className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-brand-main transition-all disabled:opacity-20"
                ><ChevronRight size={20} /></button>
              </div>
              <p className="text-[9px] font-black text-zinc-700 uppercase tracking-[0.3em]">Total: {filteredMovies.length} Películas • Página {currentPage} de {totalPages}</p>
            </div>
          )}

          {/* DIVISOR CINTA DE CINE */}
          <div className="w-full h-12 opacity-80 my-12">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="film-strip" x="0" y="0" width="80" height="48" patternUnits="userSpaceOnUse">
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
            <div className="flex flex-col items-center space-y-3"><img src="/logo.svg" alt="Videoteca Logo" className="w-32 h-auto object-contain opacity-80 mix-blend-lighten" /></div>
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

const EditField = ({ label, value, onChange, type = "text", className = "" }: any) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">{label}</label>
    <input type={type} step={type === "number" ? "0.1" : undefined} value={value || ""} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand-main outline-none transition-all font-medium text-zinc-300" />
  </div>
);

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
    let unsubscribeFn: (() => void) | null = null;
    
    // Estrategia 1: Cargar primero desde caché
    const loadAdmins = async () => {
      const cachedAdmins = await fetchAdminsOptimized(false);
      if (cachedAdmins && cachedAdmins.length > 0) {
        setAdmins(cachedAdmins);
      }
      
      // Estrategia 2: Solo suscribir si la pestaña está visible
      if (!document.hidden && !unsubscribeFn) {
        unsubscribeFn = subscribeToAdmins((list) => {
          setAdmins(list);
        });
      }
    };

    loadAdmins();

    // Estrategia 2: Desmontaje de Listeners según visibilidad
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (unsubscribeFn) {
          unsubscribeFn();
          unsubscribeFn = null;
        }
      } else {
        if (!unsubscribeFn) {
          unsubscribeFn = subscribeToAdmins((list) => {
            setAdmins(list);
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
        unsubscribeFn = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleAdd = async (e: any) => {
    e.preventDefault();
    if (!newEmail.trim() || !currentUser || !isSuper) return;
    setLoading(true);
    setError("");
    try {
      const email = newEmail.trim().toLowerCase();
      
      await upsertAdmin({
        email,
        createdAt: new Date().toISOString(),
        addedBy: currentUser.id, // Supabase user.id
        name: email.split('@')[0],
        photoURL: "",
        role: newRole
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
                   <button onClick={confirmDelete} disabled={loading} className="flex-1 bg-brand-main hover:bg-brand-light text-white text-xs font-bold py-1.5 rounded disabled:opacity-50 transition-colors">Confirmar</button>
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
