import { HandlerType } from './handlerType';

export const listServersHandler: HandlerType = async ({msg, bot, outlineService, isAdmin}) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }

  const username = msg.from?.username;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  if (!isAdmin) {
    return bot.sendMessage(chatId, 'Эта команда доступна только администраторам');
  }

  try {
    const servers = await outlineService?.getAvailableServers();
    if (!servers?.length) {
      return bot.sendMessage(chatId, 'Нет доступных серверов');
    }

    let message = 'Список доступных серверов:\n\n';
    for (const server of servers) {
      message += `ID: ${server.id}\n` +
                `Имя: ${server.name}\n` +
                `Локация: ${server.location}\n` +
                `API URL: ${server.outline_api_url}\n\n`;
    }

    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error listing servers:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при получении списка серверов');
  }
}
  