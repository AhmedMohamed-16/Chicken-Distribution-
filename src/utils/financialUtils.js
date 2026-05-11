/**
 * FINANCIAL INTEGRITY UTILITIES
 * 
 * Centralized financial calculation functions.
 * ALL money operations MUST go through these functions.
 */

const MAX_FINANCIAL_AMOUNT = 999999999.99;
const MIN_FINANCIAL_AMOUNT = 0.01;

/**
 * Rounds a number to 2 decimal places accurately.
 * Uses Number.EPSILON to handle floating point issues.
 */
const round2 = (num) => {
  const n = parseFloat(num);
  if (isNaN(n)) return 0;
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

/**
 * Validates and sanitizes a financial amount.
 * 
 * SECURITY GUARANTEES:
 * - Rejects negative values
 * - Rejects NaN, Infinity, -Infinity
 * - Rejects values exceeding MAX_FINANCIAL_AMOUNT
 * - Rejects values below MIN_FINANCIAL_AMOUNT
 * - Rejects strings with multiple decimal points
 * - Rejects values with more than 2 decimal places
 * - Removes thousands separators and whitespace
 * 
 * @param {*} rawAmount - The raw amount value to sanitize
 * @returns {number} - Sanitized positive number rounded to 2 decimal places
 * @throws {Error} - If amount is invalid
 */
const sanitizeAmount = (rawAmount) => {
  if (rawAmount == null) {
    throw new Error('المبلغ مطلوب');
  }

  let str = String(rawAmount).trim();
  if (!str) {
    throw new Error('المبلغ غير صالح');
  }

  // Replace multiple consecutive dots with single dot
  str = str.replace(/\.+/g, '.');

  // Remove leading/trailing dots, thousands separators, whitespace
  str = str.replace(/^[\.\s]+|[\.\s]+$|\,|\s/g, '');

  // Reject if string contains any non-numeric characters (except single dot)
  if (/[^0-9.]/.test(str)) {
    throw new Error('المبلغ يحتوي على أحرف غير صالحة');
  }

  const num = parseFloat(str);
  if (isNaN(num)) {
    throw new Error('المبلغ يجب أن يكون رقماً');
  }

  if (!isFinite(num)) {
    throw new Error('قيمة المبلغ غير صالحة (قيمة كبيرة جداً)');
  }

  if (num <= 0) {
    throw new Error('المبلغ يجب أن يكون رقماً موجباً');
  }

  if (num > MAX_FINANCIAL_AMOUNT) {
    throw new Error(`المبلغ يتجاوز الحد الأقصى المسموح به (${MAX_FINANCIAL_AMOUNT})`);
  }

  // Validate decimal places <= 2 after parse
  const parts = str.split('.');
  if (parts.length > 2) {
    throw new Error('المبلغ يجب ألا يحتوي على أكثر من علامة عشرية واحدة');
  }
  if (parts.length === 2 && parts[1].length > 2) {
    throw new Error('المبلغ يجب ألا يحتوي على أكثر من رقمين عشريين');
  }

  return round2(num);
};

/**
 * Validates that a value is a non-negative number (for balances, amounts that can be zero).
 * Less strict than sanitizeAmount - allows 0.
 */
const sanitizeNonNegativeAmount = (rawAmount) => {
  if (rawAmount == null) {
    throw new Error('المبلغ مطلوب');
  }
  const num = parseFloat(rawAmount);
  if (isNaN(num) || !isFinite(num)) {
    throw new Error('المبلغ غير صالح');
  }
  if (num < 0) {
    throw new Error('المبلغ لا يمكن أن يكون سالباً');
  }
  if (num > MAX_FINANCIAL_AMOUNT) {
    throw new Error(`المبلغ يتجاوز الحد الأقصى (${MAX_FINANCIAL_AMOUNT})`);
  }
  return round2(num);
};

module.exports = {
  round2,
  sanitizeAmount,
  sanitizeNonNegativeAmount,
  MAX_FINANCIAL_AMOUNT,
  MIN_FINANCIAL_AMOUNT
};
