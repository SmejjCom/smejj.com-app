// smejj.com — Ende-zu-Ende-Probe der Video-Spur OHNE Zeabur und ohne Anmeldung.
//
// Warum es diesen Test gibt (2026-08-12): Die Videospur laesst sich sonst erst
// beweisen, wenn der Zeabur-Dienst smejj-video-worker existiert — und der
// braucht eine Betreiber-Freigabe. Ohne Probe waere bis dahin ungeprueft, ob
// die Spur den Strom richtig fuehrt. Dieser Test stellt einen echten
// HTTP-Worker daneben, der exakt so antwortet wie workers/smejj-video-worker,
// und laesst die ECHTE streamBilderLane dagegen laufen.
//
// Gemessen wird, was der Nutzer merken wuerde: uebernimmt die Spur, kommen
// Fortschritts-Ereignisse, steht am Ende ein data:video-Markdown, wird der
// Strom sauber geschlossen — und faellt die Spur ehrlich zurueck, wenn der
// Worker Unsinn liefert.
//
// Der Worker-URL muss VOR dem Import stehen: das Modul liest die Umgebung
// beim Laden (Konstante VIDEO_WORKER_URL), nicht bei jedem Aufruf.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Kleinstes gueltiges MP4 waere aufwendig zu erzeugen — fuer die Spur zaehlt
// nur die Antwortform (die echte Kodierung prueft video-worker.test.mjs).
const MP4_B64 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28y";

let worker;
let workerPort = 0;
let antwortModus = "ok";
let letzterPrompt = "";
let streamBilderLane;

before(async () => {
  worker = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, bereit: antwortModus !== "schlaeft" }));
    }
    if (req.url === "/erzeuge" && req.method === "POST") {
      let body = "";
      req.on("data", (stueck) => (body += stueck));
      return req.on("end", () => {
        letzterPrompt = JSON.parse(body || "{}").prompt || "";
        res.writeHead(antwortModus === "fehler" ? 500 : 200, { "Content-Type": "application/json" });
        if (antwortModus === "urlschmuggel") {
          // Ein kompromittierter Worker koennte eine fremde Adresse schicken.
          return res.end(JSON.stringify({ ok: true, video_url: "https://boese.example/spur.mp4" }));
        }
        res.end(JSON.stringify({ ok: antwortModus === "ok", format: "mp4", b64: MP4_B64 }));
      });
    }
    res.writeHead(404).end();
  });
  await new Promise((fertig) => worker.listen(0, "127.0.0.1", fertig));
  workerPort = worker.address().port;
  process.env.SMEJJ_VIDEO_WORKER_URL = `http://127.0.0.1:${workerPort}`;
  ({ streamBilderLane } = await import("../public/chat-bridge-bilder.js"));
});

after(() => worker?.close());

/** Antwort-Attrappe, die den SSE-Strom mitschreibt wie die App ihn liest. */
function sammelAntwort() {
  return {
    ereignisse: [],
    inhalt: "",
    beendet: false,
    writeHead(code, kopf) {
      this.code = code;
      this.kopf = kopf;
    },
    write(stueck) {
      for (const zeile of String(stueck).split("\n")) {
        if (!zeile.startsWith("data: ")) continue;
        const rest = zeile.slice(6);
        if (rest === "[DONE]") {
          this.ereignisse.push({ typ: "DONE" });
          continue;
        }
        const daten = JSON.parse(rest);
        if (daten.smejj_schritt) this.ereignisse.push({ typ: "schritt", ...daten.smejj_schritt });
        if (daten.choices) this.inhalt += daten.choices[0].delta.content;
      }
    },
    end() {
      this.beendet = true;
    }
  };
}

const DEPS = {
  corsHeaders: () => ({ "Access-Control-Allow-Origin": "https://smejj.com" }),
  securityHeaders: () => ({ "X-Content-Type-Options": "nosniff" }),
  timeoutMs: 20000
};

describe("Video-Spur Ende-zu-Ende (echter Worker-Ersatz, echte streamBilderLane)", () => {
  it("liefert ein data:video-Markdown und schliesst den Strom", async () => {
    antwortModus = "ok";
    const res = sammelAntwort();
    const uebernommen = await streamBilderLane(res, {}, "Erstelle ein Video von einem fliegenden Adler", DEPS);

    assert.equal(uebernommen, true, "Spur muss den Auftrag uebernehmen");
    assert.equal(res.code, 200);
    assert.equal(res.kopf["x-smejj-profile"], "video-erzeugung");
    assert.ok(res.inhalt.includes("data:video/mp4;base64,"), "Antwort traegt kein Video");
    assert.equal(res.beendet, true, "Strom wurde nicht geschlossen");
    assert.ok(letzterPrompt.length > 0, "Worker bekam keinen Prompt");
  });

  it("meldet dem Nutzer den Fortschritt (nicht im Antworttext)", async () => {
    antwortModus = "ok";
    const res = sammelAntwort();
    await streamBilderLane(res, {}, "generiere ein kurzes Video über den Ozean", DEPS);

    const schritte = res.ereignisse.filter((e) => e.typ === "schritt");
    assert.ok(schritte.length >= 2, "zu wenige Fortschritts-Ereignisse");
    assert.ok(schritte.every((s) => s.art === "video"), "Ereignisart muss video sein");
    assert.equal(schritte.at(-1).zustand, "fertig");
    // Der Fortschritt darf den Antworttext nicht verschmutzen.
    assert.ok(!res.inhalt.includes("wird generiert"), "Fortschritt steht faelschlich im Text");
    assert.equal(res.ereignisse.at(-1).typ, "DONE");
  });

  it("faellt ehrlich zurueck, wenn der Worker versagt — nie stumm", async () => {
    antwortModus = "fehler";
    const res = sammelAntwort();
    const uebernommen = await streamBilderLane(res, {}, "Erstelle ein Video von einem Segelboot", DEPS);

    assert.equal(uebernommen, true);
    assert.ok(!res.inhalt.includes("data:video"), "kaputte Antwort darf kein Video ergeben");
    assert.ok(res.inhalt.length > 0, "der Nutzer darf nie eine leere Antwort bekommen");
    assert.equal(res.beendet, true);
  });

  it("reicht NIE eine fremde Adresse aus der Worker-Antwort durch", async () => {
    antwortModus = "urlschmuggel";
    const res = sammelAntwort();
    await streamBilderLane(res, {}, "Erstelle ein Video von einer Katze", DEPS);

    assert.ok(!res.inhalt.includes("boese.example"), "fremde Adresse ist in die Antwort gelangt");
    assert.ok(!res.inhalt.includes("http"), "Antwort darf keine externe Quelle tragen");
  });

  it("laesst Bild-Auftraege unberuehrt (Videospur greift nicht daneben)", async () => {
    antwortModus = "ok";
    const res = sammelAntwort();
    // Ohne Bild-Maler und ohne Groq-Schluessel gibt die Bildspur ab (false),
    // damit der Text-Weg uebernimmt — sie darf NICHT im Video-Zweig landen.
    const uebernommen = await streamBilderLane(res, {}, "Zeichne ein Bild von einem Hund", DEPS);
    assert.equal(uebernommen, false, "Bild-Auftrag wurde faelschlich als Video behandelt");
    assert.equal(res.inhalt, "");
  });
});
