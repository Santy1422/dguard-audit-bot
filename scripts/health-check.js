#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

class HealthChecker {
  constructor() {
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runHealthCheck() {
    console.log(chalk.cyan.bold('🏥 DGuard Audit Bot - Health Check\n'));

    // Run all health checks
    await this.checkNodeVersion();
    await this.checkDependencies();
    await this.checkConfiguration();
    await this.checkDirectories();
    await this.checkPermissions();
    await this.checkDiskSpace();
    await this.checkMemory();
    await this.checkNetworkConnectivity();
    await this.checkLastAudit();
    await this.checkCache();

    // Display summary
    this.displaySummary();

    // Return overall health status
    return this.failed === 0;
  }

  async check(name, checkFunction, required = true) {
    process.stdout.write(`${name.padEnd(40)} `);
    
    try {
      const result = await checkFunction();
      
      if (result.success) {
        console.log(chalk.green('✅ PASS') + (result.message ? ` - ${result.message}` : ''));
        this.passed++;
      } else {
        const status = required ? chalk.red('❌ FAIL') : chalk.yellow('⚠️  WARN');
        console.log(status + (result.message ? ` - ${result.message}` : ''));
        
        if (required) {
          this.failed++;
        }
      }
      
      this.checks.push({
        name,
        success: result.success,
        required,
        message: result.message,
        details: result.details
      });
      
    } catch (error) {
      const status = required ? chalk.red('❌ FAIL') : chalk.yellow('⚠️  WARN');
      console.log(status + ` - ${error.message}`);
      
      if (required) {
        this.failed++;
      }
      
      this.checks.push({
        name,
        success: false,
        required,
        message: error.message,
        error: true
      });
    }
  }

  async checkNodeVersion() {
    await this.check('Node.js Version', async () => {
      const version = process.version;
      const majorVersion = parseInt(version.slice(1).split('.')[0]);
      
      if (majorVersion >= 18) {
        return {
          success: true,
          message: `${version} (>= 18.0.0)`
        };
      } else {
        return {
          success: false,
          message: `${version} (requires >= 18.0.0)`
        };
      }
    });
  }

  async checkDependencies() {
    await this.check('Package Dependencies', async () => {
      if (!fs.existsSync('package.json')) {
        return {
          success: false,
          message: 'package.json not found'
        };
      }

      if (!fs.existsSync('node_modules')) {
        return {
          success: false,
          message: 'node_modules not found - run npm install'
        };
      }

      // Check if package-lock.json exists
      const hasLockFile = fs.existsSync('package-lock.json');
      
      // Check critical dependencies
      const criticalDeps = [
        '@babel/parser',
        '@babel/traverse',
        'chalk',
        'commander'
      ];

      const missingDeps = criticalDeps.filter(dep => 
        !fs.existsSync(path.join('node_modules', dep))
      );

      if (missingDeps.length > 0) {
        return {
          success: false,
          message: `Missing dependencies: ${missingDeps.join(', ')}`
        };
      }

      return {
        success: true,
        message: hasLockFile ? 'All dependencies installed' : 'Dependencies installed (no lock file)'
      };
    });
  }

  async checkConfiguration() {
    await this.check('Configuration Files', async () => {
      const configFile = 'config/projects.config.js';
      
      if (!fs.existsSync(configFile)) {
        return {
          success: false,
          message: 'projects.config.js not found'
        };
      }

      try {
        const content = fs.readFileSync(configFile, 'utf8');
        
        // Basic syntax check
        if (!content.includes('export default')) {
          return {
            success: false,
            message: 'Invalid configuration format'
          };
        }

        // Check for required sections
        const requiredSections = ['projects', 'backend', 'frontend'];
        const missingMethods = requiredSections.filter(section => 
          !content.includes(section)
        );

        if (missingMethods.length > 0) {
          return {
            success: false,
            message: `Missing sections: ${missingMethods.join(', ')}`
          };
        }

        return {
          success: true,
          message: 'Configuration file is valid'
        };
      } catch (error) {
        return {
          success: false,
          message: `Configuration error: ${error.message}`
        };
      }
    });
  }

  async checkDirectories() {
    await this.check('Required Directories', async () => {
      const requiredDirs = [
        'src',
        'config',
        'scripts'
      ];

      const optionalDirs = [
        'reports',
        '.audit-history',
        '.audit-cache',
        'logs'
      ];

      const missingRequired = requiredDirs.filter(dir => !fs.existsSync(dir));
      const missingOptional = optionalDirs.filter(dir => !fs.existsSync(dir));

      if (missingRequired.length > 0) {
        return {
          success: false,
          message: `Missing required directories: ${missingRequired.join(', ')}`
        };
      }

      let message = 'All required directories exist';
      if (missingOptional.length > 0) {
        message += ` (missing optional: ${missingOptional.join(', ')})`;
      }

      return {
        success: true,
        message
      };
    });
  }

  async checkPermissions() {
    await this.check('File Permissions', async () => {
      const dirsToCheck = [
        'reports',
        '.audit-history',
        '.audit-cache',
        'logs'
      ];

      const permissionErrors = [];

      for (const dir of dirsToCheck) {
        try {
          // Create directory if it doesn't exist
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          // Check write permissions
          fs.accessSync(dir, fs.constants.W_OK);
        } catch (error) {
          permissionErrors.push(dir);
        }
      }

      if (permissionErrors.length > 0) {
        return {
          success: false,
          message: `No write access to: ${permissionErrors.join(', ')}`
        };
      }

      return {
        success: true,
        message: 'All directories are writeable'
      };
    });
  }

  async checkDiskSpace() {
    await this.check('Disk Space', async () => {
      try {
        const { stdout } = await execAsync('df -h . | tail -1');
        const parts = stdout.trim().split(/\s+/);
        const usagePercent = parseInt(parts[4]?.replace('%', '') || '0');

        if (usagePercent > 95) {
          return {
            success: false,
            message: `Very low disk space: ${parts[4]} used`
          };
        } else if (usagePercent > 90) {
          return {
            success: true,
            message: `Low disk space warning: ${parts[4]} used`
          };
        } else {
          return {
            success: true,
            message: `Available: ${parts[3]}, Used: ${parts[4]}`
          };
        }
      } catch (error) {
        return {
          success: true,
          message: 'Could not check disk space'
        };
      }
    }, false); // Non-critical check
  }

  async checkMemory() {
    await this.check('Memory Usage', async () => {
      const totalMem = require('os').totalmem();
      const freeMem = require('os').freemem();
      const usedMem = totalMem - freeMem;
      const usagePercent = (usedMem / totalMem) * 100;

      const formatBytes = (bytes) => {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
      };

      if (usagePercent > 95) {
        return {
          success: false,
          message: `Very high memory usage: ${usagePercent.toFixed(1)}%`
        };
      } else if (usagePercent > 85) {
        return {
          success: true,
          message: `High memory usage: ${usagePercent.toFixed(1)}%`
        };
      } else {
        return {
          success: true,
          message: `Memory usage: ${usagePercent.toFixed(1)}% (${formatBytes(freeMem)} free)`
        };
      }
    }, false); // Non-critical check
  }

  async checkNetworkConnectivity() {
    await this.check('Network Connectivity', async () => {
      try {
        // Test GitHub connectivity
        await execAsync('curl -s --max-time 5 https://api.github.com > /dev/null');
        
        // Test npm registry connectivity
        await execAsync('curl -s --max-time 5 https://registry.npmjs.org > /dev/null');

        return {
          success: true,
          message: 'GitHub and npm registry accessible'
        };
      } catch (error) {
        return {
          success: false,
          message: 'Network connectivity issues detected'
        };
      }
    }, false); // Non-critical check
  }

  async checkLastAudit() {
    await this.check('Last Audit Report', async () => {
      const reportPath = 'reports/audit-report.json';
      
      if (!fs.existsSync(reportPath)) {
        return {
          success: true,
          message: 'No previous audit found (this is normal for first run)'
        };
      }

      try {
        const stats = fs.statSync(reportPath);
        const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > 24) {
          return {
            success: true,
            message: `Last audit: ${ageHours.toFixed(1)} hours ago (consider running new audit)`
          };
        } else {
          return {
            success: true,
            message: `Last audit: ${ageHours.toFixed(1)} hours ago`
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Cannot read audit report: ${error.message}`
        };
      }
    }, false); // Non-critical check
  }

  async checkCache() {
    await this.check('Cache System', async () => {
      const cacheDir = '.audit-cache';
      
      if (!fs.existsSync(cacheDir)) {
        return {
          success: true,
          message: 'Cache directory will be created on first run'
        };
      }

      try {
        // Count cache files
        const categories = ['files', 'ast', 'analysis', 'reports'];
        let totalFiles = 0;
        let totalSize = 0;

        categories.forEach(category => {
          const categoryDir = path.join(cacheDir, category);
          if (fs.existsSync(categoryDir)) {
            const files = fs.readdirSync(categoryDir);
            totalFiles += files.length;
            
            files.forEach(file => {
              const filePath = path.join(categoryDir, file);
              const stats = fs.statSync(filePath);
              totalSize += stats.size;
            });
          }
        });

        const formatBytes = (bytes) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        return {
          success: true,
          message: `${totalFiles} cached items, ${formatBytes(totalSize)}`
        };
      } catch (error) {
        return {
          success: false,
          message: `Cache error: ${error.message}`
        };
      }
    }, false); // Non-critical check
  }

  displaySummary() {
    console.log('\n' + '═'.repeat(60));
    console.log(chalk.bold('📋 HEALTH CHECK SUMMARY:'));
    console.log('═'.repeat(60));

    const total = this.passed + this.failed;
    const passRate = total > 0 ? (this.passed / total) * 100 : 0;

    console.log(`Total Checks: ${total}`);
    console.log(`${chalk.green('Passed')}: ${this.passed}`);
    console.log(`${chalk.red('Failed')}: ${this.failed}`);
    console.log(`Pass Rate: ${passRate.toFixed(1)}%`);

    console.log('\n' + chalk.bold('🎯 OVERALL STATUS:'));
    
    if (this.failed === 0) {
      console.log(chalk.green.bold('✅ HEALTHY - All critical checks passed'));
      console.log('The system is ready for audit operations.');
    } else if (this.failed <= 2) {
      console.log(chalk.yellow.bold('⚠️  WARNING - Some issues detected'));
      console.log('The system may function but with reduced reliability.');
    } else {
      console.log(chalk.red.bold('❌ UNHEALTHY - Multiple critical issues'));
      console.log('Please resolve the issues before running audits.');
    }

    // Show failed checks
    if (this.failed > 0) {
      console.log('\n' + chalk.bold('🔧 ACTIONS REQUIRED:'));
      
      this.checks
        .filter(check => !check.success && check.required)
        .forEach(check => {
          console.log(`• ${check.name}: ${check.message}`);
        });
    }

    // Show recommendations
    console.log('\n' + chalk.bold('💡 RECOMMENDATIONS:'));
    
    if (this.failed === 0) {
      console.log('• Run "npm run audit" to perform your first audit');
      console.log('• Set up automated audits with "npm run audit:watch"');
      console.log('• Configure notifications in your environment variables');
    } else {
      console.log('• Fix critical issues shown above');
      console.log('• Run health check again: "npm run monitor:health"');
      console.log('• Check the troubleshooting guide in docs/DEPLOYMENT.md');
    }

    console.log('\n' + '═'.repeat(60));
  }
}

// CLI execution
async function runHealthCheck() {
  const healthChecker = new HealthChecker();
  
  try {
    const healthy = await healthChecker.runHealthCheck();
    process.exit(healthy ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n❌ Health check failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHealthCheck();
}

export default HealthChecker;