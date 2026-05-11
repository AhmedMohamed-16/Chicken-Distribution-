// src/models/Employee.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'اسم الموظف مطلوب' },
      len: { args: [2, 100], msg: 'يجب أن يكون الاسم بين 2 و 100 حرف' }
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  role: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'e.g. driver, worker, accountant'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'employees',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// ─── Instance Methods ────────────────────────────────────────────────────────

/**
 * Returns a human-readable label combining name and role.
 * e.g. "Ahmed Mohamed (driver)"
 * @returns {string}
 */
Employee.prototype.getDisplayName = function () {
  return this.role ? `${this.name} (${this.role})` : this.name;
};

// ─── Class Methods ───────────────────────────────────────────────────────────

/**
 * Returns all active employees ordered by name.
 * @returns {Promise<Employee[]>}
 */
Employee.getActiveEmployees = function () {
  return Employee.findAll({
    where: { is_active: true },
    order: [['name', 'ASC']]
  });
};

module.exports = Employee;
