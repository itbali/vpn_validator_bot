import { HandlerType } from './handlerType';

export const deleteHandler: HandlerType = async ({ msg, bot, outlineService }) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }

  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  const helpMessage = `
  Доступные команды:
  /start - Начать работу с ботом
  /help - Показать это сообщение
  /mentor - Информация о менторе и услугах
  /status - Проверить статус вашего VPN
  /regenerate - Перевыпустить ключ
  /delete - Удалить текущий ключ
  /faq - Частые вопросы по VPN
  /support - Техническая поддержка
  /stats - Статистика использования VPN
  `;
  bot.sendMessage(chatId, helpMessage);
};
