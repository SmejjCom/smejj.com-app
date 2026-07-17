# PWA UI Policy

## Ziel

Die App-Shell muss schnell laden, offline eine klare Seite zeigen und keine
Wartezeiten oder Premium-KI-Faehigkeiten vortaeuschen.

## Cache

Der Service Worker cached:

- App-Shell
- Styles
- Komponenten
- Storage-Module
- AI-Router-Module
- Manifest und Icons

Der Cache enthaelt keine Secrets, keine Modellgewichte und keine grossen
Mediendateien.

## Offline

Offline bleibt die lokale Arbeit sichtbar. Online-Sync und KI-Aktionen werden
nicht vorgetaeuscht, sondern fail-closed angezeigt.

