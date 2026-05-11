// const { Op } = require('sequelize');
// const { 
//   Buyer, 
//   BuyerDebtPayment, 
//   SaleTransaction,
//   Farm,
//   FarmDebtPayment,
//   FarmTransaction,
//   CostCategory,
//   DailyCost,
//   CostDebtPayment,
//   Partner,
//   PartnerProfit,
//   ProfitDistribution,
//   PartnerReinvestment,
//   PartnerWithdrawal,
//   Employee,
//   PersonAdvance,
//   AdvanceReturn,
//   SalaryPayment,
//   FinancialTransaction
// } = require('../models');

// class StatementService {
//   /**
//    * Main entry point to get unified account statement
//    */
//   static async getStatement(entityType, entityId, startDate = null, endDate = null) {
//     const transactions = await this._fetchTransactions(entityType, entityId, startDate, endDate);
    
//     // Sort transactions chronologically
//     // Use a secondary sort on type to ensure Sale comes before its immediate payment
//     transactions.sort((a, b) => {
//       const dateDiff = new Date(a.date) - new Date(b.date);
//       if (dateDiff !== 0) return dateDiff;
      
//       // Secondary sort: Primary event (SALE/PURCHASE/COST) should come before IMMEDIATE_PAYMENT
//       const priority = {
//         'SALE': 1,
//         'PURCHASE': 1,
//         'COST': 1,
//         'IMMEDIATE_PAYMENT': 2,
//         'PAYMENT_RECEIVED': 3,
//         'PAYMENT_SENT': 3
//       };
//       return (priority[a.type] || 9) - (priority[b.type] || 9);
//     });

//     return await this._buildChronologicalLedger(entityType, entityId, transactions, startDate, endDate);
//   }

//   static async _buildChronologicalLedger(entityType, entityId, dateFilteredTransactions, startDate, endDate) {
//     const currentBalance = await this._getCurrentBalance(entityType, entityId);
//     const futureImpact = await this._getFutureBalanceImpact(entityType, entityId, endDate);
//     const closingBalance = currentBalance - futureImpact;
//     const rangeImpact = dateFilteredTransactions.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
//     const openingBalance = closingBalance - rangeImpact;

//     let current = openingBalance;
//     let previousType = current > 0 ? 'RECEIVABLE' : (current < 0 ? 'CREDIT' : 'SETTLED');

//     const transactionsWithRunningBalance = dateFilteredTransactions.map(t => {
//       const impact = Number(t.balanceImpact) || 0;
//       current += impact;
      
//       const newType = current > 0 ? 'RECEIVABLE' : (current < 0 ? 'CREDIT' : 'SETTLED');
//       const directionChanged = previousType !== newType && previousType !== 'SETTLED' && newType !== 'SETTLED';
//       previousType = newType;

//       return {
//         ...t,
//         balance_after: current,
//         direction_change: directionChanged
//       };
//     });

//     return {
//       entityType,
//       entityId,
//       opening_balance: openingBalance,
//       closing_balance: closingBalance,
//       transactions: transactionsWithRunningBalance
//     };
//   }

//   static async _getCurrentBalance(entityType, entityId) {
//     switch(entityType.toUpperCase()) {
//       case 'BUYER': {
//         const b = await Buyer.findByPk(entityId);
//         return b ? Number(b.current_balance) : 0;
//       }
//       case 'FARM': {
//         const f = await Farm.findByPk(entityId);
//         return f ? Number(f.current_balance) : 0;
//       }
//       case 'COST_CATEGORY': {
//         const c = await CostCategory.findByPk(entityId);
//         return c ? Number(c.current_balance) : 0;
//       }
//       case 'PARTNER': {
//         const p = await Partner.findByPk(entityId);
//         return p ? Number(p.current_balance) : 0;
//       }
//       case 'SAFE':
//       case 'CUSTODY': {
//         const balance = await FinancialTransaction.getPaymentSourceSummary(entityType.toUpperCase(), entityId);
//         return Number(balance) || 0;
//       }
//       case 'EMPLOYEE': {
//         return await this._getEmployeeCurrentBalance(entityId);
//       }
//       default:
//         throw new Error(`Unsupported entity type: ${entityType}`);
//     }
//   }

//   static async _getFutureBalanceImpact(entityType, entityId, endDate) {
//     if (!endDate) return 0;
//     const futureTransactions = await this._fetchTransactions(entityType, entityId, endDate, null, true);
//     return futureTransactions.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
//   }

