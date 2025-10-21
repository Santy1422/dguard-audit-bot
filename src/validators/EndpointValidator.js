export default class EndpointValidator {
  constructor(rules) {
    this.rules = rules;
  }

  async validate(backendEndpoints, frontendAPICalls) {
    const issues = [];
    
    // Validar que todas las llamadas del frontend tengan endpoints correspondientes
    frontendAPICalls.forEach((calls, key) => {
      calls.forEach(call => {
        const endpoint = backendEndpoints.get(key);
        
        if (!endpoint) {
          issues.push({
            type: 'MISSING_BACKEND_ENDPOINT',
            severity: this.rules.severity.missingEndpoint || 'CRITICAL',
            message: `Frontend llama a ${key} pero no existe endpoint en backend`,
            endpoint: key,
            frontend: call.file,
            line: call.line,
            details: {
              method: call.method,
              url: call.endpoint,
              calledFrom: call.file
            }
          });
        } else {
          // Marcar endpoint como usado
          endpoint.used = true;
          
          // Validar parámetros, body, etc.
          this.validateEndpointUsage(endpoint, call, issues);
        }
      });
    });
    
    // Encontrar endpoints no utilizados
    backendEndpoints.forEach((endpoint, key) => {
      if (!endpoint.used) {
        issues.push({
          type: 'UNUSED_ENDPOINT',
          severity: this.rules.severity.unusedEndpoint || 'LOW',
          message: `Endpoint ${key} definido en backend pero no usado en frontend`,
          endpoint: key,
          backend: endpoint.file,
          line: endpoint.line
        });
      }
    });
    
    return issues;
  }

  validateEndpointUsage(endpoint, call, issues) {
    // Validar parámetros de URL
    this.validateURLParams(endpoint, call, issues);
    
    // Validar body de la request
    this.validateRequestBody(endpoint, call, issues);
    
    // Validar query parameters
    this.validateQueryParams(endpoint, call, issues);
  }

  validateURLParams(endpoint, call, issues) {
    // Verificar que todos los parámetros esperados por el backend estén presentes
    endpoint.params.forEach(param => {
      if (!call.params.includes(param) && !call.endpoint.includes(`:${param}`)) {
        issues.push({
          type: 'MISSING_URL_PARAM',
          severity: this.rules.severity.missingParam || 'HIGH',
          message: `Backend espera parámetro :${param} pero frontend no lo envía`,
          endpoint: `${endpoint.method} ${endpoint.path}`,
          frontend: call.file,
          backend: endpoint.file,
          param
        });
      }
    });
    
    // Verificar parámetros extra en frontend
    call.params.forEach(param => {
      if (!endpoint.params.includes(param)) {
        issues.push({
          type: 'EXTRA_URL_PARAM',
          severity: 'LOW',
          message: `Frontend envía parámetro :${param} pero backend no lo espera`,
          endpoint: `${endpoint.method} ${endpoint.path}`,
          frontend: call.file,
          param
        });
      }
    });
  }

  validateRequestBody(endpoint, call, issues) {
    if (!call.data || Object.keys(call.data).length === 0) return;
    
    // Verificar campos requeridos en el body
    Object.keys(endpoint.expectedBody || {}).forEach(field => {
      const bodyField = endpoint.expectedBody[field];
      
      if (bodyField.required && !call.data.hasOwnProperty(field)) {
        issues.push({
          type: 'MISSING_BODY_FIELD',
          severity: this.rules.severity.missingBodyField || 'MEDIUM',
          message: `Backend requiere campo "${field}" en body pero frontend no lo envía`,
          endpoint: `${endpoint.method} ${endpoint.path}`,
          frontend: call.file,
          backend: endpoint.file,
          field
        });
      }
    });
    
    // Verificar campos extra en frontend
    Object.keys(call.data).forEach(field => {
      if (!endpoint.expectedBody || !endpoint.expectedBody.hasOwnProperty(field)) {
        issues.push({
          type: 'EXTRA_BODY_FIELD',
          severity: 'LOW',
          message: `Frontend envía campo "${field}" en body pero backend no lo espera`,
          endpoint: `${endpoint.method} ${endpoint.path}`,
          frontend: call.file,
          field
        });
      }
    });
  }

  validateQueryParams(endpoint, call, issues) {
    // Verificar query parameters esperados
    endpoint.queryParams.forEach(param => {
      if (!call.queryParams.includes(param)) {
        issues.push({
          type: 'MISSING_QUERY_PARAM',
          severity: 'LOW',
          message: `Backend espera query parameter "${param}" pero frontend no lo envía`,
          endpoint: `${endpoint.method} ${endpoint.path}`,
          frontend: call.file,
          backend: endpoint.file,
          param
        });
      }
    });
  }
}