import { HandlerType } from './handlerType';

export const helpHandler: HandlerType = async ({ msg, bot, outlineService, VPNConfig }) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }

  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    const configToDelete = await VPNConfig?.findOne({
      where: {
        user_id: chatId.toString(),
        is_active: true,
      },
    });

    if (!configToDelete) {
      await bot.sendMessage(chatId, 'У вас нет активного ключа для удаления.');
      return;
    }

    await outlineService?.deactivateConfig(chatId.toString());
    await bot.sendMessage(chatId, 'Ваш VPN ключ был деактивирован.');
  } catch (error) {
    console.error('Error in /delete command:', error);
    bot.sendMessage(chatId, 'Ошибка при удалении конфигурации.');
  }
};
