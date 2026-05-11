/**
 * Backup Service
 * Handles database backup operations including:
 * - Exporting all tables to JSON
 * - Compressing to ZIP
 * - Saving backup records
 */

const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { sequelize } = require('../config/database');
const { models, getTableNames } = require('../models');
const UserBackup = require('../models/Userbackup');
const { getCairoTimestampForFile } = require('../utils/CairoTimestampForFile');

// Ensure backup directory exists
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

/**
 * Ensure backup directory exists
 */
const ensureBackupDir = async () => {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    console.log(`✓ Created backup directory: ${BACKUP_DIR}`);
  }
};

/**
 * Generate unique backup filename
 * @returns {string} - Backup filename with timestamp
 */
const generateBackupFilename = () => {
  const timestamp = getCairoTimestampForFile();
  return `backup_${timestamp}.zip`;
};


/**
 * Export single table data to JSON
 * @param {string} modelName - Name of the model
 * @returns {Object} - Object with model name and data
 */
const exportTableData = async (modelName) => {
  try {
    const Model = models[modelName];
    if (!Model) {
      throw new Error(`Model ${modelName} not found`);
    }

    // Fetch all records from the table
    const data = await Model.findAll({
      raw: true,
      nest: true
    });

    console.log(`  ✓ Exported ${data.length} records from ${modelName}`);
    
    return {
      tableName: Model.tableName,
      modelName: modelName,
      recordCount: data.length,
      data: data
    };
  } catch (error) {
    console.error(`  ✗ Error exporting ${modelName}:`, error.message);
    throw error;
  }
};

/**
 * Export all tables to JSON files
 * @param {string} tempDir - Temporary directory for JSON files
 * @returns {Array} - Array of exported table information
 */
const exportAllTables = async (tempDir) => {
  const tableNames = getTableNames();
  const exportedTables = [];

  console.log(`\nExporting ${tableNames.length} tables...`);

  for (const modelName of tableNames) {
    try {
      const tableData = await exportTableData(modelName);
      
      // Write JSON file
      const jsonFilename = `${tableData.tableName}.json`;
      const jsonPath = path.join(tempDir, jsonFilename);
      
      await fs.writeFile(
        jsonPath,
        JSON.stringify(tableData, null, 2),
        'utf8'
      );

      exportedTables.push({
        modelName: tableData.modelName,
        tableName: tableData.tableName,
        recordCount: tableData.recordCount,
        filename: jsonFilename
      });
    } catch (error) {
      console.error(`Failed to export ${modelName}:`, error.message);
      // Continue with other tables even if one fails
    }
  }

  return exportedTables;
};

/**
 * Create ZIP archive from JSON files
 * @param {string} tempDir - Directory containing JSON files
 * @param {string} zipPath - Output ZIP file path
 * @returns {Promise<number>} - Size of created ZIP file
 */
