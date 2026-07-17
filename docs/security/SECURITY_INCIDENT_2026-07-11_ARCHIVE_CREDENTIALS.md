# Sicherheitsvorfall 2026-07-11: Archiv- und Sitzungszugänge

Status: lokal eingedämmt; Live-Patch, Zugangsrotation und Versionsbereinigung ausstehend  
Produktionsfreigabe: gesperrt  
Training und Capture: gesperrt

## Befund

Ein älteres, von einer lokalen Arbeitssitzung erzeugtes Rollback-Archiv im
Google-Drive-synchronisierten Workspace enthielt versehentlich `.env.local`.
Zusätzlich war `.env.local` selbst als eigenständige Google-Drive-Datei im
Projekt synchronisiert. Die eingebettete Datei war zum Prüfzeitpunkt bytegleich
mit dieser lokalen Datei.
Zusätzlich wurden beim Prüfen der angemeldeten Salad-Konfiguration aktive
Secret-Werte in einer internen Werkzeugsitzung sichtbar. In diesem Dokument,
im Repository und in Task Capsules werden keine Werte wiedergegeben.

Betroffen und deshalb vorsorglich zu ersetzen sind mindestens:

- der lokale, für Modell-/Object-Storage verwendete IDrive-e2-Prinzipal;
- der produktive IDrive-e2-Prinzipal des Control Servers;
- das produktive Session-Secret einschließlich daraus abgeleiteter Schlüssel;
- die im Control Server konfigurierten Z.ai-, Kimi-, Salad- und
  Remote-Browser-Zugänge, sofern deren Werte in der Portalansicht sichtbar
  waren.

## Durchgeführte Eindämmung

- Die vier bekannten unsicheren Archivkopien wurden aus dem synchronisierten
  Workspace beziehungsweise aus temporären Arbeitsverzeichnissen in ein
  lokales Sicherheits-Quarantäneverzeichnis verschoben. Verzeichnisrechte sind
  `0700`, Dateirechte `0600`; die Originalbytes wurden nicht vernichtet.
- Das synchronisierte Rollback-Archiv wurde aus dem unveränderten Original neu
  erstellt, wobei `.env.local` ausgeschlossen wurde. Es enthält als einzige
  Env-Datei `.env.example` und ist auf `0600` gesetzt. SHA-256:
  `39ef8bfbfdbaefbb50eedf6c64666f9d494f9ca8fdbab00fbff4c393d00c1ae7`.
- Die aktive Secret-Datei wurde unverändert nach
  `~/.config/smejj.com/env.local` außerhalb des synchronisierten Projekts
  verschoben; Verzeichnisrecht ist `0700`, Dateirecht `0600`. Der Workspace
  enthält keine `.env.local` mehr.
- Control Server, Smoke-Test, Deploy- und Modellverwaltungswerkzeuge laden den
  sicheren Standardpfad beziehungsweise einen absoluten
  `SMEJJ_LOCAL_ENV_FILE`-Override und nie mehr automatisch Workspace-Env-Dateien.
- `scripts/check-backup-archives.mjs` blockiert künftig private `.env*`-Dateien,
  Credential-Pfade, Pfadtraversal sowie AppleDouble-Einträge in allen
  `backups/**/*.tar.gz` und `backups/**/*.tgz`.
- Positive und negative Regressionstests sind Bestandteil von
  `check:security` und damit von `check:all`.

## Zusätzlicher Live-Befund

Die produktive Route `/api/workers/salad/status` akzeptierte am 2026-07-11
weiterhin einen anonymen Request mit HTTP 200. Der Response-Body wurde bewusst
nicht abgerufen oder protokolliert. Der aktive Control Server besitzt nach der
read-only Portal-Inventur aktuell keinen Salad-Management-Key; dadurch ist eine
vollständige Providerantwort momentan wahrscheinlich nicht verfügbar. Die
fehlende Authentifizierung bleibt trotzdem ein P0-Risiko, weil eine spätere
Konfigurationsänderung die Ausgabe ohne weiteren Codewechsel erweitern könnte.

Der lokale Patch liefert anonym `401`, authentifiziert exakt neun erlaubte
Felder und setzt in beiden Fällen `Cache-Control: private, no-store`. Das
reproduzierbare RC2-Archiv hat SHA-256
`e03be8bb798d95dc494fc3a8fda58c99953faa8b0336a469d9889c3ff0afe691`.
Es enthält neun Backend-/Bootstrap-Dateien, kein Frontend, keine Secrets und
keine Produktionskonfiguration. Es ist noch nicht deployt.

Zusätzlich sind GitHub-Schreib-Token-Ausgabe, Push/Draft-PR-Publishing und die
neue per-Job-Ephemeral-Worker-Erstellung lokal hart gesperrt. Private
Repository-Clones können nur ein repository-begrenztes Read-Token erhalten;
historische Worker-Recovery und Stop bleiben verfügbar. Diese lokale Sperre
ersetzt weder Credential-Rotation noch den ausstehenden Produktionspatch.

Google Drive listet die frühere eigenständige `.env.local` aktuell weder im
Projekt noch über die geprüfte Papierkorbsuche. Das ist eine aktuelle
Zugriffsbeobachtung, kein Beweis für die endgültige Löschung aller
Providerkopien oder Revisionen.

## Verbindlicher Abschlussablauf

Der Vorfall gilt erst als geschlossen, wenn alle folgenden Schritte in dieser
Reihenfolge nach separater schriftlicher Freigabe durchgeführt wurden:

1. neue Least-Privilege-Zugänge parallel erzeugen, ohne die alten zu löschen;
2. RC2 mit getrennten, wertlosen Zugängen in Salad-Staging ausrollen;
3. Storage-Read/Write, Auth, Agent, Chat, Browser, Jobs, Watchdog und Rollback in Staging
   vollständig prüfen;
4. nach separater schriftlicher Produktionsfreigabe RC2 ausrollen und anonymen
   Zugriff mit `401` oder `403` verifizieren;
5. Produktionskonfiguration in einem kontrollierten Wartungsfenster umstellen;
6. Session-Neuanmeldung und alle abhängigen Health-/E2E-Prüfungen bestätigen;
7. alte IDrive-, Z.ai-, Kimi-, Salad-, Browser-, Callback- und Worker-Zugänge
   invalidieren und Old-key-fail nachweisen;
8. die unsichere Google-Drive-Dateiversion und lokale Quarantänekopien erst nach
   dokumentierter Freigabe löschen;
9. abschließend nachweisen, dass IDrive-e2-Recovery-Artefakte, Task Capsules und
   Git-Veröffentlichungen keine private Env-Datei enthalten.

Bis dahin darf keine Dokumentation `100 % Schutz`, vollständige
Credential-Eindämmung oder Produktionsfreigabe behaupten. Der Code kann lokal
verifiziert werden; produktive Geheimnisse bleiben ein eigener Release-Stopper.
