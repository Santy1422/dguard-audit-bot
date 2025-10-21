#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import AuditBot from './AuditBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Intentar cargar configuración
let config;
try {
  const configPath = join(__dirname, '../config/projects.config.js');
  if (existsSync(configPath)) {
    config = (await import(configPath)).default;
  } else {
    console.log(chalk.yellow('⚠️  Usando configuración por defecto. Crea config/projects.config.js para personalizar.'));
    config = (await import('../config/default.config.js')).default;
  }
} catch (error) {
  console.error(chalk.red('❌ Error cargando configuración:'), error.message);
  process.exit(1);
}

const program = new Command();

program
  .name('dguard-audit')
  .description('Sistema de auditoría completo para DGuard - Backend, Frontend y Design System')
  .version('1.0.0')
  .option('-c, --ci', 'Modo CI (falla si hay issues críticos)')
  .option('-q, --quiet', 'Modo silencioso (solo errores críticos)')
  .option('-v, --verbose', 'Modo verboso (información detallada)')
  .option('-w, --watch', 'Modo watch (re-ejecuta al detectar cambios)')
  .option('-f, --format <type>', 'Formato de salida (json|html|markdown|console|all)', 'all')
  .option('--backend <path>', 'Ruta personalizada del backend')
  .option('--frontend <path>', 'Ruta personalizada del frontend')
  .option('--design-system <path>', 'Ruta personalizada del design system')
  .option('--no-backend', 'Omitir análisis del backend')
  .option('--no-frontend', 'Omitir análisis del frontend')
  .option('--no-design-system', 'Omitir análisis del design system')
  .option('--only-critical', 'Solo mostrar issues críticos')
  .option('--max-issues <number>', 'Máximo número de issues a mostrar', '100')
  .parse(process.argv);

const options = program.opts();

// Sobrescribir rutas si se proporcionan
if (options.backend) {
  config.projects.backend.path = options.backend;
}
if (options.frontend) {
  config.projects.frontend.path = options.frontend;
}
if (options.designSystem) {
  config.projects.designSystem.path = options.designSystem;
}

// Configurar niveles de logging
if (options.quiet) {
  config.logging = { level: 'error' };
} else if (options.verbose) {
  config.logging = { level: 'debug' };
} else {
  config.logging = { level: 'info' };
}

