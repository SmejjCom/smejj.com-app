// smejj.com — Kosten-Wache (Autopilot Nr. 55): rechnet den gemessenen
// Modell-Verbrauch in Geld um und schlägt an, BEVOR ein Tag das Budget reißt.
//
// Die Zahlen kommen aus dem Token-Messer (tokenMesser.js) — dort zählt jede
// echte Anfrage ihre Tokens ("quelle: gemessen"), die Preisliste rechnet sie
// in USD um. Diese Wache erfindet nichts: sie liest den Bericht desselben
// Moduls, das auch der Adminbereich zeigt.
//
// EHRLICH BENANNT: Der Arbeitsspeicher des Token-Messers ist nach jedem
// Neustart leer (die [verbrauch]-Logzeilen überleben ihn, aber die schnelle
// Ansicht nicht). Ein niedriger Tageswert kurz nach einem Deploy ist darum
// eine Untergrenze — die Meldung sagt das dazu, statt Genauigkeit zu spielen.
// Zeabur-Fixkosten stehen nicht in dieser Ampel: sie ändern sich nicht
// stündlich, und eine Zahl, die sich nie ändert, wäre ein Stempel.
import { bericht } from "../llm/tokenMesser.js";

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

/** Selbsttest: gerissenes Budget MUSS auffallen, normaler Verbrauch nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = beurteileTag({ kostenUsd: 31.5 }, { budgetUsd: 25 });
  if (kaputt.stufe !== "rot") fehler.push("gerissenes Budget wird nicht rot");
  const knapp = beurteileTag({ kostenUsd: 21 }, { budgetUsd: 25 });
  if (knapp.stufe !== "warnung") fehler.push("84 % Verbrauch löst keine Warnung aus");
  const gesund = beurteileTag({ kostenUsd: 3.2 }, { budgetUsd: 25 });
  if (gesund.stufe !== "ok") fehler.push("normaler Verbrauch löst fälschlich aus");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann der echte Tagesbericht.
 */
export function laufKostenWache({ env = process.env, berichtLader = bericht, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Kosten-Wache rechnet bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  const budget = tagesBudgetUsd(env);
  const heute = new Date(jetztMs).toISOString().slice(0, 10);
  let daten;
  try {
    daten = berichtLader({ tag: heute });
  } catch (f) {
    return { ok: false, meldung: `Token-Messer nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  const tag = (daten?.tage || [])[0];
  if (!tag) {
    return { ok: true, meldung: `Selbsttest 3/3; heute noch kein gemessener Verbrauch (Budget ${budget} USD) — Untergrenze, falls der Dienst frisch gestartet ist` };
  }
  const urteil = beurteileTag(tag, { budgetUsd: budget });
  const teuerstes = (tag.modelle || [])[0];
  const zusatz = teuerstes ? ` — meistgenutzt: ${teuerstes.modell} (${teuerstes.anfragen} Anfragen)` : "";
  if (urteil.stufe === "rot") {
    return { ok: false, meldung: `${urteil.grund}${zusatz}` };
  }
  if (urteil.stufe === "warnung") {
    return { ok: false, meldung: `${urteil.grund}${zusatz} — noch nicht gerissen, aber auf Kurs` };
  }
  return { ok: true, meldung: `Selbsttest 3/3; Tageskosten ${urteil.grund}, ${tag.anfragen || 0} Anfragen${zusatz}` };
}
