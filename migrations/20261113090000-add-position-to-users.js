'use strict';

// Xodim lavozimi (masalan: "Sotuv menejeri"). Server ishga tushganda ham IF NOT EXISTS bilan qo'shiladi.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(120)');
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS position');
  },
};
