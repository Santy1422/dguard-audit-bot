import { writeFileSafe, ensureDir } from '../utils/fileUtils.js';
import path from 'path';

export default class MarkdownReporter {
  constructor(config = {}) {
    this.config = config;
    this.outputDir = config.outputDir || 'reports';
  }

  async generate(results) {
    ensureDir(this.outputDir);
    
    const markdown = this.generateMarkdown(results);
    const mdPath = path.join(this.outputDir, 'audit-report.md');
    
    const success = writeFileSafe(mdPath, markdown);
    
    if (!success) {
      throw new Error('No se pudo generar el reporte Markdown');
    }
    
    return mdPath;
  }

  generateMarkdown(results) {
    const sections = [
      this.generateHeader(results),
      this.generateSummary(results),
      this.generateIssues(results),
      this.generateEndpoints(results),
      this.generateComponents(results),
      this.generateRecommendations(results),
      this.generateFooter(results)
    ];
    
    return sections.join('\\n\\n');
  }

  generateHeader(results) {
    const timestamp = new Date(results.metadata.timestamp).toLocaleString('es-ES');
    
    return `# 🔍 DGuard Audit Report

**Generado:** ${timestamp}  
**Duración:** ${results.performance.totalDuration || 'N/A'}s  
**Versión:** ${results.metadata.version || '1.0.0'}

---`;
  }

  generateSummary(results) {
    const summary = results.summary;
    const coverage = results.summary.coverage || {};
    
    return `## 📊 Resumen Ejecutivo

### Proyectos Analizados

| Categoría | Valor |
|-----------|-------|
| **Backend** | |
| Endpoints | ${summary.backend.endpoints} |
| Archivos | ${summary.backend.files} |
| Modelos | ${summary.backend.models} |
| **Frontend** | |
| Archivos | ${summary.frontend.files} |
| Componentes | ${summary.frontend.components} |
| Páginas | ${summary.frontend.pages} |
| Llamadas API | ${summary.frontend.apiCalls} |
| **Design System** | |
| Componentes | ${summary.designSystem.components} |
| Usados | ${summary.designSystem.used} |
| Sin uso | ${summary.designSystem.unused} |

### Issues Detectados

| Severidad | Cantidad | Porcentaje |
|-----------|----------|------------|
| 🔴 **Críticos** | **${summary.issues.critical}** | ${this.getPercentage(summary.issues.critical, summary.issues.total)}% |
| 🟠 **Altos** | **${summary.issues.high}** | ${this.getPercentage(summary.issues.high, summary.issues.total)}% |
| 🟡 Medios | ${summary.issues.medium} | ${this.getPercentage(summary.issues.medium, summary.issues.total)}% |
| ⚪ Bajos | ${summary.issues.low} | ${this.getPercentage(summary.issues.low, summary.issues.total)}% |
| **TOTAL** | **${summary.issues.total}** | 100% |

### Cobertura

| Métrica | Cobertura |
|---------|-----------|
| Endpoints usados | ${coverage.endpoints || 'N/A'}% |
| Componentes DS usados | ${coverage.components || 'N/A'}% |

${this.generateHealthStatus(summary)}`;
  }

  generateHealthStatus(summary) {
    const { critical, high, total } = summary.issues;
    
    if (total === 0) {
      return `### 🟢 Estado: EXCELENTE
> ✅ No se encontraron issues. El proyecto está perfectamente sincronizado.`;
    } else if (critical > 0) {
      return `### 🔴 Estado: CRÍTICO
> ⚠️ **${critical} issues críticos** requieren atención inmediata.`;
    } else if (high > 0) {
      return `### 🟠 Estado: ATENCIÓN REQUERIDA
> ⚠️ **${high} issues altos** necesitan ser resueltos pronto.`;
    } else {
      return `### 🟡 Estado: BUENO
> ℹ️ Solo issues menores detectados. El proyecto está en buen estado.`;
    }
  }

