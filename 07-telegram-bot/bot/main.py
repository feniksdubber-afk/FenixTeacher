"""
main.py — @FenixDeutschBot uchun minimal aiogram qatlami.

Vazifasi hozircha atayin tor: xabar yuborish orqali Mini App'ni
ochish (`/start`) va oddiy holat tekshiruvi (`/holat`). Butun o'quv
mantig'i (bo'lim, kitob, mashq, learner_profile) Node API + Mini
App'da yashaydi — bot faqat "eshik" vazifasini bajaradi.

Nega long polling (webhook emas): bitta foydalanuvchi uchun trafik
juda kam, Caddy'da qo'shimcha route ochish shart emas, va Hetzner
serverida boshqa xizmat (Afsona TV) bilan portlarda to'qnashuv xavfi
yo'q. Foydalanuvchi soni oshsa yoki javob tezligi muhim bo'lib qolsa
webhook'ga o'tish kerak bo'ladi (`docs/` da eslatma qoldirilgan).
"""

import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("fenix-bot")

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
MINI_APP_URL = os.environ["MINI_APP_URL"]  # masalan: https://fenix.sizning-domeningiz.uz
NODE_API_URL = os.environ.get("NODE_API_URL", "http://node-api:4000")

dp = Dispatcher()


def _mini_app_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📚 Fenix bilan o'rganishni boshlash",
                    web_app=WebAppInfo(url=MINI_APP_URL),
                )
            ]
        ]
    )


@dp.message(CommandStart())
async def cmd_start(message: Message) -> None:
    ism = message.from_user.first_name if message.from_user else "do'stim"
    await message.answer(
        f"Salom, {ism}! Men Fenix — sening shaxsiy til-ustozingman.\n\n"
        "Boshlash uchun quyidagi tugmani bos — u yerda bo'limingni "
        "tanlaysan, kitob yuklaysan va men bilan o'rganishni "
        "boshlaysan.",
        reply_markup=_mini_app_keyboard(),
    )


@dp.message(Command("holat"))
async def cmd_status(message: Message) -> None:
    """Node API'ning /health'iga murojaat qilib, tizim ishlayotganini
    tekshiradi — foydalanuvchi (yoki Shohruxxon) tez diagnostika uchun
    ishlatishi mumkin."""
    import urllib.request
    import urllib.error

    try:
        with urllib.request.urlopen(f"{NODE_API_URL}/health", timeout=5) as resp:
            ok = resp.status == 200
    except (urllib.error.URLError, TimeoutError):
        ok = False

    matn = "✅ Hammasi ishlayapti." if ok else "⚠️ Server bilan bog'lanib bo'lmadi."
    await message.answer(matn)


@dp.message(F.text)
async def fallback(message: Message) -> None:
    """Hozircha bot chatda suhbatlashmaydi — bu Mini App'ning vazifasi.
    Foydalanuvchini adashtirmaslik uchun aniq yo'naltiramiz."""
    await message.answer(
        "Suhbat va darslar Mini App ichida bo'ladi — /start bosib oching.",
        reply_markup=_mini_app_keyboard(),
    )


async def main() -> None:
    bot = Bot(token=BOT_TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