//   static async _fetchTransactions(entityType, entityId, startDate, endDate, strictlyAfter = false) {
//     switch(entityType.toUpperCase()) {
//       case 'BUYER':
//         return await this._fetchBuyerTransactions(entityId, startDate, endDate, strictlyAfter);
//       case 'FARM':
//         return await this._fetchFarmTransactions(entityId, startDate, endDate, strictlyAfter);
//       case 'COST_CATEGORY':
//         return await this._fetchCostTransactions(entityId, startDate, endDate, strictlyAfter);
//       case 'PARTNER':
//         return await this._fetchPartnerTransactions(entityId, startDate, endDate, strictlyAfter);
//       case 'EMPLOYEE':
//         return await this._fetchEmployeeTransactions(entityId, startDate, endDate, strictlyAfter);
//       case 'SAFE':
//       case 'CUSTODY':
//         return await this._fetchSafeCustodyTransactions(entityType.toUpperCase(), entityId, startDate, endDate, strictlyAfter);
//       default:
//         throw new Error(`Unsupported entity type: ${entityType}`);
//     }
//   }

//   static async _fetchBuyerTransactions(buyerId, startDate, endDate, strictlyAfter) {
//     const saleWhere = { buyer_id: buyerId };
//     const payWhere = { buyer_id: buyerId };
    
//     this._applyDateFilter(saleWhere, 'transaction_time', startDate, endDate, strictlyAfter);
//     this._applyDateFilter(payWhere, 'payment_date', startDate, endDate, strictlyAfter);

//     const sales = await SaleTransaction.findAll({ where: saleWhere });
//     const payments = await BuyerDebtPayment.findAll({ where: payWhere });

//     const unified = [];
//     for (const s of sales) {
//       const finalAmt = Number(s.final_amount) || 0;
//       const paidAmt = Number(s.paid_amount) || 0;
      
//       // 1. Record the Sale (Gross Debt increase)
//       unified.push({
//         date: s.transaction_time,
//         type: 'SALE',
//         amount: finalAmt,
//         balanceImpact: finalAmt,
//         reference: `Sale #${s.id}`,
//         entity_id: buyerId
//       });

//       // 2. Record the immediate payment if any
//       if (paidAmt > 0) {
//         unified.push({
//           date: s.transaction_time,
//           type: 'IMMEDIATE_PAYMENT',
//           amount: paidAmt,
//           balanceImpact: -paidAmt,
//           reference: `Immediate Payment for Sale #${s.id}`,
//           entity_id: buyerId
//         });
//       }
//     }

//     for (const p of payments) {
//       const amt = Number(p.amount) || 0;
//       unified.push({
//         date: p.payment_date,
//         type: p.payment_direction === 'FROM_BUYER' ? 'PAYMENT_RECEIVED' : 'PAYMENT_SENT',
//         amount: amt,
//         balanceImpact: p.payment_direction === 'FROM_BUYER' ? -amt : amt,
//         reference: p.displayDescription || `Payment #${p.id}`,
//         entity_id: buyerId
//       });
//     }
//     return unified;
//   }

//   static async _fetchFarmTransactions(farmId, startDate, endDate, strictlyAfter) {
//     const farmWhere = { farm_id: farmId };
//     const payWhere = { farm_id: farmId };
    
//     this._applyDateFilter(farmWhere, 'transaction_time', startDate, endDate, strictlyAfter);
//     this._applyDateFilter(payWhere, 'payment_date', startDate, endDate, strictlyAfter);

//     const purchases = await FarmTransaction.findAll({ where: farmWhere });
//     const payments = await FarmDebtPayment.findAll({ where: payWhere });

//     const unified = [];
//     for (const p of purchases) {
//       const totalAmt = Number(p.total_amount) || 0;
//       const paidAmt = Number(p.paid_amount) || 0;
      
//       // 1. Record the Purchase (Gross Debt increase)
//       unified.push({
//         date: p.transaction_time,
//         type: 'PURCHASE',
//         amount: totalAmt,
//         balanceImpact: totalAmt,
//         reference: `Purchase #${p.id}`,
//         entity_id: farmId
//       });

//       // 2. Record the immediate payment if any
//       if (paidAmt > 0) {
//         unified.push({
//           date: p.transaction_time,
//           type: 'IMMEDIATE_PAYMENT',
//           amount: paidAmt,
//           balanceImpact: -paidAmt,
//           reference: `Immediate Payment for Purchase #${p.id}`,
//           entity_id: farmId
//         });
//       }
//     }

//     for (const p of payments) {
//       const amt = Number(p.amount) || 0;
//       unified.push({
//         date: p.payment_date,
//         type: p.payment_direction === 'TO_FARM' ? 'PAYMENT_SENT' : 'PAYMENT_RECEIVED',
//         amount: amt,
//         balanceImpact: p.payment_direction === 'TO_FARM' ? -amt : amt,
//         reference: p.displayDescription || `Payment #${p.id}`,
//         entity_id: farmId
//       });
//     }
//     return unified;
//   }

