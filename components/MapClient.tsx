'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { GlobeCam } from './GlobeView';
import { ASIA_SOURCES } from './AsiaWebcamsLayer';
import { EU_COUNTRIES } from './EUTrafficLayer';
import CountrySearch from './CountrySearch';
import type { CountryEntry } from './CountrySearch';
import type {
  SkylineItem,
  EarthCamItem,
  OsmWebcam,
  DeckchairWebcam,
  WindyWebcam,
} from '../types/webcam';

const GlobeView = dynamic(() => import('./GlobeView'), {
  ssr: false,
  loading: () => <Splash text="Initialising globe…" />,
});
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <Splash text="Loading map…" />,
});

function Splash({ text }: { text: string }) {
  return (
    <div style={{
      height: '100vh', width: '100vw',
      display: 'grid', placeItems: 'center',
      background: '#04080f', color: 'rgba(0,220,100,0.8)',
      fontFamily: 'monospace', fontSize: 14, letterSpacing: '0.15em',
    }}>
      {text}
    </div>
  );
}

export type SourceKey = 'windy' | 'skyline' | 'earthcam' | 'osm' | 'deckchair';

export const SOURCE_COLORS: Record<SourceKey, string> = {
  windy:     '#60a5fa',
  skyline:   '#f87171',
  earthcam:  '#fb923c',
  osm:       '#4ade80',
  deckchair: '#c084fc',
};

const EU_GLOBE_COLOR   = '#818cf8';
const ASIA_GLOBE_COLOR = '#fbbf24';

function toArray<T>(val: unknown): T[] { return Array.isArray(val) ? (val as T[]) : []; }

export interface FlyToTarget { lat: number; lon: number; zoom?: number; }

interface TrafficCam {
  id: string; title?: string; lat: number; lon: number;
  country?: string; sourceCountry?: string; city?: string;
}
interface AsiaCam {
  id: string; title: string; lat: number; lon: number;
  country?: string; city?: string; sourceCountry?: string;
}

