const { TransportLoss, Safe, ChickenType, DailyOperation, sequelize } = require('../models');
const { logTransaction } = require('../utils/transactionLogger');
const AppError = require('../utils/app-error.utility');
const { round2 } = require('../utils/financialUtils');
const { Op } = require('sequelize');


// POST /api/losses
exports.createGeneralLoss = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const {
      chicken_type_id,
      dead_weight,
      price_per_kg,
      reason,
      safe_id,
      payment_method,
      notes,
      daily_operation_id
    } = req.body;

    // 1. Validation
    if (!chicken_type_id || !dead_weight || !price_per_kg) {
      return next(new AppError('يرجى تقديم نوع الدجاج والوزن والسعر', 400));
    }

    const parsedWeight = parseFloat(dead_weight);
    const parsedPrice = parseFloat(price_per_kg);

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      return next(new AppError('يجب أن يكون الوزن أكبر من صفر', 400));
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return next(new AppError('يجب أن يكون السعر أكبر من صفر', 400));
    }

    const loss_amount = round2(parsedWeight * parsedPrice);

    // 2. Create Loss Record
    const loss = await TransportLoss.create({
      daily_operation_id: daily_operation_id || null,
      chicken_type_id,
      dead_weight: parsedWeight,
      price_per_kg: parsedPrice,
      loss_amount,
      source: 'GENERAL',
      location: reason || 'عام',
      notes: notes || null,
      safe_id: safe_id || null,
      payment_method: payment_method || null
    }, { transaction: t });

    // 3. Financial Integration
    // Log the transaction
    await logTransaction({
      transaction_type: 'LOSS',
      direction: 'OUT',
      amount: loss_amount,
      safe_id: safe_id || null,
      reference_type: 'TransportLoss',
      reference_id: loss.id,
      daily_operation_id: daily_operation_id || null,
      performed_by_user_id: req.user.id,
      payment_method: payment_method || 'CASH',
      notes: `خسارة عامة: ${reason || 'بدون سبب محدد'}`
    }, t);

    // Update Safe Balance if applicable
    if (safe_id) {
      const safe = await Safe.findByPk(safe_id, { transaction: t });
      if (!safe) {
        await t.rollback();
        return next(new AppError('الخزينة غير موجودة', 404));
      }
      await safe.updateBalance(-loss_amount, t);
    }

    await t.commit();

    res.status(201).json({
      success: true,
      data: loss
    });

  } catch (error) {
    await t.rollback();
    console.error('Error creating general loss:', error);
    return next(new AppError(error.message, 500));
  }
};

// GET /api/losses
exports.getAllLosses = async (req, res, next) => {
  try {
    const { from, to, source, chicken_type_id } = req.query;

    const where = {};
    if (from || to) {
      where.recorded_at = {};
      if (from) where.recorded_at[Op.gte] = new Date(from);
      if (to) where.recorded_at[Op.lte] = new Date(to);
    }

    if (source) where.source = source;
    if (chicken_type_id) where.chicken_type_id = chicken_type_id;

    const losses = await TransportLoss.findAll({
      where,
      include: [
        { model: ChickenType, as: 'chicken_type', attributes: ['name'] },
        { model: DailyOperation, as: 'operation', attributes: ['operation_date'] }
      ],
      order: [['recorded_at', 'DESC']]
    });

    const total_loss_amount = losses.reduce((sum, l) => sum + parseFloat(l.loss_amount), 0);

    res.status(200).json({
      success: true,
      count: losses.length,
      total_loss_amount: round2(total_loss_amount),
      data: losses
    });

  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

// GET /api/losses/:id
exports.getLossById = async (req, res, next) => {
  try {
    const loss = await TransportLoss.findByPk(req.params.id, {
      include: [
        { model: ChickenType, as: 'chicken_type' },
        { model: DailyOperation, as: 'operation' },
        { model: Safe, as: 'safe', attributes: ['name'] }
      ]
    });

    if (!loss) {
      return next(new AppError('السجل غير موجود', 404));
    }

    res.status(200).json({
      success: true,
      data: loss
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

// GET /api/losses/summary
exports.getLossSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const where = {};
    if (from || to) {
      where.recorded_at = {};
      if (from) where.recorded_at[Op.gte] = new Date(from);
      if (to) where.recorded_at[Op.lte] = new Date(to);
    }

    const losses = await TransportLoss.findAll({
      where,
      include: [{ model: ChickenType, as: 'chicken_type', attributes: ['name'] }]
    });

    const summary = {
      total_losses: 0,
      by_source: {
        TRANSPORT: 0,
        SALE: 0,
        GENERAL: 0
      },
      by_chicken_type: {}
    };

    losses.forEach(l => {
      const amount = parseFloat(l.loss_amount);
      summary.total_losses += amount;
      
      if (summary.by_source[l.source] !== undefined) {
        summary.by_source[l.source] += amount;
      }

      const typeName = l.chicken_type?.name || 'غير معروف';
      summary.by_chicken_type[typeName] = (summary.by_chicken_type[typeName] || 0) + amount;
    });

    // Round all values
    summary.total_losses = round2(summary.total_losses);
    Object.keys(summary.by_source).forEach(k => {
      summary.by_source[k] = round2(summary.by_source[k]);
    });
    Object.keys(summary.by_chicken_type).forEach(k => {
      summary.by_chicken_type[k] = round2(summary.by_chicken_type[k]);
    });

    res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};
