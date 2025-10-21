#!/bin/bash

echo "🚀 Configurando DGuard Ultra Audit Bot..."
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "   Instala Node.js desde: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✓ Node.js: $NODE_VERSION"

# Verificar que sea una versión compatible (>=18)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | cut -d'v' -f2)
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "⚠️  Se recomienda Node.js 18 o superior"
    echo "   Versión actual: $NODE_VERSION"
fi

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm no está instalado"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✓ npm: v$NPM_VERSION"

# Verificar Git
if ! command -v git &> /dev/null; then
    echo "⚠️  Git no está instalado (opcional para algunas funciones)"
else
    echo "✓ git: $(git --version)"
fi

echo ""
echo "📦 Instalando dependencias..."

# Instalar dependencias
if npm install; then
    echo "✓ Dependencias instaladas correctamente"
else
    echo "❌ Error instalando dependencias"
    exit 1
fi

# Crear directorios necesarios
echo ""
echo "📁 Creando directorios..."

mkdir -p reports
mkdir -p .audit-history
mkdir -p logs

echo "✓ Directorios creados"

# Verificar configuración
echo ""
echo "📋 Verificando configuración..."

if [ ! -f "config/projects.config.js" ]; then
    echo "⚠️  Archivo de configuración no encontrado"
    echo "   Copiando configuración por defecto..."
    
    if [ -f "config/default.config.js" ]; then
        cp config/default.config.js config/projects.config.js
        echo "✓ Configuración por defecto copiada"
        echo ""
        echo "🔧 IMPORTANTE: Edita config/projects.config.js con las rutas de tus proyectos:"
        echo "   - Backend (DGuardAPI)"
        echo "   - Frontend (DGuard)"
        echo "   - Design System"
    else
        echo "❌ No se encontró configuración por defecto"
        exit 1
    fi
else
    echo "✓ Configuración encontrada"
fi

# Verificar rutas de proyectos
echo ""
echo "🔍 Verificando rutas de proyectos..."

# Leer configuración de Node.js
if command -v node &> /dev/null; then
    VERIFY_RESULT=$(node -e "
        try {
            const config = require('./config/projects.config.js').default;
            const fs = require('fs');
            
            let allGood = true;
            
            if (config.projects.backend?.path) {
                if (fs.existsSync(config.projects.backend.path)) {
                    console.log('✓ Backend:', config.projects.backend.path);
                } else {
                    console.log('❌ Backend no encontrado:', config.projects.backend.path);
                    allGood = false;
                }
            }
            
            if (config.projects.frontend?.path) {
                if (fs.existsSync(config.projects.frontend.path)) {
                    console.log('✓ Frontend:', config.projects.frontend.path);
                } else {
                    console.log('❌ Frontend no encontrado:', config.projects.frontend.path);
                    allGood = false;
                }
            }
            
            if (config.projects.designSystem?.path) {
                if (fs.existsSync(config.projects.designSystem.path)) {
                    console.log('✓ Design System:', config.projects.designSystem.path);
                } else {
                    console.log('⚠️  Design System no encontrado:', config.projects.designSystem.path);
                }
            }
            
            process.exit(allGood ? 0 : 1);
        } catch (error) {
            console.log('❌ Error leyendo configuración:', error.message);
            process.exit(1);
        }
    " 2>/dev/null)
    
    echo "$VERIFY_RESULT"
    
    # Verificar código de salida
    if ! node -e "
        try {
            const config = require('./config/projects.config.js').default;
            const fs = require('fs');
            
            if (!config.projects.backend?.path || !fs.existsSync(config.projects.backend.path)) {
                process.exit(1);
            }
            if (!config.projects.frontend?.path || !fs.existsSync(config.projects.frontend.path)) {
                process.exit(1);
            }
        } catch (error) {
            process.exit(1);
        }
    " 2>/dev/null; then
        echo ""
        echo "⚠️  Algunas rutas de proyecto no son válidas."
        echo "   Edita config/projects.config.js antes de ejecutar auditorías."
    fi
fi

# Crear script de ejemplo
echo ""
echo "📝 Creando scripts de ejemplo..."

cat > example-audit.sh << 'EOF'
#!/bin/bash
echo "🔍 Ejecutando auditoría de ejemplo..."
npm run audit
echo ""
echo "📊 Abriendo reporte..."
npm run audit:report
EOF

chmod +x example-audit.sh
echo "✓ example-audit.sh creado"

# Verificar permisos
echo ""
echo "🔐 Verificando permisos..."

if [ -w "reports" ] && [ -w ".audit-history" ]; then
    echo "✓ Permisos de escritura correctos"
else
    echo "⚠️  Problemas de permisos detectados"
    echo "   Ejecuta: sudo chown -R $(whoami) reports .audit-history"
fi

echo ""
echo "✅ Configuración completada!"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "📋 COMANDOS DISPONIBLES:"
echo ""
echo "  📊 AUDITORÍA:"
echo "    npm run audit              - Ejecutar auditoría completa"
echo "    npm run audit:watch        - Modo watch (re-ejecuta al detectar cambios)"
echo "    npm run audit:ci           - Modo CI (falla si hay críticos)"
echo "    npm run audit:report       - Abrir reporte HTML"
echo ""
echo "  🔧 UTILIDADES:"
echo "    npm run dashboard          - Dashboard interactivo"
echo "    npm run clean              - Limpiar reportes"
echo "    npm run validate-config    - Validar configuración"
echo ""
echo "  📄 EJEMPLOS:"
echo "    ./example-audit.sh         - Auditoría de ejemplo"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "🚀 PARA EMPEZAR:"
echo ""
echo "  1. Edita config/projects.config.js con las rutas de tus proyectos"
echo "  2. Ejecuta: npm run audit"
echo "  3. Abre: npm run audit:report"
echo ""
echo "📚 DOCUMENTACIÓN:"
echo "   README.md - Guía completa de uso"
echo ""
echo "🐛 PROBLEMAS:"
echo "   GitHub Issues: https://github.com/santiagogarcia/dguard-audit-bot/issues"
echo ""

# Test básico
echo "🧪 Ejecutando test básico..."
echo ""

if npm run audit -- --help > /dev/null 2>&1; then
    echo "✅ Test básico exitoso - El sistema está listo para usar"
else
    echo "❌ Test básico falló - Revisa la instalación"
    exit 1
fi

echo ""
echo "🎉 ¡Todo listo! DGuard Ultra Audit Bot está configurado correctamente."
echo ""