# 🔍 DGuard Ultra Audit Bot

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Sistema completo de auditoría automatizada para validar la integración entre Backend (DGuardAPI), Frontend (DGuard) y Design System.**

---

## 🎯 **¿Qué hace DGuard Ultra Audit Bot?**

Este bot analiza automáticamente tu stack completo y detecta:

- ✅ **Endpoints faltantes** - Llamadas del frontend que no existen en el backend
- ✅ **Problemas de seguridad** - Endpoints sensibles sin autenticación
- ✅ **Parámetros incorrectos** - Mismatch entre lo que envía el frontend y espera el backend  
- ✅ **Componentes sin uso** - Elementos del Design System que no se utilizan
- ✅ **APIs obsoletas** - Endpoints del backend que nadie llama
- ✅ **Validaciones de tipos** - Inconsistencias en estructura de datos

---

## 🚀 **Instalación Rápida**

```bash
# Clonar el repositorio
git clone https://github.com/santiagogarcia/dguard-audit-bot.git
cd dguard-audit-bot

# Configuración automática
npm run setup
```

El script de setup verificará dependencias, creará directorios y te guiará en la configuración.

---

## ⚙️ **Configuración**

### 1. **Editar rutas de proyectos**

```javascript
// config/projects.config.js
export default {
  projects: {
    backend: {
      name: 'DGuardAPI',
      path: '/ruta/a/tu/DGuardAPI',
      type: 'nodejs-express'
    },
    frontend: {
      name: 'DGuard',
      path: '/ruta/a/tu/DGuard',
      type: 'react'
    },
    designSystem: {
      name: 'Design System',
      path: '/ruta/a/tu/design-system',
      type: 'react-components'
    }
  }
}
```

### 2. **Personalizar reglas** *(opcional)*

```javascript
// En projects.config.js
rules: {
  failOnCritical: true,           // Fallar CI con issues críticos
  failOnHighCount: 10,            // Fallar CI con más de X issues altos
  requireAuthPatterns: [          // Endpoints que requieren autenticación
    /delete/i,
    /admin/i,
    /create/i
  ]
}
```

---

## 🎪 **Uso**

### **Comandos Principales**

```bash
# 🔍 Auditoría completa
npm run audit

# 🔄 Modo watch (re-ejecuta al detectar cambios)
npm run audit:watch

# 🤖 Modo CI (falla si hay críticos)
npm run audit:ci

# 📊 Dashboard interactivo
npm run dashboard

# 📄 Abrir reporte HTML
npm run audit:report
```

### **Con opciones personalizadas**

```bash
# Rutas específicas
npm run audit -- --backend /ruta/backend --frontend /ruta/frontend

# Solo críticos y altos
npm run audit -- --only-critical

# Formato específico
npm run audit -- --format json

# Modo silencioso
npm run audit -- --quiet
```

---

## 📊 **Reportes Generados**

### **1. Reporte de Consola**
```
╔════════════════════════════════════════════════════════════════╗
║                   📊 RESUMEN DE AUDITORÍA                      ║
╚════════════════════════════════════════════════════════════════╝

📦 BACKEND       │ 45 endpoints, 23 archivos
🎨 FRONTEND      │ 803 componentes, 360 llamadas API  
🧩 DESIGN SYSTEM │ 28 componentes

🚨 ISSUES        │ 🔴 0 críticos, 🟠 3 altos, 🟡 8 medios
```

### **2. Reporte HTML Interactivo**
- Dashboard visual con gráficos
- Navegación por pestañas
- Filtros por severidad
- Detalles expandibles

### **3. Reporte JSON Programático**
```json
{
  "summary": {
    "backend": { "endpoints": 45, "files": 23 },
    "frontend": { "apiCalls": 360, "components": 803 },
    "issues": { "critical": 0, "high": 3, "total": 11 }
  },
  "issues": [...],
  "coverage": { "endpoints": "89.2%", "components": "71.4%" }
}
```

### **4. Reporte Markdown**
Ideal para documentación y PRs con resumen ejecutivo y recomendaciones.

---

## 🎯 **Tipos de Issues Detectados**

