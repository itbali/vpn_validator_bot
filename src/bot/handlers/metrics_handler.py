import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from datetime import datetime, timedelta

from src.monitoring.metrics import MetricsCollector
from config.settings import ADMIN_IDS
from src.database.operations import get_db, get_user_stats, get_server_stats
from src.vpn.outline_api import OutlineVPN

logger = logging.getLogger('bot.metrics_handler')
metrics = MetricsCollector()
vpn = OutlineVPN()

async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show VPN usage statistics"""
    if not update.message:
        return

    user = update.effective_user
    
    keyboard = [
        [
            InlineKeyboardButton("📊 Общая статистика", callback_data='total_stats'),
            InlineKeyboardButton("⏰ Пиковые часы", callback_data='peak_hours')
        ],
        [
            InlineKeyboardButton("📈 Статистика по дням", callback_data='stats_by_day'),
            InlineKeyboardButton("👥 Активные пользователи", callback_data='active_users')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "*Статистика VPN*\n\n"
        "Выберите тип статистики:",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def handle_stats_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle statistics button clicks"""
    query = update.callback_query
    await query.answer()
    
    db = next(get_db())
    try:
        if query.data == 'total_stats':
            # Получаем общую статистику сервера
            stats = get_server_stats(db)
            
            message = (
                "*Общая статистика VPN:*\n\n"
                f"👥 Всего пользователей: {stats['total_users']}\n"
                f"🔑 Активных ключей: {stats['active_keys']}\n"
                f"📊 Общий трафик: {stats['total_usage'] / (1024*1024*1024):.2f} GB\n"
            )
            
            await query.message.edit_text(
                message,
                parse_mode='Markdown'
            )
            
        elif query.data == 'peak_hours':
            # В будущем можно добавить анализ пиковых часов
            message = (
                "*Пиковые часы использования:*\n\n"
                "🕒 Функция в разработке"
            )
            
            await query.message.edit_text(
                message,
                parse_mode='Markdown'
            )
            
        elif query.data == 'stats_by_day':
            # В будущем можно добавить статистику по дням
            message = (
                "*Статистика по дням:*\n\n"
                "📅 Функция в разработке"
            )
            
            await query.message.edit_text(
                message,
                parse_mode='Markdown'
            )
            
        elif query.data == 'active_users':
            # Получаем список активных пользователей
            all_keys = vpn.get_all_keys()
            active_users = []
            
            for key in all_keys:
                key_info = vpn.get_key_info(key['id'])
                if key_info.get('last_active'):
                    last_active = datetime.fromisoformat(key_info['last_active'])
                    if datetime.now() - last_active < timedelta(days=7):
                        active_users.append({
                            'name': key['name'],
                            'last_active': last_active,
                            'data_usage': key_info.get('data_usage', 0)
                        })
            
            if active_users:
                message = "*Активные пользователи (за последние 7 дней):*\n\n"
                for user in active_users:
                    message += (
                        f"👤 {user['name']}\n"
                        f"📅 Последняя активность: {user['last_active'].strftime('%Y-%m-%d %H:%M')}\n"
                        f"📊 Трафик: {user['data_usage'] / (1024*1024*1024):.2f} GB\n\n"
                    )
            else:
                message = "*Активные пользователи:*\n\nНет активных пользователей за последние 7 дней"
            
            await query.message.edit_text(
                message,
                parse_mode='Markdown'
            )
    
    finally:
        db.close() 