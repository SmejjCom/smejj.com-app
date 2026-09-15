// smejj.com — Kosten-Wache (Autopilot Nr. 55): rechnet den gemessenen
// Modell-Verbrauch in Geld um und schlägt an, BEVOR ein Tag das Budget reißt.
//
// Die Zahlen kommen aus dem Token-Messer (tokenMesser.js) — dort zählt jede
// echte Anfrage ihre Tokens ("quelle: gemessen"), die Preisliste rechnet sie
// in USD um. Diese Wache erfindet nichts: sie liest den Bericht desselben
// Moduls, das auch der Adminbereich zeigt.
//
// WARUM NEUSTARTFEST (2026-09-15, Master-Audit): Der Arbeitsspeicher des
// Token-Messers ist nach jedem Neustart leer. Die Wache meldete danach
// "0.00 USD" — als wäre das der Tagesverbrauch; jeder Deploy setzte das Budget
// still auf null zurück. Jetzt legt die Wache ihren Tagesstand in e2 ab
// (autopiloten/kosten-wache/tagesstand.json) und erkennt einen Neustart am
// Prozess-Startzeitpunkt: Tageswert = Basis vor dem Neustart + seit Start
// gemessen. Was zwischen der letzten Ablage und dem Neustart verbraucht wurde,
// kennt niemand — die Meldung nennt diese Lücke und sagt dann "Untergrenze".
// Ebenso, wenn die Ablage nicht lesbar ist: dann zählt nur "seit Neustart".
//
// NICHT ENTHALTEN: Die Chat-Brücke ruft ihre Direktspuren (Groq, LLM_BASE_URL)
// selbst auf und meldet ihren Verbrauch nirgends an den Control-Server (geprüft
// 2026-09-15: public/chat-bridge*.js kennt keinen usage-Meldeweg). Die Meldung
// sagt das dazu, statt eine Vollständigkeit zu spielen, die es nicht gibt.
// Zeabur-Fixkosten stehen nicht in dieser Ampel: sie ändern sich nicht
// stündlich, und eine Zahl, die sich nie ändert, wäre ein Stempel.
import { bericht } from "../llm/tokenMesser.js";
import { createRecordStore } from "../admin/recordStore.js";

export const ABLAGE_ID = "tagesstand";
export const ABLAGE_VERSION = 1;
/** Wann dieser Prozess gestartet ist — daran erkennt die Wache einen Neustart. */
export const PROZESS_START_MS = Math.round(Date.now() - process.uptime() * 1000);
/** Lücken unter einer Minute sind Messrauschen, keine Aussage. */
const LUECKE_MELDEN_AB_MS = 60_000;
const BRUECKE_HINWEIS = "Brücken-Verbrauch nicht enthalten";

let standardAblage = null;
// Zuletzt bekannte Basis je Ablage: war die Ablage in DIESEM Prozess schon
// einmal lesbar, bleibt die Basis bekannt, auch wenn e2 später kurz hakt.
const bekannteBasis = new WeakMap();

/** Tagesbudget in USD. Per Umgebung übersteuerbar, Standard bewusst knapp. */
export function tagesBudgetUsd(env = process.env) {
  const wert = Number(env.SMEJJ_KOSTEN_TAGESBUDGET_USD);
  return Number.isFinite(wert) && wert > 0 ? wert : 25;
}

/**
 * Beurteilt einen Tagesbericht gegen das Budget. Getrennt testbar.
 * @param {{kostenUsd?: number, anfragen?: number, modelle?: Array}} tag
 */
export function beurteileTag(tag, { budgetUsd = 25 } = {}) {
  const kosten = Number(tag?.kostenUsd || 0);
  const anteil = budgetUsd > 0 ? kosten / budgetUsd : 0;
  if (anteil >= 1) {
    return { stufe: "rot", grund: `Tagesbudget GERISSEN: ${kosten.toFixed(2)} USD von ${budgetUsd} USD` };
  }
  if (anteil >= 0.8) {
    return { stufe: "warnung", grund: `Tagesbudget zu ${Math.round(anteil * 100)} % verbraucht (${kosten.toFixed(2)} von ${budgetUsd} USD)` };
  }
  return { stufe: "ok", grund: `${kosten.toFixed(2)} von ${budgetUsd} USD (${Math.round(anteil * 100)} %)` };
}

/**
 * Rechnet den Tagesstand aus abgelegtem Stand + seit Prozessstart gemessen.
 * Rein, ohne Ablage — getrennt testbar.
 *
 * @param {object} p
 * @param {string} p.heute "YYYY-MM-DD" (UTC, wie der Token-Messer)
 * @param {number} p.prozessStartMs Startzeitpunkt des laufenden Prozesses
 * @param {object|null} p.stand abgelegter Datensatz (null = lesbar, aber leer)
 * @param {{kostenUsd?: number, anfragen?: number}|null} p.seitStart Token-Messer heute
 * @param {number} p.jetztMs
 */
