// smejj.com — Apple-Richtlinie 3.1.1: kein Kauf-Hinweis in der iOS-Huelle.
//
// BEFUND 21.09.2026 (beim Aufarbeiten der Apple-Ablehnung gefunden): Der
// Konto-Bereich "Mein Plan" zeigte drei Abos mit Preis und dem Knopf
// "Zahlungspflichtig abonnieren", der zu Stripe weiterleitet. Eine iOS-App
// darf weder Preise fuer digitale Inhalte nennen noch auf einen Bezahlweg
// ausserhalb von Apples In-App-Kauf verweisen — auch nicht ueber einen Link.
// Dazu kam ein Widerspruch zu unseren Anmerkungen fuer die App-Pruefung
// ("no in-app purchases, no subscriptions"), den ein Pruefer als Falschangabe
// werten kann. Betreiber-Freigabe am selben Tag: in der iOS-Huelle ausblenden,
// im Web unveraendert lassen.
//
// Der Waechter prueft die WIRKUNG am erzeugten Markup, nicht die Schreibweise
// der Weiche — und bekommt nach der Hausregel beide Proben: iOS (nichts darf
// nach Kauf aussehen) und Web (alles muss da sein, sonst haette der Umbau
// still den Verkauf abgeschaltet).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const QUELLE = fs.readFileSync("public/account-privacy.js", "utf8");
const LANDESEITE = fs.readFileSync("public/willkommen.html", "utf8");
const PROGRAMMIEREN = fs.readFileSync("public/programmieren.html", "utf8");
const WEICHE_SEITE = fs.readFileSync("public/ios-preise-aus.js", "utf8");
const SW = fs.readFileSync("public/sw.js", "utf8");

