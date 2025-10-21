# 🔧 Configuración de Repositorios DGuard

## Configuración Automática del DGuard Ultra Audit Bot

Para que el bot analice automáticamente los PRs en los repositorios DGuard, necesitas agregar este workflow a cada repositorio.

### 📋 Repositorios DGuard a Configurar

1. **ai-sapira/DGuardAPI** - Backend principal
2. **ai-sapira/DGuard** - Frontend React
3. **ai-sapira/DGuard-Phishing-API** - API de detección de phishing
4. **ai-sapira/DGuard-URL-Checker** - Servicio de verificación de URLs

---

## 🚀 Paso 1: Agregar Workflow a Cada Repositorio

En cada repositorio DGuard, crea el archivo `.github/workflows/dguard-audit.yml` con este contenido:

```yaml
name: 🔍 DGuard Audit Trigger

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  trigger-audit:
    name: Trigger DGuard Audit Bot
    runs-on: ubuntu-latest
    if: github.event.pull_request.draft == false
    
    steps:
      - name: 🚀 Trigger External Audit
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const payload = {
              event_type: github.event_name === 'pull_request' ? 'dguard-pr-opened' : 'dguard-push',
              client_payload: {
                repository: context.repo.owner + '/' + context.repo.repo,
                pr_number: context.payload.pull_request?.number || null,
                action: context.payload.action || 'push',
                ref: context.ref,
                sha: context.sha,
                sender: context.payload.sender?.login || 'unknown'
              }
            };
            
            console.log('Triggering DGuard audit with payload:', payload);
            
            // Trigger the audit bot repository
            await github.rest.repos.createDispatchEvent({
              owner: 'Santy1422',
              repo: 'dguard-audit-bot',
              ...payload
            });
            
            console.log('✅ DGuard audit triggered successfully');
```

---

## 🔑 Paso 2: Configurar Secrets (Opcional)

Si necesitas secrets adicionales, agrega en cada repositorio:

1. Ve a `Settings` → `Secrets and variables` → `Actions`
2. Agrega estos secrets:
   - `DGUARD_AUDIT_TOKEN`: Token para comunicación con el bot (opcional)

---

## 🧪 Paso 3: Probar la Configuración

### Método Manual
1. Crea un PR de prueba en cualquier repositorio DGuard
2. El workflow debería ejecutarse automáticamente
3. El DGuard Ultra Audit Bot recibirá el evento y analizará el repositorio
4. Los resultados aparecerán como comentarios en el PR

### Método Automático (Usando API)
Si tienes permisos de administrador en los repositorios, puedes usar:

```bash
# Desde el directorio dguard-audit-bot
node scripts/setup-webhooks.js
```

---

## 📊 Qué Sucede Cuando se Ejecuta

### En el Repositorio DGuard:
1. ✅ Se ejecuta el workflow `dguard-audit.yml`
2. 🚀 Se envía un evento al audit bot repository
3. ⏳ El workflow continúa mientras se procesa

### En el Audit Bot Repository:
1. 📥 Recibe el evento de repository dispatch
2. 🔍 Clona el repositorio DGuard objective
3. 🤖 Ejecuta el análisis completo
4. 📝 Comenta en el PR original con resultados
5. ✅ Establece status checks apropiados

---

## 🔧 Configuración Avanzada

### Personalizar Análisis por Repositorio

Edita `.github/workflows/external-repo-monitor.yml` en el audit bot para configurar análisis específicos:

```yaml
# Para backends (DGuardAPI, DGuard-Phishing-API, etc.)
npm run audit -- \
  --backend ./external-analysis/target-repo \
  --format all \
  --github \
  --target-repo "$TARGET_REPO" \
  --pr-number "$PR_NUMBER" \
  --ci

# Para frontend (DGuard)
npm run audit -- \
  --frontend ./external-analysis/target-repo \
  --format all \
  --github \
  --target-repo "$TARGET_REPO" \
  --pr-number "$PR_NUMBER" \
  --ci
```

### Filtros por Archivo
Solo analizar ciertos archivos modificados:

```yaml
- name: 🔍 Analyze changed files (PR only)
  if: github.event_name == 'pull_request'
  run: |
    git diff --name-only origin/${{ github.base_ref }}..HEAD > changed-files.txt
    # Solo analizar si hay archivos .js, .ts, .jsx, .tsx modificados
    if grep -E "\\.(js|ts|jsx|tsx)$" changed-files.txt; then
      echo "JavaScript/TypeScript files changed, proceeding with audit"
    else
      echo "No relevant files changed, skipping audit"
      exit 0
    fi
```

---

## 🎯 Funcionalidades Habilitadas

Una vez configurado, cada PR en repositorios DGuard tendrá:

### 🔍 Análisis Automático
- ✅ Detección de endpoints backend
- ✅ Análisis de llamadas API frontend
- ✅ Validación cruzada entre backend y frontend
- ✅ Análisis de seguridad y autenticación
- ✅ Sugerencias de optimización AI-powered

### 📝 Comentarios Automáticos
- 📊 Resumen ejecutivo de issues
- 🚨 Issues críticos destacados
- 🟠 Issues de alta prioridad
- 💡 Sugerencias de mejora
- 📈 Métricas de cobertura

### ✅ Status Checks
- 🔴 FAIL: Issues críticos detectados
- 🟠 PENDING: Issues de alta prioridad
- ✅ SUCCESS: Sin issues críticos

### 🚀 Auto-fix (Opcional)
Incluye `[auto-fix]` en la descripción del PR para intentar auto-reparación de issues comunes.

---

## 🎉 ¡Configuración Completa!

Una vez agregado el workflow a los 4 repositorios DGuard, el sistema estará completamente funcional y analizará automáticamente todos los PRs.

**Resultado**: Cada PR en DGuardAPI, DGuard, DGuard-Phishing-API y DGuard-URL-Checker tendrá análisis automático con comentarios detallados y status checks. 🚀