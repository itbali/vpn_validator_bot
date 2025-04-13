import { Sequelize, DataTypes } from 'sequelize';
import { IUser, IVPNConfig, IVPNMetric, IServerMetric } from '../types';
import config from '../config';

const sequelize = new Sequelize(config.database.url, {
  dialect: config.database.dialect,
  logging: false,
  dialectOptions: {
    ssl: false
  }
});

const User = sequelize.define<IUser>('User', {
  telegram_id: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  subscription_check: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_subscribed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

const VPNConfig = sequelize.define<IVPNConfig>('VPNConfig', {
  config_id: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  config_data: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  last_used: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

const VPNMetric = sequelize.define<IVPNMetric>('VPNMetric', {
  config_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  bytes_sent: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  bytes_received: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  last_connected: {
    type: DataTypes.DATE
  },
  connection_time: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  date: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW
  }
});

const ServerMetric = sequelize.define<IServerMetric>('ServerMetric', {
  cpu_usage: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  ram_usage: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  disk_usage: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  active_connections: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

User.hasMany(VPNConfig, { foreignKey: 'user_id', sourceKey: 'telegram_id' });
VPNConfig.belongsTo(User, { foreignKey: 'user_id', targetKey: 'telegram_id' });
VPNConfig.hasMany(VPNMetric, { foreignKey: 'config_id', sourceKey: 'config_id' });
VPNMetric.belongsTo(VPNConfig, { foreignKey: 'config_id', targetKey: 'config_id' });

export {
  User,
  VPNConfig,
  VPNMetric,
  ServerMetric
};

export { sequelize }; 