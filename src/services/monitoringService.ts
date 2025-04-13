import os from 'os';
import { ServerMetric } from '../models';
import { ServerMetricInstance } from '../types/models';
import { Op } from 'sequelize';
import TelegramBot from 'node-telegram-bot-api';
import { User } from '../models';

interface SystemStatus {
  metrics: {
    cpu_usage: number;
    ram_usage: number;
    disk_usage: number;
    active_connections: number;
  };
  uptime: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

interface MetricsWithAlerts {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  hasHighCpu: boolean;
  hasHighMemory: boolean;
  hasHighDisk: boolean;
}

export class MonitoringService {
  private bot: TelegramBot;
  private checkInterval: number;

  constructor(bot: TelegramBot, checkInterval = 60000) {
    this.bot = bot;
    this.checkInterval = checkInterval;
  }

  private async getAdminUsers(): Promise<string[]> {
    const admins = await User.findAll({
      where: {
        is_admin: true,
        is_active: true
      }
    });
    return admins.map(admin => admin.telegram_id.toString());
  }

  private async sendAlertToAdmins(message: string) {
    const adminIds = await this.getAdminUsers();
    for (const adminId of adminIds) {
      try {
        await this.bot.sendMessage(adminId, message);
      } catch (error) {
        console.error(`Failed to send alert to admin ${adminId}:`, error);
      }
    }
  }

  async startMonitoring() {
    setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        
        // Сохраняем метрики в базу данных
        await ServerMetric.create({
          cpu_usage: metrics.cpuUsage,
          ram_usage: metrics.memoryUsage,
          disk_usage: metrics.diskUsage,
          active_connections: 0, // TODO: добавить подсчет активных подключений
          timestamp: new Date()
        });

        if (metrics.hasHighCpu) {
          await this.sendAlertToAdmins(`⚠️ Внимание! Высокая загрузка CPU: ${metrics.cpuUsage.toFixed(1)}%`);
        }

        if (metrics.hasHighMemory) {
          await this.sendAlertToAdmins(`⚠️ Внимание! Высокая загрузка памяти: ${metrics.memoryUsage.toFixed(1)}%`);
        }

        if (metrics.hasHighDisk) {
          await this.sendAlertToAdmins(`⚠️ Внимание! Высокая загрузка диска: ${metrics.diskUsage.toFixed(1)}%`);
        }
      } catch (error) {
        console.error('Error in monitoring service:', error);
      }
    }, this.checkInterval);
  }

  async collectMetrics(): Promise<MetricsWithAlerts> {
    const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

    // Получаем использование диска
    const diskUsage = await this.getDiskUsage();

    return {
      cpuUsage,
      memoryUsage,
      diskUsage,
      hasHighCpu: cpuUsage > 80,
      hasHighMemory: memoryUsage > 90,
      hasHighDisk: diskUsage > 90
    };
  }

  private async getDiskUsage(): Promise<number> {
    return new Promise((resolve) => {
      // На данный момент возвращаем фиксированное значение
      // TODO: добавить реальный подсчет использования диска
      resolve(50);
    });
  }

  async getMetrics(period = '24h'): Promise<ServerMetricInstance[]> {
    const periods: { [key: string]: number } = {
      '24h': 24,
      '7d': 168,
      '30d': 720
    };

    const hours = periods[period] || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return await ServerMetric.findAll({
      where: {
        timestamp: {
          [Op.gte]: since
        }
      },
      order: [['timestamp', 'ASC']]
    });
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const latestMetric = await ServerMetric.findOne({
      order: [['timestamp', 'DESC']]
    });

    if (!latestMetric) {
      // Если метрик нет в базе, собираем текущие
      const currentMetrics = await this.collectMetrics();
      return {
        metrics: {
          cpu_usage: currentMetrics.cpuUsage,
          ram_usage: currentMetrics.memoryUsage,
          disk_usage: currentMetrics.diskUsage,
          active_connections: 0
        },
        uptime: (os.uptime() / 3600).toFixed(1),
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch()
      };
    }

    return {
      metrics: {
        cpu_usage: latestMetric.cpu_usage,
        ram_usage: latestMetric.ram_usage,
        disk_usage: latestMetric.disk_usage,
        active_connections: latestMetric.active_connections
      },
      uptime: (os.uptime() / 3600).toFixed(1),
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch()
    };
  }
} 