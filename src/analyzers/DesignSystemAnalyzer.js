import fs from 'fs';
import path from 'path';
import traverse from '@babel/traverse';
import { findFiles, readFileSafe } from '../utils/fileUtils.js';
import { parseCodeSafe, findExports, isReactComponent, extractReactProps } from '../utils/astUtils.js';

export default class DesignSystemAnalyzer {
  constructor(projectConfig, auditConfig) {
    this.projectConfig = projectConfig;
    this.auditConfig = auditConfig;
    
    // Resultados del análisis
    this.components = new Map();
    this.files = [];
    this.exports = new Map();
    this.themes = [];
    this.utilities = [];
  }

  async analyze() {
    console.log(`   → Escaneando: ${this.projectConfig.path}`);
    
    if (!fs.existsSync(this.projectConfig.path)) {
      throw new Error(`Ruta del design system no existe: ${this.projectConfig.path}`);
    }

    // Analizar estructura del design system
    await this.analyzeProjectStructure();
    
    // Buscar y analizar componentes
    await this.analyzeComponents();
    
    // Analizar exports principales
    await this.analyzeMainExports();
    
    // Analizar temas y estilos
    await this.analyzeThemes();
    
    // Analizar utilidades
    await this.analyzeUtilities();
    
    console.log(`   ✓ ${this.components.size} componentes del design system encontrados`);
    
    return {
      components: this.components,
      files: this.files,
      exports: this.exports,
      themes: this.themes,
      utilities: this.utilities
    };
  }

