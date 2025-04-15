import { HandlerType } from './handlerType';

export const supportHandler: HandlerType = async ({msg, bot}) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  const supportMessage = `
Техническая поддержка:

1. Общие вопросы: @alexDiuzhev
3. Время работы: 10:00 - 21:00 МСК

Для быстрого ответа укажите:
- Вашу операционную систему
- Сервер, на котором вы используете VPN
- Описание проблемы
`;
  bot.sendMessage(chatId, supportMessage);
}
  