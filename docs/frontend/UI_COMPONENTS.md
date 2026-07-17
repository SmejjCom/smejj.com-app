# UI Components

## Zentralisiert

- Layout: `.shell`, `.sidebar`, `.workspace`, `.view`
- Navigation: `.nav`, `.nav-button`
- Statusleiste: `.status-strip`, `.status-grid`
- Icons: `Icons` und `setButtonIcon` in `public/components.js`
- Buttons: globales Button-Styling
- Modal: `#modalRoot`, `openModal`, `closeModal`
- Toasts: `#toastRoot`, `showToast`
- Loading/Skeleton: `.skeleton`, `setLoading`
- Empty-State: `.empty-state`, `renderEmptyState`

## Schutz

Keine unkontrollierten Inline-Styles, keine Secrets, keine privaten Pfade und
keine Paid-Service-Abhaengigkeiten in UI-Komponenten.

