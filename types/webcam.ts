/**
 * Shared TypeScript interfaces for all webcam data sources used in World Webcams Map.
 * Import from here rather than redeclaring inline in components.
 */

// ── Windy Webcams API v3 ─────────────────────────────────────────────────────

export interface WindyLocation {
  latitude: number;
  longitude: number;
  country?: string;
  region?: string;
  city?: string;
}

export interface WindyImages {
  current?: {
    preview?: string;
    thumbnail?: string;
  };
}

export interface WindyUrls {
  player?: string;
  webcam?: string;
  detail?: string;
}

export interface WindyWebcam {
  webcamId?: string;
  id?: string;
  title?: string;
  location?: WindyLocation;
  images?: WindyImages;
  urls?: WindyUrls;
  categories?: Array<{ id: string; name: string }>;
}

// ── Skyline (via Apify actor) ────────────────────────────────────────────────

export interface SkylineGps {
  lat: number;
  lon: number;
}

export interface SkylineItem {
  id?: string;
  title?: string;
  url?: string;
  snapshotUrl?: string;
  gps?: SkylineGps;
  town?: string;
  country?: string;
}

// ── EarthCam (static dataset) ────────────────────────────────────────────────

export interface EarthCamItem {
  id: string;
  title: string;
  lat: number;
  lon: number;
  country: string;
  city: string;
  embedUrl: string;
  imageUrl: string;
}

// ── OpenStreetMap / Overpass ──────────────────────────────────────────────────

export interface OsmWebcam {
  id: string;
  title: string;
  lat: number;
  lon: number;
  country?: string;
  city?: string;
  webcamUrl: string;
  operator?: string;
}

// ── Deckchair ────────────────────────────────────────────────────────────────

export interface DeckchairWebcam {
  id: string;
  title: string;
  lat: number;
  lon: number;
  thumbnailUrl: string;
  embedUrl: string;
}

// ── Overpass element (raw API response) ──────────────────────────────────────

export interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

// ── Generic normalised webcam (for future unified layer) ─────────────────────

export type WebcamSource = 'windy' | 'skyline' | 'earthcam' | 'osm' | 'deckchair';

export interface NormalisedWebcam {
  id: string;
  source: WebcamSource;
  title: string;
  lat: number;
  lon: number;
  country?: string;
  city?: string;
  previewUrl?: string;
  linkUrl?: string;
  playerUrl?: string;
}
