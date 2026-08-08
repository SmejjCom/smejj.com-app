# Konkurrenz-Radar — Bericht 01

**Datum:** 2026-08-05 · **Zeitraum:** ca. Ende Mai bis 5. August 2026 (~10 Wochen)
**Beobachtet:** ChatGPT (OpenAI), Gemini (Google), Kimi (Moonshot), Claude (Anthropic), Perplexity, Copilot (Microsoft), Grok (xAI)
**Quellen:** offizielle Release Notes und Blogs, App-Store-Texte, seriöse Tech-Presse. Keine Screenshots, kein Scraping.
**Vergleichsbasis:** smejj-Icon- und Funktionsinventar (obere Leiste, linke Seitenleiste, rechtes Panel, Eingabezeile, Sprachmodus) — Stand 2026-08-05.

**Status: ENTWURF — wartet auf Betreiber-Entscheidung je Vorschlag.**
Wichtig: Mehrere Vorschläge berühren Dateien unter dem Start-Lock (31 eingefrorene Startseiten-Dateien). Eine Freigabe hier gilt ausdrücklich auch als Start-Lock-Freigabe für den jeweiligen Vorschlag — sonst bitte nicht freigeben.

---

## Vorschläge (priorisiert)

### V1 — Riesen-Einfügung wird automatisch zum Anhang
- **Was macht der Konkurrent?** ChatGPT wandelt seit 04.08. eingefügten Text über 10.000 Zeichen automatisch in einen Anhang um; die Eingabezeile bleibt schlank, per Klick holbar der Text zurück. (Quelle: OpenAI Release Notes via releasebot.io/updates/openai/chatgpt)
- **Was machen wir heute?** Eingefügter Langtext landet komplett in der Eingabezeile; sie wächst unbegrenzt, das Senden großer Texte ist unübersichtlich.
- **Was konkret ändern?** Beim Einfügen ab einer Schwelle (z. B. 8.000 Zeichen) den Text als Pseudo-Anhang-Chip neben der Büroklammer darstellen, mit „als Text einfügen"-Rückweg. Betrifft die Eingabezeilen-Logik in index.html/Chat-Skript (Start-Lock!).
- **Aufwand & Risiko:** Klein (1 Tag inkl. Test). Risiko klein — rein additiv, greift nur bei Riesen-Einfügungen.

### V2 — Live-Mitschrift im Sprachmodus
- **Was macht der Konkurrent?** ChatGPTs neuer Sprachmodus „GPT-Live" (08.07.) streamt das Gesagte und die Antwort als Text live in den Chatverlauf — die Sprach-Ansicht ist keine Blackbox mehr. Copilot koppelt Voice ebenfalls enger an sichtbaren Kontext. (TechCrunch 08.07., MS-Blog Juli)
- **Was machen wir heute?** Unser Sprach-Overlay zeigt nur die Fünf-Balken-Welle; was verstanden wurde und was die Antwort war, sieht man erst nach dem Beenden im Verlauf (Verlauf-Anbindung existiert seit sw v208).
- **Was konkret ändern?** Unter der Welle das laufende Whisper-Transkript und die Antwort als mitlaufenden Text einblenden (wir haben beides bereits als Daten: Groq-Ohr Stufe 4 liefert Transkripte, die Antwort streamt ohnehin). Reine Anzeige-Erweiterung im Overlay.
- **Aufwand & Risiko:** Mittel (2–3 Tage inkl. Sprachmodus-Regressionstest). Risiko mittel — der Sprachmodus hat eine Fehlerhistorie (Abbruch-Bug, Platzhalter-Falle), Änderungen dort brauchen die bekannten Drei-Reload-Messungen.

### V3 — Modellwahl: „Schnell / Auto / Gründlich" statt Modellnamen
- **Was macht der Konkurrent?** Breiter Trend weg von Modellnamen: ChatGPT-Desktop zeigt einen Regler „Faster ↔ Smarter" (Juli); Gemini blendet die Standard-Option ganz aus und bietet nur noch den „Extended thinking"-Schalter (27.07.). (Spyglass 10.07., 9to5Google 27.07.)
- **Was machen wir heute?** Ein Text-Chip „smejj 1.0" mit Modellliste dahinter. Wir wissen aus eigener Erfahrung, dass Modellnamen Nutzern nichts sagen und intern schon Routing-Fehler verursacht haben (Markenname-als-Anbieterwahl-Vorfall).
- **Was konkret ändern?** Chip-Inhalt auf drei verständliche Stufen umstellen: „Schnell" (70B-Schnellspur), „Auto" (Standard-Routing), „Gründlich" (Denk-Modus). Modellnamen nur noch im Admin-/Experten-Blick. Wirkung vor dem Deploy mit `npm run eval:models` gegenmessen.
- **Aufwand & Risiko:** Mittel (2 Tage). Risiko mittel — berührt das Modell-Routing; die Eval-Suite fängt Regressionen, aber die Zuordnung Stufe→Modell muss sauber definiert sein.

