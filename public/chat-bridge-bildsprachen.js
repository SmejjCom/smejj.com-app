// smejj.com — Mal-Auftraege in den 13 weiteren Oberflaechensprachen erkennen.
//
// WARUM (live gemessen 23.09.2026, Bruecke v160): "Dessine une pomme rouge"
// fiel in die Textspur und bekam eine Beschreibung statt eines Bildes. Die
// Erkennung in chat-bridge-bilder.js kannte nur deutsche und englische Verben —
// die Oberflaeche spricht aber 15 Sprachen, und seit v160 antwortet auch der
// Satz ueber dem Bild in all diesen Sprachen.
//
// Zwei Wege, wie in der deutschen Erkennung:
//  1. MALVERB: ein Verb, das ohne Bild keinen Sinn ergibt ("dessine",
//     "нарисуй", "描いて"). Es reicht allein, wenn danach noch etwas folgt.
//  2. MOTIV + ERSTELLEN: ein Bildwort ("image", "imagen", "图片") zusammen mit
//     einem Erstell-Verb ("génère", "crea", "生成"). Das Bildwort allein reicht
//     NICHT — "Was bedeutet dieses Bild?" ist keine Bestellung.
// Bewusst eng gehalten wie das Vorbild: lieber einmal eine Mal-Bitte als Text
// beantworten als eine Frage ungefragt mit einem Bild.
//
// Grenzen: \b kennt in JavaScript weder Akzente noch nicht-lateinische Schrift
// ("çiz" beginnt mit einem Zeichen, das \b nicht als Buchstaben sieht). Darum
// Lookarounds auf \p{L}; fuer Chinesisch/Japanisch gibt es keine Wortgrenzen,
// dort stehen die Muster ohne Grenze.

const L = "(?<![\\p{L}\\p{M}])";   // davor kein Buchstabe
const R = "(?![\\p{L}\\p{M}])";    // danach kein Buchstabe
const wort = (liste) => new RegExp(`${L}(?:${liste.join("|")})${R}`, "iu");
const frei = (liste) => new RegExp(`(?:${liste.join("|")})`, "u");

// 1. Verben, die fuer sich schon "mal mir etwas" heissen.
const MALVERB = [
  wort(["dibuja", "dibujame", "dibújame", "dibújeme", "dibuje", "píntame", "pintame"]),             // es
  wort(["dessine", "dessinez", "dessine-moi", "dessinez-moi", "peins", "peignez", "peins-moi"]),     // fr
  wort(["disegna", "disegnami", "disegnate", "dipingi", "dipingimi"]),                              // it
  wort(["desenhe", "desenha", "desenha-me", "desenhe-me", "pinte", "pinta-me"]),                    // pt
  wort(["çiz", "çizin", "çizer misin", "çizebilir misin", "çizsene"]),                              // tr
  wort(["нарисуй", "нарисуйте", "нарисуешь", "изобрази"]),                                          // ru
  wort(["ارسم", "ارسمي", "ارسموا", "ارسم لي"]),                                                    // ar
  wort(["ड्रॉ करो", "ड्रॉ कीजिए", "स्केच बनाओ", "स्केच बनाइए"]),                                                // hi
  wort(["আঁকো", "আঁকুন", "এঁকে দাও", "এঁকে দিন"]),                                                     // bn
  wort(["gambarkan", "gambarlah", "lukis", "lukiskan", "lukislah"]),                                // id
  frei(["描いて", "描け", "描いてください", "絵を描"]),                                                // ja
  frei(["그려줘", "그려 줘", "그려주세요", "그려 주세요", "그려봐", "그려 봐"]),                          // ko
  frei(["画一", "画个", "画幅", "画张", "帮我画", "请画", "画出", "绘制"])                              // zh
];

