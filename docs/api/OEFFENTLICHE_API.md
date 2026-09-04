# Die oeffentliche smejj-API (`/v1`)

> **Beschluss 2026-09-03 (Punkt 2 Laufzeit GEBAUT 2026-09-03, Admin-Bereich offen):** Schluessel bekommen eine
> waehlbare Laufzeit (1 Jahr Vorauswahl bis unbefristet) und der Admin einen
> eigenen Bereich fuer ausgestellte Schluessel (`smejj-adm-…`). Plan mit
> Reihenfolge und Abnahme: `docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md`.
> Wer an `/api/developer/keys` oder `api-center-surface.js` arbeitet, liest zuerst den Plan.

Stand 2026-08-23. **LIVE** auf https://smejj-control.zeabur.app seit 04:49Z
(Bau-Branch `feature/auth-redesign-github-magiclink`, Commits abe70763, cbf9fe8b,
254447b2). Live-Nachweis: task-capsules/2026/08/job_oeffentliche_api_v1_20260823/.

## Was es ist

smejj tritt gegenueber fremden Werkzeugen als Modellanbieter auf, im
OpenAI-Protokoll. Ein Kunde traegt drei Angaben in ZCode, Cline, Cursor oder
das offizielle OpenAI-SDK ein und ist fertig:

| Angabe | Wert |
|---|---|
| Basis-URL | `https://api.smejj.com/v1` |
| Modell | `smejj-1.0` |
| API-Schluessel | `smejj-live-…`, selbst erzeugt unter https://smejj.com/entwickler.html |

## Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/v1/models` | Modellliste im OpenAI-Schema |
| `GET` | `/v1/models/<id>` | Ein Modell |
| `POST` | `/v1/chat/completions` | Antwort, mit und ohne `stream` |
| `OPTIONS` | `/v1/*` | CORS-Preflight (offen fuer jeden Ursprung) |

Durchgereichte Felder: `stream`, `temperature`, `max_tokens`, `tools`,
`tool_choice`, `response_format`. Fehler kommen im OpenAI-Format
(`{"error":{"message","type","code","request_id"}}`).

## Modelle sind Markennamen

`smejj-1.0`, `smejj-1.0-fast`, `smejj-1.0-code`, `smejj-1.0-reasoning`. Sie
bilden auf die Routing-Profile von `modelRouter.js` ab (default/fast/coding/
reasoning). **Der Kunde erfaehrt nie, welches Backend geliefert hat** — auch
nicht im Stream: `publicApiRoutes.js` schreibt das `model`-Feld jedes einzelnen
SSE-Blocks auf den Markennamen um. Damit ist ein Anbieterwechsel fuer Kunden
unsichtbar, und unsere Lieferantenliste bleibt unsere Sache.

## Schluessel

Ausgegeben wird `smejj-live-` + 32 Zeichen aus 24 Zufallsbytes (192 Bit).

**Gespeichert wird nur der SHA-256-Abdruck.** Der Klartext existiert genau
einmal: in der Antwort auf `POST /api/developer/keys`. Wer unseren Speicher oder
eine Sicherung davon liest, kann damit keine Anfrage stellen.

Zwei Objekte je Schluessel, beide im vorhandenen AES-256-GCM-Tresor
(`providerCredentialVault.js`, iDrive):

* `subject=<kontoId>  provider=smejj-api-index` — was der Besitzer sieht.
* `subject=<abdruck>  provider=smejj-api-lookup` — von welchem Konto ist dieser
  Abdruck? Der Torwaechter braucht nur das.

Gepruefte Abdruecke liegen 60 Sekunden im Prozessspeicher (sonst zwei
S3-Lesevorgaenge je Anfrage). Ein Widerruf wirkt im eigenen Prozess sofort, auf
anderen Instanzen nach spaetestens dieser Frist.

## Selbstbedienung

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/developer/keys` | Liste (maskiert) + Tagesverbrauch |
| `POST` | `/api/developer/keys` | neuer Schluessel — Klartext EINMAL |
| `POST` | `/api/developer/keys/<id>/revoke` | widerrufen |

Sitzungspflichtig. Oberflaeche: `https://smejj.com/entwickler.html` (Frontend-Repo, dort ist der Nutzer angemeldet; auf api.smejj.com selbst gibt es keine Sitzung — Cookie ist hostgebunden)
(`public/entwickler.html` + `entwickler.js` + `entwickler.css`).