/** Die Weiche und den Kauf-Teil aus der Quelle holen und ausfuehrbar machen. */
function ladeKaufTeil({ ios }) {
  const weiche = QUELLE.match(/function iosHuelle\(\) \{[\s\S]*?\n\}/)[0];
  const kauf = QUELLE.match(/function planKaufTeil\(\) \{[\s\S]*?\n\}/)[0];
  // dataAction steht auf EINER Zeile — ein gieriges [\s\S] zog sonst den halben
  // Rest der Datei mit hinein (gemessen: ReferenceError KONTO_STIL_MARKE).
  const dataAction = QUELLE.match(/^function dataAction\(.*$/m)[0];
  // t() gibt den deutschen Quelltext zurueck (wie im Browser ohne Uebersetzung).
  const kopf = `const t = (s) => s;
    const window = ${ios ? '{ Capacitor: {} }' : "{}"};
    const navigator = { userAgent: ${ios ? '"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"' : '"Mozilla/5.0 (X11; Linux x86_64)"'}, platform: ${ios ? '"iPhone"' : '"Linux x86_64"'} };
    const document = {};`;
  return new Function(`${kopf}\n${weiche}\n${dataAction}\n${kauf}\nreturn planKaufTeil();`)();
}

test("iOS-Huelle: kein Preis, kein Kaufknopf, kein fremder Bezahlweg", () => {
  const markup = ladeKaufTeil({ ios: true });
  for (const verboten of ["9 €", "19 €", "39 €", "Zahlungspflichtig abonnieren", "Stripe", "planPlusOpen", "planProOpen", "planMaxOpen"]) {
    assert.ok(!markup.includes(verboten), `in der iOS-Huelle darf "${verboten}" nicht vorkommen`);
  }
  // Auch kein Ersatz-Hinweis wie "buche auf unserer Website" — das waere nach
  // 3.1.1 wieder eine Handlungsaufforderung zu einem fremden Bezahlweg. Ein
  // LINK ist der deutlichste Fall und darf hier gar nicht vorkommen.
  assert.ok(!/<a\s/i.test(markup), `kein Link im Plan-Bereich der Huelle: ${markup}`);
  assert.ok(!/buch|website|im browser|am computer|abonnier/i.test(markup),
    `kein Verweis auf einen anderen Kaufweg: ${markup}`);
  assert.match(markup, /kostenlos/, "der Plan-Status bleibt erklaert");
});

test("Web: der Verkauf bleibt vollstaendig erhalten", () => {
  // Die GESUNDE Probe. Ohne sie wuerde ein Umbau, der den Verkauf ueberall
  // abschaltet, unbemerkt durchgehen — teurer Fehler als die Ablehnung.
  const markup = ladeKaufTeil({ ios: false });
  for (const noetig of ["9 €", "19 €", "39 €", "Zahlungspflichtig abonnieren", "planPlusOpen", "planProOpen", "planMaxOpen", "Widerrufsbelehrung"]) {
    assert.ok(markup.includes(noetig), `im Web muss "${noetig}" erhalten bleiben`);
  }
});

test("die Weiche ist fail-closed", () => {
  const weiche = QUELLE.match(/function iosHuelle\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(weiche, /catch\s*\{[\s\S]*?return true/, "wirft die Pruefung, wird versteckt — nicht gezeigt");
  assert.match(weiche, /window\.Capacitor/, "die Capacitor-Bruecke ist das sichere Signal");
  assert.match(weiche, /iPad\|iPhone\|iPod/, "ein WKWebView ohne Bruecke sieht aus wie Safari — iOS zaehlt mit");
  assert.match(weiche, /ontouchend/, "iPadOS meldet sich als Macintosh");
});

test("das Plan-Panel benutzt die Weiche, statt den Kauf-Teil doppelt zu pflegen", () => {
  assert.match(QUELLE, /\$\{planKaufTeil\(\)\}/, "das Panel ruft den Kauf-Teil auf");
  assert.match(QUELLE, /\$\{iosHuelle\(\) \? "" : `<button id="planManageOpen"/,
    "auch das Abo-Portal (Stripe) darf in der Huelle nicht erscheinen");
  // Der Kuendigungsweg bleibt: Apple stoert sich am Kauf, nicht am Beenden.
  assert.match(QUELLE, /id="planCancelOpen"/, "der Kuendigungsknopf bleibt in beiden Huellen");
});

// --- Die oeffentlichen Seiten --------------------------------------------------
//
// BEFUND 21.09.2026 (Parallelsitzung, am iPhone-Simulator belegt): Der
// Konto-Bereich war sauber, aber ein App-Pruefer ist ABGEMELDET und sieht als
// erstes die Landeseite. Dort standen "Preise" in der Kopfnavigation, ein
// grosser Knopf "Preise ansehen" und der ganze Abschnitt mit 0/9/19/39 EUR.
// Derselbe Verstoss, eine Seite frueher — und prominenter.

test("Landeseite: JEDER Preis liegt im ausgeblendeten Abschnitt", () => {
  // Die Wirkung, nicht die Schreibweise: ein neuer Preis ausserhalb von
  // #preise wuerde hier auffallen, auch wenn der Abschnitt markiert bleibt.
  const anfang = LANDESEITE.indexOf('<section id="preise"');
  const ende = LANDESEITE.indexOf("</section>", anfang);
  assert.ok(anfang > 0 && ende > anfang, "der Preis-Abschnitt muss existieren");
  assert.match(LANDESEITE.slice(anfang, anfang + 80), /data-nur-web/,
    "der Preis-Abschnitt muss in der iOS-Huelle verschwinden");
  const davor = LANDESEITE.slice(0, anfang);
  const danach = LANDESEITE.slice(ende);
  for (const teil of [davor, danach]) {
    const treffer = teil.match(/[0-9]+(&nbsp;| )€/g) || [];
    assert.deepEqual(treffer, [], `Preis ausserhalb des ausgeblendeten Abschnitts: ${treffer.join(", ")}`);
  }
});

test("Landeseite: auch die Wege zum Preis-Abschnitt sind markiert", () => {
  // Ein sichtbarer Link auf einen unsichtbaren Anker ist schlimmer als keiner:
  // der Pruefer tippt und landet nirgends.
  for (const zeile of LANDESEITE.split("\n")) {
    if (!zeile.includes('href="#preise"')) continue;
    assert.match(zeile, /data-nur-web/, `Link auf #preise ohne data-nur-web: ${zeile.trim()}`);
  }
  for (const zeile of PROGRAMMIEREN.split("\n")) {
    if (!zeile.includes("willkommen.html#preise")) continue;
    assert.match(zeile, /data-nur-web/, `Link auf #preise ohne data-nur-web: ${zeile.trim()}`);
  }
});

test("die Weiche der Seiten laeuft SYNCHRON und ist fail-closed", () => {
  // Mit defer oder als Modul liefe sie erst nach dem Parsen — die Preise waeren
  // fuer einen Moment sichtbar und stuenden im Video des Pruefers.
  for (const [name, seite] of [["willkommen.html", LANDESEITE], ["programmieren.html", PROGRAMMIEREN]]) {
    const tag = seite.split("\n").find((z) => z.includes("ios-preise-aus.js"));
    assert.ok(tag, `${name} laedt die Weiche nicht`);
    assert.ok(!/defer|async|type="module"/.test(tag), `${name}: die Weiche darf nicht aufgeschoben werden: ${tag.trim()}`);
    assert.match(seite, /html\[data-huelle="ios"\] \[data-nur-web\]/, `${name} braucht die CSS-Regel`);
  }
  assert.match(WEICHE_SEITE, /catch[\s\S]{0,80}ios = true/, "wirft die Pruefung, wird versteckt");
  assert.match(WEICHE_SEITE, /window\.Capacitor/);
  assert.match(WEICHE_SEITE, /iPad\|iPhone\|iPod/);
  assert.match(WEICHE_SEITE, /ontouchend/);
});

test("die Weiche steht in BEIDEN Offline-Listen", () => {
  // cache.addAll ist alles oder nichts: fehlt die Datei in einer Liste, laedt
  // der Service Worker sie nie — oder installiert sich gar nicht erst (v857).
  const treffer = SW.match(/"\/assets\/ios-preise-aus\.js"/g) || [];
  assert.equal(treffer.length, 2, `erwartet 2 Eintraege, gefunden ${treffer.length}`);
});
