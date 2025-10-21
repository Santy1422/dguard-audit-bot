#!/usr/bin/env node

import fs from 'fs';
import axios from 'axios';
import chalk from 'chalk';

class TeamsNotifier {
  constructor() {
    this.webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    this.baseUrl = process.env.REPORT_BASE_URL || 'https://github.com';
    this.repoPath = process.env.GITHUB_REPOSITORY || 'santiagogarcia/dguard-audit-bot';
  }

  async notify(type = 'report', customMessage = null) {
    if (!this.webhookUrl) {
      console.log(chalk.yellow('⚠️  TEAMS_WEBHOOK_URL not configured - skipping Teams notification'));
      return false;
    }

    try {
      let card;
      
      switch (type) {
        case 'report':
          card = await this.createReportCard();
          break;
        case 'alert':
          card = await this.createAlertCard();
          break;
        case 'health':
          card = await this.createHealthCard();
          break;
        case 'custom':
          card = this.createCustomCard(customMessage);
          break;
        default:
          card = await this.createReportCard();
      }

      await this.sendCard(card);
      console.log(chalk.green('✅ Teams notification sent successfully'));
      return true;

    } catch (error) {
      console.error(chalk.red('❌ Failed to send Teams notification:'), error.message);
      return false;
    }
  }

  async createReportCard() {
    const reportPath = 'reports/audit-report.json';
    
    if (!fs.existsSync(reportPath)) {
      return this.createCustomCard('⚠️ No audit report found');
    }

    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const issues = report.summary?.issues || {};
      const backend = report.summary?.backend || {};
      const frontend = report.summary?.frontend || {};
      const performance = report.performance || {};
      
      const themeColor = this.getThemeColor(issues);
      const status = this.getStatusText(issues);
      
      return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "DGuard Audit Report",
        "themeColor": themeColor,
        "sections": [
          {
            "activityTitle": "🔍 **DGuard Audit Report**",
            "activitySubtitle": `Generated on ${new Date().toLocaleString()}`,
            "activityImage": "https://github.com/santiagogarcia/dguard-audit-bot/raw/main/assets/icon.png"
          },
          {
            "title": "📊 **Overall Status**",
            "text": status,
            "facts": [
              {
                "name": "🔴 Critical Issues:",
                "value": issues.critical?.toString() || '0'
              },
              {
                "name": "🟠 High Priority:",
                "value": issues.high?.toString() || '0'
              },
              {
                "name": "🟡 Medium Priority:",
                "value": issues.medium?.toString() || '0'
              },
              {
                "name": "📊 Total Issues:",
                "value": issues.total?.toString() || '0'
              }
            ]
          },
          {
            "title": "🏗️ **Project Overview**",
            "facts": [
              {
                "name": "🔧 Backend Endpoints:",
                "value": backend.endpoints?.toString() || '0'
              },
              {
                "name": "⚛️ Frontend API Calls:",
                "value": frontend.apiCalls?.toString() || '0'
              },
              {
                "name": "🎨 Frontend Components:",
                "value": frontend.components?.toString() || '0'
              },
              {
                "name": "📦 Design System Components:",
                "value": report.summary?.designSystem?.components?.toString() || '0'
              }
            ]
          },
          {
            "title": "⚡ **Performance Metrics**",
            "facts": [
              {
                "name": "⏱️ Analysis Duration:",
                "value": `${performance.totalDuration || 'Unknown'} seconds`
              },
              {
                "name": "📈 Endpoint Coverage:",
                "value": `${report.summary?.coverage?.endpoints || 'N/A'}%`
              },
              {
                "name": "📁 Files Processed:",
                "value": `${(backend.files || 0) + (frontend.files || 0)}`
              }
            ]
          }
        ],
        "potentialAction": this.createActions(report)
      };
    } catch (error) {
      return this.createCustomCard(`❌ Error reading audit report: ${error.message}`);
    }
  }

  async createAlertCard() {
    const monitoringPath = 'logs/monitoring-metrics.json';
    
    if (!fs.existsSync(monitoringPath)) {
      return this.createCustomCard('⚠️ No monitoring data found');
    }

    try {
      const metrics = JSON.parse(fs.readFileSync(monitoringPath, 'utf8'));
      const alerts = metrics.alerts || [];
      
      if (alerts.length === 0) {
        return {
          "@type": "MessageCard",
          "@context": "https://schema.org/extensions",
          "summary": "System Health Check - All Good",
          "themeColor": "00FF00",
          "sections": [{
            "activityTitle": "✅ **System Health Check**",
            "activitySubtitle": "All systems operational",
            "facts": [
              {
                "name": "Status:",
                "value": "All systems healthy"
              },
              {
                "name": "Last Check:",
                "value": new Date(metrics.timestamp).toLocaleString()
              }
            ]
          }]
        };
      }

      const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
      const highAlerts = alerts.filter(a => a.severity === 'HIGH');
      const mediumAlerts = alerts.filter(a => a.severity === 'MEDIUM');
      
      return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": `System Alerts Detected (${alerts.length} total)`,
        "themeColor": criticalAlerts.length > 0 ? "FF0000" : "FFA500",
        "sections": [
          {
            "activityTitle": "🚨 **System Alerts Detected**",
            "activitySubtitle": `${alerts.length} alerts require attention`,
            "facts": [
              {
                "name": "🔴 Critical Alerts:",
                "value": criticalAlerts.length.toString()
              },
              {
                "name": "🟠 High Priority:",
                "value": highAlerts.length.toString()
              },
              {
                "name": "🟡 Medium Priority:",
                "value": mediumAlerts.length.toString()
              },
              {
                "name": "📅 Last Check:",
                "value": new Date(metrics.timestamp).toLocaleString()
              }
            ]
          },
          ...(criticalAlerts.length > 0 ? [{
            "title": "🔴 **Critical Alerts**",
            "text": criticalAlerts.map(alert => `• ${alert.message}`).join('\n\n')
          }] : []),
          ...(highAlerts.length > 0 ? [{
            "title": "🟠 **High Priority Alerts**",
            "text": highAlerts.map(alert => `• ${alert.message}`).join('\n\n')
          }] : [])
        ],
        "potentialAction": [
          {
            "@type": "OpenUri",
            "name": "View System Monitor",
            "targets": [{
              "os": "default",
              "uri": `${this.baseUrl}/${this.repoPath}/actions`
            }]
          }
        ]
      };
    } catch (error) {
      return this.createCustomCard(`❌ Error reading monitoring data: ${error.message}`);
    }
  }

  async createHealthCard() {
    return {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      "summary": "DGuard Health Check",
      "themeColor": "00FF00",
      "sections": [{
        "activityTitle": "🏥 **DGuard Audit Bot - Health Check**",
        "activitySubtitle": "Health check completed successfully",
        "facts": [
          {
            "name": "Status:",
            "value": "Health check completed"
          },
          {
            "name": "Timestamp:",
            "value": new Date().toLocaleString()
          }
        ]
      }]
    };
  }

  createCustomCard(text) {
    return {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      "summary": text,
      "themeColor": "0076D7",
      "sections": [{
        "activityTitle": "🤖 **DGuard Audit Bot**",
        "text": text
      }]
    };
  }

  getThemeColor(issues) {
    if (!issues) return "00FF00"; // green
    
    if (issues.critical > 0) return "FF0000"; // red
    if (issues.high > 0) return "FFA500"; // orange  
    if (issues.medium > 0) return "FFFF00"; // yellow
    return "00FF00"; // green
  }

  getStatusText(issues) {
    if (!issues) return "✅ Audit completed successfully with no issues detected.";
    
    if (issues.critical > 0) {
      return `🔴 **CRITICAL**: ${issues.critical} critical issues require immediate attention!`;
    }
    if (issues.high > 0) {
      return `🟠 **HIGH PRIORITY**: ${issues.high} high priority issues detected and should be addressed soon.`;
    }
    if (issues.total > 0) {
      return `🟡 **MINOR ISSUES**: ${issues.total} minor issues detected but system is generally healthy.`;
    }
    return "✅ **ALL CLEAR**: No issues detected - system is operating optimally.";
  }

  createActions(report) {
    const actions = [];
    
    // View full report action
    actions.push({
      "@type": "OpenUri",
      "name": "📊 View Full Report",
      "targets": [{
        "os": "default",
        "uri": `${this.baseUrl}/${this.repoPath}/actions`
      }]
    });
    
    // Auto-fix action if issues can be fixed
    if (report.summary?.issues?.critical > 0 || report.summary?.issues?.high > 0) {
      actions.push({
        "@type": "OpenUri",
        "name": "🔧 Run Auto-Fix",
        "targets": [{
          "os": "default",
          "uri": `${this.baseUrl}/${this.repoPath}/actions/workflows/autofix.yml`
        }]
      });
    }
    
    // Dashboard action
    actions.push({
      "@type": "OpenUri",
      "name": "📈 Open Dashboard",
      "targets": [{
        "os": "default",
        "uri": process.env.DASHBOARD_URL || `${this.baseUrl}/${this.repoPath}`
      }]
    });

    // Documentation action
    actions.push({
      "@type": "OpenUri",
      "name": "📚 View Documentation",
      "targets": [{
        "os": "default",
        "uri": `${this.baseUrl}/${this.repoPath}/blob/main/README.md`
      }]
    });
    
    return actions;
  }

  async sendCard(card) {
    const response = await axios.post(this.webhookUrl, card, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.status !== 200) {
      throw new Error(`Teams API returned status ${response.status}`);
    }

    return response.data;
  }

  // Utility method to send quick messages
  async sendQuickMessage(text, type = 'info') {
    const colors = {
      success: '00FF00',
      warning: 'FFA500', 
      error: 'FF0000',
      info: '0076D7'
    };

    const emojis = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    };

    const card = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      "summary": text,
      "themeColor": colors[type],
      "sections": [{
        "activityTitle": `${emojis[type]} **DGuard Audit Bot**`,
        "text": text,
        "facts": [{
          "name": "Timestamp:",
          "value": new Date().toLocaleString()
        }]
      }]
    };

    return await this.sendCard(card);
  }

  // Method to send rich notification with custom sections
  async sendRichNotification(title, sections, themeColor = '0076D7') {
    const card = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      "summary": title,
      "themeColor": themeColor,
      "sections": [
        {
          "activityTitle": `🤖 **${title}**`,
          "activitySubtitle": `Generated on ${new Date().toLocaleString()}`
        },
        ...sections.map(section => ({
          "title": section.title,
          "facts": section.facts?.map(fact => ({
            "name": `${fact.name}:`,
            "value": fact.value
          })) || [],
          "text": section.text
        }))
      ]
    };

    return await this.sendCard(card);
  }

  // Method to send deployment notification
  async sendDeploymentNotification(environment, status, version = null) {
    const colors = {
      success: '00FF00',
      failure: 'FF0000',
      pending: 'FFA500'
    };

    const emojis = {
      success: '🚀',
      failure: '💥',
      pending: '⏳'
    };

    const card = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      "summary": `Deployment ${status} - ${environment}`,
      "themeColor": colors[status] || '0076D7',
      "sections": [{
        "activityTitle": `${emojis[status]} **Deployment ${status.toUpperCase()}**`,
        "activitySubtitle": `Environment: ${environment}`,
        "facts": [
          {
            "name": "Environment:",
            "value": environment
          },
          {
            "name": "Status:",
            "value": status.toUpperCase()
          },
          ...(version ? [{
            "name": "Version:",
            "value": version
          }] : []),
          {
            "name": "Timestamp:",
            "value": new Date().toLocaleString()
          }
        ]
      }],
      "potentialAction": [{
        "@type": "OpenUri",
        "name": "View Deployment",
        "targets": [{
          "os": "default",
          "uri": `${this.baseUrl}/${this.repoPath}/deployments`
        }]
      }]
    };

    return await this.sendCard(card);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const type = args[0] || 'report';
  const customMessage = args[1];

  const notifier = new TeamsNotifier();
  
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

export default TeamsNotifier;