## Deckel gegen Kosten

* 60 Anfragen Vorrat je Konto, eine pro Sekunde zurueck → `429` mit `Retry-After`.
* Tageskontingent in Token je Konto → `429 daily_quota_exceeded`, Reset 00:00 UTC.
* Gezaehlt wird der gemessene `usage`-Block des Backends; liefert ein Backend
  keinen, wird geschaetzt (4 Zeichen ≈ 1 Token) statt null zu zaehlen.
* Persistiert wird hoechstens alle 30 s je Konto (`publicApiUsage.js`). Ein
  Absturz verliert bis zu 30 s Zaehlung — fuer eine Anzeige vertretbar, fuer
  eine **Rechnung nicht**. Wer abrechnen will, braucht hier ein
  Ereignisprotokoll statt eines Aggregats.

## Einschalten (Zeabur, Dienst `smejj-control`)

```
SMEJJ_PUBLIC_API_ENABLED=1
```

Ohne diese Variable antwortet `/v1` mit `503 public_api_disabled` und
`/api/developer/keys` mit `503` — fail-closed, damit ein versehentlich
ausgerollter Stand keine Modellzeit verschenkt.

Optional:

```
SMEJJ_PUBLIC_API_TAGESLIMIT_TOKENS=1000000   # Voreinstellung; -1 oder 0 = kein Deckel
SMEJJ_PUBLIC_API_BASE_URL=https://api.smejj.com/v1   # was die Oberflaeche anzeigt (LIVE gesetzt)
```

Vorausgesetzt (steht bereits, weil BYOK sie nutzt):
`SMEJJ_PROVIDER_CREDENTIAL_KEY_ID`, `SMEJJ_PROVIDER_CREDENTIAL_KEY_B64`,
`IDRIVE_E2_*`.

> Zeabur-Variablen NIE ueber den Roh-Editor setzen — `updateEnvironmentVariable`
> mit einer Map ERSETZT die ganze Umgebung (Vorfall 2026-08-14, zweimal).

## Bewiesen am 2026-08-23 (lokal, Port 3199, Backend-Attrappe)

* Oberflaeche `/entwickler` → Schluessel erzeugt → derselbe Schluessel
  beantwortet `POST /v1/chat/completions`.
* Antwort nennt `smejj-1.0`, nirgends das Backend-Modell — auch im Stream nicht
  (5 SSE-Bloecke geprueft).
* Verbrauch nach zwei Anfragen: 2 Anfragen, 24 + 10 Token.
* Widerruf → dieselbe Anfrage `401 api_key_revoked`.
* Ohne Schluessel `401` mit `WWW-Authenticate`, ohne Flag `503`.
* 18 automatische Pruefungen: `node --test tests/oeffentliche-api.test.mjs`.

## Zwei Dinge, die erst der Live-Test zeigte

1. **Denken aus.** `max_tokens=50` an smejj-1.0 verbrauchte 50 Reasoning-Token und
   lieferte `content:""` mit `finish_reason: length`. Seitdem: `thinking: disabled`
   fuer alles ausser `smejj-1.0-reasoning`.
