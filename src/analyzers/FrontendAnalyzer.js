import fs from 'fs';
import path from 'path';
import traverse from '@babel/traverse';
import { findFiles, readFileSafe, getRelativePaths } from '../utils/fileUtils.js';
import { parseCodeSafe, extractStringValue, extractObjectStructure, findImports, isReactComponent, extractReactProps } from '../utils/astUtils.js';

export default class FrontendAnalyzer {
  constructor(projectConfig, auditConfig) {
    this.projectConfig = projectConfig;
    this.auditConfig = auditConfig;
    
    // Resultados del análisis
    this.apiCalls = new Map();
    this.components = new Map();
    this.pages = [];
    this.services = [];
    this.files = [];
    this.imports = new Map();
  }

  async analyze() {
    console.log(`   → Escaneando: ${this.projectConfig.path}`);
    
    if (!fs.existsSync(this.projectConfig.path)) {
      throw new Error(`Ruta del frontend no existe: ${this.projectConfig.path}`);
    }

    // Analizar estructura del proyecto
    await this.analyzeProjectStructure();
    
    // Buscar y analizar archivos
    await this.analyzeSourceFiles();
    
    // Analizar servicios/API calls específicamente
    await this.analyzeServices();
    
    // Post-procesamiento
    await this.linkImportsToComponents();
    
    console.log(`   ✓ ${this.apiCalls.size} llamadas API encontradas`);
    console.log(`   ✓ ${this.components.size} componentes encontrados`);
    
    return {
      apiCalls: this.apiCalls,
      components: this.components,
      pages: this.pages,
      services: this.services,
      files: this.files,
      imports: this.imports
    };
  }

