module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define(
    'Expense',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      // Minor units. BIGINT comes back as a string on some dialects, hence the getter.
      amountMinor: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          const value = this.getDataValue('amountMinor');
          return value == null ? value : Number(value);
        },
      },
      currency: { type: DataTypes.STRING(3), allowNull: false },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      paidById: { type: DataTypes.UUID, allowNull: false },
      createdById: { type: DataTypes.UUID, allowNull: false },
      splitType: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'EQUAL' },
    },
    {
      tableName: 'expenses',
      underscored: true,
      paranoid: true,
      version: true,
      indexes: [{ fields: ['paid_by_id'] }, { fields: ['date'] }],
    }
  );

  Expense.associate = (models) => {
    Expense.belongsTo(models.User, { as: 'paidBy', foreignKey: 'paidById' });
    Expense.hasMany(models.ExpenseShare, { as: 'shares', foreignKey: 'expenseId', onDelete: 'CASCADE' });
  };

  return Expense;
};
