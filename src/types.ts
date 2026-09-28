export interface Movie {
  id: string;
  title: string;
  originalTitle: string;
  year: number;
  rating: number;
  duration: string;
  country: string;
  director: string;
  genre: string;
  ageRating: string;
  format: string;
  poster: string;
  synopsis: string;
  cast: string[];
  script: string;
  music: string;
  photography: string;
  companies: string;
  reviews: string;
  awards: string;
  updatedAt: string;
  createdAt?: string;
  needsReview?: boolean;
  favoriteOfMonth?: boolean;
  filmaffinityId?: string;
  tmdbId?: string;
  posterCandidates?: string[];
  estante?: string;
  season?: string;
  section?: 'peliculas' | 'centauro' | 'series';
}

export interface Quote {
  text: string;
  movie: string;
  character: string;
}
