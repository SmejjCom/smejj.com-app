# smejj free-only master policy

Status: locked

Diese Datei ist die zentrale Architekturregel fuer smejj.com.

## Unveraenderbare Kostenregel

- GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Cloudflare.com wird nicht genutzt (Cloudflare-Exit 2026-07-02, schriftlich angeordnet).
- Spaceship.com wird nur fuer die bereits bezahlte Domain smejj.com und kostenloses DNS genutzt; keine kostenpflichtigen Zusatzdienste.
- GitHub Pages (Free) ist das einzige Hosting fuer die statische Website/PWA-Shell.
- Keine GitHub Pro-, Team-, Enterprise-, Actions-Minuten-, Storage-, Packages-, LFS-, Codespaces- oder sonstigen kostenpflichtigen GitHub-Dienste.
- Keine Cloudflare-Dienste jeglicher Art (weder Free noch Paid).
- Salad.com nur pay-per-use hinter Budget-Gate und Laufzeit-Watchdog; kein Abo, kein Auto-Billing-Fallback.
- Oracle Cloud wird NICHT genutzt (schriftliche Nutzer-Entscheidung 2026-07-03: "Oracle rausnehmen, wir arbeiten mit Salad weiter"; die kurzzeitige Always-Free-Zulassung vom selben Tag ist damit revidiert und ein Konto wurde nie angelegt). Der Betriebsweg fuer Rechen- und Serverdienste ist Salad.com — pay-per-use vom vorhandenen Guthaben, hinter Budget-Gate/Watchdog, Auto-Recharge bleibt aus.
- Keine Trial-Angebote.
- Keine Auto-Billing-Fallbacks.
- Keine Funktion, die nach einem kostenlosen Limit automatisch Geld kosten kann.
- Keine kostenpflichtigen Zusatzdienste als Kernbestandteil der Architektur.

### IDrive e2: die einzige Stelle, an der Untaetigkeit Geld kostet (gemessen 2026-07-28)

IDrive e2 BLOCKIERT NICHT, wenn das gebuchte Paket voll ist. Es nimmt weiter an
und rechnet ab — laut Preis-FAQ des Anbieters:

- Speicher ueber dem Paket: **0,006 USD je GB und Monat**
- Egress ueber dem Freibetrag (3x Speichervolumen je Monat): 0,01 USD je GB
- Keine Gebuehren fuer API-Anfragen, Ingress oder Loeschen

Damit ist IDrive e2 der einzige Dienst im Betrieb, bei dem die Regel "keine
Funktion, die automatisch Geld kosten kann" nicht vom Anbieter, sondern von
smejj.com selbst durchgesetzt werden muss. Umgesetzt seit 2026-07-29:

- **Anzeige**: Adminbereich, Modul U — Belegung gegen Paket, Ampel bei
  80/95/100 Prozent, Mehrkosten in USD je Monat sobald ueberschritten.
- **Sperre**: `scripts/deploy/idrive-quota-guard.mjs`, fest eingehaengt in den
  Modell-Upload. Gerechnet wird VOR dem ersten Byte. Fail-closed: ohne Messung
  kein Upload. Eine unvollstaendige Messung gilt als Mindestwert und winkt
  nahe der Grenze nicht durch.
- Stellschrauben: `SMEJJ_IDRIVE_PLAN_TIB` (Vorgabe 2), `SMEJJ_IDRIVE_GRENZE_PROZENT`
  (Vorgabe 95).

Stand der Messung am 2026-07-29: 1,23 TB von 2 TB belegt (61,4 %), rund 790 GB
frei. Ein weiteres grosses Modell passt nicht mehr hinein.

### GitHub: warum der Free-Tarif strukturell haelt (gemessen 2026-07-28)

Die Absicherung ist nicht ein Budget-Limit, sondern das FEHLENDE Zahlungsmittel.
GitHub schreibt fuer Actions und Packages wortgleich: "If your account does not
have a valid payment method on file, usage is blocked once you use up your
quota." Im Konto SmejjCom ist kein Zahlungsmittel hinterlegt — Ueberschreitung
wird gesperrt, nicht berechnet.

