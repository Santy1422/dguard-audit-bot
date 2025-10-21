import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * Parsea código JavaScript/TypeScript de forma segura
 * @param {string} code - Código fuente
 * @param {object} options - Opciones de parseado
 * @returns {object|null} AST o null si hay error
 */
export function parseCodeSafe(code, options = {}) {
  const defaultOptions = {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    plugins: [
      'jsx',
      'typescript',
      'decorators-legacy',
      'classProperties',
      'objectRestSpread',
      'functionBind',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'dynamicImport',
      'nullishCoalescingOperator',
      'optionalChaining'
    ]
  };

  try {
    return parse(code, { ...defaultOptions, ...options });
  } catch (error) {
    // Intentar con sourceType 'script' si falla con 'module'
    if (options.sourceType !== 'script') {
      try {
        return parse(code, { 
          ...defaultOptions, 
          ...options, 
          sourceType: 'script' 
        });
      } catch (scriptError) {
        console.warn(`⚠️  No se pudo parsear código: ${error.message}`);
        return null;
      }
    }
    console.warn(`⚠️  No se pudo parsear código: ${error.message}`);
    return null;
  }
}

/**
 * Extrae valor de string literal de un nodo AST
 * @param {object} node - Nodo AST
 * @returns {string|null} Valor del string o null
 */
export function extractStringValue(node) {
  if (!node) return null;
  
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  
  if (node.type === 'TemplateLiteral') {
    // Para template literals simples sin expresiones
    if (node.expressions.length === 0) {
      return node.quasis[0]?.value?.cooked || null;
    }
    // Para template literals con expresiones, crear placeholder
    return node.quasis.map(q => q.value.cooked).join('${...}');
  }
  
  return null;
}

/**
 * Extrae valor numérico de un nodo AST
 * @param {object} node - Nodo AST
 * @returns {number|null} Valor numérico o null
 */
export function extractNumberValue(node) {
  if (!node) return null;
  
  if (node.type === 'NumericLiteral') {
    return node.value;
  }
  
  if (node.type === 'UnaryExpression' && node.operator === '-' && 
      node.argument.type === 'NumericLiteral') {
    return -node.argument.value;
  }
  
  return null;
}

/**
 * Extrae estructura de un objeto literal
 * @param {object} node - Nodo ObjectExpression
 * @returns {object} Estructura del objeto
 */
export function extractObjectStructure(node) {
  const structure = {};
  
  if (!node || node.type !== 'ObjectExpression') {
    return structure;
  }
  
  node.properties.forEach(prop => {
    if (prop.type === 'ObjectProperty' && prop.key) {
      const keyName = prop.key.name || prop.key.value;
      
      if (keyName) {
        if (prop.value.type === 'ObjectExpression') {
          structure[keyName] = extractObjectStructure(prop.value);
        } else if (prop.value.type === 'ArrayExpression') {
          structure[keyName] = extractArrayStructure(prop.value);
        } else if (prop.value.type === 'StringLiteral') {
          structure[keyName] = prop.value.value;
        } else if (prop.value.type === 'NumericLiteral') {
          structure[keyName] = prop.value.value;
        } else if (prop.value.type === 'BooleanLiteral') {
          structure[keyName] = prop.value.value;
        } else if (prop.value.type === 'Identifier') {
          structure[keyName] = `<${prop.value.name}>`;
        } else {
          structure[keyName] = `<${prop.value.type}>`;
        }
      }
    }
  });
  
  return structure;
}

/**
 * Extrae estructura de un array literal
 * @param {object} node - Nodo ArrayExpression
 * @returns {array} Estructura del array
 */
