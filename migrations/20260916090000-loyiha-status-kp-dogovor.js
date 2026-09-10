'use strict';

// Loyihaga holat (jarayonda/tugadi) va KP/Dogovor ma'lumotlari qo'shiladi.
// contact_email olib tashlanadi — foydalanuvchi kerak emas dedi.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('loyiha', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'in_progress',
    });

    // KP ma'lumotlari — raqam matn sifatida (masalan "30399/7" ko'rinishida ham bo'lishi mumkin)
    await queryInterface.addColumn('loyiha', 'kp_number', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('loyiha', 'kp_sum', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('loyiha', 'kp_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    await queryInterface.addColumn('loyiha', 'dogovor_number', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('loyiha', 'dogovor_sum', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('loyiha', 'dogovor_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    await queryInterface.removeColumn('loyiha', 'contact_email');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('loyiha', 'contact_email', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    for (const col of [
      'status',
      'kp_number',
      'kp_sum',
      'kp_date',
      'dogovor_number',
      'dogovor_sum',
      'dogovor_date',
    ]) {
      await queryInterface.removeColumn('loyiha', col);
    }
  },
};