// ─── Country centroids (ISO-3166-1 alpha-2) ─────────────────────────────────
const COUNTRY_CENTROIDS: Record<string, { name: string; lat: number; lon: number }> = {
  AD:{name:'Andorra',lat:42.55,lon:1.60},AE:{name:'United Arab Emirates',lat:23.42,lon:53.85},
  AF:{name:'Afghanistan',lat:33.93,lon:67.71},AG:{name:'Antigua and Barbuda',lat:17.06,lon:-61.80},
  AL:{name:'Albania',lat:41.15,lon:20.17},AM:{name:'Armenia',lat:40.07,lon:45.04},
  AO:{name:'Angola',lat:-11.20,lon:17.87},AR:{name:'Argentina',lat:-38.42,lon:-63.62},
  AT:{name:'Austria',lat:47.52,lon:14.55},AU:{name:'Australia',lat:-25.27,lon:133.78},
  AZ:{name:'Azerbaijan',lat:40.14,lon:47.58},BA:{name:'Bosnia and Herzegovina',lat:43.92,lon:17.68},
  BB:{name:'Barbados',lat:13.19,lon:-59.54},BD:{name:'Bangladesh',lat:23.68,lon:90.36},
  BE:{name:'Belgium',lat:50.50,lon:4.47},BF:{name:'Burkina Faso',lat:12.36,lon:-1.53},
  BG:{name:'Bulgaria',lat:42.73,lon:25.49},BH:{name:'Bahrain',lat:26.02,lon:50.55},
  BI:{name:'Burundi',lat:-3.37,lon:29.92},BJ:{name:'Benin',lat:9.31,lon:2.32},
  BN:{name:'Brunei',lat:4.54,lon:114.73},BO:{name:'Bolivia',lat:-16.29,lon:-63.59},
  BR:{name:'Brazil',lat:-14.24,lon:-51.93},BS:{name:'Bahamas',lat:25.03,lon:-77.40},
  BT:{name:'Bhutan',lat:27.51,lon:90.43},BW:{name:'Botswana',lat:-22.33,lon:24.68},
  BY:{name:'Belarus',lat:53.71,lon:28.05},BZ:{name:'Belize',lat:17.19,lon:-88.50},
  CA:{name:'Canada',lat:56.13,lon:-106.35},CD:{name:'DR Congo',lat:-4.04,lon:21.76},
  CF:{name:'Central African Republic',lat:6.61,lon:20.94},CG:{name:'Republic of Congo',lat:-0.23,lon:15.83},
  CH:{name:'Switzerland',lat:46.82,lon:8.23},CI:{name:'Ivory Coast',lat:7.54,lon:-5.55},
  CL:{name:'Chile',lat:-35.68,lon:-71.54},CM:{name:'Cameroon',lat:3.85,lon:11.50},
  CN:{name:'China',lat:35.86,lon:104.20},CO:{name:'Colombia',lat:4.57,lon:-74.30},
  CR:{name:'Costa Rica',lat:9.75,lon:-83.75},CU:{name:'Cuba',lat:21.52,lon:-77.78},
  CV:{name:'Cape Verde',lat:16.54,lon:-23.04},CY:{name:'Cyprus',lat:35.13,lon:33.43},
  CZ:{name:'Czech Republic',lat:49.82,lon:15.47},DE:{name:'Germany',lat:51.17,lon:10.45},
  DJ:{name:'Djibouti',lat:11.83,lon:42.59},DK:{name:'Denmark',lat:56.26,lon:9.50},
  DM:{name:'Dominica',lat:15.41,lon:-61.37},DO:{name:'Dominican Republic',lat:18.74,lon:-70.16},
  DZ:{name:'Algeria',lat:28.03,lon:1.66},EC:{name:'Ecuador',lat:-1.83,lon:-78.18},
  EE:{name:'Estonia',lat:58.60,lon:25.01},EG:{name:'Egypt',lat:26.82,lon:30.80},
  ER:{name:'Eritrea',lat:15.18,lon:39.78},ES:{name:'Spain',lat:40.46,lon:-3.75},
  ET:{name:'Ethiopia',lat:9.15,lon:40.49},FI:{name:'Finland',lat:61.92,lon:25.75},
  FJ:{name:'Fiji',lat:-16.58,lon:179.41},FR:{name:'France',lat:46.23,lon:2.21},
  GA:{name:'Gabon',lat:-0.80,lon:11.61},GB:{name:'United Kingdom',lat:55.38,lon:-3.44},
  GD:{name:'Grenada',lat:12.12,lon:-61.68},GE:{name:'Georgia',lat:42.32,lon:43.36},
  GH:{name:'Ghana',lat:7.95,lon:-1.02},GM:{name:'Gambia',lat:13.44,lon:-15.31},
  GN:{name:'Guinea',lat:9.95,lon:-11.41},GQ:{name:'Equatorial Guinea',lat:1.65,lon:10.27},
  GR:{name:'Greece',lat:39.07,lon:21.82},GT:{name:'Guatemala',lat:15.78,lon:-90.23},
  GW:{name:'Guinea-Bissau',lat:11.80,lon:-15.18},GY:{name:'Guyana',lat:4.86,lon:-58.93},
  HN:{name:'Honduras',lat:15.20,lon:-86.24},HR:{name:'Croatia',lat:45.10,lon:15.20},
  HT:{name:'Haiti',lat:18.97,lon:-72.29},HU:{name:'Hungary',lat:47.16,lon:19.50},
  ID:{name:'Indonesia',lat:-0.79,lon:113.92},IE:{name:'Ireland',lat:53.41,lon:-8.24},
  IL:{name:'Israel',lat:31.05,lon:34.85},IN:{name:'India',lat:20.59,lon:78.96},
  IQ:{name:'Iraq',lat:33.22,lon:43.68},IR:{name:'Iran',lat:32.43,lon:53.69},
  IS:{name:'Iceland',lat:64.96,lon:-19.02},IT:{name:'Italy',lat:41.87,lon:12.57},
  JM:{name:'Jamaica',lat:18.11,lon:-77.30},JO:{name:'Jordan',lat:30.59,lon:36.24},
  JP:{name:'Japan',lat:36.20,lon:138.25},KE:{name:'Kenya',lat:-0.02,lon:37.91},
  KG:{name:'Kyrgyzstan',lat:41.20,lon:74.77},KH:{name:'Cambodia',lat:12.57,lon:104.99},
  KI:{name:'Kiribati',lat:-3.37,lon:-168.73},KM:{name:'Comoros',lat:-11.88,lon:43.87},
  KN:{name:'Saint Kitts and Nevis',lat:17.36,lon:-62.78},KP:{name:'North Korea',lat:40.34,lon:127.51},
  KR:{name:'South Korea',lat:35.91,lon:127.77},KW:{name:'Kuwait',lat:29.31,lon:47.48},
  KZ:{name:'Kazakhstan',lat:48.02,lon:66.92},LA:{name:'Laos',lat:19.86,lon:102.50},
  LB:{name:'Lebanon',lat:33.85,lon:35.86},LC:{name:'Saint Lucia',lat:13.91,lon:-60.98},
  LI:{name:'Liechtenstein',lat:47.14,lon:9.55},LK:{name:'Sri Lanka',lat:7.87,lon:80.77},
  LR:{name:'Liberia',lat:6.43,lon:-9.43},LS:{name:'Lesotho',lat:-29.61,lon:28.23},
  LT:{name:'Lithuania',lat:55.17,lon:23.88},LU:{name:'Luxembourg',lat:49.82,lon:6.13},
  LV:{name:'Latvia',lat:56.88,lon:24.60},LY:{name:'Libya',lat:26.34,lon:17.23},
  MA:{name:'Morocco',lat:31.79,lon:-7.09},MC:{name:'Monaco',lat:43.73,lon:7.40},
  MD:{name:'Moldova',lat:47.41,lon:28.37},ME:{name:'Montenegro',lat:42.71,lon:19.37},
  MG:{name:'Madagascar',lat:-18.77,lon:46.87},MK:{name:'North Macedonia',lat:41.61,lon:21.75},
  ML:{name:'Mali',lat:17.57,lon:-3.99},MM:{name:'Myanmar',lat:21.91,lon:95.96},
  MN:{name:'Mongolia',lat:46.86,lon:103.85},MR:{name:'Mauritania',lat:21.01,lon:-10.94},
  MT:{name:'Malta',lat:35.94,lon:14.38},MU:{name:'Mauritius',lat:-20.35,lon:57.55},
  MV:{name:'Maldives',lat:3.20,lon:73.22},MW:{name:'Malawi',lat:-13.25,lon:34.30},
  MX:{name:'Mexico',lat:23.63,lon:-102.55},MY:{name:'Malaysia',lat:4.21,lon:108.0},
  MZ:{name:'Mozambique',lat:-18.67,lon:35.53},NA:{name:'Namibia',lat:-22.96,lon:18.49},
  NE:{name:'Niger',lat:17.61,lon:8.08},NG:{name:'Nigeria',lat:9.08,lon:8.68},
  NI:{name:'Nicaragua',lat:12.87,lon:-85.21},NL:{name:'Netherlands',lat:52.13,lon:5.29},
  NO:{name:'Norway',lat:60.47,lon:8.47},NP:{name:'Nepal',lat:28.39,lon:84.12},
  NR:{name:'Nauru',lat:-0.53,lon:166.93},NZ:{name:'New Zealand',lat:-40.90,lon:174.89},
  OM:{name:'Oman',lat:21.51,lon:55.92},PA:{name:'Panama',lat:8.54,lon:-80.78},
  PE:{name:'Peru',lat:-9.19,lon:-75.02},PG:{name:'Papua New Guinea',lat:-6.31,lon:143.96},
  PH:{name:'Philippines',lat:12.88,lon:121.77},PK:{name:'Pakistan',lat:30.38,lon:69.35},
  PL:{name:'Poland',lat:51.92,lon:19.14},PT:{name:'Portugal',lat:39.40,lon:-8.22},
  PW:{name:'Palau',lat:7.52,lon:134.58},PY:{name:'Paraguay',lat:-23.44,lon:-58.44},
  QA:{name:'Qatar',lat:25.35,lon:51.18},RO:{name:'Romania',lat:45.94,lon:24.97},
  RS:{name:'Serbia',lat:44.02,lon:21.01},RU:{name:'Russia',lat:61.52,lon:105.32},
  RW:{name:'Rwanda',lat:-1.94,lon:29.87},SA:{name:'Saudi Arabia',lat:23.89,lon:45.08},
  SB:{name:'Solomon Islands',lat:-9.65,lon:160.16},SC:{name:'Seychelles',lat:-4.68,lon:55.49},
  SD:{name:'Sudan',lat:12.86,lon:30.22},SE:{name:'Sweden',lat:60.13,lon:18.64},
  SG:{name:'Singapore',lat:1.35,lon:103.82},SH:{name:'Saint Helena',lat:-24.14,lon:-10.03},
  SI:{name:'Slovenia',lat:46.15,lon:14.99},SK:{name:'Slovakia',lat:48.67,lon:19.70},
  SL:{name:'Sierra Leone',lat:8.46,lon:-11.78},SM:{name:'San Marino',lat:43.94,lon:12.46},
  SN:{name:'Senegal',lat:14.50,lon:-14.45},SO:{name:'Somalia',lat:5.15,lon:46.20},
  SR:{name:'Suriname',lat:3.92,lon:-56.03},SS:{name:'South Sudan',lat:6.88,lon:31.31},
  ST:{name:'São Tomé and Príncipe',lat:0.19,lon:6.61},SV:{name:'El Salvador',lat:13.79,lon:-88.90},
  SY:{name:'Syria',lat:34.80,lon:38.99},SZ:{name:'Eswatini',lat:-26.52,lon:31.47},
  TD:{name:'Chad',lat:15.45,lon:18.73},TG:{name:'Togo',lat:8.62,lon:0.82},
  TH:{name:'Thailand',lat:15.87,lon:100.99},TJ:{name:'Tajikistan',lat:38.86,lon:71.28},
  TL:{name:'Timor-Leste',lat:-8.87,lon:125.73},TM:{name:'Turkmenistan',lat:38.97,lon:59.56},
  TN:{name:'Tunisia',lat:33.89,lon:9.54},TO:{name:'Tonga',lat:-21.18,lon:-175.20},
  TR:{name:'Turkey',lat:38.96,lon:35.24},TT:{name:'Trinidad and Tobago',lat:10.69,lon:-61.22},
  TV:{name:'Tuvalu',lat:-7.11,lon:177.64},TZ:{name:'Tanzania',lat:-6.37,lon:34.89},
  UA:{name:'Ukraine',lat:48.38,lon:31.17},UG:{name:'Uganda',lat:1.37,lon:32.29},
  US:{name:'United States',lat:37.09,lon:-95.71},UY:{name:'Uruguay',lat:-32.52,lon:-55.77},
  UZ:{name:'Uzbekistan',lat:41.38,lon:64.59},VA:{name:'Vatican City',lat:41.90,lon:12.45},
  VC:{name:'Saint Vincent and the Grenadines',lat:12.98,lon:-61.29},VE:{name:'Venezuela',lat:6.42,lon:-66.59},
  VN:{name:'Vietnam',lat:14.06,lon:108.28},VU:{name:'Vanuatu',lat:-15.38,lon:166.96},
  WS:{name:'Samoa',lat:-13.76,lon:-172.10},YE:{name:'Yemen',lat:15.55,lon:48.52},
  ZA:{name:'South Africa',lat:-30.56,lon:22.94},ZM:{name:'Zambia',lat:-13.13,lon:27.85},
  ZW:{name:'Zimbabwe',lat:-19.02,lon:29.15},
};

