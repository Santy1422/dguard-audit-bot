import fs from 'fs';
import path from 'path';
import { ensureDir, writeFileSafe } from '../utils/fileUtils.js';

export default class JSONReporter {
  constructor(config = {}) {
    this.config = config;
    this.outputDir = config.outputDir || 'reports';
  }

  async generate(results) {
    // Asegurar que el directorio de reportes existe
    ensureDir(this.outputDir);
    
    // Preparar datos para el reporte JSON
    const reportData = this.prepareReportData(results);
    
    // Generar reporte principal
    const mainReportPath = path.join(this.outputDir, 'audit-report.json');
    const success = writeFileSafe(mainReportPath, JSON.stringify(reportData, null, 2));
    
    if (!success) {
      throw new Error('No se pudo generar el reporte JSON principal');
    }
    
    // Generar reportes adicionales
    await this.generateAdditionalReports(results, reportData);
    
    // Guardar histórico si está habilitado
    if (this.config.saveHistory) {
      await this.saveToHistory(reportData);
    }
    
    return mainReportPath;
  }

  prepareReportData(results) {
    return {
      metadata: {
        ...results.metadata,
        reportGeneratedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0.0'
      },
      
      summary: results.summary,
      
      performance: results.performance,
      
      projects: {
        backend: this.serializeBackendData(results.backend),
        frontend: this.serializeFrontendData(results.frontend),
        designSystem: this.serializeDesignSystemData(results.designSystem)
      },
      
      issues: results.issues.map(issue => ({
        ...issue,
        id: issue.id || this.generateIssueId(),
        severity: issue.severity,
        type: issue.type,
        message: issue.message,
        timestamp: issue.timestamp || new Date().toISOString()
      })),
      
      validations: results.validations || [],
      
      coverage: this.calculateDetailedCoverage(results),
      
      trends: this.calculateTrends(results),
      
      recommendations: this.generateRecommendations(results)
    };
  }

  serializeBackendData(backendData) {
    if (!backendData) return null;
    
    return {
      analyzed: true,
      endpoints: Array.from(backendData.endpoints.entries()).map(([key, endpoint]) => ({
        key,
        method: endpoint.method,
        path: endpoint.path,
        file: endpoint.file,
        line: endpoint.line,
        middleware: endpoint.middleware || [],
        controller: endpoint.controller,
        requiresAuth: endpoint.requiresAuth,
        params: endpoint.params || [],
        queryParams: endpoint.queryParams || [],
        expectedBody: endpoint.expectedBody || {},
        responseStructure: endpoint.responseStructure || {},
        statusCodes: endpoint.statusCodes || [],
        used: endpoint.used || false,
        description: endpoint.description || ''
      })),
      
      files: backendData.files || [],
      models: backendData.models || [],
      routes: backendData.routes || [],
      
      controllers: Array.from(backendData.controllers?.entries() || []).map(([name, controller]) => ({
        name,
        file: controller.file,
        functions: Array.from(controller.functions?.entries() || []).map(([funcName, func]) => ({
          name: funcName,
          ...func
        }))
      })),
      
      middleware: backendData.middleware || []
    };
  }

  serializeFrontendData(frontendData) {
    if (!frontendData) return null;
    
    return {
      analyzed: true,
      
      apiCalls: Array.from(frontendData.apiCalls?.entries() || []).map(([key, calls]) => ({
        key,
        calls: calls.map(call => ({
          method: call.method,
          endpoint: call.endpoint,
          file: call.file,
          line: call.line,
          type: call.type,
          data: call.data || {},
          hasAuth: call.hasAuth || false,
          params: call.params || [],
          queryParams: call.queryParams || []
        }))
      })),
      
      components: Array.from(frontendData.components?.entries() || []).map(([key, component]) => ({
        key,
        name: component.name,
        type: component.type,
        file: component.file,
        line: component.line,
        props: component.props || [],
        isDefault: component.isDefault || false
      })),
      
      pages: frontendData.pages || [],
      services: frontendData.services || [],
      files: frontendData.files || [],
      
      imports: Array.from(frontendData.imports?.entries() || []).map(([file, imports]) => ({
        file,
        imports
      }))
    };
  }

