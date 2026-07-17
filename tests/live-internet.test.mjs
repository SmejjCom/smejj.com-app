import test from "node:test";
import assert from "node:assert/strict";
import { answerLiveIntent, detectLiveInternetIntent } from "../control-server/src/live/liveInternet.js";

const fixedNow = new Date("2026-07-05T11:45:00.000Z");

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

function htmlResponse(html) {
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

test("detects live weather and does not intercept normal coding prompts", () => {
  assert.deepEqual(detectLiveInternetIntent("Wetter in Berlin heute?"), { live: true, kind: "weather", location: "Berlin", dayOffset: 0 });
  assert.equal(detectLiveInternetIntent("Schreibe eine JavaScript Funktion add(a,b). Nur Code.").live, false);
});

test("detects tomorrow and day-after-tomorrow weather questions with day offset", () => {
  assert.deepEqual(detectLiveInternetIntent("wie ist Wetter morgen in Berlin"), { live: true, kind: "weather", location: "Berlin", dayOffset: 1 });
  assert.deepEqual(detectLiveInternetIntent("Wetter übermorgen in Hamburg?"), { live: true, kind: "weather", location: "Hamburg", dayOffset: 2 });
  // Tageszeit-Gruss ist kein Tagesversatz.
  assert.equal(detectLiveInternetIntent("Guten Morgen, wie ist das Wetter in Berlin?").dayOffset, 0);
});

test("answers weather through Open-Meteo with source and timestamp", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith("https://geocoding-api.open-meteo.com")) {
      return jsonResponse({ results: [{ name: "Berlin", country: "Deutschland", latitude: 52.52, longitude: 13.41 }] });
    }
    return jsonResponse({
      current: { time: "2026-07-05T13:30", temperature_2m: 22.4, apparent_temperature: 22.1, wind_speed_10m: 9, precipitation: 0, weather_code: 2 },
      daily: { temperature_2m_min: [16], temperature_2m_max: [25], precipitation_probability_max: [20] }
    });
  };
  const result = await answerLiveIntent(detectLiveInternetIntent("Wetter in Berlin heute?"), "Wetter in Berlin heute?", { fetchImpl, now: fixedNow });
  assert.equal(result.ok, true);
  assert.match(result.answer, /Aktuelles Wetter fuer Berlin/);
  assert.match(result.answer, /Quelle: Open-Meteo/);
  assert.match(result.answer, /Stand: 2026-07-05T13:30/);
  assert.equal(calls.length, 2);
});

test("answers tomorrow forecast from Open-Meteo daily fields", async () => {
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://geocoding-api.open-meteo.com")) {
      return jsonResponse({ results: [{ name: "Berlin", country: "Deutschland", latitude: 52.52, longitude: 13.41 }] });
    }
    assert.match(String(url), /forecast_days=3/);
    assert.match(String(url), /daily=weather_code/);
    return jsonResponse({
      current: { time: "2026-07-05T13:30", temperature_2m: 22.4, apparent_temperature: 22.1, wind_speed_10m: 9, precipitation: 0, weather_code: 2 },
      daily: {
        time: ["2026-07-05", "2026-07-06", "2026-07-07"],
        weather_code: [2, 61, 3],
        temperature_2m_min: [16, 15, 14],
        temperature_2m_max: [25, 21, 19],
        precipitation_probability_max: [20, 80, 40],
        precipitation_sum: [0, 6.4, 1.2],
        wind_speed_10m_max: [12, 28, 18]
      }
    });
  };
  const task = "wie ist Wetter morgen in Berlin";
  const result = await answerLiveIntent(detectLiveInternetIntent(task), task, { fetchImpl, now: fixedNow });
  assert.equal(result.ok, true);
  assert.match(result.answer, /Wettervorhersage fuer morgen \(2026-07-06\) in Berlin, Deutschland: leichter Regen\./);
  assert.match(result.answer, /Temperatur: 15 bis 21 °C\./);
  assert.match(result.answer, /Regenwahrscheinlichkeit: max\. 80 %, Niederschlag gesamt: 6\.4 mm, Wind bis 28 km\/h\./);
  assert.match(result.answer, /Quelle: Open-Meteo/);
});

test("fails closed when forecast for the requested day is missing", async () => {
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://geocoding-api.open-meteo.com")) {
      return jsonResponse({ results: [{ name: "Berlin", country: "Deutschland", latitude: 52.52, longitude: 13.41 }] });
    }
    return jsonResponse({ current: { temperature_2m: 22 }, daily: { temperature_2m_max: [25] } });
  };
  const task = "Wetter übermorgen in Berlin";
  const result = await answerLiveIntent(detectLiveInternetIntent(task), task, { fetchImpl, now: fixedNow });
  assert.equal(result.ok, false);
  assert.match(result.answer, /Keine Vorhersage fuer den angefragten Tag/);
});

test("summarizes a direct webpage URL with source", async () => {
  const fetchImpl = async () => htmlResponse(`
    <html><head><title>Example News</title></head><body>
      <main><p>Dies ist eine aktuelle Meldung ueber smejj.com und Live-Internetdaten mit belastbarer Quelle.</p>
      <p>Die Plattform liest Webseiten, fasst Inhalte zusammen und zeigt die Quelle mit Zeitpunkt an.</p></main>
    </body></html>
  `);
  const result = await answerLiveIntent(detectLiveInternetIntent("Bitte fasse https://example.com/news zusammen"), "Bitte fasse https://example.com/news zusammen", { fetchImpl, now: fixedNow });
  assert.equal(result.ok, true);
  assert.match(result.answer, /Webseite: Example News/);
  assert.match(result.answer, /Quelle: https:\/\/example.com\/news/);
  assert.match(result.answer, /Stand: 2026-07-05T11:45:00.000Z/);
});

test("fails closed when live source is not available", async () => {
  const fetchImpl = async () => new Response("blocked", { status: 503, headers: { "content-type": "text/plain" } });
  const result = await answerLiveIntent(detectLiveInternetIntent("aktuelle News zu Berlin"), "aktuelle News zu Berlin", { fetchImpl, now: fixedNow });
  assert.equal(result.ok, false);
  assert.match(result.answer, /keine belastbaren Live-Internetdaten/);
  assert.match(result.answer, /erfinde keine aktuellen Informationen/);
});
