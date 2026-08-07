# Freigabe: Grund-Pflicht der Akteneinsicht schliessen (2026-08-07)

## Wortlaut des Betreibers

> **„Ja, ausrollen"**

Gewählt auf die vorgelegte Frage „Grund-Lücke jetzt ausrollen?", mit dem
ausdrücklichen Inhalt: Control-Release aus HEAD bauen (Umfang: nur der
Grund-Fix), hochladen, umschalten, danach live nachmessen.

Vorausgegangen war der Auftrag „mach nochmal, muss einwandfrei funktionieren" —
der zweite vollständige A–Z-Durchlauf des Adminbereichs, bei dem dieser Befund
aufgefallen ist.

## Der Befund

Die Einsicht in eine Nutzerakte ist ein Zugriff auf personenbezogene Daten. Sie
verlangt einen Grund und wird protokolliert. Geprüft wurde bisher nur die
**Länge** (`reason.length < 3`).

`control-server/admin-ui/api.js` baut die Adresse mit
`encodeURIComponent(grund)`. Fehlt der Grund, entsteht daraus die
**Zeichenkette** `"undefined"` — neun Zeichen, also lang genug. Die Akte ging
auf, und im Nachweisregister stand als Grund `undefined`.

**Sichtbar geworden** in der Audit-Ansicht der Konsole: fünf Einträge der Aktion
`user.record.read` trugen in der Spalte „Grund" das Wort `undefined`. Sie
stammen von den Prüfaufrufen dieser Sitzung — genau dadurch fiel die Lücke auf.

**Die Oberfläche war nie betroffen:** `console.js` fragt den Grund per Dialog ab
(Mindestlänge 3). Die Lücke lag an der Schnittstelle — also dort, wo sie jeder
künftige Aufrufer wieder getroffen hätte.

## Die Änderung

`control-server/src/routes/adminRoutes.js`: Wörter, die nur aus einem Fehler
stammen können und nie aus einem Menschen, der einen Grund eintippt
(`undefined`, `null`, `NaN`, `none`, `-`, `n/a`, `k.A.`), zählen wie gar kein
Grund. Die Datei steht **nicht** unter `admin lock v1`.

`control-server/src/routes/adminAkteGrund.test.js` (neu), drei Tests:

1. kein Parameter / leer / zu kurz → 400
2. `undefined` und seine Geschwister → 400, und **kein** Audit-Eintrag
3. echter Grund → 200, Eintrag mit genau diesem Grund

**Gegenprobe statt Behauptung:** Dieselben Tests gegen einen Worktree auf dem
Stand *ohne* Fix — dort fällt genau der `undefined`-Fall durch
(„neun Zeichen sind lang genug — Länge allein reicht als Prüfung nicht").

## Release

- Artefakt `smejj-control-akte-grundpflicht-2026-08-07.tar.gz`,
  SHA-256 `bbda71bcf606f51b2b2e90af60bc98db752606af581437309c6052f8827f3d56`
- Salad-Gruppe `smejj-control`, Version 162, 92 Umgebungsvariablen unverändert
- Umfang gegen den vorigen Live-Stand: **genau ein Commit** (`d286efa`)
- Beim Hochladen lief die Standard-Zeitgrenze von 30 s zweimal ab;
  mit `IDRIVE_E2_RELEASE_TIMEOUT_MS=120000` ging es durch. Kein Fehler im Code,
  sondern eine langsame Leitung zu IDrive e2 zu diesem Zeitpunkt.
