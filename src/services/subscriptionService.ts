import { User, VPNConfig } from '../models';
import config from '../config';
import { bot } from './telegramService';

class SubscriptionService {
  async checkUserSubscription(userId: string | number): Promise<boolean> {
    try {
      const member = await bot.getChatMember(
        Number(config.telegram.channelId),
        typeof userId === 'string' ? Number(userId) : userId
      );
      const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);

      await User.update(
        {
          is_subscribed: isSubscribed,
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

  async checkAllSubscriptions(): Promise<void> {
    const users = await User.findAll({
      where: { is_active: true },
      include: [VPNConfig]
    });

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
    }
  }

  startPeriodicCheck(): void {
    const interval = config.telegram.checkMembershipInterval;
    setInterval(() => this.checkAllSubscriptions(), interval * 1000);
  }
}

export const subscriptionService = new SubscriptionService(); 