function toCode(raw?: string): string {
  if (!raw) return '';
  const up = raw.trim().toUpperCase();
  if (up.length === 2 && COUNTRY_CENTROIDS[up]) return up;
  for (const [code, c] of Object.entries(COUNTRY_CENTROIDS)) {
    if (c.name.toLowerCase() === raw.trim().toLowerCase()) return code;
  }
  return up;
}

const SEED_CAMS: GlobeCam[] = [
  { lat: 48.86,  lon: 2.35,    title: 'Paris — Eiffel Tower',    color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 51.50,  lon: -0.13,   title: 'London — Westminster',    color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 40.71,  lon: -74.01,  title: 'New York — Times Square', color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 35.68,  lon: 139.69,  title: 'Tokyo — Shibuya',         color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat:  1.35,  lon: 103.82,  title: 'Singapore — Marina Bay',  color: SOURCE_COLORS.skyline,   source: 'skyline'   },
  { lat: -33.87, lon: 151.21,  title: 'Sydney — Harbour Bridge', color: SOURCE_COLORS.earthcam,  source: 'earthcam'  },
  { lat: 55.75,  lon: 37.62,   title: 'Moscow — Red Square',     color: SOURCE_COLORS.osm,       source: 'osm'       },
  { lat: 25.20,  lon: 55.27,   title: 'Dubai — Downtown',        color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: -23.55, lon: -46.63,  title: 'São Paulo',               color: SOURCE_COLORS.osm,       source: 'osm'       },
  { lat: 19.43,  lon: -99.13,  title: 'Mexico City',             color: SOURCE_COLORS.osm,       source: 'osm'       },
  { lat: 28.61,  lon: 77.21,   title: 'New Delhi',               color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: -1.29,  lon: 36.82,   title: 'Nairobi',                 color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: 37.57,  lon: 126.98,  title: 'Seoul — Gangnam',         color: SOURCE_COLORS.skyline,   source: 'skyline'   },
  { lat: 41.01,  lon: 28.98,   title: 'Istanbul',                color: SOURCE_COLORS.deckchair, source: 'deckchair' },
  { lat: 59.33,  lon: 18.07,   title: 'Stockholm',               color: SOURCE_COLORS.osm,       source: 'osm'       },
];

