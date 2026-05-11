// src/controllers/operationController.js
const { Op, fn, col, literal } = require('sequelize');
const { 
  DailyOperation, 
  FarmTransaction, 
  SaleTransaction, 
  TransportLoss, 
  DailyCost,
  Farm,
  Buyer,
  Vehicle,
  ChickenType,
  CostCategory,
  sequelize,
  ProfitDistribution,
  PartnerProfit,
  Partner,
  FarmDebtPayment,
  BuyerDebtPayment,
  CostDebtPayment,
  SaleWeight,
  Safe,
  Custody,
  CustodySpending
} = require('../models');
const VehicleOperation = require('../models/VehicleOperation');
const ProfitService = require('../services/ProfitService');
const { logTransaction } = require('../utils/transactionLogger');
const { handlePaymentSource } = require('../utils/paymentUtils');
const { round2 } = require('../utils/financialUtils');
const AppError = require('../utils/app-error.utility');

// ─────────────────────────────────────────────────────────────────────────────

// Start a new daily operation
// exports.startDailyOperation = async (req, res) => {
//   const transaction = await sequelize.transaction();
  
//   try {
//     const { operation_date, vehicle_id } = req.body;

//     // Check if operation already exists for this date
//     const existing = await DailyOperation.findOne({
//       where: { operation_date }
//     });

//     if (existing) {
//       await transaction.rollback();
//       return res.status(200).json({
//         success: true,
//         message: 'Daily operation already exists for this date',
//         alreadyExists:true,
//         data:existing
//       });
//     }

//     const operation = await DailyOperation.create({
//       operation_date,
//       vehicle_id,
//       user_id: req.user.id,
//       status: 'OPEN'
//     }, { transaction });

//     await transaction.commit();

//     res.status(201).json({
//       success: true,
//       data: operation
//     });
//   } catch (error) {
//     await transaction.rollback();
//     res.status(500).json({
//       success: false,
//       message: 'Error starting daily operation',
//       error: error.message
//     });
//   }
// };
// ✅ NEW - Multiple vehicles
// exports.startDailyOperation = async (req, res) => {
//   const transaction = await sequelize.transaction();
  
//   try {
//     const { operation_date, vehicle_ids } = req.body;  // ✅ Now expects array
    
//     // ✅ Validation
//     if (!Array.isArray(vehicle_ids) || vehicle_ids.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'vehicle_ids must be a non-empty array'
//       });
//     }
    
//     // ✅ Check if any vehicle is already assigned for this date
//     const existingVehicleOps = await VehicleOperation.findAll({
//       include: [{
//         model: DailyOperation,
//         as:"operation",
//         where: { 
//           operation_date,
//           status: 'OPEN'
//         }
//       }],
//       where: {
//         vehicle_id: vehicle_ids
//       }
//     });
    
//     if (existingVehicleOps.length > 0) {
//       const busyVehicles = existingVehicleOps.map(vo => vo.vehicle_id);
//       return res.status(200).json({
//         success: false,
//         message: `Vehicles ${busyVehicles.join(', ')} are already assigned to an open operation for this date`,
//         alreadyExists:true,
//         data:existingVehicleOps
//       });
//     }
    
//     // ✅ Create operation (no vehicle_id in this table anymore)
//     const operation = await DailyOperation.create({
//       operation_date,
//       user_id: req.user.id,
//       status: 'OPEN'
//     }, { transaction });
    
//     // ✅ Create vehicle assignments
//     const vehicleAssignments = await Promise.all(
//       vehicle_ids.map(vehicle_id => 
//         VehicleOperation.create({
//           daily_operation_id: operation.id,
//           vehicle_id,
//           status: 'ACTIVE'
//         }, { transaction })
//       )
//     );
    
//     await transaction.commit();
    
//     // ✅ Fetch with vehicles included
//     const operationWithVehicles = await DailyOperation.findByPk(operation.id, {
//       include: [
//         {
//           model: Vehicle,
//           as: 'vehicles',
//           through: { attributes: ['status'] }
//         }
//       ]
//     });
    
//     res.status(201).json({
//       success: true,
//       data: operationWithVehicles
//     });
//   } catch (error) {
//     await transaction.rollback();
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };
exports.startDailyOperation = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { operation_date, vehicle_ids } = req.body;
    
    // ✅ Validation
    if (!operation_date) {
      if (transaction && !transaction.finished) await transaction.rollback();
      return next(new AppError('تاريخ العملية مطلوب', 400));
    }
    
    if (!Array.isArray(vehicle_ids) || vehicle_ids.length === 0) {
      if (transaction && !transaction.finished) await transaction.rollback();
      return next(new AppError('يجب أن تكون vehicle_ids مصفوفة غير فارغة', 400));
    }

    // ✅ STEP 0: Check if all vehicles are fully invested
    const requestedVehicles = await Vehicle.findAll({
      where: { id: vehicle_ids },
      include: [{
        model: Partner,
        as: 'partners',
        through: { attributes: ['share_percentage'] }
      }]
    });

    for (const v of requestedVehicles) {
      const totalShares = (v.partners || []).reduce((sum, p) => {
        return sum + parseFloat(p.VehiclePartner?.share_percentage || 0);
      }, 0);
      if (Math.abs(totalShares - 100) > 0.01) {
        if (transaction && !transaction.finished) await transaction.rollback();
        return next(new AppError(`المركبة "${v.name}" غير مكتملة الاستثمار (النسبة الحالية: ${totalShares.toFixed(2)}%). لا يمكن استخدامها في العمليات.`, 400));
      }
    }
    
    // ✅ STEP 1: Check if OPEN operation exists for this date
    let existingOperation = await DailyOperation.findOne({
      where: { 
        operation_date,
        status: 'OPEN'
      }
    });
    
    // ========================================
    // CASE 1: NO Operation Exists → Create New
    // ========================================
    if (!existingOperation) {
      const operation = await DailyOperation.create({
        operation_date,
        user_id: req.user.id,
        status: 'OPEN',
        notes: req.body.notes || null
      }, { transaction });
      
      // Create all vehicles as ACTIVE
      await Promise.all(
        vehicle_ids.map(vehicle_id => 
          VehicleOperation.create({
            daily_operation_id: operation.id,
            vehicle_id,
            status: 'ACTIVE'
          }, { transaction })
        )
      );
      
      await transaction.commit();
      
      // Fetch complete operation
      const operationWithVehicles = await DailyOperation.findByPk(operation.id, {
        include: [
          {
            model: Vehicle,
            as: 'vehicles',
            through: { 
              attributes: ['status', 'created_at'],
              as: 'assignment'
            }
          }
        ]
      });
      
      return res.status(201).json({
        success: true,
        message: 'تم بدء العملية اليومية بنجاح',
        isNew: true,
        data: operationWithVehicles
      });
    }
    
    // ========================================
    // CASE 2: Operation EXISTS → Check Each Vehicle
    // ========================================
    const vehicleResults = [];
    
    for (const vehicle_id of vehicle_ids) {
      // Check if this vehicle has an assignment in this operation
      const existingAssignment = await VehicleOperation.findOne({
        where: {
          daily_operation_id: existingOperation.id,
          vehicle_id
        }
      });
      
      if (!existingAssignment) {
        // ✅ Vehicle NOT in operation → Create as ACTIVE
        await VehicleOperation.create({
          daily_operation_id: existingOperation.id,
          vehicle_id,
          status: 'ACTIVE'
        }, { transaction });
        
        vehicleResults.push({
          vehicle_id,
          action: 'CREATED',
          OperationAlreadyExists:true,
          message: 'تم إضافة المركبة للعملية'
        });
        
      } else if (existingAssignment.status === 'COMPLETED') {
        // ✅ Vehicle was COMPLETED → Reactivate
        await existingAssignment.update({
          status: 'ACTIVE'
        }, { transaction });
        
        vehicleResults.push({
          vehicle_id,
          action: 'REACTIVATED',
          vehicleAlreadyExists:true,
          message: 'تم إعادة تفعيل المركبة'
        });
        
      } else if (existingAssignment.status === 'ACTIVE') {
        // ✅ Vehicle already ACTIVE → No change needed
        vehicleResults.push({
          vehicle_id,
          action: 'ALREADY_ACTIVE',
          vehicleAlreadyExists:true,
          message: 'المركبة مفعلة بالفعل'
        });
      }
    }
    
    await transaction.commit();
    
    // Fetch complete operation with all vehicles
    const operationWithVehicles = await DailyOperation.findByPk(existingOperation.id, {
      include: [
        {
          model: Vehicle,
          as: 'vehicles',
          through: { 
            attributes: ['status', 'created_at', 'updated_at'],
            as: 'assignment'
          }
        }
      ]
    });
    
    res.status(200).json({
      success: true,
      message: 'تم معالجة العملية بنجاح',
      isNew: false,
      vehicleResults,
      data: operationWithVehicles
    });
    
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('Error in startDailyOperation:', error);
    next(error);
  }
};



// Get operation by ID
// exports.getOperation = async (req, res) => {
//   try {
//     const operation = await DailyOperation.findByPk(req.params.id, {
//       include: [
//         { model: Vehicle },
//         { 
//           model: FarmTransaction,
//           include: [{ model: Farm }, { model: ChickenType }]
//         },
//         { 
//           model: SaleTransaction,
//           include: [{ model: Buyer }, { model: ChickenType }]
//         },
//         { 
//           model: TransportLoss,
//           include: [{ model: ChickenType }]
//         },
//         { 
//           model: DailyCost,
//           include: [{ model: CostCategory }]
//         }
//       ]
//     });

//     if (!operation) {
//       return res.status(404).json({
//         success: false,
//         message: 'Operation not found'
//       });
//     }

//     res.json({
//       success: true,
//       data: operation
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error fetching operation'
//     });
//   }
// };
// exports.getOperation = async (req, res) => {
//   try {
//     const operation = await DailyOperation.findByPk(req.params.id, {
//       include: [
//         { model: Vehicle },

//         {
//           model: FarmTransaction,
//           include: [{ model: Farm }, { model: ChickenType }]
//         },

//         {
//           model: SaleTransaction,
//           include: [{ model: Buyer }, { model: ChickenType }]
//         },

//         {
//           model: TransportLoss,
//           include: [{ model: ChickenType }]
//         },

//         {
//           model: DailyCost,
//           include: [{ model: CostCategory }]
//         },

//         // ✅ PROFIT DISTRIBUTION (المهم)
//         {
//           model: ProfitDistribution,
//           as: 'profit_distribution',
//           required: false,
//           include: [
//             {
//               model: PartnerProfit,
//               as: 'partner_profits',
//               include: [
//                 {
//                   model: Partner,
//                   as: 'partner',
//                   attributes: ['id', 'name', 'investment_percentage', 'is_vehicle_partner']
//                 }
//               ]
//             }
//           ]
//         }
//       ]
//     });

//     if (!operation) {
//       return res.status(404).json({
//         success: false,
//         message: 'Operation not found'
//       });
//     }

//     res.json({
//       success: true,
//       data: operation
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error fetching operation',
//       error: error.message
//     });
//   }
// };
exports.getOperation = async (req, res) => {
  try {
    const { id } = req.params;
 
    // ── Validate ID ──────────────────────────────────────────────────────────
    if (isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid operation ID format'
      });
    }
 
    // ── Main query ───────────────────────────────────────────────────────────
    const operation = await DailyOperation.findByPk(id, {
      include: [
        {
          model: VehicleOperation,
          as: 'vehicle_operations',
          include: [
            { model: Vehicle, as: 'vehicle' },
 
            {
              model: FarmTransaction,
              as: 'farm_transactions',
              include: [
                {
                  model: Farm,
                  as: 'farm',
                  attributes: ['id', 'name', 'current_balance', 'owner_name', 'phone']
                },
                { model: ChickenType, as: 'chicken_type', attributes: ['id', 'name'] }
              ]
            },
 
            {
              model: TransportLoss,
              as: 'transport_losses',
              include: [
                { model: ChickenType, as: 'chicken_type', attributes: ['id', 'name'] },
                {
                  model: Farm,
                  as: 'farm',
                  attributes: ['id', 'name'],
                  required: false
                }
              ]
            },
 
            {
              model: SaleTransaction,
              as: 'sale_transactions',
              include: [
                {
                  model: Buyer,
                  as: 'buyer',
                  attributes: ['id', 'name', 'current_balance', 'phone']
                },
                { model: ChickenType, as: 'chicken_type', attributes: ['id', 'name'] },
                {
                  model: SaleWeight,
                  as: 'weights',
                  attributes: ['weight_number', 'weight_value'],
                  separate: true,
                  order: [['weight_number', 'ASC']]
                },
                {
                  model: Safe,
                  as: 'safe',
                  attributes: ['id', 'name'],
                  required: false
                }
              ]
            },
 
            {
              model: DailyCost,
              as: 'daily_costs',
              include: [
                {
                  model: CostCategory,
                  as: 'category',
                  attributes: ['id', 'name', 'is_vehicle_cost']
                },
                {
                  model: Vehicle,
                  as: 'vehicle',
                  attributes: ['id', 'name', 'plate_number'],
                  required: false
                }
              ]
            }
          ]
        },
 
        {
          model: Vehicle,
          as: 'vehicles',
          through: { attributes: [] }
        }
      ]
    });
 
    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'Operation not found'
      });
    }
 
    // ── Profit data (CLOSED operations only) ─────────────────────────────────
    let profitDistribution   = null;
    let partnerDistributions = null;
    let vehicleBreakdown     = null;
 
    if (operation.status === 'CLOSED') {
      try {
        // parseFloat guard — Sequelize returns DECIMAL columns as strings,
        // so round2('100.00') = NaN without this.
        const p = (val) => parseFloat(val) || 0;
 
        // ── 1. Load saved ProfitDistribution row ───────────────────────────
        const savedDist = await ProfitDistribution.findOne({
          where: { daily_operation_id: id },
          include: [
            {
              model: PartnerProfit,
              as: 'partner_profits',
              include: [
                {
                  model: Partner,
                  as: 'partner',
                  attributes: [
                    'id', 'name', 'investment_percentage', 'is_vehicle_partner'
                  ]
                }
              ]
            }
          ]
        });
 
        if (savedDist) {
          // ── 2. vehicleBreakdown first (needed for sale_losses / transport_losses
          //       totals that go onto profitDistribution) ──────────────────────
          try {
            const profitData = await ProfitService.calculateDailyProfit(parseInt(id));
 
            vehicleBreakdown = (profitData.vehicleBreakdown || []).map(v => ({
              vehicle_id:        v.vehicle_id,
              vehicle_name:      v.vehicle_name        || null,
              purchases:         round2(p(v.purchases)),
              revenue:           round2(p(v.revenue)),
              losses:            round2(p(v.losses)),
              lossesWithFarm:    round2(p(v.lossesWithFarm)),
              lossesWithoutFarm: round2(p(v.lossesWithoutFarm)),
              transport_losses:  round2(p(v.transport_losses)),
              sale_losses:       round2(p(v.sale_losses)),
              vehicle_costs:     round2(p(v.vehicle_costs)),
              other_costs:       round2(p(v.other_costs)),
              net_profit:        round2(p(v.net_profit))
            }));
          } catch (breakdownErr) {
            vehicleBreakdown = [];
            console.error(
              'Warning: could not build vehicleBreakdown for operation',
              id, breakdownErr.message
            );
          }
 
          // ── Derived totals from vehicleBreakdown ───────────────────────────
          const totalSaleLosses      = (vehicleBreakdown || []).reduce((s, v) => s + v.sale_losses,      0);
          const totalTransportLosses = (vehicleBreakdown || []).reduce((s, v) => s + v.transport_losses, 0);
 
          // ── Core financials (parsed from DB strings) ───────────────────────
          const netProfit      = round2(p(savedDist.net_profit));
          const totalRevenue   = round2(p(savedDist.total_revenue));
          const totalPurchases = round2(p(savedDist.total_purchases));
          const totalLosses    = round2(p(savedDist.total_losses));
          const totalCosts     = round2(p(savedDist.total_costs));
          const vehicleCosts   = round2(p(savedDist.vehicle_costs));
 
          // Both camelCase and snake_case aliases for losses breakdown
          // (frontend reads both: lossesWithFarm AND losses_with_farm)
          const lossesWithFarm    = round2(p(savedDist.lossesWithFarm));
          const lossesWithoutFarm = round2(p(savedDist.lossesWithoutFarm));
 
          // ── 3. Format profitDistribution ───────────────────────────────────
          profitDistribution = {
            // Spread raw JSON first so no saved column is lost
            ...savedDist.toJSON(),
 
            // ── Core financials (rounded numbers, override the raw strings) ──
            net_profit:      netProfit,
            total_revenue:   totalRevenue,
            total_purchases: totalPurchases,
            total_losses:    totalLosses,
            total_costs:     totalCosts,
            vehicle_costs:   vehicleCosts,
 
            // ── Losses breakdown — both naming conventions ───────────────────
            // camelCase (used by ProfitDistribution model & some frontend reads)
            lossesWithFarm,
            lossesWithoutFarm,
            // snake_case aliases (ProfitDistribution interface has both)
            losses_with_farm:    lossesWithFarm,
            losses_without_farm: lossesWithoutFarm,
 
            // ── Loss sub-types (summed from vehicleBreakdown) ────────────────
            // Frontend interface: sale_losses, transport_losses directly on ProfitDistribution
            sale_losses:      round2(totalSaleLosses),
            transport_losses: round2(totalTransportLosses),
 
            // ── distribution_id alias (interface has both id and distribution_id) ──
            distribution_id: savedDist.id,
 
            // ── totals sub-object (ProfitDistribution interface has this) ────
            totals: {
              total_revenue:   totalRevenue,
              total_purchases: totalPurchases,
              total_losses:    totalLosses,
              total_costs:     totalCosts,
              vehicle_costs:   vehicleCosts,
              net_profit:      netProfit
            },
 
            // ── Discounts ────────────────────────────────────────────────────
            // Frontend reads BOTH camelCase (pd?.discounts?.totalSalesDiscount)
            // AND snake_case (pd?.discounts?.total_sales_discount)
            discounts: {
              total_sales_discount:    round2(p(savedDist.total_sales_discount)),
              totalSalesDiscount:      round2(p(savedDist.total_sales_discount)),   // camelCase alias
              total_purchase_discount: round2(p(savedDist.total_purchase_discount)),
              total: round2(
                p(savedDist.total_sales_discount) +
                p(savedDist.total_purchase_discount)
              )
            },
 
            // ── Debts we paid out ────────────────────────────────────────────
            debts_paid: {
              from_sales:     round2(p(savedDist.debt_paid_from_sales)),
              from_purchases: round2(p(savedDist.debt_paid_from_purchases)),
              from_costs:     round2(p(savedDist.debt_paid_from_costs)),
              total: round2(
                p(savedDist.debt_paid_from_sales) +
                p(savedDist.debt_paid_from_purchases) +
                p(savedDist.debt_paid_from_costs)
              )
            },
 
            // ── Debts we received ────────────────────────────────────────────
            debts_received: {
              from_sales:     round2(p(savedDist.debt_received_from_sales)),
              from_purchases: round2(p(savedDist.debt_received_from_purchases)),
              from_costs:     round2(p(savedDist.debt_received_from_costs)),
              total: round2(
                p(savedDist.debt_received_from_sales) +
                p(savedDist.debt_received_from_purchases) +
                p(savedDist.debt_received_from_costs)
              )
            }
          };
 
          // ── 4. Format partnerDistributions ─────────────────────────────────
          // Shape matches PartnerProfit interface + what closeDay returns
          partnerDistributions = (savedDist.partner_profits || []).map(pp => ({
            // Raw fields
            ...pp.toJSON(),
 
            // Typed overrides with parseFloat guard
            partner_id:            pp.partner_id,
            partner_name:          pp.partner?.name                  || null,
            investment_percentage: p(pp.partner?.investment_percentage),
            is_vehicle_partner:    pp.partner?.is_vehicle_partner     || false,
            base_profit_share:     round2(p(pp.base_profit_share)),
            vehicle_cost_share:    round2(p(pp.vehicle_cost_share)),
            final_profit:          round2(p(pp.final_profit)),
 
            // profit_breakdown sub-object (PartnerProfit interface)
            profit_breakdown: {
              base_profit_share:  round2(p(pp.base_profit_share)),
              vehicle_cost_share: round2(p(pp.vehicle_cost_share)),
              final_profit:       round2(p(pp.final_profit)),
              profit_percentage:  pp.partner?.investment_percentage
                                    ? `${p(pp.partner.investment_percentage).toFixed(2)}%`
                                    : '0.00%'
            }
          }));
        }
 
      } catch (profitErr) {
        // Non-fatal — operation data still returns cleanly with null profit fields
        console.error(
          'Warning: could not load profit data for operation',
          id, profitErr.message
        );
      }
    }
 
    // ── Response ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      data: {
        ...operation.toJSON(),
        profitDistribution,
        partnerDistributions,
        vehicleBreakdown
      }
    });
 
  } catch (error) {
    console.error('Error fetching operation details:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching operation details',
      error: error.message
    });
  }
};






