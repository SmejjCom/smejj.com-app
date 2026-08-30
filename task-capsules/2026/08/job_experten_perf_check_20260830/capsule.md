# Task Capsule — Experten-Performance-Check 2026-08-30 (job_experten_perf_check_20260830)

## Auftrag

Betreiber: „Check als Expert alle professionell. Ob alle richtig eingerichtet,
optimiert, wenn es nicht optimiert, alle optimieren sollen blitzschnell unsere
App sein." Master-Prompt-Autonomie: Grüne Liste grün, Rote Liste rot; Messpflicht
(LCP/INP/CLS/TTFB/API-p95 bei jedem Live-Test als Benchmark speichern).

## Messergebnis (sw v712, 5 Runs, Chrome headless/CDP)

| Metrik | Kalt p75 | Warm p75 | Budget | Bewertung |
|---|---|---|---|---|
| CLS | 0 | 0 | < 0,1 | OK |
| INP | 56 ms | 64 ms | < 200 ms | OK (3,5× Reserve) |
| LCP | 1.120 ms | 516 ms | < 1.500 ms | OK — trotz Netzlast |
| Seitengewicht | 298 KB | 4 KB | < 300 KB | OK — Verstoß vom 17.08. (505 KB) ist BEHOBEN |
| TTFB | 492 ms | 415 ms | < 200 ms | netzgefaelscht; Referenzmessung example.com 331–468 ms am selben Platz, gueltiger Alter Benchmark 111 ms p75 (04.08.) |
| First Token | nicht anonym messbar (401, Anmeldepflicht fail-closed) | < 1.000 ms | Messgrenze dokumentiert; letzter Tiefe-Spur-Wert 4.928 ms Median (Kimi K3 max, Salad-Kaltstart, 28.07.) |

Benchmark-Datei: `docs/benchmarks/webvitals_v712_expertencheck_2026-08-30.json`
(mit MESSVORBEHALT nach Projektvorbild).

## Ressourcen-Analyse (wo die 298 KB wohnen)

HTML 18 KB + 26 direkte Assets 117 KB komprimiert; Rest = dynamisch nachgeladene
Chat-/i18n-Module. Top-Blöcke: start-styles.css 26,0 KB; chat-store.js 12,4;
chat-actions.js 11,9; chat-history-view.js 11,1; app.js 10,5; chat-stopp.js 7,1.

## Experten-Entscheidung: KEINE erzwungene Optimierung

Begründung: Alle gültigen Metriken im Budget, keine Regression gegen die
Letztbenchmarks (Performance-Lock: „kein Deploy darf ein Budget
verschlechtern" — es verschlechtert nichts). Eine Optimierung ohne Verstoß
wäre Umbau ohne Not an Startseiten-nahen Dateien (Design-Lock-Nähe,
Lock-Kaskaden: start-lock, auslieferung-lock, assets-sync) — fachlich falsch,
Risk/Nutzen spricht dagegen. Reserven für künftiges Wachstum dokumentiert:

1. start-styles.css (26 KB) aufteilen: Start-Kritisch vs. Chat-Bereich
   (spart ~10–15 KB im ersten Paint) — erst wenn Gewicht wieder > 280 KB.
2. chat-store/actions/history-view (~35 KB) als Bündel nach erster
   Nutzerinteraktion statt Parallelload — entlastet LCP weiter.
3. Beides ist Frontend-Änderung → Ship-Loop + check:all + Lock-Neustempel;
   NICHT als Routine anfassen.

TTFB: Im Free-Stack-Policy-Rahmen („keine externen CDN/Edge") ist GitHub
Pages selbst das CDN — der 111-ms-Wert ist das erreichbare Optimum; kein
Handlungsbedarf, kein Policy-Verstoß zulasten der Geschwindigkeit.

## Nicht verändert

Kein Code, kein Deploy, keine Lock-Datei. Grund: kein Budget verletzt; alle
Optimierungskandidaten liegen in Design-Lock-Nähe (Rote Liste) — als
Freigabe-Anträge im Bericht statt eigenmächtigem Umbau. Schutz-Locks
unberührt und aktiv (check:guidelines 2001 Dateien OK im Abschlusslauf).

## API-p95

Live-Einzelwerte heute: healthz 200 in 0,76–1,30 s (Europa→Ashburn-Server,
Enthaltensein von TLS+Netz). Verteilte p95/p99 über Zeit liegen beim
Web-Vitals-/Status-Wächter (Nr. 63) — für den Bericht als Messpfad benannt,
keine Regression erkennbar (kein Deploy seit 26.08., keine Config-Änderung).