  serializeDesignSystemData(designSystemData) {
    if (!designSystemData) return null;
    
    return {
      analyzed: true,
      
      components: Array.from(designSystemData.components?.entries() || []).map(([name, component]) => ({
        name,
        type: component.type,
        file: component.file,
        line: component.line,
        props: component.props || [],
        description: component.description || '',
        category: component.category || 'misc',
        complexity: component.complexity || 0,
        hasStyles: component.hasStyles || false,
        hasTests: component.hasTests || false,
        hasStories: component.hasStories || false,
        dependencies: component.dependencies || [],
        used: component.used || false,
        usedIn: component.usedIn || [],
        exportedAs: component.exportedAs || {}
      })),
      
      files: designSystemData.files || [],
      themes: designSystemData.themes || [],
      utilities: designSystemData.utilities || [],
      
      exports: Array.from(designSystemData.exports?.entries() || []).map(([file, exports]) => ({
        file,
        exports
      }))
    };
  }

  calculateDetailedCoverage(results) {
    const coverage = {
      endpoints: { used: 0, total: 0, percentage: 0 },
      components: { used: 0, total: 0, percentage: 0 },
      byCategory: {}
    };
    
    // Cobertura de endpoints
    if (results.backend?.endpoints) {
      coverage.endpoints.total = results.backend.endpoints.size;
      coverage.endpoints.used = Array.from(results.backend.endpoints.values())
        .filter(e => e.used).length;
      
      if (coverage.endpoints.total > 0) {
        coverage.endpoints.percentage = 
          ((coverage.endpoints.used / coverage.endpoints.total) * 100).toFixed(1);
      }
    }
    
    // Cobertura de componentes
    if (results.designSystem?.components) {
      coverage.components.total = results.designSystem.components.size;
      coverage.components.used = Array.from(results.designSystem.components.values())
        .filter(c => c.used).length;
      
      if (coverage.components.total > 0) {
        coverage.components.percentage = 
          ((coverage.components.used / coverage.components.total) * 100).toFixed(1);
      }
      
      // Cobertura por categoría
      const byCategory = {};
      Array.from(results.designSystem.components.values()).forEach(component => {
        const category = component.category || 'misc';
        if (!byCategory[category]) {
          byCategory[category] = { used: 0, total: 0 };
        }
        byCategory[category].total++;
        if (component.used) {
          byCategory[category].used++;
        }
      });
      
      Object.keys(byCategory).forEach(category => {
        const data = byCategory[category];
        data.percentage = ((data.used / data.total) * 100).toFixed(1);
      });
      
      coverage.byCategory = byCategory;
    }
    
    return coverage;
  }

  calculateTrends(results) {
    // Por ahora retorna estructura básica
    // En implementación completa, esto compararía con reportes históricos
    return {
      issuesChange: 0,
      issuesChangePercent: 0,
      coverageChange: 0,
      newEndpoints: 0,
      removedEndpoints: 0,
      newComponents: 0,
      removedComponents: 0,
      performanceChange: 0
    };
  }

