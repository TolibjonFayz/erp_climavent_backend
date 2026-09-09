'use strict';

// Loyihachilar (proyektirovchilar) — loyiha yozuvlari va ularning fayllari.
// Fayllar ikki bo'limda: 'archive' (o'zgarmas, sanasi bilan qotadi) va
// 'working' (tahrirlanadi/o'chiriladi).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('loyiha', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      order_number: { type: Sequelize.INTEGER, allowNull: true },
      manager_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      other_source: { type: Sequelize.STRING, allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      contact_phone: { type: Sequelize.STRING, allowNull: true },
      contact_email: { type: Sequelize.STRING, allowNull: true },
      contact_address: { type: Sequelize.TEXT, allowNull: true },
      system_info: { type: Sequelize.TEXT, allowNull: true },
      area: { type: Sequelize.FLOAT, allowNull: true },
      difficulty: { type: Sequelize.INTEGER, allowNull: true },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('loyiha_file', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      loyiha_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'loyiha', key: 'id' },
        onDelete: 'CASCADE',
      },
      section: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'working',
      },
      file_name: { type: Sequelize.STRING, allowNull: false },
      file_key: { type: Sequelize.STRING, allowNull: false },
      mime_type: { type: Sequelize.STRING, allowNull: true },
      size_bytes: { type: Sequelize.BIGINT, allowNull: true },
      title: { type: Sequelize.STRING, allowNull: true },
      // Storage almashtirilsa migratsiya uchun kerak (r2 -> boshqa)
      provider: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'r2',
      },
      uploaded_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('loyiha_file', ['loyiha_id', 'section'], {
      name: 'loyiha_file_loyiha_section_idx',
    });
    await queryInterface.addIndex('loyiha', ['order_number'], {
      name: 'loyiha_order_number_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('loyiha_file');
    await queryInterface.dropTable('loyiha');
  },
};
