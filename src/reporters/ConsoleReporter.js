import chalk from 'chalk';
import { table } from 'table';

export default class ConsoleReporter {
  constructor(config = {}, options = {}) {
    this.config = config;
    this.options = options;
  }

  async printSummary(results) {
    if (this.options.quiet) return;
    
    console.log('\\n' + '═'.repeat(70));
    console.log(chalk.cyan.bold('                📊 RESUMEN DE AUDITORÍA'));
    console.log('═'.repeat(70));
    
    this.printProjectStats(results);
    this.printIssuesStats(results);
    this.printPerformanceStats(results);
    
    if (results.issues.length > 0) {
      this.printTopIssues(results);
    }
    
    this.printRecommendations(results);
    
    console.log('═'.repeat(70) + '\\n');
  }

  printProjectStats(results) {
    const data = [
      ['📦 BACKEND', ''],
      ['  Endpoints', results.summary.backend.endpoints.toString()],
      ['  Archivos', results.summary.backend.files.toString()],
      ['  Modelos', results.summary.backend.models.toString()],
      ['', ''],
      ['🎨 FRONTEND', ''],
      ['  Archivos', results.summary.frontend.files.toString()],
      ['  Componentes', results.summary.frontend.components.toString()],
      ['  Páginas', results.summary.frontend.pages.toString()],
      ['  Llamadas API', results.summary.frontend.apiCalls.toString()],
      ['', ''],
      ['🧩 DESIGN SYSTEM', ''],
      ['  Componentes', results.summary.designSystem.components.toString()],
      ['  Usados', results.summary.designSystem.used.toString()],
      ['  Sin uso', results.summary.designSystem.unused.toString()]
    ];

    const config = {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│'
      },
      columnDefault: {
        paddingLeft: 1,
        paddingRight: 1
      },
      columns: {
        0: { width: 20 },
        1: { width: 10, alignment: 'right' }
      }
    };

