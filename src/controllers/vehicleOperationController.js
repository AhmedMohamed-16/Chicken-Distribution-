// ============================================================================
// FILE: src/controllers/vehicleOperationController.js
// PURPOSE: New endpoints for multi-vehicle management in daily operations
// ============================================================================

const { 
  DailyOperation, 
  Vehicle, 
  VehicleOperation,
  FarmTransaction,
  SaleTransaction,
  TransportLoss,
  DailyCost,
  CostCategory,
  Farm,
  Buyer,
  ChickenType,
  sequelize
} = require('../models');
const { Op } = require('sequelize');

class VehicleOperationController {
  
  /**
   * ✅ NEW ENDPOINT
   * GET /api/daily-operations/:id/vehicles
   * Get all vehicles assigned to an operation with statistics
   */
  static async getOperationVehicles(req, res) {
    try {
      const { id } = req.params; // operation_id
      
      // Verify operation exists
      const operation = await DailyOperation.findByPk(id);
      if (!operation) {
        return res.status(404).json({
          success: false,
          message: 'Operation not found'
        });
      }
      
      // Get all vehicle assignments for this operation
      const vehicleAssignments = await VehicleOperation.findAll({
        where: { daily_operation_id: id },
        include: [
          {
            model: Vehicle,
            as: 'vehicle',
            attributes: ['id', 'name', 'plate_number', 'empty_weight']
          }
        ],
        order: [['created_at', 'ASC']]
      });
      
      if (vehicleAssignments.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No vehicles assigned to this operation',
          data: []
        });
      }
      
