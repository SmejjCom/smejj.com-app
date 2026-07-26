# Befund: Kopf-Icons im hellen Farbschema unsichtbar (2026-07-25)

**Status: nicht behoben — braucht deine Freigabe, weil der Start-Lock betroffen ist.**

## Was passiert

Farbschema auf „Hell" stellen (Einstellungen → Darstellung → Farbschema), dann eine
Ansicht wie `/settings` öffnen. Die beiden Knöpfe oben links sind dann hell auf hell
und praktisch nicht mehr zu sehen.

Gemessene Kontrastwerte gegen die helle Fläche `rgb(245, 246, 248)`:

| Bedienelement          | Farbe               | Kontrast | WCAG AA (≥ 3.0) |
|------------------------|---------------------|----------|-----------------|
| „Menü öffnen"          | `rgb(245,242,238)`  | **1.03** | verfehlt        |
| „Browser öffnen"       | `rgb(245,242,238)`  | **1.03** | verfehlt        |
| Logo („Startseite")    | `rgb(158,158,255)`  | **2.21** | verfehlt        |

Im dunklen Schema ist alles korrekt — der Fehler tritt nur im hellen Schema auf.

## Ursache

Das helle Schema wird über `.premium-view[data-settings-theme="light"]` gesetzt, gilt
also nur **innerhalb** der Ansichtsfläche. Die beiden Knöpfe sind `position: fixed` und
liegen zwar sichtbar darüber, gehören im DOM aber zur Shell (`MAIN.shell`) und erben
das Schema deshalb nicht. Sie behalten ihre dunkelmodus-Farben.

Erschwerend: `.split-icon` (das Menü-Symbol) zeichnet sich über
`border: 1.5px solid rgba(232,232,232,0.72)` und ein `span` mit
`background: rgba(232,232,232,0.58)` — beides hart codiert statt `currentColor`.
Eine reine `color`-Regel greift daher nicht, das wurde im Browser verifiziert.

## Warum nicht behoben

`public/app-surfaces.css` steht unter dem Start-Lock:

```
start-lock VERLETZT — Startseite ist 100% geschuetzt
Aenderungen sind NUR mit ausdruecklicher schriftlicher Bestaetigung des Nutzers erlaubt.
```

Zusätzlich müsste `public/sw.js` von `smejj-shell-v133` auf `v134` hoch, weil
`app-surfaces.css` im Service-Worker-Precache liegt und sonst die alte Version
ausgeliefert wird. `sw.js` steht ebenfalls unter dem Lock, und `tests/platform-pwa.test.mjs`
sowie `tests/frontend-structure.test.mjs` nageln die Version explizit auf `v133` fest —
die beiden Tests müssten mitgezogen werden.

## Vorgeschlagener Patch (im Browser verifiziert)

Das Logo bleibt bewusst unangetastet — es ist Markenfarbe und durch `check:branding`
und `check:favicon-lock` geschützt.

```css
/* Menue- und Browser-Knopf liegen fixiert ueber der Ansichtsflaeche, gehoeren
   aber zur Shell und erben deren Farbschema nicht. Im hellen Schema blieben sie
   dadurch hell auf hell (Kontrast 1.03:1, praktisch unsichtbar). Das Icon zeichnet
   sich ueber border/background statt currentColor, deshalb reicht color allein nicht. */
body:has(.premium-view.is-active[data-settings-theme="light"]) .glass-icon {
  color: #17191d;
}

body:has(.premium-view.is-active[data-settings-theme="light"]) .split-icon {
  border-color: rgba(23, 25, 29, 0.72);
}

body:has(.premium-view.is-active[data-settings-theme="light"]) .split-icon span:first-child {
  background: rgba(23, 25, 29, 0.58);
}
```

Einfügen in `public/app-surfaces.css` nach der Regel
`body:has(.premium-view.is-active) .nav-button.is-active` (ca. Zeile 646).
Das `:has()`-Muster ist dort bereits etablierter Stil.

**Im Browser gemessen:** Kontrast steigt von 1.03 auf **16.28**, Icon sichtbar bestätigt.
Dunkles Schema bleibt unverändert bei `rgba(232,232,232,0.72)` — keine Regression.

## Wenn du freigibst

1. Patch in `public/app-surfaces.css` einfügen
2. `public/sw.js`: `smejj-shell-v133` → `v134`, mit Änderungskommentar oben im Kopf
3. `tests/platform-pwa.test.mjs` und `tests/frontend-structure.test.mjs` auf `v134` ziehen
4. Alle Checks grün fahren, dann Lock neu setzen:
   `node scripts/check-start-lock.mjs --freeze --confirm "<dein Wortlaut>"`
5. Upload-Paket bauen (`assets/app-surfaces.css` + `sw.js`) und ins Frontend-Repo laden
