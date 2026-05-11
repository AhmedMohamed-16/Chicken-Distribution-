/**
 * UserBackup Model
 * Tracks all database backups created in the system
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserBackup = sequelize.define('user_backups', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID of the user who triggered the backup'
  },
  backup_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Unique filename of the backup ZIP file'
  },
  backup_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Date and time when backup was created'
  },
  file_size: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Size of backup file in bytes'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED'),
    defaultValue: 'PENDING'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if backup failed'
  }
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['backup_date']
    },
    {
      fields: ['status']
    },
    {
      unique: true,
      fields: ['backup_name']
    }
  ]
});

module.exports = UserBackup;