  async analyzeProjectStructure() {
    // Verificar estructura típica de proyecto React/Vue/Angular
    const possibleStructures = [
      'src/components',
      'components',
      'src/pages',
      'pages',
      'src/views',
      'views',
      'src/services',
      'services',
      'src/api',
      'api',
      'src/hooks',
      'hooks'
    ];
    
    const foundStructures = possibleStructures.filter(s => 
      fs.existsSync(path.join(this.projectConfig.path, s))
    );
    
    if (foundStructures.length === 0) {
      console.warn('   ⚠️  No se reconoce la estructura del frontend');
    } else {
      console.log(`   ✓ Estructura detectada: ${foundStructures.join(', ')}`);
    }
    
    // Detectar tipo de proyecto
    const packageJsonPath = path.join(this.projectConfig.path, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSafe(packageJsonPath) || '{}');
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (dependencies.react) {
        console.log('   ✓ Proyecto React detectado');
      } else if (dependencies.vue) {
        console.log('   ✓ Proyecto Vue detectado');
      } else if (dependencies['@angular/core']) {
        console.log('   ✓ Proyecto Angular detectado');
      }
    }
  }

  async analyzeSourceFiles() {
    // Buscar archivos en directorios principales
    const searchPaths = [
      this.projectConfig.folders?.components,
      this.projectConfig.folders?.pages,
      this.projectConfig.folders?.services,
      'src', // Fallback general
      '' // Raíz del proyecto
    ].filter(Boolean);
    
    for (const searchPath of searchPaths) {
      const fullPath = path.join(this.projectConfig.path, searchPath);
      
      if (fs.existsSync(fullPath)) {
        const files = findFiles(
          fullPath,
          this.auditConfig.fileExtensions.frontend,
          this.auditConfig.ignorePatterns
        );
        
        for (const file of files) {
          await this.analyzeSourceFile(file);
          this.files.push(file);
        }
      }
    }
  }

  async analyzeSourceFile(filePath) {
    const content = readFileSafe(filePath);
    if (!content) return;
    
    const relativePath = path.relative(this.projectConfig.path, filePath);
    
    // Excluir archivos de test y stories
    if (this.shouldExcludeFile(relativePath)) {
      return;
    }
    
    const ast = parseCodeSafe(content);
    if (!ast) {
      console.warn(`   ⚠️  No se pudo parsear: ${relativePath}`);
      return;
    }
    
    // Analizar imports
    const imports = findImports(ast);
    this.imports.set(relativePath, imports);
    
    // Buscar API calls
    await this.extractAPICalls(ast, relativePath, content);
    
    // Buscar componentes React
    await this.extractComponents(ast, relativePath, content);
    
    // Clasificar archivo
    this.classifyFile(relativePath, content, ast);
  }

  shouldExcludeFile(relativePath) {
    const excludePatterns = [
      /\.test\./,
      /\.spec\./,
      /\.stories\./,
      /\.config\./,
      /\.d\.ts$/,
      /node_modules/,
      /dist/,
      /build/,
      /__tests__/,
      /__mocks__/
    ];
    
    return excludePatterns.some(pattern => pattern.test(relativePath));
  }

  async extractAPICalls(ast, file, content) {
    const apiCalls = [];
    
    traverse.default(ast, {
      CallExpression: (path) => {
        const apiCall = this.detectAPICall(path.node, content);
        if (apiCall) {
          apiCall.file = file;
          apiCall.line = path.node.loc?.start?.line || 0;
          apiCalls.push(apiCall);
        }
      }
    });
    
    // Procesar y normalizar llamadas API
    for (const call of apiCalls) {
      const normalizedCall = await this.normalizeAPICall(call);
      if (normalizedCall) {
        const key = `${normalizedCall.method} ${normalizedCall.endpoint}`;
        
        if (!this.apiCalls.has(key)) {
          this.apiCalls.set(key, []);
        }
        
        this.apiCalls.get(key).push(normalizedCall);
      }
    }
  }

  detectAPICall(node, content) {
    // 1. fetch(url, options)
    if (node.callee.name === 'fetch') {
      return {
        type: 'fetch',
        urlArg: node.arguments[0],
        optionsArg: node.arguments[1]
      };
    }
    
    // 2. axios.METHOD(url, data, config)
    if (
      node.callee.type === 'MemberExpression' &&
      node.callee.object.name === 'axios' &&
      ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(node.callee.property.name)
    ) {
      return {
        type: 'axios',
        method: node.callee.property.name.toUpperCase(),
        urlArg: node.arguments[0],
        dataArg: node.arguments[1],
        configArg: node.arguments[2]
      };
    }
    
    // 3. api.METHOD() - Custom API wrapper
    if (
      node.callee.type === 'MemberExpression' &&
      (node.callee.object.name === 'api' || 
       node.callee.object.name === 'API' ||
       node.callee.object.name === 'client' ||
       node.callee.object.name === 'httpClient') &&
      ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(node.callee.property.name)
    ) {
      return {
        type: 'api',
        method: node.callee.property.name.toUpperCase(),
        urlArg: node.arguments[0],
        dataArg: node.arguments[1],
        configArg: node.arguments[2]
      };
    }
    
    // 4. request() calls
    if (node.callee.name === 'request' || 
        (node.callee.type === 'MemberExpression' && node.callee.property.name === 'request')) {
      return {
        type: 'request',
        configArg: node.arguments[0]
      };
    }
    
    // 5. Custom service calls que contengan 'api' en el nombre
    if (
      node.callee.type === 'MemberExpression' &&
      node.callee.object.name &&
      /api|service|client/i.test(node.callee.object.name)
    ) {
      return {
        type: 'service',
        serviceName: node.callee.object.name,
        method: node.callee.property.name,
        args: node.arguments
      };
    }
    
    return null;
  }

  async normalizeAPICall(call) {
    let method = call.method || 'GET';
    let endpoint = null;
    let data = {};
    let hasAuth = false;
    let expectedResponse = {};
    
    try {
      // Extraer endpoint según tipo de llamada
      if (call.type === 'fetch') {
        endpoint = extractStringValue(call.urlArg);
        
        // Extraer método de options
        if (call.optionsArg) {
          const options = extractObjectStructure(call.optionsArg);
          if (options.method) {
            method = typeof options.method === 'string' 
              ? options.method.toUpperCase() 
              : 'GET';
          }
          
          // Extraer body
          if (options.body) {
            data = options.body;
          }
          
          // Verificar headers de auth
          if (options.headers) {
            hasAuth = this.checkAuthInHeaders(options.headers);
          }
        }
      } else if (call.type === 'axios' || call.type === 'api') {
        endpoint = extractStringValue(call.urlArg);
        
        // Extraer data
        if (call.dataArg) {
          data = extractObjectStructure(call.dataArg);
        }
        
        // Verificar config para auth
        if (call.configArg) {
          const config = extractObjectStructure(call.configArg);
          if (config.headers) {
            hasAuth = this.checkAuthInHeaders(config.headers);
          }
        }
      } else if (call.type === 'service') {
        // Para llamadas de servicio custom, intentar inferir endpoint
        endpoint = `/${call.serviceName}/${call.method}`;
        method = this.inferMethodFromServiceCall(call.method);
        
        if (call.args && call.args.length > 0) {
          data = extractObjectStructure(call.args[0]);
        }
      }
      
      if (!endpoint) return null;
      
      // Limpiar y normalizar endpoint
      endpoint = this.cleanEndpoint(endpoint);
      
      return {
        method,
        endpoint,
        originalUrl: extractStringValue(call.urlArg),
        file: call.file,
        line: call.line,
        type: call.type,
        data,
        hasAuth,
        expectedResponse,
        params: this.extractURLParams(endpoint),
        queryParams: this.extractQueryParams(endpoint)
      };
      
    } catch (error) {
      console.warn(`   ⚠️  Error normalizando API call en ${call.file}:${call.line}`);
      return null;
    }
  }

  checkAuthInHeaders(headers) {
    if (typeof headers === 'object') {
      const authHeaders = ['authorization', 'Authorization', 'auth', 'token', 'x-auth-token', 'bearer'];
      return authHeaders.some(header => 
        headers.hasOwnProperty(header) || 
        (typeof headers === 'string' && headers.toLowerCase().includes('authorization'))
      );
    }
    return false;
  }

  inferMethodFromServiceCall(methodName) {
    const methodMapping = {
      'get': 'GET',
      'fetch': 'GET',
      'find': 'GET',
      'list': 'GET',
      'create': 'POST',
      'add': 'POST',
      'save': 'POST',
      'update': 'PUT',
      'edit': 'PUT',
      'patch': 'PATCH',
      'delete': 'DELETE',
      'remove': 'DELETE',
      'destroy': 'DELETE'
    };
    
    const lowerMethod = methodName.toLowerCase();
    return methodMapping[lowerMethod] || 
           Object.keys(methodMapping).find(key => lowerMethod.includes(key)) ||
           'POST';
  }

  cleanEndpoint(endpoint) {
    if (!endpoint) return '';
    
    // Remover protocolo y host
    endpoint = endpoint.replace(/^https?:\/\/[^\/]+/, '');
    
    // Remover query parameters para normalización
    endpoint = endpoint.split('?')[0];
    
    // Reemplazar template literals con parámetros
    endpoint = endpoint.replace(/\$\{[^}]+\}/g, ':param');
    
    // Asegurar que empiece con /
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }
    
    return endpoint;
  }

  extractURLParams(url) {
    const params = [];
    const matches = url.match(/:([^/?]+)/g);
    
    if (matches) {
      matches.forEach(match => {
        const paramName = match.substring(1);
        params.push(paramName);
      });
    }
    
    return params;
  }

  extractQueryParams(url) {
    const queryParams = [];
    const queryIndex = url.indexOf('?');
    
    if (queryIndex !== -1) {
      const queryString = url.substring(queryIndex + 1);
      const params = queryString.split('&');
      
      params.forEach(param => {
        const [key] = param.split('=');
        if (key) {
          queryParams.push(key);
        }
      });
    }
    
    return queryParams;
  }

  async extractComponents(ast, file, content) {
    const components = [];
    
    traverse.default(ast, {
      // Function components: function ComponentName() {}
      FunctionDeclaration: (path) => {
        if (isReactComponent(path.node)) {
          components.push({
            name: path.node.id.name,
            type: 'function',
            file,
            line: path.node.loc?.start?.line,
            props: extractReactProps(path.node),
            isDefault: false
          });
        }
      },
      
      // Arrow function components: const ComponentName = () => {}
      VariableDeclarator: (path) => {
        if (isReactComponent(path.node)) {
          components.push({
            name: path.node.id.name,
            type: 'arrow',
            file,
            line: path.node.loc?.start?.line,
            props: extractReactProps(path.node),
            isDefault: false
          });
        }
      },
      
      // Class components: class ComponentName extends React.Component {}
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
            components.push({
              name: node.id.name,
              type: 'class',
              file,
              line: node.loc?.start?.line,
              props: [],
              isDefault: false
            });
          }
        }
      },
      
      // Export default
      ExportDefaultDeclaration: (path) => {
        if (path.node.declaration?.name) {
          // Marcar componente como default si ya existe
          const existingComponent = components.find(c => c.name === path.node.declaration.name);
          if (existingComponent) {
            existingComponent.isDefault = true;
          }
        }
      }
    });
    
    // Agregar componentes encontrados
    components.forEach(component => {
      this.components.set(`${file}:${component.name}`, component);
    });
  }

  classifyFile(file, content, ast) {
    const fileName = path.basename(file).toLowerCase();
    const dirName = path.dirname(file).toLowerCase();
    
    // Clasificar como página
    if (dirName.includes('pages') || dirName.includes('views') || 
        fileName.includes('page') || fileName.includes('view') ||
        content.includes('useRouter') || content.includes('useNavigate')) {
      this.pages.push({
        file,
        name: path.basename(file, path.extname(file)),
        type: this.detectPageType(content)
      });
    }
    
    // Clasificar como servicio
    if (dirName.includes('services') || dirName.includes('api') ||
        fileName.includes('service') || fileName.includes('api') ||
        this.containsMultipleAPICalls(ast)) {
      this.services.push({
        file,
        name: path.basename(file, path.extname(file)),
        type: 'api-service'
      });
    }
  }

  detectPageType(content) {
    if (content.includes('getServerSideProps') || content.includes('getStaticProps')) {
      return 'next-page';
    } else if (content.includes('useRouter')) {
      return 'react-router-page';
    } else if (content.includes('$route')) {
      return 'vue-page';
    }
    return 'component-page';
  }

  containsMultipleAPICalls(ast) {
    let apiCallCount = 0;
    
    traverse.default(ast, {
      CallExpression: (path) => {
        if (this.detectAPICall(path.node)) {
          apiCallCount++;
        }
      }
    });
    
    return apiCallCount >= 3; // Considerar servicio si tiene 3+ llamadas API
  }

  async analyzeServices() {
    // Analizar específicamente carpetas de servicios
    const servicePaths = [
      this.projectConfig.folders?.services,
      this.projectConfig.folders?.api,
      'src/services',
      'src/api',
      'services',
      'api'
    ].filter(Boolean);
    
    for (const servicePath of servicePaths) {
      const fullPath = path.join(this.projectConfig.path, servicePath);
      
      if (fs.existsSync(fullPath)) {
        const serviceFiles = findFiles(
          fullPath,
          this.auditConfig.fileExtensions.frontend,
          this.auditConfig.ignorePatterns
        );
        
        for (const file of serviceFiles) {
          await this.analyzeServiceFile(file);
        }
      }
    }
  }

  async analyzeServiceFile(filePath) {
    // Los servicios ya se analizan en analyzeSourceFile
    // Pero aquí podríamos hacer análisis más específico si es necesario
    const relativePath = path.relative(this.projectConfig.path, filePath);
    
    if (!this.services.find(s => s.file === relativePath)) {
      this.services.push({
        file: relativePath,
        name: path.basename(filePath, path.extname(filePath)),
        type: 'dedicated-service'
      });
    }
  }

  async linkImportsToComponents() {
    // Vincular imports con componentes para detectar uso del design system
    // Esto se implementará cuando tengamos el DesignSystemAnalyzer
  }
}