### V4 — Verlauf-Komfort: Anpinnen + bessere Suche
- **Was macht der Konkurrent?** ChatGPT: eine Suche über Chats, Projekte, Bilder und Dokumente (14.07.). Moonshot (Kimi Code): Sessions anpinnen, Verlaufsfilter über Titel + letzten Prompt, Archiv (Juni–August). (Release Notes beider Anbieter)
- **Was machen wir heute?** Verlauf ist eine chronologische Liste; die Suche findet Chats, aber keine Dateien/Projekte, Anpinnen gibt es nicht.
- **Was konkret ändern?** Stufe 1: Chats anpinnen (Pin-Icon im Verlaufseintrag, Angepinnte oben). Stufe 2: Suche auf Projekt- und Dateinamen ausweiten. Stufe 1 ist unabhängig deploybar.
- **Aufwand & Risiko:** Stufe 1 klein (1 Tag), Stufe 2 mittel. Risiko klein — additive UI, kein Eingriff in Chat-Kern.

### V5 — Quellen-Panel: Quellen der Antwort dauerhaft mitführen
- **Was macht der Konkurrent?** Perplexity hat ein „Source Context Panel" eingeführt (27.07.): Belegquellen bleiben dauerhaft neben der Antwort sichtbar statt nur als Fußnoten-Chips. (releasebot.io/updates/perplexity-ai; Original-Changelog war gesperrt — Quelle zweiter Klasse)
- **Was machen wir heute?** Unser Quellen-Panel (Kettenglied, rechtes Panel) existiert, ist aber nicht mit der aktuell laufenden Antwort gekoppelt; Websuche-Quellen erscheinen in der Antwort, nicht im Panel.
- **Was konkret ändern?** Bei Websuche-Antworten die Trefferquellen automatisch ins Quellen-Panel spiegeln, Panel-Icon bekommt einen Zähler-Punkt. Passt zur gerade gefixten Websuche (Region/Tavily).
- **Aufwand & Risiko:** Mittel (2 Tage). Risiko klein — Panel ist eigenständig; einzige Abhängigkeit ist das Websuche-Antwortformat.

---

## Beobachtungen ohne Handlungsbedarf (aber merken)

1. **Unser Seitenleisten-Layout ist der von Nutzern erzwungene Standard.** OpenAI hat im Juli Verlauf und Projekte aus der Sidebar entfernt — und nach massivem Protest binnen einer Woche zurückgebaut (17.–20.07.). Verlauf und Projekte direkt sichtbar zu lassen ist richtig; nicht anfassen.
2. **Schlanker Sprachmodus bestätigt.** Grok stellt seine 3D-Avatare im Sprachmodus ein (24.07.) — Begründung: Fokus auf Kern-Chat und Verlässlichkeit. Unsere Welle+X-Minimallösung liegt im Trend; V2 (Mitschrift) ist die richtige Ausbaurichtung, nicht Avatare.
3. **Keine Einigkeit bei der Modellwahl-Platzierung.** Google nimmt die Modellwahl aus der Eingabezeile raus (in die Seitenleiste), OpenAI lässt sie drin, vereinfacht aber die Darstellung. Konsens ist nur die Vereinfachung (→ V3), nicht der Umzug. Unser Chip bleibt, wo er ist.
4. **Der große Strategie-Trend des Sommers sind Agenten-Flächen:** Gemini „Spark" mit Aufgaben-Tabs, Copilots „Tasks"-Tab, Kimis Agent-Schwarm und Gruppen-Agenten, ChatGPTs Work-Modus. Für uns heute kein Icon-Thema — aber wenn die Maus-Automatik weiter wächst, wäre unser Status-Panel der natürliche Ort für eine Aufgaben-Ansicht mit Zuständen (Geplant / Läuft / Fertig / Braucht Eingabe).
5. **Beobachtungsliste:** Gemini bereitet Stimmen-Regler vor (Tempo/Wärme je Stimme, noch nicht live — nur Teardown). Falls das kommt, für unsere Premium-Stimme prüfen. ChatGPT löst Canvas als Seitenpanel angeblich in Inline-Blöcke auf (nur Blog-Quellen, Belastbarkeit mittel) — im nächsten Radar erneut prüfen.