export function rechneTagesstand({ heute, prozessStartMs, stand = null, seitStart = null, jetztMs = Date.now() }) {
  const tagesbeginnMs = Date.parse(`${heute}T00:00:00.000Z`);
  const seitStartUsd = runde6(Number(seitStart?.kostenUsd || 0));
  const seitStartAnfragen = Number(seitStart?.anfragen || 0);
  const gleicherTag = stand?.tag === heute;
  let basisUsd = 0;
  let basisAnfragen = 0;
  let lueckeMs = 0;
  let neustart = false;
  if (gleicherTag && stand.prozessStartMs === prozessStartMs) {
    // Derselbe Prozess wie beim letzten Lauf: die Basis steht schon fest.
    basisUsd = Number(stand.basisUsd || 0);
    basisAnfragen = Number(stand.basisAnfragen || 0);
    lueckeMs = Number(stand.lueckeMs || 0);
  } else {
    // Erster Lauf dieses Prozesses (oder neuer Tag): was der alte Prozess
    // heute gezählt hat, wird zur Basis. Zwischen seiner letzten Ablage und
    // unserem Start war niemand da, der zählte — das ist die Lücke.
    neustart = Boolean(stand) && stand.prozessStartMs !== prozessStartMs;
    if (gleicherTag) {
      basisUsd = Number(stand.basisUsd || 0) + Number(stand.seitStartUsd || 0);
      basisAnfragen = Number(stand.basisAnfragen || 0) + Number(stand.seitStartAnfragen || 0);
      lueckeMs = Number(stand.lueckeMs || 0);
    }
    // Derselbe Prozess am neuen Tag hat seit Mitternacht selbst gezählt: keine Lücke.
    const letzteAblageMs = stand?.prozessStartMs === prozessStartMs
      ? prozessStartMs
      : Math.max(Number(stand?.aktualisiertMs || 0), tagesbeginnMs);
    lueckeMs += Math.max(0, prozessStartMs - letzteAblageMs);
  }
  basisUsd = runde6(basisUsd);
  const datensatz = {
    id: ABLAGE_ID,
    version: ABLAGE_VERSION,
    tag: heute,
    prozessStartMs,
    basisUsd,
    basisAnfragen,
    seitStartUsd,
    seitStartAnfragen,
    lueckeMs,
    aktualisiertMs: jetztMs,
    createdAt: new Date(jetztMs).toISOString()
  };
  return {
    gesamtUsd: runde6(basisUsd + seitStartUsd),
    gesamtAnfragen: basisAnfragen + seitStartAnfragen,
    basisUsd,
    lueckeMs,
    neustart,
    datensatz
  };
}

/** Selbsttest: gerissenes Budget MUSS auffallen, normaler Verbrauch nicht, ein Neustart darf nicht nullen. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = beurteileTag({ kostenUsd: 31.5 }, { budgetUsd: 25 });
  if (kaputt.stufe !== "rot") fehler.push("gerissenes Budget wird nicht rot");
  const knapp = beurteileTag({ kostenUsd: 21 }, { budgetUsd: 25 });
  if (knapp.stufe !== "warnung") fehler.push("84 % Verbrauch löst keine Warnung aus");
  const gesund = beurteileTag({ kostenUsd: 3.2 }, { budgetUsd: 25 });
  if (gesund.stufe !== "ok") fehler.push("normaler Verbrauch löst fälschlich aus");
  const nachNeustart = rechneTagesstand({
    heute: "2026-09-15",
    prozessStartMs: Date.parse("2026-09-15T12:00:00Z"),
    stand: { tag: "2026-09-15", prozessStartMs: 1, basisUsd: 2, seitStartUsd: 18, aktualisiertMs: Date.parse("2026-09-15T12:00:00Z") },
    seitStart: { kostenUsd: 1 },
    jetztMs: Date.parse("2026-09-15T12:30:00Z")
  });
  if (nachNeustart.gesamtUsd !== 21) fehler.push("Neustart setzt den Tagesstand zurück");
  return { bestanden: fehler.length === 0, fehler, anzahl: 4 };
}

function e2Eingerichtet(env) {
  return ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"].every((k) => Boolean(env[k]));
}

/**
 * Liest den abgelegten Stand. recordStore.lies() liefert null sowohl für
 * "nicht da" als auch für "nicht lesbar" — erst die Liste unterscheidet das
 * (ok:false = Ablage nicht lesbar). Die Liste kostet nur, wenn lies() nichts
 * fand, also praktisch einmal im Leben der Ablage.
 */
