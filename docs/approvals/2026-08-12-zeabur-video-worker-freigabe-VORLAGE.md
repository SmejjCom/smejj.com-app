# FREIGABE-VORLAGE: Neuer Zeabur-Dienst `smejj-video-worker`

Status: **ENTWURF — noch NICHT freigegeben.** Dieser Zettel wird erst mit der
ausgefuellten Unterschrift des Betreibers wirksam (Regel: neuer Zeabur-Dienst
nur mit schriftlicher Freigabe, die Dienst UND Betrag nennt).

## Was der Dienst tut

Video-Erzeugung fuer smejj 1.0 (Stufe 3, gebaut 2026-08-12): `/erzeuge` holt
ein Basisbild vom Bild-Maler (SD-Turbo, intern) und rendert daraus ein echtes
H.264-MP4 (kenburns-Engine, 4 s Schleife, 512 px) — kein Fremdanbieter, kein
GPU-Bedarf. Die Chat-Bruecke (v132, live) nutzt ihn automatisch, sobald sein
`/health` bereit meldet; bis dahin antwortet sie mit dem ehrlichen
Status-Hinweis. Lokal bewiesen: ftyp-Magie, 96 Frames, ~1,6 s Encode-Zeit.

## Kosten (vom Betreiber im Portal zu bestaetigen)

Erwartung: **0,00 EUR zusaetzlich**, wenn der Dienst in dasselbe
Zeabur-Projekt auf den bestehenden Flat-Server (2C/8GB, teilt sich die
Ressourcen mit bild-maler & Co.) gelegt wird — wie beim Bild-Maler. Das ist
eine ANNAHME: vor dem Anlegen im Portal pruefen, dass kein neuer bezahlter
Plan entsteht. Zeigt das Portal einen Betrag > 0, NICHT anlegen und neu
entscheiden.

## Voraussetzung: Code auf `main`

Zeabur baut aus `main` dieses Repos. Der Video-Commit `f9e5acd` liegt auf
`feature/auth-redesign-github-magiclink`. Achtung: zwischen `origin/main` und
`f9e5acd` liegen auch zwei fremde Werkstatt-Commits einer Parallelsitzung
(`1bfdd22`, `67ce0cd`, Station 2 fehlt) — ein Fast-Forward von main nimmt die
MIT. Entweder das bewusst mitfreigeben oder chirurgisch nur den Video-Commit
auf main bringen.

## Portal-Schritte (Weg: Memory smejj-zeabur-neuer-dienst-weg)

1. Zeabur-Projekt oeffnen (dasselbe wie bild-maler) → Add Service → GitHub-App
   → Repo `SmejjCom/smejj.com-app`, Branch `main`.
2. Dienstname EXAKT `smejj-video-worker` (die Bruecke erwartet
   `smejj-video-worker.zeabur.internal:8080`).
3. Dockerfile: `Dockerfile.smejj-video-worker` (liegt bereit; bindet 0.0.0.0,
   Startbefehl fest — pnpm-Falle umgangen; .dockerignore-Erlaubnis gesetzt).
4. KEINE Public Domain vergeben (nur intern erreichbar, wie bild-maler).
5. Umgebungsvariablen:
   - `SMEJJ_VIDEO_WORKER_KEY` = neues Geheimnis; DENSELBEN Wert zusaetzlich in
     den Bruecken-Dienst als `SMEJJ_VIDEO_WORKER_KEY` eintragen.
   - `SMEJJ_BILDER_WORKER_KEY` = der vorhandene Bild-Maler-Key (der Worker
     ruft dessen /erzeuge).
6. Nach dem Start pruefen: `/health` des Workers meldet `bereit: true` erst,
   wenn auch der Bild-Maler bereit ist — das ist Absicht (ehrliche Ampel).
7. Live-Beweis: als angemeldeter Nutzer im Chat "Erstelle ein Video von ..." —
   erwartet: Fortschritts-Schritte, dann MP4-Player in der Antwort.

## Freigabe (vom Betreiber auszufuellen)

> Ich gebe den Zeabur-Dienst `smejj-video-worker` im bestehenden Projekt frei.
> Betrag: ____ EUR/Monat (laut Portal-Anzeige beim Anlegen).
>
> Name, Datum: ________________
