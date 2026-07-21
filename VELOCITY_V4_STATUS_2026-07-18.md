# smejj.com — Velocity v4: Status, Analyse & Freigabe-Bedarf (2026-07-18)

Kurz und in einfacher Sprache. Ergebnis zuerst, Details danach.

---

## 1. Was ich sofort gemacht habe (0 EUR, sicher, verifiziert)

**Dein Schutz war beschädigt — ich habe ihn repariert.**

Auf der Festplatte waren zwei geschützte Startseiten-Dateien (`public/app.js`,
`public/styles.css`) heimlich verändert (441 Zeilen in app.js). Diese Änderungen
hätten den Start-Lock rot gemacht und sogar echte Funktionen entfernt
(Chat-Markdown, Composer-Tools, Suche, echte Modelle GLM-5.2/Kimi).

- Die abweichenden Versionen sind **verlustfrei gesichert** (nichts gelöscht).
- Die zwei Dateien stehen wieder **exakt auf dem geschützten Stand** (gleiche Prüfsumme wie der Lock).
- **`check:start-lock` = GRÜN**, **`check:favicon-lock` = GRÜN** (mit den echten Skripten geprüft).

Dein „100 % Schutz" ist damit wieder aktiv.

---

## 2. Der wichtigste Befund: Vieles ist schon gebaut

Das v4-Konzept sagt „erweitern, nicht neu bauen" — und das stimmt. Der Kern existiert bereits:

| v4-Baustein | Status im echten Code |
|---|---|
| **Stream Spine** (Streaming-Schicht) | vorhanden: `public/chat-bridge.js` streamt Token-für-Token, kein Voll-Puffer |
| **Capability Router** (5 Lanes) | **fertig gebaut**: `control-server/src/llm/modelRouter.js` mit Profilen coding/reasoning/fast/web |
| **Groq Instant Lane** | **im Router bereits angelegt** (`llama-3.1-8b-instant` = fast, `llama-3.3-70b` = default) |
| Weitere Anbieter | Cerebras, DeepSeek, Gemini, Mistral, GLM-5.2 (zhipu), OpenRouter — alle vorbereitet |
| **Circuit Breaker / Health** | vorhanden: `modelRuntimeHealth.js` |
| **Budget-Gate** | vorhanden, **fail-closed**: läuft NICHT ohne gesetzte Limits |
| Object Brain (IDrive e2) | Layout + Jobs vorhanden (`idrive-layout/`, `src/jobs/`) |

