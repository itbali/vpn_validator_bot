import TelegramBot from 'node-telegram-bot-api';
import { User, VPNConfig, VPNServer } from '../models';
import { outlineService } from './outlineService';
import { subscriptionService } from './subscriptionService';
import config from '../config';
import { MonitoringService } from './monitoringService';
import { formatBytes } from '../utils/formatters';
import { startHandler } from './onTextHandlers/startHandler';
import { helpHandler } from './onTextHandlers/helpHandler';
import { mentorHandler } from './onTextHandlers/mentorHandler';
import { regenerateKeyHandler } from './onTextHandlers/regenerateKeyHandler';
import { deleteHandler } from './onTextHandlers/deleteHandler';
import { faqHandler } from './onTextHandlers/faqHandler';
import { supportHandler } from './onTextHandlers/supportHandler';
import { statsHandler } from './onTextHandlers/statsHandler';
import { adminHandler } from './onTextHandlers/adminHandler';
import { addServerHandler } from './onTextHandlers/addServerHandler';
import { removeServerHandler } from './onTextHandlers/removeServerHandler';
import { listServersHandler } from './onTextHandlers/listServersHandler';

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

// Настройка меню команд для бота
const setupBotCommands = async (): Promise<void> => {
  try {
    // Базовые команды для всех пользователей
    const baseCommands = [
      { command: '/start', description: 'Запустить бота' },
      { command: '/help', description: 'Показать справку' },
      { command: '/vpn', description: 'Управление VPN' },
      { command: '/regenerate', description: 'Обновить VPN ключ' },
      { command: '/delete', description: 'Удалить VPN ключ' },
      { command: '/stats', description: 'Показать статистику' },
      { command: '/faq', description: 'Частые вопросы' },
      { command: '/support', description: 'Получить поддержку' },
      { command: '/mentor', description: 'Менторинг' },
    ];

    // Команды только для администраторов
    const adminCommands = [
      { command: '/admin', description: 'Админ панель' },
      { command: '/addserver', description: 'Добавить сервер' },
      { command: '/listservers', description: 'Список серверов' },
      { command: '/removeserver', description: 'Удалить сервер' },
    ];

    // Установка базовых команд для всех пользователей
    await bot.setMyCommands(baseCommands);

    // Для каждого администратора устанавливаем расширенный набор команд
    for (const adminId of config.telegram.adminIds) {
      try {
        await bot.setMyCommands([...baseCommands, ...adminCommands], { scope: { type: 'chat', chat_id: adminId } });
      } catch (err) {
        console.error(`Failed to set admin commands for admin ${adminId}:`, err);
      }
    }

    console.log('Bot menu commands have been successfully set up');
  } catch (error) {
    console.error('Error setting up bot commands:', error);
  }
};

// Обновление команд меню для конкретного пользователя
export const updateUserCommands = async (chatId: number): Promise<void> => {
  try {
    const isUserAdmin = await isAdmin(chatId);

    // Базовые команды для всех пользователей
    const baseCommands = [
      { command: '/start', description: 'Запустить бота' },
      { command: '/help', description: 'Показать справку' },
      { command: '/vpn', description: 'Управление VPN' },
      { command: '/regenerate', description: 'Обновить VPN ключ' },
      { command: '/delete', description: 'Удалить VPN ключ' },
      { command: '/stats', description: 'Показать статистику' },
      { command: '/faq', description: 'Частые вопросы' },
      { command: '/support', description: 'Получить поддержку' },
      { command: '/mentor', description: 'Менторинг' },
    ];

    // Команды только для администраторов
    const adminCommands = [
      { command: '/admin', description: 'Админ панель' },
      { command: '/addserver', description: 'Добавить сервер' },
      { command: '/listservers', description: 'Список серверов' },
      { command: '/removeserver', description: 'Удалить сервер' },
    ];

    const commands = isUserAdmin ? [...baseCommands, ...adminCommands] : baseCommands;
    await bot.setMyCommands(commands, { scope: { type: 'chat', chat_id: chatId } });
    console.log(`Commands updated for user ${chatId}, admin status: ${isUserAdmin}`);
  } catch (error) {
    console.error(`Error updating commands for user ${chatId}:`, error);
  }
};

