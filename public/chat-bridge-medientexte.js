// smejj.com — Video-Zeile und Fehlermeldungen der Bild-/Video-Spur in 15 Sprachen.
//
// WARUM (Betreiber 23.09.2026: "Uebersetze die Video-Zeile und Fehlermeldungen
// auch in 15 Sprachen"): Seit v161/v163 sprechen Bildsatz und Mal-Zeile die
// Sprache des Nutzers; die Video-Spur und alle Absagen standen weiter fest
// deutsch. Die Sprache kommt aus derselben Quelle wie der Bildsatz
// (spracheAusAnfrage in chat-bridge-bilder.js).
//
// Der Ersatzvorschlag ("Zeichne ein Bild von X") ist in jeder Sprache so
// formuliert, dass die Bilderkennung (chat-bridge-bildsprachen.js) ihn wieder
// als Mal-Auftrag erkennt — ein Test prueft das.
//
// Deutsch bleibt WORTGLEICH zum bisherigen Stand (inkl. "Stoerung"/"laedt"),
// damit die bestehenden Tests und Gewohnheiten unberuehrt bleiben.

const V = (o) => Object.freeze(o);

export const VIDEO_TEXTE = Object.freeze({
  de: V({ titel: "Erzeuge dein Video", pruefe: "prüfe Video-Engine …", weg: "Video-Engine nicht erreichbar", etwa: "läuft … (ca. 1-2 Minuten)", laeuft: "läuft", wartet: "wartet auf freien Platz", fertig: "fertig", fehl: "fehlgeschlagen", andrang: "gerade zu viele Videos",
    hier: "Hier ist dein Video:", altTon: "Erzähltes Video", alt: "Erstelltes Video",
    parallax: "Räumliche Kamerafahrt durch ein gemaltes Bild: Vorder- und Hintergrund bewegen sich gegeneinander, das Motiv selbst bleibt ruhig.",
    kenburns: "Bewegte Szene aus einem gemalten Bild: die Kamera fährt, das Motiv selbst bleibt ruhig.", stimme: "Erzählt von der Stimme von smejj 1.0.",
    engineWeg: "Die eigene Video-Engine ist gerade nicht erreichbar. Sobald sie läuft, entsteht hier ein kurzes Video zu deinem Auftrag.",
    ersatz: "Bilder gehen weiter — versuch es mit *\"Zeichne ein Bild von {motiv}\"*.",
    videoFehl: "Die Video-Erzeugung ist gerade fehlgeschlagen — bitte versuch es gleich noch einmal.",
    andrangText: "Gerade werden schon mehrere Videos erzeugt — bitte versuch es in ein paar Minuten noch einmal." }),
  en: V({ titel: "Creating your video", pruefe: "checking video engine …", weg: "Video engine unreachable", etwa: "running … (about 1-2 minutes)", laeuft: "running", wartet: "waiting for a free slot", fertig: "done", fehl: "failed", andrang: "too many videos right now",
    hier: "Here is your video:", altTon: "Narrated video", alt: "Generated video",
    parallax: "A spatial camera move through a painted image: foreground and background move against each other, the subject itself stays still.",
    kenburns: "A moving scene from a painted image: the camera moves, the subject itself stays still.", stimme: "Narrated by the voice of smejj 1.0.",
    engineWeg: "Our own video engine is unreachable right now. As soon as it is running, a short video for your request will appear here.",
    ersatz: "Images still work — try *\"Draw a picture of {motiv}\"*.",
    videoFehl: "Video creation just failed — please try again in a moment.",
    andrangText: "Several videos are already being created — please try again in a few minutes." }),
  es: V({ titel: "Creando tu vídeo", pruefe: "comprobando el motor de vídeo …", weg: "Motor de vídeo no disponible", etwa: "en curso … (aprox. 1-2 minutos)", laeuft: "en curso", wartet: "esperando un hueco libre", fertig: "listo", fehl: "falló", andrang: "demasiados vídeos ahora mismo",
    hier: "Aquí está tu vídeo:", altTon: "Vídeo narrado", alt: "Vídeo generado",
    parallax: "Un movimiento de cámara espacial a través de una imagen pintada: el primer plano y el fondo se mueven entre sí, el motivo permanece quieto.",
    kenburns: "Una escena en movimiento a partir de una imagen pintada: la cámara se mueve, el motivo permanece quieto.", stimme: "Narrado con la voz de smejj 1.0.",
    engineWeg: "Nuestro motor de vídeo no está disponible ahora mismo. En cuanto funcione, aquí aparecerá un vídeo corto para tu petición.",
    ersatz: "Las imágenes siguen funcionando — prueba con *\"Dibuja una imagen de {motiv}\"*.",
    videoFehl: "La creación del vídeo acaba de fallar — vuelve a intentarlo en un momento.",
    andrangText: "Ya se están creando varios vídeos — vuelve a intentarlo en unos minutos." }),
  fr: V({ titel: "Je crée ta vidéo", pruefe: "vérification du moteur vidéo …", weg: "Moteur vidéo injoignable", etwa: "en cours … (env. 1-2 minutes)", laeuft: "en cours", wartet: "en attente d'une place libre", fertig: "terminé", fehl: "échec", andrang: "trop de vidéos en ce moment",
    hier: "Voici ta vidéo :", altTon: "Vidéo narrée", alt: "Vidéo générée",
    parallax: "Un mouvement de caméra dans l'espace à travers une image peinte : le premier plan et l'arrière-plan bougent l'un contre l'autre, le sujet reste immobile.",
    kenburns: "Une scène animée à partir d'une image peinte : la caméra bouge, le sujet reste immobile.", stimme: "Raconté par la voix de smejj 1.0.",
    engineWeg: "Notre moteur vidéo est injoignable pour le moment. Dès qu'il fonctionnera, une courte vidéo pour ta demande apparaîtra ici.",
    ersatz: "Les images fonctionnent toujours — essaie *\"Dessine une image de {motiv}\"*.",
    videoFehl: "La création de la vidéo vient d'échouer — réessaie dans un instant.",
    andrangText: "Plusieurs vidéos sont déjà en cours de création — réessaie dans quelques minutes." }),
  pt: V({ titel: "A criar o teu vídeo", pruefe: "a verificar o motor de vídeo …", weg: "Motor de vídeo indisponível", etwa: "em curso … (cerca de 1-2 minutos)", laeuft: "em curso", wartet: "à espera de uma vaga", fertig: "concluído", fehl: "falhou", andrang: "demasiados vídeos neste momento",
    hier: "Aqui está o teu vídeo:", altTon: "Vídeo narrado", alt: "Vídeo gerado",
    parallax: "Um movimento de câmara espacial através de uma imagem pintada: o primeiro plano e o fundo movem-se um contra o outro, o motivo fica parado.",
    kenburns: "Uma cena em movimento a partir de uma imagem pintada: a câmara move-se, o motivo fica parado.", stimme: "Narrado pela voz do smejj 1.0.",
    engineWeg: "O nosso motor de vídeo está indisponível neste momento. Assim que funcionar, aparece aqui um vídeo curto para o teu pedido.",
    ersatz: "As imagens continuam a funcionar — experimenta *\"Desenhe uma imagem de {motiv}\"*.",
    videoFehl: "A criação do vídeo acabou de falhar — tenta novamente daqui a pouco.",
    andrangText: "Já estão a ser criados vários vídeos — tenta novamente daqui a alguns minutos." }),
  it: V({ titel: "Creo il tuo video", pruefe: "controllo il motore video …", weg: "Motore video non raggiungibile", etwa: "in corso … (circa 1-2 minuti)", laeuft: "in corso", wartet: "in attesa di un posto libero", fertig: "fatto", fehl: "non riuscito", andrang: "troppi video in questo momento",
    hier: "Ecco il tuo video:", altTon: "Video narrato", alt: "Video generato",
    parallax: "Un movimento di camera nello spazio attraverso un'immagine dipinta: primo piano e sfondo si muovono l'uno contro l'altro, il soggetto resta fermo.",
    kenburns: "Una scena in movimento da un'immagine dipinta: la camera si muove, il soggetto resta fermo.", stimme: "Narrato dalla voce di smejj 1.0.",
    engineWeg: "Il nostro motore video non è raggiungibile in questo momento. Appena sarà attivo, qui comparirà un breve video per la tua richiesta.",
    ersatz: "Le immagini funzionano ancora — prova con *\"Disegna un'immagine di {motiv}\"*.",
    videoFehl: "La creazione del video non è riuscita — riprova tra un attimo.",
    andrangText: "Sono già in corso diversi video — riprova tra qualche minuto." }),
  tr: V({ titel: "Videon oluşturuluyor", pruefe: "video motoru kontrol ediliyor …", weg: "Video motoruna ulaşılamıyor", etwa: "sürüyor … (yaklaşık 1-2 dakika)", laeuft: "sürüyor", wartet: "boş yer bekleniyor", fertig: "tamamlandı", fehl: "başarısız", andrang: "şu an çok fazla video var",
    hier: "İşte videon:", altTon: "Anlatımlı video", alt: "Oluşturulan video",
    parallax: "Boyanmış bir görselde uzamsal kamera hareketi: ön ve arka plan birbirine göre hareket eder, konu sabit kalır.",
    kenburns: "Boyanmış bir görselden hareketli sahne: kamera hareket eder, konu sabit kalır.", stimme: "smejj 1.0'ın sesiyle anlatıldı.",
    engineWeg: "Kendi video motorumuza şu an ulaşılamıyor. Çalışır çalışmaz isteğin için burada kısa bir video oluşacak.",
    ersatz: "Görseller çalışmaya devam ediyor — şunu dene: *\"{motiv} resmi çiz\"*.",
    videoFehl: "Video oluşturma az önce başarısız oldu — lütfen birazdan tekrar dene.",
    andrangText: "Şu anda zaten birkaç video oluşturuluyor — lütfen birkaç dakika sonra tekrar dene." }),
  ru: V({ titel: "Создаю твоё видео", pruefe: "проверяю видеодвижок …", weg: "Видеодвижок недоступен", etwa: "идёт … (около 1-2 минут)", laeuft: "идёт", wartet: "жду свободного места", fertig: "готово", fehl: "не удалось", andrang: "сейчас слишком много видео",
    hier: "Вот твоё видео:", altTon: "Видео с озвучкой", alt: "Созданное видео",
    parallax: "Пространственное движение камеры по нарисованному изображению: передний и задний план смещаются относительно друг друга, сам объект остаётся неподвижным.",
    kenburns: "Движущаяся сцена из нарисованного изображения: камера движется, сам объект остаётся неподвижным.", stimme: "Озвучено голосом smejj 1.0.",
    engineWeg: "Наш видеодвижок сейчас недоступен. Как только он заработает, здесь появится короткое видео по твоему запросу.",
    ersatz: "Изображения по-прежнему работают — попробуй *\"Нарисуй {motiv}\"*.",
    videoFehl: "Создание видео только что не удалось — попробуй ещё раз чуть позже.",
    andrangText: "Сейчас уже создаётся несколько видео — попробуй ещё раз через несколько минут." }),
  ar: V({ titel: "جارٍ إنشاء الفيديو الخاص بك", pruefe: "جارٍ فحص محرك الفيديو …", weg: "محرك الفيديو غير متاح", etwa: "جارٍ … (حوالي 1-2 دقيقة)", laeuft: "جارٍ", wartet: "بانتظار مكان شاغر", fertig: "تم", fehl: "فشل", andrang: "عدد كبير جدًا من الفيديوهات الآن",
    hier: "إليك الفيديو:", altTon: "فيديو مع تعليق صوتي", alt: "فيديو مُنشأ",
    parallax: "حركة كاميرا مكانية عبر صورة مرسومة: تتحرك المقدمة والخلفية بعكس بعضهما، ويبقى الموضوع نفسه ثابتًا.",
    kenburns: "مشهد متحرك من صورة مرسومة: تتحرك الكاميرا، ويبقى الموضوع نفسه ثابتًا.", stimme: "بصوت smejj 1.0.",
    engineWeg: "محرك الفيديو الخاص بنا غير متاح حاليًا. بمجرد أن يعمل، سيظهر هنا فيديو قصير لطلبك.",
    ersatz: "الصور ما زالت تعمل — جرّب *\"ارسم صورة {motiv}\"*.",
    videoFehl: "فشل إنشاء الفيديو للتو — يرجى المحاولة مرة أخرى بعد قليل.",
    andrangText: "يتم الآن إنشاء عدة فيديوهات — يرجى المحاولة مرة أخرى بعد بضع دقائق." }),
  hi: V({ titel: "आपका वीडियो बना रहा हूँ", pruefe: "वीडियो इंजन जाँच रहा हूँ …", weg: "वीडियो इंजन उपलब्ध नहीं", etwa: "जारी … (लगभग 1-2 मिनट)", laeuft: "जारी", wartet: "खाली जगह का इंतज़ार", fertig: "पूरा", fehl: "विफल", andrang: "अभी बहुत सारे वीडियो बन रहे हैं",
    hier: "यह रहा आपका वीडियो:", altTon: "आवाज़ वाला वीडियो", alt: "बनाया गया वीडियो",
    parallax: "एक चित्रित तस्वीर में स्थानिक कैमरा मूवमेंट: अग्रभूमि और पृष्ठभूमि एक-दूसरे के विपरीत चलते हैं, विषय स्वयं स्थिर रहता है।",
    kenburns: "एक चित्रित तस्वीर से चलता दृश्य: कैमरा चलता है, विषय स्वयं स्थिर रहता है।", stimme: "smejj 1.0 की आवाज़ में सुनाया गया।",
    engineWeg: "हमारा अपना वीडियो इंजन अभी उपलब्ध नहीं है। जैसे ही यह चलेगा, आपके अनुरोध के लिए यहाँ एक छोटा वीडियो बनेगा।",
    ersatz: "तस्वीरें अब भी काम करती हैं — आज़माएँ *\"{motiv} का चित्र बनाओ\"*।",
    videoFehl: "वीडियो बनाना अभी विफल हो गया — कृपया थोड़ी देर में फिर कोशिश करें।",
    andrangText: "अभी पहले से कई वीडियो बन रहे हैं — कृपया कुछ मिनट बाद फिर कोशिश करें।" }),
  bn: V({ titel: "তোমার ভিডিও তৈরি করছি", pruefe: "ভিডিও ইঞ্জিন পরীক্ষা করছি …", weg: "ভিডিও ইঞ্জিন পাওয়া যাচ্ছে না", etwa: "চলছে … (প্রায় ১-২ মিনিট)", laeuft: "চলছে", wartet: "খালি জায়গার অপেক্ষায়", fertig: "সম্পন্ন", fehl: "ব্যর্থ", andrang: "এখন অনেক বেশি ভিডিও",
    hier: "এই যে তোমার ভিডিও:", altTon: "বর্ণনাসহ ভিডিও", alt: "তৈরি করা ভিডিও",
    parallax: "আঁকা ছবির ভেতর দিয়ে স্থানিক ক্যামেরা চলাচল: সামনের ও পেছনের অংশ একে অপরের বিপরীতে সরে, বিষয়টি নিজে স্থির থাকে।",
    kenburns: "আঁকা ছবি থেকে চলমান দৃশ্য: ক্যামেরা চলে, বিষয়টি নিজে স্থির থাকে।", stimme: "smejj 1.0-এর কণ্ঠে বর্ণিত।",
    engineWeg: "আমাদের নিজস্ব ভিডিও ইঞ্জিন এখন পাওয়া যাচ্ছে না। এটি চালু হলেই এখানে তোমার অনুরোধের জন্য একটি ছোট ভিডিও তৈরি হবে।",
    ersatz: "ছবি এখনও কাজ করে — চেষ্টা করো *\"{motiv}-এর ছবি আঁকো\"*।",
    videoFehl: "ভিডিও তৈরি এইমাত্র ব্যর্থ হয়েছে — একটু পরে আবার চেষ্টা করো।",
    andrangText: "এখন ইতিমধ্যে কয়েকটি ভিডিও তৈরি হচ্ছে — কয়েক মিনিট পরে আবার চেষ্টা করো।" }),
  id: V({ titel: "Membuat videomu", pruefe: "memeriksa mesin video …", weg: "Mesin video tidak terjangkau", etwa: "berjalan … (sekitar 1-2 menit)", laeuft: "berjalan", wartet: "menunggu tempat kosong", fertig: "selesai", fehl: "gagal", andrang: "terlalu banyak video saat ini",
    hier: "Ini videomu:", altTon: "Video dengan narasi", alt: "Video yang dibuat",
    parallax: "Gerakan kamera spasial melalui gambar lukisan: latar depan dan latar belakang bergerak berlawanan, objeknya sendiri tetap diam.",
    kenburns: "Adegan bergerak dari gambar lukisan: kamera bergerak, objeknya sendiri tetap diam.", stimme: "Dinarasikan dengan suara smejj 1.0.",
    engineWeg: "Mesin video kami sedang tidak terjangkau. Begitu berjalan, video singkat untuk permintaanmu akan muncul di sini.",
    ersatz: "Gambar tetap berfungsi — coba *\"Gambarkan {motiv}\"*.",
    videoFehl: "Pembuatan video baru saja gagal — silakan coba lagi sebentar lagi.",
    andrangText: "Beberapa video sedang dibuat — silakan coba lagi dalam beberapa menit." }),
  ja: V({ titel: "動画を作成しています", pruefe: "動画エンジンを確認中 …", weg: "動画エンジンに接続できません", etwa: "処理中 …（約1〜2分）", laeuft: "処理中", wartet: "空きを待っています", fertig: "完了", fehl: "失敗", andrang: "現在動画が多すぎます",
    hier: "動画ができました:", altTon: "ナレーション付き動画", alt: "生成された動画",
    parallax: "描かれた画像の中を立体的にカメラが動きます。前景と背景が互いに動き、被写体そのものは静止しています。",
    kenburns: "描かれた画像から作った動くシーンです。カメラが動き、被写体そのものは静止しています。", stimme: "smejj 1.0 の声でナレーションしています。",
    engineWeg: "現在、独自の動画エンジンに接続できません。動き出しだい、ここにリクエストの短い動画が表示されます。",
    ersatz: "画像は引き続き使えます — *「{motiv}の絵を描いて」* を試してください。",
    videoFehl: "動画の作成に失敗しました — 少ししてからもう一度お試しください。",
    andrangText: "すでに複数の動画を作成中です — 数分後にもう一度お試しください。" }),
  ko: V({ titel: "동영상을 만드는 중", pruefe: "동영상 엔진 확인 중 …", weg: "동영상 엔진에 연결할 수 없음", etwa: "진행 중 … (약 1-2분)", laeuft: "진행 중", wartet: "빈 자리를 기다리는 중", fertig: "완료", fehl: "실패", andrang: "지금은 동영상이 너무 많아요",
    hier: "동영상이 준비됐어요:", altTon: "내레이션 동영상", alt: "생성된 동영상",
    parallax: "그려진 이미지 속을 입체적으로 움직이는 카메라: 전경과 배경이 서로 엇갈려 움직이고, 대상 자체는 가만히 있어요.",
    kenburns: "그려진 이미지로 만든 움직이는 장면: 카메라가 움직이고, 대상 자체는 가만히 있어요.", stimme: "smejj 1.0의 목소리로 내레이션했어요.",
    engineWeg: "자체 동영상 엔진에 지금 연결할 수 없어요. 작동하는 대로 여기에 요청하신 짧은 동영상이 만들어져요.",
    ersatz: "이미지는 계속 쓸 수 있어요 — *\"{motiv} 그림을 그려줘\"* 를 해 보세요.",
    videoFehl: "동영상 생성에 방금 실패했어요 — 잠시 후 다시 시도해 주세요.",
    andrangText: "이미 여러 동영상을 만들고 있어요 — 몇 분 후 다시 시도해 주세요." }),
  zh: V({ titel: "正在生成你的视频", pruefe: "正在检查视频引擎 …", weg: "视频引擎无法访问", etwa: "进行中 …（约 1-2 分钟）", laeuft: "进行中", wartet: "等待空闲位置", fertig: "完成", fehl: "失败", andrang: "当前视频太多",
    hier: "这是你的视频：", altTon: "带旁白的视频", alt: "生成的视频",
    parallax: "在绘制的图片中进行立体镜头移动：前景和背景相对移动，主体本身保持不动。",
    kenburns: "由绘制的图片生成的动态场景：镜头移动，主体本身保持不动。", stimme: "由 smejj 1.0 的声音讲述。",
    engineWeg: "我们自己的视频引擎暂时无法访问。一旦恢复，这里会为你的请求生成一段短视频。",
    ersatz: "图片仍然可用 — 试试 *“画一张{motiv}的图”*。",
    videoFehl: "视频生成刚刚失败 — 请稍后再试。",
    andrangText: "已经有多个视频正在生成 — 请几分钟后再试。" })
});

