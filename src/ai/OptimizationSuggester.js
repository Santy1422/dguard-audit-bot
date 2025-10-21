import fs from 'fs';
import path from 'path';

export default class OptimizationSuggester {
  constructor() {
    this.patterns = this.loadPatterns();
    this.suggestions = [];
  }

  loadPatterns() {
    return {
      // Patrones de endpoints comunes
      endpointPatterns: {
        crud: {
          get: { pattern: /\/(\w+)$/, suggest: 'GET /:resource' },
          getById: { pattern: /\/(\w+)\/:id$/, suggest: 'GET /:resource/:id' },
          create: { pattern: /\/(\w+)$/, method: 'POST', suggest: 'POST /:resource' },
          update: { pattern: /\/(\w+)\/:id$/, method: 'PUT', suggest: 'PUT /:resource/:id' },
          delete: { pattern: /\/(\w+)\/:id$/, method: 'DELETE', suggest: 'DELETE /:resource/:id' }
        },
        restful: {
          collection: /^\/api\/v?\d*\/(\w+)$/,
          resource: /^\/api\/v?\d*\/(\w+)\/(\d+|\:id)$/,
          nestedCollection: /^\/api\/v?\d*\/(\w+)\/(\d+|\:id)\/(\w+)$/,
          nestedResource: /^\/api\/v?\d*\/(\w+)\/(\d+|\:id)\/(\w+)\/(\d+|\:id)$/
        }
      },

      // Patrones de problemas comunes
      antiPatterns: {
        redundantPaths: /\/api\/api\//,
        inconsistentNaming: /[A-Z]/,
        deepNesting: /\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+/,
        verbInPath: /(create|update|delete|get|post|put)/i,
        fileExtensions: /\.(json|xml|html)$/,
        trailingSlash: /\/$/
      },

      // Patrones de seguridad
      securityPatterns: {
        sensitiveEndpoints: /(delete|admin|auth|login|password|token|key)/i,
        publicData: /(user|profile|account|private|secret)/i,
        fileAccess: /(file|upload|download|document)/i,
        adminEndpoints: /(admin|manage|control|system)/i
      },

      // Patrones de performance
      performancePatterns: {
        heavyOperations: /(search|query|report|export|bulk)/i,
        realTimeData: /(live|stream|socket|ws)/i,
        fileOperations: /(upload|download|image|video|pdf)/i,
        batchOperations: /(batch|bulk|mass)/i
      }
    };
  }

  async generateSuggestions(auditReport) {
    this.suggestions = [];

    // Analizar endpoints
    if (auditReport.projects.backend?.endpoints) {
      await this.analyzeEndpoints(auditReport.projects.backend.endpoints);
    }

    // Analizar issues
    if (auditReport.issues) {
      await this.analyzeIssues(auditReport.issues);
    }

    // Analizar arquitectura
    await this.analyzeArchitecture(auditReport);

    // Generar sugerencias de optimización
    await this.generateOptimizationSuggestions(auditReport);

    return this.suggestions;
  }

  async analyzeEndpoints(endpoints) {
    const endpointGroups = this.groupEndpointsByResource(endpoints);

    for (const [resource, resourceEndpoints] of Object.entries(endpointGroups)) {
      await this.analyzeResourceEndpoints(resource, resourceEndpoints);
    }

    // Analizar patrones globales
    await this.analyzeGlobalEndpointPatterns(endpoints);
  }

  groupEndpointsByResource(endpoints) {
    const groups = {};

    endpoints.forEach(endpoint => {
      const pathSegments = endpoint.path.split('/').filter(s => s);
      const resource = pathSegments.find(segment => !segment.startsWith(':') && segment !== 'api');

      if (resource) {
        if (!groups[resource]) {
          groups[resource] = [];
        }
        groups[resource].push(endpoint);
      }
    });

    return groups;
  }

