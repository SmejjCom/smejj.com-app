# FREIGABE-VORLAGE: Neuer Zeabur-Dienst `smejj-video-worker`

Status: **ENTWURF — noch NICHT freigegeben.** Wirksam erst mit der ausgefuellten
Unterschrift unten (Regel: neuer Zeabur-Dienst nur mit schriftlicher Freigabe,
die Dienst UND Betrag nennt — [[smejj-zeabur-expansion-approval]]).

## Was der Dienst tut

Video-Erzeugung fuer smejj 1.0, vollstaendig gebaut und getestet (Stand
2026-08-12, 24 Tests, Gesamtlauf 2003/2003 gruen):

1. Der **Bild-Maler** (SD-Turbo, laeuft bereits) malt das Motiv.
2. **Depth-Anything-V2-Small** (ONNX, 26 MB) schaetzt die Tiefe; das Bild wird
   in 8 Ebenen zerlegt und die Kamera faehrt raeumlich hindurch — nahe Ebenen
   wandern weiter als ferne (gemessen: 20,8x).
3. **smejj 1.0** schreibt zwei Saetze zur Szene, **Piper** (laeuft bereits)
   spricht sie, ffmpeg legt sie unter das Video. Die Videolaenge richtet sich
   nach der Sprechdauer.

Gemessene Zeiten: Tiefe 0,8 s + Rendern 1,0 s + Kodieren 0,1 s + Mischen 0,1 s.
Der Flaschenhals bleibt das Bild (40-90 s auf der CPU).

**Keine GPU noetig.** Recherchiert 2026-08-12: Zeabur bietet gar keine an, und
echte Video-Diffusion braeuchte auf 2 Kernen ~45 min pro 2-Sekunden-Video bei
10-14 GB RAM. Der gebaute Weg erzeugt Bewegung aus Geometrie statt aus einem
Videomodell — er laeuft auf der Maschine, die ihr schon bezahlt.

## Kosten (vom Betreiber im Portal zu bestaetigen)

Erwartung: **0,00 EUR zusaetzlich**, wenn der Dienst auf den bestehenden
Flat-Server gelegt wird (Tencent Ashburn 2C/8GB, 6 USD/Mo — teilt sich schon
mit Bild-Maler, Piper und anderen). Das ist eine ANNAHME: zeigt das Portal
beim Anlegen einen Betrag > 0, NICHT anlegen und neu entscheiden.

Zusaetzlicher Speicherbedarf im Abbild: onnxruntime 60 MB + Modell 26 MB.
Bewusst NICHT torch (~800 MB) — das waere auf dem geteilten Server zu viel.

## Portal-Schritte

1. Zeabur-Projekt oeffnen (dasselbe wie `smejj-bild-maler`) → Add Service →
   GitHub → Repo `SmejjCom/smejj.com-app`.
2. Branch: `feature/auth-redesign-github-magiclink` (der Default-Branch) oder
   `main` — **beide tragen den fertigen Stand**, geprueft 2026-08-12.
3. Dienstname EXAKT `smejj-video-worker` — die Bruecke sucht
   `smejj-video-worker.zeabur.internal:8080`.
4. Dockerfile: `Dockerfile.smejj-video-worker` (liegt bereit; bindet 0.0.0.0,
   fester Startbefehl gegen die pnpm-Falle, .dockerignore-Erlaubnis gesetzt).
5. **Keine Public Domain vergeben** — nur intern erreichbar, wie der Bild-Maler.

## Umgebungsvariablen

Im **Video-Worker**:

| Variable | Wert |
|---|---|
| `SMEJJ_VIDEO_WORKER_KEY` | neues Geheimnis (`openssl rand -hex 32`) |
| `SMEJJ_BILDER_WORKER_KEY` | derselbe Wert wie beim Bild-Maler (falls dort gesetzt) |

Im **Bruecken-Dienst** (`smejj-chat-bridge`):

| Variable | Wert |
|---|---|
| `SMEJJ_VIDEO_WORKER_KEY` | **derselbe** neue Wert wie oben |

Nicht noetig, weil die Voreinstellungen schon stimmen: `SMEJJ_VOICE_TTS_ORIGIN`
(zeigt auf `smejj-voice-piper.zeabur.internal:8080`) und die Engine-Wahl
(`SMEJJ_VIDEO_ENGINE` ist ab Werk `parallax`).

## Nach dem Start pruefen

- `/health` meldet `bereit: true` erst, wenn AUCH der Bild-Maler bereit ist —
  das ist Absicht (ehrliche Ampel, keine Attrappe).
- Beim ersten Start laedt der Dienst einmalig das 26-MB-Tiefenmodell. Schlaegt
  das fehl, bleibt er trotzdem bereit und rendert ohne Raumtiefe; `/health`
  nennt dann die Ursache im Feld `fehler`.
- Live-Beweis: als angemeldeter Nutzer im Chat *"Erstelle ein Video von …"* —
  erwartet: Fortschritt auf einer Zeile, dann ein erzaehltes Video im Player.

## Freigabe (vom Betreiber auszufuellen)

> Ich gebe den Zeabur-Dienst `smejj-video-worker` im bestehenden Projekt frei.
> Betrag: ____ EUR/Monat (laut Portal-Anzeige beim Anlegen).
>
> Name, Datum: ________________
