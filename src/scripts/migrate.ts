import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from '../models';
import path from 'path';

const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, '../migrations/*.ts'),
    resolve: ({ name, path }) => {
      const migration = require(path!);
      return {
        name,
        up: async () => migration.up(sequelize.getQueryInterface()),
        down: async () => migration.down(sequelize.getQueryInterface()),
      };
    },
  },
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

async function migrate() {
  try {
    await umzug.up();
    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

migrate(); 