# DNS-Wache für smejj.com (Autopilot Nr. 87) — Vorschlag vom 21.09., GEBAUT am 22.09.

Stand 22.09.2026 — Betreiber-Freigabe „Baue Stufe A und B“: Stufe A ist `control-server/src/autopilots/dnsWacheAutopilot.js` (Nr. 87 — Nummer 86 war inzwischen an smejj ai radar vergeben), Stufe B ist `.github/workflows/dns-wache.yml`. Stufe C bleibt Vorschlag. Das Soll-Register liegt als `DNS_SOLL` im Modul (eine Quelle, ausführbar), nicht als eigene JSON-Datei.

## 1. Anlass

Am 21.09.2026 gegen 13:40–13:48 (Ortszeit Mac) waren `smejj.com` und `api.smejj.com` nicht auflösbar. Beide zuständigen
Nameserver `launch1/launch2.spaceship.net` (162.159.26.38, 162.159.27.32) antworteten für die Zone mit SERVFAIL bzw. REFUSED;
Google-DNS meldete „Name server failure", Cloudflare-DNS „No Reachable Authority at delegation smejj.com". Die Seite selbst lief
(über die feste GitHub-Pages-Adresse kam `sw.js` mit HTTP 200). Domain, Delegation und unsere Einträge waren in Ordnung
(Vorfall-Eintrag in `docs/qa/app-a-bis-z-2026-09-19.md`).

**Bemerkt hat es nur der Zufall** — eine Versionsabfrage scheiterte. Keine der 85 Wachen misst die Namensauflösung: die Ampel
prüft Seiten und Dienste, und zwar vom Server aus, der die Namen meist noch im Zwischenspeicher hat.

## 2. Was auf dem Spiel steht

