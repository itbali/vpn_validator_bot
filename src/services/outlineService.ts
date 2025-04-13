import axios from 'axios';
import { VPNConfig, VPNMetric } from '../models';
import { VPNConfigInstance, VPNMetricInstance } from '../types/models';
import config from '../config';
import { formatBytes } from '../utils/formatters';
import https from 'https';

interface OutlineKey {
  id: string;
  name?: string;
  password: string;
  port: number;
  method: string;
  accessUrl: string;
  dataLimit?: {
    bytes: number;
  };
}

interface DataLimit {
  bytes: number;
}

interface ServerInfo {
  name: string;
  serverId: string;
  metricsEnabled: boolean;
  createdTimestampMs: number;
  version?: string;
  portForNewAccessKeys: number;
  hostnameForAccessKeys: string;
  accessKeyDataLimit?: {
    bytes: number;
  };
}

interface ServerMetrics {
  bytesTransferredByUserId: { [key: string]: number };
}

interface BandwidthData {
  data: {
    bytes: number;
  };
  timestamp: number;
}

interface KeyMetrics {
  id: string;
  name?: string;
  password: string;
  port: number;
  method: string;
  dataLimit?: {
    bytes: number;
  };
  bandwidth: {
    current: BandwidthData;
    peak: BandwidthData;
  };
  dataTransferred: {
    bytes: number;
  };
  tunnelTime: {
    seconds: number;
  };
  connection: {
    lastTrafficSeen: number;
    peakDeviceCount: {
      data: number;
      timestamp: number;
    };
  };
}

interface DetailedMetrics {
  server: {
    bandwidth: {
      current: BandwidthData;
      peak: BandwidthData;
    };
    dataTransferred: {
      bytes: number;
    };
    tunnelTime: {
      seconds: number;
    };
    locations: Array<{
      location: string;
      asOrg?: string;
      dataTransferred: {
        bytes: number;
      };
    }>;
  };
  accessKeys: KeyMetrics[];
}

interface RequestOptions {
  data?: any;
  params?: any;
}

interface TransferMetrics {
  bytesTransferredByUserId: { [key: string]: number };
}

interface TransferMetricsResponse {
  bytesTransferred: number;
}

class OutlineService {
  private readonly apiUrl: string;
  private readonly apiCertSha256: string;

  constructor() {
    console.log('Environment variables:', {
      OUTLINE_API_URL: process.env.OUTLINE_API_URL,
      OUTLINE_CERT_SHA256: process.env.OUTLINE_CERT_SHA256,
      config_vpn: config.vpn
    });
    this.apiUrl = config.vpn?.outlineApiUrl || process.env.OUTLINE_API_URL || '';
    this.apiCertSha256 = config.vpn?.outlineCertSha256 || process.env.OUTLINE_CERT_SHA256 || '';
    console.log('Initialized OutlineService with:', {
      apiUrl: this.apiUrl,
      apiCertSha256: this.apiCertSha256
    });
  }

  private async makeRequest<T>(method: string, endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    console.log('Making request to:', url);
    console.log('Method:', method);
    console.log('Data:', options.data);
    console.log('Params:', options.params);

    try {
      const response = await axios<T>({
        method,
        url,
        data: options.data,
        params: options.params,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
          ca: this.apiCertSha256
        })
      });

