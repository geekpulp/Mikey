import * as vscode from 'vscode';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { ConfigManager } from './config';

const execAsync = promisify(exec);

/**
 * Executes a git command in the specified directory
 * @param cwd - Working directory for git command
 * @param args - Git command arguments
 * @returns Command stdout output
 * @throws Error if command fails
 */
export async function execGitCommand(cwd: string, args: string[]): Promise<string> {
	const command = `git ${args.join(' ')}`;
	const { stdout, stderr } = await execAsync(command, { cwd });
	
	if (stderr && !stderr.includes('Switched to branch') && !stderr.includes('Already up to date')) {
		throw new Error(stderr);
	}
	
	return stdout;
}

/**
 * Gets the current git branch name
 * @param workspaceRoot - Workspace root path
 * @returns Current branch name
 */
export async function getCurrentBranch(workspaceRoot: string): Promise<string> {
	const result = await execGitCommand(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
	return result.trim();
}

/**
 * Checks if a branch name is a feature branch
 * @param branchName - Branch name to check
 * @returns True if it's a feature branch (not main/master/develop)
 */
export function isFeatureBranch(branchName: string): boolean {
	const mainBranches = ['main', 'master', 'develop', 'dev'];
	return !mainBranches.includes(branchName);
}

/**
 * Gets list of changed files in current feature branch
 * @param workspaceRoot - Workspace root path
 * @returns Array of changed file paths
 */
export async function getChangedFiles(workspaceRoot: string): Promise<string[]> {
	try {
		const currentBranch = await getCurrentBranch(workspaceRoot);
		
		// Only show changed files if we're on a feature branch
		if (!isFeatureBranch(currentBranch)) {
			return [];
		}
		
		// Get files changed between current branch and main
		const diffOutput = await execGitCommand(workspaceRoot, ['diff', '--name-only', 'main...HEAD']);
		
		// Also get uncommitted changes
		const statusOutput = await execGitCommand(workspaceRoot, ['status', '--porcelain']);
		
		const changedFiles = new Set<string>();
		
		// Add files from diff with main
		diffOutput.split('\n').forEach(file => {
			if (file.trim()) {
				changedFiles.add(file.trim());
			}
		});
		
		// Add uncommitted files
		statusOutput.split('\n').forEach(line => {
			const match = line.match(/^\s*[MADRCU?]+\s+(.+)$/);
			if (match) {
				changedFiles.add(match[1].trim());
			}
		});
		
		return Array.from(changedFiles).sort();
	} catch (error) {
		// If there's an error (e.g., main branch doesn't exist), return empty array
		return [];
	}
}

/**
 * Opens a diff view comparing file on feature branch vs main
 * @param filePath - Relative path to file
 */
export async function openFileDiff(filePath: string): Promise<void> {
	try {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!workspaceRoot) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}
		
		const config = ConfigManager.getInstance();
		const fileUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
		const currentBranch = await getCurrentBranch(workspaceRoot);
		
		// Create a URI for the file on the main branch for comparison
		const mainUri = fileUri.with({
			scheme: 'git',
			path: fileUri.path,
			query: JSON.stringify({ ref: config.getMainBranch(), path: filePath })
		});
		
		// Open diff view
		await vscode.commands.executeCommand('vscode.diff', mainUri, fileUri, `${filePath} (${config.getMainBranch()} ↔ ${currentBranch})`);
		
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
	}
}

/**
 * Handles merging feature branch into main when item is completed
 * @param workspaceRoot - Workspace root path
 * @param itemDescription - Description of item being completed
 */
export async function handleCompletionMerge(workspaceRoot: string, itemDescription?: string): Promise<void> {
	try {
		// Get current branch
		const currentBranch = await getCurrentBranch(workspaceRoot);
		
		// Check if we're on a feature branch
		if (!isFeatureBranch(currentBranch)) {
			// Not on a feature branch, nothing to merge
			return;
		}
		
		// Prompt user for confirmation
		const featureBranch = currentBranch;
		const message = `Merge feature branch '${featureBranch}' into main?\n\nThis will:\n• Switch to main branch\n• Pull latest changes\n• Merge ${featureBranch}\n• Push to remote\n• Delete ${featureBranch} locally`;
		
		const choice = await vscode.window.showInformationMessage(
			message,
			{ modal: true },
			'Merge & Complete',
			'Skip Merge'
		);
		
		if (choice !== 'Merge & Complete') {
			return;
		}
		
		// Show progress
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Merging feature branch',
			cancellable: false
		}, async (progress) => {
			progress.report({ message: 'Switching to main branch...' });
			await execGitCommand(workspaceRoot, ['checkout', 'main']);
			
			progress.report({ message: 'Pulling latest changes...' });
			await execGitCommand(workspaceRoot, ['pull']);
			
			progress.report({ message: `Merging ${featureBranch}...` });
			await execGitCommand(workspaceRoot, ['merge', featureBranch, '--no-ff', '-m', `Merge ${featureBranch}: ${itemDescription || 'Completed item'}`]);
			
			progress.report({ message: 'Pushing to remote...' });
			await execGitCommand(workspaceRoot, ['push', 'origin', 'main']);
			
			progress.report({ message: 'Cleaning up feature branch...' });
			await execGitCommand(workspaceRoot, ['branch', '-d', featureBranch]);
			
			return;
		});
		
		vscode.window.showInformationMessage(`✓ Successfully merged ${featureBranch} into main and pushed to remote`);
		
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to merge branch: ${error}`);
	}
}
