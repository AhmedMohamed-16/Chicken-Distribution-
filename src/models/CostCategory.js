const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CostCategory = sequelize.define('CostCategory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_vehicle_cost: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  current_balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    allowNull: false,
    comment: 'Positive = Category owes us (RECEIVABLE), Negative = We owe category (PAYABLE), Zero = Settled'
  }
}, {
  tableName: 'cost_categories',
  timestamps: false,
  indexes: [
    {
      name: 'idx_cost_categories_current_balance',
      fields: ['current_balance']
    }
  ],
  
  // ✅ COMPUTED GETTERS
  getterMethods: {
    /**
     * Get balance type: RECEIVABLE, PAYABLE, or SETTLED
     * @returns {string}
     */
    balanceType() {
      const balance = parseFloat(this.getDataValue('current_balance')) || 0;
      if (balance > 0) return 'RECEIVABLE';
      if (balance < 0) return 'PAYABLE';
      return 'SETTLED';
    },
    
    /**
     * Check if category owes us money
     * @returns {boolean}
     */
    isDebtor() {
      return parseFloat(this.getDataValue('current_balance')) > 0;
    },
    
    /**
     * Check if we owe category money
     * @returns {boolean}
     */
    isCreditor() {
      return parseFloat(this.getDataValue('current_balance')) < 0;
    },
    
    /**
     * Get absolute value of balance
     * @returns {number}
     */
    absoluteBalance() {
      return Math.abs(parseFloat(this.getDataValue('current_balance')) || 0);
    },
    
    /**
     * Get human-readable balance description
     * @returns {string}
     */
    displayBalance() {
      const balance = this.absoluteBalance;
      if (this.isDebtor) {
        return `Category owes us: ${balance.toFixed(2)} EGP`;
      } else if (this.isCreditor) {
        return `We owe category: ${balance.toFixed(2)} EGP`;
      }
      return 'Settled (0.00 EGP)';
    }
  }
});

/**
 * Instance Methods
 */

/**
 * Update category balance and return change info
 * @param {number} balanceChange - Net balance change (positive = increases their debt to us / reduces our debt to them, negative = reduces their debt to us / increases our debt to them)
 * @param {object} transaction - Sequelize transaction
 * @returns {object} Balance change information
 */
CostCategory.prototype.updateBalance = async function(balanceChange, transaction = null) {
  const previousBalance = parseFloat(this.current_balance) || 0;
  const newBalance = previousBalance + balanceChange;
  
  await this.update({
    current_balance: newBalance 
  }, { transaction });
  
  // Detect direction change
  const previousType = previousBalance > 0 ? 'RECEIVABLE' : (previousBalance < 0 ? 'PAYABLE' : 'SETTLED');
  const newType = newBalance > 0 ? 'RECEIVABLE' : (newBalance < 0 ? 'PAYABLE' : 'SETTLED');
  const directionChanged = previousType !== newType && previousType !== 'SETTLED' && newType !== 'SETTLED';
  
  return {
    category_id: this.id,
    category_name: this.name,
    previous_balance: previousBalance,
    new_balance: newBalance,
    change_amount: balanceChange,
    direction_changed: directionChanged,
    previous_type: previousType,
    new_type: newType,
    absolute_balance: Math.abs(newBalance),
    display_balance: newBalance > 0 
      ? `${newBalance.toFixed(2)} (لينا عندهم)جنيه `
      : newBalance < 0
        ? `${Math.abs(newBalance).toFixed(2)} (ليهم علينا)جنيه `
        : 'متساوي 0.0 جنيه'
  };
};

/**
 * Class Methods
 */

CostCategory.getActiveBalances = async function() {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.ne]: 0
      }
    },
    order: [['current_balance', 'DESC']]
  });
};

CostCategory.getPayables = async function() {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.lt]: 0
      }
    },
    order: [['current_balance', 'ASC']]
  });
};

CostCategory.getReceivables = async function() {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.gt]: 0
      }
    },
    order: [['current_balance', 'DESC']]
  });
};

module.exports = CostCategory;