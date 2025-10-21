import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import simpleGit from 'simple-git';
import chalk from 'chalk';
import ora from 'ora';

export default class RepositoryManager {
  constructor(config = {}) {
    this.token = config.token || process.env.GH_PAT || process.env.GITHUB_TOKEN;
    this.workspaceDir = config.workspaceDir || './workspace';
    this.tempDir = config.tempDir || './temp-repos';
    this.cleanupOnExit = config.cleanupOnExit !== false;
    
    if (!this.token) {
      throw new Error('GitHub token is required. Set GH_PAT or GITHUB_TOKEN environment variable.');
    }
    
    // Initialize Octokit with token
    this.octokit = new Octokit({
      auth: this.token,
      userAgent: 'dguard-audit-bot/1.0.0'
    });
    
    // Initialize simple-git
    this.git = simpleGit();
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Setup cleanup on exit
    if (this.cleanupOnExit) {
      this.setupCleanup();
    }
    
    // Track cloned repositories
    this.clonedRepos = new Map();
  }

  ensureDirectories() {
    [this.workspaceDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  setupCleanup() {
    const cleanup = () => {
      console.log(chalk.yellow('\n🧹 Cleaning up temporary repositories...'));
      this.cleanup();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  }

  async validateToken() {
    try {
      const { data: user } = await this.octokit.rest.users.getAuthenticated();
      console.log(chalk.green(`✅ GitHub token valid for user: ${user.login}`));
      return {
        valid: true,
        user: {
          login: user.login,
          name: user.name,
          email: user.email,
          scopes: await this.getTokenScopes()
        }
      };
    } catch (error) {
      console.error(chalk.red('❌ GitHub token validation failed:'), error.message);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async getTokenScopes() {
    try {
      const response = await this.octokit.request('GET /user');
      const scopes = response.headers['x-oauth-scopes'];
      return scopes ? scopes.split(', ') : [];
    } catch {
      return [];
    }
  }

  async getRepositoryInfo(owner, repo) {
    try {
      const { data } = await this.octokit.rest.repos.get({
        owner,
        repo
      });
      
      return {
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        private: data.private,
        defaultBranch: data.default_branch,
        language: data.language,
        size: data.size,
        cloneUrl: data.clone_url,
        sshUrl: data.ssh_url,
        htmlUrl: data.html_url,
        updatedAt: data.updated_at,
        permissions: {
          admin: data.permissions?.admin || false,
          push: data.permissions?.push || false,
          pull: data.permissions?.pull || false
        }
      };
    } catch (error) {
      if (error.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found or not accessible`);
      }
      throw new Error(`Failed to get repository info: ${error.message}`);
    }
  }

  async cloneRepository(owner, repo, options = {}) {
    const spinner = ora(`Cloning ${owner}/${repo}...`).start();
    
    try {
      // Get repository info first
      const repoInfo = await this.getRepositoryInfo(owner, repo);
      
      const localPath = path.join(
        options.temporary ? this.tempDir : this.workspaceDir,
        `${owner}-${repo}`
      );
      
      // Remove existing directory if it exists
      if (fs.existsSync(localPath)) {
        await fs.promises.rm(localPath, { recursive: true, force: true });
      }
      
      // Prepare clone URL with token
      const cloneUrl = `https://${this.token}@github.com/${owner}/${repo}.git`;
      
      // Clone options
      const cloneOptions = {
        '--depth': options.depth || 1,
        '--branch': options.branch || repoInfo.defaultBranch,
        '--single-branch': options.singleBranch !== false
      };
      
      // Clone repository
      await this.git.clone(cloneUrl, localPath, cloneOptions);
      
      // Track cloned repository
      const repoData = {
        owner,
        repo,
        localPath,
        clonedAt: new Date(),
        temporary: options.temporary || false,
        branch: options.branch || repoInfo.defaultBranch,
        ...repoInfo
      };
      
      this.clonedRepos.set(`${owner}/${repo}`, repoData);
      
      spinner.succeed(`✅ Cloned ${owner}/${repo} to ${localPath}`);
      
      return repoData;
    } catch (error) {
      spinner.fail(`❌ Failed to clone ${owner}/${repo}`);
      throw new Error(`Clone failed: ${error.message}`);
    }
  }

  async cloneMultipleRepositories(repositories, options = {}) {
    const results = [];
    const errors = [];
    
    console.log(chalk.cyan(`📥 Cloning ${repositories.length} repositories...`));
    
    for (const repo of repositories) {
      try {
        let owner, repoName;
        
        if (typeof repo === 'string') {
          [owner, repoName] = repo.split('/');
        } else {
          owner = repo.owner;
          repoName = repo.repo || repo.name;
        }
        
        const repoOptions = {
          ...options,
          ...(typeof repo === 'object' ? repo.options : {})
        };
        
        const result = await this.cloneRepository(owner, repoName, repoOptions);
        results.push(result);
        
      } catch (error) {
        const repoId = typeof repo === 'string' ? repo : `${repo.owner}/${repo.repo}`;
        errors.push({ repo: repoId, error: error.message });
        console.error(chalk.red(`❌ ${repoId}: ${error.message}`));
      }
    }
    
    if (errors.length > 0) {
      console.log(chalk.yellow(`⚠️  ${errors.length} repositories failed to clone`));
    }
    
    console.log(chalk.green(`✅ Successfully cloned ${results.length} repositories`));
    
    return {
      success: results,
      errors,
      total: repositories.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }

  async pullLatestChanges(owner, repo) {
    const repoKey = `${owner}/${repo}`;
    const repoData = this.clonedRepos.get(repoKey);
    
    if (!repoData) {
      throw new Error(`Repository ${repoKey} not found in cloned repositories`);
    }
    
    const spinner = ora(`Pulling latest changes for ${repoKey}...`).start();
    
    try {
      const git = simpleGit(repoData.localPath);
      await git.pull();
      
      // Update last updated time
      repoData.lastPulled = new Date();
      this.clonedRepos.set(repoKey, repoData);
      
      spinner.succeed(`✅ Updated ${repoKey}`);
      return repoData;
    } catch (error) {
      spinner.fail(`❌ Failed to update ${repoKey}`);
      throw new Error(`Pull failed: ${error.message}`);
    }
  }

  async switchBranch(owner, repo, branch) {
    const repoKey = `${owner}/${repo}`;
    const repoData = this.clonedRepos.get(repoKey);
    
    if (!repoData) {
      throw new Error(`Repository ${repoKey} not found in cloned repositories`);
    }
    
    const spinner = ora(`Switching to branch ${branch} in ${repoKey}...`).start();
    
    try {
      const git = simpleGit(repoData.localPath);
      
      // Fetch branch if it doesn't exist locally
      try {
        await git.checkout(branch);
      } catch {
        // Try to fetch and checkout remote branch
        await git.fetch('origin', branch);
        await git.checkout(['-b', branch, `origin/${branch}`]);
      }
      
      // Update repository data
      repoData.branch = branch;
      repoData.lastBranchSwitch = new Date();
      this.clonedRepos.set(repoKey, repoData);
      
      spinner.succeed(`✅ Switched to branch ${branch} in ${repoKey}`);
      return repoData;
    } catch (error) {
      spinner.fail(`❌ Failed to switch branch in ${repoKey}`);
      throw new Error(`Branch switch failed: ${error.message}`);
    }
  }

  async getRepositoryStatus(owner, repo) {
    const repoKey = `${owner}/${repo}`;
    const repoData = this.clonedRepos.get(repoKey);
    
    if (!repoData) {
      throw new Error(`Repository ${repoKey} not found in cloned repositories`);
    }
    
    try {
      const git = simpleGit(repoData.localPath);
      const status = await git.status();
      const log = await git.log(['--oneline', '-10']);
      
      return {
        ...repoData,
        gitStatus: {
          current: status.current,
          tracking: status.tracking,
          ahead: status.ahead,
          behind: status.behind,
          modified: status.modified,
          not_added: status.not_added,
          conflicted: status.conflicted,
          staged: status.staged,
          deleted: status.deleted,
          renamed: status.renamed
        },
        recentCommits: log.latest ? log.all.slice(0, 5) : [],
        lastCommit: log.latest
      };
    } catch (error) {
      throw new Error(`Failed to get repository status: ${error.message}`);
    }
  }

  async createWorkspaceFromConfig(projectConfig) {
    const repositories = [];
    
    // Extract repository information from project config
    if (projectConfig.github?.repositories) {
      Object.entries(projectConfig.github.repositories).forEach(([key, repo]) => {
        if (typeof repo === 'string') {
          repositories.push({
            key,
            owner: projectConfig.github.owner,
            repo,
            type: key
          });
        } else {
          repositories.push({
            key,
            owner: repo.owner || projectConfig.github.owner,
            repo: repo.name || repo.repo,
            branch: repo.branch,
            type: key,
            options: repo.options
          });
        }
      });
    }
    
    if (repositories.length === 0) {
      throw new Error('No repositories found in project configuration');
    }
    
    console.log(chalk.cyan('🏗️  Creating workspace from configuration...'));
    
    const cloneResults = await this.cloneMultipleRepositories(
      repositories.map(r => ({
        owner: r.owner,
        repo: r.repo,
        options: {
          branch: r.branch,
          temporary: false,
          ...r.options
        }
      })),
      { temporary: false }
    );
    
    // Update project config with local paths
    const updatedConfig = { ...projectConfig };
    
    cloneResults.success.forEach(repoData => {
      const repoConfig = repositories.find(r => 
        r.owner === repoData.owner && r.repo === repoData.repo
      );
      
      if (repoConfig && updatedConfig.projects[repoConfig.key]) {
        updatedConfig.projects[repoConfig.key].path = repoData.localPath;
        updatedConfig.projects[repoConfig.key].githubInfo = {
          owner: repoData.owner,
          repo: repoData.repo,
          branch: repoData.branch,
          clonedAt: repoData.clonedAt
        };
      }
    });
    
    return {
      config: updatedConfig,
      repositories: cloneResults,
      workspace: this.getWorkspaceInfo()
    };
  }

  async syncWorkspace() {
    console.log(chalk.cyan('🔄 Synchronizing workspace...'));
    
    const promises = Array.from(this.clonedRepos.entries()).map(async ([repoKey, repoData]) => {
      try {
        await this.pullLatestChanges(repoData.owner, repoData.repo);
        return { success: true, repo: repoKey };
      } catch (error) {
        return { success: false, repo: repoKey, error: error.message };
      }
    });
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(chalk.green(`✅ Synchronized ${successful.length} repositories`));
    
    if (failed.length > 0) {
      console.log(chalk.yellow(`⚠️  ${failed.length} repositories failed to sync`));
      failed.forEach(f => {
        console.log(chalk.red(`  ❌ ${f.repo}: ${f.error}`));
      });
    }
    
    return {
      successful: successful.length,
      failed: failed.length,
      details: results
    };
  }

  getWorkspaceInfo() {
    const repos = Array.from(this.clonedRepos.values());
    
    return {
      totalRepositories: repos.length,
      temporaryRepos: repos.filter(r => r.temporary).length,
      permanentRepos: repos.filter(r => !r.temporary).length,
      languages: [...new Set(repos.map(r => r.language).filter(Boolean))],
      totalSize: repos.reduce((sum, r) => sum + (r.size || 0), 0),
      repositories: repos.map(r => ({
        name: r.fullName,
        path: r.localPath,
        branch: r.branch,
        language: r.language,
        private: r.private,
        clonedAt: r.clonedAt,
        temporary: r.temporary
      }))
    };
  }

  getClonedRepository(owner, repo) {
    const repoKey = `${owner}/${repo}`;
    return this.clonedRepos.get(repoKey);
  }

  listClonedRepositories() {
    return Array.from(this.clonedRepos.values());
  }

  async cleanup() {
    try {
      // Clean temporary repositories
      const tempRepos = Array.from(this.clonedRepos.values())
        .filter(repo => repo.temporary);
      
      for (const repo of tempRepos) {
        if (fs.existsSync(repo.localPath)) {
          await fs.promises.rm(repo.localPath, { recursive: true, force: true });
          console.log(chalk.gray(`🗑️  Removed temporary repo: ${repo.fullName}`));
        }
        this.clonedRepos.delete(`${repo.owner}/${repo.repo}`);
      }
      
      // Clean empty temp directory
      if (fs.existsSync(this.tempDir)) {
        const files = await fs.promises.readdir(this.tempDir);
        if (files.length === 0) {
          await fs.promises.rmdir(this.tempDir);
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Cleanup failed:'), error.message);
    }
  }

  async cleanupAll() {
    try {
      // Remove all cloned repositories
      for (const repo of this.clonedRepos.values()) {
        if (fs.existsSync(repo.localPath)) {
          await fs.promises.rm(repo.localPath, { recursive: true, force: true });
          console.log(chalk.gray(`🗑️  Removed repo: ${repo.fullName}`));
        }
      }
      
      this.clonedRepos.clear();
      
      // Clean directories
      for (const dir of [this.tempDir, this.workspaceDir]) {
        if (fs.existsSync(dir)) {
          await fs.promises.rm(dir, { recursive: true, force: true });
          console.log(chalk.gray(`🗑️  Removed directory: ${dir}`));
        }
      }
      
      console.log(chalk.green('✅ All repositories and workspace cleaned'));
    } catch (error) {
      console.error(chalk.red('❌ Full cleanup failed:'), error.message);
    }
  }

  // Utility methods for GitHub API

  async searchRepositories(query, options = {}) {
    try {
      const { data } = await this.octokit.rest.search.repos({
        q: query,
        sort: options.sort || 'updated',
        order: options.order || 'desc',
        per_page: options.perPage || 30,
        page: options.page || 1
      });
      
      return {
        total: data.total_count,
        repositories: data.items.map(repo => ({
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          private: repo.private,
          updatedAt: repo.updated_at,
          htmlUrl: repo.html_url
        }))
      };
    } catch (error) {
      throw new Error(`Repository search failed: ${error.message}`);
    }
  }

  async listUserRepositories(username = null, options = {}) {
    try {
      const { data } = await this.octokit.rest.repos.listForUser({
        username: username || (await this.octokit.rest.users.getAuthenticated()).data.login,
        type: options.type || 'all',
        sort: options.sort || 'updated',
        direction: options.direction || 'desc',
        per_page: options.perPage || 100,
        page: options.page || 1
      });
      
      return data.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        private: repo.private,
        fork: repo.fork,
        archived: repo.archived,
        disabled: repo.disabled,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch,
        permissions: repo.permissions
      }));
    } catch (error) {
      throw new Error(`Failed to list repositories: ${error.message}`);
    }
  }

  async getBranches(owner, repo) {
    try {
      const { data } = await this.octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 100
      });
      
      return data.map(branch => ({
        name: branch.name,
        protected: branch.protected,
        commit: {
          sha: branch.commit.sha,
          url: branch.commit.url
        }
      }));
    } catch (error) {
      throw new Error(`Failed to get branches: ${error.message}`);
    }
  }

  async getCommits(owner, repo, options = {}) {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: options.branch,
        since: options.since,
        until: options.until,
        per_page: options.perPage || 30,
        page: options.page || 1
      });
      
      return data.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: commit.commit.committer.date
        },
        url: commit.html_url
      }));
    } catch (error) {
      throw new Error(`Failed to get commits: ${error.message}`);
    }
  }
}