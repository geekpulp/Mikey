import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { Logger } from './logger';

const execFileAsync = promisify(execFile);

/**
 * Configuration for Copilot CLI execution
 */
export interface CopilotExecutionConfig {
  prompt: string;
  prdFile?: string;
  skills?: string[];
  allowProfile?: 'safe' | 'dev' | 'locked';
  allowTools?: string[];
  denyTools?: string[];
  model?: string;
  iterations?: number;
  workspaceRoot: string;
}

/**
 * Result of Copilot CLI execution
 */
export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

/**
 * PromptExecutor - Handles direct execution of Copilot CLI
 * 
 * This replaces the external bash scripts (ralph.sh, ralph-once.sh) by directly
 * executing the Copilot CLI with the appropriate context and tool restrictions.
 */
export class PromptExecutor {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Execute a prompt with Copilot CLI
   * 
   * @param config - Configuration for execution
   * @returns Promise resolving to execution result
   */
  async execute(config: CopilotExecutionConfig): Promise<ExecutionResult> {
    try {
      this.logger.info('Starting Copilot execution', {
        promptFile: config.prompt,
        prdFile: config.prdFile,
        skills: config.skills,
        profile: config.allowProfile,
      });

      // Validate Copilot CLI is available
      try {
        await execFileAsync('which', ['copilot']);
      } catch {
        throw new Error(
          'Copilot CLI (copilot command) not found. Please install it and ensure it is in your PATH.'
        );
      }

      // Create context file with combined prompt + attachments
      const contextFile = await this.createContextFile(config);

      try {
        // Build copilot CLI arguments
        const args = this.buildCopilotArgs(config, contextFile);

        this.logger.debug('Executing copilot command', { args });

        // Execute copilot
        const result = await execFileAsync('copilot', args, {
          cwd: config.workspaceRoot,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
        });

        this.logger.info('Copilot execution completed successfully');

        return {
          success: true,
          output: result.stdout,
        };
      } finally {
        // Clean up context file
        try {
          fs.unlinkSync(contextFile);
        } catch (err) {
          this.logger.debug('Failed to clean up context file', err);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Copilot execution failed', error);

      return {
        success: false,
        output: '',
        error: errorMessage,
        exitCode: error instanceof Error && 'code' in error ? (error as any).code : undefined,
      };
    }
  }

  /**
   * Create a temporary file with combined context (skills, PRD, progress)
   * 
   * @param config - Execution configuration
   * @returns Path to the created context file
   */
  private async createContextFile(config: CopilotExecutionConfig): Promise<string> {
    const contextParts: string[] = ['# Context'];

    // Add skills if specified
    if (config.skills && config.skills.length > 0) {
      contextParts.push('');
      contextParts.push('## Skills');

      for (const skill of config.skills) {
        const skillFile = path.join(config.workspaceRoot, 'skills', skill, 'SKILL.md');

        if (!fs.existsSync(skillFile)) {
          throw new Error(`Skill file not found: ${skillFile}`);
        }

        const skillContent = fs.readFileSync(skillFile, 'utf-8');
        contextParts.push('');
        contextParts.push(`### ${skill}`);
        contextParts.push('');
        contextParts.push(skillContent);
      }
    }

    // Add PRD if specified
    if (config.prdFile) {
      if (!fs.existsSync(config.prdFile)) {
        throw new Error(`PRD file not found: ${config.prdFile}`);
      }

      const prdContent = fs.readFileSync(config.prdFile, 'utf-8');
      contextParts.push('');
      contextParts.push(`## PRD (${path.relative(config.workspaceRoot, config.prdFile)})`);
      contextParts.push(prdContent);
    }

    // Add progress.txt if exists
    const progressFile = path.join(config.workspaceRoot, 'progress.txt');
    if (fs.existsSync(progressFile)) {
      const progressContent = fs.readFileSync(progressFile, 'utf-8');
      contextParts.push('');
      contextParts.push('## progress.txt');
      contextParts.push(progressContent);
    }

    // Add the actual prompt
    contextParts.push('');
    contextParts.push('# Prompt');
    contextParts.push('');
    
    const promptContent = fs.readFileSync(config.prompt, 'utf-8');
    contextParts.push(promptContent);

    // Create temporary file
    const contextContent = contextParts.join('\n') + '\n';
    const contextFile = path.join(config.workspaceRoot, `.mikey-context-${Date.now()}`);
    
    fs.writeFileSync(contextFile, contextContent, 'utf-8');
    
    this.logger.debug('Created context file', { path: contextFile });

    return contextFile;
  }

  /**
   * Build command line arguments for Copilot CLI
   * 
   * @param config - Execution configuration
   * @param contextFile - Path to context file
   * @returns Array of arguments for copilot command
   */
  private buildCopilotArgs(config: CopilotExecutionConfig, contextFile: string): string[] {
    const args: string[] = [];

    // Add directory context
    args.push('--add-dir', config.workspaceRoot);

    // Add model if specified
    args.push('--model', config.model || 'claude-sonnet-4.5');

    // Output formatting
    args.push('--no-color');
    args.push('--stream', 'off');
    args.push('--silent');

    // Add prompt with context file
    args.push("-p", `@${contextFile} Follow the attached prompt.`);

    // Always deny dangerous commands
    args.push('--deny-tool', 'shell(rm)');
    args.push('--deny-tool', 'shell(git push)');

    // Add user-specified deny tools
    if (config.denyTools) {
      for (const tool of config.denyTools) {
        args.push('--deny-tool', tool);
      }
    }

    // Handle tool permissions based on profile or explicit allow list
    if (config.allowProfile) {
      switch (config.allowProfile) {
        case 'dev':
          args.push('--allow-all-tools');
          args.push('--allow-tool', 'write');
          args.push('--allow-tool', 'shell(pnpm:*)');
          args.push('--allow-tool', 'shell(git:*)');
          break;

        case 'safe':
          args.push('--allow-tool', 'write');
          args.push('--allow-tool', 'shell(pnpm:*)');
          args.push('--allow-tool', 'shell(git:*)');
          break;

        case 'locked':
          args.push('--allow-tool', 'write');
          break;
      }
    }

    // Add explicit allow tools if specified
    if (config.allowTools) {
      for (const tool of config.allowTools) {
        args.push('--allow-tool', tool);
      }
    }

    return args;
  }

  /**
   * Check if Copilot CLI is available on the system
   * 
   * @returns Promise resolving to true if Copilot CLI is available
   */
  async isCopilotAvailable(): Promise<boolean> {
    try {
      await execFileAsync('which', ['copilot']);
      return true;
    } catch {
      return false;
    }
  }
}