## Quellenlage und Grenzen dieses Berichts

- Kimi (Haupt-App) veröffentlicht keine brauchbaren UI-Changelogs; die Kimi-Funde stützen sich auf Help-Center, App-Store und Presse. Icon-Detailänderungen dort sind nicht nachweisbar.
- OpenAI- und Perplexity-Seiten blocken Direktabrufe teils mit 403; Ausweich-Quellen (Spiegel, Presse) sind je Fund ausgewiesen.
- Zwei Funde sind ausdrücklich schwächer belegt (Canvas-Auflösung, Perplexity-Quellen-Panel) und so markiert.
- August ist erst 5 Tage alt; die August-Release-Notes der Anbieter sind noch weitgehend leer.

## Entscheidung des Betreibers

| Vorschlag | Entscheidung (Ja / Nein / Später) | Anmerkung |
|---|---|---|
| V1 Riesen-Einfügung als Anhang | **JA — umgesetzt und live** | Freigabe 2026-08-06 (inkl. Start-Lock); live als sw v228, Commit b4678d7 (Frontend-Repo) / 9ce211b (lokal) |
| V2 Live-Mitschrift Sprachmodus | **JA — umgesetzt und live** | Freigabe 2026-08-06 (inkl. Start-Lock); live als sw v230, Commit 51d4ecb (Frontend-Repo) / 3cbd8d5 (lokal); in Chrome live verifiziert |
| V3 Modellwahl Schnell/Auto/Gründlich | **JA — freigegeben, NICHT umgesetzt** | Freigabe 2026-08-06 inkl. Start-Lock. Beim Bauen zeigte sich: erfordert eine Bridge-Änderung + Container-Neustart, den diese Sitzung nicht auslösen kann. Befund unten. |
| V4 Verlauf: Anpinnen + Suche | **JA — beide Stufen umgesetzt und live** | Stufe 1 (Anpinnen) sw v229 / 11c5fd3; Stufe 2 (Projekt-Dateien in der Suche) sw v232 / 17d3c21 |
| V5 Quellen-Panel koppeln | **JA — umgesetzt und live** | Freigabe 2026-08-06; live als sw v234, Commit ab6da57 |

*Nächster Radar-Durchgang: Vorschlag — Anfang September 2026 (monatliche Bündelung), sofern die Automatik bis dahin eingerichtet ist.*


---

## Befund zu V3 (Modellwahl) — 2026-08-06, beim Bauen gemessen

V3 ist freigegeben, aber **bewusst nicht umgesetzt**. Grund ist kein Zweifel am
Nutzen, sondern ein technischer Befund, der im Bericht nicht absehbar war:

1. **Unbekannte Modellnamen sind kein harmloser Anzeigetext.** `normalizeModelId()`
   in `src/shared/modelRegistry.js` liefert für alles, was nicht in der Registry
   steht, `null`. Ein Chip, der "Schnell" oder "Gründlich" als `model` mitschickt,
   würde das Routing nicht vereinfachen, sondern brechen.
2. **Die drei Stufen existieren serverseitig bereits — automatisch.** Die Bridge
   meldet `fastLaneEnabled: true` mit `groq:llama-3.3-70b-versatile` (703 ms),
   und `chatThinkingPolicy.js` / `reasoningEffortPolicy.js` schalten die Denktiefe
   je Aufgabe schon heute um (Coding tief, Rest flach). Was fehlt, ist nicht die
   Fähigkeit, sondern die *Steuerbarkeit von außen*.
3. **Damit braucht V3 eine Bridge-Änderung**, die eine Stufe (`schnell`/`auto`/
   `gruendlich`) entgegennimmt und auf Fast-Lane bzw. Denktiefe abbildet — plus
   Bridge-Deploy (Bündel + Salad-Container-Neustart) und die in der Freigabe
   verlangte Eval-Messung. Der Container-Neustart war aus dieser Sitzung nicht
   auslösbar.

**Warum nicht trotzdem der Chip allein?** Ein "Schnell"-Knopf ohne Wirkung wäre
ein toter Knopf — genau das, was die Konsole an anderer Stelle ausdrücklich
vermeidet. Lieber offen als scheinbar erledigt.

**Nächster Schritt, wenn gewünscht:** Bridge um die Stufen-Präferenz erweitern,
`npm run eval:models` als Vorher/Nachher-Messung fahren, dann Frontend-Chip
umstellen. Aufwand realistisch 1–2 Tage statt der geschätzten 2.