//   static async _fetchCostTransactions(categoryId, startDate, endDate, strictlyAfter) {
//     const costWhere = { cost_category_id: categoryId };
//     const payWhere = { cost_category_id: categoryId };
    
//     this._applyDateFilter(costWhere, 'recorded_at', startDate, endDate, strictlyAfter);
//     this._applyDateFilter(payWhere, 'payment_date', startDate, endDate, strictlyAfter);

//     const costs = await DailyCost.findAll({ where: costWhere });
//     const payments = await CostDebtPayment.findAll({ where: payWhere });

//     const unified = [];
//     for (const c of costs) {
//       const amt = Number(c.amount) || 0;
//       const paid = Number(c.paid_amount) || 0;
      
//       // 1. Record the Cost (Gross Debt increase)
//       unified.push({
//         date: c.recorded_at,
//         type: 'COST',
//         amount: amt,
//         balanceImpact: amt,
//         reference: `Cost #${c.id}: ${c.description || ''}`,
//         entity_id: categoryId
//       });

//       // 2. Record the immediate payment if any
//       if (paid > 0) {
//         unified.push({
//           date: c.recorded_at,
//           type: 'IMMEDIATE_PAYMENT',
//           amount: paid,
//           balanceImpact: -paid,
//           reference: `Immediate Payment for Cost #${c.id}`,
//           entity_id: categoryId
//         });
//       }
//     }

//     for (const p of payments) {
//       const amt = Number(p.amount) || 0;
//       unified.push({
//         date: p.payment_date,
//         type: p.payment_direction === 'TO_CATEGORY' ? 'PAYMENT_SENT' : 'PAYMENT_RECEIVED',
//         amount: amt,
//         balanceImpact: p.payment_direction === 'TO_CATEGORY' ? -amt : amt,
//         reference: p.displayDescription || `Payment #${p.id}`,
//         entity_id: categoryId
//       });
//     }
//     return unified;
//   }

//   static async _fetchPartnerTransactions(partnerId, startDate, endDate, strictlyAfter) {
//     const profitWhere = { partner_id: partnerId };
//     const reinvWhere = { partner_id: partnerId };
//     const withWhere = { partner_id: partnerId };

//     const profits = await PartnerProfit.findAll({ 
//       where: profitWhere,
//       include: [{
//         model: ProfitDistribution,
//         as: 'profit_distribution',
//         where: this._getDateFilter('calculated_at', startDate, endDate, strictlyAfter)
//       }]
//     });

//     this._applyDateFilter(reinvWhere, 'reinvest_date', startDate, endDate, strictlyAfter);
//     this._applyDateFilter(withWhere, 'withdrawal_date', startDate, endDate, strictlyAfter);

//     const reinvestments = await PartnerReinvestment.findAll({ where: reinvWhere });
//     const withdrawals = await PartnerWithdrawal.findAll({ where: withWhere });

//     const unified = [];
//     for (const p of profits) {
//       unified.push({
//         date: p.distribution ? p.distribution.calculated_at : new Date(),
//         type: 'PROFIT',
//         amount: Number(p.final_profit),
//         balanceImpact: Number(p.final_profit),
//         reference: `Profit #${p.id}`,
//         entity_id: partnerId
//       });
//     }
//     for (const r of reinvestments) {
//       unified.push({
//         date: r.reinvest_date,
//         type: 'REINVESTMENT',
//         amount: Number(r.amount),
//         balanceImpact: -Number(r.amount),
//         reference: `Reinvestment #${r.id}`,
//         entity_id: partnerId
//       });
//     }
//     for (const w of withdrawals) {
//       unified.push({
//         date: w.withdrawal_date,
//         type: 'WITHDRAWAL',
//         amount: Number(w.amount),
//         balanceImpact: -Number(w.amount),
//         reference: `Withdrawal #${w.id}`,
//         entity_id: partnerId
//       });
//     }
//     return unified;
//   }

//   static async _fetchEmployeeTransactions(employeeId, startDate, endDate, strictlyAfter) {
//     const advWhere = { person_id: employeeId, person_type: 'EMPLOYEE' };
//     const advRetWhere = { person_id: employeeId, person_type: 'EMPLOYEE' };
//     const salWhere = { employee_id: employeeId };

//     this._applyDateFilter(advWhere, 'advance_date', startDate, endDate, strictlyAfter);
//     this._applyDateFilter(advRetWhere, 'return_date', startDate, endDate, strictlyAfter);
//     this._applyDateFilter(salWhere, 'payment_date', startDate, endDate, strictlyAfter);

//     const advances = await PersonAdvance.findAll({ where: advWhere });
//     const returns = await AdvanceReturn.findAll({ where: advRetWhere });
//     const salaries = await SalaryPayment.findAll({ where: salWhere });

