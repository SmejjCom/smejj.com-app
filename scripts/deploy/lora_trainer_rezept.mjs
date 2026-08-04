// smejj.com — Bauplan des Trainer-Containers (Abbild + Startbefehl).
//
// Eigenes Modul, weil ZWEI Skripte denselben Bauplan brauchen:
// create_lora_trainer_group.mjs (anlegen) und update_lora_trainer_bundle.mjs
// (erneuern). Zwei Kopien waeren zwei Staende, die auseinanderlaufen — und der
// Unterschied faellt erst auf der gemieteten Karte auf.
//
// ═══ DIE TEUERSTE LEHRE DIESES DIENSTES ═══
//
// Bis zum 2026-08-03 lief hier das Abbild pytorch/pytorch:2.4.0 und der
// Startbefehl installierte torch==2.6.0 per pip DARUEBER. Das ist nie
// gutgegangen und hat vier Fehlersuchen gekostet, weil jede Ebene einen
// anderen Fehler zeigte:
//
//   1. ungepinntes transformers  -> "cannot import name 'DTensor'"
//   2. torchvision 0.19 vs 2.6   -> "operator torchvision::nms does not exist"
//   3. gemischte Installation    -> "cannot import name 'get_proxy_mode'"
//   4. dieselbe Ursache          -> "No module named 'torch._C._dynamo.guards'"
//
// Der Beweis stand am 2026-08-03 in /diagnose, und er ist eindeutig:
//   importlib.metadata.version("torch") == "2.6.0"   (was pip geschrieben hat)
//   torch.__version__                  == "2.4.0"   (was wirklich geladen wird)
//
// pip legt die Metadaten der neuen Fassung ab, kann die conda-Installation des
// Abbilds aber nicht sauber entfernen. Zurueck bleibt eine MISCHUNG: neue
// Python-Dateien neben alten Binaerteilen (torch._C). Die meldet sich nicht als
// kaputt, sondern mit wechselnden, sinnlosen Importfehlern tief in fremden
// Bibliotheken — man sucht dann bei transformers, bitsandbytes und torchvision
// nach einem Fehler, der im eigenen Startbefehl steht.
//
// MERKREGEL: Die torch-Fassung gehoert ins ABBILD, nie in den Startbefehl.
// Ein Abbild ist der einzige Ort, an dem torch, torchvision und die CUDA-
// Bibliotheken garantiert zueinander passen.
//
// Deshalb jetzt: Abbild mit torch 2.6.0 + cuda 12.4 (bringt torchvision 0.21.0
// passend mit), und per pip kommen NUR noch die leichten Pakete dazu, die kein
// eigenes CUDA mitbringen.

/**
 * Abbild mit torch 2.6.0. Qwen3 verlangt transformers>=4.51, das wiederum
 * torch>=2.5 (torch.distributed.tensor) — die Fassung ist damit nicht frei
 * waehlbar, sondern vom Basismodell vorgegeben.
 *
 * Laufzeit-Abbild (kein devel): 3,3 GB statt ueber 7 GB. Die Ladezeit ist auf
 * Salad die knappe Ressource, nicht der Plattenplatz.
 */
export const ABBILD = process.env.SMEJJ_TRAINER_ABBILD
  || "docker.io/pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime";

/**
 * Nur noch die Aufsatz-Pakete. torch und torchvision stehen BEWUSST NICHT hier
 * — sie kommen aus dem Abbild. Wer sie hier wieder einträgt, baut die
 * Mischinstallation von neuem.
 *
 * Kohaerenter Stand vom April 2025, gegen torch 2.6 gebaut.
 */
export const PAKETE = Object.freeze([
  "transformers==4.51.3",
  "peft==0.15.2",
  "accelerate==1.6.0",
  "bitsandbytes==0.45.5",
  "safetensors>=0.4.5"
]);

/**
 * Startbefehl. Reihenfolge ist der Kern: auspacken, HTTP-Server SOFORT starten,
 * die Zusatzpakete erst danach im Hintergrund nachziehen. Der Dienst antwortet
 * damit binnen Sekunden auf /health, lange bevor das Modell bereit ist — und
 * faellt so nicht aus Salads Startsonde heraus.
 */
export function startBefehl() {
  const skript = [
    "set -eu",
    // bash -l setzt PATH ueber /etc/profile zurueck; /opt/conda/bin (python3,
    // pip im pytorch-Abbild) muss danach wieder vorn stehen.
    'export PATH="/opt/conda/bin:$PATH"',
    "mkdir -p /app",
    "cd /app",
    'printf %s "$SMEJJ_TRAINER_BUNDLE_B64" | base64 -d | tar xzf -',
    "cd /app/smejj-lora-trainer",
    'if [ "${SMEJJ_TRAINER_MODUS:-attrappe}" = "echt" ]; then',
    // gcc, gemessen am 2026-08-03: bitsandbytes zieht beim Import triton, und
    // triton uebersetzt sich beim ersten Zugriff ein kleines CUDA-Hilfsmodul
    // SELBST — zur Laufzeit, nicht beim Bauen. Im -runtime-Abbild fehlt dafuer
    // der Uebersetzer, und der Import endet mit
    // "RuntimeError: Failed to find C compiler."
    // Sichtbar wird das erst tief in transformers als
    // "Failed to import transformers.integrations.bitsandbytes".
    //
    // Die Alternative waere das -devel-Abbild (rund 7 statt 3,3 GB). Ein
    // apt-Paket von etwa 50 MB ist der guenstigere Weg: die Ladezeit ist auf
    // Salad die knappe Ressource.
    // `|| true` ist hier keine Schlamperei, sondern Pflicht: `set -e` gilt auch
    // in dieser Unterschale. Ohne die Auffangklausel beendet ein fehlgeschlagenes
    // apt (kein Netz zu den Ubuntu-Quellen, gesperrter Spiegel) die Unterschale
    // SOFORT — pip liefe nie, die Markerdatei entstuende nie, und laufwerk.py
    // wartete die vollen 30 Minuten, bevor es ueberhaupt einen Fehler meldet.
    // Faellt gcc aus, greift stattdessen der bf16-Ersatzweg in motor.py.
    "  ( apt-get update -qq > /tmp/apt.log 2>&1 || true;"
      + " apt-get install -y -qq --no-install-recommends gcc >> /tmp/apt.log 2>&1 || true;",
    // Exit-Code als Markerdatei: laufwerk.py wartet darauf, bevor es die
    // Pakete importiert. Ohne den Marker verliert der Import den Wettlauf
    // gegen pip (gemessen 2026-08-03: ModuleNotFoundError: transformers).
    //
    // --no-deps NICHT setzen: transformers braucht tokenizers und huggingface-hub.
    // Stattdessen haelt die Zeile darunter torch fest — pip darf die Fassung
    // aus dem Abbild unter keinen Umstaenden ersetzen, sonst entsteht wieder
    // die Mischinstallation.
    `    pip install --no-cache-dir 'torch==2.6.0' ${PAKETE.map((p) => `'${p}'`).join(" ")}`
      + " > /tmp/pip.log 2>&1; echo $? > /tmp/smejj-pip.rc ) &",
    "fi",
    "exec python3 server.py"
  ].join("\n");
  return ["bash", "-lc", skript];
}
