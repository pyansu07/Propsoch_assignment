'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('expenses', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(255), allowNull: false },
      amount_minor: { type: Sequelize.BIGINT, allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      paid_by_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // Who entered the expense, which isn't always who paid for it. Nothing
      // reads it yet — it's here for the activity log in the spec.
      created_by_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      split_type: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'EQUAL' },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex('expenses', ['paid_by_id']);
    await queryInterface.addIndex('expenses', ['date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('expenses');
  },
};
