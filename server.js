// server.js - Main server entry point
require('dotenv').config();
const app = require('./src/app');
const { testConnection } = require('./src/config/database');

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Test database connection before starting server
async function startServer() {
  try {
    // Test database connection
    await testConnection();

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║     🐔 CHICKEN DISTRIBUTION MANAGEMENT SYSTEM API              ║
║                                                                ║
║     Server Status:      ✅ RUNNING                             ║
║     Port:               ${PORT}                                       ║
║     Environment:        ${NODE_ENV.toUpperCase().padEnd(14)}           ║
║     Database:           PostgreSQL                             ║
║                                                                ║
║     API URL:            http://localhost:${PORT}                     ║
║     Health Check:       http://localhost:${PORT}/health              ║
║                                                                ║
║     📚 API Documentation:                                      ║
║        - Auth:          POST /api/auth/login                   ║
║        - Operations:    POST /api/daily-operations/start       ║
║        - Reports:       GET  /api/reports/daily/:date          ║
║                                                                ║
║     🔐 Default Credentials:                                    ║
║        Admin: username=admin, password=admin123                ║
║        User:  username=user,  password=user123                 ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
      `);

      if (NODE_ENV === 'development') {
        console.log('📝 Development Mode Tips:');
        console.log('   - API logs are enabled');
        console.log('   - CORS enabled for: ' + (process.env.CORS_ORIGIN || 'http://localhost:4200'));
        console.log('   - Hot reload with: npm run dev\n');
      }
    });

    // Graceful shutdown handler
    const gracefulShutdown = (signal) => {
      console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('🔴 HTTP server closed');
        
        // Close database connections
        try {
          const { sequelize } = require('./src/config/database');
          await sequelize.close();
          console.log('🔴 Database connections closed');
        } catch (error) {
          console.error('Error closing database:', error);
        }
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('⚠️  Forced shutdown after 10 seconds');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ UNCAUGHT EXCEPTION:', error);
      gracefulShutdown('UNCAUGHT EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED REJECTION');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();