//     const unified = [];
//     for (const a of advances) {
//       unified.push({
//         date: a.advance_date,
//         type: 'ADVANCE',
//         amount: Number(a.amount),
//         balanceImpact: Number(a.amount),
//         reference: `Advance #${a.id}: ${a.description || ''}`,
//         entity_id: employeeId
//       });
//     }
//     for (const r of returns) {
//       unified.push({
//         date: r.return_date,
//         type: 'ADVANCE_RETURN',
//         amount: Number(r.amount),
//         balanceImpact: -Number(r.amount),
//         reference: `Return #${r.id}`,
//         entity_id: employeeId
//       });
//     }
//     for (const s of salaries) {
//       unified.push({
//         date: s.payment_date,
//         type: 'SALARY_PAYMENT',
//         amount: Number(s.amount),
//         balanceImpact: Number(s.balanceImpact) || 0,
//         reference: `Salary #${s.id}`,
//         entity_id: employeeId
//       });
//     }
//     return unified;
//   }

//   static async _getEmployeeCurrentBalance(employeeId) {
//     const tx = await this._fetchEmployeeTransactions(employeeId, null, null, false);
//     return tx.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
//   }

//   static async _fetchSafeCustodyTransactions(type, entityId, startDate, endDate, strictlyAfter) {
//     const where = { payment_source_type: type, payment_source_id: entityId };
//     this._applyDateFilter(where, 'created_at', startDate, endDate, strictlyAfter);

//     const txs = await FinancialTransaction.findAll({ where });
    
//     return txs.map(t => {
//       const amt = Number(t.amount);
//       return {
//         date: t.created_at,
//         type: t.transaction_type,
//         amount: amt,
//         balanceImpact: t.direction === 'IN' ? amt : -amt,
//         reference: `Ref: ${t.reference_type} #${t.reference_id}`,
//         entity_id: entityId
//       };
//     });
//   }

//   static _applyDateFilter(whereObj, dateField, startDate, endDate, strictlyAfter) {
//     const filter = this._getDateFilter(dateField, startDate, endDate, strictlyAfter);
//     if (filter && filter[dateField]) {
//       whereObj[dateField] = filter[dateField];
//     }
//   }

//   static _getDateFilter(dateField, startDate, endDate, strictlyAfter) {
//     if (strictlyAfter) {
//       return { [dateField]: { [Op.gt]: startDate } };
//     } else {
//       if (startDate || endDate) {
//         const filter = {};
//         if (startDate) filter[Op.gte] = startDate;
//         if (endDate) filter[Op.lte] = endDate;
//         return { [dateField]: filter };
//       }
//     }
//     return null;
//   }
// }

// module.exports = StatementService;

const { Op } = require('sequelize');
const { 
  Buyer, 
  BuyerDebtPayment, 
  SaleTransaction,
  Farm,
  FarmDebtPayment,
  FarmTransaction,
  CostCategory,
  DailyCost,
  CostDebtPayment,
  Partner,
  PartnerProfit,
  ProfitDistribution,
  PartnerReinvestment,
  PartnerWithdrawal,
  Employee,
  PersonAdvance,
  AdvanceReturn,
  SalaryPayment,
  FinancialTransaction
} = require('../models');

// Keep original English `type` values for sorting and API compatibility.
// Add `type_label` (Arabic) for UI.
class StatementService {
  static _typeLabel(type) {
    const map = {
      'SALE': 'بيع',
      'PURCHASE': 'شراء',
      'COST': 'تكلفة',
      'IMMEDIATE_PAYMENT': 'سداد فوري',
      'PAYMENT_RECEIVED': 'مبلغ مستلم',
      'PAYMENT_SENT': 'مبلغ مدفوع',
      'PROFIT': 'ربح',
      'REINVESTMENT': 'إعادة استثمار',
      'WITHDRAWAL': 'سحب',
      'ADVANCE': 'سلفة',
      'ADVANCE_RETURN': 'مرتجع',
      'SALARY_PAYMENT': 'صرف راتب',
      'SALARY_SETTLEMENT': 'تسوية',
      'SETTLED': 'تم التسوية',
      'RECEIVABLE': 'مستحق',
      'CREDIT': 'ائتمان'
    };
    return map[type] || type;
  }