  generateRecommendations(results) {
    const recommendations = [];
    const { critical, high, medium, total } = results.summary.issues;
    
    // Recomendaciones basadas en severidad
    if (critical > 0) {
      recommendations.push({
        priority: 'urgent',
        category: 'security',
        title: 'Resolver issues críticos inmediatamente',
        description: `Se encontraron ${critical} issues críticos que requieren atención inmediata`,
        actions: [
          'Revisar endpoints faltantes',
          'Implementar autenticación en endpoints sensibles',
          'Verificar funcionalidad afectada'
        ]
      });
    }
    
    if (high > 0) {
      recommendations.push({
        priority: 'high',
        category: 'security',
        title: 'Atender issues de alta prioridad',
        description: `${high} issues de alta prioridad necesitan ser resueltos`,
        actions: [
          'Implementar headers de autenticación',
          'Validar parámetros requeridos',
          'Revisar validaciones de entrada'
        ]
      });
    }
    
    // Recomendaciones de cobertura
    const endpointCoverage = parseFloat(results.summary.coverage?.endpoints || 0);
    if (endpointCoverage < 70) {
      recommendations.push({
        priority: 'medium',
        category: 'optimization',
        title: 'Mejorar cobertura de endpoints',
        description: `Solo ${endpointCoverage}% de endpoints están siendo utilizados`,
        actions: [
          'Revisar endpoints obsoletos',
          'Documentar endpoints disponibles',
          'Considerar deprecar endpoints no utilizados'
        ]
      });
    }
    
    const componentCoverage = parseFloat(results.summary.coverage?.components || 0);
    if (componentCoverage < 60) {
      recommendations.push({
        priority: 'medium',
        category: 'design-system',
        title: 'Aumentar adopción del design system',
        description: `Solo ${componentCoverage}% de componentes del DS están siendo usados`,
        actions: [
          'Capacitar al equipo sobre componentes disponibles',
          'Crear documentación y ejemplos',
          'Establecer guías de uso del design system'
        ]
      });
    }
    
    // Recomendaciones generales
    if (total === 0) {
      recommendations.push({
        priority: 'low',
        category: 'maintenance',
        title: 'Mantener buenas prácticas',
        description: 'El proyecto está bien sincronizado, mantener el buen trabajo',
        actions: [
          'Continuar ejecutando auditorías regularmente',
          'Mantener documentación actualizada',
          'Considerar automatización en CI/CD'
        ]
      });
    }
    
    return recommendations;
  }

  async generateAdditionalReports(results, reportData) {
    // Reporte solo de issues
    const issuesReportPath = path.join(this.outputDir, 'issues.json');
    writeFileSafe(issuesReportPath, JSON.stringify({
      issues: reportData.issues,
      summary: reportData.summary.issues,
      generatedAt: new Date().toISOString()
    }, null, 2));
    
    // Reporte de cobertura
    const coverageReportPath = path.join(this.outputDir, 'coverage.json');
    writeFileSafe(coverageReportPath, JSON.stringify({
      coverage: reportData.coverage,
      summary: reportData.summary,
      generatedAt: new Date().toISOString()
    }, null, 2));
    
    // Reporte de endpoints
    if (reportData.projects.backend) {
      const endpointsReportPath = path.join(this.outputDir, 'endpoints.json');
      writeFileSafe(endpointsReportPath, JSON.stringify({
        endpoints: reportData.projects.backend.endpoints,
        summary: {
          total: reportData.projects.backend.endpoints.length,
          used: reportData.projects.backend.endpoints.filter(e => e.used).length,
          unused: reportData.projects.backend.endpoints.filter(e => !e.used).length
        },
        generatedAt: new Date().toISOString()
      }, null, 2));
    }
  }

  async saveToHistory(reportData) {
    const historyDir = this.config.historyDir || '.audit-history';
    ensureDir(historyDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyFile = path.join(historyDir, `audit-${timestamp}.json`);
    
    writeFileSafe(historyFile, JSON.stringify(reportData, null, 2));
    
    // Mantener solo los últimos N archivos
    await this.cleanupHistory(historyDir);
  }

  async cleanupHistory(historyDir) {
    const maxFiles = this.config.maxHistoryFiles || 30;
    
    try {
      const files = fs.readdirSync(historyDir)
        .filter(file => file.startsWith('audit-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(historyDir, file),
          mtime: fs.statSync(path.join(historyDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      // Eliminar archivos excedentes
      if (files.length > maxFiles) {
        const filesToDelete = files.slice(maxFiles);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            console.warn(`No se pudo eliminar archivo histórico: ${file.name}`);
          }
        });
      }
    } catch (error) {
      console.warn('No se pudo limpiar historial de auditorías');
    }
  }

  generateIssueId() {
    return `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}