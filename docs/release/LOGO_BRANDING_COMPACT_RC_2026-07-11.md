# smejj.com — kompaktes transparentes Branding RC (2026-07-11)

## Architektur

Die offiziellen SVG-Quellen bleiben unveraendert. Ein deterministischer Generator erzeugt ausschließlich plattformspezifische Derivate: optisch gepaddelte transparente Browser-Favicons, opake Apple-/PWA-/Maskable-Icons und eine verkleinerte Social Card. Die On-Dark-Wortmarke besitzt identische Geometrie; nur die dunklen Wortmarkenflaechen werden auf die vorhandene helle Markenfarbe umgesetzt.

Die Menuezustandslogik wurde nicht geaendert. Ausschließlich `data-left-menu-state="expanded"` zeigt die Wortmarke; closed, compact und opening zeigen nur das Icon beziehungsweise waehrend opening noch keine Wortmarke. Das Branding ist fixed positioniert und beeinflusst den Workspace-Flow nicht.

## Implementierung

- Icon im App-Kopf: 20 px innerhalb der bestehenden transparenten 28-px-Flaeche.
- Wortmarke: 104 px Desktop/Tablet, 96 px bis 560 px Viewportbreite.
- Keine Hintergrundplatte, kein Schatten, kein Filter, keine Maske, keine Verzerrung.
- Browser-Favicons: 75 % Motivbreite auf vollständig transparentem Canvas.
- Apple: 58 %, PWA: 60 %, Maskable: 52 % Motivbreite auf kontrolliertem `#050910`.
- Social Card: 55 % Wortmarkenbreite auf dem vorhandenen hellen Marken-Canvas.
- Service Worker: Cache `smejj-shell-v99` inklusive aller neuen Derivate.
- Manifest: ausschließlich 192/512-PWA- und Maskable-PNGs; kein ungepaddeltes SVG mit zu großer optischer Masse.

## Release-Kandidat

- Repository: `SmejjCom/smejj-app-frontend`
- Commit: `fa81ff4415e83214cd3fcb063d0164ea5ef61253`
- Parent: `e228f072d0a872d45e75843d7810349dd10eacbf`
- Tree: `fe68ef3ef7fbb42c59566f38f768b7def6df191e`
- Umfang: 33 ausschließlich markenbezogene statische Dateien.

## Tests

- `pnpm run check:all`: gruen.
- Branding/Frontend/Platform-Targettests: 35/35 gruen.
- Start-Lock: 26/26 byteidentisch zum neu eingefrorenen, schriftlich freigegebenen Stand.
- Browser: 1440×900, 820×1180, 390×844 und 412×915; closed, compact, expanded; Hell-/Dunkelpraeferenz.
- PWA: Manifest, aktiver Service Worker, Cache v99 und kompletter Offline-Reload gruen.
- Weitere Bereiche: lokalisierte Landing Page und Rechteseite zeigen ausschließlich das 30-px-Icon.
- Performance: DOMContentLoaded 53,7 ms, Load 63,3 ms im lokalen RC-Preview; keine Regression erkannt.
- Konsole: keine Warnungen oder Fehler.

## IDrive e2 und Rollback

Der vollstaendige 87-Dateien-Tree sowie Browser-/Testnachweise liegen versionsgebunden im Object Brain. Jeder Upload wurde mit bedingtem Create, zweitem 412-Overwrite-Beweis und SHA-256-Readback geprueft. Rollback vor Produktion bedeutet Abbruch ohne Aenderung; nach Produktion ausschließlich neuer Revert-Commit mit Tree-Pruefung, niemals Force-Push oder Datenloeschung.

## Produktionsgrenze

Die exakte schriftliche Freigabe fuer `fa81ff4415e83214cd3fcb063d0164ea5ef61253` liegt vor. Der Commit wurde als normaler Fast-Forward von `e228f072d0a872d45e75843d7810349dd10eacbf` nach `SmejjCom/smejj-app-frontend/main` gepusht. GitHub Pages Deployment `5406635557` erreichte am `2026-07-11T19:31:24Z` den Status `success` fuer `https://smejj.com/`.

## Live-Verifikation

- 19/19 geaenderte Dateien stimmen online bytegenau mit dem freigegebenen Release ueberein.
- Root, Impressum und Datenschutz liefern HTTP 200; unbekannte Pfade 404; `www` leitet per 301 kanonisch auf smejj.com.
- Closed und compact zeigen ausschließlich das transparente 20-px-Icon; expanded zeigt ausschließlich die transparente Wortmarke mit 104 px beziehungsweise 96 px mobil.
- Workspace-Verschiebung: 0 px; kein horizontaler Ueberlauf; effektive Branding-Transition-Dauer: 0 s.
- Desktop 1440x900, Tablet 820x1180, iPhone-Profil 390x844 und Android-Profil 412x915 sowie Hell-/Dunkelpraeferenz bestanden.
- Service Worker aktiv, einziger Cache `smejj-shell-v99`, Offline-Netzwerkausfall belegt und Offline-Reload erfolgreich.
- Barrierefreiheitsprobe: 131 Bedienelemente, keine fehlenden zugaenglichen Namen, keine doppelten IDs, keine Bilder ohne Alt-Vertrag.
- Live-Performance: DOMContentLoaded 299,8 ms, Load 385,7 ms; finale Browserkonsole ohne Warnungen oder Fehler.
- Unabhaengige visuelle Pruefung aller sieben Live-Screenshots: bestanden, keine weisse Platte, Beschneidung, Verzerrung oder sichtbare Regression.
