// smejj.com — Maus-Diagnose: die Deutung der Messwerte, ohne Netz und ohne
// Konsole.
//
// Single Responsibility: aus rohen Messwerten (Manifest, HTTP-Status,
// Fingerabdruecke) einen Befund machen. Die beiden Skripte daneben messen und
// drucken, sie deuten nicht selbst — deshalb ist die Deutung hier pruefbar,
// ohne dass ein Test einen Server oder Zugangsdaten braucht.
//
// Warum es dieses Modul gibt: Die Zusammenfassung der Beweise lag zuerst in
// maus-direktlauf.mjs und las das Manifest-Feld "entries". Das Feld heisst
// "objects" (artifact-uploader.mjs). Ergebnis: ein vollstaendig gelungener
// Lauf mit 7 Objekten wurde als "0 Beweise" gemeldet — ein Messfehler, der wie
// ein Produktionsfehler aussah. Genau solche Faelle gehoeren unter Test.
import crypto from "node:crypto";

// Von Geheimnissen wird ausschliesslich Laenge und der Anfang des SHA-256
// gezeigt. Das reicht fuer "gleich oder ungleich" und verraet den Wert nicht.
export function fingerabdruck(wert) {
  const s = String(wert ?? "");
  return {
    vorhanden: s.length > 0,
    laenge: s.length,
    sha8: s ? crypto.createHash("sha256").update(s).digest("hex").slice(0, 8) : "-",
    sauber: s === s.trim()
  };
}

export function gleicherWert(a, b) {
  return Boolean(a?.vorhanden && b?.vorhanden && a.laenge === b.laenge && a.sha8 === b.sha8);
}

// Manifest der Maus-Engine: das Feld heisst "objects" (nicht "entries").
// Nur zaehlen und benennen, nie Inhalte ausgeben — Screenshots koennen
// angemeldete Seiten zeigen, das Aktionsprotokoll kann Formularwerte tragen.
export function belegeZusammenfassen(manifest) {
  const eintraege = Array.isArray(manifest?.objects) ? manifest.objects : [];
  const bilder = eintraege.filter((e) => /\.png\.gz$/.test(String(e?.key ?? "")));
  return {
    objekte: eintraege.length,
    screenshots: bilder.length,
    praefix: eintraege.length ? String(eintraege[0].key).split("/").slice(0, -1).join("/") : null,
    schluessel: eintraege.map((e) => String(e?.key ?? "").split("/").pop()).filter(Boolean)
  };
}

// Ein 403 und ein 404 sind zwei verschiedene Befunde. Sie zu vermischen war
// der Grund, warum das Eimer-Problem lange als "Konto-Problem" galt.
export function deuteEimerStatus(status) {
  const s = String(status);
  if (s === "403") return "anderes Konto";
  if (s === "404") return "gleiches Konto, Objekt fehlt";
  return "unklar";
}

// Ein Lauf gilt nur mit abgelegten Beweisen als Erfolg (fail-closed):
// Schritte ohne Beleg sind nicht nachvollziehbar und damit kein Ergebnis.
export function laufBefund({ ok, objekte }) {
  if (ok && objekte > 0) return "engine_vollstaendig";
  if (ok) return "ohne_beweise";
  return "lauf_gescheitert";
}

// Der Eimer-Unterschied hat ZWEI Loesungen. Gemessen am 2026-07-29 ist die
// zweite deutlich billiger, und `gatekeeper/presignIdrive.js` hat den Schalter
// dafuer schon eingebaut (`resolveBucketForKey`: nur der Prefix
// `capsules/maus-engine/` folgt `IDRIVE_E2_CAPSULES_BUCKET`).
//
//   Weg A — Engine umziehen: IDRIVE_E2_BUCKET plus BEIDE IDrive-Schluessel
//            beim Zeabur-Dienst tauschen. Drei Geheimwerte wandern.
//   Weg B — Leseweg umlenken: EIN Wert beim Control-Server,
//            `IDRIVE_E2_CAPSULES_BUCKET` auf den Eimer, in den die Engine
//            ohnehin schreibt. KEIN Geheimwert wandert.
//
// Weg B ist empfohlen, und zwar nicht nur weil er kuerzer ist:
//   - Der Control-Server kann diesen Eimer BEWEISBAR lesen — er laedt sein
//     eigenes Release-Artefakt daraus (IDRIVE_E2_DEPLOY_BUCKET, siehe
//     public/deploy/idrive-control-bootstrap.mjs). Laeuft er, hat er Zugang.
//   - Task Capsules liegen dort ohnehin schon
//     (scripts/agent/upload_capsule_to_idrive.mjs). Es ist also kein Bruch der
//     Ablage-Ordnung, sondern deren Fortsetzung.
//   - `IDRIVE_E2_BUCKET` bleibt unangetastet: Nutzer, Anmeldung und alle
//     anderen Daten ruehrt Weg B nicht an.
//   - Umkehrbar durch Zuruecksetzen eines einzigen Wertes. Nichts wird
//     geloescht oder verschoben.
// Preis von Weg B: Laeufe, die noch im alten Eimer liegen, sind in der
// Wiedergabe nicht mehr auffindbar (geloescht wird nichts).
export function handlungsanweisung({ tokenGleich, eimerFalsch, zielEimer, region, endpoint, engineEimer, weg = "B" }) {
  if (tokenGleich && !eimerFalsch) return [];
  const schritte = [];
  if (eimerFalsch && weg === "B") {
    schritte.push(`Control-Server: IDRIVE_E2_CAPSULES_BUCKET = ${engineEimer} (kein Geheimwert)`);
  }
  if (!tokenGleich) schritte.push("SMEJJ_MAUS_ENGINE_TOKEN auf beiden Seiten gleich setzen (64 Zeichen, ohne Leerzeichen)");
  if (eimerFalsch && weg === "A") {
    schritte.push(`Engine: IDRIVE_E2_BUCKET = ${zielEimer}`);
    schritte.push("Engine: IDRIVE_E2_ACCESS_KEY / IDRIVE_E2_SECRET_KEY = die Werte des Control-Servers");
    schritte.push(`Engine: IDRIVE_E2_REGION = ${region}, IDRIVE_E2_ENDPOINT = ${endpoint}`);
  }
  return schritte;
}
