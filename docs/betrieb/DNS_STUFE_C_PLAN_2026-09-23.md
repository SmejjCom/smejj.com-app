# DNS-Wache Stufe C — Abhilfe statt nur Alarm (Plan vom 23.09.2026, VORBEREITET, nicht ausgeführt)

Auftrag des Betreibers 23.09.2026: „DNS-Wache Stufe C vorbereiten". Stufe A (Autopilot Nr. 87) und B
(`.github/workflows/dns-wache.yml`) laufen seit 22.09. (siehe `DNS_WACHE_VORSCHLAG_2026-09-21.md`). Dieses Dokument
macht Stufe C **entscheidungs- und ausführungsreif**. Es wurde **nichts** an Zone, Nameservern, DNSSEC oder Konten
geändert — jeder Schritt unten braucht die schriftliche Freigabe des Betreibers (Rote Liste: DNS).

## 1. Ist-Stand der Zone (live gemessen 23.09.2026, autoritativ bei launch1.spaceship.net)

| Name | Typ | Wert | TTL |
|---|---|---|---|
| smejj.com | A | 185.199.108.153, .109.153, .110.153, .111.153 (GitHub Pages) | 1800 |
| smejj.com | AAAA | 2606:50c0:8000::153 … 8003::153 | 1800 |
| api.smejj.com | CNAME | smejj-control.zeabur.app | 1800 |
| www.smejj.com | CNAME | smejjcom.github.io | 1800 |
| smejj.com | MX | 0 mx1.efwd.spaceship.net, 0 mx2.efwd.spaceship.net (Spaceship-Mailweiterleitung) | 1200 |
| smejj.com | TXT | google-site-verification=Ln-4q…, `v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all` | 1800 |
| _dmarc.smejj.com | TXT | `v=DMARC1; p=none; rua=mailto:s@smejj.com` | 1800 |
| smejj.com | CAA | 0 issue "letsencrypt.org" | 1800 |
| smejj.com | NS | launch1/launch2.spaceship.net (Delegation bei .com: TTL 172800) | 1800 |
| smejj.com | DNSKEY | KSK 257 + ZSK 256, Algorithmus 13 (ECDSA P-256) | 3600 |
| smejj.com | DS (bei .com) | 18410 13 2 29787E29…E14C2000 | — |
| SOA | | Serial 1789735811, Refresh 43200, Retry 3600, Expire 604800, **negativ 3600** | 1800 |

Die Zone ist klein (16 Nutzeinträge) und vollständig aus öffentlichen Abfragen rekonstruierbar — das ist zugleich die
Sicherung für jeden Umbau.

## 2. Was geprüft wurde (Fakten statt Vermutung)

