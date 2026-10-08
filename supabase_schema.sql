-- ======================================================================
-- ESQUEMA DE BASE DE DATOS SUPABASE - VIDEOTECA PROFESIONAL
-- 4 TABLAS: peliculas, series, centauro, settings
-- Totalmente idempotente (se puede ejecutar múltiples veces sin error)
-- ======================================================================

-- 1. TABLA: peliculas
CREATE TABLE IF NOT EXISTS public.peliculas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    "originalTitle" TEXT DEFAULT '',
    year INTEGER DEFAULT 0,
    rating NUMERIC DEFAULT 0,
    duration TEXT DEFAULT '',
    country TEXT DEFAULT '',
    director TEXT DEFAULT '',
    genre TEXT DEFAULT '',
    "ageRating" TEXT DEFAULT '',
    format TEXT DEFAULT '',
    poster TEXT DEFAULT '',
    synopsis TEXT DEFAULT '',
    "cast" JSONB DEFAULT '[]'::jsonb,
    script TEXT DEFAULT '',
    music TEXT DEFAULT '',
    photography TEXT DEFAULT '',
    companies TEXT DEFAULT '',
    reviews TEXT DEFAULT '',
    awards TEXT DEFAULT '',
    estante TEXT DEFAULT '',
    season TEXT DEFAULT '',
    section TEXT DEFAULT 'peliculas',
    "needsReview" BOOLEAN DEFAULT false,
    "favoriteOfMonth" BOOLEAN DEFAULT false,
    "filmaffinityId" TEXT DEFAULT '',
    "tmdbId" TEXT DEFAULT '',
    "posterCandidates" JSONB DEFAULT '[]'::jsonb,
    "isLatestSaved" BOOLEAN DEFAULT false,
    "latestSavedAt" TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT '',
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: series
CREATE TABLE IF NOT EXISTS public.series (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    "originalTitle" TEXT DEFAULT '',
    year INTEGER DEFAULT 0,
    rating NUMERIC DEFAULT 0,
    duration TEXT DEFAULT '',
    country TEXT DEFAULT '',
    director TEXT DEFAULT '',
    genre TEXT DEFAULT '',
    "ageRating" TEXT DEFAULT '',
    format TEXT DEFAULT '',
    poster TEXT DEFAULT '',
    synopsis TEXT DEFAULT '',
    "cast" JSONB DEFAULT '[]'::jsonb,
    script TEXT DEFAULT '',
    music TEXT DEFAULT '',
    photography TEXT DEFAULT '',
    companies TEXT DEFAULT '',
    reviews TEXT DEFAULT '',
    awards TEXT DEFAULT '',
    estante TEXT DEFAULT '',
    season TEXT DEFAULT '',
    section TEXT DEFAULT 'series',
    "needsReview" BOOLEAN DEFAULT false,
    "favoriteOfMonth" BOOLEAN DEFAULT false,
    "filmaffinityId" TEXT DEFAULT '',
    "tmdbId" TEXT DEFAULT '',
    "posterCandidates" JSONB DEFAULT '[]'::jsonb,
    "isLatestSaved" BOOLEAN DEFAULT false,
    "latestSavedAt" TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT '',
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA: centauro
CREATE TABLE IF NOT EXISTS public.centauro (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    "originalTitle" TEXT DEFAULT '',
    year INTEGER DEFAULT 0,
    rating NUMERIC DEFAULT 0,
    duration TEXT DEFAULT '',
    country TEXT DEFAULT '',
    director TEXT DEFAULT '',
    genre TEXT DEFAULT '',
    "ageRating" TEXT DEFAULT '',
    format TEXT DEFAULT '',
    poster TEXT DEFAULT '',
    synopsis TEXT DEFAULT '',
    "cast" JSONB DEFAULT '[]'::jsonb,
    script TEXT DEFAULT '',
    music TEXT DEFAULT '',
    photography TEXT DEFAULT '',
    companies TEXT DEFAULT '',
    reviews TEXT DEFAULT '',
    awards TEXT DEFAULT '',
    estante TEXT DEFAULT '',
    season TEXT DEFAULT '',
    section TEXT DEFAULT 'centauro',
    "needsReview" BOOLEAN DEFAULT false,
    "favoriteOfMonth" BOOLEAN DEFAULT false,
    "filmaffinityId" TEXT DEFAULT '',
    "tmdbId" TEXT DEFAULT '',
    "posterCandidates" JSONB DEFAULT '[]'::jsonb,
    "isLatestSaved" BOOLEAN DEFAULT false,
    "latestSavedAt" TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT '',
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: settings (Persistencia de claves y control de sincronización)
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valores iniciales para settings
INSERT INTO public.settings (key, value)
VALUES 
    ('auth', '{"masterKey": "AdminMaster2026#", "editorPin": "123456"}'::jsonb),
    ('sync', '{"lastUpdated": "2026-10-08T00:00:00.000Z", "action": "init"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ======================================================================
-- ÍNDICES DE RENDIMIENTO (Búsqueda rápida y sincronización delta)
-- ======================================================================
CREATE INDEX IF NOT EXISTS idx_peliculas_updated_at ON public.peliculas ("updatedAt");
CREATE INDEX IF NOT EXISTS idx_peliculas_year ON public.peliculas (year);
CREATE INDEX IF NOT EXISTS idx_peliculas_title ON public.peliculas (title);

CREATE INDEX IF NOT EXISTS idx_series_updated_at ON public.series ("updatedAt");
CREATE INDEX IF NOT EXISTS idx_series_year ON public.series (year);
CREATE INDEX IF NOT EXISTS idx_series_title ON public.series (title);

CREATE INDEX IF NOT EXISTS idx_centauro_updated_at ON public.centauro ("updatedAt");
CREATE INDEX IF NOT EXISTS idx_centauro_year ON public.centauro (year);
CREATE INDEX IF NOT EXISTS idx_centauro_title ON public.centauro (title);

-- ======================================================================
-- POLÍTICAS DE SEGURIDAD (ROW LEVEL SECURITY - RLS)
-- ======================================================================
ALTER TABLE public.peliculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centauro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para peliculas
DROP POLICY IF EXISTS "Lectura publica peliculas" ON public.peliculas;
CREATE POLICY "Lectura publica peliculas" ON public.peliculas
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Escritura peliculas" ON public.peliculas;
CREATE POLICY "Escritura peliculas" ON public.peliculas
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Políticas para series
DROP POLICY IF EXISTS "Lectura publica series" ON public.series;
CREATE POLICY "Lectura publica series" ON public.series
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Escritura series" ON public.series;
CREATE POLICY "Escritura series" ON public.series
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. Políticas para centauro
DROP POLICY IF EXISTS "Lectura publica centauro" ON public.centauro;
CREATE POLICY "Lectura publica centauro" ON public.centauro
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Escritura centauro" ON public.centauro;
CREATE POLICY "Escritura centauro" ON public.centauro
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Políticas para settings
DROP POLICY IF EXISTS "Lectura publica settings sync" ON public.settings;
CREATE POLICY "Lectura publica settings sync" ON public.settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Escritura settings" ON public.settings;
CREATE POLICY "Escritura settings" ON public.settings
    FOR ALL TO public USING (true) WITH CHECK (true);

-- ======================================================================
-- ACTIVAR PUBLICACIÓN EN TIEMPO REAL (SUPABASE REALTIME)
-- ======================================================================
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.peliculas;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.series;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.centauro;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;