  generateIssues(results) {
    if (results.issues.length === 0) {
      return `## ✅ Issues
      
**¡Excelente!** No se encontraron issues en la auditoría.`;
    }
    
    const critical = results.issues.filter(i => i.severity === 'CRITICAL');
    const high = results.issues.filter(i => i.severity === 'HIGH');
    const medium = results.issues.filter(i => i.severity === 'MEDIUM');
    const low = results.issues.filter(i => i.severity === 'LOW');
    
    let content = `## 🚨 Issues Detectados`;
    
    if (critical.length > 0) {
      content += `\\n\\n### 🔴 Issues Críticos (${critical.length})\\n\\n`;
      content += this.generateIssuesList(critical, true);
    }
    
    if (high.length > 0) {
      content += `\\n\\n### 🟠 Issues Altos (${high.length})\\n\\n`;
      content += this.generateIssuesList(high, this.config.includeDetails);
    }
    
    if (medium.length > 0 && this.config.includeDetails) {
      content += `\\n\\n### 🟡 Issues Medios (${medium.length})\\n\\n`;
      content += this.generateIssuesList(medium.slice(0, 20));
      
      if (medium.length > 20) {
        content += `\\n\\n> ... y ${medium.length - 20} issues medios adicionales`;
      }
    }
    
    if (low.length > 0 && this.config.includeDetails) {
      content += `\\n\\n<details>\\n<summary>🟡 Issues Bajos (${low.length}) - Click para expandir</summary>\\n\\n`;
      content += this.generateIssuesList(low.slice(0, 10));
      
      if (low.length > 10) {
        content += `\\n\\n> ... y ${low.length - 10} issues bajos adicionales`;
      }
      
      content += `\\n\\n</details>`;
    }
    
    return content;
  }

  generateIssuesList(issues, detailed = false) {
    return issues.map((issue, index) => {
      let content = `#### ${index + 1}. ${issue.type}\\n\\n`;
      content += `**Mensaje:** ${issue.message}\\n\\n`;
      
      if (detailed) {
        if (issue.endpoint) {
          content += `- **Endpoint:** \`${issue.endpoint}\`\\n`;
        }
        if (issue.frontend) {
          content += `- **Frontend:** \`${issue.frontend}\`\\n`;
        }
        if (issue.backend) {
          content += `- **Backend:** \`${issue.backend}\`\\n`;
        }
        if (issue.line) {
          content += `- **Línea:** ${issue.line}\\n`;
        }
        if (issue.component) {
          content += `- **Componente:** \`${issue.component}\`\\n`;
        }
        
        // Sugerencias
        if (issue.suggestions && issue.suggestions.length > 0) {
          content += `\\n**Sugerencias:**\\n`;
          issue.suggestions.forEach(suggestion => {
            content += `- ${suggestion}\\n`;
          });
        }
        
        content += `\\n---\\n`;
      }
      
      return content;
    }).join('\\n');
  }

  generateEndpoints(results) {
    if (!results.backend?.endpoints || results.backend.endpoints.size === 0) {
      return `## 📋 Endpoints Backend

No se encontraron endpoints en el backend.`;
    }
    
    const endpoints = Array.from(results.backend.endpoints.entries());
    const used = endpoints.filter(([,e]) => e.used);
    const unused = endpoints.filter(([,e]) => !e.used);
    const withAuth = endpoints.filter(([,e]) => e.requiresAuth);
    
    let content = `## 📋 Endpoints Backend

### Estadísticas

- **Total:** ${endpoints.length} endpoints
- **Usados:** ${used.length} (${this.getPercentage(used.length, endpoints.length)}%)
- **Sin uso:** ${unused.length} (${this.getPercentage(unused.length, endpoints.length)}%)
- **Con autenticación:** ${withAuth.length} (${this.getPercentage(withAuth.length, endpoints.length)}%)`;
    
    // Tabla de endpoints más usados
    if (used.length > 0) {
      content += `\\n\\n### 🔥 Endpoints Más Utilizados\\n\\n`;
      content += `| Método | Endpoint | Archivo | Auth | Uso |\\n`;
      content += `|--------|----------|---------|------|-----|\\n`;
      
      used.slice(0, 20).forEach(([key, endpoint]) => {
        const authIcon = endpoint.requiresAuth ? '🔒' : '🔓';
        const usageIcon = '✅';
        content += `| \`${endpoint.method}\` | \`${endpoint.path}\` | \`${endpoint.file}\` | ${authIcon} | ${usageIcon} |\\n`;
      });
    }
    
    // Endpoints sin uso
    if (unused.length > 0) {
      content += `\\n\\n### ⚠️ Endpoints Sin Uso\\n\\n`;
      
      if (unused.length <= 10) {
        content += `| Método | Endpoint | Archivo |\\n`;
        content += `|--------|----------|---------|\\n`;
        
        unused.forEach(([key, endpoint]) => {
          content += `| \`${endpoint.method}\` | \`${endpoint.path}\` | \`${endpoint.file}\` |\\n`;
        });
      } else {
        content += `Se encontraron **${unused.length} endpoints sin uso**. Los primeros 10 son:\\n\\n`;
        content += `| Método | Endpoint | Archivo |\\n`;
        content += `|--------|----------|---------|\\n`;
        
        unused.slice(0, 10).forEach(([key, endpoint]) => {
          content += `| \`${endpoint.method}\` | \`${endpoint.path}\` | \`${endpoint.file}\` |\\n`;
        });
        
        content += `\\n> ... y ${unused.length - 10} endpoints adicionales sin uso.`;
      }
    }
    
    return content;
  }

