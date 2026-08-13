# Freigabe: sw.js CACHE_NAME-Sprung v303 → v304 (Login-Fokus)

**Datum:** 2026-08-12 (spätabends, Sitzung „Login-Audit A–Z")
**Betreiber-Entscheidung:** In der Claude-Sitzung wurde die Option
„Punkt 3: sw-Cache-Sprung freigeben — Du gibst den CACHE_NAME-Sprung frei,
ich deploye ihn" ausdrücklich ausgewählt.

**Zweck:** `onboarding-welcome.js` (precacht) erhielt den Login-Fokus-Patch
(Cursor blinkt nach frischem Login im Chat-Eingabefeld, Frontend-Commit
264e456). Ohne CACHE_NAME-Sprung erreicht der Patch nur Neubesucher.

**Umfang:** NUR die Konstante `CACHE_NAME` in `sw.js` des Repos
smejj-app-frontend: `smejj-shell-v303` → `smejj-shell-v304`.
Keine weiteren sw.js-Änderungen. Basis ist der Live-Stand (nicht die
public/sw.js-Kopie dieses Repos — die läuft dem Live-Stand hinterher).

**Grenze:** Diese Freigabe gilt einmalig für genau diesen Sprung.
