import TelegramBot from 'node-telegram-bot-api';
import { User, VPNConfig } from '../models';
import { outlineService } from './outlineService';
import { subscriptionService } from './subscriptionService';
import config from '../config';
import { MonitoringService } from './monitoringService';
import { formatBytes } from '../utils/formatters';

export const bot = new TelegramBot(config.bot.token, { polling: true });
const monitoringService = new MonitoringService(bot);

const adminKeyboard: TelegramBot.SendMessageOptions = {
  reply_markup: {
    keyboard: [
      [{ text: '🔑 Управление ключами' }, { text: '🔄 Проверить ключи' }],
      [{ text: '📊 Статистика сервера' }, { text: '👥 Пользователи' }],
      [{ text: '◀️ Назад' }]
    ],
    resize_keyboard: true
  }
};

async function isAdmin(chatId: number): Promise<boolean> {
  try {
    const member = await bot.getChatMember(Number(config.telegram.channelId), chatId);
    return ['administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

const mainKeyboard = (isAdmin: boolean): TelegramBot.SendMessageOptions => ({
  reply_markup: {
    keyboard: [
      [{ text: '🎭 VPN' }, { text: '👨‍💻 Менторинг' }],
      [{ text: '🔄 Перезапустить бота' }],
      ...(isAdmin ? [[{ text: '⚙️ Админ панель' }]] : [])
    ],
    resize_keyboard: true
  }
});

const vpnKeyboard: TelegramBot.SendMessageOptions = {
  reply_markup: {
    keyboard: [
      [{ text: '🔑 Получить ключ' }, { text: '📊 Статистика' }],
      [{ text: '🔄 Обновить ключ' }, { text: '🗑 Удалить ключ' }],
      [{ text: '❓ Инструкция' }],
      [{ text: '◀️ Главное меню' }]
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

bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  console.log(`👤 Пользователь ${username || 'без username'} (ID: ${chatId}) запустил бота`);

  try {
    const isUserAdmin = await isAdmin(chatId);
    console.log(`📝 Статус пользователя ${chatId}:`, {
      username: username,
      isAdmin: isUserAdmin,
      isChatAdmin: isUserAdmin
    });

    const isSubscribed = await subscriptionService.checkUserSubscription(chatId);
    if (!isSubscribed) {
      return bot.sendMessage(
        chatId,
        `Для использования бота необходимо подписаться на канал: ${config.telegram.channelUrl}`
      );
    }

    const [user] = await User.findOrCreate({
      where: { telegram_id: chatId.toString() },
      defaults: { 
        username, 
        is_subscribed: true,
        is_admin: isUserAdmin 
      }
    });

    if (!user.is_active) {
      return bot.sendMessage(chatId, 'Ваш аккаунт не активен. Обратитесь к администратору.');
    }

    // Обновляем статус админа в базе данных, если он изменился
    if (user.is_admin !== isUserAdmin) {
      await User.update(
        { is_admin: isUserAdmin },
        { where: { telegram_id: chatId.toString() } }
      );
    }

    await bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', mainKeyboard(isUserAdmin));
  } catch (error) {
    console.error('Error in /start command:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
});

// Обработчик текстовых сообщений для кнопок меню
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const username = msg.from?.username;

  console.log(`📨 Сообщение от ${username || 'без username'} (ID: ${chatId}): ${text}`);

  if (!text) return;

  try {
    const isUserAdmin = await isAdmin(chatId);
    const user = await User.findOne({ 
      where: { telegram_id: chatId.toString() }
    });

    if (!user) {
      await bot.sendMessage(chatId, 'Пожалуйста, начните с команды /start');
      return;
    }

    if (!user.is_active || !user.is_subscribed) {
      await bot.sendMessage(chatId, 'Ваш аккаунт не активен или вы не подписаны на канал.');
      return;
    }

    if (isUserAdmin) {
      console.log(`🔑 Запрос от админа канала ${username || 'без username'} (ID: ${chatId})`);
    }

    switch (text) {
      case '📊 Статистика сервера':
        if (!isUserAdmin) {
          await bot.sendMessage(chatId, 'У вас нет прав администратора.');
          return;
        }
        const serverStatus = await monitoringService.getSystemStatus();
        const metrics = await outlineService.getMetrics('all');
        let serverStatsMessage = `📊 Статистика сервера:\n\n`;
        serverStatsMessage += `CPU: ${serverStatus.metrics.cpu_usage.toFixed(1)}%\n`;
        serverStatsMessage += `RAM: ${serverStatus.metrics.ram_usage.toFixed(1)}%\n`;
        serverStatsMessage += `Диск: ${serverStatus.metrics.disk_usage.toFixed(1)}%\n`;
        serverStatsMessage += `Активных подключений: ${serverStatus.metrics.active_connections}\n`;
        serverStatsMessage += `Аптайм: ${serverStatus.uptime} часов\n`;
        await bot.sendMessage(chatId, serverStatsMessage);
        break;

      case '🔑 Управление ключами':
        if (!isUserAdmin) {
          await bot.sendMessage(chatId, 'У вас нет прав администратора.');
          return;
        }
        const keys = await outlineService.listKeys();
        let keysMessage = `🔑 Список всех ключей:\n\n`;
        for (const key of keys) {
          const metrics = await outlineService.getMetrics(key.id);
          keysMessage += `ID: ${key.id}\n`;
          keysMessage += `Имя: ${key.name}\n`;
          keysMessage += `Трафик: ${formatBytes(metrics.bytesTransferred)}\n\n`;
        }
        await bot.sendMessage(chatId, keysMessage);
        break;

      case '🔄 Проверить ключи':
        if (!isUserAdmin) {
          await bot.sendMessage(chatId, 'У вас нет прав администратора.');
          return;
        }
        await bot.sendMessage(chatId, 'Начинаю проверку ключей...');
        try {
          const result = await outlineService.validateAllKeys();
          let message = `✅ Проверка завершена\n\n`;
          message += `📊 Всего проверено ключей: ${result.totalChecked}\n`;
          message += `❌ Деактивировано ключей: ${result.deactivatedKeys.length}\n\n`;
          
          if (result.deactivatedKeys.length > 0) {
            message += `Деактивированные ключи:\n`;
            for (const key of result.deactivatedKeys) {
              const user = await User.findOne({ where: { telegram_id: key.userId } });
              message += `- ID: ${key.id} (Пользователь: ${user?.username || key.userId})\n`;
            }
          }
          
          await bot.sendMessage(chatId, message);
        } catch (error) {
          console.error('Error validating keys:', error);
          await bot.sendMessage(chatId, '❌ Произошла ошибка при проверке ключей.');
        }
        await bot.sendMessage(chatId, 'Вернуться в главное меню:', mainKeyboard(isUserAdmin));
        break;

      case '👥 Пользователи':
        if (!isUserAdmin) {
          await bot.sendMessage(chatId, 'У вас нет прав администратора.');
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
          usersMessage += `Активных ключей: ${configs.length}\n\n`;
        }
        await bot.sendMessage(chatId, usersMessage);
        await bot.sendMessage(chatId, 'Вернуться в главное меню:', mainKeyboard(true));
        break;

      case '⚙️ Админ панель':
        if (!isUserAdmin) {
          await bot.sendMessage(chatId, 'У вас нет прав администратора.');
          return;
        }
        await bot.sendMessage(chatId, 'Панель управления администратора:', adminKeyboard);
        break;

      case '🔑 Получить ключ':
        const existingConfig = await VPNConfig.findOne({
          where: { 
            user_id: chatId.toString(),
            is_active: true
          }
        });

        if (existingConfig) {
          await bot.sendMessage(
            chatId,
            `<b>🔑 Ваш активный VPN ключ</b>\n\n` +
            `<b>Скопируйте этот ключ и вставьте в приложение Outline:</b>\n\n` +
            `<code>${existingConfig.config_data}</code>`,
            { parse_mode: 'HTML' as TelegramBot.ParseMode }
          );
        } else {
          try {
            await outlineService.deactivateConfig(chatId.toString());
            
            const vpnConfig = await outlineService.generateConfig(
              chatId.toString(),
              msg.from?.username || msg.from?.first_name
            );

            await bot.sendMessage(
              chatId,
              `<b>🔑 Ваш новый ключ создан!</b>\n\n` +
              `<b>📱 Установите приложение Outline VPN для iOS или Android</b>\n\n` +
              `<b>⚡️ Скопируйте этот ключ и вставьте в приложение:</b>\n\n` +
              `<code>${vpnConfig.config_data}</code>`,
              { parse_mode: 'HTML' as TelegramBot.ParseMode }
            );
          } catch (error) {
            console.error('Error in /get_vpn_key:', error);
            await bot.sendMessage(chatId, 'Произошла ошибка при получении VPN ключа. Попробуйте позже.');
          }
        }
        break;

      case '📊 Статистика':
        const configs = await VPNConfig.findAll({
          where: { user_id: chatId.toString(), is_active: true }
        });

        if (!configs.length) {
          await bot.sendMessage(chatId, 'У вас нет активных VPN конфигураций.');
          return;
        }

        let userStatsMessage = 'Статистика использования VPN:\n\n';
        
        for (const config of configs) {
          try {
            const metrics = await outlineService.getMetrics(config.config_id);
            const bytesTotal = metrics.bytesTransferred;
            const bytesInMB = bytesTotal / (1024 * 1024);
            
            userStatsMessage += `ID: ${config.config_id}\nСтатус: Активна\nТрафик: ${bytesInMB.toFixed(2)} MB\n\n`;
          } catch (error) {
            userStatsMessage += `ID: ${config.config_id}\nСтатус: Активна\nТрафик: Нет данных\n\n`;
          }
        }

        if (user.is_admin) {
          try {
            const serverStatus = await monitoringService.getSystemStatus();
            userStatsMessage += `\nСтатус сервера:\nCPU: ${serverStatus.metrics.cpu_usage.toFixed(1)}%\nRAM: ${serverStatus.metrics.ram_usage.toFixed(1)}%\nДиск: ${serverStatus.metrics.disk_usage.toFixed(1)}%\nАктивных подключений: ${serverStatus.metrics.active_connections}\nАптайм: ${serverStatus.uptime} часов`;
          } catch (error) {
            userStatsMessage += '\nОшибка при получении статуса сервера';
          }
        }

        await bot.sendMessage(chatId, userStatsMessage);
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
Используйте кнопку "Обновить ключ" (старый ключ будет деактивирован)

4. Как посмотреть статистику?
Используйте кнопку "Статус"

5. Что делать если приложение не подключается?
- Проверьте подключение к интернету
- Убедитесь что вы используете последнюю версию Outline Client
- Попробуйте удалить и заново добавить ключ в приложение
`;
        await bot.sendMessage(chatId, faqMessage);
        break;

      case '🔄 Обновить ключ':
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

        const newConfig = await outlineService.generateConfig(chatId.toString());
        await outlineService.deactivateConfig(chatId.toString());
        
        await bot.sendMessage(
          chatId,
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
          await bot.sendMessage(chatId, 'У вас нет активного ключа для удаления.');
          return;
        }

        await outlineService.deactivateConfig(chatId.toString());
        await bot.sendMessage(chatId, 'Ваш VPN ключ был деактивирован.');
        break;

      case '◀️ Назад':
        if (!user) {
          await bot.sendMessage(chatId, 'Пожалуйста, начните с команды /start');
          return;
        }
        await bot.sendMessage(chatId, 'Главное меню:', mainKeyboard(isUserAdmin));
        break;

      case '🎭 VPN':
        await bot.sendMessage(
          chatId,
          'Выберите действие:',
          vpnKeyboard
        );
        break;

      case '👨‍💻 Менторинг':
        await bot.sendMessage(
          chatId,
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
        await bot.sendMessage(
          chatId,
          'Главное меню:',
          mainKeyboard(isUserAdmin)
        );
        break;

      case '🔄 Перезапустить бота':
        await bot.sendMessage(
          chatId,
          'Бот перезапущен. Выберите действие:',
          mainKeyboard(isUserAdmin)
        );
        break;

      case '❓ Инструкция':
        await bot.sendMessage(
          chatId,
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
    }
  } catch (error) {
    console.error('Error handling menu button:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
});

bot.onText(/\/help/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
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

    const newConfig = await outlineService.generateConfig(chatId.toString());
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
      const bytesTotal = metrics.bytesTransferred;
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