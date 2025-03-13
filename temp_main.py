import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, CallbackContext
from config import BOT_TOKEN, CHANNEL_ID
from outline_api import OutlineVPN

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
    handlers=[
        logging.FileHandler('/opt/vpn_bot/bot.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Outline VPN
vpn = OutlineVPN()

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
    logger.info(f"User {user.id} ({user.username}) started the bot")
    
    if not await check_channel_membership(user.id, context):
        logger.info(f"User {user.id} is not a channel member")
        await update.message.reply_text(
            f"Для получения доступа к VPN, пожалуйста, подпишитесь на наш канал: "
            f"https://t.me/{str(CHANNEL_ID).replace('-100', '')}")
        return

    # Create VPN access for the user
    logger.info(f"Creating VPN access for user {user.id}")
    vpn_key = vpn.create_access_key(f"user_{user.id}")
    if vpn_key:
        logger.info(f"Successfully created VPN access for user {user.id}")
        await update.message.reply_text(
            f"Добро пожаловать! Вот ваша ссылка для подключения к VPN:\n\n"
            f"`{vpn_key['accessUrl']}`\n\n"
            f"Сохраните её, она понадобится для настройки.",
            parse_mode='Markdown'
        )
    else:
        logger.error(f"Failed to create VPN access for user {user.id}")
        await update.message.reply_text(
            "Извините, произошла ошибка при создании доступа к VPN. "
            "Пожалуйста, попробуйте позже или обратитесь к администратору."
        )

async def check_memberships(context: CallbackContext) -> None:
    """Periodic task to check channel memberships and remove VPN access if needed"""
    logger.info("Starting periodic membership check")
    all_keys = vpn.get_all_keys()
    for key in all_keys:
        if not key.get('name', '').startswith('user_'):
            continue
        
        try:
            user_id = int(key['name'].split('_')[1])
            if not await check_channel_membership(user_id, context):
                vpn.delete_access_key(key['id'])
                logger.info(f"Removed VPN access for user {user_id}")
        except Exception as e:
            logger.error(f"Error processing key {key['id']}: {e}")
    logger.info("Finished periodic membership check")

def main() -> None:
    """Start the bot."""
    logger.info("Starting the bot")
    application = Application.builder().token(BOT_TOKEN).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start))

    # Add periodic membership check (every 1 hour)
    job_queue = application.job_queue
    job_queue.run_repeating(check_memberships, interval=3600)

    # Start the Bot
    logger.info("Bot is running")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main() 