      return response.data;
    } catch (error: any) {
      console.error('Outline API error:', error);
      console.log('Response:', error.response?.data);
      console.log('Status:', error.response?.status);

      if (error.response?.status === 404) {
        throw new Error('Resource not found');
      }

      throw new Error('Failed to communicate with Outline server');
    }
  }

  async createKey(name?: string): Promise<OutlineKey> {
    const response = await this.makeRequest<OutlineKey>('POST', '/access-keys');
    if (name) {
      await this.makeRequest<void>('PUT', `/access-keys/${response.id}/name`, { data: { name } });
      response.name = name;
    }
    return response;
  }

  async deleteKey(keyId: string): Promise<void> {
    await this.makeRequest<void>('DELETE', `/access-keys/${keyId}`);
  }

  async getKey(keyId: string): Promise<OutlineKey> {
    return this.makeRequest('GET', `/access-keys/${keyId}`);
  }

  async getKeyDataLimit(keyId: string): Promise<DataLimit | null> {
    return this.makeRequest('GET', `/access-keys/${keyId}/data-limit`);
  }

  async getKeyMetrics(keyId: string): Promise<{
    bytesTransferred: number;
    lastSeen?: number;
    deviceCount?: number;
  }> {
    try {
      const metrics = await this.getDetailedMetrics();
      const keyMetrics = metrics.accessKeys.find(key => key.id === keyId);

      if (!keyMetrics) {
        return {
          bytesTransferred: 0
        };
      }

      return {
        bytesTransferred: keyMetrics.dataTransferred.bytes
      };
    } catch (error) {
      console.error(`Error getting metrics for key ${keyId}:`, error);
      return {
        bytesTransferred: 0
      };
    }
  }

  async getMetrics(keyId: string | 'all'): Promise<{ bytesTransferred: number }> {
    try {
      // Получаем метрики за последние 30 дней
      const endTime = new Date().getTime();
      const startTime = endTime - (30 * 24 * 60 * 60 * 1000); // 30 дней назад

      if (keyId === 'all') {
        const configs = await VPNConfig.findAll({ where: { is_active: true } });
        let totalBytes = 0;

        for (const config of configs) {
          try {
            const response = await this.makeRequest<TransferMetricsResponse>('GET', `/metrics/transfer?accessKeyId=${config.config_id}&startTime=${startTime}&endTime=${endTime}`);
            totalBytes += response.bytesTransferred || 0;
          } catch (error: any) {
            console.error(`Error getting metrics for key ${config.config_id}:`, error.message);
          }
        }

        return { bytesTransferred: totalBytes };
      }

      const config = await VPNConfig.findOne({
        where: { config_id: keyId, is_active: true }
      });

      if (!config) {
        return { bytesTransferred: 0 };
      }

      const response = await this.makeRequest<TransferMetricsResponse>('GET', `/metrics/transfer?accessKeyId=${keyId}&startTime=${startTime}&endTime=${endTime}`);
      return { bytesTransferred: response.bytesTransferred || 0 };
    } catch (error: any) {
      console.error('Error in getMetrics:', error.message);
      return { bytesTransferred: 0 };
    }
  }

  async generateConfig(userId: string, userName?: string): Promise<VPNConfigInstance> {
    try {
      const keyName = userName ? 
        `@${userName} - ${userId}` : 
        `user_${userId}`;

      const outlineKey = await this.createKey(keyName);

      const vpnConfig = await VPNConfig.create({
        config_id: outlineKey.id,
        user_id: userId,
        config_data: outlineKey.accessUrl,
        is_active: true,
        created_at: new Date()
      }) as VPNConfigInstance;

      return vpnConfig;
    } catch (error) {
      console.error('Error generating Outline config:', error);
      throw new Error('Failed to generate VPN configuration');
    }
  }

  async deactivateConfig(userId: string): Promise<void> {
    try {
      const config = await VPNConfig.findOne({
        where: {
          user_id: userId,
          is_active: true
        }
      });

      if (!config) return;

      try {
        await this.deleteKey(config.config_id);
      } catch (error) {
        console.error(`Failed to delete key ${config.config_id} from Outline server:`, error);
      }

      await config.update({ is_active: false });
    } catch (error) {
      console.error('Error deactivating config:', error);
      throw new Error('Failed to deactivate configuration');
    }
  }

  async updateMetrics(configId: string): Promise<VPNMetricInstance> {
    try {
      const metrics = await this.getMetrics(configId);
      
      const [metric] = await VPNMetric.findOrCreate({
        where: { 
          config_id: configId,
          date: new Date().toISOString().split('T')[0]
        },
        defaults: {
          bytes_sent: 0,
          bytes_received: 0,
          connection_time: 0
        }
      });

      const bytesTotal = metrics.bytesTransferred;
      await metric.update({
        bytes_received: bytesTotal / 2, // Примерное разделение на входящий/исходящий трафик
        bytes_sent: bytesTotal / 2,
        last_connected: new Date()
      });

      return metric as VPNMetricInstance;
    } catch (error) {
      console.error('Error updating metrics:', error);
      throw new Error('Failed to update metrics');
    }
  }

  async startMetricsCollection(): Promise<void> {
    setInterval(async () => {
      try {
        const metrics = await this.getDetailedMetrics();
        for (const keyMetrics of metrics.accessKeys) {
          const config = await VPNConfig.findOne({
            where: { config_id: keyMetrics.id.toString(), is_active: true }
          });

          if (config) {
            await VPNMetric.create({
              config_id: config.config_id,
              date: new Date().toISOString().split('T')[0],
              bytes_received: keyMetrics.dataTransferred.bytes / 2,
              bytes_sent: keyMetrics.dataTransferred.bytes / 2,
              connection_time: keyMetrics.tunnelTime.seconds,
              last_connected: new Date(keyMetrics.connection.lastTrafficSeen * 1000)
            });
          }
        }
      } catch (error) {
        console.error('Error collecting metrics:', error);
      }
    }, 300000); // каждые 5 минут
  }

  async validateAllKeys(): Promise<{
    deactivatedKeys: Array<{id: string; userId: string}>;
    totalChecked: number;
  }> {
    try {
      const [outlineKeys, configs] = await Promise.all([
        this.listKeys(),
        VPNConfig.findAll({ where: { is_active: true } })
      ]);

      const outlineKeyIds = new Set(outlineKeys.map(key => key.id));
      const deactivatedKeys: Array<{id: string; userId: string}> = [];

      for (const config of configs) {
        if (!outlineKeyIds.has(config.config_id)) {
          await config.update({ is_active: false });
          deactivatedKeys.push({
            id: config.config_id,
            userId: config.user_id
          });
        }
      }

      return {
        deactivatedKeys,
        totalChecked: configs.length
      };
    } catch (error) {
      console.error('Error validating keys:', error);
      throw error;
    }
  }

  async listKeys(): Promise<OutlineKey[]> {
    const response = await this.makeRequest<{ accessKeys: OutlineKey[] }>('GET', '/access-keys');
    return response.accessKeys || [];
  }

  // Server methods
  async getServerInfo(): Promise<ServerInfo> {
    return this.makeRequest<ServerInfo>('GET', '/server');
  }

  // Metrics methods
  async getDetailedMetrics(): Promise<DetailedMetrics> {
    try {
      // Используем относительное время - 30 дней назад
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60); // 30 дней назад
      
      console.log('Requesting metrics:', {
        from: new Date(thirtyDaysAgo * 1000).toISOString(),
        to: new Date(now * 1000).toISOString(),
        startTime: thirtyDaysAgo,
        endTime: now,
        systemTime: new Date().toISOString()
      });
      
      const response = await this.makeRequest<DetailedMetrics>('GET', '/experimental/server/metrics', {
        params: {
          since: (new Date(thirtyDaysAgo * 1000).toISOString())
        }
      });
    
      console.log('Received metrics response:', {
        serverBandwidth: response.server.bandwidth,
        totalTransferred: formatBytes(response.server.dataTransferred.bytes),
        keysCount: response.accessKeys.length,
        keys: response.accessKeys.map(key => ({
          id: key.id,
          name: key.name,
          transferred: formatBytes(key.dataTransferred.bytes),
          tunnelTime: `${Math.floor(key.tunnelTime.seconds / 3600)} часов`,
          lastSeen: key.connection?.lastTrafficSeen ? new Date(key.connection.lastTrafficSeen * 1000).toISOString() : 'never'
        }))
      });
      
      return response;
    } catch (error: any) {
      console.error('Error getting detailed metrics:', error);
      if (error.response?.data) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      const now = Math.floor(Date.now() / 1000);
      return {
        server: {
          bandwidth: {
            current: { data: { bytes: 0 }, timestamp: now },
            peak: { data: { bytes: 0 }, timestamp: now }
          },
          dataTransferred: { bytes: 0 },
          tunnelTime: { seconds: 0 },
          locations: []
        },
        accessKeys: []
      };
    }
  }

  async getTransferMetrics(): Promise<{ bytesTransferredByUserId: { [key: string]: number } }> {
    try {
      return await this.makeRequest<TransferMetrics>('GET', '/metrics/transfer');
    } catch (error) {
      console.error('Error getting transfer metrics:', error);
      return { bytesTransferredByUserId: {} };
    }
  }

  // Access key methods
  async renameKey(keyId: string, name: string): Promise<void> {
    await this.makeRequest<void>('PUT', `/access-keys/${keyId}/name`, { data: { name } });
  }

  async setKeyDataLimit(keyId: string, bytes: number): Promise<void> {
    await this.makeRequest<void>('PUT', `/access-keys/${keyId}/data-limit`, { data: { limit: { bytes } } });
  }

  async removeKeyDataLimit(keyId: string): Promise<void> {
    await this.makeRequest<void>('DELETE', `/access-keys/${keyId}/data-limit`);
  }
}

export const outlineService = new OutlineService(); 