import dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

const config: Config = {
  bot: {
    token: process.env.BOT_TOKEN || ''
  },
  database: {
    dialect: 'postgres' as const,
    url: process.env.DATABASE_URL || 'postgresql://vpnbot:vpnbotpass@db:5432/vpnbot'
  },
  server: {
    port: parseInt(process.env.PORT || '3000')
  },
  monitoring: {
    checkInterval: parseInt(process.env.SERVER_CHECK_INTERVAL || '300'),
    thresholds: {
      cpu: parseInt(process.env.CPU_THRESHOLD || '80'),
      ram: parseInt(process.env.RAM_THRESHOLD || '80'),
      disk: parseInt(process.env.DISK_THRESHOLD || '80'),
      traffic: parseInt(process.env.TRAFFIC_THRESHOLD || '90')
    }
  },
  telegram: {
    channelId: process.env.CHANNEL_ID || '',
    channelUrl: process.env.CHANNEL_URL || '',
    paidChannelId: process.env.PAID_CHANNEL_ID || '',
    paidChannelUrl: process.env.PAID_CHANNEL_URL || '',
    adminIds: process.env.ADMIN_IDS?.split(',').map(Number) || [],
    checkMembershipInterval: parseInt(process.env.CHECK_MEMBERSHIP_INTERVAL || '3600')
  },
  vpn: {
    serverPublicKey: process.env.SERVER_PUBLIC_KEY || '',
    serverEndpoint: process.env.SERVER_ENDPOINT || '',
    outlineApiUrl: process.env.OUTLINE_API_URL || '',
    outlineCertSha256: process.env.OUTLINE_CERT_SHA256 || ''
  }
};

export default config; 