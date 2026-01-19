// src/controllers/buyerController.js
const { Buyer, SaleTransaction, BuyerDebtPayment, DailyOperation } = require('../models');
const { sequelize } = require('../config/database');

exports.getAllBuyers = async (req, res) => {
  try {
    const buyers = await Buyer.findAll({
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: buyers
    });
  } catch (error) {
    console.error('Error fetching buyers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching buyers',
      error: error.message
    });
  }
};

exports.getBuyerById = async (req, res) => {
  try {
    const buyer = await Buyer.findByPk(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: 'Buyer not found'
      });
    }

    res.json({
      success: true,
      data: buyer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching buyer',
      error: error.message
    });
  }
};

exports.createBuyer = async (req, res) => {
  try {
    const buyer = await Buyer.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Buyer created successfully',
      data: buyer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating buyer',
      error: error.message
    });
  }
};

exports.updateBuyer = async (req, res) => {
  try {
    const buyer = await Buyer.findByPk(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: 'Buyer not found'
      });
    }

    // Don't allow manual update of total_debt through this endpoint
    const { total_debt, ...updateData } = req.body;

    await buyer.update(updateData);

    res.json({
      success: true,
      message: 'Buyer updated successfully',
      data: buyer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating buyer',
      error: error.message
    });
  }
};

exports.deleteBuyer = async (req, res) => {
  try {
    const buyer = await Buyer.findByPk(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: 'Buyer not found'
      });
    }

    // Check if buyer has any transactions
    const transactionCount = await SaleTransaction.count({
      where: { buyer_id: req.params.id }
    });

    if (transactionCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete buyer with existing transactions'
      });
    }

    await buyer.destroy();

    res.json({
      success: true,
      message: 'Buyer deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting buyer',
      error: error.message
    });
  }
};

exports.getBuyerDebtHistory = async (req, res) => {
  try {
    const buyer = await Buyer.findByPk(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: 'Buyer not found'
      });
    }

    // Get all sales transactions
    const transactions = await SaleTransaction.findAll({
      where: { buyer_id: req.params.id },
      include: [
        {
          model: DailyOperation,
          attributes: ['id', 'operation_date']
        }
      ],
      order: [['transaction_time', 'DESC']]
    });

    // Get all debt payments
    const payments = await BuyerDebtPayment.findAll({
      where: { buyer_id: req.params.id },
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
        buyer,
        current_debt: buyer.total_debt,
        transactions,
        payments,
        summary: {
          total_sales: transactions.length,
          total_payments: payments.length,
          total_amount_sold: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
          total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid), 0)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching buyer debt history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching debt history',
      error: error.message
    });
  }
};

// Record a standalone debt payment (not part of a sale)
exports.recordDebtPayment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { buyer_id, amount, payment_date, notes, daily_operation_id } = req.body;

    const buyer = await Buyer.findByPk(buyer_id);

    if (!buyer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Buyer not found'
      });
    }

    // Record payment
    const payment = await BuyerDebtPayment.create({
      buyer_id,
      daily_operation_id: daily_operation_id || null,
      amount,
      payment_date,
      notes
    }, { transaction });

    // Update buyer's total debt
    await buyer.update({
      total_debt: parseFloat(buyer.total_debt) - parseFloat(amount)
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