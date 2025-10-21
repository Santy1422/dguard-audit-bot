import { writeFileSafe, ensureDir } from '../utils/fileUtils.js';
import path from 'path';

export default class HTMLReporter {
  constructor(config = {}) {
    this.config = config;
    this.outputDir = config.outputDir || 'reports';
  }

  async generate(results) {
    ensureDir(this.outputDir);
    
    const html = this.generateHTML(results);
    const htmlPath = path.join(this.outputDir, 'audit-report.html');
    
    const success = writeFileSafe(htmlPath, html);
    
    if (!success) {
      throw new Error('No se pudo generar el reporte HTML');
    }
    
    return htmlPath;
  }

  generateHTML(results) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DGuard Audit Report</title>
  <style>
    ${this.getCSS()}
  </style>
</head>
<body>
  <div class="container">
    ${this.generateHeader(results)}
    ${this.generateSummaryCards(results)}
    ${this.generateIssuesSection(results)}
    ${this.generateEndpointsSection(results)}
    ${this.generateComponentsSection(results)}
    ${this.generateRecommendationsSection(results)}
  </div>
  
  <script>
    ${this.getJavaScript()}
  </script>
</body>
</html>`;
  }

  getCSS() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #333;
        line-height: 1.6;
      }
      
      .container {
        max-width: 1400px;
        margin: 0 auto;
        background: white;
        min-height: 100vh;
      }
      
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 40px;
        text-align: center;
      }
      
      .header h1 {
        font-size: 42px;
        margin-bottom: 10px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
      }
      
      .header .subtitle {
        font-size: 16px;
        opacity: 0.9;
      }
      
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        padding: 30px;
        background: #f8f9fa;
      }
      
      .summary-card {
        background: white;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        text-align: center;
        transition: transform 0.2s ease;
      }
      
      .summary-card:hover {
        transform: translateY(-3px);
      }
      
      .summary-card .number {
        font-size: 36px;
        font-weight: bold;
        margin: 10px 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      
      .summary-card .label {
        color: #6c757d;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 600;
      }
      
      .section {
        padding: 30px;
        border-bottom: 1px solid #e9ecef;
      }
      
      .section h2 {
        font-size: 24px;
        margin-bottom: 20px;
        color: #495057;
        border-left: 4px solid #667eea;
        padding-left: 15px;
      }
      
      .issues-grid {
        display: grid;
        gap: 15px;
      }
      
      .issue-card {
        background: white;
        border-left: 5px solid;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      
      .issue-card.critical {
        border-left-color: #dc3545;
        background: linear-gradient(to right, #fff5f5, white);
      }
      
      .issue-card.high {
        border-left-color: #fd7e14;
        background: linear-gradient(to right, #fffaf0, white);
      }
      
      .issue-card.medium {
        border-left-color: #ffc107;
        background: linear-gradient(to right, #fffef0, white);
      }
      
      .issue-card.low {
        border-left-color: #6c757d;
        background: linear-gradient(to right, #f8f9fa, white);
      }
      
      .issue-header {
        font-weight: bold;
        font-size: 16px;
        margin-bottom: 8px;
        color: #212529;
      }
      
      .issue-message {
        color: #495057;
        margin-bottom: 10px;
      }
      
      .issue-details {
        font-size: 13px;
        color: #6c757d;
      }
      
      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        margin: 2px;
      }
      
      .badge-critical { background: #dc3545; color: white; }
      .badge-high { background: #fd7e14; color: white; }
      .badge-medium { background: #ffc107; color: #000; }
      .badge-low { background: #6c757d; color: white; }
      
      .endpoint-card {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        margin: 10px 0;
        overflow: hidden;
      }
      
      .endpoint-header {
        background: #e9ecef;
        padding: 15px;
        border-bottom: 1px solid #dee2e6;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .endpoint-method {
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 4px;
        color: white;
        font-size: 12px;
      }
      
      .method-get { background: #28a745; }
      .method-post { background: #007bff; }
      .method-put { background: #ffc107; color: #000; }
      .method-patch { background: #6f42c1; }
      .method-delete { background: #dc3545; }
      
      .endpoint-path {
        font-family: 'Courier New', monospace;
        font-weight: bold;
        margin: 0 10px;
      }
      
      .endpoint-status {
        display: flex;
        gap: 5px;
        align-items: center;
      }
      
      .status-used {
        background: #28a745;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
      }
      
      .status-unused {
        background: #6c757d;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
      }
      
      .endpoint-details {
        padding: 15px;
        display: none;
      }
      
      .endpoint-card.expanded .endpoint-details {
        display: block;
      }
      
      .tabs {
        display: flex;
        border-bottom: 1px solid #dee2e6;
        margin-bottom: 20px;
      }
      
      .tab {
        padding: 10px 20px;
        background: none;
        border: none;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
      }
      
      .tab.active {
        border-bottom-color: #667eea;
        color: #667eea;
        font-weight: bold;
      }
      
      .tab-content {
        display: none;
      }
      
      .tab-content.active {
        display: block;
      }
      
      .progress-bar {
        background: #e9ecef;
        border-radius: 10px;
        height: 8px;
        overflow: hidden;
        margin: 5px 0;
      }
      
      .progress-fill {
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        transition: width 0.3s ease;
      }
      
      code {
        background: #f8f9fa;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        color: #495057;
      }
      
      .clickable {
        cursor: pointer;
      }
      
      .clickable:hover {
        opacity: 0.8;
      }
      
      .recommendations {
        background: #f8f9fa;
      }
      
      .recommendation-card {
        background: white;
        border-radius: 8px;
        padding: 20px;
        margin: 10px 0;
        border-left: 4px solid #28a745;
      }
      
      .recommendation-card.urgent {
        border-left-color: #dc3545;
      }
      
      .recommendation-card.high {
        border-left-color: #fd7e14;
      }
      
      .recommendation-card.medium {
        border-left-color: #ffc107;
      }
    `;
  }

  generateHeader(results) {
    const timestamp = new Date(results.metadata.timestamp).toLocaleString('es-ES');
    
    return `
      <div class="header">
        <h1>🔍 DGuard Audit Report</h1>
        <div class="subtitle">Generado: ${timestamp}</div>
      </div>
    `;
  }

  generateSummaryCards(results) {
    const summary = results.summary;
    
    return `
      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">Endpoints Backend</div>
          <div class="number">${summary.backend.endpoints}</div>
        </div>
        
        <div class="summary-card">
          <div class="label">Llamadas API</div>
          <div class="number">${summary.frontend.apiCalls}</div>
        </div>
        
        <div class="summary-card">
          <div class="label">Componentes Frontend</div>
          <div class="number">${summary.frontend.components}</div>
        </div>
        
        <div class="summary-card">
          <div class="label">Design System</div>
          <div class="number">${summary.designSystem.components}</div>
        </div>
        
        <div class="summary-card">
          <div class="label">🔴 Críticos</div>
          <div class="number" style="color: #dc3545;">${summary.issues.critical}</div>
        </div>
        
        <div class="summary-card">
          <div class="label">🟠 Altos</div>
          <div class="number" style="color: #fd7e14;">${summary.issues.high}</div>
        </div>
        
        <div class="summary-card">
          <div class="label">🟡 Medios</div>
          <div class="number" style="color: #ffc107;">${summary.issues.medium}</div>
        </div>
        
        <div class="summary-card">
          <div class="label">Total Issues</div>
          <div class="number">${summary.issues.total}</div>
        </div>
      </div>
    `;
  }

  generateIssuesSection(results) {
    if (results.issues.length === 0) {
      return `
        <div class="section">
          <h2>✅ Sin Issues Detectados</h2>
          <p>¡Excelente! No se encontraron issues en la auditoría.</p>
        </div>
      `;
    }
    
    const critical = results.issues.filter(i => i.severity === 'CRITICAL');
    const high = results.issues.filter(i => i.severity === 'HIGH');
    const medium = results.issues.filter(i => i.severity === 'MEDIUM');
    const low = results.issues.filter(i => i.severity === 'LOW');
    
    return `
      <div class="section">
        <h2>🚨 Issues Detectados</h2>
        
        <div class="tabs">
          <button class="tab active" onclick="showTab('critical')">Críticos (${critical.length})</button>
          <button class="tab" onclick="showTab('high')">Altos (${high.length})</button>
          <button class="tab" onclick="showTab('medium')">Medios (${medium.length})</button>
          <button class="tab" onclick="showTab('low')">Bajos (${low.length})</button>
        </div>
        
        <div id="critical" class="tab-content active">
          ${this.generateIssuesList(critical, 'critical')}
        </div>
        
        <div id="high" class="tab-content">
          ${this.generateIssuesList(high, 'high')}
        </div>
        
        <div id="medium" class="tab-content">
          ${this.generateIssuesList(medium, 'medium')}
        </div>
        
        <div id="low" class="tab-content">
          ${this.generateIssuesList(low, 'low')}
        </div>
      </div>
    `;
  }

  generateIssuesList(issues, severity) {
    if (issues.length === 0) {
      return `<p>No hay issues de severidad ${severity}.</p>`;
    }
    
    return `
      <div class="issues-grid">
        ${issues.slice(0, 50).map(issue => `
          <div class="issue-card ${severity}">
            <div class="issue-header">
              <span class="badge badge-${severity}">${issue.severity}</span>
              ${issue.type}
            </div>
            <div class="issue-message">${issue.message}</div>
            <div class="issue-details">
              ${issue.endpoint ? `<div><strong>Endpoint:</strong> <code>${issue.endpoint}</code></div>` : ''}
              ${issue.frontend ? `<div><strong>Frontend:</strong> ${issue.frontend}</div>` : ''}
              ${issue.backend ? `<div><strong>Backend:</strong> ${issue.backend}</div>` : ''}
              ${issue.line ? `<div><strong>Línea:</strong> ${issue.line}</div>` : ''}
            </div>
          </div>
        `).join('')}
        
        ${issues.length > 50 ? `<p><em>... y ${issues.length - 50} issues más</em></p>` : ''}
      </div>
    `;
  }

  generateEndpointsSection(results) {
    if (!results.backend?.endpoints) {
      return '';
    }
    
    const endpoints = Array.from(results.backend.endpoints.entries());
    const used = endpoints.filter(([,e]) => e.used);
    const unused = endpoints.filter(([,e]) => !e.used);
    
    return `
      <div class="section">
        <h2>📋 Endpoints Backend</h2>
        
        <div class="tabs">
          <button class="tab active" onclick="showTab('endpoints-all')">Todos (${endpoints.length})</button>
          <button class="tab" onclick="showTab('endpoints-used')">Usados (${used.length})</button>
          <button class="tab" onclick="showTab('endpoints-unused')">Sin uso (${unused.length})</button>
        </div>
        
        <div id="endpoints-all" class="tab-content active">
          ${this.generateEndpointsList(endpoints)}
        </div>
        
        <div id="endpoints-used" class="tab-content">
          ${this.generateEndpointsList(used)}
        </div>
        
        <div id="endpoints-unused" class="tab-content">
          ${this.generateEndpointsList(unused)}
        </div>
      </div>
    `;
  }

  generateEndpointsList(endpoints) {
    return endpoints.slice(0, 100).map(([key, endpoint]) => `
      <div class="endpoint-card clickable" onclick="toggleEndpoint(this)">
        <div class="endpoint-header">
          <div style="display: flex; align-items: center;">
            <span class="endpoint-method method-${endpoint.method.toLowerCase()}">${endpoint.method}</span>
            <span class="endpoint-path">${endpoint.path}</span>
          </div>
          <div class="endpoint-status">
            ${endpoint.requiresAuth ? '🔒' : '🔓'}
            <span class="${endpoint.used ? 'status-used' : 'status-unused'}">
              ${endpoint.used ? 'USADO' : 'SIN USO'}
            </span>
          </div>
        </div>
        <div class="endpoint-details">
          <p><strong>Archivo:</strong> <code>${endpoint.file}</code></p>
          ${endpoint.controller ? `<p><strong>Controlador:</strong> ${endpoint.controller}</p>` : ''}
          ${endpoint.middleware.length > 0 ? `<p><strong>Middleware:</strong> ${endpoint.middleware.join(', ')}</p>` : ''}
          ${endpoint.params.length > 0 ? `<p><strong>Parámetros:</strong> ${endpoint.params.map(p => `<code>:${p}</code>`).join(', ')}</p>` : ''}
          ${endpoint.description ? `<p><strong>Descripción:</strong> ${endpoint.description}</p>` : ''}
        </div>
      </div>
    `).join('');
  }

  generateComponentsSection(results) {
    if (!results.designSystem?.components) {
      return '';
    }
    
    const components = Array.from(results.designSystem.components.entries());
    const used = components.filter(([,c]) => c.used);
    const unused = components.filter(([,c]) => !c.used);
    
    return `
      <div class="section">
        <h2>🧩 Componentes Design System</h2>
        
        <div class="tabs">
          <button class="tab active" onclick="showTab('components-all')">Todos (${components.length})</button>
          <button class="tab" onclick="showTab('components-used')">Usados (${used.length})</button>
          <button class="tab" onclick="showTab('components-unused')">Sin uso (${unused.length})</button>
        </div>
        
        <div id="components-all" class="tab-content active">
          ${this.generateComponentsList(components)}
        </div>
        
        <div id="components-used" class="tab-content">
          ${this.generateComponentsList(used)}
        </div>
        
        <div id="components-unused" class="tab-content">
          ${this.generateComponentsList(unused)}
        </div>
      </div>
    `;
  }

  generateComponentsList(components) {
    return components.slice(0, 50).map(([name, component]) => `
      <div class="endpoint-card">
        <div class="endpoint-header">
          <div style="display: flex; align-items: center;">
            <strong>${name}</strong>
            <span style="margin-left: 10px; font-size: 12px; color: #6c757d;">${component.category || 'misc'}</span>
          </div>
          <div class="endpoint-status">
            ${component.hasTests ? '🧪' : ''}
            ${component.hasStories ? '📚' : ''}
            <span class="${component.used ? 'status-used' : 'status-unused'}">
              ${component.used ? 'USADO' : 'SIN USO'}
            </span>
          </div>
        </div>
        <div style="padding: 15px;">
          <p><strong>Archivo:</strong> <code>${component.file}</code></p>
          ${component.description ? `<p><strong>Descripción:</strong> ${component.description}</p>` : ''}
          ${component.props?.length > 0 ? `<p><strong>Props:</strong> ${component.props.map(p => `<code>${p.name}</code>`).join(', ')}</p>` : ''}
          ${component.used && component.usedIn?.length > 0 ? `<p><strong>Usado en:</strong> ${component.usedIn.length} archivo(s)</p>` : ''}
        </div>
      </div>
    `).join('');
  }

  generateRecommendationsSection(results) {
    // Generar recomendaciones basadas en los resultados
    const recommendations = [];
    
    if (results.summary.issues.critical > 0) {
      recommendations.push({
        priority: 'urgent',
        title: 'Resolver issues críticos inmediatamente',
        description: `Se encontraron ${results.summary.issues.critical} issues críticos que requieren atención inmediata.`,
        actions: ['Revisar endpoints faltantes', 'Implementar autenticación', 'Verificar funcionalidad']
      });
    }
    
    if (results.summary.coverage?.endpoints < 70) {
      recommendations.push({
        priority: 'medium',
        title: 'Mejorar cobertura de endpoints',
        description: `Solo ${results.summary.coverage.endpoints}% de endpoints están siendo utilizados.`,
        actions: ['Revisar endpoints obsoletos', 'Documentar APIs', 'Considerar deprecación']
      });
    }
    
    return `
      <div class="section recommendations">
        <h2>💡 Recomendaciones</h2>
        ${recommendations.map(rec => `
          <div class="recommendation-card ${rec.priority}">
            <h3>${rec.title}</h3>
            <p>${rec.description}</p>
            <ul>
              ${rec.actions.map(action => `<li>${action}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
        
        ${recommendations.length === 0 ? '<p>¡Excelente! No hay recomendaciones específicas en este momento.</p>' : ''}
      </div>
    `;
  }

  getJavaScript() {
    return `
      function showTab(tabId) {
        // Ocultar todos los tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
          tab.classList.remove('active');
        });
        
        // Remover active de todos los tabs
        document.querySelectorAll('.tab').forEach(tab => {
          tab.classList.remove('active');
        });
        
        // Mostrar el tab seleccionado
        document.getElementById(tabId).classList.add('active');
        
        // Activar el tab clickeado
        event.target.classList.add('active');
      }
      
      function toggleEndpoint(element) {
        element.classList.toggle('expanded');
      }
      
      // Animaciones y efectos
      document.addEventListener('DOMContentLoaded', function() {
        // Animar números
        document.querySelectorAll('.number').forEach(numberEl => {
          const finalNumber = parseInt(numberEl.textContent);
          let currentNumber = 0;
          const increment = Math.ceil(finalNumber / 30);
          
          const timer = setInterval(() => {
            currentNumber += increment;
            if (currentNumber >= finalNumber) {
              currentNumber = finalNumber;
              clearInterval(timer);
            }
            numberEl.textContent = currentNumber;
          }, 50);
        });
        
        // Animar barras de progreso
        setTimeout(() => {
          document.querySelectorAll('.progress-fill').forEach(bar => {
            const width = bar.dataset.width || '0%';
            bar.style.width = width;
          });
        }, 500);
      });
    `;
  }
}