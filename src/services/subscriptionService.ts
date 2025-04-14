import { User, VPNConfig } from '../models';
import config from '../config';
import { bot } from './telegramService';
import { outlineService } from './outlineService';

class SubscriptionService {
  async checkUserSubscription(userId: string | number): Promise<boolean> {
    try {
      const regularMember = await bot.getChatMember(
        Number(config.telegram.channelId),
        typeof userId === 'string' ? Number(userId) : userId
      );

      const validStatuses = ['member', 'administrator', 'creator'];
      const isRegularSubscribed = validStatuses.includes(regularMember.status);
      let isPaidSubscribed = false;

      if (config.telegram.paidChannelId) {
        const paidMember = await bot.getChatMember(
          Number(config.telegram.paidChannelId),
          typeof userId === 'string' ? Number(userId) : userId
        );
        isPaidSubscribed = validStatuses.includes(paidMember.status);
      }

      // Проверяем, является ли пользователь администратором
      const isAdmin = config.telegram.adminIds.includes(
        typeof userId === 'string' ? Number(userId) : userId
      );

      // Если пользователь админ, считаем его подписанным на все каналы
      const isSubscribed = isAdmin || (isRegularSubscribed && (isPaidSubscribed || !config.telegram.paidChannelId));

      await User.update(
        {
          is_subscribed: isSubscribed,
          is_paid_subscribed: isAdmin || isPaidSubscribed,
          subscription_check: new Date()
        },
        {
          where: { telegram_id: userId.toString() }
        }
      );

      return isSubscribed;
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  }

  async checkMentorSubscription(userId: string | number): Promise<boolean> {
    try {
      const regularMember = await bot.getChatMember(
        Number(config.telegram.channelId),
        typeof userId === 'string' ? Number(userId) : userId
      );
      const isRegularSubscribed = ['member', 'administrator', 'creator'].includes(regularMember.status);

      if (config.telegram.paidChannelId) {
        const paidMember = await bot.getChatMember(
          Number(config.telegram.paidChannelId),
          typeof userId === 'string' ? Number(userId) : userId
        );
        const isPaidSubscribed = ['member', 'administrator', 'creator'].includes(paidMember.status);
        return isRegularSubscribed && isPaidSubscribed;
      }

      return isRegularSubscribed;
    } catch (error) {
      console.error('Error checking mentor subscription:', error);
      return false;
    }
  }

  async checkAllSubscriptions(): Promise<void> {
    const users = await User.findAll({
      where: { is_active: true },
      include: [VPNConfig]
    });

    const { deactivatedKeys } = await outlineService.validateAllKeys();

    for (const user of users) {
      const isSubscribed = await this.checkUserSubscription(user.telegram_id);
      
      if (!isSubscribed && user.is_subscribed) {
        // Деактивируем VPN если пользователь отписался
        await VPNConfig.update(
          { is_active: false },
          { where: { user_id: user.telegram_id } }
        );

        await bot.sendMessage(
          user.telegram_id,
          'Ваш VPN был деактивирован, так как вы отписались от канала. Подпишитесь снова и используйте /start для восстановления доступа.'
        );
      }

      const userDeactivatedKey = deactivatedKeys.find(key => key.userId === user.telegram_id);
      if (userDeactivatedKey) {
        await bot.sendMessage(
          user.telegram_id,
          'Ваш VPN ключ был удален через Outline Manager. Используйте /start для получения нового ключа.'
        );
      }
    }
  }

  startPeriodicCheck(): void {
    const interval = config.telegram.checkMembershipInterval;
    setInterval(() => this.checkAllSubscriptions(), interval * 1000);
  }
}

export const subscriptionService = new SubscriptionService(); 