# Public webcam OSINT workspace

## What is new

### Worldwide references and discovery

The **Global operators** layer contains 32 curated references across seven
continents, including polar stations, national parks, volcano observatories,
wildlife cameras, tourism networks, and road-camera directories. These are
public provider pages, not a scraped inventory or a claim that every stream is
currently online. The collection is intentionally extensible in
`lib/globalWebcams.ts`; records must use public operator URLs and declare media
kind and position precision.

A directory pin is an **approximate regional reference**, not an individual
camera position. Camera listings and operator directories have separate counts.
Country/territory counts describe the currently loaded catalog, not guaranteed
complete coverage. Continent filters use supplied metadata or country codes;
records without known regional metadata are only shown under All regions.

**Load nearby public webcams** queries Overpass for an explicit coordinate area
instead of only filtering the initial catalog. It includes webcam-tagged nodes,
ways, and relations and deduplicates by OSM object type/id. Centers of mapped
ways/relations are labeled approximate. Query results are capped at 500;
dateline-crossing envelopes fall back to all longitudes, with exact radius
filtering in the browser. Public operators can be missing from OSM.

The default OSM catalog now includes Arctic, Antarctic, Alaska, and Caribbean
regions. Partial regional failures are reported in source health. Asia traffic
loads the existing five country providers instead of only Singapore. Country and
source filters still apply to newly discovered data.

### Windy v3

1. Configure `WINDY_WEBCAMS_API_KEY` on the server; never paste it into chat or
   browser code.
2. Open **Explore cameras → Windy**.
3. Choose a geographic region, optionally an ISO country code and category.
4. Load a page and choose **Load next 50 cameras** for subsequent pages.

The globe and map share the additional catalog. Query resets do not discard
previously discovered cameras. Results are deduplicated and the additional
browser catalog is bounded at 5,000 entries; it is not a full offline Windy
mirror. Provider category availability, allowed offsets, media access, and
coverage depend on your API plan.

`GET /api/windy-webcams` accepts:

- `bbox=N,E,S,W` (existing public interface, preserved for map clients)
- `limit=1..50` (larger positive requests are capped at 50)
- `offset=0..9950`
- `countries=PT,ES` (up to 10 ISO codes)
- `categories=traffic,beach` (up to 10 syntactically validated IDs)

The proxy translates the bounding box to Windy v3's
`cameraBoundingBox=S,W,N,E`. It returns normalized media, `offset`, `limit`,
`nextOffset`, provider `total` when supplied, `fetchedAt`, and attribution.

The server caches successful responses for 120 seconds (maximum 64 entries),
coalesces identical concurrent requests, limits concurrent queries to eight, and
retains upstream 429 responses. API credentials are hashed for cache isolation
and never returned. There is no automatic bulk crawl or quota bypass. This is a
per-process cache/limit, not a distributed rate limiter; public deployments
should also configure hosting-level rate limits and API quota alerts.

A v3 `live` player is labeled **provider-reported live**. A daily player is a
**timelapse**, not live footage. A player being listed does not verify that it is
online. Unsupported/missing media stays a provider link.

### Viewer and live media

The webcam workspace supports provider iframes, direct MP4/WebM, and HLS using
native browser support or lazily loaded hls.js. Playback is user-initiated; the
app does not record streams. Streams still need browser-compatible codecs,
provider permission, and any required CORS support. Geo-blocks, login walls,
expired URLs, and player embedding restrictions are not bypassed.

Snapshot refresh is manual or opt-in every 30 seconds. Automatic refresh pauses
while the page is hidden. Browser refresh fetches directly with CORS and
`cache: no-store`, without altering signed query strings. If the provider denies
browser access, automatic refresh stops and the existing preview may be cached.

**Image received** is a browser observation, not a verified scene timestamp.
**Catalog loaded** is source-list retrieval time, not a live-health check.
Provider capture times are displayed separately when available. No arbitrary
URL health-check/capture proxy is offered.

### Timestamped capture packages

Capture creates one ZIP containing:

- The original JPEG, PNG, or WebP bytes retrieved directly from the provider.
- `manifest.json` with UTC browser retrieval time, provider timestamp if
  supplied, source/image URLs, coordinates/precision, byte count, MIME type,
  filename, and SHA-256.

Requests omit credentials, obey CORS, have a deadline, and enforce a 20 MB limit
while reading. Raster signatures are checked; HTML/SVG payloads are rejected.
No unrestricted server-side URL fetcher is exposed. Capturing an iframe, HLS
clip, private feed, or a source that blocks capture is **not** supported.

A hash identifies downloaded bytes; it does not prove scene authenticity, origin,
or time. A camera can serve an old image under a new request. Original provider
rights and attribution remain in effect. Review the manifest before sharing:
image URLs can contain expiring provider media tokens. Captures download to the
user's device and are not uploaded or persisted by this application.

### Google context

Every georeferenced workspace has external **Google Maps, Earth, and Street
View** links without a key. These are geographic context, not live webcams.
Street View coverage is not guaranteed, especially at approximate directory
coordinates or polar locations.

For embedded satellite and Street View context, configure
`GOOGLE_MAPS_EMBED_BROWSER_KEY`. This is intentionally a browser-visible Google
Maps Embed API key. Restrict it to Maps Embed API and exact deployed HTTP
referrers in Google Cloud, including any preview host you deliberately allow.
Do not use a service-account credential or unrestricted private server key.
Embedded Google services can require billing/enabled APIs according to Google's
terms. The no-key links remain available when embedding is not configured.

### Export and privacy

CSV/GeoJSON exports retain source attribution, timestamps, coordinates, media
kind, and coordinate precision. CSV text cells are protected against spreadsheet
formula injection. Saved local collections retain directory/media provenance.
Credentials, local-only hostnames, private IPv4 endpoints, and literal IPv6
endpoints are not accepted as public webcam URLs. This is not a DNS resolver or
network scanner. Do not use it to target private devices or identify people.

## Validation and limitations

Unit tests cover v3 normalization/paging/cache/quota responses, malformed inputs,
Google configuration, public directories, OSM centroids, capture packaging/hashes,
CSV hygiene, and discovery controls. Browser smoke tests exercise the workspace,
Google fallback, Windy catalog merging, a capture ZIP, snapshot refresh, and map
navigation using mocked external providers.

The sandbox cannot reach most external camera providers, and no Windy or Google
key is bundled. Actual paid-plan access, real stream availability, external
provider URLs, and Google embeds require validation in a network-enabled
configured deployment. This is a broader public-webcam research workspace, not
a guarantee of exhaustive worldwide coverage or verified continuous live feeds.

### Reproduce the browser smoke test

Start a production build/server, then run the optional Playwright script in a
second terminal. Playwright is not a runtime dependency:

```bash
npm run build
npm run start -- --hostname 0.0.0.0
# In another terminal:
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/smoke-osint.cjs
```

Use `SMOKE_BASE_URL` for another local test origin or
`CHROMIUM_EXECUTABLE_PATH` for a preinstalled Chromium binary. On restricted
Linux sandboxes without system browser libraries, installing the optional
`@sparticuz/chromium` package and setting `USE_SPARTICUZ=1` uses its packaged
Chromium/AL2023 libraries instead. All external provider requests are mocked or
blocked. The capture assertion independently recomputes the original image's
SHA-256 from the downloaded ZIP. A screenshot is saved under ignored `.cache/`.
Run `npm ci` afterwards to remove optional test packages.
