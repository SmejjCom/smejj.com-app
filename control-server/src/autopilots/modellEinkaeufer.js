// smejj.com — Modell-Einkäufer (Autopilot Nr. 34): einkaufen statt trainieren.
//
// WARUM (Betreiber-Strategie 2026-08-13): smejj wird nicht durch eigenes
// Training besser — das wurde gemessen und verworfen (5 Zyklen, alle unter
// der Grundlinie; Beschluss 2026-08-06: RAG statt Training). smejj wird
// besser, indem es automatisch MISST, welches verfügbare Modell gerade das
// beste ist, und den Wechsel VORSCHLÄGT. So reitet die App die Fortschritte
// von Moonshot, Zhipu & Co., statt gegen Milliardenbudgets anzutrainieren.
//
// WAS ER MISST: Jede Woche bekommt jedes aktive Modell dieselben Aufgaben
// mit FESTSTEHENDER richtiger Antwort (Wissen, Rechnen, Code, Logik, Deutsch,
// JSON-Disziplin) — über den ECHTEN Nutzerweg (Brücke, /api/agent), nicht
// über einen Labor-Seiteneingang. Gezählt werden Treffer und Antwortzeit.
//
// WAS ER BEWUSST NICHT TUT: das Live-Modell selbst umschalten. Die Modellwahl
// ist eine Betreiber-Entscheidung (Kosten! kimi-k3 ist kostenpflichtig;
// Menü-Namen sind Markenentscheidungen). Der Einkäufer liefert die Zahlen
// und die EMPFEHLUNG in die Ampel — der Mensch schaltet um.
import { issueSessionToken } from "../auth/sessionToken.js";
import { createRecordStore } from "../admin/recordStore.js";

const BRUECKE_STANDARD = "https://smejj-chat-bridge.zeabur.app";
const ablage = createRecordStore("autopiloten/modell-einkaeufer", { maximal: 30 });

/** Testhilfen: Ablage befuellen/leeren, ohne den e2-Weg zu beruehren. */
export function __einkaufAblageLeeren() { ablage.__leeren(); }
export async function __einkaufAblageSchreiben(datensatz, { env = {} } = {}) { return ablage.schreib(datensatz, { env }); }

// Die Einkaufsprobe: klein genug, um wöchentlich für JEDES Modell zu laufen
// (6 Proben x 4 Modelle = 24 Aufrufe pro Woche), aussagekräftig genug, um
// Ausfälle je Disziplin zu sehen. Jede Probe hat eine prüfbare Antwort —
// ein Modell wird nicht gefragt "bist du gut?", es muss liefern.
export const PROBEN = Object.freeze([
  { id: "wissen", task: "Wie heißt die Hauptstadt von Australien? Antworte nur mit dem Stadtnamen.", pruefe: (t) => /canberra/i.test(t) },
  { id: "rechnen", task: "Berechne 17 mal 23. Antworte nur mit der Zahl.", pruefe: (t) => /\b391\b/.test(t) },
  { id: "code", task: "Schreibe eine JavaScript-Funktion summe(a, b), die die Summe zurückgibt. Antworte nur mit Code.", pruefe: (t) => /function\s+summe|summe\s*=/.test(t) && /a\s*\+\s*b/.test(t) },
  { id: "logik", task: "Anna ist älter als Ben. Ben ist älter als Carl. Wer ist am jüngsten? Antworte nur mit dem Namen.", pruefe: (t) => /carl/i.test(t) && !/anna|(?<!ben.{0,40})ben\b/i.test(t.replace(/carl/ig, "")) },
  { id: "deutsch", task: "Wie lautet der Plural von Haus? Antworte nur mit dem einen Wort.", pruefe: (t) => /häuser/i.test(t) },
  { id: "disziplin", task: 'Antworte AUSSCHLIESSLICH mit diesem JSON und nichts sonst: {"bereit": true}', pruefe: (t) => { try { const j = JSON.parse(t.replace(/```(json)?/g, "").trim()); return j && j.bereit === true; } catch { return false; } } }
]);

/** SSE-Strom der Brücke zu Klartext zusammensetzen. */
export function sseZuText(roh) {
  const teile = [];
  for (const zeile of String(roh || "").split("\n")) {
    const m = zeile.match(/^data:\s*(.+)$/);
    if (!m || m[1] === "[DONE]") continue;
    try {
      const d = JSON.parse(m[1]);
      const stueck = d?.choices?.[0]?.delta?.content ?? d?.delta ?? d?.content ?? "";
      if (typeof stueck === "string") teile.push(stueck);
    } catch { /* Statuszeilen der Bruecke sind kein Inhalt */ }
  }
  return teile.join("");
}

/** Misst EIN Modell über den echten Nutzerweg. */
export async function messeModell(modellId, { token, basis = BRUECKE_STANDARD, fetchImpl = fetch, proben = PROBEN } = {}) {
  const einzel = [];
  for (const p of proben) {
    const start = Date.now();
    try {
      const antwort = await fetchImpl(`${basis.replace(/\/+$/, "")}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ task: p.task, model: modellId }),
        signal: AbortSignal.timeout(45_000)
      });
      const ms = Date.now() - start;
      if (!antwort.ok) { einzel.push({ probe: p.id, ok: false, ms, grund: `HTTP ${antwort.status}` }); continue; }
      const text = sseZuText(await antwort.text());
      einzel.push({ probe: p.id, ok: text.length > 0 && p.pruefe(text), ms, grund: text.length ? undefined : "leere Antwort" });
    } catch (fehler) {
      einzel.push({ probe: p.id, ok: false, ms: Date.now() - start, grund: fehler?.name === "TimeoutError" ? "Zeitlimit 45 s" : String(fehler?.message || fehler).slice(0, 60) });
    }
  }
  const treffer = einzel.filter((e) => e.ok).length;
  const zeiten = einzel.filter((e) => e.ok).map((e) => e.ms).sort((a, b) => a - b);
  return {
    modell: modellId,
    treffer,
    gesamt: einzel.length,
    medianMs: zeiten.length ? zeiten[Math.floor(zeiten.length / 2)] : null,
    einzel
  };
}