Budgets fuer Privatkonten warnen laut Doku nur per E-Mail und stoppen nichts;
sie sind daher KEIN Ersatz fuer diese Absicherung.

Daraus folgen vier Regeln:

1. Nie ein Zahlungsmittel hinterlegen.
2. Repos, in denen Actions laufen, oeffentlich lassen (oeffentliche Repos mit
   Standard-Runnern sind unbegrenzt frei; privat waeren es 2.000 Minuten).
3. GHCR-Pakete oeffentlich lassen (oeffentlicher Paket-Traffic zaehlt nicht).
4. Kein LFS, keine Codespaces.

GitHub Pages: 1 GB Seite, 100 GB Bandbreite je Monat, 10 Builds je Stunde —
weiche Grenzen. Werden sie ueberschritten, drosselt GitHub oder bittet um
Umzug; abgerechnet wird nie.

## Speicherregel

IDrive e2 / S3-kompatibler Storage ist der Hauptspeicher fuer:

- Dateien
- Medien
- Modelle
- Backups
- Deployments
- zentrale Daten
- Manifeste
- Checksums
- Such- und RAG-Artefakte

GitHub und GitHub Pages duerfen diese Daten nicht als Hauptspeicher ersetzen.

## Rollen

GitHub Free:

- Quellcode
- kleine Dokumentation
- Issues und Pull Requests
- manuelle Zusammenarbeit

GitHub Pages Free:

- statische PWA-Auslieferung (Deploy-from-Branch gh-pages, keine GitHub Actions)
- Custom Domain smejj.com

Spaceship (Domain/DNS):

- Domain-Registrierung smejj.com (bereits bezahlt)
- DNS auf GitHub Pages (A/AAAA + www-CNAME)
- keine kostenpflichtigen Zusatzdienste

IDrive e2:

- dauerhafter Hauptspeicher
- Artefakt- und Modell-Vault
- Backups und zentrale Objektablage

Browser/Geraet des Nutzers:

- lokale Arbeitsdaten
- lokale UI
- lokale Cache- und Offline-Funktionen
- optional kleine lokale Modelle, wenn sie ohne versteckte Kosten funktionieren

## Skalierungsregel

smejj.com wird fuer Millionen bis Milliarden Nutzer pro Tag entworfen. Trotzdem duerfen GitHub Free und Cloudflare Free nicht als Haupt-Compute, Haupt-Datenbank, Modell-Host oder Inferenz-Kern geplant werden.

Wenn eine Funktion mit dauerhaft kostenlosen GitHub-/Cloudflare-Rollen nicht sicher moeglich ist, wird sie so angepasst, dass sie:

- lokal im Browser laeuft,
- ueber IDrive-e2-Objekte arbeitet,
- fail-closed blockiert,
- oder erst nach neuer schriftlicher Architekturfreigabe separat geplant wird.

Es gibt keinen stillen Wechsel auf kostenpflichtige Dienste.

## Produktziel

smejj.com ist eine KI- und Code-Assistent-Plattform der naechsten Generation fuer Web, PWA, iPhone, Android und zukuenftige Plattformen.

Jede technische Entscheidung priorisiert:

- Geschwindigkeit
- Stabilitaet
- Sicherheit
- Skalierbarkeit
- niedrige Betriebskosten
- keine versteckten Kosten

## Pflichtpruefung

Vor relevanten Aenderungen muss mindestens laufen:

```bash
npm run check:architecture
```

Vor Release muss laufen:

```bash
npm run release:preflight
```

## Dokumentierte Ausnahmen (nur mit schriftlicher Betreiber-Freigabe)

