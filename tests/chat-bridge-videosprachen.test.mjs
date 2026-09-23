// smejj.com — Video-Auftraege in allen 15 Sprachen (Befund 23.09.2026: "Haz un
// video de un faro rojo" fiel live in die Textspur, das Modell sagte "No puedo
// crear vídeos").
import test from "node:test";
import assert from "node:assert/strict";
import { erkenneBildAuftrag, erkenneVideoAuftrag } from "../public/chat-bridge-bilder.js";
import { istWeltVideoAuftrag } from "../public/chat-bridge-bildsprachen.js";

const VIDEO_AUFTRAEGE = {
  es: ["Haz un video de un faro rojo junto al mar", "Crea un vídeo de un gato en la luna"],
  fr: ["Fais une vidéo d'un phare rouge", "Génère une vidéo d'un chat sur la lune"],
  it: ["Fammi un video di un faro rosso", "Crea un video di un gatto"],
  pt: ["Faça um vídeo de um farol vermelho", "Crie um vídeo de um gato"],
  tr: ["Kırmızı bir deniz feneri videosu yap", "Bir kedi videosu oluştur"],
  ru: ["Сделай видео с красным маяком", "Создай видео про кота"],
  ar: ["اصنع فيديو لمنارة حمراء", "أنشئ فيديو لقطة"],
  hi: ["लाल लाइटहाउस का वीडियो बनाओ", "बिल्ली का वीडियो बनाइए"],
  bn: ["একটি লাল বাতিঘরের ভিডিও বানাও", "বিড়ালের ভিডিও তৈরি করো"],
  id: ["Buat video mercusuar merah", "Buatkan video kucing di bulan"],
  ja: ["赤い灯台の動画を作って", "猫のビデオを生成して"],
  ko: ["빨간 등대 동영상을 만들어 줘", "고양이 영상을 생성해 주세요"],
  zh: ["生成一个红色灯塔的视频", "帮我制作一段猫的动画"]
};

const KEINE_VIDEOS = [
  "Fais-moi un résumé de cette vidéo",
  "Resume este video de YouTube, por favor",
  "Haz un resumen del vídeo https://youtu.be/abc",
  "Traduce los subtítulos de este video",
  "Qu'est-ce qu'une vidéo 4K ?",
  "Сделай краткое резюме видео",
  "この動画を要約して",
  "总结一下这个视频",
  "이 영상 요약해 줘",
  "Buat ringkasan video ini",
  "Crea una tabla con los datos",
  "Dibuja una manzana roja"
];

test("jede der 13 weiteren Sprachen bestellt ein Video", () => {
  for (const [sprache, saetze] of Object.entries(VIDEO_AUFTRAEGE)) {
    for (const satz of saetze) {
      assert.equal(istWeltVideoAuftrag(satz), true, `${sprache}: ${satz}`);
      assert.equal(erkenneVideoAuftrag(satz), satz, `Video-Spur ${sprache}: ${satz}`);
    }
  }
});

test("Auftraege UEBER Videos (Zusammenfassung, Uebersetzung, Link, Frage) erzeugen KEIN Video", () => {
  for (const satz of KEINE_VIDEOS) assert.equal(erkenneVideoAuftrag(satz), "", `darf NICHT: ${satz}`);
});

test("Deutsch und Englisch bleiben wie bisher, Bild-Auftraege bleiben Bilder", () => {
  assert.equal(erkenneVideoAuftrag("Mach ein Video von einer Katze"), "Mach ein Video von einer Katze");
  assert.equal(erkenneVideoAuftrag("Make a video of a cat"), "Make a video of a cat");
  assert.equal(erkenneVideoAuftrag("Dessine une pomme rouge"), "");
  assert.equal(erkenneBildAuftrag("Dessine une pomme rouge"), "Dessine une pomme rouge");
});
