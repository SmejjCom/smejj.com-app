# Task Capsule — job_appjs_aufteilung_20260728

Datum: 2026-07-28
Auftrag: "Ja, Punkt 1" (Wof Kadavanich) — app.js aufteilen
Status: abgeschlossen, live verifiziert

## Ziel

`public/app.js` stand bei 1411 Zeilen gegen ein Limit von 800 und lebte seit
Juli nur von einer Ratchet-Ausnahme, die mehrfach hochgesetzt wurde. Jede
Aenderung dort kostete eine eigene Freigabe.

## Ergebnis

**1411 -> 800 Zeilen. Die Ratchet-Ausnahme ist ersatzlos entfernt** — fuer
app.js gilt jetzt dieselbe 800-Zeilen-Regel wie fuer jede andere Datei.

Sieben neue Module, Code jeweils zeilengleich uebernommen:

| Modul | Inhalt |
|---|---|
| `google-login.js` | Google-Anmeldung der Profilseite |
| `projects-surface.js` | Projekte anlegen, auswaehlen, auflisten |
| `local-workspace-surface.js` | lokaler Arbeitsbereich, Projektstatus |
| `uploads-surface.js` | Datei-Uploads inkl. der harten Grenzen |
| `free-coding-fallback.js` | kostenfreier Coding-Rueckfall |
| `panel-layout.js` | Breite und Zustand der Seitenleisten |
| `view-routes.js` | Ansichtstabellen und Adresslogik |

Einzige inhaltliche Anpassung: was frueher aus dem Modulumfeld von app.js kam,
wird jetzt ausdruecklich als `deps` gereicht. Das macht die Bloecke zugleich
testbar.

`goToView` bleibt bewusst in app.js: es wird an viele Stellen gereicht, ein
Umzug haette echtes Regressionsrisiko ohne Zusatznutzen.

## Zwei Fehler, beide live gefunden und behoben

Der Ship-Loop lief drei Runden:

1. **`setText is not defined`** — local-workspace-surface.js nutzte den Helfer,
   er blieb aber in app.js. Die Oberflaechen rendern trotzdem, der Chat
   antwortete korrekt; nur der Statuszeilen-Aufbau brach still ab. Genau die Art
   Fehler, die eine reine Testsuite nicht findet: alle 160 Tests waren gruen.
2. **`renderEmptyState` und `refreshSessionStatus`** — dieselbe Ursache, aber in
   der ZWEITEN Funktion des Moduls. Mein erster Fix hatte den Helfer nur der
   ersten Funktion mitgegeben.

**Lehre:** Vollstaendigkeit muss **pro Funktion** geprueft werden, nicht pro
Datei. Die Gegenprobe laeuft jetzt so und hat alle sieben Module bestaetigt.

## Verifikation

| Check | Ergebnis |
|---|---|
| `check:frontend` | 160/160 |
| `check:guidelines` | OK **ohne** Ausnahme fuer app.js |
| `check:precache-imports` | 80 Module, vollstaendig |
| `check` (Syntax), `check:favicon-lock`, `check:start-lock` | gruen |

**Live-Klickpfad auf smejj.com** (frischer Cache, sw v157): Startseite,
Navigation (7 Knoepfe), `/projects`, `/settings`, Projektliste, Upload-Feld,
Google-Feld, Automatik-Oberflaeche — alles vorhanden. Chat antwortet.
**0 JavaScript-Fehler.**

sw.js v154 -> v157 (drei Runden), alle sieben Module im Precache — Pflicht, da
app.js sie importiert.

## Rollback

Git-Tag `rollback/appjs-aufteilung-2026-07-28` (`b280f78`), Dateikopien in
`backups/rollback-aufteilung-2026-07-28/`. Live-Rollback: Frontend-Repo auf
`ca8a42a`.

## Offen

`src/server.js` steht bei 799 von 800 Zeilen — im Limit, aber ohne Luft. Fuer
die naechste Aenderung dort empfiehlt sich dieselbe Behandlung.
