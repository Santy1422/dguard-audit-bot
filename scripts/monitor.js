#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { table } from 'table';

const execAsync = promisify(exec);

class SystemMonitor {
  constructor() {
    this.metrics = {
      system: {},
      application: {},
      audit: {},
      alerts: []
    };
    
    this.thresholds = {
      cpu: 80,           // CPU usage %
      memory: 85,        // Memory usage %
      disk: 90,          // Disk usage %
      reportAge: 24,     // Hours since last report
      criticalIssues: 0, // Max critical issues
      highIssues: 10     // Max high priority issues
    };
  }

  async monitor() {
    console.log(chalk.cyan.bold('📊 DGuard Audit Bot - System Monitor\n'));
    
    // Collect metrics
    await this.collectSystemMetrics();
    await this.collectApplicationMetrics();
    await this.collectAuditMetrics();
    
    // Check for alerts
    this.checkAlerts();
    
    // Display results
    this.displayMetrics();
    
    // Return status
    return this.metrics.alerts.length === 0;
  }

  async collectSystemMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // CPU Load Average
    const loadAvg = os.loadavg();
    const cpuUsage = (loadAvg[0] / cpus.length) * 100;
    
    // Memory Usage
    const memoryUsage = (usedMem / totalMem) * 100;
    
    // Disk Usage
    const diskUsage = await this.getDiskUsage();
    
    // Network info
    const networkInterfaces = os.networkInterfaces();
    
