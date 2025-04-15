import TelegramBot from 'node-telegram-bot-api';
import { User, VPNConfig, VPNServer } from '../models';
import { outlineService } from './outlineService';
import { subscriptionService } from './subscriptionService';
import config from '../config';
import { MonitoringService } from './monitoringService';
import { formatBytes } from '../utils/formatters';

interface ServerDialogState {
  step: 'name' | 'location' | 'api_url' | 'cert_sha256';
  data: {
    name?: string;
    location?: string;
    api_url?: string;
    cert_sha256?: string;
  };
}

// Хранилище состояний диалогов для разных пользователей
const serverDialogs = new Map<number, ServerDialogState>();

export const bot = new TelegramBot(config.bot.token, { polling: true });
const monitoringService = new MonitoringService(bot);

const adminKeyboard: TelegramBot.SendMessageOptions = {
  reply_markup: {
    keyboard: [
      [{ text: '🔑 Управление ключами' }, { text: '🔄 Проверить ключи' }],
      [{ text: '📊 Статистика сервера' }, { text: '👥 Пользователи' }],
      [{ text: '➕ Добавить сервер' }, { text: '📋 Список серверов' }],
      [{ text: '◀️ Назад' }]
    ],
    resize_keyboard: true
  }
};

const isAdmin = async (chatId: number): Promise<boolean> => {
  try {
    // Проверяем, есть ли пользователь в списке администраторов
    if (config.telegram.adminIds.includes(chatId)) {
      return true;
    }

    const user = await User.findOne({
      where: { telegram_id: String(chatId) }
    });

    if (!user) {
      return false;
    }

    if (!user.telegram_id || !user.username) {
      return false;
    }

    const channelId = config.telegram.channelId;
    const chatMember = await bot.getChatMember(channelId, chatId);
    return ['creator', 'administrator'].includes(chatMember.status);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

const mainKeyboard = async (chatId: number): Promise<TelegramBot.SendMessageOptions> => {
  const isUserAdmin = await isAdmin(chatId);
  const isMentorSubscriber = await subscriptionService.checkMentorSubscription(chatId);
  
  return {
    reply_markup: {
      keyboard: [
        [{ text: '🎭 VPN' }, ...(isMentorSubscriber ? [{ text: '👨‍💻 Менторинг' }] : [])],
        [{ text: '🔄 Перезапустить бота' }],
        ...(isUserAdmin ? [[{ text: '⚙️ Админ панель' }]] : [])
      ],
      resize_keyboard: true
    }
  }
};

const vpnKeyboard: TelegramBot.SendMessageOptions = {
  reply_markup: {
    keyboard: [
      [{ text: '🔑 Получить ключ' }],
      [{ text: '📊 Статистика' }],
      [{ text: '🔄 Обновить ключ' }],
      [{ text: '🗑 Удалить ключ' }],
      [{ text: '◀️ Назад' }]
    ],
    resize_keyboard: true
  }
};

const mentorKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📝 Разбор резюме', url: 'https://planerka.app/aleksei-diuzhev/razbor-rezyume' }],
      [{ text: '👨‍💻 Встреча с учеником', url: 'https://planerka.app/aleksei-diuzhev/vstrecha-s-uchenikom---1ch' }],
      [{ text: '🎯 Мок собес', url: 'https://planerka.app/aleksei-diuzhev/mokovoe-sobesedovanie' }]
    ]
  }
} as TelegramBot.SendMessageOptions;

const createServerSelectionKeyboard = async (): Promise<TelegramBot.SendMessageOptions> => {
  const servers = await outlineService.getAvailableServers();
  const keyboard = servers.map(server => [{ text: `🌍 ${server.name} (${server.location})` }]);
  keyboard.push([{ text: '◀️ Назад' }]);
  
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true
    }
  };
};

bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  console.log(`👤 Пользователь ${username || 'без username'} (ID: ${chatId}) запустил бота`);

  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    const isUserAdmin = await isAdmin(chatId);
    console.log(`📝 Статус пользователя ${chatId}:`, {
      username: username,
      isAdmin: isUserAdmin,
      isChatAdmin: isUserAdmin
    });

    const [user] = await User.findOrCreate({
      where: { telegram_id: String(msg.from.id) },
      defaults: {
        telegram_id: String(msg.from.id),
        username: msg.from.username,
        first_name: msg.from.first_name,
        last_name: msg.from.last_name,
      },
    });

    if (!user.is_subscribed) {
      return bot.sendMessage(
        chatId,
        `Для доступа к VPN необходимо подписаться на канал: ${config.telegram.channelUrl}`
      );
    }

    if (!user.is_paid_subscribed) {
      return bot.sendMessage(
        chatId,
        `Для доступа к VPN необходимо подписаться на платный канал: ${config.telegram.paidChannelUrl}
        Или быть учеником на менторинге по программированию`
      );
    }

    if (!user.is_active) {
      return bot.sendMessage(chatId, 'Ваш аккаунт не активен. Обратитесь к администратору.');
    }

    if (user.is_admin !== isUserAdmin) {
      await User.update(
        { is_admin: isUserAdmin },
        { where: { telegram_id: chatId.toString() } }
      );
    }

    const keyboard = await mainKeyboard(chatId);
    await bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', keyboard);
  } catch (error) {
    console.error('Error in /start command:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
});

