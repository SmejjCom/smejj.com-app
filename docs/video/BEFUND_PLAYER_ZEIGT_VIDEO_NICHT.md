# BEFUND: Video kommt an, der Player zeigt es nicht

Gemessen am **2026-08-13 gegen 11:15** live auf smejj.com, im angemeldeten
Browser des Betreibers. Diese Notiz ist für die Sitzung, die gerade am
Wiedergabepfad arbeitet (`feat(video): browserfeste Wiedergabe — fMP4 +
MediaSource-Weiche mit blob-Reserve`). **Ich habe den Player NICHT angefasst**,
um nicht in halbfertige fremde Arbeit zu greifen.

## Kurz

Die Erzeugung ist vollständig in Ordnung. Der `<video>`-Player bleibt bei
`readyState 0` und lädt nie — ohne Fehlercode.

## Was nachweislich funktioniert

| Stufe | Beleg |
|---|---|
| Auftrag erkannt | Videospur übernimmt, Profil `video-erzeugung` |
| Fortschritt | „Erzeuge dein Video · läuft … 40 s", eine Zeile, Schimmerkarte da |
| Bild-Maler | Schritt „Male dein Bild ✓ fertig" |
| Video-Worker | Schritt „Erzeuge dein Video ✓ fertig"; im Zeabur-Log `POST /erzeuge → 200 OK` |
| Hinweistext | „Räumliche Kamerafahrt … Erzählt von der Stimme von smejj 1.0." |
| Player-Attribute | `muted=false`, `loop=false` — für erzählte Videos korrekt |

## Was scheitert

```
readyState: 0        (nie geladen)
networkState: 2      (LOADING, bleibt stehen)
duration: NaN
videoWidth/Height: 0x0
error: null          (KEIN Fehlercode — es scheitert still)
src: blob:https://smejj.com/…
```

Reproduzierbar bei **beiden** Videos im Verlauf, auch bei einem frisch
erzeugten. Der Blob ist danach nicht mehr abrufbar (XHR auf die blob-URL
scheitert), während `fetch(data:…)` einwandfrei funktioniert.

## Ursachen, die ich AUSGESCHLOSSEN habe

1. **Das MP4 ist gut.** Aus der Container-Probe mit demselben Worker-Code:
   91 KB, Boxenfolge `ftyp moov moof mdat mfra` — also **bereits
   fragmentiert** (MediaSource-tauglich), H.264-Bild + AAC-Ton, von ffmpeg
   gegengeprüft. Ein fehlendes `moof` ist NICHT das Problem.
2. **Die CSP ist korrekt verstanden.** `media-src 'self' blob:` — `data:` ist
   wirklich verboten, der Blob-Umweg ist also nötig und richtig.
3. **Der `fetch`-Patch der App ist unschuldig.** `window.fetch` ist zwar
   überschrieben (`passkey-ui.js`), liefert für `data:video/mp4;base64,…` aber
   sauber einen Blob mit korrektem Typ.
4. **Der Worker ist nicht überlastet.** CPU im Tagesmittel < 10 %.

## Wo der Verdacht liegt

Der ausgelieferte Player trägt den Kommentar *„Browserfester Wiedergabepfad
(Nacht-Umbau 2026-08-13): zuerst MediaSource —"*. Der MediaSource-Pfad wird
also betreten, füllt aber offenbar nie den `sourceBuffer` (daher `readyState 0`
ohne Fehler), und **die im Commit-Titel angekündigte blob-Reserve fängt diesen
Fall nicht auf**.

Zu prüfen wäre dort:
- Stimmt der Codec-String in `MediaSource.isTypeSupported` / `addSourceBuffer`
  mit dem echten Inhalt überein (`video/mp4; codecs="avc1.…, mp4a.40.2"`)?
- Wird `sourceBuffer.appendBuffer` überhaupt erreicht, und kommt `updateend`?
- Greift die Reserve auch dann, wenn MediaSource **still** hängt statt zu
  werfen? Ein Zeitlimit („nach N Sekunden ohne `loadedmetadata` → blob") würde
  genau diesen Fall abfangen.
- Wird die blob-URL evtl. zu früh freigegeben? (`revokeObjectURL` steht nicht
  im ausgelieferten Bündel, aber der Blob ist hinterher tot.)

## So misst man es nach

Im angemeldeten Browser auf smejj.com, nach einem Video-Auftrag:

```js
const v = [...document.querySelectorAll('video.chat-video')].pop();
({ readyState: v.readyState, netzwerk: v.networkState, dauer: v.duration,
   groesse: v.videoWidth + 'x' + v.videoHeight,
   fehler: v.error && v.error.code, quelle: (v.currentSrc||v.src).slice(0,30) });
```

Erwartet bei Erfolg: `readyState 4`, echte Dauer, `512x512`.
