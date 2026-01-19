const { Vehicle, Partner, VehiclePartner } = require('../models');

exports.getAllVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.findAll({
      include: [{
        model: Partner,
        through: { attributes: ['share_percentage'] }
      }],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: vehicles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vehicles'
    });
  }
};

exports.getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findByPk(req.params.id, {
      include: [{
        model: Partner,
        through: { attributes: ['share_percentage'] }
      }]
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      data: vehicle
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
    const { partners, ...vehicleData } = req.body;

    const vehicle = await Vehicle.create(vehicleData, { transaction });

    // Create vehicle-partner associations
    if (partners && partners.length > 0) {
      for (const partner of partners) {
        await VehiclePartner.create({
          vehicle_id: vehicle.id,
          partner_id: partner.partner_id,
          share_percentage: partner.share_percentage
        }, { transaction });
      }
    }

    await transaction.commit();

    const fullVehicle = await Vehicle.findByPk(vehicle.id, {
      include: [{
        model: Partner,
        through: { attributes: ['share_percentage'] }
      }]
    });

    res.status(201).json({
      success: true,
      data: fullVehicle
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
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

    const { partners, ...vehicleData } = req.body;

    await vehicle.update(vehicleData, { transaction });

    // Update vehicle-partner associations if provided
    if (partners) {
      await VehiclePartner.destroy({
        where: { vehicle_id: vehicle.id },
        transaction
      });

      for (const partner of partners) {
        await VehiclePartner.create({
          vehicle_id: vehicle.id,
          partner_id: partner.partner_id,
          share_percentage: partner.share_percentage
        }, { transaction });
      }
    }

    await transaction.commit();

    const fullVehicle = await Vehicle.findByPk(vehicle.id, {
      include: [{
        model: Partner,
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
      message: 'Error updating vehicle'
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
