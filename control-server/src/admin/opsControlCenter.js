// smejj.com — Autopilot Control Center (Master-Audit 2026-09-15, Betreiber-Auftrag
// Punkt 13/14: "Ich möchte im Adminbereich einen zentralen Bereich sehen:
// AUTOPILOT CONTROL CENTER").
//
// Die Seite beantwortet die zwölf Fragen des Betreibers in Klartext — Was läuft?
// Was ist kaputt? Welches Modell? Was kostet es? Kann ich zurückrollen? — und
// zeigt jeden Autopiloten mit Status, Wirkung, letzter und nächster Aufgabe.
//
// DIESELBE REGEL WIE DAS COCKPIT: Jede Antwort ist aus einer Messung gebaut und
// nennt ihre Belege (Autopilot, Ampel, Meldung). Wo nichts gemessen wird, sagt
// die Antwort das. Keine neue Datenquelle, kein Schreibweg, kein Netz: alles
// stammt aus den abgelegten Herzschlägen (autopilotUebersicht).

import { autopilotUebersicht } from "./opsAutopiloten.js";
import { wirkungVon, KETTE } from "./autopilotWirkung.js";
import { evaluateAiAvailability } from "../llm/aiAvailability.js";

const RANG = { rot: 0, gelb: 1, grau: 2, wartung: 3, gruen: 4 };
const ARBEITET = /läuft gerade|Messung gestartet|im Hintergrund gestartet/i;

/** Status in den Worten des Auftrags: aktiv / wartet / arbeitet / Fehler / blockiert / Test. */
export function statusVon(a) {
  if (a.ampel === "wartung") return "blockiert";
  if (a.ampel === "rot") return "fehler";
  if (ARBEITET.test(String(a.letzterLauf?.meldung || ""))) return "arbeitet";
  if (a.ampel === "gelb" || a.ampel === "grau") return "wartet";
  return wirkungVon(a.id).stufe === "baustein" ? "test" : "aktiv";
}

