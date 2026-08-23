// smejj.com — Daten-Sicherung (Nr. 46) und Wiederherstellungs-Probe (Nr. 47).
//
// WARUM ES SIE GIBT: Der Codeberg-Spiegel (Nr. 02) sichert jede Nacht den
// CODE — die BETRIEBSDATEN (Tickets, Aufgaben, Einwilligungen, Nutzer-
// Gedächtnis) hatten kein Backup und keine einzige geprüfte Rücksicherung.
// Ein Backup, das nie zurückgelesen wurde, ist eine Hoffnung, kein Backup
// (Branchen-Regel: der Wiederherstellungs-TEST gehört zum Backup dazu).
//
// GRENZE, ehrlich benannt: Der Schnappschuss liegt im SELBEN Eimer unter
// eigenem Präfix (sicherung/) — er schützt gegen Überschreiben, Löschen und
// kaputte Einzeldatensätze, NICHT gegen den Verlust des ganzen Eimers. Ein
// zweiter Eimer braucht einen zweiten Schlüssel (die hinterlegten dürfen
// nicht überall schreiben — Modul-Gedächtnis "Eimer hängt am Schlüssel");
// das ist eine Betreiber-Entscheidung und steht in der Tagesmappe als
// offener Punkt, solange sie fehlt. Die Nutzer-CHATS (chats/) sichern wir
// hier bewusst nicht mit: sie sind um Größenordnungen größer und brauchen
// den zweiten Eimer, nicht einen Schnappschuss daneben.
import crypto from "node:crypto";
import { createRecordStore } from "../admin/recordStore.js";

/** Die Betriebs-Ablagen, die gesichert werden — mit Deckel je Ablage. */
export const SICHERUNGS_QUELLEN = Object.freeze([
  { praefix: "admin/flags", limit: 200 },
  { praefix: "admin/gdpr", limit: 200 },
  { praefix: "admin/moderation", limit: 200 },
  { praefix: "admin/aufgaben", limit: 200 },
  { praefix: "support/tickets", limit: 200 },
  { praefix: "evolution/aufgaben", limit: 200 },
  { praefix: "evolution/kennzahlen", limit: 100 },
  { praefix: "user-memory", limit: 200 }
]);

const TAG_MS = 24 * 60 * 60 * 1000;

let sicherungsAblage = null;
function holeSicherungsAblage(ablage) {
  if (ablage) return ablage;
  if (!sicherungsAblage) sicherungsAblage = createRecordStore("sicherung/taeglich", { maximal: 40 });
  return sicherungsAblage;
}

/** Prüfsumme über den Inhalt — die Wahrheit der Rücklese-Probe. */
export function pruefsumme(quellen) {
  return crypto.createHash("sha256").update(JSON.stringify(quellen)).digest("hex");
}

/**
 * Prüft einen Schnappschuss auf Unversehrtheit: stimmt die gespeicherte
 * Prüfsumme mit dem Inhalt überein? Getrennt testbar (kaputt + gesund).
 */
export function pruefeSchnappschuss(schnappschuss) {
  if (!schnappschuss || !Array.isArray(schnappschuss.quellen) || !schnappschuss.pruefsumme) {
    return { intakt: false, grund: "Schnappschuss unvollständig (quellen oder pruefsumme fehlen)" };
  }
  const errechnet = pruefsumme(schnappschuss.quellen);
  if (errechnet !== schnappschuss.pruefsumme) {
    return { intakt: false, grund: `Prüfsumme weicht ab (gespeichert ${String(schnappschuss.pruefsumme).slice(0, 12)}…, errechnet ${errechnet.slice(0, 12)}…)` };
  }
  return { intakt: true, grund: "Prüfsumme stimmt" };
}

/** Selbsttest: eine manipulierte Kopie MUSS auffallen, eine intakte nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const quellen = [{ praefix: "probe", anzahl: 1, datensaetze: [{ id: "p1", wert: 42 }] }];
  const gesund = pruefeSchnappschuss({ quellen, pruefsumme: pruefsumme(quellen) });
  if (!gesund.intakt) fehler.push("intakter Schnappschuss wird fälschlich verworfen");
  const manipuliert = JSON.parse(JSON.stringify({ quellen, pruefsumme: pruefsumme(quellen) }));
  manipuliert.quellen[0].datensaetze[0].wert = 43;
  const kaputt = pruefeSchnappschuss(manipuliert);
  if (kaputt.intakt) fehler.push("manipulierter Schnappschuss gilt fälschlich als intakt");
  const leer = pruefeSchnappschuss(null);
  if (leer.intakt) fehler.push("fehlender Schnappschuss gilt fälschlich als intakt");
  return { bestanden: fehler.length === 0, fehler };
}

/** Sammelt den Inhalt aller Quellen ein. */
export async function erstelleSchnappschuss({ quellen = SICHERUNGS_QUELLEN, storeFabrik = createRecordStore, jetztIso = new Date().toISOString() } = {}) {
  const inhalt = [];
  const stumm = [];
  for (const q of quellen) {
    try {
      const store = storeFabrik(q.praefix, { maximal: q.limit });
      const ergebnis = await store.liste({ limit: q.limit });
      if (!ergebnis.ok) { stumm.push(`${q.praefix} (${ergebnis.error || "Liste gescheitert"})`); continue; }
      inhalt.push({ praefix: q.praefix, anzahl: ergebnis.datensaetze.length, datensaetze: ergebnis.datensaetze });
    } catch (f) {
      stumm.push(`${q.praefix} (${String(f?.message || f).slice(0, 60)})`);
    }
  }
  return {
    id: `sicherung_${jetztIso.slice(0, 10)}`,
    createdAt: jetztIso,
    quellen: inhalt,
    stummeQuellen: stumm,
    pruefsumme: pruefsumme(inhalt)
  };
}

