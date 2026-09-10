#!/bin/zsh
# smejj.com — smejj 1.11 trainieren: MEHR PLATZ
#
# Der Datensatz ist Zeichen fuer Zeichen derselbe wie bei 1.10. Geaendert ist
# eine einzige Zahl: Rang 32 statt 16. Damit hat der Adapter die doppelte
# Kapazitaet.
#
# WARUM — die Messung von 1.10 hat die eigentliche Ursache gezeigt:
#
#            WISSEN   KOENNEN   NOTE
#   1.8      -13,1     +7,4     62,9
#   1.9       -6,6     -2,2     63,1
#   1.10      -6,9     -2,5     63,2
#
# Drei voellig verschiedene Profile — dreimal dieselbe Note, alle innerhalb der
# Messschwankung von 0,4 Punkten.
#
# Die Wissenspaare haben genau getan, was sie sollten: Trainingsdaten-Politik
# 41,1 -> 57,8, Architektur 62,1 -> 78,8 (damit UEBER der Basis von 75,4),
# Schutz-Locks, Budgets, Kosten und Sicherheit je 6 bis 8 Punkte hoeher. Das
# Vergessen halbierte sich von -13,1 auf -6,9.
#
# Bezahlt wurde es woanders: Sprache -31, Modellwahl -16,7, Ehrlichkeit -15.
#
# Es wurde also nichts besser, sondern nur verschoben. Sieben Laeufe lang habe
# ich an den DATEN gedreht, und das Problem war nie in den Daten: Ein Adapter
# mit Rang 16 hat eine feste Kapazitaet. Jedes neue Wissen verdraengt anderes
# Koennen — ein Nullsummenspiel.
#
# WAS DIESER LAUF BEANTWORTET: Wenn die Note mit doppelter Kapazitaet steigt,
# war die Enge die Ursache und der Weg ist frei. Bleibt sie bei rund 63, ist
# die Methode am Ende und weitere Laeufe waeren verschwendetes Geld.
#
# Kosten: rund 0,30 USD, etwa 40 Minuten. Ein groesserer Adapter ist auch beim
# Antworten etwas langsamer — das faellt erst ins Gewicht, wenn er gewinnt.
#
# Reihe: 1.4 = 66,0 | 1.8 = 62,9 | 1.9 = 63,1 | 1.10 = 63,2 | Basis = 68,4

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "smejj 1.11 trainieren"
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
SMEJJ_KANDIDAT=smejj-1-11 SMEJJ_DATENSATZ=smejj-1-11 SMEJJ_RANG=32 node scripts/training/smejj-1-1-trainieren.mjs --starten
START=$?

echo ""
echo "════════════════════════════════════════════════════════════════════════"
if [ $START -eq 0 ]; then
  echo "Training laeuft. Rund 90 Minuten, hoechstens 420."
  echo ""
  echo "Fortschritt:  SMEJJ_KANDIDAT=smejj-1-11 node scripts/training/smejj-1-1-trainieren.mjs --stand"
  echo ""
  echo "Danach messen mit der Datei 'smejj.com smejj 1.11 messen.command'."
else
  echo "NICHT gestartet (Ausstieg $START). Der Grund steht oben."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