// Record farm loading
// exports.recordFarmLoading = async (req, res) => {
//   const transaction = await sequelize.transaction();
  
//   try {
//     const operation = await DailyOperation.findByPk(req.params.id);

//     if (!operation || operation.status === 'CLOSED') {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'العملية غير موجودة أو مغلقة بالفعل'
//       });
//     }

//     const {
//       farm_id,
//       chicken_type_id,
//       empty_vehicle_weight,
//       loaded_vehicle_weight,
//       cage_count,
//       cage_weight_per_unit,
//       price_per_kg,
//       paid_amount
//     } = req.body;

//     // Calculate net weight
//     const net_chicken_weight = loaded_vehicle_weight - empty_vehicle_weight - (cage_count * cage_weight_per_unit);
//     const total_amount = net_chicken_weight * price_per_kg;
//     const remaining_amount = total_amount - paid_amount;

//     // Get sequence number
//     const count = await FarmTransaction.count({
//       where: { daily_operation_id: req.params.id }
//     });

//     const farmTransaction = await FarmTransaction.create({
//       daily_operation_id: req.params.id,
//       farm_id,
//       chicken_type_id,
//       sequence_number: count + 1,
//       empty_vehicle_weight,
//       loaded_vehicle_weight,
//       cage_count,
//       cage_weight_per_unit,
//       net_chicken_weight,
//       price_per_kg,
//       total_amount,
//       paid_amount,
//       remaining_amount
//     }, { transaction });

//     // Update farm debt
//     const farm = await Farm.findByPk(farm_id);
//     await farm.update({
//       current_balance: parseFloat(farm.current_balance) + parseFloat(remaining_amount)
//     }, { transaction });

//     await transaction.commit();

//     res.status(201).json({
//       success: true,
//       data: farmTransaction
//     });
//   } catch (error) {
//     await transaction.rollback();
//     res.status(500).json({
//       success: false,
//       message: 'Error recording farm loading',
//       error: error.message
//     });
//   }
// };
// ✅ NEW - Requires vehicle_id
// exports.recordFarmLoading = async (req, res) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const { id } = req.params;
//     const {
//       vehicle_id,
//       farm_id,
//       chicken_type_id,
//       empty_vehicle_weight,
//       loaded_vehicle_weight,
//       cage_count,
//       cage_weight_per_unit,
//       price_per_kg,
//       paid_amount
//     } = req.body;

//     if (!vehicle_id) {
//       return res.status(400).json({
//         success: false,
//         message: 'vehicle_id is required'
//       });
//     }

//     const operation = await DailyOperation.findByPk(id);
//     if (!operation || operation.status !== 'OPEN') {
//       return res.status(400).json({
//         success: false,
//         message: 'Operation not found or already closed'
//       });
//     }

//     const vehicleAssignment = await VehicleOperation.findOne({
//       where: {
//         daily_operation_id: id,
//         vehicle_id,
//         status: 'ACTIVE'
//       }
//     });

//     if (!vehicleAssignment) {
//       return res.status(400).json({
//         success: false,
//         message: `Vehicle ${vehicle_id} is not assigned to this operation`
//       });
//     }

//     const totalCageWeight = cage_count * cage_weight_per_unit;
//     const net_chicken_weight = loaded_vehicle_weight - empty_vehicle_weight - totalCageWeight;

//     if (net_chicken_weight <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid weight calculation: net weight must be positive'
//       });
//     }

//     const total_amount = net_chicken_weight * price_per_kg;
//     const remaining_amount = total_amount - paid_amount;

//     const lastTransaction = await FarmTransaction.findOne({
//       where: { daily_operation_id: id, vehicle_id },
//       order: [['sequence_number', 'DESC']]
//     });
//     const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

//     const farmTransaction = await FarmTransaction.create({
//       daily_operation_id: id,
//       vehicle_id,
//       farm_id,
//       vehicle_operation_id: vehicleAssignment.id,
//       chicken_type_id,
//       sequence_number,
//       empty_vehicle_weight,
//       loaded_vehicle_weight,
//       cage_count,
//       cage_weight_per_unit,
//       net_chicken_weight,
//       price_per_kg,
//       total_amount,
//       paid_amount,
//       remaining_amount
//     }, { transaction: dbTransaction });

//     // Update farm debt inside transaction
//     await Farm.increment('current_balance', {
//       by: remaining_amount,
//       where: { id: farm_id }
//     }, { transaction: dbTransaction });

//     // ✅ Commit AFTER all transaction-dependent operations
//     await dbTransaction.commit();

//     // Fetch result after commit (doesn't need to be in transaction)
//     const result = await FarmTransaction.findByPk(farmTransaction.id, {
//       include: [
//         { model: Farm, as: 'farm' },
//         { model: ChickenType, as: 'chicken_type' },
//         { model: Vehicle, as: 'vehicle' }
//       ]
//     });

//     res.status(201).json({
//       success: true,
//       data: result
//     });

//   } catch (error) {
//     // Only rollback if transaction is still active
//     if (!dbTransaction.finished) {
//       await dbTransaction.rollback();
//     }
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };
/**
 * Record farm loading transaction
 * POST /api/daily-operations/:id/farm-loading
 */
// exports.recordFarmLoading = async (req, res) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const { id } = req.params;
//     const {
//       vehicle_id,
//       farm_id,
//       chicken_type_id,
//       empty_vehicle_weight,
//       loaded_vehicle_weight,
//       cage_count,
//       cage_weight_per_unit,
//       price_per_kg,
//       paid_amount = 0,
//     old_balance_paid
//     } = req.body;

//     // ========================================
//     // VALIDATION
//     // ========================================
    
//     if (!vehicle_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'vehicle_id is required'
//       });
//     }

//     if (!farm_id || !chicken_type_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'farm_id and chicken_type_id are required'
//       });
//     }

//     // Validate operation exists and is open
//     const operation = await DailyOperation.findByPk(id, { transaction: dbTransaction });
    
//     if (!operation) {
//       await dbTransaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Daily operation not found'
//       });
//     }
    
//     if (operation.status !== 'OPEN') {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Operation is already closed'
//       });
//     }

//     // Validate vehicle assignment
//     const vehicleAssignment = await VehicleOperation.findOne({
//       where: {
//         daily_operation_id: id,
//         vehicle_id,
//         status: 'ACTIVE'
//       },
//       transaction: dbTransaction
//     });

//     if (!vehicleAssignment) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Vehicle ${vehicle_id} is not assigned to this operation`
//       });}

// // ========================================
// // WEIGHT CALCULATION
// // ========================================

// const totalCageWeight = cage_count * cage_weight_per_unit;
// const net_chicken_weight = loaded_vehicle_weight - empty_vehicle_weight - totalCageWeight;

// if (net_chicken_weight <= 0) {
//   await dbTransaction.rollback();
//   return res.status(400).json({
//     success: false,
//     message: 'Invalid weight calculation: net weight must be positive',
//     debug: {
//       loaded: loaded_vehicle_weight,
//       empty: empty_vehicle_weight,
//       cages: totalCageWeight,
//       net: net_chicken_weight
//     }
//   });
// }

// // ========================================
// // PRICING CALCULATION
// // ========================================

// const total_amount = net_chicken_weight * price_per_kg;
// const remaining_amount = total_amount - paid_amount;

// // Get next sequence number
// const lastTransaction = await FarmTransaction.findOne({
//   where: { daily_operation_id: id, vehicle_id },
//   order: [['sequence_number', 'DESC']],
//   transaction: dbTransaction
// });

// const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

// // ========================================
// // CREATE TRANSACTION
// // ========================================

// const farmTransaction = await FarmTransaction.create({
//   daily_operation_id: id,
//   vehicle_id,
//   farm_id,
//   vehicle_operation_id: vehicleAssignment.id,
//   chicken_type_id,
//   sequence_number,
//   empty_vehicle_weight,
//   loaded_vehicle_weight,
//   cage_count,
//   cage_weight_per_unit,
//   net_chicken_weight,
//   price_per_kg,
//   total_amount,
//   paid_amount,
//   remaining_amount
// }, { transaction: dbTransaction });

// // ========================================
// // UPDATE FARM BALANCE (NEW LOGIC)
// // ========================================

// // Get farm with current balance
// const farm = await Farm.findByPk(farm_id, { transaction: dbTransaction });

// if (!farm) {
//   await dbTransaction.rollback();
//   return res.status(404).json({
//     success: false,
//     message: 'Farm not found'
//   });
// }

 
// // Update balance and get change info
// const balanceInfo = await farm.updateBalance(remaining_amount,old_balance_paid, dbTransaction);

// // ========================================
// // COMMIT TRANSACTION
// // ========================================

// await dbTransaction.commit();

// // ========================================
// // FETCH COMPLETE RESULT
// // ========================================

// const result = await FarmTransaction.findByPk(farmTransaction.id, {
//   include: [
//     { 
//       model: Farm, 
//       as: 'farm',
//       attributes: ['id', 'name', 'current_balance']
//     },
//     { 
//       model: ChickenType, 
//       as: 'chicken_type',
//       attributes: ['id', 'name']
//     },
//     { 
//       model: Vehicle, 
//       as: 'vehicle',
//       attributes: ['id', 'name', 'plate_number']
//     }
//   ]
// });

// // ========================================
// // RESPONSE WITH BALANCE INFO
// // ========================================

// res.status(201).json({
//   success: true,
//   message: 'Farm loading recorded successfully',
//   data: {
//     transaction: result,
//     balance_info: {
//       farm_id: balanceInfo.farm_id,
//       farm_name: balanceInfo.farm_name,
//       previous_balance: balanceInfo.previous_balance,
//       transaction_impact: remaining_amount,
//       new_balance: balanceInfo.new_balance,
//       balance_type: balanceInfo.new_type,
//       direction_changed: balanceInfo.direction_changed,
//       display_balance: balanceInfo.display_balance,
      
//       // ✅ ALERT if direction changed
//       ...(balanceInfo.direction_changed && {
//         alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
//       })
//     }
//   }
// });
// } catch (error) {
// // Rollback if transaction is still active
// if (!dbTransaction.finished) {
// await dbTransaction.rollback();
// }
// console.error('Error recording farm loading:', error);
// res.status(500).json({
//   success: false,
//   message: 'Error recording farm loading',
//   error: process.env.NODE_ENV === 'development' ? error.message : undefined
// });
// }
// };
// Record transport loss
// exports.recordTransportLoss = async (req, res) => {
//   try {
//     const operation = await DailyOperation.findByPk(req.params.id);

//     if (!operation || operation.status === 'CLOSED') {
//       return res.status(400).json({
//         success: false,
//         message: 'العملية غير موجودة أو مغلقة بالفعل'
//       });
//     }

//     const { chicken_type_id, dead_weight, price_per_kg, location } = req.body;
//     const loss_amount = dead_weight * price_per_kg;

//     const loss = await TransportLoss.create({
//       daily_operation_id: req.params.id,
//       chicken_type_id,
//       dead_weight,
//       price_per_kg,
//       loss_amount,
//       location
//     });

//     res.status(201).json({
//       success: true,
//       data: loss
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error recording transport loss'
//     });
//   }
// };

// ✅ Updated Transport Loss
// controllers/farmLoadingController.js


// exports.recordFarmLoading = async (req, res) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const { id } = req.params;
//     const {
//       vehicle_id,
//       farm_id,
//       chicken_type_id,
//       empty_vehicle_weight,
//       loaded_vehicle_weight,
//       cage_count,
//       cage_weight_per_unit,
//       price_per_kg,
//       // paid_amount = 0,
//       discount_amount = 0, 
//       // old_balance_paid = 0, // Can be positive for any direction
//       is_debt_payment_only = false // New flag for debt-only transactions
//     } = req.body;
//     console.log("req.body",req.body);

//     // ========================================
//     // VALIDATION
//     // ========================================
    
//     // Validate operation exists and is open
//     const operation = await DailyOperation.findByPk(id, { transaction: dbTransaction });
    
//     if (!operation) {
//       await dbTransaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Daily operation not found'
//       });
//     }
    
//     if (operation.status !== 'OPEN') {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Operation is already closed'
//       });
//     }

//     // Get farm with current balance
//     const farm = await Farm.findByPk(farm_id, { transaction: dbTransaction });

//     if (!farm) {
//       await dbTransaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Farm not found'
//       });
//     }

//     const previous_balance = parseFloat(farm.current_balance) || 0;

//     // ========================================
//     // DEBT PAYMENT ONLY (NO LOADING)
//     // ========================================
    
//     if (is_debt_payment_only) {
//       if (old_balance_paid <= 0) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Payment amount must be greater than 0 for debt payment'
//         });
//       }

//       // // Determine payment direction based on current balance
//       // let payment_direction;
//       // let payment_description;
      
//       // if (previous_balance > 0) {
//       //   // Farm has RECEIVABLE (they owe us) → Farm pays us
//       //   payment_direction = 'FROM_FARM';
//       //   payment_description = `Farm payment toward debt of ${previous_balance.toFixed(2)} EGP`;
        
//       //   // Validate payment doesn't exceed debt
//       //   if (old_balance_paid > previous_balance) {
//       //     await dbTransaction.rollback();
//       //     return res.status(400).json({
//       //       success: false,
//       //       message: `Payment amount (${old_balance_paid}) exceeds current debt (${previous_balance})`,
//       //       current_balance: previous_balance,
//       //       max_payment: previous_balance
//       //     });
//       //   }
//       // } else if (previous_balance < 0) {
//       //   // Farm has PAYABLE (we owe them) → We pay farm
//       //   payment_direction = 'TO_FARM';
//       //   payment_description = `Payment to farm toward our debt of ${Math.abs(previous_balance).toFixed(2)} EGP`;
        
//       //   // Validate payment doesn't exceed what we owe
//       //   if (old_balance_paid > Math.abs(previous_balance)) {
//       //     await dbTransaction.rollback();
//       //     return res.status(400).json({
//       //       success: false,
//       //       message: `Payment amount (${old_balance_paid}) exceeds what we owe (${Math.abs(previous_balance)})`,
//       //       current_balance: previous_balance,
//       //       max_payment: Math.abs(previous_balance)
//       //     });
//       //   }
//       // } else {
//       //   // Balance is zero
//       //   await dbTransaction.rollback();
//       //   return res.status(400).json({
//       //     success: false,
//       //     message: 'No outstanding debt to pay',
//       //     current_balance: 0
//       //   });
//       // }

//       // // Create debt payment record
//       // const debtPayment = await FarmDebtPayment.create({
//       //   farm_id,
//       //   daily_operation_id: id,
//       //   amount: old_balance_paid,
//       //   payment_direction,
//       //   // payment_date: operation.operation_date,
//       //   notes: payment_description
//       // }, { transaction: dbTransaction });
// // ========================================
// // HANDLE OLD BALANCE PAYMENT (IF ANY)
// // ========================================

// let debtPayment = null;
// let payment_direction;      // ← Move declaration here
// let payment_description;    // ← Move declaration here

// if (old_balance_paid > 0) {
//   // Determine payment direction based on current balance
  
//   if (previous_balance > 0) {
//     // Farm has RECEIVABLE (they owe us) → Farm pays us
//     payment_direction = 'FROM_FARM';
//     payment_description = `الدفع أثناء تحميل الفراخ `;
    
//     // Validate payment doesn't exceed debt
//     if (old_balance_paid > previous_balance) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Old balance payment (${old_balance_paid}) exceeds current debt (${previous_balance})`,
//         current_balance: previous_balance,
//         max_payment: previous_balance
//       });
//     }
//   } else if (previous_balance < 0) {
//     // Farm has PAYABLE (we owe them) → We pay farm
//     payment_direction = 'TO_FARM';
//     payment_description = `الدفع أثناء تحميل الفراخ `;
    
//     // Validate payment doesn't exceed what we owe
//     if (old_balance_paid > Math.abs(previous_balance)) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Payment amount (${old_balance_paid}) exceeds what we owe (${Math.abs(previous_balance)})`,
//         current_balance: previous_balance,
//         max_payment: Math.abs(previous_balance)
//       });
//     }
//   } else {
//     // Balance is zero - no debt to pay
//     await dbTransaction.rollback();
//     return res.status(400).json({
//       success: false,
//       message: 'Cannot pay old balance: No outstanding debt exists',
//       current_balance: 0
//     });
//   }
// }

// // ========================================
// // CREATE FARM TRANSACTION
// // ========================================

// // const farmTransaction = await FarmTransaction.create({
// //   // ... your existing code
// // }, { transaction: dbTransaction });

// // console.log("\ntrans\n", farmTransaction);

// if (old_balance_paid > 0) {
//   // Create debt payment record
//   debtPayment = await FarmDebtPayment.create({
//     farm_id,
//     daily_operation_id: id,
//     amount: old_balance_paid,
//     payment_direction,        // ← Now accessible
//     notes: payment_description  // ← Now accessible
//   }, { transaction: dbTransaction });
// }
//       // Update farm balance
//       const balanceInfo = await farm.updateBalance(debtPayment.balanceImpact, dbTransaction);

//       await dbTransaction.commit();

//       return res.status(201).json({
//         success: true,
//         message: 'Debt payment recorded successfully',
//         data: {
//           payment: {
//             id: debtPayment.id,
//             amount: debtPayment.amount,
//             direction: debtPayment.payment_direction,
//             date: debtPayment.payment_date,
//             description: debtPayment.displayDescription
//           },
//           balance_info: {
//             farm_id: balanceInfo.farm_id,
//             farm_name: balanceInfo.farm_name,
//             previous_balance: previous_balance,
//             payment_amount: old_balance_paid,
//             payment_direction,
//             new_balance: balanceInfo.new_balance,
//             balance_type: balanceInfo.new_type,
//             direction_changed: balanceInfo.direction_changed,
//             display_balance: balanceInfo.display_balance,
//             ...(balanceInfo.direction_changed && {
//               alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
//             })
//           }
//         }
//       });
//     }

//     // ========================================
//     // FARM LOADING TRANSACTION (NORMAL FLOW)
//     // ========================================

//     if (!vehicle_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'vehicle_id is required for farm loading'
//       });
//     }

//     if (!chicken_type_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'chicken_type_id is required for farm loading'
//       });
//     }

//     // Validate vehicle assignment
//     const vehicleAssignment = await VehicleOperation.findOne({
//       where: {
//         daily_operation_id: id,
//         vehicle_id,
//         status: 'ACTIVE'
//       },
//       transaction: dbTransaction
//     });

//     if (!vehicleAssignment) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Vehicle ${vehicle_id} is not assigned to this operation`
//       });
//     }

//     // ========================================
//     // WEIGHT CALCULATION
//     // ========================================

//     const totalCageWeight = cage_count * cage_weight_per_unit;
//     const net_chicken_weight = loaded_vehicle_weight - empty_vehicle_weight - totalCageWeight;

//     if (net_chicken_weight <= 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid weight calculation: net weight must be positive',
//         debug: {
//           loaded: loaded_vehicle_weight,
//           empty: empty_vehicle_weight,
//           cages: totalCageWeight,
//           net: net_chicken_weight
//         }
//       });
//     }

//     // ========================================
//     // PRICING CALCULATION
//     // ========================================

