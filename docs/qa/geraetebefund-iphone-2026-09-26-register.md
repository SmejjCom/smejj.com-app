# Punkt 4 — dauerhafte Bildablage: Gerätenachweis (26.09.2026, iPhone-Simulator, Hülle lädt smejj.com live)

| Stand | Ablauf | Ergebnis |
|---|---|---|
| v986 + Brücke v178 | „Registertest 3“ (Katze): senden, App nach 4 s beendet, 200 s warten, Brücke neu gestartet, App geöffnet | Bild aus dem Register gerettet (16:05), aber als Link „!Generated image“ |
| v987 (neue Marke chat-markdown.js) | „Registertest 4“ (Fuchs), gleicher Ablauf | wieder Link → Renderer war nicht die Ursache |
| Brücke v179 | Adresse gemessen: SMEJJ_CONTROL_ORIGIN = smejj-control.zeabur.app (intern); Renderer kennt nur api.smejj.com → Antwort nutzt jetzt https://api.smejj.com | — |
| v987 + Brücke v179 | „Registertest 5“ (Papagei): senden, App beendet, 200 s, Brücke neu gestartet, App geöffnet | **Bild erscheint als Bild (16:47)**, nicht neu gemalt |
| dito | App ein weiteres Mal beendet und geöffnet | Bild bleibt sichtbar (16:49) |

Ursachen (zwei):
1. `chat-markdown.js` wurde in v986 unter der alten Marke `?v=4` ausgeliefert — der WebView behielt die alte Datei. Fix v987: Zeitstempel-Marke + Kette (nur `?v=`-Marken, Start-Lock mit Wortlaut gestempelt).
2. Die Brücke setzte die interne Kontroll-Adresse in die Antwort. Fix Brücke v179 (`OEFFENTLICHE_API`), Test angepasst (13/13 grün).

Bekannte Restwirkung: die drei Testeinträge von 15:26–16:25 (Eule, Katze, Fuchs) sind als fertiges HTML mit Link gespeichert und bleiben Links — nur Testnachrichten des Betreiber-Kontos, keine Nutzerdaten betroffen.

Anker: schutz-100-2026-09-26-app-v987 (+ -bauzweig, -frontend); Brücke design-v11 085c1fe7, Frontend c81112b.