  generateComponents(results) {
    if (!results.designSystem?.components || results.designSystem.components.size === 0) {
      return `## 🧩 Design System

No se encontraron componentes del design system.`;
    }
    
    const components = Array.from(results.designSystem.components.entries());
    const used = components.filter(([,c]) => c.used);
    const unused = components.filter(([,c]) => !c.used);
    
    // Agrupar por categoría
    const byCategory = {};
    components.forEach(([name, component]) => {
      const category = component.category || 'misc';
      if (!byCategory[category]) {
        byCategory[category] = { total: 0, used: 0, components: [] };
      }
      byCategory[category].total++;
      byCategory[category].components.push([name, component]);
      if (component.used) {
        byCategory[category].used++;
      }
    });
    
    let content = `## 🧩 Design System

### Estadísticas

- **Total:** ${components.length} componentes
- **Usados:** ${used.length} (${this.getPercentage(used.length, components.length)}%)
- **Sin uso:** ${unused.length} (${this.getPercentage(unused.length, components.length)}%)

### Por Categoría

| Categoría | Total | Usados | Cobertura |
|-----------|-------|--------|-----------|`;
    
    Object.entries(byCategory).forEach(([category, data]) => {
      const coverage = this.getPercentage(data.used, data.total);
      content += `\\n| ${this.formatCategoryName(category)} | ${data.total} | ${data.used} | ${coverage}% |`;
    });
    
    // Componentes más usados
    if (used.length > 0) {
      content += `\\n\\n### 🎨 Componentes Más Utilizados\\n\\n`;
      
      used.slice(0, 15).forEach(([name, component]) => {
        const usageCount = component.usedIn ? component.usedIn.length : 0;
        content += `- **${name}** (${component.category || 'misc'}) - Usado en ${usageCount} archivo(s)\\n`;
      });
    }
    
    // Componentes sin uso
    if (unused.length > 0) {
      content += `\\n\\n### 💤 Componentes Sin Uso\\n\\n`;
      
      if (unused.length <= 20) {
        unused.forEach(([name, component]) => {
          content += `- **${name}** (${component.category || 'misc'}) - \`${component.file}\`\\n`;
        });
      } else {
        content += `Se encontraron **${unused.length} componentes sin uso**:\\n\\n`;
        
        unused.slice(0, 20).forEach(([name, component]) => {
          content += `- **${name}** (${component.category || 'misc'})\\n`;
        });
        
        content += `\\n> ... y ${unused.length - 20} componentes adicionales sin uso.`;
      }
    }
    
    return content;
  }