const createZipArchive = async (tempDir, zipPath) => {
  return new Promise(async (resolve, reject) => {
    try {
      const output = require('fs').createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      let zipSize = 0;

      // Listen for archive events
      output.on('close', () => {
        zipSize = archive.pointer();
        console.log(`✓ ZIP created: ${(zipSize / 1024 / 1024).toFixed(2)} MB`);
        resolve(zipSize);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      // Pipe archive to file
      archive.pipe(output);

      // Add all JSON files to archive
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(tempDir, file);
          archive.file(filePath, { name: file });
        }
      }

      // Add metadata file
      const metadata = {
        backupDate: new Date(),
        databaseName: process.env.DB_NAME,
        version: '1.0.0',
        tableCount: files.length
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      // Finalize archive
      await archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Clean up temporary directory
 * @param {string} tempDir - Directory to clean
 */
const cleanupTempDir = async (tempDir) => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('✓ Cleaned up temporary files');
  } catch (error) {
    console.error('Warning: Could not clean temp directory:', error.message);
  }
};

/**
 * Main backup function
 * Creates a complete database backup
 * @param {number} userId - ID of user triggering backup (default: 1 for system)
 * @returns {Object} - Backup result with filename and details
 */
const createBackup = async (userId = 1) => {
  
  const startTime =  Date.now(); 
  let tempDir = null;
  let backupRecord = null;

  try {
    // Ensure backup directory exists
    await ensureBackupDir();

    // Generate backup filename
    const backupFilename = generateBackupFilename();
    const zipPath = path.join(BACKUP_DIR, backupFilename);

    // Create temporary directory for JSON files
    tempDir = path.join(BACKUP_DIR, `temp_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    console.log('\n========================================');
    console.log('Starting Database Backup Process');
    console.log('========================================');

    // Create backup record in database (status: PENDING)
    backupRecord = await UserBackup.create({
      user_id: userId,
      backup_name: backupFilename,
      backup_date: new Date(),
      status: 'PENDING'
    });

    // Export all tables to JSON
    const exportedTables = await exportAllTables(tempDir);

    // Create ZIP archive
    console.log('\nCreating ZIP archive...');
    const fileSize = await createZipArchive(tempDir, zipPath);

    // Update backup record with success
    await backupRecord.update({
      status: 'COMPLETED',
      file_size: fileSize
    });

    // Clean up temporary directory
    await cleanupTempDir(tempDir);

    const duration = (( Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n========================================');
    console.log('Backup Completed Successfully');
    console.log(`Duration: ${duration}s`);
    console.log(`File: ${backupFilename}`);
    console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('========================================\n');

    return {
      success: true,
      backupId: backupRecord.id,
      filename: backupFilename,
      filePath: zipPath,
      fileSize: fileSize,
      tableCount: exportedTables.length,
      tables: exportedTables,
      duration: duration
    };

  } catch (error) {
    console.error('\n✗ Backup failed:', error.message);
    console.error(error.stack);

    // Update backup record with failure
    if (backupRecord) {
      await backupRecord.update({
        status: 'FAILED',
        error_message: error.message
      });
    }

    // Clean up on failure
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }

    throw error;
  }
};

/**
 * Get list of all available backups
 * @returns {Array} - List of backup records
 */
const listBackups = async () => {
  try {
    const backups = await UserBackup.findAll({
      order: [['backup_date', 'DESC']],
      attributes: ['id', 'backup_name', 'backup_date', 'file_size', 'status']
    });

    return backups;
  } catch (error) {
    console.error('Error listing backups:', error.message);
    throw error;
  }
};

/**
 * Delete old backups based on retention policy
 * @param {number} retentionDays - Number of days to keep backups
 */
const cleanOldBackups = async (retentionDays = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const oldBackups = await UserBackup.findAll({
      where: {
        backup_date: {
          [require('sequelize').Op.lt]: cutoffDate
        }
      }
    });

    for (const backup of oldBackups) {
      const filePath = path.join(BACKUP_DIR, backup.backup_name);
      
      try {
        await fs.unlink(filePath);
        await backup.destroy();
        console.log(`Deleted old backup: ${backup.backup_name}`);
      } catch (error) {
        console.error(`Could not delete ${backup.backup_name}:`, error.message);
      }
    }

    console.log(`Cleaned ${oldBackups.length} old backups`);
  } catch (error) {
    console.error('Error cleaning old backups:', error.message);
  }
};
/**
 * Check if monthly backup already exists
 * @returns {boolean}
 */
const hasMonthlyBackup = async () => {
  const now = new Date();

  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0
  );

  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  );

  const existingBackup = await UserBackup.findOne({
    where: {
      status: 'COMPLETED',
      backup_date: {
        [require('sequelize').Op.between]: [
          startOfMonth,
          endOfMonth
        ]
      }
    }
  });

  return !!existingBackup;
};
module.exports = {
  createBackup,
  listBackups,
  cleanOldBackups,
  BACKUP_DIR,
  hasMonthlyBackup
};