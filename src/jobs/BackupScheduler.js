/**
 * Backup Scheduler
 * Configures automated monthly backups using node-cron
 */

const cron = require('node-cron');
const { createBackup, cleanOldBackups ,hasMonthlyBackup} = require('../services/Backupservice');

/**
 * Schedule monthly backup
 * Runs on the 1st day of every month at 00:00 (midnight)
 */
const scheduleMonthlyBackup = () => {
const monthlyBackupJob = cron.schedule('0 0 1 * *', async () => {
  console.log('\n========================================');
  console.log('Scheduled Monthly Backup Starting...');
  console.log('Time:', new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo'
  }));
  console.log('========================================\n');

  try {

    // ✅ Prevent duplicate monthly backups
    const alreadyExists = await hasMonthlyBackup();

    if (alreadyExists) {
      console.log('⚠ Monthly backup already exists. Skipping...');
      return;
    }

    // Create backup
    const result = await createBackup(1);

    console.log('✓ Scheduled backup completed successfully');
    console.log(`  Backup ID: ${result.backupId}`);
    console.log(`  Filename: ${result.filename}`);
    console.log(`  Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Cleanup
    const retentionDays =
      parseInt(process.env.BACKUP_RETENTION_DAYS) || 90;

    await cleanOldBackups(retentionDays);

  } catch (error) {
    console.error('✗ Scheduled backup failed:', error.message);
  }

}, {
  scheduled: true,
  timezone: 'Africa/Cairo'
});
  console.log('✓ Monthly backup scheduler initialized');
  console.log('  Schedule: 1st of every month at 00:00 UTC'); 

  return monthlyBackupJob;
};

/**
 * Schedule daily cleanup of old backups
 * Runs every day at 02:00 to clean old backups
 */
const scheduleDailyCleanup = () => {
  const cleanupJob = cron.schedule('0 2 * * *', async () => {
    console.log('\nRunning scheduled backup cleanup...');
    
    try {
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 90;
      await cleanOldBackups(retentionDays);
    } catch (error) {
      console.error('Cleanup job failed:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "Africa/Cairo"
  });

  console.log('✓ Daily cleanup scheduler initialized');
  console.log('  Schedule: Every day at 02:00 UTC');

  return cleanupJob;
};

/**
 * Initialize all scheduled jobs
 */
const initializeSchedulers = () => {
  console.log('\n========================================');
  console.log('Initializing Backup Schedulers');
  console.log('========================================\n');

  const jobs = {
    monthlyBackup: scheduleMonthlyBackup(),
    dailyCleanup: scheduleDailyCleanup()
  };

  console.log('\n✓ All schedulers initialized successfully\n');

  return jobs;
};

/**
 * Stop all scheduled jobs
 */
const stopSchedulers = (jobs) => {
  if (jobs) {
    Object.values(jobs).forEach(job => {
      if (job && job.stop) {
        job.stop();
      }
    });
    console.log('✓ All schedulers stopped');
  }
};

module.exports = {
  initializeSchedulers,
  stopSchedulers,
  scheduleMonthlyBackup,
  scheduleDailyCleanup
};