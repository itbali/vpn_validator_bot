import logging
import asyncio
from datetime import datetime
from telegram import Update, BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import Application, CommandHandler, ContextTypes, CallbackContext, CallbackQueryHandler, MessageHandler, filters, ConversationHandler
from config import BOT_TOKEN, CHANNEL_ID
from outline_api import OutlineVPN

# VPN Instructions
VPN_INSTRUCTIONS = """
*Инструкция по подключению к VPN:*

📍 *Информация о сервере:*
• Местоположение: Istanbul, Турция
• Провайдер: Ultahost, Inc.
• IP: 188.132.184.170

1️⃣ *Установите приложение Outline:*
• [Android - Google Play](https://play.google.com/store/apps/details?id=org.outline.android.client)
• [iPhone/iPad](https://apps.apple.com/app/outline-app/id1356177741)
• [Mac](https://apps.apple.com/pl/app/outline-secure-internet-access/id1356178125?mt=12)
• [Windows](https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe)
• [Linux](https://s3.amazonaws.com/outline-releases/client/linux/stable/Outline-Client.AppImage)

2️⃣ *Подключение:*
• Откройте приложение Outline
• Нажмите на кнопку "➕" или "Добавить сервер"
• Вставьте вашу ссылку доступа (она указана ниже)
• Нажмите "Подключиться"

❗️ *Важно:*
• VPN работает только при наличии подписки на канал
• При выходе из канала доступ автоматически отключается
• Не передавайте вашу ссылку другим людям
• При проблемах с подключением перезапустите приложение

*Ваша ссылка для подключения:*
"""

MENTOR_INFO_BASE = """
*Услуги ментора по фронтенд-разработке:*

👨‍💻 @alexDiuzhev предоставляет следующие услуги:

• [Вводная консультация](https://planerka.app/aleksei-diuzhev/vvodnaya-vstrecha-do-50-minut) - первая встреча, обсуждение целей и плана обучения
• [Помощь с составлением резюме](https://planerka.app/aleksei-diuzhev/razbor-rezyume) - помогу сделать ваше резюме привлекательным для работодателей
• [Мок-собеседование](https://planerka.app/aleksei-diuzhev/mokovoe-sobesedovanie) - подготовка к реальным собеседованиям
"""

MENTOR_INFO_PREMIUM = """

*Для учеников с подпиской доступно:*
• [Персональная консультация](https://planerka.app/aleksei-diuzhev/vstrecha-s-uchenikom---1ch) - разбор любых вопросов по обучению

❗️ Записаться можно по ссылкам выше
"""

HELP_MESSAGE = """
*Доступные команды:*

/start - Получить доступ к VPN
/mentor - Информация о менторе и услугах
/status - Проверить статус вашего VPN
/regenerate - Перевыпустить ключ
/delete - Удалить текущий ключ
/help - Показать это сообщение
/faq - Частые вопросы по VPN

При возникновении проблем используйте команду /support
"""

FAQ_MESSAGE = """
*Частые вопросы по VPN:*

*1. Как установить VPN на iPhone?*
• Установите приложение Outline из App Store
• Откройте полученную ссылку - приложение настроится автоматически
• Нажмите "Подключиться"

*2. Как установить VPN на Android?*
• Установите приложение Outline из Google Play
• Скопируйте полученную ссылку
• Откройте приложение и нажмите "+"
• Вставьте ссылку и нажмите "Подключиться"

*3. Что делать если VPN не работает?*
• Проверьте подписку на канал
• Перезапустите приложение Outline
• Используйте команду /regenerate для получения нового ключа
• Если проблема осталась, напишите в поддержку

*4. Почему отключился VPN?*
VPN автоматически отключается при выходе из канала. Для возобновления работы:
• Вернитесь в канал
• Используйте команду /start

*5. Можно ли использовать VPN на нескольких устройствах?*
Да, один ключ можно использовать на всех ваших устройствах.
"""

SUPPORT_MESSAGE = """
*Нужна помощь?*
Выберите тип проблемы:
"""