// Инициализируем меню при запуске
setupBotCommands();

const adminKeyboard: TelegramBot.SendMessageOptions = {
  reply_markup: {
    keyboard: [
      [{ text: '🔑 Управление ключами' }, { text: '🔄 Проверить ключи' }, { text: '👥 Пользователи' }],
      [{ text: '📊 Статистика сервера' }, { text: '⊕ Добавить сервер' }, { text: '📋 Список серверов' }],
      [{ text: '⚙️ Текущий конфиг' }, { text: '◀️ Назад' }],
    ],
    resize_keyboard: true,
  },
};

const isAdmin = async (chatId: number): Promise<boolean> => {
  try {
    if (config.telegram.adminIds.includes(chatId)) {
      return true;
    }

    const user = await User.findOne({
      where: { telegram_id: String(chatId) },
    });

    if (!user) {
      return false;
    }

    if (!user.telegram_id || !user.username) {
      return false;
    }

    const channelId = config.telegram.channelId;
    const paidChannelId = config.telegram.paidChannelId;
    const chatMember = await bot.getChatMember(channelId, chatId);
    console.log({ chatMember });
    const paidChatMember = await bot.getChatMember(paidChannelId, chatId);
    console.log({ paidChatMember });
    const isAdminStatus =
      ['creator', 'administrator'].includes(chatMember.status) ||
      ['creator', 'administrator'].includes(paidChatMember.status);
    return isAdminStatus;
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
        ...(isUserAdmin ? [[{ text: '⚙️ Админ панель' }]] : []),
      ],
      resize_keyboard: true,
    },
  };
};

const vpnKeyboard: TelegramBot.SendMessageOptions = {
  reply_markup: {
    keyboard: [
      [{ text: '🔑 Получить ключ' }, { text: '🗑 Удалить ключ' }],
      [{ text: '📊 Статистика' }, { text: '🔄 Обновить ключ' }],
      [{ text: '❓ FAQ' }],
      [{ text: '◀️ Назад' }],
    ],
    resize_keyboard: true,
  },
};

const mentorKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📝 Разбор резюме', url: 'https://planerka.app/aleksei-diuzhev/razbor-rezyume' }],
      [{ text: '👨‍💻 Встреча с учеником', url: 'https://planerka.app/aleksei-diuzhev/vstrecha-s-uchenikom---1ch' }],
      [{ text: '🎯 Мок собес', url: 'https://planerka.app/aleksei-diuzhev/mokovoe-sobesedovanie' }],
    ],
  },
} as TelegramBot.SendMessageOptions;