| Severidad | Tipo | Descripción |
|-----------|------|-------------|
| 🔴 **Crítico** | `MISSING_BACKEND_ENDPOINT` | Frontend llama endpoint que no existe |
| 🔴 **Crítico** | `SENSITIVE_ENDPOINT_NO_AUTH` | Endpoint sensible sin autenticación |
| 🟠 **Alto** | `MISSING_AUTH_HEADER` | Falta header de autenticación |
| 🟠 **Alto** | `MISSING_URL_PARAM` | Parámetro requerido faltante |
| 🟡 **Medio** | `MISSING_BODY_FIELD` | Campo esperado en body faltante |
| 🟡 **Medio** | `DUPLICATE_COMPONENT` | Componente duplicado frontend/DS |
| ⚪ **Bajo** | `UNUSED_ENDPOINT` | Endpoint backend sin uso |
| ⚪ **Bajo** | `UNUSED_DS_COMPONENT` | Componente DS sin uso |

---

## 🤖 **Integración CI/CD**

### **GitHub Actions**

El bot incluye workflows listos para usar:

```yaml
# .github/workflows/audit.yml
- name: 🔍 DGuard Audit
  uses: ./
  with:
    backend_repo: 'tu-usuario/DGuardAPI'
    frontend_repo: 'tu-usuario/DGuard'
    fail_on_critical: true
```

**Características:**
- ✅ Ejecución automática en PRs
- ✅ Comentarios en PRs con resumen
- ✅ Artifacts con reportes completos
- ✅ Notificaciones Slack/Email opcionales
- ✅ Auditorías programadas diarias

### **Configuración de Secrets**

```bash
# GitHub Secrets necesarios (opcionales)
GH_PAT=ghp_xxxxxxxxxxxx                    # Para repos privados
SLACK_WEBHOOK_URL=https://hooks.slack.com/...  # Notificaciones Slack
EMAIL_USERNAME=audit@empresa.com           # Reportes por email
EMAIL_PASSWORD=app_password_here
```

---

## 🎪 **Dashboard Interactivo**

```bash
npm run dashboard
```

**Funciones:**
- 📊 Vista general de métricas
- 🔍 Búsqueda de endpoints específicos
- 📋 Navegación por issues por severidad
- 🧩 Explorador de componentes del DS
- 📈 Métricas de rendimiento
- 🔄 Ejecutar nueva auditoría desde el dashboard

---

## 🛠️ **Arquitectura**

```
dguard-audit-bot/
├── src/
│   ├── analyzers/          # Análisis de código
│   │   ├── BackendAnalyzer.js      # Detecta endpoints Express/Node
│   │   ├── FrontendAnalyzer.js     # Detecta llamadas API React
│   │   └── DesignSystemAnalyzer.js # Detecta componentes DS
│   ├── validators/         # Validaciones cruzadas
│   │   ├── EndpointValidator.js    # Valida endpoints vs llamadas
│   │   ├── SecurityValidator.js    # Valida autenticación/seguridad
│   │   └── ComponentValidator.js   # Valida uso de componentes
│   ├── reporters/          # Generación de reportes
│   │   ├── JSONReporter.js         # Datos estructurados
│   │   ├── HTMLReporter.js         # Reporte visual
│   │   ├── MarkdownReporter.js     # Documentación
│   │   └── ConsoleReporter.js      # Salida terminal
│   └── utils/              # Utilidades
│       ├── fileUtils.js            # Manejo de archivos
│       └── astUtils.js             # Parsing de código
├── config/                 # Configuración
│   ├── projects.config.js          # Configuración principal
│   └── default.config.js           # Valores por defecto
├── scripts/                # Scripts auxiliares
│   ├── setup.sh                    # Configuración inicial
│   └── dashboard.js                # Dashboard interactivo
└── .github/workflows/      # CI/CD
    ├── audit.yml                   # Auditoría en PRs
    └── scheduled-audit.yml         # Auditorías programadas
```

---

## 📈 **Ejemplo de Resultados**

### **Antes de DGuard Audit Bot:**
```
❌ 15 endpoints del frontend sin correspondencia en backend
❌ 8 endpoints sensibles sin autenticación  
❌ 23 componentes del DS sin utilizar
❌ 45 minutos investigando issues manualmente
```

