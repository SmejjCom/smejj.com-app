# Codeberg-Spiegel (Stand 2026-07-29)

Rolle laut Master Prompt: **kostenlose, unabhängige Git-Spiegelung. Nur Spiegel,
nie primärer Deploy-Pfad. Keine kostenpflichtigen Zusatzdienste.**
Primär bleibt github.com Free.

## Was eingerichtet ist

Konto `smejj` auf codeberg.org hält fünf **private** Spiegel:

| Codeberg-Repo | Quelle | Wie der Spiegel entstand |
| --- | --- | --- |
| `smejj/smejj.com-app` | `SmejjCom/smejj.com-app` (privat) | Push aus der lokalen Arbeitskopie |
| `smejj/smejj-app-frontend` | `SmejjCom/smejj-app-frontend` | Migration + Push über Bare-Klon |
| `smejj/smejj-control` | `SmejjCom/smejj-control` | Migration + Push über Bare-Klon |
| `smejj/smejj-site` | `SmejjCom/smejj-site` | Migration + Push über Bare-Klon |
| `smejj/imild-site` | `SmejjCom/imild-site` | Migration + Push über Bare-Klon |

Alle fünf sind auf **privat** gesetzt. Grund siehe Abschnitt „Nutzungsbedingungen".

## Abgleich auffrischen

```bash
bash scripts/deploy/codeberg_spiegel_sync.sh
```

Modi: `alles` (Standard), `lokal` (nur dieses Repo), `github` (nur die vier
GitHub-Repos). Der Lauf ist beliebig oft wiederholbar; bereits gespiegelte
Stände melden `Everything up-to-date`.

## Vier Punkte, die beim Einrichten gemessen wurden

1. **Codeberg hat keinen Pull-Spiegel.** Im Migrations-Dialog
   (`/repo/migrate?service_type=1`) fehlt die Spiegel-Option vollständig — es gibt
   keinen automatischen Abgleich alle 8 Stunden. Ohne Skriptlauf altert der
   Spiegel. Das ist der Grund, warum es dieses Skript überhaupt gibt.
2. **SSH braucht den Schlüssel ausdrücklich.** `~/.ssh/codeberg_smejj_ed25519` ist
   im Konto registriert (`SHA256:c7vHhee…`), aber es gibt keine `~/.ssh/config`
   und keinen Agent-Eintrag. Ein nackter `ssh -T git@codeberg.org` scheitert mit
   `Permission denied (publickey)` — das sieht wie ein fehlender Schlüssel aus,
   ist aber nur eine fehlende Zuordnung. Das Skript setzt `GIT_SSH_COMMAND`
   selbst; `~/.ssh/config` bleibt bewusst unangetastet.
3. **Kein `git push --mirror`.** Ein beschädigtes Objekt in der Historie lässt
   `--mirror` und `gc` scheitern (siehe `docs/architecture/` GitHub-Kostenregel).
   Das Skript pusht Branches und Tags getrennt.
4. **`gh-pages` liegt nur bei origin**, nicht als lokaler Branch. Ein reiner
   `--all`-Push würde den Spiegel unvollständig lassen; das Skript spiegelt
   origin-only-Branches ausdrücklich mit.

## Nutzungsbedingungen (wichtig)

Codeberg hat die Terms of Use im Juli 2026 geändert:

* **„LLM-generated content is being restricted."** Projekte, die von LLM-Agenten
  autonom erstellt und mit starkem LLM-Einsatz gepflegt werden, können entfernt
  werden. Die Moderation arbeitet fallweise, nicht automatisiert.
* Kryptowährungs-Projekte sind vollständig untersagt (für smejj.com nicht
  relevant).

Für ein AI Coding OS ist die erste Klausel ein reales Restrisiko. Deshalb sind
alle Spiegel **privat**: sie verbrauchen keine öffentlichen Ressourcen der
FLOSS-Commons und sind damit die am wenigsten exponierte Variante. Der Master
Prompt macht die Spiegelung ohnehin davon abhängig, dass die Nutzungs- und
Open-Source-Bedingungen erfüllt sind — wird der Spiegel je auf öffentlich
gestellt, ist das eine Betreiber-Entscheidung mit dieser Klausel im Blick.

## Was bewusst nicht eingerichtet ist

* **Zwei-Faktor-Anmeldung** unter `codeberg.org/user/settings/security` — dafür
  ist das Konto-Passwort nötig, das ausschließlich der Betreiber eingibt.
* **Automatischer Zeitplan** für den Abgleich. Ein Cron- oder launchd-Eintrag
  wäre eine dauerhafte Systemänderung und braucht die ausdrückliche Freigabe des
  Betreibers. Bis dahin gilt: Skript nach größeren Änderungen laufen lassen.
