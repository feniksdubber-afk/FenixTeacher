/**
 * claude.ts — barcha Claude API chaqiruvlari FAQAT shu modul orqali
 * o'tishi kerak (PDF-service ham, Mini App backend mantiqi ham).
 * Sabab: har bir chaqiruv narxi/xatoligi `ai_call_logs` jadvaliga
 * yoziladi — bu narx nazorati va debugging uchun yagona manba.
 */
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db/pool.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Taxminiy narxlar (USD / 1M token) — haqiqiy hisob-kitob uchun
// Anthropic narxlar sahifasidan yangilanib turishi kerak.
const NARX_PER_1M: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
};

interface CallClaudeParams {
  model: "claude-sonnet-4-6" | "claude-haiku-4-5";
  maqsad: string; // "tushuntirish","mashq_generatsiya","tekshirish","tasniflash","unit_aniqlash",...
  system?: string;
  prompt: string;
  maxTokens?: number;
  userId?: string | null;
}

export async function callClaude({
  model,
  maqsad,
  system,
  prompt,
  maxTokens = 1500,
  userId = null,
}: CallClaudeParams): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const narx = NARX_PER_1M[model];
    const narxi_usd = narx
      ? (response.usage.input_tokens * narx.input +
          response.usage.output_tokens * narx.output) /
        1_000_000
      : null;

    await query(
      `INSERT INTO ai_call_logs
         (user_id, model, maqsad, input_tokens, output_tokens, narxi_usd, muvaffaqiyatli)
       VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [
        userId,
        model,
        maqsad,
        response.usage.input_tokens,
        response.usage.output_tokens,
        narxi_usd,
      ]
    );

    return text;
  } catch (err) {
    const xato_matni = err instanceof Error ? err.message : String(err);
    await query(
      `INSERT INTO ai_call_logs
         (user_id, model, maqsad, muvaffaqiyatli, xato_matni)
       VALUES ($1,$2,$3,false,$4)`,
      [userId, model, maqsad, xato_matni]
    );
    throw err;
  }
}
