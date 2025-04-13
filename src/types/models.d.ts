import { Model } from 'sequelize';

export interface VPNConfigInstance extends Model {
  config_id: string;
  user_id: string;
  config_data: string;
  is_active: boolean;
  created_at: Date;
  last_used: Date | null;
  VPNMetrics?: VPNMetricInstance[];
  get(key: string): any;
}

export interface VPNMetricInstance extends Model {
  config_id: string;
  bytes_sent: number;
  bytes_received: number;
  last_connected: Date | null;
  connection_time: number;
  date: Date;
}

export interface ServerMetricInstance extends Model {
  cpu_usage: number;
  ram_usage: number;
  disk_usage: number;
  active_connections: number;
  timestamp: Date;
}

export interface UserInstance extends Model {
  telegram_id: string;
  username: string | null;
  is_active: boolean;
  is_admin: boolean;
  subscription_check: Date | null;
  is_subscribed: boolean;
  is_mentor_subscribed: boolean;
} 