// const subtotal_amount = net_chicken_weight * price_per_kg;
// const total_amount = Math.max(0, subtotal_amount - discount_amount);  // after discount
// let paid_for_transaction = Math.min(total_paid, total_amount);
// let extra_payment = Math.max(0, total_paid - total_amount);
// let remaining_amount = total_amount - paid_for_transaction;
     
//     // Get next sequence number
//     const lastTransaction = await FarmTransaction.findOne({
//       where: { daily_operation_id: id, vehicle_id },
//       order: [['sequence_number', 'DESC']],
//       transaction: dbTransaction
//     });

//     const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

//     // ========================================
//     // HANDLE OLD BALANCE PAYMENT (IF ANY)
//     // ========================================
//  let payment_direction;
//       let payment_description;
//     let debtPayment = null;
    
//     if (old_balance_paid > 0) {
//       // Determine payment direction based on current balance
     
      
//       if (previous_balance > 0) {
//         // Farm has RECEIVABLE (they owe us) → Farm pays us
//         payment_direction = 'FROM_FARM';
//         console.log("sequence_number",sequence_number);
        
//         payment_description = `الدفع أثناء تحميل المعاملة برقم ${sequence_number} في نفس اليوم ونفس المركبه`;
        
//         // Validate payment doesn't exceed debt
//         if (old_balance_paid > previous_balance) {
//           await dbTransaction.rollback();
//           return res.status(400).json({
//             success: false,
//             message: `Old balance payment (${old_balance_paid}) exceeds current debt (${previous_balance})`,
//             current_balance: previous_balance,
//             max_payment: previous_balance
//           });
//         }
//       } else if (previous_balance < 0) {
//         // Farm has PAYABLE (we owe them) → We pay farm
//         payment_direction = 'TO_FARM';
//         payment_description = `Payment to farm during loading transaction #${sequence_number}`;
        
//         // Validate payment doesn't exceed what we owe
//         if (old_balance_paid > Math.abs(previous_balance)) {
//           await dbTransaction.rollback();
//           return res.status(400).json({
//             success: false,
//             message: `Payment amount (${old_balance_paid}) exceeds what we owe (${Math.abs(previous_balance)})`,
//             current_balance: previous_balance,
//             max_payment: Math.abs(previous_balance)
//           });
//         }
//       } else {
//         // Balance is zero - no debt to pay
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Cannot pay old balance: No outstanding debt exists',
//           current_balance: 0
//         });
//       }
//     }
    
//     const farmTransaction = await FarmTransaction.create({
//       daily_operation_id: id,
//       vehicle_id,
//       farm_id,
//       vehicle_operation_id: vehicleAssignment.id,
//       chicken_type_id,
//       sequence_number,
//       empty_vehicle_weight,
//       loaded_vehicle_weight,
//       cage_count,
//       cage_weight_per_unit,
//       net_chicken_weight,
//       price_per_kg,
//       discount_amount, 
//       total_amount,
//       paid_amount,
//       remaining_amount,
//       used_credit:0
//     }, { transaction: dbTransaction });
//     console.log("\ntrans\n",farmTransaction);

//     if (old_balance_paid > 0) {
//     // Create debt payment record
//       debtPayment = await FarmDebtPayment.create({
//         farm_id,
//         daily_operation_id: id,
//         amount: old_balance_paid,
//         payment_direction,
//         createdAt: farmTransaction.transaction_time,
//         notes: payment_description
//       }, { transaction: dbTransaction });
//     }
// const debt_payment_impact = debtPayment ? debtPayment.balanceImpact : 0;
// //  let total_balance_change=previous_balance+debt_payment_impact
//     let total_balance_change = debt_payment_impact;
//     let used_credit = 0;

//     // If farm has PAYABLE balance (we owe them) AND there's remaining amount
//     if (total_balance_change > 0 && remaining_amount > 0) {
//       const available_credit = Math.abs(total_balance_change);  // How much we owe them
      
//       // Use credit up to the available amount or remaining amount, whichever is smaller
//       used_credit = Math.min(available_credit, remaining_amount);
//       console.log("\nin used_credit\n");
      
//     }
//     // Adjust remaining amount after using credit
//     const final_remaining_amount = remaining_amount - used_credit;
//     if(used_credit!=0){
//          await farmTransaction.update(
//           {
//             remaining_amount: final_remaining_amount,
//             used_credit: used_credit
//           },
//           { transaction: dbTransaction }
//         );
//     }
//     // ========================================
//     // UPDATE FARM BALANCE
//     // ========================================

//     // Calculate total balance impact:
//     // 1. Add/subtract old_balance_paid based on direction (handled by balanceImpact getter)
//     // 2. Add remaining_amount (new debt they owe us if positive, or we owe them if negative)
    
    
//     total_balance_change = debt_payment_impact -used_credit - final_remaining_amount;
//     console.log("\n\nprevious_balance",previous_balance,"\n\n");
//     console.log("\n\ndebt_payment_impact",debt_payment_impact,"\n\n");
//     console.log("\n\ninal_remaining_amount",final_remaining_amount,"\n\n");
//     console.log("\n\nused_credit",used_credit,"\n\n");
//     console.log("\n\ntotal_balance_change",total_balance_change,"\n\n");
    
//     const balanceInfo = await farm.updateBalance(total_balance_change, dbTransaction);

//     // ========================================
//     // COMMIT TRANSACTION
//     // ========================================

//     await dbTransaction.commit();

//     // ========================================
//     // FETCH COMPLETE RESULT
//     // ========================================

//     const result = await FarmTransaction.findByPk(farmTransaction.id, {
//       include: [
//         { 
//           model: Farm, 
//           as: 'farm',
//           attributes: ['id', 'name', 'current_balance']
//         },
//         { 
//           model: ChickenType, 
//           as: 'chicken_type',
//           attributes: ['id', 'name']
//         },
//         { 
//           model: Vehicle, 
//           as: 'vehicle',
//           attributes: ['id', 'name', 'plate_number']
//         }
//       ]
//     });

//     // ========================================
//     // RESPONSE WITH COMPLETE INFO
//     // ========================================

//     res.status(201).json({
//       success: true,
//       message: 'Farm loading recorded successfully',
//       data: {
//         transaction: result,
        
//         // Balance information
//         balance_info: {
//           farm_id: balanceInfo.farm_id,
//           farm_name: balanceInfo.farm_name,
//           previous_balance: previous_balance,
          
//           // Breakdown of changes
//           changes: {
//             old_balance_paid: old_balance_paid,
//             old_balance_direction: debtPayment?.payment_direction || null,
//             new_transaction_debt: remaining_amount,
//             subtotal_amount,          // ← ADD (before discount)
//             discount_amount, 
//             net_change: total_balance_change,
//             used_credit
//           },
          
//           new_balance: balanceInfo.new_balance,
//           balance_type: balanceInfo.new_type,
//           direction_changed: balanceInfo.direction_changed,
//           display_balance: balanceInfo.display_balance,
          
//           // Alert if direction changed
//           ...(balanceInfo.direction_changed && {
//             alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
//           })
//         },

//         // Debt payment record (if any)
//         ...(debtPayment && {
//           debt_payment: {
//             id: debtPayment.id,
//             amount: debtPayment.amount,
//             direction: debtPayment.payment_direction,
//             date: debtPayment.payment_date,
//             description: debtPayment.displayDescription
//           }
//         })
//       }
//     });

//   } catch (error) {
//     // Rollback if transaction is still active
//     if (!dbTransaction.finished) {
//       await dbTransaction.rollback();
//     }
    
//     console.error('Error recording farm loading:', error);
    
//     res.status(500).json({
//       success: false,
//       message: 'Error recording farm loading',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };
// ============================================================
// FILE: controllers/operationController.js  (farm loading section)
// REPLACES: entire exports.recordFarmLoading function
// ============================================================