// Absagen der Bild-Spur (Malen fehlgeschlagen, Dienst gestoert oder startet).
export const BILD_FEHLER = Object.freeze({
  de: V({ malenFehl: "Das Malen ist gerade fehlgeschlagen — bitte versuch es gleich noch einmal.", stoerung: "Der Bild-Dienst meldet gerade eine Stoerung. Ich kann sonst Bilder malen — bitte versuch es in ein paar Minuten noch einmal.", startet: "Der Bild-Dienst startet gerade{seit} und laedt sein Modell. Ich kann Bilder malen — bitte versuch es in ein bis zwei Minuten noch einmal.", seit: " (seit {n} s)" }),
  en: V({ malenFehl: "Painting just failed — please try again in a moment.", stoerung: "The image service is reporting a fault right now. I can normally paint images — please try again in a few minutes.", startet: "The image service is starting{seit} and loading its model. I can paint images — please try again in one or two minutes.", seit: " (for {n} s)" }),
  es: V({ malenFehl: "Pintar acaba de fallar — vuelve a intentarlo en un momento.", stoerung: "El servicio de imágenes informa de una avería. Normalmente puedo pintar imágenes — vuelve a intentarlo en unos minutos.", startet: "El servicio de imágenes se está iniciando{seit} y carga su modelo. Puedo pintar imágenes — vuelve a intentarlo en uno o dos minutos.", seit: " (desde hace {n} s)" }),
  fr: V({ malenFehl: "La peinture vient d'échouer — réessaie dans un instant.", stoerung: "Le service d'images signale une panne. Je peux normalement peindre des images — réessaie dans quelques minutes.", startet: "Le service d'images démarre{seit} et charge son modèle. Je peux peindre des images — réessaie dans une ou deux minutes.", seit: " (depuis {n} s)" }),
  pt: V({ malenFehl: "Pintar acabou de falhar — tenta novamente daqui a pouco.", stoerung: "O serviço de imagens está a reportar uma avaria. Normalmente consigo pintar imagens — tenta novamente daqui a alguns minutos.", startet: "O serviço de imagens está a iniciar{seit} e a carregar o seu modelo. Consigo pintar imagens — tenta novamente daqui a um ou dois minutos.", seit: " (há {n} s)" }),
  it: V({ malenFehl: "La pittura non è riuscita — riprova tra un attimo.", stoerung: "Il servizio immagini segnala un guasto. Di solito posso dipingere immagini — riprova tra qualche minuto.", startet: "Il servizio immagini si sta avviando{seit} e carica il suo modello. Posso dipingere immagini — riprova tra uno o due minuti.", seit: " (da {n} s)" }),
  tr: V({ malenFehl: "Çizim az önce başarısız oldu — lütfen birazdan tekrar dene.", stoerung: "Görsel hizmeti şu an bir arıza bildiriyor. Normalde görsel çizebilirim — lütfen birkaç dakika sonra tekrar dene.", startet: "Görsel hizmeti başlatılıyor{seit} ve modelini yüklüyor. Görsel çizebilirim — lütfen bir iki dakika sonra tekrar dene.", seit: " ({n} sn'dir)" }),
  ru: V({ malenFehl: "Рисование только что не удалось — попробуй ещё раз чуть позже.", stoerung: "Сервис изображений сообщает о сбое. Обычно я умею рисовать — попробуй ещё раз через несколько минут.", startet: "Сервис изображений запускается{seit} и загружает модель. Я умею рисовать — попробуй ещё раз через одну-две минуты.", seit: " (уже {n} с)" }),
  ar: V({ malenFehl: "فشل الرسم للتو — يرجى المحاولة مرة أخرى بعد قليل.", stoerung: "تبلّغ خدمة الصور عن عطل حاليًا. يمكنني عادةً رسم الصور — يرجى المحاولة بعد بضع دقائق.", startet: "خدمة الصور قيد التشغيل{seit} وتحمّل نموذجها. يمكنني رسم الصور — يرجى المحاولة بعد دقيقة أو دقيقتين.", seit: " (منذ {n} ث)" }),
  hi: V({ malenFehl: "चित्र बनाना अभी विफल हो गया — कृपया थोड़ी देर में फिर कोशिश करें।", stoerung: "इमेज सेवा अभी एक गड़बड़ी बता रही है। मैं सामान्य रूप से चित्र बना सकता हूँ — कृपया कुछ मिनट बाद फिर कोशिश करें।", startet: "इमेज सेवा शुरू हो रही है{seit} और अपना मॉडल लोड कर रही है। मैं चित्र बना सकता हूँ — कृपया एक-दो मिनट बाद फिर कोशिश करें।", seit: " ({n} से. से)" }),
  bn: V({ malenFehl: "ছবি আঁকা এইমাত্র ব্যর্থ হয়েছে — একটু পরে আবার চেষ্টা করো।", stoerung: "ছবি পরিষেবা এখন একটি ত্রুটি জানাচ্ছে। সাধারণত আমি ছবি আঁকতে পারি — কয়েক মিনিট পরে আবার চেষ্টা করো।", startet: "ছবি পরিষেবা চালু হচ্ছে{seit} এবং তার মডেল লোড করছে। আমি ছবি আঁকতে পারি — এক-দুই মিনিট পরে আবার চেষ্টা করো।", seit: " ({n} সে. ধরে)" }),
  id: V({ malenFehl: "Melukis baru saja gagal — silakan coba lagi sebentar lagi.", stoerung: "Layanan gambar sedang melaporkan gangguan. Biasanya aku bisa melukis gambar — silakan coba lagi dalam beberapa menit.", startet: "Layanan gambar sedang dimulai{seit} dan memuat modelnya. Aku bisa melukis gambar — silakan coba lagi dalam satu atau dua menit.", seit: " (sejak {n} dtk)" }),
  ja: V({ malenFehl: "描画に失敗しました — 少ししてからもう一度お試しください。", stoerung: "画像サービスで障害が発生しています。通常は画像を描けます — 数分後にもう一度お試しください。", startet: "画像サービスを起動中です{seit}。モデルを読み込んでいます。画像は描けます — 1〜2分後にもう一度お試しください。", seit: "（{n} 秒経過）" }),
  ko: V({ malenFehl: "그리기에 방금 실패했어요 — 잠시 후 다시 시도해 주세요.", stoerung: "이미지 서비스에 지금 장애가 있어요. 평소에는 이미지를 그릴 수 있어요 — 몇 분 후 다시 시도해 주세요.", startet: "이미지 서비스를 시작하는 중이에요{seit}. 모델을 불러오고 있어요. 이미지를 그릴 수 있어요 — 1-2분 후 다시 시도해 주세요.", seit: " ({n}초째)" }),
  zh: V({ malenFehl: "绘制刚刚失败 — 请稍后再试。", stoerung: "图片服务目前报告故障。我平时可以绘制图片 — 请几分钟后再试。", startet: "图片服务正在启动{seit}并加载模型。我可以绘制图片 — 请一两分钟后再试。", seit: "（已 {n} 秒）" })
});

