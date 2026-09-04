// smejj.com — Besucher-Puls (Autopilot Nr. 81), Betreiber-Auftrag 2026-09-04
// („Nutzer-Baustelle angehen").
//
// WARUM ES IHN GIBT (gemessen 04.09.): Die Analytik zählt Registrierungen —
// aber NICHT, ob überhaupt jemand ankommt. Bei 3 Konten und 1 neuen in 7 Tagen
// war damit die entscheidende Frage unbeantwortbar: Kommt niemand (Auffindbar-
// keit) oder kommen Leute und melden sich nicht an (Trichter)? Ohne diese Zahl
// ist jede Maßnahme für Nutzerwachstum Raten.
//
// BAUART FÜR 1 MILLIARDE BESUCHER (Master-Prompt, verbindlich):
//   * KEINE zentrale Zählung, die mit der Besucherzahl mitwächst: der Eingang
//     erhöht nur Zahlen im Arbeitsspeicher — O(1), kein Speicherschreiben.
//   * Der Tagesstand wird höchstens alle 5 Minuten abgelegt (max. 288 Schreib-
//     vorgänge am Tag, unabhängig davon, ob 3 oder 3 Milliarden Menschen kommen).
//   * Der Client meldet EINMAL je Browser-Sitzung (sessionStorage), nie je Klick.
//   * Fällt der Control-Server aus, verliert man Zählwerte — nie eine Seite.
//
// DATENSCHUTZ: keine Kennung, kein Cookie, keine IP, kein Pfad mit Parametern.
// Gezählt werden nur: Seite (feste Liste), Sprache (2 Buchstaben), Herkunfts-
// HOST (z. B. "google.com"). Das ist eine Strichliste, keine Nutzerverfolgung —
// passend zum Versprechen „Deine Daten bleiben bei dir".
import { createRecordStore } from "../admin/recordStore.js";

export const BESUCHER_ABLAGE = "betrieb/besucher-puls";
/** Höchstens alle 5 Minuten ablegen — der Deckel gegen Last, nicht gegen Genauigkeit. */
export const ABLAGE_ABSTAND_MS = 5 * 60 * 1000;
/** Mehr als so viele verschiedene Herkünfte/Sprachen je Tag werden gebündelt. */
const MAX_SCHLUESSEL = 40;

const zustand = {
  tag: "",
  besuche: 0,
  jeSeite: new Map(),
  jeSprache: new Map(),
  jeHerkunft: new Map(),
  ersterPulsAm: null,
  letzterPulsAm: null,
  zuletztAbgelegtMs: 0,
  // Aus der Ablage wiederhergestellt: WANN zuletzt überhaupt ein Puls kam.
  // Ohne diese Zeile war die Ampel nach JEDEM Neustart rot („noch kein Puls"),
  // obwohl der Haken längst läuft — live gemessen 04.09. 10:43.
  letzterPulsLautAblage: null,
  wiederhergestellt: false
};
/** Der Prozessstart: vor Ablauf der Schonfrist ist „noch kein Puls" kein Befund. */
const START_MS = Date.now();
/** So lange nach dem Start gilt Stille als normal (Nacht, wenige Besucher). */
export const SCHONFRIST_MS = 60 * 60 * 1000;

function tagVon(jetztMs) { return new Date(jetztMs).toISOString().slice(0, 10); }

function zaehle(karte, roh) {
  const wert = String(roh || "").trim().toLowerCase().slice(0, 40);
  if (!wert) return;
  if (!karte.has(wert) && karte.size >= MAX_SCHLUESSEL) { karte.set("weitere", (karte.get("weitere") || 0) + 1); return; }
  karte.set(wert, (karte.get(wert) || 0) + 1);
}