const kurz = (text, n = 220) => {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function beleg(a) {
  if (!a) return null;
  return { id: a.id, nummer: a.nummer || null, name: a.name, ampel: a.ampel, am: a.letzterLauf?.am || null, meldung: kurz(a.letzterLauf?.meldung || a.ampelGrund) };
}

function schlechteste(belege) {
  const liste = belege.filter(Boolean);
  if (!liste.length) return "grau";
  return liste.reduce((s, b) => ((RANG[b.ampel] ?? 9) < (RANG[s] ?? 9) ? b.ampel : s), "gruen");
}

function antwort(frage, satz, belege, ampel = null) {
  const b = belege.filter(Boolean);
  return { frage, satz, ampel: ampel || schlechteste(b), belege: b };
}

function modellSatz(env) {
  try {
    const standard = evaluateAiAvailability(env, "default");
    const tief = evaluateAiAvailability(env, "coding");
    if (!standard.ai && !tief.ai) return { satz: "Kein Modell ist gerade freigeschaltet — der Chat antwortet nur mit dem Notfall-Assistenten.", ampel: "rot" };
    return {
      satz: `Schnelle Antworten: ${standard.aiBackend || "—"}. Nachdenken und Coding: ${tief.aiBackend || "—"}. `
        + "Der Chat der Nutzer läuft über die Brücke; welche Spur sie wählt, misst die Qualitätsmessung (Nr. 01) und die Tiefe-Spur-Messung (Nr. 75).",
      ampel: "gruen"
    };
  } catch (fehler) {
    return { satz: `Modellwahl nicht lesbar: ${kurz(fehler?.message || fehler, 80)}`, ampel: "grau" };
  }
}

/** Die Seite als Daten. Getrennt testbar: `uebersicht` kann eingespielt werden. */
export function controlCenterUebersicht({ jetztMs = Date.now(), env = process.env, uebersicht = null } = {}) {
  const ap = uebersicht || autopilotUebersicht({ jetztMs });
  const liste = ap.autopiloten || [];
  const nach = new Map(liste.map((a) => [a.id, a]));
  const hol = (...ids) => ids.map((id) => beleg(nach.get(id)));

  const autopiloten = liste.map((a) => {
    const w = wirkungVon(a.id);
    return {
      id: a.id, nummer: a.nummer || null, name: a.name, bereich: a.bereich || null, ampel: a.ampel,
      status: statusVon(a), wirkung: w.stufe, wirkungGrund: w.grund,
      letzteAufgabe: kurz(a.letzterLauf?.meldung || a.ampelGrund, 300), letzteAm: a.letzterLauf?.am || null,
      naechsteAufgabe: a.zeitplan || null, erfolgsquote90: a.erfolgsquote90 || null, dauerMs: a.letzterLauf?.dauerMs ?? null
    };
  }).sort((x, y) => (RANG[x.ampel] ?? 9) - (RANG[y.ampel] ?? 9) || String(x.nummer).localeCompare(String(y.nummer)));

  const zaehler = { aktiv: 0, arbeitet: 0, wartet: 0, fehler: 0, blockiert: 0, test: 0 };
  for (const a of autopiloten) zaehler[a.status] = (zaehler[a.status] || 0) + 1;
  const echtGruen = autopiloten.filter((a) => a.ampel === "gruen" && a.wirkung === "echt").length;
  const teilGruen = autopiloten.filter((a) => a.ampel === "gruen" && a.wirkung === "teilweise").length;
  const rote = autopiloten.filter((a) => a.ampel === "rot");
  const sicherheitRot = rote.filter((a) => /Sicherheit/.test(a.bereich || ""));
  const arbeitend = autopiloten.filter((a) => a.status === "arbeitet");
  const modell = modellSatz(env);

  const antworten = [
    antwort("Was läuft?", `${echtGruen} Automatiken arbeiten nachweislich am echten System, ${teilGruen} mit engem Blick, ${zaehler.test} sind nur Bausteine im Selbsttest.`, [], rote.length ? "gelb" : "gruen"),
    antwort("Was ist kaputt?", rote.length ? `${rote.length} ${rote.length === 1 ? "Automatik meldet" : "Automatiken melden"} einen Fehler: ${rote.map((a) => a.name).join(", ")}.` : "Keine Automatik meldet einen Fehler.", rote.map((a) => beleg(nach.get(a.id))), rote.length ? "rot" : "gruen"),
    antwort("Was arbeitet gerade?", arbeitend.length ? `${arbeitend.map((a) => a.name).join(", ")} ${arbeitend.length === 1 ? "misst" : "messen"} gerade im Hintergrund.` : "Gerade läuft keine Hintergrund-Messung; der Läufer taktet alle 30 Minuten.", arbeitend.map((a) => beleg(nach.get(a.id))), "gruen"),
    antwort("Welches Modell wird benutzt?", modell.satz, hol("modell-katalog-wache", "umgebungs-wache"), modell.ampel),
    antwort("Welche Autopiloten laufen?", `${zaehler.aktiv} aktiv, ${zaehler.arbeitet} arbeiten, ${zaehler.wartet} warten, ${zaehler.fehler} mit Fehler, ${zaehler.blockiert} blockiert (Wartung), ${zaehler.test} nur Test — ${autopiloten.length} gesamt.`, [], rote.length ? "gelb" : "gruen"),
    antwort("Welche Verbesserungen wurden gefunden?", "Werkstatt-Backlog, Konkurrenz-Radar (mit Release-Notes) und Funktions-Abgleich — Kandidaten sind Messungen, erst deine Entscheidung macht daraus eine Aufgabe.", hol("werkstatt-autopilot", "konkurrenz-radar", "missing-function-detector", "ai-evolution-engine")),
    antwort("Welche Änderungen wurden gemacht?", "Der Control-Server läuft mit dem Commit, den die Bau-Wache nennt; die Schutz-Echtheit vergleicht die ausgelieferten Dateien mit ihren Freigaben.", hol("bau-wache", "schutz-echtheit", "code-sicherung")),
    antwort("Welche Tests bestanden?", "Unit-Tests, Nutzerreise, Antwortqualität (Schnell- und Tiefspur) und Angriffsproben — je mit letzter Messung.", hol("test-waechter", "synthetic-user-watchdog", "qualitaetsmessung", "tiefe-spur-messung", "red-team-probe")),
    antwort("Was kostet das System?", "Modellkosten aus dem Token-Messer des Control-Servers (Untergrenze: nach Neustart leer, Brücken-Verbrauch nicht enthalten), Speicher-Füllstand aus e2. Fest: Control-Server 6 USD/Monat laut Vertrag.", hol("kosten-wache", "speicher-wache", "abo-umsatz-wache")),
    antwort("Welche Sicherheitsprobleme existieren?", sicherheitRot.length ? `${sicherheitRot.length} offene Befunde im Wachdienst: ${sicherheitRot.map((a) => a.name).join(", ")}.` : "Kein Wächter aus dem Bereich Sicherheit meldet einen Fehler.", sicherheitRot.length ? sicherheitRot.map((a) => beleg(nach.get(a.id))) : hol("konto-wache", "geheimnis-spaeher", "red-team-probe"), sicherheitRot.length ? "rot" : null),
    antwort("Was wurde veröffentlicht?", "Server-Commit (Bau-Wache), Brücken-Version (Brücken-Wächter) und die Frontend-Dateien gegen ihre Freigabe-Manifeste.", hol("bau-wache", "brueckenwaechter", "schutz-echtheit")),
    antwort("Kann ich zurückrollen?", "Der Rück-Roller nennt den letzten stabilen Server-Stand; Datensicherung und Rücksicherungs-Probe zeigen, ob die Daten wiederherstellbar sind. Frontend: jeder Stand liegt als Git-Commit im Frontend-Repo.", hol("rueck-roller", "daten-sicherung", "wiederherstellungs-probe"))
  ];

  const kette = KETTE.map((k) => {
    const zustaendig = k.ids.map((id) => {
      const a = nach.get(id);
      return a ? { id, nummer: a.nummer || null, name: a.name, ampel: a.ampel, wirkung: wirkungVon(id).stufe } : null;
    }).filter(Boolean);
    const traegt = zustaendig.some((z) => z.wirkung === "echt" && z.ampel !== "rot");
    const zustand = !zustaendig.length ? "reisst" : k.luecke ? (traegt ? "teilweise" : "reisst") : (traegt ? "traegt" : "teilweise");
    return { schritt: k.schritt, zustand, zustaendig, luecke: k.luecke };
  });

  return {
    ok: true,
    zeitpunkt: new Date(jetztMs).toISOString(),
    zaehler,
    antworten,
    kette,
    autopiloten,
    hinweis: "Status und Belege stammen aus den gemessenen Herzschlägen. „Wirkung“ ist eine geprüfte Einstufung des Codes (Audit 15.09.): "
      + "Bausteine prüfen nur feste Beispiel-Eingaben und sagen nichts über die Live-Plattform."
  };
}
