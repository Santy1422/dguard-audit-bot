import fs from 'fs';
import path from 'path';
import traverse from '@babel/traverse';
import { findFiles, readFileSafe, getRelativePaths } from '../utils/fileUtils.js';
import { parseCodeSafe, extractStringValue, extractObjectStructure, findFunctionCalls } from '../utils/astUtils.js';

export default class BackendAnalyzer {
  constructor(projectConfig, auditConfig) {
    this.projectConfig = projectConfig;
    this.auditConfig = auditConfig;
    
    // Resultados del análisis
    this.endpoints = new Map();
    this.files = [];
    this.models = [];
    this.routes = [];
    this.controllers = new Map();
    this.middleware = [];
  }

  async analyze() {
    console.log(`   → Escaneando: ${this.projectConfig.path}`);
    
    if (!fs.existsSync(this.projectConfig.path)) {
      throw new Error(`Ruta del backend no existe: ${this.projectConfig.path}`);
    }

    // Analizar estructura del proyecto
    await this.analyzeProjectStructure();
    
    // Analizar rutas/endpoints
    await this.analyzeRoutes();
    
    // Analizar controladores
    await this.analyzeControllers();
    
    // Analizar modelos
    await this.analyzeModels();
    
    // Analizar middleware
    await this.analyzeMiddleware();
    
    // Post-procesamiento
    await this.linkControllersToEndpoints();
    
    console.log(`   ✓ ${this.endpoints.size} endpoints encontrados`);
    console.log(`   ✓ ${this.files.length} archivos procesados`);
    
    return {
      endpoints: this.endpoints,
      files: this.files,
      models: this.models,
      routes: this.routes,
      controllers: this.controllers,
      middleware: this.middleware
    };
  }

  async analyzeProjectStructure() {
    // Verificar estructura típica de proyecto Node.js/Express
    const requiredFolders = Object.values(this.projectConfig.folders || {});
    const missingFolders = [];
    
    requiredFolders.forEach(folder => {
      const folderPath = path.join(this.projectConfig.path, folder);
      if (!fs.existsSync(folderPath)) {
        missingFolders.push(folder);
      }
    });
    
    if (missingFolders.length > 0) {
      console.warn(`   ⚠️  Carpetas faltantes: ${missingFolders.join(', ')}`);
    }
    
    // Verificar archivos principales
    const mainFiles = ['app.js', 'server.js', 'index.js', 'main.js'];
    const foundMainFile = mainFiles.find(file => 
      fs.existsSync(path.join(this.projectConfig.path, file))
    );
    
    if (foundMainFile) {
      console.log(`   ✓ Archivo principal: ${foundMainFile}`);
    }
  }

  async analyzeRoutes() {
    const routePaths = [
      this.projectConfig.folders?.routes,
      '', // Archivos en raíz
    ].filter(Boolean);
    
    for (const routePath of routePaths) {
      const fullPath = path.join(this.projectConfig.path, routePath);
      
      if (fs.existsSync(fullPath)) {
        const routeFiles = findFiles(
          fullPath,
          this.auditConfig.fileExtensions.backend,
          this.auditConfig.ignorePatterns
        );
        
        for (const file of routeFiles) {
          await this.analyzeRouteFile(file);
          this.files.push(file);
        }
      }
    }
  }

  async analyzeRouteFile(filePath) {
    const content = readFileSafe(filePath);
    if (!content) return;
    
    const relativePath = path.relative(this.projectConfig.path, filePath);
    const ast = parseCodeSafe(content);
    
    if (!ast) {
      console.warn(`   ⚠️  No se pudo parsear: ${relativePath}`);
      return;
    }
    
    // Detectar base path del router
    let basePath = this.detectBasePath(content, relativePath);
    
    // Buscar definiciones de rutas
    traverse.default(ast, {
      CallExpression: (path) => {
        const endpoint = this.extractEndpointFromCall(path.node, basePath, relativePath, content);
        if (endpoint) {
          const key = `${endpoint.method} ${endpoint.path}`;
          this.endpoints.set(key, endpoint);
        }
      }
    });
  }

