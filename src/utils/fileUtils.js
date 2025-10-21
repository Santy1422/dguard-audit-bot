import fs from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';
import { glob } from 'glob';

/**
 * Encuentra archivos recursivamente en un directorio
 * @param {string} dir - Directorio a buscar
 * @param {string[]} extensions - Extensiones a incluir
 * @param {string[]} ignorePatterns - Patrones a ignorar
 * @returns {string[]} Array de rutas de archivos
 */
export function findFiles(dir, extensions = [], ignorePatterns = []) {
  let results = [];
  
  try {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️  Directorio no existe: ${dir}`);
      return results;
    }
    
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      
      // Verificar si debe ignorarse
      const shouldIgnore = ignorePatterns.some(pattern => 
        minimatch(filePath, pattern) || minimatch(file, pattern)
      );
      
      if (shouldIgnore) continue;
      
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Recursión en subdirectorios
          results = results.concat(findFiles(filePath, extensions, ignorePatterns));
        } else if (extensions.length === 0 || extensions.includes(path.extname(file))) {
          results.push(filePath);
        }
      } catch (e) {
        // Ignorar errores de permisos
        console.warn(`⚠️  No se pudo acceder a: ${filePath}`);
      }
    }
  } catch (e) {
    console.warn(`⚠️  No se pudo leer directorio: ${dir}`);
  }
  
  return results;
}

/**
 * Encuentra archivos usando patrones glob
 * @param {string} baseDir - Directorio base
 * @param {string[]} patterns - Patrones glob
 * @param {string[]} ignorePatterns - Patrones a ignorar
 * @returns {Promise<string[]>} Array de rutas de archivos
 */
export async function findFilesByPattern(baseDir, patterns, ignorePatterns = []) {
  const results = [];
  
  for (const pattern of patterns) {
    try {
      const fullPattern = path.join(baseDir, pattern);
      const files = await glob(fullPattern, {
        ignore: ignorePatterns,
        nodir: true
      });
      results.push(...files);
    } catch (error) {
      console.warn(`⚠️  Error con patrón ${pattern}:`, error.message);
    }
  }
  
  // Eliminar duplicados y ordenar
  return [...new Set(results)].sort();
}

/**
 * Asegura que un directorio existe, creándolo si es necesario
 * @param {string} dir - Ruta del directorio
 */
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Lee un archivo de forma segura
 * @param {string} filePath - Ruta del archivo
 * @returns {string|null} Contenido del archivo o null si hay error
 */
export function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.warn(`⚠️  No se pudo leer archivo: ${filePath}`);
    return null;
  }
}

/**
 * Escribe un archivo de forma segura
 * @param {string} filePath - Ruta del archivo
 * @param {string} content - Contenido a escribir
 * @returns {boolean} true si se escribió correctamente
 */
export function writeFileSafe(filePath, content) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error(`❌ No se pudo escribir archivo: ${filePath}`, error.message);
    return false;
  }
}

/**
 * Obtiene información de un archivo
 * @param {string} filePath - Ruta del archivo
 * @returns {object|null} Información del archivo
 */
export function getFileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      ext: path.extname(filePath),
      size: stat.size,
      created: stat.birthtime,
      modified: stat.mtime,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile()
    };
  } catch (error) {
    return null;
  }
}

/**
 * Verifica si un archivo coincide con patrones de exclusión
 * @param {string} filePath - Ruta del archivo
 * @param {string[]} patterns - Patrones de exclusión
 * @returns {boolean} true si debe excluirse
 */
export function shouldExcludeFile(filePath, patterns) {
  return patterns.some(pattern => {
    // Verificar tanto la ruta completa como solo el nombre del archivo
    return minimatch(filePath, pattern) || 
           minimatch(path.basename(filePath), pattern);
  });
}

/**
 * Obtiene el tamaño de un directorio recursivamente
 * @param {string} dir - Directorio
 * @returns {number} Tamaño en bytes
 */
export function getDirectorySize(dir) {
  let size = 0;
  
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stat.size;
      }
    }
  } catch (error) {
    // Ignorar errores
  }
  
  return size;
}

/**
 * Convierte bytes a formato legible
 * @param {number} bytes - Número de bytes
 * @returns {string} Tamaño formateado
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Obtiene rutas relativas desde un directorio base
 * @param {string[]} filePaths - Array de rutas absolutas
 * @param {string} baseDir - Directorio base
 * @returns {string[]} Array de rutas relativas
 */
export function getRelativePaths(filePaths, baseDir) {
  return filePaths.map(filePath => path.relative(baseDir, filePath));
}

/**
 * Agrupa archivos por extensión
 * @param {string[]} filePaths - Array de rutas de archivos
 * @returns {object} Objeto con archivos agrupados por extensión
 */
export function groupFilesByExtension(filePaths) {
  const groups = {};
  
  filePaths.forEach(filePath => {
    const ext = path.extname(filePath).toLowerCase();
    if (!groups[ext]) {
      groups[ext] = [];
    }
    groups[ext].push(filePath);
  });
  
  return groups;
}

/**
 * Filtra archivos por fecha de modificación
 * @param {string[]} filePaths - Array de rutas de archivos
 * @param {Date} since - Fecha desde la cual filtrar
 * @returns {string[]} Archivos modificados después de la fecha
 */
export function getModifiedFilesSince(filePaths, since) {
  const modifiedFiles = [];
  
  filePaths.forEach(filePath => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtime > since) {
        modifiedFiles.push(filePath);
      }
    } catch (error) {
      // Ignorar archivos que no se pueden leer
    }
  });
  
  return modifiedFiles;
}

/**
 * Encuentra archivos que coinciden con múltiples extensiones
 * @param {string} dir - Directorio a buscar
 * @param {string[]} extensions - Array de extensiones (ej: ['.js', '.jsx'])
 * @param {string[]} ignorePatterns - Patrones a ignorar
 * @returns {string[]} Array de rutas de archivos
 */
export function findFilesByExtensions(dir, extensions, ignorePatterns = []) {
  const results = [];
  
  extensions.forEach(ext => {
    const files = findFiles(dir, [ext], ignorePatterns);
    results.push(...files);
  });
  
  // Eliminar duplicados
  return [...new Set(results)];
}

/**
 * Verifica si un directorio contiene archivos de cierto tipo
 * @param {string} dir - Directorio a verificar
 * @param {string[]} extensions - Extensiones a buscar
 * @returns {boolean} true si contiene archivos del tipo especificado
 */
export function directoryContainsFileTypes(dir, extensions) {
  if (!fs.existsSync(dir)) return false;
  
  try {
    const files = fs.readdirSync(dir);
    return files.some(file => {
      const ext = path.extname(file);
      return extensions.includes(ext);
    });
  } catch (error) {
    return false;
  }
}