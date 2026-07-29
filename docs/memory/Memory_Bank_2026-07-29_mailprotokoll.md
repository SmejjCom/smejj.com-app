# Memory_Bank — 2026-07-29: Zustellprotokoll und Merge-Pruefung

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel.
> Capsule: `job_mailprotokoll_merge_20260729`.

## [2026-07-29] ZUSTELLPROTOKOLL LIVE — aus dem Hinweis wird ein Nachweis

Freigabe Punkt 2 vom 2026-07-29. Commit `c8cc628`, Control-Server
**Version 119**, Artefakt
`deployments/control/smejj-control-mailprotokoll-2026-07-29.tar.gz`.
Rueckweg: `smejj-control-websuche-2026-07-29-rc3.tar.gz`.

### Drei Entscheidungen

1. **Ein Fehlschlag beim Protokollieren darf nie eine Mail verhindern.** Das
   Protokoll ist ein Nachweis, keine Voraussetzung — fail-open als bewusste
   Ausnahme von der sonstigen Regel dieses Projekts.
2. **Der Mailtext wird nicht gespeichert.** Betreff ja, Inhalt nein — dort
   steht der Anmeldelink.
3. **Geloescht wird nur, was die Freigabe deckt.** Zwei Sicherungen: die erste
   prueft das Datum (WANN), die zweite den Schluessel (WO).
   `darfGeloeschtWerden()` laesst ausschliesslich
   `mail/zustellung/JJJJ/MM/TT/mail_<uuid>.json` durch; ein Schluessel ohne
   erkennbares Datum bleibt im Zweifel stehen.

Der Signierer bekam dafuer `signedS3Delete` — bewusst nackt: ein Objekt je
Aufruf, kein Praefix-Loeschen, kein Batch. **Er kennt keine Regeln darueber,
was geloescht werden darf.** Das ist Aufgabe des Aufrufers, und das steht auch
so in der Datei, damit ein zweiter Aufrufer es sieht.

## [2026-07-29] MERGE NACH MAIN: NICHT DURCHGEFUEHRT — getrennte Wurzeln belegt

Die Freigabe erlaubte den Merge nur, wenn belegt ist, dass nichts verlorengeht.
Der Beleg sagt das Gegenteil:

| | origin/main | Arbeits-Branch |
|---|---|---|
| Wurzel-Commit | `335ac7a` | `d46cfda` |
| Commits | 64 | 269 |
| Letzte Aktivitaet | 17.07.2026 | heute |
| Dateien | 855 | 1488 |

`git merge-base HEAD origin/main` findet **keinen gemeinsamen Vorfahren**. Ein
Merge braeuchte `--allow-unrelated-histories` und traefe **386 gleichnamige
Dateien**, die alle einzeln aufzuloesen waeren.

**Der Memory-Eintrag `smejj-repo-main-unrelated` stimmt also — aber nur fuer
`origin/main`.** Das LOKALE `main` (9af9906) teilt die Wurzel mit dem
Arbeits-Branch und sah harmlos aus; es ist ein anderer, veralteter Zweig.
**Wer die Merge-Frage lokal prueft, bekommt die falsche Antwort.**

Wichtiger Zusatzbefund: `origin/HEAD` zeigt auf den Arbeits-Branch. **main ist
nicht der Produktionszweig** — die Seite wird aus `gh-pages` bedient. Ein Merge
wuerde also eine aufgegebene Linie wiederbeleben, ohne dass irgendetwas davon
abhaengt.

## FALLE: gegen das falsche Artefakt verglichen

Beim Deploy habe ich zuerst gegen mein EIGENES vorheriges Artefakt verglichen
(`modul-vb`) statt gegen das tatsaechlich LIVE laufende (`websuche-rc3` der
Parallel-Session). Das ist der falsche Bezugspunkt: der Rueckschritt entsteht
gegenueber dem, was laeuft, nicht gegenueber dem, was ich zuletzt gebaut habe.

Nachtraeglich geprueft: kein Schaden — mein Stand war ueberall der neuere
(Beispiel: die Maus-Token-Capsule 11.772 gegen 9.056 Bytes). Aber die Pruefung
war Glueck, nicht Methode.

**Regel: Der Abgleich vor dem Deploy geht IMMER gegen
`SMEJJ_CONTROL_ARTIFACT_KEY` aus der laufenden Umgebung — nie gegen das zuletzt
selbst gebaute Artefakt.**