  async analyzeProjectStructure() {
    // Verificar estructura típica de design system
    const expectedFolders = [
      'components',
      'src/components',
      'lib',
      'src',
      'dist',
      'build'
    ];
    
    const foundFolders = expectedFolders.filter(folder => 
      fs.existsSync(path.join(this.projectConfig.path, folder))
    );
    
    if (foundFolders.length === 0) {
      console.warn('   ⚠️  No se reconoce la estructura del design system');
    } else {
      console.log(`   ✓ Estructura detectada: ${foundFolders.join(', ')}`);
    }
    
    // Verificar package.json para metadatos
    const packageJsonPath = path.join(this.projectConfig.path, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSafe(packageJsonPath) || '{}');
      
      if (packageJson.name) {
        console.log(`   ✓ Design System: ${packageJson.name} v${packageJson.version || 'unknown'}`);
      }
      
      // Verificar si tiene peer dependencies de React/Vue/etc
      const peerDeps = packageJson.peerDependencies || {};
      if (peerDeps.react) {
        console.log(`   ✓ Compatible con React ${peerDeps.react}`);
      }
    }
  }

  async analyzeComponents() {
    // Buscar componentes en las carpetas típicas
    const componentPaths = [
      this.projectConfig.folders?.components || 'components',
      'src/components',
      'lib/components',
      'src',
      'lib'
    ];
    
    for (const componentPath of componentPaths) {
      const fullPath = path.join(this.projectConfig.path, componentPath);
      
      if (fs.existsSync(fullPath)) {
        const componentFiles = findFiles(
          fullPath,
          this.auditConfig.fileExtensions.designSystem,
          this.auditConfig.ignorePatterns
        );
        
        for (const file of componentFiles) {
          await this.analyzeComponentFile(file);
          this.files.push(file);
        }
      }
    }
  }

  async analyzeComponentFile(filePath) {
    const content = readFileSafe(filePath);
    if (!content) return;
    
    const relativePath = path.relative(this.projectConfig.path, filePath);
    
    // Excluir archivos que no son componentes
    if (this.shouldExcludeFile(relativePath, content)) {
      return;
    }
    
    const ast = parseCodeSafe(content);
    if (!ast) {
      console.warn(`   ⚠️  No se pudo parsear: ${relativePath}`);
      return;
    }
    
    // Buscar componentes exportados
    const components = this.extractComponentsFromFile(ast, relativePath, content);
    
    // Buscar exports
    const exports = findExports(ast);
    this.exports.set(relativePath, exports);
    
    // Agregar componentes encontrados
    components.forEach(component => {
      this.components.set(component.name, {
        ...component,
        used: false,
        usedIn: [],
        exportedAs: this.getExportInfo(component.name, exports)
      });
    });
  }

  shouldExcludeFile(relativePath, content) {
    const fileName = path.basename(relativePath).toLowerCase();
    
    // Excluir archivos que claramente no son componentes
    const excludePatterns = [
      /\.test\./,
      /\.spec\./,
      /\.stories\./,
      /\.config\./,
      /\.d\.ts$/,
      /\.types\./,
      /utils/,
      /helpers/,
      /constants/,
      /theme/,
      /styles/,
      /index\./
    ];
    
    if (excludePatterns.some(pattern => pattern.test(relativePath))) {
      return true;
    }
    
    // Excluir si no parece tener componentes React
    if (!content.includes('React') && !content.includes('jsx') && !content.includes('tsx')) {
      return true;
    }
    
    return false;
  }

  extractComponentsFromFile(ast, file, content) {
    const components = [];
    
    traverse.default(ast, {
      // Function components
      FunctionDeclaration: (path) => {
        if (isReactComponent(path.node)) {
          const component = this.createComponentInfo(path.node, file, content, 'function');
          if (component) components.push(component);
        }
      },
      
      // Arrow function components
      VariableDeclarator: (path) => {
        if (isReactComponent(path.node)) {
          const component = this.createComponentInfo(path.node, file, content, 'arrow');
          if (component) components.push(component);
        }
      },
      
      // Class components
      ClassDeclaration: (path) => {
        const node = path.node;
        if (node.id?.name && /^[A-Z]/.test(node.id.name)) {
          const isReact = node.superClass && (
            (node.superClass.type === 'MemberExpression' && 
             node.superClass.object.name === 'React' && 
             node.superClass.property.name === 'Component') ||
            (node.superClass.type === 'Identifier' && 
             node.superClass.name === 'Component')
          );
          
          if (isReact) {
            const component = this.createComponentInfo(node, file, content, 'class');
            if (component) components.push(component);
          }
        }
      }
    });
    
    return components;
  }

  createComponentInfo(node, file, content, type) {
    const name = node.id?.name || (node.type === 'VariableDeclarator' ? node.id?.name : null);
    
    if (!name) return null;
    
    return {
      name,
      type,
      file,
      line: node.loc?.start?.line || 0,
      props: extractReactProps(node),
      description: this.extractComponentDescription(content, node.loc?.start?.line),
      category: this.inferComponentCategory(name, file),
      complexity: this.calculateComplexity(content),
      hasStyles: this.hasStyles(content),
      hasTests: this.hasTests(file),
      hasStories: this.hasStories(file),
      dependencies: this.extractDependencies(content)
    };
  }

  extractComponentDescription(content, lineNumber) {
    if (!lineNumber) return '';
    
    const lines = content.split('\\n');
    let description = '';
    
    // Buscar JSDoc o comentarios arriba del componente
    for (let i = lineNumber - 2; i >= 0 && i >= lineNumber - 10; i--) {
      const line = lines[i]?.trim();
      if (line?.startsWith('/**') || line?.startsWith('/*') || line?.startsWith('*')) {
        description = line.replace(/^\/\*+|\*+\/$/g, '').replace(/^\*/g, '').trim() + ' ' + description;
      } else if (line?.startsWith('//')) {
        description = line.replace(/^\/\//, '').trim() + ' ' + description;
      } else if (line && description) {
        break;
      }
    }
    
    return description.trim();
  }

  inferComponentCategory(name, file) {
    const nameLC = name.toLowerCase();
    const fileLC = file.toLowerCase();
    
    // Categorías basadas en nombre
    if (nameLC.includes('button')) return 'buttons';
    if (nameLC.includes('input') || nameLC.includes('field')) return 'forms';
    if (nameLC.includes('modal') || nameLC.includes('dialog')) return 'overlays';
    if (nameLC.includes('card')) return 'cards';
    if (nameLC.includes('nav') || nameLC.includes('menu')) return 'navigation';
    if (nameLC.includes('icon')) return 'icons';
    if (nameLC.includes('layout') || nameLC.includes('container')) return 'layout';
    if (nameLC.includes('text') || nameLC.includes('heading') || nameLC.includes('title')) return 'typography';
    if (nameLC.includes('table') || nameLC.includes('list')) return 'data-display';
    if (nameLC.includes('badge') || nameLC.includes('tag') || nameLC.includes('chip')) return 'data-display';
    if (nameLC.includes('spinner') || nameLC.includes('loader')) return 'feedback';
    if (nameLC.includes('toast') || nameLC.includes('alert') || nameLC.includes('notification')) return 'feedback';
    
    // Categorías basadas en carpeta
    if (fileLC.includes('forms/')) return 'forms';
    if (fileLC.includes('buttons/')) return 'buttons';
    if (fileLC.includes('navigation/')) return 'navigation';
    if (fileLC.includes('layout/')) return 'layout';
    if (fileLC.includes('icons/')) return 'icons';
    
    return 'misc';
  }

  calculateComplexity(content) {
    // Calcular complejidad básica basada en contenido
    let complexity = 0;
    
    // Props complejas
    complexity += (content.match(/props\./g) || []).length * 0.5;
    
    // Hooks
    complexity += (content.match(/use[A-Z][a-zA-Z]*\(/g) || []).length * 2;
    
    // Conditional rendering
    complexity += (content.match(/\?\s*[^:]+\s*:/g) || []).length * 1;
    complexity += (content.match(/&&\s*</g) || []).length * 1;
    
    // Event handlers
    complexity += (content.match(/on[A-Z][a-zA-Z]*=/g) || []).length * 1;
    
    // JSX elements
    complexity += (content.match(/<[A-Z][a-zA-Z]*[^>]*>/g) || []).length * 0.5;
    
    return Math.min(Math.round(complexity), 10); // Cap at 10
  }

  hasStyles(content) {
    return content.includes('styled-components') ||
           content.includes('emotion') ||
           content.includes('className') ||
           content.includes('style=') ||
           content.includes('css`') ||
           content.includes('makeStyles') ||
           content.includes('useStyles') ||
           content.includes('sx=');
  }

  hasTests(file) {
    const testFile = file.replace(/\.(jsx?|tsx?)$/, '.test.$1');
    const specFile = file.replace(/\.(jsx?|tsx?)$/, '.spec.$1');
    const testDir = path.join(path.dirname(file), '__tests__', path.basename(file));
    
    return fs.existsSync(testFile) || 
           fs.existsSync(specFile) || 
           fs.existsSync(testDir);
  }

  hasStories(file) {
    const storiesFile = file.replace(/\.(jsx?|tsx?)$/, '.stories.$1');
    return fs.existsSync(storiesFile);
  }

  extractDependencies(content) {
    const dependencies = [];
    
    // React hooks
    const hookMatches = content.match(/use[A-Z][a-zA-Z]*\(/g) || [];
    hookMatches.forEach(hook => {
      const hookName = hook.replace('(', '');
      if (!dependencies.includes(hookName)) {
        dependencies.push(hookName);
      }
    });
    
    // Imported components (uppercase)
    const componentMatches = content.match(/import\s+[^{]*\{[^}]*\}/g) || [];
    componentMatches.forEach(importLine => {
      const components = importLine.match(/[A-Z][a-zA-Z]*/g) || [];
      components.forEach(comp => {
        if (!dependencies.includes(comp)) {
          dependencies.push(comp);
        }
      });
    });
    
    return dependencies;
  }

  getExportInfo(componentName, exports) {
    const exportInfo = exports.find(exp => 
      exp.name === componentName || 
      exp.local === componentName
    );
    
    return {
      isDefault: exports.some(exp => exp.type === 'default' && 
        (exp.name === componentName || exp.declaration === componentName)),
      isNamed: exports.some(exp => exp.type === 'named' && 
        (exp.name === componentName || exp.local === componentName)),
      exportName: exportInfo?.name || componentName
    };
  }

  async analyzeMainExports() {
    // Analizar archivo principal de exports (index.js, index.ts, etc)
    const mainFiles = ['index.js', 'index.ts', 'index.jsx', 'index.tsx', 'main.js', 'main.ts'];
    
    for (const mainFile of mainFiles) {
      const mainPath = path.join(this.projectConfig.path, mainFile);
      if (fs.existsSync(mainPath)) {
        await this.analyzeMainExportFile(mainPath);
        break;
      }
    }
    
    // También buscar en src/
    for (const mainFile of mainFiles) {
      const mainPath = path.join(this.projectConfig.path, 'src', mainFile);
      if (fs.existsSync(mainPath)) {
        await this.analyzeMainExportFile(mainPath);
        break;
      }
    }
  }

  async analyzeMainExportFile(filePath) {
    const content = readFileSafe(filePath);
    if (!content) return;
    
    const ast = parseCodeSafe(content);
    if (!ast) return;
    
    const exports = findExports(ast);
    const relativePath = path.relative(this.projectConfig.path, filePath);
    
    console.log(`   ✓ Archivo principal de exports: ${relativePath} (${exports.length} exports)`);
    
    // Marcar componentes que están en el archivo principal
    exports.forEach(exp => {
      if (exp.name && this.components.has(exp.name)) {
        const component = this.components.get(exp.name);
        component.inMainExports = true;
      }
    });
  }

  async analyzeThemes() {
    // Buscar archivos de tema
    const themePaths = [
      'theme',
      'themes',
      'styles/theme',
      'src/theme',
      'src/themes',
      'src/styles/theme'
    ];
    
    for (const themePath of themePaths) {
      const fullPath = path.join(this.projectConfig.path, themePath);
      
      if (fs.existsSync(fullPath)) {
        const themeFiles = findFiles(
          fullPath,
          ['.js', '.ts', '.json'],
          this.auditConfig.ignorePatterns
        );
        
        themeFiles.forEach(file => {
          const relativePath = path.relative(this.projectConfig.path, file);
          this.themes.push({
            file: relativePath,
            name: path.basename(file, path.extname(file)),
            type: this.inferThemeType(file)
          });
        });
        
        break;
      }
    }
  }

  inferThemeType(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    
    if (fileName.includes('colors') || fileName.includes('palette')) return 'colors';
    if (fileName.includes('typography') || fileName.includes('fonts')) return 'typography';
    if (fileName.includes('spacing') || fileName.includes('space')) return 'spacing';
    if (fileName.includes('breakpoints') || fileName.includes('media')) return 'breakpoints';
    if (fileName.includes('shadows') || fileName.includes('elevation')) return 'shadows';
    if (fileName.includes('tokens')) return 'tokens';
    
    return 'theme';
  }

  async analyzeUtilities() {
    // Buscar archivos de utilidades
    const utilityPaths = [
      'utils',
      'utilities',
      'helpers',
      'src/utils',
      'src/utilities',
      'src/helpers',
      'lib/utils'
    ];
    
    for (const utilityPath of utilityPaths) {
      const fullPath = path.join(this.projectConfig.path, utilityPath);
      
      if (fs.existsSync(fullPath)) {
        const utilityFiles = findFiles(
          fullPath,
          ['.js', '.ts'],
          this.auditConfig.ignorePatterns
        );
        
        utilityFiles.forEach(file => {
          const relativePath = path.relative(this.projectConfig.path, file);
          this.utilities.push({
            file: relativePath,
            name: path.basename(file, path.extname(file)),
            type: 'utility'
          });
        });
        
        break;
      }
    }
  }
}