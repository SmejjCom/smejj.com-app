# [2026-08-02] „Verbindung unterbrochen": Klient behoben, Wurzel liegt bei GLM-Coding

Volltext zum Kurzeintrag in `Memory_Bank.md`.
Kapsel: `task-capsules/2026/08/job_verbindung_unterbrochen_20260802/capsule.json`.
Commits `ffd7b4e` und `ab21d80`; Frontend-Repo `d9d2907` (v197) und `cd38138` (v198).

Auftrag des Betreibers: *„geh browser smejj.com checken, dann fehler beheben,
hochladen, Datenbank speichern oder aktualisieren und dann wieder live gehen.
Checken bis 100 %."*

## Der Fehler war sichtbar, während 289 Tests grün waren

Nicht im Quelltext gesucht, sondern die Live-Seite geöffnet. Im Verlauf standen
zwei Antworten „Verbindung zum Server unterbrochen", beide auf Fragen mit einer
Web-Adresse. Keine Prüfung hatte das je gemeldet — der Fehler entsteht erst aus
dem Zusammenspiel von Klient-Zeitbudget und Server-Spurwahl.

## Ursache 1 — Zeitbudget am falschen Merkmal

`firstByteBudgetFor` in `public/ai/fetch-retry.js` entscheidet am **Modellnamen**
im Anfragekörper, welche Spur zu erwarten ist. Der Server wählt die Spur aber an
der **Frage**: alles mit Suchbedarf oder Web-Adresse läuft über den Control
Server.

Gemessen: Frage „Was steht auf https://example.com ?" — erstes Byte nach
**8218 ms** gegen ein Budget von **6500 ms**. Dieselbe Kette ohne Suchbedarf:
305 ms.

**Lösung:** Der *letzte* Versuch ist geduldig (15 s). Der schnelle Wechsel auf den
Reserve-Endpunkt bleibt erhalten — dafür sind die 6,5 s da, eine tote Replika
soll nicht warten lassen. Haben alle Endpunkte schnell versagt, ist „langsam aber
lebendig" die einzige verbliebene Möglichkeit; Abbrechen ist dann strikt
schlechter als Warten.

**Bewusst NICHT gemacht:** die Suchwort-Liste in den Klienten kopieren, um die
Spur vorherzusagen. Es gibt sie bereits zweimal (`public/chat-bridge.js` und
`src/search/searchIntent.js`), zusammengehalten von
`tests/websuche-absicht-gleichlauf.test.mjs`. Dieser Test existiert, WEIL die
beiden Listen einmal auseinandergelaufen sind.

## Ursache 2 — ein Versuch je Endpunkt ist zu wenig

Gemessen an Coding-Fragen: Brücke 2 von 6 mit HTTP 503, Reserve 1 von 3 mit 502.
Beide Ausfälle sind kurz und unabhängig — zusammen rund 11 %.

**Lösung:** `urls.length + 1` Versuche statt `urls.length`. Kostet nichts, wo
ohnehin keine Antwort kam; 4xx außer 429 wird weiterhin nicht wiederholt.

**Live belegt** durch Mitschnitt der Versuche je Frage: `503 > TypeError > 503`.
Vor v198 wären es zwei gewesen.

## Ursache 3 — die eigentliche Wurzel: GLM-5.2 bei Coding

Verschränkt gemessen gegen den Control Server, feste Rotation über alle Modelle
mit **derselben** Coding-Frage:

| Modell | Coding |
|---|---|
| `kimi-k2-7` | 6/6 OK |
| `smejj-fast-1` | 6/6 OK |
| `glm-5.2` | **0/6** |
| `auto` (Standard) | **0/6** |

Nach Fragenart: `glm-5.2` normal **5/5 OK**, coding **1/5**.

**Warum verschränkt gemessen wurde:** Der erste Durchgang lief in Blöcken je
Modell. Dann ist ein schlechtes Zeitfenster nicht von einem schlechten Modell zu
unterscheiden. Erst die feste Rotation schließt das aus.

**Fehlerbild:** HTTP 502 nach 715–1187 ms mit `retry-after: 60` und
Cloudflare-Seite — eine Abweisung auf dem Weg, kein Zeitablauf. Ein gelungener
Lauf braucht 1802 ms.

**Warum keine Absicherung greift:** `/api/health` meldet GLM zeitgleich
`status ready, available true, consecutiveFailures 0, source "inference"`.
`markModelRuntimeFailure` wird auf diesem Weg nie aufgerufen — die Verbindung
stirbt, bevor der Zähler sie sieht. `executeWithFallback` ist in Ordnung, es
bekommt den Fehlschlag nur nie zu sehen.

**Merkregel: ein gesundes `/api/health` widerlegt keinen gemessenen Ausfall.**

**Der Code will es bereits richtig.** `autoModelId` in
`src/shared/modelRegistry.js` wählt bei `profile === "coding"` Kimi K2.7 — live
aktiviert, konfiguriert, gesund. Trotzdem landet `auto` auf GLM-5.2; das Profil
kommt auf diesem Weg nicht als `coding` an. Von außen belegt: Kimi ausdrücklich
6/6 OK, `auto` bei derselben Frage 0/6.

**Nicht eigenmächtig umgestellt.** Der Coding-Standard entscheidet, welches
bezahlte Modell jede Coding-Anfrage beantwortet — laufende Kosten, Rote Liste.
Dem Betreiber vorgelegt.

## Zwei Messfallen, beide selbst hineingelaufen

1. **Nach einem `sw.js`-Versionssprung erst neu laden, dann messen.** Der erste
   Nachtest zeigte einen Fehlschlag nach 802 ms — zu schnell für drei Versuche.
   Der Cache stand auf v198, die geladene Seite lief aber noch mit den alten
   Modulen. Ein Service-Worker-Update wechselt den Cache, nicht den laufenden
   Modulgraphen.
2. **Ein Testlauf mit 0 Ergebnissen ist zuerst ein Verdacht gegen den Test.** Der
   Selektor `[data-role=assistant]` traf nichts; richtig ist
   `article.entry.assistant` im Container `#startLog`. Die Antworten waren
   korrekt da, der Zähler blieb bei 0.

Dazu: ein `TypeError` im Browser kann ein ganz normaler 5xx sein. Der
Reserve-Endpunkt meldete sich als `TypeError`, weil die Cloudflare-Fehlerseite
keinen CORS-Kopf trägt und der Browser sie deshalb als Netzfehler verwirft.
Serverseitig ist CORS sauber (OPTIONS 204, `allow-origin https://smejj.com`).

Und: ein Bildschirmfoto allein ist kein Befund — eine schwarze Seite war nur
`document.visibilityState === "hidden"`.

## Stand nach dem Fix

Prüfungen grün: `check:frontend` 294, `spurwahl-zeitbudget` 13,
`precache-imports` 90, `guidelines`, `start-lock`, `favicon-lock`,
`module-queries`, `json`, `voice` 41.

Web Vitals im Budget: LCP 132 ms, TTFB 19 ms, CLS 0, INP 48 ms, 40 KB.

Kapsel im Object Brain:
`s3://smejj-model-files/capsules/app/job_verbindung_unterbrochen_20260802_wurzel/`
(der ursprüngliche Schlüssel bleibt unangetastet — der Uploader überschreibt
grundsätzlich nicht).
