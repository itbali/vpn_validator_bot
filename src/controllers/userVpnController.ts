import { Context } from 'telegraf';
import { outlineService } from '../services/outlineService';
import { VPNConfig } from '../models';
import { formatBytes } from '../utils/formatters';

export class UserVpnController {
  async getMyConfig(ctx: Context) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('Ошибка: не удалось определить пользователя');
        return;
      }

      const config = await VPNConfig.findOne({
        where: {
          user_id: userId,
          is_active: true
        }
      });

      if (!config) {
        await ctx.reply('У вас нет активной VPN конфигурации');
        return;
      }

      const key = await outlineService.getKeyById(config.config_id);
      const metrics = await outlineService.getMetrics(config.config_id);
      const dataLimit = await outlineService.getDataLimit(config.config_id);

      let message = `🔑 Ваш VPN ключ:\n\n`;
      message += `📡 Адрес подключения: ${key.accessUrl}\n`;
      message += `📊 Использовано трафика: ${formatBytes(metrics.dataTransferred.bytes)}\n`;
      
      if (dataLimit) {
        const percentUsed = (metrics.dataTransferred.bytes / dataLimit.bytes) * 100;
        message += `\n📈 Лимит трафика: ${formatBytes(dataLimit.bytes)}\n`;
        message += `📊 Использовано: ${percentUsed.toFixed(1)}%\n`;
      }

      await ctx.reply(message);
    } catch (error) {
      console.error('Error in getMyConfig:', error);
      await ctx.reply('Произошла ошибка при получении конфигурации');
    }
  }

  async getMyUsage(ctx: Context) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('Ошибка: не удалось определить пользователя');
        return;
      }

      const config = await VPNConfig.findOne({
        where: {
          user_id: userId,
          is_active: true
        }
      });

      if (!config) {
        await ctx.reply('У вас нет активной VPN конфигурации');
        return;
      }

      const metrics = await outlineService.getMetrics(config.config_id);
      const dataLimit = await outlineService.getDataLimit(config.config_id);

      let message = `📊 Статистика использования VPN:\n\n`;
      message += `📊 Использовано трафика: ${formatBytes(metrics.dataTransferred.bytes)}\n`;
      
      if (dataLimit) {
        const remaining = dataLimit.bytes - metrics.dataTransferred.bytes;
        const percentUsed = (metrics.dataTransferred.bytes / dataLimit.bytes) * 100;
        message += `\n🎯 Лимит: ${formatBytes(dataLimit.bytes)}\n`;
        message += `✨ Осталось: ${formatBytes(remaining)}\n`;
        message += `📊 Использовано: ${percentUsed.toFixed(1)}%\n`;
      }

      await ctx.reply(message);
    } catch (error) {
      console.error('Error in getMyUsage:', error);
      await ctx.reply('Произошла ошибка при получении статистики');
    }
  }
}