  generateRecommendations(results) {
    const recommendations = [];
    const { critical, high, medium, total } = results.summary.issues;
    const coverage = results.summary.coverage || {};
    
    // Recomendaciones basadas en issues
    if (critical > 0) {
      recommendations.push({
        priority: '🚨 URGENTE',
        title: 'Resolver Issues Críticos',
        description: `Se detectaron **${critical} issues críticos** que requieren atención inmediata.`,
        actions: [
          'Revisar endpoints faltantes en el backend',
          'Implementar autenticación en endpoints sensibles',
          'Verificar que la funcionalidad principal no esté afectada'
        ]
      });
    }
    
    if (high > 0) {
      recommendations.push({
        priority: '⚠️ IMPORTANTE',
        title: 'Atender Issues de Alta Prioridad',
        description: `${high} issues de alta prioridad necesitan ser resueltos pronto.`,
        actions: [
          'Implementar headers de autenticación faltantes',
          'Validar parámetros requeridos en las APIs',
          'Revisar y corregir validaciones de entrada'
        ]
      });
    }
    
    // Recomendaciones de cobertura
    if (parseFloat(coverage.endpoints || 0) < 70) {
      recommendations.push({
        priority: '📊 OPTIMIZACIÓN',
        title: 'Mejorar Cobertura de Endpoints',
        description: `Solo el ${coverage.endpoints || 0}% de los endpoints están siendo utilizados.`,
        actions: [
          'Revisar endpoints obsoletos y considerar deprecarlos',
          'Documentar endpoints disponibles para el equipo',
          'Identificar funcionalidades faltantes en el frontend'
        ]
      });
    }
    
    if (parseFloat(coverage.components || 0) < 60) {
      recommendations.push({
        priority: '🎨 DESIGN SYSTEM',
        title: 'Aumentar Adopción del Design System',
        description: `Solo el ${coverage.components || 0}% de los componentes del DS están siendo utilizados.`,
        actions: [
          'Capacitar al equipo sobre componentes disponibles',
          'Crear documentación y ejemplos de uso',
          'Establecer guías de implementación del design system',
          'Revisar componentes duplicados en el frontend'
        ]
      });
    }
    
    // Recomendaciones generales
    if (total === 0) {
      recommendations.push({
        priority: '✅ MANTENIMIENTO',
        title: 'Mantener Excelente Estado',
        description: 'El proyecto está perfectamente sincronizado. ¡Excelente trabajo!',
        actions: [
          'Continuar ejecutando auditorías regularmente',
          'Mantener documentación actualizada',
          'Considerar integración en pipeline CI/CD',
          'Compartir buenas prácticas con otros equipos'
        ]
      });
    }
    
    let content = `## 💡 Recomendaciones`;
    
    if (recommendations.length === 0) {
      content += `\\n\\nNo hay recomendaciones específicas en este momento.`;
      return content;
    }
    
    recommendations.forEach((rec, index) => {
      content += `\\n\\n### ${rec.priority} ${rec.title}\\n\\n`;
      content += `${rec.description}\\n\\n`;
      content += `**Acciones recomendadas:**\\n\\n`;
      
      rec.actions.forEach(action => {
        content += `- ${action}\\n`;
      });
    });
    
    return content;
  }

  generateFooter(results) {
    const totalFiles = (results.summary.backend.files || 0) + 
                      (results.summary.frontend.files || 0) + 
                      (results.summary.designSystem.components || 0);
    
    return `---

## 📈 Métricas de Auditoría

- **Archivos analizados:** ${totalFiles}
- **Tiempo de ejecución:** ${results.performance.totalDuration || 'N/A'}s
- **Issues detectados:** ${results.summary.issues.total}
- **Validaciones ejecutadas:** ${results.validations?.length || 0}

---

*Reporte generado automáticamente por **DGuard Ultra Audit Bot** 🤖*  
*Timestamp: ${results.metadata.timestamp}*`;
  }

  // Métodos de utilidad
  getPercentage(value, total) {
    if (total === 0) return '0';
    return ((value / total) * 100).toFixed(1);
  }

  formatCategoryName(category) {
    const categoryNames = {
      'buttons': '🔘 Buttons',
      'forms': '📝 Forms',
      'navigation': '🧭 Navigation',
      'layout': '📐 Layout',
      'typography': '📝 Typography',
      'icons': '🎨 Icons',
      'cards': '🃏 Cards',
      'overlays': '🪟 Overlays',
      'data-display': '📊 Data Display',
      'feedback': '💬 Feedback',
      'misc': '🔧 Miscellaneous'
    };
    
    return categoryNames[category] || `📦 ${category}`;
  }
}