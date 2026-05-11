const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Farm = sequelize.define('Farm', {
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
        msg: 'Farm name is required'
      }
    }
  },
  owner_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      is: {
        args: /^[0-9+\-\s()]*$/,
        msg: 'Phone number can only contain numbers, +, -, spaces, and parentheses'
      }
    }
  },
  current_balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    allowNull: false,
    validate: {
      isFinancialBalance(value) {
        const num = parseFloat(value);
        if (isNaN(num) || !isFinite(num)) {
          throw new Error('رصيد المزرعة غير صالح');
        }
        if (Math.abs(num) > 999999999.99) {
          throw new Error('رصيد المزرعة يتجاوز الحد المسموح');
        }
      }
    },
    comment: 'Positive = Farm owes us (RECEIVABLE), Negative = We owe farm (PAYABLE), Zero = Settled'
  }
}, {
  tableName: 'farms',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      name: 'idx_farms_current_balance',
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
     * Check if farm owes us money
     * @returns {boolean}
     */
    isDebtor() {
      return parseFloat(this.getDataValue('current_balance')) > 0;
    },
    
    /**
     * Check if we owe farm money
     * @returns {boolean}
     */
    isCreditor() {
      return parseFloat(this.getDataValue('current_balance')) < 0;
    },
    
    /**
     * Get absolute value of balance (always positive)
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
        return `Farm owes us: ${balance.toFixed(2)} EGP`;
      } else if (this.isCreditor) {
        return `We owe farm: ${balance.toFixed(2)} EGP`;
      }
      return 'Settled (0.00 EGP)';
    }
  }
});

/**
 * Instance Methods
 */

/**
 * Update farm balance and return change info
 * @param {number} balanceChange - Net balance change (can be positive or negative)
 * @param {object} transaction - Sequelize transaction
 * @returns {object} Balance change information
 */
Farm.prototype.updateBalance = async function(balanceChange, transaction = null) {
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
    farm_id: this.id,
    farm_name: this.name,
    previous_balance: previousBalance,
    new_balance: newBalance,
    change_amount: balanceChange,
    direction_changed: directionChanged,
    previous_type: previousType,
    new_type: newType,
    absolute_balance: Math.abs(newBalance),
    display_balance: newBalance > 0 
      ? `${newBalance.toFixed(2)} (لينا عليهم)جنيه `
      : newBalance < 0
        ? `${Math.abs(newBalance).toFixed(2)} (ليهم علينا)جنيه `
        : 'متساوي 0.0 جنيه'
  };
};
/**
 * Class Methods
 */

/**
 * Get all farms with non-zero balances
 * @returns {Promise<Array>}
 */
Farm.getActiveBalances = async function() {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.ne]: 0
      }
    },
    order: [['current_balance', 'DESC']]
  });
};

/**
 * Get farms that owe us (receivables)
 * @returns {Promise<Array>}
 */
Farm.getReceivables = async function() {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.gt]: 0
      }
    },
    order: [['current_balance', 'DESC']]
  });
};

/**
 * Get farms we owe (payables)
 * @returns {Promise<Array>}
 */
Farm.getPayables = async function() {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.lt]: 0
      }
    },
    order: [['current_balance', 'ASC']]  // Most negative first
  });
};

/**
 * Get net farm position summary
 * @returns {Promise<object>}
 */
Farm.getNetPosition = async function() {
  const result = await this.findAll({
    attributes: [
      [sequelize.fn('SUM', 
        sequelize.literal('CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END')
      ), 'total_receivables'],
      [sequelize.fn('SUM', 
        sequelize.literal('CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END')
      ), 'total_payables'],
      [sequelize.fn('SUM', sequelize.col('current_balance')), 'net_position'],
      [sequelize.fn('COUNT', 
        sequelize.literal('CASE WHEN current_balance > 0 THEN 1 END')
      ), 'receivables_count'],
      [sequelize.fn('COUNT', 
        sequelize.literal('CASE WHEN current_balance < 0 THEN 1 END')
      ), 'payables_count']
    ],
    raw: true
  });
  
  const data = result[0];
  return {
    total_receivables: parseFloat(data.total_receivables) || 0,
    total_payables: parseFloat(data.total_payables) || 0,
    net_position: parseFloat(data.net_position) || 0,
    receivables_count: parseInt(data.receivables_count) || 0,
    payables_count: parseInt(data.payables_count) || 0,
    position_type: data.net_position > 0 ? 'NET_RECEIVABLE' : 
                   data.net_position < 0 ? 'NET_PAYABLE' : 'BALANCED'
  };
};

module.exports = Farm;