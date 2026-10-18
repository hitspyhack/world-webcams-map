#!/usr/bin/env node
/**
 * Flight Price Watcher — LIS → CAI round trip, 2 adults, cabin backpack only.
 *
 * Checks the cheapest round-trip price via the Amadeus Self-Service API and
 * sends a Telegram message when the price drops below the configured threshold.
 *
 * Zero dependencies — requires Node >= 18 (global fetch).
 *
 * Usage:
 *   node watcher.mjs            # single check (ideal for cron / GitHub Actions)
 *   node watcher.mjs --loop     # keep running, check every INTERVAL_HOURS
 *   node watcher.mjs --demo     # fake a price below the threshold (test the pipeline)
 *   node watcher.mjs --dry-run  # don't send Telegram messages, print them instead
 *
 * Configuration: environment variables, or a .env file next to this script.
 * See .env.example for the full list.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARGS = new Set(process.argv.slice(2));

// ---------------------------------------------------------------- .env loader
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv(join(HERE, ".env"));

// ---------------------------------------------------------------- config
const cfg = {
  origin: process.env.ORIGIN || "LIS",
  destination: process.env.DESTINATION || "CAI",
  departureDate: process.env.DEPARTURE_DATE || "2027-03-01",
  returnDate: process.env.RETURN_DATE || "2027-03-09",
  adults: Number(process.env.ADULTS || 2),
  currency: process.env.CURRENCY || "EUR",
  thresholdEur: Number(process.env.THRESHOLD_EUR || 200),
  // "per_person" -> alert when (total / adults) is below the threshold
  // "total"      -> alert when the combined price for all travellers is below the threshold
  thresholdScope: (process.env.THRESHOLD_SCOPE || "per_person").toLowerCase(),
  intervalHours: Number(process.env.INTERVAL_HOURS || 6),
  amadeusEnv: (process.env.AMADEUS_ENV || "test").toLowerCase(), // "test" | "production"
  amadeusClientId: process.env.AMADEUS_CLIENT_ID || "",
  amadeusClientSecret: process.env.AMADEUS_CLIENT_SECRET || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  stateDir: process.env.STATE_DIR || join(HERE, "data"),
};

const DEMO = ARGS.has("--demo");
const DRY_RUN = ARGS.has("--dry-run");
const LOOP = ARGS.has("--loop");

const AMADEUS_HOST =
  cfg.amadeusEnv === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";

const STATE_FILE = join(cfg.stateDir, "state.json");
const HISTORY_FILE = join(cfg.stateDir, "history.csv");

// ---------------------------------------------------------------- state
function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastPrice: null, lastAlert: null };
  }
}

function saveState(state) {
  mkdirSync(cfg.stateDir, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function appendHistory(row) {
  mkdirSync(cfg.stateDir, { recursive: true });
  if (!existsSync(HISTORY_FILE)) {
    appendFileSync(HISTORY_FILE, "timestamp,total_eur,per_person_eur,carrier,below_threshold\n");
  }
  appendFileSync(
    HISTORY_FILE,
    `${row.timestamp},${row.total},${row.perPerson},${row.carrier},${row.below}\n`
  );
}

// ---------------------------------------------------------------- amadeus
async function amadeusToken() {
  const res = await fetch(`${AMADEUS_HOST}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.amadeusClientId,
      client_secret: cfg.amadeusClientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Amadeus auth failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function fetchCheapestOffer() {
  const token = await amadeusToken();
  const params = new URLSearchParams({
    originLocationCode: cfg.origin,
    destinationLocationCode: cfg.destination,
    departureDate: cfg.departureDate,
    returnDate: cfg.returnDate,
    adults: String(cfg.adults),
    currencyCode: cfg.currency,
    max: "20",
  });
  const res = await fetch(`${AMADEUS_HOST}/v2/shopping/flight-offers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Flight search failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  const offers = body.data || [];
  if (offers.length === 0) return null;

  const carriers = body.dictionaries?.carriers || {};
  let best = null;
  for (const offer of offers) {
    const total = Number(offer.price?.grandTotal ?? offer.price?.total ?? NaN);
    if (!Number.isFinite(total)) continue;
    if (!best || total < best.total) {
      const firstSeg = offer.itineraries?.[0]?.segments?.[0];
      const code = firstSeg?.carrierCode || offer.validatingAirlineCodes?.[0] || "?";
      best = {
        total,
        perPerson: total / cfg.adults,
        carrier: carriers[code] || code,
        stopsOut: Math.max((offer.itineraries?.[0]?.segments?.length || 1) - 1, 0),
        stopsBack: Math.max((offer.itineraries?.[1]?.segments?.length || 1) - 1, 0),
        departAt: firstSeg?.departure?.at || cfg.departureDate,
      };
    }
  }
  return best;
}

function demoOffer() {
  const total = Number(process.env.DEMO_PRICE_EUR || 189.98);
  return {
    total,
    perPerson: total / cfg.adults,
    carrier: "Demo Airways",
    stopsOut: 1,
    stopsBack: 1,
    departAt: `${cfg.departureDate}T07:35:00`,
  };
}

// ---------------------------------------------------------------- telegram
async function sendTelegram(text) {
  if (DRY_RUN || !cfg.telegramBotToken || !cfg.telegramChatId) {
    console.log("—— Telegram message (dry-run / not configured) ——");
    console.log(text);
    console.log("——————————————————————————————————————————————————");
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: cfg.telegramChatId, text, parse_mode: "Markdown" }),
  });
  if (!res.ok) {
    throw new Error(`Telegram send failed (${res.status}): ${await res.text()}`);
  }
  console.log("Telegram alert sent.");
}

function formatAlert(offer) {
  const scopeLabel =
    cfg.thresholdScope === "per_person"
      ? `below ${cfg.thresholdEur}€ per person`
      : `below ${cfg.thresholdEur}€ total`;
  return [
    `✈️ *Flight price alert — ${scopeLabel}!*`,
    ``,
    `*${cfg.origin} → ${cfg.destination}* round trip, ${cfg.adults} adults (cabin backpack fare)`,
    `🗓 ${cfg.departureDate} → ${cfg.returnDate}`,
    ``,
    `💶 *Total: ${offer.total.toFixed(2)}€*  (${offer.perPerson.toFixed(2)}€ / person)`,
    `🛫 ${offer.carrier} — ${offer.stopsOut === 0 ? "direct" : `${offer.stopsOut} stop(s)`} out, ${
      offer.stopsBack === 0 ? "direct" : `${offer.stopsBack} stop(s)`
    } back`,
    `⏰ Departure: ${offer.departAt.replace("T", " ")}`,
    ``,
    `_Book soon — prices change fast. Check Google Flights / airline site to confirm._`,
  ].join("\n");
}

// ---------------------------------------------------------------- core check
async function checkOnce() {
  const now = new Date().toISOString();
  console.log(`[${now}] Checking ${cfg.origin} → ${cfg.destination}, ${cfg.departureDate} → ${cfg.returnDate}, ${cfg.adults} adults…`);

  if (!DEMO && (!cfg.amadeusClientId || !cfg.amadeusClientSecret)) {
    console.error(
      "Missing AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET. " +
        "Get free keys at https://developers.amadeus.com, or run with --demo to test."
    );
    process.exitCode = 1;
    return;
  }

  const offer = DEMO ? demoOffer() : await fetchCheapestOffer();
  if (!offer) {
    console.log("No offers returned for these dates (airlines may not have opened sales yet).");
    appendHistory({ timestamp: now, total: "", perPerson: "", carrier: "none", below: false });
    return;
  }

  const comparable = cfg.thresholdScope === "per_person" ? offer.perPerson : offer.total;
  const below = comparable < cfg.thresholdEur;

  console.log(
    `Cheapest: ${offer.total.toFixed(2)}€ total (${offer.perPerson.toFixed(2)}€/person) — ${offer.carrier}. ` +
      `Threshold: ${cfg.thresholdEur}€ ${cfg.thresholdScope}. ${below ? "BELOW ✅" : "above ❌"}`
  );

  appendHistory({
    timestamp: now,
    total: offer.total.toFixed(2),
    perPerson: offer.perPerson.toFixed(2),
    carrier: offer.carrier.replaceAll(",", " "),
    below,
  });

  const state = loadState();
  state.lastPrice = { total: offer.total, at: now };

  if (below) {
    const last = state.lastAlert;
    const hoursSince = last ? (Date.now() - new Date(last.at).getTime()) / 36e5 : Infinity;
    const priceDropped = !last || offer.total < last.total - 0.01;
    // Re-alert if the price dropped further, or 24h passed since the last alert.
    if (priceDropped || hoursSince >= 24) {
      await sendTelegram(formatAlert(offer));
      state.lastAlert = { total: offer.total, at: now };
    } else {
      console.log(`Still below threshold, but already alerted ${hoursSince.toFixed(1)}h ago — skipping duplicate.`);
    }
  }

  saveState(state);
}

// ---------------------------------------------------------------- entrypoint
async function main() {
  if (!["total", "per_person"].includes(cfg.thresholdScope)) {
    throw new Error(`THRESHOLD_SCOPE must be "total" or "per_person", got "${cfg.thresholdScope}"`);
  }
  if (LOOP) {
    console.log(`Loop mode: checking every ${cfg.intervalHours}h. Ctrl+C to stop.`);
    for (;;) {
      try {
        await checkOnce();
      } catch (err) {
        console.error("Check failed:", err.message);
      }
      await new Promise((r) => setTimeout(r, cfg.intervalHours * 36e5));
    }
  } else {
    await checkOnce();
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