/**
 * Vergleicht die Messungen und formuliert die Empfehlung. REINE Funktion.
 * Regel: Ein Herausforderer wird nur empfohlen, wenn er MEHR Treffer hat —
 * oder gleich viele bei höchstens 60 % der Antwortzeit. Gleichstand gehört
 * dem Amtsinhaber: Modellwechsel haben Kosten (Verhalten, Prompts, Preise),
 * die die Probe nicht sieht.
 */
export function bewerteEinkauf(messungen = [], championId = "") {
  const sortiert = [...messungen].sort((a, b) => b.treffer - a.treffer || (a.medianMs ?? 1e9) - (b.medianMs ?? 1e9));
  const champion = messungen.find((m) => m.modell === championId) || null;
  const bester = sortiert[0] || null;
  let empfehlung = null;
  if (bester && champion && bester.modell !== champion.modell) {
    const deutlichBesser = bester.treffer > champion.treffer;
    const gleichAberSchneller = bester.treffer === champion.treffer
      && bester.medianMs != null && champion.medianMs != null
      && bester.medianMs <= champion.medianMs * 0.6;
    if (deutlichBesser || gleichAberSchneller) empfehlung = bester.modell;
  }
  const kurz = sortiert.map((m) => `${m.modell} ${m.treffer}/${m.gesamt}${m.medianMs != null ? ` ${m.medianMs}ms` : ""}`).join(" · ");
  return {
    rangliste: sortiert.map((m) => m.modell),
    empfehlung,
    meldung: empfehlung
      ? `EMPFEHLUNG: Wechsel zu ${empfehlung} — ${kurz}`
      : `${championId || sortiert[0]?.modell || "?"} bleibt vorn — ${kurz}`
  };
}

/** Der Wochen-Lauf. Liefert {ok, meldung} für die Ampel. */
export async function laufModellEinkauf({ env = process.env, fetchImpl = fetch, holeModelle = null } = {}) {
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (!secret) return { ok: false, meldung: "SMEJJ_SESSION_SECRET fehlt — Einkauf nicht messbar" };

  // Die Kandidaten aus der eigenen Gesundheitsauskunft — dieselbe Quelle wie
  // das Modell-Menü der Nutzer. Kein hart codiertes Einkaufsregal.
  let modelle, champion;
  try {
    if (holeModelle) {
      ({ modelle, champion } = await holeModelle());
    } else {
      const eigene = String(env.SMEJJ_CONTROL_SELF_URL || "https://smejj-control.zeabur.app").replace(/\/+$/, "");
      const h = await fetchImpl(`${eigene}/api/health`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json());
      const reg = h?.modelRegistry || {};
      modelle = (reg.models || []).filter((m) => m.active).map((m) => m.id);
      champion = reg.defaultModelId || h?.activeModelId || modelle[0];
    }
  } catch (fehler) {
    return { ok: false, meldung: `Modell-Liste nicht lesbar: ${String(fehler?.message || fehler).slice(0, 60)}` };
  }
  if (!modelle?.length) return { ok: false, meldung: "Keine aktiven Modelle in der Registry — nichts zu messen" };

  const token = issueSessionToken({
    secret,
    user: { userId: "modell-einkaeufer", email: "einkauf@smejj.invalid", method: "local-e2e" },
    ttlMs: 30 * 60 * 1000
  });

  const messungen = [];
  for (const id of modelle) messungen.push(await messeModell(id, { token, fetchImpl, basis: env.SMEJJ_BRUECKE_URL || BRUECKE_STANDARD }));

  const urteil = bewerteEinkauf(messungen, champion);
  // Bericht neustart-fest ablegen — die Ampel-Meldung ist die Kurzfassung,
  // die Zahlen je Probe stehen im Datensatz.
  await ablage.schreib({
    id: `einkauf-${new Date().toISOString().slice(0, 10)}`,
    createdAt: new Date().toISOString(),
    champion, messungen, urteil
  }, { env, timeoutMs: 20_000 }).catch(() => {});

  // Ein Lauf, in dem KEIN Modell auch nur eine Probe schafft, misst nicht
  // die Modelle, sondern einen Ausfall der Kette — dann ehrlich rot.
  const irgendwas = messungen.some((m) => m.treffer > 0);
  return { ok: irgendwas, meldung: irgendwas ? urteil.meldung : `Kein Modell bestand eine Probe — Kette prüfen (${urteil.meldung})` };
}

