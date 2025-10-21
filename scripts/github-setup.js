#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Octokit } from '@octokit/rest';
import RepositoryManager from '../src/github/RepositoryManager.js';

class GitHubSetupWizard {
  constructor() {
    this.config = null;
    this.repositories = [];
    this.token = null;
    this.repositoryManager = null;
  }

  async run() {
    console.log(chalk.cyan.bold('🐙 DGuard GitHub Setup Wizard\n'));
    console.log('Este asistente te ayudará a configurar la integración con GitHub');
    console.log('para clonar automáticamente tus repositorios DGuard.\n');

    try {
      // Step 1: Get GitHub token
      await this.getGitHubToken();
      
      // Step 2: Validate token and get user info
      await this.validateToken();
      
      // Step 3: Search and select repositories
      await this.selectRepositories();
      
      // Step 4: Configure workspace
      await this.configureWorkspace();
      
      // Step 5: Test clone repositories
      await this.testCloning();
      
      // Step 6: Update configuration
      await this.updateConfiguration();
      
      // Step 7: Summary
      this.showSummary();

    } catch (error) {
      console.error(chalk.red('\n❌ Setup failed:'), error.message);
      process.exit(1);
    }
  }

  async getGitHubToken() {
    console.log(chalk.bold('🔑 CONFIGURACIÓN DEL TOKEN DE GITHUB\n'));
    
    // Check if token already exists in environment
    const existingToken = process.env.GH_PAT || process.env.GITHUB_TOKEN;
    
    if (existingToken) {
      const { useExisting } = await inquirer.prompt([{
        type: 'confirm',
        name: 'useExisting',
        message: 'Se detectó un token de GitHub en las variables de entorno. ¿Usarlo?',
        default: true
      }]);
      
      if (useExisting) {
        this.token = existingToken;
        return;
      }
    }
    
    console.log('Para configurar GitHub necesitas un Personal Access Token (PAT).');
    console.log('Sigue estos pasos para crear uno:\n');
    console.log('1. Ve a: https://github.com/settings/tokens');
    console.log('2. Click en "Generate new token" → "Generate new token (classic)"');
    console.log('3. Nombre: "DGuard Audit Bot"');
    console.log('4. Selecciona estos permisos:');
    console.log('   ✅ repo (Full control of private repositories)');
    console.log('   ✅ read:user (Read user profile data)');
    console.log('   ✅ read:org (Read organization data)');
    console.log('5. Click "Generate token" y copia el token\n');

    const { token } = await inquirer.prompt([{
      type: 'password',
      name: 'token',
      message: 'Pega tu GitHub Personal Access Token:',
      validate: (input) => {
        if (!input || input.length < 40) {
          return 'El token debe tener al menos 40 caracteres';
        }
        return true;
      }
    }]);

    this.token = token;
  }

  async validateToken() {
    const spinner = ora('Validando token de GitHub...').start();
    
    try {
      this.repositoryManager = new RepositoryManager({
        token: this.token
      });
      
      const validation = await this.repositoryManager.validateToken();
      
      if (!validation.valid) {
        spinner.fail('❌ Token inválido');
        throw new Error(validation.error);
      }
      
      spinner.succeed(`✅ Token válido - Conectado como: ${validation.user.login}`);
      
      this.userInfo = validation.user;
      
      // Show token permissions
      if (validation.user.scopes.length > 0) {
        console.log(chalk.gray(`📋 Permisos: ${validation.user.scopes.join(', ')}`));
      }
      
    } catch (error) {
      spinner.fail('❌ Error validando token');
      throw error;
    }
  }