    console.log('\\n' + table(data, config));
  }

  printIssuesStats(results) {
    const { critical, high, medium, low, total } = results.summary.issues;
    
    console.log(chalk.bold('🚨 ISSUES DETECTADOS:\\n'));
    
    if (critical > 0) {
      console.log(chalk.red.bold(`  🔴 Críticos:     ${critical.toString().padStart(3)}`));
    }
    if (high > 0) {
      console.log(chalk.yellow.bold(`  🟠 Altos:        ${high.toString().padStart(3)}`));
    }
    if (medium > 0) {
      console.log(chalk.blue(`  🟡 Medios:       ${medium.toString().padStart(3)}`));
    }
    if (low > 0) {
      console.log(chalk.gray(`  ⚪ Bajos:        ${low.toString().padStart(3)}`));
    }
    
    console.log(chalk.bold(`  ─────────────────────`));
    console.log(chalk.bold(`  📊 Total:        ${total.toString().padStart(3)}`));
    
    if (total === 0) {
      console.log(chalk.green.bold('\\n  ✅ ¡Excelente! No se encontraron issues.'));
    }
  }

  printPerformanceStats(results) {
    if (results.performance) {
      console.log(chalk.bold('\\n⚡ RENDIMIENTO:\\n'));
      
      if (results.performance.backendAnalysis) {
        console.log(`  Backend:         ${results.performance.backendAnalysis}s`);
      }
      if (results.performance.frontendAnalysis) {
        console.log(`  Frontend:        ${results.performance.frontendAnalysis}s`);
      }
      if (results.performance.designSystemAnalysis) {
        console.log(`  Design System:   ${results.performance.designSystemAnalysis}s`);
      }
      if (results.performance.totalValidation) {
        console.log(`  Validaciones:    ${results.performance.totalValidation}s`);
      }
      if (results.performance.totalDuration) {
        console.log(chalk.bold(`  Total:           ${results.performance.totalDuration}s`));
      }
    }
  }

  printTopIssues(results) {
    console.log(chalk.bold('\\n🔍 ISSUES PRINCIPALES:\\n'));
    
    // Mostrar issues críticos
    const critical = results.issues.filter(i => i.severity === 'CRITICAL');
    if (critical.length > 0) {
      console.log(chalk.red.bold('🔴 CRÍTICOS:'));
      critical.slice(0, 5).forEach((issue, idx) => {
        console.log(chalk.red(`  ${idx + 1}. ${issue.message}`));
        if (issue.endpoint) {
          console.log(chalk.gray(`     Endpoint: ${issue.endpoint}`));
        }
        if (issue.file || issue.frontend || issue.backend) {
          const file = issue.file || issue.frontend || issue.backend;
          console.log(chalk.gray(`     Archivo: ${file}`));
        }
      });
      
      if (critical.length > 5) {
        console.log(chalk.red(`     ... y ${critical.length - 5} más`));
      }
      console.log('');
    }
    
    // Mostrar algunos issues altos
    const high = results.issues.filter(i => i.severity === 'HIGH');
    if (high.length > 0) {
      console.log(chalk.yellow.bold('🟠 ALTOS:'));
      high.slice(0, 3).forEach((issue, idx) => {
        console.log(chalk.yellow(`  ${idx + 1}. ${issue.message}`));
      });
      
      if (high.length > 3) {
        console.log(chalk.yellow(`     ... y ${high.length - 3} más`));
      }
      console.log('');
    }
    
    // Resumen de tipos de issues
    this.printIssuesByType(results);
  }

  printIssuesByType(results) {
    const byType = {};
    results.issues.forEach(issue => {
      byType[issue.type] = (byType[issue.type] || 0) + 1;
    });
    
    if (Object.keys(byType).length > 0) {
      console.log(chalk.bold('📈 POR TIPO:'));
      
      Object.entries(byType)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8)
        .forEach(([type, count]) => {
          const displayType = this.formatIssueType(type);
          console.log(`  ${displayType.padEnd(25)} ${count.toString().padStart(3)}`);
        });
      
      console.log('');
    }
  }

  formatIssueType(type) {
    const typeNames = {
      'MISSING_BACKEND_ENDPOINT': 'Endpoints faltantes',
      'UNUSED_ENDPOINT': 'Endpoints sin uso',
      'MISSING_AUTH': 'Falta autenticación',
      'SENSITIVE_ENDPOINT_NO_AUTH': 'Endpoints sensibles sin auth',
      'MISSING_URL_PARAM': 'Parámetros faltantes',
      'MISSING_BODY_FIELD': 'Campos de body faltantes',
      'UNUSED_DS_COMPONENT': 'Componentes DS sin uso',
      'DUPLICATE_COMPONENT': 'Componentes duplicados'
    };
    
    return typeNames[type] || type.toLowerCase().replace(/_/g, ' ');
  }

  printRecommendations(results) {
    console.log(chalk.bold('💡 RECOMENDACIONES:\\n'));
    
    const { critical, high, total } = results.summary.issues;
    
    if (critical > 0) {
      console.log(chalk.red('  🚨 URGENTE: Resolver issues críticos inmediatamente'));
      console.log(chalk.red('     - Issues críticos pueden afectar funcionalidad'));
      console.log(chalk.red('     - Verificar endpoints faltantes y seguridad\\n'));
    }
    
    if (high > 0) {
      console.log(chalk.yellow('  ⚠️  IMPORTANTE: Atender issues altos pronto'));
      console.log(chalk.yellow('     - Implementar autenticación faltante'));
      console.log(chalk.yellow('     - Verificar parámetros y validaciones\\n'));
    }
    
    // Recomendaciones de cobertura
    if (results.summary.coverage) {
      if (results.summary.coverage.endpoints < 80) {
        console.log(chalk.blue('  📊 COBERTURA: Mejorar uso de endpoints'));
        console.log(chalk.blue(`     - Solo ${results.summary.coverage.endpoints}% de endpoints son usados`));
        console.log(chalk.blue('     - Revisar endpoints obsoletos\\n'));
      }
      
      if (results.summary.coverage.components < 70) {
        console.log(chalk.blue('  🧩 DESIGN SYSTEM: Promover uso de componentes'));
        console.log(chalk.blue(`     - Solo ${results.summary.coverage.components}% de componentes DS son usados`));
        console.log(chalk.blue('     - Documentar y capacitar al equipo\\n'));
      }
    }
    
    // Recomendaciones generales
    console.log(chalk.green('  ✅ BUENAS PRÁCTICAS:'));
    console.log(chalk.green('     - Ejecutar auditoría regularmente'));
    console.log(chalk.green('     - Integrar en CI/CD para prevención'));
    console.log(chalk.green('     - Mantener documentación actualizada'));
    
    if (total === 0) {
      console.log(chalk.green.bold('\\n  🎉 ¡PERFECTO! El proyecto está bien sincronizado.'));
    }
  }

  async generate(results) {
    // Para el reporter de consola, solo implementamos printSummary
    // que ya se llama desde el AuditBot
    return this.printSummary(results);
  }
}