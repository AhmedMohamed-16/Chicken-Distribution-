const { Vehicle, Partner, VehiclePartner, Safe, FinancialTransaction, sequelize } = require('../models');

exports.getAllVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.findAll({
      include: [{
        model: Partner, as: 'partners',
        through: { attributes: ['share_percentage'] }
      }],
      order: [['name', 'ASC']]
    });

    const formattedVehicles = vehicles.map(v => {
      const vehicle = v.toJSON();
      const totalShares = (vehicle.partners || []).reduce((sum, p) => {
        return sum + parseFloat(p.VehiclePartner?.share_percentage || 0);
      }, 0);
      vehicle.is_fully_invested = Math.abs(totalShares - 100) < 0.01;
      return vehicle;
    });

    res.json({
      success: true,
      data: formattedVehicles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findByPk(req.params.id, {
      include: [{
        model: Partner, as: 'partners',
        through: { attributes: ['share_percentage'] }
      }]
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    const vehicleJson = vehicle.toJSON();
    const totalShares = (vehicleJson.partners || []).reduce((sum, p) => {
      return sum + parseFloat(p.VehiclePartner?.share_percentage || 0);
    }, 0);
    vehicleJson.is_fully_invested = Math.abs(totalShares - 100) < 0.01;

    res.json({
      success: true,
      data: vehicleJson
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vehicle'
    });
  }
};

exports.createVehicle = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { partners, payment_source, safe_id, ...vehicleData } = req.body;

    const vehicle = await Vehicle.create({
      ...vehicleData,
      payment_source: payment_source || 'partners',
      safe_id: payment_source === 'safe' ? safe_id : null
    }, { transaction });

    if (payment_source === 'safe' && safe_id) {
      // ── 1. Validate safe exists and has sufficient balance ──────────────────
      const safe = await Safe.findByPk(safe_id, { transaction });
      if (!safe) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'الخزنة غير موجودة' });
      }

      const currentBalance = parseFloat(safe.current_balance) || 0;
      const price = parseFloat(vehicleData.purchase_price) || 0;
      if (currentBalance < price) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `رصيد الخزنة غير كافٍ. الرصيد الحالي: ${currentBalance.toFixed(2)} ج.م`
        });
      }

      // ── 2. Record financial transaction (OUT from safe) ─────────────────────
      await FinancialTransaction.create({
        transaction_type: 'PURCHASE',
        payment_source_type: 'SAFE',
        payment_source_id: safe_id,
        performed_by_user_id: req.user ? req.user.id : null,
        amount: price,
        direction: 'OUT',
        description: `شراء مركبة: ${vehicleData.name}`,
        reference_type: 'VEHICLE',
        reference_id: vehicle.id
      }, { transaction });

      // ── 3. Deduct from safe balance ─────────────────────────────────────────
      await safe.updateBalance(-price, transaction);

      // ── 4. Auto-distribute equal share to all partners ──────────────────────
      const allPartners = await Partner.findAll({ transaction });
      if (allPartners.length > 0) {
        const equalShare = parseFloat((100 / allPartners.length).toFixed(4));
        for (const partner of allPartners) {
          await VehiclePartner.create({
            vehicle_id: vehicle.id,
            partner_id: partner.id,
            share_percentage: equalShare
          }, { transaction });
        }
      }

    } else if (partners?.length) {
      // ── Manual partner percentages provided by caller ───────────────────────
      for (const partner of partners) {
        await VehiclePartner.create({
          vehicle_id: vehicle.id,
          partner_id: partner.partner_id,
          share_percentage: partner.share_percentage
        }, { transaction });
      }
    }
    // If payment_source === 'partners' with no partners array supplied,
    // VehiclePartner rows are left empty – user will set them from partners page.

    await transaction.commit();

    const fullVehicle = await Vehicle.findByPk(vehicle.id, {
      include: [{
        model: Partner,
        as: 'partners',
        through: { attributes: ['share_percentage'] }
      }]
    });

    return res.status(201).json({
      success: true,
      data: fullVehicle
    });

  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    return res.status(500).json({
      success: false,
      message: 'Error creating vehicle',
      error: error.message
    });
  }
};


