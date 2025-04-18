import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  await queryInterface.createTable('VPNServers', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    outline_api_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    outline_cert_sha256: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addColumn('VPNConfigs', 'server_id', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'VPNServers',
      key: 'id',
    },
  });
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.removeColumn('VPNConfigs', 'server_id');
  await queryInterface.dropTable('VPNServers');
}
