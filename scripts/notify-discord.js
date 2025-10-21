#!/usr/bin/env node

import fs from 'fs';
import axios from 'axios';
import chalk from 'chalk';

class DiscordNotifier {
  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    this.baseUrl = process.env.REPORT_BASE_URL || 'https://github.com';
    this.repoPath = process.env.GITHUB_REPOSITORY || 'santiagogarcia/dguard-audit-bot';
    this.username = 'DGuard Audit Bot';
    this.avatarUrl = 'https://github.com/santiagogarcia/dguard-audit-bot/raw/main/assets/icon.png';
  }

  async notify(type = 'report', customMessage = null) {
    if (!this.webhookUrl) {
      console.log(chalk.yellow('⚠️  DISCORD_WEBHOOK_URL not configured - skipping Discord notification'));
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
      console.log(chalk.green('✅ Discord notification sent successfully'));
      return true;

    } catch (error) {
      console.error(chalk.red('❌ Failed to send Discord notification:'), error.message);
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
      const issues = report.summary?.issues || {};
      const backend = report.summary?.backend || {};
      const frontend = report.summary?.frontend || {};
      const performance = report.performance || {};
      
      const color = this.getEmbedColor(issues);
      const status = this.getStatusText(issues);
      
      return {
        username: this.username,
        avatar_url: this.avatarUrl,
        content: `🔍 **DGuard Audit Report** - ${new Date().toLocaleString()}`,
        embeds: [{
          title: "📊 Audit Results",
          description: status,
          color: color,
          thumbnail: {
            url: this.avatarUrl
          },
          fields: [
            {
              name: "🚨 Issues Summary",
              value: this.formatIssuesSummary(issues),
              inline: false
            },
            {
              name: "🔴 Critical",
              value: issues.critical?.toString() || '0',
              inline: true
            },
            {
              name: "🟠 High",
              value: issues.high?.toString() || '0',
              inline: true
            },
            {
              name: "🟡 Medium",
              value: issues.medium?.toString() || '0',
              inline: true
            },
            {
              name: "🔧 Backend Endpoints",
              value: backend.endpoints?.toString() || '0',
              inline: true
            },
            {
              name: "⚛️ Frontend API Calls",
              value: frontend.apiCalls?.toString() || '0',
              inline: true
            },
            {
              name: "🎨 Frontend Components",
              value: frontend.components?.toString() || '0',
              inline: true
            },
            {
              name: "📦 Design System",
              value: report.summary?.designSystem?.components?.toString() || '0',
              inline: true
            },
            {
              name: "⏱️ Duration",
              value: `${performance.totalDuration || 'Unknown'}s`,
              inline: true
            },
            {
              name: "📈 Coverage",
              value: `${report.summary?.coverage?.endpoints || 'N/A'}%`,
              inline: true
            }
          ],
          footer: {
            text: "DGuard Audit Bot",
            icon_url: this.avatarUrl
          },
          timestamp: new Date().toISOString(),
          url: `${this.baseUrl}/${this.repoPath}/actions`
        }],
        components: this.createComponents(report)
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
          username: this.username,
          avatar_url: this.avatarUrl,
          content: "✅ **System Health Check** - All systems operational",
          embeds: [{
            title: "🏥 Health Status",
            description: "All systems are running smoothly",
            color: 0x00FF00, // green
            fields: [
              {
                name: "Status",
                value: "✅ Healthy",
                inline: true
              },
              {
                name: "Last Check",
                value: new Date(metrics.timestamp).toLocaleString(),
                inline: true
              }
            ],
            footer: {
              text: "DGuard System Monitor",
              icon_url: this.avatarUrl
            },
            timestamp: new Date().toISOString()
          }]
        };
      }

      const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
      const highAlerts = alerts.filter(a => a.severity === 'HIGH');
      const mediumAlerts = alerts.filter(a => a.severity === 'MEDIUM');
      
      const alertFields = [];
      
      if (criticalAlerts.length > 0) {
        alertFields.push({
          name: "🔴 Critical Alerts",
          value: criticalAlerts.map(a => `• ${a.message}`).join('\n'),
          inline: false
        });
      }
      
      if (highAlerts.length > 0) {
        alertFields.push({
          name: "🟠 High Priority Alerts", 
          value: highAlerts.map(a => `• ${a.message}`).join('\n'),
          inline: false
        });
      }
      
      if (mediumAlerts.length > 0) {
        alertFields.push({
          name: "🟡 Medium Priority Alerts",
          value: mediumAlerts.map(a => `• ${a.message}`).join('\n'),
          inline: false
        });
      }
      
      return {
        username: this.username,
        avatar_url: this.avatarUrl,
        content: `🚨 **System Alerts Detected** - ${alerts.length} alerts require attention`,
        embeds: [{
          title: "⚠️ System Alerts",
          description: `${alerts.length} alerts detected across the system`,
          color: criticalAlerts.length > 0 ? 0xFF0000 : 0xFFA500, // red or orange
          fields: [
            {
              name: "📊 Alert Summary",
              value: `🔴 ${criticalAlerts.length} Critical\n🟠 ${highAlerts.length} High\n🟡 ${mediumAlerts.length} Medium`,
              inline: true
            },
            {
              name: "📅 Last Check",
              value: new Date(metrics.timestamp).toLocaleString(),
              inline: true
            },
            ...alertFields
          ],
          footer: {
            text: "DGuard System Monitor",
            icon_url: this.avatarUrl
          },
          timestamp: new Date().toISOString()
        }]
      };
    } catch (error) {
      return this.createCustomMessage(`❌ Error reading monitoring data: ${error.message}`);
    }
  }

  async createHealthMessage() {
    return {
      username: this.username,
      avatar_url: this.avatarUrl,
      content: "🏥 **Health Check Completed**",
      embeds: [{
        title: "System Health Check",
        description: "Health check completed successfully",
        color: 0x00FF00, // green
        fields: [
          {
            name: "Status",
            value: "✅ Health check completed",
            inline: true
          },
          {
            name: "Timestamp",
            value: new Date().toLocaleString(),
            inline: true
          }
        ],
        footer: {
          text: "DGuard Health Monitor",
          icon_url: this.avatarUrl
        },
        timestamp: new Date().toISOString()
      }]
    };
  }

  createCustomMessage(text) {
    return {
      username: this.username,
      avatar_url: this.avatarUrl,
      content: text,
      embeds: [{
        title: "DGuard Audit Bot",
        description: text,
        color: 0x0076D7, // blue
        footer: {
          text: "DGuard Audit Bot",
          icon_url: this.avatarUrl
        },
        timestamp: new Date().toISOString()
      }]
    };
  }

  getEmbedColor(issues) {
    if (!issues) return 0x00FF00; // green
    
    if (issues.critical > 0) return 0xFF0000; // red
    if (issues.high > 0) return 0xFFA500; // orange
    if (issues.medium > 0) return 0xFFFF00; // yellow
    return 0x00FF00; // green
  }

  getStatusText(issues) {
    if (!issues) return "✅ Audit completed successfully with no issues detected.";
    
    if (issues.critical > 0) {
      return `🔴 **CRITICAL**: ${issues.critical} critical issues require immediate attention!`;
    }
    if (issues.high > 0) {
      return `🟠 **HIGH PRIORITY**: ${issues.high} high priority issues detected.`;
    }
    if (issues.total > 0) {
      return `🟡 **MINOR ISSUES**: ${issues.total} minor issues detected.`;
    }
    return "✅ **ALL CLEAR**: No issues detected - system is operating optimally.";
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
    
    return parts.join(' • ');
  }

  createComponents(report) {
    const components = [];
    
    // Action Row with buttons
    const actionRow = {
      type: 1, // Action Row
      components: []
    };
    
    // View Report Button
    actionRow.components.push({
      type: 2, // Button
      style: 5, // Link button
      label: "📊 View Full Report",
      url: `${this.baseUrl}/${this.repoPath}/actions`
    });
    
    // Auto-fix button if issues exist
    if (report.summary?.issues?.critical > 0 || report.summary?.issues?.high > 0) {
      actionRow.components.push({
        type: 2, // Button
        style: 5, // Link button  
        label: "🔧 Run Auto-Fix",
        url: `${this.baseUrl}/${this.repoPath}/actions/workflows/autofix.yml`
      });
    }
    
    // Dashboard button
    actionRow.components.push({
      type: 2, // Button
      style: 5, // Link button
      label: "📈 Dashboard",
      url: process.env.DASHBOARD_URL || `${this.baseUrl}/${this.repoPath}`
    });
    
    components.push(actionRow);
    
    return components;
  }

  async sendMessage(message) {
    const response = await axios.post(this.webhookUrl, message, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.status !== 204) {
      throw new Error(`Discord API returned status ${response.status}`);
    }

    return response.data;
  }

  // Utility method to send quick messages
  async sendQuickMessage(text, type = 'info') {
    const colors = {
      success: 0x00FF00,
      warning: 0xFFA500,
      error: 0xFF0000,
      info: 0x0076D7
    };

    const emojis = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    };

    const message = {
      username: this.username,
      avatar_url: this.avatarUrl,
      content: `${emojis[type]} ${text}`,
      embeds: [{
        title: "DGuard Audit Bot",
        description: text,
        color: colors[type],
        footer: {
          text: "DGuard Audit Bot",
          icon_url: this.avatarUrl
        },
        timestamp: new Date().toISOString()
      }]
    };

    return await this.sendMessage(message);
  }

  // Method to send rich notification with custom embeds
  async sendRichNotification(title, fields, color = 0x0076D7) {
    const message = {
      username: this.username,
      avatar_url: this.avatarUrl,
      content: `🤖 **${title}**`,
      embeds: [{
        title: title,
        color: color,
        fields: fields.map(field => ({
          name: field.name,
          value: field.value,
          inline: field.inline || false
        })),
        footer: {
          text: "DGuard Audit Bot",
          icon_url: this.avatarUrl
        },
        timestamp: new Date().toISOString()
      }]
    };

    return await this.sendMessage(message);
  }

  // Method to send deployment notification
  async sendDeploymentNotification(environment, status, version = null) {
    const colors = {
      success: 0x00FF00,
      failure: 0xFF0000,
      pending: 0xFFA500
    };

    const emojis = {
      success: '🚀',
      failure: '💥',
      pending: '⏳'
    };

    const fields = [
      {
        name: "Environment",
        value: environment,
        inline: true
      },
      {
        name: "Status", 
        value: status.toUpperCase(),
        inline: true
      }
    ];

    if (version) {
      fields.push({
        name: "Version",
        value: version,
        inline: true
      });
    }

    const message = {
      username: this.username,
      avatar_url: this.avatarUrl,
      content: `${emojis[status]} **Deployment ${status.toUpperCase()}** - ${environment}`,
      embeds: [{
        title: `Deployment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `Environment: ${environment}`,
        color: colors[status] || 0x0076D7,
        fields: fields,
        footer: {
          text: "DGuard Deployment Monitor",
          icon_url: this.avatarUrl
        },
        timestamp: new Date().toISOString()
      }]
    };

    return await this.sendMessage(message);
  }

  // Method to send progress updates
  async sendProgressUpdate(task, progress, total) {
    const percentage = Math.round((progress / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    
    const message = {
      username: this.username,
      avatar_url: this.avatarUrl,
      content: `⏳ **${task}** - ${percentage}% complete`,
      embeds: [{
        title: task,
        description: `${progressBar} ${progress}/${total} (${percentage}%)`,
        color: percentage === 100 ? 0x00FF00 : 0x0076D7,
        footer: {
          text: "DGuard Audit Bot",
          icon_url: this.avatarUrl
        },
        timestamp: new Date().toISOString()
      }]
    };

    return await this.sendMessage(message);
  }

  createProgressBar(percentage, length = 20) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const type = args[0] || 'report';
  const customMessage = args[1];

  const notifier = new DiscordNotifier();
  
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

export default DiscordNotifier;