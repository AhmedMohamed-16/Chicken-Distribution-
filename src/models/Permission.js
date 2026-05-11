// =========================
// File: Permission.js
// =========================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Permission = sequelize.define('Permission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Permission key is required' },
      is: {
        args: /^[A-Z_]+$/,
        msg: 'Permission key must be uppercase letters and underscores only'
      }
    },
    comment: 'Unique identifier for the permission (e.g., CREATE_FARM, VIEW_DAILY_REPORT)'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { notEmpty: { msg: 'Permission name is required' } },
    comment: 'Human-readable name for the permission'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed description of what this permission allows'
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'GENERAL',
    validate: {
      isIn: {
        args: [[
          'النظام', 'المستخدمين', 'الشركاء', 'المزارع', 'محلات الفراخ',
          'المركبات', 'الدواجن', 'التكاليف', 'العمليات', 'التقارير', 'اغلاق اليوم'
        ]],
        msg: 'Invalid permission category'
      }
    },
    comment: 'Logical grouping for organizing permissions'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this permission is currently active'
  }
}, {
  tableName: 'permissions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [ 
    { unique: true, fields: ['key'] },
    { fields: ['category'] },
    { fields: ['is_active'] }
  ]
});


/**
 * Class Methods
 */

/**
 * Get all active permissions
 * @returns {Promise<Array>}
 */
Permission.getActivePermissions = async function() {
  return await this.findAll({
    where: { is_active: true },
    order: [['category', 'ASC'], ['name', 'ASC']]
  });
};

/**
 * Get permissions by category
 * @param {string} category
 * @returns {Promise<Array>}
 */
Permission.getByCategory = async function(category) {
  return await this.findAll({
    where: { 
      category,
      is_active: true 
    },
    order: [['name', 'ASC']]
  });
};

/**
 * Get permission by key
 * @param {string} key
 * @returns {Promise<Object|null>}
 */
Permission.getByKey = async function(key) {
  return await this.findOne({
    where: { key }
  });
};

/**
 * Get permissions grouped by category
 * @returns {Promise<Object>}
 */
Permission.getGroupedByCategory = async function() {
  const permissions = await this.findAll({
    where: { is_active: true },
    order: [['category', 'ASC'], ['name', 'ASC']]
  });

  return permissions.reduce((grouped, permission) => {
    const category = permission.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(permission);
    return grouped;
  }, {});
};

module.exports = Permission;