  async analyzeResourceEndpoints(resource, endpoints) {
    const methods = endpoints.map(e => e.method);
    const paths = endpoints.map(e => e.path);

    // Verificar completitud CRUD
    const crudMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    const missingMethods = crudMethods.filter(method => !methods.includes(method));

    if (missingMethods.length > 0) {
      this.suggestions.push({
        type: 'INCOMPLETE_CRUD',
        category: 'API_DESIGN',
        priority: 'MEDIUM',
        resource,
        description: `Recurso '${resource}' no implementa CRUD completo`,
        details: `Métodos faltantes: ${missingMethods.join(', ')}`,
        suggestion: `Considera implementar los métodos faltantes para completar la API REST`,
        impact: 'Consistencia de API',
        effort: 'Medium',
        examples: this.generateCRUDExamples(resource, missingMethods)
      });
    }

    // Verificar consistencia de rutas
    const inconsistentPaths = this.findInconsistentPaths(paths, resource);
    if (inconsistentPaths.length > 0) {
      this.suggestions.push({
        type: 'INCONSISTENT_PATHS',
        category: 'API_DESIGN',
        priority: 'LOW',
        resource,
        description: `Rutas inconsistentes para recurso '${resource}'`,
        details: `Rutas problemáticas: ${inconsistentPaths.join(', ')}`,
        suggestion: 'Estandarizar la nomenclatura de rutas siguiendo convenciones REST',
        impact: 'Mantenibilidad',
        effort: 'Low'
      });
    }

    // Analizar performance
    await this.analyzeResourcePerformance(resource, endpoints);
  }

  async analyzeResourcePerformance(resource, endpoints) {
    const heavyEndpoints = endpoints.filter(endpoint => 
      this.patterns.performancePatterns.heavyOperations.test(endpoint.path) ||
      this.patterns.performancePatterns.fileOperations.test(endpoint.path)
    );

    if (heavyEndpoints.length > 0) {
      this.suggestions.push({
        type: 'PERFORMANCE_OPTIMIZATION',
        category: 'PERFORMANCE',
        priority: 'HIGH',
        resource,
        description: `Endpoints con operaciones pesadas detectados en '${resource}'`,
        details: `Endpoints: ${heavyEndpoints.map(e => `${e.method} ${e.path}`).join(', ')}`,
        suggestion: 'Implementar paginación, caching, o procesamiento asíncrono',
        impact: 'Performance del sistema',
        effort: 'High',
        optimizations: [
          'Implementar paginación con limit/offset',
          'Agregar cache con TTL apropiado',
          'Considerar procesamiento en background',
          'Implementar rate limiting'
        ]
      });
    }
  }

