// ========================================
// DATABASE MIGRATION SCRIPT - UPDATED
// Handles foreign key constraints properly
// ========================================

const { sequelize, testConnection } = require('./database');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function migrate() {
  try {

    log('\n' + '='.repeat(70), 'bright');
    log(' 🐔 CHICKEN DISTRIBUTION SYSTEM - DATABASE MIGRATION', 'bright');
    log('='.repeat(70) + '\n', 'bright');

    // ========================================
    // STEP 1 - TEST CONNECTION
    // ========================================

    log('📡 Step 1: Testing database connection...', 'blue');

    const connected = await testConnection();

    if (!connected) {
      log('\n❌ Migration aborted: Could not connect to database\n', 'red');
      process.exit(1);
    }

    // ========================================
    // STEP 2 - LOAD MODELS
    // ========================================

    log('\n📦 Step 2: Loading models...', 'blue');

    const {
      syncModels,
      getSyncOrder
    } = require('../models');

    const models = getSyncOrder();

    log(`   ✅ Loaded ${models.length} models`, 'green');

    // ========================================
    // STEP 3 - SYNC DATABASE
    // ========================================

    log('\n🔄 Step 3: Syncing database...', 'blue');

    const forceMode = process.argv.includes('--force');

    if (forceMode) {
      log('   ⚠️ FORCE MODE ENABLED', 'red');
      log('   ALL TABLES WILL BE DROPPED!', 'red');
    }

    const syncOptions = {
      alter: !forceMode,
      force: forceMode
    };

    log(`   Mode: ${forceMode ? 'FORCE' : 'ALTER'}`, 'yellow');

    await syncModels(syncOptions);

    log('\n✅ Database sync completed successfully!', 'green');

    // ========================================
    // STEP 4 - VERIFY TABLES
    // ========================================

    log('\n📊 Step 4: Verifying tables...', 'blue');

    const tables = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    log(`\n✅ Total tables found: ${tables.length}\n`, 'green');

    const groupedTables = {

      master: [
        'users',
        'partners',
        'vehicles',
        'farms',
        'buyers',
        'safes',
        'employees',
        'permissions',
        'chicken_types',
        'cost_categories'
      ],

      operations: [
        'daily_operations',
        'vehicle_operations',
        'farm_transactions',
        'sale_transactions',
        'sale_weights',
        'transport_losses',
        'daily_costs'
      ],

      finance: [
        'financial_transactions',
        'profit_distributions',
        'partner_profits',
        'partner_withdrawals',
        'partner_reinvestments',
        'farm_debt_payments',
        'buyer_debt_payments',
        'cost_debt_payments'
      ],

      hr: [
        'person_advances',
        'advance_returns',
        'salary_payments',
        'custodies',
        'custody_returns',
        'custody_spendings'
      ],

      system: [
        'vehicle_partners',
        'user_permissions',
        'safe_transfers',
        'user_backups'
      ]
    };

    Object.entries(groupedTables).forEach(([group, tableNames]) => {

      const existing = tables.filter(t =>
        tableNames.includes(t.table_name)
      );

      if (!existing.length) return;

      log(`\n📁 ${group.toUpperCase()} TABLES`, 'blue');

      existing.forEach(table => {
        log(`   ✅ ${table.table_name}`, 'yellow');
      });

    });

    // ========================================
    // SUCCESS
    // ========================================

    log('\n' + '='.repeat(70), 'bright');
    log(' ✅ MIGRATION COMPLETED SUCCESSFULLY!', 'green');
    log('='.repeat(70), 'bright');

    log('\n📝 NEXT STEPS:', 'blue');

    log('   1. Run seed data:', 'yellow');
    log('      node seed.js\n', 'yellow');

    log('   2. Start backend:', 'yellow');
    log('      npm run dev\n', 'yellow');

    await sequelize.close();

    process.exit(0);

  } catch (error) {

    log('\n❌ MIGRATION FAILED\n', 'red');

    log(`Error: ${error.message}\n`, 'red');

    if (error.name === 'SequelizeDatabaseError') {

      log('📌 Database Error Details:', 'yellow');

      log(`   ${error.parent?.message || error.message}`, 'yellow');

      // FK Issues
      if (
        error.message.includes('foreign key') ||
        error.message.includes('constraint')
      ) {

        log('\n💡 Foreign key dependency issue detected!', 'yellow');

        log('Try running:', 'yellow');

        log('   node migrate.js --force\n', 'green');
      }

      // Duplicate Column
      if (
        error.message.includes('already exists')
      ) {

        log('\n💡 Column/Table already exists.', 'yellow');

        log('Try force mode if schema changed heavily.', 'yellow');
      }

    }

    if (
      process.argv.includes('--verbose') &&
      error.stack
    ) {

      log('\n📋 STACK TRACE:\n', 'yellow');

      console.error(error.stack);
    }

    await sequelize.close();

    process.exit(1);
  }
}

// ========================================
// CLI HELP
// ========================================

const args = process.argv.slice(2);

if (
  args.includes('--help') ||
  args.includes('-h')
) {

  log('\n🐔 DATABASE MIGRATION TOOL\n', 'bright');

  log('Usage:', 'blue');

  log('  node migrate.js', 'yellow');
  log('     Safe alter mode\n', 'yellow');

  log('  node migrate.js --force', 'yellow');
  log('     Drop and recreate ALL tables\n', 'yellow');

  log('  node migrate.js --verbose', 'yellow');
  log('     Show detailed stack trace\n', 'yellow');

  log('  node migrate.js --help', 'yellow');
  log('     Show help screen\n', 'yellow');

  process.exit(0);
}

// ========================================
// FORCE MODE WARNING
// ========================================

if (args.includes('--force')) {

  log('\n⚠️ WARNING: FORCE MODE ENABLED', 'red');

  log('This will DELETE ALL DATABASE DATA!', 'red');

  log('\nPress CTRL + C within 5 seconds to cancel...\n', 'yellow');

  setTimeout(() => {
    migrate();
  }, 5000);

} else {

  migrate();

}