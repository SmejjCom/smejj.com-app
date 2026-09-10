#!/bin/zsh
# smejj.com — smejj 1.4 messen (und die fertige Trainingsgruppe abschalten)
#
# WARUM DIESE DATEI: Das Training von smejj 1.4 ist am 07.09. um 01:33 UTC
# fertig geworden — 564 von 564 Schritten, alle 4.506 Beispiele, ohne Fehler.
# Salad hat die Instanz danach aber NEU ZUGETEILT: der Job startet wieder,
# stellt fest, dass er fertig ist, endet nach vier Minuten — und Salad startet
# ihn erneut. Diese Schleife kostet rund 0,10 USD je Stunde fuer nichts.
#
# Schritt 1 stoppt die Gruppe. Schritt 2 startet die Messung: Basismodell OHNE
# Adapter und smejj 1.4 MIT Adapter, in EINEM Lauf gegen die breite Suite
# (295 Faelle). Zwei getrennte Laeufe waeren billiger, aber der Vergleich waere
# wertlos — dieselbe Suite streut zwischen Knoten um bis zu 130 Sekunden je
# Antwort, und der Unterschied landete faelschlich beim Adapter.
#
# KOSTEN: hoechstens rund 0,35 USD (210 Minuten Frist, 0,10 USD/h).
# Der Monatsdeckel liegt bei 108 USD; verbraucht sind bisher unter 1 USD.

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "smejj 1.4 messen"
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
    // DIE VERSION AUS DREI QUELLEN, nicht nur aus dem Status.
    //
    // Am 10.09. hat diese Zeile den Messstart blockiert: Salad hatte den
    // fertigen Trainingsjob neu zugeteilt, der neue Durchlauf schrieb
    // "Phase start" ueber den alten Status — und in dieser fruehen Phase steht
    // die Version noch nicht drin. Ohne Version kein Blick in die Ablage, ohne
    // Blick kein Ergebnis, und der erledigte Job galt als laufend.
    //
    // Der Kandidat, den wir gleich messen wollen, ist die dritte und
    // verlaesslichste Quelle: er kommt aus der Umgebung und nicht aus einer
    // Datei, die der Zombie gerade ueberschreibt.
    const kandidaten = [st?.version, st?.kandidat, process.env.SMEJJ_KANDIDAT].filter(Boolean);
    let training = null;
    for (const v of kandidaten) {
      const t = await e2.getJson(`con/versions/${v}/training.json`, null).catch(() => null);
      if (t && t.jobId === z.jobId) { training = t; break; }
    }
    const ergebnisDa = Boolean(bewertung) || Boolean(training);

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
echo "SCHRITT 2 — Messung starten (Basis nackt gegen smejj 1.4 mit Adapter)"
echo "────────────────────────────────────────────────────────────────────────"
SMEJJ_KANDIDAT=smejj-1-4 node scripts/training/smejj-1-1-messen.mjs --starten
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
  echo "   SMEJJ_KANDIDAT=smejj-1-4 node scripts/training/smejj-1-1-messen.mjs --bewerten <Job-Kennung>"
else
  echo "Die Messung wurde NICHT gestartet (Ausstieg $MESS). Der Grund steht oben."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
