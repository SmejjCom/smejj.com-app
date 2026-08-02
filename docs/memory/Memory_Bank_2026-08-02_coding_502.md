# [2026-08-02] JEDE CODING-FRAGE AUF smejj.com ENDET MIT HTTP 502 — Ursache ist eine Weiche

Gefunden beim Live-Test der Startseite im echten Nutzerweg (angemeldeter Browser).
Nicht behoben: das Setzen des Werts auf dem Produktionsserver ist der Sitzung gesperrt.

## Befund

| Frage im Live-Chat | Ergebnis |
| --- | --- |
| „Unterschied Index und Constraint in PostgreSQL?" | korrekte Antwort |
| „Schreibe eine JavaScript-Funktion parseBudget(value)…" | **„Verbindung zum Server unterbrochen"** |

Zweimal wiederholt, zweimal derselbe Abbruch. Keine Konsolenfehler auf der Seite —
der Fehler liegt hinter dem Browser.

## Der Weg, den eine Nutzerfrage wirklich nimmt

**Nicht der, den man erwartet.** Die Startseite ruft
`https://starfruit-thyme-cblgn6u06ca2z9d5.salad.cloud/api/agent` — eine ZWEITE
Chat-Bridge auf Salad, nicht `smejj-chat-bridge.zeabur.app`. Beide laufen v104.
Der Eval-Harness misst die Zeabur-Instanz, die Nutzer treffen die Salad-Instanz.

Von dort geht Coding weiter an den Control Server
(`redbean-caesar-yccqb9olg70i1ehu.salad.cloud`), weil die Groq-Schnellspur
Coding ablehnt.

## Ursache, am Live-Endpunkt gemessen

```
(auto)        -> HTTP 502   <- was Nutzer bekommen
glm-5-2       -> HTTP 502
kimi-k2-7     -> HTTP 200   gesund
smejj-fast-1  -> HTTP 200   gesund
```

Der Control Server meldet ueber sein eigenes `/api/health`:

```
activeModelId    : glm-5-2
defaultModelId   : glm-5-2
status           : degraded
runtimeConfigured: true
runtimeAvailable : false      <- er WEISS, dass das Modell nicht antwortet
fallbackModelId  : null       <- und hat keinen Ersatz
```

Live-Umgebung der Gruppe `smejj-control`:

```
SMEJJ_MODEL_DEFAULT      = glm-5-2   <- totes Modell ist der Standard
SMEJJ_MODEL_AUTO_ENABLED = NO        <- Umleitung auf Kimi abgeschaltet
SMEJJ_KIMI_K2_7_ENABLED  = YES       <- Kimi laeuft, Schluessel gesetzt
SMEJJ_MODEL_FALLBACK_ENABLED = YES   <- wirkungslos, siehe unten
```

**Warum der eingeschaltete Fallback nichts nuetzt:** `resolveModelSelection()` in
`src/shared/modelRegistry.js` baut die Kandidatenkette so:

```js
if (enabled) candidateIds.push(selected.id);
if ((!enabled || selected.id !== defaultId) && fallbackAllowed && ...) candidateIds.push(defaultId);
```

Ist das gewaehlte Modell zugleich das Standardmodell, ist die zweite Bedingung
falsch — die Kette hat **genau einen** Eintrag. Der Fallback zeigt auf sich selbst.

## Zwei Lehren

**1. Ein eingeschalteter Fallback ist kein Fallback, wenn er auf denselben Eintrag
zeigt.** Der Schalter stand auf YES, die Kennzahl sah gesund aus, und trotzdem gab
es keinen zweiten Kandidaten. Ketten immer an der Laenge pruefen, nicht am Schalter.

**2. Gesundheitsdaten helfen nur, wenn die Auswahl sie liest.** Der Server kannte
`runtimeAvailable: false` und waehlte das Modell trotzdem. `resolveModelSelection()`
ist rein env-basiert und sieht die Laufzeit-Gesundheit nie.

## Sofortmassnahme (gebaut, nicht ausgefuehrt)

`scripts/deploy/set_control_default_model.mjs` stellt `SMEJJ_MODEL_DEFAULT` auf
`kimi-k2-7`. Es prueft VOR dem Schreiben am Live-Server, ob das Zielmodell eine
Coding-Frage wirklich beantwortet — ein totes Modell kann damit nie Standard werden.
Fail-closed ohne `CONFIRM_CONTROL_DEFAULT_MODEL=YES`, Rueckweg im Skript ausgegeben.

Ausfuehrung durch den Betreiber:

```
CONFIRM_CONTROL_DEFAULT_MODEL=YES node scripts/deploy/set_control_default_model.mjs
```

Danach muss die Salad-Gruppe neu starten — Salad laedt die Umgebung nur beim Start.
Kosten entstehen keine neuen: der Kimi-Schluessel ist bereits hinterlegt (BYOK).

## Danach noch offen (Ursache statt Symptom)

Die Kandidatenkette muss die Laufzeit-Gesundheit lesen: ein Modell mit
`runtimeAvailable: false` gehoert ans ENDE der Kette, nicht an den Anfang. Dann
heilt sich der Ausfall selbst, egal welcher Anbieter ausfaellt. Das ist eine
Code-Aenderung in `resolveModelRequest()` und braucht einen Control-Release.
