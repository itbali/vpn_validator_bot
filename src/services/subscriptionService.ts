import { User, VPNConfig } from '../models';
import config from '../config';
import { bot } from './telegramService';
import { outlineService } from './outlineService';

const updateUserSubscription = async (userId: string | number, isSubscribed: boolean, isPaidSubscribed: boolean) => {
  await User.update(
    { 
      subscription_check: new Date(), 
      is_subscribed: isSubscribed,
      is_paid_subscribed: isPaidSubscribed
    },
    { where: { telegram_id: userId.toString() } }
  );
}

export class SubscriptionService {
  async checkPaidSubscription(userId: string | number): Promise<boolean> {
    try {
      const member = await bot.getChatMember(
        Number(config.telegram.paidChannelId),
        typeof userId === 'string' ? Number(userId) : userId
      );

      const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);

      await updateUserSubscription(userId, isSubscribed, isSubscribed);

      return isSubscribed;
    } catch (error) {
      console.error('Error checking paid subscription:', error);
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

      await updateUserSubscription(userId, isRegularSubscribed, await this.checkPaidSubscription(userId));

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
      const isSubscribed = await this.checkPaidSubscription(user.telegram_id) || 
      await this.checkMentorSubscription(user.telegram_id);
      
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