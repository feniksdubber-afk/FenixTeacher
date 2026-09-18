/**
 * tts.ts — Microsoft Edge TTS integratsiyasi (bepul, API kalit
 * kerak emas). Avval Google Cloud TTS ishlatilgan edi, lekin billing
 * hisobini yoqishda muammo chiqdi ("Billing setup can't be
 * completed"), shuning uchun msedge-tts npm paketiga o'tildi.
 *
 * msedge-tts Microsoft Edge brauzerining "Read Aloud" funksiyasi
 * ishlatadigan xuddi shu neural ovozlardan foydalanadi — sifat
 * Google TTS'ga juda yaqin, lekin hech qanday kalit yoki billing
 * shart emas.
 *
 * O'rnatish: npm install msedge-tts
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Til kodi → Edge TTS ovoz nomi.
 *
 * To'liq ovozlar ro'yxati:
 *   npx msedge-tts voices
 * yoki https://github.com/travisvn/msedge-tts saytida.
 */
const TIL_OVOZLARI: Record<string, string> = {
  de: "de-DE-KatjaNeural",
  en: "en-US-AriaNeural",
  ru: "ru-RU-SvetlanaNeural",
  uz: "uz-UZ-MadinaNeural",
};

const STANDART_OVOZ = TIL_OVOZLARI.de;

// Oddiy in-memory cache — bir xil (til, matn) juftligi uchun Edge
// TTS'ga qayta so'rov yubormaslik uchun (tezlik uchun, pul uchun
// emas — Edge TTS bepul, lekin baribir keraksiz kutishni oldini oladi).
const CACHE_MAX_YOZUV = 500;
const ovozCache = new Map<string, string>();

function cacheKalit(tilKodi: string, matn: string): string {
  return `${tilKodi}::${matn}`;
}

/** Matnni ovozga aylantiradi, base64-kodlangan MP3 qaytaradi. */
export async function synthesizeSpeech(matn: string, tilKodi: string): Promise<string> {
  if (!matn.trim()) {
    throw new Error("bo'sh matn ovozga aylantirilmaydi");
  }

  const kesilganMatn = matn.slice(0, 500);
  const kalit = cacheKalit(tilKodi, kesilganMatn);

  const keshlangan = ovozCache.get(kalit);
  if (keshlangan) {
    return keshlangan;
  }

  const ovozNomi = TIL_OVOZLARI[tilKodi];
  if (!ovozNomi) {
    console.warn(
      `[tts] "${tilKodi}" til kodi qo'llab-quvvatlanmaydi — standart ovoz (de-DE) ishlatiladi`
    );
  }
  const tanlanganOvoz = ovozNomi ?? STANDART_OVOZ;

  const tts = new MsEdgeTTS();
  await tts.setMetadata(tanlanganOvoz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = await tts.toStream(kesilganMatn);

  const audioBuffer: Buffer = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end", () => resolve(Buffer.concat(chunks)));
    audioStream.on("error", (err: Error) => reject(err));
  });

  const audioContent = audioBuffer.toString("base64");

  if (ovozCache.size >= CACHE_MAX_YOZUV) {
    const birinchiKalit = ovozCache.keys().next().value;
    if (birinchiKalit !== undefined) ovozCache.delete(birinchiKalit);
  }
  ovozCache.set(kalit, audioContent);

  return audioContent;
}
