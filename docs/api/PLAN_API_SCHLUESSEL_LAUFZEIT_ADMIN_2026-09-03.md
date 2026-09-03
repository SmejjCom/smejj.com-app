# Plan: API-Schluessel mit Laufzeit + Admin-Schluessel-Bereich (2026-09-03)

Betreiber-Beschluss vom 2026-09-03 (Chat mit Claude, Sitzung 685d3274). Dies ist
der Zettel, der den Beschluss ueber Parallelsitzungen hinweg haelt. Noch NICHTS
davon ist gebaut. Wer hier weiterarbeitet: erst diesen Plan lesen, dann bauen.

## Ausgangslage (Code gelesen, nicht vermutet)

- `public/entwickler.html` + `public/entwickler.js` sind nur ein Rahmen um
  `public/assets/api-center-surface.js` (761 Zeilen). Dieselbe Flaeche laeuft
  auch im Einstellungsreiter "API".
- Die Flaeche mischt ZWEI Dinge in EINER Liste: smejj-Schluessel
  (`smejj-live-…`, fuer Programme, Route `/api/developer/keys`) und eigene
  Anbieter-Schluessel (BYOK, Route `/api/keys`). Das ist der Grund fuer
  "nicht uebersichtlich".
- `control-server/src/publicapi/publicApiKeys.js`: ein Schluessel-Eintrag hat
  `id, name, abdruck (sha256), letzte4, erstelltAm, widerrufenAm,
  zuletztBenutztAm`. Es gibt KEIN Ablaufdatum. Jeder Schluessel gilt ewig,
  bis er widerrufen wird. Obergrenze: 20 aktive je Konto
  (`MAX_SCHLUESSEL_JE_KONTO`).
- `pruefeSchluessel()` (Torwaechter) kennt nur: malformed, unknown, revoked,
  store_unavailable. Kein `expired`.
- Es gibt keinen Admin-Bereich fuer Schluessel. Admin-Rollen existieren in
  `control-server/src/admin/adminRoles.js` (owner, admin, support, finance,
  auditor, readonly) mit Rechte-Matrix (allow / dual / consent / deny).

## Betreiber-Wunsch (woertlich zusammengefasst)

1. Uebersichtlicher.
2. Eigener API-Bereich fuer den Admin.
3. Schluessel, die der Admin an Dritte gibt, mit waehlbarer Laufzeit:
   1 Jahr, 2 Jahre, 10 Jahre, 20 Jahre, 30 Jahre oder unbefristet.
4. "Wie machen es Profis?" — Vorbild OpenAI, OpenRouter, Stripe.

## Der Plan in fuenf Punkten

### 1. Zwei Reiter statt einer Liste (Oberflaeche)

- Reiter A "Meine smejj-Schluessel" (fuer Programme).
- Reiter B "Eigene Anbieter" (BYOK, fuer den Chat).
- Oben eine kompakte Karte: Basis-URL, Modellname, Kopier-Knopf. Darunter
  nur die Tabelle. Sonst nichts. Suche + Filter bleiben, aber je Reiter.
- Datei: `public/assets/api-center-surface.js` (+ `?v=`-Marke in
  `entwickler.js` und im Einstellungsreiter nachziehen, SW-Precache pruefen).

### 2. Laufzeit beim Erstellen waehlbar (Kern) — GEBAUT 2026-09-03 (Server dfe41f7c → Bauzweig 63c6c35f; Oberflaeche e6cb439c auf feature/api-laufzeit; Auslieferung per Betreiber-Kaskade scripts/einmal/api-laufzeit-2026-09-03.sh)

- Neues Feld im Eintrag: `laeuftAbAm` (ISO-Datum oder `""` = unbefristet).
  Auch in den Rueckschlag-Datensatz (`putProviderCredential`) schreiben,
  damit der Torwaechter es OHNE Index-Lesen prueft.
- Auswahl beim Erstellen: 30 Tage, 90 Tage, 1 Jahr (VORAUSWAHL), 2 Jahre,
  5 Jahre, 10 Jahre, 20 Jahre, 30 Jahre, unbefristet.