exports.recordFarmLoading = async (req, res) => {
  const dbTransaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      vehicle_id,
      farm_id,
      chicken_type_id,
      empty_vehicle_weight,
      loaded_vehicle_weight,
      cage_count,
      cage_weight_per_unit,
      price_per_kg,
      paid_amount       = 0,        // was commented out → undefined everywhere
    // ── BUG 1 + 3 FIX: restore paid_amount and old_balance_paid ─────────────
      discount_amount   = 0,
      old_balance_paid  = 0,
      is_debt_payment_only = false,
      received_by_person_id,
      person_type,
      paid_by_person_id,
      payment_method = 'CASH',
      safe_id,
      payment_source_type = 'SAFE',
      payment_source_id,
      notes
    } = req.body;

    const operation = await DailyOperation.findByPk(id, { transaction: dbTransaction });
    if (!operation) {
      await dbTransaction.rollback();
      return res.status(404).json({ success: false, message: 'Daily operation not found' });
    }
    if (operation.status !== 'OPEN') {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'Operation is already closed' });
    }

    const farm = await Farm.findByPk(farm_id, { transaction: dbTransaction });
    if (!farm) {
      await dbTransaction.rollback();
      return res.status(404).json({ success: false, message: 'Farm not found' });
    }

    const previous_balance = parseFloat(farm.current_balance) || 0;

    if (is_debt_payment_only) {
      if (!old_balance_paid || old_balance_paid <= 0) {
        await dbTransaction.rollback();
        return res.status(400).json({ success: false, message: 'مبلغ السداد يجب ان يكون اكبر من صفر' });
      }

      let payment_direction;
      let payment_description;
      let transaction_type;
      let direction;
      let paid_by_person_type = null;
      let received_by_person_type = null;

      if (previous_balance > 0) {
        payment_direction = 'FROM_FARM';
        payment_description = 'الدفع من المزرعة لسداد الرصيد المستحق';
        transaction_type = 'RECEIVE_DEPT';
        direction = 'IN';
        received_by_person_type = person_type;
      } else {
        payment_direction = 'TO_FARM';
        payment_description = previous_balance < 0 ? 'دفع للمزرعة لسداد الرصيد الدائن' : 'دفع للمزرعة لزيادة الرصيد عند الشراء';
        transaction_type = 'PAID_DEPT';
        direction = 'OUT';
        paid_by_person_type = person_type;
      }

      const debtPayment = await FarmDebtPayment.create({
        farm_id,
        daily_operation_id: id,
        amount: old_balance_paid,
        payment_direction,
        notes: notes || payment_description,
        payment_method,
        payment_source_type: direction === 'OUT' ? (payment_source_type || 'SAFE') : 'SAFE',
        payment_source_id: (direction === 'OUT' ? (payment_source_id || safe_id) : safe_id)
      }, { transaction: dbTransaction });

      await handlePaymentSource({
        payment_source_type: debtPayment.payment_source_type,
        payment_source_id: debtPayment.payment_source_id,
        amount: debtPayment.amount,
        direction,
        reference_type: 'FarmDebtPayment',
        reference_id: debtPayment.id,
        description: debtPayment.notes,
        dbTransaction,
        recorded_by_user_id: req.user ? req.user.id : null
      });

      await logTransaction({
        transaction_type,
        direction,
        amount: old_balance_paid,
        safe_id: debtPayment.payment_source_type === 'SAFE' ? debtPayment.payment_source_id : null,
        reference_type: 'FarmDebtPayment',
        reference_id: debtPayment.id,
        daily_operation_id: id,
        performed_by_user_id: req.user ? req.user.id : null,
        paid_by_person_type,
        received_by_person_type,
        paid_by_person_id: paid_by_person_id,
        received_by_person_id,
        payment_method,
      }, dbTransaction);

      const balanceInfo = await farm.updateBalance(debtPayment.balanceImpact, dbTransaction);
      await dbTransaction.commit();

      return res.status(201).json({
        success: true,
        message: 'تم تسجيل سداد المديونية بنجاح',
        data: {
          payment: {
            id:          debtPayment.id,
            amount:      debtPayment.amount,
            direction:   debtPayment.payment_direction,
            date:        debtPayment.payment_date,
            description: debtPayment.displayDescription
          },
          balance_info: {
            farm_id:           balanceInfo.farm_id,
            farm_name:         balanceInfo.farm_name,
            previous_balance,
            payment_amount:    old_balance_paid,
            payment_direction,
            new_balance:       balanceInfo.new_balance,
            balance_type:      balanceInfo.new_type,
            direction_changed: balanceInfo.direction_changed,
            display_balance:   balanceInfo.display_balance
          }
        }
      });
    }

    // ========================================================================
    // BRANCH B — NORMAL FARM LOADING
    // ========================================================================

    if (!vehicle_id) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'vehicle_id is required for farm loading' });
    }

    if (!chicken_type_id) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'chicken_type_id is required for farm loading' });
    }

    const vehicleAssignment = await VehicleOperation.findOne({
      where: { daily_operation_id: id, vehicle_id, status: 'ACTIVE' },
      transaction: dbTransaction
    });

    if (!vehicleAssignment) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Vehicle ${vehicle_id} is not assigned to this operation`
      });
    }

    // ── Weight calculation ───────────────────────────────────────────────────

    const totalCageWeight    = cage_count * cage_weight_per_unit;
    const net_chicken_weight = loaded_vehicle_weight - empty_vehicle_weight - totalCageWeight;

    if (net_chicken_weight <= 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid weight calculation: net weight must be positive',
        debug: {
          loaded: loaded_vehicle_weight,
          empty:  empty_vehicle_weight,
          cages:  totalCageWeight,
          net:    net_chicken_weight
        }
      });
    }

    // ── Pricing calculation ──────────────────────────────────────────────────

    const subtotal_amount = net_chicken_weight * price_per_kg;
    const total_amount    = Math.max(0, subtotal_amount - discount_amount);

    // ── BUG 7 FIX: calculate surplus (overpayment) ───────────────────────────
    // Original code used Math.max(0, total_amount - paid_amount) which silently
    // discarded any overpayment.  We now track it so the farm gets credited.
    const surplus          = Math.max(0, paid_amount - total_amount);//100
    const remaining_amount = Math.max(0, total_amount - paid_amount);//0

    // ── Sequence number ──────────────────────────────────────────────────────

    const lastTransaction = await FarmTransaction.findOne({
      where:       { daily_operation_id: id, vehicle_id },
      order:       [['sequence_number', 'DESC']],
      transaction: dbTransaction
    });

    const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

    // ── Handle old_balance_paid ──────────────────────────────────────────────
    // BUG 4 FIX: single declaration of payment_direction / payment_description
    // (original had duplicate `let` declarations causing SyntaxError).

    let debtPayment         = null;
    let payment_direction   = null;
    let payment_description = null;
    let debt_payment_impact = 0;

    if (old_balance_paid > 0) {

      // if (previous_balance === 0) {
      //   await dbTransaction.rollback();
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Cannot pay old balance: No outstanding balance exists',
      //     current_balance: 0
      //   });
      // }

      // if (previous_balance > 0) {
      //   // Farm owes us → farm pays us during this loading
      //   payment_direction   = 'FROM_FARM';
      //   payment_description = `الدفع أثناء تحميل المعاملة رقم ${sequence_number}`;

         
      // } else {
        // We owe farm → we pay them during this loading
        payment_direction   = 'TO_FARM';
        payment_description = `الدفع للمزرعة أثناء تحميل المعاملة رقم ${sequence_number}`;

      // } 
      debtPayment = await FarmDebtPayment.create({
        farm_id,
        daily_operation_id: id,
        amount:             old_balance_paid,
        payment_direction,
        notes:          payment_description,
        payment_method,
        safe_id
      }, { transaction: dbTransaction });

      debt_payment_impact = parseFloat(debtPayment.balanceImpact) || 0;
    }

    // ── BUG 6 FIX: use running_balance, not stale total_balance_change ───────
    // Original checked `total_balance_change > 0` but that variable still held
    // the old `debt_payment_impact` value at that point — not the balance after
    // applying the payment.  running_balance is the correct value to check.
    //
    // Credit consumption:
    //   Farm has RECEIVABLE (running_balance > 0, farm owes us) AND we now have
    //   a new remaining_amount (we owe them from this transaction).
    //   These oppose each other → auto-consume the receivable.
    const running_balance = previous_balance + debt_payment_impact;//-80

    let used_credit = 0;
    if (running_balance > 0 && remaining_amount > 0) {
      used_credit = Math.min(running_balance, remaining_amount);
    }

    const final_remaining_amount = remaining_amount - used_credit;

    // ── Create FarmTransaction ───────────────────────────────────────────────

    const farmTransaction = await FarmTransaction.create({
      daily_operation_id:   id,
      vehicle_id,
      farm_id,
      vehicle_operation_id: vehicleAssignment.id,
      chicken_type_id,
      sequence_number,
      empty_vehicle_weight,
      loaded_vehicle_weight,
      cage_count,
      cage_weight_per_unit,
      net_chicken_weight,
      price_per_kg,
      discount_amount,
      total_amount,
      paid_amount,
      remaining_amount: final_remaining_amount,
      used_credit, 
      paid_by_person_type:person_type,
      paid_by_person_id,
      payment_method,
      safe_id: payment_source_type === 'SAFE' ? safe_id : null,
      payment_source_type,
      payment_source_id
    }, { transaction: dbTransaction });

    if (paid_amount > 0) {
      // ── Handle Payment through Unified Utility ─────────────────────────────
      await handlePaymentSource({
        payment_source_type: payment_source_type || 'SAFE',
        payment_source_id: payment_source_id || safe_id,
        amount: paid_amount,
        direction: 'OUT',
        reference_type: 'FarmTransaction',
        reference_id: farmTransaction.id,
        description: `دفعة نقدية - تحميل مزرعة مسلسل ${sequence_number}`,
        dbTransaction,
        recorded_by_user_id: req.user ? req.user.id : null
      });

      // ── LOG FINANCIAL TRANSACTION ──────────────────────────────────────────
      await logTransaction({
        transaction_type: 'PURCHASE',
        direction: 'OUT',
        amount: paid_amount,
        safe_id: (payment_source_type === 'SAFE' || !payment_source_type) ? (payment_source_id || safe_id) : null,
        reference_type: 'FarmTransaction',
        reference_id: farmTransaction.id,
        daily_operation_id: id,
        performed_by_user_id: req.user ? req.user.id : null,
        paid_by_person_type: person_type,
        paid_by_person_id: paid_by_person_id,
        payment_method, 
      }, dbTransaction);
    }

    // ── Balance change formula ───────────────────────────────────────────────
    //
    // Farm PURCHASE semantics (opposite to sale):
    //
    //   final_remaining_amount  > 0  →  we STILL OWE farm  →  balance ↓  (subtract)
    //   surplus                 > 0  →  farm OWES us extra  →  balance ↑  (add)
    //   used_credit             > 0  →  consumed farm's receivable → balance ↓ (subtract)
    //   debt_payment_impact          →  already directional via balanceImpact getter
    //
    //   Δ = debt_payment_impact - used_credit - final_remaining_amount + surplus
    //
    // BUG 7 FIX: + surplus was missing entirely in original code.
  
    
    let total_balance_change =
    //  debt_payment_impact 
      - used_credit
      - final_remaining_amount
      + surplus;
      
   
    console.log('\n── recordFarmLoading balance breakdown ──');
    console.log('previous_balance:     ', previous_balance);
    console.log('paid_amount:          ', paid_amount);
    console.log('total_amount:         ', total_amount);
    console.log('surplus:              ', surplus);
    console.log('remaining_amount:     ', remaining_amount);
    console.log('debt_payment_impact:  ', debt_payment_impact);
    console.log('running_balance:      ', running_balance);
    console.log('used_credit:          ', used_credit);
    console.log('final_remaining:      ', final_remaining_amount);
    console.log('total_balance_change: ', total_balance_change);
    console.log('expected new_balance: ', previous_balance + total_balance_change);
    console.log('old_balance_paid: ', old_balance_paid);
    console.log('─────────────────────────────────────────\n');

    // ── Update farm balance (single call) ────────────────────────────────────

    const balanceInfo = await farm.updateBalance(total_balance_change, dbTransaction);


  if (surplus - (old_balance_paid||0) > 0) {
      const surplusPayment = await FarmDebtPayment.create({
        farm_id,
        daily_operation_id: id,
        amount:             surplus - old_balance_paid,
        payment_direction:  'TO_FARM',
        notes:              `زيادة دفع من عندنا في عملية البيع رقم ${sequence_number} — ${surplus - old_balance_paid} جنيه لينا عليهم`,
        payment_method,
        safe_id
      }, { transaction: dbTransaction });
    }

    await dbTransaction.commit();

    // ── Fetch full result ────────────────────────────────────────────────────

    const result = await FarmTransaction.findByPk(farmTransaction.id, {
      include: [
        { model: Farm,        as: 'farm',         attributes: ['id', 'name', 'current_balance'] },
        { model: ChickenType, as: 'chicken_type', attributes: ['id', 'name'] },
        { model: Vehicle,     as: 'vehicle',      attributes: ['id', 'name', 'plate_number'] }
      ]
    });

    return res.status(201).json({
      success: true,
      message: 'Farm loading recorded successfully',
      data: {
        transaction: result,
        balance_info: {
          farm_id:           balanceInfo.farm_id,
          farm_name:         balanceInfo.farm_name,
          previous_balance,
          changes: {
            old_balance_paid,
            old_balance_direction: debtPayment?.payment_direction || null,
            debt_payment_impact,
            surplus,
            used_credit,
            new_transaction_debt:  final_remaining_amount,
            subtotal_amount,
            discount_amount,
            net_change:            total_balance_change
          },
          new_balance:       balanceInfo.new_balance,
          balance_type:      balanceInfo.new_type,
          direction_changed: balanceInfo.direction_changed,
          display_balance:   balanceInfo.display_balance,
          ...(balanceInfo.direction_changed && {
            alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
          })
        },
        ...(debtPayment && {
          debt_payment: {
            id:          debtPayment.id,
            amount:      debtPayment.amount,
            direction:   debtPayment.payment_direction,
            date:        debtPayment.payment_date,
            description: debtPayment.displayDescription
          }
        })
      }
    });

  } catch (error) {
    if (!dbTransaction.finished) await dbTransaction.rollback();
    console.error('Error recording farm loading:', error);
    return res.status(500).json({
      success: false,
      message: 'Error recording farm loading',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// exports.recordTransportLoss = async (req, res) => {
//     const dbTransaction = await sequelize.transaction();
//   try {
// const { vehicle_id, chicken_type_id, dead_weight, price_per_kg, location } = req.body;

// if (!vehicle_id) return res.status(400).json({ success: false, message: 'vehicle_id is required' });

// const vehicleAssignment = await VehicleOperation.findOne({
//   where: { daily_operation_id: req.params.id, vehicle_id, status: 'ACTIVE' }
// });

// if (!vehicleAssignment) return res.status(400).json({
//   success: false,
//   message: `Vehicle ${vehicle_id} is not assigned to this operation`
// });

// const loss_amount = dead_weight * price_per_kg;

// const loss = await TransportLoss.create({
//   daily_operation_id: req.params.id,
//   vehicle_id,
//   vehicle_operation_id: vehicleAssignment.id,
//   chicken_type_id,
//   dead_weight,
//   price_per_kg,
//   loss_amount,
//   location
// }, { transaction: dbTransaction });
//     await dbTransaction.commit();

//     res.status(201).json({
//       success: true,
//       data: loss
//     });
//   } catch (error) {
//     await dbTransaction.rollback();
//     res.status(500).json({
//       success: false,
//       message: 'Error recording transport loss',
//       error: error.message
//     });
//   }
// };
// Record daily cost
// exports.recordDailyCost = async (req, res) => {
//   try {
//     const operation = await DailyOperation.findByPk(req.params.id);

//     if (!operation || operation.status === 'CLOSED') {
//       return res.status(400).json({
//         success: false,
//         message: 'العملية غير موجودة أو مغلقة بالفعل'
//       });
//     }

//     const cost = await DailyCost.create({
//       daily_operation_id: req.params.id,
//       ...req.body
//     });

//     res.status(201).json({
//       success: true,
//       data: cost
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error recording cost'
//     });
//   }
// };


exports.recordTransportLoss = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  
  try {
    const { 
      vehicle_id, 
      chicken_type_id, 
      dead_weight, 
      price_per_kg, 
      location,
      farm_id,  // ✅ OPTIONAL: Farm responsible for loss
      notes
    } = req.body;

    // Validate required fields
    if (!vehicle_id) {
      await dbTransaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'vehicle_id is required' 
      });
    }

    if (!chicken_type_id || !dead_weight || !price_per_kg) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'chicken_type_id, dead_weight, and price_per_kg are required'
      });
    }

    // Verify vehicle is assigned to this operation
    const vehicleAssignment = await VehicleOperation.findOne({
      where: { 
        daily_operation_id: req.params.id, 
        vehicle_id, 
        status: 'ACTIVE' 
      },
      transaction: dbTransaction
    });

    if (!vehicleAssignment) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Vehicle ${vehicle_id} is not assigned to this operation or is not active`
      });
    }

    // Calculate loss amount
    const loss_amount = parseFloat(dead_weight) * parseFloat(price_per_kg);

    // ✅ If farm_id provided, verify farm exists and adjust balance
    let farmBalanceInfo = null;
 
    if (farm_id) {
      const farm = await Farm.findByPk(farm_id, { transaction: dbTransaction });
      
      if (!farm) {
        await dbTransaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Farm with id ${farm_id} not found`
        });
      }

      // ✅ INCREASE FARM BALANCE (Farm owes us for the loss)
      // Positive balance = Farm owes us (RECEIVABLE)
      farmBalanceInfo = await farm.updateBalance(loss_amount, dbTransaction);
     }
      
    // Create transport loss record
    const loss = await TransportLoss.create({
      daily_operation_id: req.params.id,
      vehicle_id,
      vehicle_operation_id: vehicleAssignment.id,
      chicken_type_id,
      farm_id: farm_id || null,
      dead_weight, 
      price_per_kg,
      loss_amount,
      location,
       notes
    }, { transaction: dbTransaction });

        await logTransaction({
        transaction_type:     'LOSS',
        direction:            'OUT',
        amount:               loss_amount,
        safe_id:null, // This is a value loss, not a cash payout from safe
        reference_type:       'TransportLoss',
        reference_id:         loss.id,
        daily_operation_id:   req.params.id,
        performed_by_user_id: req.user ? req.user.id : null,
        payment_method:null, 
        notes:   `تسجيل قيمة النافق اثناء النقل`
      }, dbTransaction);

    await dbTransaction.commit();

    // Prepare response
    const response = {
      success: true,
      message: 'Transport loss recorded successfully',
      data: {
        loss: {
          id: loss.id,
          daily_operation_id: loss.daily_operation_id,
          vehicle_id: loss.vehicle_id,
          chicken_type_id: loss.chicken_type_id,
          farm_id: loss.farm_id,
          dead_weight: parseFloat(loss.dead_weight),
          price_per_kg: parseFloat(loss.price_per_kg),
          loss_amount: parseFloat(loss.loss_amount),
          location: loss.location,
           recorded_at: loss.recorded_at
        }
      }
    };

    // ✅ Include farm balance update info if applicable
    if (farmBalanceInfo) {
      response.data.farm_balance_update = farmBalanceInfo;
      response.message += ` - Farm balance updated: ${farmBalanceInfo.display_balance}`;
    }

    res.status(201).json(response);

  } catch (error) {
    await dbTransaction.rollback();
    console.error('Error recording transport loss:', error);
    res.status(500).json({
      success: false,
      message: 'Error recording transport loss',
      error: error.message
    });
  }
};

exports.recordDailyCost = async (req, res) => {
  const dbTransaction = await sequelize.transaction();

  try {
    const { 
      vehicle_id, 
      cost_category_id, 
      amount, 
      description,
      paid_amount = 0,
      payment_method = 'CASH',
      safe_id, 
      paid_by_person_type,
      paid_by_person_id,
      payment_source_type = 'SAFE',
      payment_source_id
    } = req.body;

    const parsedAmount = parseFloat(amount) || 0;
    const parsedPaidAmount = parseFloat(paid_amount) || 0;

    if (parsedPaidAmount < 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'المبلغ المدفوع لا يمكن أن يكون سالباً' });
    }
    
    // ✅ التأكد من ان التصنيف موجود ومتاح
    const category = await CostCategory.findByPk(cost_category_id, { transaction: dbTransaction });
    if (!category) {
      await dbTransaction.rollback();
      return res.status(404).json({ success: false, message: 'التصنيف غير موجود' });
    }

    // ✅ تحقق من العملية
    const operation = await DailyOperation.findByPk(req.params.id, { transaction: dbTransaction });
    if (!operation || operation.status === 'CLOSED') {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'العملية غير موجودة أو مغلقة بالفعل'
      });
    }

    let vehicleAssignment;
    // ✅ لو تم تمرير vehicle_id، تحقق أن المركبة مسجلة في العملية
    if (vehicle_id) {
      vehicleAssignment = await VehicleOperation.findOne({
        where: {
          daily_operation_id: req.params.id,
          vehicle_id,
          status: 'ACTIVE'
        },
        transaction: dbTransaction
      });

      if (!vehicleAssignment) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Vehicle ${vehicle_id} is not assigned to this operation`
        });
      }
    }

    // ✅ إنشاء التكلفة
    const cost = await DailyCost.create({
      daily_operation_id: req.params.id,
      vehicle_id: vehicle_id || null,
      vehicle_operation_id: vehicleAssignment ? vehicleAssignment.id : null,
      cost_category_id,
      amount: parsedAmount,
      paid_amount: parsedPaidAmount,
      description,
      paid_by_user_id:  (req.user ? req.user.id : null),
      paid_by_person_type,
      paid_by_person_id, 
      payment_method,
      safe_id: payment_source_type === 'SAFE' ? safe_id : null,
      payment_source_type,
      payment_source_id
    }, { transaction: dbTransaction });

    // ✅ Handle Payment through Unified Utility
    if (parsedPaidAmount > 0) {
      await handlePaymentSource({
        payment_source_type: payment_source_type || 'SAFE',
        payment_source_id: payment_source_id || safe_id,
        amount: parsedPaidAmount,
        direction: 'OUT',
        reference_type: 'DailyCost',
        reference_id: cost.id,
        description: description || `تكلفة: ${category.name}`,
        dbTransaction,
        recorded_by_user_id: req.user ? req.user.id : null
      });

      // ✅ Log Financial Transaction
      await logTransaction({
        transaction_type: 'EXPENSE',
        direction: 'OUT',
        amount: parsedPaidAmount,
        safe_id: (payment_source_type === 'SAFE' || !payment_source_type) ? (payment_source_id || safe_id) : null,
        reference_type: 'DailyCost',
        reference_id: cost.id,
        daily_operation_id: operation.id,
        performed_by_user_id: req.user ? req.user.id : null,
        paid_by_person_type,
        paid_by_person_id,
        payment_method, 
        notes: `دفع تكلفة: ${description || 'بدون وصف'}`
      }, dbTransaction);
    }

    // Reload to include category
    const costWithCategory = await DailyCost.findByPk(cost.id, {
      include: [
        { model: CostCategory, as: 'category' },
        { model: Vehicle, as: 'vehicle' }
      ],
      transaction: dbTransaction
    });
    const balanceInfo = await category.updateBalance(parsedPaidAmount-parsedAmount, dbTransaction); 
    console.log("balanceInfo",balanceInfo)
    await dbTransaction.commit();

    res.status(201).json({
      success: true,
      data: {
        cost: costWithCategory,
        balance_info: balanceInfo
      }
    });
  } catch (error) {
    if (dbTransaction) await dbTransaction.rollback();
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

/**
 * recordCostPayment — Record an installment payment for an existing DailyCost
 */
exports.recordCostPayment = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { id } = req.params; // Always cost_category_id now
    const {
      amount,
      payment_direction, // FROM_CATEGORY or TO_CATEGORY
      payment_date = new Date(),
      safe_id,
      payment_source_type = 'SAFE',
      payment_source_id,
      payment_method = 'CASH',
      notes,
      person_type,
      received_by_person_id,
      paid_by_person_id,
      operation_id 
    } = req.body;
    console.log("req.body",req.body);
    
    const parsedAmount = parseFloat(amount) || 0;
    if (parsedAmount <= 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'يجب أن يكون مبلغ الدفع أكبر من صفر' });
    }

    const category = await CostCategory.findByPk(id, { transaction: dbTransaction });
    if (!category) {
      await dbTransaction.rollback();
      return res.status(404).json({ success: false, message: 'فئة التكلفة غير موجودة' });
    }
    
    // Backward compatibility: map safe_id to payment_source_id if payment_source_id not provided
    const finalPaymentSourceId = payment_source_id || safe_id;
    
    // Create payment record
    const payment = await CostDebtPayment.create({
      cost_category_id: category.id,
      daily_operation_id: operation_id,
      amount: parsedAmount,
      payment_direction,
      payment_date,
      payment_method,
      payment_source_type,
      payment_source_id: finalPaymentSourceId,
      notes
    }, { transaction: dbTransaction });

    // Update Category Balance
    const balanceInfo = await category.updateBalance(payment.balanceImpact, dbTransaction);
    console.log("payment_direction",payment_direction);
    
    // Financial Logging
    const logDirection = payment_direction === 'TO_CATEGORY' ? 'OUT' : 'IN';
    const logType = payment_direction === 'TO_CATEGORY' ? 'PAID_DEPT' : 'RECEIVE_DEPT';

    // Handle Payment through Unified Utility
    await handlePaymentSource({
      payment_source_type,
      payment_source_id: finalPaymentSourceId,
      amount: parsedAmount,
      direction: logDirection,
      reference_type: 'CostDebtPayment',
      reference_id: payment.id,
      description: notes || `دفعة لحساب فئة تكلفة ${category.name}`,
      dbTransaction,
      recorded_by_user_id: req.user ? req.user.id : null
    });
 
    await logTransaction({
      transaction_type: logType,
      direction: logDirection,
      amount: parsedAmount,
      payment_source_type,
      payment_source_id: finalPaymentSourceId,
      reference_type: 'CostDebtPayment',
      reference_id: payment.id,
      daily_operation_id: operation_id,
      performed_by_user_id: req.user ? req.user.id : null,
      [`${payment_direction === 'TO_CATEGORY' ? 'paid_by_' : 'received_by_'}person_type`]: person_type,
      paid_by_person_id,
      received_by_person_id, 
      payment_method,
      notes: notes || `دفعة لحساب فئة تكلفة ${category.name}`
    }, dbTransaction);

    await dbTransaction.commit();

    res.status(201).json({
      success: true,
      data: {
        payment,
        balance_info: balanceInfo
      }
    });

  } catch (error) {
    if (dbTransaction) await dbTransaction.rollback();
    res.status(500).json({
      success: false,
      message:error.message,
      error: error.message
    });
  }
};

/**
 * getUnpaidCosts — Returns all costs where remaining_amount > 0
 */


// exports.getUnpaidCosts = async (req, res) => {
//   try {
//     const summary = await DailyCost.findAll({
//       attributes: [
//         'cost_category_id',
//         [fn('SUM', literal('amount - paid_amount')), 'total_unpaid'],
//         [fn('SUM', col('amount')), 'total_amount'],
//         [fn('SUM', col('paid_amount')), 'total_paid'],
//       ],
//       where: literal('paid_amount < amount'),
//       include: [
//         {
//           model: CostCategory,
//           as: 'category',
//           attributes: ['id', 'name']
//         }
//       ],
//       group: ['cost_category_id', 'category.id', 'category.name'],
//       order: [[literal('total_unpaid'), 'DESC']]
//     });

//     res.json({
//       success: true,
//       count: summary.length,
//       data: summary
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error aggregating unpaid costs',
//       error: error.message
//     });
//   }
// };

