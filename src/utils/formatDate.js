/**
 * Date formatting utilities for the poultry farm backend
 * Converts various date formats to standardized strings
 * Supports Cairo timezone (Africa/Cairo)
 */

const CAIRO_TIMEZONE = 'Africa/Cairo';

/**
 * Safely parse date input to a Date object
 * @param {Date|string} input - Date object or ISO/datetime string
 * @returns {Date} Valid Date object (today if invalid)
 */
const parseToDate = (input) => {
  if (!input) return new Date();
  
  if (input instanceof Date) return input;
  
  const date = new Date(input);
  return isNaN(date.getTime()) ? new Date() : date;
};

/**
 * Format date to YYYY-MM-DD string (standard for DB queries)
 * Handles Date objects and strings
 * @param {Date|string} input - Date or string like "2026-03-31 19:08:32.713+02"
 * @returns {string} "YYYY-MM-DD"
 * @example
 * formatToDateString("2026-03-31 19:08:32.713+02") // "2026-03-31"
 * formatToDateString(new Date()) // "2024-12-05"
 */
const formatToDateString = (input) => {
  const date = parseToDate(input);
  return date.toISOString().split('T')[0];
};

/**
 * Format date to YYYY-MM-DD using Cairo timezone
 * @param {Date|string} input
 * @returns {string} "YYYY-MM-DD" in Cairo TZ
 */
const formatToDateStringCairo = (input) => {
  const date = parseToDate(input);
  return new Intl.DateTimeFormat('sv-SE', { // sv-SE gives YYYY-MM-DD
    timeZone: CAIRO_TIMEZONE
  }).format(date);
};

/**
 * Format to Cairo timestamp for filenames: YYYY-MM-DD_HH-MM-SS
 * @param {Date|string} input
 * @returns {string}
 */
const formatToFilenameTimestamp = (input) => {
  const date = parseToDate(input);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: CAIRO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date).replace(/(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2}):(\d{2})/, '$1-$2-$3_$4-$5-$6');
};

/**
 * Test the main conversion
 */
const testConversion = () => {
  const input = "2026-03-31 19:08:32.713+02";
  console.log(`Input: ${input}`);
  console.log(`Output: ${formatToDateString(input)}`); // Expected: "2026-03-31"
  console.log(`Cairo TZ: ${formatToDateStringCairo(input)}`);
};

// Export everything
module.exports = {
  parseToDate,
  formatToDateString,
  formatToDateStringCairo,
  formatToFilenameTimestamp,
  testConversion
};

// For ESM/CommonJS compatibility
const formatDate = {
  parseToDate,
  formatToDateString,
  formatToDateStringCairo,
  formatToFilenameTimestamp,
  testConversion
};

if (typeof window === 'undefined') {
  // Node.js
  Object.assign(module.exports, formatDate);
} else {
  // Browser
  window.formatDate = formatDate;
}

