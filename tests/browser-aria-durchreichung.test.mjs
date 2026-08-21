// Waechter fuer die Erlaubnisliste der Sitzungs-Antwort.
//
// GEMESSEN 2026-08-21 am LIVE-Dienst: `ariaObserve` antwortete brav mit
// ok:true — und das Feld `ariaBeobachtung` war weg. Der Worker hatte es
// geschickt, die Erlaubnisliste im Control-Server kannte es nicht, also fiel
// es still heraus. Dieselbe Liste hatte schon einmal die ganze Beobachtung
// geleert (der lange Kommentar in browserSessionRoutes.js erzaehlt es).
//
// Das ist die Familie "etwas faellt still weg": kein Fehler, kein Log, nur
// ein leeres Feld. Ein Waechter, der die Durchreichung misst, ist der
// einzige Weg, sie beim naechsten Mal SOFORT zu sehen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSessionPayload } from "../control-server/src/routes/browserSessionRoutes.js";

const BILD = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
// sanitizeSessionPayload verlangt eine ECHTE Sitzungs-ID (16-64 Hexzeichen)
// UND einen gueltigen Screenshot; sonst null (fail-closed). Beides hier drin.
const GRUND = { ok: true, sessionId: "f7eb8b9893861b440256bb6b14d8e07d", screenshot: BILD };

const BAUM = '- WebArea "Example Domain"\n  - heading "Example Domain" [level=1]\n  - link "More information..."';

test("der ARIA-Bedienbaum kommt durch die Erlaubnisliste", () => {
  const sauber = sanitizeSessionPayload({
    ...GRUND,
    ariaBeobachtung: { url: "https://example.com/", titel: "Example Domain", baum: BAUM, knoten: 3, gekappt: false }
  });
  assert.ok(sauber.ariaBeobachtung, "ariaBeobachtung faellt still weg — genau der Live-Befund");
  assert.equal(sauber.ariaBeobachtung.baum, BAUM, "der Baum kam veraendert an");
  assert.equal(sauber.ariaBeobachtung.titel, "Example Domain");
  assert.equal(sauber.ariaBeobachtung.knoten, 3);
});

test("ohne Baum bleibt das Feld weg (kein leeres Objekt)", () => {
  const sauber = sanitizeSessionPayload({ ...GRUND });
  assert.equal(sauber.ariaBeobachtung, undefined);
});

test("die Kappung greift — ein riesiger Baum sprengt die Antwort nicht", () => {
  const riesig = "- link \"x\"\n".repeat(5000);
  const sauber = sanitizeSessionPayload({ ...GRUND, ariaBeobachtung: { baum: riesig, knoten: 999999 } });
  assert.ok(sauber.ariaBeobachtung.baum.length <= 6000, "Baum ungekappt durchgereicht");
  assert.ok(sauber.ariaBeobachtung.knoten <= 5000, "Knotenzahl ungekappt durchgereicht");
});

test("der alte Weg bleibt unveraendert erhalten", () => {
  const sauber = sanitizeSessionPayload({
    ...GRUND,
    beobachtung: { url: "https://example.com/", title: "T", textExcerpt: "Text", elements: [{ n: 1, tag: "button", x: 5, y: 6 }] }
  });
  assert.equal(sauber.beobachtung.title, "T");
  assert.equal(sauber.beobachtung.elements.length, 1);
});

test("ein fremdes Feld kommt NICHT durch — Erlaubnisliste bleibt Erlaubnisliste", () => {
  const sauber = sanitizeSessionPayload({ ...GRUND, heimlich: "sollte verschwinden" });
  assert.equal(sauber.heimlich, undefined);
});