# Constants
MEMBERSHIP_CHECK_INTERVAL = 300  # 5 minutes in seconds
ADMIN_IDS = [341799678]  # @AlexDiuzhev's ID

ADMIN_MENU_MESSAGE = """
*Панель администратора VPN*

Выберите действие:
"""

# Добавляем состояния для админского меню
WAITING_FOR_USERNAME_INFO = 1
WAITING_FOR_USERNAME_DELETE = 2

# Добавляем клавиатуру для старта
START_KEYBOARD = ReplyKeyboardMarkup([
    [KeyboardButton("📊 Статус"), KeyboardButton("❓ FAQ")],
    [KeyboardButton("🔄 Перевыпустить"), KeyboardButton("❌ Удалить")],
    [KeyboardButton("💬 Поддержка"), KeyboardButton("ℹ️ Помощь")]
], resize_keyboard=True)

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.DEBUG,
    handlers=[
        logging.FileHandler('/opt/vpn_bot/bot.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Outline VPN
vpn = OutlineVPN()

def get_user_identifier(user) -> str:
    """Get best available user identifier"""
    parts = []
    
    # Всегда добавляем username или ID в начало
    if user.username:
        parts.append(f"@{user.username}")
    else:
        parts.append(f"id{user.id}")
    
    # Добавляем полное имя, если оно есть
    if user.full_name:
        parts.append(user.full_name)
        
    return " - ".join(parts)

def find_user_key(user) -> dict:
    """Find existing key for user by username or ID"""
    all_keys = vpn.get_all_keys()
    user_identifiers = [
        f"@{user.username}" if user.username else None,
        f"id{user.id}"
    ]
    user_identifiers = [x for x in user_identifiers if x]  # Убираем None

    for key in all_keys:
        key_name = key.get('name', '')
        if not key_name:
            continue
        # Проверяем, начинается ли имя ключа с любого из идентификаторов пользователя
        if any(key_name.startswith(identifier) for identifier in user_identifiers):
            return key
    return None

async def get_channel_members(context: ContextTypes.DEFAULT_TYPE) -> set:
    """Get all current channel members"""
    try:
        members = set()
        # Получаем информацию о всех администраторах
        admins = await context.bot.get_chat_administrators(chat_id=CHANNEL_ID)
        for admin in admins:
            members.add(admin.user.id)
        
        # К сожалению, Telegram API не предоставляет метод для получения всех участников канала
        # Поэтому для обычных участников мы все равно будем проверять индивидуально
        return members
    except Exception as e:
        logger.error(f"Error getting channel members: {e}")
        return set()

async def check_channel_membership(user_id: int, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Check if user is a member of the required channel"""
    try:
        member = await context.bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        return member.status in ['member', 'administrator', 'creator']
    except Exception as e:
        logger.error(f"Error checking channel membership: {e}")
        return False

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    if not update.message:
        return

    user = update.effective_user
    user_identifier = get_user_identifier(user)
    
    if not await check_channel_membership(user.id, context):
        await update.message.reply_text(
            "Извините, но я вас не знаю. Если вы хотите получить доступ к VPN, "
            "пожалуйста, напишите @alexDiuzhev"
        )
        return

    # Check if user already has a key
    existing_key = find_user_key(user)
    if existing_key:
        await update.message.reply_text(
            VPN_INSTRUCTIONS + f"\n`{existing_key['accessUrl']}`",
            parse_mode='Markdown',
            disable_web_page_preview=True,
            reply_markup=START_KEYBOARD
        )
        return

    # Create new VPN access for the user
    vpn_key = vpn.create_access_key(user_identifier)
    if vpn_key:
        await update.message.reply_text(
            VPN_INSTRUCTIONS + f"\n`{vpn_key['accessUrl']}`",
            parse_mode='Markdown',
            disable_web_page_preview=True,
            reply_markup=START_KEYBOARD
        )
    else:
        logger.error(f"Failed to create VPN access for user {user_identifier}")
        await update.message.reply_text(
            "Извините, произошла ошибка при создании доступа к VPN. "
            "Пожалуйста, попробуйте позже или обратитесь к администратору.",
            reply_markup=START_KEYBOARD
        )

async def mentor(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send mentor contact information"""
    if not update.message:
        return
    
    user = update.effective_user
    is_member = await check_channel_membership(user.id, context)
    
    # Формируем сообщение в зависимости от статуса подписки
    message = MENTOR_INFO_BASE
    if is_member:
        message += MENTOR_INFO_PREMIUM
    
    await update.message.reply_text(
        message,
        parse_mode='Markdown',
        disable_web_page_preview=True
    )

async def regenerate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Regenerate user's access key"""
    if not update.message:
        return

    user = update.effective_user
    
    if not await check_channel_membership(user.id, context):
        await update.message.reply_text(
            "Извините, но я вас не знаю. Если вы хотите получить доступ к VPN, "
            "пожалуйста, напишите @alexDiuzhev"
        )
        return

    # Находим существующий ключ
    existing_key = find_user_key(user)
    if not existing_key:
        await update.message.reply_text(
            "У вас нет активного ключа. Используйте команду /start чтобы получить новый ключ."
        )
        return

    # Удаляем старый ключ
    vpn.delete_access_key(existing_key['id'])
    
    # Создаем новый ключ
    user_identifier = get_user_identifier(user)
    new_key = vpn.create_access_key(user_identifier)
    
    if new_key:
        await update.message.reply_text(
            "✅ Ваш ключ был успешно перевыпущен!\n\n" + 
            VPN_INSTRUCTIONS + f"\n`{new_key['accessUrl']}`",
            parse_mode='Markdown',
            disable_web_page_preview=True
        )
    else:
        logger.error(f"Failed to regenerate VPN access for user {user_identifier}")
        await update.message.reply_text(
            "Извините, произошла ошибка при перевыпуске ключа. "
            "Пожалуйста, попробуйте позже или обратитесь к ментору."
        )

async def delete(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Delete user's access key"""
    if not update.message:
        return

    user = update.effective_user
    
    # Находим существующий ключ
    existing_key = find_user_key(user)
    if not existing_key:
        await update.message.reply_text(
            "У вас нет активного ключа."
        )
        return

    # Удаляем ключ
    if vpn.delete_access_key(existing_key['id']):
        await update.message.reply_text(
            "✅ Ваш ключ был успешно удален.\n"
            "Используйте команду /start чтобы получить новый ключ."
        )
    else:
        await update.message.reply_text(
            "Извините, произошла ошибка при удалении ключа. "
            "Пожалуйста, попробуйте позже или обратитесь к ментору."
        )

async def check_memberships(context: CallbackContext) -> None:
    """Periodic task to check channel memberships and remove VPN access if needed"""
    # Получаем список администраторов канала
    admin_members = await get_channel_members(context)
    
    # Получаем все ключи
    all_keys = vpn.get_all_keys()
    keys_to_check = []
    
    # Сначала собираем все ключи, которые нужно проверить
    for key in all_keys:
        try:
            key_name = key.get('name', '')
            if not key_name or not key_name.startswith("id"):
                continue
                
            try:
                user_id = int(key_name.split(" - ")[0][2:])  # Убираем "id" из начала
                # Если пользователь админ, пропускаем проверку
                if user_id in admin_members:
                    continue
                keys_to_check.append((key['id'], user_id, key_name))
            except (ValueError, IndexError):
                continue
        except Exception as e:
            logger.error(f"Error processing key {key['id']}: {e}")
    
    # Теперь проверяем членство только для обычных пользователей
    for key_id, user_id, key_name in keys_to_check:
        try:
            if not await check_channel_membership(user_id, context):
                vpn.delete_access_key(key_id)
                logger.error(f"Removed VPN access for user {key_name}")
            # Делаем паузу в 1.5 секунды после каждой проверки
            await asyncio.sleep(1.5)
        except Exception as e:
            logger.error(f"Error checking membership for key {key_id}: {e}")

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send help message"""
    if not update.message:
        return
    
    await update.message.reply_text(
        HELP_MESSAGE,
        parse_mode='Markdown'
    )

async def faq_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send FAQ message"""
    if not update.message:
        return
    
    await update.message.reply_text(
        FAQ_MESSAGE,
        parse_mode='Markdown'
    )

async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Check VPN status"""
    if not update.message:
        return

    user = update.effective_user
    is_member = await check_channel_membership(user.id, context)
    existing_key = find_user_key(user)
    
    status_message = "*Статус вашего VPN:*\n\n"
    
    if not is_member:
        status_message += "❌ Вы не подписаны на канал\n"
    else:
        status_message += "✅ Вы подписаны на канал\n"
    
    if existing_key:
        status_message += "✅ У вас есть активный ключ VPN\n"
    else:
        status_message += "❌ У вас нет активного ключа VPN\n"
    
    await update.message.reply_text(
        status_message,
        parse_mode='Markdown'
    )

async def support_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Provide support options"""
    if not update.message:
        return
    
    keyboard = [
        [
            InlineKeyboardButton("🔄 Проблемы с подключением", callback_data='support_connection'),
            InlineKeyboardButton("📱 Проблемы с приложением", callback_data='support_app')
        ],
        [
            InlineKeyboardButton("💳 Вопросы по оплате", callback_data='support_payment'),
            InlineKeyboardButton("❓ Другой вопрос", callback_data='support_other')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        SUPPORT_MESSAGE,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def support_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle support button clicks"""
    query = update.callback_query
    await query.answer()
    
    support_responses = {
        'support_connection': (
            "*Проблемы с подключением:*\n\n"
            "1. Проверьте подписку на канал\n"
            "2. Перезапустите приложение\n"
            "3. Используйте /regenerate для получения нового ключа\n\n"
            "Если проблема осталась, напишите @alexDiuzhev"
        ),
        'support_app': (
            "*Проблемы с приложением:*\n\n"
            "1. Удалите и переустановите приложение\n"
            "2. Используйте /start для получения новой ссылки\n\n"
            "Если проблема осталась, напишите @alexDiuzhev"
        ),
        'support_payment': (
            "*Вопросы по оплате:*\n\n"
            "По вопросам оплаты обратитесь к @alexDiuzhev"
        ),
        'support_other': (
            "*Другие вопросы:*\n\n"
            "Для решения других вопросов напишите @alexDiuzhev"
        )
    }
    
    await query.message.edit_text(
        support_responses.get(query.data, "Пожалуйста, напишите @alexDiuzhev"),
        parse_mode='Markdown'
    )

async def setup_commands(application: Application) -> None:
    """Setup bot commands in the menu"""
    commands = [
        BotCommand("start", "Получить доступ к VPN"),
        BotCommand("mentor", "Информация о менторе"),
        BotCommand("status", "Проверить статус VPN"),
        BotCommand("regenerate", "Перевыпустить ключ"),
        BotCommand("delete", "Удалить ключ"),
        BotCommand("help", "Помощь по командам"),
        BotCommand("faq", "Частые вопросы"),
        BotCommand("support", "Техническая поддержка"),
        BotCommand("admin", "Панель администратора")
    ]
    await application.bot.set_my_commands(commands)

async def is_admin(user_id: int) -> bool:
    """Check if user is admin"""
    return user_id in ADMIN_IDS

async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show admin menu"""
    if not update.message:
        return

    user_id = update.effective_user.id
    logger.error(f"Admin command attempted by user ID: {user_id}")

    if not await is_admin(user_id):
        logger.error(f"Access denied for user ID: {user_id}")
        return

    keyboard = [
        [
            InlineKeyboardButton("📊 Статистика VPN", callback_data='admin_stats'),
            InlineKeyboardButton("🔑 Список ключей", callback_data='admin_keys')
        ],
        [
            InlineKeyboardButton("👥 Информация о пользователе", callback_data='admin_user_input'),
            InlineKeyboardButton("❌ Удалить ключ", callback_data='admin_delete_input')
        ],
        [
            InlineKeyboardButton("💤 Неактивные пользователи", callback_data='admin_inactive')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        ADMIN_MENU_MESSAGE,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def admin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle admin menu button clicks"""
    query = update.callback_query
    await query.answer()
    
    logger.error(f"Admin callback received: {query.data}")
    
    if not await is_admin(query.from_user.id):
        logger.error(f"Access denied for callback from user ID: {query.from_user.id}")
        return
    
    if query.data == 'admin_stats':
        logger.error("Processing admin_stats callback")
        # Показываем статистику
        all_keys = vpn.get_all_keys()
        total_traffic = 0
        active_users = 0
        
        for key in all_keys:
            key_info = vpn.get_key_info(key['id'])
            total_traffic += key_info.get('data_usage', 0)
            if key_info.get('last_active'):
                active_users += 1

        message = (
            "*Статистика VPN:*\n\n"
            f"📊 Всего ключей: {len(all_keys)}\n"
            f"👥 Активных пользователей: {active_users}\n"
            f"📈 Общий трафик: {total_traffic / (1024*1024*1024):.2f} GB\n\n"
            "Вернуться в меню: /admin"
        )
        
        try:
            await query.message.edit_text(
                message,
                parse_mode='Markdown'
            )
        except Exception as e:
            logger.error(f"Error sending admin_stats message: {str(e)}")

    elif query.data == 'admin_keys':
        # Показываем список ключей
        all_keys = vpn.get_all_keys()
        if not all_keys:
            await query.message.edit_text(
                "Нет активных ключей\n\n"
                "Вернуться в меню: /admin",
                parse_mode='Markdown'
            )
            return

        message = "*Список активных ключей:*\n\n"
        for key in all_keys:
            key_info = vpn.get_key_info(key['id'])
            message += (
                f"*{key['name']}*\n"
                f"ID: `{key['id']}`\n"
                f"Трафик: {key_info.get('data_usage', 0) / (1024*1024*1024):.2f} GB\n"
                f"Последняя активность: {key_info.get('last_active', 'Неизвестно')}\n\n"
            )
        message += "Вернуться в меню: /admin"

        await query.message.edit_text(
            message,
            parse_mode='Markdown'
        )

    elif query.data == 'admin_user_input':
        # Запрашиваем username или ID пользователя
        context.user_data['admin_state'] = WAITING_FOR_USERNAME_INFO
        message = (
            "Отправьте username пользователя (например: @username)\n\n"
            "Вернуться в меню: /admin"
        )
        await query.message.edit_text(
            message,
            parse_mode='Markdown'
        )

    elif query.data == 'admin_delete_input':
        # Запрашиваем username или ID для удаления
        context.user_data['admin_state'] = WAITING_FOR_USERNAME_DELETE
        message = (
            "Отправьте username пользователя для удаления ключа (например: @username)\n\n"
            "Вернуться в меню: /admin"
        )
        await query.message.edit_text(
            message,
            parse_mode='Markdown'
        )

    elif query.data == 'admin_inactive':
        # Показываем неактивных пользователей
        all_keys = vpn.get_all_keys()
        inactive_users = []
        
        for key in all_keys:
            key_info = vpn.get_key_info(key['id'])
            last_active = key_info.get('last_active')
            if not last_active or (datetime.now() - datetime.fromisoformat(last_active)).days > 7:
                inactive_users.append((key['name'], last_active or "Никогда"))

        if not inactive_users:
            message = (
                "Нет неактивных пользователей\n\n"
                "Вернуться в меню: /admin"
            )
        else:
            message = "*Неактивные пользователи (>7 дней):*\n\n"
            for name, last_active in inactive_users:
                message += f"👤 {name}\n📅 Последняя активность: {last_active}\n\n"
            message += "Вернуться в меню: /admin"

        await query.message.edit_text(
            message,
            parse_mode='Markdown'
        )

async def handle_admin_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle admin input for user info and deletion"""
    if not update.message or not await is_admin(update.effective_user.id):
        return

    admin_state = context.user_data.get('admin_state')
    if not admin_state:
        return

    username = update.message.text
    if not username.startswith('@'):
        await update.message.reply_text(
            "❌ Неверный формат. Отправьте username в формате @username\n\n"
            "Вернуться в меню: /admin"
        )
        return

    if admin_state == WAITING_FOR_USERNAME_INFO:
        # Показываем информацию о пользователе
        all_keys = vpn.get_all_keys()
        for key in all_keys:
            if username in key['name']:
                key_info = vpn.get_key_info(key['id'])
                message = (
                    f"*Информация о пользователе {key['name']}:*\n\n"
                    f"🔑 ID ключа: `{key['id']}`\n"
                    f"📊 Использовано трафика: {key_info.get('data_usage', 0) / (1024*1024*1024):.2f} GB\n"
                    f"🕒 Последняя активность: {key_info.get('last_active', 'Неизвестно')}\n"
                    f"⏱ Время работы: {key_info.get('uptime', 'Неизвестно')}\n"
                    f"📅 Дата создания: {key_info.get('created_at', 'Неизвестно')}\n\n"
                    "Вернуться в меню: /admin"
                )
                await update.message.reply_text(
                    message,
                    parse_mode='Markdown'
                )
                context.user_data.pop('admin_state', None)
                return

        await update.message.reply_text(
            "❌ Пользователь не найден\n\n"
            "Вернуться в меню: /admin"
        )

    elif admin_state == WAITING_FOR_USERNAME_DELETE:
        # Удаляем ключ пользователя
        all_keys = vpn.get_all_keys()
        for key in all_keys:
            if username in key['name']:
                # Получаем user_id из имени ключа
                try:
                    if key['name'].startswith('id'):
                        user_id = int(key['name'].split(' - ')[0][2:])
                    else:
                        user_id = None
                except:
                    user_id = None

                # Удаляем ключ
                if vpn.delete_access_key(key['id']):
                    # Отправляем уведомление пользователю
                    if user_id:
                        try:
                            await context.bot.send_message(
                                chat_id=user_id,
                                text="❗️ Ваш ключ VPN был отозван администратором.\n"
                                     "Для получения нового ключа напишите @alexDiuzhev"
                            )
                        except:
                            pass
                    
                    await update.message.reply_text(
                        f"✅ Ключ пользователя {key['name']} успешно удален\n\n"
                        "Вернуться в меню: /admin"
                    )
                    context.user_data.pop('admin_state', None)
                    return

        await update.message.reply_text(
            "❌ Пользователь не найден\n\n"
            "Вернуться в меню: /admin"
        )

    context.user_data.pop('admin_state', None)

async def handle_keyboard_buttons(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle keyboard button presses"""
    if not update.message:
        return

    text = update.message.text
    if text == "📊 Статус":
        await status_command(update, context)
    elif text == "❓ FAQ":
        await faq_command(update, context)
    elif text == "🔄 Перевыпустить":
        await regenerate(update, context)
    elif text == "❌ Удалить":
        await delete(update, context)
    elif text == "💬 Поддержка":
        await support_command(update, context)
    elif text == "ℹ️ Помощь":
        await help_command(update, context)

def main() -> None:
    """Start the bot."""
    application = Application.builder().token(BOT_TOKEN).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("mentor", mentor))
    application.add_handler(CommandHandler("status", status_command))
    application.add_handler(CommandHandler("regenerate", regenerate))
    application.add_handler(CommandHandler("delete", delete))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("faq", faq_command))
    application.add_handler(CommandHandler("support", support_command))
    application.add_handler(CallbackQueryHandler(support_callback, pattern="^support_"))
    
    # Admin handlers
    application.add_handler(CommandHandler("admin", admin_command))
    application.add_handler(CallbackQueryHandler(admin_callback, pattern="^admin_"))
    
    # Message handlers
    application.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND & filters.Regex('^(📊 Статус|❓ FAQ|🔄 Перевыпустить|❌ Удалить|💬 Поддержка|ℹ️ Помощь)$'),
        handle_keyboard_buttons
    ))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_admin_input))

    # Setup commands
    application.job_queue.run_once(setup_commands, when=1)

    # Add periodic membership check
    job_queue = application.job_queue
    job_queue.run_repeating(check_memberships, interval=MEMBERSHIP_CHECK_INTERVAL)

    # Start the Bot
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main() 