// Обработчик текстовых сообщений для кнопок меню
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isPrivate = msg.chat.type === 'private';
  const username = msg.from?.username;

  if (!text || !isPrivate) {
    return;
  }

  console.log(`Сообщение от ${username || 'Unknown'} (ID: ${chatId}): ${text} \n`);

  const sendBotMessage = async (message: string, options?: TelegramBot.SendMessageOptions) => {
    console.log(`➡️ Ответ бота для ${username || 'Unknown'} (ID: ${chatId}):\n${message}`);
    return bot.sendMessage(chatId, message, options);
  };

  try {
    const user = await User.findOne({ where: { telegram_id: chatId.toString() } });
    const isUserAdmin = await isAdmin(chatId);

    if (isUserAdmin) {
      console.log(`🔑 Запрос от админа канала ${username || 'Unknown'} (ID: ${chatId})`);
    }

    if (!user) {
      await sendBotMessage('Пожалуйста, начните с команды /start');
      return;
    }

    // Обновляем статус подписки
    const isSubscribed = await subscriptionService.checkUserSubscription(chatId);
    
    if (!user.is_active) {
      await sendBotMessage('Ваш аккаунт не активен. Обратитесь к администратору.');
      return;
    }

    if (!isSubscribed) {
      await sendBotMessage('Для использования бота необходимо подписаться на каналы.');
      return;
    }

    switch (text) {
      case '📊 Статистика сервера':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        try {
          const serverStatus = await monitoringService.getSystemStatus();
          const metrics = await outlineService.getMetrics('all');
          let serverStatsMessage = `📊 Статистика сервера:\n\n`;
          serverStatsMessage += `CPU: ${serverStatus.metrics.cpu_usage.toFixed(1)}%\n`;
          serverStatsMessage += `RAM: ${serverStatus.metrics.ram_usage.toFixed(1)}%\n`;
          serverStatsMessage += `Диск: ${serverStatus.metrics.disk_usage.toFixed(1)}%\n`;
          serverStatsMessage += `Активных подключений: ${serverStatus.metrics.active_connections}\n`;
          serverStatsMessage += `Аптайм: ${serverStatus.uptime} часов\n`;
          await sendBotMessage(serverStatsMessage);
        } catch (error) {
          console.error('Error getting server stats:', error);
          await sendBotMessage('Ошибка при получении статистики сервера');
        }
        break;

      case '🔑 Управление ключами':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        try {
          const servers = await outlineService.getAvailableServers();
          let keysMessage = `🔑 Список всех ключей:\n\n`;
          
          if (servers.length === 0) {
            await sendBotMessage('Нет доступных серверов. Добавьте сервер с помощью кнопки "➕ Добавить сервер"');
            return;
          }
          
          for (const server of servers) {
            const keys = await outlineService.listKeys(server.id);
            keysMessage += `📍 Сервер: ${server.name} (${server.location})\n\n`;
            
            if (keys.length === 0) {
              keysMessage += `Нет активных ключей\n\n`;
              continue;
            }
            
            for (const key of keys) {
              try {
                const metrics = await outlineService.getMetrics(key.id);
                keysMessage += `ID: ${key.id}\n`;
                keysMessage += `Имя: ${key.name}\n`;
                keysMessage += `Трафик: ${formatBytes(metrics.dataTransferred.bytes)}\n\n`;
              } catch (error) {
                keysMessage += `ID: ${key.id}\n`;
                keysMessage += `Имя: ${key.name}\n`;
                keysMessage += `Трафик: Нет данных\n\n`;
              }
            }
            keysMessage += `\n`;
          }
          
          await sendBotMessage(keysMessage);
        } catch (error) {
          console.error('Error listing keys:', error);
          await sendBotMessage('Ошибка при получении списка ключей');
        }
        break;

      case '➕ Добавить сервер':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        // Инициализируем диалог добавления сервера
        serverDialogs.set(chatId, {
          step: 'name',
          data: {}
        });
        await sendBotMessage(
          'Давайте добавим новый сервер.\n\n' +
          'Шаг 1/4: Введите название сервера (например: "Server 1")\n\n' +
          '❌ Для отмены напишите "отмена"',
          {
            reply_markup: {
              keyboard: [
                [{ text: '❌ Отмена' }]
              ],
              resize_keyboard: true
            }
          }
        );
        break;

      case '❌ Отмена':
      case 'отмена':
      case 'Отмена':
        if (serverDialogs.has(chatId)) {
          serverDialogs.delete(chatId);
          await sendBotMessage('Добавление сервера отменено.', adminKeyboard);
        }
        break;

      case '📋 Список серверов':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        try {
          const servers = await outlineService.getAvailableServers();
          if (!servers.length) {
            await sendBotMessage('Нет доступных серверов');
            return;
          }

          let message = 'Список доступных серверов:\n\n';
          for (const server of servers) {
            message += `ID: ${server.id}\n` +
                      `Имя: ${server.name}\n` +
                      `Локация: ${server.location}\n` +
                      `API URL: ${server.outline_api_url}\n\n`;
          }

          await sendBotMessage(message);
        } catch (error) {
          console.error('Error listing servers:', error);
          await sendBotMessage('Произошла ошибка при получении списка серверов');
        }
        break;

      case '🔄 Проверить ключи':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        await sendBotMessage('Начинаю проверку ключей...');
        try {
          const result = await outlineService.validateAllKeys();
          let message = `✅ Проверка завершена\n\n`;
          message += `📊 Всего проверено ключей: ${result.totalChecked}\n`;
          message += `❌ Деактивировано ключей: ${result.deactivatedKeys.length}\n\n`;
          
          if (result.deactivatedKeys.length > 0) {
            message += `Деактивированные ключи:\n`;
            for (const key of result.deactivatedKeys) {
              const user = await User.findOne({ where: { telegram_id: key.userId } });
              message += `- Конфиг: ${key.configId} (Пользователь: ${user?.username || key.userId})\n`;
            }
          }
          
          await sendBotMessage(message);
        } catch (error) {
          console.error('Error validating keys:', error);
          await sendBotMessage('❌ Произошла ошибка при проверке ключей.');
        }
        await sendBotMessage('Вернуться в главное меню:', await mainKeyboard(chatId));
        break;

      case '👥 Пользователи':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        const users = await User.findAll();
        let usersMessage = `👥 Список пользователей:\n\n`;
        for (const user of users) {
          const configs = await VPNConfig.findAll({
            where: { user_id: user.telegram_id, is_active: true }
          });
          usersMessage += `ID: ${user.telegram_id}\n`;
          usersMessage += `Имя: ${user.username || 'Не указано'}\n`;
          usersMessage += `Статус: ${user.is_active ? '✅' : '❌'}\n`;
          usersMessage += `Админ: ${user.is_admin ? '✅' : '❌'}\n`;
          usersMessage += `VPN подписка: ${user.is_subscribed ? '✅' : '❌'}\n`;
          usersMessage += `Платная подписка: ${user.is_paid_subscribed ? '✅' : '❌'}\n`;
          usersMessage += `Активных ключей: ${configs.length}\n\n`;
        }
        await sendBotMessage(usersMessage);
        await sendBotMessage('Вернуться в главное меню:', await mainKeyboard(chatId));
        break;

      case '⚙️ Админ панель':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        await sendBotMessage('Панель управления администратора:', adminKeyboard);
        break;

      case '🔑 Получить ключ':
        const existingConfig = await VPNConfig.findOne({
          where: { 
            user_id: chatId.toString(),
            is_active: true
          }
        });

        if (existingConfig) {
          await sendBotMessage(
            `<b>🔑 Ваш активный VPN ключ</b>\n\n` +
            `<b>Скопируйте этот ключ и вставьте в приложение Outline:</b>\n\n` +
            `<code>${existingConfig.config_data}</code>`,
            { parse_mode: 'HTML' as TelegramBot.ParseMode }
          );
        } else {
          const keyboard = await createServerSelectionKeyboard();
          await sendBotMessage(
            'Выберите сервер для подключения:',
            keyboard
          );
        }
        break;

      case '📊 Статистика':
        const configs = await VPNConfig.findAll({
          where: { user_id: chatId.toString(), is_active: true },
          include: [{
            model: VPNServer,
            required: false
          }]
        });

        if (!configs.length) {
          await sendBotMessage('У вас нет активных VPN конфигураций.');
          return;
        }

        let userStatsMessage = 'Статистика использования VPN:\n\n';
        
        for (const config of configs) {
          try {
            const metrics = await outlineService.getMetrics(config.config_id);
            const server = await VPNServer.findByPk(config.server_id);
            const serverName = server?.name || 'Неизвестный сервер';
            const location = server?.location || 'Неизвестно';
            
            userStatsMessage += `Сервер: ${serverName} (${location})\n` +
                              `ID: ${config.config_id}\n` +
                              `Статус: Активна\n` +
                              `Трафик: ${formatBytes(metrics.dataTransferred.bytes)}\n\n`;
          } catch (error) {
            userStatsMessage += `ID: ${config.config_id}\n` +
                              `Статус: Активна\n` +
                              `Трафик: Нет данных\n\n`;
          }
        }

        if (user.is_admin) {
          try {
            const serverStatus = await monitoringService.getSystemStatus();
            userStatsMessage += `\nСтатус сервера:\n` +
                              `CPU: ${serverStatus.metrics.cpu_usage.toFixed(1)}%\n` +
                              `RAM: ${serverStatus.metrics.ram_usage.toFixed(1)}%\n` +
                              `Диск: ${serverStatus.metrics.disk_usage.toFixed(1)}%\n` +
                              `Активных подключений: ${serverStatus.metrics.active_connections}\n` +
                              `Аптайм: ${serverStatus.uptime} часов`;
          } catch (error) {
            userStatsMessage += '\nОшибка при получении статуса сервера';
          }
        }

        await sendBotMessage(userStatsMessage);
        break;

      case '❓ FAQ':
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

3. Как обновить ключ?
Используйте команду /regenerate

4. Как получить поддержку?
Используйте команду /support

5. Где посмотреть статистику?
Используйте команду /stats
`;
        await sendBotMessage(faqMessage);
        break;

      case '🔄 Обновить ключ':
        const currentConfig = await VPNConfig.findOne({
          where: { 
            user_id: chatId.toString(),
            is_active: true
          }
        });

        if (!currentConfig) {
          await sendBotMessage('У вас нет активного ключа для обновления.');
          return;
        }

        const newConfig = await outlineService.generateConfig(
          chatId.toString(),
          currentConfig.server_id,
          msg.from?.username || msg.from?.first_name
        );
        await outlineService.deactivateConfig(chatId.toString());
        
        await sendBotMessage(
          `<b>🔑 Ваш новый VPN ключ</b>\n\n` +
          `<code>${newConfig.config_data}</code>`,
          { parse_mode: 'HTML' as TelegramBot.ParseMode }
        );
        break;

      case '🗑 Удалить ключ':
        const configToDelete = await VPNConfig.findOne({
          where: { 
            user_id: chatId.toString(),
            is_active: true
          }
        });

        if (!configToDelete) {
          await sendBotMessage('У вас нет активного ключа для удаления.');
          return;
        }

        await outlineService.deactivateConfig(chatId.toString());
        await sendBotMessage('Ваш VPN ключ был деактивирован.');
        break;

      case '◀️ Назад':
        if (!user) {
          await sendBotMessage('Пожалуйста, начните с команды /start');
          return;
        }
        await sendBotMessage('Главное меню:', await mainKeyboard(chatId));
        break;

      case '🎭 VPN':
        await sendBotMessage(
          'Выберите действие:',
          vpnKeyboard
        );
        break;

      case '👨‍💻 Менторинг':
        const isMentorSubscriber = await subscriptionService.checkMentorSubscription(chatId);
        if (!isMentorSubscriber) {
          await sendBotMessage(
            `Для доступа к менторингу необходимо подписаться на канал: ${config.telegram.channelUrl}`
          );
          return;
        }
        await sendBotMessage(
          '<b>Выберите тип встречи:</b>\n\n' +
          '📝 <b>Разбор резюме</b> - Профессиональный анализ вашего резюме\n' +
          '👨‍💻 <b>Встреча с учеником</b> - Персональная консультация\n' +
          '🎯 <b>Мок собес</b> - Пробное собеседование',
          { 
            parse_mode: 'HTML',
            ...mentorKeyboard
          }
        );
        break;

      case '◀️ Главное меню':
        const mainMenuKeyboard = await mainKeyboard(chatId);
        await sendBotMessage(
          'Главное меню:',
          mainMenuKeyboard
        );
        break;

      case '🔄 Перезапустить бота':
        await sendBotMessage(
          'Бот перезапущен. Выберите действие:',
          await mainKeyboard(chatId)
        );
        break;

      case '❓ Инструкция':
        await sendBotMessage(
          '<b>📱 Как установить и настроить VPN:</b>\n\n' +
          '1️⃣ <b>Установите приложение Outline:</b>\n' +
          '• iOS: <a href="https://itunes.apple.com/us/app/outline-app/id1356177741">App Store</a>\n' +
          '• Android: <a href="https://play.google.com/store/apps/details?id=org.outline.android.client">Google Play</a>\n' +
          '• Windows: <a href="https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe">Скачать</a>\n' +
          '• macOS: <a href="https://itunes.apple.com/us/app/outline-app/id1356178125">Mac App Store</a>\n' +
          '• Linux: <a href="https://support.google.com/outline/answer/15331527">Инструкция</a>\n' +
          '• Chrome: <a href="https://play.google.com/store/apps/details?id=org.outline.android.client">Плагин</a>\n\n' +
          '2️⃣ <b>Подключение:</b>\n' +
          '• Нажмите "🔑 Получить ключ" в меню\n' +
          '• Скопируйте полученный ключ\n' +
          '• Откройте приложение Outline\n' +
          '• Вставьте ключ и нажмите "Подключиться"\n\n' +
          '3️⃣ <b>Дополнительно:</b>\n' +
          '• Для обновления ключа используйте "🔄 Обновить ключ"\n' +
          '• Для просмотра статистики нажмите "📊 Статистика"\n' +
          '• Если VPN не нужен, нажмите "🗑 Удалить ключ"\n\n' +
          '❗️ <b>Важно:</b> Не передавайте свой ключ другим пользователям',
          { 
            parse_mode: 'HTML',
            disable_web_page_preview: true
          }
        );
        break;

      // Обработка шагов добавления сервера
      default:
        // Проверяем, находится ли пользователь в процессе добавления сервера
        const dialogState = serverDialogs.get(chatId);
        if (dialogState) {
          try {
            switch (dialogState.step) {
              case 'name':
                dialogState.data.name = text;
                dialogState.step = 'location';
                await sendBotMessage(
                  'Шаг 2/4: Введите местоположение сервера (например: "Netherlands")\n\n' +
                  '❌ Для отмены напишите "отмена"'
                );
                break;

              case 'location':
                dialogState.data.location = text;
                dialogState.step = 'api_url';
                await sendBotMessage(
                  'Шаг 3/4: Введите API URL сервера (например: "https://example.com:1234/abc")\n\n' +
                  '❌ Для отмены напишите "отмена"'
                );
                break;

              case 'api_url':
                dialogState.data.api_url = text;
                dialogState.step = 'cert_sha256';
                await sendBotMessage(
                  'Шаг 4/4: Введите SHA256 сертификата\n\n' +
                  '❌ Для отмены напишите "отмена"'
                );
                break;

              case 'cert_sha256':
                dialogState.data.cert_sha256 = text;
                // Добавляем сервер
                const { name, location, api_url, cert_sha256 } = dialogState.data;
                if (name && location && api_url && cert_sha256) {
                  const server = await outlineService.addServer(name, location, api_url, cert_sha256);
                  await sendBotMessage(
                    `✅ Сервер успешно добавлен!\n\n` +
                    `📍 Название: ${server.name}\n` +
                    `🌍 Локация: ${server.location}\n` +
                    `🔢 ID: ${server.id}`,
                    adminKeyboard
                  );
                }
                // Очищаем состояние диалога
                serverDialogs.delete(chatId);
                break;
            }
          } catch (error) {
            console.error('Error in server dialog:', error);
            await sendBotMessage(
              '❌ Произошла ошибка при добавлении сервера. Попробуйте снова через команду "➕ Добавить сервер"',
              adminKeyboard
            );
            serverDialogs.delete(chatId);
          }
          break;
        }

        if (text.startsWith('🌍 ')) {
          const serverName = text.slice(2).split(' (')[0].trim();
          const server = await VPNServer.findOne({
            where: {
              name: serverName,
              is_active: true
            }
          });

          if (!server) {
            await sendBotMessage('Сервер не найден. Попробуйте еще раз.');
            return;
          }

          try {
            await outlineService.deactivateConfig(chatId.toString());
            
            const vpnConfig = await outlineService.generateConfig(
              chatId.toString(),
              server.id,
              msg.from?.username || msg.from?.first_name
            );

            await sendBotMessage(
              `<b>🔑 Ваш новый ключ создан!</b>\n\n` +
              `<b>📱 Установите приложение Outline VPN для iOS или Android</b>\n\n` +
              `<b>⚡️ Скопируйте этот ключ и вставьте в приложение:</b>\n\n` +
              `<code>${vpnConfig.config_data}</code>`,
              { parse_mode: 'HTML' as TelegramBot.ParseMode }
            );
          } catch (error) {
            console.error('Error generating VPN key:', error);
            await sendBotMessage('Произошла ошибка при получении VPN ключа. Попробуйте позже.');
          }
        }
        break;
    }
  } catch (error) {
    console.error('Error in message handler:', error);
    await sendBotMessage('Произошла ошибка. Попробуйте позже.');
  }
});

bot.onText(/\/help/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
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
});

bot.onText(/\/mentor/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
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
});

bot.onText(/\/regenerate/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    const isSubscribed = await subscriptionService.checkUserSubscription(chatId);
    if (!isSubscribed) {
      return bot.sendMessage(chatId, 'Необходимо подписаться на канал для использования этой команды.');
    }

    const currentConfig = await VPNConfig.findOne({
      where: { 
        user_id: chatId.toString(),
        is_active: true
      }
    });

    if (!currentConfig) {
      await bot.sendMessage(chatId, 'У вас нет активного ключа для обновления.');
      return;
    }

    const newConfig = await outlineService.generateConfig(
      chatId.toString(),
      currentConfig.server_id,
      msg.from?.username || msg.from?.first_name
    );
    await outlineService.deactivateConfig(chatId.toString());
    
    await bot.sendMessage(
      chatId,
      `<b>🔑 Ваш новый VPN ключ</b>\n\n` +
      `<code>${newConfig.config_data}</code>`,
      { parse_mode: 'HTML' as TelegramBot.ParseMode }
    );
  } catch (error) {
    console.error('Error in /regenerate command:', error);
    bot.sendMessage(chatId, 'Ошибка при перевыпуске конфигурации.');
  }
});

bot.onText(/\/delete/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    const configToDelete = await VPNConfig.findOne({
      where: { 
        user_id: chatId.toString(),
        is_active: true
      }
    });

    if (!configToDelete) {
      await bot.sendMessage(chatId, 'У вас нет активного ключа для удаления.');
      return;
    }

    await outlineService.deactivateConfig(chatId.toString());
    await bot.sendMessage(chatId, 'Ваш VPN ключ был деактивирован.');
  } catch (error) {
    console.error('Error in /delete command:', error);
    bot.sendMessage(chatId, 'Ошибка при удалении конфигурации.');
  }
});

bot.onText(/\/faq/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
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

3. Как обновить ключ?
Используйте команду /regenerate

4. Как получить поддержку?
Используйте команду /support

5. Где посмотреть статистику?
Используйте команду /stats
`;
  bot.sendMessage(chatId, faqMessage);
});

