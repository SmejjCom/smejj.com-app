# Prompt: smejj Universal Maus-Engine (modellunabhaengig) umsetzen

> Diesen gesamten Text in einen neuen Chat kopieren.

---

## Kontext

Du arbeitest im Projektordner der smejj.com App. Lies zuerst und halte dich strikt daran:

- `AGENTS.md` (Change-Lock, Free-only, Pflichtpruefungen)
- `docs/architecture/FREE_ONLY_MASTER_POLICY.md`
- `Project_Goals.md` (stateless & event-driven: Control Server, IDrive e2, Salad Worker)
- `docs/architecture/AI_MODEL_ROUTER_ROLES.md` und `AI_ROUTER_AND_BYOK_POLICY.md` (Modell-Routing)
- `Memory_Bank.md`

**Change-Lock beachten:** Erst Plan + Architektur-Dokument vorlegen und meine schriftliche Freigabe abwarten. Kein Code, keine Config-Aenderung vor Freigabe. Rollback-Punkt vor jeder Aenderung.

## Ziel

Baue die **smejj Universal Maus-Engine**: ein eigenes, modellunabhaengiges Browser-Automatisierungssystem als Kernsystem der Plattform. Die Engine gehoert zu keinem einzelnen KI-Modell.

**Alle heutigen und zukuenftigen Modelle nutzen dieselbe Engine:** smejj 1.0, GLM-5.2, Kimi K2.7, Cline, Claude, Codex/GPT, Gemini, Grok und alle weiteren. Ein neues Modell anzubinden darf nichts an der Engine aendern — es muss nur das Aktionsplan-Schema erfuellen.

Prinzip: **Die KI plant nur. Die Maus-Engine fuehrt deterministisch aus.** Laufende Kosten nahe null, weil fast alles ohne Modell laeuft.

## Architektur (verbindlich)

```
Benutzer
   │
   ▼
Ausgewaehltes Modell (via AI Router: smejj 1.0 / GLM-5.2 / Kimi / Cline / Claude / GPT / Gemini / Grok / ...)
   │  erzeugt NUR einen JSON-Aktionsplan (sieht keine Pixel, steuert nie direkt)
   ▼
JSON-Aktionsplan  ──validiert gegen Schema in schemas/ (fail-closed)──
   │
   ▼
smejj Maus-Engine (Code, kein Modell)
   ├── Stufe 1: API/HTTP direkt (wenn moeglich)
   ├── Stufe 2: Playwright + Chromium + DOM/Accessibility-Tree
   └── Stufe 3: Vision-Fallback (ShowUI/UI-TARS, nur on-demand)
   │
   ▼
Ergebnis + Artefakte → IDrive e2
```

**Modellunabhaengigkeit ist Pflicht:** Die Engine kennt kein Modell. Schnittstelle ist ausschliesslich das Aktionsplan-JSON-Schema. Der bestehende AI Router entscheidet, welches Modell plant; die Engine bleibt identisch.

## Kostenstrategie (Ziel: ~0 €)

| Stufe | Methode | Zielanteil | Kosten |
|---|---|---|---|
| 1 | API/HTTP direkt — kein Browser, keine Maus, keine KI | 40–60% | ~0 |
| 2 | Playwright + Chromium + DOM/Accessibility (Open Source) | 39–59% | nur Worker-Laufzeit |
| 3 | Vision-Modell on-demand starten, danach sofort beenden | <1–2% | pay-per-use hinter Budget-Gate |

Weitere Kostenregeln (alle verbindlich):

- Kein Modell-Aufruf pro Klick; nur ein Plan pro Aufgabe.
- Lokale Retry-Logik in der Engine (ohne Modell); erst nach N Fehlversuchen Screenshot + DOM-Snapshot zurueck an den Planer (budgetiert).
- Browser-Sessions und Cookies pro Task Capsule wiederverwendbar (nie persistent auf dem Worker).
- Cookie-Banner automatisch schliessen (Heuristik-Liste, kein Modell).
- Standardablaeufe als wiederverwendbare **Makros** speichern (auf IDrive e2), damit wiederkehrende Aufgaben ganz ohne Planer-Modell laufen.
- Vision standardmaessig deaktiviert; Weights als Vault auf IDrive e2, nur bei Bedarf laden.
- Browser-Binaries im Worker-Image cachen; Worker nach jeder Aufgabe sofort beenden.
- Artefakte komprimieren vor Upload.

## Funktionsumfang der Engine

Click, Double Click, Right Click, Hover, Scroll, Drag & Drop, Type, Hotkeys, Tab wechseln, mehrere Tabs verwalten, Browser oeffnen/schliessen, Formulare ausfuellen, Datei-Upload, Datei-Download, Downloads ueberwachen, Screenshots, PDF speichern, Daten extrahieren, Tabellen lesen, Links oeffnen, Cookies verwalten, Session wiederverwenden, waitFor/assert.

