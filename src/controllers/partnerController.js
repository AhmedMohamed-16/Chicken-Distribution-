const { Partner, Vehicle, VehiclePartner, Safe, FinancialTransaction, sequelize, recalculateAllPercentages } = require('../models');
const { logTransaction } = require('../utils/transactionLogger');
const { Op } = require('sequelize');

/**
 * Get all partners with their vehicle investments
 */
exports.getAllPartners = async (req, res) => {
  try {
    const partners = await Partner.findAll({
      include: [{
        model: Vehicle,
        as: 'vehicles',
        through: { 
          attributes: ['share_percentage'],
          as: 'vehicle_share'
        },
        attributes: ['id', 'name', 'plate_number', 'purchase_price']
      }],
      order: [['name', 'ASC']]
    });
    // Calculate total vehicle investments for each partner
    const partnersWithVehicleData = partners.map(partner => {
      const partnerData = partner.toJSON();
      
      // Calculate total vehicle investment
      const totalVehicleInvestment = partnerData.vehicles?.reduce((sum, vehicle) => {
        const sharePercentage = vehicle.vehicle_share?.share_percentage || 0;
        const vehicleValue = parseFloat(vehicle.purchase_price || 0);
        return sum + (vehicleValue * sharePercentage / 100);
      }, 0) || 0;

console.log("partners, partners, partners",partnerData);


      return {
        ...partnerData,
        total_vehicle_investment: totalVehicleInvestment,
        vehicle_count: partnerData.vehicles?.length || 0,
        is_vehicle_partner: (partnerData.vehicles?.length || 0) > 0
      };
    });

    res.json({
      success: true,
      data: partnersWithVehicleData
    });
  } catch (error) {
    console.error('Error fetching partners:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching partners',
      error: error.message
    });
  }
};

/**
 * Get partner by ID with detailed vehicle information
 */
