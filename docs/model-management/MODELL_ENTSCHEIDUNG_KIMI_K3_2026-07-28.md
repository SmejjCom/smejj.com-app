# Modellentscheidung Kimi K3 — 2026-07-28

Anlass: Kimi K3 ist am 26./27.07.2026 als offene Gewichte erschienen. Frage des
Betreibers: herunterladen oder Kimi K2.7 aktualisieren?

## Entscheidung

**Weder noch.** Kein Download von Kimi K3 auf IDrive e2, keine Neubeschaffung von
Kimi K2.7. Stattdessen wurde der Modell-Eval-Harness gebaut, der jede künftige
Modellfrage in etwa drei Minuten mit Messwerten beantwortet.

Diese Entscheidung ist fachlich und ohne neue laufende Kosten. Sie ist umkehrbar:
Sobald der Harness zeigt, dass ein anderes Modell messbar besser ist, kann jederzeit
gewechselt werden — dann mit Beleg statt mit Vermutung.

## Begründung mit Zahlen

| | Kimi K2.7-Code | Kimi K3 |
| --- | --- | --- |
| Parameter | 1 Bio. gesamt / 32 Mrd. aktiv | 2,8 Bio. gesamt / ~50 Mrd. aktiv |
| Kontext | 256 K | 1 M |
| Download | INT4 | MXFP4, rund 1,4 TB |
| Betrieb minimal | ein Knoten mit mehreren 80-GB-GPUs | rund acht Knoten mit je acht 80-GB-GPUs |
| Lizenz | Modified MIT | bei Freigabe offen, vor kommerziellem Einsatz prüfen |

Drei harte Gründe gegen den Download:

1. **Betrieb unmöglich.** Für K3 wären rund 64 GPUs nötig. Verfügbar sind ein
   Control Server mit 2 vCPU / 8 GB und Salad-Kapazität nach Stunden. IDrive e2 ist
   Speicher, keine Recheneinheit — 1,4 TB lägen dort und täten nichts.
2. **Gewichte sind kein Training.** Ein Modell dieser Größe nachzutrainieren kostet
   mehr Rechenzeit als sein Betrieb. Für smejj.com ist das um Größenordnungen
   außerhalb des Rahmens. Die Trainingsdaten-Policy sperrt Fremdmodell-Ausgaben
   ohnehin für Training und Distillation.
3. **„Max" ist kein Download.** Die offenen Gewichte heißen schlicht Kimi K3; „Max"
   bezeichnet in der Anbieter-Schnittstelle eine Aufwandsstufe beziehungsweise
   Tarifzuordnung, keine gesonderte Gewichtsdatei.

Kimi K2.7 bleibt unangetastet im Modell-Vault: klein genug für einen eigenen Betrieb,
klar lizenziert, bereits verifiziert. Es ist die Versicherung gegen Preis- oder
Verfügbarkeitsänderungen bei fremden Schnittstellen — dafür genügt ein brauchbares
Modell, nicht jedes neue.

## Gemessener Ist-Zustand (Live, Produktionsdomäne)

Suite `smejj-chat-core` 1.0.0, Inhalts-Hash `14b66f9badc7…`, 14 Fälle,
Transportweg `control` (Chat-Brücke → Control-Router), 2026-07-28.

| Pfad | antwortendes Backend | Punktzahl | Antwortzeit p95 | erster Token p95 | kritische Verstöße |
| --- | --- | --- | --- | --- | --- |
| Standard (schnelle Spur) | `groq:llama-3.1-8b-instant` | 91,2 % | 645 ms | 555 ms | 1 |
| `--model glm-5-2` | `zhipu:glm-5.2` | 97,1 % | 22 799 ms | 22 754 ms | 0 |

Ablesbar daraus:

- **Die profilabhängige Führung ist richtig und ist jetzt belegt.** Die schnelle Spur
  hält das Ziel „erster Token unter 1,0 s" mit 555 ms ein; GLM-5.2 braucht dafür
  22,8 s. Umgekehrt scheitert die schnelle Spur am Fall `code-esm-failclosed`
  (Codegenerierung), den GLM-5.2 fehlerfrei löst.
- **Befund 1 (offen): Antwortzeit auf dem GLM-Pfad.** 22,8 s bis zum ersten Token
  überschreitet jedes Budget um das 15- bis 20-Fache. Das ist kein Fehler des
  Harness, sondern der gemessene Ist-Zustand dieses Pfades. Solange Codeanfragen
  über GLM-5.2 laufen, wartet der Nutzer entsprechend lange.
- **Befund 2 (offen): Codegenerierung auf der schnellen Spur.** Das kleine Modell
  liefert bei `code-esm-failclosed` keine verwertbare ESM-Funktion. Das ist kein
  Sicherheitsproblem, aber es begrenzt, was ohne ausdrückliche Modellwahl geht.
- **Sicherheit und Schutz-Locks bestehen beide Pfade.** Weigerung bei Löschauftrag,
  Weigerung bei Schlüsselabfrage, Verweis auf den Design-Lock und Verzicht auf
  erfundene Betriebszahlen wurden auf beiden Wegen erfüllt.

## Vorgehen bei der nächsten Modellfrage

1. `npm run eval:models` — Trockenlauf, prüft die Suite ohne Kosten.
2. Kandidat als Schnittstelle anbinden (BYOK, Router-Eintrag, keine Architekturänderung).
3. `node scripts/evaluation/run_model_eval.mjs --live --model <kennung> --delay-ms 6000`
4. Bericht in `docs/benchmarks/` mit dem bisherigen Modell vergleichen.
5. Wechsel nur, wenn Punktzahl **und** Antwortzeit besser sind und keine kritischen
   Verstöße auftreten. Die Beförderung eines Modells bleibt in jedem Fall an die
   schriftliche Freigabe des Betreibers gebunden — der Harness entscheidet nichts
   selbst (`automaticPromotionAllowed: false`).

## Belege

- `docs/benchmarks/modeleval-smejj-chat-core-glm-5-2-2026-07-28.json`
- `docs/benchmarks/modeleval-smejj-chat-core-live-default-2026-07-28.json`
- Zwischenläufe zur Nachvollziehbarkeit: `…-lauf1.json`, `…-lauf2.json`,
  `…-suite-v0.json`
