import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

// Importar analizadores
import BackendAnalyzer from './analyzers/BackendAnalyzer.js';
import FrontendAnalyzer from './analyzers/FrontendAnalyzer.js';
import DesignSystemAnalyzer from './analyzers/DesignSystemAnalyzer.js';

// Importar validadores
import EndpointValidator from './validators/EndpointValidator.js';
import SecurityValidator from './validators/SecurityValidator.js';
import ComponentValidator from './validators/ComponentValidator.js';

// Importar reporteadores
import JSONReporter from './reporters/JSONReporter.js';
import HTMLReporter from './reporters/HTMLReporter.js';
import MarkdownReporter from './reporters/MarkdownReporter.js';
import ConsoleReporter from './reporters/ConsoleReporter.js';

// Importar utilidades avanzadas
import CacheManager from './utils/CacheManager.js';
import OptimizationSuggester from './ai/OptimizationSuggester.js';
import RepositoryManager from './github/RepositoryManager.js';

export default class AuditBot {
  constructor(config, options = {}) {
    this.config = config;
    this.options = options;
    
    // Inicializar analizadores
    this.analyzers = {};
    if (!options.noBackend && this.config.projects.backend?.path) {
      this.analyzers.backend = new BackendAnalyzer(
        this.config.projects.backend, 
        this.config.audit
      );
    }
    
    if (!options.noFrontend && this.config.projects.frontend?.path) {
      this.analyzers.frontend = new FrontendAnalyzer(
        this.config.projects.frontend, 
        this.config.audit
      );
    }
    
    if (!options.noDesignSystem && this.config.projects.designSystem?.path) {
      this.analyzers.designSystem = new DesignSystemAnalyzer(
        this.config.projects.designSystem, 
        this.config.audit
      );
    }
    
    // Inicializar validadores
    this.validators = {
      endpoint: new EndpointValidator(this.config.rules),
      security: new SecurityValidator(this.config.rules),
      component: new ComponentValidator(this.config.rules)
    };
    
    // Inicializar reporteadores
    this.reporters = {
      json: new JSONReporter(this.config.reports),
      html: new HTMLReporter(this.config.reports),
      markdown: new MarkdownReporter(this.config.reports),
      console: new ConsoleReporter(this.config.reports, options)
    };
    
    // Resultados iniciales
    this.results = {
      backend: null,
      frontend: null,
      designSystem: null,
      issues: [],
      validations: [],
      summary: null,
      performance: {},
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        config: this.config,
        options: this.options
      }
    };
  }

  async run() {
    const startTime = performance.now();
    
    try {
      this.log('info', '🚀 Iniciando auditoría...');
      
      // Fase 1: Análisis de proyectos
      await this.analyzeProjects();
      
      // Fase 2: Validaciones cruzadas
      await this.performValidations();
      
      // Fase 3: Generar resumen y métricas
      this.generateSummary();
      
      // Calcular tiempo total
      const endTime = performance.now();
      this.results.performance.totalDuration = ((endTime - startTime) / 1000).toFixed(2);
      
      this.log('info', `✅ Auditoría completada en ${this.results.performance.totalDuration}s`);
      
      return this.results;
      
    } catch (error) {
      this.log('error', `❌ Error durante la auditoría: ${error.message}`);
      throw error;
    }
  }

  async analyzeProjects() {
    const analysisStart = performance.now();
    
    // Análisis del Backend
    if (this.analyzers.backend) {
      this.log('info', '📦 Analizando Backend...');
      const backendStart = performance.now();
      
      try {
        this.results.backend = await this.analyzers.backend.analyze();
        const backendTime = ((performance.now() - backendStart) / 1000).toFixed(2);
        this.results.performance.backendAnalysis = backendTime;
        
        this.log('info', `   ✓ Backend: ${this.results.backend.endpoints.size} endpoints en ${backendTime}s`);
      } catch (error) {
        this.log('error', `   ❌ Error analizando backend: ${error.message}`);
        this.addIssue({
          type: 'BACKEND_ANALYSIS_FAILED',
          severity: 'CRITICAL',
          message: `No se pudo analizar el backend: ${error.message}`,
          file: this.config.projects.backend.path
        });
      }
    }
    
    // Análisis del Frontend
    if (this.analyzers.frontend) {
      this.log('info', '🎨 Analizando Frontend...');
      const frontendStart = performance.now();
      
      try {
        this.results.frontend = await this.analyzers.frontend.analyze();
        const frontendTime = ((performance.now() - frontendStart) / 1000).toFixed(2);
        this.results.performance.frontendAnalysis = frontendTime;
        
        this.log('info', `   ✓ Frontend: ${this.results.frontend.apiCalls.size} llamadas API en ${frontendTime}s`);
      } catch (error) {
        this.log('error', `   ❌ Error analizando frontend: ${error.message}`);
        this.addIssue({
          type: 'FRONTEND_ANALYSIS_FAILED',
          severity: 'CRITICAL',
          message: `No se pudo analizar el frontend: ${error.message}`,
          file: this.config.projects.frontend.path
        });
      }
    }
    
    // Análisis del Design System
    if (this.analyzers.designSystem) {
      this.log('info', '🧩 Analizando Design System...');
      const dsStart = performance.now();
      
      try {
        this.results.designSystem = await this.analyzers.designSystem.analyze();
        const dsTime = ((performance.now() - dsStart) / 1000).toFixed(2);
        this.results.performance.designSystemAnalysis = dsTime;
        
        this.log('info', `   ✓ Design System: ${this.results.designSystem.components.size} componentes en ${dsTime}s`);
      } catch (error) {
        this.log('error', `   ❌ Error analizando design system: ${error.message}`);
        this.addIssue({
          type: 'DESIGN_SYSTEM_ANALYSIS_FAILED',
          severity: 'HIGH',
          message: `No se pudo analizar el design system: ${error.message}`,
          file: this.config.projects.designSystem.path
        });
      }
    }
    
    const analysisTime = ((performance.now() - analysisStart) / 1000).toFixed(2);
    this.results.performance.totalAnalysis = analysisTime;
  }

  async performValidations() {
    const validationStart = performance.now();
    this.log('info', '🔍 Ejecutando validaciones...');
    
    // Validación de Endpoints
    if (this.results.backend && this.results.frontend) {
      this.log('info', '   → Validando endpoints...');
      try {
        const endpointIssues = await this.validators.endpoint.validate(
          this.results.backend.endpoints,
          this.results.frontend.apiCalls
        );
        this.results.issues.push(...endpointIssues);
        this.log('info', `   ✓ ${endpointIssues.length} issues de endpoints detectados`);
      } catch (error) {
        this.log('error', `   ❌ Error validando endpoints: ${error.message}`);
      }
    }
    
    // Validación de Seguridad
    if (this.results.backend && this.results.frontend) {
      this.log('info', '   → Validando seguridad...');
      try {
        const securityIssues = await this.validators.security.validate(
          this.results.backend.endpoints,
          this.results.frontend.apiCalls
        );
        this.results.issues.push(...securityIssues);
        this.log('info', `   ✓ ${securityIssues.length} issues de seguridad detectados`);
      } catch (error) {
        this.log('error', `   ❌ Error validando seguridad: ${error.message}`);
      }
    }
    
    // Validación de Componentes
    if (this.results.designSystem && this.results.frontend) {
      this.log('info', '   → Validando componentes...');
      try {
        const componentIssues = await this.validators.component.validate(
          this.results.designSystem.components,
          this.results.frontend.components
        );
        this.results.issues.push(...componentIssues);
        this.log('info', `   ✓ ${componentIssues.length} issues de componentes detectados`);
      } catch (error) {
        this.log('error', `   ❌ Error validando componentes: ${error.message}`);
      }
    }
    
    const validationTime = ((performance.now() - validationStart) / 1000).toFixed(2);
    this.results.performance.totalValidation = validationTime;
    
    this.log('info', `   ✓ Validaciones completadas en ${validationTime}s`);
  }

  generateSummary() {
    this.log('info', '📊 Generando resumen...');
    
    const issues = this.results.issues;
    
    this.results.summary = {
      backend: {
        analyzed: !!this.results.backend,
        endpoints: this.results.backend?.endpoints.size || 0,
        files: this.results.backend?.files?.length || 0,
        models: this.results.backend?.models?.length || 0,
        routes: this.results.backend?.routes?.length || 0
      },
      frontend: {
        analyzed: !!this.results.frontend,
        files: this.results.frontend?.files?.length || 0,
        components: this.results.frontend?.components?.size || 0,
        pages: this.results.frontend?.pages?.length || 0,
        apiCalls: this.results.frontend?.apiCalls?.size || 0,
        services: this.results.frontend?.services?.length || 0
      },
      designSystem: {
        analyzed: !!this.results.designSystem,
        components: this.results.designSystem?.components?.size || 0,
        used: this.calculateUsedComponents(),
        unused: this.calculateUnusedComponents()
      },
      issues: {
        total: issues.length,
        critical: issues.filter(i => i.severity === 'CRITICAL').length,
        high: issues.filter(i => i.severity === 'HIGH').length,
        medium: issues.filter(i => i.severity === 'MEDIUM').length,
        low: issues.filter(i => i.severity === 'LOW').length
      },
      coverage: this.calculateCoverage(),
      trends: this.calculateTrends()
    };
  }

  calculateUsedComponents() {
    if (!this.results.designSystem) return 0;
    return Array.from(this.results.designSystem.components.values())
      .filter(c => c.used).length;
  }

  calculateUnusedComponents() {
    if (!this.results.designSystem) return 0;
    return Array.from(this.results.designSystem.components.values())
      .filter(c => !c.used).length;
  }

  calculateCoverage() {
    const coverage = {};
    
    // Cobertura de endpoints (cuántos endpoints son llamados por el frontend)
    if (this.results.backend && this.results.frontend) {
      const totalEndpoints = this.results.backend.endpoints.size;
      const usedEndpoints = Array.from(this.results.backend.endpoints.values())
        .filter(e => e.used).length;
      
      coverage.endpoints = totalEndpoints > 0 
        ? ((usedEndpoints / totalEndpoints) * 100).toFixed(1)
        : 0;
    }
    
    // Cobertura de componentes (cuántos componentes del DS son usados)
    if (this.results.designSystem) {
      const totalComponents = this.results.designSystem.components.size;
      const usedComponents = this.calculateUsedComponents();
      
      coverage.components = totalComponents > 0 
        ? ((usedComponents / totalComponents) * 100).toFixed(1)
        : 0;
    }
    
    return coverage;
  }

  calculateTrends() {
    // Aquí se podría implementar comparación con auditorías previas
    // Por ahora retorna estructura básica
    return {
      issuesChange: 0,
      coverageChange: 0,
      newEndpoints: 0,
      removedEndpoints: 0
    };
  }

  addIssue(issue) {
    // Validar y normalizar issue
    const normalizedIssue = {
      id: this.generateIssueId(),
      timestamp: new Date().toISOString(),
      type: issue.type || 'UNKNOWN',
      severity: issue.severity || 'MEDIUM',
      message: issue.message || 'Issue sin descripción',
      file: issue.file || null,
      line: issue.line || null,
      endpoint: issue.endpoint || null,
      component: issue.component || null,
      details: issue.details || {},
      suggestions: issue.suggestions || []
    };
    
    this.results.issues.push(normalizedIssue);
  }

  generateIssueId() {
    return `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  log(level, message) {
    const logLevel = this.config.logging?.level || 'info';
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    
    if (levels[level] <= levels[logLevel]) {
      switch (level) {
        case 'error':
          console.error(chalk.red(message));
          break;
        case 'warn':
          console.warn(chalk.yellow(message));
          break;
        case 'info':
          if (!this.options.quiet) console.log(message);
          break;
        case 'debug':
          if (this.options.verbose) console.log(chalk.gray(message));
          break;
      }
    }
  }

  // Métodos de utilidad
  getStats() {
    return {
      totalIssues: this.results.issues.length,
      criticalIssues: this.results.issues.filter(i => i.severity === 'CRITICAL').length,
      analyzedProjects: Object.keys(this.analyzers).length,
      duration: this.results.performance.totalDuration
    };
  }

  hasFailures() {
    return this.results.issues.some(i => i.severity === 'CRITICAL');
  }

  getIssuesByType() {
    const byType = {};
    this.results.issues.forEach(issue => {
      byType[issue.type] = (byType[issue.type] || 0) + 1;
    });
    return byType;
  }

  getIssuesBySeverity() {
    const bySeverity = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };
    
    this.results.issues.forEach(issue => {
      if (bySeverity[issue.severity]) {
        bySeverity[issue.severity].push(issue);
      }
    });
    
    return bySeverity;
  }
}