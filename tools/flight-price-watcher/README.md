# ✈️ Flight Price Watcher — Lisbon → Cairo

Automatic price monitor for a **LIS → CAI round trip, 2 adults, cabin-backpack fare**:

- **Departure:** 1 March 2027 · **Return:** 9 March 2027
- **Alert rule:** Telegram message when the price drops **below 200€ per person**
- **Check frequency:** every 6 hours, automatically via GitHub Actions
- Prices come from **Google Flights via SerpApi** — real booking prices, free tier
  (250 searches/month; this watcher uses ~124). Basic fares include a cabin
  backpack — checked bags cost extra, which matches a "backpack only" trip.

> ℹ️ This tool originally used the Amadeus Self-Service API, which was
> decommissioned on 17 July 2026. SerpApi's Google Flights engine replaced it.

Zero dependencies — a single Node ≥ 18 script (`watcher.mjs`).

---

## 1. Get your free keys (≈ 4 minutes)

### SerpApi (flight prices)
1. Sign up at <https://serpapi.com> (free, no credit card).
2. Copy the **API key** from your dashboard → that's `SERPAPI_KEY`.

### Telegram (notifications)
1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts → copy the **token**.
2. Open a chat with your new bot and send it any message (e.g. "hi").
3. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and copy
   the number in `"chat":{"id":…}` — that's your **chat id**.

---

## 2. Run it

### Option A — GitHub Actions (recommended: runs even when your PC is off)

The workflow `.github/workflows/flight-price-watch.yml` already checks every 6 hours.
Just add the secrets in your GitHub repo:

> **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `SERPAPI_KEY` | your SerpApi API key |
| `TELEGRAM_BOT_TOKEN` | your bot token |
| `TELEGRAM_CHAT_ID` | your chat id |

You can trigger a check manually anytime from the *Actions* tab
(*Flight price watch → Run workflow*).

> ⚠️ GitHub disables scheduled workflows after **60 days of repo inactivity**.
> Any commit (or re-enabling it in the Actions tab) keeps it alive.

### Option B — your own machine

```bash
cd tools/flight-price-watcher
cp .env.example .env     # fill in your keys
node watcher.mjs         # single check
node watcher.mjs --loop  # keep running, checks every 6 h
```

Or schedule a single check with cron (`crontab -e`):

```cron
0 */6 * * * cd /path/to/world-webcams-map/tools/flight-price-watcher && /usr/bin/node watcher.mjs >> watcher.log 2>&1
```

---

## 3. Test the pipeline before you have keys

```bash
node watcher.mjs --demo --dry-run   # fakes a cheap price, prints the Telegram message
node watcher.mjs --demo             # fakes the price and really sends the Telegram alert
```

---

## Configuration

Everything is overridable via environment variables / `.env` — see `.env.example`.
The two you may want to tweak:

- `THRESHOLD_EUR=200` — the alert price.
- `THRESHOLD_SCOPE=per_person` (default) — alerts when **each ticket** costs < 200€.
  Set to `total` if you want the combined price for both travellers compared instead.

## How alerts behave

- Alerts fire when the cheapest Google Flights offer is below the threshold
  (Google shows the total round-trip price for all passengers; per-person = total ÷ 2).
- No spam: it re-alerts only if the price drops **further**, or after 24 h.
- Alerts include a direct Google Flights link for booking.
- Every check is logged to `data/history.csv` (timestamp, total, per-person, airline),
  so you can see the price trend over time. State lives in `data/state.json`
  (git-ignored; persisted via cache in GitHub Actions).

## Notes

- Airlines usually open sales ~11 months before departure, so for March 2027 real
  offers will start appearing around **April 2026**. Until then the watcher logs
  "no offers" and quietly keeps trying — no action needed.
- SerpApi free tier is 250 searches/month; the 6-hour schedule uses ~124, leaving
  headroom for manual runs. If you shorten the interval below ~4.5 h you'll exceed
  the free quota.