### **Después de DGuard Audit Bot:**
```
✅ Issues detectados automáticamente en 3.2s
✅ Reportes visuales listos para compartir
✅ Integración en CI/CD previene regresiones
✅ Dashboard para exploración interactiva
✅ 95% reducción en tiempo de debugging
```

---

## 🔧 **Comandos Avanzados**

```bash
# Auditoría solo de endpoints críticos
npm run audit -- --only-critical --ci

# Watch con debounce personalizado
npm run audit:watch -- --debounce 5000

# Auditoría con configuración custom
npm run audit -- --config ./mi-config.js

# Limpiar reportes antiguos
npm run clean

# Validar configuración
npm run validate-config

# Generar reporte de ejemplo
npm run audit -- --mock-data
```

---

## 🤝 **Contribuir**

### **Setup de Desarrollo**

```bash
git clone https://github.com/santiagogarcia/dguard-audit-bot.git
cd dguard-audit-bot
npm install
npm run audit -- --help  # Verificar que funciona
```

### **Estructura de Commits**

```bash
feat: nueva funcionalidad
fix: corrección de bug  
docs: documentación
test: tests
refactor: refactoring
perf: mejora de rendimiento
```

### **Pull Requests**

1. Fork del repositorio
2. Crear branch: `git checkout -b feature/nueva-funcionalidad`
3. Commits descriptivos
4. Tests que pasen: `npm test`
5. PR con descripción clara

---

## 🐛 **Troubleshooting**

### **Problemas Comunes**

**❌ "Cannot find module"**
```bash
npm install
npm run audit -- --version
```

**❌ "Path not found"**
```bash
# Verificar rutas en config/projects.config.js
npm run validate-config
```

**❌ "Parse errors"**
```bash
# Algunos archivos TypeScript con sintaxis avanzada
# Se muestran warnings pero no afectan el análisis
```

**❌ "Permission denied"**
```bash
chmod +x scripts/setup.sh
chmod +x scripts/dashboard.js
```

### **Debug Mode**

```bash
# Más información de debugging
npm run audit -- --verbose

# Solo logs de errores
npm run audit -- --quiet

# Salvar logs a archivo
npm run audit 2>&1 | tee audit.log
```

---

## 📚 **Casos de Uso**

### **Para Desarrolladores**
- ✅ Validar cambios antes de commit
- ✅ Detectar breaking changes
- ✅ Optimizar uso del Design System

### **Para Tech Leads**
- ✅ Auditorías de arquitectura
- ✅ Reportes de cobertura de APIs
- ✅ Métricas de calidad del código

### **Para DevOps**
- ✅ Gates de calidad en CI/CD
- ✅ Monitoreo continuo
- ✅ Reportes automatizados

### **Para QA**
- ✅ Detección temprana de bugs
- ✅ Validación de integración
- ✅ Coverage de testing de APIs

---

## 🔮 **Roadmap**

- [ ] **v1.1**: Soporte para Vue.js y Angular
- [ ] **v1.2**: Análisis de performance de APIs
- [ ] **v1.3**: Integración con herramientas de monitoring (Sentry, DataDog)
- [ ] **v1.4**: Plugin para VS Code
- [ ] **v1.5**: Machine Learning para predicción de issues
- [ ] **v1.6**: Soporte para GraphQL
- [ ] **v2.0**: Dashboard web completo

---

## 📄 **Licencia**

MIT © [Santiago García](https://github.com/santiagogarcia)

---

## 🙏 **Agradecimientos**

- **DGuard Team** - Por el proyecto original
- **Babel Team** - Por las herramientas de parsing
- **Community** - Por feedback y contribuciones

---

## 📞 **Soporte**

- 🐛 **Issues**: [GitHub Issues](https://github.com/santiagogarcia/dguard-audit-bot/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/santiagogarcia/dguard-audit-bot/discussions)
- 📧 **Email**: santiago@dguard.com

---

**⭐ Si DGuard Ultra Audit Bot te resulta útil, ¡dale una estrella en GitHub!**

---

*Generado con ❤️ para el ecosistema DGuard*