    this.metrics.system = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: os.uptime(),
      cpuCount: cpus.length,
      cpuModel: cpus[0].model,
      cpuUsage: cpuUsage.toFixed(2),
      totalMemory: this.formatBytes(totalMem),
      usedMemory: this.formatBytes(usedMem),
      freeMemory: this.formatBytes(freeMem),
      memoryUsage: memoryUsage.toFixed(2),
      diskUsage: diskUsage,
      loadAverage: loadAvg.map(avg => avg.toFixed(2)),
      hostname: os.hostname(),
      networkInterfaces: Object.keys(networkInterfaces).length
    };
  }

  async collectApplicationMetrics() {
    const processMetrics = process.memoryUsage();
    const processUptime = process.uptime();
    
    // File system checks
    const projectDirectories = this.checkProjectDirectories();
    const reportsDirectory = this.checkReportsDirectory();
    const cacheDirectory = this.checkCacheDirectory();
    
    // Process information
    this.metrics.application = {
      pid: process.pid,
      uptime: processUptime,
      memoryUsage: {
        rss: this.formatBytes(processMetrics.rss),
        heapTotal: this.formatBytes(processMetrics.heapTotal),
        heapUsed: this.formatBytes(processMetrics.heapUsed),
        external: this.formatBytes(processMetrics.external)
      },
      directories: {
        projects: projectDirectories,
        reports: reportsDirectory,
        cache: cacheDirectory
      },
      environment: process.env.NODE_ENV || 'development',
      workingDirectory: process.cwd()
    };
  }

  async collectAuditMetrics() {
    const lastReport = this.getLastReport();
    const auditHistory = this.getAuditHistory();
    const cacheStats = this.getCacheStats();
    
    this.metrics.audit = {
      lastReport,
      auditHistory,
      cacheStats,
      configValid: this.validateConfig()
    };
  }

  async getDiskUsage() {
    try {
      const { stdout } = await execAsync('df -h / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      return {
        used: parts[2],
        available: parts[3],
        usage: parts[4],
        usagePercent: parseInt(parts[4].replace('%', ''))
      };
    } catch (error) {
      return {
        used: 'Unknown',
        available: 'Unknown',
        usage: 'Unknown',
        usagePercent: 0
      };
    }
  }

  checkProjectDirectories() {
    const configPath = 'config/projects.config.js';
    const results = [];
    
    try {
      if (fs.existsSync(configPath)) {
        // Simular lectura de config (en un caso real importaríamos el módulo)
        const defaultPaths = [
          './projects/backend',
          './projects/frontend',
          './projects/design-system'
        ];
        
        defaultPaths.forEach(projectPath => {
          results.push({
            path: projectPath,
            exists: fs.existsSync(projectPath),
            type: path.basename(projectPath)
          });
        });
      }
    } catch (error) {
      results.push({
        path: 'config',
        exists: false,
        error: error.message
      });
    }
    
    return results;
  }

  checkReportsDirectory() {
    const reportsDir = 'reports';
    const result = {
      exists: fs.existsSync(reportsDir),
      writeable: false,
      files: 0,
      size: 0
    };
    
    if (result.exists) {
      try {
        fs.accessSync(reportsDir, fs.constants.W_OK);
        result.writeable = true;
        
        const files = fs.readdirSync(reportsDir);
        result.files = files.length;
        
        files.forEach(file => {
          const filePath = path.join(reportsDir, file);
          const stats = fs.statSync(filePath);
          result.size += stats.size;
        });
        
        result.size = this.formatBytes(result.size);
      } catch (error) {
        result.error = error.message;
      }
    }
    
    return result;
  }

  checkCacheDirectory() {
    const cacheDir = '.audit-cache';
    const result = {
      exists: fs.existsSync(cacheDir),
      writeable: false,
      files: 0,
      size: 0
    };
    
    if (result.exists) {
      try {
        fs.accessSync(cacheDir, fs.constants.W_OK);
        result.writeable = true;
        
        const files = this.getAllFiles(cacheDir);
        result.files = files.length;
        
        files.forEach(file => {
          const stats = fs.statSync(file);
          result.size += stats.size;
        });
        
        result.size = this.formatBytes(result.size);
      } catch (error) {
        result.error = error.message;
      }
    }
    
    return result;
  }

  getAllFiles(dir) {
    const files = [];
    
    try {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          files.push(...this.getAllFiles(itemPath));
        } else {
          files.push(itemPath);
        }
      });
    } catch (error) {
      // Ignore errors for now
    }
    
    return files;
  }

  getLastReport() {
    const reportPath = 'reports/audit-report.json';
    
    if (!fs.existsSync(reportPath)) {
      return { exists: false };
    }
    
    try {
      const stats = fs.statSync(reportPath);
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      return {
        exists: true,
        lastModified: stats.mtime.toISOString(),
        ageHours: ageHours.toFixed(2),
        size: this.formatBytes(stats.size),
        summary: report.summary,
        issues: {
          critical: report.summary?.issues?.critical || 0,
          high: report.summary?.issues?.high || 0,
          total: report.summary?.issues?.total || 0
        }
      };
    } catch (error) {
      return {
        exists: true,
        error: error.message
      };
    }
  }

  getAuditHistory() {
    const historyDir = '.audit-history';
    
    if (!fs.existsSync(historyDir)) {
      return { exists: false };
    }
    
    try {
      const files = fs.readdirSync(historyDir);
      const historyFiles = files.filter(f => f.endsWith('.json'));
      
      return {
        exists: true,
        totalRuns: historyFiles.length,
        lastRuns: historyFiles.slice(-5).map(file => {
          const filePath = path.join(historyDir, file);
          const stats = fs.statSync(filePath);
          return {
            file,
            timestamp: stats.mtime.toISOString(),
            size: this.formatBytes(stats.size)
          };
        })
      };
    } catch (error) {
      return {
        exists: true,
        error: error.message
      };
    }
  }

  getCacheStats() {
    const cacheDir = '.audit-cache';
    
    if (!fs.existsSync(cacheDir)) {
      return { exists: false };
    }
    
    try {
      const categories = ['files', 'ast', 'analysis', 'reports'];
      const stats = {};
      
      categories.forEach(category => {
        const categoryDir = path.join(cacheDir, category);
        if (fs.existsSync(categoryDir)) {
          const files = fs.readdirSync(categoryDir);
          stats[category] = files.length;
        } else {
          stats[category] = 0;
        }
      });
      
      return {
        exists: true,
        categories: stats,
        total: Object.values(stats).reduce((sum, count) => sum + count, 0)
      };
    } catch (error) {
      return {
        exists: true,
        error: error.message
      };
    }
  }

  validateConfig() {
    const configPath = 'config/projects.config.js';
    
    try {
      if (!fs.existsSync(configPath)) {
        return { valid: false, error: 'Configuration file not found' };
      }
      
      // Verificación básica de sintaxis
      const content = fs.readFileSync(configPath, 'utf8');
      
      if (!content.includes('export default')) {
        return { valid: false, error: 'Invalid configuration format' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  checkAlerts() {
    const alerts = [];
    
    // System alerts
    if (parseFloat(this.metrics.system.cpuUsage) > this.thresholds.cpu) {
      alerts.push({
        type: 'SYSTEM',
        severity: 'HIGH',
        message: `High CPU usage: ${this.metrics.system.cpuUsage}%`,
        threshold: this.thresholds.cpu
      });
    }
    
    if (parseFloat(this.metrics.system.memoryUsage) > this.thresholds.memory) {
      alerts.push({
        type: 'SYSTEM',
        severity: 'HIGH',
        message: `High memory usage: ${this.metrics.system.memoryUsage}%`,
        threshold: this.thresholds.memory
      });
    }
    
    if (this.metrics.system.diskUsage.usagePercent > this.thresholds.disk) {
      alerts.push({
        type: 'SYSTEM',
        severity: 'CRITICAL',
        message: `Low disk space: ${this.metrics.system.diskUsage.usage}`,
        threshold: this.thresholds.disk
      });
    }
    
    // Application alerts
    if (!this.metrics.application.directories.reports.exists) {
      alerts.push({
        type: 'APPLICATION',
        severity: 'CRITICAL',
        message: 'Reports directory does not exist'
      });
    }
    
    if (!this.metrics.application.directories.reports.writeable) {
      alerts.push({
        type: 'APPLICATION',
        severity: 'HIGH',
        message: 'Reports directory is not writeable'
      });
    }
    
    // Audit alerts
    if (this.metrics.audit.lastReport.exists) {
      if (parseFloat(this.metrics.audit.lastReport.ageHours) > this.thresholds.reportAge) {
        alerts.push({
          type: 'AUDIT',
          severity: 'MEDIUM',
          message: `Last report is ${this.metrics.audit.lastReport.ageHours} hours old`,
          threshold: this.thresholds.reportAge
        });
      }
      
      if (this.metrics.audit.lastReport.issues?.critical > this.thresholds.criticalIssues) {
        alerts.push({
          type: 'AUDIT',
          severity: 'CRITICAL',
          message: `${this.metrics.audit.lastReport.issues.critical} critical issues detected`,
          threshold: this.thresholds.criticalIssues
        });
      }
      
      if (this.metrics.audit.lastReport.issues?.high > this.thresholds.highIssues) {
        alerts.push({
          type: 'AUDIT',
          severity: 'HIGH',
          message: `${this.metrics.audit.lastReport.issues.high} high priority issues detected`,
          threshold: this.thresholds.highIssues
        });
      }
    } else {
      alerts.push({
        type: 'AUDIT',
        severity: 'HIGH',
        message: 'No audit report found'
      });
    }
    
    this.metrics.alerts = alerts;
  }

  displayMetrics() {
    this.displaySystemMetrics();
    this.displayApplicationMetrics();
    this.displayAuditMetrics();
    this.displayAlerts();
  }

  displaySystemMetrics() {
    console.log(chalk.bold('🖥️  SYSTEM METRICS:\n'));
    
    const systemData = [
      ['Metric', 'Value'],
      ['Platform', this.metrics.system.platform],
      ['Architecture', this.metrics.system.arch],
      ['Node.js Version', this.metrics.system.nodeVersion],
      ['Hostname', this.metrics.system.hostname],
      ['Uptime', this.formatUptime(this.metrics.system.uptime)],
      ['CPU Count', this.metrics.system.cpuCount.toString()],
      ['CPU Usage', this.colorizeMetric(this.metrics.system.cpuUsage + '%', parseFloat(this.metrics.system.cpuUsage), this.thresholds.cpu)],
      ['Memory Total', this.metrics.system.totalMemory],
      ['Memory Used', this.metrics.system.usedMemory],
      ['Memory Usage', this.colorizeMetric(this.metrics.system.memoryUsage + '%', parseFloat(this.metrics.system.memoryUsage), this.thresholds.memory)],
      ['Disk Usage', this.colorizeMetric(this.metrics.system.diskUsage.usage || 'Unknown', this.metrics.system.diskUsage.usagePercent, this.thresholds.disk)],
      ['Load Average', this.metrics.system.loadAverage.join(', ')]
    ];

    const config = {
      border: {
        topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
        bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
        bodyLeft: '│', bodyRight: '│', bodyJoin: '│'
      },
      columns: {
        0: { width: 20 },
        1: { width: 30 }
      }
    };

    console.log(table(systemData, config));
  }

  displayApplicationMetrics() {
    console.log(chalk.bold('📱 APPLICATION METRICS:\n'));
    
    const appData = [
      ['Metric', 'Value'],
      ['Process ID', this.metrics.application.pid.toString()],
      ['Uptime', this.formatUptime(this.metrics.application.uptime)],
      ['Environment', this.metrics.application.environment],
      ['Working Directory', this.metrics.application.workingDirectory],
      ['Heap Used', this.metrics.application.memoryUsage.heapUsed],
      ['Heap Total', this.metrics.application.memoryUsage.heapTotal],
      ['RSS', this.metrics.application.memoryUsage.rss],
      ['Reports Dir', this.metrics.application.directories.reports.exists ? '✅ Exists' : '❌ Missing'],
      ['Reports Writeable', this.metrics.application.directories.reports.writeable ? '✅ Yes' : '❌ No'],
      ['Cache Dir', this.metrics.application.directories.cache.exists ? '✅ Exists' : '❌ Missing'],
      ['Cache Size', this.metrics.application.directories.cache.size || 'Unknown']
    ];

    const config = {
      border: {
        topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
        bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
        bodyLeft: '│', bodyRight: '│', bodyJoin: '│'
      },
      columns: {
        0: { width: 20 },
        1: { width: 30 }
      }
    };

    console.log(table(appData, config));
  }

  displayAuditMetrics() {
    console.log(chalk.bold('🔍 AUDIT METRICS:\n'));
    
    const lastReport = this.metrics.audit.lastReport;
    const auditData = [
      ['Metric', 'Value'],
      ['Last Report', lastReport.exists ? '✅ Available' : '❌ Missing'],
      ['Report Age', lastReport.ageHours ? `${lastReport.ageHours}h` : 'N/A'],
      ['Report Size', lastReport.size || 'N/A'],
      ['Critical Issues', lastReport.issues ? this.colorizeIssues(lastReport.issues.critical, 'critical') : 'N/A'],
      ['High Issues', lastReport.issues ? this.colorizeIssues(lastReport.issues.high, 'high') : 'N/A'],
      ['Total Issues', lastReport.issues ? lastReport.issues.total.toString() : 'N/A'],
      ['Cache Status', this.metrics.audit.cacheStats.exists ? '✅ Available' : '❌ Missing'],
      ['Cache Files', this.metrics.audit.cacheStats.total ? this.metrics.audit.cacheStats.total.toString() : '0'],
      ['Config Valid', this.metrics.audit.configValid.valid ? '✅ Valid' : '❌ Invalid']
    ];

    const config = {
      border: {
        topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
        bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
        bodyLeft: '│', bodyRight: '│', bodyJoin: '│'
      },
      columns: {
        0: { width: 20 },
        1: { width: 30 }
      }
    };

    console.log(table(auditData, config));
  }

  displayAlerts() {
    if (this.metrics.alerts.length === 0) {
      console.log(chalk.green.bold('✅ NO ALERTS - All systems operational\n'));
      return;
    }

    console.log(chalk.red.bold(`🚨 ALERTS (${this.metrics.alerts.length}):\n`));

    this.metrics.alerts.forEach((alert, index) => {
      const severityColor = {
        'CRITICAL': chalk.red.bold,
        'HIGH': chalk.yellow.bold,
        'MEDIUM': chalk.blue.bold,
        'LOW': chalk.gray.bold
      };

      const icon = {
        'CRITICAL': '🔴',
        'HIGH': '🟠',
        'MEDIUM': '🟡',
        'LOW': '⚪'
      };

      console.log(`${icon[alert.severity]} ${severityColor[alert.severity](alert.severity)} - ${alert.type}`);
      console.log(`   ${alert.message}`);
      if (alert.threshold) {
        console.log(`   Threshold: ${alert.threshold}`);
      }
      console.log('');
    });
  }

  colorizeMetric(value, current, threshold) {
    if (current > threshold) {
      return chalk.red.bold(value);
    } else if (current > threshold * 0.8) {
      return chalk.yellow(value);
    } else {
      return chalk.green(value);
    }
  }

  colorizeIssues(count, type) {
    if (count === 0) {
      return chalk.green(count.toString());
    } else if (type === 'critical' || count > 10) {
      return chalk.red.bold(count.toString());
    } else {
      return chalk.yellow(count.toString());
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  // Export metrics to JSON for external monitoring
  exportMetrics() {
    const timestamp = new Date().toISOString();
    const exportData = {
      timestamp,
      ...this.metrics,
      healthy: this.metrics.alerts.length === 0
    };

    const exportPath = 'logs/monitoring-metrics.json';
    
    // Ensure logs directory exists
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }

    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    
    return exportPath;
  }
}

// CLI execution
async function runMonitor() {
  const monitor = new SystemMonitor();
  
  try {
    const healthy = await monitor.monitor();
    
    // Export metrics
    const exportPath = monitor.exportMetrics();
    console.log(chalk.gray(`📄 Metrics exported to: ${exportPath}\n`));
    
    // Exit code based on health
    process.exit(healthy ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('❌ Monitoring error:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMonitor();
}

export default SystemMonitor;