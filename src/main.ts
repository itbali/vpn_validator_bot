import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { sequelize } from './models';
import { bot } from './services/telegramService';
import config from './config';
import { MonitoringService } from './services/monitoringService';

const app = express();
const monitoringService = new MonitoringService(bot);

// Эндпоинт для проверки здоровья приложения
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function start(): Promise<void> {
  try {
    // Синхронизация базы данных
    await sequelize.sync();
    console.log('Database synchronized');

    // Запуск мониторинга сервера
    const interval = config.monitoring.checkInterval;
    setInterval(async () => {
      try {
        const metrics = await monitoringService.collectMetrics();

        if (metrics.hasHighCpu) {
          for (const adminId of config.telegram.adminIds) {
            await bot.sendMessage(adminId, `⚠️ Высокая загрузка CPU: ${metrics.cpuUsage.toFixed(1)}%`);
          }
        }

        if (metrics.hasHighMemory) {
          for (const adminId of config.telegram.adminIds) {
            await bot.sendMessage(adminId, `⚠️ Высокая загрузка памяти: ${metrics.memoryUsage.toFixed(1)}%`);
          }
        }
      } catch (error) {
        console.error('Error collecting server metrics:', error);
      }
    }, interval * 1000);
    console.log('Server monitoring started');

    // Запуск HTTP сервера
    app.listen(config.server.port, () => {
      console.log(`HTTP server is running on port ${config.server.port}`);
    });

    console.log('Telegram bot started');
    console.log(`Environment: ${process.env.NODE_ENV}`);
    const botInfo = await bot.getMe();
    console.log(`Bot username: ${botInfo.username}`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Обработка ошибок
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error: Error) => {
  console.error('Unhandled Rejection:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Starting graceful shutdown...');
  try {
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

start();
