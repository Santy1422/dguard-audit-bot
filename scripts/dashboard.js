#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import { table } from 'table';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class AuditDashboard {
  constructor() {
    this.report = null;
    this.currentView = 'main';
    this.reportPath = 'reports/audit-report.json';
  }

  async start() {
    console.clear();
    this.showBanner();
    
    // Verificar si existe un reporte
    if (!fs.existsSync(this.reportPath)) {
      await this.noReportFound();
      return;
    }

    try {
      this.report = JSON.parse(fs.readFileSync(this.reportPath, 'utf8'));
      await this.showMainMenu();
    } catch (e) {
      console.error(chalk.red('❌ Error cargando reporte:'), e.message);
      console.log(chalk.yellow('\\n💡 Ejecuta primero: npm run audit'));
      process.exit(1);
    }
  }

  showBanner() {
    console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║           🔍 DGUARD AUDIT DASHBOARD                            ║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════════╝'));
    console.log('');
  }

  async noReportFound() {
    console.log(chalk.yellow('⚠️  No se encontró un reporte de auditoría'));
    console.log('');
    console.log('Para usar el dashboard, primero ejecuta una auditoría:');
    console.log(chalk.cyan('  npm run audit'));
    console.log('');
    
    const runNow = await this.ask('¿Quieres ejecutar una auditoría ahora? (y/n): ');
    
    if (runNow.toLowerCase() === 'y' || runNow.toLowerCase() === 'yes') {
      console.log('\\n🚀 Ejecutando auditoría...');
      
      const { spawn } = await import('child_process');
      const audit = spawn('npm', ['run', 'audit'], { stdio: 'inherit' });
      
      audit.on('close', (code) => {
        if (code === 0) {
          console.log('\\n✅ Auditoría completada. Reiniciando dashboard...');
          setTimeout(() => this.start(), 2000);
        } else {
          console.log('\\n❌ Error en la auditoría');
          process.exit(1);
        }
      });
    } else {
      console.log('\\n👋 ¡Hasta luego!');
      process.exit(0);
    }
  }

  async showMainMenu() {
    console.clear();
    this.showBanner();
    
    const s = this.report.summary;
    const timestamp = new Date(this.report.metadata.timestamp).toLocaleString('es-ES');
    
    console.log(chalk.bold('📊 RESUMEN GENERAL:'));
    console.log(chalk.gray(`   Generado: ${timestamp}`));
    console.log('');
    
    // Tabla de resumen
    const summaryData = [
      ['Categoría', 'Valor'],
      ['Backend Endpoints', s.backend.endpoints.toString()],
      ['Frontend API Calls', s.frontend.apiCalls.toString()],
      ['Frontend Components', s.frontend.components.toString()],
      ['Design System Components', s.designSystem.components.toString()],
      ['', ''],
      ['🔴 Issues Críticos', chalk.red.bold(s.issues.critical.toString())],
      ['🟠 Issues Altos', chalk.yellow.bold(s.issues.high.toString())],
      ['🟡 Issues Medios', s.issues.medium.toString()],
      ['⚪ Issues Bajos', s.issues.low.toString()],
      ['📊 Total Issues', chalk.bold(s.issues.total.toString())]
    ];

    const summaryConfig = {
      border: {
        topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
        bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
        bodyLeft: '│', bodyRight: '│', bodyJoin: '│'
      },
      columns: {
        0: { width: 25 },
        1: { width: 15, alignment: 'right' }
      }
    };

    console.log(table(summaryData, summaryConfig));
    
    // Estado del proyecto
    this.showProjectHealth(s);
    
    console.log('━'.repeat(64));
    console.log('');
    console.log(chalk.bold('🎯 OPCIONES:'));
    console.log('');
    console.log('  1. 🔴 Ver issues críticos');
    console.log('  2. 🟠 Ver issues altos');
    console.log('  3. 📋 Ver todos los endpoints');
    console.log('  4. 🔍 Buscar endpoint específico');
    console.log('  5. 🧩 Ver componentes del Design System');
    console.log('  6. 📊 Ver estadísticas detalladas');
    console.log('  7. 📈 Ver métricas de rendimiento');
    console.log('  8. 🌐 Abrir reporte HTML');
    console.log('  9. 📁 Abrir carpeta de reportes');
    console.log('  r. 🔄 Ejecutar nueva auditoría');
    console.log('  0. 👋 Salir');
    console.log('');
    
    const option = await this.ask('Selecciona una opción: ');
    await this.handleMainMenuOption(option);
  }

  showProjectHealth(summary) {
    const { critical, high, total } = summary.issues;
    
    console.log(chalk.bold('🏥 ESTADO DEL PROYECTO:'));
    
    if (total === 0) {
      console.log(chalk.green.bold('   ✅ EXCELENTE - Sin issues detectados'));
    } else if (critical > 0) {
      console.log(chalk.red.bold(`   🔴 CRÍTICO - ${critical} issues críticos requieren atención INMEDIATA`));
    } else if (high > 0) {
      console.log(chalk.yellow.bold(`   🟠 ATENCIÓN - ${high} issues altos necesitan ser resueltos pronto`));
    } else {
      console.log(chalk.blue.bold('   🟡 BUENO - Solo issues menores detectados'));
    }
    
    // Cobertura
    if (summary.coverage) {
      const endpointCoverage = parseFloat(summary.coverage.endpoints || 0);
      const componentCoverage = parseFloat(summary.coverage.components || 0);
      
      console.log('');
      console.log(chalk.bold('📊 COBERTURA:'));
      
      if (endpointCoverage > 0) {
        const coverageColor = endpointCoverage >= 80 ? chalk.green : 
                             endpointCoverage >= 60 ? chalk.yellow : chalk.red;
        console.log(`   Endpoints: ${coverageColor(endpointCoverage.toFixed(1) + '%')}`);
      }
      
      if (componentCoverage > 0) {
        const coverageColor = componentCoverage >= 70 ? chalk.green : 
                             componentCoverage >= 50 ? chalk.yellow : chalk.red;
        console.log(`   Componentes DS: ${coverageColor(componentCoverage.toFixed(1) + '%')}`);
      }
    }
    
    console.log('');
  }

  async handleMainMenuOption(option) {
    switch(option.toLowerCase()) {
      case '1':
        await this.showCriticalIssues();
        break;
      case '2':
        await this.showHighIssues();
        break;
      case '3':
        await this.showAllEndpoints();
        break;
      case '4':
        await this.searchEndpoint();
        break;
      case '5':
        await this.showDesignSystemComponents();
        break;
      case '6':
        await this.showDetailedStats();
        break;
      case '7':
        await this.showPerformanceMetrics();
        break;
      case '8':
        await this.openHTMLReport();
        break;
      case '9':
        await this.openReportsFolder();
        break;
      case 'r':
        await this.runNewAudit();
        break;
      case '0':
        console.log('\\n👋 ¡Hasta luego!\\n');
        process.exit(0);
        break;
      default:
        console.log('\\n❌ Opción inválida\\n');
        await this.waitForEnter();
        await this.showMainMenu();
    }
  }

  async showCriticalIssues() {
    console.clear();
    this.showBanner();
    console.log(chalk.red.bold('🔴 ISSUES CRÍTICOS:\\n'));
    
    const critical = this.report.issues.filter(i => i.severity === 'CRITICAL');
    
    if (critical.length === 0) {
      console.log(chalk.green('✅ No hay issues críticos\\n'));
    } else {
      console.log(chalk.red.bold(`Se encontraron ${critical.length} issues críticos:\\n`));
      
      critical.slice(0, 20).forEach((issue, idx) => {
        console.log(chalk.red(`${idx + 1}. ${issue.type}`));
        console.log(`   ${issue.message}`);
        if (issue.endpoint) console.log(chalk.gray(`   Endpoint: ${issue.endpoint}`));
        if (issue.frontend) console.log(chalk.gray(`   Frontend: ${issue.frontend}`));
        if (issue.backend) console.log(chalk.gray(`   Backend: ${issue.backend}`));
        console.log('');
      });
      
      if (critical.length > 20) {
        console.log(chalk.red(`... y ${critical.length - 20} issues críticos adicionales`));
      }
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async showHighIssues() {
    console.clear();
    this.showBanner();
    console.log(chalk.yellow.bold('🟠 ISSUES ALTOS:\\n'));
    
    const high = this.report.issues.filter(i => i.severity === 'HIGH');
    
    if (high.length === 0) {
      console.log(chalk.green('✅ No hay issues altos\\n'));
    } else {
      high.slice(0, 15).forEach((issue, idx) => {
        console.log(chalk.yellow(`${idx + 1}. ${issue.type}`));
        console.log(`   ${issue.message}`);
        if (issue.endpoint) console.log(chalk.gray(`   Endpoint: ${issue.endpoint}`));
        console.log('');
      });
      
      if (high.length > 15) {
        console.log(chalk.yellow(`... y ${high.length - 15} issues altos adicionales`));
      }
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async showAllEndpoints() {
    console.clear();
    this.showBanner();
    console.log(chalk.bold('📋 ENDPOINTS BACKEND:\\n'));
    
    if (!this.report.projects.backend || !this.report.projects.backend.endpoints) {
      console.log('❌ No se encontraron endpoints en el backend\\n');
      await this.waitForEnter();
      await this.showMainMenu();
      return;
    }
    
    const endpoints = this.report.projects.backend.endpoints;
    const used = endpoints.filter(e => e.used);
    const unused = endpoints.filter(e => !e.used);
    
    console.log(`Total: ${endpoints.length} | Usados: ${chalk.green(used.length)} | Sin uso: ${chalk.red(unused.length)}\\n`);
    
    // Mostrar opções
    console.log('Opciones:');
    console.log('  1. Ver endpoints usados');
    console.log('  2. Ver endpoints sin uso');
    console.log('  3. Ver todos');
    console.log('  0. Volver');
    console.log('');
    
    const option = await this.ask('Selecciona: ');
    
    let toShow = [];
    switch(option) {
      case '1':
        toShow = used;
        console.log(chalk.green.bold('\\n📋 ENDPOINTS USADOS:\\n'));
        break;
      case '2':
        toShow = unused;
        console.log(chalk.red.bold('\\n📋 ENDPOINTS SIN USO:\\n'));
        break;
      case '3':
        toShow = endpoints;
        console.log(chalk.bold('\\n📋 TODOS LOS ENDPOINTS:\\n'));
        break;
      case '0':
        await this.showMainMenu();
        return;
      default:
        console.log('\\nOpción inválida');
        await this.waitForEnter();
        await this.showAllEndpoints();
        return;
    }
    
    toShow.slice(0, 30).forEach((endpoint, idx) => {
      const methodColor = this.getMethodColor(endpoint.method);
      const usedIcon = endpoint.used ? '✅' : '❌';
      const authIcon = endpoint.requiresAuth ? '🔒' : '🔓';
      
      console.log(`${idx + 1}. ${methodColor(endpoint.method.padEnd(6))} ${endpoint.path}`);
      console.log(`   ${usedIcon} ${authIcon} ${chalk.gray(endpoint.file)}`);
      console.log('');
    });
    
    if (toShow.length > 30) {
      console.log(chalk.gray(`... y ${toShow.length - 30} endpoints adicionales`));
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async searchEndpoint() {
    console.clear();
    this.showBanner();
    
    const search = await this.ask('🔍 Buscar endpoint (método + ruta, ej: "GET users"): ');
    
    if (!search.trim()) {
      await this.showMainMenu();
      return;
    }
    
    console.log(`\\n🔍 Resultados para: "${search}"\\n`);
    
    const endpoints = this.report.projects.backend?.endpoints || [];
    const results = endpoints.filter(e => 
      e.key.toLowerCase().includes(search.toLowerCase()) ||
      e.path.toLowerCase().includes(search.toLowerCase()) ||
      e.method.toLowerCase().includes(search.toLowerCase())
    );
    
    if (results.length === 0) {
      console.log('❌ No se encontraron resultados\\n');
    } else {
      results.slice(0, 10).forEach((endpoint, idx) => {
        console.log(`${idx + 1}. ${this.getMethodColor(endpoint.method)(endpoint.method)} ${endpoint.path}`);
        console.log(`   Archivo: ${chalk.gray(endpoint.file)}`);
        console.log(`   Usado: ${endpoint.used ? '✅ Sí' : '❌ No'}`);
        console.log(`   Auth: ${endpoint.requiresAuth ? '🔒 Requerida' : '🔓 No'}`);
        
        if (endpoint.params && endpoint.params.length > 0) {
          console.log(`   Params: ${endpoint.params.join(', ')}`);
        }
        
        console.log('');
      });
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async showDesignSystemComponents() {
    console.clear();
    this.showBanner();
    console.log(chalk.bold('🧩 COMPONENTES DESIGN SYSTEM:\\n'));
    
    if (!this.report.projects.designSystem || !this.report.projects.designSystem.components) {
      console.log('❌ No se encontraron componentes del design system\\n');
      await this.waitForEnter();
      await this.showMainMenu();
      return;
    }
    
    const components = this.report.projects.designSystem.components;
    const used = components.filter(c => c.used);
    const unused = components.filter(c => !c.used);
    
    console.log(`Total: ${components.length} | Usados: ${chalk.green(used.length)} | Sin uso: ${chalk.red(unused.length)}\\n`);
    
    // Agrupar por categoría
    const byCategory = {};
    components.forEach(comp => {
      const category = comp.category || 'misc';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(comp);
    });
    
    Object.entries(byCategory).forEach(([category, comps]) => {
      const usedInCategory = comps.filter(c => c.used).length;
      console.log(chalk.bold(`📦 ${category.toUpperCase()} (${usedInCategory}/${comps.length})`));
      
      comps.slice(0, 10).forEach(comp => {
        const usedIcon = comp.used ? '✅' : '❌';
        const testIcon = comp.hasTests ? '🧪' : '';
        const storyIcon = comp.hasStories ? '📚' : '';
        
        console.log(`   ${usedIcon} ${comp.name} ${testIcon}${storyIcon}`);
        if (comp.used && comp.usedIn && comp.usedIn.length > 0) {
          console.log(chalk.gray(`     Usado en ${comp.usedIn.length} archivo(s)`));
        }
      });
      
      if (comps.length > 10) {
        console.log(chalk.gray(`     ... y ${comps.length - 10} componentes más`));
      }
      
      console.log('');
    });
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async showDetailedStats() {
    console.clear();
    this.showBanner();
    console.log(chalk.bold('📊 ESTADÍSTICAS DETALLADAS:\\n'));
    
    const s = this.report.summary;
    
    // Issues por tipo
    const byType = {};
    this.report.issues.forEach(issue => {
      byType[issue.type] = (byType[issue.type] || 0) + 1;
    });
    
    console.log(chalk.bold('🚨 Issues por tipo:'));
    Object.entries(byType)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([type, count]) => {
        console.log(`  ${type.padEnd(30)} : ${count}`);
      });
    
    console.log('');
    
    // Estadísticas de endpoints
    if (this.report.projects.backend?.endpoints) {
      const endpoints = this.report.projects.backend.endpoints;
      
      console.log(chalk.bold('📋 Estadísticas de endpoints:'));
      
      const byMethod = {};
      endpoints.forEach(e => {
        byMethod[e.method] = (byMethod[e.method] || 0) + 1;
      });
      
      Object.entries(byMethod).forEach(([method, count]) => {
        console.log(`  ${method.padEnd(8)} : ${count}`);
      });
      
      const withAuth = endpoints.filter(e => e.requiresAuth).length;
      const used = endpoints.filter(e => e.used).length;
      
      console.log('');
      console.log(`  Con auth    : ${withAuth} (${((withAuth/endpoints.length)*100).toFixed(1)}%)`);
      console.log(`  Usados      : ${used} (${((used/endpoints.length)*100).toFixed(1)}%)`);
      console.log('');
    }
    
    // Estadísticas de archivos
    console.log(chalk.bold('📁 Archivos procesados:'));
    console.log(`  Backend     : ${s.backend.files}`);
    console.log(`  Frontend    : ${s.frontend.files}`);
    console.log(`  Total       : ${s.backend.files + s.frontend.files}`);
    
    console.log('');
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async showPerformanceMetrics() {
    console.clear();
    this.showBanner();
    console.log(chalk.bold('📈 MÉTRICAS DE RENDIMIENTO:\\n'));
    
    const perf = this.report.performance;
    
    if (!perf) {
      console.log('❌ No hay datos de rendimiento disponibles\\n');
      await this.waitForEnter();
      await this.showMainMenu();
      return;
    }
    
    console.log(chalk.bold('⏱️  Tiempo de ejecución:'));
    if (perf.backendAnalysis) {
      console.log(`  Backend        : ${perf.backendAnalysis}s`);
    }
    if (perf.frontendAnalysis) {
      console.log(`  Frontend       : ${perf.frontendAnalysis}s`);
    }
    if (perf.designSystemAnalysis) {
      console.log(`  Design System  : ${perf.designSystemAnalysis}s`);
    }
    if (perf.totalValidation) {
      console.log(`  Validaciones   : ${perf.totalValidation}s`);
    }
    if (perf.totalDuration) {
      console.log(chalk.bold(`  TOTAL          : ${perf.totalDuration}s`));
    }
    
    console.log('');
    
    // Calcular velocidad de procesamiento
    const totalFiles = this.report.summary.backend.files + this.report.summary.frontend.files;
    if (totalFiles > 0 && perf.totalDuration) {
      const filesPerSecond = (totalFiles / parseFloat(perf.totalDuration)).toFixed(1);
      console.log(chalk.bold('🚀 Velocidad de procesamiento:'));
      console.log(`  Archivos/segundo : ${filesPerSecond}`);
      console.log('');
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async openHTMLReport() {
    console.log('\\n📄 Abriendo reporte HTML...\\n');
    
    const { exec } = await import('child_process');
    const open = process.platform === 'darwin' ? 'open' : 
                 process.platform === 'win32' ? 'start' : 'xdg-open';
    
    exec(`${open} reports/audit-report.html`, (error) => {
      if (error) {
        console.log('❌ No se pudo abrir el reporte');
      } else {
        console.log('✅ Reporte abierto en el navegador');
      }
      
      setTimeout(async () => await this.showMainMenu(), 2000);
    });
  }

  async openReportsFolder() {
    console.log('\\n📁 Abriendo carpeta de reportes...\\n');
    
    const { exec } = await import('child_process');
    const open = process.platform === 'darwin' ? 'open' : 
                 process.platform === 'win32' ? 'explorer' : 'xdg-open';
    
    exec(`${open} reports`, (error) => {
      if (error) {
        console.log('❌ No se pudo abrir la carpeta');
      } else {
        console.log('✅ Carpeta abierta');
      }
      
      setTimeout(async () => await this.showMainMenu(), 2000);
    });
  }

  async runNewAudit() {
    console.log('\\n🔄 Ejecutando nueva auditoría...\\n');
    
    const { spawn } = await import('child_process');
    const audit = spawn('npm', ['run', 'audit'], { stdio: 'inherit' });
    
    audit.on('close', (code) => {
      if (code === 0) {
        console.log('\\n✅ Auditoría completada. Recargando dashboard...');
        
        // Recargar reporte
        try {
          this.report = JSON.parse(fs.readFileSync(this.reportPath, 'utf8'));
          setTimeout(async () => await this.showMainMenu(), 2000);
        } catch (e) {
          console.log('❌ Error recargando reporte');
          process.exit(1);
        }
      } else {
        console.log('\\n❌ Error en la auditoría');
        setTimeout(async () => await this.showMainMenu(), 2000);
      }
    });
  }

  getMethodColor(method) {
    const colors = {
      'GET': chalk.green,
      'POST': chalk.blue,
      'PUT': chalk.yellow,
      'PATCH': chalk.magenta,
      'DELETE': chalk.red
    };
    
    return colors[method] || chalk.gray;
  }

  async ask(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  async waitForEnter() {
    console.log('━'.repeat(64));
    await this.ask('\\nPresiona Enter para continuar...');
  }
}

// Manejo de señales
process.on('SIGINT', () => {
  console.log('\\n\\n👋 ¡Hasta luego!');
  process.exit(0);
});

// Iniciar dashboard
const dashboard = new AuditDashboard();
dashboard.start().catch(error => {
  console.error('❌ Error en dashboard:', error);
  process.exit(1);
});