2. **Das Modell stellt sich selbst vor** („the GLM language model trained by Z.ai").
   Das Umschreiben des `model`-Feldes faengt das nicht. Seitdem steht eine konstante
   Identitaets-Systemnachricht an Position 0 jeder Anfrage (stabiler Cache-Praefix).

## Eigene Domain `api.smejj.com`

**LIVE seit 2026-08-23 ~05:30Z.** Profis nennen den Hoster nicht in der
Kunden-URL. Gesetzt: CNAME `api` -> `smejj-control.zeabur.app` bei Spaceship
(Advanced DNS, per Browser), Domain am Zeabur-Dienst (`addDomain`), Zertifikat
nach ~4 min `PROVISIONED`, `SMEJJ_PUBLIC_API_BASE_URL` per
`updateSingleEnvironmentVariable` (braucht eine Feldauswahl `{ key }`, sonst 422;
`createEnvironmentVariable` lehnt vorhandene Schluessel ab).

## Abrechnung — PREPAID (LIVE seit 2026-08-23 06:03Z)

Wie OpenAI, Anthropic, DeepSeek: Guthaben aufladen, jede Anfrage bucht ab,
bei 0 antwortet `/v1` mit **402 `insufficient_quota`** (SDKs wiederholen das
nicht blind — ein 429 wuerden sie wiederholen).

| Modell | Eingabe | Ausgabe | (USD je 1 Mio Token) |
|---|---|---|---|
| smejj-1.0 | 0,50 | 1,50 | Voreinstellung |
| smejj-1.0-fast | 0,20 | 0,60 | |
| smejj-1.0-code | 1,00 | 3,00 | |
| smejj-1.0-reasoning | 1,00 | 4,00 | einziges Modell mit Denken |

* `publicApiPreise.js`: Preise je Markenmodell, gerechnet in ganzzahligen Mikro-USD.
* `publicApiLedger.js`: `api-billing/konten/<kontoId>.json` (Guthaben, Summen),
  `api-billing/ereignisse/<kontoId>/<tag>/<anfrageId>.json` (EIN Objekt je Anfrage —
  das ist die Buchhaltung; der Tageszaehler bleibt Anzeige),
  `api-billing/aufladungen/<stripeSessionId>.json` (Idempotenz).
* Startguthaben 1 USD je Konto, einmalig (`SMEJJ_PUBLIC_API_STARTGUTHABEN_USD`).
* Aufladen: `POST /api/developer/guthaben/checkout {betragUsd: 10|25|50|100}` ->
  Stripe-Checkout (Einmalzahlung, `price_data` inline, Konto in `metadata`);
  Webhook `checkout.session.completed` mit `metadata.zweck=api-guthaben` schreibt gut.
* Oberflaeche: Einstellungen -> Reiter **„API & Schluessel"** (api-konto-surface.js,
  nachgeladen) und dieselben vier Karten auf `/entwickler.html`.
* Bekannte Grenze: Konto-Objekt read-modify-write; bei mehreren Instanzen aus
  dem Ereignisprotokoll nachrechnen.

Live bewiesen 2026-08-23: Seite zeigt 1,00 USD Startguthaben, 4 Stufen, 4 Preise;
`/v1`-Anfrage (87+30 Token) gebucht; Checkout-Sitzung `cs_live_…` erzeugt (nicht
bezahlt); lokal: 402 bei 0, Webhook doppelt zugestellt = einmal verbucht.

## Was fuer ein Produkt noch fehlt

1. **Echte Zahlung Ende-zu-Ende** (Checkout ist erzeugt, der Webhook-Pfad ist
   getestet — eine echte 10-USD-Aufladung durch den Betreiber schliesst den Kreis).
2. **Nachrechnen-Skript** aus dem Ereignisprotokoll (Mehrinstanz-Fall).
3. **Menueeintrag** zur Seite `/entwickler.html` — heute nur ueber die Adresse
   erreichbar; `public/index.html` steht unter dem Start-Lock.
4. **`/v1/embeddings`**, falls Kunden danach fragen.

## Laufzeit der Schluessel (seit 2026-09-03)

Beim Erstellen (`POST /api/developer/keys`, Feld `laufzeit`) waehlt der Kunde,
wie lange der Schluessel gilt. Codes: `30t`, `90t`, `1j` (Vorauswahl der
Oberflaeche), `2j`, `5j`, `10j`, `20j`, `30j`, `unbefristet`. `GET
/api/developer/keys` nennt die Liste als `laufzeiten` + `laufzeitVorauswahl`.
Ein Client, der KEIN `laufzeit` schickt, bekommt wie bisher einen unbefristeten
Schluessel; alte Eintraege ohne Feld bleiben unbefristet (Fix wirkt nur vorwaerts).

- Jeder Eintrag traegt `laeuftAbAm` (ISO oder `""` = unbefristet) und den
  Zustand `aktiv | inaktiv | abgelaufen | widerrufen`.