  detectBasePath(content, relativePath) {
    // Intentar detectar base path de varias formas
    
    // 1. Buscar app.use('/path', router) - Más patrones
    const usePatterns = [
      /app\.use\s*\(\s*['"]([^'"]+)['"]\s*,/,
      /router\.use\s*\(\s*['"]([^'"]+)['"]\s*,/,
      /express\(\)\.use\s*\(\s*['"]([^'"]+)['"]\s*,/
    ];
    
    for (const pattern of usePatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // 2. Buscar prefijos comunes en los endpoints dentro del archivo
    const endpointMatches = content.match(/router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g);
    if (endpointMatches && endpointMatches.length > 0) {
      // Extraer el primer segmento común
      const paths = endpointMatches.map(match => {
        const pathMatch = match.match(/['"]([^'"]+)['"]/);
        return pathMatch ? pathMatch[1] : '';
      }).filter(path => path.startsWith('/'));
      
      if (paths.length > 0) {
        // Buscar prefijo común
        const commonPrefix = this.findCommonPrefix(paths);
        if (commonPrefix && commonPrefix !== '/') {
          return commonPrefix;
        }
      }
    }
    
    // 3. Buscar comentarios que indican el path
    const commentMatch = content.match(/\/\*\*?\s*@route\s+([^\s]+)/i);
    if (commentMatch) {
      return commentMatch[1];
    }
    
    // 4. Buscar variable de configuración base
    const baseConfigMatches = [
      /const\s+BASE_PATH\s*=\s*['"]([^'"]+)['"]/,
      /const\s+API_PREFIX\s*=\s*['"]([^'"]+)['"]/,
      /BASE_URL.*['"]([^'"]*\/api[^'"]*)['"]/i
    ];
    
    for (const pattern of baseConfigMatches) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // 5. Inferir del nombre del archivo
    const fileName = path.basename(relativePath, path.extname(relativePath));
    if (fileName !== 'index' && fileName !== 'routes' && fileName !== 'app' && fileName !== 'server') {
      // Si el archivo se llama 'users.js' -> '/api/users'
      return `/api/${fileName}`;
    }
    
    // 6. Buscar en directorio padre
    const dirName = path.basename(path.dirname(relativePath));
    if (dirName !== 'routes' && dirName !== '.' && dirName !== 'src') {
      return `/api/${dirName}`;
    }
    
    // 7. Fallback para archivos en routes/ -> asumir /api
    if (relativePath.includes('routes/')) {
      return '/api';
    }
    
    return '';
  }

  findCommonPrefix(paths) {
    if (paths.length === 0) return '';
    if (paths.length === 1) {
      // Si solo hay un path, tomar hasta el primer parámetro o último segmento
      const segments = paths[0].split('/').filter(s => s);
      if (segments.length > 1) {
        return '/' + segments.slice(0, -1).join('/');
      }
      return '';
    }
    
    // Encontrar prefijo común entre múltiples paths
    let prefix = paths[0];
    for (let i = 1; i < paths.length; i++) {
      while (prefix && !paths[i].startsWith(prefix)) {
        prefix = prefix.substring(0, prefix.lastIndexOf('/'));
      }
    }
    
    // Asegurar que termina en un segmento completo
    if (prefix && prefix !== '/' && !prefix.endsWith('/')) {
      const lastSlash = prefix.lastIndexOf('/');
      if (lastSlash > 0) {
        prefix = prefix.substring(0, lastSlash);
      }
    }
    
    return prefix;
  }

  extractEndpointFromCall(node, basePath, file, content) {
    // Detectar llamadas como: router.get(), app.post(), etc.
    if (
      node.callee.type === 'MemberExpression' &&
      (node.callee.object.name === 'router' || 
       node.callee.object.name === 'app' ||
       node.callee.object.name === 'express') &&
      ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(node.callee.property.name)
    ) {
      const method = node.callee.property.name.toUpperCase();
      const pathArg = node.arguments[0];
      const routePath = extractStringValue(pathArg);
      
      if (!routePath) return null;
      
      const fullPath = this.normalizePath(basePath + routePath);
      
      // Extraer middleware y controlador
      const { middleware, controller } = this.extractMiddlewareAndController(node.arguments);
      
      return {
        method,
        path: fullPath,
        originalPath: routePath,
        basePath,
        file,
        line: node.loc?.start?.line || 0,
        middleware,
        controller,
        requiresAuth: this.detectAuthRequirement(middleware),
        params: this.extractPathParams(fullPath),
        queryParams: [],
        expectedBody: {},
        responseStructure: {},
        statusCodes: [],
        used: false,
        description: this.extractDescription(content, node.loc?.start?.line)
      };
    }
    
    return null;
  }

  extractMiddlewareAndController(args) {
    const middleware = [];
    let controller = null;
    
    // Todos los argumentos excepto el primero (path) pueden ser middleware o controller
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.type === 'Identifier') {
        // Último argumento suele ser el controller
        if (i === args.length - 1) {
          controller = arg.name;
        } else {
          middleware.push(arg.name);
        }
      } else if (arg.type === 'MemberExpression') {
        const name = `${arg.object.name}.${arg.property.name}`;
        if (i === args.length - 1) {
          controller = name;
        } else {
          middleware.push(name);
        }
      } else if (arg.type === 'CallExpression') {
        // Middleware que se ejecuta: auth(), validate(), etc.
        const name = arg.callee.name || 
          (arg.callee.type === 'MemberExpression' ? 
           `${arg.callee.object.name}.${arg.callee.property.name}` : 
           'unknown');
        middleware.push(name);
      } else if (arg.type === 'ArrayExpression') {
        // Array de middleware
        arg.elements.forEach(element => {
          if (element.type === 'Identifier') {
            middleware.push(element.name);
          }
        });
      }
    }
    
    return { middleware, controller };
  }

  detectAuthRequirement(middleware) {
    const authPatterns = [
      /auth/i,
      /jwt/i,
      /verify/i,
      /protect/i,
      /authenticate/i,
      /authorize/i,
      /guard/i,
      /secure/i
    ];
    
    return middleware.some(mw => 
      authPatterns.some(pattern => pattern.test(mw))
    );
  }

  extractPathParams(path) {
    const params = [];
    const matches = path.match(/:([^/]+)/g);
    
    if (matches) {
      matches.forEach(match => {
        const paramName = match.substring(1);
        params.push(paramName);
      });
    }
    
    return params;
  }

  normalizePath(path) {
    // Normalizar path: remover // duplicados, asegurar que empiece con /
    let normalized = path.replace(/\/+/g, '/');
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  extractDescription(content, lineNumber) {
    if (!lineNumber) return '';
    
    const lines = content.split('\\n');
    let description = '';
    
    // Buscar comentarios arriba de la línea
    for (let i = lineNumber - 2; i >= 0 && i >= lineNumber - 5; i--) {
      const line = lines[i]?.trim();
      if (line?.startsWith('//') || line?.startsWith('*') || line?.startsWith('/*')) {
        description = line.replace(/^\/\*+|\*+\/$/g, '').replace(/^\/\/|^\*/g, '').trim() + ' ' + description;
      } else if (line && !line.match(/^\/\*/) && description) {
        break;
      }
    }
    
    return description.trim();
  }

  async analyzeControllers() {
    const controllerPath = path.join(
      this.projectConfig.path,
      this.projectConfig.folders?.controllers || 'controllers'
    );
    
    if (!fs.existsSync(controllerPath)) {
      console.log('   ⚠️  No se encontró directorio de controladores');
      return;
    }
    
    const controllerFiles = findFiles(
      controllerPath,
      this.auditConfig.fileExtensions.backend,
      this.auditConfig.ignorePatterns
    );
    
    for (const file of controllerFiles) {
      await this.analyzeControllerFile(file);
    }
  }

  async analyzeControllerFile(filePath) {
    const content = readFileSafe(filePath);
    if (!content) return;
    
    const relativePath = path.relative(this.projectConfig.path, filePath);
    const ast = parseCodeSafe(content);
    
    if (!ast) return;
    
    const fileName = path.basename(filePath, path.extname(filePath));
    const controllerFunctions = new Map();
    
    // Buscar exports de funciones
    traverse.default(ast, {
      // exports.functionName = ...
      AssignmentExpression: (path) => {
        if (
          path.node.left.type === 'MemberExpression' &&
          path.node.left.object.name === 'exports' &&
          path.node.left.property.name
        ) {
          const funcName = path.node.left.property.name;
          controllerFunctions.set(funcName, {
            name: funcName,
            type: path.node.right.type,
            async: this.isAsyncFunction(path.node.right),
            params: this.extractControllerParams(path.node.right),
            file: relativePath,
            line: path.node.loc?.start?.line
          });
        }
      },
      
      // export const functionName = ...
      ExportNamedDeclaration: (path) => {
        if (path.node.declaration?.type === 'VariableDeclaration') {
          path.node.declaration.declarations.forEach(decl => {
            if (decl.id.name) {
              controllerFunctions.set(decl.id.name, {
                name: decl.id.name,
                type: decl.init?.type,
                async: this.isAsyncFunction(decl.init),
                params: this.extractControllerParams(decl.init),
                file: relativePath,
                line: decl.loc?.start?.line
              });
            }
          });
        }
      },
      
      // function declarations
      FunctionDeclaration: (path) => {
        if (path.node.id?.name) {
          controllerFunctions.set(path.node.id.name, {
            name: path.node.id.name,
            type: 'FunctionDeclaration',
            async: path.node.async,
            params: this.extractControllerParams(path.node),
            file: relativePath,
            line: path.node.loc?.start?.line
          });
        }
      }
    });
    
    this.controllers.set(fileName, {
      file: relativePath,
      functions: controllerFunctions
    });
  }

  isAsyncFunction(node) {
    return node?.async === true || 
           (node?.type === 'ArrowFunctionExpression' && node.async === true) ||
           (node?.type === 'FunctionExpression' && node.async === true);
  }

  extractControllerParams(funcNode) {
    if (!funcNode || !funcNode.params) return [];
    
    return funcNode.params.map(param => {
      if (param.type === 'Identifier') {
        return param.name;
      } else if (param.type === 'ObjectPattern') {
        return `{${param.properties.map(p => p.key?.name).join(', ')}}`;
      }
      return param.type;
    });
  }

  async analyzeModels() {
    const modelPath = path.join(
      this.projectConfig.path,
      this.projectConfig.folders?.models || 'models'
    );
    
    if (!fs.existsSync(modelPath)) {
      console.log('   ⚠️  No se encontró directorio de modelos');
      return;
    }
    
    const modelFiles = findFiles(
      modelPath,
      this.auditConfig.fileExtensions.backend,
      this.auditConfig.ignorePatterns
    );
    
    this.models = modelFiles.map(file => ({
      file: path.relative(this.projectConfig.path, file),
      name: path.basename(file, path.extname(file)),
      type: this.detectModelType(file)
    }));
  }

  detectModelType(filePath) {
    const content = readFileSafe(filePath);
    if (!content) return 'unknown';
    
    if (content.includes('mongoose') || content.includes('Schema')) {
      return 'mongoose';
    } else if (content.includes('sequelize') || content.includes('DataTypes')) {
      return 'sequelize';
    } else if (content.includes('prisma')) {
      return 'prisma';
    }
    
    return 'custom';
  }

  async analyzeMiddleware() {
    const middlewarePath = path.join(
      this.projectConfig.path,
      this.projectConfig.folders?.middleware || 'middleware'
    );
    
    if (!fs.existsSync(middlewarePath)) {
      console.log('   ⚠️  No se encontró directorio de middleware');
      return;
    }
    
    const middlewareFiles = findFiles(
      middlewarePath,
      this.auditConfig.fileExtensions.backend,
      this.auditConfig.ignorePatterns
    );
    
    this.middleware = middlewareFiles.map(file => ({
      file: path.relative(this.projectConfig.path, file),
      name: path.basename(file, path.extname(file))
    }));
  }

  async linkControllersToEndpoints() {
    // Intentar vincular controladores con endpoints
    this.endpoints.forEach((endpoint, key) => {
      if (endpoint.controller) {
        // Buscar el controlador en nuestro mapa
        for (const [controllerName, controllerData] of this.controllers) {
          if (controllerData.functions.has(endpoint.controller)) {
            const func = controllerData.functions.get(endpoint.controller);
            endpoint.controllerDetails = func;
            break;
          }
          
          // Intentar match parcial
          const possibleMatch = Array.from(controllerData.functions.keys())
            .find(funcName => 
              funcName.toLowerCase().includes(endpoint.controller.toLowerCase()) ||
              endpoint.controller.toLowerCase().includes(funcName.toLowerCase())
            );
          
          if (possibleMatch) {
            endpoint.controllerDetails = controllerData.functions.get(possibleMatch);
            break;
          }
        }
      }
    });
  }
}