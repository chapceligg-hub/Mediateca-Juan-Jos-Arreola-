-- Script para crear las tablas necesarias en Supabase
-- Copia y pega esto en el SQL Editor de tu proyecto de Supabase

-- 1. Tabla de Películas
CREATE TABLE IF NOT EXISTS public.movies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    "originalTitle" TEXT,
    year INTEGER,
    rating DECIMAL,
    duration TEXT,
    country TEXT,
    director TEXT,
    genre TEXT,
    "ageRating" TEXT,
    format TEXT,
    poster TEXT,
    synopsis TEXT,
    "cast" JSONB DEFAULT '[]'::jsonb,
    script TEXT,
    music TEXT,
    photography TEXT,
    companies TEXT,
    reviews TEXT,
    awards TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "needsReview" BOOLEAN DEFAULT FALSE,
    "filmaffinityId" TEXT,
    "tmdbId" TEXT,
    "posterCandidates" JSONB DEFAULT '[]'::jsonb,
    estante TEXT
);

-- 2. Tabla de Administradores
CREATE TABLE IF NOT EXISTS public.admins (
    email TEXT PRIMARY KEY,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "addedBy" TEXT,
    name TEXT,
    "photoURL" TEXT,
    role TEXT DEFAULT 'editor'
);

-- Habilitar Realtime para ambas tablas
ALTER PUBLICATION supabase_realtime ADD TABLE public.movies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admins;

-- Configurar Políticas de Seguridad (RLS)
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de películas" ON public.movies FOR SELECT USING (true);
CREATE POLICY "Escritura para todos (temporal para la migración)" ON public.movies FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Lectura pública de admins" ON public.admins FOR SELECT USING (true);
CREATE POLICY "Escritura para todos (temporal para la migración)" ON public.admins FOR ALL USING (true) WITH CHECK (true);
