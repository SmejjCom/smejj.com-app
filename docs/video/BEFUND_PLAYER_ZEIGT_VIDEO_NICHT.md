# ZURÜCKGEZOGEN: „Video kommt an, der Player zeigt es nicht"

**Diese Notiz behauptete am 2026-08-13, der Wiedergabepfad sei defekt. Das war
ein MESSFEHLER meiner Prüfumgebung. Der Player-Code ist NICHT als defekt
belegt — wer hier nach einem Fehler sucht, sucht vermutlich am falschen Ort.**

Ich lasse den Text stehen statt ihn zu löschen, damit die Messungen und vor
allem der Fehlschluss nachvollziehbar bleiben.

## Was ich gemessen hatte

Im angemeldeten Browser blieb der `<video>`-Player bei `readyState 0`,
`0x0`, `duration NaN`, **ohne Fehlercode** — bei beiden Videos im Verlauf und
auch bei einem frisch erzeugten. Daraus schloss ich auf einen Fehler im
MediaSource-Pfad des Nacht-Umbaus.

## Warum der Schluss falsch war

Die Gegenprobe, die ich zuerst versäumt hatte:

| Test in derselben Browser-Instanz | Ergebnis |
|---|---|
| Worker-MP4 über blob-URL | hängt, `readyState 0` |
| Worker-MP4 über MediaSource | hängt, `readyState 0` |
| **Unkomprimiertes WAV im `<audio>`** | **hängt, `readyState 0`** |
| **Dasselbe WAV im `<video>`** | **hängt, `readyState 0`** |

Ein WAV braucht **keinen Codec** — es ist der trivialste denkbare Fall. Dass
selbst das hängt, heißt: **der Media-Stack dieser automatisierten
Chrome-Instanz dekodiert überhaupt nichts.** Jede Messung an `readyState`
in dieser Umgebung ist wertlos, egal welcher Code dahintersteht.

`canPlayType` half nicht beim Erkennen: Es antwortete brav `"probably"` für
`avc1.64001e` — aber es prüft nur den MIME-String, nicht den echten Decoder.

## Was trotzdem gesichert ist (davon unberührt)

Diese Belege stammen nicht aus dem Browser und gelten weiter:

- Die **Erzeugung** ist vollständig in Ordnung: im Zeabur-Log des Workers steht
  `POST /erzeuge → 200 OK`; die Schritte melden „Male dein Bild ✓ fertig" und
  „Erzeuge dein Video ✓ fertig"; der Hinweistext und `muted=false/loop=false`
  stehen korrekt in der Antwort.
- Das erzeugte **MP4 ist gültig**: 91 KB, `ftyp moov moof mdat mfra`,
  H.264 (High, Level 3.0 = `avc1.64001e`) + AAC — außerhalb des Browsers mit
  ffmpeg gegengeprüft.
- Die **CSP** verlangt den blob-Umweg wirklich (`media-src 'self' blob:`).

## Was offen bleibt

**Ob der Player im normalen Browser des Betreibers funktioniert, ist NICHT
geprüft** — weder positiv noch negativ. Das lässt sich nur dort messen:

1. Auf smejj.com ein Video erzeugen lassen.
2. Spielt es ab → alles gut, hier ist nichts zu tun.
3. Dreht der Ladekreis ewig → dann erst lohnt der Blick in den
   MediaSource-Pfad, und dann mit dieser Konsolen-Zeile:

```js
const v = [...document.querySelectorAll('video.chat-video')].pop();
({ readyState: v.readyState, dauer: v.duration, fehler: v.error && v.error.code });
```

**Merkregel für die nächste Player-Messung:** Erst mit einem WAV prüfen, ob die
Umgebung überhaupt Medien abspielen kann. Sonst misst man den eigenen Browser
und hält es für einen Produktfehler.