// 2. Bildwoerter und Erstell-Verben je Sprache — nur GEMEINSAM ein Auftrag.
const MOTIV_MIT_VERB = [
  [wort(["imagen", "imágenes", "dibujo", "ilustración", "foto", "logo"]), wort(["crea", "créame", "crear", "genera", "generar", "haz", "hazme", "diseña"])],                      // es
  [wort(["image", "images", "dessin", "illustration", "photo", "logo"]), wort(["crée", "crée-moi", "créer", "génère", "génère-moi", "générer", "fais", "fais-moi", "faire"])],   // fr
  [wort(["immagine", "immagini", "disegno", "illustrazione", "foto", "logo"]), wort(["crea", "creami", "creare", "genera", "generami", "fai", "fammi"])],                       // it
  [wort(["imagem", "imagens", "desenho", "ilustração", "foto", "logo"]), wort(["crie", "cria", "criar", "gere", "gera", "gerar", "faça", "faz", "faça-me"])],                     // pt
  [wort(["resim", "resmi", "görsel", "görseli", "görüntü", "fotoğraf", "logo"]), wort(["oluştur", "oluşturur musun", "yap", "yapar mısın", "üret"])],                           // tr
  [wort(["картинку", "картинка", "изображение", "рисунок", "фото", "логотип"]), wort(["создай", "создайте", "сгенерируй", "сделай", "нарисуй"])],                             // ru
  [wort(["صورة", "رسمة", "رسم", "شعار"]), wort(["أنشئ", "انشئ", "اصنع", "ولّد", "ولد", "اعمل"])],                                                                          // ar
  [wort(["चित्र", "तस्वीर", "इमेज", "फोटो", "लोगो"]), wort(["बनाओ", "बनाइए", "बनाएं", "बनाएँ", "बना दो", "जनरेट करो"])],                                                     // hi
  [wort(["ছবি", "চিত্র", "ইমেজ", "লোগো"]), wort(["বানাও", "বানান", "তৈরি করো", "তৈরি করুন", "আঁকো"])],                                                                     // bn
  [wort(["gambar", "foto", "ilustrasi", "logo"]), wort(["buat", "buatkan", "buatlah", "hasilkan", "bikin", "bikinkan"])],                                                      // id
  [frei(["画像", "絵", "イラスト", "ロゴ"]), frei(["作って", "作成", "生成", "描"])],                                                                                             // ja
  [frei(["이미지", "그림", "사진", "로고"]), frei(["만들어", "생성", "그려"])],                                                                                                  // ko
  [frei(["图片", "图像", "照片", "插图", "图画", "标志"]), frei(["生成", "创建", "制作", "做一", "画"])]                                                                         // zh
];

// Fragen UEBER Bilder sind keine Bestellung ("Qu'est-ce qu'une image ?").
const FRAGE = frei([
  "qu'est-ce", "que signifie", "qué es", "qué significa", "cos'è", "che cos", "o que é", "o que significa",
  "nedir", "ne demek", "что такое", "что значит", "ما هو", "ما هي", "क्या है", "কী", "apa itu", "apa arti",
  "とは", "什么是", "什么意思", "무엇", "뭐야"
]);

/** true, wenn der Text in einer der 13 weiteren Sprachen ein Bild bestellt. */
export function istWeltMalAuftrag(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 600 || FRAGE.test(t.toLowerCase())) return false;
  for (const verb of MALVERB) {
    const treffer = t.match(verb);
    if (treffer && t.replace(treffer[0], "").trim().length >= 2) return true;
  }
  return MOTIV_MIT_VERB.some(([motiv, verb]) => motiv.test(t) && verb.test(t));
}

