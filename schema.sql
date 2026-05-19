CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  "email" TEXT,
  "createdAt" BIGINT,
  "addedBy" TEXT
);

CREATE TABLE IF NOT EXISTS movies (
  id TEXT PRIMARY KEY,
  title TEXT,
  "originalTitle" TEXT,
  "year" INT,
  rating NUMERIC,
  duration TEXT,
  country TEXT,
  director TEXT,
  genre TEXT,
  "ageRating" TEXT,
  streaming TEXT,
  poster TEXT,
  synopsis TEXT,
  "cast" JSONB,
  script TEXT,
  music TEXT,
  photography TEXT,
  companies TEXT,
  reviews TEXT,
  awards TEXT,
  "updatedAt" TIMESTAMPTZ,
  "filmaffinityId" TEXT,
  "tmdbId" TEXT,
  "posterCandidates" JSONB
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  text TEXT,
  author TEXT,
  source TEXT,
  movie TEXT,
  "movieName" TEXT
);
