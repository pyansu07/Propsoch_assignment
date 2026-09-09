// One row per member of an expense: how much of the total that member is on the
// hook for. The payer lives on the expense itself, so a payer who is also a
// member just owes themselves, which nets to zero.
module.exports = (sequelize, DataTypes) => {
  const ExpenseShare = sequelize.define(
    'ExpenseShare',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      expenseId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      shareMinor: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          const value = this.getDataValue('shareMinor');
          return value == null ? value : Number(value);
        },
      },
    },
    {
      tableName: 'expense_shares',
      underscored: true,
      indexes: [
        { unique: true, fields: ['expense_id', 'user_id'] },
        // "expenses I'm part of" is a lookup by member.
        { fields: ['user_id'] },
      ],
    }
  );

  ExpenseShare.associate = (models) => {
    ExpenseShare.belongsTo(models.Expense, { as: 'expense', foreignKey: 'expenseId' });
    ExpenseShare.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  };

  return ExpenseShare;
};
