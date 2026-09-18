"""
FenixTeacher — AI Suggestion Flow
==================================
1) Tahlil agenti (weekly cron) — statistikani ko'rib taklif yaratadi
2) Telegram bot handler — tasdiqlash/rad etish tugmalari
3) Deploy pipeline trigger — tasdiqlangach ishga tushadi

Stack: aiogram (bot), Node API (endpoint chaqiruvlari), Claude API
(tahlil + kod generatsiya), GitHub Actions yoki shunga o'xshash CI (deploy)
"""

# ------------------------------------------------------------
# 1. TAHLIL AGENTI — har hafta yakshanba kuni ishga tushadi
#    (masalan cron: APScheduler yoki server crontab)
# ------------------------------------------------------------

async def weekly_analysis_job():
    """
    Node API'dagi statistikani yig'ib, Claude'ga tahlil uchun yuboradi.
    Faqat "muammo signali" borida taklif yaratadi — har hafta majburiy
    taklif chiqarish shart emas.
    """
    stats = await fetch_weekly_ui_stats()
    # stats = {
    #   "screen_dropoff": {"vocab_review": 0.42, "exam_mode": 0.08, ...},
    #   "button_tap_rate": {"nega_tugmasi": 0.03, "davom_et": 0.91, ...},
    #   "avg_time_on_screen_sec": {"chapter_intro": 41, ...},
    #   "error_events": [...],  # JS xatolar, agar bo'lsa
    # }

    if not has_significant_signal(stats):
        return  # hech narsa qilinmaydi — shovqin yaratilmaydi

    proposal = await claude_generate_ui_proposal(stats)
    # proposal = {
    #   "turi": "dizayn" | "matn" | "layout" | "logika",
    #   "xavf_darajasi": "xavfsiz" | "xavfli",
    #   "sabab": "...",
    #   "diff_matni": "...",   # git diff formatida
    #   "preview_url": "...",  # oldindan render qilingan screenshot
    # }

    suggestion_id = await save_ai_suggestion(proposal, asos_statistika=stats)
    await send_telegram_approval_card(suggestion_id, proposal)


def has_significant_signal(stats: dict) -> bool:
    """Chegara qiymatlar — shovqindan farqlash uchun."""
    for rate in stats.get("button_tap_rate", {}).values():
        if rate < 0.10:          # tugma deyarli bosilmayapti
            return True
    for sec in stats.get("avg_time_on_screen_sec", {}).values():
        if sec > 60:               # ekranda haddan tashqari uzoq turish
            return True
    return bool(stats.get("error_events"))


# ------------------------------------------------------------
# 2. TELEGRAM TASDIQLASH KARTASI (aiogram)
# ------------------------------------------------------------

from aiogram import Router
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton

router = Router()

async def send_telegram_approval_card(suggestion_id: str, proposal: dict):
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Qabul qilish",
                              callback_data=f"ai_sugg:approve:{suggestion_id}"),
        InlineKeyboardButton(text="❌ Rad etish",
                              callback_data=f"ai_sugg:reject:{suggestion_id}"),
    ]])
    matn = (
        f"🧠 *Fenix taklifi* ({proposal['turi']}, {proposal['xavf_darajasi']})\n\n"
        f"{proposal['sabab']}\n\n"
        f"[Preview]({proposal['preview_url']})"
    )
    msg = await bot.send_message(ADMIN_CHAT_ID, matn, reply_markup=kb,
                                  parse_mode="Markdown")
    await update_ai_suggestion(suggestion_id, telegram_message_id=msg.message_id)


@router.callback_query(lambda c: c.data.startswith("ai_sugg:"))
async def handle_ai_suggestion_decision(callback: CallbackQuery):
    _, action, suggestion_id = callback.data.split(":")
    suggestion = await get_ai_suggestion(suggestion_id)

    if action == "approve":
        await update_ai_suggestion(suggestion_id, holati="tasdiqlangan",
                                    qaror_qabul_at=now())
        await callback.message.edit_text(
            callback.message.text + "\n\n✅ *Tasdiqlandi — deploy boshlanmoqda...*",
            parse_mode="Markdown")
        await trigger_deploy_pipeline(suggestion_id)

    elif action == "reject":
        await update_ai_suggestion(suggestion_id, holati="rad_etilgan",
                                    qaror_qabul_at=now())
        await callback.message.edit_text(
            callback.message.text + "\n\n❌ *Rad etildi.*", parse_mode="Markdown")

    await callback.answer()


# ------------------------------------------------------------
# 3. DEPLOY PIPELINE TRIGGER
# ------------------------------------------------------------

async def trigger_deploy_pipeline(suggestion_id: str):
    """
    Tasdiqlangan taklifni git commit qilib, CI orqali deploy qiladi.
    Xato chiqsa — avtomatik oldingi commitga rollback qilinadi va
    admin'ga xabar yuboriladi.
    """
    suggestion = await get_ai_suggestion(suggestion_id)
    try:
        commit_hash = await apply_diff_and_commit(suggestion["diff_matni"])
        build_ok = await run_ci_build_and_test(commit_hash)

        if not build_ok:
            await rollback_to_previous_commit()
            await update_ai_suggestion(suggestion_id, holati="xato",
                                        xato_matni="CI build/test muvaffaqiyatsiz")
            await notify_admin(f"⚠️ Taklif {suggestion_id} deploy bo'lmadi, rollback qilindi.")
            return

        await deploy_to_production(commit_hash)
        await update_ai_suggestion(suggestion_id, holati="deploy_qilindi",
                                    commit_hash=commit_hash,
                                    deploy_qilingan_at=now())
        await notify_admin(f"✅ Taklif {suggestion_id} muvaffaqiyatli deploy qilindi.")

    except Exception as e:
        await rollback_to_previous_commit()
        await update_ai_suggestion(suggestion_id, holati="xato", xato_matni=str(e))
        await notify_admin(f"⚠️ Xato yuz berdi, avtomatik rollback: {e}")
