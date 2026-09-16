# Medien-System (Stand 17.09.2026)

Betreiber-Auftrag 17.09.2026: Bilder, Videos, Audio, PDFs und andere Chat-Dateien sollen so professionell funktionieren wie bei den großen Plattformen. Private Dateien dürfen nie öffentlich werden, und alte Links müssen weiter funktionieren.

## Ablauf

```
Chat-HTML ──► Medien-Kennung (<sha256[:40]>.<endung>)
                │
                ▼
POST /api/chat-medien/zugang  (Sitzung wird geprüft)
                │
                ▼
https://api.smejj.com/medium/<AES-GCM-Token>  (30–60 min gültig)
                │
                ▼
IDrive e2: chat-medien/<konto>/<kennung>[.vorschau.webp]

Bewusst nach außen teilen:
Kennung ──► POST /api/chat-medien/teilen ──► https://api.smejj.com/m/<16 Zeichen Zufall>
            (widerrufbar, Ablauf 24 h / 7 T / 30 T / nie, auf Wunsch nur einmal öffnen)
```

## Bausteine

| Datei | Aufgabe |
|---|---|
| `control-server/src/chats/medienStore.js` | Positivliste der Typen und Prüfung der Dateikennung. Upload roh (bis 25 MB) oder alt als data:-URL. Range-Anfragen, Vorschaubild, Löschen. |
| `control-server/src/chats/medienZugang.js` | Signierte Anzeige-Adresse. Der Inhalt ist verschlüsselt, sie läuft ab, und der Schlüssel wird per HMAC aus `SMEJJ_SESSION_SECRET` abgeleitet. |
| `control-server/src/chats/medienTeilen.js` | Teilen-Links: Zufalls-Token, Widerruf, Ablauf, Nutzungsgrenze. Vorschau-Roboter zählen nicht als Aufruf. |
| `control-server/src/chats/medienAufraeumen.js` | Löscht Medien ohne Chat. Nur was kein Chat des Kontos mehr erwähnt, Papierkorb eingeschlossen. Fail-closed. |
| `control-server/src/routes/chatMedienRoutes.js` | Alle Routen und Sicherheitsköpfe. |
| `public/chat-medien.js` | Auslagern (roh plus WebP/JPEG-Vorschau) und Anzeigen über Anzeige-Adressen. Rückfall auf den alten fetch-Weg. |
| `public/chat-medien-ansicht.js` | Vollbild, Herunterladen, Teilen-Blatt (als Datei teilen, Link erstellen, Links widerrufen). |

## Schutz

- **Aufzählen von IDs:** Die Kennung ist ein 160-Bit-Hash unter der Kontokennung. Teilen-Tokens haben rund 95 Bit. Fehltreffer werden gebremst (30 in 10 min, danach 429).
- **Directory Traversal:** Pfade entstehen nur aus Kennungen, die exakt geprüft sind (`kontoGueltig`, `kennungGueltig`, `tokenGueltig`).
- **Unberechtigter Zugriff:** Das Konto kommt aus der Sitzung oder aus dem verschlüsselten Token, nie aus der Anfrage.
- **Hotlinking:** Private Medien tragen `Cross-Origin-Resource-Policy: same-site`, und die Anzeige-Adresse läuft ab.
- **Manipulierte Endungen und falsche MIME-Types:** Der Typ kommt aus der Positivliste, der Inhalt muss zur Dateikennung passen, dazu `nosniff`.
- **SVG/HTML-XSS:** Diese Typen sind nicht erlaubt. Jede Medienantwort trägt `Content-Security-Policy: default-src 'none'; sandbox`, PDFs kommen als `attachment`.
- **Sehr große Dateien:** Roh bis 25 MB (Vorschau bis 2 MB). Der Rumpf wird abgebrochen statt gepuffert, Antwort 413.
- **Cache-Leaks:** Private Medien haben `private, max-age ≤ Restlaufzeit`, Teilen-Links `no-store`. Die `/api/`-Antworten liefert der Service Worker nie aus seinem Cache.
- **Malware:** Nur Bild-, Video-, Audio- und PDF-Formate. Ausführbare Dateien und Skripte scheitern an der Positivliste und an der Prüfung der Dateikennung.
- **Weitergabe privater Medien:** Kopieren, Teilen und Export ersetzen interne Adressen durch [Bild]/[Video]. Ein Link entsteht nur ausdrücklich.

## Alte Medien

`GET /api/chat-medien?id=…` mit Bearer-Token und der data:-URL-Upload bleiben unverändert. Gespeicherte Chats tragen weiter `…/api/chat-medien?id=…`. Neue und alte Clients lesen beides.

## Tests

- `tests/medien-system.test.mjs` (Server, echter HTTP-Server mit Objektspeicher-Attrappe)
- `tests/medien-client.test.mjs` (Browser-Seite)