export function extractArrayStructure(node) {
  if (!node || node.type !== 'ArrayExpression') {
    return [];
  }
  
  return node.elements.map(element => {
    if (!element) return null;
    
    if (element.type === 'StringLiteral') {
      return element.value;
    } else if (element.type === 'NumericLiteral') {
      return element.value;
    } else if (element.type === 'ObjectExpression') {
      return extractObjectStructure(element);
    } else if (element.type === 'ArrayExpression') {
      return extractArrayStructure(element);
    } else {
      return `<${element.type}>`;
    }
  });
}

/**
 * Encuentra imports en un AST
 * @param {object} ast - AST del código
 * @returns {array} Array de imports encontrados
 */
export function findImports(ast) {
  const imports = [];
  
  if (!ast) return imports;
  
  traverse.default(ast, {
    ImportDeclaration: (path) => {
      const node = path.node;
      const importInfo = {
        source: node.source.value,
        specifiers: [],
        isDefault: false,
        isNamespace: false
      };
      
      node.specifiers.forEach(spec => {
        if (spec.type === 'ImportDefaultSpecifier') {
          importInfo.isDefault = true;
          importInfo.defaultName = spec.local.name;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          importInfo.isNamespace = true;
          importInfo.namespaceName = spec.local.name;
        } else if (spec.type === 'ImportSpecifier') {
          importInfo.specifiers.push({
            imported: spec.imported.name,
            local: spec.local.name
          });
        }
      });
      
      imports.push(importInfo);
    }
  });
  
  return imports;
}

/**
 * Encuentra exports en un AST
 * @param {object} ast - AST del código
 * @returns {array} Array de exports encontrados
 */
export function findExports(ast) {
  const exports = [];
  
  if (!ast) return exports;
  
  traverse.default(ast, {
    ExportDefaultDeclaration: (path) => {
      exports.push({
        type: 'default',
        declaration: path.node.declaration.type,
        name: path.node.declaration.name || path.node.declaration.id?.name
      });
    },
    
    ExportNamedDeclaration: (path) => {
      const node = path.node;
      
      if (node.declaration) {
        // export const/function/class
        if (node.declaration.type === 'VariableDeclaration') {
          node.declaration.declarations.forEach(decl => {
            exports.push({
              type: 'named',
              name: decl.id.name,
              declaration: 'variable'
            });
          });
        } else if (node.declaration.type === 'FunctionDeclaration') {
          exports.push({
            type: 'named',
            name: node.declaration.id.name,
            declaration: 'function'
          });
        } else if (node.declaration.type === 'ClassDeclaration') {
          exports.push({
            type: 'named',
            name: node.declaration.id.name,
            declaration: 'class'
          });
        }
      } else if (node.specifiers) {
        // export { name1, name2 }
        node.specifiers.forEach(spec => {
          exports.push({
            type: 'named',
            name: spec.exported.name,
            local: spec.local.name,
            declaration: 'specifier'
          });
        });
      }
    }
  });
  
  return exports;
}

/**
 * Encuentra llamadas a funciones específicas
 * @param {object} ast - AST del código
 * @param {string|array} functionNames - Nombre(s) de función a buscar
 * @returns {array} Array de llamadas encontradas
 */
export function findFunctionCalls(ast, functionNames) {
  const calls = [];
  const names = Array.isArray(functionNames) ? functionNames : [functionNames];
  
  if (!ast) return calls;
  
  traverse.default(ast, {
    CallExpression: (path) => {
      const node = path.node;
      let callName = null;
      
      if (node.callee.type === 'Identifier') {
        callName = node.callee.name;
      } else if (node.callee.type === 'MemberExpression') {
        if (node.callee.object.name && node.callee.property.name) {
          callName = `${node.callee.object.name}.${node.callee.property.name}`;
        }
      }
      
      if (callName && names.includes(callName)) {
        calls.push({
          name: callName,
          arguments: node.arguments.map(arg => ({
            type: arg.type,
            value: extractStringValue(arg) || extractNumberValue(arg)
          })),
          line: path.node.loc?.start?.line
        });
      }
    }
  });
  
  return calls;
}

