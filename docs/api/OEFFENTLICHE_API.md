# Die oeffentliche smejj-API (`/v1`)

Stand 2026-08-23. **LIVE** auf https://smejj-control.zeabur.app seit 04:49Z
(Bau-Branch `feature/auth-redesign-github-magiclink`, Commits abe70763, cbf9fe8b,
254447b2). Live-Nachweis: task-capsules/2026/08/job_oeffentliche_api_v1_20260823/.

## Was es ist

smejj tritt gegenueber fremden Werkzeugen als Modellanbieter auf, im
OpenAI-Protokoll. Ein Kunde traegt drei Angaben in ZCode, Cline, Cursor oder
das offizielle OpenAI-SDK ein und ist fertig:

| Angabe | Wert |
|---|---|
| Basis-URL | `https://smejj.com/v1` (bzw. der Control-Host) |
| Modell | `smejj-1.0` |
| API-Schluessel | `smejj-live-…`, selbst erzeugt unter `/entwickler` |

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

Sitzungspflichtig. Oberflaeche: `https://smejj.com/entwickler`
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
SMEJJ_PUBLIC_API_BASE_URL=https://smejj.com/v1   # was die Oberflaeche anzeigt
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

Profis nennen den Hoster nicht in der Kunden-URL. `api.smejj.com` ist am
Zeabur-Dienst angemeldet; es fehlt der DNS-Eintrag bei Spaceship:

| Typ | Host | Wert |
|---|---|---|
| CNAME | `api` | `smejj-control.zeabur.app` |

Danach `SMEJJ_PUBLIC_API_BASE_URL=https://api.smejj.com/v1` setzen — die
Entwicklerseite zeigt dann nur noch diese Adresse.

## Was fuer ein Produkt noch fehlt

1. **Abrechnung.** Der Verbrauch wird gezaehlt, aber nicht bepreist. Stripe ist
   verdrahtet (`/api/billing/*`), rechnet heute aber Abos ab, keine Token.
2. **Ereignisprotokoll** statt Tagesaggregat, sobald Geld daran haengt.
3. **Menueeintrag** zur Seite `/entwickler.html` — heute nur ueber die Adresse
   erreichbar; `public/index.html` steht unter dem Start-Lock.
4. **`/v1/embeddings`**, falls Kunden danach fragen.
