# Freigabe: Support-Vorgangsliste reparieren (2026-08-07)

## Wortlaut des Betreibers

> **„Ja, beides ausrollen"**

Gewählt auf die vorgelegte Frage „Change-Lock öffnen und ausrollen?", mit dem
ausdrücklichen Inhalt: Änderung an `control-server/src/routes/adminWriteRoutes.js`
bestätigen, Lock mit diesem Wortlaut neu einfrieren, `console.js` spiegeln,
Control-Server und Frontend ausrollen.

Vorausgegangen war der Auftrag, den Adminbereich „von A bis Z lückenlos" zu
prüfen — die Freigabe deckt genau den dabei gefundenen Fehler, nichts darüber
hinaus.

## Der Befund, gemessen am 2026-08-07

`POST /api/admin/impersonation/list` antwortete **live mit 404**
(`admin_route_not_found`). Die Seite **D · Support & Impersonation** konnte ihre
Liste damit nie laden.

**Wurzel:** Der Pfad lief in den Schritt-Zweig, der eine Adresse in drei Teile
zerlegt (`impersonation/{id}/{schritt}`). `impersonation/list` hat aber nur
zwei — `schritt` blieb leer, keine Verzweigung griff, und der Zweig
`schritt === "list"` weiter unten war damit **toter Code**, den nichts erreichen
konnte.

**Warum es niemandem auffiel:** `console.js` verlangte, dass *beide* Abrufe der
Seite scheitern (`if (!alle.ok && !eigene.ok)`). Der eigene Vorgangsabruf ging,
also galt die Seite als heil und zeigte „Alle Vorgänge · 0 insgesamt". Ein toter
Endpunkt sah aus wie Leere.

## Umfang der Änderung

| Datei | Änderung |
|---|---|
| `control-server/src/routes/adminWriteRoutes.js` | eigene Route für `impersonation/list` **vor** dem Schritt-Zweig; toter Zweig entfernt; neue Funktion `listeImpersonationen` mit Rechteprüfung (`impersonation.start` oder `audit.read`) |
| `control-server/admin-ui/console.js` | `zeigeSupport` bewertet jeden Abruf einzeln: Fehler der Admin-Liste wird angezeigt statt geschluckt |
| `control-server/src/routes/adminWriteRoutes.test.js` | Regressionstest: Liste antwortet 200, funktioniert ohne offenes Step-up-Fenster, ist fail-closed für Konten ohne Verwaltungsrolle |

Am Rechtemodell, am Step-up-Zwang und am Vier-Augen-Prinzip ändert sich nichts:
Die Liste ist ein Lesevorgang und stand schon vorher auf der `nurListe`-Ausnahme,
die Step-up nicht verlangt.

## Prüfstand

- `node --test control-server/src/routes/adminWriteRoutes.test.js` → **16/16 grün**
  (vorher 15 — der 16. ist der neue Regressionstest).
- Gegenprobe live vor dem Fix: 404 gemessen aus der angemeldeten Konsole.
