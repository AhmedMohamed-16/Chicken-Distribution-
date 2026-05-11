// Seed data suggestion (do not run automatically):
// - { name: 'الخزنة النقدية', type: 'CASH', current_balance: 0 }
// - { name: 'حساب بنكي', type: 'BANK', current_balance: 0 }
// - { name: 'فودافون كاش', type: 'VODAFONE_CASH', current_balance: 0 }
// - { name: 'انستاباي', type: 'INSTAPAY', current_balance: 0 }

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Safe = sequelize.define('Safe', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Safe name is required'
      }
    }
  },
  type: {
    type: DataTypes.ENUM('CASH', 'BANK', 'VODAFONE_CASH', 'INSTAPAY'),
    allowNull: false
  },
  current_balance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Current balance for this safe/account'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'safes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

Safe.prototype.updateBalance = async function (balanceChange, transaction = null) {
  const previousBalance = parseFloat(this.current_balance) || 0;
  const change = parseFloat(balanceChange || 0);
  const newBalance = previousBalance + change;

  
  await this.update({ current_balance: newBalance }, { transaction });

  const previousType = previousBalance > 0 ? 'IN' : (previousBalance < 0 ? 'OUT' : 'ZERO');
  const newType = newBalance > 0 ? 'IN' : (newBalance < 0 ? 'OUT' : 'ZERO');
  const directionChanged = previousType !== newType && previousType !== 'ZERO' && newType !== 'ZERO';

  return {
    safe_id: this.id,
    safe_name: this.name,
    previous_balance: previousBalance,
    new_balance: newBalance,
    change_amount: change,
    direction_changed: directionChanged,
    previous_type: previousType,
    new_type: newType,
    absolute_balance: Math.abs(newBalance),
    display_balance: newBalance > 0
      ? `${newBalance.toFixed(2)}` 
      : newBalance < 0
        ? `${Math.abs(newBalance).toFixed(2)}`
        : '0.00'
  };
};

Safe.getAllActiveSafes = async function () {
  return await this.findAll({
    where: { is_active: true },
    order: [['name', 'ASC']]
  });
};

Safe.getTotalByType = async function () {
  const results = await this.findAll({
    attributes: [
      'type',
      [sequelize.fn('SUM', sequelize.col('current_balance')), 'total_balance']
    ],
    group: ['type'],
    raw: true
  });

  return results.map(r => ({
    type: r.type,
    total_balance: parseFloat(r.total_balance || 0)
  }));
};

module.exports = Safe;
