'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.addColumn('users', 'permissions', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {}
    });
  },
  down: async (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('users', 'permissions');
  }
};
