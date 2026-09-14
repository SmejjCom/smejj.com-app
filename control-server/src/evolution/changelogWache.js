// smejj.com — Changelog-Wache, Teil des Konkurrenz-Radars (Autopilot Nr. 04).
//
// WARUM ES SIE GIBT (Master-Audit 2026-09-15): Der Radar fragte acht Mal die
// Woche eine Suchmaschine nach "new feature announcement" und filterte englische
// Schlagzeilen. Er rief KEINE einzige Release-Notes-Seite direkt ab — und die
// HTML-Suchen blocken Rechenzentren seit 04.08. Cursor, Claude Code, Kimi Code,
// DeepSeek, Mistral, Manus und Z.ai standen gar nicht auf der Liste; der letzte
// schriftliche Radar-Bericht war vom 05.08.
//
// WAS SIE TUT: Einmal je Radar-Lauf (wöchentlich) jede Seite unten per GET
// holen, auf Textzeilen reduzieren und mit dem letzten Stand in e2 vergleichen.
// NEUE Zeilen werden Kandidaten — mit Adresse, wörtlichem Auszug und Datum.
// Dieselbe Trennung wie im Radar: Messung ("diese Zeile stand am 15.09. neu auf
// cursor.com/changelog"), nie Deutung ("Cursor kann jetzt X"). bestaetigt bleibt
// false, bis der Betreiber entscheidet.
//
// SICHERHEIT: feste Adressliste (kein SSRF-Weg von aussen), nur GET ohne
// Zugangsdaten, 10 s Zeitlimit, höchstens 1,5 MB je Seite, höchstens 4 parallel.
// Der erste Lauf je Seite legt nur den Grundstand an — sonst wäre jede Zeile "neu".

import { createHash } from "node:crypto";
import { createRecordStore } from "../admin/recordStore.js";

/** Nur Adressen, die am 15.09.2026 tatsächlich erreichbar waren (403-Seiten fehlen bewusst). */
export const CHANGELOGS = Object.freeze([
  { id: "claude-apps", anbieter: "Claude", url: "https://support.claude.com/en/articles/12138966-release-notes" },
  { id: "claude-plattform", anbieter: "Claude", url: "https://platform.claude.com/docs/en/release-notes/overview" },
  { id: "claude-code", anbieter: "Claude Code", url: "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md" },
  { id: "gemini-app", anbieter: "Gemini", url: "https://gemini.google/release-notes/?hl=en" },
  { id: "gemini-api", anbieter: "Gemini", url: "https://ai.google.dev/gemini-api/docs/changelog?hl=en" },
  { id: "openai-codex", anbieter: "ChatGPT/Codex", url: "https://learn.chatgpt.com/docs/changelog" },
  { id: "cursor", anbieter: "Cursor", url: "https://cursor.com/changelog" },
  { id: "grok-api", anbieter: "Grok", url: "https://docs.x.ai/docs/release-notes" },
  { id: "deepseek", anbieter: "DeepSeek", url: "https://api-docs.deepseek.com/updates" },
  { id: "mistral-docs", anbieter: "Mistral", url: "https://docs.mistral.ai/getting-started/changelog/" },
  { id: "kimi-code", anbieter: "Kimi Code", url: "https://moonshotai.github.io/kimi-cli/en/release-notes/changelog.html" },
  { id: "manus", anbieter: "Manus", url: "https://manus.im/blog" },
  { id: "perplexity-api", anbieter: "Perplexity", url: "https://docs.perplexity.ai/changelog" },
  { id: "zai-glm", anbieter: "Z.ai/GLM", url: "https://docs.z.ai/release-notes/new-released" }
]);

export const ZEITLIMIT_MS = 10_000;
export const MAX_BYTES = 1_500_000;
export const MAX_ZEILEN_STAND = 400;
export const MAX_NEU_JE_SEITE = 8;
const PARALLEL = 4;

/** HTML oder Markdown → sinnvolle Textzeilen (ohne Skripte, Stile, Navigation-Kurzzeilen). */
export function textZeilen(roh) {
  const ohneCode = String(roh || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|footer|header|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|br)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, n) => { const c = hex ? parseInt(n, 16) : Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : " "; }).replace(/&apos;/g, "'").replace(/&quot;/g, "\"");
  const gesehen = new Set();
  const zeilen = [];
  for (const z of ohneCode.split(/\n+/)) {
    const t = z.replace(/\s+/g, " ").replace(/^[#*\-\s]+/, "").trim();
    // Kurzzeilen sind Menüs und Knöpfe; Überlanges ist meist eingebettetes JSON.
    if (t.length < 25 || t.length > 400 || gesehen.has(t)) continue;
    gesehen.add(t);
    zeilen.push(t.slice(0, 240));
  }
  return zeilen;
}

async function holeSeite(ziel, fetchImpl) {
  const antwort = await fetchImpl(ziel.url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
    headers: { Accept: "text/html,text/markdown,text/plain", "Accept-Language": "en-US,en;q=0.8", "User-Agent": "smejj.com-changelog-wache/1 (+https://smejj.com)" }
  });
  if (!antwort.ok) throw new Error(`http_${antwort.status}`);
  const text = await antwort.text();
  if (text.length > MAX_BYTES) return text.slice(0, MAX_BYTES);
  return text;
}

