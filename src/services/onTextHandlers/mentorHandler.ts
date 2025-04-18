import { HandlerType } from './handlerType';

export const mentorHandler: HandlerType = async ({ msg, bot }) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }

  const mentorInfo = `
  Информация о менторе:
  - Опыт работы: 5+ лет
  - Специализация: Backend разработка
  - Технологии: Node.js, Python, DevOps
  
  Доступные услуги:
  1. Индивидуальные консультации
  2. Код-ревью
  3. Помощь с проектами
  4. Карьерное консультирование
  
  Для записи на консультацию используйте /support
  `;
  bot.sendMessage(chatId, mentorInfo);
};
