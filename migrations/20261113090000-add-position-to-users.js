'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(120)');
  },
  down: async (queryInterface) => {
    return queryInterface.removeColumn('users', 'position');
  }
};