/** Vergleicht zwei Zeilenstände. Neu = im jetzigen Stand, im alten nicht; Reihenfolge der Seite bleibt. */
export function neueZeilen(alt = [], jetzt = []) {
  const bekannt = new Set(alt);
  return jetzt.filter((z) => !bekannt.has(z));
}

/**
 * Ein Durchlauf über alle Seiten. Liefert Kandidaten (nur echte Änderungen seit
 * dem letzten Stand), stumme Seiten und die Zahl neu angelegter Grundstände.
 */
export async function pruefeChangelogs({
  ziele = CHANGELOGS, fetchImpl = fetch, jetztMs = Date.now(), env = process.env,
  ablage = createRecordStore("evolution/changelog-stand", { maximal: 40 })
} = {}) {
  const kandidaten = [];
  const stumm = [];
  let grundstaende = 0;
  let unveraendert = 0;
  const warteschlange = [...ziele];
  const arbeiter = async () => {
    while (warteschlange.length) {
      const ziel = warteschlange.shift();
      try {
        const zeilen = textZeilen(await holeSeite(ziel, fetchImpl)).slice(0, MAX_ZEILEN_STAND);
        if (!zeilen.length) { stumm.push({ anbieter: ziel.anbieter, url: ziel.url, grund: "Seite ohne lesbaren Text" }); continue; }
        const hash = createHash("sha256").update(zeilen.join("\n")).digest("hex");
        let vorher = null;
        try { vorher = await ablage.lies(`cl-${ziel.id}`, { env }); } catch { /* wie Grundstand */ }
        if (vorher?.hash === hash) { unveraendert += 1; continue; }
        if (vorher?.zeilen?.length) {
          for (const z of neueZeilen(vorher.zeilen, zeilen).slice(0, MAX_NEU_JE_SEITE)) {
            kandidaten.push({ anbieter: ziel.anbieter, bereich: "changelog", titel: z.slice(0, 200), url: ziel.url, auszug: z, gesehenAm: new Date(jetztMs).toISOString(), bestaetigt: false });
          }
        } else {
          grundstaende += 1;
        }
        await ablage.schreib({ id: `cl-${ziel.id}`, url: ziel.url, anbieter: ziel.anbieter, hash, zeilen, createdAt: new Date(jetztMs).toISOString() }, { env, timeoutMs: 5_000 });
      } catch (fehler) {
        const grund = fehler?.name === "TimeoutError" || fehler?.name === "AbortError" ? "timeout" : String(fehler?.message || fehler).slice(0, 80);
        stumm.push({ anbieter: ziel.anbieter, url: ziel.url, grund });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, ziele.length) }, arbeiter));
  return { geprueft: ziele.length, kandidaten, stumm, grundstaende, unveraendert };
}

/** Selbsttest: Textzerlegung und Vergleich an bekannten Proben — kaputt UND gesund. */
export function fuehreChangelogSelbsttestAus() {
  const fehler = [];
  const html = "<nav>Home Pricing Docs</nav><script>var x='geheim neue Funktion'</script><h2>September 10, 2026</h2><p>Introducing background agents that run in the cloud for hours.</p><li>Menu</li>";
  const z = textZeilen(html);
  if (!z.includes("Introducing background agents that run in the cloud for hours.")) fehler.push("Absatztext wurde nicht erkannt");
  if (z.some((t) => /geheim|Pricing/.test(t))) fehler.push("Skript oder Navigation landete im Text");
  if (z.includes("Menu")) fehler.push("Kurzzeile (Menü) wurde nicht verworfen");
  const neu = neueZeilen(["Alte Zeile mit genug Zeichen für den Filter"], ["Neue Zeile mit genug Zeichen für den Filter", "Alte Zeile mit genug Zeichen für den Filter"]);
  if (neu.length !== 1 || !neu[0].startsWith("Neue")) fehler.push("Vergleich erkennt neue Zeilen falsch");
  if (new Set(CHANGELOGS.map((c) => c.id)).size !== CHANGELOGS.length) fehler.push("doppelte Kennung in der Adressliste");
  if (CHANGELOGS.some((c) => !/^https:\/\//.test(c.url))) fehler.push("Adresse ohne HTTPS");
  return { bestanden: fehler.length === 0, fehler, geprueft: 6 };
}
