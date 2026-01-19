const { Partner, Vehicle, VehiclePartner } = require('../models');

exports.getAllPartners = async (req, res) => {
  try {
    const partners = await Partner.findAll({
      include: [{
        model: Vehicle,
        through: { attributes: ['share_percentage'] }
      }],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: partners
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching partners'
    });
  }
};

exports.getPartnerById = async (req, res) => {
  try {
    const partner = await Partner.findByPk(req.params.id, {
      include: [{
        model: Vehicle,
        through: { attributes: ['share_percentage'] }
      }]
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    res.json({
      success: true,
      data: partner
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching partner'
    });
  }
};

exports.createPartner = async (req, res) => {
  try {
    const partner = await Partner.create(req.body);

    res.status(201).json({
      success: true,
      data: partner
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating partner',
      error: error.message
    });
  }
};

exports.updatePartner = async (req, res) => {
  try {
    const partner = await Partner.findByPk(req.params.id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    await partner.update(req.body);

    res.json({
      success: true,
      data: partner
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating partner'
    });
  }
};

exports.deletePartner = async (req, res) => {
  try {
    const partner = await Partner.findByPk(req.params.id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    await partner.destroy();

    res.json({
      success: true,
      message: 'Partner deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting partner'
    });
  }
};