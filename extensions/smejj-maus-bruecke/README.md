# smejj.com Maus-Bruecke (Chrome-Erweiterung)

Damit die Maus **den echten Chrome des Betreibers** bedienen kann — fuer Seiten,
die nur dort angemeldet sind. Der eigene Browser der Maus im Serverraum bleibt
der Normalweg.

## Warum eine Erweiterung und NICHT `--remote-debugging-port`

Ein Chrome mit offenem Debug-Port nimmt Befehle von **jedem** lokalen Programm
entgegen und kennt **keine** Herkunftspruefung. Wer ihn oeffnet, gibt in einem
Zug alle angemeldeten Konten frei — Mail, Bank, Code-Hosting, alles zugleich.
Das ist der klassische Amateurfehler und hier ausdruecklich verboten.

Diese Erweiterung kann nur, was der Betreiber **je Herkunft sichtbar erlaubt**
hat, und nur die fuenf Aktionen, die die Maus-Engine ueberhaupt schickt.

## Die vier Schranken (alle muessen zustimmen)

1. **Domain-Allowlist des Plans** — im Interpreter, unveraendert fuer beide
   Adapter (`workers/maus-engine/allowlist.mjs`).
2. **Freigegebene Herkunft** — `chrome-befehl.mjs`, `herkunftFreigegeben()`.
3. **Chromes eigener Berechtigungsdialog** — `chrome.permissions.request()`
   laeuft direkt auf den Klick des Betreibers.
4. **Ablauf** — jede Freigabe endet nach 30 Minuten von selbst.

## Was die Bruecke bewusst NICHT kann

| gesperrt | Grund |
| --- | --- |
| Passwortfelder beschreiben | Die Maus tippt nie ein Geheimnis in fremdem Chrome. |
| Secrets aus dem Vault | Geheimnisse verlassen die Engine nicht. |
| Cookies / `storageState` | Im eigenen Browser ein Werkzeug, hier ein Leck. |
| Dateien hoch-/herunterladen | Kein Zugriff auf das Dateisystem des Betreibers. |
| `evaluate` / Skripttext | Genau die Hintertuer, die dieser Weg vermeidet. |
| `http://` | Im angemeldeten Browser waere das ein Klartext-Leck. |
| xpath-Selektoren | Greifen zu leicht quer durch fremde Dokumente. |

Alles davon scheitert **ehrlich** mit `chrome_adapter_kann_nicht: ...` statt
halb zu laufen.

## Installieren (lokal, unverpackt)

1. Chrome → `chrome://extensions` → Entwicklermodus an
2. „Entpackte Erweiterung laden" → diesen Ordner waehlen
3. Auf der Zielseite auf das Symbol klicken → „Für 30 Minuten erlauben"

## Stand

Die Erweiterung und der Adapter (`workers/maus-engine/adapters/`) sind gebaut
und getestet (`tests/maus-chrome-adapter.test.mjs`, 13 Tests). **Offen bleibt
der Transportweg** zwischen Maus-Engine im Serverraum und diesem Chrome: er
braucht einen Endpunkt am Control-Server, und dessen Deploy endet in einem
Env-Schreibzugriff, der fuer den Agenten gesperrt ist. Der Adapter nimmt den
Transport deshalb als injizierte Abhaengigkeit (`transport.senden`) — sobald
der Weg offen ist, wird nur noch dieser eine Baustein eingesetzt, ohne dass
sich am Tor etwas aendert.
