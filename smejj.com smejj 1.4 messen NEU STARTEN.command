#!/bin/zsh
# smejj.com — die feststeckende Messung von smejj 1.4 abbrechen und neu starten
#
# WARUM: Der Messlauf smejj11-20260907014005 lief auf eine Frist zu, die er
# nicht halten kann. Dreimal gemessen wurde derselbe Knoten immer langsamer —
# 16,7 dann 23,1 dann 25,9 Sekunden je Antwort. Bei diesem Tempo braucht er
# 46 Minuten mehr, als ihm bleiben.
#
# Was dann passiert waere: der Basisstand wird fertig gemessen, der Kandidat
# zur Haelfte, dann Abbruch. KEINE Note fuer smejj 1.4 — aber die volle
# Rechnung. Ein halb gemessener Kandidat ist nichts wert.
#
# WAS DIESE DATEI TUT:
#   1. Den laufenden Messjob abbrechen (die Gruppe stoppen).
#   2. Neu starten, mit der auf 330 Minuten angehobenen Frist.
#
# Die neue Frist ist nachgerechnet, nicht geschaetzt: 590 Antworten x 26 s sind
# 256 Minuten, dazu bis zu 30 fuer das Holen des Modells aus e2. Bezahlt wird
# ohnehin nur die TATSAECHLICHE Zeit — eine grosszuegige Frist kostet nichts,
# eine zu knappe kostet den ganzen Lauf.
#
# KOSTEN: hoechstens rund 0,55 USD (330 min, 0,10 USD/h). Deckel 108 USD.

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "smejj 1.4 — Messung neu starten"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "SCHRITT 1 — den feststeckenden Lauf abbrechen"
echo "────────────────────────────────────────────────────────────────────────"

node -e '
Promise.all([
  import("./workers/con-autopilot/config.js"),
  import("./workers/con-autopilot/salad.js"),
  import("./workers/con-autopilot/e2.js"),
  import("./scripts/training/smejj-1-1-trainieren.mjs")
]).then(async ([c, s, e, t]) => {
  const konfig = t.trainingsKonfig(c.leseKonfig(process.env));
  const client = s.saladClient(konfig.salad);
  const e2 = e.e2Client(e.e2KonfigAusEnv(process.env));
  const z = await s.gruppenZustand(client);
  console.log(`  Gruppe: ${z.zustand}${z.jobId ? ` (${z.jobId}, ${z.modus || "?"})` : ""}`);

  if (["stopped", "failed", "fehlt"].includes(z.zustand)) {
    console.log("  Schon frei.");
    process.exit(0);
  }

  // NUR eine MESSUNG darf hier abgebrochen werden. Ein Trainingslauf ist
  // bezahlte Rechenzeit, die beim Abbruch verloren waere — und der Adapter
  // eines halb trainierten Laufs taugt nichts.
  if (z.modus && z.modus !== "messung") {
    console.log(`  ABBRUCH: in der Gruppe laeuft "${z.modus}", keine Messung. Es wird nichts angefasst.`);
    process.exit(3);
  }
  if (z.jobId) {
    const st = await e2.getJson(`con/logs/jobs/${z.jobId}/status.json`, null).catch(() => null);
    if (st) console.log(`  Stand: ${st.erledigt ?? "?"}/${st.von ?? "?"} Antworten in ${st.laufzeitMinuten ?? "?"} min — diese Arbeit ist verloren.`);
  }

  const r = await client.stoppe();
  console.log(`  Stopp: ${r.ok ? "bestaetigt" : "ABGELEHNT"} (HTTP ${r.status})`);
  if (!r.ok) process.exit(4);

  for (let i = 0; i < 25; i += 1) {
    await new Promise((f) => setTimeout(f, 6000));
    const n = await s.gruppenZustand(client);
    if (["stopped", "failed", "fehlt"].includes(n.zustand)) { console.log(`  Gruppe ist ${n.zustand} — frei.`); process.exit(0); }
    console.log(`  noch ${n.zustand} — warte (${i + 1}/25)`);
  }
  console.log("  Gruppe faehrt noch herunter.");
  process.exit(5);
});'
STOPP=$?
if [ $STOPP -eq 3 ]; then
  echo ""; echo "Es laeuft kein Messjob. Nichts wurde angefasst."; echo "Fenster kann geschlossen werden."; exit 3
fi

echo ""
echo "SCHRITT 2 — neu starten (Frist jetzt 330 statt 210 Minuten)"
echo "────────────────────────────────────────────────────────────────────────"
SMEJJ_KANDIDAT=smejj-1-4 node scripts/training/smejj-1-1-messen.mjs --starten
MESS=$?

echo ""
echo "════════════════════════════════════════════════════════════════════════"
if [ $MESS -eq 0 ]; then
  echo "Die Messung laeuft neu. Sie darf jetzt bis zu 330 Minuten brauchen."
  echo ""
  echo "Fortschritt:  node scripts/training/smejj-1-1-messen.mjs --stand"
else
  echo "NICHT gestartet (Ausstieg $MESS). Der Grund steht oben."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