bot.onText(/\/support/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  const supportMessage = `
Техническая поддержка:

1. Общие вопросы: @support_manager
2. Технические проблемы: @tech_support
3. Время работы: 9:00 - 21:00 МСК

Для быстрого ответа укажите:
- Вашу операционную систему
- Версию WireGuard
- Описание проблемы
`;
  bot.sendMessage(chatId, supportMessage);
});

bot.onText(/\/stats/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    const user = await User.findOne({ where: { telegram_id: chatId.toString() } });
    const configs = await VPNConfig.findAll({
      where: { user_id: chatId.toString(), is_active: true }
    });

    if (!configs.length) {
      return bot.sendMessage(chatId, 'У вас нет активных VPN конфигураций.');
    }

    let statsMessage = 'Статистика использования VPN:\n\n';
    
    for (const config of configs) {
      const metrics = await outlineService.getMetrics(config.config_id);
      const bytesTotal = metrics.dataTransferred.bytes;
      const bytesInMB = bytesTotal / (1024 * 1024);
      
      statsMessage += `ID: ${config.config_id}
Статус: Активна
Трафик: ${bytesInMB.toFixed(2)} MB\n\n`;
    }

    if (user?.is_admin) {
      const serverStatus = await monitoringService.getSystemStatus();
      statsMessage += `\nСтатус сервера:
CPU: ${serverStatus.metrics.cpu_usage.toFixed(1)}%
RAM: ${serverStatus.metrics.ram_usage.toFixed(1)}%
Диск: ${serverStatus.metrics.disk_usage.toFixed(1)}%
Активных подключений: ${serverStatus.metrics.active_connections}
Аптайм: ${serverStatus.uptime} часов`;
    }

    bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.error('Error in /stats command:', error);
    bot.sendMessage(chatId, 'Ошибка при получении статистики.');
  }
});

