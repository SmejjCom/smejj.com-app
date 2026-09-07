#!/bin/zsh
# smejj.com — smejj 1.5 trainieren
#
# WAS SICH GEGENUEBER 1.4 GEAENDERT HAT — und nur das:
# 24 neue handgeschriebene Paare fuer genau die Gebiete, in denen 1.4 gegen das
# Basismodell verloren hat. Alles andere bleibt gleich (Rang 16, eine Epoche,
# dieselbe Bauweise), damit die Messung den Unterschied dem Datensatz zuordnen
# kann und nicht drei Aenderungen auf einmal.
#
# smejj 1.4 kam auf 66,0 % gegen Basis 68,4 % — 2,4 Punkte darunter.
# Die Reihe: 1.2 = 51,0  |  1.3 = 62,8  |  1.4 = 66,0.
#
# DIE WICHTIGSTE NEUERUNG ist inhaltlich, nicht mengenmaessig: 1.4 hat
# ZU VIEL verweigert. Es fiel bei Faellen durch, in denen die richtige Antwort
# JA lautet ("Darf auf Staging ohne Freigabe deployt werden?"). Die neuen Paare
# lehren deshalb UNTERSCHEIDEN statt Verweigern — sechs davon haben
# ausdruecklich ein Ja als richtige Antwort.
#
# Datensatz: datasets/smejj-1-5 (4.530 Paare, davon 76 handgeschrieben ganz am
# Anfang — train.py liest von vorne).
#
# KOSTEN: hoechstens rund 0,70 USD (420 Minuten Frist, 0,10 USD/h). Gemessen
# hat 1.4 etwa 90 Minuten gebraucht, also real unter 0,20 USD.
# Monatsdeckel 108 USD, verbraucht bisher unter 2 USD.

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "smejj 1.5 trainieren"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "SCHRITT 1 — ist die Gruppe frei?"
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

  if (["stopped", "failed", "fehlt"].includes(z.zustand)) { console.log("  Frei."); process.exit(0); }

  // Nur abschalten, was seine Arbeit ERLEDIGT hat. Ein laufender Lauf ist
  // bezahlte Zeit und wird nie angefasst.
  //
  // "fertig: true" allein genuegt dafuer NICHT — und daran ist der Klick vom
  // 07.09. gescheitert: Salad teilt einen beendeten Job neu zu, der neue
  // Durchlauf schreibt "fertig: false, Phase: laden" ueber den alten Status,
  // und der Zombie sieht in der Statusdatei exakt aus wie ein frischer Lauf.
  // Die Datei verweigerte daraufhin das Stoppen — und die Kostenschleife lief
  // weiter, waehrend das Training nicht startete.
  //
  // Das verlaessliche Kennzeichen ist das ERGEBNIS in der Ablage: eine
  // Bewertung (Messung) oder ein Adapter (Training). Wer sein Ergebnis
  // abgeliefert hat, ist fertig — egal was sein Herzschlag gerade behauptet.
  if (z.jobId) {
    const st = await e2.getJson(`con/logs/jobs/${z.jobId}/status.json`, null).catch(() => null);
    const bewertung = await e2.getJson(`smejj/bewertungen/${z.jobId}.json`, null).catch(() => null);
    const version = st?.version || st?.kandidat || null;
    const training = version ? await e2.getJson(`con/versions/${version}/training.json`, null).catch(() => null) : null;
    const ergebnisDa = Boolean(bewertung) || (training && training.jobId === z.jobId);

    if (st && st.fertig !== true && !ergebnisDa) {
      console.log(`  ABBRUCH: ${z.jobId} laeuft wirklich noch (Phase ${st.phase}, ${version || "?"}) und hat kein Ergebnis abgelegt.`);
      console.log("  Es wird nichts angefasst — das waere bezahlte Rechenzeit zum Fenster hinaus.");
      process.exit(3);
    }
    if (ergebnisDa && st?.fertig !== true) {
      console.log(`  ${z.jobId} hat sein Ergebnis laengst abgelegt (${bewertung ? "Bewertung" : "Adapter"}) und wurde von Salad nur neu zugeteilt.`);
      console.log("  Das ist die Kostenschleife, kein Lauf — sie wird beendet.");
    } else {
      console.log(`  ${z.jobId} ist fertig — die Gruppe darf abgeschaltet werden.`);
    }
  }
  const r = await client.stoppe();
  console.log(`  Stopp: ${r.ok ? "bestaetigt" : "ABGELEHNT"} (HTTP ${r.status})`);
  if (!r.ok) process.exit(4);
  for (let i = 0; i < 25; i += 1) {
    await new Promise((f) => setTimeout(f, 6000));
    const n = await s.gruppenZustand(client);
    if (["stopped", "failed", "fehlt"].includes(n.zustand)) { console.log(`  Gruppe ist ${n.zustand}.`); process.exit(0); }
    console.log(`  noch ${n.zustand} — warte (${i + 1}/25)`);
  }
  process.exit(5);
});'
FREI=$?
if [ $FREI -eq 3 ]; then
  echo ""; echo "Es laeuft noch etwas. Nichts wurde angefasst."; echo "Fenster kann geschlossen werden."; exit 3
fi

echo ""
echo "SCHRITT 2 — Training starten"
echo "────────────────────────────────────────────────────────────────────────"
SMEJJ_KANDIDAT=smejj-1-5 SMEJJ_DATENSATZ=smejj-1-5 node scripts/training/smejj-1-1-trainieren.mjs --starten
START=$?

echo ""
echo "════════════════════════════════════════════════════════════════════════"
if [ $START -eq 0 ]; then
  echo "Training laeuft. Rund 90 Minuten, hoechstens 420."
  echo ""
  echo "Fortschritt:  SMEJJ_KANDIDAT=smejj-1-5 node scripts/training/smejj-1-1-trainieren.mjs --stand"
  echo ""
  echo "Danach messen mit der Datei 'smejj.com smejj 1.5 messen.command'."
else
  echo "NICHT gestartet (Ausstieg $START). Der Grund steht oben."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
