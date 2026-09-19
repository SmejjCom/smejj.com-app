# ASO-Bericht Google Play – 2026-09-19/20

App `com.smejj.app`, Konto 8686155781561156147 (iMild LLC).

## Ausgangslage (gemessen)
- Produktion v1.0.0.0 seit 11.09. in 177 Ländern, **0 Installs**, Statistiken/Vitals/Bewertungen ohne Daten.
- Richtlinienstatus ohne Beanstandung, App-Inhalte „alles erledigt".
- Rang (öffentliche Play-Suche, en-US, erste ~30 Treffer, 50 Begriffe): **Marke „smejj" = Platz 1, alle anderen Begriffe nicht in den Top 30.** Ursache: kein Installs-/Bewertungssignal; „AI Chat" ist unter den Großen nicht gewinnbar.
- Konkurrenzbefund „ai coding agent": Die Top-Treffer tragen „Coding Agent" wörtlich im Titel (OpenMono, OpenCode, Maude, PRCHD, Kilo Code). Unser Titel hatte „AI Chat & Coding" ohne „Agent".
- Schwächen im Eintrag: Titel ohne „Agent"; Langtext nur 2275/4000 Zeichen; Screenshots = Rohaufnahmen, deutsche Oberfläche, keine Botschaft; **keine Tablet-Screenshots (7"/10")**.
- Lokalisierung war bereits stark (29 Sprachen, lokalisierte Titel mit Keywords).

## Umgesetzt und zur Überprüfung eingereicht (20.09.)
1. Titel „smejj.com: AI Coding Agent" (26/30) – Marke + Kernbegriff der gewinnbaren Nische.
2. Kurzbeschreibung (79/80): „AI coding agent & chat assistant: write code, search the web, create, automate."
3. Langbeschreibung 2535 Zeichen: Cluster Coding-Agent / Chat / Bild+Video / Voice / Browser-Automation / Datenschutz, semantische Synonyme, nur reale Funktionen, kein Keyword-Spam, Hinweis „AI-generated".
4. 6 neue Phone-Screenshots mit Headline (Reihenfolge: Coding, Browser, Suche, Bild, Video, Voice).
5. Je 6 neue Screenshots für 7"- und 10"-Tablet (2560×1440, 16:9) – vorher leer.
Quelle der Texte: `listing-en-US.json`; Bilder: `../store/screenshots-2026-09-19/` (`build.mjs` + `render.sh`).

## Nicht möglich / bewusst nicht gemacht
- **Platz 1 kann nicht zugesagt werden**; Ranking hängt an Installs, Bewertungen, Retention. Keine Fake-Bewertungen/Installs, keine „#1"-Claims.
- Keyword-Volumen/Wettbewerb: Play Console liefert bei 0 Installs keine Suchbegriff-Daten; Werte in der Masterliste sind qualitative Schätzungen + Rangmessung.
- Custom Listings: Keyword-Targeting existiert (siehe `custom-listings-plan.md`), aber erst nach Freigabe anlegen.
- Android-Rebuild (R8/Edge-to-Edge) bleibt zurückgestellt (Keystore+Passwort nötig, Betreiber-Entscheidung 18.09.).
- Alte Roh-Screenshots 07/08 (18.09.) sind nicht mehr im Eintrag, liegen noch in der Bibliothek.

## Offene Punkte (Priorität)
1. Freigabe der Änderungen abwarten (bis 7 Tage), dann Endkontrolle in Play + `rank-tracker.js` erneut laufen lassen.
2. Screenshots mit **englischer** App-Oberfläche neu aufnehmen (aktuell deutsche UI im en-US-Eintrag).
3. Custom Listings anlegen (5 Stück, Plan liegt bereit).
4. Übersetzungen der Langbeschreibung/des Titels für Top-Märkte (de, tr, es, fr) nachziehen – Titel-Keywords „Agent".
5. Erste echte Nutzer/Bewertungen gewinnen (Website, Community) – das ist der größte Ranking-Hebel.
6. Feature Graphic und App-Symbol wurden nicht neu bewertet (nicht geprüft in dieser Runde).
7. Store-Listing-Experiment (A/B) erst sinnvoll ab ~ einigen hundert Besuchern/Woche.

## Laufendes System
- `keywords-masterliste.csv` (Cluster, Absicht, Wettbewerb, Gewinnbarkeit, Platzierung, Listing, Rang)
- `rank-tracker.js` (Messung im Browser-Tab auf play.google.com) + `rank-ledger.csv` (Verlauf)
- Wöchentlich messen, bei Bewegung Ledger ergänzen.