| Eintrag | Wofür | Fällt er aus … |
|---|---|---|
| `smejj.com` A/AAAA | die App (GitHub Pages) | … öffnet niemand die App, installierte Apps starten nur noch offline |
| `api.smejj.com` CNAME | Chat, Anmeldung, Bilder, Browser | … antwortet der Chat nicht, Anmeldung scheitert |
| `smejj.com` MX, SPF, DKIM, DMARC | Anmelde-Mails (Magic-Link), Support | … kommen Magic-Links nicht an oder landen im Spam |
| DS/DNSKEY (DNSSEC ist aktiv) | Echtheit der Antworten | … verwerfen prüfende DNS-Dienste (Google, Cloudflare, Quad9) ALLE Antworten |
| CAA | Zertifikate (Let's Encrypt) | … scheitert die nächste Zertifikats-Erneuerung |

Gemessen: TTL der Einträge 1800 s, negative Antworten 3600 s. Ein Ausfall unter 30 Minuten trifft also nur einen Teil der
Besucher (wer den Namen nicht mehr im Zwischenspeicher hat); ab 30 Minuten trifft er alle, und eine einmal zwischengespeicherte
Fehlantwort kann bis zu einer Stunde nachwirken.

**Einzelpunkt:** beide Nameserver gehören demselben Anbieter (Spaceship). Fällt dessen DNS aus, gibt es keinen zweiten Weg.

## 3. Der Vorschlag in drei Stufen

### Stufe A — Messen (klein, kostenlos, empfohlen): Autopilot Nr. 86 „dns-wache"

Ein neuer Lauf nach dem Muster von Nr. 8/32 (`dienstSondenAutopilot.js`): fasst die Außenwelt an, zweiter Blick vor Rot.

**Was er je Takt (alle 30 min, mit dem Läufer) fragt** — alles technisch ausprobiert am 21.09.:

1. **Die zwei Nameserver direkt** (`node:dns/promises` `Resolver`, `setServers([ip])`, ohne Rekursion): `smejj.com` A, `api.smejj.com`
   CNAME, `smejj.com` MX, `smejj.com` SOA. Antwortzeit gemessen 60–95 ms. Das ist die eigentliche Ursachen-Messung: sie zeigt den
   Ausfall sofort, auch wenn öffentliche Dienste noch aus dem Zwischenspeicher antworten.
2. **Ein prüfender öffentlicher Dienst** über HTTPS (`https://dns.google/resolve?name=…`): Status 0, Antwort vorhanden, und
   **`AD: true`** für `smejj.com` — das ist der DNSSEC-Nachweis. Fällt die Signatur (abgelaufen, Schlüssel passt nicht zum DS),
   steht hier Status 2, lange bevor ein Besucher schreibt.
3. **Soll-Ist-Vergleich** gegen ein kleines eingefrorenes Register (`docs/infrastruktur/dns-soll.json`, neu): die vier
   GitHub-Pages-Adressen, das CNAME-Ziel `smejj-control.zeabur.app`, die MX-Ziele, CAA `letsencrypt.org`, die zwei Nameserver.
   Eine fremde Änderung an der Zone (Konto-Übernahme beim Anbieter, Fehlklick) wird damit zum Alarm statt zur Überraschung.

**Ampel-Regeln** (Lehre „zweiter Blick" aus Nr. 8, damit ein Flackern kein Fehlalarm wird):

- ein Nameserver antwortet nicht → nach 10 s einmal wiederholen; bleibt es dabei: **gelb** („ein Nameserver gestört, Auflösung geht noch")
- beide Nameserver gestört ODER Google meldet Status ≠ 0 → **rot** („smejj.com nicht auflösbar")
- `AD` nicht mehr `true` → **rot** („DNSSEC-Kette gebrochen")
- Soll-Ist-Abweichung → **rot** („Zone wurde geändert: …"), mit dem Unterschied im Klartext
- eigener Netzfehler des Servers (auch github.com/dns.google nicht erreichbar) → **kein Urteil**, „Netz-Takt abgewartet" —
  ein gescheiterter Transport ist keine schlechte Note (Regel des Messlaufs)

**Alarmweg — der Knackpunkt:** Bei einem DNS-Ausfall ist die Ampel-Seite selbst nicht erreichbar, und eine Alarm-Mail VON
`@smejj.com` kann beim Empfänger an SPF/DKIM scheitern, weil genau diese Einträge nicht auflösbar sind. Darum:

- Alarm über den vorhandenen Weg (`sicherheitsAlarm.js`/`sendAuthMail`, gedeckelt: eine Mail je Art und Ruhezeit) an die
  Betreiber-Adresse bei Gmail — mit dem Wissen, dass sie im Ernstfall im Spam landen kann; **plus**
- der Vorfall läuft wie jeder rote Lauf ins Werkstatt-Backlog und ins Audit-Log (nachlesbar, sobald DNS wieder geht); **plus**
- Stufe B als Bote von außen.

**Umfang:** eine neue Datei `dnsWacheAutopilot.js` (~150 Zeilen) + Test mit kranken UND gesunden Proben (Muster Nr. 85),
Eintrag in `deckungsLaeufe.js` (`DECKUNG_IDS` + Lauf), Karten-Texte in `opsAutopilotenListeDeckung.js`/`autopilotWirkung.js`/
`opsAutopilotenBereiche.js`, das Soll-Register, Nummern-Register nachziehen. Keine neue Abhängigkeit, keine Kosten, kein neuer
Anbieter. Vorab einmal auf Zeabur prüfen, ob ausgehendes UDP/53 erlaubt ist — falls nicht, fragt der Lauf die Nameserver über
TCP/53 bzw. misst nur über HTTPS (Google) und meldet „Ursache nicht einzeln messbar".

### Stufe B — Außenposten (kostenlos): GitHub Action „dns-wache" alle 30 min

Der Server sitzt bei EINEM Anbieter in EINEM Netz. Ein zweiter Standort kostet nichts: ein Workflow im öffentlichen Repo
(Actions dort kostenlos, Muster `qualitaets-messlauf.yml`) fragt mit `dig` dieselben vier Dinge ab und

- schreibt bei Rot ein **GitHub-Issue** „DNS: smejj.com nicht auflösbar" (GitHub benachrichtigt den Betreiber per Mail über
  **github.com**, unabhängig von unserer Zone — das ist der Bote, der auch im Ernstfall ankommt) und schließt es selbst, sobald
  drei Messungen in Folge wieder grün sind;
- braucht **kein Geheimnis** (nur öffentliche DNS-Abfragen), also kein neues Risiko im Repo.

Grenze: geplante Actions laufen nicht sekundengenau und können sich um 10–30 min verspäten — als zweiter Bote reicht das.

### Stufe C — Abhilfe statt nur Alarm (Entscheidung mit Tragweite, nicht Teil dieses Vorschlags zum Sofort-Bau)

Messen verkürzt die Zeit bis zum Bemerken, **behebt aber nichts**: fällt Spaceship-DNS aus, können wir nur warten. Wirkliche
Abhilfe wäre ein zweiter, unabhängiger DNS-Anbieter. Dazu ehrlich:

- **Zweiter Anbieter als Sekundär-DNS** (Zonen-Übertragung AXFR): ob Spaceship das auf seinem kostenlosen DNS anbietet, ist
  ungeprüft — vermutlich nicht.
- **Umzug der Zone** zu einem Anbieter mit mehreren unabhängigen Netzen: kostenlose Kandidaten wären z. B. deSEC (gemeinnützig,
  DNSSEC, API) oder Hurricane Electric; Cloudflare scheidet aus (Betreiber-Regel „KEIN Cloudflare"). Das ist ein Eingriff an
  Zugängen/DNS und steht auf der Roten Liste: Nameserver-Wechsel bei aktivem DNSSEC verlangt einen sauberen DS-Wechsel, sonst
  ist die Domain für alle prüfenden Dienste tot — genau der Fehler, den die Wache verhindern soll.
- **Empfehlung:** erst Stufe A+B bauen und vier Wochen messen. Bleibt es bei diesem einen Flackern, reicht der Alarm. Häuft es
  sich, ist der Umzug die richtige Arbeit — dann mit eigenem Plan, Sicherung der Zone (`docs/mail/DNS_BACKUP_2026-09-18.md` ist
  die Vorlage) und schriftlicher Freigabe.

## 4. Was NICHT vorgeschlagen wird

- kein kostenpflichtiger Überwachungsdienst, kein neuer Anbieter für die Messung (Master-Charta: nur kostenfreie Dienste);
- keine Messung vom Mac des Betreibers (Regel „MAC IST TABU"; die Nacht-Wächter dort bleiben, wie sie sind);
- keine Änderung an DNS-Einträgen, Nameservern oder DNSSEC.

## 5. Aufwand und Freigabe

| Stufe | Aufwand | Kosten | Risiko | Braucht |
|---|---|---|---|---|
| A — Autopilot Nr. 86 | eine Arbeitsrunde inkl. Tests und Auslieferung (Bauzweig → api.smejj.com) | 0 € | gering (nur lesen) | Freigabe + ein Doppelklick |
| B — GitHub Action | kurz, danach ein Probelauf | 0 € | gering (kein Geheimnis) | Freigabe |
| C — zweiter DNS-Anbieter | eigener Plan | 0 € möglich | **hoch** (DNSSEC-Wechsel) | schriftliche Freigabe, Rote Liste |

**Empfehlung:** A und B zusammen freigeben, C nach vier Wochen Messung neu bewerten.
