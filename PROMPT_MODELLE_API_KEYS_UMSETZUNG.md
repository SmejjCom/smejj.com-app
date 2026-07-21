# Umsetzung: Bereich „Modelle & API Keys" (smejj.com)

> **Anhang:** Das beigefügte Bild `responsive.png` ist die verbindliche Design-Vorlage (Handy / Tablet / Web). Setze exakt dieses Design um.

## Aufgabe

Baue im Einstellungen-Bereich **„Modelle"** einen professionellen **API-Keys-Bereich** im Stil von OpenRouter. Mehrere Keys pro Nutzer, verschlüsselt gespeichert, mit klarer Statusanzeige. Alles responsive (Desktop, Tablet, Handy/PWA – identischer Inhalt, nur Layout unterscheidet sich).

## Wo im Code (bestehende Struktur nutzen, nichts doppelt bauen)

- **Frontend, Modelle-Panel:** `public/settings-surface.js` – die Sektion `panel("models", …)`. Der neue Bereich wird in `[data-settings-panel="models"] .settings-list` gerendert.
- **Frontend, Provider-Logik (Vorlage!):** `public/provider-settings.js` – enthält bereits die Cline-Anbindung (Key sicher verbinden, testen, Modell wählen, entfernen) über `/api/providers/cline`. Dieses Muster auf mehrere Anbieter verallgemeinern.
- **BYOK-Validierung:** `public/ai/byok.js` + `public/shared/securityPolicy.js` (`validateByokEndpoint`).
- **Backend-Routen:** `control-server/src/routes/providerRoutes.js` (Prefix `/api/providers/cline`) – als Vorlage für generische Provider-Endpunkte.
- **i18n:** Alle sichtbaren Texte über `t()` aus `public/i18n/ui.js` (Deutsch als Basis, bestehende Sprachdateien pflegen).

## Struktur & Muster (verbindlich)

**Grundmuster: Firma über Modell.** Oberste Ebene ist immer der **Anbieter/die Firma** (z. B. z.ai, OpenAI, Anthropic, Cline). Die **Modelle liegen darunter**. Kommt ein neues Modell derselben Firma (z. B. GLM-6), erscheint es automatisch unter dem bestehenden Anbieter – keine neue Zeile nötig. Dieses Muster gilt für **alle** Anbieter.

### 1. Aktives Modell (oben)
- Hervorgehobene Karte: Avatar + kleine Zeile „`<Firma>` · aktives Modell" + große Zeile mit dem aktiven Modell (z. B. „GLM-5.2"), rechts Button **„Modell wählen"**.
- Klick öffnet ein Popover mit allen Modellen dieser Firma, gruppiert; Auswahl wird **sofort ohne Neustart** übernommen (wie `/select` in provider-settings.js). Das gewählte Modell ist markiert und nutzbar.
- Hinweiszeile darunter: „Weitere Modelle kommen aus deinen API-Keys."

### 2. API Keys (Liste)
- Kopfzeile: Titel „API KEYS" + Untertitel „Eigene Anbieter · verschlüsselt gespeichert." und rechts oben Button **„+ API-Key hinzufügen"**.
- **Suchfeld** über der Liste (ab ca. 8 Keys einblenden).
- Liste **gruppiert nach Status:** Überschrift **AKTIV** (grün) und **INAKTIV** (rot).
- Jede Zeile: Avatar (Firmen-Initiale), Firmenname (fett) + ggf. kleines Label („eigener" bei Custom-Anbieter, „Standard" beim Standard-Key), darunter aktives Modell oder maskierter Key (`sk-••••4f2a`, **nie Klartext**). Rechts: Status-Badge, **„Guthaben aufladen"**-Link, Kopier-Button, Löschen.
- **Anbieter mit vielen Modellen** (z. B. Cline · cline.bot): als Zeile mit eigenem **„Modell wählen"**-Button bzw. aufklappbar; Modelle gruppiert (Cline Pass / Kostenlos / Empfohlen), plus „Alle N Modelle anzeigen".

### 3. Status-Ampel
- **Grün** = aktiv / getestet / genug Guthaben / kostenlos.
- **Gelb** = Warnung „Guthaben niedrig".
- **Rot** = kritisch: kein Guthaben, ungültiger oder fehlgeschlagener Key; Zeile dezent rot hinterlegt.
- Kleine Legende über der Liste.

