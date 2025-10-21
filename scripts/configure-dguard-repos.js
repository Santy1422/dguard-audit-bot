#!/usr/bin/env node

/**
 * Script para configurar automáticamente los repositorios DGuard
 * con los workflows de auditoría
 */

import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const workflowContent = `name: 🔍 DGuard Audit Trigger

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
    if: \${{ github.event_name == 'push' || github.event.pull_request.draft == false }}
    
    steps:
      - name: 🚀 Trigger External Audit
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          script: |
            const payload = {
              event_type: github.event_name === 'pull_request' ? 'dguard-pr-opened' : 'dguard-push',
              client_payload: {
                repository: context.repo.owner + '/' + context.repo.repo,
                pr_number: context.payload.pull_request?.number || null,
                action: context.payload.action || 'push',
                ref: context.ref,
                sha: context.sha,
                sender: context.payload.sender?.login || 'unknown',
                event_name: github.event_name
              }
            };
            
            console.log('🔍 Triggering DGuard Ultra Audit Bot...');
            console.log('Repository:', payload.client_payload.repository);
            console.log('Event Type:', payload.event_type);
            console.log('PR Number:', payload.client_payload.pr_number);
            
            try {
              await github.rest.repos.createDispatchEvent({
                owner: 'Santy1422',
                repo: 'dguard-audit-bot',
                ...payload
              });
              
              console.log('✅ DGuard audit triggered successfully');
              
              // Post initial comment on PR if it's a PR event
              if (github.event_name === 'pull_request' && context.payload.pull_request?.number) {
                try {
                  await github.rest.issues.createComment({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: context.payload.pull_request.number,
                    body: \`## 🤖 DGuard Ultra Audit Bot
                    
🔍 **Análisis iniciado automáticamente**

El DGuard Ultra Audit Bot está analizando este PR. Los resultados aparecerán aquí en breve.

### 🔧 Análisis en progreso:
- ✅ Detección de endpoints y APIs
- ✅ Validación de seguridad y autenticación  
- ✅ Análisis de llamadas entre frontend y backend
- ✅ Sugerencias de optimización AI-powered

**Tiempo estimado:** 2-3 minutos

---
*Este comentario se actualizará automáticamente con los resultados.*\`
                  });
                  
                  console.log('📝 Initial comment posted to PR');
                } catch (commentError) {
                  console.log('⚠️ Could not post initial comment:', commentError.message);
                }
              }
              
            } catch (error) {
              console.error('❌ Failed to trigger audit:', error.message);
              core.setFailed('Failed to trigger DGuard audit: ' + error.message);
            }
`;

class DGuardRepoConfigurator {
  constructor() {
    const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token requerido (GH_PAT o GITHUB_TOKEN)');
    }
    
    this.octokit = new Octokit({ auth: token });
    
    // Repositorios principales DGuard
    this.mainRepos = [
      'ai-sapira/DGuardAPI',
      'ai-sapira/DGuard'
    ];
  }

  async configureRepository(repoFullName) {
    const [owner, repo] = repoFullName.split('/');
    
    console.log(`\n🔧 Configurando ${owner}/${repo}...`);
    
    try {
      // Verificar acceso al repositorio
      await this.octokit.rest.repos.get({ owner, repo });
      console.log(`✅ Acceso confirmado a ${owner}/${repo}`);
      
      // Crear o actualizar el workflow
      await this.createOrUpdateWorkflow(owner, repo);
      
      console.log(`✅ ${owner}/${repo} configurado exitosamente`);
      return true;
      
    } catch (error) {
      if (error.status === 404) {
        console.log(`❌ Sin acceso al repositorio ${owner}/${repo}`);
        console.log(`   💡 Necesitas agregar manualmente el workflow file`);
        return false;
      } else {
        console.error(`❌ Error configurando ${owner}/${repo}:`, error.message);
        return false;
      }
    }
  }

  async createOrUpdateWorkflow(owner, repo) {
    const workflowPath = '.github/workflows/dguard-audit.yml';
    
    try {
      // Verificar si el workflow ya existe
      let existingFile = null;
      try {
        const response = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path: workflowPath
        });
        existingFile = response.data;
        console.log(`   📝 Workflow existente encontrado, actualizando...`);
      } catch (error) {
        console.log(`   📝 Creando nuevo workflow file...`);
      }

      const commitMessage = existingFile 
        ? '🤖 Update DGuard Ultra Audit workflow'
        : '🚀 Add DGuard Ultra Audit workflow';

      const requestBody = {
        owner,
        repo,
        path: workflowPath,
        message: commitMessage,
        content: Buffer.from(workflowContent).toString('base64'),
        committer: {
          name: 'DGuard Ultra Audit Bot',
          email: 'noreply@dguard.com'
        }
      };

      if (existingFile) {
        requestBody.sha = existingFile.sha;
      }

      await this.octokit.rest.repos.createOrUpdateFileContents(requestBody);
      
      console.log(`   ✅ Workflow ${existingFile ? 'actualizado' : 'creado'} exitosamente`);
      
    } catch (error) {
      throw new Error(`Failed to create/update workflow: ${error.message}`);
    }
  }

  async run() {
    console.log('🚀 CONFIGURADOR DE REPOSITORIOS DGUARD');
    console.log('='.repeat(50));
    
    let successCount = 0;
    let failCount = 0;
    
    for (const repo of this.mainRepos) {
      const success = await this.configureRepository(repo);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMEN DE CONFIGURACIÓN');
    console.log('='.repeat(50));
    console.log(`✅ Repositorios configurados: ${successCount}`);
    console.log(`❌ Repositorios con errores: ${failCount}`);
    
    if (successCount > 0) {
      console.log('\n🎉 ¡Configuración exitosa!');
      console.log('\n📋 Repositorios listos para análisis automático:');
      for (const repo of this.mainRepos) {
        console.log(`   • ${repo}`);
      }
      console.log('\n🔍 Cada PR en estos repositorios será analizado automáticamente');
    }
    
    if (failCount > 0) {
      console.log('\n⚠️  Configuración manual requerida para algunos repositorios');
      console.log('📖 Ver: docs/SETUP-DGUARD-REPOS.md para instrucciones manuales');
    }
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const configurator = new DGuardRepoConfigurator();
  configurator.run().catch(error => {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  });
}

export default DGuardRepoConfigurator;