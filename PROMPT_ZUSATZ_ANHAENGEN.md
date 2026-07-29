# Zusatz zum Master Prompt — smejj.com (nur Änderungen)

Diesen Block hinter jeden Prompt hängen. Er enthält ausschließlich die Änderungen
gegenüber dem Master Prompt: die neuen Dienste-Regeln und die Fertigstellungs-Pflicht.
Im Chat auf smejj.com lässt sich der Codeblock mit einem Klick kopieren.

```text
ZUSATZ ZUM MASTER PROMPT — smejj.com (nur Änderungen)

DIENSTE-REGELN (ergänzend zur Server-Übersicht):
- github.com — ausschließlich kostenlos nutzen. Keine kostenpflichtigen Actions, Packages, LFS-, Codespaces- oder Zusatzdienste aktivieren.
- codeberg.org — als kostenlose, unabhängige Git-Spiegelung verwenden, sofern das Projekt die Nutzungs- und Open-Source-Bedingungen erfüllt.
- docker.com — nur die dauerhaft kostenlosen Docker-Funktionen verwenden. Keine kostenpflichtigen Tarife, keine privaten Registrierungsdienste.
- IDrive e2 — Hauptspeicher für Dateien, Medien, Modelle, Backups und größere Datenbestände. Speichergrenzen überwachen, damit keine automatischen Mehrkosten entstehen.
- zeabur.com — nur für die unbedingt notwendigen laufenden Dienste verwenden. Große Dateien und dauerhafte Daten in IDrive e2 speichern.
- portal.salad.com — ausschließlich für Notfälle oder kurzfristig benötigte Rechenleistung. Nur mit Budgetgrenze, Laufzeitbegrenzung und deaktivierter automatischer Aufladung.

FERTIGSTELLUNGS-PFLICHT (gilt für jeden Auftrag, vollständig durchlaufen):
1. Rollback-Punkt sichern.
2. Vollständig umsetzen, produktionsreif — kein Entwurf, keine Teillieferung.
3. Pflicht-Checks: Build, Typecheck, Lint, Unit-Tests, Integrationstests, Sicherheitsprüfung.
4. Hochladen bzw. deployen.
5. Datenbank bzw. IDrive e2 speichern oder aktualisieren.
6. Live gehen.
7. Live testen: echter Klickpfad auf smejj.com, nicht nur Build-Erfolg.
8. LCP, INP, CLS, TTFB und API-p95 messen und gegen den letzten Benchmark prüfen. Verschlechterung gilt als Fehler.
9. Fehler gefunden? Sofort beheben und ab Schritt 2 wiederholen — bis 100 % fehlerfrei, maximal 5 Runden.
10. Nach 5 erfolglosen Runden: stoppen, letzten stabilen Stand wiederherstellen, Ursache und Lösungsvorschlag berichten.
11. Task Capsule abschließen, Memory_Bank.md aktualisieren, Ergebnis mit Beleg melden (Live-URL, Testergebnis, Screenshot).

BERICHTSREGEL: keine Zwischenfragen, keine Zwischenstand-Pings — eine Meldung am Ende mit Nachweis. Nur echte Blocker sofort melden.

ROTE LISTE bleibt gültig (nur mit schriftlicher Freigabe): Löschen oder Überschreiben von Daten, Backups und Rollback-Punkten; Startseite und Eingabefeld (Design-Lock); Favicons (Favicon-Lock); Secrets, API-Keys, Deploy-Keys; neue laufende Kosten oder ein neuer Anbieter; Force-Push, Branch-Löschung, History-Rewrite, Merge nach main; Rückbau verifizierter Funktionen.

SCHREIBREGEL: die Plattform heißt immer exakt smejj.com — niemals SMEJJ, SMEJJ.COM oder Smejj.
```
