# Task Capsule — job_lora_trainer_dauerbetrieb_20260803

**Status:** in Arbeit — Fix deployed (Salad-Gruppe Version 16), Laufzeitbeweis steht aus.
**Rollback:** `backups/salad/smejj-lora-trainer-2026-08-03-vor-sonden.json` plus
`CONFIRM_TRAINER_GROUP=YES` mit dem Stand vor diesem Commit.

## Ziel

smejj 1.0 im Dauerbetrieb 24/7 trainieren lassen. Der eine ungeloeste Fehler:
Trainer-Container laeuft, Gateway antwortet dauerhaft HTTP 503. Zwei Hypothesen
waren bereits widerlegt (Token-Budget, fehlende Sonde).

## Befund (Container-Protokoll aus dem Salad-Portal, 2026-08-03 05:57 UTC)

Erstmals das Portal-Protokoll gelesen (Tab "Container Logs", Zeitraum 1 day) —
es zeigt die Wurzel eindeutig, ZWEI Fehler uebereinander:

1. **Pip-Wettlauf.** Der Server startete korrekt ("hoert auf 0.0.0.0:8080
   (modus=echt)") — die PATH-Hypothese aus dem Vorfenster ist damit widerlegt.
   Direkt danach: `laufwerk.py:62 lade_basismodell` → `motor.py:32` →
   `from transformers import …` → **ModuleNotFoundError: No module named
   'transformers'** → `ladezustand=fehler`. Der Startbefehl installiert die
   torch-Pakete im **Hintergrund** (`pip install … &`), waehrend der
   Hintergrund-Lader sofort importiert. Der Import verliert den Wettlauf immer.
2. **IPv4-Bind.** Auch mit lebendem Prozess und `/health`=200 von innen blieb
   das Gateway 503 und die Instanz pendelte `running → creating`. Gleiche
   Wurzel wie beim Sprachserver (Control v103, bewiesen): Salads Gateway und
   Sonden sprechen **nur IPv6**, der Server band `0.0.0.0` (nur IPv4).

## Umsetzung

- `workers/smejj-lora-trainer/server.py` — Dual-Stack-Bind: `SMEJJ_HOST`
  Standard `::`, `DualStackServer` (AF_INET6, `IPV6_V6ONLY=0`); bei IPv4-Host
  weiter das alte Verhalten.
- `workers/smejj-lora-trainer/laufwerk.py` — `_warte_auf_pakete()`: wartet vor
  dem Motor-Import auf die Markerdatei `/tmp/smejj-pip.rc` (Exit-Code der
  Hintergrund-Installation), neuer Ladezustand `wartet-auf-pakete`; pip-Fehler
  wird als `fehler:pip-exit=N: <pip.log-Schwanz>` sichtbar. Ohne Marker (alter
  Startbefehl) nach Frist ehrlicher Importversuch statt stummen Haengens.
- `scripts/deploy/create_lora_trainer_group.mjs` — Startbefehl schreibt den
  Marker (`( pip install … ; echo $? > /tmp/smejj-pip.rc ) &`), `SMEJJ_HOST="::"`,
  PATH-Export dokumentiert uebernommen.

## Verifikation

1. Lokal: Dual-Stack bedient 127.0.0.1 UND ::1 (beide 200, gemessen).
2. Lokal: Marker-Logik — pip-exit=7 → `fehler:pip-exit=7`; Marker 0 → Import
   laeuft an; kein Marker → nach Frist Importversuch (3 Faelle gemessen).
3. Pflichtpruefungen gruen: check:guidelines, check:lora-loop (52 Tests),
   check:training-loop, check:architecture.
4. Deploy: `CONFIRM_TRAINER_GROUP=YES SMEJJ_TRAINER_MODUS=echt
   SMEJJ_LORA_BASIS_HF_REPO=Qwen/Qwen3-8B IDRIVE_E2_MODEL_BUCKET=smejj-model-files
   node scripts/deploy/create_lora_trainer_group.mjs` → Version 16,
   zurueckgelesen: `SMEJJ_HOST="::"`, Marker im Befehl, Sonden unveraendert da.
5. Laufzeit: Selbst-Stopp-Waechter aktiv (60 min ohne /health=200 → Gruppe
   stoppen, als Code). Gateway-Monitor laeuft. ERGEBNIS: (offen)

## Messfallen dieses Fensters

- Bündellaenge ist KEIN Inhaltsbeweis: altes und neues Buendel haben exakt
  13656 base64-Zeichen (tar-Blockpadding). Inhalt nur per Entpacken/Laufzeit
  pruefbar.
- Salad-Ruecklesen direkt nach PATCH zeigt noch den ALTEN Stand (verzoegerte
  Konsistenz) — erst nach ~20 s gegenlesen.
- Portal-Logs koennen HISTORISCH abgefragt werden (1 day) — der Trainer muss
  fuer die Diagnose nicht laufen. Das widerlegt die Annahme aus dem Vorfenster.

## Offen / Betreiber

- Zeabur `smejj-training-loop`: IDRIVE_E2_ACCESS_KEY, IDRIVE_E2_SECRET_KEY,
  SMEJJ_LORA_TRAINER_KEY ergaenzen + REDEPLOY (nur Betreiber; ohne sie startet
  die Schleife fail-closed keinen Zyklus).
- ZEABUR_API_TOKEN in ~/.config/smejj.com/env.local (fuer Bridge-Deploys).
