// src/controllers/operationController.js
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
  sequelize
} = require('../models');
const ProfitService = require('../services/ProfitService');

// Start a new daily operation
exports.startDailyOperation = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { operation_date, vehicle_id } = req.body;

    // Check if operation already exists for this date
    const existing = await DailyOperation.findOne({
      where: { operation_date }
    });

    if (existing) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Daily operation already exists for this date'
      });
    }

    const operation = await DailyOperation.create({
      operation_date,
      vehicle_id,
      user_id: req.user.id,
      status: 'OPEN'
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: operation
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: 'Error starting daily operation',
      error: error.message
    });
  }
};

// Get operation by ID
exports.getOperation = async (req, res) => {
  try {
    const operation = await DailyOperation.findByPk(req.params.id, {
      include: [
        { model: Vehicle },
        { 
          model: FarmTransaction,
          include: [{ model: Farm }, { model: ChickenType }]
        },
        { 
          model: SaleTransaction,
          include: [{ model: Buyer }, { model: ChickenType }]
        },
        { 
          model: TransportLoss,
          include: [{ model: ChickenType }]
        },
        { 
          model: DailyCost,
          include: [{ model: CostCategory }]
        }
      ]
    });

    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'Operation not found'
      });
    }

    res.json({
      success: true,
      data: operation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching operation'
    });
  }
};

// Record farm loading
exports.recordFarmLoading = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const operation = await DailyOperation.findByPk(req.params.id);

    if (!operation || operation.status === 'CLOSED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Operation not found or already closed'
      });
    }

    const {
      farm_id,
      chicken_type_id,
      empty_vehicle_weight,
      loaded_vehicle_weight,
      cage_count,
      cage_weight_per_unit,
      price_per_kg,
      paid_amount
    } = req.body;

    // Calculate net weight
    const net_chicken_weight = loaded_vehicle_weight - empty_vehicle_weight - (cage_count * cage_weight_per_unit);
    const total_amount = net_chicken_weight * price_per_kg;
    const remaining_amount = total_amount - paid_amount;

    // Get sequence number
    const count = await FarmTransaction.count({
      where: { daily_operation_id: req.params.id }
    });

    const farmTransaction = await FarmTransaction.create({
      daily_operation_id: req.params.id,
      farm_id,
      chicken_type_id,
      sequence_number: count + 1,
      empty_vehicle_weight,
      loaded_vehicle_weight,
      cage_count,
      cage_weight_per_unit,
      net_chicken_weight,
      price_per_kg,
      total_amount,
      paid_amount,
      remaining_amount
    }, { transaction });

    // Update farm debt
    const farm = await Farm.findByPk(farm_id);
    await farm.update({
      total_debt: parseFloat(farm.total_debt) + parseFloat(remaining_amount)
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: farmTransaction
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: 'Error recording farm loading',
      error: error.message
    });
  }
};

// Record transport loss
exports.recordTransportLoss = async (req, res) => {
  try {
    const operation = await DailyOperation.findByPk(req.params.id);

    if (!operation || operation.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Operation not found or already closed'
      });
    }

    const { chicken_type_id, dead_weight, price_per_kg, location } = req.body;
    const loss_amount = dead_weight * price_per_kg;

    const loss = await TransportLoss.create({
      daily_operation_id: req.params.id,
      chicken_type_id,
      dead_weight,
      price_per_kg,
      loss_amount,
      location
    });

    res.status(201).json({
      success: true,
      data: loss
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error recording transport loss'
    });
  }
};

// Record daily cost
exports.recordDailyCost = async (req, res) => {
  try {
    const operation = await DailyOperation.findByPk(req.params.id);

    if (!operation || operation.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Operation not found or already closed'
      });
    }

    const cost = await DailyCost.create({
      daily_operation_id: req.params.id,
      ...req.body
    });

    res.status(201).json({
      success: true,
      data: cost
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error recording cost'
    });
  }
};

// Record sale
exports.recordSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const operation = await DailyOperation.findByPk(req.params.id);

    if (!operation || operation.status === 'CLOSED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Operation not found or already closed'
      });
    }

    const {
      buyer_id,
      chicken_type_id,
      loaded_cages_weight,
      empty_cages_weight,
      cage_count,
      price_per_kg,
      paid_amount,
      old_debt_paid = 0
    } = req.body;

    // Calculate net weight
    const net_chicken_weight = loaded_cages_weight - empty_cages_weight;
    const total_amount = net_chicken_weight * price_per_kg;
    const remaining_amount = total_amount - paid_amount;

    // Get sequence number
    const count = await SaleTransaction.count({
      where: { daily_operation_id: req.params.id }
    });

    const sale = await SaleTransaction.create({
      daily_operation_id: req.params.id,
      buyer_id,
      chicken_type_id,
      sequence_number: count + 1,
      loaded_cages_weight,
      empty_cages_weight,
      cage_count,
      net_chicken_weight,
      price_per_kg,
      total_amount,
      paid_amount,
      remaining_amount,
      old_debt_paid
    }, { transaction });

    // Update buyer debt
    const buyer = await Buyer.findByPk(buyer_id);
    const newDebt = parseFloat(buyer.total_debt) - parseFloat(old_debt_paid) + parseFloat(remaining_amount);
    await buyer.update({
      total_debt: newDebt
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: sale
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: 'Error recording sale',
      error: error.message
    });
  }
};

// Close daily operation
exports.closeDailyOperation = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const operation = await DailyOperation.findByPk(req.params.id);

    if (!operation) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Operation not found'
      });
    }

    if (operation.status === 'CLOSED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Operation already closed'
      });
    }

    // Calculate and distribute profits
    const profitDistribution = await ProfitService.calculateAndDistribute(req.params.id, transaction);

    // Update operation status
    await operation.update({
      status: 'CLOSED',
      closed_at: new Date()
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      data: profitDistribution
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: 'Error closing operation',
      error: error.message
    });
  }
};

module.exports = exports;