/**
 * Constants and enums for the Ralph extension
 */

/**
 * Status values for PRD items
 */
export enum Status {
	NotStarted = 'not-started',
	InProgress = 'in-progress',
	InReview = 'in-review',
	Completed = 'completed'
}

/**
 * Message commands between webview and extension
 */
export enum MessageCommand {
	ToggleStep = 'toggleStep',
	ChangeStatus = 'changeStatus',
	AddStep = 'addStep',
	EditStep = 'editStep',
	DeleteStep = 'deleteStep',
	SubmitForReview = 'submitForReview',
	TogglePasses = 'togglePasses',
	StartWork = 'startWork',
	StartStepWork = 'startStepWork'
}

/**
 * Category values for PRD items
 */
export enum Category {
	Setup = 'setup',
	UI = 'ui',
	Functional = 'functional',
	Git = 'git',
	Agent = 'agent',
	Polish = 'polish',
	Test = 'test',
	Refactor = 'refactor',
	Quality = 'quality',
	Security = 'security',
	Bug = 'Bug',
	Action = 'Action',
	Docs = 'Docs',
	Audit = 'Audit'
}

/**
 * All available categories as string array
 */
export const CATEGORIES: string[] = [
	Category.Setup,
	Category.UI,
	Category.Functional,
	Category.Git,
	Category.Agent,
	Category.Polish,
	Category.Test,
	Category.Refactor,
	Category.Quality,
	Category.Security,
	Category.Bug,
	Category.Action,
	Category.Docs,
	Category.Audit
];

/**
 * Status icons/markers
 */
export const STATUS_MARKERS = {
	completed: '✓',
	incomplete: '○'
} as const;

/**
 * File paths
 */
export const FILE_PATHS = {
	prdFile: 'plans/prd.json',
	skillsDir: 'skills',
	testSkillsDir: 'test/skills',
	promptsDir: 'prompts'
} as const;

/**
 * Git related constants
 */
export const GIT = {
	featureBranchPrefix: 'feature/',
	mainBranch: 'main',
	scheme: 'git'
} as const;

/**
 * Theme colors
 */
export const THEME_COLORS = {
	iconPassed: 'testing.iconPassed',
	iconFailed: 'testing.iconFailed',
	modifiedResource: 'gitDecoration.modifiedResourceForeground'
} as const;
