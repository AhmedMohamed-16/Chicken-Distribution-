const path = require('path');
console.log('Test directory:', __dirname);
console.log('Trying to load from:', path.resolve(__dirname, './src/models'));

try {
  const models = require('./src/models');
  console.log('✅ Models loaded successfully');
  console.log('Available models:', Object.keys(models).filter(k => k !== 'sequelize' && k !== 'models' && k !== 'getTableNames' && k !== 'recalculateAllPercentages' && k !== 'syncModels').join(', '));
} catch (err) {
  console.error('❌ Failed to load models:', err.message);
  console.error(err.stack);
}

try {
  const { sequelize } = require('./src/config/database');
  console.log('✅ Database loaded successfully');
} catch (err) {
  console.error('❌ Failed to load database:', err.message);
}