1. **Zeabur-Server (seit 2026-07-26):** "Tencent Ashburn 2C 8GB"
   (server-6a6665a03ebd074ef6f9a205, Tencent Cloud Virginia, 6 $/Monat,
   Konto smejjcom@gmail.com). Schriftliche Freigabe und Kaufabschluss durch
   den Betreiber Wof Kadavanich am 2026-07-26 im Chat. Zweck: dauerhaft
   aktive Maus-Engine (https://smejj-maus-engine.zeabur.app) ohne
   Kaltstart. Details: Memory_Bank.md Eintrag [2026-07-26] ZEABUR-SERVER
   LIVE. Diese Ausnahme ist eng: Sie erlaubt NUR diesen einen Server;
   jede Erweiterung (groesseres Paket, weitere Server/Dienste) braucht
   erneut eine schriftliche Freigabe mit Dienst und Betrag.

2. **Control-Server auf Zeabur (seit 2026-07-29):** Dienst `smejj-control`
   auf dem BESTEHENDEN Server aus Ausnahme 1 (Projekt "untitled",
   project-6a6666899949111176cddefb). Schriftliche Freigabe durch den
   Betreiber Wof Kadavanich am 2026-07-29 im Chat, Wortlaut:

   > FREIGABE — Control-Server auf Zeabur: Ich gebe den Betrieb des Dienstes
   > smejj-control auf dem bestehenden Zeabur-Server (Projekt "untitled",
   > 6 USD pro Monat, keine zusaetzlichen Kosten) frei.

   Betrag: **0,00 USD zusaetzlich** — der Server ist bereits bezahlt und
   laeuft; es kommt kein Paket und kein Anbieter hinzu. Zweck: Ablieferung
   des letzten Salad-Dienstes (Auth, API-Gateway, Modell-Router, Presign).
   Der Umzug **senkt** die Gesamtkosten, weil die Salad-Container-Gruppe
   `smejj-control` danach entfaellt.
   Diese Ausnahme bleibt eng: Sie erlaubt NUR diesen einen zusaetzlichen
   Dienst auf dem bestehenden Server. Ein groesseres Paket, ein zweiter
   Server oder ein weiterer Anbieter braucht erneut eine schriftliche
   Freigabe mit Dienst und Betrag.
   Umsetzungsplan: `docs/deployment/CONTROL_SERVER_ZEABUR_UMZUG.md`.

3. **Tavily als Suchquelle (seit 2026-08-04):** Websuche ueber
   `https://api.tavily.com/search` mit einem vom Betreiber hinterlegten
   Schluessel (BYOK). Schriftliche Freigabe durch den Betreiber am
   2026-08-04 im Chat: „Ja, mach die Suchquelle mit Schlüssel."

   Betrag: **0,00 USD.** Tavily gewaehrt 1000 API-Credits pro Monat gratis
   und verlangt dafuer **keine Zahlungsart**. Ohne hinterlegte Karte kann
   dort nichts abgerechnet werden — das ist die eigentliche Kostengarantie.

   Anlass: Am 2026-08-04 wurde live aus dem Salad-Container gemessen, dass
   die schluessellosen Quellen dem Rechenzentrum nicht mehr antworten:
   DuckDuckGo (HTML und Lite) liefert HTTP 202 mit einer Sperrseite, Bing
   liefert HTTP 200 mit absichtlichen Taeuschtreffern. Vier von sechs
   Standardfragen ergaben null Treffer. Geprueft und ausgeschieden:
   Brave Search API (Gratiskontingent im Februar 2026 abgeschafft, Karte
   pflicht, metered), Google Custom Search (fuer Neukunden geschlossen,
   Abschaltung 2027-01-01), Mojeek, Marginalia und acht oeffentliche
   SearXNG-Instanzen.

   Zweite Sicherung im Code: `src/search/searchKeyProvider.js` zaehlt mit
   und macht bei `SMEJJ_SEARCH_API_MONTHLY_MAX` dicht (Standard 900 von
   1000). `search_depth: "basic"` kostet 1 Credit statt 2. Ohne Schluessel
   findet kein einziger Netzaufruf dorthin statt (fail-closed).

   Diese Ausnahme bleibt eng: Sie erlaubt NUR dieses eine Gratiskontingent
   ohne hinterlegte Zahlungsart. Ein bezahlter Tarif, ein Pay-as-you-go-
   Zusatz oder ein weiterer Such-Anbieter braucht erneut eine schriftliche
   Freigabe mit Dienst und Betrag.
