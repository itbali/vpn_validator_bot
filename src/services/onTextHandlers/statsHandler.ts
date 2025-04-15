import { HandlerType } from './handlerType';

export const statsHandler: HandlerType = async ({msg, bot, VPNConfig, outlineService, User, monitoringService}) => {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  if (!isPrivate) {
    return;
  }

  if (!msg.from) {
    return bot.sendMessage(chatId, 'Не удалось определить отправителя сообщения');
  }

  try {
    const user = await User?.findOne({ where: { telegram_id: chatId.toString() } });
    const configs = await VPNConfig?.findAll({
      where: { user_id: chatId.toString(), is_active: true }
    });

    if (!configs?.length) {
      return bot.sendMessage(chatId, 'У вас нет активных VPN конфигураций.');
    }

    let statsMessage = 'Статистика использования VPN:\n\n';
    
    for (const config of configs) {
      const metrics = await outlineService?.getMetrics(config.config_id);
      const bytesTotal = metrics?.dataTransferred.bytes;
      const bytesInMB = bytesTotal ? bytesTotal / (1024 * 1024) : 0;
      
      statsMessage += `ID: ${config.config_id}
Статус: Активна
Трафик: ${bytesInMB.toFixed(2)} MB\n\n`;
    }

    if (user?.is_admin) {
      const serverStatus = await monitoringService?.getSystemStatus();
      statsMessage += `\nСтатус сервера:
CPU: ${serverStatus?.metrics.cpu_usage.toFixed(1)}%
RAM: ${serverStatus?.metrics.ram_usage.toFixed(1)}%
Диск: ${serverStatus?.metrics.disk_usage.toFixed(1)}%
Активных подключений: ${serverStatus?.metrics.active_connections}
Аптайм: ${serverStatus?.uptime} часов`;
    }

    bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.error('Error in /stats command:', error);
    bot.sendMessage(chatId, 'Ошибка при получении статистики.');
  }
}
  