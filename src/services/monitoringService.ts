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
  hasHighCpu: boolean;
  hasHighMemory: boolean;
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
        isAdmin: true,
        isActive: true
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
        
        if (metrics.hasHighCpu) {
          await this.sendAlertToAdmins(`⚠️ Внимание! Высокая загрузка CPU: ${metrics.cpuUsage.toFixed(1)}%`);
        }

        if (metrics.hasHighMemory) {
          await this.sendAlertToAdmins(`⚠️ Внимание! Высокая загрузка памяти: ${metrics.memoryUsage.toFixed(1)}%`);
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

    return {
      cpuUsage,
      memoryUsage,
      hasHighCpu: cpuUsage > 80,
      hasHighMemory: memoryUsage > 90
    };
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
      throw new Error('No metrics available');
    }

    const uptimeHours = os.uptime() / 3600;

    return {
      metrics: {
        cpu_usage: latestMetric.cpu_usage,
        ram_usage: latestMetric.ram_usage,
        disk_usage: latestMetric.disk_usage,
        active_connections: latestMetric.active_connections
      },
      uptime: uptimeHours.toFixed(1),
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch()
    };
  }
} 