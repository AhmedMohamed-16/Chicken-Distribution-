const { Farm, FarmTransaction, FarmDebtPayment } = require('../models');

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
    res.status(500).json({
      success: false,
      message: 'Error fetching farms'
    });
  }
};

exports.createFarm = async (req, res) => {
  try {
    const farm = await Farm.create(req.body);

    res.status(201).json({
      success: true,
      data: farm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating farm'
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

    const transactions = await FarmTransaction.findAll({
      where: { farm_id: req.params.id },
      include: ['DailyOperation'],
      order: [['transaction_time', 'DESC']]
    });

    const payments = await FarmDebtPayment.findAll({
      where: { farm_id: req.params.id },
      order: [['payment_date', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        farm,
        current_debt: farm.total_debt,
        transactions,
        payments
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching debt history'
    });
  }
};