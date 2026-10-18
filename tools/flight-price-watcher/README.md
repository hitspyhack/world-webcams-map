# ✈️ Flight Price Watcher — Lisbon → Cairo

Automatic price monitor for a **LIS → CAI round trip, 2 adults, cabin-backpack fare**:

- **Departure:** 1 March 2027 · **Return:** 9 March 2027
- **Alert rule:** Telegram message when the price drops **below 200€ per person**
- **Check frequency:** every 6 hours
- Prices come from the **Amadeus Self-Service API** (free tier); the cheapest/basic
  fares it returns include a cabin backpack — checked bags cost extra, which matches
  your "backpack only" trip.

Zero dependencies — a single Node ≥ 18 script (`watcher.mjs`).

---

## 1. Get your free API keys (≈ 5 minutes)

### Amadeus (flight prices)
1. Sign up at <https://developers.amadeus.com> (free).
2. *My Self-Service Workspace → Create new app* → copy the **API Key** and **API Secret**.
3. Start with `AMADEUS_ENV=test` (free sandbox). When you want fully accurate live
   prices, request production keys in the same dashboard (still free quota) and set
   `AMADEUS_ENV=production`.

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
| `AMADEUS_CLIENT_ID` | your Amadeus API key |
| `AMADEUS_CLIENT_SECRET` | your Amadeus API secret |
| `TELEGRAM_BOT_TOKEN` | your bot token |
| `TELEGRAM_CHAT_ID` | your chat id |

Optionally add a repository **variable** `AMADEUS_ENV=production` once you have
production keys. You can trigger a check manually anytime from the *Actions* tab
(*Flight price watch → Run workflow*).

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
node watcher.mjs --demo --dry-run   # fakes a 189.98€ price, prints the Telegram message
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

- Alerts fire when the cheapest offer is below the threshold.
- No spam: it re-alerts only if the price drops **further**, or after 24 h.
- Every check is logged to `data/history.csv` (timestamp, total, per-person, airline),
  so you can see the price trend over time. State lives in `data/state.json`
  (git-ignored; persisted via cache in GitHub Actions).

## Notes

- Airlines usually open sales ~11 months before departure, so for March 2027 real
  offers will start appearing around **April 2026**. Until then the watcher logs
  "no offers" and quietly keeps trying — no action needed.
- The Amadeus `test` environment has limited, cached data; it's fine for wiring
  things up, but switch to `production` for real monitoring.