async function leseStand(ablage, env) {
  try {
    const stand = await ablage.lies(ABLAGE_ID, { env });
    if (stand) return { lesbar: true, stand: stand.version === ABLAGE_VERSION ? stand : null };
    const liste = await ablage.liste({ env });
    if (!liste?.ok) return { lesbar: false, stand: null };
    const gefunden = (liste.datensaetze || []).find((d) => d?.id === ABLAGE_ID && d.version === ABLAGE_VERSION);
    return { lesbar: true, stand: gefunden || null };
  } catch {
    return { lesbar: false, stand: null };
  }
}

/**
 * Der Lauf im Takt: Selbsttest, Tagesstand aus Ablage + Token-Messer, Urteil.
 *
 * @param {object} [o]
 * @param {object} [o.ablage] eigener Speicher (Tests); Standard e2 unter autopiloten/kosten-wache
 * @param {number} [o.prozessStartMs] Startzeitpunkt des Prozesses (Tests simulieren Neustarts)
 */
export async function laufKostenWache({
  env = process.env, berichtLader = bericht, jetztMs = Date.now(), ablage = null, prozessStartMs = PROZESS_START_MS
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Kosten-Wache rechnet bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  const selbsttest = `Selbsttest ${probe.anzahl}/${probe.anzahl}`;
  const budget = tagesBudgetUsd(env);
  const heute = new Date(jetztMs).toISOString().slice(0, 10);
  let daten;
  try {
    daten = berichtLader({ tag: heute });
  } catch (f) {
    return { ok: false, meldung: `Token-Messer nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  const tag = (daten?.tage || []).find((t) => t?.tag === heute) || (daten?.tage || [])[0] || null;

  // Ohne e2 lebt die Standard-Ablage nur im Arbeitsspeicher — also genauso
  // flüchtig wie der Token-Messer. Das ist dann kein Neustart-Schutz.
  const neustartfest = Boolean(ablage) || e2Eingerichtet(env);
  const speicher = ablage || (standardAblage ||= createRecordStore("autopiloten/kosten-wache", { maximal: 5 }));
  const hinweise = [];
  let { lesbar, stand } = await leseStand(speicher, env);
  const gemerkt = bekannteBasis.get(speicher);
  if (!lesbar && gemerkt && gemerkt.tag === heute && gemerkt.prozessStartMs === prozessStartMs) {
    // Die Basis dieses Prozesses kennen wir schon aus einem früheren Lauf.
    lesbar = true;
    stand = gemerkt;
  }

  let stufe;
  if (lesbar) {
    stufe = rechneTagesstand({ heute, prozessStartMs, stand, seitStart: tag, jetztMs });
    bekannteBasis.set(speicher, stufe.datensatz);
    try {
      await speicher.schreib(stufe.datensatz, { env, timeoutMs: 5000 });
    } catch {
      hinweise.push("Ablage nicht schreibbar — der nächste Neustart verliert den Stand");
    }
    if (stufe.basisUsd > 0 || stufe.neustart) hinweise.push(`davon ${stufe.basisUsd.toFixed(2)} USD vor dem letzten Neustart (Ablage)`);
    if (!neustartfest) {
      hinweise.push("Untergrenze: Ablage e2 nicht eingerichtet, gezählt nur seit Neustart");
    } else if (stufe.lueckeMs >= LUECKE_MELDEN_AB_MS) {
      hinweise.push(`Untergrenze: ${Math.round(stufe.lueckeMs / 60_000)} min vor dem Neustart nicht erfasst`);
    }
  } else {
    stufe = { gesamtUsd: runde6(Number(tag?.kostenUsd || 0)), gesamtAnfragen: Number(tag?.anfragen || 0) };
    hinweise.push("Untergrenze: Tagesstand-Ablage nicht lesbar, gezählt nur seit Neustart");
  }
  hinweise.push(BRUECKE_HINWEIS);
  const anhang = `; ${hinweise.join("; ")}`;

  const urteil = beurteileTag({ kostenUsd: stufe.gesamtUsd }, { budgetUsd: budget });
  const teuerstes = (tag?.modelle || [])[0];
  const zusatz = teuerstes ? ` — meistgenutzt seit Neustart: ${teuerstes.modell} (${teuerstes.anfragen} Anfragen)` : "";
  if (urteil.stufe === "rot") {
    return { ok: false, meldung: `${urteil.grund}${zusatz}${anhang}` };
  }
  if (urteil.stufe === "warnung") {
    return { ok: false, meldung: `${urteil.grund}${zusatz} — noch nicht gerissen, aber auf Kurs${anhang}` };
  }
  if (stufe.gesamtAnfragen === 0) {
    return { ok: true, meldung: `${selbsttest}; heute noch kein gemessener Verbrauch (Budget ${budget} USD)${anhang}` };
  }
  return { ok: true, meldung: `${selbsttest}; Tageskosten ${urteil.grund}, ${stufe.gesamtAnfragen} Anfragen${zusatz}${anhang}` };
}

function runde6(wert) {
  return Math.round(wert * 1e6) / 1e6;
}
