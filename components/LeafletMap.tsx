'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import AsiaWebcamsLayer, { ASIA_SOURCES } from './AsiaWebcamsLayer';
import EUTrafficLayer,   { EU_COUNTRIES }  from './EUTrafficLayer';
import WindyLayer from './WindyLayer';
import CamLightbox from './CamLightbox';
import type { CamLightboxEntry } from './CamLightbox';
import type { CountryEntry } from './CountrySearch';
import type {
  SkylineItem,
  EarthCamItem,
  OsmWebcam,
  DeckchairWebcam,
} from '../types/webcam';
import type { SourceKey, FlyToTarget } from './MapClient';

interface TrafficCam {
  id: string; title?: string; lat: number; lon: number;
  country?: string; sourceCountry?: string; city?: string;
  imageUrl?: string; sourceUrl?: string; webcamUrl?: string;
  roadCondition?: string; airTemp?: number; county?: string;
  photoTime?: string; operator?: string;
}
interface AsiaCam {
  id: string; title: string; lat: number; lon: number;
  country?: string; city?: string; sourceCountry?: string;
  imageUrl?: string; sourceUrl?: string;
}

const SOURCE_CONFIG: Record<SourceKey, { label: string; color: string; markerUrl: string }> = {
  windy:     { label: 'Windy',     color: '#60a5fa', markerUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png' },
  sky