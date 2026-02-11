import * as vscode from 'vscode';

/**
 * Log levels
 */
export enum LogLevel {
	Debug = 'DEBUG',
	Info = 'INFO',
	Warn = 'WARN',
	Error = 'ERROR'
}

/**
 * Logger class for Ralph extension
 * Provides structured logging with timestamps and log levels
 */
export class Logger {
	private static instance: Logger;
	private outputChannel: vscode.OutputChannel;
	private debugMode: boolean = false;

	private constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Ralph');
		this.loadDebugMode();
	}

	/**
	 * Get singleton instance of Logger
	 */
	public static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	/**
	 * Load debug mode configuration
	 */
	private loadDebugMode(): void {
		const config = vscode.workspace.getConfiguration('ralph');
		this.debugMode = config.get<boolean>('debugMode', false);
	}

	/**
	 * Update debug mode setting
	 */
	public setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	/**
	 * Format log message with timestamp and level
	 */
	private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
		const timestamp = new Date().toISOString();
		const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
			typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
		).join(' ') : '';
		return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
	}

	/**
	 * Log debug message (only shown when debug mode is enabled)
	 */
	public debug(message: string, ...args: any[]): void {
		if (this.debugMode) {
			const formatted = this.formatMessage(LogLevel.Debug, message, ...args);
			this.outputChannel.appendLine(formatted);
		}
	}

	/**
	 * Log info message
	 */
	public info(message: string, ...args: any[]): void {
		const formatted = this.formatMessage(LogLevel.Info, message, ...args);
		this.outputChannel.appendLine(formatted);
	}

	/**
	 * Log warning message
	 */
	public warn(message: string, ...args: any[]): void {
		const formatted = this.formatMessage(LogLevel.Warn, message, ...args);
		this.outputChannel.appendLine(formatted);
	}

	/**
	 * Log error message
	 */
	public error(message: string, error?: any): void {
		let formatted = this.formatMessage(LogLevel.Error, message);
		if (error) {
			if (error instanceof Error) {
				formatted += `\n${error.message}\n${error.stack}`;
			} else {
				formatted += `\n${JSON.stringify(error, null, 2)}`;
			}
		}
		this.outputChannel.appendLine(formatted);
	}

	/**
	 * Show the output channel
	 */
	public show(): void {
		this.outputChannel.show();
	}

	/**
	 * Dispose the logger
	 */
	public dispose(): void {
		this.outputChannel.dispose();
	}
}
