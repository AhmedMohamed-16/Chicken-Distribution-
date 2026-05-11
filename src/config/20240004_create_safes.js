'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('safes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('CASH', 'BANK', 'VODAFONE_CASH', 'INSTAPAY'),
        allowNull: false
      },
      current_balance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('safes');
    await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_safes_type\";");
  }
};