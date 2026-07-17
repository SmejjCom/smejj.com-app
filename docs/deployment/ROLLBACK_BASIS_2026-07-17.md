# Rollback-Basis — erster Commit (2026-07-17)

Schriftliche Freigabe: „Punkt 1 / Ja" (Wof Kadavanich, 2026-07-17) — Git initialisieren,
erster Commit als Rollback-Punkt.

## Architektur

Bis heute hatte smejj.com **keinen einzigen Commit**. `AI_Guidelines.md` Abschnitt 1.4
verlangt vor jeder Änderung einen Rollback (Git-Branch oder Commit-Referenz), und der
Master Prompt fordert „Vor jeder freigegebenen Änderung: Rollback-Punkt sichern".
Diese Grundlage fehlte. Jede Änderung war ein Blindflug; die 98 Ordner unter `backups/`
waren der faktische Ersatz, von Hand gepflegt.

Entscheidung: **lokaler Commit, kein Push.** Der Rollback-Punkt ist lokal vollständig
wirksam. Ein Push zu `origin` (github.com:SmejjCom/smejj.com-app.git) veröffentlicht
den gesamten Bestand und ist eine eigene Entscheidung mit eigener Freigabe.

## Ergebnis

```
Commit:  d46cfda  chore: Rollback-Basis fuer smejj.com
Dateien: 782 (4.85 MB)
Objekte: 895, davon fehlend: 0
Branch:  main
Push:    NEIN — bleibt lokal bis zur schriftlichen Freigabe
```

Kein Dateiinhalt geändert. Reine Bestandsaufnahme des verifizierten Ist-Zustands.

## Warum es bisher nicht ging — Ursache gefunden

`.git/index.lock` war seit **2026-07-15 09:01** verwaist: 0 Bytes, kein laufender
Git-Prozess. Git verweigert jede schreibende Operation, solange diese Sperre liegt.
**Jeder Commit-Versuch seit zwei Tagen ist daran gescheitert.** Sperre entfernt,
verwaiste Git-Temp-Objekte aufgeräumt.

## Kritischer Befund: Das Repo liegt in Google Drive

`git fsck` meldet sechs beschädigte Objekte. Ihre Dateinamen verraten die Ursache:

```
.git/objects/02/1744e71daed2703033bf656cbef083b0862cdc (1)
.git/objects/36/74b05f45f5b1883bd42fb51927cd3ebfb29381 2
```

Die Suffixe `(1)` und ` 2` sind **Google-Drive-Duplikate**. Drive synchronisiert das
`.git`-Verzeichnis mit und legt bei Konflikten Kopien an. Dazu passen die verwaisten
Reflog-Einträge (`ff612fd9`, `ca316049`) — sie zeigen auf Objekte, die es nicht mehr
gibt. Es gab also **frühere Git-Historie, die Drive zerstört hat**.

Der neue Commit d46cfda ist davon nicht betroffen: alle 895 Objekte sind erreichbar,
0 fehlen, Rollback verifiziert. Aber das Grundproblem bleibt:

> **Ein Git-Repository in einem Google-Drive-Ordner wird weiter korrumpieren.**
> Drive kennt Gits Sperr- und Umbenennungssemantik nicht. Verwaiste Locks,
> Duplikate und verlorene Objekte sind die Folge — genau das ist hier passiert.

Empfehlung: Repo auf eine lokale Platte außerhalb der Drive-Synchronisation
verschieben (`docs/deployment/UMZUG_LOKALE_PLATTE.md` existiert bereits). Solange
das nicht passiert, ist jeder Rollback-Punkt nur bedingt haltbar. **Nicht umgesetzt —
Ortswechsel des Repos berührt Zugänge und braucht schriftliche Freigabe.**

## Tests

Alle live ausgeführt, nicht behauptet.

| Prüfung | Ergebnis |
|---|---|
| Secret-Scan über alle 782 Dateien | kein Fund |
| `.env.example` | nur Platzhalter + öffentliche Prüfsumme |
| echte `.env` vorhanden? | nein |
| `backups/`, `tmp/`, `node_modules/`, `UPLOAD-*` ausgeschlossen | ja, 0 Dateien |
| Größe / LFS-Bedarf | 4.85 MB, größte Datei 200 KB — kein LFS |
| Objekt-Vollständigkeit des Commits | 895 erreichbar, 0 fehlend |
| **Rollback-Test an `public/config.js`** | **md5 vorher = md5 nachher, exakt wiederhergestellt** |
| `npm run check:guidelines` | OK — 713 Dateien, 800-Zeilen-Regel und Naming intakt |

Der Secret-Scan-Treffer in `tests/training-pipeline.test.mjs` ist eine Test-Fixture
des Sanitizer-Tests (`ghp_objectkeyvalue1234567890123456`), kein echter Token.

### Rollback benutzen

```bash
# einzelne Datei zurücksetzen
git checkout -- pfad/zur/datei

# alles zurück auf die Basis
git reset --hard d46cfda

# ansehen, was sich seit der Basis geändert hat
git status
git diff
```

## Memory Update

Für `Memory_Bank.md`:

> **Architektur-Befund (2026-07-17):** Das Repo liegt in Google Drive. Drive
> synchronisiert `.git` mit und zerstört dabei Git-Objekte — sechs beschädigte
> Duplikate mit `(1)`/` 2`-Suffix, verwaiste Reflog-Einträge, und ein verwaister
> `index.lock` vom 15.07., der zwei Tage lang jeden Commit blockierte. Frühere
> Historie ist dadurch verloren. Git und Cloud-Sync vertragen sich nicht.
>
> **Verifizierte Lösung:** Erster Commit d46cfda als Rollback-Basis, lokal, nicht
> gepusht. Rollback per `git checkout --` an einer echten Datei verifiziert
> (md5-Vergleich). `check:guidelines` grün.
>
> **Offen:** Repo-Umzug aus Google Drive heraus. Ohne ihn korrumpiert Git weiter.

## Nächster Schritt

1. **Repo aus Google Drive herausholen** — sonst wiederholt sich der Schaden.
   Braucht Freigabe (berührt Zugänge/Ablageort).
2. Danach: CSS-Patch aus `README-PATCH.md` einspielen, jetzt mit echtem Rollback-Netz.
3. Weiterhin blockierend für jeden Login: der Control Server hat keinen Betriebsort.
   GitHub Pages kann kein Backend ausführen. Kosten- und damit freigabepflichtig.
