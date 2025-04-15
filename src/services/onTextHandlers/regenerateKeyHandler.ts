import TelegramBot from "node-telegram-bot-api";
import { HandlerType } from "./handlerType";

export const regenerateKeyHandler: HandlerType = async ({msg, bot, subscriptionService, VPNConfig, outlineService}) => {
    const chatId = msg.chat.id;
    const isPrivate = msg.chat.type === 'private';
  
    if (!isPrivate) {
      return;
    }
  
    if (!msg.from) {
      return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
    }
  
    try {
      const isPaidSubscribed = await subscriptionService?.checkPaidSubscription(chatId);
      const isMentoringSubscribed = await subscriptionService?.checkMentorSubscription(chatId);
      const isSubscribed = isPaidSubscribed || isMentoringSubscribed;
      
      if (!isSubscribed) {
        return bot.sendMessage(chatId, 'Необходимо подписаться на канал для использования этой команды.');
      }
  
      const currentConfig = await VPNConfig?.findOne({
        where: { 
          user_id: chatId.toString(),
          is_active: true
        }
      });
  
      if (!currentConfig) {
        await bot.sendMessage(chatId, 'У вас нет активного ключа для обновления.');
        return;
      }
  
      const newConfig = await outlineService?.generateConfig(
        chatId.toString(),
        currentConfig.server_id,
        msg.from?.username || msg.from?.first_name
      );
      await outlineService?.deactivateConfig(chatId.toString());
      
      await bot.sendMessage(
        chatId,
        `<b>🔑 Ваш новый VPN ключ</b>\n\n` +
        `<code>${newConfig?.config_data}</code>`,
        { parse_mode: 'HTML' as TelegramBot.ParseMode }
      );
    } catch (error) {
      console.error('Error in /regenerate command:', error);
      bot.sendMessage(chatId, 'Ошибка при перевыпуске конфигурации.');
    }
  }