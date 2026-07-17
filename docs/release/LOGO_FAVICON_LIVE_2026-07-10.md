# smejj Logo- und Favicon-Release

Status: live und verifiziert am 2026-07-10 um 16:44 CEST

## Freigabe und Release-Identitaet

- Schriftliche Produktionsfreigabe: "Ja, Release-Kandidat 5da4271 darf
  jetzt nach SmejjCom/smejj-app-frontend/main gepusht und live auf
  smejj.com veroeffentlicht werden."
- Freigegebener Logo-Kandidat: `5da42715f8a2d561ea7c67dcef4f073ce3906eb8`.
- Parallel erhaltener Sicherheitsstand:
  `4e6646cb5b64b722ce8440d1fcb2b52764c23617`.
- Vollstaendig gepruefter lokaler Integrationsstand:
  `a1241968e9d87b22abed6a197828cb34b103f4f9`.
- Produktions-Commit:
  `936b9f86d9f753742beb009ff776cb528c7fdb7b`.
- Produktions-Tree und lokaler Kandidaten-Tree sind bytegleich:
  `2df11273235faf0c2540c7439226601e69cf702f`.
- GitHub wurde als Fast-Forward vom Sicherheitsstand aktualisiert. Der
  verbundene GitHub-Zugang hat den geprueften Tree als inhaltsgleichen
  Produktions-Commit angelegt, weil der lokale HTTPS-Zugang keine
  Schreib-Anmeldedaten hatte.

## Artefakte und Rollback

- Verifiziertes Produktionsartefakt:
  `s3://smejj-model-files/deployment-artifacts/smejj-com/20260710/20260710T144102Z-936b9f86d9f7.json.gz`
- Manifest:
  `s3://smejj-model-files/deployment-artifacts/smejj-com/20260710/20260710T144102Z-936b9f86d9f7.manifest.json`
- Zusaetzliches Artefakt des lokalen Integrationsstands:
  `s3://smejj-model-files/deployment-artifacts/smejj-com/20260710/20260710T143716Z-a1241968e9d8.json.gz`
- Rollback-Punkt unmittelbar vor dem Release:
  `4e6646cb5b64b722ce8440d1fcb2b52764c23617`.
- Lokales Vorher-Archiv:
  `/tmp/smejj-logo-rollback-20260710T110734Z.tar.gz`.
- SHA-256 des Vorher-Archivs:
  `1a152c09a881517964843e2b1777378c7f5ab6019afcbf6d7f26b0fde2ef2d9e`.

Ein Rollback erfolgt nur nach schriftlicher Freigabe als neuer
Wiederherstellungs-Commit auf Basis von `4e6646c`; kein Force-Push und kein
destruktiver Reset.

## Marken-Dateien

- Offizielles Logo: `/icons/smejj_full_logo.svg`, SHA-256
  `17f00cebe247bb57361c1799442c30fa5c1e92773b51901c43620e6b2b2f41dc`.
- Offizielles Icon: `/icons/smejj_icon.svg`, SHA-256
  `cbecad2afe6b792a396d33d2235a554c462ed4ac6501c1e7152d309a95ba5ffd`.
- Bereitgestellt: ICO mit 16/32/48 Pixeln, separate Favicons mit 16/32/48
  Pixeln, Apple Touch Icon mit 180 Pixeln, PWA- und Maskable-Icons mit
  192/512 Pixeln sowie Open-Graph-Bild mit 1200 x 630 Pixeln.
- Alte Dateien `/icons/icon.svg` und `/icons/maskable.svg` wurden entfernt
  und liefern live HTTP 404. Es bestehen keine alten Referenzen mehr.

## Verifikation

- `release:preflight` inklusive `check:all`, `check:guidelines`,
  `check:architecture`, `check:security`, `check:cost`, `check:paths`,
  `check:rollback`, Syntax- und Start-Lock-Pruefung: bestanden.
- Frontend: 79/79; Plattform und Auth-Zieltests: 35/35.
- Free-Tier-Guard vor und nach dem Deployment: bestanden.
- 35 geaenderte Live-Dateien stimmen bytegenau mit dem Produktions-Tree
  ueberein; die komplette HTTP-/MIME-Matrix mit 39 Pruefpunkten ist gruen.
- Alle 14 Sprachseiten, Startseite, Impressum, Datenschutz und eigene
  404-Seite verwenden das offizielle Logo und die neuen Metadaten.
- Browserpruefung: 1440 x 900, 1024 x 768, 820 x 1180, 390 x 844 und
  360 x 800; dunkle App, helle Sprachseite, Rechtsseite und 404-Seite.
  Kein horizontaler Ueberlauf, keine Browserfehler oder Warnungen.
- PWA: nur `smejj-shell-v96`, 56 eindeutige Cache-Eintraege, alte v95-
  Caches entfernt. Logo, Icon, Favicon, Apple-/Social-Dateien sowie
  `autonomous-coding.js` und `autonomous-coding.css` sind enthalten.
- Offline-Neuladen der Startseite zeigt Logo, Composer und Navigation
  korrekt. Die geschuetzte Automatisierungsansicht funktioniert weiterhin
  und zeigt im abgemeldeten Zustand "Anmeldung erforderlich".
- `https://www.smejj.com/` leitet mit HTTP 301 auf `https://smejj.com/` um.

## Kosten- und Hosting-Status

GitHub Pages laeuft weiterhin im kostenlosen Deploy-from-Branch-Modus ohne
GitHub Actions. IDrive e2 bleibt Hauptspeicher fuer Release-Artefakte. Es
wurde kein Cloudflare-Dienst, Trial, Auto-Billing oder kostenpflichtiger
GitHub-Dienst aktiviert.
