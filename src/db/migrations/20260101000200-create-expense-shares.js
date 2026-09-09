'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('expense_shares', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      expense_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'expenses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      share_minor: { type: Sequelize.BIGINT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('expense_shares', ['expense_id', 'user_id'], {
      unique: true,
      name: 'expense_shares_expense_id_user_id_unique',
    });
    await queryInterface.addIndex('expense_shares', ['user_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('expense_shares');
  },
};