bot.onText(/\/admin/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    const admin = await isAdmin(chatId);
    if (!admin) {
      await bot.sendMessage(chatId, 'У вас нет прав администратора.');
      return;
    }

    await bot.sendMessage(chatId, 'Панель управления администратора:', adminKeyboard);
  } catch (error) {
    console.error('Error in /admin command:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
});

// Добавляем команды для администраторов
bot.onText(/\/addserver/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  const isUserAdmin = await isAdmin(chatId);
  if (!isUserAdmin) {
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
    const server = await outlineService.addServer(name, location, apiUrl, certSha256);
    await bot.sendMessage(
      chatId,
      `Сервер "${server.name}" успешно добавлен!\nID: ${server.id}\nЛокация: ${server.location}`
    );
  } catch (error) {
    console.error('Error adding server:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при добавлении сервера');
  }
});

bot.onText(/\/removeserver/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  const isUserAdmin = await isAdmin(chatId);
  if (!isUserAdmin) {
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
    await outlineService.removeServer(serverId);
    await bot.sendMessage(chatId, `Сервер с ID ${serverId} успешно деактивирован`);
  } catch (error) {
    console.error('Error removing server:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при деактивации сервера');
  }
});

bot.onText(/\/listservers/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  
  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  const isUserAdmin = await isAdmin(chatId);
  if (!isUserAdmin) {
    return bot.sendMessage(chatId, 'Эта команда доступна только администраторам');
  }

  const sendBotMessage = async (message: string, options?: TelegramBot.SendMessageOptions) => {
    console.log(`🤖 Ответ бота для ${username || 'Unknown'} (ID: ${chatId}):\n${message}`);
    return bot.sendMessage(chatId, message, options);
  };

  try {
    const servers = await outlineService.getAvailableServers();
    if (!servers.length) {
      return sendBotMessage('Нет доступных серверов');
    }

    let message = 'Список доступных серверов:\n\n';
    for (const server of servers) {
      message += `ID: ${server.id}\n` +
                `Имя: ${server.name}\n` +
                `Локация: ${server.location}\n` +
                `API URL: ${server.outline_api_url}\n\n`;
    }

    await sendBotMessage(message);
  } catch (error) {
    console.error('Error listing servers:', error);
    await sendBotMessage('Произошла ошибка при получении списка серверов');
  }
});
