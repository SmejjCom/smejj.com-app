# iOS and Android Test Report

Date: 2026-06-16

## Scope

Tested with browser viewport simulation, not physical devices.

## iPhone / Safari-Sized Result

- Viewport: 390 x 844.
- Active deep link tested: `#profile`.
- Login controls visible.
- Status chips visible.
- No horizontal overflow.
- Mobile navigation collapses to one column.
- Safe-area CSS is present.

Result: passed in simulation.

## Android / Chrome-Sized Result

- Viewport: 412 x 915.
- Active deep link tested: `#files`.
- File controls visible.
- Status chips visible.
- No horizontal overflow.
- Mobile navigation collapses to one column.

Result: passed in simulation.

## Android / PWA-Sized Result

- Viewport: 412 x 915.
- Active deep link tested: `#offline`.
- Offline page visible.
- PWA manifest and service worker checks passed.

Result: passed in simulation.

## Open

- Physical iPhone Safari test.
- Physical Android Chrome test.
- Real PWA install/uninstall/update cycle.
- Real slow-network throttling on device.
