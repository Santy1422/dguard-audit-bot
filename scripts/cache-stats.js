#!/usr/bin/env node

import chalk from 'chalk';
import { table } from 'table';
import CacheManager from '../src/utils/CacheManager.js';

async function showCacheStats() {
  console.log(chalk.cyan.bold('📊 DGuard Audit Bot - Cache Statistics\n'));
  
  const cache = new CacheManager();
  const stats = cache.getStats();
  
  // Tabla de estadísticas principales
  const mainStats = [
    ['Métrica', 'Valor'],
    ['Cache Hits', chalk.green(stats.hits.toString())],
    ['Cache Misses', chalk.red(stats.misses.toString())],
    ['Hit Rate', stats.hitRate],
    ['Writes', chalk.blue(stats.writes.toString())],
    ['Deletes', chalk.yellow(stats.deletes.toString())],
    ['Memory Keys', stats.memoryKeys.toString()],
    ['Disk Size', stats.diskSize]
  ];

  const config = {
    border: {
      topBody: '─', topJoin: '┬', topLeft: '┌', topRight: '┐',
      bottomBody: '─', bottomJoin: '┴', bottomLeft: '└', bottomRight: '┘',
      bodyLeft: '│', bodyRight: '│', bodyJoin: '│'
    },
    columns: {
      0: { width: 15 },
      1: { width: 20, alignment: 'right' }
    }
  };

  console.log(table(mainStats, config));
  
  // Calcular eficiencia
  const totalRequests = stats.hits + stats.misses;
  if (totalRequests > 0) {
    const hitRate = (stats.hits / totalRequests) * 100;
    
    console.log(chalk.bold('🎯 EFICIENCIA DEL CACHE:\n'));
    
    if (hitRate >= 80) {
      console.log(chalk.green.bold(`✅ EXCELENTE (${hitRate.toFixed(1)}%)`));
      console.log('   El cache está funcionando de manera óptima.');
    } else if (hitRate >= 60) {
      console.log(chalk.yellow.bold(`⚡ BUENO (${hitRate.toFixed(1)}%)`));
      console.log('   El cache está funcionando bien, pero puede mejorar.');
    } else if (hitRate >= 40) {
      console.log(chalk.orange.bold(`⚠️  REGULAR (${hitRate.toFixed(1)}%)`));
      console.log('   Considera revisar la configuración del cache.');
    } else {
      console.log(chalk.red.bold(`❌ BAJO (${hitRate.toFixed(1)}%)`));
      console.log('   El cache necesita optimización.');
    }
  }
  
  console.log('');
  
  // Recomendaciones
  console.log(chalk.bold('💡 RECOMENDACIONES:\n'));
  
  if (stats.hits < 10) {
    console.log('• Ejecuta más auditorías para generar datos de cache');
  }
  
  if (totalRequests > 100 && (stats.hits / totalRequests) < 0.5) {
    console.log('• Considera aumentar el TTL del cache');
    console.log('• Verifica que los archivos no cambien constantemente');
  }
  
  if (stats.memoryKeys > 1000) {
    console.log('• El cache en memoria está muy lleno, considera reducir el TTL');
  }
  
  const diskSizeBytes = parseDiskSize(stats.diskSize);
  if (diskSizeBytes > 100 * 1024 * 1024) { // 100MB
    console.log('• El cache en disco está ocupando mucho espacio');
    console.log('  Ejecuta: npm run audit:cache:clear');
  }
  
  console.log('\n━'.repeat(50));
  console.log(chalk.bold('COMANDOS ÚTILES:'));
  console.log('');
  console.log('• npm run audit:cache:clear - Limpiar cache');
  console.log('• npm run audit:cache:stats - Ver estas estadísticas');
  console.log('• npm run clean - Limpiar todo (cache + reportes)');
  console.log('');
}

function parseDiskSize(sizeStr) {
  if (!sizeStr || sizeStr === 'Unknown') return 0;
  
  const match = sizeStr.match(/^([\d.]+)\s*(\w+)$/);
  if (!match) return 0;
  
  const [, size, unit] = match;
  const multipliers = {
    'Bytes': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024
  };
  
  return parseFloat(size) * (multipliers[unit] || 1);
}

showCacheStats().catch(error => {
  console.error(chalk.red('❌ Error obteniendo estadísticas del cache:'), error.message);
  process.exit(1);
});