- Der Torwaechter an `/v1` lehnt Abgelaufene mit **401** und `error.code =
  api_key_expired` ab. Der Pruef-Cache endet spaetestens am Ablaufdatum.
- Unbekannter Code → **400** `api_key_laufzeit_invalid`.
- Verlaengern gibt es nicht: neuen Schluessel erzeugen, alten widerrufen
  (Rotation). Umschalten/Widerruf tragen das Ablaufdatum mit.

Tests: `tests/oeffentliche-api.test.mjs` (Laufzeit, Ablauf trotz warmem
Cache, 401 an /v1, Umschalten rettet nicht) und `tests/api-laufzeit.test.mjs`
(Codes Server = Oberflaeche, Uebersetzungen in 14 Sprachen, Rechnung).

## Vom Betreiber ausgestellte Schluessel (seit 2026-09-04)

Owner und Admin stellen in der Konsole unter **API & Schluessel** Schluessel fuer
Dritte aus (`smejj-adm-…`, Recht `apikeys.issue`). Pflichtfelder: Empfaenger
(Name oder E-Mail) und Laufzeit (dieselben Codes wie oben, inkl. `unbefristet`
nach Rueckfrage), optional eine Notiz. Der Empfaenger braucht kein smejj-Konto.

- Speicher: EIN Index fuer alle Admins (`smejj-api-admin` / `smejj-api-admin-index`),
  Rueckschlag wie bei Kundenschluesseln — der Torwaechter an `/v1` kennt nur
  einen Weg. Kennung `adm_…`, Praefix `smejj-adm-`.
- Verbrauch laeuft auf das API-Konto des ausstellenden Admins (Unbegrenzt-
  Regel `SMEJJ_API_UNBEGRENZT` gilt damit mit). Nutzung (Anfragen/Token,
  zuletzt benutzt) steht je Schluessel in der Konsole.
- Routen: `GET /api/admin/geld/api/ausgestellt` (apikeys.read),
  `POST …/api/ausstellen` (apikeys.issue, Antwort 201 mit Klartext genau einmal),
  `POST …/api/widerrufen` (apikeys.revoke, Grund ≥ 10 Zeichen). Ausstellung und
  Widerruf stehen im Audit-Log (`apikey.issue`, `apikey.revoke`), nie der Klartext.
- Ablauf → 401 `api_key_expired`, Widerruf → 401 `api_key_revoked`.
- Noch offen: Monatsbudget je Schluessel, Tagesmappe-Zeile "N unbefristete im Umlauf".

Tests: `tests/admin-api-schluessel.test.mjs` (Rechte, Eingaben, Torwaechter,
Nutzung, Ablauf, Widerruf, Audit) und `adminRoles.test.js` (apikeys.issue).

### Monatsbudget je ausgestelltem Schluessel (seit 2026-09-04)

Beim Ausstellen optional `budgetToken` (0 = kein Budget), spaeter aenderbar per
`POST /api/admin/geld/api/budget` (`{id, budgetToken}`, Recht `apikeys.issue`,
Audit `apikey.budget`). Gezaehlt wird je Kalendermonat (UTC); am Monatsersten
faengt der Zaehler bei null an.

- Ueber dem Deckel antwortet `/v1` mit **429** und `error.code =
  key_budget_exceeded`, samt Stand und Monat im Text. Die Pruefung steht VOR
  dem globalen Tageslimit — der selbst gesetzte Deckel ist die praezisere Auskunft.
- Der noch nicht geschriebene Nutzungs-Puffer zaehlt beim Pruefen mit; der
  Deckel wartet also nicht auf den naechsten Schreibvorgang (Drosselung 60 s).
  Ein 30-Sekunden-Cache haelt den Lesevorgang aus dem Anfragepfad.
- Ungueltige Werte (negativ, keine Zahl, ueber 1 Mrd.) → **400**
  `api_key_budget_invalid`; Budget eines widerrufenen Schluessels → **409**.
- Die Konsole zeigt je Zeile "verbraucht / Budget" mit Ampel und in der Kachel,
  wieviele Schluessel gerade am Deckel stehen.
