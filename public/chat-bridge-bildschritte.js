// smejj.com — die Fortschrittszeile beim Malen in 15 Sprachen.
//
// WARUM (Betreiber 23.09.2026: "Mach 'Male dein Bild' auch in 15 Sprachen"):
// Seit v160/v161 erkennt die Bruecke Mal-Auftraege in allen 15 Sprachen und
// antwortet mit "Voici ton image :" — die Zeile DARUEBER stand aber weiter fest
// deutsch ("Male dein Bild · läuft … 10 s"). Die App (ai/chat-schritte-anzeige.js)
// zeigt schritt.text und schritt.stand unveraendert an; uebersetzt wird deshalb
// hier im Server, in derselben Sprache wie der Satz ueber dem Bild
// (spracheAusAnfrage in chat-bridge-bilder.js). Der Titel bleibt innerhalb EINER
// Anfrage konstant — die App erkennt daran, dass sie dieselbe Zeile aktualisiert.

const T = (titel, etwa, sek, reserve, fertig, fehl, startet) => ({ titel, etwa, sek, reserve, fertig, fehl, startet });

export const BILD_SCHRITTE = Object.freeze({
  de: T("Male dein Bild", "läuft … (ca. 1 Minute)", "läuft … {n} s", "ausgelastet — zeichne als Vektorgrafik …", "fertig", "fehlgeschlagen", "Bild-Dienst startet gerade"),
  en: T("Painting your image", "running … (about 1 minute)", "running … {n} s", "busy — drawing as a vector graphic …", "done", "failed", "Image service is starting"),
  es: T("Pintando tu imagen", "en curso … (aprox. 1 minuto)", "en curso … {n} s", "ocupado — dibujando como gráfico vectorial …", "listo", "falló", "El servicio de imágenes se está iniciando"),
  fr: T("Je peins ton image", "en cours … (env. 1 minute)", "en cours … {n} s", "occupé — dessin en graphique vectoriel …", "terminé", "échec", "Le service d'images démarre"),
  pt: T("A pintar a tua imagem", "em curso … (cerca de 1 minuto)", "em curso … {n} s", "ocupado — a desenhar como gráfico vetorial …", "concluído", "falhou", "O serviço de imagens está a iniciar"),
  it: T("Dipingo la tua immagine", "in corso … (circa 1 minuto)", "in corso … {n} s", "occupato — disegno come grafica vettoriale …", "fatto", "non riuscito", "Il servizio immagini si sta avviando"),
  tr: T("Görselin çiziliyor", "sürüyor … (yaklaşık 1 dakika)", "sürüyor … {n} sn", "yoğun — vektör grafik olarak çiziliyor …", "tamamlandı", "başarısız", "Görsel hizmeti başlatılıyor"),
  ru: T("Рисую твоё изображение", "идёт … (около 1 минуты)", "идёт … {n} с", "занято — рисую векторную графику …", "готово", "не удалось", "Сервис изображений запускается"),
  ar: T("أرسم صورتك", "جارٍ … (حوالي دقيقة)", "جارٍ … {n} ث", "مشغول — أرسمها كرسم متجهي …", "تم", "فشل", "خدمة الصور قيد التشغيل"),
  hi: T("आपकी तस्वीर बना रहा हूँ", "जारी … (लगभग 1 मिनट)", "जारी … {n} से.", "व्यस्त — वेक्टर ग्राफ़िक के रूप में बना रहा हूँ …", "पूरा", "विफल", "इमेज सेवा शुरू हो रही है"),
  bn: T("তোমার ছবি আঁকছি", "চলছে … (প্রায় ১ মিনিট)", "চলছে … {n} সে.", "ব্যস্ত — ভেক্টর গ্রাফিক হিসেবে আঁকছি …", "সম্পন্ন", "ব্যর্থ", "ছবি পরিষেবা চালু হচ্ছে"),
  id: T("Melukis gambarmu", "berjalan … (sekitar 1 menit)", "berjalan … {n} dtk", "sibuk — menggambar sebagai grafik vektor …", "selesai", "gagal", "Layanan gambar sedang dimulai"),
  ja: T("画像を描いています", "処理中 …（約1分）", "処理中 … {n} 秒", "混雑中 — ベクター画像で描いています …", "完了", "失敗", "画像サービスを起動中です"),
  ko: T("이미지를 그리는 중", "진행 중 … (약 1분)", "진행 중 … {n}초", "혼잡 — 벡터 그래픽으로 그리는 중 …", "완료", "실패", "이미지 서비스를 시작하는 중"),
  zh: T("正在绘制你的图片", "进行中 …（约 1 分钟）", "进行中 … {n} 秒", "繁忙 — 改用矢量图绘制 …", "完成", "失败", "图片服务正在启动")
});

/** Die Texte einer Sprache; Unbekanntes faellt auf Deutsch (wie BILD_TEXTE). */
export function bildSchritte(sprache) {
  return BILD_SCHRITTE[sprache] || BILD_SCHRITTE.de;
}

/** "läuft … {n} s" mit eingesetzter Sekundenzahl. */
export function schrittSekunden(sprache, sekunden) {
  return bildSchritte(sprache).sek.replace("{n}", String(sekunden));
}
