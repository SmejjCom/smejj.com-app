import assert from "node:assert/strict";
import test from "node:test";

process.env.SMEJJ_CHAT_BRIDGE_NO_START = "1";
const bridge = await import("../public/chat-bridge.js");

test("chat bridge strips think blocks and empty model deltas", () => {
  const state = { pending: "", insideThink: false };
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"<think>"}}]}', state), "");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"hidden"}}]}', state), "");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"</think>Antwort"}}]}', state), "Antwort");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":""}}]}', state), "");
});

test("chat bridge preserves whitespace-only deltas for code block formatting", () => {
  const state = { pending: "", insideThink: false };
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"\\n"}}]}', state), "\n");
  assert.equal(bridge.filterSsePayload('{"choices":[{"delta":{"content":"  "}}]}', state), "  ");
});

test("chat bridge keeps partial opening think tag private", () => {
  const state = { pending: "", insideThink: false };
  assert.equal(bridge.stripThinking("Hallo <thi", state), "Hallo ");
  assert.equal(bridge.stripThinking("nk>intern</think> Welt", state), " Welt");
});

test("chat bridge only searches web for explicit current/source questions", () => {
  assert.equal(bridge.shouldSearchWeb("Bist du online?"), false);
  assert.equal(bridge.shouldSearchWeb("Hallo, bist du da und funktionierst du?"), false);
  assert.equal(bridge.shouldSearchWeb("Was ist heute eine aktuelle Nachricht mit Quelle?"), true);
  assert.equal(bridge.shouldSearchWeb("Wie ist das Wetter heute in Berlin?"), true);
});

test("chat bridge limiter enforces per-client windows", () => {
  let now = 1_000;
  const limiter = bridge.createWindowLimiter({ max: 2, windowMs: 60_000, now: () => now });
  assert.equal(limiter.take("client-a").allowed, true);
  assert.equal(limiter.take("client-a").allowed, true);
  assert.equal(limiter.take("client-a").allowed, false);
  assert.equal(limiter.take("client-b").allowed, true);
  now += 60_001;
  assert.equal(limiter.take("client-a").allowed, true);
});

test("fast lane is fail-closed without a Groq key and never writes to the response", async () => {
  assert.equal(bridge.fastLaneEnabled(), false);
  const writes = [];
  const res = {
    writeHead: (...args) => writes.push(["writeHead", args]),
    write: (...args) => writes.push(["write", args]),
    end: (...args) => writes.push(["end", args])
  };
  const handled = await bridge.streamFastLane(res, [{ role: "user", content: "Hallo" }], "chat", "");
  assert.equal(handled, false);
  assert.deepEqual(writes, []);
});

test("fast lane steps aside when an explicit deep-lane model is requested", async () => {
  for (const requested of ["GLM-5.2", "Kimi K2.7", "Cline"]) {
    const handled = await bridge.streamFastLane({}, [{ role: "user", content: "Hallo" }], "chat", requested);
    assert.equal(handled, false);
  }
});

test("weather fast path detects weather tasks, location and day offset", () => {
  assert.equal(bridge.isWeatherTask("Wie ist das Wetter morgen in Berlin?"), true);
  assert.equal(bridge.isWeatherTask("What is the weather in Paris tomorrow?"), true);
  assert.equal(bridge.isWeatherTask("Erzaehl mir einen Witz."), false);
  assert.equal(bridge.extractWeatherLocation("Wie ist das Wetter morgen in Berlin?"), "Berlin");
  assert.equal(bridge.extractWeatherLocation("wie ist Wetter uebermorgen in Hamburg"), "Hamburg");
  assert.equal(bridge.extractWeatherLocation("Wetter"), "Berlin");
  assert.equal(bridge.extractWeatherDayOffset("Wetter morgen in Berlin"), 1);
  assert.equal(bridge.extractWeatherDayOffset("Wetter übermorgen in Berlin"), 2);
  assert.equal(bridge.extractWeatherDayOffset("Guten Morgen, wie ist das Wetter?"), 0);
});

