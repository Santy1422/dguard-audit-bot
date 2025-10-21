export default class ComponentValidator {
  constructor(rules) {
    this.rules = rules;
  }

  async validate(designSystemComponents, frontendComponents) {
    const issues = [];
    
    if (!designSystemComponents || !frontendComponents) {
      return issues;
    }
    
    // Validar uso de componentes del design system
    this.validateComponentUsage(designSystemComponents, frontendComponents, issues);
    
    // Encontrar componentes no utilizados
    this.findUnusedComponents(designSystemComponents, issues);
    
    // Validar duplicación de componentes
    this.detectIncorrectUsage(designSystemComponents, frontendComponents, issues);
    
    // Validar consistencia de props
    this.validatePropsConsistency(designSystemComponents, frontendComponents, issues);
    
    return issues;
  }

  validateComponentUsage(designSystemComponents, frontendComponents, issues) {
    // Crear mapa de imports para detectar uso
    const dsComponentNames = new Set(Array.from(designSystemComponents.keys()));
    const frontendImports = this.extractImportsFromFrontend(frontendComponents);
    
    // Marcar componentes como usados
    frontendImports.forEach((importInfo, file) => {
      importInfo.forEach(imp => {
        // Buscar imports del design system
        if (this.isDesignSystemImport(imp.source)) {
          imp.specifiers.forEach(spec => {
            const componentName = spec.imported || spec.local;
            
            if (dsComponentNames.has(componentName)) {
              const component = designSystemComponents.get(componentName);
              component.used = true;
              component.usedIn.push(file);
            }
          });
          
          // Default import
          if (imp.isDefault && imp.defaultName && dsComponentNames.has(imp.defaultName)) {
            const component = designSystemComponents.get(imp.defaultName);
            component.used = true;
            component.usedIn.push(file);
          }
        }
      });
    });
    
    // Detectar uso incorrecto (componentes similares en frontend cuando existe en DS)
    this.detectIncorrectUsage(designSystemComponents, frontendComponents, issues);
  }

  extractImportsFromFrontend(frontendComponents) {
    // En un escenario real, esto extraería imports de los archivos del frontend
    // Por ahora, simularemos basándonos en la estructura
    const imports = new Map();
    
    frontendComponents.forEach((component, key) => {
      const file = component.file;
      if (!imports.has(file)) {
        imports.set(file, []);
      }
      
      // Simular algunos imports típicos
      // En implementación real, esto se haría parseando los archivos
      imports.get(file).push({
        source: '@design-system/components',
        specifiers: [
          { imported: 'Button', local: 'Button' },
          { imported: 'Input', local: 'Input' }
        ],
        isDefault: false
      });
    });
    
    return imports;
  }

  isDesignSystemImport(source) {
    const dsPatterns = [
      /@.*design-system/,
      /@.*ui/,
      /@.*components/,
      /design-system/,
      /ui-kit/,
      /component-library/,
      /\.\.\/design-system/,
      /\.\.\/components/
    ];
    
    return dsPatterns.some(pattern => pattern.test(source));
  }

  detectIncorrectUsage(designSystemComponents, frontendComponents, issues) {
    const dsComponentNames = Array.from(designSystemComponents.keys()).map(name => name.toLowerCase());
    
    frontendComponents.forEach((component, key) => {
      const componentName = component.name.toLowerCase();
      
      // Buscar componentes similares en el design system
      const similarDSComponent = dsComponentNames.find(dsName => {
        return this.areComponentsSimilar(componentName, dsName);
      });
      
      if (similarDSComponent) {
        const dsComponent = Array.from(designSystemComponents.values())
          .find(ds => ds.name.toLowerCase() === similarDSComponent);
        
        if (dsComponent && !dsComponent.used) {
          issues.push({
            type: 'DUPLICATE_COMPONENT',
            severity: 'MEDIUM',
            message: `Componente "${component.name}" en frontend es similar a "${dsComponent.name}" del design system`,
            frontend: component.file,
            designSystem: dsComponent.file,
            component: component.name,
            dsComponent: dsComponent.name,
            details: {
              similarity: this.calculateSimilarity(componentName, similarDSComponent),
              frontendComponent: component,
              dsComponent: dsComponent
            },
            suggestions: [
              `Usar componente ${dsComponent.name} del design system`,
              'Eliminar componente duplicado del frontend',
              'Verificar si hay diferencias funcionales que justifiquen la duplicación'
            ]
          });
        }
      }
    });
  }

  areComponentsSimilar(name1, name2) {
    // Normalizar nombres
    const normalize = (name) => name.toLowerCase()
      .replace(/component$/, '')
      .replace(/^ui/, '')
      .replace(/^ds/, '')
      .replace(/button|btn/, 'button')
      .replace(/input|field/, 'input')
      .replace(/modal|dialog/, 'modal')
      .replace(/card|panel/, 'card');
    
    const norm1 = normalize(name1);
    const norm2 = normalize(name2);
    
    // Similitud exacta
    if (norm1 === norm2) return true;
    
    // Similitud por inclusión
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    
    // Similitud de Levenshtein
    const similarity = this.calculateSimilarity(norm1, norm2);
    return similarity > 0.8;
  }

  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  findUnusedComponents(designSystemComponents, issues) {
    designSystemComponents.forEach((component, name) => {
      if (!component.used) {
        issues.push({
          type: 'UNUSED_DS_COMPONENT',
          severity: this.rules.severity.unusedComponent || 'LOW',
          message: `Componente "${name}" del design system no está siendo usado`,
          component: name,
          designSystem: component.file,
          line: component.line,
          details: {
            category: component.category,
            complexity: component.complexity,
            hasTests: component.hasTests,
            hasStories: component.hasStories
          },
          suggestions: [
            'Verificar si el componente es necesario',
            'Documentar casos de uso del componente',
            'Considerar deprecar si no se usa',
            'Promover el uso del componente en el equipo'
          ]
        });
      }
    });
  }

  validatePropsConsistency(designSystemComponents, frontendComponents, issues) {
    // Validar que el uso de props sea consistente con la definición del DS
    designSystemComponents.forEach((dsComponent, name) => {
      if (dsComponent.used && dsComponent.props && dsComponent.props.length > 0) {
        const usageFiles = dsComponent.usedIn;
        
        // Aquí se podría implementar análisis más profundo del uso de props
        // Por ahora, solo verificamos la estructura básica
        this.validateBasicPropsUsage(dsComponent, usageFiles, issues);
      }
    });
  }

  validateBasicPropsUsage(dsComponent, usageFiles, issues) {
    const requiredProps = dsComponent.props.filter(prop => !prop.hasDefault && prop.name !== 'children');
    
    if (requiredProps.length > 0) {
      usageFiles.forEach(file => {
        // En una implementación real, aquí se analizaría el archivo para verificar
        // que las props requeridas se están pasando
        
        // Por ahora, solo generamos una validación de ejemplo
        issues.push({
          type: 'VERIFY_PROPS_USAGE',
          severity: 'LOW',
          message: `Verificar uso correcto de props para ${dsComponent.name} en ${file}`,
          component: dsComponent.name,
          file,
          details: {
            requiredProps: requiredProps.map(p => p.name),
            totalProps: dsComponent.props.length
          },
          suggestions: [
            'Verificar que todas las props requeridas se están pasando',
            'Revisar documentación del componente',
            'Usar TypeScript para validación automática de props'
          ]
        });
      });
    }
  }
}