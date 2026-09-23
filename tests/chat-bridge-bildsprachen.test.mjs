// smejj.com — Mal-Auftraege in allen 15 Oberflaechensprachen (Befund 23.09.2026:
// "Dessine une pomme rouge" fiel live in die Textspur).
import test from "node:test";
import assert from "node:assert/strict";
import { erkenneBildAuftrag } from "../public/chat-bridge-bilder.js";
import { istWeltMalAuftrag } from "../public/chat-bridge-bildsprachen.js";

const MAL_AUFTRAEGE = {
  fr: ["Dessine une pomme rouge", "Dessine-moi un mouton", "Génère une image d'un chat sur la lune"],
  es: ["Dibuja una manzana roja", "Dibújame un gato", "Crea una imagen de un faro al atardecer"],
  it: ["Disegna una mela rossa", "Genera un'immagine di un gatto", "Fammi un disegno di una casa"],
  pt: ["Desenhe uma maçã vermelha", "Crie uma imagem de um farol", "Desenha-me um cão"],
  tr: ["Kırmızı bir elma çiz", "Bir kedi resmi oluştur", "Bana bir ev çizer misin"],
  ru: ["Нарисуй красное яблоко", "Создай картинку с котом", "Нарисуйте дом у моря"],
  ar: ["ارسم تفاحة حمراء", "أنشئ صورة لقطة"],
  hi: ["एक लाल सेब का चित्र बनाओ", "बिल्ली की तस्वीर बनाइए"],
  bn: ["একটি লাল আপেল আঁকো", "একটা বিড়ালের ছবি বানাও"],
  id: ["Gambarkan apel merah", "Buatkan gambar kucing di bulan"],
  ja: ["赤いリンゴを描いて", "猫の画像を生成して"],
  ko: ["빨간 사과를 그려줘", "고양이 이미지를 만들어 주세요"],
  zh: ["画一个红苹果", "帮我画一只猫", "生成一张猫的图片"]
};

const KEINE_AUFTRAEGE = [
  "Qu'est-ce qu'une image vectorielle ?",
  "Explique-moi cette image",
  "Crea una tabla con los datos",
  "¿Qué es un dibujo técnico?",
  "Fai una lista della spesa",
  "O que é uma imagem PNG?",
  "Bu resim nedir?",
  "Что такое изображение в формате SVG?",
  "Buat daftar belanja",
  "Apa itu gambar vektor?",
  "この画像を説明して",
  "这张图片是什么意思",
  "이 그림 설명해 줘",
  "Wie spät ist es in Paris?",
  "Explain what an image sensor does"
];

test("jede der 13 weiteren Sprachen bestellt ein Bild — auch 'Dessine une pomme rouge'", () => {
  for (const [sprache, saetze] of Object.entries(MAL_AUFTRAEGE)) {
    for (const satz of saetze) {
      assert.equal(istWeltMalAuftrag(satz), true, `${sprache}: ${satz}`);
      assert.equal(erkenneBildAuftrag(satz), satz, `Bild-Spur ${sprache}: ${satz}`);
    }
  }
});

test("Fragen UEBER Bilder und normale Auftraege nehmen NIE die Bild-Spur", () => {
  for (const satz of KEINE_AUFTRAEGE) {
    assert.equal(erkenneBildAuftrag(satz), "", `darf NICHT malen: ${satz}`);
  }
});

test("ein blosses Mal-Verb ohne Motiv ist kein Auftrag", () => {
  for (const satz of ["Dessine", "нарисуй", "描いて"]) assert.equal(istWeltMalAuftrag(satz), false, satz);
});