/**
 * Nr. 46, der Lauf im Takt: einmal täglich sichern, danach SOFORT zurücklesen
 * und die Prüfsumme vergleichen — geschrieben heißt noch nicht lesbar. In den
 * übrigen Takten meldet er den gemessenen Stand.
 */
export async function laufDatenSicherung({ ablage = null, quellen = SICHERUNGS_QUELLEN, storeFabrik = createRecordStore, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Sicherungs-Prüfung erkennt bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeSicherungsAblage(ablage);
  const jetztIso = new Date(jetztMs).toISOString();
  const heutigeId = `sicherung_${jetztIso.slice(0, 10)}`;

  let heutige = null;
  try { heutige = await speicher.lies(heutigeId); } catch { /* wird unten neu geschrieben */ }
  if (heutige) {
    const zustand = pruefeSchnappschuss(heutige);
    if (!zustand.intakt) {
      return { ok: false, meldung: `Heutige Sicherung liegt vor, ist aber NICHT intakt: ${zustand.grund}` };
    }
    const objekte = heutige.quellen.reduce((s, q) => s + q.anzahl, 0);
    return { ok: true, meldung: `Sicherung aktuell (${heutigeId.slice(10)}): ${heutige.quellen.length} Ablagen, ${objekte} Datensätze, Prüfsumme geprüft${heutige.stummeQuellen?.length ? ` — ${heutige.stummeQuellen.length} stumme Quelle(n)` : ""}` };
  }

  const schnappschuss = await erstelleSchnappschuss({ quellen, storeFabrik, jetztIso });
  if (!schnappschuss.quellen.length) {
    return { ok: false, meldung: `Sicherung ohne Inhalt: ALLE ${quellen.length} Quellen stumm (${schnappschuss.stummeQuellen.join("; ").slice(0, 120)})` };
  }
  try {
    await speicher.schreib(schnappschuss, { timeoutMs: 20_000 });
  } catch (f) {
    return { ok: false, meldung: `Sicherung ließ sich nicht schreiben: ${String(f?.message || f).slice(0, 100)}` };
  }
  const zurueck = await speicher.lies(schnappschuss.id);
  const zustand = pruefeSchnappschuss(zurueck);
  if (!zustand.intakt) {
    return { ok: false, meldung: `Sicherung geschrieben, aber die Rücklese-Probe fällt: ${zustand.grund}` };
  }
  const objekte = schnappschuss.quellen.reduce((s, q) => s + q.anzahl, 0);
  return {
    ok: true,
    meldung: `Neue Sicherung geschrieben und zurückgelesen: ${schnappschuss.quellen.length} Ablagen, ${objekte} Datensätze`
      + (schnappschuss.stummeQuellen.length ? ` — stumm: ${schnappschuss.stummeQuellen.join("; ").slice(0, 80)}` : "")
  };
}

/**
 * Nr. 47, der Lauf im Takt: liest die JÜNGSTE Sicherung vollständig zurück,
 * prüft die Prüfsumme und misst dabei zwei Zahlen, die im Ernstfall zählen:
 * wie ALT die Sicherung ist (RPO — so viel wäre verloren) und wie LANGE das
 * Zurücklesen dauert (RTO-Anteil). Älter als 2 Tage = rot.
 */
export async function laufWiederherstellungsProbe({ ablage = null, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Wiederherstellungs-Prüfung erkennt bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeSicherungsAblage(ablage);
  const begonnen = Date.now();
  let liste;
  try {
    liste = await speicher.liste({ limit: 3 });
  } catch (f) {
    return { ok: false, meldung: `Sicherungs-Ablage nicht lesbar: ${String(f?.message || f).slice(0, 100)}` };
  }
  if (!liste.ok || !liste.datensaetze.length) {
    return { ok: false, meldung: "KEINE Sicherung vorhanden — im Ernstfall gäbe es nichts zurückzuspielen" };
  }
  const juengste = liste.datensaetze[0];
  const zustand = pruefeSchnappschuss(juengste);
  const leseMs = Date.now() - begonnen;
  if (!zustand.intakt) {
    return { ok: false, meldung: `Jüngste Sicherung (${juengste.id}) ist NICHT wiederherstellbar: ${zustand.grund}` };
  }
  const alterMs = jetztMs - Date.parse(juengste.createdAt || 0);
  const alterH = Math.round(alterMs / 3_600_000);
  if (!Number.isFinite(alterMs) || alterMs > 2 * TAG_MS) {
    return { ok: false, meldung: `Jüngste intakte Sicherung ist ${Number.isFinite(alterMs) ? `${alterH} h` : "unbestimmt"} alt — mehr als 2 Tage Datenverlust im Ernstfall` };
  }
  const objekte = (juengste.quellen || []).reduce((s, q) => s + (q.anzahl || 0), 0);
  return {
    ok: true,
    meldung: `Rücksicherung geprüft: ${juengste.id} intakt, ${objekte} Datensätze, `
      + `${alterH} h alt (Datenverlust-Fenster), Rücklese in ${leseMs} ms`
  };
}
