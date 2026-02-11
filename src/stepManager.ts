import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PrdItem } from './prdTreeDataProvider';
import { STATUS_MARKERS } from './constants';
import { Logger } from './logger';

const logger = Logger.getInstance();

/**
 * Builds chat context for starting work on a PRD item or step
 * @param item - PRD item
 * @param workspaceRoot - Workspace root path
 * @param stepIndex - Optional step index to focus on
 * @returns Formatted context string for chat
 */
export function buildChatContext(item: PrdItem, workspaceRoot: string, stepIndex?: number): string {
	const progressFile = path.join(workspaceRoot, 'progress.txt');
	
	let progressContent = '';
	if (fs.existsSync(progressFile)) {
		progressContent = fs.readFileSync(progressFile, 'utf-8');
	}

	// Load prompt template
	let promptTemplate = '';
	const config = vscode.workspace.getConfiguration('mikey');
	const templatePath = config.get<string>('promptTemplate', 'prompts/default.txt');
	const fullTemplatePath = path.join(workspaceRoot, templatePath);
	
	if (fs.existsSync(fullTemplatePath)) {
		promptTemplate = fs.readFileSync(fullTemplatePath, 'utf-8');
	}

	// Load relevant skill references
	const skillContext = loadSkillReferences(workspaceRoot, item);

	const prdContext = `# PRD Item Context

## Item: ${item.id}
**Category:** ${item.category}
**Description:** ${item.description}
**Status:** ${item.status}
**Passes:** ${item.passes}

## Steps
${item.steps.map((step, idx) => {
	const stepText = typeof step === 'string' ? step : step.text;
	const completed = typeof step === 'string' ? false : step.completed || false;
	const marker = completed ? STATUS_MARKERS.completed : STATUS_MARKERS.incomplete;
	const highlight = stepIndex !== undefined && idx === stepIndex ? ' **<-- CURRENT STEP**' : '';
	return `${idx + 1}. [${marker}] ${stepText}${highlight}`;
}).join('\n')}

## Progress History
${progressContent || '(No progress yet)'}

## Available Commands
You can mark steps as complete by using the VS Code command:
\`\`\`
await vscode.commands.executeCommand('ralph.markStepComplete', '${item.id}', stepIndex, true);
\`\`\`
Where stepIndex is 0-based (0 for first step, 1 for second, etc.)

## Task
${stepIndex !== undefined 
	? `Work on step ${stepIndex + 1} of ${item.id}. Complete this specific step and mark it as done when finished.`
	: `Work on ${item.id}. Follow the steps listed above. Update progress.txt when you make changes.`}

${skillContext}

${promptTemplate ? `\n---\n\n# Agent Instructions\n\n${promptTemplate}` : ''}
`;

	return prdContext;
}

/**
 * Loads relevant skill references for a PRD item
 * @param workspaceRoot - Workspace root path
 * @param item - PRD item
 * @returns Formatted skill context string
 */
export function loadSkillReferences(workspaceRoot: string, item: PrdItem): string {
	const skillsDir = path.join(workspaceRoot, 'skills');
	if (!fs.existsSync(skillsDir)) {
		const testSkillsDir = path.join(workspaceRoot, 'test', 'skills');
		if (fs.existsSync(testSkillsDir)) {
			return loadSkillsFromDirectory(testSkillsDir, item);
		}
		return '';
	}
	return loadSkillsFromDirectory(skillsDir, item);
}

/**
 * Loads skills from a specific directory
 * @param skillsDir - Skills directory path
 * @param item - PRD item
 * @returns Formatted skill context string
 */
function loadSkillsFromDirectory(skillsDir: string, item: PrdItem): string {
	try {
		const skillFolders = fs.readdirSync(skillsDir).filter(name => {
			const fullPath = path.join(skillsDir, name);
			return fs.statSync(fullPath).isDirectory();
		});

		// Search for relevant skills based on item description or category
		const searchText = `${item.category} ${item.description}`.toLowerCase();
		const relevantSkills: string[] = [];

		for (const skillFolder of skillFolders) {
			const skillMdPath = path.join(skillsDir, skillFolder, 'SKILL.md');
			if (!fs.existsSync(skillMdPath)) {
				continue;
			}

			// Check if skill is relevant
			if (searchText.includes('wordpress') || searchText.includes('wp') || searchText.includes('plugin')) {
				if (skillFolder.includes('wp-plugin') || skillFolder.includes('wordpress')) {
					relevantSkills.push(skillFolder);
				}
			}

			// Add more relevance checks as needed
			// For now, we'll just match WordPress-related items
		}

		if (relevantSkills.length === 0) {
			return '';
		}

		// Build context from relevant skills
		let skillContext = '\n---\n\n# Available Skills\n\n';
		
		for (const skillFolder of relevantSkills) {
			const skillMdPath = path.join(skillsDir, skillFolder, 'SKILL.md');
			const skillContent = fs.readFileSync(skillMdPath, 'utf-8');
			
			skillContext += `## Skill: ${skillFolder}\n\n${skillContent}\n\n`;

			// Load reference documents
			const referencesDir = path.join(skillsDir, skillFolder, 'references');
			if (fs.existsSync(referencesDir)) {
				const referenceFiles = fs.readdirSync(referencesDir).filter(f => f.endsWith('.md'));
				
				if (referenceFiles.length > 0) {
					skillContext += `### References for ${skillFolder}\n\n`;
					
					for (const refFile of referenceFiles) {
						const refPath = path.join(referencesDir, refFile);
						const refContent = fs.readFileSync(refPath, 'utf-8');
						skillContext += `#### ${refFile}\n\n${refContent}\n\n`;
					}
				}
			}
		}

		return skillContext;
	} catch (error) {
		logger.error('Error loading skill references', error);
		return '';
	}
}

/**
 * Starts work on a specific step by opening chat with context
 * @param item - PRD item
 * @param stepIndex - Step index to work on
 * @param workspaceRoot - Workspace root path
 */
export async function startWorkOnStep(item: PrdItem, stepIndex: number, workspaceRoot: string): Promise<void> {
	// Ensure step exists
	if (stepIndex < 0 || stepIndex >= item.steps.length) {
		vscode.window.showErrorMessage('Invalid step index');
		return;
	}

	const step = item.steps[stepIndex];
	const stepText = typeof step === 'string' ? step : step.text;

	// Build context for the chat session with focus on this specific step
	const context = buildChatContext(item, workspaceRoot, stepIndex);

	try {
		// Clear any existing chat session and start fresh
		await vscode.commands.executeCommand('workbench.action.chat.clear');
		
		// Wait a moment for the clear to complete
		await new Promise(resolve => setTimeout(resolve, 300));
		
		// Open Copilot Chat panel
		await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
		
		// Wait a moment for the panel to open
		await new Promise(resolve => setTimeout(resolve, 300));
		
		// Send the context as a new message in the fresh chat session
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: context
		});
		
		vscode.window.showInformationMessage(`Started work on step ${stepIndex + 1} of ${item.id} in new chat session`);
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to start chat session: ${error}`);
	}
}
