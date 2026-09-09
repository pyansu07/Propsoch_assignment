const config = require('../config');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
        // Emails are matched case-insensitively, so normalise on the way in
        // rather than depending on the collation.
        set(value) {
          this.setDataValue('email', typeof value === 'string' ? value.trim().toLowerCase() : value);
        },
      },
      // The spec mentions login with an email and a password, but that isn't
      // one of the bold endpoints, so the column is here and nothing reads it yet.
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      defaultCurrency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: config.defaultCurrency,
        set(value) {
          this.setDataValue(
            'defaultCurrency',
            typeof value === 'string' ? value.trim().toUpperCase() : value
          );
        },
      },
    },
    {
      tableName: 'users',
      underscored: true,
      // Soft delete, so other people's expense history still resolves a member.
      paranoid: true,
    }
  );

  User.associate = (models) => {
    User.hasMany(models.Expense, { as: 'paidExpenses', foreignKey: 'paidById' });
    User.hasMany(models.ExpenseShare, { as: 'shares', foreignKey: 'userId' });
  };

  return User;
};