exports.getUnpaidCosts = async (req, res) => {
  try {
    const result = await sequelize.query(`
      WITH category_base AS (
        SELECT id, name, current_balance
        FROM cost_categories
        WHERE current_balance != 0
      ),

      -- =========================
      -- 1. COSTS (UNPAID ONLY)
      -- =========================
      costs AS (
        SELECT 
          dc.id,
          dc.cost_category_id,
          dc.amount,
          dc.paid_amount,
          (dc.amount - dc.paid_amount) AS unpaid,
          dc.recorded_at
        FROM daily_costs dc
        WHERE dc.amount > dc.paid_amount
      ),

      ordered_costs AS (
        SELECT 
          c.*,
          SUM(unpaid) OVER (
            PARTITION BY cost_category_id
            ORDER BY recorded_at DESC
          ) AS running_unpaid
        FROM costs c
      ),

      filtered_costs AS (
        SELECT oc.*
        FROM ordered_costs oc
        JOIN category_base cb 
          ON cb.id = oc.cost_category_id
        WHERE oc.running_unpaid <= ABS(cb.current_balance)
      ),

      -- =========================
      -- 2. AGGREGATION
      -- =========================
      cost_agg AS (
        SELECT 
          cost_category_id,
          SUM(amount) AS total_amount
        FROM filtered_costs
        GROUP BY cost_category_id
      )

      -- =========================
      -- 3. FINAL SELECT
      -- =========================
      SELECT 
        cb.id AS category_id,
        cb.name,
        cb.current_balance,

        COALESCE(ca.total_amount, 0) AS total_amount,

        -- ✅ paid = total_amount - what's still owed
        COALESCE(ca.total_amount, 0) - ABS(cb.current_balance) AS total_paid,

        -- ✅ unpaid = current_balance (single source of truth)
        ABS(cb.current_balance) AS total_unpaid,

        CASE 
          WHEN cb.current_balance > 0 THEN 'RECEIVABLE'
          WHEN cb.current_balance < 0 THEN 'PAYABLE'
          ELSE 'SETTLED'
        END AS balance_type

      FROM category_base cb
      LEFT JOIN cost_agg ca 
        ON ca.cost_category_id = cb.id

      ORDER BY ABS(cb.current_balance) DESC
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating unpaid costs',
      error: error.message
    });
  }
};


// Record sale
// exports.recordSale = async (req, res) => {
//   const transaction = await sequelize.transaction();
  
//   try {
//     const operation = await DailyOperation.findByPk(req.params.id);

//     if (!operation || operation.status === 'CLOSED') {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'العملية غير موجودة أو مغلقة بالفعل'
//       });
//     }

//     const {
//       buyer_id,
//       chicken_type_id,
//       loaded_cages_weight,
//       empty_cages_weight,
//       cage_count,
//       price_per_kg,
//       paid_amount,
//       old_debt_paid = 0
//     } = req.body;

//     // Calculate net weight
//     const net_chicken_weight = loaded_cages_weight - empty_cages_weight;
//     const total_amount = net_chicken_weight * price_per_kg;
//     const remaining_amount = total_amount - paid_amount;

//     // Get sequence number
//     const count = await SaleTransaction.count({
//       where: { daily_operation_id: req.params.id }
//     });

//     const sale = await SaleTransaction.create({
//       daily_operation_id: req.params.id,
//       buyer_id,
//       chicken_type_id,
//       sequence_number: count + 1,
//       loaded_cages_weight,
//       empty_cages_weight,
//       cage_count,
//       net_chicken_weight,
//       price_per_kg,
//       total_amount,
//       paid_amount,
//       remaining_amount,
//       old_debt_paid
//     }, { transaction });

//     // Update buyer debt
//     const buyer = await Buyer.findByPk(buyer_id);
//     const newDebt = parseFloat(buyer.current_balance) - parseFloat(old_debt_paid) + parseFloat(remaining_amount);
//     await buyer.update({
//       current_balance: newDebt
//     }, { transaction });

//     await transaction.commit();

//     res.status(201).json({
//       success: true,
//       data: sale
//     });
//   } catch (error) {
//     await transaction.rollback();
//     res.status(500).json({
//       success: false,
//       message: 'Error recording sale',
//       error: error.message
//     });
//   }
// };
// exports.recordSale = async (req, res) => {
//   const transaction = await sequelize.transaction();

//   try {
//     const operation = await DailyOperation.findByPk(req.params.id);

//     if (!operation || operation.status === 'CLOSED') {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'العملية غير موجودة أو مغلقة بالفعل'
//       });
//     }

//     const {
//       vehicle_id,       // ✅ جديد
//       buyer_id,
//       chicken_type_id,
//       loaded_cages_weight,
//       empty_cages_weight,
//       cage_count,
//       price_per_kg,
//       paid_amount,
//       old_debt_paid = 0
//     } = req.body;

//     // ✅ تحقق من وجود vehicle_id
//     if (!vehicle_id) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'vehicle_id is required'
//       });
//     }

//     // ✅ تحقق من أن المركبة مسجلة وفعالة للعملية
//     const vehicleAssignment = await VehicleOperation.findOne({
//       where: {
//         daily_operation_id: req.params.id,
//         vehicle_id,
//         status: 'ACTIVE'
//       }
//     });

//     if (!vehicleAssignment) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Vehicle ${vehicle_id} is not assigned to this operation`
//       });
//     }

//     // حساب الوزن الصافي والمبالغ
//     const net_chicken_weight = loaded_cages_weight - empty_cages_weight;
//     const total_amount = net_chicken_weight * price_per_kg;
//     const remaining_amount = total_amount - paid_amount;

//     // تسلسل المعاملات لكل عملية ومركبة
//     const lastTransaction = await SaleTransaction.findOne({
//       where: { daily_operation_id: req.params.id, vehicle_id },
//       order: [['sequence_number', 'DESC']]
//     });
//     const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

//     // إنشاء المعاملة
//     const sale = await SaleTransaction.create({
//       daily_operation_id: req.params.id,
//       vehicle_id,         // ✅ جديد
//       buyer_id,
//       vehicle_operation_id: vehicleAssignment.id,
//       chicken_type_id,
//       sequence_number,
//       loaded_cages_weight,
//       empty_cages_weight,
//       cage_count,
//       net_chicken_weight,
//       price_per_kg,
//       total_amount,
//       paid_amount,
//       remaining_amount,
//       old_debt_paid
//     }, { transaction });

//     // تحديث ديون المشتري
//     const buyer = await Buyer.findByPk(buyer_id);
//     const newDebt = parseFloat(buyer.current_balance) - parseFloat(old_debt_paid) + parseFloat(remaining_amount);
//     await buyer.update({ current_balance: newDebt }, { transaction });

//     await transaction.commit();

//     res.status(201).json({
//       success: true,
//       data: sale
//     });
//   } catch (error) {
//     await transaction.rollback();
//     res.status(500).json({
//       success: false,
//       message: 'Error recording sale',
//       error: error.message
//     });
//   }
// };
// exports.recordSale = async (req, res) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const { id } = req.params;
//     const {
//       vehicle_id,
//       buyer_id,
//       chicken_type_id,
//       loaded_cages_weight,
//       empty_cages_weight,
//       cage_count,
//       price_per_kg,
//       paid_amount = 0,
//       old_debt_paid = 0,
//       is_debt_payment_only = false  // ✅ Support debt payment only
//     } = req.body;

//     // ========================================
//     // VALIDATION
//     // ========================================
    
//     const operation = await DailyOperation.findByPk(id, { transaction: dbTransaction });

//     if (!operation) {
//       await dbTransaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Daily operation not found'
//       });
//     }

//     if (operation.status === 'CLOSED') {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Operation is already closed'
//       });
//     }

//     // Get buyer with current balance
//     const buyer = await Buyer.findByPk(buyer_id, { transaction: dbTransaction });

//     if (!buyer) {
//       await dbTransaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Buyer not found'
//       });
//     }

//     const previous_balance = parseFloat(buyer.current_balance) || 0;

//     // ========================================
//     // DEBT PAYMENT ONLY (NO SALE)
//     // ========================================

//     if (is_debt_payment_only) {
//       if (old_debt_paid <= 0) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Payment amount must be greater than 0 for debt payment'
//         });
//       }

//       // Buyer can only have positive balance (they owe us)
//       if (previous_balance <= 0) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Buyer has no outstanding debt to pay',
//           current_balance: previous_balance
//         });
//       }

//       // Validate payment doesn't exceed debt
//       if (old_debt_paid > previous_balance) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: `Payment amount (${old_debt_paid}) exceeds current debt (${previous_balance})`,
//           current_balance: previous_balance,
//           max_payment: previous_balance
//         });
//       }

//       // Create debt payment record
//       const debtPayment = await BuyerDebtPayment.create({
//         buyer_id,
//         daily_operation_id: id,
//         amount: old_debt_paid,
//         payment_direction: 'FROM_BUYER',  // Always FROM_BUYER
//         // payment_date: operation.operation_date,
//         notes: `Buyer payment toward debt of ${previous_balance.toFixed(2)} EGP`
//       }, { transaction: dbTransaction });

//       // Update buyer balance (reduce their debt)
//       const new_balance = previous_balance - old_debt_paid;
//       await buyer.update({ current_balance: new_balance }, { transaction: dbTransaction });

//       await dbTransaction.commit();

//       return res.status(201).json({
//         success: true,
//         message: 'Debt payment recorded successfully',
//         data: {
//           payment: {
//             id: debtPayment.id,
//             amount: debtPayment.amount,
//             date: debtPayment.payment_date
//           },
//           balance_info: {
//             buyer_id: buyer.id,
//             buyer_name: buyer.name,
//             previous_balance: previous_balance,
//             payment_amount: old_debt_paid,
//             new_balance: new_balance,
//             is_settled: new_balance === 0
//           }
//         }
//       });
//     }

//     // ========================================
//     // SALE TRANSACTION (NORMAL FLOW)
//     // ========================================

//     if (!vehicle_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'vehicle_id is required for sale'
//       });
//     }

//     if (!chicken_type_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'chicken_type_id is required for sale'
//       });
//     }

//     // Validate vehicle assignment
//     const vehicleAssignment = await VehicleOperation.findOne({
//       where: {
//         daily_operation_id: id,
//         vehicle_id,
//         status: 'ACTIVE'
//       },
//       transaction: dbTransaction
//     });

//     if (!vehicleAssignment) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Vehicle ${vehicle_id} is not assigned to this operation`
//       });
//     }

//     // ========================================
//     // WEIGHT & PRICING CALCULATION
//     // ========================================

//     const net_chicken_weight = loaded_cages_weight - empty_cages_weight;
    
//     if (net_chicken_weight <= 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Net weight must be positive'
//       });
//     }

//     const total_amount = net_chicken_weight * price_per_kg;
//     const remaining_amount = total_amount - paid_amount;

//     // Get next sequence number
//     const lastTransaction = await SaleTransaction.findOne({
//       where: { daily_operation_id: id, vehicle_id },
//       order: [['sequence_number', 'DESC']],
//       transaction: dbTransaction
//     });

//     const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

//     // ========================================
//     // HANDLE OLD BALANCE PAYMENT (IF ANY)
//     // ========================================

//     let debtPaymentRecord = null;
    
//     if (old_debt_paid > 0) {
//       // Buyer can only have positive balance (they owe us)
//       if (previous_balance <= 0) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Cannot pay old balance: Buyer has no outstanding debt',
//           current_balance: previous_balance
//         });
//       }

//       // Validate payment doesn't exceed debt
//       if (old_debt_paid > previous_balance) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: `Old balance payment (${old_debt_paid}) exceeds current debt (${previous_balance})`,
//           current_balance: previous_balance,
//           max_payment: previous_balance
//         });
//       }

//       // // Create debt payment record
//       // debtPaymentRecord = await BuyerDebtPayment.create({
//       //   buyer_id,
//       //   daily_operation_id: id,
//       //   amount: old_debt_paid,
//       //   payment_direction: 'FROM_BUYER',
//       //   // payment_date: operation.operation_date,
//       //   notes: `Payment during sale transaction #${sequence_number}`
//       // }, { transaction: dbTransaction });
//     }

//     // ========================================
//     // CREATE SALE TRANSACTION
//     // ========================================

//     const sale = await SaleTransaction.create({
//       daily_operation_id: id,
//       vehicle_id,
//       buyer_id,
//       vehicle_operation_id: vehicleAssignment.id,
//       chicken_type_id,
//       sequence_number,
//       loaded_cages_weight,
//       empty_cages_weight,
//       cage_count,
//       net_chicken_weight,
//       price_per_kg,
//       total_amount,
//       paid_amount,
//       remaining_amount,
//       old_debt_paid: old_debt_paid
//     }, { transaction: dbTransaction });
// if (old_debt_paid > 0) {
//   debtPaymentRecord = await BuyerDebtPayment.create({
//     buyer_id,
//     daily_operation_id: id,
//     amount: old_debt_paid,
//     payment_direction: 'FROM_BUYER',
//     createdAt: sale.transaction_time, // ✅ نفس توقيت البيع
//     notes: `الدفع أثناء معاملة البيع برقم ${sequence_number} في نفس اليوم ونفس المركبه`
//   }, { transaction: dbTransaction });
// }

//     // ========================================
//     // UPDATE BUYER BALANCE
//     // ========================================

//     // Balance calculation:
//     // - Subtract old_debt_paid (buyer pays old debt)
//     // + Add remaining_amount (new debt created)
//     const balance_change = remaining_amount - old_debt_paid;
//     const new_balance = previous_balance + balance_change;

//     await buyer.update({ current_balance: new_balance }, { transaction: dbTransaction });

//     // ========================================
//     // COMMIT TRANSACTION
//     // ========================================

//     await dbTransaction.commit();

//     // ========================================
//     // FETCH COMPLETE RESULT
//     // ========================================

//     const result = await SaleTransaction.findByPk(sale.id, {
//       include: [
//         { 
//           model: Buyer, 
//           as: 'buyer',
//           attributes: ['id', 'name', 'current_balance']
//         },
//         { 
//           model: ChickenType, 
//           as: 'chicken_type',
//           attributes: ['id', 'name']
//         },
//         { 
//           model: Vehicle, 
//           as: 'vehicle',
//           attributes: ['id', 'name', 'plate_number']
//         }
//       ]
//     });

//     // ========================================
//     // RESPONSE
//     // ========================================

//     res.status(201).json({
//       success: true,
//       message: 'Sale recorded successfully',
//       data: {
//         transaction: result,
//         balance_info: {
//           buyer_id: buyer.id,
//           buyer_name: buyer.name,
//           previous_balance: previous_balance,
//           changes: {
//             old_debt_paid: old_debt_paid,
//             new_transaction_debt: remaining_amount,
//             net_change: balance_change
//           },
//           new_balance: new_balance,
//           is_settled: new_balance === 0
//         },
//         ...(debtPaymentRecord && {
//           debt_payment: {
//             id: debtPaymentRecord.id,
//             amount: debtPaymentRecord.amount,
//             date: debtPaymentRecord.payment_date,
//             description: `Received ${Number(debtPaymentRecord.amount).toFixed(2)} EGP from buyer`
//           }
//         })
//       }
//     });

//   } catch (error) {
//     if (!dbTransaction.finished) {
//       await dbTransaction.rollback();
//     }
    
//     console.error('Error recording sale:', error);
    
//     res.status(500).json({
//       success: false,
//       message: 'Error recording sale',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };
// exports.recordSale = async (req, res) => {
//   const dbTransaction = await sequelize.transaction();

//   try {
//     const { id } = req.params; // daily_operation_id

//     const {
//       vehicle_id,
//       buyer_id,
//       chicken_type_id,

//       // NEW: array of gross weight readings
//       weights,                        // number[]

//       // Deductions
//       empty_cages_weight  = 0,
//       dead_weight         = 0,

//       // Pricing
//       price_per_kg,
//       discount_amount     = 0,

//       // Payment
//       paid_amount         = 0,

//       // Debt-only flow (unchanged)
//       old_debt_paid       = 0,
//       is_debt_payment_only = false
//     } = req.body;

//     // ========================================================================
//     // STEP 1 — Validate the daily operation
//     // ========================================================================

//     const operation = await DailyOperation.findByPk(id, {
//       transaction: dbTransaction
//     });

//     if (!operation) {
//       await dbTransaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Daily operation not found'
//       });
//     }

//     if (operation.status === 'CLOSED') {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Operation is already closed'
//       });
//     }

//     // ========================================================================
//     // STEP 2 — Load buyer and capture previous balance
//     // ========================================================================

//     const buyer = await Buyer.findByPk(buyer_id, {
//       transaction: dbTransaction
//     });

//     if (!buyer) {
//       await dbTransaction.rollback();
//       return res.status(404).json({
//         success: false,
//         message: 'Buyer not found'
//       });
//     }

//     const previous_balance = round2(parseFloat(buyer.current_balance) || 0);

//     // ========================================================================
//     // STEP 3 — DEBT PAYMENT ONLY (unchanged from original)
//     // ========================================================================

//     if (is_debt_payment_only) {
//       if (old_debt_paid <= 0) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Payment amount must be greater than 0 for debt payment'
//         });
//       }

//       if (previous_balance <= 0) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Buyer has no outstanding debt to pay',
//           current_balance: previous_balance
//         });
//       }

//       if (old_debt_paid > previous_balance) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: `Payment amount (${old_debt_paid}) exceeds current debt (${previous_balance})`,
//           current_balance: previous_balance,
//           max_payment: previous_balance
//         });
//       }

//       const debtPayment = await BuyerDebtPayment.create({
//         buyer_id,
//         daily_operation_id: id,
//         amount: old_debt_paid,
//         payment_direction: 'FROM_BUYER',
//         notes: `Buyer payment toward debt of ${previous_balance.toFixed(2)} EGP`
//       }, { transaction: dbTransaction });

//       const new_balance = round2(previous_balance - old_debt_paid);
//       await buyer.update({ current_balance: new_balance }, { transaction: dbTransaction });

//       await dbTransaction.commit();

//       return res.status(201).json({
//         success: true,
//         message: 'Debt payment recorded successfully',
//         data: {
//           payment: {
//             id: debtPayment.id,
//             amount: debtPayment.amount,
//             date: debtPayment.payment_date
//           },
//           balance_info: {
//             buyer_id: buyer.id,
//             buyer_name: buyer.name,
//             previous_balance,
//             payment_amount: old_debt_paid,
//             new_balance,
//             is_settled: new_balance === 0
//           }
//         }
//       });
//     }

//     // ========================================================================
//     // STEP 4 — Validate sale-specific inputs
//     // ========================================================================

//     if (!vehicle_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'vehicle_id is required for sale'
//       });
//     }

//     if (!chicken_type_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'chicken_type_id is required for sale'
//       });
//     }

//     // Validate weights array
//     if (!Array.isArray(weights) || weights.length === 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'weights must be a non-empty array of scale readings'
//       });
//     }

//     const parsedWeights = weights.map(Number);

//     if (parsedWeights.some((w) => isNaN(w) || w <= 0)) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'Each weight reading must be a positive number'
//       });
//     }

//     const parsedEmptyCagesWeight = round2(parseFloat(empty_cages_weight) || 0);
//     const parsedDeadWeight       = round2(parseFloat(dead_weight)        || 0);
//     const parsedPricePerKg       = round2(parseFloat(price_per_kg)       || 0);
//     const parsedDiscountAmount   = round2(parseFloat(discount_amount)    || 0);
//     const parsedPaidAmount       = round2(parseFloat(paid_amount)        || 0);

//     if (parsedPricePerKg <= 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'price_per_kg must be greater than 0'
//       });
//     }

//     if (parsedPaidAmount < 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'paid_amount cannot be negative'
//       });
//     }

//     if (parsedEmptyCagesWeight < 0 || parsedDeadWeight < 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'empty_cages_weight and dead_weight cannot be negative'
//       });
//     }

//     if (parsedDiscountAmount < 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'discount_amount cannot be negative'
//       });
//     }

//     // ========================================================================
//     // STEP 5 — Validate vehicle assignment (unchanged)
//     // ========================================================================

//     const vehicleAssignment = await VehicleOperation.findOne({
//       where: {
//         daily_operation_id: id,
//         vehicle_id,
//         status: 'ACTIVE'
//       },
//       transaction: dbTransaction
//     });

//     if (!vehicleAssignment) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Vehicle ${vehicle_id} is not assigned to this operation`
//       });
//     }

//     // ========================================================================
//     // STEP 6 — Weight & pricing calculations
//     // ========================================================================

//     // 6a. Gross total weight = sum of all readings
//     const gross_total_weight = round2(
//       parsedWeights.reduce((sum, w) => sum + w, 0)
//     );

//     // 6b. Total deductions = dead chickens + empty cages
//     const total_deductions = round2(parsedDeadWeight + parsedEmptyCagesWeight);

//     // 6c. Validate: deductions must not exceed gross weight
//     if (total_deductions >= gross_total_weight) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Total deductions (${total_deductions} kg) cannot equal or exceed gross weight (${gross_total_weight} kg)`,
//         gross_total_weight,
//         total_deductions
//       });
//     }

//     // 6d. Net weight
//     const net_weight = round2(gross_total_weight - total_deductions);

//     // 6e. Subtotal
//     const subtotal_amount = round2(net_weight * parsedPricePerKg);

//     // 6f. Validate discount
//     if (parsedDiscountAmount > subtotal_amount) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `discount_amount (${parsedDiscountAmount}) cannot exceed subtotal_amount (${subtotal_amount})`,
//         subtotal_amount
//       });
//     }

//     // 6g. Final amount = what buyer actually owes for this sale
//     const final_amount = round2(subtotal_amount - parsedDiscountAmount);

//     // ========================================================================
//     // STEP 7 — Payment & debt logic
//     //
//     //   Case A: paid_amount <= final_amount
//     //     → Buyer still owes the difference (new debt)
//     //     → debt_applied_amount = 0
//     //
//     //   Case B: paid_amount > final_amount
//     //     → Sale is fully covered
//     //     → Surplus automatically reduces buyer's previous debt
//     //     → debt_applied_amount = surplus (capped at previous_balance)
//     // ========================================================================

//     let debt_applied_amount = 0;
//     let remaining_sale      = 0;

//     if (parsedPaidAmount > final_amount) {
//       // Surplus beyond this sale's value
//       const surplus = round2(parsedPaidAmount - final_amount);
//       // Cap at actual outstanding debt — don't create a credit balance
//       debt_applied_amount = round2(Math.min(surplus, previous_balance));
//       remaining_sale = 0;
//     } else {
//       debt_applied_amount = 0;
//       remaining_sale = round2(final_amount - parsedPaidAmount);
//     }

//     // New buyer balance:
//     //   - Add remaining_sale  (new debt from this transaction)
//     //   - Subtract debt_applied_amount (old debt paid off by overpayment)
//     const new_balance = round2(
//       previous_balance + remaining_sale - debt_applied_amount
//     );

//     // ========================================================================
//     // STEP 8 — Get next sequence number (unchanged logic)
//     // ========================================================================

//     const lastTransaction = await SaleTransaction.findOne({
//       where: { daily_operation_id: id, vehicle_id },
//       order: [['sequence_number', 'DESC']],
//       transaction: dbTransaction
//     });

//     const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

//     // ========================================================================
//     // STEP 9 — Create SaleTransaction record
//     // ========================================================================

//     const sale = await SaleTransaction.create({
//       daily_operation_id:  id,
//       vehicle_id,
//       vehicle_operation_id: vehicleAssignment.id,
//       buyer_id,
//       chicken_type_id,
//       sequence_number,

//       // Weight fields
//       gross_total_weight,
//       dead_weight:         parsedDeadWeight,
//       empty_cages_weight:  parsedEmptyCagesWeight,
//       total_deductions,
//       net_weight,

//       // Pricing fields
//       price_per_kg:       parsedPricePerKg,
//       subtotal_amount,
//       discount_amount:    parsedDiscountAmount,
//       final_amount,

//       // Payment fields
//       paid_amount:         parsedPaidAmount,
//       debt_applied_amount,

//       // Backward-compatible aliases
//       total_amount:        final_amount,
//       remaining_amount:    remaining_sale
//     }, { transaction: dbTransaction });

//     // ========================================================================
//     // STEP 10 — Create SaleWeight rows (one per reading)
//     // ========================================================================

//     const saleWeightRows = parsedWeights.map((weight_value, index) => ({
//       sale_transaction_id: sale.id,
//       weight_number:       index + 1,
//       weight_value:        round2(weight_value)
//     }));

//     await SaleWeight.bulkCreate(saleWeightRows, { transaction: dbTransaction });

//     // ========================================================================
//     // STEP 11 — Record BuyerDebtPayment if debt was auto-applied
//     // ========================================================================

//     let debtPaymentRecord = null;

//     if (debt_applied_amount > 0) {
//       debtPaymentRecord = await BuyerDebtPayment.create({
//         buyer_id,
//         daily_operation_id: id,
//         amount: debt_applied_amount,
//         payment_direction: 'FROM_BUYER',
//         createdAt: sale.transaction_time,
//         notes: `Auto-applied surplus from sale #${sequence_number} toward existing debt`
//       }, { transaction: dbTransaction });
//     }

//     // ========================================================================
//     // STEP 12 — Update buyer balance
//     // ========================================================================

//     await buyer.update({ current_balance: new_balance }, { transaction: dbTransaction });

//     // ========================================================================
//     // STEP 13 — Commit
//     // ========================================================================

//     await dbTransaction.commit();

//     // ========================================================================
//     // STEP 14 — Fetch full result for response (outside transaction)
//     // ========================================================================

//     const result = await SaleTransaction.findByPk(sale.id, {
//       include: [
//         {
//           model: Buyer,
//           as: 'buyer',
//           attributes: ['id', 'name', 'current_balance']
//         },
//         {
//           model: ChickenType,
//           as: 'chicken_type',
//           attributes: ['id', 'name']
//         },
//         {
//           model: Vehicle,
//           as: 'vehicle',
//           attributes: ['id', 'name', 'plate_number']
//         },
//         {
//           model: SaleWeight,
//           as: 'weights',
//           attributes: ['weight_number', 'weight_value'],
//           order: [['weight_number', 'ASC']]
//         }
//       ]
//     });

//     // ========================================================================
//     // STEP 15 — Response
//     // ========================================================================

//     return res.status(201).json({
//       success: true,
//       message: 'Sale recorded successfully',
//       data: {
//         transaction: result,

//         // Calculation breakdown — useful for the frontend to display
//         calculation: {
//           weights:             parsedWeights,
//           gross_total_weight,
//           deductions: {
//             dead_weight:         parsedDeadWeight,
//             empty_cages_weight:  parsedEmptyCagesWeight,
//             total_deductions
//           },
//           net_weight,
//           price_per_kg:        parsedPricePerKg,
//           subtotal_amount,
//           discount_amount:     parsedDiscountAmount,
//           final_amount
//         },

//         payment: {
//           paid_amount:         parsedPaidAmount,
//           covered_sale:        final_amount,
//           debt_applied:        debt_applied_amount,
//           remaining_on_sale:   remaining_sale
//         },

//         balance_info: {
//           buyer_id:           buyer.id,
//           buyer_name:         buyer.name,
//           previous_balance,
//           changes: {
//             new_sale_debt:      remaining_sale,
//             debt_auto_paid:     debt_applied_amount
//           },
//           new_balance,
//           is_settled: new_balance === 0
//         },

//         ...(debtPaymentRecord && {
//           debt_payment: {
//             id:          debtPaymentRecord.id,
//             amount:      debtPaymentRecord.amount,
//             date:        debtPaymentRecord.payment_date,
//             description: `Auto-applied ${Number(debtPaymentRecord.amount).toFixed(2)} EGP from overpayment`
//           }
//         })
//       }
//     });

//   } catch (error) {
//     if (dbTransaction && !dbTransaction.finished) {
//       await dbTransaction.rollback();
//     }

//     console.error('Error recording sale:', error);

//     return res.status(500).json({
//       success: false,
//       message: 'Error recording sale',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };
/**
 * recordSale — CORRECTED BALANCE LOGIC
 * ─────────────────────────────────────
 * Balance semantics:
 *   current_balance > 0  →  Buyer owes us        (RECEIVABLE)
 *   current_balance < 0  →  We owe buyer          (CREDIT)
 *   current_balance = 0  →  Settled
 *
 * BUYER formula (INVERSE of Farm):
 *   total_balance_change = debt_payment_impact + used_credit + final_remaining - surplus
 *
 * Why inverse:
 *   Farm:  remaining → we owe farm  → balance DOWN  (-remaining)
 *   Buyer: remaining → buyer owes us → balance UP   (+remaining)
 *
 *   Farm:  surplus → farm owes us   → balance UP   (+surplus)
 *   Buyer: surplus → we owe buyer   → balance DOWN (-surplus)
 *
 * Verification:
 *   Sell 100, pay  60 → remaining=40, surplus=0  → change=+40 ✅ buyer owes us 40
 *   Sell 100, pay 150 → remaining=0,  surplus=50 → change=-50 ✅ we owe buyer 50
 *   Sell 100, pay 100 → remaining=0,  surplus=0  → change=0   ✅ settled
 */

// exports.recordSale = async (req, res) => {
//   const dbTransaction = await sequelize.transaction();
 
//   try {
//     const { id } = req.params; // daily_operation_id
 
//     const {
//       vehicle_id,
//       buyer_id,
//       chicken_type_id,
//       weights,                          // number[]
//       empty_cages_weight  = 0,
//       dead_weight         = 0,
//       price_per_kg,
//       discount_amount     = 0,
//       paid_amount         = 0,
//       old_balance_paid    = 0,          // renamed from old_debt_paid
//       is_debt_payment_only = false
//     } = req.body;
 
//     // ========================================================================
//     // STEP 1 — Validate daily operation
//     // ========================================================================
 
//     const operation = await DailyOperation.findByPk(id, { transaction: dbTransaction });
 
//     if (!operation) {
//       await dbTransaction.rollback();
//       return res.status(404).json({ success: false, message: 'Daily operation not found' });
//     }
 
//     if (operation.status === 'CLOSED') {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'Operation is already closed' });
//     }
 
//     // ========================================================================
//     // STEP 2 — Load buyer and capture previous balance
//     // ========================================================================
 
//     const buyer = await Buyer.findByPk(buyer_id, { transaction: dbTransaction });
 
//     if (!buyer) {
//       await dbTransaction.rollback();
//       return res.status(404).json({ success: false, message: 'Buyer not found' });
//     }
 
//     const previous_balance = round2(parseFloat(buyer.current_balance) || 0);
 
//     // ========================================================================
//     // STEP 3 — DEBT PAYMENT ONLY
//     //
//     // FROM_BUYER: buyer pays their receivable  (balance > 0) → -amount
//     // TO_BUYER:   we pay buyer's credit        (balance < 0) → +amount
//     // ========================================================================
 
//     if (is_debt_payment_only) {
//       if (old_balance_paid <= 0) {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Payment amount must be greater than 0 for balance payment'
//         });
//       }
 
//       let payment_direction;
//       let payment_description;
 
//       if (previous_balance > 0) {
//         payment_direction   = 'FROM_BUYER';
//         payment_description = 'الدفع من المشتري لسداد الرصيد المستحق';
 
//         // if (old_balance_paid > previous_balance) {
//         //   await dbTransaction.rollback();
//         //   return res.status(400).json({
//         //     success: false,
//         //     message: `Payment amount (${old_balance_paid}) exceeds current balance (${previous_balance})`,
//         //     current_balance: previous_balance,
//         //     max_payment: previous_balance
//         //   });
//         // }
 
//       } else if (previous_balance < 0) {
//         payment_direction   = 'TO_BUYER';
//         payment_description = 'دفع للمشتري لسداد الرصيد الدائن';
 
//         // if (old_balance_paid > Math.abs(previous_balance)) {
//         //   await dbTransaction.rollback();
//         //   return res.status(400).json({
//         //     success: false,
//         //     message: `Payment amount (${old_balance_paid}) exceeds credit owed to buyer (${Math.abs(previous_balance)})`,
//         //     current_balance: previous_balance,
//         //     max_payment: Math.abs(previous_balance)
//         //   });
//         // }
 
//       } else {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Cannot pay old balance: No outstanding balance exists',
//           current_balance: 0
//         });
//       }
 
//       const debtPayment = await BuyerDebtPayment.create({
//         buyer_id,
//         daily_operation_id: id,
//         amount:             old_balance_paid,
//         payment_direction,
//         notes:              payment_description
//       }, { transaction: dbTransaction });
 
//       // FROM_BUYER → balanceImpact = -amount ✅ reduces positive balance
//       // TO_BUYER   → balanceImpact = +amount ✅ reduces negative balance toward zero
//       const balanceInfo = await buyer.updateBalance(
//         debtPayment.balanceImpact,
//         dbTransaction
//       );
 
//       await dbTransaction.commit();
 
//       return res.status(201).json({
//         success: true,
//         message: 'Balance payment recorded successfully',
//         data: {
//           payment: {
//             id:          debtPayment.id,
//             amount:      debtPayment.amount,
//             direction:   debtPayment.payment_direction,
//             date:        debtPayment.payment_date,
//             description: debtPayment.displayDescription
//           },
//           balance_info: {
//             buyer_id:          balanceInfo.buyer_id,
//             buyer_name:        balanceInfo.buyer_name,
//             previous_balance,
//             payment_amount:    old_balance_paid,
//             payment_direction,
//             new_balance:       balanceInfo.new_balance,
//             balance_type:      balanceInfo.new_type,
//             direction_changed: balanceInfo.direction_changed,
//             display_balance:   balanceInfo.display_balance,
//             ...(balanceInfo.direction_changed && {
//               alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
//             })
//           }
//         }
//       });
//     }
 
//     // ========================================================================
//     // STEP 4 — Validate sale inputs
//     // ========================================================================
 
//     if (!vehicle_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'vehicle_id is required for sale' });
//     }
 
//     if (!chicken_type_id) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'chicken_type_id is required for sale' });
//     }
 
//     if (!Array.isArray(weights) || weights.length === 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'weights must be a non-empty array of scale readings'
//       });
//     }
 
//     const parsedWeights = weights.map(Number);
 
//     if (parsedWeights.some((w) => isNaN(w) || w <= 0)) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'Each weight reading must be a positive number' });
//     }
 
//     const parsedEmptyCagesWeight = round2(parseFloat(empty_cages_weight) || 0);
//     const parsedDeadWeight       = round2(parseFloat(dead_weight)        || 0);
//     const parsedPricePerKg       = round2(parseFloat(price_per_kg)       || 0);
//     const parsedDiscountAmount   = round2(parseFloat(discount_amount)    || 0);
//     const parsedPaidAmount       = round2(parseFloat(paid_amount)        || 0);
//     const parsedOldBalancePaid   = round2(parseFloat(old_balance_paid)   || 0);
 
//     if (parsedPricePerKg <= 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'price_per_kg must be greater than 0' });
//     }
 
//     if (parsedPaidAmount < 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'paid_amount cannot be negative' });
//     }
 
//     if (parsedEmptyCagesWeight < 0 || parsedDeadWeight < 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'empty_cages_weight and dead_weight cannot be negative' });
//     }
 
//     if (parsedDiscountAmount < 0) {
//       await dbTransaction.rollback();
//       return res.status(400).json({ success: false, message: 'discount_amount cannot be negative' });
//     }
 
//     // ========================================================================
//     // STEP 5 — Validate vehicle assignment
//     // ========================================================================
 
//     const vehicleAssignment = await VehicleOperation.findOne({
//       where: { daily_operation_id: id, vehicle_id, status: 'ACTIVE' },
//       transaction: dbTransaction
//     });
 
//     if (!vehicleAssignment) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Vehicle ${vehicle_id} is not assigned to this operation`
//       });
//     }
 
//     // ========================================================================
//     // STEP 6 — Weight & pricing calculations
//     // ========================================================================
 
//     const gross_total_weight = round2(parsedWeights.reduce((sum, w) => sum + w, 0));
//     const total_deductions   = round2(parsedDeadWeight + parsedEmptyCagesWeight);
 
//     if (total_deductions >= gross_total_weight) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `Total deductions (${total_deductions} kg) cannot equal or exceed gross weight (${gross_total_weight} kg)`,
//         gross_total_weight,
//         total_deductions
//       });
//     }
 
//     const net_weight      = round2(gross_total_weight - total_deductions);
//     const subtotal_amount = round2(net_weight * parsedPricePerKg);
 
//     if (parsedDiscountAmount > subtotal_amount) {
//       await dbTransaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: `discount_amount (${parsedDiscountAmount}) cannot exceed subtotal_amount (${subtotal_amount})`,
//         subtotal_amount
//       });
//     }
 
//     const final_amount = round2(subtotal_amount - parsedDiscountAmount);
 
//     // ========================================================================
//     // STEP 7 — Handle old_balance_paid
//     // ========================================================================
 
//     let debtPayment         = null;
//     let payment_direction   = null;
//     let debt_payment_impact = 0;
 
//     if (parsedOldBalancePaid > 0) {
 
//       if (previous_balance > 0) {
//         // Buyer owes us → FROM_BUYER → balanceImpact = -amount
//         payment_direction = 'FROM_BUYER';
 
//         if (parsedOldBalancePaid > previous_balance) {
//           await dbTransaction.rollback();
//           return res.status(400).json({
//             success: false,
//             message: `Old balance payment (${parsedOldBalancePaid}) exceeds current balance (${previous_balance})`,
//             current_balance: previous_balance,
//             max_payment: previous_balance
//           });
//         }
 
//       } else if (previous_balance < 0) {
//         // We owe buyer → TO_BUYER → balanceImpact = +amount
//         payment_direction = 'TO_BUYER';
 
//         if (parsedOldBalancePaid > Math.abs(previous_balance)) {
//           await dbTransaction.rollback();
//           return res.status(400).json({
//             success: false,
//             message: `Payment amount (${parsedOldBalancePaid}) exceeds credit owed to buyer (${Math.abs(previous_balance)})`,
//             current_balance: previous_balance,
//             max_payment: Math.abs(previous_balance)
//           });
//         }
 
//       } else {
//         await dbTransaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Cannot pay old balance: No outstanding balance exists',
//           current_balance: 0
//         });
//       }
//     }
 
//     // ========================================================================
//     // STEP 8 — Get next sequence number
//     // ========================================================================
 
//     const lastTransaction = await SaleTransaction.findOne({
//       where: { daily_operation_id: id, vehicle_id },
//       order: [['sequence_number', 'DESC']],
//       transaction: dbTransaction
//     });
 
//     const sequence_number = (lastTransaction?.sequence_number || 0) + 1;
 
//     // ========================================================================
//     // STEP 9 — Create BuyerDebtPayment for old_balance_paid (if any)
//     // ========================================================================
 
//     if (parsedOldBalancePaid > 0) {
//       debtPayment = await BuyerDebtPayment.create({
//         buyer_id,
//         daily_operation_id: id,
//         amount:             parsedOldBalancePaid,
//         payment_direction,
//         notes:              `الدفع أثناء عملية البيع رقم ${sequence_number}`
//       }, { transaction: dbTransaction });
 
//       debt_payment_impact = round2(parseFloat(debtPayment.balanceImpact) || 0);
//     }
 
//     // ========================================================================
//     // STEP 10 — CORRECTED Buyer balance calculation
//     //
//     // running_balance: balance after applying old_balance_paid only
//     // ─────────────────────────────────────────────────────────────
//     // surplus:  buyer paid MORE than sale → we owe them → balance DOWN  (-surplus)
//     // remaining: buyer paid LESS          → they owe us → balance UP    (+remaining)
//     // used_credit: buyer had credit (balance < 0) → auto-consumed      (+used_credit)
//     //
//     // CORRECTED formula:
//     //   total_balance_change = debt_payment_impact + used_credit + final_remaining - surplus
//     // ========================================================================
 
//     const running_balance        = round2(previous_balance + debt_payment_impact);
//     const surplus                = round2(Math.max(0, parsedPaidAmount - final_amount));
//     const gross_remaining_amount = round2(Math.max(0, final_amount - parsedPaidAmount));
 
//     // Auto-apply buyer credit (negative running_balance) to reduce remaining
//     // Credit consumed → balance goes UP (less negative / toward zero)
//     let used_credit = 0;
//     if (running_balance < 0 && gross_remaining_amount > 0) {
//       const available_credit = Math.abs(running_balance);
//       used_credit = round2(Math.min(available_credit, gross_remaining_amount));
//     }
 
//     const final_remaining_amount = round2(gross_remaining_amount - used_credit);
 
//     // ── CORRECTED formula ────────────────────────────────────────────────────
//     const total_balance_change = round2(
//       debt_payment_impact + used_credit + final_remaining_amount - surplus
//     );
 
//     console.log('\n── recordSale balance breakdown ──');
//     console.log('previous_balance:     ', previous_balance);
//     console.log('debt_payment_impact:  ', debt_payment_impact);
//     console.log('running_balance:      ', running_balance);
//     console.log('final_amount:         ', final_amount);
//     console.log('parsedPaidAmount:     ', parsedPaidAmount);
//     console.log('gross_remaining:      ', gross_remaining_amount);
//     console.log('surplus:              ', surplus);
//     console.log('used_credit:          ', used_credit);
//     console.log('final_remaining:      ', final_remaining_amount);
//     console.log('total_balance_change: ', total_balance_change);
//     console.log('expected new_balance: ', round2(previous_balance + total_balance_change));
//     console.log('──────────────────────────────────\n');
 
//     // ========================================================================
//     // STEP 11 — Create SaleTransaction record
//     // ========================================================================
 
//     const sale = await SaleTransaction.create({
//       daily_operation_id:   id,
//       vehicle_id,
//       vehicle_operation_id: vehicleAssignment.id,
//       buyer_id,
//       chicken_type_id,
//       sequence_number,
 
//       gross_total_weight,
//       dead_weight:          parsedDeadWeight,
//       empty_cages_weight:   parsedEmptyCagesWeight,
//       total_deductions,
//       net_weight,
 
//       price_per_kg:         parsedPricePerKg,
//       subtotal_amount,
//       discount_amount:      parsedDiscountAmount,
//       final_amount,
 
//       paid_amount:          parsedPaidAmount,
//       debt_applied_amount:  used_credit,
 
//       // Backward-compatible aliases
//       total_amount:         final_amount,
//       remaining_amount:     final_remaining_amount
 
//     }, { transaction: dbTransaction });
 
//     // ========================================================================
//     // STEP 12 — Create SaleWeight rows
//     // ========================================================================
 
//     await SaleWeight.bulkCreate(
//       parsedWeights.map((weight_value, index) => ({
//         sale_transaction_id: sale.id,
//         weight_number:       index + 1,
//         weight_value:        round2(weight_value)
//       })),
//       { transaction: dbTransaction }
//     );
 
//     // ========================================================================
//     // STEP 13 — Update buyer balance (single call)
//     // ========================================================================
 
//     const balanceInfo = await buyer.updateBalance(total_balance_change, dbTransaction);
 
//     // ========================================================================
//     // STEP 14 — Commit
//     // ========================================================================
 
//     await dbTransaction.commit();
 
//     // ========================================================================
//     // STEP 15 — Fetch full result
//     // ========================================================================
 
//     const result = await SaleTransaction.findByPk(sale.id, {
//       include: [
//         { model: Buyer,       as: 'buyer',        attributes: ['id', 'name', 'current_balance'] },
//         { model: ChickenType, as: 'chicken_type', attributes: ['id', 'name'] },
//         { model: Vehicle,     as: 'vehicle',      attributes: ['id', 'name', 'plate_number'] },
//         { model: SaleWeight,  as: 'weights',      attributes: ['weight_number', 'weight_value'],
//           order: [['weight_number', 'ASC']] }
//       ]
//     });
 
//     // ========================================================================
//     // STEP 16 — Response
//     // ========================================================================
 
//     return res.status(201).json({
//       success: true,
//       message: 'Sale recorded successfully',
//       data: {
//         transaction: result,
 
//         calculation: {
//           weights: parsedWeights,
//           gross_total_weight,
//           deductions: { dead_weight: parsedDeadWeight, empty_cages_weight: parsedEmptyCagesWeight, total_deductions },
//           net_weight,
//           price_per_kg:    parsedPricePerKg,
//           subtotal_amount,
//           discount_amount: parsedDiscountAmount,
//           final_amount
//         },
 
//         payment: {
//           paid_amount:     parsedPaidAmount,
//           surplus,
//           gross_remaining: gross_remaining_amount,
//           used_credit,
//           final_remaining: final_remaining_amount
//         },
 
//         balance_info: {
//           buyer_id:    balanceInfo.buyer_id,
//           buyer_name:  balanceInfo.buyer_name,
//           previous_balance,
//           changes: {
//             old_balance_paid:      parsedOldBalancePaid,
//             old_balance_direction: debtPayment?.payment_direction || null,
//             debt_payment_impact,
//             surplus,
//             used_credit,
//             new_sale_debt:         final_remaining_amount,
//             net_change:            total_balance_change
//           },
//           new_balance:       balanceInfo.new_balance,
//           balance_type:      balanceInfo.new_type,
//           direction_changed: balanceInfo.direction_changed,
//           display_balance:   balanceInfo.display_balance,
//           ...(balanceInfo.direction_changed && {
//             alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
//           })
//         },
 
//         ...(debtPayment && {
//           debt_payment: {
//             id:          debtPayment.id,
//             amount:      debtPayment.amount,
//             direction:   debtPayment.payment_direction,
//             date:        debtPayment.payment_date,
//             description: debtPayment.displayDescription
//           }
//         })
//       }
//     });
 
//   } catch (error) {
//     if (dbTransaction && !dbTransaction.finished) {
//       await dbTransaction.rollback();
//     }
//     console.error('Error recording sale:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Error recording sale',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// Close daily operation
// ============================================================
// FILE: controllers/saleController.js  (sale recording section)
// REPLACES: entire exports.recordSale function
// ONLY CHANGE vs your current file: Step 9-B (surplus audit trail)
// Everything else is byte-for-byte identical to your current file.
// ============================================================

exports.recordSale = async (req, res) => {
  const dbTransaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const {
      vehicle_id,
      buyer_id,
      chicken_type_id,
      weights,
      empty_cages_weight  = 0,
      dead_weight         = 0,
      price_per_kg,
      discount_amount     = 0,
      paid_amount         = 0,
      old_balance_paid    = 0,
      is_debt_payment_only = false,
      paid_by_person_id,
      person_type,
      received_by_person_id,
      payment_method = 'CASH',
      safe_id, 
      price_per_kg_loss,
      location_loss,
      farm_id_loss,
      notes_loss,
      payment_source_type = 'SAFE',
      payment_source_id
    } = req.body;

    // ── STEP 1: Validate daily operation ────────────────────────────────────

    const operation = await DailyOperation.findByPk(id, { transaction: dbTransaction });

    if (!operation) {
      await dbTransaction.rollback();
      return res.status(404).json({ success: false, message: 'Daily operation not found' });
    }

    if (operation.status === 'CLOSED') {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'Operation is already closed' });
    }

    // ── STEP 2: Load buyer ───────────────────────────────────────────────────

    const buyer = await Buyer.findByPk(buyer_id, { transaction: dbTransaction });

    if (!buyer) {
      await dbTransaction.rollback();
      return res.status(404).json({ success: false, message: 'Buyer not found' });
    }

    const previous_balance = round2(parseFloat(buyer.current_balance) || 0);

    // ── STEP 3: DEBT PAYMENT ONLY ────────────────────────────────────────────

    if (is_debt_payment_only) {

      if (old_balance_paid <= 0) {
        await dbTransaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Payment amount must be greater than 0 for balance payment'
        });
      }

      let payment_direction;
      let payment_description;
      let direction;
      let paid_by_person_type=null;
      let received_by_person_type=null;
      let transaction_type;
 
      if (previous_balance > 0) {
        payment_direction   = 'FROM_BUYER';
        payment_description = 'الدفع من المشتري لسداد الرصيد المستحق';
        transaction_type = 'RECEIVE_DEPT';
        direction ='IN';
        received_by_person_type=person_type;
      } else if (previous_balance < 0) {
        payment_direction   = 'TO_BUYER';
        payment_description = 'دفع للمشتري لسداد الرصيد الدائن';
        transaction_type = 'PAID_DEPT';
        direction ='OUT';
        paid_by_person_type=person_type;
      } 
      else {
        // await dbTransaction.rollback();
        // return res.status(400).json({
        //   success: false,
        //   message: 'Cannot pay old balance: No outstanding balance exists',
        //   current_balance: 0
        // });
         payment_direction   = 'FROM_BUYER';
        payment_description = 'الدفع من المشتري لزيادة رصيده عند الشراء';
        transaction_type = 'RECEIVE_DEPT';
        direction ='IN';
        received_by_person_type=person_type;
      }

      const debtPayment = await BuyerDebtPayment.create({
        buyer_id,
        daily_operation_id: id,
        amount: old_balance_paid,
        payment_direction,
        notes: payment_description,
        payment_method,
        payment_source_type: direction === 'OUT' ? (payment_source_type || 'SAFE') : 'SAFE',
        payment_source_id: (direction === 'OUT' ? (payment_source_id || safe_id) : (safe_id))
      }, { transaction: dbTransaction });

      // Handle through Unified Utility
      await handlePaymentSource({
        payment_source_type: debtPayment.payment_source_type,
        payment_source_id: debtPayment.payment_source_id,
        amount: debtPayment.amount,
        direction,
        reference_type: 'BuyerDebtPayment',
        reference_id: debtPayment.id,
        description: debtPayment.notes,
        dbTransaction,
        recorded_by_user_id: req.user ? req.user.id : null
      });

      await logTransaction({  
        transaction_type,
        amount: old_balance_paid,
        direction,
        safe_id: debtPayment.payment_source_type === 'SAFE' ? debtPayment.payment_source_id : null,
        reference_type: 'BuyerDebtPayment',
        reference_id: debtPayment.id,
        daily_operation_id: id,
        performed_by_user_id: req.user ? req.user.id : null,
        received_by_person_id,
        paid_by_person_type, 
        received_by_person_type,
        paid_by_person_id: paid_by_person_id,
        payment_method
      }, dbTransaction);

      const balanceInfo = await buyer.updateBalance(debtPayment.balanceImpact, dbTransaction);
      await dbTransaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Balance payment recorded successfully',
        data: {
          payment: {
            id:          debtPayment.id,
            amount:      debtPayment.amount,
            direction:   debtPayment.payment_direction,
            date:        debtPayment.payment_date,
            description: debtPayment.displayDescription
          },
          balance_info: {
            buyer_id:          balanceInfo.buyer_id,
            buyer_name:        balanceInfo.buyer_name,
            previous_balance,
            payment_amount:    old_balance_paid,
            payment_direction,
            new_balance:       balanceInfo.new_balance,
            balance_type:      balanceInfo.new_type,
            direction_changed: balanceInfo.direction_changed,
            display_balance:   balanceInfo.display_balance,
            ...(balanceInfo.direction_changed && {
              alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
            })
          }
        }
      });
    }

    // ── STEP 4: Validate sale inputs ─────────────────────────────────────────

    if (!vehicle_id) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'vehicle_id is required for sale' });
    }

    if (!chicken_type_id) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'chicken_type_id is required for sale' });
    }

    if (!Array.isArray(weights) || weights.length === 0) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'weights must be a non-empty array of scale readings'
      });
    }

    const parsedWeights = weights.map(Number);

    if (parsedWeights.some((w) => isNaN(w) || w <= 0)) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'Each weight reading must be a positive number' });
    }

    const parsedEmptyCagesWeight = round2(parseFloat(empty_cages_weight) || 0);
    const parsedDeadWeight       = round2(parseFloat(dead_weight)        || 0);
    const parsedPricePerKg       = round2(parseFloat(price_per_kg)       || 0);
    const parsedDiscountAmount   = round2(parseFloat(discount_amount)    || 0);
    const parsedPaidAmount       = round2(parseFloat(paid_amount)        || 0);
    const parsedOldBalancePaid   = round2(parseFloat(old_balance_paid)   || 0);

    if (parsedPricePerKg <= 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'price_per_kg must be greater than 0' });
    }

    if (parsedPaidAmount < 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'paid_amount cannot be negative' });
    }

    if (parsedEmptyCagesWeight < 0 || parsedDeadWeight < 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'empty_cages_weight and dead_weight cannot be negative' });
    }

    if (parsedDiscountAmount < 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, message: 'discount_amount cannot be negative' });
    }

    // ── STEP 5: Validate vehicle assignment ──────────────────────────────────

    const vehicleAssignment = await VehicleOperation.findOne({
      where: { daily_operation_id: id, vehicle_id, status: 'ACTIVE' },
      transaction: dbTransaction
    });

    if (!vehicleAssignment) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Vehicle ${vehicle_id} is not assigned to this operation`
      });
    }

    // ── STEP 6: Weight & pricing calculations ────────────────────────────────

    const gross_total_weight = round2(parsedWeights.reduce((sum, w) => sum + w, 0));
    const total_deductions   = round2(parsedDeadWeight + parsedEmptyCagesWeight);

    if (total_deductions >= gross_total_weight) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Total deductions (${total_deductions} kg) cannot equal or exceed gross weight (${gross_total_weight} kg)`,
        gross_total_weight,
        total_deductions
      });
    }

    const net_weight      = round2(gross_total_weight - total_deductions);
    const subtotal_amount = round2(net_weight * parsedPricePerKg);

    if (parsedDiscountAmount > subtotal_amount) {
      await dbTransaction.rollback();
      return res.status(400).json({
        success: false,
        message: `discount_amount (${parsedDiscountAmount}) cannot exceed subtotal_amount (${subtotal_amount})`,
        subtotal_amount
      });
    }

    const final_amount = round2(subtotal_amount - parsedDiscountAmount);


     const lastTransaction = await SaleTransaction.findOne({
      where:       { daily_operation_id: id, vehicle_id },
      order:       [['sequence_number', 'DESC']],
      transaction: dbTransaction
    });

    const sequence_number = (lastTransaction?.sequence_number || 0) + 1;

   

    // ── STEP 7: Handle old_balance_paid direction ────────────────────────────

    let debtPayment         = null;
    let payment_direction   = null;
    let debt_payment_impact = 0;

    if (parsedOldBalancePaid > 0) {
      //  if (previous_balance == 0) {
     

        // if (parsedOldBalancePaid > previous_balance) {
        //   await dbTransaction.rollback();
        //   return res.status(400).json({
        //     success: false,
        //     message: `Old balance payment (${parsedOldBalancePaid}) exceeds current balance (${previous_balance})`,
        //     current_balance: previous_balance,
        //     max_payment:     previous_balance
        //   });
        // }

      // } else if (previous_balance < 0) {
      //   payment_direction = 'TO_BUYER';

        // if (parsedOldBalancePaid > Math.abs(previous_balance)) {
        //   await dbTransaction.rollback();
        //   return res.status(400).json({
        //     success: false,
        //     message: `Payment amount (${parsedOldBalancePaid}) exceeds credit owed to buyer (${Math.abs(previous_balance)})`,
        //     current_balance: previous_balance,
        //     max_payment:     Math.abs(previous_balance)
        //   });
        // }
 
      //   await dbTransaction.rollback();
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Cannot pay old balance: No outstanding balance exists',
      //     current_balance: 0
      //   });
      // }
         payment_direction = 'FROM_BUYER';

      debtPayment = await BuyerDebtPayment.create({
        buyer_id,
        daily_operation_id: id,
        amount:             parsedOldBalancePaid,
        payment_direction,
        notes:              `الدفع أثناء عملية البيع رقم ${sequence_number}`,
        payment_method,
         payment_source_type:   (payment_source_type || 'SAFE') ,
        payment_source_id:   (payment_source_id || safe_id)  
      }, { transaction: dbTransaction });

      debt_payment_impact = round2(parseFloat(debtPayment.balanceImpact) || 0);

    }
 
   
    // ── STEP 10: Balance calculation ─────────────────────────────────────────

    const running_balance        = round2(previous_balance + debt_payment_impact);
    const surplus                = round2(Math.max(0, parsedPaidAmount - final_amount));
    const gross_remaining_amount = round2(Math.max(0, final_amount - parsedPaidAmount));

    let used_credit = 0;
    if (running_balance < 0 && gross_remaining_amount > 0) {
      const available_credit = Math.abs(running_balance);
      used_credit = round2(Math.min(available_credit, gross_remaining_amount));
    }

    const final_remaining_amount = round2(gross_remaining_amount - used_credit);
     const total_balance_change = round2(
      // debt_payment_impact +
       used_credit + final_remaining_amount - surplus
    );