**Konsequenz:** Der große Tempogewinn („Blitz schneller") ist zu ~90 % reine
**Konfiguration**, kein Frontend-Neubau und keine Berührung geschützter Dateien.

---

## 3. Warum es sich heute langsam anfühlt

Nicht das Frontend ist der Bremser, sondern das Modell. Aktueller Standard-Weg:

```
Browser  →  chat-bridge (Salad)  →  GLM-5.2 (Salad)
```

GLM-5.2 „denkt" erst mehrere Sekunden, bevor das erste Wort kommt (~5–11 s).
Der schnelle Router (mit Groq) ist per Standard **abgeschaltet**
(`SMEJJ_MULTI_MODEL_ROUTER_ENABLED=NO`) und es ist **kein Groq-Key gesetzt**.

---

## 4. Phase 0 — Messkonzept (damit „schneller" belegbar ist)

Vor/nach jeder Änderung messen wir dieselben Werte. Ziel laut Konzept §2a:

| Messwert | Ziel | Heute (zu messen) |
|---|---|---|
| Erste sichtbare Rückmeldung | < 100 ms | — |
| Time-to-First-Token (Instant Lane) | < 500–800 ms | ~5.000–11.000 ms (GLM) |
| Token/Sekunde | hoch & flüssig | — |
| DOM-Render-Verzögerung | kein Task > 100 ms | — |
| Control-Server-Wakeup (Kaltstart) | ~2–3 s | Fast-Boot-Image vorhanden |
| Kosten pro erfolgreicher Aufgabe | Cent-Bereich | — |

Gemessen wird am `x-smejj-*`-Header der Bridge + Zeitstempel im Browser
(Absenden → erstes Token → letztes Token). Kein Umbau ohne diese Zahlen.

---

## 5. Phase 1 — Das freigabereife Tempo-Paket (der 90-%-Gewinn)

Alles serverseitig / Konfiguration. **Berührt KEINE Lock-Dateien.**

1. **Groq als Instant Lane aktivieren** (schnelles erstes Token für Chat/einfache Fragen).
2. **Router einschalten**, GLM-5.2 bleibt für schweres Coding (Deep Lane).
3. **Un-Buffering verifizieren** (Bridge flusht pro Event — messen, ob ein Proxy dazwischenpuffert).
4. **GLM-Reasoning gaten** (für einfache Fragen kurze/keine Denkzeit → schnelleres erstes Wort).

**Konkrete Konfiguration (auf dem Control-Server / in der Bridge-ENV):**

```bash
SMEJJ_MULTI_MODEL_ROUTER_ENABLED=YES
SMEJJ_LLM_GROQ_API_KEY=<dein Groq-Key>      # BYOK
SMEJJ_LLM_PROVIDER_ORDER=groq,zhipu          # Groq zuerst, GLM als Fallback/Deep
# Budget-Gate (fail-closed — ohne diese Werte läuft nichts):
SMEJJ_BUDGET_MAX_USD_PER_JOB=<z. B. 0.05>
SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD=<z. B. 10>
SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS=1
```

Frontend-Feinschliff (rAF-Rendering) ist **bewusst NICHT** in Phase 1:
Der Hauptpfad in `app.js` hängt Tokens schon inkrementell an und rendert Markdown
nur einmal am Ende. Laut Konzept nur anfassen, wenn eine Messung einen echten
Render-Engpass beweist — und das würde geschützte Dateien betreffen (Extra-Freigabe).

---

## 6. Was ich von dir brauche, um live zu gehen (deine eigenen Regeln)

Ich bin an genau zwei Punkten gebunden — beide stehen so in `AI_Guidelines.md`
und `AGENTS.md` und gelten auch bei „mach du":

### A) Budget — Betrag nennen (Pflicht)
Das Budget-Gate ist fail-closed: **ohne genannten Betrag startet kein Modell.**
Ein „mach du" reicht laut deiner Regel ausdrücklich nicht — es braucht **einen
konkreten Höchstbetrag**. Empfehlung als Experte:

> **Hartes Limit 10 USD/Monat für Groq (BYOK), GLM-5.2 bleibt wie bisher.**

Bitte antworte einfach z. B.: *„Ja, 10 USD/Monat für Groq freigegeben."*

### B) Groq-Key
Für die Instant Lane braucht es einen Groq-API-Key (Free-Tier von Groq genügt zum
Start). Den lege ich **nie im Browser/Repo/Log** ab — nur verschlüsselt als ENV auf
dem Control-Server. Sag mir, ob der Key schon irgendwo hinterlegt ist oder ob du ihn
mir sicher gibst.

### Nicht blockierend, aber wichtig (Git-Stand)
Der lokale Stand ist **36 Commits hinter dem Live-Stand (origin)**. Vor einem echten
Deploy müssen wir das sauber zusammenführen, sonst riskieren wir, funktionierende
Sachen zu überschreiben. Das mache ich als eigenen, abgesicherten Schritt **mit
Rollback-Punkt** — sag Bescheid, wenn ich das angehen soll.

---

## 7. Was danach passiert (sobald A + B da sind)

1. Konfiguration setzen (Groq + Router + Budget).
2. `check:all`, `check:llm-router`, `check:start-lock`, `check:favicon-lock` grün fahren.
3. Auf Staging live schalten, TTFT vorher/nachher messen (Ziel < 0,8 s).
4. Fehler sofort beheben, erneut testen.
5. Ergebnis + Zahlen in Task Capsule + `Memory_Bank.md` (nur verifizierte Fakten).
6. Rollback-Punkt sichern, Locks unangetastet / grün.

---

## 8. Rollback / Sicherheit dieser Session

- Geänderte Lock-Dateien: **zurückgesetzt auf geschützten Stand**, alte Version gesichert.
- Git-Index **nicht** angefasst (auf deinem Rechner lief ein Git-Prozess).
- Keine Kosten ausgelöst. Keine Secrets angefasst. Kein Deploy.
- Neu angelegt: dieses Dokument + Task Capsule (`task-capsules/2026/07/velocity-v4-phase1/`).

*Stand: 2026-07-18. Erstellt vom Umsetzungs-Agenten gemäß Velocity Architecture v4.*
