'use strict';

// Vazifalarda bosqichdan bosqichga o'tish uchun tasdiqlash oqimi
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tasks', 'pending_status', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('tasks', 'approval_note', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('tasks', 'approval_requested_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('tasks', 'approval_decided_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    });
    await queryInterface.addColumn('tasks', 'approval_decided_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('tasks', 'approval_result', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('tasks', 'approval_reject_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tasks', 'pending_status');
    await queryInterface.removeColumn('tasks', 'approval_note');
    await queryInterface.removeColumn('tasks', 'approval_requested_at');
    await queryInterface.removeColumn('tasks', 'approval_decided_by');
    await queryInterface.removeColumn('tasks', 'approval_decided_at');
    await queryInterface.removeColumn('tasks', 'approval_result');
    await queryInterface.removeColumn('tasks', 'approval_reject_reason');
  },
};
