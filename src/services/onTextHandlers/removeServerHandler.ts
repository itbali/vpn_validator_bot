import { HandlerType } from './handlerType';

export const removeServerHandler: HandlerType = async ({msg, bot, isAdmin, outlineService}) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  if (!isAdmin) {
    return bot.sendMessage(chatId, 'Эта команда доступна только администраторам');
  }

  const args = msg.text?.split(' ').slice(1);
  if (!args || args.length !== 1) {
    return bot.sendMessage(chatId, 'Использование: /removeserver <server_id>');
  }

  const serverId = parseInt(args[0]);
  if (isNaN(serverId)) {
    return bot.sendMessage(chatId, 'ID сервера должен быть числом');
  }

  try {
    await outlineService?.removeServer(serverId);
    await bot.sendMessage(chatId, `Сервер с ID ${serverId} успешно деактивирован`);
  } catch (error) {
    console.error('Error removing server:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при деактивации сервера');
  }
}
  