### 4. „Guthaben aufladen"
- **Kein** eigenes Guthaben-Feld anzeigen (die meisten Anbieter geben den Kontostand nicht per API her).
- Stattdessen pro Zeile ein Link **„Guthaben aufladen"**, der direkt zur Billing-Seite des jeweiligen Anbieters führt (aus Anbieter-Config).
- Bei „Eigener Anbieter" ohne bekannte Billing-URL: „— kein Link".

### 5. Key hinzufügen (Formular, zwei Zeilen)
- Nach Klick auf „+ API-Key hinzufügen" öffnet sich ein Formular:
  - **Zeile 1: Anbieter** – Dropdown (z. B. OpenAI, Anthropic, OpenRouter, Google Gemini, Mistral). Sobald ein Anbieter gewählt ist, erscheint automatisch ein Hilfe-Balken „Key hier holen: `<link>`" (aus Config, **keine URL-Eingabe durch Nutzer**).
  - **Zeile 2: API-Key** (Passwortfeld, monospaced).
- **Ganz unten im Dropdown:** „**+ Eigenen Anbieter hinzufügen**". Klick blendet Zusatzfelder ein (Name des Anbieters, Basis-URL) – so funktioniert jeder neue/unbekannte Anbieter sofort, ohne Code-Änderung.
- Name wird automatisch aus Anbieter + Datum erzeugt (z. B. „OpenAI · 18.07."), umbenennbar.
- Button **„API-Key hinzufügen / Prüfen und verbinden"**: erst testen, dann verschlüsselt speichern.

## Anbieter-Config (neuer/fehlender Anbieter = eine Zeile)
Lege eine kleine Config an (z. B. `public/ai/providers-catalog.js`) mit Einträgen:
```js
{ id, name, baseUrl, keyUrl /* Key holen */, billingUrl /* aufladen */, logo? }
```
Ein neuer Anbieter ist damit ein einzelner Eintrag und erscheint automatisch überall (Dropdown, Links, Liste).

## Sicherheit (zwingend)
- API-Keys **niemals** unverschlüsselt im Browser (kein localStorage-Klartext). Speicherung **serverseitig AES-256-GCM verschlüsselt** (bestehender Credential-Vault wie bei Cline).
- In der Liste nur **maskiert** anzeigen (letzte 4 Zeichen). Vollständiger Key **nur einmal** direkt nach dem Anlegen sichtbar, mit Kopier-Button und Hinweis „wird danach nicht mehr angezeigt".
- **Vor dem Speichern testen** (Verbindungstest). Fehlerzustände klar melden (401/402/429 etc., siehe `friendlyError` in provider-settings.js).
- Löschen erst nach Bestätigung.

## Responsive (siehe Bild)
- **Desktop/Tablet:** Zeilen mit Status + Aktionen nebeneinander.
- **Handy/PWA (iOS, Android, Huawei):** Zeilen stapeln zu Karten, Buttons voll breit; identischer Inhalt.
- Ein Datenmodell, ein Muster, drei Layouts.

## Abnahmekriterien
- [ ] Mehrere Keys anlegbar, testbar, einzeln löschbar; Liste nach Aktiv/Inaktiv gruppiert.
- [ ] „Firma über Modell"-Muster für alle Anbieter; „Modell wählen"-Popover wechselt ohne Neustart.
- [ ] Eigener Anbieter über Dropdown-Ende hinzufügbar (Name + Basis-URL).
- [ ] Status-Ampel grün/gelb/rot; „Guthaben aufladen" verlinkt zur Anbieter-Billing.
- [ ] Keys verschlüsselt gespeichert, nur maskiert angezeigt, einmalige Voll-Anzeige beim Anlegen.
- [ ] Voll responsive; alle Texte über `t()` (Deutsch als Basis).
- [ ] Design entspricht dem beigefügten Bild `responsive.png`.

## Vorgehen
1. Bestehenden Code lesen (settings-surface.js, provider-settings.js, providerRoutes.js, byok.js, securityPolicy.js).
2. Provider-Catalog-Config anlegen.
3. Backend: generische Provider-Endpunkte auf Basis der Cline-Routen (mehrere Keys pro Nutzer, verschlüsselt).
4. Frontend: API-Keys-Surface im Modelle-Panel bauen (Liste, Formular, Popover), responsive.
5. i18n-Strings ergänzen.
6. Verifizieren: Key anlegen/testen/löschen, Modell wechseln, Custom-Anbieter, Handy-Ansicht, kein Klartext im Storage.
