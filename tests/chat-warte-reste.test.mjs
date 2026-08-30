// Waechter-TUEV fuer den Warte-Reste-Waechter (Projektregel: jeder Waechter
// bekommt eine kaputte UND eine gesunde Probe).
import test from "node:test";
import assert from "node:assert/strict";
import { istWarteRest } from "../public/chat-warte-reste.js";

test("kaputte Proben: eingefrorene Wartesignale werden erkannt", () => {
  const leichen = [
    "⏳ Anfrage laeuft … 3 s",
    "Anfrage laeuft ... 12 s",
    "⏳ Anfrage läuft …",
    "smejj denkt nach …",
    "smejj denkt nach ...",
    // mit Uhrzeit der Inline-Leiste im Eintragstext
    "smejj denkt nach … 23:59",
    "⏳ Anfrage laeuft … 3 s 00:00"
  ];
  for (const probe of leichen) assert.equal(istWarteRest(probe), true, probe);
});

test("gesunde Proben: echte Antworten bleiben IMMER stehen", () => {
  const gesund = [
    "Die Anfrage laeuft ueber den Control-Server und wird dort geprueft.",
    "smejj denkt nach, ob der Ansatz passt — und antwortet dann ausfuehrlich.",
    "Hallo",
    "",
    "3 s",
    "Anfrage laeuft gut, hier das Ergebnis: 42",
    "⏳ Anfrage laeuft … 3 s — inzwischen habe ich die Antwort: fertig."
  ];
  for (const probe of gesund) assert.equal(istWarteRest(probe), false, probe);
});
