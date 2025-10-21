#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { program } from 'commander';
import AuditBot from './AuditBot.js';

class AutoFixer {
  constructor() {
    this.fixes = [];
    this.dryRun = false;
    this.interactive = true;
  }

  async run(options = {}) {
    console.log(chalk.cyan.bold('🔧 DGuard Auto-Fix System\n'));
    
    this.dryRun = options.dryRun || false;
    this.interactive = options.interactive !== false;

    // Ejecutar auditoría primero
    console.log('📊 Ejecutando auditoría para detectar issues...\n');
    const auditBot = new AuditBot();
    const report = await auditBot.run();

    // Filtrar issues que pueden ser auto-corregidos
    const fixableIssues = this.identifyFixableIssues(report.issues);
    
    if (fixableIssues.length === 0) {
      console.log(chalk.green('✅ No se encontraron issues que puedan ser auto-corregidos.'));
      return;
    }

    console.log(`🔧 Encontrados ${fixableIssues.length} issues que pueden ser corregidos automáticamente:\n`);

    // Mostrar issues y generar fixes
    for (const issue of fixableIssues) {
      const fix = await this.generateFix(issue);
      if (fix) {
        this.fixes.push(fix);
      }
    }

    if (this.fixes.length === 0) {
      console.log(chalk.yellow('⚠️ No se pudieron generar fixes automáticos.'));
      return;
    }

    // Mostrar summary de fixes
    this.displayFixSummary();

    // Confirmar aplicación de fixes
    if (this.interactive) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `¿Aplicar ${this.fixes.length} fixes automáticos?`,
        default: false
      }]);

      if (!proceed) {
        console.log(chalk.yellow('❌ Fixes cancelados por el usuario.'));
        return;
      }
    }

    // Aplicar fixes
    await this.applyFixes();

    console.log(chalk.green.bold('\n✅ Auto-fix completado!'));
    console.log(chalk.gray('💡 Ejecuta "npm run audit" para verificar los cambios.'));
  }

  identifyFixableIssues(issues) {
    const fixableTypes = [
      'MISSING_BACKEND_ENDPOINT',
      'UNUSED_ENDPOINT',
      'MISSING_AUTH_HEADER',
      'DUPLICATE_COMPONENT',
      'UNUSED_DS_COMPONENT',
      'MISSING_IMPORT',
      'INCONSISTENT_NAMING',
      'MISSING_VALIDATION'
    ];

    return issues.filter(issue => fixableTypes.includes(issue.type));
  }

  async generateFix(issue) {
    switch (issue.type) {
      case 'MISSING_BACKEND_ENDPOINT':
        return this.generateMissingEndpointFix(issue);
      
      case 'UNUSED_ENDPOINT':
        return this.generateUnusedEndpointFix(issue);
      
      case 'MISSING_AUTH_HEADER':
        return this.generateMissingAuthFix(issue);
      
      case 'DUPLICATE_COMPONENT':
        return this.generateDuplicateComponentFix(issue);
      
      case 'UNUSED_DS_COMPONENT':
        return this.generateUnusedComponentFix(issue);
      
      case 'MISSING_IMPORT':
        return this.generateMissingImportFix(issue);
      
      case 'INCONSISTENT_NAMING':
        return this.generateNamingFix(issue);
      
      case 'MISSING_VALIDATION':
        return this.generateValidationFix(issue);
      
      default:
        return null;
    }
  }

  generateMissingEndpointFix(issue) {
    // Generar esqueleto de endpoint en el backend
    const { method, path } = issue.details;
    const controllerName = this.inferControllerName(path);
    const functionName = this.inferFunctionName(method, path);

    return {
      type: 'CREATE_ENDPOINT',
      issue,
      description: `Crear endpoint ${method} ${path}`,
      action: 'create',
      file: `src/controllers/${controllerName}.js`,
      content: this.generateEndpointCode(method, path, functionName),
      routeFile: 'src/routes/index.js',
      routeContent: this.generateRouteCode(path, controllerName, functionName)
    };
  }

  generateUnusedEndpointFix(issue) {
    return {
      type: 'COMMENT_ENDPOINT',
      issue,
      description: `Comentar endpoint no utilizado: ${issue.endpoint}`,
      action: 'comment',
      file: issue.backend,
      lineNumber: issue.line,
      content: '// TODO: Endpoint no utilizado - considerar eliminar'
    };
  }

  generateMissingAuthFix(issue) {
    return {
      type: 'ADD_AUTH_MIDDLEWARE',
      issue,
      description: `Agregar middleware de autenticación a ${issue.endpoint}`,
      action: 'modify',
      file: issue.backend,
      lineNumber: issue.line,
      modification: 'add_auth_middleware'
    };
  }

  generateDuplicateComponentFix(issue) {
    return {
      type: 'REMOVE_DUPLICATE',
      issue,
      description: `Eliminar componente duplicado: ${issue.component}`,
      action: 'delete',
      file: issue.duplicateFile,
      replacement: {
        from: issue.component,
        to: issue.originalComponent,
        importPath: issue.originalImport
      }
    };
  }

  generateUnusedComponentFix(issue) {
    return {
      type: 'REMOVE_UNUSED_COMPONENT',
      issue,
      description: `Eliminar componente no utilizado: ${issue.component}`,
      action: 'comment',
      file: issue.file,
      content: '// UNUSED: Considerar eliminar si no se utiliza'
    };
  }

  generateMissingImportFix(issue) {
    return {
      type: 'ADD_IMPORT',
      issue,
      description: `Agregar import faltante: ${issue.import}`,
      action: 'modify',
      file: issue.file,
      modification: 'add_import',
      importStatement: `import ${issue.import} from '${issue.from}';`
    };
  }

  generateNamingFix(issue) {
    return {
      type: 'FIX_NAMING',
      issue,
      description: `Corregir nomenclatura: ${issue.current} → ${issue.suggested}`,
      action: 'replace',
      file: issue.file,
      replacements: [{
        from: issue.current,
        to: issue.suggested
      }]
    };
  }

  generateValidationFix(issue) {
    return {
      type: 'ADD_VALIDATION',
      issue,
      description: `Agregar validación para: ${issue.field}`,
      action: 'modify',
      file: issue.file,
      modification: 'add_validation',
      validation: this.generateValidationCode(issue.field, issue.type)
    };
  }

  displayFixSummary() {
    console.log(chalk.bold('\n📋 RESUMEN DE FIXES:\n'));

    const fixTypes = {};
    this.fixes.forEach(fix => {
      fixTypes[fix.type] = (fixTypes[fix.type] || 0) + 1;
    });

    Object.entries(fixTypes).forEach(([type, count]) => {
      const icon = this.getFixIcon(type);
      console.log(`  ${icon} ${type}: ${count} fix(es)`);
    });

    console.log('');
    
    if (this.dryRun) {
      console.log(chalk.yellow('🔍 DRY RUN - No se aplicarán cambios reales'));
    }
  }

  getFixIcon(type) {
    const icons = {
      'CREATE_ENDPOINT': '🆕',
      'COMMENT_ENDPOINT': '💬',
      'ADD_AUTH_MIDDLEWARE': '🔒',
      'REMOVE_DUPLICATE': '🔄',
      'REMOVE_UNUSED_COMPONENT': '🗑️',
      'ADD_IMPORT': '📦',
      'FIX_NAMING': '📝',
      'ADD_VALIDATION': '✅'
    };
    return icons[type] || '🔧';
  }

  async applyFixes() {
    console.log(chalk.bold('\n🔧 Aplicando fixes...\n'));

    for (let i = 0; i < this.fixes.length; i++) {
      const fix = this.fixes[i];
      console.log(`${i + 1}/${this.fixes.length} ${fix.description}`);

      try {
        await this.applyFix(fix);
        console.log(chalk.green('  ✅ Aplicado'));
      } catch (error) {
        console.log(chalk.red(`  ❌ Error: ${error.message}`));
      }
    }
  }

  async applyFix(fix) {
    if (this.dryRun) {
      return; // No aplicar en dry run
    }

    switch (fix.action) {
      case 'create':
        await this.createFile(fix);
        break;
      
      case 'modify':
        await this.modifyFile(fix);
        break;
      
      case 'delete':
        await this.deleteContent(fix);
        break;
      
      case 'comment':
        await this.addComment(fix);
        break;
      
      case 'replace':
        await this.replaceContent(fix);
        break;
      
      default:
        throw new Error(`Acción no soportada: ${fix.action}`);
    }
  }

  async createFile(fix) {
    const dir = path.dirname(fix.file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(fix.file)) {
      fs.writeFileSync(fix.file, fix.content);
    }

    // Si hay archivo de rutas, modificarlo también
    if (fix.routeFile && fix.routeContent) {
      await this.addRoute(fix.routeFile, fix.routeContent);
    }
  }

  async modifyFile(fix) {
    if (!fs.existsSync(fix.file)) {
      throw new Error(`Archivo no encontrado: ${fix.file}`);
    }

    let content = fs.readFileSync(fix.file, 'utf8');

    switch (fix.modification) {
      case 'add_auth_middleware':
        content = this.addAuthMiddleware(content, fix.lineNumber);
        break;
      
      case 'add_import':
        content = this.addImport(content, fix.importStatement);
        break;
      
      case 'add_validation':
        content = this.addValidation(content, fix.validation);
        break;
    }

    fs.writeFileSync(fix.file, content);
  }

  async addComment(fix) {
    if (!fs.existsSync(fix.file)) {
      return;
    }

    const content = fs.readFileSync(fix.file, 'utf8');
    const lines = content.split('\n');
    
    if (fix.lineNumber && fix.lineNumber > 0 && fix.lineNumber <= lines.length) {
      lines.splice(fix.lineNumber - 1, 0, fix.content);
    } else {
      lines.unshift(fix.content);
    }

    fs.writeFileSync(fix.file, lines.join('\n'));
  }

  async replaceContent(fix) {
    if (!fs.existsSync(fix.file)) {
      throw new Error(`Archivo no encontrado: ${fix.file}`);
    }

    let content = fs.readFileSync(fix.file, 'utf8');

    fix.replacements.forEach(replacement => {
      content = content.replace(new RegExp(replacement.from, 'g'), replacement.to);
    });

    fs.writeFileSync(fix.file, content);
  }

  // Métodos helper para generar código

  inferControllerName(path) {
    const segments = path.split('/').filter(s => s && !s.startsWith(':'));
    const resource = segments[segments.length - 1] || segments[segments.length - 2] || 'misc';
    return resource.toLowerCase();
  }

  inferFunctionName(method, path) {
    const segments = path.split('/').filter(s => s && !s.startsWith(':'));
    const resource = segments[segments.length - 1] || 'item';
    
    const methodMap = {
      'GET': segments.includes(':id') ? `get${this.capitalize(resource)}` : `getAll${this.capitalize(resource)}s`,
      'POST': `create${this.capitalize(resource)}`,
      'PUT': `update${this.capitalize(resource)}`,
      'PATCH': `update${this.capitalize(resource)}`,
      'DELETE': `delete${this.capitalize(resource)}`
    };

    return methodMap[method] || `handle${this.capitalize(resource)}`;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  generateEndpointCode(method, path, functionName) {
    return `// Auto-generated endpoint
export const ${functionName} = async (req, res) => {
  try {
    // TODO: Implementar lógica para ${method} ${path}
    res.status(200).json({
      message: 'Endpoint ${method} ${path} - Implementación pendiente',
      method: '${method}',
      path: '${path}',
      params: req.params,
      query: req.query,
      body: req.body
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
};
`;
  }

  generateRouteCode(path, controllerName, functionName) {
    return `router.${this.getMethodName(path)}('${path}', ${controllerName}.${functionName});`;
  }

  getMethodName(path) {
    // Inferir método HTTP del path
    if (path.includes(':id')) {
      return 'get'; // Asumimos GET para rutas con parámetros
    }
    return 'get'; // Default a GET
  }

  generateValidationCode(field, type) {
    const validations = {
      'string': `req.checkBody('${field}', '${field} es requerido').notEmpty();`,
      'number': `req.checkBody('${field}', '${field} debe ser un número').isNumeric();`,
      'email': `req.checkBody('${field}', 'Email inválido').isEmail();`,
      'date': `req.checkBody('${field}', 'Fecha inválida').isISO8601();`
    };

    return validations[type] || `req.checkBody('${field}', '${field} es requerido').notEmpty();`;
  }

  addAuthMiddleware(content, lineNumber) {
    const lines = content.split('\n');
    const targetLine = lineNumber - 1;
    
    if (targetLine >= 0 && targetLine < lines.length) {
      const line = lines[targetLine];
      if (line.includes('router.') && line.includes('(')) {
        const methodMatch = line.match(/router\.(\w+)\s*\(\s*(['"][^'"]+['"])/);
        if (methodMatch) {
          const [, method, path] = methodMatch;
          lines[targetLine] = line.replace(
            `router.${method}(${path}`,
            `router.${method}(${path}, auth.requireAuth`
          );
        }
      }
    }

    return lines.join('\n');
  }

  addImport(content, importStatement) {
    const lines = content.split('\n');
    
    // Buscar la posición para insertar el import
    let insertPosition = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') || lines[i].startsWith('const ') && lines[i].includes('require(')) {
        insertPosition = i + 1;
      } else if (lines[i].trim() === '' && insertPosition > 0) {
        break;
      }
    }

    lines.splice(insertPosition, 0, importStatement);
    return lines.join('\n');
  }

  addValidation(content, validation) {
    // Buscar función y agregar validación
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('async ') && lines[i].includes('(req, res)')) {
        // Encontrar la línea después de la apertura de la función
        const openBrace = lines.findIndex((line, idx) => idx > i && line.includes('{'));
        if (openBrace !== -1) {
          lines.splice(openBrace + 1, 0, `  ${validation}`);
          break;
        }
      }
    }

    return lines.join('\n');
  }

  async addRoute(routeFile, routeContent) {
    if (!fs.existsSync(routeFile)) {
      return;
    }

    const content = fs.readFileSync(routeFile, 'utf8');
    const lines = content.split('\n');
    
    // Buscar donde insertar la nueva ruta
    const exportIndex = lines.findIndex(line => line.includes('module.exports') || line.includes('export default'));
    
    if (exportIndex !== -1) {
      lines.splice(exportIndex, 0, routeContent);
      fs.writeFileSync(routeFile, lines.join('\n'));
    }
  }
}

// CLI
program
  .name('dguard-autofix')
  .description('Sistema de auto-corrección para DGuard Audit Bot')
  .option('--dry-run', 'Mostrar fixes sin aplicar cambios')
  .option('--no-interactive', 'Aplicar fixes sin confirmación')
  .option('--type <type>', 'Tipo específico de fix a aplicar')
  .action(async (options) => {
    const autoFixer = new AutoFixer();
    await autoFixer.run(options);
  });

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export default AutoFixer;