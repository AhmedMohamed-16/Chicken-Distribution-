  const { DataTypes } = require('sequelize');
  const { sequelize } = require('../config/database');

  const DailyOperation = sequelize.define('DailyOperation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    operation_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CLOSED'),
      defaultValue: 'OPEN'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'daily_operations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, underscored: true,
    indexes: [
      {
        fields: ['operation_date']
      }
    ]
  });
  // ✅ NEW: Add instance methods for vehicle management
  DailyOperation.prototype.addVehicle = async function(vehicleId) {
    const VehicleOperation = sequelize.models.VehicleOperation;
    return await VehicleOperation.create({
      daily_operation_id: this.id,
      vehicle_id: vehicleId
    });
  };

  DailyOperation.prototype.getVehicles = async function() {
    const VehicleOperation = sequelize.models.VehicleOperation;
    const Vehicle = sequelize.models.Vehicle;
    
    const vehicleOps = await VehicleOperation.findAll({
      where: { daily_operation_id: this.id },
      include: [{ model: Vehicle, as: 'vehicles' }]
    });
    
    return vehicleOps.map(vo => vo.vehicle);
  };

  DailyOperation.prototype.removeVehicle = async function(vehicleId) {
    const VehicleOperation = sequelize.models.VehicleOperation;
    return await VehicleOperation.destroy({
      where: {
        daily_operation_id: this.id,
        vehicle_id: vehicleId
      }
    });
  };
  module.exports = DailyOperation;