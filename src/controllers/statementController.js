const StatementService = require('../services/StatementService');

class StatementController {
  async getStatement(req, res) {
    try {
      const { entityType, entityId } = req.params;
      const { startDate, endDate } = req.query;

      if (!entityType || !entityId) {
        return res.status(400).json({ success: false, error: 'Entity Type and Entity ID are required' });
      }

      // We parse the dates to Date objects if provided
      let sDate = startDate ? new Date(startDate) : null;
      let eDate = endDate ? new Date(endDate) : null;
      
      // Fix end date to include the whole day if just a date string is provided
      if (eDate) {
        eDate.setHours(23, 59, 59, 999);
      }

      const statement = await StatementService.getStatement(entityType, Number(entityId), sDate, eDate);

      res.status(200).json({
        success: true,
        data: statement
      });
    } catch (error) {
      console.error(`Error in getStatement for ${req.params.entityType} ${req.params.entityId}:`, error);
      res.status(500).json({ success: false, error: error.message || 'Internal server error fetching statement' });
    }
  }
}

module.exports = new StatementController();
