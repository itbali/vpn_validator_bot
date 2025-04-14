import { Model } from 'sequelize';

export interface IUser extends Model {
  telegram_id: string;
  username: string | null;
  is_active: boolean;
  is_admin: boolean;
  subscription_check: Date | null;
  is_subscribed: boolean;
  is_paid_subscribed: boolean;
}

export interface IVPNConfig extends Model {
  config_id: string;
  user_id: string;
  server_id: number;
  config_data: string;
  is_active: boolean;
  created_at: Date;
  last_used: Date | null;
}

export interface IVPNMetric extends Model {
  config_id: string;
  bytes_sent: number;
  bytes_received: number;
  last_connected: Date | null;
  connection_time: number;
  date: Date;
}

export interface IServerMetric extends Model {
  cpu_usage: number;
  ram_usage: number;
  disk_usage: number;
  active_connections: number;
  timestamp: Date;
}

export interface IVPNServer extends Model {
  id: number;
  name: string;
  location: string;
  outline_api_url: string;
  outline_cert_sha256: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Config {
  bot: {
    token: string;
  };
  database: {
    dialect: 'postgres';
    url: string;
  };
  server: {
    port: number;
  };
  monitoring: {
    checkInterval: number;
    thresholds: {
      cpu: number;
      ram: number;
      disk: number;
      traffic: number;
    };
  };
  telegram: {
    channelId: string;
    channelUrl: string;
    paidChannelId: string;
    paidChannelUrl: string;
    adminIds: number[];
    checkMembershipInterval: number;
  };
  vpn?: {
    outlineApiUrl?: string;
    outlineCertSha256?: string;
  };
}

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  is_paid_subscribed: boolean;
  created_at: Date;
  updated_at: Date;
} 