# FREIGABE-VORLAGE: Echte Video-Bewegung über fal.ai (Weg C)

Status: **ENTWURF — noch NICHT wirksam.** Der Code ist gebaut und deployt,
aber **fail-closed**: ohne den API-Schlüssel `SMEJJ_VIDEO_EXTERN_KEY` existiert
der Weg nicht — kein Aufruf, kein Cent. Wirksam wird er erst, wenn der
Betreiber die drei Schritte unten selbst ausführt.

## Die Entscheidung (Betreiber, 2026-08-13 im Chat)

Nach zwei Qualitätstests („besser, aber nicht gut genug") hat der Betreiber
Weg C gewählt: echte Motivbewegung über eine externe Video-KI. Das ändert
zwei frühere eigene Vorgaben, und zwar bewusst:

1. ~~„kein Fremd-Bildanbieter"~~ → für **Video-Bewegung** gilt das nicht mehr.
   Das **Bild** malt weiterhin der eigene Bild-Maler (0 €), samt
   Personen-Schutzfilter — blockt der, läuft auch extern nichts.
2. ~~„alles auf Zeabur, fester Betrag"~~ → es kommt ein nutzungsabhängiger
   Posten dazu, gedeckelt (siehe Zahlen).

## Die Zahlen (recherchiert 2026-08-13)

| | |
|---|---|
| Anbieter | fal.ai (Queue-API) |
| Modell (Vorgabe) | `fal-ai/ltx-video/image-to-video` |
| **Preis** | **0,02 US$ pro 5-Sekunden-Video** |
| Weicher Tagesdeckel im Worker | 50 Videos/Tag = **max. ~1 US$/Tag** (`SMEJJ_VIDEO_EXTERN_MAX_PRO_TAG`) |
| Harter Deckel | **Billing-Limit im fal.ai-Konto** (der Worker-Zähler liegt in /tmp und fällt bei Neustart auf 0 — er ist Schutz, kein Vertrag) |
| Teurere Alternativen (nur bei Bedarf) | Wan 2.5: 0,25 $/5-s-Video (480p) · Kling 2.5 Turbo Pro: 0,35 $/5-s-Video — per `SMEJJ_VIDEO_EXTERN_MODELL` umstellbar |

Quellen: [fal.ai LTX image-to-video](https://fal.ai/models/fal-ai/ltx-video/image-to-video), [fal.ai Wan 2.5](https://fal.ai/models/fal-ai/wan-25-preview/text-to-video)

## Was gebaut und geprüft ist (kein Cent geflossen)

`workers/smejj-video-worker/server.py`, Engine „extern", 7 Verhaltensprüfungen
in `scripts/testing/pruefe_video_extern.py` (läuft in der Testsuite mit, mit
gestubbtem Netz):

- **Fail-closed**: ohne Schlüssel kein einziger Aufruf
- Erfolgsweg: eigenes Bild → fal-Queue → MP4 zurück als base64
- Tagesdeckel wirft nach Limit
- **SSRF-Schutz**: eine fremde `video_url` in der Antwort wird nie geladen
- Bei jedem Fehler (FAILED/Timeout/Deckel): **Rückfall auf parallax** — der
  Nutzer bekommt immer ein Video
- Erzählstimme bleibt Piper; für die festen 5 s wird der Text am Satzende auf
  ~70 Zeichen gekürzt (nie ein abgehackter Satz)

## Deine drei Schritte zur Aktivierung

1. **Konto**: fal.ai-Konto anlegen, dort unter Billing ein **hartes
   Ausgabenlimit** setzen (Empfehlung: 10 US$/Monat zum Start).
2. **Schlüssel**: im Zeabur-Portal beim Dienst `smejj-video-worker` die
   Variable `SMEJJ_VIDEO_EXTERN_KEY` mit dem fal-Key anlegen → Restart.
   (Schlüssel setzt du selbst; Sitzungen tippen keine Schlüssel.)
3. **Nachmessen**: ein Video im Chat erzeugen. Die Antwort trägt dann
   `engine: extern:ltx-video`; ohne Schlüssel weiterhin `parallax`.

## Freigabe (vom Betreiber auszufüllen)

> Ich gebe die externe Video-Bewegung über fal.ai frei, Modell LTX
> image-to-video, 0,02 US$ pro Video, Tagesdeckel im Worker ____ Videos,
> Billing-Limit im fal.ai-Konto ____ US$/Monat.
>
> Name, Datum: ________________