  async selectRepositories() {
    console.log(chalk.bold('\n📚 SELECCIÓN DE REPOSITORIOS\n'));
    
    // Get user repositories
    const spinner = ora('Obteniendo repositorios...').start();
    
    try {
      const repos = await this.repositoryManager.listUserRepositories(this.userInfo.login, {
        type: 'all',
        sort: 'updated',
        per_page: 100
      });
      
      spinner.succeed(`✅ Encontrados ${repos.length} repositorios`);
      
      // Filter potential DGuard repositories
      const dguardRepos = repos.filter(repo => 
        repo.name.toLowerCase().includes('dguard') ||
        repo.name.toLowerCase().includes('api') ||
        repo.name.toLowerCase().includes('frontend') ||
        repo.name.toLowerCase().includes('design') ||
        repo.name.toLowerCase().includes('system')
      );
      
      if (dguardRepos.length > 0) {
        console.log(chalk.blue(`\n🎯 Repositorios que parecen relacionados con DGuard:`));
        dguardRepos.forEach(repo => {
          console.log(`  • ${repo.fullName} - ${repo.description || 'Sin descripción'}`);
        });
      }
      
      // Manual repository selection
      await this.selectBackendRepository(repos);
      await this.selectFrontendRepository(repos);
      await this.selectDesignSystemRepository(repos);
      
    } catch (error) {
      spinner.fail('❌ Error obteniendo repositorios');
      throw error;
    }
  }

  async selectBackendRepository(repos) {
    const choices = [
      { name: '❌ Omitir (usar ruta local)', value: null },
      ...repos.map(repo => ({
        name: `${repo.fullName} - ${repo.language || 'Unknown'} - ${repo.description || 'Sin descripción'}`,
        value: repo,
        short: repo.fullName
      }))
    ];

    const { backend } = await inquirer.prompt([{
      type: 'list',
      name: 'backend',
      message: '🔧 Selecciona el repositorio BACKEND:',
      choices,
      pageSize: 15
    }]);

    if (backend) {
      this.repositories.push({
        type: 'backend',
        name: backend.name,
        fullName: backend.fullName,
        owner: backend.fullName.split('/')[0],
        repo: backend.fullName.split('/')[1],
        branch: backend.defaultBranch,
        language: backend.language,
        description: backend.description
      });
    }
  }

  async selectFrontendRepository(repos) {
    const choices = [
      { name: '❌ Omitir (usar ruta local)', value: null },
      ...repos.map(repo => ({
        name: `${repo.fullName} - ${repo.language || 'Unknown'} - ${repo.description || 'Sin descripción'}`,
        value: repo,
        short: repo.fullName
      }))
    ];

    const { frontend } = await inquirer.prompt([{
      type: 'list',
      name: 'frontend',
      message: '⚛️  Selecciona el repositorio FRONTEND:',
      choices,
      pageSize: 15
    }]);

    if (frontend) {
      this.repositories.push({
        type: 'frontend',
        name: frontend.name,
        fullName: frontend.fullName,
        owner: frontend.fullName.split('/')[0],
        repo: frontend.fullName.split('/')[1],
        branch: frontend.defaultBranch,
        language: frontend.language,
        description: frontend.description
      });
    }
  }

  async selectDesignSystemRepository(repos) {
    const choices = [
      { name: '❌ Omitir (usar ruta local)', value: null },
      ...repos.map(repo => ({
        name: `${repo.fullName} - ${repo.language || 'Unknown'} - ${repo.description || 'Sin descripción'}`,
        value: repo,
        short: repo.fullName
      }))
    ];

    const { designSystem } = await inquirer.prompt([{
      type: 'list',
      name: 'designSystem',
      message: '🎨 Selecciona el repositorio DESIGN SYSTEM:',
      choices,
      pageSize: 15
    }]);

    if (designSystem) {
      this.repositories.push({
        type: 'designSystem',
        name: designSystem.name,
        fullName: designSystem.fullName,
        owner: designSystem.fullName.split('/')[0],
        repo: designSystem.fullName.split('/')[1],
        branch: designSystem.defaultBranch,
        language: designSystem.language,
        description: designSystem.description
      });
    }
  }