/**
 * Wochen-Takt, neustart-fest: Der Container wird bei jedem Push neu gebaut —
 * ein simpler setInterval(7 Tage) würde also nie feuern. Stattdessen liegt
 * der letzte Lauf in der Ablage; geprüft wird alle 12 Stunden, gelaufen wird
 * nur, wenn der letzte Einkauf älter als 6,5 Tage ist.
 */
const WOCHE_MS = 6.5 * 24 * 60 * 60 * 1000;

/**
 * Ein Pruef-Takt des Einkaeufers — eigenstaendig testbar.
 *
 * Bis 2026-08-13 kehrte der Takt WORTLOS um, wenn der letzte Einkauf juenger
 * als die Woche war: der Einkaeufer blieb tagelang grau, obwohl er gesund
 * war — und genau dieses Grau verdeckte den echten Fehler (der Start-Aufruf
 * fehlte komplett). Jetzt ist auch das Ueberspringen eine MESSUNG mit
 * Meldung: gelesen wurde die Ablage wirklich, das Alter ist gerechnet, das
 * naechste Arena-Datum steht dabei. Kein Stempel — jede Zahl kommt aus dem
 * Store.
 */
export async function pruefeEinkaufsTakt({ env = process.env, melde = null, jetztMs = Date.now(), einkauf = laufModellEinkauf } = {}) {
  try {
    const letzte = await ablage.liste({ env }).catch(() => null);
    const juengste = (letzte?.datensaetze || [])
      .map((d) => Date.parse(d?.createdAt || 0))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0] || 0;
    if (juengste && jetztMs - juengste < WOCHE_MS) {
      const tage = Math.floor((jetztMs - juengste) / 86_400_000);
      const naechste = new Date(juengste + WOCHE_MS).toISOString().slice(0, 10);
      if (melde) {
        melde("modell-einkaeufer", {
          status: "ok",
          meldung: `Takt geprueft: letzter Einkauf vor ${tage} Tag(en), Ablage lesbar — naechste Wochen-Arena am ${naechste}`,
          dauerMs: null
        });
      }
      return { gelaufen: false };
    }
    const ergebnis = await einkauf({ env });
    if (melde) melde("modell-einkaeufer", { status: ergebnis.ok ? "ok" : "fehler", meldung: ergebnis.meldung, dauerMs: null });
    return { gelaufen: true, ergebnis };
  } catch (fehler) {
    // Auch das Scheitern der Pruefung ist ein Befund, kein Schweigen.
    if (melde) {
      melde("modell-einkaeufer", {
        status: "fehler",
        meldung: `Pruef-Takt gescheitert: ${String(fehler?.message || fehler).slice(0, 100)}`,
        dauerMs: null
      });
    }
    return { gelaufen: false, fehler: true };
  }
}

export function starteModellEinkaeufer({ env = process.env, melde = null, pruefIntervallMs = 12 * 60 * 60 * 1000 } = {}) {
  const tick = () => { pruefeEinkaufsTakt({ env, melde }).catch(() => {}); };
  // Erster Check kurz nach dem Start (der Boot soll nicht auf 24 Messungen warten).
  const anlauf = setTimeout(tick, 3 * 60 * 1000);
  if (typeof anlauf.unref === "function") anlauf.unref();
  const zeitgeber = setInterval(tick, pruefIntervallMs);
  if (typeof zeitgeber.unref === "function") zeitgeber.unref();
  return zeitgeber;
}
