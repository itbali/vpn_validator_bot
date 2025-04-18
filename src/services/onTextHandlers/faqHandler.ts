import { HandlerType } from './handlerType';

export const faqHandler: HandlerType = async ({ msg, bot }) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }

  const faqMessage = `
Частые вопросы:

1. Как установить VPN?
- Скачайте и установите Outline Client: https://getoutline.org/get-started/
- Скопируйте полученный ключ доступа
- Вставьте ключ в приложение Outline Client

2. Почему не работает VPN?
- Проверьте подписку на канал
- Убедитесь, что ключ активен
- Проверьте статус сервера через кнопку "Статус"
- Попробуйте переподключиться в приложении Outline
- Проверьте антивирус или брандмауэр

3. Как обновить ключ?
Используйте команду /regenerate

4. Как получить поддержку?
Используйте команду /support

5. Где посмотреть статистику?
Используйте команду /stats
`;
  bot.sendMessage(chatId, faqMessage);
};
