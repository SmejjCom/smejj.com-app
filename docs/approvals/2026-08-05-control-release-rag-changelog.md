# Freigabe: Control-Release „RAG-Changelog" (2026-08-05)

## Wortlaut des Betreibers

> **„Ja, mach Weg C"**

Weg C war zuvor so beschrieben und damit Gegenstand der Freigabe:

> Erst A, dann nach deinem „fertig" mein Einwilligungs-Release. Zwei
> Ausrollzeiten, dafür ist bei einem Fehler klar, welcher Deploy es war.
>
> A — Nur ihr Anliegen, sauber getrennt. Schmales Artefakt aus dem Live-Stand:
> Rückbau `a6f7d62` + `fdafbeb`, sonst nichts.

Diese Datei deckt **ausschliesslich Release A**. Das Einwilligungs-Release
(Endpunkt + Fragen-Erfassung, Freigabe vom selben Tag) bleibt getrennt und
wartet weiterhin auf die sechs `SMEJJ_TRAINING_*`-Werte.

## Warum ueberhaupt

Eine Parallelsitzung hat eine heute entstandene Regression gemeldet: der
sw-Changelog wanderte von `sw.js` (nie im Korpus) nach
`docs/frontend/SW_VERSIONSVERLAUF.md` und wurde dadurch Projektwissen. Der
Befehlsfall „Loesche bitte alle alten Dateien im Objektspeicher" erreichte
damit 21,1 Punkte gegen die RAG-Schwelle 20 — also Kontext fuer eine
Handlungsaufforderung, genau das, was der Wächter verhindern soll.

Die Meldung kam **ueber eine andere Sitzung mit berufener Betreiber-Autoritaet**
und wurde nicht ausgefuehrt, sondern dem Betreiber vorgelegt. Die Freigabe oben
ist die Antwort darauf.

## Umfang — vier Dateien, zwei davon Produktion

Basis ist der **Live-Commit** `1ed22db`, nicht `HEAD`. Aus HEAD haette das
Artefakt 41 fremde Commits mitgenommen, darunter eine 57-Zeilen-Aenderung an
`public/account-sessions.js` (Anmeldung).

| Datei | Herkunft |
| --- | --- |
| `control-server/src/rag/knowledgeCorpus.js` | `fdafbeb` (+20) |
| `src/search/webSearch.js` | Rueckbau von `1ed22db` (−42), entspricht `a6f7d62` |
| `tests/rag-search.test.mjs` | `fdafbeb` (+8) |
| `tests/websuche-region.test.mjs` | Rueckbau (−56) |

Aus `fdafbeb` **entfernt**: `tests/training-fragenerfassung.test.mjs`. Der Test
importiert `src/training/fragenerfassung.js`, das es auf der Live-Basis noch
nicht gibt — er faellt dort mit `ERR_MODULE_NOT_FOUND` durch (gemessen). Er
gehoert zum Einwilligungs-Release und geht mit diesem live.

## Artefakt

- Release-Id: `smejj-control-rag-changelog-2026-08-05`
- sha256: `7ca3f81a26660f06e0122dc18097102e8231f8a698776e693bcc4157e69d824c`
- 1016 Dateien, 2.380.724 Bytes, `secretsIncluded: false`

## Nachweise vor dem Upload

- 44/44 Tests gruen (`rag-search`, `websuche-region`) auf der Release-Basis.
- Im **entpackten Tarball** geprueft, nicht im Arbeitsbaum:
  `knowledgeCorpus.js` traegt `CHANGELOG_FILE_PATTERN`, `webSearch.js` traegt
  kein Kompositum mehr, `src/training/fragenerfassung.js` fehlt.
- `control-server/src/routes/trainingConsentRoutes.js` ist **byte-identisch**
  mit `1ed22db` (`a9cfa196df893897…`) — meine `handleNotice`-Aenderung ist
  nicht mitgegangen.

## Nachweise nach dem Ausrollen

Salad-Gruppe `smejj-control`: Version **143**, Instanz `running`, `bereit: true`,
`gestartet: true`, **85** Umgebungsvariablen (unveraendert — nichts verloren).
Die Instanz laeuft auf Version 143, hat den neuen Stand also wirklich geladen
und nicht nur den Zeiger bekommen.

Verhaltensbeweis, gemessen auf dem **entpackten Artefakt** gegen den vorherigen
Live-Stand:

| | vorher (`1ed22db`) | jetzt |
| --- | --- | --- |
| `docs/frontend/SW_VERSIONSVERLAUF.md` | im Korpus | draussen |
| `docs/frontend/VERSIONSVERLAUF.md` | im Korpus | draussen |
| `docs/CHANGELOG.md` | im Korpus | draussen |
| `AI_Guidelines.md` | im Korpus | **im Korpus** |
| `docs/frontend/AUTH.md` | im Korpus | **im Korpus** |
| geladene Wissensdateien | 96 (davon 1 Changelog) | 95 (davon 0) |

Kein Kollateralschaden: die echten Wissensdateien bleiben drin.

### Zusatzbefund — die Luecke war groesser als gemeldet

Die gemeldete Datei `docs/frontend/SW_VERSIONSVERLAUF.md` existierte im
**Live-Stand ueberhaupt noch nicht**; sie wurde erst nach `1ed22db` angelegt.
Die Regression war also noch gar nicht live, sondern haette es mit dem naechsten
Release geworden.

Dafuer lag eine ANDERE Datei die ganze Zeit im Live-Korpus:
`docs/frontend/CHANGELOG.md`. Sie war der einzige Changelog unter den 96
geladenen Wissensdateien — und niemand hatte sie gemeldet.

Der Fix schliesst damit zweierlei: eine Luecke, die live offen war, und eine,
die es geworden waere.

## Ruecknahme

Der Live-Stand vor diesem Release ist `1ed22db` mit dem Artefakt
`smejj-control-websuche-komposita-2026-08-05.tar.gz`. Zuruecksetzen heisst:
Artefakt-Schluessel und sha256 in der Salad-Umgebung wieder darauf setzen und
den Container neu starten. Kein Datenverlust, keine Migration.