  /**
   * Main entry point to get unified account statement
   */
  static async getStatement(entityType, entityId, startDate = null, endDate = null) {
    const transactions = await this._fetchTransactions(entityType, entityId, startDate, endDate);

    transactions.sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;

      const priority = {
        'SALE': 1,
        'PURCHASE': 1,
        'COST': 1,
        'IMMEDIATE_PAYMENT': 2,
        'PAYMENT_RECEIVED': 3,
        'PAYMENT_SENT': 3
      };
      return (priority[a.type] || 9) - (priority[b.type] || 9);
    });

    return await this._buildChronologicalLedger(entityType, entityId, transactions, startDate, endDate);
  }

  static async _buildChronologicalLedger(entityType, entityId, dateFilteredTransactions, startDate, endDate) {
    const currentBalance = await this._getCurrentBalance(entityType, entityId);
    const futureImpact = await this._getFutureBalanceImpact(entityType, entityId, endDate);
    const closingBalance = currentBalance - futureImpact;
    const rangeImpact = dateFilteredTransactions.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
    const openingBalance = closingBalance - rangeImpact;

    let current = openingBalance;
    let previousType = current > 0 ? 'RECEIVABLE' : (current < 0 ? 'CREDIT' : 'SETTLED');

    const transactionsWithRunningBalance = dateFilteredTransactions.map(t => {
      const impact = Number(t.balanceImpact) || 0;
      current += impact;

      const newType = current > 0 ? 'RECEIVABLE' : (current < 0 ? 'CREDIT' : 'SETTLED');
      const directionChanged = previousType !== newType && previousType !== 'SETTLED' && newType !== 'SETTLED';
      previousType = newType;

      return {
        ...t,
        type_label: this._typeLabel(t.type),
        balance_after: current,
        direction_change: directionChanged
      };
    });

    return {
      entityType,
      entityId,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      transactions: transactionsWithRunningBalance
    };
  }

  static async _getCurrentBalance(entityType, entityId) {
    switch(entityType.toUpperCase()) {
      case 'BUYER': {
        const b = await Buyer.findByPk(entityId);
        return b ? Number(b.current_balance) : 0;
      }
      case 'FARM': {
        const f = await Farm.findByPk(entityId);
        return f ? Number(f.current_balance) : 0;
      }
      case 'COST_CATEGORY': {
        const c = await CostCategory.findByPk(entityId);
        return c ? Number(c.current_balance) : 0;
      }
      case 'PARTNER': {
        const p = await Partner.findByPk(entityId);
        return p ? Number(p.current_balance) : 0;
      }
      case 'SAFE':
      case 'CUSTODY': {
        const balance = await FinancialTransaction.getPaymentSourceSummary(entityType.toUpperCase(), entityId);
        return Number(balance) || 0;
      }
      case 'EMPLOYEE': {
        const advanceBal = await this._getAdvanceCurrentBalance(entityId);
        const salaryBal = await this._getEmployeeSalaryCurrentBalance(entityId);
        return advanceBal + salaryBal;
      }
      case 'EMPLOYEE_SALARY': {
        return await this._getEmployeeSalaryCurrentBalance(entityId);
      }
      case 'ADVANCE': {
        return await this._getAdvanceCurrentBalance(entityId);
      }
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  static async _getFutureBalanceImpact(entityType, entityId, endDate) {
    if (!endDate) return 0;
    const futureTransactions = await this._fetchTransactions(entityType, entityId, endDate, null, true);
    return futureTransactions.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
  }

  static async _fetchTransactions(entityType, entityId, startDate, endDate, strictlyAfter = false) {
    switch(entityType.toUpperCase()) {
      case 'BUYER':
        return await this._fetchBuyerTransactions(entityId, startDate, endDate, strictlyAfter);
      case 'FARM':
        return await this._fetchFarmTransactions(entityId, startDate, endDate, strictlyAfter);
      case 'COST_CATEGORY':
        return await this._fetchCostTransactions(entityId, startDate, endDate, strictlyAfter);
      case 'PARTNER':
        return await this._fetchPartnerTransactions(entityId, startDate, endDate, strictlyAfter);
      case 'EMPLOYEE':
        return await this._fetchEmployeeSalaryTransactions(entityId, startDate, endDate, strictlyAfter);
      case 'EMPLOYEE_SALARY':
        return await this._fetchEmployeeSalaryTransactions(entityId, startDate, endDate, strictlyAfter);
      case 'ADVANCE':
        return await this._fetchAdvanceTransactions(entityId, startDate, endDate, strictlyAfter);
      case 'SAFE':
      case 'CUSTODY':
        return await this._fetchSafeCustodyTransactions(entityType.toUpperCase(), entityId, startDate, endDate, strictlyAfter);
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  static async _fetchBuyerTransactions(buyerId, startDate, endDate, strictlyAfter) {
    const saleWhere = { buyer_id: buyerId };
    const payWhere = { buyer_id: buyerId };

    this._applyDateFilter(saleWhere, 'transaction_time', startDate, endDate, strictlyAfter);
    this._applyDateFilter(payWhere, 'payment_date', startDate, endDate, strictlyAfter);

    const sales = await SaleTransaction.findAll({ where: saleWhere });
    const payments = await BuyerDebtPayment.findAll({ where: payWhere });

    const unified = [];

    // const map = {
    //   SALE: 'SALE',
    //   PURCHASE: 'PURCHASE',
    //   COST: 'COST',
    //   IMMEDIATE_PAYMENT: 'IMMEDIATE_PAYMENT',
    //   PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
    //   PAYMENT_SENT: 'PAYMENT_SENT',
    //   PROFIT: 'PROFIT',
    //   REINVESTMENT: 'REINVESTMENT',
    //   WITHDRAWAL: 'WITHDRAWAL',
    //   ADVANCE: 'ADVANCE',
    //   ADVANCE_RETURN: 'ADVANCE_RETURN',
    //   SALARY_PAYMENT: 'SALARY_PAYMENT',
    //   SALARY_SETTLEMENT: 'SALARY_SETTLEMENT',
    //   SETTLED: 'SETTLED',
    //   RECEIVABLE: 'RECEIVABLE',
    //   CREDIT: 'CREDIT'
    // };

    for (const s of sales) {
      const finalAmt = Number(s.final_amount) || 0;
      const paidAmt = Number(s.paid_amount) || 0;

      unified.push({
        date: s.transaction_time,
        type: this._typeLabel('SALE'),
        amount: finalAmt,
        balanceImpact: finalAmt,
        reference: `عملية بيع رقم #${s.id}`,
        entity_id: buyerId
      });

      if (paidAmt > 0) {
        unified.push({
          date: s.transaction_time,
          type: this._typeLabel('IMMEDIATE_PAYMENT'),
          amount: paidAmt,
          balanceImpact: -paidAmt,
          reference: `سداد فوري لعملية البيع رقم #${s.id}`,
          entity_id: buyerId
        });
      }
    }

    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      unified.push({
        date: p.payment_date,
        type: p.payment_direction === 'FROM_BUYER' ? this._typeLabel('PAYMENT_RECEIVED'): this._typeLabel('PAYMENT_SENT'),
        amount: amt,
        balanceImpact: p.payment_direction === 'FROM_BUYER' ? -amt : amt,
        reference: p.displayDescription || `دفعة رقم #${p.id}`,
        entity_id: buyerId
      });
    }

    return unified;
  }

  static async _fetchFarmTransactions(farmId, startDate, endDate, strictlyAfter) {
    const farmWhere = { farm_id: farmId };
    const payWhere = { farm_id: farmId };

    this._applyDateFilter(farmWhere, 'transaction_time', startDate, endDate, strictlyAfter);
    this._applyDateFilter(payWhere, 'payment_date', startDate, endDate, strictlyAfter);

    const purchases = await FarmTransaction.findAll({ where: farmWhere });
    const payments = await FarmDebtPayment.findAll({ where: payWhere });

    const unified = [];

// const map = {
//   SALE: 'بيع',
//   PURCHASE: 'شراء',
//   COST: 'تكلفة',
//   IMMEDIATE_PAYMENT: 'سداد فوري',
//   PAYMENT_RECEIVED: 'مبلغ مستلم',
//   PAYMENT_SENT: 'مبلغ مدفوع',
//   PROFIT: 'ربح',
//   REINVESTMENT: 'إعادة استثمار',
//   WITHDRAWAL: 'سحب',
//   ADVANCE: 'سلفة',
//   ADVANCE_RETURN: 'مرتجع',
//   SALARY_PAYMENT: 'صرف راتب',
//   SALARY_SETTLEMENT: 'تسوية',
//   SETTLED: 'تم التسوية',
//   RECEIVABLE: 'مستحق',
//   CREDIT: 'ائتمان'
// };


    for (const p of purchases) {
      const totalAmt = Number(p.total_amount) || 0;
      const paidAmt = Number(p.paid_amount) || 0;

      unified.push({
        date: p.transaction_time,
        type: this._typeLabel('PURCHASE'),
        amount: totalAmt,
        balanceImpact: totalAmt,
        reference: `عملية شراء رقم #${p.id}`,
        entity_id: farmId
      });

      if (paidAmt > 0) {
        unified.push({
          date: p.transaction_time,
          type: this._typeLabel('IMMEDIATE_PAYMENT'),
          amount: paidAmt,
          balanceImpact: -paidAmt,
          reference: `سداد فوري لعملية الشراء رقم #${p.id}`,
          entity_id: farmId
        });
      }
    }

    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      unified.push({
        date: p.payment_date,
        type: p.payment_direction === 'TO_FARM' ? this._typeLabel('PAYMENT_SENT') : this._typeLabel('PAYMENT_RECEIVED'),
        amount: amt,
        balanceImpact: p.payment_direction === 'TO_FARM' ? -amt : amt,
        reference: p.displayDescription || `دفعة رقم #${p.id}`,
        entity_id: farmId
      });
    }

    return unified;
  }

  static async _fetchCostTransactions(categoryId, startDate, endDate, strictlyAfter) {
    const costWhere = { cost_category_id: categoryId };
    const payWhere = { cost_category_id: categoryId };

    this._applyDateFilter(costWhere, 'recorded_at', startDate, endDate, strictlyAfter);
    this._applyDateFilter(payWhere, 'payment_date', startDate, endDate, strictlyAfter);

    const costs = await DailyCost.findAll({ where: costWhere });
    const payments = await CostDebtPayment.findAll({ where: payWhere });

    const unified = [];
    for (const c of costs) {
      const amt = Number(c.amount) || 0;
      const paid = Number(c.paid_amount) || 0;

      unified.push({
        date: c.recorded_at,
        type: this._typeLabel('COST'),
        amount: amt,
        balanceImpact: amt,
        reference: `التكلفة رقم #${c.id}: ${c.description || ''}`,
        entity_id: categoryId
      });

      if (paid > 0) {
        unified.push({
          date: c.recorded_at,
          type: this._typeLabel('IMMEDIATE_PAYMENT'),
          amount: paid,
          balanceImpact: -paid,
          reference: `سداد فوري للتكلفة رقم #${c.id}`,
          entity_id: categoryId
        });
      }
    }

    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      unified.push({
        date: p.payment_date,
        type: p.payment_direction === 'TO_CATEGORY' ? this._typeLabel('PAYMENT_SENT') : this._typeLabel('PAYMENT_RECEIVED'),
        amount: amt,
        balanceImpact: p.payment_direction === 'TO_CATEGORY' ? -amt : amt,
        reference: p.displayDescription || `دفعة رقم #${p.id}`,
        entity_id: categoryId
      });
    }

    return unified;
  }

  static async _fetchPartnerTransactions(partnerId, startDate, endDate, strictlyAfter) {
    const profitWhere = { partner_id: partnerId };
    const reinvWhere = { partner_id: partnerId };
    const withWhere = { partner_id: partnerId };

    const profits = await PartnerProfit.findAll({ 
      where: profitWhere,
      include: [{
        model: ProfitDistribution,
        as: 'profit_distribution',
        where: this._getDateFilter('calculated_at', startDate, endDate, strictlyAfter)
      }]
    });

    this._applyDateFilter(reinvWhere, 'reinvest_date', startDate, endDate, strictlyAfter);
    this._applyDateFilter(withWhere, 'withdrawal_date', startDate, endDate, strictlyAfter);

    const reinvestments = await PartnerReinvestment.findAll({ where: reinvWhere });
    const withdrawals = await PartnerWithdrawal.findAll({ where: withWhere });

    const unified = [];
    for (const p of profits) {
      unified.push({
        date: p.distribution ? p.distribution.calculated_at : new Date(),
        type: this._typeLabel('PROFIT'),
        amount: Number(p.final_profit),
        balanceImpact: Number(p.final_profit),
        reference: `الربح رقم #${p.id}`,
        entity_id: partnerId
      });
    }

    for (const r of reinvestments) {
      unified.push({
        date: r.reinvest_date,
        type: this._typeLabel('REINVESTMENT'),
        amount: Number(r.amount),
        balanceImpact: -Number(r.amount),
        reference: `إعادة استثمار رقم #${r.id}`,
        entity_id: partnerId
      });
    }

    for (const w of withdrawals) {
      unified.push({
        date: w.withdrawal_date,
        type: this._typeLabel('WITHDRAWAL'),
        amount: Number(w.amount),
        balanceImpact: -Number(w.amount),
        reference: `سحب رقم #${w.id}`,
        entity_id: partnerId
      });
    }

    return unified;
  }

  static async _fetchEmployeeTransactions(employeeId, startDate, endDate, strictlyAfter) {
    const salaryTx = await this._fetchEmployeeSalaryTransactions(employeeId, startDate, endDate, strictlyAfter);
    const advanceTx = await this._fetchAdvanceTransactions(employeeId, startDate, endDate, strictlyAfter);
    return [...salaryTx, ...advanceTx];
  }

  static async _getEmployeeCurrentBalance(employeeId) {
    const tx = await this._fetchEmployeeTransactions(employeeId, null, null, false);
    return tx.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
  }

  static async _fetchEmployeeSalaryTransactions(employeeId, startDate, endDate, strictlyAfter) {
    const salWhere = { employee_id: employeeId };
    this._applyDateFilter(salWhere, 'payment_date', startDate, endDate, strictlyAfter);

    const salaryPayments = await SalaryPayment.findAll({ where: salWhere });

    const unified = [];
    for (const s of salaryPayments) {
      unified.push({
        date: s.payment_date,
        type: this._typeLabel('SALARY_PAYMENT'),
        amount: Number(s.amount),
        balanceImpact: 0,
        reference: `الراتب رقم #${s.id}`,
        entity_id: employeeId
      });

      const ft = await FinancialTransaction.findAll({
        where: {
          reference_type: 'SalaryPayment',
          reference_id: s.id,
          transaction_type: this._typeLabel('SALARY_SETTLEMENT')
        }
      });

      for (const t of ft) {
        const amt = Number(t.amount) || 0;
        if (!amt) continue;
        unified.push({
          date: t.created_at,
          type: this._typeLabel('SALARY_SETTLEMENT'),
          amount: Math.abs(amt),
          balanceImpact: -Math.abs(amt),
          reference: `تسوية رقم #${t.reference_id}`,
          entity_id: employeeId
        });
      }
    }

    return unified;
  }

  static async _fetchAdvanceTransactions(personId, startDate, endDate, strictlyAfter) {
    const advWhere = { person_id: personId };
    const advRetWhere = { person_id: personId };

    this._applyDateFilter(advWhere, 'advance_date', startDate, endDate, strictlyAfter);
    this._applyDateFilter(advRetWhere, 'return_date', startDate, endDate, strictlyAfter);

    const advances = await PersonAdvance.findAll({ where: advWhere });

    const returns = await AdvanceReturn.findAll({
      where: {
        advance_id: {
          [Op.in]: advances.map(a => a.id)
        }
      }
    });

    const unified = [];

    for (const a of advances) {
      unified.push({
        date: a.advance_date,
        type: this._typeLabel('ADVANCE'),
        amount: Number(a.amount),
        balanceImpact: Number(a.amount),
        reference: `سلفة رقم #${a.id}: ${a.description || ''}`,
        entity_id: personId
      });
    }

    const returnsUnified = [];
    if (returns && returns.length) {
      for (const r of returns) {
        returnsUnified.push({
          date: r.return_date,
          type: this._typeLabel('ADVANCE_RETURN'),
          amount: Number(r.amount),
          balanceImpact: -Number(r.amount),
          reference: `مرتجع رقم #${r.id}`,
          entity_id: personId
        });
      }
    }
    unified.push(...returnsUnified);

    const ft = [];
    const filtered = this._filterByDateField(ft, 'created_at', startDate, endDate, strictlyAfter);

    for (const t of filtered) {
      const amt = Number(t.amount) || 0;
      if (!amt) continue;

      const isSettlement = t.transaction_type === 'SALARY_SETTLEMENT';
      if (!isSettlement) continue;

      unified.push({
        date: t.created_at,
        type: this._typeLabel('SALARY_SETTLEMENT'),
        amount: Math.abs(amt),
        balanceImpact: -Math.abs(amt),
        reference: `تسوية رقم #${t.reference_id}`,
        entity_id: personId
      });
    }

    return unified;
  }

  static _filterByDateField(rows, dateField, startDate, endDate, strictlyAfter) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return rows.filter(r => {
      const v = r[dateField];
      if (!v) return false;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;

      if (strictlyAfter && startDate) return d > startDate;
      if (!strictlyAfter) {
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });
  }

  static async _getEmployeeSalaryCurrentBalance(employeeId) {
    const tx = await this._fetchEmployeeSalaryTransactions(employeeId, null, null, false);
    return tx.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
  }

  static async _getAdvanceCurrentBalance(personId) {
    const tx = await this._fetchAdvanceTransactions(personId, null, null, false);
    return tx.reduce((sum, t) => sum + (Number(t.balanceImpact) || 0), 0);
  }

  static async _fetchSafeCustodyTransactions(type, entityId, startDate, endDate, strictlyAfter) {
    const where = { payment_source_type: type, payment_source_id: entityId };
    this._applyDateFilter(where, 'created_at', startDate, endDate, strictlyAfter);

    const txs = await FinancialTransaction.findAll({ where });

    return txs.map(t => {
      const amt = Number(t.amount);
      return {
        date: t.created_at,
        type: t.transaction_type,
        amount: amt,
        balanceImpact: t.direction === 'IN' ? amt : -amt,
        reference: `المرجع: ${t.reference_type} #${t.reference_id}`,
        entity_id: entityId
      };
    });
  }

  static _applyDateFilter(whereObj, dateField, startDate, endDate, strictlyAfter) {
    const filter = this._getDateFilter(dateField, startDate, endDate, strictlyAfter);
    if (filter && filter[dateField]) {
      whereObj[dateField] = filter[dateField];
    }
  }

  static _getDateFilter(dateField, startDate, endDate, strictlyAfter) {
    if (strictlyAfter) {
      return { [dateField]: { [Op.gt]: startDate } };
    } else {
      if (startDate || endDate) {
        const filter = {};
        if (startDate) filter[Op.gte] = startDate;
        if (endDate) filter[Op.lte] = endDate;
        return { [dateField]: filter };
      }
    }
    return null;
  }
}

module.exports = StatementService;