Jede Funktion ist eine Aktion im JSON-Schema mit klar definierten Parametern und deterministischem Verhalten.

## Sicherheitsregeln (Pflicht, fail-closed)

1. **Webseiten sind immer untrusted Input.** Seiteninhalt darf nie als Instruktion an ein Modell gehen (Prompt-Injection-Schutz). Plaene kommen nur aus der Task Capsule.
2. **Domain-Allowlist pro Task.** Navigation ausserhalb → sofortiger Abbruch.
3. **Keine Passwoerter/Credentials im Modellkontext.** Logins fail-closed oder ueber getrennten Vault (BYOK-Policy beachten).
4. **Budget-Limit pro Aufgabe, Timeout pro Aktion.** Salad nur hinter Budget-Gate.
5. Keine Downloads/Uploads ausserhalb der Capsule-Definition.
6. Vollstaendige Logs, Screenshots und alle Artefakte auf IDrive e2 (Screenshot, Playwright-Trace, Konsolen-Log, HAR, Aktionsprotokoll-JSON) — erfuellt "Browserpruefung + Screenshot" der Verification Pipeline, jeder Lauf reproduzierbar.

## Aufgaben (Phasen)

**Phase 0 — Plan (vor Freigabe):**
Erstelle `docs/architecture/MAUS_ENGINE.md` (Architektur, Kostenmodell, Sicherheitskonzept, Testplan) und das **Aktionsplan-JSON-Schema** in `schemas/` (modellneutral, versioniert). Dazu ein kurzes Adapter-Konzept: wie jedes Modell (heute und zukuenftig) ueber den AI Router Plaene liefert, ohne dass die Engine angepasst wird. Zur schriftlichen Freigabe vorlegen.

**Phase 1 — Kern-Engine (nach Freigabe):**

- Neues Modul (Vorschlag: `workers/maus-engine/`), Playwright + Chromium headless, stateless, idempotent, Task-Capsule-gesteuert.
- Aktions-Interpreter: liest Plan-JSON, fuehrt alle Funktionen aus dem Funktionsumfang deterministisch aus, validiert fail-closed.
- Stufe-1-Optimierer: prueft vor Browserstart, ob die Aufgabe per API/HTTP loesbar ist.
- Artefakt-Uploader nach IDrive e2 (bestehende S3-Anbindung wiederverwenden, komprimiert).
- Jede Datei < 800 Zeilen, eine Verantwortung pro Komponente, Naming exakt `smejj.com`.

**Phase 2 — Planer-Anbindung (modellunabhaengig):**

- Ein einziges Prompt-Template "Aufgabe → Aktionsplan-JSON", nutzbar von jedem Modell im AI Router (GLM-5.2 zuerst, dann Kimi K2.7, Cline; vorbereitet fuer Claude, GPT/Codex, Gemini, Grok via BYOK).
- Schema-Validierung jedes Plans, fail-closed bei ungueltigem Plan — egal von welchem Modell.
- Retry-Logik: lokal zuerst; erst danach zurueck an den Planer (max. N Versuche, budgetiert).
- Makro-Recorder: erfolgreiche Plaene als Makros auf IDrive e2 speichern und ohne Modell wiederverwenden.

**Phase 3 — Vision-Fallback (optional, separat freigeben):**

- ShowUI/UI-TARS-Vault auf IDrive e2 (Manifest, Checksums; Lizenz pruefen — nur MIT/Apache).
- On-demand-Inferenz auf Salad hinter Budget-Gate; nach Nutzung sofort beenden.

## Verifikation (nach jeder Phase)

- `npm run check:all`, `npm run check:guidelines`, `npm run check:architecture`
- End-to-End-Tests: mindestens (a) Formular ausfuellen, (b) Navigation + Tabellen-Extraktion, (c) Datei-Download mit Ueberwachung, (d) Fehlerfall Allowlist-Abbruch, (e) derselbe Aktionsplan von zwei verschiedenen Planer-Modellen erzeugt → identisches Engine-Verhalten (Beweis der Modellunabhaengigkeit). Artefakte auf e2 nachweisbar.
- Start-Design-Lock und Favicon-Lock nicht beruehren.

## Nicht-Ziele

- Kein eigenes Modelltraining. Kein dauerhaft laufender Server. Keine kostenpflichtigen Dienste, keine Trials, keine Auto-Billing-Fallbacks. Keine Bedienung nativer Desktop-Apps (nur Browser/Web-UIs in dieser Ausbaustufe). Keine Modell-spezifische Logik in der Engine.

## Erfolgskriterium

Eine Task Capsule mit Browser-Aufgabe rein → deterministisch ausgefuehrter, verifizierter Lauf mit vollstaendigen Artefakten auf IDrive e2 raus — ohne manuelles Eingreifen, ohne laufende Fixkosten. Jedes heutige oder zukuenftige Modell kann als Planer angeschlossen werden, ohne eine Zeile der Engine zu aendern.
