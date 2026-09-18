/**
 * tts.ts — Google Cloud Text-to-Speech integratsiyasi (loyiha
 * hujjati: TTS aynan Google Cloud TTS, Gemini emas — chalkashtirmaslik
 * kerak). `GOOGLE_TTS_API_KEY` o'rnatilmagan bo'lsa xizmat ishlamaydi;
 * chaqiruvchi buni ushlab, foydalanuvchiga tushunarli xato qaytarishi
 * kerak (route shu tarzda yozilgan).
 *
 * ESLATMA: bu modul real Google Cloud API kaliti bilan HALI SINALMAGAN
 * (kredensial bu muhitda yo'q) — faqat Google'ning rasmiy REST
 * formatiga (texttospeech.googleapis.com/v1/text:synthesize) asosan
 * yozilgan. Ishga tushirishdan oldin haqiqiy kalit bilan sinab ko'rish
 * kerak.
 *
 * v8.1 tuzatish 1: "uz-UZ-Standard-A" olib tashlandi — Google TTS
 * o'zbek tilini rasmiy qo'llab-quvvatlamaydi (2025 holati) va agar
 * mapda mavjud bo'lsa `??` fallback ishlamasdi (noto'g'ri ovoz nomi
 * bilan Google'ga so'rov ketardi). Endi noto'g'ri til_kodi kelsa
 * standart (de) ovoz tanlangani aniq ko'rinadi va logga tushadi.
 *
 * v8.1 tuzatish 2: in-memory cache qo'shildi — bir xil (til, matn)
 * juftligi uchun Google'ga qayta so'rov ketmaydi. Google TTS belgi
 * bo'yicha hisob-kitob qiladi, cache bo'lmasa har bir tovush tugmasi
 * bosilganda pul to'lanadi. Server qayta ishga tushganda cache
 * tozalanadi — loyiha hajmi uchun bu yetarli, doimiy cache kerak
 * bo'lsa Redis/DB'ga ko'chirish mumkin.
 */

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * Til kodi → Google TTS ovoz sozlamalari.
 *
 * MUHIM: bu map'da faqat Google rasmiy qo'llab-quvvatlaydigan tillar
 * bo'lishi kerak. Noto'g'ri til kodi kelsa — standart (de) ishlatiladi.
 * Yangi til qo'shishdan oldin:
 *   https://cloud.google.com/text-to-speech/docs/voices
 * dan mos ovoz nomini tasdiqlang.
 */
const TIL_OVOZLARI: Record<string, { languageCode: string; name: string }> = {
  de: { languageCode: "de-DE", name: "de-DE-Standard-F" },
  en: { languageCode: "en-US", name: "en-US-Standard-F" },
  ru: { languageCode: "ru-RU", name: "ru-RU-Standard-A" },
  // "uz" ataylab qo'shilmagan: Google TTS o'zbek tilini (hozircha)
  // rasmiy qo'llab-quvvatlamaydi — haqiqiy qo'shilganda yuqoridagi
  // havola orqali ovoz nomini tekshirib qo'shing.
};

const STANDART_OVOZ = TIL_OVOZLARI.de;

interface GoogleTtsResponse {
  audioContent: string; // base64 MP3
}

// FIX v8.1: oddiy in-memory cache. Kalit "tilKodi::matn" — xotira
// cheksiz o'smasligi uchun oddiy hajm chegarasi bilan (LRU emas,
// eng eski yozuv chegaradan oshganda tozalanadi — loyiha hajmiga mos
// oddiy yechim).
const CACHE_MAX_YOZUV = 500;
const ovozCache = new Map<string, string>();

function cacheKalit(tilKodi: string, matn: string): string {
  return `${tilKodi}::${matn}`;
}

/** Matnni ovozga aylantiradi, base64-kodlangan MP3 qaytaradi. */
export async function synthesizeSpeech(matn: string, tilKodi: string): Promise<string> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_TTS_API_KEY o'rnatilmagan — TTS xizmati sozlanmagan");
  }
  if (!matn.trim()) {
    throw new Error("bo'sh matn ovozga aylantirilmaydi");
  }

  const kesilganMatn = matn.slice(0, 500);
  const kalit = cacheKalit(tilKodi, kesilganMatn);

  const keshlangan = ovozCache.get(kalit);
  if (keshlangan) {
    return keshlangan;
  }

  // Noto'g'ri til kodi kelganda standart (nemis) ovoz ishlatiladi.
  // Bu holat logga tushadi — monitoring uchun foydali.
  const ovoz = TIL_OVOZLARI[tilKodi];
  if (!ovoz) {
    console.warn(
      `[tts] "${tilKodi}" til kodi qo'llab-quvvatlanmaydi — standart ovoz (de-DE) ishlatiladi`
    );
  }
  const tanlanganOvoz = ovoz ?? STANDART_OVOZ;

  const res = await fetch(`${TTS_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: kesilganMatn },
      voice: { languageCode: tanlanganOvoz.languageCode, name: tanlanganOvoz.name },
      audioConfig: { audioEncoding: "MP3", speakingRate: 0.95 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google TTS xatosi: HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as GoogleTtsResponse;
  if (!data.audioContent) {
    throw new Error("Google TTS bo'sh javob qaytardi");
  }

  if (ovozCache.size >= CACHE_MAX_YOZUV) {
    const birinchiKalit = ovozCache.keys().next().value;
    if (birinchiKalit !== undefined) ovozCache.delete(birinchiKalit);
  }
  ovozCache.set(kalit, data.audioContent);

  return data.audioContent;
}