/**
 * Extrae parámetros de una función
 * @param {object} functionNode - Nodo de función
 * @returns {array} Array de parámetros
 */
export function extractFunctionParams(functionNode) {
  const params = [];
  
  if (!functionNode || !functionNode.params) {
    return params;
  }
  
  functionNode.params.forEach(param => {
    if (param.type === 'Identifier') {
      params.push({
        name: param.name,
        type: 'simple',
        optional: false
      });
    } else if (param.type === 'AssignmentPattern') {
      params.push({
        name: param.left.name,
        type: 'default',
        optional: true,
        defaultValue: extractStringValue(param.right) || extractNumberValue(param.right)
      });
    } else if (param.type === 'ObjectPattern') {
      params.push({
        name: 'destructured',
        type: 'object',
        properties: param.properties.map(prop => prop.key?.name).filter(Boolean)
      });
    } else if (param.type === 'ArrayPattern') {
      params.push({
        name: 'destructured',
        type: 'array',
        elements: param.elements.length
      });
    }
  });
  
  return params;
}

/**
 * Encuentra declaraciones de variables
 * @param {object} ast - AST del código
 * @param {string} variableName - Nombre de variable a buscar (opcional)
 * @returns {array} Array de declaraciones encontradas
 */
export function findVariableDeclarations(ast, variableName = null) {
  const declarations = [];
  
  if (!ast) return declarations;
  
  traverse.default(ast, {
    VariableDeclarator: (path) => {
      const node = path.node;
      
      if (node.id.type === 'Identifier') {
        const name = node.id.name;
        
        if (!variableName || name === variableName) {
          declarations.push({
            name,
            type: node.init?.type,
            value: extractStringValue(node.init) || extractNumberValue(node.init),
            line: path.node.loc?.start?.line
          });
        }
      }
    }
  });
  
  return declarations;
}

/**
 * Obtiene número de línea desde posición en código
 * @param {string} code - Código fuente
 * @param {number} position - Posición en el código
 * @returns {number} Número de línea
 */
export function getLineNumber(code, position) {
  if (!code || position < 0) return 1;
  return code.substring(0, position).split('\\n').length;
}

/**
 * Verifica si un nodo es una declaración de React component
 * @param {object} node - Nodo AST
 * @returns {boolean} true si es un componente React
 */
export function isReactComponent(node) {
  if (!node) return false;
  
  // function Component() { return <jsx> }
  if (node.type === 'FunctionDeclaration') {
    return node.id?.name && /^[A-Z]/.test(node.id.name);
  }
  
  // const Component = () => <jsx>
  if (node.type === 'VariableDeclarator' && 
      node.id?.name && /^[A-Z]/.test(node.id.name)) {
    return node.init?.type === 'ArrowFunctionExpression' || 
           node.init?.type === 'FunctionExpression';
  }
  
  return false;
}

/**
 * Extrae props de un componente React
 * @param {object} componentNode - Nodo del componente
 * @returns {array} Array de props
 */
export function extractReactProps(componentNode) {
  const props = [];
  
  if (!componentNode) return props;
  
  let functionNode = null;
  
  if (componentNode.type === 'FunctionDeclaration') {
    functionNode = componentNode;
  } else if (componentNode.type === 'VariableDeclarator') {
    functionNode = componentNode.init;
  }
  
  if (functionNode && functionNode.params && functionNode.params[0]) {
    const propsParam = functionNode.params[0];
    
    if (propsParam.type === 'ObjectPattern') {
      propsParam.properties.forEach(prop => {
        if (prop.type === 'ObjectProperty' && prop.key?.name) {
          props.push({
            name: prop.key.name,
            hasDefault: prop.value?.type === 'AssignmentPattern'
          });
        }
      });
    } else if (propsParam.type === 'Identifier') {
      props.push({
        name: propsParam.name,
        type: 'props'
      });
    }
  }
  
  return props;
}