      // Build statistics for each vehicle
      const vehicleStats = await Promise.all(
        vehicleAssignments.map(async (assignment) => {
          const vehicleId = assignment.vehicle.id;
          
          // Count and sum farm transactions
          const farmTransactions = await FarmTransaction.findAll({
            where: { 
              daily_operation_id: id,
              vehicle_id: vehicleId 
            },
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
              [sequelize.fn('SUM', sequelize.col('net_chicken_weight')), 'total_weight'],
              [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
            ],
            raw: true
          });
          
          // Count and sum sale transactions
          const saleTransactions = await SaleTransaction.findAll({
            where: { 
              daily_operation_id: id,
              vehicle_id: vehicleId 
            },
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
              [sequelize.fn('SUM', sequelize.col('net_weight')), 'total_weight'],
              [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
            ],
            raw: true
          });
          
          // Count transport losses
          const losses = await TransportLoss.findAll({
            where: { 
              daily_operation_id: id,
              vehicle_id: vehicleId 
            },
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
              [sequelize.fn('SUM', sequelize.col('dead_weight')), 'total_weight'],
              [sequelize.fn('SUM', sequelize.col('loss_amount')), 'total_amount']
            ],
            raw: true
          });
          
          // Count vehicle-specific costs
          const costs = await DailyCost.findAll({
            where: { 
              daily_operation_id: id,
              vehicle_id: vehicleId 
            },
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
              [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
            ],
            raw: true
          });
          
          const farmStats = farmTransactions[0] || { count: 0, total_weight: 0, total_amount: 0 };
          const saleStats = saleTransactions[0] || { count: 0, total_weight: 0, total_amount: 0 };
          const lossStats = losses[0] || { count: 0, total_weight: 0, total_amount: 0 };
          const costStats = costs[0] || { count: 0, total_amount: 0 };
          
          return {
            vehicle_id: assignment.vehicle.id,
            vehicle_name: assignment.vehicle.name,
            plate_number: assignment.vehicle.plate_number,
            empty_weight: assignment.vehicle.empty_weight,
            status: assignment.status,
            created_at: assignment.created_at,
            
            // Transaction counts
            farm_transactions_count: parseInt(farmStats.count) || 0,
            sale_transactions_count: parseInt(saleStats.count) || 0,
            loss_records_count: parseInt(lossStats.count) || 0,
            cost_records_count: parseInt(costStats.count) || 0,
            
            // Weight totals (in kg)
            total_loaded_kg: parseFloat(farmStats.total_weight) || 0,
            total_sold_kg: parseFloat(saleStats.total_weight) || 0,
            total_lost_kg: parseFloat(lossStats.total_weight) || 0,
            remaining_inventory_kg: (parseFloat(farmStats.total_weight) || 0) - 
                                    (parseFloat(saleStats.total_weight) || 0) - 
                                    (parseFloat(lossStats.total_weight) || 0),
            
            // Financial totals
            total_purchases: parseFloat(farmStats.total_amount) || 0,
            total_revenue: parseFloat(saleStats.total_amount) || 0,
            total_loss_value: parseFloat(lossStats.total_amount) || 0,
            total_costs: parseFloat(costStats.total_amount) || 0,
            
            // Quick profit indicator
            gross_profit: (parseFloat(saleStats.total_amount) || 0) - 
                         (parseFloat(farmStats.total_amount) || 0) - 
                         (parseFloat(lossStats.total_amount) || 0) - 
                         (parseFloat(costStats.total_amount) || 0)
          };
        })
      );
      
      // Sort by vehicle_id for consistency
      vehicleStats.sort((a, b) => a.vehicle_id - b.vehicle_id);
      
      res.status(200).json({
        success: true,
        data: vehicleStats,
        metadata: {
          operation_id: parseInt(id),
          operation_date: operation.operation_date,
          operation_status: operation.status,
          total_vehicles: vehicleStats.length
        }
      });
      
    } catch (error) {
      console.error('Error getting operation vehicles:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve operation vehicles',
        error: error.message
      });
    }
  }
  
  /**
   * ✅ NEW ENDPOINT
   * GET /api/daily-operations/:id/vehicles/:vehicleId/transactions
   * Get all transactions for a specific vehicle in an operation
   */
  static async getVehicleTransactions(req, res) {
    try {
      const { id, vehicleId } = req.params;
      
      // Verify operation exists
      const operation = await DailyOperation.findByPk(id);
      if (!operation) {
        return res.status(404).json({
          success: false,
          message: 'Operation not found'
        });
      }
      
      // Verify vehicle is assigned to this operation
      const vehicleAssignment = await VehicleOperation.findOne({
        where: {
          daily_operation_id: id,
          vehicle_id: vehicleId
        },
        include: [
          {
            model: Vehicle,
            as: 'vehicle',
            attributes: ['id', 'name', 'plate_number']
          }
        ]
      });
      
      if (!vehicleAssignment) {
        return res.status(404).json({
          success: false,
          message: `Vehicle ${vehicleId} is not assigned to operation ${id}`
        });
      }
      
      // Fetch all transactions for this vehicle
      const [farmTransactions, saleTransactions, transportLosses, costs] = await Promise.all([
        // Farm transactions
        FarmTransaction.findAll({
          where: { 
            daily_operation_id: id,
            vehicle_id: vehicleId 
          },
          include: [
            {
              model: Farm,
              as: 'farm',
              attributes: ['id', 'name', 'owner_name', 'location']
            },
            {
              model: ChickenType,
              as: 'chicken_type',
              attributes: ['id', 'name']
            }
          ],
          order: [['sequence_number', 'ASC'], ['transaction_time', 'ASC']]
        }),
        
        // Sale transactions
        SaleTransaction.findAll({
          where: { 
            daily_operation_id: id,
            vehicle_id: vehicleId 
          },
          include: [
            {
              model: Buyer,
              as: 'buyer',
              attributes: ['id', 'name', 'phone', 'address']
            },
            {
              model: ChickenType,
              as: 'chicken_type',
              attributes: ['id', 'name']
            }
          ],
          order: [['sequence_number', 'ASC'], ['transaction_time', 'ASC']]
        }),
        
        // Transport losses
        TransportLoss.findAll({
          where: { 
            daily_operation_id: id,
            vehicle_id: vehicleId 
          },
          include: [
            {
              model: ChickenType,
              as: 'chicken_type',
              attributes: ['id', 'name']
            }
          ],
          order: [['recorded_at', 'ASC']]
        }),
        
        // Daily costs (vehicle-specific)
        DailyCost.findAll({
          where: { 
            daily_operation_id: id,
            vehicle_id: vehicleId 
          },
          include: [
            {
              model: CostCategory,
              as: 'category',
              attributes: ['id', 'name', 'is_vehicle_cost']
            }
          ],
          order: [['recorded_at', 'ASC']]
        })
      ]);
      
      // Calculate summary
      const summary = {
        // Purchases
        total_purchases: farmTransactions.reduce((sum, t) => 
          sum + parseFloat(t.total_amount), 0
        ),
        total_purchased_kg: farmTransactions.reduce((sum, t) => 
          sum + parseFloat(t.net_chicken_weight), 0
        ),
        total_paid_to_farms: farmTransactions.reduce((sum, t) => 
          sum + parseFloat(t.paid_amount), 0
        ),
        remaining_debt_to_farms: farmTransactions.reduce((sum, t) => 
          sum + parseFloat(t.remaining_amount), 0
        ),
        
        // Sales
        total_revenue: saleTransactions.reduce((sum, t) => 
          sum + parseFloat(t.total_amount), 0
        ),
        total_sold_kg: saleTransactions.reduce((sum, t) => 
          sum + parseFloat(t.net_weight), 0
        ),
        total_received_from_buyers: saleTransactions.reduce((sum, t) => 
          sum + parseFloat(t.paid_amount), 0
        ),
        remaining_debt_from_buyers: saleTransactions.reduce((sum, t) => 
          sum + parseFloat(t.remaining_amount), 0
        ),
        old_debt_collected: saleTransactions.reduce((sum, t) => 
          sum + parseFloat(t.old_debt_paid || 0), 0
        ),
        
        // Losses
        total_losses: transportLosses.reduce((sum, t) => 
          sum + parseFloat(t.loss_amount), 0
        ),
        total_lost_kg: transportLosses.reduce((sum, t) => 
          sum + parseFloat(t.dead_weight), 0
        ),
        
        // Costs
        total_vehicle_costs: costs
          .filter(c => c.cost_category.is_vehicle_cost)
          .reduce((sum, c) => sum + parseFloat(c.amount), 0),
        total_other_costs: costs
          .filter(c => !c.cost_category.is_vehicle_cost)
          .reduce((sum, c) => sum + parseFloat(c.amount), 0),
        total_costs: costs.reduce((sum, c) => 
          sum + parseFloat(c.amount), 0
        )
      };
      
      // Calculate inventory
      summary.remaining_inventory_kg = summary.total_purchased_kg - 
                                       summary.total_sold_kg - 
                                       summary.total_lost_kg;
      
      // Calculate net profit
      summary.net_profit = summary.total_revenue - 
                          summary.total_purchases - 
                          summary.total_losses - 
                          summary.total_costs;
      
      res.status(200).json({
        success: true,
        data: {
          vehicle: {
            id: vehicleAssignment.vehicle.id,
            name: vehicleAssignment.vehicle.name,
            plate_number: vehicleAssignment.vehicle.plate_number,
            status: vehicleAssignment.status
          },
          operation: {
            id: operation.id,
            operation_date: operation.operation_date,
            status: operation.status
          },
          transactions: {
            farm_transactions: farmTransactions,
            sale_transactions: saleTransactions,
            transport_losses: transportLosses,
            costs: costs
          },
          summary: summary,
          counts: {
            farm_transactions: farmTransactions.length,
            sale_transactions: saleTransactions.length,
            transport_losses: transportLosses.length,
            costs: costs.length
          }
        }
      });
      
    } catch (error) {
      console.error('Error getting vehicle transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve vehicle transactions',
        error: error.message
      });
    }
  }
  
  /**
   * ✅ NEW ENDPOINT
   * POST /api/daily-operations/:id/vehicles
   * Add a vehicle to an existing open operation
   */
  static async addVehicleToOperation(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params; // operation_id
      const { vehicle_id } = req.body;
      
      // Validation
      if (!vehicle_id) {
        return res.status(400).json({
          success: false,
          message: 'vehicle_id is required'
        });
      }
      
      // Verify operation exists and is open
      const operation = await DailyOperation.findByPk(id);
      if (!operation) {
        return res.status(404).json({
          success: false,
          message: 'Operation not found'
        });
      }
      
      if (operation.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          message: `Cannot add vehicle to ${operation.status} operation. Only OPEN operations can be modified.`
        });
      }
      
      // Verify vehicle exists
      const vehicle = await Vehicle.findByPk(vehicle_id);
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: `Vehicle ${vehicle_id} not found`
        });
      }
      
      // Check if vehicle is already assigned to this operation
      const existingAssignment = await VehicleOperation.findOne({
        where: {
          daily_operation_id: id,
          vehicle_id: vehicle_id
        }
      });
      
      if (existingAssignment) {
        return res.status(400).json({
          success: false,
          message: `Vehicle ${vehicle_id} is already assigned to this operation`
        });
      }
      
      // Check if vehicle is assigned to another open operation on the same date
      const conflictingAssignments = await VehicleOperation.findAll({
        where: { vehicle_id: vehicle_id },
        include: [
          {
            model: DailyOperation,
            as: 'daily_operation',
            where: {
              operation_date: operation.operation_date,
              status: 'OPEN',
              id: { [Op.ne]: id }
            }
          }
        ]
      });
      
      if (conflictingAssignments.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Vehicle ${vehicle_id} is already assigned to another open operation on ${operation.operation_date}`,
          conflicting_operation_id: conflictingAssignments[0].operation.id
        });
      }
      
      // Create vehicle assignment
      const vehicleOperation = await VehicleOperation.create({
        daily_operation_id: id,
        vehicle_id: vehicle_id,
        status: 'ACTIVE'
      }, { transaction });
      
      await transaction.commit();
      
      res.status(201).json({
        success: true,
        message: `Vehicle ${vehicle_id} (${vehicle.name}) added to operation successfully`,
        data: {
          vehicle_operation_id: vehicleOperation.id,
          vehicle_id: vehicleOperation.vehicle_id,
          daily_operation_id: vehicleOperation.daily_operation_id,
          status: vehicleOperation.status,
          created_at: vehicleOperation.created_at,
          vehicle_details: {
            id: vehicle.id,
            name: vehicle.name,
            plate_number: vehicle.plate_number
          }
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error adding vehicle to operation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add vehicle to operation',
        error: error.message
      });
    }
  }
  
  /**
   * ✅ NEW ENDPOINT
   * DELETE /api/daily-operations/:id/vehicles/:vehicleId
   * Remove a vehicle from an operation (only if it has no transactions)
   */
  static async removeVehicleFromOperation(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id, vehicleId } = req.params;
      
      // Verify operation exists and is open
      const operation = await DailyOperation.findByPk(id);
      if (!operation) {
        return res.status(404).json({
          success: false,
          message: 'Operation not found'
        });
      }
      
      if (operation.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          message: `Cannot remove vehicle from ${operation.status} operation. Only OPEN operations can be modified.`
        });
      }
      
      // Verify vehicle is assigned to this operation
      const vehicleAssignment = await VehicleOperation.findOne({
        where: {
          daily_operation_id: id,
          vehicle_id: vehicleId
        },
        include: [
          {
            model: Vehicle,
            as: 'vehicle',
            attributes: ['id', 'name', 'plate_number']
          }
        ]
      });
      
      if (!vehicleAssignment) {
        return res.status(404).json({
          success: false,
          message: `Vehicle ${vehicleId} is not assigned to operation ${id}`
        });
      }
      
      // Check if vehicle has any transactions
      const [farmCount, saleCount, lossCount, costCount] = await Promise.all([
        FarmTransaction.count({
          where: { daily_operation_id: id, vehicle_id: vehicleId }
        }),
        SaleTransaction.count({
          where: { daily_operation_id: id, vehicle_id: vehicleId }
        }),
        TransportLoss.count({
          where: { daily_operation_id: id, vehicle_id: vehicleId }
        }),
        DailyCost.count({
          where: { daily_operation_id: id, vehicle_id: vehicleId }
        })
      ]);
      
      const totalTransactions = farmCount + saleCount + lossCount + costCount;
      
      if (totalTransactions > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot remove vehicle ${vehicleId}. It has ${totalTransactions} transaction(s).`,
          transaction_counts: {
            farm_transactions: farmCount,
            sale_transactions: saleCount,
            transport_losses: lossCount,
            costs: costCount,
            total: totalTransactions
          },
          hint: 'Delete all transactions for this vehicle before removing it from the operation'
        });
      }
      
      // Remove the vehicle assignment
      await vehicleAssignment.destroy({ transaction });
      
      await transaction.commit();
      
      res.status(200).json({
        success: true,
        message: `Vehicle ${vehicleId} (${vehicleAssignment.vehicle.name}) removed from operation successfully`,
        data: {
          removed_vehicle_id: parseInt(vehicleId),
          vehicle_name: vehicleAssignment.vehicle.name,
          operation_id: parseInt(id)
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error removing vehicle from operation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove vehicle from operation',
        error: error.message
      });
    }
  }
  static async completeVehicleOperation(req, res) {
  const transaction = await sequelize.transaction();
  
  try {
    const { vehicleOperationId ,notes} = req.params;
    
    
    // Find the vehicle operation
    const vehicleOp = await VehicleOperation.findByPk(vehicleOperationId, {
      include: [
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'name', 'plate_number']
        },
        {
          model: DailyOperation,
          as: 'operation',
          attributes: ['id', 'operation_date', 'status']
        }
      ]
    });
    
    if (!vehicleOp) {
      return res.status(404).json({
        success: false,
        message: `Vehicle operation with ID ${vehicleOperationId} not found`
      });
    }
    
    // Check if already completed
    if (vehicleOp.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: `Vehicle operation is already completed`,
        data: {
          vehicle_operation_id: vehicleOp.id,
          vehicle_name: vehicleOp.vehicle.name,
          completed_at: vehicleOp.completed_at,
          status: vehicleOp.status
        }
      });
    }
    
    // // Check if parent operation is still open
    // if (vehicleOp.operation.status !== 'OPEN') {
    //   return res.status(400).json({
    //     success: false,
    //     message: `Cannot complete vehicle operation. Parent operation is ${vehicleOp.operation.status}.`,
    //     hint: 'Vehicle operations can only be completed when the parent operation is OPEN'
    //   });
    // }
    
    // // Get transaction summary for this vehicle
    // const [farmTransactions, saleTransactions, losses, costs] = await Promise.all([
    //   FarmTransaction.findAll({
    //     where: { 
    //       daily_operation_id: vehicleOp.operation.id,
    //       vehicle_id: vehicleOp.vehicle_id
    //     },
    //     attributes: [
    //       [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    //       [sequelize.fn('SUM', sequelize.col('net_chicken_weight')), 'total_weight'],
    //       [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
    //     ],
    //     raw: true
    //   }),
      
    //   SaleTransaction.findAll({
    //     where: { 
    //       daily_operation_id: vehicleOp.operation.id,
    //       vehicle_id: vehicleOp.vehicle_id
    //     },
    //     attributes: [
    //       [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    //       [sequelize.fn('SUM', sequelize.col('net_chicken_weight')), 'total_weight'],
    //       [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
    //     ],
    //     raw: true
    //   }),
      
    //   TransportLoss.findAll({
    //     where: { 
    //       daily_operation_id: vehicleOp.operation.id,
    //       vehicle_id: vehicleOp.vehicle_id
    //     },
    //     attributes: [
    //       [sequelize.fn('SUM', sequelize.col('dead_weight')), 'total_weight'],
    //       [sequelize.fn('SUM', sequelize.col('loss_amount')), 'total_amount']
    //     ],
    //     raw: true
    //   }),
      
    //   DailyCost.findAll({
    //     where: { 
    //       daily_operation_id: vehicleOp.operation.id,
    //       vehicle_id: vehicleOp.vehicle_id
    //     },
    //     attributes: [
    //       [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    //       [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
    //     ],
    //     raw: true
    //   })
    // ]);
    
    // const farmStats = farmTransactions[0] || { count: 0, total_weight: 0, total_amount: 0 };
    // const saleStats = saleTransactions[0] || { count: 0, total_weight: 0, total_amount: 0 };
    // const lossStats = losses[0] || { total_weight: 0, total_amount: 0 };
    // const costStats = costs[0] || { count: 0, total_amount: 0 };
    
    // // Calculate remaining inventory
    // const totalLoaded = parseFloat(farmStats.total_weight) || 0;
    // const totalSold = parseFloat(saleStats.total_weight) || 0;
    // const totalLost = parseFloat(lossStats.total_weight) || 0;
    // const remainingInventory = totalLoaded - totalSold - totalLost;
    
    // // Warning if there's remaining inventory
    // if (remainingInventory > 0) {
    //   console.warn(`⚠️  Completing vehicle operation with ${remainingInventory} kg remaining inventory`);
    // }
    
    // Update vehicle operation status
    await vehicleOp.update({
      status: 'COMPLETED',
      completed_at: new Date(),
      completion_notes: notes || null
    }, { transaction });
    
    // Check if all vehicles are completed
    const allVehicleOps = await VehicleOperation.findAll({
      where: { daily_operation_id: vehicleOp.operation.id },
      attributes: ['id', 'status']
    });
    
    const allCompleted = allVehicleOps.every(vo => vo.status === 'COMPLETED');
    
    await transaction.commit();
    
    // Build response with summary
    const summary = {
      vehicle_operation_id: vehicleOp.id,
      vehicle: {
        id: vehicleOp.vehicle.id,
        name: vehicleOp.vehicle.name,
        plate_number: vehicleOp.vehicle.plate_number
      },
      operation: {
        id: vehicleOp.operation.id,
        operation_date: vehicleOp.operation.operation_date,
        status: vehicleOp.operation.status
      },
      completion: {
        status: 'COMPLETED',
        completed_at: vehicleOp.completed_at,
        completed_by: req.user.id,
        completed_by_name: req.user.full_name,
        notes: vehicleOp.completion_notes
      },
      // transaction_summary: {
      //   farm_transactions: {
      //     count: parseInt(farmStats.count) || 0,
      //     total_kg: totalLoaded,
      //     total_amount: parseFloat(farmStats.total_amount) || 0
      //   },
      //   sale_transactions: {
      //     count: parseInt(saleStats.count) || 0,
      //     total_kg: totalSold,
      //     total_amount: parseFloat(saleStats.total_amount) || 0
      //   },
      //   transport_losses: {
      //     total_kg: totalLost,
      //     total_amount: parseFloat(lossStats.total_amount) || 0
      //   },
      //   costs: {
      //     count: parseInt(costStats.count) || 0,
      //     total_amount: parseFloat(costStats.total_amount) || 0
      //   },
      //   inventory: {
      //     remaining_kg: remainingInventory,
      //     has_remaining: remainingInventory > 0
      //   }
      // },
      operation_status: {
        total_vehicles: allVehicleOps.length,
        completed_vehicles: allVehicleOps.filter(vo => vo.status === 'COMPLETED').length,
        active_vehicles: allVehicleOps.filter(vo => vo.status === 'ACTIVE').length,
        all_vehicles_completed: allCompleted
      }
    };
    
    res.status(200).json({
      success: true,
      message: `Vehicle operation for ${vehicleOp.vehicle.name} marked as completed`,
      data: summary,
      ...(allCompleted && {
        hint: 'All vehicles are now completed. You can close the daily operation.'
      }),
      // ...(remainingInventory > 0 && {
      //   warning: `Vehicle has ${remainingInventory} kg of remaining inventory that was not sold`
      // })
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('Error completing vehicle operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete vehicle operation',
      error: error.message
    });
  }
}