const createServerSelectionKeyboard = async (): Promise<TelegramBot.SendMessageOptions> => {
  const servers = await outlineService.getAvailableServers();
  const keyboard = servers.map((server) => [{ text: `🌍 ${server.name} (${server.location})` }]);
  keyboard.push([{ text: '◀️ Назад' }]);

  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
    },
  };
};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // Обновляем команды меню для пользователя
  await updateUserCommands(chatId);

  // Запускаем стандартный обработчик
  await startHandler({
    msg,
    isAdmin: await isAdmin(chatId),
    bot,
    User,
    config,
    keyboard: await mainKeyboard(chatId),
    subscriptionService,
  });
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
    const isPaidSubscribed = await subscriptionService.checkPaidSubscription(chatId);
    const isMentoringSubscribed = await subscriptionService.checkMentorSubscription(chatId);
    const isSubscribed = isPaidSubscribed || isMentoringSubscribed;

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
            await sendBotMessage('Нет доступных серверов. Добавьте сервер с помощью кнопки "⊕ Добавить сервер"');
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
                console.warn(`Error getting metrics for key ${key.id}:`, error);
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

      case '⊕ Добавить сервер':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }
        // Инициализируем диалог добавления сервера
        serverDialogs.set(chatId, {
          step: 'name',
          data: {},
        });
        await sendBotMessage(
          'Давайте добавим новый сервер.\n\n' +
            'Шаг 1/4: Введите название сервера (например: "Server 1")\n\n' +
            '❌ Для отмены напишите "отмена"',
          {
            reply_markup: {
              keyboard: [[{ text: '❌ Отмена' }]],
              resize_keyboard: true,
            },
          },
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
            message +=
              `ID: ${server.id}\n` +
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

          await sendBotMessage(message, adminKeyboard);
        } catch (error) {
          console.error('Error validating keys:', error);
          await sendBotMessage('❌ Произошла ошибка при проверке ключей.', await mainKeyboard(chatId));
        }
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
            where: { user_id: user.telegram_id, is_active: true },
          });
          usersMessage += `ID: ${user.telegram_id}\n`;
          usersMessage += `Имя: ${user.username || 'Не указано'}\n`;
          usersMessage += `Статус: ${user.is_active ? '✅' : '❌'}\n`;
          usersMessage += `Админ: ${user.is_admin ? '✅' : '❌'}\n`;
          usersMessage += `VPN подписка: ${user.is_subscribed ? '✅' : '❌'}\n`;
          usersMessage += `Платная подписка: ${user.is_paid_subscribed ? '✅' : '❌'}\n`;
          usersMessage += `Активных ключей: ${configs.length}\n\n`;
        }
        await sendBotMessage(usersMessage, adminKeyboard);
        break;

      case '⚙️ Текущий конфиг':
        if (!isUserAdmin) {
          await sendBotMessage('У вас нет прав администратора.');
          return;
        }

        try {
          // Получаем общее количество серверов и активных ключей
          const servers = await outlineService.getAvailableServers();
          const totalServers = servers.length;

          let totalKeys = 0;
          for (const server of servers) {
            const keys = await outlineService.listKeys(server.id);
            totalKeys += keys.length;
          }

          // Получаем общее количество пользователей
          const totalUsers = await User.count();
          const activeUsers = await User.count({ where: { is_active: true } });

          // Формируем сообщение с информацией о настройках
          let configMessage = `<b>⚙️ Текущая конфигурация системы:</b>\n\n`;

          // Информация о серверах и ключах
          configMessage += `<b>Серверы и VPN:</b>\n`;
          configMessage += `• Всего серверов: ${totalServers}\n`;
          configMessage += `• Всего активных ключей: ${totalKeys}\n\n`;

          // Информация о пользователях
          configMessage += `<b>Пользователи:</b>\n`;
          configMessage += `• Всего пользователей: ${totalUsers}\n`;
          configMessage += `• Активных пользователей: ${activeUsers}\n\n`;

          // Информация о настройках мониторинга
          configMessage += `<b>Настройки мониторинга:</b>\n`;
          configMessage += `• Интервал проверки: ${config.monitoring.checkInterval} секунд\n`;
          configMessage += `• Порог CPU: ${config.monitoring.thresholds.cpu}%\n`;
          configMessage += `• Порог RAM: ${config.monitoring.thresholds.ram}%\n`;
          configMessage += `• Порог диска: ${config.monitoring.thresholds.disk}%\n\n`;

          // Информация о Telegram настройках
          configMessage += `<b>Настройки Telegram:</b>\n`;
          configMessage += `• ID основного канала: ${config.telegram.channelId}\n`;
          configMessage += `• ID платного канала: ${config.telegram.paidChannelId}\n`;
          configMessage += `• Количество администраторов: ${config.telegram.adminIds.length}\n`;

          await sendBotMessage(configMessage, {
            parse_mode: 'HTML' as TelegramBot.ParseMode,
            ...adminKeyboard,
          });
        } catch (error) {
          console.error('Error getting config info:', error);
          await sendBotMessage('Ошибка при получении информации о конфигурации.', adminKeyboard);
        }
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
            is_active: true,
          },
        });

        if (existingConfig) {
          const server = await VPNServer.findByPk(existingConfig.server_id);
          let messageText = `<b>🔑 Ваш активный VPN ключ</b>\n\n`;
          if (server) {
            messageText += `Сервер: ${server.name} (${server.location})\n`;
          }
          messageText += `<code>${existingConfig.config_data}</code>\n\n`;
          messageText += `<b>Скопируйте этот ключ и вставьте в приложение Outline.</b>`;
          await sendBotMessage(messageText, { parse_mode: 'HTML' as TelegramBot.ParseMode });
        } else {
          const keyboard = await createServerSelectionKeyboard();
          await sendBotMessage('Выберите сервер для подключения:', keyboard);
        }
        break;

      case '📊 Статистика':
        const configs = await VPNConfig.findAll({
          where: { user_id: chatId.toString(), is_active: true },
          include: [
            {
              model: VPNServer,
              required: false,
            },
          ],
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

            userStatsMessage +=
              `Сервер: ${serverName} (${location})\n` +
              `ID: ${config.config_id}\n` +
              `Статус: Активна\n` +
              `Трафик: ${formatBytes(metrics.dataTransferred.bytes)}\n\n`;
          } catch (error) {
            userStatsMessage += `ID: ${config.config_id}\n` + `Статус: Активна\n` + `Трафик: Нет данных\n\n`;
            console.warn(`Error getting metrics for key ${config.config_id}:`, error);
          }
        }

        if (user.is_admin) {
          try {
            const serverStatus = await monitoringService.getSystemStatus();
            userStatsMessage +=
              `\nСтатус сервера:\n` +
              `CPU: ${serverStatus.metrics.cpu_usage.toFixed(1)}%\n` +
              `RAM: ${serverStatus.metrics.ram_usage.toFixed(1)}%\n` +
              `Диск: ${serverStatus.metrics.disk_usage.toFixed(1)}%\n` +
              `Активных подключений: ${serverStatus.metrics.active_connections}\n` +
              `Аптайм: ${serverStatus.uptime} часов`;
          } catch (error) {
            userStatsMessage += '\nОшибка при получении статуса сервера';
            console.warn('Error getting server status:', error);
          }
        }

        await sendBotMessage(userStatsMessage);
        break;

      case '❓ FAQ':
        const faqMessage = `
Частые вопросы:

1. Как установить VPN?
- Скачайте и установите Outline Client (ссылкы ниже)
- Скопируйте полученный ключ доступа
- Вставьте ключ в приложение Outline Client
- Нажмите "Подключиться"

Ссылки:
<a href="https://itunes.apple.com/us/app/outline-app/id1356178125">MacOS</a>
<a href="https://itunes.apple.com/us/app/outline-app/id1356177741">iOS</a>
<a href="https://play.google.com/store/apps/details?id=org.outline.android.client">Android</a>
<a href="https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe">Windows</a>
<a href="https://support.google.com/outline/answer/15331527">Linux</a>
<a href="https://play.google.com/store/apps/details?id=org.outline.android.client">Chrome</a>


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
        await sendBotMessage(faqMessage, { parse_mode: 'HTML' as TelegramBot.ParseMode });
        break;

      case '🗑 Удалить ключ':
        const configToDelete = await VPNConfig.findOne({
          where: {
            user_id: chatId.toString(),
            is_active: true,
          },
        });

        if (!configToDelete) {
          await sendBotMessage('У вас нет активного ключа для удаления.');
          return;
        }

        await outlineService.deactivateConfig(chatId.toString());
        await sendBotMessage('Ваш VPN ключ был деактивирован.');
        break;

      case '🔄 Обновить ключ':
        const currentConfig = await VPNConfig.findOne({
          where: {
            user_id: chatId.toString(),
            is_active: true,
          },
        });

        if (!currentConfig) {
          await sendBotMessage('У вас нет активного ключа для обновления.');
          return;
        }

        try {
          const newConfig = await outlineService.generateConfig(
            chatId.toString(),
            currentConfig.server_id,
            msg.from?.username || msg.from?.first_name,
          );
          // Деактивируем старый конфиг только после успешного создания нового
          await outlineService.deactivateConfig(chatId.toString());

          await sendBotMessage(
            `<b>🔑 Ваш VPN ключ был обновлен!</b>\n\n` +
              `<b>⚡️ Скопируйте этот ключ и вставьте в приложение:</b>\n\n` +
              `<code>${newConfig.config_data}</code>`,
            { parse_mode: 'HTML' as TelegramBot.ParseMode },
          );
        } catch (error) {
          console.error('Error regenerating VPN key:', error);
          await sendBotMessage('Произошла ошибка при обновлении VPN ключа. Попробуйте позже.');
        }
        break;

      case '◀️ Назад':
        if (!user) {
          await sendBotMessage('Пожалуйста, начните с команды /start');
          return;
        }
        await sendBotMessage('Главное меню:', await mainKeyboard(chatId));
        break;

      case '🎭 VPN':
        await sendBotMessage('Выберите действие:', vpnKeyboard);
        break;

      case '👨‍💻 Менторинг':
        const isMentorSubscriber = await subscriptionService.checkMentorSubscription(chatId);
        if (!isMentorSubscriber) {
          await sendBotMessage(
            `Для получения информации о менторинге, посетите <a href="https://alex-diuzhev.ru/">сайт ментора</a>`,
            {
              parse_mode: 'HTML',
            },
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
            ...mentorKeyboard,
          },
        );
        break;

      case '◀️ Главное меню':
        const mainMenuKeyboard = await mainKeyboard(chatId);
        await sendBotMessage('Главное меню:', mainMenuKeyboard);
        break;

      case '🔄 Перезапустить бота':
        await sendBotMessage('Бот перезапущен. Выберите действие:', await mainKeyboard(chatId));
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
                    '❌ Для отмены напишите "отмена"',
                );
                break;

              case 'location':
                dialogState.data.location = text;
                dialogState.step = 'api_url';
                await sendBotMessage(
                  'Шаг 3/4: Введите API URL сервера (например: "https://example.com:1234/abc")\n\n' +
                    '❌ Для отмены напишите "отмена"',
                );
                break;

              case 'api_url':
                dialogState.data.api_url = text;
                dialogState.step = 'cert_sha256';
                await sendBotMessage('Шаг 4/4: Введите SHA256 сертификата\n\n' + '❌ Для отмены напишите "отмена"');
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
                    adminKeyboard,
                  );
                }
                // Очищаем состояние диалога
                serverDialogs.delete(chatId);
                break;
            }
          } catch (error) {
            console.error('Error in server dialog:', error);
            await sendBotMessage(
              '❌ Произошла ошибка при добавлении сервера. Попробуйте снова через команду "⊕ Добавить сервер"',
              adminKeyboard,
            );
            serverDialogs.delete(chatId);
          }
          break;
        }

        if (text.startsWith('🌍 ')) {
          // Extract server name from button text by removing the emoji and location part
          const buttonText = text.slice(2).trim();
          // Find the last occurrence of " (" to properly handle server names that contain parentheses
          const lastParenIndex = buttonText.lastIndexOf(' (');
          const serverName = lastParenIndex !== -1 ? buttonText.substring(0, lastParenIndex).trim() : buttonText;

          const server = await VPNServer.findOne({
            where: {
              name: serverName,
              is_active: true,
            },
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
              msg.from?.username || msg.from?.first_name,
            );

            if (!vpnConfig || !vpnConfig.config_data) {
              await sendBotMessage('Не удалось создать VPN ключ. Попробуйте позже.');
            } else {
              let messageText = `<b>🔑 Ваш новый VPN ключ</b>\n\n`;
              messageText += `Сервер: ${server.name} (${server.location})\n`;
              messageText += `<code>${vpnConfig.config_data}</code>\n\n`;
              messageText += `<b>Скопируйте этот ключ и вставьте в приложение Outline.</b>`;
              await sendBotMessage(messageText, { parse_mode: 'HTML' as TelegramBot.ParseMode });
              await sendBotMessage('Возврат в главное меню...', await mainKeyboard(chatId));
              return;
            }
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

bot.onText(/\/help/, (msg: TelegramBot.Message) => helpHandler({ msg, bot }));

bot.onText(/\/mentor/, (msg: TelegramBot.Message) => mentorHandler({ msg, bot }));

bot.onText(/\/regenerate/, async (msg: TelegramBot.Message) =>
  regenerateKeyHandler({ msg, bot, subscriptionService, VPNConfig, outlineService }),
);

bot.onText(/\/delete/, async (msg: TelegramBot.Message) => deleteHandler({ msg, bot, outlineService }));

bot.onText(/\/faq/, (msg: TelegramBot.Message) => faqHandler({ msg, bot }));

bot.onText(/\/support/, (msg: TelegramBot.Message) => supportHandler({ msg, bot }));

bot.onText(/\/stats/, async (msg: TelegramBot.Message) =>
  statsHandler({ msg, bot, VPNConfig, outlineService, User, monitoringService }),
);

bot.onText(/\/admin/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const isUserAdmin = await isAdmin(chatId);

  // Если пользователь является администратором, обновляем его команды
  if (isUserAdmin) {
    await updateUserCommands(chatId);
  }

  await adminHandler({ msg, bot, isAdmin: isUserAdmin, adminKeyboard });
});

bot.onText(/\/addserver/, async (msg) =>
  addServerHandler({ msg, bot, outlineService, isAdmin: await isAdmin(msg.chat.id) }),
);

bot.onText(/\/removeserver/, async (msg) =>
  removeServerHandler({ msg, bot, isAdmin: await isAdmin(msg.chat.id), outlineService }),
);

bot.onText(/\/listservers/, async (msg) =>
  listServersHandler({ msg, bot, outlineService, isAdmin: await isAdmin(msg.chat.id) }),
);

bot.onText(/\/vpn/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ where: { telegram_id: chatId.toString() } });

  if (!user) {
    await bot.sendMessage(chatId, 'Пожалуйста, начните с команды /start');
    return;
  }

  const isPaidSubscribed = await subscriptionService.checkPaidSubscription(chatId);
  const isMentoringSubscribed = await subscriptionService.checkMentorSubscription(chatId);
  const isSubscribed = isPaidSubscribed || isMentoringSubscribed;

  if (!user.is_active) {
    await bot.sendMessage(chatId, 'Ваш аккаунт не активен. Обратитесь к администратору.');
    return;
  }

  if (!isSubscribed) {
    await bot.sendMessage(chatId, 'Для использования бота необходимо подписаться на каналы.');
    return;
  }

  await bot.sendMessage(chatId, 'Выберите действие:', vpnKeyboard);
});

// Обработка ошибок подключения
bot.on('polling_error', async (error: any) => {
  console.error('Polling error:', error.message);

  // Проверяем наличие кода ошибки и его значение
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'EFATAL' || error.code === 'ETIMEDOUT' || error.code === 'EAI_AGAIN')
  ) {
    console.log('Connection error detected, attempting to reconnect in 10 seconds...');

    // Останавливаем текущий поллинг
    await bot.stopPolling();

    // Ждем 10 секунд перед повторным подключением
    setTimeout(async () => {
      try {
        await bot.startPolling();
        console.log('Successfully reconnected to Telegram API');
      } catch (error) {
        console.error('Failed to reconnect:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, 10000);
  }
});
