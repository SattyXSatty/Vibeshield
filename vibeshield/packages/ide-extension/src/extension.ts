import * as vscode from 'vscode';
import { OverlayConnector } from './services/OverlayConnector';
import { ActivityTracker } from './services/ActivityTracker';
import { ChatViewProvider } from './providers/ChatViewProvider';

import { ProcessManager } from './services/ProcessManager';
import { LogCapture } from './services/LogCapture';
import { LogSelector } from './services/LogSelector';
import { ContextExtractor } from './services/ContextExtractor';
import { ChatContextExtractor } from './services/ChatContextExtractor';
import { CortexBridge } from './services/CortexBridge';
import { AgentLoop } from './services/AgentLoop';

let connector: OverlayConnector;
let chatProvider: ChatViewProvider;
let processManager: ProcessManager;
let logCapture: LogCapture;
let logSelector: LogSelector;
let cortexBridge: CortexBridge;
let agentLoop: AgentLoop;

export function activate(context: vscode.ExtensionContext) {
    console.log('VibeShield Extension is now active!');

    // ─── Layer 1: Communication ───────────────────────────────────
    // WHY: OverlayConnector is the WebSocket bridge to the Electron Overlay UI.
    // Everything that needs to appear in the overlay goes through this.
    connector = new OverlayConnector(context);
    connector.connect();

    // ─── Layer 2: Process Management ──────────────────────────────
    // WHY: ProcessManager spawns and controls the user's dev server process.
    // It emits stdout/stderr/exit events that the rest of the system reacts to.
    processManager = new ProcessManager();
    context.subscriptions.push(processManager);

    // ─── Layer 3: IDE Tracking ────────────────────────────────────
    // WHY: ActivityTracker watches file saves, typing events, and terminal activity.
    // It feeds data to the overlay for real-time awareness and diff context.
    const activityTracker = new ActivityTracker(context, connector);
    console.log('[VibeShield] Activity Tracker Initialized');

    // ─── Layer 4: Log Pipeline ────────────────────────────────────
    // WHY: LogCapture buffers + batches raw process output.
    //      LogSelector intelligently picks error blocks + recent context.
    // This is the "sensory system" — raw data in, refined signal out.
    logCapture = new LogCapture(context, connector);
    context.subscriptions.push(logCapture);

    logSelector = new LogSelector(logCapture);

    // ─── Layer 5: Context & Intent Extraction ─────────────────────
    // NEW: ChatContextExtractor reads local SQLite DBs to find user intent/prompts.
    // ContextExtractor bundles everything (logs, file context, chat history).
    const chatExtractor = new ChatContextExtractor(context);
    const contextExtractor = new ContextExtractor(logSelector, activityTracker, chatExtractor);
    context.subscriptions.push({ dispose: () => chatExtractor.dispose() });

    // ─── Wiring: Chat Events → Overlay ───────────────────────────
    // WHY: This creates the "Plugin Hook" experience. When the extractor
    // detects a new message (via DB watch or Brain watch), we push it
    // to the overlay immediately.
    chatExtractor.onChatMessageFound(event => {
        connector.sendMessageToOverlay({
            type: 'chat_message',
            timestamp: new Date(event.timestamp).toISOString(),
            payload: {
                id: event.timestamp.toString(),
                role: (event.role as 'user' | 'assistant') || 'user',
                content: event.text,
                source: event.source
            } as any
        });
        console.log(`[VibeShield] Forwarded chat event from ${event.source}: ${event.text.substring(0, 40)}...`);

        // Mirror to Sidebar for visibility
        chatProvider.sendSystemMessage(`[${event.source}] ${event.text}`, 'info');
    });

    // Optional: Keep accessibility scraper for advanced users
    const startScraperIfEnabled = () => {
        const config = vscode.workspace.getConfiguration('vibeshield');
        if (config.get<boolean>('enableAccessibilityScraper', false)) {
            console.log('[VibeShield] Accessibility Scraper enabled (experimental).');
            chatExtractor.startAccessibilityScraper();
        }
    };
    startScraperIfEnabled();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vibeshield.enableAccessibilityScraper')) {
            startScraperIfEnabled();
        }
    }));

    // ─── Layer 6: AI Brain ────────────────────────────────────────
    // WHY: CortexBridge wraps the Gemini API. It takes selected logs
    // and returns structured analysis (error type, file, line, fix).
    cortexBridge = new CortexBridge();

    // ─── Layer 7: Chat UI ─────────────────────────────────────────
    // MOVED UP: ChatViewProvider renders the sidebar chat panel.
    // It receives ContextExtractor. AgentLoop needs to send messages TO it.
    chatProvider = new ChatViewProvider(context.extensionUri, connector, contextExtractor);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
    );

    // ─── Layer 8: Agent Loop (The Nervous System) ─────────────────
    // MOVED DOWN: AgentLoop needs EVERYTHING: ProcessManager, LogCapture,
    // LogSelector, CortexBridge, OverlayConnector, AND ChatViewProvider.
    agentLoop = new AgentLoop(processManager, logCapture, logSelector, cortexBridge, connector, chatProvider);
    context.subscriptions.push(agentLoop);


    // ─── Wiring: Process Output → Log Pipeline ───────────────────
    // WHY: Raw stdout/stderr from ProcessManager needs to flow into
    // LogCapture for buffering/batching and history retention.
    processManager.onStdout((data) => {
        logCapture.addLog('stdout', data, 'info');
    });

    processManager.onStderr((data) => {
        logCapture.addLog('stderr', data, 'error');
    });

    // NOTE: processManager.onExit is now handled by AgentLoop.wireEvents()
    processManager.onExit((code) => {
        connector.sendLog({
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            source: 'system',
            level: code !== 0 ? 'error' : 'info',
            content: `Process exited with code ${code}`
        });
    });

    // ─── Wiring: Overlay Commands → AgentLoop ────────────────────
    connector.onCommand(async (cmd) => {
        if (cmd.action === 'start') {
            const folders = vscode.workspace.workspaceFolders;
            if (folders) {
                const cmdStr = cmd.args?.command || 'npm run dev';
                await agentLoop.startProcess(cmdStr, folders[0].uri.fsPath);
            } else {
                vscode.window.showErrorMessage('No workspace folder open.');
            }
        } else if (cmd.action === 'stop') {
            await agentLoop.stopProcess();
        } else if (cmd.action === 'restart') {
            await agentLoop.stopProcess();
            const folders = vscode.workspace.workspaceFolders;
            if (folders) {
                await agentLoop.startProcess('npm run dev', folders[0].uri.fsPath);
            }
        }
    });

    // ─── Register VS Code Commands ───────────────────────────────
    const startCmd = vscode.commands.registerCommand('vibeshield.start', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (folders) {
            const cmd = await vscode.window.showInputBox({
                prompt: 'Command to run',
                value: 'npm run dev'
            });
            if (cmd) {
                agentLoop.resetAttempts(); // Fresh start = fresh count
                await agentLoop.startProcess(cmd, folders[0].uri.fsPath);
            }
        } else {
            vscode.window.showErrorMessage('Open a folder first.');
        }
    });

    const stopCmd = vscode.commands.registerCommand('vibeshield.stop', async () => {
        await agentLoop.stopProcess();
    });

    const forceSyncCmd = vscode.commands.registerCommand('vibeshield.forceSync', async () => {
        vscode.window.showInformationMessage('Syncing chat history...');
        await chatExtractor.forceSync();
        chatProvider.sendSystemMessage('[Admin] Manual sync completed.', 'info');
    });

    const debugLogsCmd = vscode.commands.registerCommand('vibeshield.debugLogs', async () => {
        const selected = logSelector.selectLogsForAnalysis();
        const analysis = agentLoop.getLastAnalysis();
        const chatContext = await contextExtractor.getIntentContext();

        const content = [
            '=== SELECTED LOGS FOR CORTEX-R ===',
            selected,
            '',
            '=== EXTRACTED CHAT CONTEXT (Task 1.3.4) ===',
            chatContext.chatHistory || '(No chat history found)',
            '',
            '=== EXTRACTION DIAGNOSTICS ===',
            (chatExtractor as any).getDiagnostics().join('\n'),
            '',
            '=== LAST CORTEX-R ANALYSIS ===',
            analysis ? JSON.stringify(analysis, null, 2) : 'No analysis performed yet.',
            '',
            `=== AGENT PHASE: ${agentLoop.getPhase()} ===`
        ].join('\n');

        const doc = vscode.workspace.openTextDocument({ content, language: 'log' });
        doc.then(d => vscode.window.showTextDocument(d));
    });

    // NEW: Manual analysis trigger command
    const analyzeCmd = vscode.commands.registerCommand('vibeshield.analyze', async () => {
        if (!cortexBridge.isReady()) {
            vscode.window.showErrorMessage(
                'VibeShield: No API key configured. Go to Settings > VibeShield > API Key.'
            );
            return;
        }

        const selected = logSelector.selectLogsForAnalysis();
        if (selected === 'No logs captured.') {
            vscode.window.showInformationMessage('VibeShield: No logs to analyze.');
            return;
        }

        vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'VibeShield: Analyzing logs...' },
            async () => {
                const result = await cortexBridge.analyzeLogs(selected);
                const resultDoc = await vscode.workspace.openTextDocument({
                    content: JSON.stringify(result, null, 2),
                    language: 'json'
                });
                vscode.window.showTextDocument(resultDoc);
            }
        );
    });

    // NEW: Share Chat Context command — developer selects chat text and shares it
    const shareChatCmd = vscode.commands.registerCommand('vibeshield.shareChat', async () => {
        const editor = vscode.window.activeTextEditor;
        let text = '';

        // Priority 1: Selected text in any editor/panel
        if (editor && !editor.selection.isEmpty) {
            text = editor.document.getText(editor.selection);
        } else {
            // Priority 2: Clipboard contents
            text = await vscode.env.clipboard.readText();
        }

        if (!text || text.trim().length < 5) {
            // Priority 3: Ask user to paste
            const input = await vscode.window.showInputBox({
                prompt: 'Paste or type the chat context you want VibeShield to analyze',
                placeHolder: 'e.g., "Build a REST API for user authentication"',
            });
            if (input) { text = input; }
        }

        if (text && text.trim().length >= 5) {
            chatExtractor.pushMessage('user', text.trim());
            vscode.window.showInformationMessage(
                `VibeShield: Captured ${text.trim().length} chars of chat context.`
            );
            console.log(`[VibeShield] Chat context shared: "${text.trim().substring(0, 80)}..."`);
        } else {
            vscode.window.showWarningMessage('VibeShield: No text provided.');
        }
    });

    // NEW: Import Chat Export command — parse Antigravity .md export files
    const importChatCmd = vscode.commands.registerCommand('vibeshield.importChat', async () => {
        try {
            console.log('[VibeShield] Opening file picker for chat import...');
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectMany: false,
                filters: { 'Markdown': ['md'], 'All Files': ['*'] },
                openLabel: 'Import Chat Export',
                title: 'Select an Antigravity/IDE chat export file'
            });

            if (fileUri && fileUri[0]) {
                console.log(`[VibeShield] User selected: ${fileUri[0].fsPath}`);
                const result = chatExtractor.importChatExport(fileUri[0].fsPath);

                vscode.window.showInformationMessage(
                    `VibeShield: Imported ${result.userMessages.length} user messages, ` +
                    `${result.assistantMessages.length} AI responses, ` +
                    `${result.actions.length} IDE actions.`
                );

                // Show a preview of what was captured
                const preview = [
                    `=== IMPORTED CHAT EXPORT ===`,
                    `File: ${fileUri[0].fsPath}`,
                    ``,
                    `--- USER MESSAGES (${result.userMessages.length}) ---`,
                    ...result.userMessages.map((m, i) => `[${i + 1}] ${m.substring(0, 200)}`),
                    ``,
                    `--- IDE ACTIONS (${result.actions.length}) ---`,
                    ...result.actions.slice(0, 20).map((a, i) => `[${i + 1}] ${a}`),
                ].join('\n');

                const doc = await vscode.workspace.openTextDocument({ content: preview, language: 'log' });
                await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
                console.log('[VibeShield] Log preview opened.');
            } else {
                console.log('[VibeShield] User cancelled file picker.');
            }
        } catch (error: any) {
            console.error(`[VibeShield] Import failed: ${error.message}`);
            vscode.window.showErrorMessage(`VibeShield Import Failed: ${error.message}`);
        }
    });

    // Start watching Downloads for auto-import
    chatExtractor.startWatchingExports();

    context.subscriptions.push(startCmd, stopCmd, debugLogsCmd, forceSyncCmd, analyzeCmd, shareChatCmd, importChatCmd);
}

export function deactivate() {
    if (connector) {
        connector.dispose();
    }
    if (agentLoop) {
        agentLoop.dispose();
    }
}
