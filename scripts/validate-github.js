#!/usr/bin/env node

import chalk from 'chalk';
import { table } from 'table';
import RepositoryManager from '../src/github/RepositoryManager.js';

class GitHubValidator {
  constructor() {
    this.token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
    this.results = [];
  }

  async validate() {
    console.log(chalk.cyan.bold('🔍 DGuard GitHub Configuration Validator\n'));

    try {
      // Check 1: Token existence
      await this.checkToken();
      
      // Check 2: Token validity
      await this.checkTokenValidity();
      
      // Check 3: Repository access
      await this.checkRepositoryAccess();
      
      // Check 4: Network connectivity
      await this.checkNetworkConnectivity();
      
      // Check 5: Workspace configuration
      await this.checkWorkspaceConfig();
      
      // Display results
      this.displayResults();
      
      // Return overall status
      const failed = this.results.filter(r => !r.success).length;
      return failed === 0;
      
    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error.message);
      return false;
    }
  }

  async checkToken() {
    this.addCheck('Token Existence', () => {
      if (!this.token) {
        return {
          success: false,
          message: 'No GitHub token found in environment variables (GH_PAT or GITHUB_TOKEN)'
        };
      }
      
      if (this.token.length < 40) {
        return {
          success: false,
          message: `Token too short: ${this.token.length} characters (expected 40+)`
        };
      }
      
      return {
        success: true,
        message: `Token found (${this.token.length} characters)`
      };
    });
  }

  async checkTokenValidity() {
    if (!this.token) {
      this.addResult('Token Validity', false, 'No token to validate');
      return;
    }

    try {
      const repoManager = new RepositoryManager({ token: this.token });
      const validation = await repoManager.validateToken();
      
      if (validation.valid) {
        this.addResult('Token Validity', true, `Valid - User: ${validation.user.login}`);
        this.userInfo = validation.user;
        this.repoManager = repoManager;
      } else {
        this.addResult('Token Validity', false, validation.error);
      }
    } catch (error) {
      this.addResult('Token Validity', false, error.message);
    }
  }

  async checkRepositoryAccess() {
    if (!this.repoManager) {
      this.addResult('Repository Access', false, 'No valid token');
      return;
    }

    try {
      // Try to list user repositories
      const repos = await this.repoManager.listUserRepositories(this.userInfo.login, {
        per_page: 10
      });
      
      this.addResult('Repository Access', true, `Can access ${repos.length} repositories`);
      
      // Check specific DGuard repositories if configured
      await this.checkSpecificRepositories();
      
    } catch (error) {
      this.addResult('Repository Access', false, error.message);
    }
  }

  async checkSpecificRepositories() {
    try {
      // Load configuration to check specific repositories
      const configModule = await import('../config/projects.config.js');
      const config = configModule.default;
      
      if (!config.github?.repositories) {
        this.addResult('DGuard Repositories', true, 'No specific repositories configured');
        return;
      }

      const repositories = config.github.repositories;
      const owner = config.github.owner || this.userInfo.login;
      
      let accessibleCount = 0;
      let totalCount = 0;
      const errors = [];

      for (const [type, repoName] of Object.entries(repositories)) {
        totalCount++;
        try {
          await this.repoManager.getRepositoryInfo(owner, repoName);
          accessibleCount++;
        } catch (error) {
          errors.push(`${type}:${repoName} - ${error.message}`);
        }
      }

      if (accessibleCount === totalCount) {
        this.addResult('DGuard Repositories', true, `All ${totalCount} repositories accessible`);
      } else {
        this.addResult('DGuard Repositories', false, 
          `Only ${accessibleCount}/${totalCount} accessible. Errors: ${errors.join('; ')}`);
      }

    } catch (error) {
      this.addResult('DGuard Repositories', false, `Config error: ${error.message}`);
    }
  }

  async checkNetworkConnectivity() {
    try {
      const response = await fetch('https://api.github.com', {
        method: 'HEAD',
        headers: {
          'Authorization': `token ${this.token}`,
          'User-Agent': 'dguard-audit-bot'
        }
      });

      if (response.ok) {
        const rateLimit = response.headers.get('x-ratelimit-limit');
        const rateRemaining = response.headers.get('x-ratelimit-remaining');
        
        this.addResult('Network Connectivity', true, 
          `GitHub API accessible (Rate limit: ${rateRemaining}/${rateLimit})`);
      } else {
        this.addResult('Network Connectivity', false, 
          `HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.addResult('Network Connectivity', false, error.message);
    }
  }

  async checkWorkspaceConfig() {
    try {
      const configModule = await import('../config/projects.config.js');
      const config = configModule.default;
      
      if (!config.github) {
        this.addResult('Workspace Config', false, 'No GitHub configuration found');
        return;
      }

      const workspace = config.github.workspace || {};
      const checks = [];

      // Check workspace directory
      const workspaceDir = workspace.directory || './workspace';
      try {
        const fs = await import('fs');
        if (!fs.existsSync(workspaceDir)) {
          fs.mkdirSync(workspaceDir, { recursive: true });
        }
        fs.accessSync(workspaceDir, fs.constants.W_OK);
        checks.push('✅ Workspace directory writable');
      } catch (error) {
        checks.push(`❌ Workspace directory: ${error.message}`);
      }

      // Check temp directory
      const tempDir = workspace.tempDirectory || './temp-repos';
      try {
        const fs = await import('fs');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.accessSync(tempDir, fs.constants.W_OK);
        checks.push('✅ Temp directory writable');
      } catch (error) {
        checks.push(`❌ Temp directory: ${error.message}`);
      }

      // Check git availability
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const { stdout } = await execAsync('git --version');
        checks.push(`✅ Git available: ${stdout.trim()}`);
      } catch (error) {
        checks.push(`❌ Git not available: ${error.message}`);
      }

      const allOk = checks.every(check => check.startsWith('✅'));
      this.addResult('Workspace Config', allOk, checks.join('; '));

    } catch (error) {
      this.addResult('Workspace Config', false, error.message);
    }
  }

  addCheck(name, checkFunction) {
    try {
      const result = checkFunction();
      this.addResult(name, result.success, result.message);
    } catch (error) {
      this.addResult(name, false, error.message);
    }
  }

  addResult(name, success, message) {
    this.results.push({ name, success, message });
  }

  displayResults() {
    console.log(chalk.bold('📋 VALIDATION RESULTS:\n'));

    const tableData = [
      ['Check', 'Status', 'Details']
    ];

    this.results.forEach(result => {
      const status = result.success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
      const message = result.message.length > 60 ? 
        result.message.substring(0, 57) + '...' : 
        result.message;
      
      tableData.push([result.name, status, message]);
    });

    const config = {
      border: {
        topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
        bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
        bodyLeft: '│', bodyRight: '│', bodyJoin: '│'
      },
      columns: {
        0: { width: 20 },
        1: { width: 12 },
        2: { width: 50 }
      }
    };

    console.log(table(tableData, config));

    // Summary
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(chalk.bold('📊 SUMMARY:'));
    console.log(`Total Checks: ${total}`);
    console.log(`${chalk.green('Passed')}: ${passed}`);
    console.log(`${chalk.red('Failed')}: ${total - passed}`);
    console.log(`Pass Rate: ${passRate}%\n`);

    if (passed === total) {
      console.log(chalk.green.bold('✅ ALL CHECKS PASSED'));
      console.log('GitHub integration is properly configured.\n');
      
      console.log(chalk.bold('🚀 Ready to use GitHub features:'));
      console.log('• npm run audit -- --github    # Clone and audit repositories');
      console.log('• npm run setup:github         # Reconfigure GitHub settings');
      console.log('• npm run validate-github      # Run this validation again');
    } else {
      console.log(chalk.red.bold('❌ SOME CHECKS FAILED'));
      console.log('Please resolve the issues above before using GitHub integration.\n');
      
      console.log(chalk.bold('🔧 Common solutions:'));
      console.log('• Verify your GitHub token has the correct permissions');
      console.log('• Run "npm run setup:github" to reconfigure');
      console.log('• Check your network connection to GitHub');
      console.log('• Ensure repository names and owner are correct in config');
    }
  }

  async testClone() {
    if (!this.repoManager) {
      console.log(chalk.red('❌ Cannot test clone - no valid repository manager'));
      return false;
    }

    console.log(chalk.bold('\n🧪 TESTING REPOSITORY CLONING:\n'));

    try {
      const configModule = await import('../config/projects.config.js');
      const config = configModule.default;
      
      if (!config.github?.repositories) {
        console.log(chalk.yellow('⚠️  No repositories configured for testing'));
        return true;
      }

      const repositories = config.github.repositories;
      const owner = config.github.owner;
      
      // Test clone one repository
      const [repoType, repoName] = Object.entries(repositories)[0];
      
      console.log(`Testing clone of ${owner}/${repoName}...`);
      
      const result = await this.repoManager.cloneRepository(owner, repoName, {
        temporary: true,
        depth: 1,
        singleBranch: true
      });
      
      console.log(chalk.green(`✅ Successfully cloned ${result.fullName}`));
      console.log(chalk.gray(`   Path: ${result.localPath}`));
      console.log(chalk.gray(`   Size: ${result.size} KB`));
      
      // Cleanup
      await this.repoManager.cleanup();
      console.log(chalk.gray('🧹 Test repository cleaned up'));
      
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ Clone test failed: ${error.message}`));
      return false;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const testClone = args.includes('--test-clone');
  
  const validator = new GitHubValidator();
  
  try {
    const valid = await validator.validate();
    
    if (valid && testClone) {
      await validator.testClone();
    }
    
    process.exit(valid ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('❌ Validation error:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default GitHubValidator;