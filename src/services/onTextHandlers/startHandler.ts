import { HandlerType } from "./handlerType";

export const startHandler: HandlerType = async ({msg, isAdmin, bot, User, config, keyboard}) => {
        const chatId = msg.chat.id;
        const username = msg.from?.username;
        const isPrivate = msg.chat.type === 'private';
      
        if (!isPrivate) {
          return;
        }
      
        console.log(`👤 Пользователь ${username || 'без username'} (ID: ${chatId}) запустил бота`);
      
        if (!msg.from) {
          return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
        }
      
        try {
          const isUserAdmin = await isAdmin?.(chatId);
          console.log(`📝 Статус пользователя ${chatId}:`, {
            username: username,
            isAdmin: isUserAdmin,
            isChatAdmin: isUserAdmin
          });
      
          const user = (await User?.findOrCreate({
            where: { telegram_id: String(msg.from.id) },
            defaults: {
              telegram_id: String(msg.from.id),
              username: msg.from.username,
              first_name: msg.from.first_name,
              last_name: msg.from.last_name,
            },
          }))?.[0];
      
          if (!user?.is_subscribed) {
            return bot.sendMessage(
              chatId,
              `Для доступа к VPN необходимо подписаться на канал: ${config?.telegram.channelUrl}`
            );
          }
      
          if (!user?.is_paid_subscribed) {
            return bot.sendMessage(
              chatId,
              `Для доступа к VPN необходимо подписаться на платный канал: ${config?.telegram.paidChannelUrl}
              Или быть учеником на менторинге по программированию`
            );
          }
      
          if (!user?.is_active) {
            return bot.sendMessage(chatId, 'Ваш аккаунт не активен. Обратитесь к администратору.');
          }
      
          if (user?.is_admin !== isUserAdmin) {
            await User?.update(
              { is_admin: isUserAdmin },
              { where: { telegram_id: chatId.toString() } }
            );
          }
      
          await bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', keyboard);
        } catch (error) {
          console.error('Error in /start command:', error);
          bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
        }
      }