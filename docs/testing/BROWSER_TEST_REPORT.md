# Browser Test Report

Date: 2026-06-16

## Scope

Tested locally at `http://127.0.0.1:3000`. No live deployment and no production change.

## Passed

- Desktop browser shell loads.
- Startseite loads.
- Login controls are visible.
- Projekte controls are visible.
- Dateien upload staging is visible.
- Local Workspace controls are visible.
- Sync status is visible.
- IDrive-e2 status is visible.
- AI-Modus and BYOK controls are visible.
- Disabled Mode is visible and active by default.
- Fehlerseite and Offline-Seite exist.
- Navigation deep links work with reload.
- Browser back button works from `#ai` back to `#projects`.
- No horizontal overflow in tested desktop, tablet, iPhone-sized, Android-sized, and 320px screens.

## Tested Viewports

- Desktop: 1280 x 800.
- Tablet: 768 x 1024.
- iPhone-sized: 390 x 844.
- Android-sized: 412 x 915.
- Small screen: 320 x 640.

## Fixed During Test

- Added hash/history navigation for reload and back-button support.
- Added mobile/PWA metadata for iOS/Android shells.
- Added safe-area padding and touch interaction hinting.

## Open

Real Safari/iPhone and Android hardware testing is still required before public release.