function camCountry(c: {country?:string;sourceCountry?:string}) {
  return c.sourceCountry ?? c.country ?? '';
}

// Build a lightbox-ready GlobeCam from a Windy webcam object
function windyToGlobeCam(c: WindyWebcam): GlobeCam {
  const lat = c.location!.latitude;
  const lon = c.location!.longitude;
  // Windy player embed: https://webcams.windy.com/webcams/{id}/player
  const id = c.id ?? (c as unknown as Record<string,unknown>).webcamId;
  const embedUrl = id ? `https://webcams.windy.com/webcams/${id}/player` : undefined;
  const imageUrl = c.image?.current?.preview ?? c.image?.sizes?.large?.url;
  return {
    lat, lon,
    title: c.title ?? 'Windy',
    color: SOURCE_COLORS.windy,
    source: 'windy',
    embedUrl,
    imageUrl,
    linkUrl: id ? `https://www.windy.com/webcams/${id}` : undefined,
  };
}

export default function MapClient() {
  const [mode, setMode] = useState<'globe' | 'map'>('globe');

  const [visible, setVisible] = useState<Record<SourceKey, boolean>>(
    { windy: true, skyline: true, earthcam: true, osm: true, deckchair: true }
  );
  const [euVisible, setEuVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(EU_COUNTRIES).map(k => [k, true]))
  );
  const [asiaVisible, setAsiaVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(ASIA_SOURCES).map(k => [k, true]))
  );

  const [skylineCams,    setSkylineCams]    = useState<SkylineItem[]>([]);
  const [earthCams,      setEarthCams]      = useState<EarthCamItem[]>([]);
  const [osmCams,        setOsmCams]        = useState<OsmWebcam[]>([]);
  const [deckCams,       setDeckCams]       = useState<DeckchairWebcam[]>([]);
  const [euCams,         setEuCams]         = useState<TrafficCam[]>([]);
  const [asiaCams,       setAsiaCams]       = useState<AsiaCam[]>([]);
  const [windyGlobeCams, setWindyGlobeCams] = useState<WindyWebcam[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [errors,         setErrors]         = useState<string[]>([]);

  const [windyMapCount, setWindyMapCount] = useState(0);
  const [asiaCount,     setAsiaCount]     = useState(0);
  const [euCount,       setEuCount]       = useState(0);

  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);

  // ─── Country filter ──────────────────────────────────────────────────────
  const [countryFilter, setCountryFilter] = useState<CountryEntry | null>(null);

  const windyMapCountRef = useRef(windyMapCount);
  const handleWindyCount = useCallback((n: number) => {
    if (n !== windyMapCountRef.current) { windyMapCountRef.current = n; setWindyMapCount(n); }
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true); setErrors([]);
      const errs: string[] = [];
      const safe = async (label: string, fn: () => Promise<void>) => {
        try { await fn(); } catch (e: unknown) { errs.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
      };
      await Promise.all([
        safe('Skyline', async () => {
          const r = await fetch('/api/skyline-webcams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
          const j = await r.json();
          if (!r.ok) errs.push(`Skyline: ${j?.error ?? r.statusText}`); else setSkylineCams(toArray(j));
        }),
        safe('EarthCam', async () => {
          const r = await fetch('/api/earthcam');
          const j = await r.json();
          if (!r.ok) errs.push(`EarthCam: ${j?.error ?? r.statusText}`); else setEarthCams(toArray(j));
        }),
        safe('OSM', async () => {
          const r = await fetch('/api/overpass-webcams');
          const j = await r.json();
          if (!r.ok) errs.push(`OSM: ${j?.error ?? r.statusText}`); else setOsmCams(toArray(j));
        }),
        safe('Deckchair', async () => {
          const r = await fetch('/api/deckchair');
          const j = await r.json();
          if (!r.ok) errs.push(`Deckchair: ${j?.error ?? r.statusText}`); else setDeckCams(toArray(j));
        }),
        safe('EU', async () => {
          const countries = Object.keys(EU_COUNTRIES).join(',');
          const r = await fetch(`/api/eu-traffic?countries=${countries}`);
          const j = await r.json();
          if (!r.ok) errs.push(`EU: ${j?.error ?? r.statusText}`);
          else {
            const arr = (toArray<TrafficCam>(j)).filter(
              c => c.lat && c.lon && isFinite(c.lat) && isFinite(c.lon)
            );
            setEuCams(arr);
          }
        }),
        safe('Asia', async () => {
          const [sg, tourism] = await Promise.all([
            fetch('/api/asia-traffic/singapore').then(r => r.json()).catch(() => []),
            fetch('/api/asia-tourism').then(r => r.json()).catch(() => []),
          ]);
          const sgArr   = toArray<AsiaCam>(Array.isArray(sg) ? sg : (sg?.cameras ?? []));
          const tourArr = toArray<AsiaCam>(tourism);
          const all = [...sgArr, ...tourArr].filter(
            c => c.lat && c.lon && isFinite(c.lat) && isFinite(c.lon) && c.title?.trim()
          );
          setAsiaCams(all);
        }),
        safe('WindyGlobe', async () => {
          const bbox = encodeURIComponent('90,180,-90,-180');
          const r = await fetch(`/api/windy-webcams?bbox=${bbox}&limit=50`);
          const j = await r.json();
          if (j?.missingKey || !r.ok) return;
          const list: WindyWebcam[] = Array.isArray(j) ? j
            : Array.isArray(j?.webcams) ? j.webcams : [];
          setWindyGlobeCams(
            list.filter(c =>
              c.location?.latitude != null &&
              c.location?.longitude != null &&
              isFinite(c.location.latitude) &&
              isFinite(c.location.longitude)
            )
          );
        }),
      ]);
      setErrors(errs); setLoading(false);
    };
    fetchAll();
  }, []);

  // ─── Build country list from all loaded cam data ─────────────────────────
  const countryList: CountryEntry[] = useMemo(() => {
    const counts: Record<string, { name: string; lat: number; lon: number; count: number }> = {};
    const addCode = (raw?: string) => {
      if (!raw) return;
      const code = toCode(raw);
      if (!code) return;
      const centroid = COUNTRY_CENTROIDS[code];
      if (!centroid) return;
      if (!counts[code]) counts[code] = { name: centroid.name, lat: centroid.lat, lon: centroid.lon, count: 0 };
      counts[code].count++;
    };
    for (const c of skylineCams)    addCode(camCountry(c));
    for (const c of earthCams)      addCode(camCountry(c));
    for (const c of osmCams)        addCode(camCountry(c));
    for (const c of deckCams)       addCode(camCountry(c));
    for (const c of euCams)         addCode(camCountry(c));
    for (const c of asiaCams)       addCode(camCountry(c));
    for (const c of windyGlobeCams) addCode(c.location?.country ?? '');
    return Object.entries(counts)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [skylineCams, earthCams, osmCams, deckCams, euCams, asiaCams, windyGlobeCams]);

  // ─── Country select: on globe → rotate to it; on map → fly to it ─────────
  const handleCountrySelect = useCallback((entry: CountryEntry | null) => {
    setCountryFilter(entry);
    if (entry) {
      if (mode === 'map') {
        setFlyTo({ lat: entry.lat, lon: entry.lon, zoom: 6 });
      }
      // On globe: GlobeView watches countryFilter and calls rotateTo internally
    }
  }, [mode]);

  // ─── Filter cam arrays when a country is active ──────────────────────────
  const matchCountry = useCallback((raw?: string) => {
    if (!countryFilter) return true;
    if (!raw) return false;
    const code = toCode(raw);
    return code === countryFilter.code ||
      raw.toLowerCase() === countryFilter.name.toLowerCase();
  }, [countryFilter]);

  const filteredSkyline = useMemo(() => countryFilter ? skylineCams.filter(c => matchCountry(camCountry(c))) : skylineCams,  [skylineCams,  matchCountry, countryFilter]);
  const filteredEarth   = useMemo(() => countryFilter ? earthCams.filter(c => matchCountry(camCountry(c)))   : earthCams,    [earthCams,    matchCountry, countryFilter]);
  const filteredOsm     = useMemo(() => countryFilter ? osmCams.filter(c => matchCountry(camCountry(c)))     : osmCams,      [osmCams,      matchCountry, countryFilter]);
  const filteredDeck    = useMemo(() => countryFilter ? deckCams.filter(c => matchCountry(camCountry(c)))    : deckCams,     [deckCams,     matchCountry, countryFilter]);
  const filteredEu      = useMemo(() => countryFilter ? euCams.filter(c => matchCountry(camCountry(c)))      : euCams,       [euCams,       matchCountry, countryFilter]);
  const filteredAsia    = useMemo(() => countryFilter ? asiaCams.filter(c => matchCountry(camCountry(c)))    : asiaCams,     [asiaCams,     matchCountry, countryFilter]);

  const globeCams: GlobeCam[] = useMemo(() => {
    const cams: GlobeCam[] = [];
    if (visible.windy)
      for (const c of windyGlobeCams) {
        if (countryFilter && !matchCountry(c.location?.country ?? '')) continue;
        cams.push(windyToGlobeCam(c));
      }
    if (visible.skyline)
      for (const c of filteredSkyline)
        if (c.lat && c.lon)
          cams.push({
            lat: c.lat, lon: c.lon,
            title: c.title ?? 'Skyline',
            color: SOURCE_COLORS.skyline, source: 'skyline',
            imageUrl: c.thumbnail ?? c.image,
            linkUrl: c.url,
          });
    if (visible.earthcam)
      for (const c of filteredEarth)
        if (c.lat && c.lon)
          cams.push({
            lat: c.lat, lon: c.lon,
            title: c.title ?? 'EarthCam',
            color: SOURCE_COLORS.earthcam, source: 'earthcam',
            embedUrl: c.embedUrl ?? c.liveUrl,
            linkUrl: c.url,
          });
    if (visible.osm)
      for (const c of filteredOsm)
        if (c.lat && c.lon)
          cams.push({
            lat: c.lat, lon: c.lon,
            title: c.title ?? c.name ?? 'OSM',
            color: SOURCE_COLORS.osm, source: 'osm',
            embedUrl: c.url,
          });
    if (visible.deckchair)
      for (const c of filteredDeck)
        if (c.lat && c.lon)
          cams.push({
            lat: c.lat, lon: c.lon,
            title: c.title ?? 'Deckchair',
            color: SOURCE_COLORS.deckchair, source: 'deckchair',
            embedUrl: c.embedUrl,
            imageUrl: c.thumbnail,
            linkUrl: c.url,
          });
    for (const c of filteredEu) {
      const key = (c.sourceCountry ?? c.country ?? 'EU') in EU_COUNTRIES ? (c.sourceCountry ?? c.country ?? 'EU') : 'EU';
      if (euVisible[key] === false) continue;
      cams.push({
        lat: c.lat, lon: c.lon,
        title: c.title ?? 'EU Traffic',
        color: EU_GLOBE_COLOR, source: 'eu',
        embedUrl: (c as unknown as Record<string,string>).sourceUrl,
        imageUrl: (c as unknown as Record<string,string>).imageUrl,
      });
    }
    for (const c of filteredAsia) {
      const key = c.sourceCountry ?? c.country ?? 'SG';
      if (asiaVisible[key] === false) continue;
      cams.push({
        lat: c.lat, lon: c.lon,
        title: c.title ?? 'Asia cam',
        color: ASIA_GLOBE_COLOR, source: 'asia',
        embedUrl: (c as unknown as Record<string,string>).sourceUrl,
        imageUrl: (c as unknown as Record<string,string>).imageUrl,
      });
    }
    return cams.length > 0 ? cams : SEED_CAMS.filter(c => visible[c.source as SourceKey] !== false);
  }, [windyGlobeCams, filteredSkyline, filteredEarth, filteredOsm, filteredDeck, filteredEu, filteredAsia, visible, euVisible, asiaVisible, countryFilter, matchCountry]);

  // Globe cam click: open lightbox (handled inside GlobeView) or fly to map
  const handleGlobeCamClick = useCallback((cam: GlobeCam) => {
    // If no embeddable content, switch to map and fly to cam location
    if (!cam.embedUrl && !cam.imageUrl) {
      setFlyTo({ lat: cam.lat, lon: cam.lon, zoom: 13 });
      setMode('map');
    }
    // Otherwise GlobeView opens its own lightbox — nothing to do here
  }, []);

  const grandTotal = windyMapCount + filteredSkyline.length + filteredEarth.length + filteredOsm.length + filteredDeck.length + asiaCount + euCount;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* Globe */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: mode === 'globe' ? 1 : 0,
        pointerEvents: mode === 'globe' ? 'auto' : 'none',
        transition: 'opacity 0.45s ease',
        zIndex: mode === 'globe' ? 2 : 1,
      }}>
        <GlobeView
          cams={globeCams}
          totalCount={grandTotal}
          loading={loading}
          errors={errors}
          visible={visible}
          euVisible={euVisible}
          asiaVisible={asiaVisible}
          onToggleSource={(k) => setVisible(v => ({ ...v, [k]: !v[k as SourceKey] }))}
          onToggleEu={(k)   => setEuVisible(v => ({ ...v, [k]: !v[k] }))}
          onToggleAsia={(k) => setAsiaVisible(v => ({ ...v, [k]: !v[k] }))}
          onEnterMap={() => setMode('map')}
          onCamClick={handleGlobeCamClick}
          countryFilter={countryFilter}
          onClearFilter={() => handleCountrySelect(null)}
        />
      </div>

      {/* Leaflet map */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: mode === 'map' ? 1 : 0,
        pointerEvents: mode === 'map' ? 'auto' : 'none',
        transition: 'opacity 0.45s ease',
        zIndex: mode === 'map' ? 2 : 1,
      }}>
        <LeafletMap
          skylineCams={filteredSkyline}
          earthCams={filteredEarth}
          osmCams={filteredOsm}
          deckCams={filteredDeck}
          euCams={filteredEu}
          asiaCams={filteredAsia}
          visible={visible}
          euVisible={euVisible}
          asiaVisible={asiaVisible}
          loading={loading}
          errors={errors}
          onWindyCount={handleWindyCount}
          onAsiaCount={setAsiaCount}
          onEuCount={setEuCount}
          onToggleSource={(k) => setVisible(v => ({ ...v, [k]: !v[k as SourceKey] }))}
          onToggleEu={(k)   => setEuVisible(v => ({ ...v, [k]: !v[k] }))}
          onToggleAsia={(k) => setAsiaVisible(v => ({ ...v, [k]: !v[k] }))}
          flyTo={flyTo}
          onFlyToDone={() => setFlyTo(null)}
          countryFilter={countryFilter}
          onClearFilter={() => handleCountrySelect(null)}
        />
      </div>

      {/* Mode toggle */}
      <button
        onClick={() => setMode(m => m === 'globe' ? 'map' : 'globe')}
        title={mode === 'globe' ? 'Switch to flat map' : 'Switch to globe'}
        style={{
          position: 'fixed', top: 14, left: 14, zIndex: 3000,
          padding: '7px 14px',
          background: 'rgba(4,14,10,0.88)',
          border: '1px solid rgba(0,200,90,0.45)',
          borderRadius: 7,
          color: 'rgba(0,220,100,0.95)',
          fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.1em',
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,40,25,0.95)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(4,14,10,0.88)')}
      >
        {mode === 'globe' ? '🗺 MAP' : '🌐 GLOBE'}
      </button>

      {/* Country search — visible in BOTH globe and map modes */}
      <CountrySearch
        countries={countryList}
        selected={countryFilter}
        onSelect={handleCountrySelect}
      />
    </div>
  );
}
