import { HandlerType } from './handlerType';

export const adminHandler: HandlerType = async ({msg, bot, isAdmin, adminKeyboard}) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав администратора.');
      return;
    }

    await bot.sendMessage(chatId, 'Панель управления администратора:', adminKeyboard);
  } catch (error) {
    console.error('Error in /admin command:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
}
  