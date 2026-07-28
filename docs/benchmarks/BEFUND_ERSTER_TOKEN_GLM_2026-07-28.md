# Befund: Wartezeit bis zum ersten Zeichen auf dem GLM-Pfad — 2026-07-28

Folgebefund aus dem Modell-Eval (`job_modell_eval_harness_20260728`): GLM-5.2 lieferte
die beste Qualität, brauchte aber 22,8 s bis zum ersten sichtbaren Zeichen. Diese
Untersuchung zerlegt die Wartezeit und benennt den behebbaren Anteil.

## Werkzeug

`npm run measure:firsttoken` (`scripts/testing/measure_first_token.mjs`) trennt vier
Zeitpunkte, die vorher zu einer einzigen Zahl verschmolzen waren:

| Messpunkt | Bedeutung |
| --- | --- |
| Antwortkopf | Netz, Warteschlange, Verbindungsaufbau |
| erstes Ereignis | das Modell hat begonnen zu liefern |
| erstes sichtbares Zeichen | was der Nutzer tatsächlich sieht, nach allen Filtern |
| Ende | Stream abgeschlossen |

Die Lücke zwischen *erstes Ereignis* und *erstes sichtbares Zeichen* ist Wartezeit,
obwohl das Modell längst liefert. Genau dieser Anteil ist ohne Modellwechsel behebbar.

## Messung (Median aus je drei Läufen, Modell glm-5.2)

| Weg | Antwortkopf | erstes sichtbares Zeichen | unsichtbare Wartezeit |
| --- | --- | --- | --- |
| Control Server `/api/chat` (Denken an) | 5 918 ms | **12 106 ms** | 6 187 ms |
| Control Server `/api/agent` (Denken aus) | 7 270 ms | **7 270 ms** | 0 ms |
| Chat-Brücke `/api/chat` (Denken an) | 16 638 ms | 16 639 ms | 0 ms |
| Chat-Brücke, schnelle Spur (Groq) | 703 ms | 703 ms | 0 ms |

## Auswertung

**Die Wartezeit hat drei Bestandteile, nicht einen.**

1. **Rund 5 bis 7 s Startzeit des Anbieters.** So lange braucht die Z.ai-Schnittstelle
   bis zum Antwortkopf. Von smejj.com aus nicht beeinflussbar, außer durch Modellwahl.
2. **Rund 6,2 s unsichtbares Reasoning.** GLM streamt Denk-Abschnitte, die der
   Stream-Filter verwirft. Der Nutzer wartet auf Text, den er nie zu sehen bekommt.
   **Das ist der behebbare Anteil.**
3. **Verstärkung über die Brücke.** Der Antwortkopf erreicht den Browser erst, wenn
   das erste sichtbare Byte fließt — deshalb misst man an der Brücke 16,6 s statt
   5,9 s. Punkt 3 verschwindet mit Punkt 2.

Die Zahlen zeigen außerdem: die schnelle Spur hält das Ziel „erster Token unter 1,0 s"
mit 703 ms bereits ein. Betroffen ist ausschließlich der Weg, auf dem GLM ausdrücklich
gewählt wird oder eine Coding-Aufgabe vorliegt.

## Ursache

`/api/agent` schaltet das Reasoning für Nicht-Coding-Aufgaben seit dem 2026-07-27 ab —
mit genau dieser Begründung, im Code dokumentiert. `/api/chat` tat das nicht: dort
fehlte die bereits verifizierte Regel schlicht. Es war keine Fehlfunktion, sondern
eine Lücke zwischen zwei Endpunkten.

## Behebung

`src/ai/chatThinkingPolicy.js` hält die Regel an einer Stelle fest, `handleChat` in
`src/server.js` wendet sie an. Bewusst eng gefasst:

- Coding-Aufgaben behalten das Qualitäts-Reasoning.
- Modellwahl und Routing-Profil bleiben unverändert — die Änderung verschiebt keine
  bestehende Zuordnung.
- Ohne erkennbare Nutzerfrage bleibt das bisherige Verhalten bestehen (fail-closed).

Erwartete Wirkung, gemessen am Verhalten von `/api/agent`: erstes sichtbares Zeichen
im Chat **12,1 s → 7,3 s (−40 %)**, unsichtbare Wartezeit **6,2 s → 0**.

Prüfung: `tests/chat-thinking-policy.test.mjs`, 10 Tests, ohne Netz.

## Offen: der Live-Gang

Die Änderung ist committet und geprüft, aber **noch nicht auf dem Control Server
ausgerollt**. Grund: ein Control-Release packt `src/` und `control-server/` aus der
Arbeitskopie. Eine parallel laufende Sitzung arbeitet zeitgleich an genau diesem
Pfad (Adminbereich Stufe 2, EU-AI-Act-Nachweis, Kimi K3 in der Modell-Registry, davon
Teile noch unfertig). Ein Release jetzt würde fremde, ungeprüfte Arbeit mit ausliefern
und könnte mit einem Deploy der anderen Sitzung kollidieren.

Das verstößt gegen „keine ungeprüften Änderungen" und die Non-Regression-Pflicht,
deshalb wurde bewusst nicht ausgerollt.

**Was zum Live-Gang fehlt** (unverändert nach dem dokumentierten Weg):

1. Warten, bis der Control-Server-Pfad nicht mehr in Bearbeitung ist.
2. `npm run release:preflight`
3. `npm run control:artifact`
4. `node scripts/deploy/upload_control_release_to_idrive.mjs` mit
   `CONFIRM_CONTROL_RELEASE_UPLOAD=YES`
5. `SMEJJ_CONTROL_ARTIFACT_KEY` und `_SHA256` am Control Server setzen
6. Nachmessen: `npm run measure:firsttoken -- --endpoint control --model glm-5-2 --runs 3`
   Erwartung: unsichtbare Wartezeit 0 ms, erstes sichtbares Zeichen rund 7 s.

## Belege

- `docs/benchmarks/firsttoken-control-glm-5-2-2026-07-28.json` (Denken an)
- `docs/benchmarks/firsttoken-control-agent-glm-5-2-2026-07-28.json` (Denken aus)
- `docs/benchmarks/firsttoken-bridge-glm-5-2-2026-07-28.json`
- `docs/benchmarks/firsttoken-bridge-schnelle-spur-2026-07-28.json`
