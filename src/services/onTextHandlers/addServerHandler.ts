import { HandlerType } from './handlerType';

export const addServerHandler: HandlerType = async ({msg, bot, outlineService, isAdmin}) => {
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
  if (!args || args.length !== 4) {
    return bot.sendMessage(
      chatId,
      'Использование: /addserver <name> <location> <api_url> <cert_sha256>'
    );
  }

  const [name, location, apiUrl, certSha256] = args;

  try {
    const server = await outlineService?.addServer(name, location, apiUrl, certSha256);
    await bot.sendMessage(
      chatId,
      `Сервер "${server?.name}" успешно добавлен!\nID: ${server?.id}\nЛокация: ${server?.location}`
    );
  } catch (error) {
    console.error('Error adding server:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при добавлении сервера');
  }
}
  