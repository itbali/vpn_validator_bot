import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  await queryInterface.createTable('Users', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
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
    is_subscribed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_mentor_subscribed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  });

  await queryInterface.createTable('VPNConfigs', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'telegram_id'
      }
    },
    config_id: {
      type: DataTypes.STRING,
      unique: true,
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
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  });

  await queryInterface.createTable('VPNMetrics', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    config_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'VPNConfigs',
        key: 'config_id'
      }
    },
    bytes_transferred: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    measured_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  });

  await queryInterface.createTable('ServerMetrics', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
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
    measured_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  });
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.dropTable('ServerMetrics');
  await queryInterface.dropTable('VPNMetrics');
  await queryInterface.dropTable('VPNConfigs');
  await queryInterface.dropTable('Users');
} 