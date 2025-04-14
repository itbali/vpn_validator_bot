import axios from 'axios';
import { VPNConfig, VPNMetric, VPNServer } from '../models';
import { VPNConfigInstance, VPNMetricInstance } from '../types/models';
import config from '../config';
import { formatBytes } from '../utils/formatters';
import https from 'https';

interface OutlineKey {
  id: string;
  name: string;
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

interface Config {
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

interface ApiResponse<T> {
  data: T;
}

class OutlineService {
  private servers: Map<number, { apiUrl: string; apiCertSha256: string }> = new Map();
  private config: Config;
  private agent: https.Agent;
  private defaultServerId: number = 1;

  constructor() {
    this.config = config;
    this.agent = new https.Agent({
      rejectUnauthorized: false
    });
    this.loadServers();
  }

  private async loadServers() {
    const servers = await VPNServer.findAll({ where: { is_active: true } });
    this.servers.clear();
    
    for (const server of servers) {
      this.servers.set(server.id, {
        apiUrl: server.outline_api_url,
        apiCertSha256: server.outline_cert_sha256
      });
    }

    if (this.servers.size === 0 && this.config.vpn?.outlineApiUrl) {
      // Добавляем сервер из конфига как резервный вариант
      const defaultServer = await VPNServer.create({
        name: 'Default Server',
        location: 'Unknown',
        outline_api_url: this.config.vpn.outlineApiUrl,
        outline_cert_sha256: this.config.vpn.outlineCertSha256,
        is_active: true
      });

      this.servers.set(defaultServer.id, {
        apiUrl: defaultServer.outline_api_url,
        apiCertSha256: defaultServer.outline_cert_sha256
      });
    }
  }

  private getServerCredentials(serverId: number) {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`VPN server with ID ${serverId} not found`);
    }
    return server;
  }

