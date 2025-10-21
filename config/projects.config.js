import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  // Rutas de los proyectos a auditar
  projects: {
    backend: {
      name: 'DGuardAPI',
      path: '/Users/santiagogarcia/Documents/GitHub/DGuardAPI', // Ruta local (se actualizará automáticamente si se usa GitHub)
      type: 'nodejs-express',
      folders: {
        routes: 'routes',
        controllers: 'controllers',
        models: 'models',
        middleware: 'middleware'
      }
    },
    frontend: {
      name: 'DGuard',
      path: '/Users/santiagogarcia/Documents/GitHub/DGuard/DGuard', // Ruta local (se actualizará automáticamente si se usa GitHub)
      type: 'react',
      folders: {
        components: 'src/components',
        pages: 'src/pages',
        services: 'src/services',
        api: 'src/api'
      }
    },
    designSystem: {
      name: 'Design System',
      path: '/Users/santiagogarcia/Documents/GitHub/DGuard/design-system', // Ruta local (se actualizará automáticamente si se usa GitHub)
      type: 'react-components',
      folders: {
        components: 'src/components'
      }
    }
  },
  
  // ============================================================================
  // CONFIGURACIÓN DE GITHUB - CLONADO AUTOMÁTICO DE REPOSITORIOS
  // ============================================================================
  github: {
    // Usuario o organización de GitHub
    owner: 'ai-sapira',
    
    // Repositorios a clonar automáticamente (repositorios públicos para testing)
    repositories: {
      teamsBot: 'sapira-teams-bot',    // Repositorio público para testing
      restAI: 'rest_ai'                // Repositorio público para testing
      // backend: 'DGuardAPI',         // Repositorio privado - requiere permisos
      // frontend: 'DGuard',           // Repositorio privado - requiere permisos
    },
    
    // Configuración avanzada por repositorio (opcional)
    advanced: {
      backend: {
        name: 'DGuardAPI',
        owner: 'ai-sapira', // Organización Sapira
        branch: 'main',          // Branch específico a clonar
        depth: 1,               // Shallow clone para mayor velocidad
        options: {
          singleBranch: true,   // Solo clonar el branch especificado
          tags: false           // No descargar tags
        }
      },
      frontend: {
        name: 'DGuard',
        owner: 'ai-sapira', // Organización Sapira
        branch: 'main',
        depth: 1,
        options: {
          singleBranch: true,
          tags: false
        }
      },
      designSystem: {
        name: 'design-system',
        owner: 'ai-sapira', // Organización Sapira
        branch: 'main',
        depth: 1,
        options: {
          singleBranch: true,
          tags: false
        }
      }
    },
    
    // Configuración global de clonado
    cloneOptions: {
      depth: 1,                 // Shallow clone por defecto (más rápido)
      singleBranch: true,       // Solo clonar branch específico
      temporary: false,         // false = workspace permanente, true = temporal
      autoSync: true,           // Auto-sync en cada auditoría
      cleanBeforeClone: true,   // Limpiar directorio antes de clonar
      retries: 3,              // Intentos en caso de fallo
      timeout: 300000          // Timeout en ms (5 minutos)
    },
    
    // Configuración de autenticación
    auth: {
      token: process.env.GH_PAT || process.env.GITHUB_TOKEN, // Token desde variables de entorno
      username: process.env.GH_USERNAME, // Usuario (opcional)
    },
    
    // Directorio de trabajo
    workspace: {
      directory: './workspace',  // Directorio donde clonar repositorios
      tempDirectory: './temp-repos', // Directorio temporal
      preserveHistory: false,    // Mantener historial .git
      cleanupOnExit: true       // Limpiar repositorios temporales al salir
    }
  },

  // Configuración de la auditoría
  audit: {
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/*.test.js',
      '**/*.spec.js',
      '**/*.stories.js',
      '**/*.config.js',
      '**/coverage/**',
      '**/.next/**',
      '**/out/**'
    ],
    
    // Archivos a procesar
    fileExtensions: {
      backend: ['.js', '.ts', '.mjs'],
      frontend: ['.js', '.jsx', '.ts', '.tsx'],
      designSystem: ['.jsx', '.tsx']
    },

    // Configuración específica por analizador
    backend: {
      // Detectar rutas en estos archivos/patrones
      routePatterns: [
        'routes/**/*.js',
        'routes/**/*.ts',
        'app.js',
        'server.js',
        'index.js'
      ],
      // Detectar controladores
      controllerPatterns: [
        'controllers/**/*.js',
        'controllers/**/*.ts'
      ],
      // Detectar modelos
      modelPatterns: [
        'models/**/*.js',
        'models/**/*.ts'
      ]
    },

    frontend: {
      // Patrones para encontrar llamadas API
      apiCallPatterns: [
        'src/**/*.js',
        'src/**/*.jsx',
        'src/**/*.ts',
        'src/**/*.tsx'
      ],
      // Excluir archivos de test y stories
      excludePatterns: [
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.stories.*'
      ]
    }
  },

  // Reglas de validación
  rules: {
    // Fallar CI si hay issues críticos
    failOnCritical: true,
    
    // Fallar CI si hay más de X issues altos
    failOnHighCount: 10,
    
    // Endpoints que deben requerir autenticación
    requireAuthPatterns: [
      /delete/i,
      /admin/i,
      /user.*update/i,
      /password/i,
      /create/i,
      /remove/i,
      /edit/i,
      /modify/i
    ],
    
    // Severidad de issues
    severity: {
      missingEndpoint: 'CRITICAL',
      missingAuth: 'HIGH',
      missingParam: 'HIGH',
      missingBodyField: 'MEDIUM',
      missingResponseField: 'LOW',
      unusedEndpoint: 'LOW',
      unusedComponent: 'LOW',
      sensitiveEndpointNoAuth: 'CRITICAL',
      invalidApiCall: 'HIGH',
      missingErrorHandling: 'MEDIUM'
    },

    // Configuración de seguridad
    security: {
      // Headers de autenticación requeridos
      authHeaders: ['authorization', 'x-auth-token', 'bearer'],
      
      // Métodos sensibles que requieren auth
      sensitiveMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
      
      // Endpoints públicos (no requieren auth)
      publicEndpoints: [
        'GET /api/health',
        'GET /api/version',
        'POST /api/auth/login',
        'POST /api/auth/register',
        'GET /api/public/*'
      ]
    }
  },

  // Configuración de reportes
  reports: {
    outputDir: 'reports',
    formats: ['json', 'html', 'markdown', 'console'],
    
    // Guardar histórico de reportes
    saveHistory: true,
    historyDir: '.audit-history',
    maxHistoryFiles: 30,

    // Configuración HTML
    html: {
      template: 'default',
      includeCharts: true,
      showSourceCode: true
    },

    // Configuración Markdown
    markdown: {
      includeDetails: true,
      maxIssuesShown: 50
    }
  },

  // Notificaciones
  notifications: {
    slack: {
      enabled: false,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channel: '#dguard-audit',
      onlyOnFailure: true
    },
    email: {
      enabled: false,
      smtp: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        user: process.env.EMAIL_USERNAME,
        password: process.env.EMAIL_PASSWORD
      },
      to: ['team@dguard.com'],
      onlyOnFailure: true
    },
    discord: {
      enabled: false,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      onlyOnFailure: true
    }
  },

  // Configuración de CI/CD
  ci: {
    // Configuración para GitHub Actions
    github: {
      createIssues: false,
      addComments: true,
      failPR: true
    },
    
    // Configuración para GitLab CI
    gitlab: {
      createMergeRequestNotes: true,
      failPipeline: true
    }
  }
};