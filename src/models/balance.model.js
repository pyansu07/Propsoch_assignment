// Net balance between two people, per currency.
//
// The pair is stored canonically (userAId < userBId as strings) so a pair can
// only ever have one row per currency — the unique index makes sure of it. Two
// directional rows would be two things that can disagree with each other.
//
//   amountMinor > 0  ->  B owes A
//   amountMinor < 0  ->  A owes B
//   amountMinor = 0  ->  settled
//
// This is derived data kept materialised, so reading "what do I owe everyone"
// is an indexed lookup instead of an aggregate over every expense ever. It's
// only written inside the same transaction as the expense that moved it.
module.exports = (sequelize, DataTypes) => {
  const Balance = sequelize.define(
    'Balance',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userAId: { type: DataTypes.UUID, allowNull: false },
      userBId: { type: DataTypes.UUID, allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false },
      amountMinor: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        get() {
          const value = this.getDataValue('amountMinor');
          return value == null ? value : Number(value);
        },
      },
    },
    {
      tableName: 'balances',
      underscored: true,
      indexes: [
        { unique: true, fields: ['user_a_id', 'user_b_id', 'currency'] },
        { fields: ['user_b_id'] },
      ],
    }
  );

  Balance.associate = (models) => {
    Balance.belongsTo(models.User, { as: 'userA', foreignKey: 'userAId' });
    Balance.belongsTo(models.User, { as: 'userB', foreignKey: 'userBId' });
  };

  return Balance;
};
