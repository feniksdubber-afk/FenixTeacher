/**
 * pdfService.ts — Python PDF-service mikroservisi bilan aloqa.
 * Oqim: kitob yuklanadi → shu yerdan POST /process chaqiriladi →
 * job_id qaytadi → polling bilan GET /status/{job_id} → tayyor
 * bo'lganda natija chapters jadvaliga yoziladi.
 *
 * FIX (#2): PDF-service'ning /process va /status endpoint'lari endi
 * INTERNAL_SERVICE_SECRET talab qiladi (qarang 04-pdf-service/app/main.py) —
 * shuning uchun har ikki chaqiruvga ham X-Internal-Secret header'i
 * qo'shildi (avval umuman yuborilmasdi).
 */
const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL ?? "http://localhost:8001";
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? "";

function internalHeaders(): Record<string, string> {
  return INTERNAL_SERVICE_SECRET ? { "X-Internal-Secret": INTERNAL_SERVICE_SECRET } : {};
}

interface ProcessResult {
  job_id: string;
  holati: string;
}

export async function startPdfProcessing(
  bookId: string,
  fileUrl: string,
  tilKodi: string
): Promise<ProcessResult> {
  const res = await fetch(`${PDF_SERVICE_URL}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...internalHeaders() },
    body: JSON.stringify({ book_id: bookId, file_url: fileUrl, til_kodi: tilKodi }),
  });
  if (!res.ok) {
    throw new Error(`PDF-service /process xatosi: ${res.status}`);
  }
  return res.json() as Promise<ProcessResult>;
}

export interface ChapterRef {
  tartib_raqami: number;
  sahifa_boshi: number;
  sahifa_oxiri: number | null;
}

/** Mashq extractor'ini ishga tushiradi (`/process`dan mustaqil job).
 * Natija: waitForPdfJob(job_id) -> `natija.mashqlar`. */
export async function startExerciseExtraction(
  bookId: string,
  fileUrl: string,
  chapters: ChapterRef[]
): Promise<ProcessResult> {
  const res = await fetch(`${PDF_SERVICE_URL}/extract-exercises`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...internalHeaders() },
    body: JSON.stringify({ book_id: bookId, file_url: fileUrl, chapters }),
  });
  if (!res.ok) {
    throw new Error(`PDF-service /extract-exercises xatosi: ${res.status}`);
  }
  return res.json() as Promise<ProcessResult>;
}

export async function getPdfJobStatus(jobId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${PDF_SERVICE_URL}/status/${jobId}`, { headers: internalHeaders() });
  if (!res.ok) {
    throw new Error(`PDF-service /status xatosi: ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Kitob qayta ishlanishini pollab, tugaguncha kutadi (oddiy MVP yechim —
 * bitta foydalanuvchi uchun yetarli; kelajakda webhook'ga o'tish mumkin).
 */
export async function waitForPdfJob(
  jobId: string,
  { intervalMs = 2000, timeoutMs = 5 * 60 * 1000 } = {}
): Promise<Record<string, unknown>> {
  const boshlandi = Date.now();
  while (Date.now() - boshlandi < timeoutMs) {
    const status = await getPdfJobStatus(jobId);
    if (status.holati === "tayyor" || status.holati === "xato") {
      return status;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("PDF-service javobi kutish vaqti tugadi (timeout)");
}