test("weather context is built from Open-Meteo data and fails closed on errors", async () => {
  const fetchOk = async (url) => ({
    ok: true,
    json: async () => (String(url).includes("geocoding")
      ? { results: [{ name: "Berlin", country: "Deutschland", latitude: 52.52, longitude: 13.41 }] }
      : {
          current: { time: "2026-07-21T18:00", temperature_2m: 24.4, apparent_temperature: 25.1, precipitation: 0, weather_code: 1, wind_speed_10m: 11.2 },
          daily: {
            time: ["2026-07-21", "2026-07-22", "2026-07-23"],
            weather_code: [1, 3, 61],
            temperature_2m_max: [26.2, 23.9, 20.1],
            temperature_2m_min: [15.4, 14.8, 13.2],
            precipitation_probability_max: [10, 40, 80],
            precipitation_sum: [0, 1.2, 6.4],
            wind_speed_10m_max: [18.4, 22.1, 30.5]
          }
        })
  });
  const context = await bridge.buildWeatherContext("Wie ist das Wetter morgen in Berlin?", fetchOk);
  assert.match(context, /Live-Internet-Ergebnisse/);
  assert.match(context, /Berlin, Deutschland/);
  assert.match(context, /Tagesversatz: morgen/);
  assert.match(context, /2026-07-22: bewoelkt, 14\.8 bis 23\.9 °C/);
  assert.match(context, /open-meteo\.com/);
  // Fail-closed: HTTP-Fehler, leeres Geocoding und Netzwerkfehler liefern "".
  assert.equal(await bridge.buildWeatherContext("Wetter Berlin", async () => ({ ok: false, json: async () => ({}) })), "");
  assert.equal(await bridge.buildWeatherContext("Wetter Nirgendwostadt", async () => ({ ok: true, json: async () => ({ results: [] }) })), "");
  assert.equal(await bridge.buildWeatherContext("Wetter Berlin", async () => { throw new Error("offline"); }), "");
});

// --- Adressen gehoeren nie in die werkzeuglose Schnellspur (2026-07-28) -------
// Befund: "Lies https://imild.com/ und nenne den Titel" landete in der
// Groq-Schnellspur, die keine Werkzeuge kennt, und lieferte "I-MILD.com" statt
// des echten Titels. Die Schnellspur darf raten — aber nicht ueber Seiten, die
// sie nie gelesen hat.

test("Aufgaben mit Web-Adresse verlassen die Schnellspur", () => {
  for (const aufgabe of [
    "Lies https://imild.com/ und nenne mir den Seitentitel",
    "geh browser iMild.com teste ob alles fehlerfrei ist?",
    "pruefe smejj.com/automation",
    "was steht auf www.example.org"
  ]) {
    assert.equal(bridge.shouldSearchWeb(aufgabe), true, `muss in die Tiefspur: ${aufgabe}`);
  }
});

test("Dateinamen und Satzreste gelten weiterhin nicht als Adresse", () => {
  for (const aufgabe of [
    "pruefe die Datei app.js auf Fehler",
    "lies index.html im Repo",
    "erklaer mir Rekursion",
    "schreib eine Funktion"
  ]) {
    assert.equal(bridge.mentionsWebAddress(aufgabe), false, `keine Adresse: ${aufgabe}`);
  }
});

test("gewoehnliche Fragen bleiben in der Schnellspur", () => {
  assert.equal(bridge.shouldSearchWeb("wie spaet ist es"), false);
  assert.equal(bridge.shouldSearchWeb("erklaer mir kurz Rekursion"), false);
});

// Coding auf die tiefe Spur — drei Faelle, weil der entscheidende davon der
// NICHT-Fall ist: ohne konfigurierte tiefe Spur antwortet streamModel 503, eine
// Code-Frage bekaeme also einen Fehler statt einer Antwort. Die Regel muss
// deshalb fail-closed sein und darf ohne tiefe Spur gar nichts aendern.
async function frischeBridge(env, nummer) {
  const alt = {};
  for (const [k, v] of Object.entries(env)) { alt[k] = process.env[k]; process.env[k] = v; }
  const modul = await import(`../public/chat-bridge.js?spurwahl=${nummer}`);
  for (const [k] of Object.entries(env)) { if (alt[k] === undefined) delete process.env[k]; else process.env[k] = alt[k]; }
  return modul;
}