async function main() {
  // Banner
  if (!options.quiet) {
    console.log(chalk.cyan.bold('\\n╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║                   🔍 DGuard Ultra Audit Bot                    ║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════════╝\\n'));
  }
  
  const spinner = ora({
    text: 'Inicializando auditoría...',
    spinner: 'dots'
  });
  
  if (!options.quiet) spinner.start();
  
  try {
    // Verificar rutas de proyectos
    await verifyProjectPaths(config, options);
    
    // Crear instancia del bot
    const bot = new AuditBot(config, options);
    
    // Ejecutar auditoría
    if (!options.quiet) spinner.text = 'Ejecutando auditoría...';
    const result = await bot.run();
    
    if (!options.quiet) spinner.succeed('Auditoría completada');
    
    // Mostrar resumen si no está en modo silencioso
    if (!options.quiet) {
      await bot.reporters.console.printSummary(result);
    }
    
    // Generar reportes según formato solicitado
    await generateReports(bot, result, options);
    
    // Mostrar ubicación de reportes
    if (!options.quiet && options.format !== 'console') {
      console.log(chalk.green('\\n📄 Reportes generados en: ./reports/'));
    }
    
    // Modo CI: evaluar si debe fallar
    if (options.ci) {
      await handleCIMode(result, config);
    }
    
    // Mostrar issues críticos incluso en modo silencioso
    if (options.quiet) {
      const critical = result.issues.filter(i => i.severity === 'CRITICAL');
      if (critical.length > 0) {
        console.log(chalk.red.bold(`\\n❌ ${critical.length} issues críticos detectados:`));
        critical.slice(0, 5).forEach((issue, idx) => {
          console.log(chalk.red(`  ${idx + 1}. ${issue.message}`));
        });
        if (critical.length > 5) {
          console.log(chalk.red(`  ... y ${critical.length - 5} más`));
        }
      }
    }
    
    if (!options.quiet) {
      console.log(chalk.green.bold('\\n✅ Auditoría completada exitosamente\\n'));
    }
    
    process.exit(0);
    
  } catch (error) {
    if (!options.quiet) {
      spinner.fail('Error durante la auditoría');
    }
    
    console.error(chalk.red('\\n❌ Error:'), error.message);
    
    if (options.verbose || !options.quiet) {
      console.error(chalk.gray('\\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }
    
    // En modo CI, cualquier error es crítico
    if (options.ci) {
      console.error(chalk.red('\\n🚨 Auditoría falló en modo CI'));
    }
    
    process.exit(1);
  }
}

async function verifyProjectPaths(config, options) {
  const projects = [];
  
  if (!options.noBackend && config.projects.backend?.path) {
    projects.push({ name: 'Backend', path: config.projects.backend.path });
  }
  
  if (!options.noFrontend && config.projects.frontend?.path) {
    projects.push({ name: 'Frontend', path: config.projects.frontend.path });
  }
  
  if (!options.noDesignSystem && config.projects.designSystem?.path) {
    projects.push({ name: 'Design System', path: config.projects.designSystem.path });
  }
  
  const missingPaths = projects.filter(p => !existsSync(p.path));
  
  if (missingPaths.length > 0) {
    console.error(chalk.red('\\n❌ Rutas de proyecto no encontradas:'));
    missingPaths.forEach(p => {
      console.error(chalk.red(`  • ${p.name}: ${p.path}`));
    });
    console.error(chalk.yellow('\\n💡 Ajusta las rutas en config/projects.config.js o usa opciones --backend, --frontend, --design-system'));
    throw new Error('Rutas de proyecto inválidas');
  }
}

async function generateReports(bot, result, options) {
  const formats = options.format === 'all' 
    ? ['json', 'html', 'markdown'] 
    : [options.format];
  
  for (const format of formats) {
    if (format === 'console') continue; // Ya se mostró
    
    try {
      if (bot.reporters[format]) {
        await bot.reporters[format].generate(result);
        if (!options.quiet) {
          console.log(chalk.green(`  ✓ Reporte ${format.toUpperCase()} generado`));
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`  ⚠️  No se pudo generar reporte ${format}: ${error.message}`));
    }
  }
}

async function handleCIMode(result, config) {
  const critical = result.issues.filter(i => i.severity === 'CRITICAL').length;
  const high = result.issues.filter(i => i.severity === 'HIGH').length;
  const total = result.issues.length;
  
  console.log(chalk.blue('\\n🤖 Evaluando modo CI...'));
  console.log(chalk.gray(`  • Issues críticos: ${critical}`));
  console.log(chalk.gray(`  • Issues altos: ${high}`));
  console.log(chalk.gray(`  • Total issues: ${total}`));
  
  // Fallar si hay críticos
  if (critical > 0 && config.rules.failOnCritical) {
    console.log(chalk.red.bold(`\\n❌ CI FALLIDO: ${critical} issues críticos detectados`));
    
    // Mostrar los issues críticos
    const criticalIssues = result.issues.filter(i => i.severity === 'CRITICAL');
    console.log(chalk.red('\\nIssues críticos:'));
    criticalIssues.slice(0, 10).forEach((issue, idx) => {
      console.log(chalk.red(`  ${idx + 1}. ${issue.message}`));
      if (issue.endpoint) console.log(chalk.gray(`     Endpoint: ${issue.endpoint}`));
      if (issue.file) console.log(chalk.gray(`     Archivo: ${issue.file}`));
    });
    
    if (criticalIssues.length > 10) {
      console.log(chalk.red(`  ... y ${criticalIssues.length - 10} más`));
    }
    
    process.exit(1);
  }
  
  // Fallar si hay demasiados issues altos
  if (high > config.rules.failOnHighCount) {
    console.log(chalk.yellow.bold(`\\n⚠️  CI FALLIDO: ${high} issues altos (límite: ${config.rules.failOnHighCount})`));
    process.exit(1);
  }
  
  console.log(chalk.green('\\n✅ CI evaluación exitosa'));
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('\\n❌ Error no manejado en:', promise, 'razón:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('\\n❌ Excepción no capturada:', error);
  process.exit(1);
});

// Manejo de SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log(chalk.yellow('\\n\\n👋 Auditoría interrumpida por el usuario'));
  process.exit(0);
});

// Ejecutar programa principal
main();