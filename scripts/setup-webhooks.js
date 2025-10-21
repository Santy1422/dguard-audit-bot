#!/usr/bin/env node

/**
 * DGuard Webhook Setup Script
 * Configura webhooks en repositorios DGuard para análisis automático
 */

import { Octokit } from '@octokit/rest';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

class WebhookSetup {
    constructor() {
        const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error('GitHub token requerido (GH_PAT o GITHUB_TOKEN)');
        }
        
        this.octokit = new Octokit({ auth: token });
        this.auditBotRepo = 'Santy1422/dguard-audit-bot';
        
        // Repositorios DGuard objetivo (rutas exactas verificadas)
        this.targetRepos = [
            'ai-sapira/DGuardAPI',
            'ai-sapira/DGuard', 
            'ai-sapira/DGuard-Phishing-API',
            'ai-sapira/DGuard-URL-Checker'
        ];
    }

    async setupWebhooksForAllRepos() {
        console.log('🔧 Configurando webhooks para repositorios DGuard...\n');
        
        for (const repo of this.targetRepos) {
            try {
                await this.setupWebhookForRepo(repo);
                console.log(`✅ Webhook configurado para ${repo}\n`);
            } catch (error) {
                console.error(`❌ Error configurando webhook para ${repo}:`, error.message, '\n');
            }
        }
    }

    async setupWebhookForRepo(repositoryFullName) {
        const [owner, repo] = repositoryFullName.split('/');
        
        console.log(`📡 Configurando webhook para ${owner}/${repo}...`);
        
        try {
            // Verificar si ya existe un webhook similar
            const existingWebhooks = await this.octokit.rest.repos.listWebhooks({
                owner,
                repo
            });
            
            const existingWebhook = existingWebhooks.data.find(webhook => 
                webhook.config.url && webhook.config.url.includes('dguard-audit-bot')
            );
            
            if (existingWebhook) {
                console.log(`   ℹ️  Webhook ya existe, actualizando...`);
                await this.updateWebhook(owner, repo, existingWebhook.id);
            } else {
                console.log(`   🆕 Creando nuevo webhook...`);
                await this.createWebhook(owner, repo);
            }
            
        } catch (error) {
            if (error.status === 404) {
                console.log(`   ⚠️  Repositorio no encontrado o sin permisos: ${owner}/${repo}`);
            } else {
                throw error;
            }
        }
    }

    async createWebhook(owner, repo) {
        const webhookConfig = {
            owner,
            repo,
            name: 'web',
            active: true,
            events: ['pull_request', 'push'],
            config: {
                url: `https://api.github.com/repos/${this.auditBotRepo}/dispatches`,
                content_type: 'json',
                secret: process.env.WEBHOOK_SECRET || 'dguard-audit-secret',
                insecure_ssl: '0'
            }
        };

        const response = await this.octokit.rest.repos.createWebhook(webhookConfig);
        console.log(`   ✅ Webhook creado con ID: ${response.data.id}`);
        
        return response.data;
    }

    async updateWebhook(owner, repo, webhookId) {
        const webhookConfig = {
            owner,
            repo,
            hook_id: webhookId,
            active: true,
            events: ['pull_request', 'push'],
            config: {
                url: `https://api.github.com/repos/${this.auditBotRepo}/dispatches`,
                content_type: 'json',
                secret: process.env.WEBHOOK_SECRET || 'dguard-audit-secret',
                insecure_ssl: '0'
            }
        };

        const response = await this.octokit.rest.repos.updateWebhook(webhookConfig);
        console.log(`   ✅ Webhook actualizado con ID: ${webhookId}`);
        
        return response.data;
    }

    async createWorkflowFileForRepo(repositoryFullName) {
        const [owner, repo] = repositoryFullName.split('/');
        
        console.log(`📝 Creando workflow file para ${owner}/${repo}...`);
        
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
    if: github.event.pull_request.draft == false
    
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
`;

        try {
            // Verificar si el archivo ya existe
            let existingFile = null;
            try {
                const response = await this.octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: '.github/workflows/dguard-audit.yml'
                });
                existingFile = response.data;
            } catch (error) {
                // Archivo no existe, lo crearemos
            }

            if (existingFile) {
                // Actualizar archivo existente
                await this.octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: '.github/workflows/dguard-audit.yml',
                    message: '🤖 Update DGuard audit workflow',
                    content: Buffer.from(workflowContent).toString('base64'),
                    sha: existingFile.sha
                });
                console.log(`   ✅ Workflow actualizado en ${owner}/${repo}`);
            } else {
                // Crear nuevo archivo
                await this.octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: '.github/workflows/dguard-audit.yml',
                    message: '🚀 Add DGuard audit workflow',
                    content: Buffer.from(workflowContent).toString('base64')
                });
                console.log(`   ✅ Workflow creado en ${owner}/${repo}`);
            }
        } catch (error) {
            console.error(`   ❌ Error creando workflow en ${owner}/${repo}:`, error.message);
        }
    }

    async setupWorkflowsForAllRepos() {
        console.log('\n📝 Configurando workflows en repositorios DGuard...\n');
        
        for (const repo of this.targetRepos) {
            try {
                await this.createWorkflowFileForRepo(repo);
                console.log(`✅ Workflow configurado para ${repo}\n`);
            } catch (error) {
                console.error(`❌ Error configurando workflow para ${repo}:`, error.message, '\n');
            }
        }
    }

    async testConnection() {
        console.log('🔍 Probando conexión con GitHub API...\n');
        
        try {
            const { data: user } = await this.octokit.rest.users.getAuthenticated();
            console.log(`✅ Conectado como: ${user.login}`);
            console.log(`   Tipo de cuenta: ${user.type}`);
            console.log(`   Permisos: ${user.permissions ? 'Admin' : 'Limitados'}\n`);
            
            // Verificar acceso a repositorios objetivo
            for (const repo of this.targetRepos) {
                const [owner, repoName] = repo.split('/');
                try {
                    await this.octokit.rest.repos.get({ owner, repo: repoName });
                    console.log(`✅ Acceso confirmado: ${repo}`);
                } catch (error) {
                    console.log(`❌ Sin acceso: ${repo} (${error.status})`);
                }
            }
        } catch (error) {
            console.error('❌ Error de conexión:', error.message);
            throw error;
        }
    }

    async run() {
        try {
            await this.testConnection();
            
            console.log('\n' + '='.repeat(60));
            console.log('🚀 CONFIGURACIÓN DGUARD ULTRA AUDIT BOT');
            console.log('='.repeat(60) + '\n');
            
            // Configurar workflows en repositorios DGuard
            await this.setupWorkflowsForAllRepos();
            
            console.log('='.repeat(60));
            console.log('✅ CONFIGURACIÓN COMPLETADA');
            console.log('='.repeat(60) + '\n');
            
            console.log('📋 Resumen:');
            console.log(`   • ${this.targetRepos.length} repositorios configurados`);
            console.log('   • Workflows de GitHub Actions creados');
            console.log('   • Análisis automático habilitado en PRs');
            console.log('\n🎉 ¡El DGuard Ultra Audit Bot está listo para analizar automáticamente todos los PRs de DGuard!');
            
        } catch (error) {
            console.error('\n❌ Error durante la configuración:', error.message);
            process.exit(1);
        }
    }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    const setup = new WebhookSetup();
    setup.run();
}

export default WebhookSetup;