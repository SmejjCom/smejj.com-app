#!/bin/zsh
# smejj.com — smejj 1.8 messen
#
# Misst das Basismodell OHNE Adapter und smejj 1.8 MIT Adapter in EINEM Lauf
# gegen die breite Suite (295 Faelle, also 590 Antworten). Zwei getrennte Laeufe
# waeren billiger, aber wertlos: dieselbe Suite streut zwischen Knoten um mehr
# als das Doppelte, und der Unterschied landete faelschlich beim Adapter.
#
# WAS ZUR DEBATTE STEHT: 1.8 ist die erste Version, bei der nicht der INHALT
# der Paare geaendert wurde, sondern ihr GEWICHT. Die 83 handgeschriebenen
# Paare sind sechsfach wiederholt, die Rechenaufgaben von 4.454 auf 631
# gesenkt: aus 1,8 % handgeschrieben wurden 44 %.
#
# Vier Laeufe lang stieg bei jeder Inhaltsaenderung ein Gebiet und zwei fielen.
# Wenn dieselben Paare mit 44 % Gewicht dasselbe tun, liegt es nicht am
# Gewicht — dann fehlen schlicht echte Paare.
#
# Trainiert: 142 Schritte, 1.129 Beispiele, Loss 1,40 (echt, nicht 0.000).
#
# Reihe bisher:  1.4 = 66,0 | 1.5 = 62,6 | 1.6 = 64,9 | 1.7 = 63,3 | Basis = 68,0
#
# SCHRITT 1 schaltet die Trainingsgruppe ab, wenn sie ihre Arbeit erledigt hat.
# "Erledigt" heisst: das Ergebnis liegt in der Ablage (Adapter oder Bewertung) —
# NICHT, was der Herzschlag behauptet. Salad teilt fertige Jobs neu zu, und ein
# solcher Zombie sieht wie ein laufender Lauf aus.
#
# KOSTEN: hoechstens rund 0,55 USD (330 Minuten Frist, 0,10 USD/h).

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "smejj 1.8 messen"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "SCHRITT 1 — die fertige Trainingsgruppe abschalten"
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
  console.log(`  Gruppe ${konfig.salad.gruppe}: ${z.zustand}${z.jobId ? ` (Job ${z.jobId}, ${z.modus || "?"})` : ""}`);

  if (["stopped", "failed", "fehlt"].includes(z.zustand)) {
    console.log("  Schon frei — nichts zu stoppen.");
    process.exit(0);
  }

  // SICHERHEITSPRUEFUNG: nur stoppen, wenn der Job WIRKLICH fertig ist.
  // Einen laufenden Trainingslauf zu beenden hiesse, bezahlte Rechenzeit
  // wegzuwerfen. Der Herzschlag des Jobs entscheidet, nicht der Gruppenzustand.
  // "fertig: true" allein genuegt NICHT: Salad teilt beendete Jobs neu zu, und
  // der neue Durchlauf schreibt "fertig: false, Phase: laden" ueber den alten
  // Status. Ein solcher Zombie sieht aus wie ein frischer Lauf und hat am
  // 07.09. einen Betreiber-Klick blockiert, waehrend die Kostenschleife weiterlief.
  // Verlaesslich ist das ERGEBNIS in der Ablage, nicht der Herzschlag.
  if (z.jobId) {
    const st = await e2.getJson(`con/logs/jobs/${z.jobId}/status.json`, null).catch(() => null);
    const bewertung = await e2.getJson(`smejj/bewertungen/${z.jobId}.json`, null).catch(() => null);
    const version = st?.version || st?.kandidat || null;
    const training = version ? await e2.getJson(`con/versions/${version}/training.json`, null).catch(() => null) : null;
    const ergebnisDa = Boolean(bewertung) || (training && training.jobId === z.jobId);

    if (st && st.fertig !== true && !ergebnisDa) {
      console.log(`  ABBRUCH: Job ${z.jobId} laeuft wirklich noch (Phase ${st.phase}) und hat kein Ergebnis abgelegt.`);
      console.log("  Es wird nichts gestoppt — ein laufender Lauf ist bezahlte Rechenzeit.");
      process.exit(3);
    }
    if (ergebnisDa && st?.fertig !== true) {
      console.log(`  Job ${z.jobId} hat sein Ergebnis abgelegt und wurde nur neu zugeteilt — Kostenschleife, kein Lauf.`);
    } else {
      console.log(`  Job ${z.jobId} ist fertig (ok=${st?.ok}) — die Gruppe darf abgeschaltet werden.`);
    }
  }

  const r = await client.stoppe();
  console.log(`  Stopp: ${r.ok ? "bestaetigt" : "ABGELEHNT"} (HTTP ${r.status})`);
  if (!r.ok) process.exit(4);

  for (let i = 0; i < 20; i += 1) {
    await new Promise((f) => setTimeout(f, 6000));
    const n = await s.gruppenZustand(client);
    if (["stopped", "failed", "fehlt"].includes(n.zustand)) {
      console.log(`  Gruppe ist jetzt ${n.zustand} — keine GPU-Zeit mehr.`);
      process.exit(0);
    }
    console.log(`  noch ${n.zustand} — warte (${i + 1}/20)`);
  }
  console.log("  Gruppe faehrt noch herunter. Das Messen wartet, bis sie frei ist.");
  process.exit(5);
});'
STOPP=$?

if [ $STOPP -eq 3 ]; then
  echo ""
  echo "Es laeuft noch ein Trainingslauf. Nichts wurde angefasst."
  echo "Fenster kann geschlossen werden."
  exit 3
fi

echo ""
echo "SCHRITT 2 — Messung starten (Basis nackt gegen smejj 1.8 mit Adapter)"
echo "────────────────────────────────────────────────────────────────────────"
SMEJJ_KANDIDAT=smejj-1-8 node scripts/training/smejj-1-1-messen.mjs --starten
MESS=$?

echo ""
echo "════════════════════════════════════════════════════════════════════════"
if [ $MESS -eq 0 ]; then
  echo "Die Messung laeuft. Sie dauert 90 bis 200 Minuten."
  echo ""
  echo "Fortschritt ansehen:"
  echo "   node scripts/training/smejj-1-1-messen.mjs --stand"
  echo ""
  echo "Danach die Noten rechnen (die Job-Kennung steht oben):"
  echo "   SMEJJ_KANDIDAT=smejj-1-8 node scripts/training/smejj-1-1-messen.mjs --bewerten <Job-Kennung>"
else
  echo "Die Messung wurde NICHT gestartet (Ausstieg $MESS). Der Grund steht oben."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