  private async makeRequest<T>(serverId: number, method: string, path: string, data?: any, params?: any): Promise<T> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }

    try {
      console.log(`Making request to ${server.apiUrl}${path} with method ${method}`);
      console.log('Request data:', data);
      const response = await axios({
        method,
        url: `${server.apiUrl}${path}`,
        data,
        params,
        httpsAgent: this.agent
      });
      console.log('Response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('API request error:', error.response?.data || error.message);
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  async createKey(name: string, serverId: number, limit?: number): Promise<OutlineKey> {
    try {
      console.log(`Creating key for server ${serverId} with name ${name}`);
      const response = await this.makeRequest<OutlineKey>(
        serverId, 
        'POST',
        '/access-keys',
        { name },
        {}
      );
      console.log('Create key response:', response);

      if (limit) {
        await this.setDataLimit(parseInt(response.id), limit);
      }

      return response;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to create access key: ${error.message}`);
      }
      throw new Error('Failed to create access key: Unknown error');
    }
  }

  async deleteKey(keyId: string | number): Promise<void> {
    try {
      const numericKeyId = this.parseKeyId(keyId);
      await this.makeRequest<void>(
        1,
        'DELETE',
        `/access-keys/${numericKeyId}`,
        {},
        {}
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to delete key: ${error.message}`);
      }
      throw new Error('Failed to delete key: Unknown error');
    }
  }

  async getKeyById(configId: string): Promise<OutlineKey> {
    const config = await VPNConfig.findOne({ where: { config_id: configId } });
    if (!config || !config.server_id) {
      throw new Error('Server ID not found for config');
    }
    return this.makeRequest<OutlineKey>(config.server_id, 'GET', `/access-keys/${parseInt(configId)}`, {}, {});
  }

  async getDataLimit(configId: string): Promise<DataLimit | null> {
    const config = await VPNConfig.findOne({ where: { config_id: configId } });
    if (!config || !config.server_id) {
      throw new Error('Server ID not found for config');
    }
    return this.makeRequest<DataLimit | null>(
      config.server_id,
      'GET',
      `/access-keys/${parseInt(configId)}/data-limit`,
      {},
      {}
    );
  }

  async getKeyMetrics(serverId: number, keyId: string): Promise<{
    bytesTransferred: number;
    lastSeen?: number;
    deviceCount?: number;
  }> {
    try {
      const metrics = await this.getDetailedMetrics(serverId);
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

  async getMetrics(configId: string, serverId?: number): Promise<KeyMetrics> {
    const config = await VPNConfig.findOne({ where: { config_id: configId } });
    if (!serverId) {
      if (!config || !config.server_id) {
        throw new Error('Server ID not found for config');
      }
      serverId = config.server_id;
    }
    return this.makeRequest<KeyMetrics>(
      serverId,
      'GET',
      `/access-keys/${parseInt(configId)}/metrics`,
      {},
      {}
    );
  }

  async generateConfig(userId: string, serverId: number, userName?: string): Promise<VPNConfigInstance> {
    try {
      const keyName = userName ? 
        `@${userName} - ${userId}` : 
        `user_${userId}`;

      const outlineKey = await this.createKey(keyName, serverId);

      const vpnConfig = await VPNConfig.create({
        config_id: outlineKey.id,
        user_id: userId,
        server_id: serverId,
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
        if (config.server_id) {
          await this.makeRequest<void>(config.server_id, 'DELETE', `/access-keys/${config.config_id}`, {}, {});
        }
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

      const bytesTotal = metrics.dataTransferred.bytes;
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
        const servers = await this.getAvailableServers();
        for (const server of servers) {
          const metrics = await this.getDetailedMetrics(server.id);
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
        }
      } catch (error) {
        console.error('Error collecting metrics:', error);
      }
    }, 300000); // каждые 5 минут
  }

  async validateAllKeys(): Promise<{ deactivatedKeys: Array<{ userId: string; configId: string }>; totalChecked: number }> {
    const deactivatedKeys: Array<{ userId: string; configId: string }> = [];
    const configs = await VPNConfig.findAll({ where: { is_active: true } });

    for (const config of configs) {
      try {
        if (config.server_id) {
          await this.getKeyById(config.config_id);
        }
      } catch (error) {
        await config.update({ is_active: false });
        deactivatedKeys.push({ userId: config.user_id, configId: config.config_id });
      }
    }

    return { deactivatedKeys, totalChecked: configs.length };
  }

  async listKeys(serverId: number): Promise<OutlineKey[]> {
    const response = await this.makeRequest<{ accessKeys: OutlineKey[] }>(serverId, 'GET', '/access-keys', {}, {});
    return response.accessKeys || [];
  }

  // Server methods
  async getServerInfo(serverId: number): Promise<ServerInfo> {
    return this.makeRequest<ServerInfo>(serverId, 'GET', '/server', {}, {});
  }

  // Metrics methods
  async getDetailedMetrics(serverId: number): Promise<DetailedMetrics> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
      
      const response = await this.makeRequest<DetailedMetrics>(
        serverId,
        'GET',
        '/experimental/server/metrics',
        {
          params: {
            since: (new Date(thirtyDaysAgo * 1000).toISOString())
          }
        },
        {}
      );
    
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

  async getTransferMetrics(serverId: number): Promise<{ bytesTransferredByUserId: { [key: string]: number } }> {
    try {
      return await this.makeRequest<TransferMetrics>(serverId, 'GET', '/metrics/transfer', {}, {});
    } catch (error) {
      console.error('Error getting transfer metrics:', error);
      return { bytesTransferredByUserId: {} };
    }
  }

  // Access key methods
  async renameKey(keyId: string, name: string): Promise<void> {
    await this.makeRequest<void>(Number(1), 'PUT', `/access-keys/${this.parseKeyId(keyId)}/name`, { data: { name } }, {});
  }

  async setDataLimit(keyId: string | number, limitBytes: number): Promise<void> {
    try {
      const numericKeyId = this.parseKeyId(keyId);
      await this.makeRequest<void>(
        Number(1),
        'PUT',
        `/access-keys/${numericKeyId}/data-limit`,
        { bytes: limitBytes },
        {}
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to set data limit: ${error.message}`);
      }
      throw new Error('Failed to set data limit: Unknown error');
    }
  }

  async removeDataLimit(keyId: string | number): Promise<void> {
    try {
      const numericKeyId = this.parseKeyId(keyId);
      await this.makeRequest<void>(
        Number(1),
        'DELETE',
        `/access-keys/${numericKeyId}/data-limit`,
        {},
        {}
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to remove data limit: ${error.message}`);
      }
      throw new Error('Failed to remove data limit: Unknown error');
    }
  }

  async getAvailableServers() {
    return VPNServer.findAll({ where: { is_active: true } });
  }

  async addServer(name: string, location: string, apiUrl: string, certSha256: string) {
    const server = await VPNServer.create({
      name,
      location,
      outline_api_url: apiUrl,
      outline_cert_sha256: certSha256,
      is_active: true
    });

    await this.loadServers();
    return server;
  }

  async removeServer(serverId: number) {
    await VPNServer.update(
      { is_active: false },
      { where: { id: serverId } }
    );

    await this.loadServers();
  }

  private parseKeyId(keyId: string | number): number {
    if (typeof keyId === 'number') {
      return keyId;
    }
    const parsed = parseInt(keyId);
    if (isNaN(parsed)) {
      throw new Error('Invalid key ID format');
    }
    return parsed;
  }
}

export const outlineService = new OutlineService(); 