exports.getPartnerById = async (req, res) => {
  try {
    const partner = await Partner.findByPk(req.params.id, {
      include: [{
        model: Vehicle,
        as: 'vehicles',
        through: { 
          attributes: ['share_percentage'],
          as: 'vehicle_share'
        },
        attributes: ['id', 'name', 'plate_number', 'purchase_price', 'empty_weight']
      }]
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const partnerData = partner.toJSON();
    
    // Calculate vehicle investment details
    const vehicleDetails = partnerData.vehicles?.map(vehicle => {
      const sharePercentage = vehicle.vehicle_share?.share_percentage || 0;
      const vehicleValue = parseFloat(vehicle.purchase_price || 0);
      const investmentAmount = vehicleValue * sharePercentage / 100;

      return {
        ...vehicle,
        partner_investment: investmentAmount,
        share_percentage: sharePercentage
      };
    }) || [];

    const totalVehicleInvestment = vehicleDetails.reduce((sum, v) => sum + v.partner_investment, 0);

    res.json({
      success: true,
      data: {
        ...partnerData,
        vehicles: vehicleDetails,
        total_vehicle_investment: totalVehicleInvestment,
        is_vehicle_partner: vehicleDetails.length > 0
      }
    });
  } catch (error) {
    console.error('Error fetching partner:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching partner',
      error: error.message
    });
  }
};

/**
 * Create new partner with optional vehicle assignments
 */
exports.createPartner = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { vehicle_shares, payment_method, safe_id, ...partnerData } = req.body;

    // Create partner
    const partner = await Partner.create(partnerData, { transaction });

    // Handle investment amount in safe
    const investmentAmount = parseFloat(partnerData.investment_amount) || 0;
    if (investmentAmount > 0 && safe_id) {
      const safe = await Safe.findByPk(safe_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!safe) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'الخزنة المحددة غير موجودة'
        });
      }

      // Add investment amount to safe (money coming IN from partner)
      await safe.updateBalance(investmentAmount, transaction);

      // Log financial transaction
      await logTransaction({
        transaction_type: 'PARTNER_INVESTMENT',
        direction: 'IN',
        amount: investmentAmount,
        payment_source_type: 'SAFE',
        payment_source_id: safe_id,
        reference_type: 'Partner',
        reference_id: partner.id,
        performed_by_user_id: req.user?.id,
        payment_method: payment_method || 'CASH',
        received_by_person_type: 'PARTNER',
        received_by_person_id: partner.id,
        notes: `استثمار شريك: ${partner.name} - مبلغ ${investmentAmount} ج.م`
      }, transaction);
    }

    // If vehicle shares are provided, create vehicle-partner relationships
    if (vehicle_shares && Array.isArray(vehicle_shares) && vehicle_shares.length > 0) {
      // Validate total shares per vehicle don't exceed 100%
      const vehicleShareTotals = {};

      for (const share of vehicle_shares) {
        const { vehicle_id, share_percentage } = share;

        // Get existing shares for this vehicle
        const existingShares = await VehiclePartner.findAll({
          where: { vehicle_id },
          transaction
        });

        const totalExisting = existingShares.reduce((sum, s) => sum + parseFloat(s.share_percentage), 0);
        const newTotal = totalExisting + parseFloat(share_percentage);

        if (newTotal > 100) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Vehicle ${vehicle_id} shares would exceed 100% (current: ${totalExisting}%, adding: ${share_percentage}%)`
          });
        }

        // Create vehicle-partner relationship
        await VehiclePartner.create({
          vehicle_id,
          partner_id: partner.id,
          share_percentage
        }, { transaction });
      }

      // Update is_vehicle_partner flag
      await partner.update({ is_vehicle_partner: true }, { transaction });

      // Recalculate percentages because vehicle shares changed
      await recalculateAllPercentages(transaction);
    }

    await transaction.commit();

    // Fetch complete partner data with vehicles
    const completePartner = await Partner.findByPk(partner.id, {
      include: [{
        model: Vehicle,
        as: 'vehicles',
        through: { attributes: ['share_percentage'] }
      }]
    });

    res.status(201).json({
      success: true,
      data: completePartner
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating partner:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating partner',
      error: error.message
    });
  }
};

/**
 * Update partner and vehicle assignments
 */
exports.updatePartner = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { vehicle_shares, payment_method, safe_id, ...partnerData } = req.body;

    const partner = await Partner.findByPk(req.params.id, { transaction });

    if (!partner) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Store original investment amount for delta calculation
    const originalInvestment = parseFloat(partner.investment_amount) || 0;
    const newInvestment = parseFloat(partnerData.investment_amount) || 0;
    const investmentDelta = newInvestment - originalInvestment;

    // Handle investment change with safe balance
    if (investmentDelta !== 0 && safe_id) {
      const safe = await Safe.findByPk(safe_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!safe) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'الخزنة المحددة غير موجودة'
        });
      }

      if (investmentDelta > 0) {
        // Partner increased investment: money comes IN to safe
        await safe.updateBalance(investmentDelta, transaction);

        await logTransaction({
          transaction_type: 'PARTNER_INVESTMENT',
          direction: 'IN',
          amount: investmentDelta,
          payment_source_type: 'SAFE',
          payment_source_id: safe_id,
          reference_type: 'Partner',
          reference_id: partner.id,
          performed_by_user_id: req.user?.id,
          payment_method: payment_method || 'CASH',
          received_by_person_type: 'PARTNER',
          received_by_person_id: partner.id,
          notes: `زيادة استثمار شريك: ${partner.name} - مبلغ ${investmentDelta} ج.م`
        }, transaction);
      } else {
        // Partner decreased investment: money goes OUT from safe (refund)
        const refundAmount = Math.abs(investmentDelta);

        // Check safe has enough balance for refund
        if (parseFloat(safe.current_balance) < refundAmount) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'رصيد الخزنة غير كافٍ لاسترداد مبلغ الاستثمار'
          });
        }

        await safe.updateBalance(-refundAmount, transaction);

        await logTransaction({
          transaction_type: 'PARTNER_INVESTMENT',
          direction: 'OUT',
          amount: refundAmount,
          payment_source_type: 'SAFE',
          payment_source_id: safe_id,
          reference_type: 'Partner',
          reference_id: partner.id,
          performed_by_user_id: req.user?.id,
          payment_method: payment_method || 'CASH',
          paid_by_person_type: 'PARTNER',
          paid_by_person_id: partner.id,
          notes: `تخفيض استثمار شريك: ${partner.name} - استرداد ${refundAmount} ج.م`
        }, transaction);
      }
    }

    // Update partner basic data
    await partner.update(partnerData, { transaction });
    if ('investment_amount' in partnerData) {
      await recalculateAllPercentages(transaction);
    }

    // Handle vehicle share updates if provided
    if (vehicle_shares !== undefined) {
      // Remove existing vehicle relationships
      await VehiclePartner.destroy({
        where: { partner_id: partner.id },
        transaction
      });

      // Add new vehicle relationships
      if (Array.isArray(vehicle_shares) && vehicle_shares.length > 0) {
        for (const share of vehicle_shares) {
          const { vehicle_id, share_percentage } = share;

          // Validate share doesn't exceed 100% for this vehicle
          const existingShares = await VehiclePartner.findAll({
            where: {
              vehicle_id,
              partner_id: { [Op.ne]: partner.id }
            },
            transaction
          });

          const totalExisting = existingShares.reduce((sum, s) => sum + parseFloat(s.share_percentage), 0);
          const newTotal = totalExisting + parseFloat(share_percentage);

          if (newTotal > 100) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: `Vehicle ${vehicle_id} shares would exceed 100% (other partners: ${totalExisting}%, adding: ${share_percentage}%)`
            });
          }

          await VehiclePartner.create({
            vehicle_id,
            partner_id: partner.id,
            share_percentage
          }, { transaction });
        }

        await partner.update({ is_vehicle_partner: true }, { transaction });
      } else {
        await partner.update({ is_vehicle_partner: false }, { transaction });
      }

      // Recalculate percentages because vehicle shares changed
      await recalculateAllPercentages(transaction);
    }

    await transaction.commit();

    // Fetch updated partner with vehicles
    const updatedPartner = await Partner.findByPk(partner.id, {
      include: [{
        model: Vehicle,
        as: 'vehicles',
        through: { attributes: ['share_percentage'] }
      }]
    });

    res.json({
      success: true,
      data: updatedPartner
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating partner:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating partner',
      error: error.message
    });
  }
};

/**
 * Delete partner (checks for dependencies first)
 */
exports.deletePartner = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const partner = await Partner.findByPk(req.params.id, {
      include: [{
        model: Vehicle,
        as: 'vehicles'
      }]
    });

    if (!partner) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Check if partner has vehicle investments
    if (partner.vehicles && partner.vehicles.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete partner with vehicle investments. Remove vehicle assignments first.',
        vehicles: partner.vehicles.map(v => ({ id: v.id, name: v.name }))
      });
    }

    // Remove vehicle-partner relationships (if any remain)
    await VehiclePartner.destroy({
      where: { partner_id: partner.id },
      transaction
    });

    // Delete partner
    await partner.destroy({ transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Partner deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting partner:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting partner',
      error: error.message
    });
  }
};

/**
 * Get partner's vehicle investments summary
 */
exports.getPartnerVehicleInvestments = async (req, res) => {
  try {
    const partner = await Partner.findByPk(req.params.id, {
      include: [{
        model: Vehicle,
        as: 'vehicles',
        through: { attributes: ['share_percentage'] }
      }]
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const investments = partner.vehicles.map(vehicle => ({
      vehicle_id: vehicle.id,
      vehicle_name: vehicle.name,
      plate_number: vehicle.plate_number,
      vehicle_value: parseFloat(vehicle.purchase_price),
      share_percentage: parseFloat(vehicle.VehiclePartner.share_percentage),
      investment_amount: parseFloat(vehicle.purchase_price) * parseFloat(vehicle.VehiclePartner.share_percentage) / 100
    }));

    const totalInvestment = investments.reduce((sum, inv) => sum + inv.investment_amount, 0);

    res.json({
      success: true,
      data: {
        partner_id: partner.id,
        partner_name: partner.name,
        total_investment: partner.investment_amount,
        total_vehicle_investment: totalInvestment,
        vehicles: investments
      }
    });
  } catch (error) {
    console.error('Error fetching partner vehicle investments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vehicle investments',
      error: error.message
    });
  }
};

/**
 * Add vehicle share to partner
 */
exports.addVehicleShare = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { vehicle_id, share_percentage } = req.body;
    const partner_id = req.params.id;

    // Validate partner exists
    const partner = await Partner.findByPk(partner_id);
    if (!partner) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Validate vehicle exists
    const vehicle = await Vehicle.findByPk(vehicle_id);
    if (!vehicle) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // Check if relationship already exists
    const existing = await VehiclePartner.findOne({
      where: { vehicle_id, partner_id },
      transaction
    });

    if (existing) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Partner already has a share in this vehicle'
      });
    }

    // Validate total shares don't exceed 100%
    const existingShares = await VehiclePartner.findAll({
      where: { vehicle_id },
      transaction
    });

    const totalExisting = existingShares.reduce((sum, s) => sum + parseFloat(s.share_percentage), 0);
    const newTotal = totalExisting + parseFloat(share_percentage);

    if (newTotal > 100) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Total shares would exceed 100% (current: ${totalExisting}%, adding: ${share_percentage}%)`
      });
    }

    // Create vehicle-partner relationship
    const vehiclePartner = await VehiclePartner.create({
      vehicle_id,
      partner_id,
      share_percentage
    }, { transaction });

    // Update is_vehicle_partner flag
    await partner.update({ is_vehicle_partner: true }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: vehiclePartner
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error adding vehicle share:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding vehicle share',
      error: error.message
    });
  }
};

/**
 * Remove vehicle share from partner
 */
exports.removeVehicleShare = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { partnerId, vehicleId } = req.params;

    const deleted = await VehiclePartner.destroy({
      where: {
        partner_id: partnerId,
        vehicle_id: vehicleId
      },
      transaction
    });

    if (deleted === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vehicle share not found'
      });
    }

    // Check if partner still has other vehicle shares
    const remainingShares = await VehiclePartner.count({
      where: { partner_id: partnerId },
      transaction
    });

    // Update is_vehicle_partner flag if no more vehicles
    if (remainingShares === 0) {
      await Partner.update(
        { is_vehicle_partner: false },
        { where: { id: partnerId }, transaction }
      );
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Vehicle share removed successfully'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error removing vehicle share:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing vehicle share',
      error: error.message
    });
  }
};