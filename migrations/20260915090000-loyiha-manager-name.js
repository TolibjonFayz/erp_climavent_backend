'use strict';

// Menejer endi ro'yxatdan tanlanmaydi, qo'lda yoziladi:
// manager_id (users FK) -> manager_name (matn).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('loyiha', 'manager_name', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.removeColumn('loyiha', 'manager_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('loyiha', 'manager_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    });
    await queryInterface.removeColumn('loyiha', 'manager_name');
  },
};