/** Reduziert einen Verweis auf den HOST — nie Pfad, nie Parameter (die tragen Suchbegriffe). */
export function herkunftsHost(verweis = "") {
  const roh = String(verweis || "").trim().toLowerCase();
  if (!roh) return "direkt";
  // Der Client kuerzt bereits auf den Host (besucher-puls.js) — hier kam
  // deshalb "direkt"/"intern"/"google.com" an und wurde als kaputte URL zu
  // "unbekannt" (live gemessen 04.09.). Beides muss durchgehen; alles andere
  // wird verworfen, damit nie ein Pfad oder Suchbegriff in die Zaehlung faellt.
  if (roh === "direkt" || roh === "intern" || roh === "unbekannt") return roh;
  if (!roh.includes("://")) {
    // Ein Host hat mindestens einen Punkt — "kaputt" ist keiner.
    return /^[a-z0-9][a-z0-9-]{0,30}(\.[a-z0-9-]{1,20}){1,4}$/.test(roh)
      ? (roh.replace(/^www\./, "") === "smejj.com" ? "intern" : roh.replace(/^www\./, "").slice(0, 40))
      : "unbekannt";
  }
  try {
    const host = new URL(roh).hostname.toLowerCase().replace(/^www\./, "");
    if (!host) return "direkt";
    return host === "smejj.com" ? "intern" : host.slice(0, 40);
  } catch { return "unbekannt"; }
}

/** Nimmt einen Puls an. Reine Zählerei im Speicher — kein Netz, kein Schreiben. */
export function nimmPulsAn({ seite, sprache, verweis } = {}, { jetztMs = Date.now() } = {}) {
  const tag = tagVon(jetztMs);
  if (zustand.tag !== tag) {
    zustand.tag = tag;
    zustand.besuche = 0;
    zustand.jeSeite = new Map();
    zustand.jeSprache = new Map();
    zustand.jeHerkunft = new Map();
    zustand.ersterPulsAm = null;
  }
  zustand.besuche += 1;
  zaehle(zustand.jeSeite, String(seite || "/").slice(0, 40).split("?")[0]);
  zaehle(zustand.jeSprache, String(sprache || "").slice(0, 5).split("-")[0]);
  zaehle(zustand.jeHerkunft, herkunftsHost(verweis));
  const iso = new Date(jetztMs).toISOString();
  if (!zustand.ersterPulsAm) zustand.ersterPulsAm = iso;
  zustand.letzterPulsAm = iso;
  return { ok: true };
}

