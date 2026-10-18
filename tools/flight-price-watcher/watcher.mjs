#!/usr/bin/env node
/**
 * Flight Price Watcher — LIS → CAI round trip, 2 adults, cabin backpack only.
 *
 * Checks the cheapest round-trip price via SerpApi's Google Flights engine and
 * sends a Telegram message when the price drops below the configured threshold.
 *
 * (Previously used the Amadeus Self-Service API, which was decommissioned on
 * 17 July 2026 — SerpApi returns real Google Flights prices instead.)
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
  thresholdEur: Number(process.env.THRESHOLD_EUR || 250),
  // "per_person" -> alert when (total / adults) is below the threshold
  // "total"      -> alert when the combined price for all travellers is below the threshold
  thresholdScope: (process.env.THRESHOLD_SCOPE || "per_person").toLowerCase(),
  intervalHours: Number(process.env.INTERVAL_HOURS || 6),
  // Daily heartbeat: one Telegram summary per day with the current cheapest price,
  // even when it's above the threshold. Set DAILY_SUMMARY=false to disable.
  dailySummary: (process.env.DAILY_SUMMARY || "true").toLowerCase() !== "false",
  // The summary is sent by the first check at/after this UTC hour each day.
  summaryAfterHourUtc: Number(process.env.SUMMARY_AFTER_HOUR_UTC || 6),
  serpapiKey: process.env.SERPAPI_KEY || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  stateDir: process.env.STATE_DIR || join(HERE, "data"),
};

const DEMO = ARGS.has("--demo");
const DRY_RUN = ARGS.has("--dry-run");
const LOOP = ARGS.has("--loop");

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

// ---------------------------------------------------------------- serpapi (google flights)
async function fetchCheapestOffer() {
  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: cfg.origin,
    arrival_id: cfg.destination,
    outbound_date: cfg.departureDate,
    return_date: cfg.returnDate,
    type: "1", // round trip
    adults: String(cfg.adults),
    currency: cfg.currency,
    hl: "en",
    deep_search: "true", // same results as the Google Flights browser UI
    api_key: cfg.serpapiKey,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) {
    throw new Error(`SerpApi request failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  if (body.error) throw new Error(`SerpApi error: ${body.error}`);

  // Google Flights shows the TOTAL round-trip price for all passengers.
  const offers = [...(body.best_flights || []), ...(body.other_flights || [])];
  let best = null;
  for (const offer of offers) {
    const total = Number(offer.price);
    if (!Number.isFinite(total)) continue;
    if (!best || total < best.total) {
      const firstSeg = offer.flights?.[0];
      best = {
        total,
        perPerson: total / cfg.adults,
        carrier: firstSeg?.airline || "?",
        stopsOut: Math.max((offer.flights?.length || 1) - 1, 0),
        departAt: firstSeg?.departure_airport?.time || cfg.departureDate,
      };
    }
  }

  // Fallback: Google's own "lowest price" insight, if no structured offers came back.
  if (!best && Number.isFinite(Number(body.price_insights?.lowest_price))) {
    const total = Number(body.price_insights.lowest_price);
    best = {
      total,
      perPerson: total / cfg.adults,
      carrier: "see Google Flights",
      stopsOut: null,
      departAt: cfg.departureDate,
    };
  }
  return best;
}

function demoOffer() {
  const total = Number(process.env.DEMO_PRICE_EUR || 379.98);
  return {
    total,
    perPerson: total / cfg.adults,
    carrier: "Demo Airways",
    stopsOut: 1,
    departAt: `${cfg.departureDate} 07:35`,
  };
}

function googleFlightsLink() {
  const q = `Flights from ${cfg.origin} to ${cfg.destination} on ${cfg.departureDate} through ${cfg.returnDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${cfg.currency}`;
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
  const stops =
    offer.stopsOut === null
      ? ""
      : `\n🛫 ${offer.carrier} — ${offer.stopsOut === 0 ? "direct" : `${offer.stopsOut} stop(s)`} outbound`;
  return [
    `✈️ *Flight price alert — ${scopeLabel}!*`,
    ``,
    `*${cfg.origin} → ${cfg.destination}* round trip, ${cfg.adults} adults (cabin backpack fare)`,
    `🗓 ${cfg.departureDate} → ${cfg.returnDate}`,
    ``,
    `💶 *Total: ${offer.total.toFixed(2)}€*  (${offer.perPerson.toFixed(2)}€ / person)${stops}`,
    `⏰ Departure: ${offer.departAt}`,
    ``,
    `[Open in Google Flights](${googleFlightsLink()})`,
    ``,
    `_Book soon — prices change fast._`,
  ].join("\n");
}

function formatSummary(offer, prevTotal) {
  const target = cfg.thresholdScope === "per_person" ? cfg.thresholdEur : cfg.thresholdEur / cfg.adults;
  const gap = offer.perPerson - target;
  const gapLine =
    gap <= 0
      ? `🎯 At or below the target of ${cfg.thresholdEur}€ ${cfg.thresholdScope === "per_person" ? "per person" : "total"}!`
      : `🎯 Target: below ${cfg.thresholdEur}€${cfg.thresholdScope === "per_person" ? "/person" : " total"} — currently ${gap.toFixed(2)}€/person above`;
  let trendLine = "";
  if (Number.isFinite(prevTotal) && Math.abs(prevTotal - offer.total) >= 0.01) {
    const diff = offer.total - prevTotal;
    trendLine = `\n${diff < 0 ? "📉" : "📈"} ${diff < 0 ? "Down" : "Up"} ${Math.abs(diff).toFixed(2)}€ since yesterday's summary`;
  }
  return [
    `📊 *Daily price check — ${cfg.origin} → ${cfg.destination}*`,
    ``,
    `🗓 ${cfg.departureDate} → ${cfg.returnDate} · ${cfg.adults} adults, round trip`,
    `💶 Cheapest today: *${offer.total.toFixed(2)}€ total* (${offer.perPerson.toFixed(2)}€ / person) — ${offer.carrier}`,
    gapLine + trendLine,
    ``,
    `[Open in Google Flights](${googleFlightsLink()})`,
  ].join("\n");
}

// ---------------------------------------------------------------- core check
async function checkOnce() {
  const now = new Date().toISOString();
  console.log(`[${now}] Checking ${cfg.origin} → ${cfg.destination}, ${cfg.departureDate} → ${cfg.returnDate}, ${cfg.adults} adults…`);

  if (!DEMO && !cfg.serpapiKey) {
    console.error(
      "Missing SERPAPI_KEY. Get a free key at https://serpapi.com (250 searches/month), " +
        "or run with --demo to test."
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

  let alertSentNow = false;
  if (below) {
    const last = state.lastAlert;
    const hoursSince = last ? (Date.now() - new Date(last.at).getTime()) / 36e5 : Infinity;
    const priceDropped = !last || offer.total < last.total - 0.01;
    // Re-alert if the price dropped further, or 24h passed since the last alert.
    if (priceDropped || hoursSince >= 24) {
      await sendTelegram(formatAlert(offer));
      state.lastAlert = { total: offer.total, at: now };
      alertSentNow = true;
    } else {
      console.log(`Still below threshold, but already alerted ${hoursSince.toFixed(1)}h ago — skipping duplicate.`);
    }
  }

  // Daily heartbeat summary (skipped when an alert already went out this run).
  if (cfg.dailySummary && !alertSentNow) {
    const today = now.slice(0, 10);
    const lastSummaryDay = state.lastSummary?.date;
    const hourUtc = new Date(now).getUTCHours();
    if (lastSummaryDay !== today && hourUtc >= cfg.summaryAfterHourUtc) {
      await sendTelegram(formatSummary(offer, state.lastSummary?.total));
      state.lastSummary = { date: today, total: offer.total };
      console.log("Daily summary sent.");
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