  async analyzeGlobalEndpointPatterns(endpoints) {
    // Analizar versionado de API
    const versionedEndpoints = endpoints.filter(e => /\/v\d+\//.test(e.path));
    const unversionedEndpoints = endpoints.filter(e => !/\/v\d+\//.test(e.path));

    if (versionedEndpoints.length > 0 && unversionedEndpoints.length > 0) {
      this.suggestions.push({
        type: 'INCONSISTENT_VERSIONING',
        category: 'API_DESIGN',
        priority: 'MEDIUM',
        description: 'Versionado inconsistente de API',
        details: `${versionedEndpoints.length} endpoints versionados, ${unversionedEndpoints.length} sin versionar`,
        suggestion: 'Aplicar versionado consistente a toda la API',
        impact: 'Evolución de API',
        effort: 'Medium'
      });
    }

    // Analizar profundidad de rutas
    const deepPaths = endpoints.filter(e => e.path.split('/').length > 6);
    if (deepPaths.length > 0) {
      this.suggestions.push({
        type: 'DEEP_NESTING',
        category: 'API_DESIGN',
        priority: 'LOW',
        description: 'Rutas con anidamiento profundo detectadas',
        details: `${deepPaths.length} rutas con más de 5 niveles`,
        suggestion: 'Simplificar estructura de rutas o usar query parameters',
        impact: 'Usabilidad de API',
        effort: 'Medium',
        examples: deepPaths.slice(0, 3).map(e => e.path)
      });
    }

    // Analizar seguridad
    await this.analyzeSecurityPatterns(endpoints);
  }

  async analyzeSecurityPatterns(endpoints) {
    const sensitiveEndpoints = endpoints.filter(endpoint =>
      this.patterns.securityPatterns.sensitiveEndpoints.test(endpoint.path) ||
      this.patterns.securityPatterns.adminEndpoints.test(endpoint.path)
    );

    const unauthenticatedSensitive = sensitiveEndpoints.filter(endpoint => !endpoint.requiresAuth);

    if (unauthenticatedSensitive.length > 0) {
      this.suggestions.push({
        type: 'SECURITY_VULNERABILITY',
        category: 'SECURITY',
        priority: 'CRITICAL',
        description: 'Endpoints sensibles sin autenticación detectados',
        details: `${unauthenticatedSensitive.length} endpoints críticos expuestos`,
        suggestion: 'Implementar autenticación y autorización apropiadas',
        impact: 'Seguridad del sistema',
        effort: 'High',
        vulnerableEndpoints: unauthenticatedSensitive.map(e => `${e.method} ${e.path}`)
      });
    }

    // Analizar endpoints de archivos
    const fileEndpoints = endpoints.filter(endpoint =>
      this.patterns.securityPatterns.fileAccess.test(endpoint.path)
    );

    if (fileEndpoints.length > 0) {
      this.suggestions.push({
        type: 'FILE_SECURITY',
        category: 'SECURITY',
        priority: 'HIGH',
        description: 'Endpoints de manejo de archivos detectados',
        details: `${fileEndpoints.length} endpoints que manejan archivos`,
        suggestion: 'Implementar validación de tipos, límites de tamaño y escaneo de malware',
        impact: 'Seguridad de archivos',
        effort: 'Medium',
        recommendations: [
          'Validar tipos de archivo permitidos',
          'Implementar límites de tamaño',
          'Escanear archivos por malware',
          'Usar almacenamiento seguro (no directorio web)'
        ]
      });
    }
  }

  async analyzeIssues(issues) {
    const issuesByType = this.groupIssuesByType(issues);

    // Analizar patrones en issues críticos
    if (issuesByType.CRITICAL && issuesByType.CRITICAL.length > 0) {
      await this.analyzeCriticalIssues(issuesByType.CRITICAL);
    }

    // Analizar issues frecuentes
    const frequentIssues = this.findFrequentIssues(issues);
    if (frequentIssues.length > 0) {
      this.suggestions.push({
        type: 'SYSTEMIC_ISSUES',
        category: 'QUALITY',
        priority: 'HIGH',
        description: 'Patrones de issues frecuentes detectados',
        details: `Issues más frecuentes: ${frequentIssues.map(i => i.type).join(', ')}`,
        suggestion: 'Implementar validaciones automáticas o templates para prevenir estos issues',
        impact: 'Calidad del código',
        effort: 'Medium',
        patterns: frequentIssues
      });
    }
  }

  groupIssuesByType(issues) {
    const groups = {};
    
    issues.forEach(issue => {
      if (!groups[issue.severity]) {
        groups[issue.severity] = [];
      }
      groups[issue.severity].push(issue);
    });

    return groups;
  }

  findFrequentIssues(issues) {
    const typeCounts = {};
    
    issues.forEach(issue => {
      typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
    });

    return Object.entries(typeCounts)
      .filter(([type, count]) => count >= 3)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  async analyzeCriticalIssues(criticalIssues) {
    const issueTypes = criticalIssues.map(i => i.type);
    const uniqueTypes = [...new Set(issueTypes)];

    if (uniqueTypes.includes('MISSING_BACKEND_ENDPOINT')) {
      this.suggestions.push({
        type: 'MISSING_ENDPOINTS',
        category: 'CRITICAL_FIX',
        priority: 'CRITICAL',
        description: 'Múltiples endpoints faltantes detectados',
        suggestion: 'Usar auto-fix para generar esqueletos de endpoints',
        impact: 'Funcionalidad rota',
        effort: 'Low',
        autoFixAvailable: true,
        command: 'npm run audit:fix'
      });
    }

    if (uniqueTypes.includes('SENSITIVE_ENDPOINT_NO_AUTH')) {
      this.suggestions.push({
        type: 'SECURITY_CRITICAL',
        category: 'CRITICAL_FIX',
        priority: 'CRITICAL',
        description: 'Vulnerabilidades de seguridad críticas',
        suggestion: 'Implementar autenticación inmediatamente',
        impact: 'Exposición de datos',
        effort: 'High',
        urgency: 'Immediate action required'
      });
    }
  }

  async analyzeArchitecture(auditReport) {
    const summary = auditReport.summary;

    // Analizar cobertura de endpoints
    if (summary.coverage && summary.coverage.endpoints) {
      const coverage = parseFloat(summary.coverage.endpoints);
      
      if (coverage < 70) {
        this.suggestions.push({
          type: 'LOW_API_COVERAGE',
          category: 'ARCHITECTURE',
          priority: 'MEDIUM',
          description: `Baja cobertura de API (${coverage}%)`,
          suggestion: 'Revisar endpoints no utilizados o implementar endpoints faltantes',
          impact: 'Mantenimiento del código',
          effort: 'Medium',
          currentCoverage: coverage,
          targetCoverage: 85
        });
      }
    }

    // Analizar proporción backend/frontend
    const backendEndpoints = summary.backend?.endpoints || 0;
    const frontendApiCalls = summary.frontend?.apiCalls || 0;
    
    if (backendEndpoints > 0 && frontendApiCalls > 0) {
      const ratio = frontendApiCalls / backendEndpoints;
      
      if (ratio < 0.5) {
        this.suggestions.push({
          type: 'UNDERUTILIZED_BACKEND',
          category: 'ARCHITECTURE',
          priority: 'LOW',
          description: 'Backend subutilizado',
          details: `${backendEndpoints} endpoints, ${frontendApiCalls} llamadas`,
          suggestion: 'Revisar endpoints no utilizados o expandir funcionalidad frontend',
          impact: 'Eficiencia de recursos',
          effort: 'Low'
        });
      } else if (ratio > 2) {
        this.suggestions.push({
          type: 'MISSING_BACKEND_ENDPOINTS',
          category: 'ARCHITECTURE',
          priority: 'MEDIUM',
          description: 'Posibles endpoints faltantes en backend',
          details: `${frontendApiCalls} llamadas para ${backendEndpoints} endpoints`,
          suggestion: 'Verificar si faltan endpoints o hay llamadas duplicadas',
          impact: 'Funcionalidad',
          effort: 'Medium'
        });
      }
    }
  }

  async generateOptimizationSuggestions(auditReport) {
    // Sugerencias basadas en métricas de performance
    if (auditReport.performance) {
      await this.analyzePerformanceMetrics(auditReport.performance);
    }

    // Sugerencias de tooling
    this.generateToolingSuggestions(auditReport);

    // Sugerencias de mejores prácticas
    this.generateBestPracticesSuggestions(auditReport);
  }

  async analyzePerformanceMetrics(performance) {
    const totalDuration = parseFloat(performance.totalDuration);
    
    if (totalDuration > 30) {
      this.suggestions.push({
        type: 'SLOW_ANALYSIS',
        category: 'PERFORMANCE',
        priority: 'MEDIUM',
        description: `Análisis lento (${totalDuration}s)`,
        suggestion: 'Optimizar cache o reducir scope del análisis',
        impact: 'Tiempo de desarrollo',
        effort: 'Low',
        optimizations: [
          'Activar cache: npm run audit:cache:clear && npm run audit',
          'Usar análisis rápido: npm run audit:quick',
          'Excluir directorios innecesarios en configuración'
        ]
      });
    }
  }

  generateToolingSuggestions(auditReport) {
    const issues = auditReport.issues || [];
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    
    if (criticalCount > 0) {
      this.suggestions.push({
        type: 'AUTOFIX_RECOMMENDATION',
        category: 'TOOLING',
        priority: 'HIGH',
        description: 'Auto-fix disponible para issues detectados',
        suggestion: 'Usar funcionalidad de auto-fix para corrección automática',
        impact: 'Productividad',
        effort: 'Low',
        command: 'npm run audit:fix',
        estimatedTimesSaved: '2-4 horas'
      });
    }

    // Sugerir CI/CD si no está configurado
    this.suggestions.push({
      type: 'CI_CD_INTEGRATION',
      category: 'TOOLING',
      priority: 'MEDIUM',
      description: 'Integración con CI/CD recomendada',
      suggestion: 'Configurar auditorías automáticas en pull requests',
      impact: 'Calidad continua',
      effort: 'Low',
      setup: [
        'GitHub Actions ya configurado en .github/workflows/',
        'Configurar secrets necesarios (GH_PAT, etc.)',
        'Activar en repositorio objetivo'
      ]
    });
  }

  generateBestPracticesSuggestions(auditReport) {
    const summary = auditReport.summary;
    
    // Sugerir documentación
    if (summary.backend?.endpoints > 10) {
      this.suggestions.push({
        type: 'API_DOCUMENTATION',
        category: 'BEST_PRACTICES',
        priority: 'MEDIUM',
        description: 'API documentation recomendada',
        suggestion: 'Generar documentación automática de API',
        impact: 'Mantenibilidad',
        effort: 'Medium',
        tools: ['Swagger/OpenAPI', 'Postman Collections', 'API Blueprint']
      });
    }

    // Sugerir testing
    const testableIssues = auditReport.issues.filter(i => 
      ['MISSING_BACKEND_ENDPOINT', 'MISSING_AUTH_HEADER'].includes(i.type)
    );

    if (testableIssues.length > 0) {
      this.suggestions.push({
        type: 'AUTOMATED_TESTING',
        category: 'BEST_PRACTICES',
        priority: 'HIGH',
        description: 'Testing automatizado recomendado',
        suggestion: 'Implementar tests de integración para prevenir regresiones',
        impact: 'Confiabilidad',
        effort: 'High',
        testTypes: ['Unit tests', 'Integration tests', 'E2E tests', 'API contract tests']
      });
    }
  }

  // Helper methods

  findInconsistentPaths(paths, resource) {
    const inconsistent = [];
    
    paths.forEach(path => {
      // Verificar anti-patterns
      Object.entries(this.patterns.antiPatterns).forEach(([name, pattern]) => {
        if (pattern.test(path)) {
          inconsistent.push(path);
        }
      });
    });

    return [...new Set(inconsistent)];
  }

  generateCRUDExamples(resource, missingMethods) {
    const examples = {};
    
    missingMethods.forEach(method => {
      switch (method) {
        case 'GET':
          examples[method] = [
            `GET /api/${resource} - Listar todos`,
            `GET /api/${resource}/:id - Obtener por ID`
          ];
          break;
        case 'POST':
          examples[method] = [`POST /api/${resource} - Crear nuevo`];
          break;
        case 'PUT':
          examples[method] = [`PUT /api/${resource}/:id - Actualizar completo`];
          break;
        case 'DELETE':
          examples[method] = [`DELETE /api/${resource}/:id - Eliminar`];
          break;
      }
    });

    return examples;
  }

  // Método para formatear sugerencias para reporte
  formatSuggestions() {
    const grouped = {};
    
    this.suggestions.forEach(suggestion => {
      if (!grouped[suggestion.category]) {
        grouped[suggestion.category] = [];
      }
      grouped[suggestion.category].push(suggestion);
    });

    // Ordenar por prioridad dentro de cada categoría
    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
    
    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => 
        priorityOrder[a.priority] - priorityOrder[b.priority]
      );
    });

    return grouped;
  }

  // Método para obtener métricas de sugerencias
  getMetrics() {
    const byPriority = {};
    const byCategory = {};
    
    this.suggestions.forEach(suggestion => {
      byPriority[suggestion.priority] = (byPriority[suggestion.priority] || 0) + 1;
      byCategory[suggestion.category] = (byCategory[suggestion.category] || 0) + 1;
    });

    return {
      total: this.suggestions.length,
      byPriority,
      byCategory,
      autoFixAvailable: this.suggestions.filter(s => s.autoFixAvailable).length
    };
  }
}