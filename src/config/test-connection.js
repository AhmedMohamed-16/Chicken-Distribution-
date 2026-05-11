// ========================================
// QUICK CONNECTION TEST
// Test your Neon connection without running full migration
// ========================================

const { Pool } = require('pg');
require('dotenv').config();

const isNeon = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isNeon ? {
    rejectUnauthorized: false
  } : false
});

async function testConnection() {
  console.log('\n🔌 Testing Neon Database Connection...\n');
  
  try {
    // Test 1: Basic connection
    console.log('Test 1: Connecting to database...');
    const timeResult = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Connected successfully!');
    console.log(`   Server time: ${timeResult.rows[0].current_time}`);
    
    // Test 2: PostgreSQL version
    console.log('\nTest 2: Checking PostgreSQL version...');
    const versionResult = await pool.query('SELECT version() as pg_version');
    const version = versionResult.rows[0].pg_version.split(',')[0];
    console.log(`✅ ${version}`);
    
    // Test 3: List existing tables (if any)
    console.log('\nTest 3: Checking existing tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log(`✅ Found ${tablesResult.rows.length} tables:`);
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('ℹ️  No tables found (database is empty - ready for migration)');
    }
    
    // Test 4: Connection pool info
    console.log('\nTest 4: Connection pool information...');
    console.log(`   Total connections: ${pool.totalCount}`);
    console.log(`   Idle connections: ${pool.idleCount}`);
    console.log(`   Waiting requests: ${pool.waitingCount}`);
    
    console.log('\n✅ All tests passed! Your Neon database is ready.\n');
    console.log('Next step: Run "npm run migrate" to create tables and seed data.\n');
    
  } catch (error) {
    console.error('\n❌ Connection test failed!\n');
    console.error('Error details:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check if DATABASE_URL is set correctly in .env file');
    console.error('   2. Make sure you copied the full connection string from Neon');
    console.error('   3. Verify your internet connection');
    console.error('   4. Check if the connection string ends with ?sslmode=require\n');
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('   ⚠️  DNS lookup failed - check the hostname in your connection string');
    } else if (error.message.includes('password authentication failed')) {
      console.error('   ⚠️  Invalid credentials - get a fresh connection string from Neon');
    } else if (error.message.includes('SSL')) {
      console.error('   ⚠️  SSL error - make sure ?sslmode=require is in the connection string');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();