/** Der gemessene Tagesstand — für Ablage, Ampel und Admin-Ansicht. */
export function tagesStand({ jetztMs = Date.now() } = {}) {
  const sortiert = (karte) => Object.fromEntries([...karte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  return {
    tag: zustand.tag || tagVon(jetztMs),
    besuche: zustand.besuche,
    jeSeite: sortiert(zustand.jeSeite),
    jeSprache: sortiert(zustand.jeSprache),
    jeHerkunft: sortiert(zustand.jeHerkunft),
    ersterPulsAm: zustand.ersterPulsAm,
    letzterPulsAm: zustand.letzterPulsAm
  };
}

/** Nur für Tests: setzt den Speicher zurück. */
export function _pulsZuruecksetzen() {
  zustand.tag = ""; zustand.besuche = 0; zustand.jeSeite = new Map(); zustand.jeSprache = new Map();
  zustand.jeHerkunft = new Map(); zustand.ersterPulsAm = null; zustand.letzterPulsAm = null; zustand.zuletztAbgelegtMs = 0;
  zustand.letzterPulsLautAblage = null; zustand.wiederhergestellt = false;
}

/**
 * Beurteilt Besuche und Anmeldungen. Getrennt testbar (kaputt + gesund).
 * WICHTIG: „0 Besuche" ist zweierlei — niemand da ODER niemand kann melden.
 * Genau diese Unterscheidung fehlte dem Fehler-Fänger einst; hier von Anfang an.
 */
export function beurteilePuls({ besuche = 0, jePulsGesehen = false, konten = null, neueKonten = null, letzterPulsLautAblage = null, laufzeitMs = Infinity } = {}) {
  if (!jePulsGesehen) {
    // Drei Fälle statt eines Pauschalalarms — sonst ist die Ampel nach jedem
    // Deploy rot und niemand nimmt sie mehr ernst.
    if (letzterPulsLautAblage) {
      return { ok: true, grund: `seit dem letzten Neustart noch kein Puls; zuletzt gemeldet ${String(letzterPulsLautAblage).slice(0, 16)} — der Haken läuft, es kommt gerade niemand` };
    }
    if (laufzeitMs < SCHONFRIST_MS) {
      return { ok: true, grund: `frisch gestartet (${Math.max(1, Math.round(laufzeitMs / 60000))} min), noch kein Puls — Schonfrist ${Math.round(SCHONFRIST_MS / 60000)} min läuft` };
    }
    return { ok: false, grund: "Noch kein einziger Puls angekommen — entweder ist der Haken auf der Landeseite nicht ausgeliefert, oder der Eingang ist blockiert. Eine 0 wäre hier eine Lüge." };
  }
  const anmeldung = Number.isFinite(neueKonten) ? `, ${neueKonten} neue Konten in 7 Tagen` : "";
  const bestand = Number.isFinite(konten) ? ` (Bestand ${konten})` : "";
  if (besuche === 0) {
    return { ok: true, grund: `heute 0 Besuche gemessen${anmeldung}${bestand} — der Haken meldet, es kommt nur niemand` };
  }
  const quote = Number.isFinite(neueKonten) && besuche > 0 ? Math.round((neueKonten / besuche) * 1000) / 10 : null;
  return {
    ok: true,
    grund: `heute ${besuche} Besuche${anmeldung}${bestand}` + (quote !== null ? `; Anmeldequote ${String(quote).replace(".", ",")} % (7-Tage-Konten gegen Tagesbesuche)` : "")
  };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Probe. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  if (beurteilePuls({ besuche: 0, jePulsGesehen: false, laufzeitMs: Infinity }).ok) fehler.push("ohne je einen Puls darf es kein Grün geben");
  if (!beurteilePuls({ besuche: 0, jePulsGesehen: false, laufzeitMs: 60_000 }).ok) fehler.push("in der Schonfrist nach dem Start ist Stille kein Ausfall");
  if (!beurteilePuls({ besuche: 0, jePulsGesehen: false, letzterPulsLautAblage: "2026-09-04T10:00:00Z", laufzeitMs: Infinity }).ok) fehler.push("ein bekannter Puls aus der Ablage beweist, dass der Haken läuft");
  const leer = beurteilePuls({ besuche: 0, jePulsGesehen: true, neueKonten: 0 });
  if (!leer.ok || !/nur niemand/.test(leer.grund)) fehler.push("gemessene 0 Besuche sind ein Zustand, kein Ausfall");
  const voll = beurteilePuls({ besuche: 200, jePulsGesehen: true, neueKonten: 2, konten: 5 });
  if (!voll.ok || !/200 Besuche/.test(voll.grund) || !/Anmeldequote 1 %/.test(voll.grund)) fehler.push(`Quote falsch gerechnet: ${voll.grund}`);
  if (herkunftsHost("https://www.google.com/search?q=geheim") !== "google.com") fehler.push("Herkunft muss auf den Host reduziert werden");
  if (herkunftsHost("") !== "direkt" || herkunftsHost("kaputt") !== "unbekannt") fehler.push("leere und kaputte Verweise falsch behandelt");
  if (herkunftsHost("https://smejj.com/hilfe.html") !== "intern") fehler.push("eigener Verweis muss intern heissen");
  if (herkunftsHost("google.com") !== "google.com" || herkunftsHost("direkt") !== "direkt") fehler.push("schon gekuerzte Herkunft muss durchgehen");
  if (herkunftsHost("/pfad/mit/geheim?q=x") !== "unbekannt") fehler.push("ein Pfad darf nie als Herkunft zaehlen");
  return { bestanden: fehler.length === 0, fehler, geprueft: 10 };
}

/**
 * Der Lauf im Takt: Selbsttest, Tagesstand ablegen (höchstens alle 5 Minuten),
 * Zahlen melden. Liest die Kontenzahl über den übergebenen Leser — der Läufer
 * reicht den echten Nutzer-Index durch.
 */
export async function laufBesucherPuls({
  storeFabrik = createRecordStore,
  kontenLeser = null,
  jetztMs = Date.now(),
  // Testbar: die Schonfrist haengt am Prozessstart, nicht an einer Konstanten.
  startMs = START_MS
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Besucher-Puls rechnet bekannte Fälle falsch: ${probe.fehler.join("; ")}` };

  const speicher = storeFabrik(BESUCHER_ABLAGE, { maximal: 120 });
  // Einmal je Prozess: den heutigen Stand aus der Ablage zurückholen, damit ein
  // Deploy die Tageszahl nicht auf null setzt und die Ampel nicht fälschlich rot
  // wird. Gemessen 04.09.: nach dem Bau um 10:42 stand die Ampel auf rot,
  // obwohl neun Minuten vorher ein Puls angekommen war.
  if (!zustand.wiederhergestellt) {
    zustand.wiederhergestellt = true;
    try {
      const heute = await speicher.lies(`tag-${tagVon(jetztMs)}`);
      if (heute && heute.tag === tagVon(jetztMs)) {
        zustand.tag = heute.tag;
        zustand.besuche = Number(heute.besuche) || 0;
        for (const [k, v] of Object.entries(heute.jeSeite || {})) zustand.jeSeite.set(k, v);
        for (const [k, v] of Object.entries(heute.jeSprache || {})) zustand.jeSprache.set(k, v);
        for (const [k, v] of Object.entries(heute.jeHerkunft || {})) zustand.jeHerkunft.set(k, v);
        zustand.ersterPulsAm = heute.ersterPulsAm || null;
        zustand.letzterPulsLautAblage = heute.letzterPulsAm || heute.createdAt || null;
      } else {
        const gestern = await speicher.lies(`tag-${tagVon(jetztMs - 86_400_000)}`);
        zustand.letzterPulsLautAblage = gestern?.letzterPulsAm || gestern?.createdAt || null;
      }
    } catch { /* ohne Ablage entscheidet die Schonfrist */ }
  }

  const stand = tagesStand({ jetztMs });
  let konten = null;
  let neueKonten = null;
  if (typeof kontenLeser === "function") {
    try {
      const k = await kontenLeser();
      konten = Number.isFinite(k?.gesamt) ? k.gesamt : null;
      neueKonten = Number.isFinite(k?.neu7Tage) ? k.neu7Tage : null;
    } catch { /* Kontenzahl ist Beiwerk, der Puls steht auch ohne sie */ }
  }
  const urteil = beurteilePuls({
    besuche: stand.besuche,
    jePulsGesehen: Boolean(zustand.letzterPulsAm) || stand.besuche > 0,
    konten,
    neueKonten,
    letzterPulsLautAblage: zustand.letzterPulsLautAblage,
    laufzeitMs: jetztMs - startMs
  });

  let ablageStatus = "";
  if (jetztMs - zustand.zuletztAbgelegtMs >= ABLAGE_ABSTAND_MS && Boolean(zustand.letzterPulsAm)) {
    try {
      await speicher.schreib({
        id: `tag-${stand.tag}`, art: "besucher-tag", ...stand, konten, neueKonten, createdAt: new Date(jetztMs).toISOString()
      }, { timeoutMs: 5000 });
      zustand.zuletztAbgelegtMs = jetztMs;
    } catch { ablageStatus = "; Tagesstand NICHT abgelegt (Ablage gestört)"; }
  }

  const seiten = Object.entries(stand.jeSeite).slice(0, 3).map(([s, n]) => `${s} ${n}`).join(", ");
  const herkunft = Object.entries(stand.jeHerkunft).slice(0, 3).map(([h, n]) => `${h} ${n}`).join(", ");
  return {
    ok: urteil.ok,
    meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteil.grund}`
      + (seiten ? `; Seiten: ${seiten}` : "") + (herkunft ? `; Herkunft: ${herkunft}` : "") + ablageStatus
  };
}