// currentBalance + debtPaymentImpact + remaining  - surplus;
    console.log('\n── recordSale balance breakdown ──');
    console.log('previous_balance:     ', previous_balance);
    console.log('debt_payment_impact:  ', debt_payment_impact);
    console.log('running_balance:      ', running_balance);
    console.log('final_amount:         ', final_amount);
    console.log('parsedPaidAmount:     ', parsedPaidAmount);
    console.log('gross_remaining:      ', gross_remaining_amount);
    console.log('surplus:              ', surplus);
    console.log('used_credit:          ', used_credit);
    console.log('final_remaining:      ', final_remaining_amount);
    console.log('total_balance_change: ', total_balance_change);
    console.log('expected new_balance: ', round2(previous_balance + total_balance_change));
    console.log('──────────────────────────────────\n');

    // ── STEP 9-B: BUG 4 FIX — Create surplus audit record ───────────────────
    //
    // When buyer pays MORE than final_amount, the balance formula already
    // subtracts the surplus (balance goes negative = we owe them).
    // But the original code left no BuyerDebtPayment record for that
    // overpayment — the audit trail had a gap.
    //
    // We now record it as TO_BUYER so the payment history is complete and
    // the books reconcile: sum(BuyerDebtPayments) == balance movement.
    let surplusPayment = null;

    if (surplus - parsedOldBalancePaid > 0) {
      surplusPayment = await BuyerDebtPayment.create({
        buyer_id,
        daily_operation_id: id,
        amount:             surplus - parsedOldBalancePaid,
        payment_direction:  'FROM_BUYER',
        notes:              `زيادة دفع من المشتري في عملية البيع رقم ${sequence_number} — ${surplus - parsedOldBalancePaid} جنيه ليهم علينا`,
        payment_method,
        payment_source_type:  (payment_source_type || 'SAFE')  ,
        payment_source_id:  (payment_source_id || safe_id) 
      }, { transaction: dbTransaction });
    }

    // ── STEP 10-B: Create automated loss record for dead_weight ──────────────
    let loss_record_id = null;
    let loss_amount = null;
     if (parsedDeadWeight > 0) {
         loss_amount = round2(parsedDeadWeight * parsedPricePerKg);
      const loss = await TransportLoss.create({
        daily_operation_id:   id,
        vehicle_id,
        vehicle_operation_id: vehicleAssignment.id,
        chicken_type_id,
        dead_weight:          parsedDeadWeight,
        price_per_kg:          price_per_kg_loss,
      location:location_loss,
        loss_amount: price_per_kg_loss*parsedDeadWeight,
        source:               'SALE',
        farm_id:farm_id_loss, // Our loss 
        notes:notes_loss?notes_loss:`خسارة ناتجة عن وزن نافق أثناء البيع رقم ${sequence_number}`
      }, { transaction: dbTransaction });

      loss_record_id = loss.id;

      // Log the loss as a financial transaction
      await logTransaction({
        transaction_type:     'LOSS',
        direction:            'OUT',
        amount:               loss_amount,
        safe_id:null, // This is a value loss, not a cash payout from safe
        reference_type:       'TransportLoss',
        reference_id:         loss.id,
        daily_operation_id:   id,
        performed_by_user_id: req.user ? req.user.id : null,
        payment_method:null, 
        notes:   `قيمة النافق (Sale Loss) في عملية البيع رقم ${sequence_number}`
      }, dbTransaction);
    }
          
