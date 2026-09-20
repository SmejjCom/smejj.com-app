# muuny.com scharfschalten — die vier Schritte (Stand 20.09.2026)

Nichts davon ist passiert. `/opt/muuny/nginx/muuny.conf` liegt nur da.
Solange der DNS-Eintrag nicht umgestellt ist, aendert auch ein Einbau nichts
an dem, was Besucher sehen — con.ax bleibt in jedem Fall unberuehrt.

## 1. DNS bei Spaceship (macht der Betreiber)

muuny.com zeigt heute auf die Parkseite (34.216.117.25 / 54.149.79.189,
Nameserver launch1/launch2.spaceship.net).

| Typ | Name | Wert |
|---|---|---|
| A | `@` | `95.111.252.106` |
| A | `www` | `95.111.252.106` |

Danach ein bis zwei Stunden warten, bis es sich verbreitet hat. Pruefen:
`dig +short muuny.com A` muss 95.111.252.106 zeigen.

## 2. Netz: der nginx muss den Autopiloten erreichen

muuny-autopilot lauscht nur auf `127.0.0.1:8096` des Hosts — der nginx laeuft
aber in einem Container und kommt da nicht hin. Sauberster Weg: beide ins selbe
Docker-Netz, dann ruft nginx ihn beim Namen (`muuny-autopilot:8080`, so steht es
schon in muuny.conf).

```bash
NETZ=$(docker inspect conax-media-edge --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker network connect "$NETZ" muuny-autopilot
docker exec conax-media-edge getent hosts muuny-autopilot   # muss eine IP zeigen
```

## 3. Zertifikat holen (vor dem Einbau, sonst startet nginx nicht)

Die ACME-Ablage ist schon gemountet: `/opt/conax/deploy/contabo-core/letsencrypt`.

```bash
certbot certonly --webroot -w /opt/conax/deploy/contabo-core/letsencrypt \
  -d muuny.com -d www.muuny.com --agree-tos -m s@con.ax --non-interactive
cp /etc/letsencrypt/live/muuny.com/fullchain.pem /opt/conax/deploy/contabo-core/certs/muuny.crt
cp /etc/letsencrypt/live/muuny.com/privkey.pem  /opt/conax/deploy/contabo-core/certs/muuny.key
chmod 640 /opt/conax/deploy/contabo-core/certs/muuny.key
```

Erst wenn `muuny.crt` und `muuny.key` liegen, weiter mit Schritt 4 —
nginx verweigert sonst den Start und **con.ax waere mit unten**.

## 4. Einbauen

`core-edge.conf` ist con.ax' Produktivdatei; sie wird NICHT angefasst. Stattdessen
kommt muuny.conf als zweite Datei in `/etc/nginx/conf.d/` dazu. Dafuer braucht der
Container einen zusaetzlichen Mount, also einen Neustart — den einzigen Moment, in
dem con.ax kurz (wenige Sekunden) nicht erreichbar ist. Am besten nachts.

In der Compose-Datei von conax-media-edge ergaenzen:

```yaml
    volumes:
      - /opt/muuny/nginx/muuny.conf:/etc/nginx/conf.d/muuny.conf:ro
```

Dann:

```bash
docker compose -f <conax-compose> up -d conax-media-edge
docker exec conax-media-edge nginx -t     # MUSS "syntax is ok / test is successful" sagen
curl -s https://muuny.com/v1/alias | head
```

Geht etwas schief: den Mount wieder herausnehmen und `up -d` — con.ax ist dann
sofort wie vorher.

## Wenn es laeuft

`https://muuny.com/v1/alias` sagt, welche Gewichte gerade bedienen. Die Anwendung
fragt genau das und **nie** eine feste Versionsnummer. Jede beantwortete Anfrage
meldet sie per POST an `/v1/betrieb` zurueck — erst dadurch kann sich eine Canary
bewaehren und auf 100 Prozent gehen.
