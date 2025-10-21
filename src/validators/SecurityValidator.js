export default class SecurityValidator {
  constructor(rules) {
    this.rules = rules;
  }

  async validate(backendEndpoints, frontendAPICalls) {
    const issues = [];
    
    // Validar autenticación en endpoints sensibles
    this.validateAuthenticationRequirements(backendEndpoints, issues);
    
    // Validar headers de autenticación en frontend
    this.validateFrontendAuthentication(backendEndpoints, frontendAPICalls, issues);
    
    // Validar endpoints públicos vs privados
    this.validatePublicEndpoints(backendEndpoints, issues);
    
    // Validar métodos HTTP sensibles
    this.validateSensitiveMethods(backendEndpoints, issues);
    
    return issues;
  }

  validateAuthenticationRequirements(backendEndpoints, issues) {
    backendEndpoints.forEach((endpoint, key) => {
      const isSensitive = this.isSensitiveEndpoint(key, endpoint);
      
      if (isSensitive && !endpoint.requiresAuth) {
        issues.push({
          type: 'SENSITIVE_ENDPOINT_NO_AUTH',
          severity: this.rules.severity.sensitiveEndpointNoAuth || 'CRITICAL',
          message: `Endpoint sensible sin autenticación: ${key}`,
          endpoint: key,
          backend: endpoint.file,
          line: endpoint.line,
          details: {
            reason: this.getSensitivityReason(key, endpoint),
            method: endpoint.method,
            path: endpoint.path
          },
          suggestions: [
            'Agregar middleware de autenticación',
            'Verificar si el endpoint debe ser público',
            'Implementar validación de token JWT'
          ]
        });
      }
    });
  }

  validateFrontendAuthentication(backendEndpoints, frontendAPICalls, issues) {
    frontendAPICalls.forEach((calls, key) => {
      const endpoint = backendEndpoints.get(key);
      
      if (endpoint && endpoint.requiresAuth) {
        calls.forEach(call => {
          if (!call.hasAuth) {
            issues.push({
              type: 'MISSING_AUTH_HEADER',
              severity: this.rules.severity.missingAuth || 'HIGH',
              message: `Endpoint requiere autenticación pero frontend no envía headers de auth`,
              endpoint: key,
              frontend: call.file,
              backend: endpoint.file,
              line: call.line,
              details: {
                endpointRequiresAuth: endpoint.requiresAuth,
                frontendHasAuth: call.hasAuth,
                authMiddleware: endpoint.middleware.filter(m => this.isAuthMiddleware(m))
              },
              suggestions: [
                'Agregar header Authorization en la request',
                'Implementar interceptor de axios para tokens',
                'Verificar si el usuario está autenticado antes de la llamada'
              ]
            });
          }
        });
      }
    });
  }

  validatePublicEndpoints(backendEndpoints, issues) {
    const publicPatterns = this.rules.security?.publicEndpoints || [];
    
    backendEndpoints.forEach((endpoint, key) => {
      const isPublic = this.isPublicEndpoint(key, publicPatterns);
      
      if (isPublic && endpoint.requiresAuth) {
        issues.push({
          type: 'PUBLIC_ENDPOINT_HAS_AUTH',
          severity: 'MEDIUM',
          message: `Endpoint público con autenticación requerida: ${key}`,
          endpoint: key,
          backend: endpoint.file,
          details: {
            reason: 'Endpoint marcado como público pero requiere autenticación'
          },
          suggestions: [
            'Remover autenticación si debe ser público',
            'Actualizar configuración de endpoints públicos'
          ]
        });
      }
    });
  }

  validateSensitiveMethods(backendEndpoints, issues) {
    const sensitiveMethods = this.rules.security?.sensitiveMethods || ['POST', 'PUT', 'PATCH', 'DELETE'];
    
    backendEndpoints.forEach((endpoint, key) => {
      if (sensitiveMethods.includes(endpoint.method) && !endpoint.requiresAuth) {
        const isExempt = this.isExemptFromAuth(key, endpoint);
        
        if (!isExempt) {
          issues.push({
            type: 'SENSITIVE_METHOD_NO_AUTH',
            severity: 'HIGH',
            message: `Método ${endpoint.method} sin autenticación: ${key}`,
            endpoint: key,
            backend: endpoint.file,
            line: endpoint.line,
            details: {
              method: endpoint.method,
              isSensitive: true,
              reason: `Método ${endpoint.method} puede modificar datos`
            },
            suggestions: [
              'Agregar middleware de autenticación',
              'Implementar validación de permisos',
              'Verificar si el endpoint debe permitir acceso anónimo'
            ]
          });
        }
      }
    });
  }

  isSensitiveEndpoint(key, endpoint) {
    const patterns = this.rules.requireAuthPatterns || [];
    
    // Verificar patrones de regex
    const matchesPattern = patterns.some(pattern => {
      if (pattern instanceof RegExp) {
        return pattern.test(key);
      }
      return key.toLowerCase().includes(pattern.toLowerCase());
    });
    
    if (matchesPattern) return true;
    
    // Verificar patrones comunes de seguridad
    const sensitiveKeywords = [
      'admin',
      'delete',
      'remove',
      'destroy',
      'create',
      'add',
      'update',
      'edit',
      'modify',
      'password',
      'auth',
      'login',
      'register',
      'user',
      'profile',
      'settings',
      'config',
      'upload',
      'file'
    ];
    
    return sensitiveKeywords.some(keyword => 
      key.toLowerCase().includes(keyword)
    );
  }

  getSensitivityReason(key, endpoint) {
    if (/delete|remove|destroy/i.test(key)) return 'Operación de eliminación';
    if (/create|add|post/i.test(key)) return 'Operación de creación';
    if (/update|edit|modify|put|patch/i.test(key)) return 'Operación de modificación';
    if (/admin/i.test(key)) return 'Funcionalidad administrativa';
    if (/password|auth/i.test(key)) return 'Operación de autenticación/seguridad';
    if (/user|profile/i.test(key)) return 'Datos de usuario';
    if (/upload|file/i.test(key)) return 'Manejo de archivos';
    
    return 'Endpoint potencialmente sensible';
  }

  isAuthMiddleware(middlewareName) {
    const authPatterns = [
      /auth/i,
      /jwt/i,
      /verify/i,
      /protect/i,
      /authenticate/i,
      /authorize/i,
      /guard/i,
      /secure/i,
      /token/i
    ];
    
    return authPatterns.some(pattern => pattern.test(middlewareName));
  }

  isPublicEndpoint(key, publicPatterns) {
    return publicPatterns.some(pattern => {
      if (typeof pattern === 'string') {
        // Soporte para wildcards simples
        if (pattern.endsWith('*')) {
          return key.startsWith(pattern.slice(0, -1));
        }
        return key === pattern;
      }
      if (pattern instanceof RegExp) {
        return pattern.test(key);
      }
      return false;
    });
  }

  isExemptFromAuth(key, endpoint) {
    // Endpoints que típicamente no necesitan auth
    const exemptPatterns = [
      /\/health$/,
      /\/status$/,
      /\/version$/,
      /\/ping$/,
      /\/public\//,
      /\/static\//,
      /\/assets\//,
      /^GET \/$/,  // Homepage
      /^GET .*\.(css|js|png|jpg|gif|ico)$/,  // Static files
      /\/auth\/login$/,
      /\/auth\/register$/,
      /\/auth\/forgot-password$/,
      /\/auth\/reset-password$/
    ];
    
    return exemptPatterns.some(pattern => pattern.test(key));
  }
}