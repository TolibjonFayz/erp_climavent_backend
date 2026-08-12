'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('kp', 'kp_number', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('kp', 'closed_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('kp', 'kp_number');
    await queryInterface.removeColumn('kp', 'closed_date');
  },
};
