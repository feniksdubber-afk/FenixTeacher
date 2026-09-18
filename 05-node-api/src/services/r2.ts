/**
 * r2.ts — Cloudflare R2 bilan ishlash (S3-mos API). Fayllar Node
 * orqali oqib o'tmaydi: Mini App presigned PUT URL orqali to'g'ridan-
 * to'g'ri R2'ga yuklaydi, PDF-service esa presigned GET URL orqali
 * o'qiydi. Node faqat URL generatsiya qiladi va DB'da `fayl_kaliti`ni
 * saqlaydi.
 *
 * ENV: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET ?? "fenixteacher";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const RUXSAT_ETILGAN_TURLAR: Record<string, string> = {
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** Yuklashdan oldin: yangi fayl kaliti + PUT uchun presigned URL. */
export async function createUploadUrl(
  contentType: string,
  { expiresInSec = 1800 } = {}
): Promise<{ file_key: string; upload_url: string }> {
  const kengaytma = RUXSAT_ETILGAN_TURLAR[contentType];
  if (!kengaytma) {
    throw new Error(`ruxsat etilmagan fayl turi: ${contentType}`);
  }

  const file_key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${kengaytma}`;

  const upload_url = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: bucket, Key: file_key, ContentType: contentType }),
    { expiresIn: expiresInSec }
  );

  return { file_key, upload_url };
}

/** PDF-service kabi ichki iste'molchilar uchun: vaqtinchalik GET URL. */
export async function createDownloadUrl(
  file_key: string,
  { expiresInSec = 600 } = {}
): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: bucket, Key: file_key }),
    { expiresIn: expiresInSec }
  );
}
