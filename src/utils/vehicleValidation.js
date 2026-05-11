const { Op } = require('sequelize');
const { DailyOperation ,VehicleOperation, Vehicle} = require('../models');

class VehicleValidationHelper {
  
  /**
   * Check if vehicle is assigned to an operation
   */
  static async isVehicleInOperation(operationId, vehicleId) {
    console.log("\n\n\n","vehicleId ",vehicleId,"\n\n\n")
    const assignment = await VehicleOperation.findOne({
      where: {
        daily_operation_id: operationId,
        vehicle_id: vehicleId
      }
    });
    
    return !!assignment;
  }
  
  /**
   * Check if vehicle is already assigned to another open operation on the same date
   */
  static async isVehicleAvailable(operationDate, vehicleId, excludeOperationId = null) {
    const whereClause = {
      operation_date: operationDate,
      status: 'OPEN'
    };
    
    if (excludeOperationId) {
      whereClause.id = { [Op.ne]: excludeOperationId };
    }
    
    const conflictingOps = await VehicleOperation.findAll({
      where: { vehicle_id: vehicleId },
      include: [{
        model: DailyOperation,
        as: 'operation',
        where: whereClause
      }]
    });
    
    return conflictingOps.length === 0;
  }
  
  /**
   * Get all vehicles assigned to an operation
   */
  static async getOperationVehicles(operationId) {
    const assignments = await VehicleOperation.findAll({
      where: { daily_operation_id: operationId },
      include: [{
        model: Vehicle,
        as: 'vehicle'
      }]
    });
    
    return assignments.map(a => a.vehicle);
  }
  
  /**
   * Check if vehicle has any transactions in operation
   */
  static async hasVehicleTransactions(operationId, vehicleId) {
    const { FarmTransaction, SaleTransaction, TransportLoss } = require('../models');
    
    const [farmCount, saleCount, lossCount] = await Promise.all([
      FarmTransaction.count({
        where: { daily_operation_id: operationId, vehicle_id: vehicleId }
      }),
      SaleTransaction.count({
        where: { daily_operation_id: operationId, vehicle_id: vehicleId }
      }),
      TransportLoss.count({
        where: { daily_operation_id: operationId, vehicle_id: vehicleId }
      })
    ]);
    
    return (farmCount + saleCount + lossCount) > 0;
  }
  
  /**
   * Validate vehicle assignment request
   */
  static async validateVehicleAssignment(operationId, vehicleIds) {
    const errors = [];
    const operation = await DailyOperation.findByPk(operationId);
    
    if (!operation) {
      errors.push('Operation not found');
      return { valid: false, errors };
    }
    
    if (operation.status === 'CLOSED') {
      errors.push('Cannot modify vehicles in a closed operation');
      return { valid: false, errors };
    }
    
    for (const vehicleId of vehicleIds) {
      const available = await this.isVehicleAvailable(
        operation.operation_date,
        vehicleId,
        operationId
      );
      
      if (!available) {
        errors.push(`Vehicle ${vehicleId} is already assigned to another operation on this date`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = VehicleValidationHelper;