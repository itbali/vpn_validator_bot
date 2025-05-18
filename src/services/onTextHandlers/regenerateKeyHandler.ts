import TelegramBot from 'node-telegram-bot-api';
import { HandlerType } from './handlerType';
import { VPNServer } from '../../models';

export const regenerateKeyHandler: HandlerType = async ({
  msg,
  bot,
  subscriptionService,
  VPNConfig,
  outlineService,
}) => {
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
        is_active: true,
      },
    });

    if (!currentConfig) {
      await bot.sendMessage(chatId, 'У вас нет активного ключа для обновления.');
      return;
    }

    const server = await VPNServer.findByPk(currentConfig.server_id);

    const newConfig = await outlineService?.generateConfig(
      chatId.toString(),
      currentConfig.server_id,
      msg.from?.username || msg.from?.first_name,
    );
    await outlineService?.deactivateConfig(chatId.toString());

    if (!newConfig) {
      await bot.sendMessage(chatId, 'Не удалось сгенерировать новый ключ. Попробуйте позже.');
      return;
    }

    let messageText = `<b>🔑 Ваш новый VPN ключ</b>\n\n`;
    if (server) {
      messageText += `Сервер: ${server.name} (${server.location})\n`;
    }
    messageText += `<code>${newConfig.config_data}</code>\n\n`;
    messageText += `<b>Скопируйте этот ключ и вставьте в приложение Outline.</b>`;

    await bot.sendMessage(chatId, messageText, { parse_mode: 'HTML' as TelegramBot.ParseMode });
  } catch (error) {
    console.error('Error in /regenerate command:', error);
    bot.sendMessage(chatId, 'Ошибка при перевыпуске конфигурации.');
  }
};
