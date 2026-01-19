// src/controllers/farmController.js
const { Farm, FarmTransaction, FarmDebtPayment, DailyOperation } = require('../models');
const { sequelize } = require('../config/database');

exports.getAllFarms = async (req, res) => {
  try {
    const farms = await Farm.findAll({
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: farms
    });
  } catch (error) {
    console.error('Error fetching farms:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching farms',
      error: error.message
    });
  }
};

exports.getFarmById = async (req, res) => {
  try {
    const farm = await Farm.findByPk(req.params.id);

    if (!farm) {
      return res.status(404).json({
        success: false,
        message: 'Farm not found'
      });
    }

    res.json({
      success: true,
      data: farm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching farm',
      error: error.message
    });
  }
};

exports.createFarm = async (req, res) => {
  try {
    const farm = await Farm.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Farm created successfully',
      data: farm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating farm',
      error: error.message
    });
  }
};

exports.updateFarm = async (req, res) => {
  try {
    const farm = await Farm.findByPk(req.params.id);

    if (!farm) {
      return res.status(404).json({
        success: false,
        message: 'Farm not found'
      });
    }

    // Don't allow manual update of total_debt through this endpoint
    const { total_debt, ...updateData } = req.body;

    await farm.update(updateData);

    res.json({
      success: true,
      message: 'Farm updated successfully',
      data: farm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating farm',
      error: error.message
    });
  }
};

exports.deleteFarm = async (req, res) => {
  try {
    const farm = await Farm.findByPk(req.params.id);

    if (!farm) {
      return res.status(404).json({
        success: false,
        message: 'Farm not found'
      });
    }

    // Check if farm has any transactions
    const transactionCount = await FarmTransaction.count({
      where: { farm_id: req.params.id }
    });

    if (transactionCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete farm with existing transactions'
      });
    }

    await farm.destroy();

    res.json({
      success: true,
      message: 'Farm deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting farm',
      error: error.message
    });
  }
};

exports.getFarmDebtHistory = async (req, res) => {
  try {
    const farm = await Farm.findByPk(req.params.id);

    if (!farm) {
      return res.status(404).json({
        success: false,
        message: 'Farm not found'
      });
    }

    // Get all farm transactions
    const transactions = await FarmTransaction.findAll({
      where: { farm_id: req.params.id },
      include: [
        {
          model: DailyOperation,
          attributes: ['id', 'operation_date']
        }
      ],
      order: [['transaction_time', 'DESC']]
    });

    // Get all debt payments
    const payments = await FarmDebtPayment.findAll({
      where: { farm_id: req.params.id },
      include: [
        {
          model: DailyOperation,
          attributes: ['id', 'operation_date'],
          required: false
        }
      ],
      order: [['payment_date', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        farm,
        current_debt: farm.total_debt,
        transactions,
        payments,
        summary: {
          total_purchases: transactions.length,
          total_payments: payments.length,
          total_amount_purchased: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
          total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount), 0)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching farm debt history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching debt history',
      error: error.message
    });
  }
};

// Record a standalone debt payment to farm
exports.recordDebtPayment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { farm_id, amount, payment_date, notes, daily_operation_id } = req.body;

    const farm = await Farm.findByPk(farm_id);

    if (!farm) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Farm not found'
      });
    }

    // Record payment
    const payment = await FarmDebtPayment.create({
      farm_id,
      daily_operation_id: daily_operation_id || null,
      amount,
      payment_date,
      notes
    }, { transaction });

    // Update farm's total debt (decrease debt when we pay)
    await farm.update({
      total_debt: parseFloat(farm.total_debt) - parseFloat(amount)
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Debt payment recorded successfully',
      data: payment
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: 'Error recording debt payment',
      error: error.message
    });
  }
};

module.exports = exports;