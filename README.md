# 🌍 World Webcams Map

Explore public webcam locations on a rotating globe or an interactive map.
Built with **Next.js 15, React, React-Leaflet, D3 Geo, and TopoJSON**.

## Explore your next view

- **Globe & map:** drag to rotate, pause/resume rotation, or switch to the map.
  Globe code and low-resolution country boundaries are bundled locally—no
  third-party script CDN is required. Source-colored map pins are self-contained
  SVGs, too. CARTO map tiles still need internet access.
- **Camera explorer:** search place names or sources, try **Surprise me**, and
  locate a camera on the map. Discovery respects country and source filters.
- **Saved views:** star cameras to keep them in your browser. The Saved tab is
  independent of discovery filters. Favorites stay on your device; no account
  is required. If storage is blocked, they last for the current session only.
- **Source health:** see which sources loaded, timed out, need configuration,
  or returned partial results. Refresh one provider or all providers. Previously
  loaded results remain available if a refresh fails.
- **Accessible viewer:** keyboard-friendly modal with Escape dismissal and
  restored focus. Switch between player and snapshot when both are available;
  retry failed snapshots or open the provider website.
- **Country search:** accent-insensitive matching and ISO country codes. Use
  Up/Down to navigate, Enter to select, and Escape to dismiss without clearing
  the current filter. Use the clear button to remove it.

Camera counts describe **listed locations**, not verified live streams. Provider
websites can restrict embedding, change URLs, or go offline. An empty selection
stays empty; the app does not substitute demo markers.

## Getting started

Requires **Node.js 22.12 or newer** (Node 22 LTS recommended).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Most sources need no key. Add an optional
`WINDY_WEBCAMS_API_KEY` to `.env.local` to enable Windy. No Apify token is used.
Never commit `.env.local` or real credentials.

## Data sources & routes

| Route | Method | Data | Key |
|---|---|---|---|
| `/api/windy-webcams` | GET | Windy API v3; accepts `bbox=north,east,south,west` and a positive integer `limit` (capped at 50) | Optional Windy key |
| `/api/skyline-webcams` | POST | Legacy route name; now public OSM webcam links, **not** a Skyline/Apify scraper | None |
| `/api/earthcam` | GET | Curated EarthCam locations | None |
| `/api/overpass-webcams` | GET | OSM nodes with public webcam URLs; mirrored Overpass queries | None |
| `/api/deckchair` | GET | Curated scenic webcam links; not a live Deckchair API | None |
| `/api/eu-traffic` | GET | Country-provider aggregation; optional `countries=PT,FR,...` | None |
| `/api/asia-tourism` | GET | Curated Asian tourism webcam links | None |
| `/api/asia-traffic` | GET | Country-provider aggregation; optional `countries=SG,JP,KR,TW,TH` | None |

The explorer loads Singapore traffic and Asian tourism separately. Other Asian
traffic endpoints are available through the aggregate API. Traffic aggregators
invoke local provider handlers directly rather than making HTTP requests back to
the incoming host. Partial failures are identified in the
`X-Webcam-Failed-Countries` response header; complete failures return an error.
The legacy community route excludes mapped surveillance locations without a
public webcam link.

## Reliability

- Initial sources load independently, with a 35-second client deadline and
  per-source cancellation. A slow provider does not block usable results.
- Source refreshes cancel older work and ignore late responses.
- Windy map requests are viewport-aware, debounced by 600 ms, and cancelled on
  disable/unmount. Coordinates at zero are valid. Unwrapped longitudes are
  normalized; dateline-crossing viewports use the full longitude range because
  the upstream bounding box cannot span the dateline.
- A missing Windy key is a configuration state, not an error.
- Globe markers on the hidden hemisphere are neither drawn nor clickable.
  Automatic rotation respects reduced-motion preferences and stops on selection.

## Development checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:watch
npm run build
```

GitHub Actions runs lint, type checking, tests, and a production build on pushes
and pull requests. Tests mock providers and require no keys or live feeds. They
cover favorites, source loading/cancellation, geographic validation, API
validation, partial failures, search, and viewer lifecycle. Native dialog focus
containment is browser-provided; unit tests use a dialog shim.

## Structure

- `components/MapClient.tsx` — filters, source data, view switching, explorer
- `components/GlobeView.tsx` — canvas globe, camera drawer, rotation
- `components/LeafletMap.tsx` — map layers and source controls
- `components/CameraExplorer.tsx` — discovery, local favorites, source health
- `components/CamLightbox.tsx` — player/snapshot modal
- `hooks/useWebcamFeeds.ts` — progressive source loading and refresh
- `lib/` — geographic validation, persistence parsing, metadata, aggregation
- `app/api/` — source adapters and curated location datasets
- `tests/` — component, hook, utility, and API regression tests

## Deployment & limitations

Deploy as a standard Next.js app on Vercel or another Node-compatible host.
Set the optional Windy key in deployment environment settings. Provider feeds,
external images, and map tiles require internet access and may have regional,
rate, or embedding restrictions. Saved views are browser-local, not cloud-synced.

The dependency audit currently reports advisories in the ESLint/fast-glob/braces
**development-tooling** chain. There is no patched braces release in the registry
used for this project; do not blindly apply `npm audit fix --force` (it proposes a
Next ESLint config downgrade). Recheck when a compatible patch is available.

## Attribution

- Webcam data and links belong to their respective providers, including
  [Windy](https://www.windy.com), EarthCam, tourism sites, and traffic authorities.
- Map tiles and community data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- Dark map basemap © [CARTO](https://carto.com/attributions).
- Globe boundaries: [world-atlas / Natural Earth](https://github.com/topojson/world-atlas).
