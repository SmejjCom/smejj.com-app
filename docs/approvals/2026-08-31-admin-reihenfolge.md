# Freigabe: Admin-Konsolen-Navigation neu geordnet (2026-08-31)

## Was freigegeben wurde

Der Betreiber (Wof Kadavanich / Alan Best) hat im ZCode-Chat am 31.08.2026 mit
**„Ja"** die neue Reihenfolge der Admin-Navigation freigegeben — nach vorheriger
Diskussion, in der die erste (nur häufigkeitsbasierte) Reihenfolge verworfen und
die gewichtete Reihenfolge (Wirkung × Vernachlässigungsrisiko × Häufigkeit)
ausdrücklich gebilligt wurde (Korrekturwünsche: Analytik und Freigaben gehören
nach oben).

## Die freigegebene Reihenfolge

Nummer konsoleweit, vier Stufen als Gruppen:

**Stufe 1 — Betrieb & Entscheidungen (1–10):** 1 Autopiloten · 2 Analytik ·
3 Nutzerverwaltung · 4 Modelle & Provider · 5 Jobs & Läufe · 6 Worker & Kapazität ·
7 Kosten & Budgets · 8 Abrechnung & Abos · 9 API & Schlüssel · 10 E-Mail-Zustellung

**Stufe 2 — Governance & Sicherheit (11–18):** 11 Freigaben · 12 Sicherheit ·
13 Missbrauch & Moderation · 14 Betrieb & Deploy · 15 Speicher ·
16 Schlüssel & Geheimnisse · 17 Audit-Log · 18 DSGVO-Vorgänge

**Stufe 3 — Zugänge & Recht (19–23):** 19 Admin-Verwaltung · 20 Rollen & Rechte ·
21 EU AI Act · 22 Support & Impersonation · 23 Aufgaben & Notizen

**Stufe 4 — Produktsteuerung (24–28):** 24 Feature-Flags · 25 Ankündigungen ·
26 Inhalte & Wissen · 27 Experimente · 28 Sprachen

Die Übersicht bleibt unangetastet als Startseite („Überblick") ganz oben.

## Umfang (bewusst eng)

- NUR die Reihenfolge und die Gruppen-Namen in der Navigation (`console.js`).
- Keine neuen Navigationspunkte: stage10/11/12/13 (radar, evolution, cockpit,
  …) bleiben auf Live unverändert unregistriert — der Bündel-Abgleich ist ein
  EIGENES, separat freizugebendes Thema.
- Keine Inhalts-, API-, Test- oder Rechte-Änderung.

## Betroffene Dateien (drei Kopien desselben Skripts)

1. `control-server/admin-ui/console.js` — Quelle (Registraturstand incl. stage11).
2. `public/admin/console.js` — Spiegel im App-Repo (= Live-Stand).
3. `~/smejj-app-frontend/admin/console.js` — Deploy-Klon (wird über
   `deploy-frueh-gate` → `origin/main` auf GitHub Pages ausgeliefert).

Die Reihenfolge-Änderung ist in allen drei Kopien wortgleich; die bekannte
Quelle-/Live-Divergenz (stage11-Registratur) bleibt unberührt.

## Rollback

- App-Repo: Stand vor der Änderung `733d52c11bd79b3221a511f0c9ad7a9bd8281c69`
  (feature/design-v11) — Rollback: revert dieses Commits.
- Frontend-Klon: Stand vor der Änderung `4ba2c20ec1f14a2425ea5e9223645a2b079f99cd`
  (deploy-frueh-gate == origin/main, Live sw v716) — Rollback: revert des
  Deploy-Commits und erneut pushen; die Änderung liegt nur in
  `admin/console.js` (nicht im SW-Precache, daher kein SW-Stempel nötig).

## Prüfpflichten vor Deploy

`check:admin-console-sync`, `check:admin-konsole`, Test
`tests/adminbereich-anmeldepflicht.test.mjs`, danach die komplette Pipeline
`check:all` + `check:guidelines`. Live-Test nach dem Push (Navigationsreihenfolge
und Seitenladung auf smejj.com/admin/).
