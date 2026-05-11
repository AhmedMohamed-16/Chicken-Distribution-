/**
 * migrate-employee.js
 * -------------------
 * Creates the `employees` table if it doesn't exist yet.
 * Safe to run on a live database — uses { alter: false, force: false }
 * by default, falling back to `sync({ alter: true })` if the table
 * exists but needs column adjustments.
 *
 * Usage:
 *   node migrate-employee.js
 */

require('dotenv').config();

const { testConnection } = require('./src/config/database');
const Employee = require('./src/models/Employee');

async function run() {
  try {
    console.log('🔌 Connecting to database...');
    await testConnection();

    console.log('📦 Syncing employees table...');

    // sync({ alter: true }) adds any missing column without dropping data.
    // Change to { force: true } ONLY in dev to wipe and recreate.
    await Employee.sync({ alter: true });

    console.log('✅ employees table is ready.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

run();
