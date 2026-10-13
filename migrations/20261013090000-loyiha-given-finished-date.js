'use strict';

// Loyihaga ikkita sana qo'shiladi: loyiha berilgan kun va tugatilgan kun.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('loyiha', 'given_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('loyiha', 'finished_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('loyiha', 'finished_date');
    await queryInterface.removeColumn('loyiha', 'given_date');
  },
};