const GROQ_AN = {
  SMEJJ_LLM_GROQ_API_KEY: "test-groq",
  SMEJJ_LLM_GROQ_BASE_URL: "https://groq.invalid/openai/v1",
  SMEJJ_LLM_GROQ_MODEL: "llama-3.1-8b-instant"
};
const TIEFE_SPUR_AN = {
  SMEJJ_LLM_BASE_URL: "https://api.z.ai/api/paas/v4",
  SMEJJ_LLM_API_KEY: "test-glm",
  SMEJJ_LLM_MODEL: "glm-4.7-flash"
};

async function spurVersuch(modul, profile) {
  const echterFetch = globalThis.fetch;
  let angefragt = null;
  globalThis.fetch = async (url) => { angefragt = String(url); throw new Error("Netz im Test gesperrt"); };
  try {
    const abgegeben = await modul.streamFastLane({}, [{ role: "user", content: "Schreibe eine ESM-Funktion." }], profile, "");
    return { abgegeben: abgegeben === false, angefragt };
  } finally {
    globalThis.fetch = echterFetch;
  }
}

test("ohne tiefe Spur behaelt Coding die Schnellspur — sonst gaebe es 503 statt Antwort", async () => {
  const modul = await frischeBridge(GROQ_AN, "ohne-tiefe");
  assert.equal(modul.fastLaneEnabled(), true, "Groq ist im Test konfiguriert");
  const { angefragt } = await spurVersuch(modul, "coding");
  assert.match(String(angefragt), /groq\.invalid/, "die Schnellspur wurde weiterhin versucht");
});

test("mit tiefer Spur gibt Coding die Schnellspur ab, ohne ein Byte zu senden", async () => {
  const modul = await frischeBridge({ ...GROQ_AN, ...TIEFE_SPUR_AN }, "mit-tiefe");
  const { abgegeben, angefragt } = await spurVersuch(modul, "coding");
  assert.equal(abgegeben, true, "streamFastLane liefert false, der Aufrufer nimmt die tiefe Spur");
  assert.equal(angefragt, null, "Groq wurde gar nicht erst gefragt");
});

test("mit tiefer Spur behaelt der normale Chat die Schnellspur — Tempo bleibt", async () => {
  const modul = await frischeBridge({ ...GROQ_AN, ...TIEFE_SPUR_AN }, "chat-bleibt");
  const { angefragt } = await spurVersuch(modul, "chat");
  assert.match(String(angefragt), /groq\.invalid/, "Chat laeuft weiter schnell");
});

test("Control-Router zaehlt als tiefe Spur — nicht nur die generischen LLM-Variablen", async () => {
  // Live belegt: die Bridge liefert ueber den Router zhipu:glm-5.2. Die erste
  // Fassung dieser Regel prueft nur LLM_BASE_URL/KEY/MODEL und waere deshalb
  // wirkungslos geblieben, obwohl eine funktionierende tiefe Spur existiert.
  const modul = await frischeBridge({
    ...GROQ_AN,
    SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "YES",
    SMEJJ_CONTROL_ORIGIN: "https://control.invalid"
  }, "router-zaehlt");
  const { abgegeben, angefragt } = await spurVersuch(modul, "coding");
  assert.equal(abgegeben, true, "Coding gibt die Spur ab, weil der Router bereitsteht");
  assert.equal(angefragt, null, "Groq wurde nicht gefragt");
});

test("handleChat erkennt eine Code-Frage — vorher lief sie immer als \"chat\"", async () => {
  // Der eigentliche Fehler: handleChat uebergab fest "chat", die Coding-Regel
  // konnte dort also nie greifen. isCodingTask muss die Frage erkennen.
  assert.equal(bridge.isCodingTask("Schreibe eine ESM-Funktion parseBudget(value) fuer Node 20."), true);
  assert.equal(bridge.isCodingTask("Wie geht es Dir heute?"), false);
});
