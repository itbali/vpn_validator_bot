import TelegramBot, { Message, SendMessageOptions } from 'node-telegram-bot-api';
import { ModelStatic } from 'sequelize/types';
import { Config, IUser, IVPNConfig } from '../../types/index';
import { OutlineService } from '../outlineService';
import { SubscriptionService } from '../subscriptionService';
import { MonitoringService } from '../monitoringService';

type isAdminType = (chatId: number) => Promise<boolean>;
type HelperParams = {
    msg: Message,  
    bot: TelegramBot,
    User?: ModelStatic<IUser>, 
    config?: Config, 
    keyboard?: SendMessageOptions,
    adminKeyboard?: SendMessageOptions,
    subscriptionService?: SubscriptionService,
    VPNConfig?: ModelStatic<IVPNConfig>,
    outlineService?: OutlineService,
    monitoringService?: MonitoringService,
    isAdmin?: boolean,
}

export type HandlerType  = (helperParams: HelperParams) => Promise<void | Message>;