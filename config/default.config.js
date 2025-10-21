export default {
  // Configuración por defecto si no existe projects.config.js
  projects: {
    backend: {
      name: 'Backend',
      path: './backend',
      type: 'nodejs-express',
      folders: {
        routes: 'routes',
        controllers: 'controllers',
        models: 'models',
        middleware: 'middleware'
      }
    },
    frontend: {
      name: 'Frontend',
      path: './frontend',
      type: 'react',
      folders: {
        components: 'src/components',
        pages: 'src/pages',
        services: 'src/services'
      }
    },
    designSystem: {
      name: 'Design System',
      path: './design-system',
      type: 'react-components',
      folders: {
        components: 'src/components'
      }
    }
  },
  
  audit: {
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/*.test.js',
      '**/*.spec.js'
    ],
    fileExtensions: {
      backend: ['.js', '.ts'],
      frontend: ['.js', '.jsx', '.ts', '.tsx'],
      designSystem: ['.jsx', '.tsx']
    }
  },
  
  rules: {
    failOnCritical: true,
    failOnHighCount: 10,
    requireAuthPatterns: [
      /delete/i,
      /admin/i,
      /create/i
    ],
    severity: {
      missingEndpoint: 'CRITICAL',
      missingAuth: 'HIGH',
      missingParam: 'HIGH',
      missingBodyField: 'MEDIUM',
      unusedEndpoint: 'LOW'
    }
  },
  
  reports: {
    outputDir: 'reports',
    formats: ['json', 'html', 'console'],
    saveHistory: false
  },

  notifications: {
    slack: { enabled: false },
    email: { enabled: false }
  }
};