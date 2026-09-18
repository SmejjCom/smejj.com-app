# DNS-Backup smejj.com — Stand 2026-09-18 (vor IPv6 und CAA)

Quelle: Spaceship Advanced DNS (eingeloggt abgelesen) und Live-Abfrage, 2026-09-18.
Anlass: Betreiber-Freigabe im Chat („DNS-Ergänzung (IPv6 + CAA) … mach komplett fertig").
Dieses Backup ist der Rückroll-Punkt: Es wird NICHTS geändert oder gelöscht, es kommen nur
neue Einträge dazu.

## Nameserver
- launch1.spaceship.net
- launch2.spaceship.net

## Gruppe „Email Forwarding Free" (von Spaceship verwaltet, 3 Einträge)
| Host | Typ | Wert | Prio | TTL |
|---|---|---|---|---|
| @ | MX | mx1.efwd.spaceship.net | 0 | 20 min |
| @ | MX | mx2.efwd.spaceship.net | 0 | 20 min |
| @ | TXT | v=spf1 include:spf.efwd.spaceship.net ~all | — | 20 min |

## Gruppe „URL Redirect" (1 Eintrag)
| Host | Typ | Wert | TTL |
|---|---|---|---|
| admin | A | 15.197.162.184 | 5 min |

## Gruppe „Default record group" (10 Einträge)
| Host | Typ | Wert | TTL |
|---|---|---|---|
| @ | A | 185.199.108.153 | 30 min |
| @ | A | 185.199.109.153 | 30 min |
| @ | A | 185.199.110.153 | 30 min |
| @ | A | 185.199.111.153 | 30 min |
| api | CNAME | smejj-control.zeabur.app | 30 min |
| cloud | CNAME | smejj-cloud.zeabur.app | 30 min |
| www | CNAME | smejjcom.github.io | 30 min |
| _dmarc | TXT | v=DMARC1; p=none; rua=mailto:s@smejj.com | 30 min |
| @ | TXT | google-site-verification=Ln-4qTMMVcSDj5Rcy5G8mR942wxH4Z1oyH7hQ1peopY | 30 min |
| @ | TXT | v=spf1 include:_spf.google.com ~all | 30 min |

Hinweis: In der Oberfläche stehen zwei SPF-Zeilen (Forwarding-Gruppe und Default-Gruppe).
Ausgeliefert wird live EINE zusammengeführte Zeile:
`v=spf1 include:spf.efwd.spaceship.net include:_spf.google.com ~all` — von Spaceship
zusammengesetzt. Deshalb nie eine der beiden von Hand „aufräumen".

## Ergänzt am 2026-09-18 (nur neu, nichts ersetzt)
| Host | Typ | Wert | Zweck |
|---|---|---|---|
| @ | AAAA | 2606:50c0:8000::153 | IPv6 für GitHub Pages |
| @ | AAAA | 2606:50c0:8001::153 | IPv6 für GitHub Pages |
| @ | AAAA | 2606:50c0:8002::153 | IPv6 für GitHub Pages |
| @ | AAAA | 2606:50c0:8003::153 | IPv6 für GitHub Pages |
| @ | CAA | 0 issue "letsencrypt.org" | nur Let's Encrypt darf Zertifikate ausstellen |

Die vier IPv6-Adressen sind die offiziellen von GitHub Pages, geprüft über
`dig AAAA smejjcom.github.io`. Let's Encrypt ist der Aussteller BEIDER heutigen Zertifikate
(smejj.com „YR2", api.smejj.com „YE1", gemessen am 2026-09-18).

## Was bewusst NICHT geändert wurde
**DMARC bleibt `p=none`.** Der Versand läuft über das kostenlose Gmail „Senden als"
(smtp.gmail.com:465, Absender s@smejj.com). Dabei bleibt der technische Absender
`gmail.com`, und es gibt keinen smejj.com-DKIM — die Prüfung „DMARC" schlägt damit
systembedingt fehl (belegt in `docs/mail/MAIL_SETUP_smejj.md`, Kopfzeilen-Messung
2026-07-03). Auf `p=quarantine` gestellt, landeten die eigenen Anmelde-Mails im Spam.
Sauber wäre ein eigener DKIM-Schlüssel — der braucht Google Workspace und damit eine neue
laufende Ausgabe, also eine Entscheidung des Betreibers.

## Rollback
Die fünf neuen Einträge in der Spaceship-Oberfläche löschen. Alles andere bleibt unberührt;
der Stand oben ist der Zustand davor.

## Ergebnis der Änderung (18.09.2026, live geprüft)

Eingetragen über die Spaceship-Oberfläche, alle fünf Einträge in der „Default record group"
(dort liegen auch die A-Einträge). Spaceship warnt beim Anlegen generisch vor „widersprüchlichen
AAAA-Einträgen", weil A und AAAA denselben Host tragen — genau so sieht es die
GitHub-Pages-Anleitung vor.

Direkt bei den Nameservern (launch1.spaceship.net) abgefragt:
- `AAAA smejj.com` → 2606:50c0:8000::153, :8001::153, :8002::153, :8003::153
- `CAA smejj.com` → `0 issue "letsencrypt.org"`
- Öffentlich über 8.8.8.8 ebenfalls sichtbar.

Unverändert nachgewiesen: 4 A-Einträge, MX (beide), SPF (zusammengeführt), DMARC (`p=none`),
google-site-verification, CNAME www/api/cloud, admin-Weiterleitung.

Nachkontrolle:
- `https://smejj.com/` weiterhin HTTP 200 (IPv4 und über die IPv6-fähige Anfrage).
- Zertifikate unverändert gültig, Aussteller weiterhin Let's Encrypt (smejj.com bis 25.11.2026,
  api.smejj.com bis 21.11.2026). Damit passt die CAA-Regel zu beiden Zertifikaten.
- `npm run verify:free-stack:live-dns` → **Live-DNS-Guard: OK**.
- Service Worker live unverändert v898 auf beiden Ursprüngen.

Nicht beweisbar von hier: ein echter IPv6-Abruf über eine IPv6-Leitung — der Mac hängt an einem
IPv4-Anschluss (die Anfrage lief über eine IPv4-abgebildete Adresse). Die eingetragenen Adressen
sind die offiziellen von GitHub Pages, geprüft per `dig AAAA smejjcom.github.io`.

**Wichtig für später:** Wechselt einer der Dienste den Zertifikat-Aussteller (z. B. Zeabur auf
eine andere CA), muss der CAA-Eintrag erweitert werden — sonst schlägt die Zertifikats-Erneuerung
fehl. Heute stellen beide über Let's Encrypt aus.
