# ERLEDIGT: Der Player ist in Ordnung — bewiesen

Diese Datei hieß am 2026-08-13 zuerst „Video kommt an, der Player zeigt es
nicht". **Das war ein Messfehler.** Inzwischen ist das Gegenteil bewiesen: der
live ausgelieferte Player spielt ein echtes Worker-Video ab, mit Ton.

Der Verlauf bleibt hier stehen, weil der Fehlschluss lehrreicher ist als das
Ergebnis.

## Der Beweis (2026-08-13, echter Chrome)

Gemessen mit `scripts/testing/pruefe_video_player.mjs`: der von smejj.com
geladene Player-Code, ein MP4 aus der echten Worker-Kette, dieselbe CSP wie
live (`media-src 'self' blob:`), in einem per CDP gestarteten Chrome.

```
WAV-Vorpruefung: KANN MEDIEN (1.0s)
readyState 4 | dauer 7.79 | groesse 512x512 | fehler null | stumm false | schleife false
Abspielprobe: gestartet true | 0s -> 1.46s | laeuft true | pausiert false
              tonspurVorhanden true | gepuffert 7.79
```

Also: geladen, abgespielt, die Zeit läuft, die Tonspur wird dekodiert, und die
für erzählte Videos nötigen Attribute (`muted=false`, `loop=false`) stimmen.

## Warum ich es zuerst für kaputt hielt

Im Agenten-Browser blieb der Player bei `readyState 0` — ohne Fehlercode.
Die Gegenprobe, die ich zuerst versäumt hatte:

| Test in der Agenten-Browser-Instanz | Ergebnis |
|---|---|
| Worker-MP4 über blob-URL | hängt |
| Worker-MP4 über MediaSource | hängt |
| **Unkomprimiertes WAV im `<audio>`** | **hängt** |
| **Dasselbe WAV im `<video>`** | **hängt** |

Ein WAV braucht keinen Codec. Dass selbst das hängt, heißt: diese Instanz
dekodiert überhaupt nichts. Jede `readyState`-Messung darin ist wertlos.

`canPlayType` warnt dabei NICHT — es antwortete `"probably"` für
`avc1.64001e`, prüft aber nur den MIME-String, nie den echten Decoder.

## Merkregel

**Vor jeder Player-Messung im Agenten-Browser erst ein WAV testen.** Kommt dort
kein `loadedmetadata`, misst man den eigenen Browser und hält es für einen
Produktfehler. Für echte Medien-Proben gehört der Weg über
`scripts/testing/cdp-client.mjs` (richtiger Chrome), nicht der Agenten-Browser.

## Nachmessen

```bash
SMEJJ_VIDEO_PROBE_DIR=/pfad/mit/end-ok.mp4 node scripts/testing/pruefe_video_player.mjs
```

Erwartet: `WAV-Vorpruefung: KANN MEDIEN`, dann `readyState 4` und
`laeuft true`.
