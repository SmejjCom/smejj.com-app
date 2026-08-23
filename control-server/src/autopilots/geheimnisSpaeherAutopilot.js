// smejj.com — Geheimnis-Späher (Autopilot Nr. 48): findet Schlüssel, Tokens
// und private Schlüsselblöcke im Quelltext, BEVOR sie jemand von außen findet.
//
// Er scannt im Takt die echten Quelldateien dieses Containers (dieselbe
// Dateiliste wie Bug-Predictor und Code-Landkarte) — kein künstliches
// Beispiel, sondern der Code, der gerade läuft.
//
// ZWEI LEHREN stecken in der Bauart:
// 1. Die Probe-Schlüssel des Selbsttests werden ZUSAMMENGESETZT statt
//    hingeschrieben — sonst schlägt der Release-Secret-Scanner auf diese
//    Datei selbst an und blockiert jeden Bau (gemessen 2026-08-14 beim
//    PII-Filter, dieselbe Falle).
// 2. Zeilen mit Entwarnungs-Wörtern (beispiel, probe, platzhalter, example)
//    zählen nicht als Fund: Doku und Tests DÜRFEN Muster zeigen. Ein echter
//    Schlüssel neben dem Wort "beispiel" bliebe unsichtbar — diese Grenze
//    steht hier, damit sie jeder kennt.

/** Erkennungsmuster mit Klartext-Namen. Bewusst konservativ gegen Fehlalarme. */
export const GEHEIMNIS_MUSTER = Object.freeze([
  { name: "OpenAI-artiger Schlüssel", muster: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "AWS-Zugangsschlüssel", muster: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub-Token", muster: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "Slack-Token", muster: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "privater Schlüsselblock", muster: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Google-API-Schlüssel", muster: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "hartes Passwort/Secret im Code", muster: /\b(?:password|passwort|secret|api_key|apikey)\b\s*[:=]\s*["'][^"'\s]{16,}["']/i }
]);

const ENTWARNUNG = /beispiel|probe|platzhalter|example|redacted|xxxx|dein-|your-|\.repeat\(/i;

/**
 * Durchsucht Dateien ({path, content}) nach Geheimnis-Mustern.
 * Getrennt von der Außenwelt, damit der Selbsttest kaputt UND gesund prüft.
 */
export function findeGeheimnisse(dateien = []) {
  const funde = [];
  for (const datei of dateien) {
    const zeilen = String(datei?.content || "").split("\n");
    for (let i = 0; i < zeilen.length; i++) {
      const zeile = zeilen[i];
      if (ENTWARNUNG.test(zeile)) continue;
      for (const { name, muster } of GEHEIMNIS_MUSTER) {
        if (muster.test(zeile)) {
          funde.push({ pfad: datei.path, zeile: i + 1, art: name });
          break; // eine Zeile, ein Fund — sonst zählt derselbe Treffer doppelt
        }
      }
    }
  }
  return { funde, geprueft: dateien.length };
}

/** Selbsttest: eingeschleuste Geheimnisse MÜSSEN auffallen, saubere Zeilen nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  // Zusammengesetzt, damit kein Scanner diese Datei selbst als Fund meldet.
  const probeSk = "sk-" + "A1b2".repeat(6);
  const probeAws = "AKIA" + "B7QZX2LM9RTK4WNE";
  const probeBlock = ["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ");
  const kaputt = findeGeheimnisse([{
    path: "kaputte-datei.js",
    content: `const a = "${probeSk}";\nconst b = "${probeAws}";\nconst c = \`${probeBlock}\`;`
  }]);
  if (kaputt.funde.length < 3) fehler.push(`kaputte Datei: nur ${kaputt.funde.length}/3 Geheimnisse gefunden`);
  const gesund = findeGeheimnisse([{
    path: "gesunde-datei.js",
    content: "const url = process.env.SMEJJ_BRUECKE_URL;\nconst text = \"skalierbar und sk-eptisch\";\nconst n = 42;"
  }]);
  if (gesund.funde.length !== 0) fehler.push(`gesunde Datei löst ${gesund.funde.length} Fehlalarm(e) aus`);
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann der echte Container-Quelltext.
 * JEDER Fund ist rot — ein Geheimnis im Code duldet keine Schonfrist.
 */
export function laufGeheimnisSpaeher(dateien = []) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Geheimnis-Späher erkennt bekannte Muster nicht mehr: ${probe.fehler.join("; ")}` };
  }
  if (!dateien.length) {
    return { ok: false, meldung: "Kein Quelltext gefunden — Scan ohne Aussage" };
  }
  const ergebnis = findeGeheimnisse(dateien);
  if (ergebnis.funde.length) {
    const erster = ergebnis.funde[0];
    return {
      ok: false,
      meldung: `${ergebnis.funde.length} mögliche(s) Geheimnis(se) im Quelltext — z. B. ${erster.art} in ${erster.pfad}:${erster.zeile}`
    };
  }
  return { ok: true, meldung: `Selbsttest 2/2; ${ergebnis.geprueft} Dateien gescannt, kein Geheimnis im Quelltext` };
}