  async configureWorkspace() {
    console.log(chalk.bold('\n📁 CONFIGURACIÓN DEL WORKSPACE\n'));
    
    const { workspaceDir, tempDir, autoSync, cleanupOnExit } = await inquirer.prompt([
      {
        type: 'input',
        name: 'workspaceDir',
        message: 'Directorio del workspace:',
        default: './workspace'
      },
      {
        type: 'input',
        name: 'tempDir',
        message: 'Directorio temporal:',
        default: './temp-repos'
      },
      {
        type: 'confirm',
        name: 'autoSync',
        message: '¿Auto-sincronizar repositorios en cada auditoría?',
        default: true
      },
      {
        type: 'confirm',
        name: 'cleanupOnExit',
        message: '¿Limpiar repositorios temporales al salir?',
        default: true
      }
    ]);

    this.workspaceConfig = {
      workspaceDir,
      tempDir,
      autoSync,
      cleanupOnExit
    };
  }

  async testCloning() {
    if (this.repositories.length === 0) {
      console.log(chalk.yellow('\n⚠️  No se seleccionaron repositorios para clonar.'));
      return;
    }

    console.log(chalk.bold('\n🧪 PRUEBA DE CLONADO\n'));
    
    const { testClone } = await inquirer.prompt([{
      type: 'confirm',
      name: 'testClone',
      message: '¿Quieres probar el clonado de repositorios ahora?',
      default: true
    }]);

    if (!testClone) {
      return;
    }

    try {
      // Update repository manager with workspace config
      this.repositoryManager = new RepositoryManager({
        token: this.token,
        workspaceDir: this.workspaceConfig.workspaceDir,
        tempDir: this.workspaceConfig.tempDir,
        cleanupOnExit: true // Always cleanup test repos
      });

      // Clone repositories with temporary flag
      const clonePromises = this.repositories.map(repo => 
        this.repositoryManager.cloneRepository(repo.owner, repo.repo, {
          branch: repo.branch,
          temporary: true,
          depth: 1
        })
      );

      const results = await Promise.allSettled(clonePromises);
      
      let successCount = 0;
      let errorCount = 0;
      
      results.forEach((result, index) => {
        const repo = this.repositories[index];
        
        if (result.status === 'fulfilled') {
          console.log(chalk.green(`✅ ${repo.fullName} clonado exitosamente`));
          successCount++;
        } else {
          console.log(chalk.red(`❌ ${repo.fullName} falló: ${result.reason.message}`));
          errorCount++;
        }
      });

      console.log(chalk.bold(`\n📊 Resultado: ${successCount} exitosos, ${errorCount} fallidos`));
      
      // Cleanup test repositories
      await this.repositoryManager.cleanup();
      
    } catch (error) {
      console.error(chalk.red('❌ Error en prueba de clonado:'), error.message);
    }
  }

  async updateConfiguration() {
    console.log(chalk.bold('\n⚙️  ACTUALIZANDO CONFIGURACIÓN\n'));
    
    const configPath = 'config/projects.config.js';
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Archivo de configuración no encontrado: ${configPath}`);
    }

    // Read current configuration
    const configModule = await import(path.resolve(configPath));
    const currentConfig = configModule.default;

    // Build GitHub configuration
    const githubConfig = {
      owner: this.userInfo.login,
      repositories: {},
      cloneOptions: {
        depth: 1,
        singleBranch: true,
        temporary: false,
        autoSync: this.workspaceConfig.autoSync,
        cleanBeforeClone: true,
        retries: 3,
        timeout: 300000
      },
      auth: {
        token: 'process.env.GH_PAT || process.env.GITHUB_TOKEN'
      },
      workspace: {
        directory: this.workspaceConfig.workspaceDir,
        tempDirectory: this.workspaceConfig.tempDir,
        preserveHistory: false,
        cleanupOnExit: this.workspaceConfig.cleanupOnExit
      }
    };

    // Add selected repositories
    this.repositories.forEach(repo => {
      githubConfig.repositories[repo.type] = repo.repo;
    });

    // Build advanced config
    githubConfig.advanced = {};
    this.repositories.forEach(repo => {
      githubConfig.advanced[repo.type] = {
        name: repo.repo,
        owner: repo.owner,
        branch: repo.branch,
        depth: 1,
        options: {
          singleBranch: true,
          tags: false
        }
      };
    });

    // Update configuration object
    const updatedConfig = {
      ...currentConfig,
      github: githubConfig
    };

    // Generate new configuration file content
    const configContent = this.generateConfigFile(updatedConfig);
    
    // Backup original configuration
    const backupPath = `${configPath}.backup.${Date.now()}`;
    fs.copyFileSync(configPath, backupPath);
    console.log(chalk.gray(`📄 Backup creado: ${backupPath}`));

    // Write updated configuration
    fs.writeFileSync(configPath, configContent);
    console.log(chalk.green(`✅ Configuración actualizada: ${configPath}`));

    // Create or update .env file
    await this.updateEnvFile();
  }

  generateConfigFile(config) {
    // This is a simplified version - in a real implementation you'd want a proper AST transformer
    const header = `import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default `;

    return header + JSON.stringify(config, null, 2)
      .replace(/"process\.env\.GH_PAT \|\| process\.env\.GITHUB_TOKEN"/g, 'process.env.GH_PAT || process.env.GITHUB_TOKEN')
      + ';';
  }

  async updateEnvFile() {
    const envPath = '.env';
    const envExamplePath = '.env.example';
    
    // Read existing .env if it exists
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Add or update GitHub token
    const tokenLine = `GH_PAT=${this.token}`;
    
    if (envContent.includes('GH_PAT=')) {
      envContent = envContent.replace(/GH_PAT=.*/, tokenLine);
    } else {
      envContent += `\n# GitHub Configuration\n${tokenLine}\n`;
    }

