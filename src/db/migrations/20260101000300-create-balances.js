'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('balances', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_a_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      user_b_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      amount_minor: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    // Guarantees a single row per (pair, currency) even under concurrent writes.
    await queryInterface.addIndex('balances', ['user_a_id', 'user_b_id', 'currency'], {
      unique: true,
      name: 'balances_pair_currency_unique',
    });
    await queryInterface.addIndex('balances', ['user_b_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('balances');
  },
};
