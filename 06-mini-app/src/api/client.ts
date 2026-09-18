/**
 * client.ts — Node API bilan aloqa. Telegram Mini App SDK'dan olingan
 * initData har so'rovga `X-Telegram-Init-Data` header sifatida
 * qo'shiladi (backend shu bilan telegramAuth orqali tekshiradi).
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

function initData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.xato ? JSON.stringify(body.xato) : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};

// Telegram WebApp SDK'ning minimal type e'loni (rasmiy @types yo'q)
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        ready: () => void;
        expand: () => void;
        themeParams: Record<string, string>;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          setText: (t: string) => void;
        };
      };
    };
  }
}