// ── PAYMENT SOURCE EXTRACTION & VALIDATION ───────────────────────────────
 
    // Resolve payment_source_id (payment_source_id > safe_id)
    const finalPaymentSourceId = payment_source_id || safe_id;

    if (parsedPaidAmount > 0) {
      if (!finalPaymentSourceId) {
        throw new AppError('payment_source_id or safe_id required when paid_amount > 0', 400);
      }
      
      // Validate Safe exists
      const safe = await Safe.findByPk(finalPaymentSourceId, { 
        transaction: dbTransaction 
      });
      if (!safe) {
        throw new AppError(`Safe/Custody ${finalPaymentSourceId} not found`, 404);
      }
    }

    
    // ── STEP 11: Create SaleTransaction ──────────────────────────────────────

    const sale = await SaleTransaction.create({
      daily_operation_id:   id,
      vehicle_id,
      vehicle_operation_id: vehicleAssignment.id,
      buyer_id,
      chicken_type_id,
      sequence_number,
      gross_total_weight,
      dead_weight:          parsedDeadWeight,
      empty_cages_weight:   parsedEmptyCagesWeight,
      total_deductions,
      net_weight,
      price_per_kg:         parsedPricePerKg,
      subtotal_amount,
      discount_amount:      parsedDiscountAmount,
      final_amount,
      paid_amount:          parsedPaidAmount,
      debt_applied_amount:  used_credit,
      total_amount:         final_amount,
      remaining_amount:     final_remaining_amount,
      payment_source_type,
      payment_source_id:    finalPaymentSourceId,
     payment_method,
      received_by_person_type:person_type,
      received_by_person_id,
      loss_record_id:       loss_record_id
    }, { transaction: dbTransaction });
 
  
    if (parsedPaidAmount > 0) {
      // Incoming money (SALE) always goes to SAFE
      console.log("sale",{
        payment_source_type: 'SAFE',
        payment_source_id: safe_id,
        amount: parsedPaidAmount,
        direction: 'IN',
        reference_type: 'SaleTransaction',
        reference_id: sale.id,
        description: `دفعة نقدية - بيع مسلسل ${sequence_number}`,
        dbTransaction,
        recorded_by_user_id: req.user ? req.user.id : null
      });
      
      await handlePaymentSource({
        payment_source_type: 'SAFE',
        payment_source_id: safe_id,
        amount: parsedPaidAmount,
        direction: 'IN',
        reference_type: 'SaleTransaction',
        reference_id: sale.id,
        description: `دفعة نقدية - بيع مسلسل ${sequence_number}`,
        dbTransaction,
        recorded_by_user_id: req.user ? req.user.id : null
      });
      // ── LOG FINANCIAL TRANSACTION ──────────────────────────────────────────

        logTransaction({
      transaction_type: 'SALE',
      direction: 'IN',
      amount: parsedPaidAmount,
      payment_source_type,
      payment_source_id: finalPaymentSourceId,
      reference_type: 'SaleTransaction',
      reference_id: sale.id,  // Forward ref - OK since sale created below
      daily_operation_id: id,
      performed_by_user_id: req.user?.id,
      received_by_person_type:person_type,
      received_by_person_id,
      payment_method
    }, dbTransaction);

  
    }

    // ── STEP 12: Create SaleWeight rows ──────────────────────────────────────

    await SaleWeight.bulkCreate(
      parsedWeights.map((weight_value, index) => ({
        sale_transaction_id: sale.id,
        weight_number:       index + 1,
        weight_value:        round2(weight_value)
      })),
      { transaction: dbTransaction }
    );

    // ── STEP 13: Update buyer balance ────────────────────────────────────────

    const balanceInfo = await buyer.updateBalance(total_balance_change, dbTransaction);

    // ── STEP 14: Commit ──────────────────────────────────────────────────────

    await dbTransaction.commit();

    // ── STEP 15: Fetch full result ────────────────────────────────────────────

    const result = await SaleTransaction.findByPk(sale.id, {
      include: [
        { model: Buyer,       as: 'buyer',        attributes: ['id', 'name', 'current_balance'] },
        { model: ChickenType, as: 'chicken_type', attributes: ['id', 'name'] },
        { model: Vehicle,     as: 'vehicle',      attributes: ['id', 'name', 'plate_number'] },
        {
          model:      SaleWeight,
          as:         'weights',
          attributes: ['weight_number', 'weight_value'],
          order:      [['weight_number', 'ASC']]
        }
      ]
    });

    // ── STEP 16: Response ─────────────────────────────────────────────────────

    return res.status(201).json({
      success: true,
      message: 'Sale recorded successfully',
      data: {
        transaction: result,

        calculation: {
          weights: parsedWeights,
          gross_total_weight,
          deductions: {
            dead_weight:        parsedDeadWeight,
            empty_cages_weight: parsedEmptyCagesWeight,
            total_deductions
          },
          net_weight,
          price_per_kg:    parsedPricePerKg,
          subtotal_amount,
          discount_amount: parsedDiscountAmount,
          final_amount
        },

        payment: {
          paid_amount:     parsedPaidAmount,
          surplus,
          gross_remaining: gross_remaining_amount,
          used_credit,
          final_remaining: final_remaining_amount
        },

        balance_info: {
          buyer_id:    balanceInfo.buyer_id,
          buyer_name:  balanceInfo.buyer_name,
          previous_balance,
          changes: {
            old_balance_paid:      parsedOldBalancePaid,
            old_balance_direction: debtPayment?.payment_direction || null,
            debt_payment_impact,
            surplus,
            used_credit,
            new_sale_debt:         final_remaining_amount,
            net_change:            total_balance_change
          },
          new_balance:       balanceInfo.new_balance,
          balance_type:      balanceInfo.new_type,
          direction_changed: balanceInfo.direction_changed,
          display_balance:   balanceInfo.display_balance,
          ...(balanceInfo.direction_changed && {
            alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
          })
        },

        ...(debtPayment && {
          debt_payment: {
            id:          debtPayment.id,
            amount:      debtPayment.amount,
            direction:   debtPayment.payment_direction,
            date:        debtPayment.payment_date,
            description: debtPayment.displayDescription
          }
        }),

        // BUG 4 FIX: included in response when buyer overpaid
        ...(surplusPayment && {
          surplus_payment: {
            id:          surplusPayment.id,
            amount:      surplusPayment.amount,
            direction:   surplusPayment.payment_direction,
            date:        surplusPayment.payment_date,
            description: surplusPayment.displayDescription
          }
        })
      }
    });

  } catch (error) {
    if (dbTransaction && !dbTransaction.finished) {
      await dbTransaction.rollback();
    }
    console.error('Error recording sale:', error);
    return res.status(500).json({
      success: false,
      message: 'Error recording sale',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.closeDailyOperation = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const operation = await DailyOperation.findByPk(id);

    if (!operation) {
      if (transaction && !transaction.finished) await transaction.rollback();
      return next(new AppError('العملية اليومية غير موجودة', 404));
    }

    if (operation.status === 'CLOSED') {
      if (transaction && !transaction.finished) await transaction.rollback();
      return next(new AppError('هذه العملية مغلقة بالفعل', 400));
    }

    // Calculate and distribute profits (ProfitService handles operation status update internally)
    const result = await ProfitService.closeOperation(id, transaction);

    await transaction.commit();

    // Round financial data for response
    const formattedData = {
  operation: result.operation,
  profitDistribution: {
    ...result.profitDistribution.toJSON(),
    net_profit:         round2(result.profitDistribution.net_profit),
    total_revenue:      round2(result.profitDistribution.total_revenue),
    total_purchases:    round2(result.profitDistribution.total_purchases),
    total_losses:       round2(result.profitDistribution.total_losses),
    total_costs:        round2(result.profitDistribution.total_costs),
    vehicle_costs:      round2(result.profitDistribution.vehicle_costs),

    // ── Discounts ──────────────────────────────────────────────────
    discounts: {
      total_sales_discount:    round2(result.profitDistribution.total_sales_discount),
      total_purchase_discount: round2(result.profitDistribution.total_purchase_discount),
      total:                   round2(
        (result.profitDistribution.total_sales_discount || 0) +
        (result.profitDistribution.total_purchase_discount || 0)
      )
    },

    // ── Debts paid by us ───────────────────────────────────────────
    debts_paid: {
      from_sales:     round2(result.profitDistribution.debt_paid_from_sales),
      from_purchases: round2(result.profitDistribution.debt_paid_from_purchases),
      from_costs:     round2(result.profitDistribution.debt_paid_from_costs),
      total:          round2(
        (result.profitDistribution.debt_paid_from_sales     || 0) +
        (result.profitDistribution.debt_paid_from_purchases || 0) +
        (result.profitDistribution.debt_paid_from_costs     || 0)
      )
    },

    // ── Debts received by us ───────────────────────────────────────
    debts_received: {
      from_sales:     round2(result.profitDistribution.debt_received_from_sales),
      from_purchases: round2(result.profitDistribution.debt_received_from_purchases),
      from_costs:     round2(result.profitDistribution.debt_received_from_costs),
      total:          round2(
        (result.profitDistribution.debt_received_from_sales      || 0) +
        (result.profitDistribution.debt_received_from_purchases  || 0) +
        (result.profitDistribution.debt_received_from_costs      || 0)
      )
    }
  },
  partnerDistributions: result.partnerDistributions.map(dist => ({
    ...dist,
    base_profit_share:  round2(dist.base_profit_share),
    vehicle_cost_share: round2(dist.vehicle_cost_share),
    final_profit:       round2(dist.final_profit)
    })),
    vehicleBreakdown: result.vehicleBreakdown.map(v => ({
      ...v,
      purchases:     round2(v.purchases),
      revenue:       round2(v.revenue),
      losses:        round2(v.losses),
      vehicle_costs: round2(v.vehicle_costs),
      net_profit:    round2(v.net_profit)
    }))
  };

    res.status(200).json({
      success: true,
      message: 'تم إغلاق العملية بنجاح وتوزيع الأرباح',
      data: formattedData
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('Error closing operation:', error);
    next(error);
  }
};

 
// Get chicken types
exports.getChickenTypes = async (req, res) => {
  try {
    const { ChickenType } = require('../models');
    const types = await ChickenType.findAll({
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching chicken types'
    });
  }
};

// Create chicken type
exports.createChickenType = async (req, res) => {
  try {
    const { ChickenType } = require('../models');
    const type = await ChickenType.create(req.body);

    res.status(201).json({
      success: true,
      data: type
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating chicken type'
    });
  }
};

// Get single chicken type
exports.getChickenTypeById = async (req, res) => {
  try {
    const { ChickenType } = require('../models');
    const type = await ChickenType.findByPk(req.params.id);

    if (!type) {
      return res.status(404).json({
        success: false,
        message: 'Chicken type not found'
      });
    }

    res.json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching chicken type',
      error: error.message
    });
  }
};

// Update chicken type
exports.updateChickenType = async (req, res) => {
  try {
    const { ChickenType } = require('../models');
    const type = await ChickenType.findByPk(req.params.id);

    if (!type) {
      return res.status(404).json({
        success: false,
        message: 'Chicken type not found'
      });
    }

    await type.update(req.body);

    res.json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating chicken type',
      error: error.message
    });
  }
};

