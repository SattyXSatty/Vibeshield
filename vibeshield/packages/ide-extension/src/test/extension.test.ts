import * as assert from 'assert';
import * as vscode from 'vscode';
// import { CortexBridge } from '../CortexBridge'; 
// NOTE: Unit testing the CortexBridge directly might require mocking the Google Generative AI client.
// For now, let's write an integration test that checks if the Extension activates.

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('vibeshield.vibeshield-vscode'));
    });

    test('Should activate extension without errors', async () => {
        const ext = vscode.extensions.getExtension('vibeshield.vibeshield-vscode')!;
        if (!ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext.isActive, 'Extension failed to activate');
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const vibeshieldCommands = commands.filter(c => c.startsWith('vibeshield.'));

        assert.ok(vibeshieldCommands.includes('vibeshield.start'), 'vibeshield.start command missing');
        assert.ok(vibeshieldCommands.includes('vibeshield.extractIntent'), 'vibeshield.extractIntent command missing');
        assert.ok(vibeshieldCommands.includes('vibeshield.generateTestPlan'), 'vibeshield.generateTestPlan command missing');
    });
});