exports.updateVehicle = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const vehicle = await Vehicle.findByPk(req.params.id);

    if (!vehicle) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    const { partners, payment_source, safe_id, ...vehicleData } = req.body;

    const oldPrice = parseFloat(vehicle.purchase_price) || 0;
    const oldPaymentSource = vehicle.payment_source;
    const oldSafeId = vehicle.safe_id;

    const newPrice = parseFloat(vehicleData.purchase_price) || 0;
    const newPaymentSource = payment_source || 'partners';
    const newSafeId = newPaymentSource === 'safe' ? safe_id : null;
    
    const priceDiff = newPrice - oldPrice;

    // Update vehicle basic info and payment tracking fields
    await vehicle.update({
      ...vehicleData,
      payment_source: newPaymentSource,
      safe_id: newSafeId
    }, { transaction });

    // ── Handle financial transitions ──────────────────────────────────────────
    
    // Case 1: Payment source changed from partners to safe
    if (oldPaymentSource === 'partners' && newPaymentSource === 'safe' && newSafeId) {
      const safe = await Safe.findByPk(newSafeId, { transaction });
      if (!safe) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'الخزنة غير موجودة' });
      }

      const currentBalance = parseFloat(safe.current_balance) || 0;
      if (currentBalance < newPrice) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `رصيد الخزنة غير كافٍ. الرصيد الحالي: ${currentBalance.toFixed(2)} ج.م`
        });
      }

      await FinancialTransaction.create({
        transaction_type: 'PURCHASE',
        payment_source_type: 'SAFE',
        payment_source_id: newSafeId,
        performed_by_user_id: req.user ? req.user.id : null,
        amount: newPrice,
        direction: 'OUT',
        description: `شراء مركبة: ${vehicle.name}`,
        reference_type: 'VEHICLE',
        reference_id: vehicle.id
      }, { transaction });

      await safe.updateBalance(-newPrice, transaction);
    }
    
    // Case 2: Payment source changed from safe to partners
    else if (oldPaymentSource === 'safe' && newPaymentSource === 'partners' && oldSafeId) {
      const safe = await Safe.findByPk(oldSafeId, { transaction });
      if (safe) {
        await FinancialTransaction.create({
          transaction_type: 'BALANCE_ADJUSTMENT',
          payment_source_type: 'SAFE',
          payment_source_id: oldSafeId,
          performed_by_user_id: req.user ? req.user.id : null,
          amount: oldPrice,
          direction: 'IN',
          description: `إلغاء دفع مركبة من الخزنة (تحويل لشركاء): ${vehicle.name}`,
          reference_type: 'VEHICLE',
          reference_id: vehicle.id
        }, { transaction });

        await safe.updateBalance(oldPrice, transaction);
      }
    }

    // Case 3: Safe changed (Safe A -> Safe B)
    else if (oldPaymentSource === 'safe' && newPaymentSource === 'safe' && oldSafeId !== newSafeId) {
      // Refund old safe
      const oldSafe = await Safe.findByPk(oldSafeId, { transaction });
      if (oldSafe) {
        await FinancialTransaction.create({
          transaction_type: 'BALANCE_ADJUSTMENT',
          payment_source_type: 'SAFE',
          payment_source_id: oldSafeId,
          performed_by_user_id: req.user ? req.user.id : null,
          amount: oldPrice,
          direction: 'IN',
          description: `استرداد ثمن مركبة (تغيير الخزنة): ${vehicle.name}`,
          reference_type: 'VEHICLE',
          reference_id: vehicle.id
        }, { transaction });
        await oldSafe.updateBalance(oldPrice, transaction);
      }

      // Deduct from new safe
      const newSafe = await Safe.findByPk(newSafeId, { transaction });
      if (!newSafe) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'الخزنة الجديدة غير موجودة' });
      }
      
      const currentBalance = parseFloat(newSafe.current_balance) || 0;
      if (currentBalance < newPrice) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `رصيد الخزنة الجديدة غير كافٍ. الرصيد الحالي: ${currentBalance.toFixed(2)} ج.م`
        });
      }

      await FinancialTransaction.create({
        transaction_type: 'PURCHASE',
        payment_source_type: 'SAFE',
        payment_source_id: newSafeId,
        performed_by_user_id: req.user ? req.user.id : null,
        amount: newPrice,
        direction: 'OUT',
        description: `دفع ثمن مركبة (تغيير الخزنة): ${vehicle.name}`,
        reference_type: 'VEHICLE',
        reference_id: vehicle.id
      }, { transaction });
      await newSafe.updateBalance(-newPrice, transaction);
    }

    // Case 4: Same safe, price changed
    else if (newPaymentSource === 'safe' && newSafeId && priceDiff !== 0) {
      const safe = await Safe.findByPk(newSafeId, { transaction });
      if (!safe) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'الخزنة غير موجودة' });
      }

      if (priceDiff > 0) {
        const currentBalance = parseFloat(safe.current_balance) || 0;
        if (currentBalance < priceDiff) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `رصيد الخزنة غير كافٍ للفرق. الرصيد الحالي: ${currentBalance.toFixed(2)} ج.م`
          });
        }
      }

      await FinancialTransaction.create({
        transaction_type: 'BALANCE_ADJUSTMENT',
        payment_source_type: 'SAFE',
        payment_source_id: newSafeId,
        performed_by_user_id: req.user ? req.user.id : null,
        amount: Math.abs(priceDiff),
        direction: priceDiff > 0 ? 'OUT' : 'IN',
        description: `تعديل سعر مركبة: ${vehicle.name}`,
        reference_type: 'VEHICLE',
        reference_id: vehicle.id
      }, { transaction });

      await safe.updateBalance(-priceDiff, transaction);
    }

    // ── Handle partner associations ──────────────────────────────────────────
    if (payment_source === 'safe' && safe_id) {
      // Re-distribute equally among all partners
      await VehiclePartner.destroy({ where: { vehicle_id: vehicle.id }, transaction });

      const allPartners = await Partner.findAll({ transaction });
      if (allPartners.length > 0) {
        const equalShare = parseFloat((100 / allPartners.length).toFixed(4));
        for (const partner of allPartners) {
          await VehiclePartner.create({
            vehicle_id: vehicle.id,
            partner_id: partner.id,
            share_percentage: equalShare
          }, { transaction });
        }
      }
    } else if (partners) {
      // Manual partner list provided
      await VehiclePartner.destroy({ where: { vehicle_id: vehicle.id }, transaction });

      for (const partner of partners) {
        await VehiclePartner.create({
          vehicle_id: vehicle.id,
          partner_id: partner.partner_id,
          share_percentage: partner.share_percentage
        }, { transaction });
      }
    }
    // If payment_source === 'partners' with no partners array, leave existing rows untouched.

    await transaction.commit();

    const fullVehicle = await Vehicle.findByPk(vehicle.id, {
      include: [{
        model: Partner, as: 'partners',
        through: { attributes: ['share_percentage'] }
      }]
    });

    res.json({
      success: true,
      data: fullVehicle
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: 'Error updating vehicle',
      error: error.message
    });
  }
};

exports.deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findByPk(req.params.id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    await vehicle.destroy();

    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting vehicle'
    });
  }
};

module.exports = exports;
