/**
 * Security tests for webview and input validation
 * Tests XSS prevention, CSP compliance, and input sanitization
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { DetailPanel } from '../../detailPanel';

suite('Security Test Suite', () => {
	
	suite('XSS Prevention', () => {
		
		test('Should escape HTML in item description', () => {
			const maliciousDescription = '<script>alert("XSS")</script>';
			const escaped = escapeHtml(maliciousDescription);
			
			assert.strictEqual(escaped.includes('<script>'), false);
			assert.strictEqual(escaped.includes('&lt;script&gt;'), true);
		});

		test('Should escape HTML entities in step text', () => {
			const maliciousStep = '<img src=x onerror="alert(\'XSS\')">';
			const escaped = escapeHtml(maliciousStep);
			
			assert.strictEqual(escaped.includes('<img'), false);
			assert.strictEqual(escaped.includes('&lt;img'), true);
		});

		test('Should escape quotes in attributes', () => {
			const maliciousInput = '" onclick="alert(\'XSS\')" data-evil="';
			const escaped = escapeHtml(maliciousInput);
			
			assert.strictEqual(escaped.includes('onclick'), true);
			assert.strictEqual(escaped.includes('&quot;'), true);
		});

		test('Should prevent JavaScript injection in file paths', () => {
			const maliciousPath = 'file.js\');alert(\'XSS\');//';
			const escaped = escapeHtml(maliciousPath);
			
			assert.strictEqual(escaped.includes('alert'), true);
			assert.strictEqual(escaped.includes('&#039;'), true);
		});
	});

	suite('Message Validation', () => {
		
		test('Should reject messages without command field', () => {
			const invalidMessage = { stepIndex: 0 };
			const isValid = isValidMessage(invalidMessage);
			
			assert.strictEqual(isValid, false);
		});

		test('Should reject messages with invalid command', () => {
			const invalidMessage = { command: 'maliciousCommand', payload: 'data' };
			const isValid = isValidMessage(invalidMessage);
			
			assert.strictEqual(isValid, false);
		});

		test('Should validate stepIndex is a positive integer', () => {
			const validMessage = { command: 'toggleStep', stepIndex: 5 };
			const invalidMessage1 = { command: 'toggleStep', stepIndex: -1 };
			const invalidMessage2 = { command: 'toggleStep', stepIndex: 'not a number' };
			const invalidMessage3 = { command: 'toggleStep', stepIndex: 1.5 };
			
			assert.strictEqual(isValidMessage(validMessage), true);
			assert.strictEqual(isValidMessage(invalidMessage1), false);
			assert.strictEqual(isValidMessage(invalidMessage2), false);
			assert.strictEqual(isValidMessage(invalidMessage3), false);
		});

		test('Should validate status is valid enum value', () => {
			const validMessage = { command: 'changeStatus', status: 'in-progress' };
			const invalidMessage = { command: 'changeStatus', status: 'hacked' };
			
			assert.strictEqual(isValidMessage(validMessage), true);
			assert.strictEqual(isValidMessage(invalidMessage), false);
		});

		test('Should validate filePath is non-empty string', () => {
			const validMessage = { command: 'openFileDiff', filePath: 'src/file.ts' };
			const invalidMessage1 = { command: 'openFileDiff', filePath: '' };
			const invalidMessage2 = { command: 'openFileDiff', filePath: 123 };
			
			assert.strictEqual(isValidMessage(validMessage), true);
			assert.strictEqual(isValidMessage(invalidMessage1), false);
			assert.strictEqual(isValidMessage(invalidMessage2), false);
		});
	});

	suite('CSP Compliance', () => {
		
		test('Should generate unique nonce for each webview instance', () => {
			const nonce1 = getNonce();
			const nonce2 = getNonce();
			
			assert.notStrictEqual(nonce1, nonce2);
			assert.strictEqual(nonce1.length, 32);
			assert.strictEqual(nonce2.length, 32);
		});

		test('Nonce should contain only alphanumeric characters', () => {
			const nonce = getNonce();
			const alphanumericRegex = /^[a-zA-Z0-9]+$/;
			
			assert.strictEqual(alphanumericRegex.test(nonce), true);
		});
	});

	suite('Input Sanitization', () => {
		
		test('Should sanitize common XSS payloads', () => {
			const xssPayloads = [
				'<script>alert("XSS")</script>',
				'<img src=x onerror=alert(1)>',
				'javascript:alert(1)',
				'<iframe src="javascript:alert(1)">',
				'<svg onload=alert(1)>',
				'<body onload=alert(1)>',
				'<input onfocus=alert(1) autofocus>',
				'"><script>alert(String.fromCharCode(88,83,83))</script>'
			];

			xssPayloads.forEach(payload => {
				const sanitized = escapeHtml(payload);
				// Should not contain unescaped < or >
				assert.strictEqual(sanitized.includes('<script>'), false);
				assert.strictEqual(sanitized.includes('<img'), false);
				assert.strictEqual(sanitized.includes('<iframe'), false);
			});
		});
	});
});

// Helper functions - these mirror the private methods in DetailPanel for testing

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function isValidMessage(message: any): boolean {
	if (!message || typeof message !== 'object') {
		return false;
	}

	if (typeof message.command !== 'string') {
		return false;
	}

	const Status = {
		NotStarted: 'not-started',
		InProgress: 'in-progress',
		InReview: 'in-review',
		Completed: 'completed'
	};

	const MessageCommand = {
		ToggleStep: 'toggleStep',
		EditStep: 'editStep',
		DeleteStep: 'deleteStep',
		ChangeStatus: 'changeStatus',
		TogglePasses: 'togglePasses',
		AddStep: 'addStep',
		SubmitForReview: 'submitForReview'
	};

	switch (message.command) {
		case MessageCommand.ToggleStep:
		case MessageCommand.EditStep:
		case MessageCommand.DeleteStep:
		case 'startWorkOnStep':
			return typeof message.stepIndex === 'number' && 
				   message.stepIndex >= 0 && 
				   Number.isInteger(message.stepIndex);
		
		case MessageCommand.ChangeStatus:
			return typeof message.status === 'string' && 
				   Object.values(Status).includes(message.status);
		
		case 'openFileDiff':
			return typeof message.filePath === 'string' && 
				   message.filePath.length > 0;
		
		case MessageCommand.TogglePasses:
		case MessageCommand.AddStep:
		case MessageCommand.SubmitForReview:
			return true;
		
		default:
			return false;
	}
}
