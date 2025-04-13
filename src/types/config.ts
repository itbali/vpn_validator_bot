export interface DatabaseConfig {
  dialect: 'postgres';
  url: string;
  storage?: string;
}

export interface Config {
  bot: {
    token: string;
  };
  database: DatabaseConfig;
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
  vpn: {
    serverPublicKey: string;
    serverEndpoint: string;
    outlineApiUrl: string;
    outlineCertSha256: string;
  };
} 