- "Unbefristet" braucht eine Bestaetigung (Checkbox "Ich weiss, dass dieser
  Schluessel nie von selbst ablaeuft").
- `pruefeSchluessel()`: neuer Grund `api_key_expired` → 401 mit Klartext
  "Schluessel abgelaufen am …, bitte neuen erzeugen". Pruef-Cache: der
  positive Cache darf `gueltigBis` nie ueber `laeuftAbAm` hinaus setzen.
- Tabelle zeigt "laeuft ab in 340 Tagen" (gelb ab 14 Tagen, rot = abgelaufen).
- Verlaengern gibt es NICHT als Bearbeiten. Verlaengern = neuen Schluessel
  erzeugen, alten widerrufen (Rotation). So machen es OpenAI und Stripe.
- Alte Schluessel ohne Feld bleiben unbefristet (Rueckwaertskompatibel,
  "Fix wirkt nur vorwaerts").

### 3. Admin-Schluessel-Bereich (Konsole)

- Neuer Bereich in der Admin-Konsole "Ausgestellte Schluessel".
- Neues Recht in `adminRoles.js`: `apikeys.issue` mit
  owner: allow, admin: allow, alle anderen: deny.
  Widerruf: `apikeys.revoke` owner/admin/support: allow.
- Formular: "Ausgestellt fuer" (Name oder E-Mail, Pflicht), Laufzeit
  (Liste aus Punkt 2 inkl. unbefristet), optional Monatsbudget (Token oder
  USD), Notiz. Der Schluessel haengt am AUSSTELLENDEN Admin-Konto; der
  Empfaenger braucht kein smejj-Konto.
- Speicher: eigener Index je Admin-Konto (nicht die 20er-Grenze der
  Nutzer-Schluessel), Rueckschlag-Datensatz wie bisher, plus Feld
  `ausgestelltFuer` und `ausgestelltVon`.
- Abrechnung: Verbrauch laeuft auf das Admin-Konto, im Ledger mit
  `keyId` getrennt sichtbar (publicApiLedger.js kennt keyId bereits ueber
  `merkeBenutzung`).

### 4. Praefix trennt die Arten

- Nutzer: `smejj-live-…` (bleibt).
- Admin-ausgestellt: `smejj-adm-…`.
- `SCHLUESSEL_MUSTER` erweitern; jeder Log, jeder Waechter und der
  Secret-Scanner erkennen die Art am Praefix.

### 5. Sicherheit, die Profis erwarten

- Klartext nur einmal anzeigen (bleibt).
- Jede Erzeugung, jeder Widerruf, jede Loeschung ins Admin-Protokoll
  (Audit-Log), mit Rolle und Zeit.
- Unbefristete Admin-Schluessel erscheinen in der Tagesmappe als eigene
  Zeile "N unbefristete Schluessel im Umlauf" — damit sie nie vergessen werden.
- Kein Schluessel-Klartext in e2, in Logs oder im Ledger. Nur der sha256.

## Reihenfolge und Abnahme

1. Punkt 2 zuerst (Laufzeit + `api_key_expired`), mit Tests in
   `publicApiKeys.test.js`: abgelaufener Schluessel → 401 expired;
   unbefristet → ok; Cache laeuft nicht ueber das Ablaufdatum hinaus.
2. Dann Punkt 3 + 4 (Admin-Bereich, Praefix), Tests in
   `adminRoles.test.js` (Rechte-Matrix) und neuer Route-Test.
3. Zuletzt Punkt 1 (Reiter-Umbau), Handy-Test echt (44-px-Ziele).
4. `docs/api/OEFFENTLICHE_API.md` um Laufzeit und `api_key_expired` ergaenzen.
5. Deploy: Server-Teil in den Bauzweig (smejj-control neu BAUEN), Frontend
   ueber das Buendel; nichts davon ist im Start-Lock, api-center-surface.js
   ist nicht gesperrt (vorher `node scripts/check-start-lock.mjs`).

## Was bewusst NICHT im Plan ist

- Kein "Bearbeiten" des Ablaufdatums an einem lebenden Schluessel.
- Keine Schluessel per E-Mail versenden. Der Admin kopiert und uebergibt selbst.
- Keine automatische Verlaengerung.