// Delete chicken type
exports.deleteChickenType = async (req, res) => {
  try {
    const { ChickenType } = require('../models');
    const type = await ChickenType.findByPk(req.params.id);

    if (!type) {
      return res.status(404).json({
        success: false,
        message: 'Chicken type not found'
      });
    }

    await type.destroy();

    res.json({ success: true, message: 'Chicken type deleted' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting chicken type',
      error: error.message
    });
  }
};


// Get cost categories
exports.getCostCategories = async (req, res) => {
  try {
    const categories = await CostCategory.findAll({
      include: [
        {
          model: DailyCost,
          as: 'costs',
          attributes: [],
          required: false
        }
      ],
      attributes: {
        include: [
          [
            CostCategory.sequelize.fn('COUNT', CostCategory.sequelize.col('costs.id')),
            'usage_count'
          ]
        ]
      },
      group: ['CostCategory.id'],
      order: [
        ['is_vehicle_cost', 'DESC'],
        ['name', 'ASC']
      ]
    });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching cost categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cost categories',
      error: error.message
    });
  }
};
exports.getPaginationCostCategories = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, type_cost } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    // Vehicle cost filter
    if (type_cost === 'vehicle') {
      where.is_vehicle_cost = true;
    } else   if (type_cost === 'vehicle') {
      where.is_vehicle_cost = false;
    } 
    console.log(where);
    
    const { count, rows: categories } = await CostCategory.findAndCountAll({
      where,
      include: [
        {
          model: DailyCost,
          as: 'costs',
          attributes: [],
          required: false
        }
      ],
      attributes: {
        include: [
          [
            CostCategory.sequelize.fn('COUNT', CostCategory.sequelize.col('costs.id')),
            'usage_count'
          ]
        ]
      },
      group: ['CostCategory.id'],
      order: [
        ['is_vehicle_cost', 'DESC'],
        ['name', 'ASC']
      ],
      limit: parseInt(limit),
      offset,
      subQuery: false
    });
    console.log("categories",categories);
    
    res.json({
      success: true,
      data: {
        items: categories,
        pagination: {
          total: count.length || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count.length || 0) / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching cost categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cost categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// ========================================
// CREATE COST CATEGORY
// ========================================
exports.createCostCategory = async (req, res) => {
  try {
    const { name, description, is_vehicle_cost } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    // Check for duplicate name
    const existing = await CostCategory.findOne({
      where: { name: name.trim() }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Cost category with this name already exists'
      });
    }

    const category = await CostCategory.create({
      name: name.trim(),
      description: description?.trim() || null,
      is_vehicle_cost: is_vehicle_cost || false
    });

    res.status(201).json({
      success: true,
      data: category,
      message: 'Cost category created successfully'
    });
  } catch (error) {
    console.error('Error creating cost category:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating cost category',
      error: error.message
    });
  }
};

// ========================================
// GET COST CATEGORY BY ID
// ========================================
exports.getCostCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await CostCategory.findByPk(id, {
      include: [
        {
          model: DailyCost,
          as: 'costs',
          attributes: [],
          required: false
        }
      ],
      attributes: {
        include: [
          [
            CostCategory.sequelize.fn('COUNT', CostCategory.sequelize.col('costs.id')),
            'usage_count'
          ],
          [
            CostCategory.sequelize.fn('SUM', CostCategory.sequelize.col('costs.amount')),
            'total_amount'
          ]
        ]
      },
      group: ['CostCategory.id']
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Cost category not found'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error fetching cost category:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cost category',
      error: error.message
    });
  }
};

// ========================================
// UPDATE COST CATEGORY
// ========================================
exports.updateCostCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_vehicle_cost } = req.body;

    const category = await CostCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Cost category not found'
      });
    }

    // Check if name is being changed and if it conflicts
    if (name && name.trim() !== category.name) {
      const existing = await CostCategory.findOne({
        where: {
          name: name.trim(),
          id: { [Op.ne]: id }
        }
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Another cost category with this name already exists'
        });
      }
    }

    // Update fields
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (is_vehicle_cost !== undefined) updateData.is_vehicle_cost = is_vehicle_cost;

    await category.update(updateData);

    res.json({
      success: true,
      data: category,
      message: 'Cost category updated successfully'
    });
  } catch (error) {
    console.error('Error updating cost category:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating cost category',
      error: error.message
    });
  }
};

// ========================================
// DELETE COST CATEGORY
// ========================================
exports.deleteCostCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await CostCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Cost category not found'
      });
    }

    // Check if category is in use
    const usageCount = await DailyCost.count({
      where: { cost_category_id: id }
    });

    if (usageCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete cost category. It is used in ${usageCount} cost record(s)`,
        usage_count: usageCount
      });
    }

    await category.destroy();

    res.json({
      success: true,
      message: 'Cost category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting cost category:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting cost category',
      error: error.message
    });
  }
};

// ========================================
// GET COST CATEGORIES BY TYPE (NEW)
// ========================================
exports.getCostCategoriesByType = async (req, res) => {
  try {
    const { type } = req.params; // 'vehicle' or 'general'

    const isVehicleCost = type === 'vehicle';

    const categories = await CostCategory.findAll({
      where: { is_vehicle_cost: isVehicleCost },
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: categories,
      type: type
    });
  } catch (error) {
    console.error('Error fetching cost categories by type:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cost categories',
      error: error.message
    });
  }
};

// ========================================
// GET COST STATISTICS (NEW)
// ========================================
exports.getCostCategoryStatistics = async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    const category = await CostCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Cost category not found'
      });
    }

    // Build date filter
    const dateFilter = {};
    if (start_date && end_date) {
      dateFilter.recorded_at = {
        [Op.between]: [new Date(start_date), new Date(end_date)]
      };
    }

    // Get statistics
    const costs = await DailyCost.findAll({
      where: {
        cost_category_id: id,
        ...dateFilter
      },
      include: [
        {
          model: DailyOperation,
          as: 'operation',
          attributes: ['id', 'operation_date', 'status']
        },
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'name', 'plate_number'],
          required: false
        },
        {
          model: VehicleOperation,
          as: 'vehicle_operation',
          include: [
            {
              model: Vehicle,
              as: 'vehicle',
              attributes: ['id', 'name', 'plate_number']
            }
          ],
          required: false
        }
      ],
      order: [['recorded_at', 'DESC']]
    });

    // Calculate statistics
    const totalAmount = costs.reduce((sum, cost) => sum + parseFloat(cost.amount), 0);
    const avgAmount = costs.length > 0 ? totalAmount / costs.length : 0;
    const maxAmount = costs.length > 0 ? Math.max(...costs.map(c => parseFloat(c.amount))) : 0;
    const minAmount = costs.length > 0 ? Math.min(...costs.map(c => parseFloat(c.amount))) : 0;

    // Group by vehicle (if vehicle cost)
    let byVehicle = null;
    if (category.is_vehicle_cost) {
      byVehicle = costs.reduce((acc, cost) => {
        const vehicleId = cost.vehicle_id || cost.vehicle_operation?.vehicle_id;
        const vehicleName = cost.vehicle?.name || cost.vehicle_operation?.vehicle?.name || 'Unknown';
        
        if (!acc[vehicleId]) {
          acc[vehicleId] = {
            vehicle_id: vehicleId,
            vehicle_name: vehicleName,
            count: 0,
            total: 0
          };
        }
        
        acc[vehicleId].count++;
        acc[vehicleId].total += parseFloat(cost.amount);
        
        return acc;
      }, {});

      byVehicle = Object.values(byVehicle);
    }

    res.json({
      success: true,
      data: {
        category,
        statistics: {
          total_records: costs.length,
          total_amount: totalAmount,
          average_amount: avgAmount,
          max_amount: maxAmount,
          min_amount: minAmount
        },
        by_vehicle: byVehicle,
        recent_costs: costs.slice(0, 10) // Last 10 records
      }
    });
  } catch (error) {
    console.error('Error fetching cost category statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

// Get operation by date
exports.getOperationByDate = async (req, res, next) => {
  try {
    const { date } = req.params;

    // 1. Fetch operation with basic vehicle info
    const operation = await DailyOperation.findOne({
      where: { operation_date: date },
      include: [{ model: Vehicle, as: 'vehicles' }]
    });

    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'No operation found for this date'
      });
    }

    let result = {
      operation,
      profitDistribution: null,
      partnerDistributions: [],
      vehicleBreakdown: []
    };

    if (operation.status === 'CLOSED') {
      // Fetch stored distribution data
      const profitDistribution = await ProfitDistribution.findOne({
        where: { daily_operation_id: operation.id },
        include: [{
          model: PartnerProfit,
          as: 'partner_profits',
          include: [{ model: Partner, as: 'partner' }]
        }]
      });

      if (profitDistribution) {
        result.profitDistribution = profitDistribution;
        result.partnerDistributions = profitDistribution.partner_profits.map(pp => pp.get({ plain: true }));
      }
      
      // Breakdown is calculated on-the-fly (not stored in DB currently)
      const profitData = await ProfitService.calculateDailyProfit(operation.id);
      result.vehicleBreakdown = profitData.vehicleBreakdown || [];
      
    } else {
      // Calculate real-time preview for OPEN operation
      const profitData = await ProfitService.calculateDailyProfit(operation.id);
      const debtSummary = await ProfitService.calculateDebtAndDiscountSummary(operation.id);
      const partnerDistributions = await ProfitService.distributeToPartners(operation.id, profitData);

      // Create a structure that mimics the Sequelize model for formatting
      result.profitDistribution = {
        total_revenue: profitData.totalRevenue,
        total_purchases: profitData.totalPurchases,
        total_losses: profitData.totalLosses,
        total_costs: profitData.totalCosts,
        vehicle_costs: profitData.vehicleCosts,
        net_profit: profitData.netProfit,
        
        total_sales_discount: debtSummary.totalSalesDiscount,
        total_purchase_discount: debtSummary.totalPurchaseDiscount,
        
        debt_paid_from_sales: debtSummary.debtPaidFromSales,
        debt_paid_from_purchases: debtSummary.debtPaidFromPurchases,
        debt_paid_from_costs: debtSummary.debtPaidFromCosts,
        
        debt_received_from_sales: debtSummary.debtReceivedFromSales,
        debt_received_from_purchases: debtSummary.debtReceivedFromPurchases,
        debt_received_from_costs: debtSummary.debtReceivedFromCosts
      };
      
      result.partnerDistributions = partnerDistributions;
      result.vehicleBreakdown = profitData.vehicleBreakdown || [];
    }

    // ── Formatting Logic (Matches closeDailyOperation) ───────────────────────
    const distData = result.profitDistribution;
    
    // Safety check if profitDistribution wasn't found for a closed operation
    if (!distData) {
        return res.status(200).json({
            success: true,
            data: {
                operation: result.operation,
                profitDistribution: null,
                partnerDistributions: [],
                vehicleBreakdown: result.vehicleBreakdown
            }
        });
    }

    const formattedData = {
      operation: result.operation,
      profitDistribution: {
        ...(distData.toJSON ? distData.toJSON() : distData),
        net_profit:         round2(distData.net_profit),
        total_revenue:      round2(distData.total_revenue),
        total_purchases:    round2(distData.total_purchases),
        total_losses:       round2(distData.total_losses),
        total_costs:        round2(distData.total_costs),
        vehicle_costs:      round2(distData.vehicle_costs),

        discounts: {
          total_sales_discount:    round2(distData.total_sales_discount),
          total_purchase_discount: round2(distData.total_purchase_discount),
          total:                   round2(
            (distData.total_sales_discount || 0) + (distData.total_purchase_discount || 0)
          )
        },

        debts_paid: {
          from_sales:     round2(distData.debt_paid_from_sales),
          from_purchases: round2(distData.debt_paid_from_purchases),
          from_costs:     round2(distData.debt_paid_from_costs),
          total:          round2(
            (distData.debt_paid_from_sales || 0) +
            (distData.debt_paid_from_purchases || 0) +
            (distData.debt_paid_from_costs || 0)
          )
        },

        debts_received: {
          from_sales:     round2(distData.debt_received_from_sales),
          from_purchases: round2(distData.debt_received_from_purchases),
          from_costs:     round2(distData.debt_received_from_costs),
          total:          round2(
            (distData.debt_received_from_sales || 0) +
            (distData.debt_received_from_purchases || 0) +
            (distData.debt_received_from_costs || 0)
          )
        }
      },
      partnerDistributions: result.partnerDistributions.map(dist => ({
        ...dist,
        base_profit_share:  round2(dist.base_profit_share),
        vehicle_cost_share: round2(dist.vehicle_cost_share),
        final_profit:       round2(dist.final_profit)
      })),
      vehicleBreakdown: result.vehicleBreakdown.map(v => ({
        ...v,
        purchases:     round2(v.purchases),
        revenue:       round2(v.revenue),
        losses:        round2(v.losses),
        vehicle_costs: round2(v.vehicle_costs),
        net_profit:    round2(v.net_profit)
      }))
    };

    res.status(200).json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error('Error fetching operation by date:', error);
    next(error);
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /daily-operations/:id/unpaid-costs
// List unpaid/partially-paid costs for a specific daily operation
// ─────────────────────────────────────────────────────────────────────────────
 
exports.getUnpaidCostsForOperation = async (req, res) => {
  try {
    const { id } = req.params;

    const costs = await DailyCost.findAll({
      attributes: [
        'cost_category_id',
        [fn('SUM', col('amount')), 'total_amount'],
        [fn('SUM', col('paid_amount')), 'total_paid'],
        [fn('SUM', literal('amount - paid_amount')), 'total_unpaid']
      ],
      where: {
        daily_operation_id: id,
        [Op.and]: literal('amount > paid_amount')
      },
      include: [
        {
          model: CostCategory,
          as: 'category',
          attributes: ['id', 'name']
        }
      ],
      group: ['cost_category_id', 'category.id', 'category.name'],
      order: [[literal('total_unpaid'), 'DESC']]
    });

    res.json({
      success: true,
      count: costs.length,
      data: costs
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
