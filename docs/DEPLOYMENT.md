# 🚀 DGuard Ultra Audit Bot - Guía de Deployment

Esta guía completa te llevará paso a paso para deployar DGuard Ultra Audit Bot en diferentes entornos de producción.

---

## 📋 **Tabla de Contenidos**

1. [Requisitos Previos](#requisitos-previos)
2. [Deployment Local](#deployment-local)
3. [Deployment con Docker](#deployment-con-docker)
4. [Deployment en GitHub Actions](#deployment-en-github-actions)
5. [Deployment en Cloud (AWS/GCP/Azure)](#deployment-en-cloud)
6. [Deployment con CI/CD](#deployment-con-cicd)
7. [Configuración de Monitoreo](#configuración-de-monitoreo)
8. [Configuración de Notificaciones](#configuración-de-notificaciones)
9. [Mantenimiento y Updates](#mantenimiento-y-updates)
10. [Troubleshooting](#troubleshooting)

---

## 🔧 **Requisitos Previos**

### **Software Requerido**

```bash
# Node.js 18+ y npm
node --version  # >= 18.0.0
npm --version   # >= 8.0.0

# Git
git --version

# Docker (opcional)
docker --version
docker-compose --version
```

### **Accesos Necesarios**

- **GitHub Token (PAT)** - Para clonar repositorios privados
- **Rutas a proyectos** - DGuardAPI, DGuard Frontend, Design System
- **Permisos de escritura** - Para generar reportes
- **Red** - Acceso a npm registry y GitHub

---

## 🏠 **Deployment Local**

### **1. Instalación Inicial**

```bash
# Clonar el repositorio
git clone https://github.com/santiagogarcia/dguard-audit-bot.git
cd dguard-audit-bot

# Ejecutar setup automático
npm run setup
```

### **2. Configuración**

Edita `config/projects.config.js`:

```javascript
export default {
  projects: {
    backend: {
      name: 'DGuardAPI',
      path: '/ruta/absoluta/a/DGuardAPI',  // 👈 Cambiar
      type: 'nodejs-express'
    },
    frontend: {
      name: 'DGuard',
      path: '/ruta/absoluta/a/DGuard',     // 👈 Cambiar
      type: 'react'
    },
    designSystem: {
      name: 'Design System',
      path: '/ruta/absoluta/a/design-system', // 👈 Cambiar
      type: 'react-components'
    }
  },
  github: {
    owner: 'tu-usuario',                    // 👈 Cambiar
    repositories: {
      backend: 'DGuardAPI',
      frontend: 'DGuard',
      designSystem: 'design-system'
    }
  }
};
```

### **3. Validar Configuración**

```bash
# Verificar configuración
npm run validate-config

# Test básico
npm run audit -- --help

# Primera auditoría
npm run audit
```

### **4. Configurar como Servicio (Linux/Mac)**

```bash
# Crear script de servicio
sudo tee /etc/systemd/system/dguard-audit.service > /dev/null <<EOF
[Unit]
Description=DGuard Audit Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/dguard-audit-bot
ExecStart=/usr/bin/npm run audit:watch
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Activar servicio
sudo systemctl enable dguard-audit
sudo systemctl start dguard-audit
sudo systemctl status dguard-audit
```

---

## 🐳 **Deployment con Docker**

### **1. Crear Dockerfile**

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache git

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Crear directorios necesarios
RUN mkdir -p reports .audit-history .audit-cache logs

# Exponer puerto para dashboard web (opcional)
EXPOSE 3000

# Comando por defecto
CMD ["npm", "run", "audit"]
```

### **2. Crear docker-compose.yml**

```yaml
# docker-compose.yml
version: '3.8'

services:
  dguard-audit:
    build: .
    container_name: dguard-audit-bot
    volumes:
      # Montar proyectos (ajustar rutas)
      - /path/to/DGuardAPI:/app/projects/backend:ro
      - /path/to/DGuard:/app/projects/frontend:ro
      - /path/to/design-system:/app/projects/design-system:ro
      
      # Persistir reportes y cache
      - ./reports:/app/reports
      - ./audit-cache:/app/.audit-cache
      - ./logs:/app/logs
      
      # Configuración personalizada
      - ./config/projects.config.js:/app/config/projects.config.js:ro
    
    environment:
      - NODE_ENV=production
      - GH_PAT=${GH_PAT}
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
    
    restart: unless-stopped
    
    # Auditoría programada cada 6 horas
    command: sh -c "
      echo '0 */6 * * * cd /app && npm run audit' | crontab - &&
      crond -f"

  # Dashboard web opcional
  dguard-dashboard:
    build: .
    container_name: dguard-dashboard
    ports:
      - "3000:3000"
    volumes:
      - ./reports:/app/reports:ro
    command: npm run dashboard:web
    depends_on:
      - dguard-audit
```

### **3. Build y Deploy**

```bash
# Configurar variables de entorno
echo "GH_PAT=ghp_your_token_here" > .env
echo "SLACK_WEBHOOK_URL=https://hooks.slack.com/..." >> .env

# Build y ejecutar
docker-compose up -d

# Ver logs
docker-compose logs -f dguard-audit

# Ejecutar auditoría manual
docker-compose exec dguard-audit npm run audit

# Ver dashboard
open http://localhost:3000
```

### **4. Docker en Producción**

```bash
# Para producción, usar imagen optimizada
docker build -t dguard-audit:prod .

# Ejecutar con configuración de producción
docker run -d \
  --name dguard-audit-prod \
  --restart unless-stopped \
  -v /data/projects:/app/projects:ro \
  -v /data/reports:/app/reports \
  -v /data/config:/app/config:ro \
  -e NODE_ENV=production \
  -e GH_PAT=$GH_PAT \
  dguard-audit:prod
```

---

## 🤖 **Deployment en GitHub Actions**

### **1. Configurar Secrets**

En tu repositorio de GitHub, ve a **Settings → Secrets and variables → Actions**:

```bash
# Secrets requeridos
GH_PAT=ghp_xxxxxxxxxxxx               # GitHub Personal Access Token
SLACK_WEBHOOK_URL=https://hooks.slack.com/...  # Notificaciones Slack
EMAIL_USERNAME=audit@empresa.com       # Email para reportes
EMAIL_PASSWORD=app_password_here       # Password de email

# Secrets opcionales
TEAMS_WEBHOOK_URL=https://outlook.office.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### **2. Workflow de Auditoría en PRs**

El workflow ya está incluido en `.github/workflows/audit.yml`. Para activarlo:

```yaml
# .github/workflows/audit.yml (ya incluido)
name: 🔍 DGuard Audit

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]
  workflow_dispatch:

# ... (workflow completo ya está en el repositorio)
```

### **3. Workflow Programado**

```yaml
# .github/workflows/scheduled-audit.yml (ya incluido)
name: 📅 Scheduled DGuard Audit

on:
  schedule:
    - cron: '0 9 * * 1-5'  # Lunes a Viernes a las 9 AM UTC
  workflow_dispatch:

# ... (workflow completo ya está en el repositorio)
```

### **4. Configurar en Repositorio Objetivo**

```bash
# En tu repositorio DGuardAPI o DGuard
mkdir -p .github/workflows

# Copiar workflow
cp path/to/dguard-audit-bot/.github/workflows/audit.yml .github/workflows/

# Customizar para tu proyecto
# Editar variables de entorno en el workflow
```

---

## ☁️ **Deployment en Cloud**

### **AWS (EC2 + Lambda)**

#### **Opción 1: EC2 Instance**

```bash
# 1. Crear EC2 instance (Ubuntu 20.04+)
# 2. Conectar por SSH
ssh -i your-key.pem ubuntu@your-ec2-ip

# 3. Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Clonar y configurar
git clone https://github.com/santiagogarcia/dguard-audit-bot.git
cd dguard-audit-bot
npm install

# 5. Configurar como servicio
sudo npm run setup
sudo systemctl enable dguard-audit
sudo systemctl start dguard-audit

# 6. Configurar nginx para dashboard (opcional)
sudo apt install nginx
sudo tee /etc/nginx/sites-available/dguard-audit > /dev/null <<EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/dguard-audit /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

#### **Opción 2: AWS Lambda**

```javascript
// lambda-function.js
import { handler as auditHandler } from './src/lambda-handler.js';

export const handler = async (event, context) => {
  return await auditHandler(event, context);
};
```

```bash
# Deploy con AWS CLI
zip -r dguard-audit-lambda.zip .
aws lambda create-function \
  --function-name dguard-audit \
  --runtime nodejs18.x \
  --handler index.handler \
  --zip-file fileb://dguard-audit-lambda.zip \
  --role arn:aws:iam::your-account:role/lambda-execution-role

# Configurar trigger programado
aws events put-rule \
  --name dguard-audit-schedule \
  --schedule-expression "rate(6 hours)"
```

### **Google Cloud Platform (Cloud Run)**

```bash
# 1. Crear Dockerfile para Cloud Run
# (usar el Dockerfile anterior)

# 2. Build y push a Container Registry
gcloud builds submit --tag gcr.io/your-project/dguard-audit

# 3. Deploy a Cloud Run
gcloud run deploy dguard-audit \
  --image gcr.io/your-project/dguard-audit \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production

# 4. Configurar Cloud Scheduler para ejecución programada
gcloud scheduler jobs create http dguard-audit-job \
  --schedule="0 */6 * * *" \
  --uri=https://your-service-url/audit \
  --http-method=POST
```

### **Microsoft Azure (Container Instances)**

```bash
# 1. Login a Azure
az login

# 2. Crear resource group
az group create --name dguard-audit-rg --location eastus

# 3. Deploy container
az container create \
  --resource-group dguard-audit-rg \
  --name dguard-audit \
  --image your-registry/dguard-audit:latest \
  --restart-policy Always \
  --environment-variables NODE_ENV=production \
  --secure-environment-variables GH_PAT=your-token

# 4. Configurar Logic Apps para programación
```

---

## 🔄 **Deployment con CI/CD**

### **Jenkins Pipeline**

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        GH_PAT = credentials('github-pat')
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'nvm use $NODE_VERSION'
                sh 'npm ci'
            }
        }
        
        stage('Validate Config') {
            steps {
                sh 'npm run validate-config'
            }
        }
        
        stage('Run Audit') {
            steps {
                sh 'npm run audit:ci'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/**/*', allowEmptyArchive: true
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'reports',
                        reportFiles: 'audit-report.html',
                        reportName: 'DGuard Audit Report'
                    ])
                }
            }
        }
        
        stage('Notify') {
            steps {
                script {
                    if (currentBuild.result == 'FAILURE') {
                        sh 'npm run notify:slack'
                    }
                }
            }
        }
    }
}
```

### **GitLab CI/CD**

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - audit
  - notify

variables:
  NODE_VERSION: "18"

before_script:
  - apt-get update -qq && apt-get install -y -qq git curl
  - curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  - apt-get install -y nodejs
  - npm ci

validate_config:
  stage: validate
  script:
    - npm run validate-config

run_audit:
  stage: audit
  script:
    - npm run audit:ci
  artifacts:
    reports:
      junit: reports/junit.xml
    paths:
      - reports/
    expire_in: 1 week
  only:
    - main
    - merge_requests

notify_results:
  stage: notify
  script:
    - npm run notify:slack
  when: on_failure
  only:
    - main
```

---

## 📊 **Configuración de Monitoreo**

### **1. Health Checks**

```javascript
// scripts/health-check.js
#!/usr/bin/env node

import fs from 'fs';
import chalk from 'chalk';

async function healthCheck() {
  const checks = {
    configExists: fs.existsSync('config/projects.config.js'),
    reportsDir: fs.existsSync('reports'),
    cacheDir: fs.existsSync('.audit-cache'),
    lastReport: checkLastReport(),
    diskSpace: checkDiskSpace(),
    permissions: checkPermissions()
  };

  const allHealthy = Object.values(checks).every(check => check === true);
  
  console.log(chalk.bold('🏥 DGuard Audit Bot - Health Check\n'));
  
  Object.entries(checks).forEach(([check, status]) => {
    const icon = status ? '✅' : '❌';
    console.log(`${icon} ${check}: ${status}`);
  });

  process.exit(allHealthy ? 0 : 1);
}

function checkLastReport() {
  try {
    const stats = fs.statSync('reports/audit-report.json');
    const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    return ageHours < 24; // Report menos de 24 horas
  } catch {
    return false;
  }
}

function checkDiskSpace() {
  // Implementar check de espacio en disco
  return true; // Placeholder
}

function checkPermissions() {
  try {
    fs.accessSync('reports', fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

healthCheck();
```

### **2. Monitoring con Prometheus**

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

  dguard-exporter:
    build: ./monitoring/exporter
    ports:
      - "8080:8080"
    depends_on:
      - dguard-audit

volumes:
  grafana-data:
```

### **3. Alerting**

```javascript
// scripts/alerting.js
import nodemailer from 'nodemailer';

export class AlertManager {
  constructor() {
    this.thresholds = {
      criticalIssues: 0,
      highIssues: 5,
      reportAge: 24 * 60 * 60 * 1000 // 24 horas
    };
  }

  async checkAlerts(report) {
    const alerts = [];

    if (report.summary.issues.critical > this.thresholds.criticalIssues) {
      alerts.push({
        severity: 'CRITICAL',
        message: `${report.summary.issues.critical} issues críticos detectados`,
        action: 'Acción inmediata requerida'
      });
    }

    if (report.summary.issues.high > this.thresholds.highIssues) {
      alerts.push({
        severity: 'HIGH',
        message: `${report.summary.issues.high} issues altos detectados`,
        action: 'Revisar y corregir pronto'
      });
    }

    return alerts;
  }

  async sendAlerts(alerts) {
    for (const alert of alerts) {
      await this.sendSlackAlert(alert);
      await this.sendEmailAlert(alert);
    }
  }
}
```

---

## 📢 **Configuración de Notificaciones**

### **1. Slack Integration**

```javascript
// scripts/notify-slack.js
#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs';

async function notifySlack() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('SLACK_WEBHOOK_URL not configured');
    return;
  }

  const report = JSON.parse(fs.readFileSync('reports/audit-report.json', 'utf8'));
  
  const color = report.summary.issues.critical > 0 ? 'danger' : 
                report.summary.issues.high > 0 ? 'warning' : 'good';

  const message = {
    text: '🔍 DGuard Audit Report',
    attachments: [{
      color,
      fields: [
        {
          title: 'Issues Críticos',
          value: report.summary.issues.critical,
          short: true
        },
        {
          title: 'Issues Altos',
          value: report.summary.issues.high,
          short: true
        },
        {
          title: 'Total Issues',
          value: report.summary.issues.total,
          short: true
        },
        {
          title: 'Endpoints Backend',
          value: report.summary.backend.endpoints,
          short: true
        }
      ],
      footer: 'DGuard Audit Bot',
      ts: Math.floor(Date.now() / 1000)
    }]
  };

  await axios.post(webhookUrl, message);
  console.log('✅ Slack notification sent');
}

notifySlack().catch(console.error);
```

### **2. Microsoft Teams**

```javascript
// scripts/notify-teams.js
#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs';

async function notifyTeams() {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) return;

  const report = JSON.parse(fs.readFileSync('reports/audit-report.json', 'utf8'));
  
  const card = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "summary": "DGuard Audit Report",
    "themeColor": report.summary.issues.critical > 0 ? "FF6B6B" : "4ECDC4",
    "sections": [{
      "activityTitle": "🔍 DGuard Audit Completado",
      "facts": [
        { "name": "Issues Críticos", "value": report.summary.issues.critical },
        { "name": "Issues Altos", "value": report.summary.issues.high },
        { "name": "Total Issues", "value": report.summary.issues.total },
        { "name": "Endpoints", "value": report.summary.backend.endpoints }
      ]
    }],
    "potentialAction": [{
      "@type": "OpenUri",
      "name": "Ver Reporte Completo",
      "targets": [{
        "os": "default",
        "uri": "https://github.com/your-repo/actions"
      }]
    }]
  };

  await axios.post(webhookUrl, card);
  console.log('✅ Teams notification sent');
}

notifyTeams().catch(console.error);
```

### **3. Discord**

```javascript
// scripts/notify-discord.js
#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs';

async function notifyDiscord() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const report = JSON.parse(fs.readFileSync('reports/audit-report.json', 'utf8'));
  
  const embed = {
    title: "🔍 DGuard Audit Report",
    color: report.summary.issues.critical > 0 ? 0xFF6B6B : 0x4ECDC4,
    fields: [
      { name: "Issues Críticos", value: report.summary.issues.critical, inline: true },
      { name: "Issues Altos", value: report.summary.issues.high, inline: true },
      { name: "Total Issues", value: report.summary.issues.total, inline: true }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "DGuard Audit Bot" }
  };

  await axios.post(webhookUrl, { embeds: [embed] });
  console.log('✅ Discord notification sent');
}

notifyDiscord().catch(console.error);
```

---

## 🔄 **Mantenimiento y Updates**

### **1. Actualización Automática**

```bash
# Script de actualización
#!/bin/bash
# scripts/update.sh

echo "🔄 Actualizando DGuard Audit Bot..."

# Backup de configuración
cp config/projects.config.js config/projects.config.js.backup

# Pull cambios
git pull origin main

# Actualizar dependencias
npm update

# Verificar configuración
npm run validate-config

# Test básico
npm run audit -- --help

echo "✅ Actualización completada"
```

### **2. Backup y Restore**

```javascript
// scripts/backup.js
#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import archiver from 'archiver';

async function createBackup() {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const backupName = `dguard-audit-backup-${timestamp}.zip`;
  
  const output = createWriteStream(backupName);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`✅ Backup creado: ${backupName} (${archive.pointer()} bytes)`);
  });

  archive.pipe(output);

  // Incluir archivos importantes
  archive.directory('config/', 'config/');
  archive.directory('reports/', 'reports/');
  archive.directory('.audit-history/', '.audit-history/');
  archive.file('package.json', { name: 'package.json' });

  await archive.finalize();
}

createBackup().catch(console.error);
```

### **3. Migración entre Versiones**

```javascript
// scripts/migrate.js
#!/usr/bin/env node

import fs from 'fs';
import semver from 'semver';

async function migrate() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const currentVersion = packageJson.version;
  
  console.log(`Migrando desde versión ${currentVersion}`);
  
  // Ejecutar migraciones según versión
  if (semver.lt(currentVersion, '1.1.0')) {
    await migrateToV1_1_0();
  }
  
  if (semver.lt(currentVersion, '1.2.0')) {
    await migrateToV1_2_0();
  }
  
  console.log('✅ Migración completada');
}

async function migrateToV1_1_0() {
  console.log('🔄 Migrando a v1.1.0...');
  
  // Crear nuevos directorios
  if (!fs.existsSync('.audit-cache')) {
    fs.mkdirSync('.audit-cache', { recursive: true });
  }
  
  // Migrar configuración
  const configPath = 'config/projects.config.js';
  if (fs.existsSync(configPath)) {
    let config = fs.readFileSync(configPath, 'utf8');
    
    // Agregar nuevas opciones si no existen
    if (!config.includes('cache:')) {
      config = config.replace(
        'export default {',
        `export default {
  cache: {
    enabled: true,
    ttl: 3600
  },`
      );
      fs.writeFileSync(configPath, config);
    }
  }
}

async function migrateToV1_2_0() {
  console.log('🔄 Migrando a v1.2.0...');
  
  // Migrar reportes al nuevo formato
  const reportsDir = 'reports';
  if (fs.existsSync(reportsDir)) {
    const files = fs.readdirSync(reportsDir);
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(reportsDir, file);
        const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Agregar nuevos campos si no existen
        if (!report.metadata) {
          report.metadata = {
            version: '1.2.0',
            timestamp: new Date().toISOString()
          };
          
          fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        }
      }
    });
  }
}

migrate().catch(console.error);
```

---

## 🚨 **Troubleshooting**

### **Problemas Comunes**

#### **1. "Cannot find module" Error**

```bash
# Solución
rm -rf node_modules package-lock.json
npm install
npm run audit -- --version
```

#### **2. "Permission denied" Error**

```bash
# Verificar permisos
ls -la reports/ .audit-history/

# Corregir permisos
chmod -R 755 reports/ .audit-history/ .audit-cache/
chown -R $(whoami) reports/ .audit-history/ .audit-cache/
```

#### **3. "Path not found" Error**

```bash
# Verificar configuración
npm run validate-config

# Verificar rutas
ls -la /ruta/a/tu/DGuardAPI
ls -la /ruta/a/tu/DGuard
```

#### **4. Parse Errors en TypeScript**

```bash
# Los archivos TypeScript complejos pueden generar warnings
# Esto es normal y no afecta el análisis
npm run audit -- --verbose  # Para ver más detalles
```

#### **5. GitHub Actions Failures**

```bash
# Verificar secrets
echo $GH_PAT | wc -c  # Debe ser > 40 caracteres

# Verificar permisos del token
curl -H "Authorization: token $GH_PAT" https://api.github.com/user

# Debug workflow
# Agregar en el workflow:
- name: Debug
  run: |
    echo "Node version: $(node --version)"
    echo "NPM version: $(npm --version)"
    ls -la
```

#### **6. Docker Container Issues**

```bash
# Ver logs detallados
docker logs dguard-audit-bot --tail 100

# Ejecutar modo interactivo para debug
docker run -it --rm dguard-audit-bot sh

# Verificar montajes de volúmenes
docker inspect dguard-audit-bot | grep Mounts -A 10
```

#### **7. Cache Issues**

```bash
# Limpiar cache completamente
npm run audit:cache:clear

# Ver estadísticas del cache
npm run audit:cache:stats

# Verificar espacio en disco
df -h
```

#### **8. Performance Issues**

```bash
# Usar análisis rápido
npm run audit:quick

# Verificar exclusiones en configuración
# Agregar a projects.config.js:
ignorePatterns: [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/coverage/**'
]

# Usar cache
npm run audit  # Cache se activará automáticamente
```

### **Logs y Debugging**

```bash
# Habilitar logs detallados
export DEBUG=dguard:*
npm run audit

# Logs a archivo
npm run audit 2>&1 | tee audit.log

# Analizar performance
npm run audit:benchmark
```

### **Contacto y Soporte**

- **GitHub Issues**: [Reportar problemas](https://github.com/santiagogarcia/dguard-audit-bot/issues)
- **Discussions**: [Preguntas y sugerencias](https://github.com/santiagogarcia/dguard-audit-bot/discussions)
- **Email**: santiago@dguard.com

---

## 🎯 **Checklist de Deployment**

### **Pre-Deployment**

- [ ] Node.js 18+ instalado
- [ ] Git configurado
- [ ] Rutas de proyectos verificadas
- [ ] Tokens de GitHub configurados
- [ ] Permisos de escritura verificados

### **Local Deployment**

- [ ] `npm run setup` ejecutado exitosamente
- [ ] `npm run validate-config` pasa
- [ ] `npm run audit` funciona correctamente
- [ ] Reportes se generan en `reports/`

### **Docker Deployment**

- [ ] Dockerfile creado y probado
- [ ] docker-compose.yml configurado
- [ ] Volúmenes montados correctamente
- [ ] Variables de entorno configuradas
- [ ] Container se ejecuta sin errores

### **Cloud Deployment**

- [ ] Servicio cloud configurado (AWS/GCP/Azure)
- [ ] Secrets y variables de entorno configuradas
- [ ] Networking y permisos configurados
- [ ] Monitoring y logging configurados
- [ ] Backup y recovery configurados

### **CI/CD Deployment**

- [ ] GitHub Actions configurado
- [ ] Secrets del repositorio configurados
- [ ] Workflows probados
- [ ] Notificaciones configuradas
- [ ] Artifacts y reportes se guardan correctamente

### **Production Readiness**

- [ ] Health checks funcionando
- [ ] Monitoring configurado
- [ ] Alerting configurado
- [ ] Backup automatizado
- [ ] Documentación actualizada
- [ ] Equipo entrenado en el uso

---

**🎉 ¡Felicidades! Tu DGuard Ultra Audit Bot está listo para producción.**

Para cualquier pregunta o problema, consulta la [documentación completa](../README.md) o contacta al equipo de soporte.