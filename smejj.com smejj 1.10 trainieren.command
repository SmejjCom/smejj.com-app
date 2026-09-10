#!/bin/zsh
# smejj.com — smejj 1.10 trainieren
#
# DIE LETZTE OFFENE IDEE. Sechs Versionen sind an derselben Stelle gescheitert,
# und seit dem 10.09. ist gemessen, woran:
#
#            WISSEN (9 Gebiete)   KOENNEN (6 Gebiete)
#   1.4            -5,7                 +1,9
#   1.5            -9,2                 +0,1
#   1.6            -7,3                 +3,5
#   1.7            -9,5                 +3,4
#   1.8           -13,1                 +7,4
#   1.9            -6,6                 -2,2
#
# Fuenf von fuenf: das Wissen faellt, das Koennen steigt. Die Pruefung misst
# neun Wissens- gegen sechs Koennensgebiete — also gewinnt immer die nackte
# Basis, obwohl der Adapter beim Koennen deutlich besser ist.
#
# 1.9 hat den flacheren Eingriff versucht (halber Rang, ein Drittel Lernrate):
# das Vergessen halbierte sich, der Gewinn kippte ins Minus. Sackgasse.
#
# WAS 1.10 ANDERS MACHT: Von den 83 handgeschriebenen Paaren war kein einziges
# eine WISSENSfrage. Das Modell konnte ueber sein eigenes Projekt nur verlieren.
# Jetzt sind 50 Wissenspaare dabei — Namensregel, Trainingsdaten-Politik,
# Wissenskorpus, Leistungsbudgets, Architektur, Sicherheit. Also genau die
# sechs Gebiete, die am staerksten abstuerzen.
#
#   Datensatz     1.433 Paare (798 handgeschrieben = 56 %, 635 Rechnen = 44 %)
#   Gewichtung    wie 1.8 — dem Lauf mit dem besten Verhaeltnis
#   Rang/Lernrate wie 1.8 — 16 und 1e-4, damit nur EINE Sache anders ist
#
# DIE GRENZE: Diese Paare lehren die FAKTEN, nicht die Pruefung. Acht Tests
# pruefen, dass keine Frage aus der Suite stammt — woertlich und ueber die
# Wortueberlappung gegen alle 309 Faelle. Wer die Messlatte ins Training gibt,
# misst danach sich selbst.
#
# WENN DAS NICHT HILFT, ist die Idee widerlegt und nicht nur ungenau: dann
# liegt es an der Methode und nicht an den Daten.
#
# Reihe: 1.4 = 66,0 | 1.7 = 63,3 | 1.8 = 62,9 | 1.9 = 63,1 | Basis = 68,4

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "smejj 1.10 trainieren"
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
SMEJJ_KANDIDAT=smejj-1-10 SMEJJ_DATENSATZ=smejj-1-10 node scripts/training/smejj-1-1-trainieren.mjs --starten
START=$?

echo ""
echo "════════════════════════════════════════════════════════════════════════"
if [ $START -eq 0 ]; then
  echo "Training laeuft. Rund 90 Minuten, hoechstens 420."
  echo ""
  echo "Fortschritt:  SMEJJ_KANDIDAT=smejj-1-10 node scripts/training/smejj-1-1-trainieren.mjs --stand"
  echo ""
  echo "Danach messen mit der Datei 'smejj.com smejj 1.10 messen.command'."
else
  echo "NICHT gestartet (Ausstieg $START). Der Grund steht oben."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