// --- Video-Auftraege (Betreiber 23.09.2026: "erweitere die Videoerkennung auf
// alle 15 Sprachen"). Befund live: "Haz un video de un faro rojo" fiel in die
// Textspur, und das Modell antwortete "No puedo crear vídeos" — es verneinte
// eine Faehigkeit, die smejj hat. Regel wie bei Bildern: Video-Wort UND
// Erstell-Verb derselben Sprache. Tuerkisch haengt Endungen an ("videosu"),
// darum dort Praefix statt ganzes Wort.
const praefix = (liste) => new RegExp(`${L}(?:${liste.join("|")})`, "iu");
const VIDEO_WELT = [
  [wort(["vídeo", "video", "vídeos", "videos", "animación", "clip"]), wort(["haz", "hazme", "crea", "créame", "genera", "genérame", "produce"])],                         // es
  [wort(["vidéo", "vidéos", "film", "clip", "animation"]), wort(["fais", "fais-moi", "crée", "crée-moi", "génère", "génère-moi", "réalise", "produis"])],                // fr
  [wort(["video", "filmato", "animazione", "clip"]), wort(["fai", "fammi", "crea", "creami", "genera", "generami", "realizza"])],                                         // it
  [wort(["vídeo", "video", "vídeos", "filme", "animação", "clipe"]), wort(["faça", "faz", "faz-me", "crie", "cria", "gere", "gera", "produza"])],                         // pt
  [praefix(["video", "animasyon", "klip"]), praefix(["yap", "oluştur", "üret", "hazırla"])],                                                                              // tr
  [wort(["видео", "ролик", "анимацию", "анимация", "клип"]), wort(["сделай", "сделайте", "создай", "создайте", "сгенерируй", "сними", "смонтируй"])],                   // ru
  [wort(["فيديو", "مقطع", "رسوم متحركة"]), wort(["اصنع", "أنشئ", "انشئ", "ولّد", "ولد", "اعمل"])],                                                                     // ar
  [wort(["वीडियो", "एनिमेशन", "क्लिप"]), wort(["बनाओ", "बनाइए", "बनाएं", "बनाएँ", "बना दो", "जनरेट करो"])],                                                              // hi
  [wort(["ভিডিও", "অ্যানিমেশন", "ক্লিপ"]), wort(["বানাও", "বানান", "তৈরি করো", "তৈরি করুন"])],                                                                          // bn
  [wort(["video", "animasi", "klip"]), wort(["buat", "buatkan", "buatlah", "bikin", "bikinkan", "hasilkan"])],                                                             // id
  [frei(["動画", "ビデオ", "アニメーション", "ムービー"]), frei(["作って", "作成", "生成", "作れ"])],                                                                          // ja
  [frei(["동영상", "영상", "비디오", "애니메이션"]), frei(["만들어", "생성", "제작"])],                                                                                     // ko
  [frei(["视频", "动画", "影片", "短片"]), frei(["生成", "制作", "做一", "做个", "创建"])]                                                                                   // zh
];

// Auftraege UEBER ein Video (zusammenfassen, erklaeren, uebersetzen …) oder mit
// Link sind keine Bestellung — "Fais-moi un résumé de cette vidéo" malt nichts.
const UEBER_VIDEO = frei([
  "http", "www.", "youtube", "youtu.be",
  "résumé", "résume", "résumer", "explique", "analyse", "tradui", "transcri",
  "resumen", "resume", "explica", "analiza", "traduce", "transcrib",
  "riassunt", "riassumi", "spiega", "analizza", "traduci", "trascriv",
  "resumo", "resuma", "analisa", "traduz", "transcrev",
  "özet", "açıkla", "analiz", "çevir",
  "резюме", "кратко", "объясни", "проанализируй", "переведи", "перескажи",
  "لخص", "اشرح", "حلل", "ترجم",
  "सारांश", "समझाओ", "अनुवाद", "সারাংশ", "ব্যাখ্যা", "অনুবাদ",
  "ringkas", "jelaskan", "analisis", "terjemah",
  "要約", "説明", "分析", "翻訳", "文字起こし", "요약", "설명", "분석", "번역", "总结", "摘要", "解释", "翻译"
]);

/** true, wenn der Text in einer der 13 weiteren Sprachen ein Video bestellt. */
export function istWeltVideoAuftrag(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 600) return false;
  const klein = t.toLowerCase();
  if (FRAGE.test(klein) || UEBER_VIDEO.test(klein)) return false;
  return VIDEO_WELT.some(([motiv, verb]) => motiv.test(t) && verb.test(t));
}