/** Video-Texte einer Sprache; Unbekanntes faellt auf Deutsch. */
export function videoTexte(sprache) {
  return VIDEO_TEXTE[sprache] || VIDEO_TEXTE.de;
}

/** Absagen der Bild-Spur einer Sprache; Unbekanntes faellt auf Deutsch. */
export function bildFehler(sprache) {
  return BILD_FEHLER[sprache] || BILD_FEHLER.de;
}

// Fuer den Erzaehltext-Auftrag an smejj 1.0 ("in welcher Sprache sprechen?").
// Deutsch bleibt wortgleich zum alten Auftrag ("zwei kurzen deutschen Saetzen").
const ERZAEHL_SPRACHE = Object.freeze({
  de: "auf Deutsch", en: "auf Englisch", es: "auf Spanisch", fr: "auf Französisch", pt: "auf Portugiesisch",
  it: "auf Italienisch", tr: "auf Türkisch", ru: "auf Russisch", ar: "auf Arabisch", hi: "auf Hindi",
  bn: "auf Bengalisch", id: "auf Indonesisch", ja: "auf Japanisch", ko: "auf Koreanisch", zh: "auf Chinesisch (vereinfacht)"
});

/** "auf Französisch" — Zielsprache der gesprochenen Erzaehlung im Video. */
export function erzaehlSprache(sprache) {
  return ERZAEHL_SPRACHE[sprache] || ERZAEHL_SPRACHE.de;
}
