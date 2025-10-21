import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import NodeCache from 'node-cache';

export default class CacheManager {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || '.audit-cache';
    this.ttl = options.ttl || 3600; // 1 hour default
    this.maxAge = options.maxAge || 86400; // 24 hours max
    this.compression = options.compression !== false;
    
    // In-memory cache para resultados frecuentes
    this.memoryCache = new NodeCache({
      stdTTL: 300, // 5 minutos
      checkperiod: 60 // Check each minute
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      deletes: 0
    };
    
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Crear subdirectorios para organizar cache
    const subdirs = ['files', 'ast', 'analysis', 'reports'];
    subdirs.forEach(subdir => {
      const dirPath = path.join(this.cacheDir, subdir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  generateKey(...parts) {
    const content = parts.join('|');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  generateFileKey(filePath, stats) {
    return this.generateKey(
      filePath,
      stats.mtime.getTime().toString(),
      stats.size.toString()
    );
  }

  async get(key, category = 'files') {
    // Intentar memory cache primero
    const memKey = `${category}:${key}`;
    const memResult = this.memoryCache.get(memKey);
    if (memResult) {
      this.stats.hits++;
      return memResult;
    }

    // Intentar disk cache
    const filePath = path.join(this.cacheDir, category, `${key}.json`);
    
    if (!fs.existsSync(filePath)) {
      this.stats.misses++;
      return null;
    }

    try {
      const stats = fs.statSync(filePath);
      const age = (Date.now() - stats.mtime.getTime()) / 1000;
      
      if (age > this.maxAge) {
        fs.unlinkSync(filePath);
        this.stats.misses++;
        return null;
      }

      const cached = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Verificar TTL
      if (cached.expires && Date.now() > cached.expires) {
        fs.unlinkSync(filePath);
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      
      // Agregar a memory cache para acceso rápido
      this.memoryCache.set(memKey, cached.data, 300);
      
      return cached.data;
    } catch (error) {
      console.warn(`Cache read error for ${key}:`, error.message);
      this.stats.misses++;
      return null;
    }
  }

  async set(key, data, category = 'files', customTTL = null) {
    const ttl = customTTL || this.ttl;
    const expires = Date.now() + (ttl * 1000);
    
    const cached = {
      data,
      created: Date.now(),
      expires,
      key
    };

    // Guardar en memory cache
    const memKey = `${category}:${key}`;
    this.memoryCache.set(memKey, data, Math.min(ttl, 300));

    // Guardar en disk cache
    const filePath = path.join(this.cacheDir, category, `${key}.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(cached, null, 2));
      this.stats.writes++;
    } catch (error) {
      console.warn(`Cache write error for ${key}:`, error.message);
    }
  }

  async cacheFileAnalysis(filePath, stats, analysis) {
    const key = this.generateFileKey(filePath, stats);
    await this.set(key, {
      filePath,
      stats: {
        mtime: stats.mtime,
        size: stats.size
      },
      analysis
    }, 'analysis', this.ttl * 2); // Análisis duran más
    
    return key;
  }

  async getCachedFileAnalysis(filePath, stats) {
    const key = this.generateFileKey(filePath, stats);
    const cached = await this.get(key, 'analysis');
    
    if (cached && cached.filePath === filePath) {
      return cached.analysis;
    }
    
    return null;
  }

  async cacheAST(filePath, stats, ast) {
    const key = this.generateFileKey(filePath, stats);
    await this.set(key, {
      filePath,
      ast: this.compressAST(ast)
    }, 'ast', this.ttl * 3); // AST duran aún más
    
    return key;
  }

  async getCachedAST(filePath, stats) {
    const key = this.generateFileKey(filePath, stats);
    const cached = await this.get(key, 'ast');
    
    if (cached && cached.filePath === filePath) {
      return this.decompressAST(cached.ast);
    }
    
    return null;
  }

  compressAST(ast) {
    // Remover información innecesaria del AST para reducir tamaño
    return this.cleanASTNode(ast);
  }

  cleanASTNode(node) {
    if (!node || typeof node !== 'object') {
      return node;
    }

    const cleaned = {};
    
    // Mantener solo propiedades esenciales
    const keepProps = ['type', 'name', 'value', 'raw', 'method', 'key', 'computed', 'static'];
    const keepArrays = ['body', 'params', 'arguments', 'elements', 'properties', 'declarations'];
    
    for (const [key, value] of Object.entries(node)) {
      if (keepProps.includes(key)) {
        cleaned[key] = value;
      } else if (keepArrays.includes(key) && Array.isArray(value)) {
        cleaned[key] = value.map(item => this.cleanASTNode(item));
      } else if (key === 'loc' && value) {
        // Mantener solo línea de inicio
        cleaned[key] = { start: { line: value.start?.line } };
      }
    }

    return cleaned;
  }

  decompressAST(compressedAST) {
    return compressedAST; // Para ahora, no hay compresión real
  }

  async cacheProjectStructure(projectPath, structure) {
    const key = this.generateKey('project', projectPath);
    await this.set(key, structure, 'files', this.ttl / 2); // Estructuras cambian frecuentemente
  }

  async getCachedProjectStructure(projectPath) {
    const key = this.generateKey('project', projectPath);
    return await this.get(key, 'files');
  }

  async invalidateProject(projectPath) {
    const pattern = this.generateKey('project', projectPath);
    await this.invalidatePattern(pattern);
  }

  async invalidatePattern(pattern) {
    const categories = ['files', 'ast', 'analysis', 'reports'];
    
    for (const category of categories) {
      const categoryDir = path.join(this.cacheDir, category);
      if (!fs.existsSync(categoryDir)) continue;
      
      const files = fs.readdirSync(categoryDir);
      
      for (const file of files) {
        if (file.startsWith(pattern)) {
          try {
            fs.unlinkSync(path.join(categoryDir, file));
            this.stats.deletes++;
          } catch (error) {
            console.warn(`Error deleting cache file ${file}:`, error.message);
          }
        }
      }
    }
  }

  async clearExpired() {
    const categories = ['files', 'ast', 'analysis', 'reports'];
    let deletedCount = 0;
    
    for (const category of categories) {
      const categoryDir = path.join(this.cacheDir, category);
      if (!fs.existsSync(categoryDir)) continue;
      
      const files = fs.readdirSync(categoryDir);
      
      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        
        try {
          const stats = fs.statSync(filePath);
          const age = (Date.now() - stats.mtime.getTime()) / 1000;
          
          if (age > this.maxAge) {
            fs.unlinkSync(filePath);
            deletedCount++;
            this.stats.deletes++;
          } else {
            // Verificar TTL interno
            const cached = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (cached.expires && Date.now() > cached.expires) {
              fs.unlinkSync(filePath);
              deletedCount++;
              this.stats.deletes++;
            }
          }
        } catch (error) {
          // Archivo corrupto o inaccesible, eliminarlo
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            this.stats.deletes++;
          } catch (deleteError) {
            console.warn(`Error deleting corrupted cache file ${file}:`, deleteError.message);
          }
        }
      }
    }
    
    return deletedCount;
  }

  async clear() {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
        this.ensureCacheDir();
      }
      
      this.memoryCache.flushAll();
      
      // Reset stats
      this.stats = {
        hits: 0,
        misses: 0,
        writes: 0,
        deletes: 0
      };
      
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error.message);
      return false;
    }
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      memoryKeys: this.memoryCache.keys().length,
      diskSize: this.getDiskSize()
    };
  }

  getDiskSize() {
    try {
      const categories = ['files', 'ast', 'analysis', 'reports'];
      let totalSize = 0;
      
      for (const category of categories) {
        const categoryDir = path.join(this.cacheDir, category);
        if (!fs.existsSync(categoryDir)) continue;
        
        const files = fs.readdirSync(categoryDir);
        
        for (const file of files) {
          const filePath = path.join(categoryDir, file);
          const stats = fs.statSync(filePath);
          totalSize += stats.size;
        }
      }
      
      return this.formatBytes(totalSize);
    } catch (error) {
      return 'Unknown';
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Método para hacer warmup del cache
  async warmup(filePaths) {
    console.log('🔥 Warming up cache...');
    
    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) continue;
        
        const stats = fs.statSync(filePath);
        const key = this.generateFileKey(filePath, stats);
        
        // Verificar si ya está en cache
        const cached = await this.get(key, 'analysis');
        if (!cached) {
          // Pre-cargar archivo en cache
          const content = fs.readFileSync(filePath, 'utf8');
          await this.set(key, { filePath, content }, 'files');
        }
      } catch (error) {
        console.warn(`Warmup error for ${filePath}:`, error.message);
      }
    }
  }

  // Configurar limpieza automática
  setupAutoClear() {
    // Limpiar archivos expirados cada hora
    setInterval(async () => {
      const deleted = await this.clearExpired();
      if (deleted > 0) {
        console.log(`🧹 Cache cleanup: ${deleted} expired files deleted`);
      }
    }, 3600000); // 1 hour
  }
}