- **Spaceship gibt die Zone nicht heraus:** `dig axfr smejj.com @launch1.spaceship.net` → „Transfer failed". Ein
  Sekundär-Anbieter, der die Zone bei Spaceship abholt, ist damit **nicht möglich** (Stufe-C-Idee „AXFR" entfällt).
- **deSEC** (gemeinnützig, kostenlos, DNSSEC) bietet **keine** ausgehende Zonenübertragung an (offener Wunsch
  desec-stack #579) — deSEC als Primär + fremder Sekundär geht nicht.
- **Hurricane Electric** (dns.he.net, kostenlos, 5 Nameserver, IPv6): kann Sekundär für **vorsignierte** Zonen sein,
  mit TSIG. Er signiert aber nicht selbst → braucht einen Primär, der signiert UND AXFR ausgibt. Merkposten:
  2024 fiel HE-DNS aus, als die Domain he.net gesperrt war.
- **1984 Hosting / Hetzner / NS-Global / Puck**: kostenlos, aber **ohne** DNSSEC für Sekundärzonen.
- **Cloudflare** scheidet aus (Betreiber-Regel „KEIN Cloudflare").
- **Die Mail hängt an Spaceship:** MX und SPF zeigen auf die Spaceship-Mailweiterleitung (`efwd`). Bei einem
  DNS-Wechsel müssen diese Einträge 1:1 mitwandern; ob die Weiterleitung mit fremden Nameservern weiterläuft, ist
  **bei Spaceship zu bestätigen** (Hilfeseite/Support) — sonst kommen Magic-Links/Supportmails nicht mehr an.

Quellen: Spaceship-Hilfe „Custom nameservers" (spaceship.com/knowledgebase/connect-domain-custom-nameservers/),
deSEC-Forum „Zone transfer AXFR support", Übersicht sekundärer Anbieter (blog.sahilister.in, 07/2025),
DNSimple „Why DNSSEC and Secondary DNS may not work together".

## 3. Optionen

| | Was | Schutz gegen Spaceship-DNS-Ausfall | DNSSEC | Kosten | Risiko | Aufwand |
|---|---|---|---|---|---|---|
| **C0** | TTL der Nutzeinträge auf 1 Tag, negative TTL auf 5 min | teilweise: wer den Namen im Speicher hat (fast alle Wiederkehrer), merkt Ausfälle bis ~1 Tag nicht | bleibt | 0 € | **gering**, jederzeit umkehrbar | 10 min im Spaceship-Panel |
| **C1** | Eigener „versteckter Primär" (signiert selbst, z. B. Knot DNS) + Hurricane Electric + Spaceship-unabhängige NS | voll | bleibt (neue Schlüssel, DS-Wechsel) | Rechenzeit auf Zeabur (unklar, ggf. > 0 €) + Betrieb | **hoch** (DS-Wechsel, eigener Dienst mit Port 53) | mehrere Arbeitsrunden |
| **C2** | Zone zu einem Anbieter mit eigenem Anycast-Netz und DNSSEC umziehen (z. B. deSEC), Spaceship bleibt nur Registrar | gegen *Spaceship*-Ausfall ja, aber wieder EIN Anbieter | ~4 Tage aus, dann neuer DS | 0 € | mittel–hoch (DS-Wechsel, Mail-Weiterleitung) | eine Arbeitsrunde |
| **C3** | Zwei Anbieter ohne DNSSEC (z. B. Spaceship-unabhängiger Primär + HE/1984 Sekundär) | voll | **fällt weg** | 0 € | mittel (Sicherheitsverlust) | eine Arbeitsrunde |
| **C4** | Multi-Signer nach RFC 8901 | voll | bleibt | 0 € | sehr hoch, zwei Anbieter müssen es können | — nicht verfügbar bei kostenlosen Anbietern |

## 3a. Ergebnis der Freigabe „C0 freigegeben" (23.09.2026, im Spaceship-Panel geprüft, NICHT ausgeführt)

- **Spaceship bietet als höchste TTL 60 min an** (Auswahl: 1, 5, 20, 30 = Standard, 60 min). Ein Tag ist dort nicht
  möglich — C0 schrumpft damit auf 30 → 60 min: halbe Wirkung von „ein Ausfall unter 30 min trifft nur einen Teil".
- **Keine Sammeländerung:** jede Zeile einzeln mit „Aktualisieren"; schon die erste löste die Warnung „Mit
  widersprüchlichem A-Eintrag aktualisieren?" aus (gemischte TTL innerhalb der vier A-Einträge), deren Knopf
  „Neuen Eintrag hinzufügen" heißt — unklar, ob er ändert oder dupliziert.
- **Entscheidung der Sitzung: abgebrochen** („Rückgängig machen"), weil 15 Einzelschritte mit Konfliktwarnung für
  +30 min Speicherzeit mehr Risiko als Nutzen sind. Zone nachweislich unverändert (Werte gleich, SOA-Serial 1789735811).
- **Neu gesehen, im Soll-Register bisher nicht geführt:** `cloud.smejj.com CNAME smejj-cloud.zeabur.app` (Standardgruppe)
  und `admin.smejj.com A 15.197.162.184` (Spaceship-URL-Weiterleitung, TTL 5 min). Die Spaceship-Weiterleitungsgruppe
  hält MX/SPF mit 20 min fest (nicht änderbar). Seit 23.09. in `DNS_SOLL` (Nr. 87 prüft beide mit).
- **Folge:** Echte Ausfallsicherheit gibt es nur mit C2 (Zone umziehen, Abschnitt 6). Solange Nr. 87 keine weiteren
  Ausfälle zählt, bleibt es beim Messen.

## 4. Empfehlung

1. **Jetzt C0** — der größte Gewinn für null Risiko. Der Vorfall vom 21.09. dauerte ~8 Minuten; mit 1 Tag TTL hätte
   fast kein wiederkehrender Nutzer etwas gemerkt. Nachteil: eine künftige bewusste Änderung an A/AAAA/CNAME braucht
   bis zu einem Tag, bis alle sie sehen → vor geplanten Umzügen TTL 24 h vorher wieder senken (steht im Ablauf).
2. **C2/C1 erst, wenn Nr. 87 in vier Wochen weitere Ausfälle zählt** (Empfehlung aus dem Vorschlag vom 21.09. bleibt).
   Dann C2 mit deSEC als nächstem Schritt — mit dem Ablauf in Abschnitt 6.
3. **C3 nicht** — DNSSEC aufzugeben wäre ein Sicherheitsrückschritt für ein Verfügbarkeitsproblem von Minuten.

## 5. Ablauf C0 (ausführungsreif, braucht nur die Freigabe)

**Vorher** (Sitzung): Zonen-Stand aus Abschnitt 1 gegen live vergleichen (`dig` wie unten); Nr. 87 grün.

**Betreiber im Spaceship-Panel** (Domain smejj.com → DNS-Einträge; Anmeldung macht der Betreiber selbst):
1. A (4×), AAAA (4×), CNAME api, CNAME www: TTL auf **86400** (1 Tag) bzw. den höchsten angebotenen Wert.
2. MX (2×), TXT (SPF, Google, DMARC), CAA: TTL auf **86400**.
3. Negative TTL/SOA-Minimum: falls einstellbar auf **300** (Tippfehler-Namen werden dann nicht eine Stunde lang
   als „gibt es nicht" gespeichert). Falls nicht einstellbar: so lassen.
4. **Nicht anfassen:** Nameserver, DNSSEC, Werte der Einträge.

**Danach** (Sitzung, lesend):
```
for t in A AAAA MX TXT CAA; do dig +noall +answer smejj.com $t @launch1.spaceship.net; done
dig +noall +answer api.smejj.com CNAME @launch1.spaceship.net
curl -s "https://dns.google/resolve?name=smejj.com&type=A" | grep -o '"AD":true'
```
Erwartet: gleiche Werte, TTL 86400, `"AD":true`. Nr. 87 (vergleicht nur Werte, nicht TTL) bleibt grün, `DNS_SOLL`
muss **nicht** geändert werden. Rückweg: TTL im Panel zurück auf 1800.

**Regel ab dann:** Vor jeder geplanten Wertänderung (z. B. GitHub-Pages-Adressen, Zeabur-Ziel) die TTL des
betroffenen Eintrags 24 h vorher auf 300 senken, danach wieder anheben.

## 6. Ablauf C2 (vorbereitet für später — Zone zu deSEC, Spaceship bleibt Registrar)

Zwei Anbieter, die nicht zusammenarbeiten, signieren mit **verschiedenen** Schlüsseln. Ein „Double-DS" allein
reicht dann nicht: ein Resolver mit dem alten DNSKEY-Satz im Speicher (TTL 3600) verwirft die Signaturen des neuen
Anbieters. Der sichere Weg ohne Multi-Signer ist darum eine **kurze Phase ohne DNSSEC** — die Domain bleibt dabei
jederzeit auflösbar, sie ist nur für einige Tage nicht signiert:

1. **Betreiber** legt das deSEC-Konto an (Konto-Anlage darf die Sitzung nicht) und legt die Domain smejj.com dort an.
2. **Sitzung** trägt über die deSEC-API (Token vom Betreiber in `~/.config/smejj.com/env.local`) alle 16 Nutzeinträge aus
   Abschnitt 1 ein und prüft sie direkt bei `ns1.desec.io`/`ns2.desec.org` (Werte 1:1, TTL 300 für die Umzugsphase).
3. **Bei Spaceship** bestätigen lassen, dass die Mail-Weiterleitung mit fremden Nameservern weiterläuft. Wenn nein:
   **Abbruch** vor Schritt 4, oder vorher eigene Mail-Lösung klären.
4. **DNSSEC aus (nur die Kette):** Betreiber entfernt bei Spaceship den DS 18410. Warten ≥ 2 Tage (DS-TTL bei .com
   1 Tag, doppelt). Prüfen: `dig DS smejj.com @a.gtld-servers.net` leer, dns.google Status 0 mit `"AD":false`.
   Nr. 87 meldet hier bewusst Rot („DNSSEC-Kette") — **vorher** als vorbereiteter Commit die AD-Prüfung für die
   Umzugsphase auf Gelb stellen.
5. **Nameserver-Wechsel:** Betreiber stellt bei Spaceship auf „Custom nameservers" `ns1.desec.io`, `ns2.desec.org`.
   Warten ≥ 2 Tage (Delegations-TTL 172800). Beide Anbieter liefern dieselben Werte, ungesigniert gültig.
6. **DNSSEC wieder an:** Betreiber trägt den DS von deSEC bei Spaceship ein. Prüfen: `"AD":true` bei dns.google.
7. **Aufräumen:** `DNS_SOLL.nameserver` in `dnsWacheAutopilot.js` und die Action `dns-wache.yml` auf deSEC, AD-Prüfung
   wieder streng, TTL wieder auf 86400; Spaceship-DNS-Zone erst danach leeren.
8. **Rückweg:** bis Schritt 5 genügt „DS wieder eintragen"; ab Schritt 5 Nameserver im Panel zurück auf Spaceship
   (die alte Zone dort bleibt bis Schritt 7 unverändert stehen).

Wer die Reihenfolge verkürzt (neuer DS oder neue Nameserver, solange der alte DS noch wirkt), macht smejj.com für alle
prüfenden Resolver (Google, Quad9, viele Mobilfunker) bis zu zwei Tage unauflösbar.

## 7. Was die Sitzung ohne Freigabe NICHT tut

Keine Änderung an Einträgen, TTL, Nameservern oder DNSSEC; keine Konto-Anlage bei deSEC/HE; kein neuer
kostenpflichtiger Dienst; kein Cloudflare. Freigabe für C0 genügt ein Satz, z. B. „C0 freigegeben" — die Klicks im
Spaceship-Panel macht der Betreiber (Anmeldung), die Messung davor und danach die Sitzung.