    // Add GitHub owner
    const ownerLine = `GITHUB_OWNER=${this.userInfo.login}`;
    if (envContent.includes('GITHUB_OWNER=')) {
      envContent = envContent.replace(/GITHUB_OWNER=.*/, ownerLine);
    } else {
      envContent += `${ownerLine}\n`;
    }

    // Write .env file
    fs.writeFileSync(envPath, envContent);
    console.log(chalk.green('✅ Archivo .env actualizado'));

    // Add .env to .gitignore if not already there
    const gitignorePath = '.gitignore';
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignoreContent.includes('.env')) {
        fs.appendFileSync(gitignorePath, '\n# Environment variables\n.env\n');
        console.log(chalk.green('✅ .env añadido a .gitignore'));
      }
    }
  }

  showSummary() {
    console.log(chalk.bold('\n🎉 CONFIGURACIÓN COMPLETADA\n'));
    
    console.log(chalk.green('✅ GitHub configurado exitosamente'));
    console.log(chalk.gray(`👤 Usuario: ${this.userInfo.login}`));
    console.log(chalk.gray(`📧 Email: ${this.userInfo.email || 'No configurado'}`));
    
    if (this.repositories.length > 0) {
      console.log(chalk.bold('\n📚 Repositorios configurados:'));
      this.repositories.forEach(repo => {
        console.log(chalk.blue(`  ${repo.type}: ${repo.fullName} (${repo.branch})`));
      });
    }
    
    console.log(chalk.bold('\n🚀 SIGUIENTES PASOS:\n'));
    console.log('1. Ejecuta una auditoría para probar la configuración:');
    console.log(chalk.cyan('   npm run audit'));
    console.log('');
    console.log('2. Para auditorías con GitHub (clonado automático):');
    console.log(chalk.cyan('   npm run audit -- --github'));
    console.log('');
    console.log('3. Para omitir GitHub y usar rutas locales:');
    console.log(chalk.cyan('   npm run audit -- --no-github'));
    console.log('');
    console.log('4. Para limpiar workspace:');
    console.log(chalk.cyan('   npm run clean'));
    console.log('');
    
    console.log(chalk.bold('📋 Comandos útiles:'));
    console.log('• npm run validate-config  - Validar configuración');
    console.log('• npm run monitor:health   - Health check del sistema');
    console.log('• npm run dashboard        - Dashboard interactivo');
    console.log('');
    
    console.log(chalk.yellow('💡 TIP: Tu token está guardado en .env - manténlo seguro!'));
  }
}

// CLI execution
async function main() {
  const wizard = new GitHubSetupWizard();
  await wizard.run();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default GitHubSetupWizard;