/**
 * ✅ BONUS METHOD
 * POST /api/daily-operations/vehicle-operations/:vehicleOperationId/reopen
 * Reopen a completed vehicle operation (undo complete)
 */
static async reopenVehicleOperation(req, res) {
  const transaction = await sequelize.transaction();
  
  try {
    const { vehicleOperationId } = req.params;
    
    // Find the vehicle operation
    const vehicleOp = await VehicleOperation.findByPk(vehicleOperationId, {
      include: [
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'name', 'plate_number']
        },
        {
          model: DailyOperation,
          as: 'operation',
          attributes: ['id', 'operation_date', 'status']
        }
      ]
    });
    
    if (!vehicleOp) {
      return res.status(404).json({
        success: false,
        message: `Vehicle operation with ID ${vehicleOperationId} not found`
      });
    }
    
    // Check if already active
    if (vehicleOp.status === 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: `Vehicle operation is already active`,
        data: {
          vehicle_operation_id: vehicleOp.id,
          vehicle_name: vehicleOp.vehicle.name,
          status: vehicleOp.status
        }
      });
    }
    
    // Check if parent operation is closed
    if (vehicleOp.operation.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: `Cannot reopen vehicle operation. Parent operation is CLOSED.`,
        hint: 'You must reopen the parent operation first (admin only)'
      });
    }
    
    // Reopen the vehicle operation
    await vehicleOp.update({
      status: 'ACTIVE',
      completed_at: null,
      completion_notes: null,
      reopened_at: new Date(),
      reopened_by: req.user.id
    }, { transaction });
    
    await transaction.commit();
    
    res.status(200).json({
      success: true,
      message: `Vehicle operation for ${vehicleOp.vehicle.name} has been reopened`,
      data: {
        vehicle_operation_id: vehicleOp.id,
        vehicle: {
          id: vehicleOp.vehicle.id,
          name: vehicleOp.vehicle.name,
          plate_number: vehicleOp.vehicle.plate_number
        },
        operation: {
          id: vehicleOp.operation.id,
          operation_date: vehicleOp.operation.operation_date
        },
        status: 'ACTIVE',
        reopened_at: vehicleOp.reopened_at,
        reopened_by: req.user.full_name
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('Error reopening vehicle operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reopen vehicle operation',
      error: error.message
    });
  }
}

/**
 * ✅ HELPER METHOD
 * GET /api/daily-operations/:id/vehicle-operations
 * Get all vehicle operations for a daily operation
 */
static async getVehicleOperationsByOperation(req, res) {
  try {
    const { id } = req.params; // daily_operation_id
    
    const operation = await DailyOperation.findByPk(id);
    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'Operation not found'
      });
    }
    
    const vehicleOps = await VehicleOperation.findAll({
      where: { daily_operation_id: id },
      include: [
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'name', 'plate_number', 'empty_weight']
        }
      ],
      order: [['assigned_at', 'ASC']]
    });
    
    res.status(200).json({
      success: true,
      data: vehicleOps,
      metadata: {
        operation_id: parseInt(id),
        operation_date: operation.operation_date,
        operation_status: operation.status,
        total_vehicles: vehicleOps.length,
        completed: vehicleOps.filter(vo => vo.status === 'COMPLETED').length,
        active: vehicleOps.filter(vo => vo.status === 'ACTIVE').length
      }
    });
    
  } catch (error) {
    console.error('Error getting vehicle operations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve vehicle operations',
      error: error.message
    });
  }
}
}

module.exports = VehicleOperationController;