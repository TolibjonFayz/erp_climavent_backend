'use strict';

// Shartnomalar (Dogovor) jadvali — KP'ning davomi.
// Hujjat raqami YOLG'IZ O'ZI unikal emas (manba tizimda raqamlar har yili
// qaytadan boshlanadi), shuning uchun unikal kalit = raqam + sana.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dogovor', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      dogovor_number: { type: Sequelize.INTEGER, allowNull: true },
      dogovor_date: { type: Sequelize.DATEONLY, allowNull: false },
      client_name: { type: Sequelize.STRING, allowNull: false },
      dogovor_sum: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      dogovor_status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'Open',
      },
      client_inn: { type: Sequelize.STRING, allowNull: true },
      payment_date: { type: Sequelize.DATEONLY, allowNull: true },
      initial_payment: { type: Sequelize.FLOAT, allowNull: true },
      prepayment_percent: { type: Sequelize.FLOAT, allowNull: true },
      client_phone: { type: Sequelize.STRING, allowNull: true },
      manager_name: { type: Sequelize.STRING, allowNull: true },
      client_address: { type: Sequelize.TEXT, allowNull: true },
      contact_name: { type: Sequelize.STRING, allowNull: true },
      contact_position: { type: Sequelize.STRING, allowNull: true },
      client_bank: { type: Sequelize.STRING, allowNull: true },
      client_account: { type: Sequelize.STRING, allowNull: true },
      client_mfo: { type: Sequelize.STRING, allowNull: true },
      client_vat_code: { type: Sequelize.STRING, allowNull: true },
      items: { type: Sequelize.JSONB, allowNull: true },
      production_days: { type: Sequelize.INTEGER, allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      admin_comment: { type: Sequelize.TEXT, allowNull: true },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('dogovor', ['dogovor_number', 'dogovor_date'], {
      name: 'dogovor_number_date_uniq',
      unique: true,
    });
    await queryInterface.addIndex('dogovor', ['client_name'], {
      name: 'dogovor_client_name_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dogovor');
  },
};
