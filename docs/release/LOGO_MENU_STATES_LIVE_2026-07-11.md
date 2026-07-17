# smejj Logo- und Menuezustands-Release

Status: live und verifiziert am 2026-07-11 um 20:14 EEST

## Freigabe und Release-Identitaet

- Schriftliche Produktionsfreigabe: "Ja, Release-Kandidat
  e228f072d0a872d45e75843d7810349dd10eacbf darf inklusive
  IDrive-e2-Backup nach SmejjCom/smejj-app-frontend/main gepusht und live
  auf smejj.com veroeffentlicht werden."
- Produktions-Commit:
  `e228f072d0a872d45e75843d7810349dd10eacbf`.
- Produktions-Tree:
  `82d67fe5940af4c890a8891688bf5a6e37254b6e`.
- Rollback-Basis und direkter Parent:
  `e547a482f1be724ac9aa25fb3df649b8988403f7`.
- GitHub `main` wurde als sauberer Fast-Forward exakt auf den freigegebenen
  Commit aktualisiert. SHA, Tree und Commit-Metadaten blieben unveraendert.

## IDrive e2 und Rollback

- Verifiziertes Kandidatenartefakt:
  `s3://smejj-model-files/deployment-artifacts/smejj-com/20260711/20260711T165308Z-e228f072d0a8.json.gz`
- Manifest:
  `s3://smejj-model-files/deployment-artifacts/smejj-com/20260711/20260711T165308Z-e228f072d0a8.manifest.json`
- Lokales statisches Kandidatenarchiv:
  `/tmp/smejj-brand-rc-e228f072d0a8.tar.gz`
- SHA-256 des Kandidatenarchivs:
  `4a3c49333e16d8fda209aef238a3e28a2c88db6972ac3860a5d12a80d11733de`
- Rollback-Archiv vor den finalen Menuezustandskorrekturen:
  `/tmp/smejj-brand-final-edgecases-rollback-20260711T000000Z.tar.gz`
- SHA-256 des Rollback-Archivs:
  `937000f13a6d72529f4917a44ca019807efda4369162d67ea35fa937ff787ccd`

Ein Rollback erfolgt nur nach neuer schriftlicher Freigabe als
Wiederherstellungs-Commit auf Basis von `e547a482`; kein Force-Push und kein
destruktiver Reset.

## Marken- und Menuezustaende

- Standardzustand sowie geschlossenes und kompaktes linkes Menue zeigen nur
  `/icons/smejj_icon.svg`.
- Nur das vollstaendig geoeffnete linke Menue zeigt
  `/icons/smejj_full_logo.svg`; das Icon ist dann ausgeblendet.
- Das Icon besitzt einen transparenten Hintergrund. Die offiziellen SVGs
  wurden weder nachgezeichnet noch veraendert oder verzerrt.
- Icon-SHA-256:
  `cbecad2afe6b792a396d33d2235a554c462ed4ac6501c1e7152d309a95ba5ffd`.
- Logo-SHA-256:
  `17f00cebe247bb57361c1799442c30fa5c1e92773b51901c43620e6b2b2f41dc`.
- Der Arbeitsbereich bleibt bei Oeffnen, Schliessen und stufenlosem Ziehen
  des Menues bei `x = 0`; es gibt keinen horizontalen Ueberlauf.
- Der Breakpoint wurde live bei 187/188 Pixeln geprueft: 187 Pixel bleiben
  kompakt und 188 Pixel zeigen das Voll-Logo, waehrend sich die
  Seitenleistenbreite nur um ein Pixel aendert.

## Verifikation

- Vollstaendige lokale Pipeline `pnpm run check:all` und
  `pnpm run release:preflight`: bestanden.
- Startseiten-Lock, Free-Tier-Guard, Security-, Kosten-, Pfad-, Rollback-,
  Syntax-, Manifest- und Frontend-Pruefungen: bestanden.
- Lokaler HTTP-Smoke: 18/18 Pruefpunkte bestanden.
- Live-Browserpruefung: Desktop 1440 x 900, iPhone-Viewport 390 x 844 und
  Android-Viewport 412 x 915; geschlossen, kompakt und vollstaendig
  geoeffnet jeweils bestanden.
- Helle englische Seite, dunkle Rechteseite, direkte 404-Seite und
  PWA-Fehlerroute zeigen die korrekten Marken-Zustaende ohne Ueberlauf.
- Browserkonsole: keine Fehler oder Warnungen.
- PWA: ausschliesslich Cache `smejj-shell-v98` mit 57 eindeutigen Eintraegen;
  beide offiziellen SVGs und `assets/left-menu-state.js` sind enthalten.
- Offline-Neuladen der Startseite bestanden; geschlossenes Menue zeigt auch
  offline nur das transparente Icon.
- Index, Service Worker, Menuezustandsmodul, Manifest, Logo, Icon, ICO,
  Apple-, PWA-, Maskable- und Social-Dateien stimmen live bytegenau mit dem
  Produktions-Commit ueberein.
- Alle 14 Sprachseiten, Impressum, Datenschutz und `404.html` sind live und
  bytegenau; unbekannte HTTP-Routen liefern die eigene 404-Seite.
- HTTP leitet auf HTTPS um. Zertifikat, Apex-DNS und `www`-Weiterleitung sind
  gueltig.
- Die iOS- und Android-Pruefung erfolgte als reproduzierbare responsive
  Viewport- und PWA-Pruefung in Chrome; es wurde kein physisches Mobilgeraet
  ferngesteuert.

## Hosting- und Zugangszustand

GitHub Pages laeuft weiterhin im kostenlosen Deploy-from-Branch-Modus. Im
Repository existiert kein eigener Actions-Workflow; der interne
Pages-Build fuer `e228f072` wurde erfolgreich abgeschlossen. Es wurde kein
Cloudflare-Dienst, Trial, Auto-Billing oder kostenpflichtiger GitHub-Dienst
aktiviert.

Die fuer den exakten Push temporaer geladene offizielle GitHub CLI wurde
nach dem Release entfernt. Die einmalige lokale GitHub-Anmeldung und der
macOS-Git-Credential-Eintrag wurden geloescht.
