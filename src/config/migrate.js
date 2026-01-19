// src/config/migrate.js
const { sequelize } = require('./database');

async function migrate() {
  try {
    console.log('🔄 Starting database migration...');
    console.log('📊 Database:', process.env.DB_NAME);
    console.log('🏠 Host:', process.env.DB_HOST);

    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection successful');

    // Import all models to ensure they're registered
    require('../models');

    // Sync all models with database
    // alter: true will update existing tables to match models
    // force: true would drop and recreate all tables (use with caution!)
    await sequelize.sync({ 
      force: false,  // Set to true to drop all tables and recreate (WARNING: data loss!)
      alter: true    // Update existing tables to match model definitions
    });

    console.log('✅ Database migration completed successfully!');
    console.log('📊 All tables created/updated:');
    console.log('   - users');
    console.log('   - partners');
    console.log('   - vehicles');
    console.log('   - vehicle_partners');
    console.log('   - farms');
    console.log('   - buyers');
    console.log('   - chicken_types');
    console.log('   - cost_categories');
    console.log('   - daily_operations');
    console.log('   - farm_transactions');
    console.log('   - sale_transactions');
    console.log('   - transport_losses');
    console.log('   - daily_costs');
    console.log('   - profit_distributions');
    console.log('   - partner_profits');
    console.log('   - farm_debt_payments');
    console.log('   - buyer_debt_payments');

    console.log('\n🎉 Migration completed! You can now run: npm run seed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nPlease check:');
    console.error('1. PostgreSQL is running');
    console.error('2. Database credentials in .env are correct');
    console.error('3. Database exists or user has permission to create it');
    process.exit(1);
  }
}

// Run migration
migrate();