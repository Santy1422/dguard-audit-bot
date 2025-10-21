#!/usr/bin/env node

import fs from 'fs';
import axios from 'axios';
import chalk from 'chalk';

class SlackNotifier {
  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.channelOverrides = {
      critical: process.env.SLACK_CRITICAL_CHANNEL,
      alerts: process.env.SLACK_ALERTS_CHANNEL,
      reports: process.env.SLACK_REPORTS_CHANNEL
    };
  }

  async notify(type = 'report', customMessage = null) {
    if (!this.webhookUrl) {
      console.log(chalk.yellow('⚠️  SLACK_WEBHOOK_URL not configured - skipping Slack notification'));
      return false;
    }

    try {
      let message;
      
      switch (type) {
        case 'report':
          message = await this.createReportMessage();
          break;
        case 'alert':
          message = await this.createAlertMessage();
          break;
        case 'health':
          message = await this.createHealthMessage();
          break;
        case 'custom':
          message = this.createCustomMessage(customMessage);
          break;
        default:
          message = await this.createReportMessage();
      }

      await this.sendMessage(message);
      console.log(chalk.green('✅ Slack notification sent successfully'));
      return true;

    } catch (error) {
      console.error(chalk.red('❌ Failed to send Slack notification:'), error.message);
      return false;
    }
  }

  async createReportMessage() {
    const reportPath = 'reports/audit-report.json';
    
    if (!fs.existsSync(reportPath)) {
      return this.createCustomMessage('⚠️ No audit report found');
    }

    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const timestamp = Math.floor(Date.now() / 1000);
      
      const color = this.getColorForSeverity(report.summary?.issues);
      const emoji = this.getEmojiForSeverity(report.summary?.issues);
      
      return {
        text: `${emoji} DGuard Audit Report - ${new Date().toLocaleString()}`,
        attachments: [{
          color,
          pretext: this.getPretext(report.summary?.issues),
          title: '🔍 DGuard Audit Results',
          title_link: this.getReportUrl(),
          fields: [
            {
              title: 'Issues Summary',
              value: this.formatIssuesSummary(report.summary?.issues),
              short: false
            },
            {
              title: 'Critical Issues',
              value: report.summary?.issues?.critical || 0,
              short: true
            },
            {
              title: 'High Priority',
              value: report.summary?.issues?.high || 0,
              short: true
            },
            {
              title: 'Backend Endpoints',
              value: report.summary?.backend?.endpoints || 0,
              short: true
            },
            {
              title: 'Frontend API Calls',
              value: report.summary?.frontend?.apiCalls || 0,
              short: true
            },
            {
              title: 'Analysis Duration',
              value: `${report.performance?.totalDuration || 'Unknown'}s`,
              short: true
            },
            {
              title: 'Coverage',
              value: `${report.summary?.coverage?.endpoints || 'N/A'}%`,
              short: true
            }
          ],
          footer: 'DGuard Audit Bot',
          footer_icon: 'https://github.com/santiagogarcia/dguard-audit-bot/raw/main/assets/icon.png',
          ts: timestamp,
          actions: this.createActions(report)
        }]
      };
    } catch (error) {
      return this.createCustomMessage(`❌ Error reading audit report: ${error.message}`);
    }
  }

  async createAlertMessage() {
    const monitoringPath = 'logs/monitoring-metrics.json';
    
    if (!fs.existsSync(monitoringPath)) {
      return this.createCustomMessage('⚠️ No monitoring data found');
    }

    try {
      const metrics = JSON.parse(fs.readFileSync(monitoringPath, 'utf8'));
      const alerts = metrics.alerts || [];
      
      if (alerts.length === 0) {
        return {
          text: '✅ System Health Check - All systems operational',
          attachments: [{
            color: 'good',
            fields: [
              {
                title: 'Status',
                value: 'All systems healthy',
                short: true
              },
              {
                title: 'Last Check',
                value: new Date(metrics.timestamp).toLocaleString(),
                short: true
              }
            ]
          }]
        };
      }

      const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
      const highAlerts = alerts.filter(a => a.severity === 'HIGH');
      
      return {
        text: `🚨 System Alerts Detected (${alerts.length} total)`,
        attachments: [{
          color: criticalAlerts.length > 0 ? 'danger' : 'warning',
          fields: [
            {
              title: 'Critical Alerts',
              value: criticalAlerts.length > 0 ? 
                criticalAlerts.map(a => `• ${a.message}`).join('\n') : 
                'None',
              short: false
            },
            {
              title: 'High Priority Alerts',
              value: highAlerts.length > 0 ?
                highAlerts.map(a => `• ${a.message}`).join('\n') :
                'None',
              short: false
            },
            {
              title: 'Total Alerts',
              value: alerts.length,
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date(metrics.timestamp).toLocaleString(),
              short: true
            }
          ],
          footer: 'DGuard System Monitor'
        }]
      };
    } catch (error) {
      return this.createCustomMessage(`❌ Error reading monitoring data: ${error.message}`);
    }
  }

  async createHealthMessage() {
    return {
      text: '🏥 DGuard Audit Bot - Health Check',
      attachments: [{
        color: 'good',
        fields: [
          {
            title: 'Status',
            value: 'Health check completed',
            short: true
          },
          {
            title: 'Timestamp',
            value: new Date().toLocaleString(),
            short: true
          }
        ],
        footer: 'DGuard Health Monitor'
      }]
    };
  }

  createCustomMessage(text) {
    return {
      text,
      username: 'DGuard Audit Bot',
      icon_emoji: ':robot_face:'
    };
  }

  getColorForSeverity(issues) {
    if (!issues) return '#36a64f'; // green
    
    if (issues.critical > 0) return '#d00000'; // red
    if (issues.high > 0) return '#ff8c00'; // orange
    if (issues.medium > 0) return '#ffcc00'; // yellow
    return '#36a64f'; // green
  }

  getEmojiForSeverity(issues) {
    if (!issues) return '✅';
    
    if (issues.critical > 0) return '🔴';
    if (issues.high > 0) return '🟠';
    if (issues.medium > 0) return '🟡';
    return '✅';
  }

  getPretext(issues) {
    if (!issues) return 'Audit completed successfully';
    
    if (issues.critical > 0) {
      return `⚠️ *CRITICAL*: ${issues.critical} critical issues require immediate attention!`;
    }
    if (issues.high > 0) {
      return `⚠️ *HIGH PRIORITY*: ${issues.high} high priority issues detected`;
    }
    if (issues.total > 0) {
      return `Minor issues detected (${issues.total} total)`;
    }
    return 'All checks passed - no issues detected';
  }

  formatIssuesSummary(issues) {
    if (!issues) return 'No data available';
    
    const parts = [];
    
    if (issues.critical > 0) {
      parts.push(`🔴 ${issues.critical} Critical`);
    }
    if (issues.high > 0) {
      parts.push(`🟠 ${issues.high} High`);
    }
    if (issues.medium > 0) {
      parts.push(`🟡 ${issues.medium} Medium`);
    }
    if (issues.low > 0) {
      parts.push(`⚪ ${issues.low} Low`);
    }
    
    if (parts.length === 0) {
      return '✅ No issues detected';
    }
    
    return parts.join(' | ') + ` | Total: ${issues.total}`;
  }

  getReportUrl() {
    // In a real deployment, this would point to your hosted report
    const baseUrl = process.env.REPORT_BASE_URL || 'https://github.com';
    const repoPath = process.env.GITHUB_REPOSITORY || 'santiagogarcia/dguard-audit-bot';
    return `${baseUrl}/${repoPath}/actions`;
  }

  createActions(report) {
    const actions = [];
    
    // View full report action
    actions.push({
      type: 'button',
      text: 'View Full Report',
      url: this.getReportUrl(),
      style: 'primary'
    });
    
    // Auto-fix action if issues can be fixed
    if (report.summary?.issues?.critical > 0 || report.summary?.issues?.high > 0) {
      actions.push({
        type: 'button',
        text: 'Run Auto-Fix',
        url: `${this.getReportUrl()}/workflows/autofix.yml`,
        style: 'danger'
      });
    }
    
    // Dashboard action
    actions.push({
      type: 'button',
      text: 'Open Dashboard',
      url: process.env.DASHBOARD_URL || this.getReportUrl()
    });
    
    return actions;
  }

  async sendMessage(message) {
    // Add default configurations
    const payload = {
      username: 'DGuard Audit Bot',
      icon_emoji: ':robot_face:',
      ...message
    };

    // Add channel override if specified
    const messageType = this.detectMessageType(message);
    if (this.channelOverrides[messageType]) {
      payload.channel = this.channelOverrides[messageType];
    }

    const response = await axios.post(this.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.status !== 200) {
      throw new Error(`Slack API returned status ${response.status}`);
    }

    return response.data;
  }

  detectMessageType(message) {
    const text = message.text?.toLowerCase() || '';
    const pretext = message.attachments?.[0]?.pretext?.toLowerCase() || '';
    
    if (text.includes('critical') || pretext.includes('critical')) {
      return 'critical';
    }
    if (text.includes('alert') || text.includes('warning')) {
      return 'alerts';
    }
    return 'reports';
  }

  // Utility method to send quick messages
  async sendQuickMessage(text, type = 'info') {
    const colors = {
      success: 'good',
      warning: 'warning',
      error: 'danger',
      info: '#36a64f'
    };

    const emojis = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    };

    const message = {
      text: `${emojis[type]} ${text}`,
      attachments: [{
        color: colors[type],
        text: text,
        footer: 'DGuard Audit Bot',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    return await this.sendMessage(message);
  }

  // Method to send rich notification with custom fields
  async sendRichNotification(title, fields, color = 'good') {
    const message = {
      text: title,
      attachments: [{
        color,
        title,
        fields: fields.map(field => ({
          title: field.title,
          value: field.value,
          short: field.short || false
        })),
        footer: 'DGuard Audit Bot',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    return await this.sendMessage(message);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const type = args[0] || 'report';
  const customMessage = args[1];

  const notifier = new SlackNotifier();
  
  try {
    const success = await notifier.notify(type, customMessage);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('❌ Notification failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SlackNotifier;