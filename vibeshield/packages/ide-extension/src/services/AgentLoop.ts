import * as vscode from 'vscode';
import { exec } from 'child_process';
import { LogCapture } from './LogCapture';
import { LogSelector } from './LogSelector';
import { CortexBridge, LogAnalysisResult } from './CortexBridge';
import { OverlayConnector } from './OverlayConnector';
import { ProcessManager } from './ProcessManager';
import { ChatViewProvider } from '../providers/ChatViewProvider';

/**
 * AgentLoop orchestrates the Terminal Health Check loop.
 *
 * WHY this class exists:
 * ─────────────────────
 * Before this class, we had individual services (ProcessManager, LogCapture,
 * LogSelector, CortexBridge, OverlayConnector) that were all initialized in
 * extension.ts but had NO automated connection between them.
 *
 * The "nervous system" was missing. When the process crashed, nobody
 * automatically asked Cortex-R "what went wrong?" and nobody sent
 * the answer to the Chat UI.
 *
 * AgentLoop IS that nervous system. It:
 *   1. Watches for process exit events
 *   2. Grabs the relevant logs (via LogSelector)
 *   3. Sends them to Cortex-R for analysis (via CortexBridge)
 *   4. Routes the analysis result to both the Overlay UI and the Chat panel
 *   5. Tracks attempt count and enforces max retries
 *   6. Detects server readiness ("Listening on port 3000") to verify successful boot.
 *
 * FLOW:
 * ─────
 *   ProcessManager.onExit(code)
 *       │
 *       ▼
 *   AgentLoop detects non-zero exit
 *       │
 *       ├──► LogSelector.selectLogsForAnalysis()
 *       │         │
 *       │         ▼
 *       ├──► CortexBridge.analyzeLogs(selectedLogs)
 *       │         │
 *       │         ▼
 *       ├──► OverlayConnector.sendStatusUpdate('error_detected')
 *       │
 *       ├──► Send analysis to Chat UI via OverlayConnector
 *       │
 *       └──► Wait for next "done" signal (file save / manual trigger)
 */

export type AgentPhase =
    | 'idle'
    | 'starting'
    | 'bootstrapping'  // Process started, waiting for "Ready" signal
    | 'running'        // Fallback state if readiness check times out but process is alive
    | 'healthy'        // Confirmed "Ready on localhost:3000"
    | 'analyzing'
    | 'error_detected'
    | 'feedback_sent'
    | 'max_retries_reached';

export class AgentLoop {
    private currentPhase: AgentPhase = 'idle';
    private attemptCount = 0;
    private readonly MAX_RETRIES = 5;
    private lastAnalysis: LogAnalysisResult | null = null;
    private isAnalyzing = false;

    // Debounce: avoid analyzing stderr bursts mid-run
    private analysisTimer: NodeJS.Timeout | null = null;
    private readonly ANALYSIS_DELAY_MS = 2000; // Wait 2s after process exit before analyzing

    // Server Readiness logic
    private readinessTimer: NodeJS.Timeout | null = null;
    private readonly READINESS_TIMEOUT_MS = 60000; // 60s timeout for boot
    private recentLogsBuffer = '';
    private lastReadinessCheckTime = 0;
    private readonly READINESS_CHECK_INTERVAL = 3000; // Throttle AI checks to every 3s

    constructor(
        private processManager: ProcessManager,
        private logCapture: LogCapture,
        private logSelector: LogSelector,
        private cortexBridge: CortexBridge,
        private connector: OverlayConnector,
        private chatProvider: ChatViewProvider
    ) {
        this.wireEvents();
    }

    /**
     * WHY wireEvents:
     * This is the core wiring. It listens to ProcessManager events
     * and triggers the appropriate phase transitions.
     */
    private wireEvents() {
        // When the process exits, determine if it was a crash or clean exit
        this.processManager.onExit((code) => {
            this.clearReadinessTimer();
            if (code !== null && code !== 0) {
                // Non-zero exit = crash/error
                console.log(`[VibeShield Agent] Process exited with code ${code}. Starting analysis...`);
                this.handleProcessCrash(code);
            } else {
                // Clean exit (code 0 or null for manual stop)
                console.log('[VibeShield Agent] Process exited cleanly.');
                this.setPhase('idle');
            }
        });

        // Listen for stdout to detect "Server Ready" signals
        this.processManager.onStdout((data) => {
            if (this.currentPhase === 'bootstrapping') {
                this.checkForReadiness(data);
            }
        });
    }

    /**
     * Start the monitored process.
     * Called when user triggers "vibeshield.start" or overlay "start" button.
     */
    public async startProcess(command: string, cwd: string) {
        this.attemptCount++;
        console.log(`[VibeShield Agent] Starting process (Attempt ${this.attemptCount}/${this.MAX_RETRIES})`);

        this.setPhase('starting');
        this.lastAnalysis = null;
        this.recentLogsBuffer = '';

        try {
            await this.processManager.start(command, cwd);
            this.setPhase('bootstrapping');

            // Set safety timeout for bootstrapping
            this.readinessTimer = setTimeout(() => {
                if (this.currentPhase === 'bootstrapping') {
                    console.warn('[VibeShield Agent] Bootstrapping timed out. Assuming running state.');
                    this.setPhase('running');
                    vscode.window.showInformationMessage('VibeShield: Server started (readiness not explicitly detected).');
                }
            }, this.READINESS_TIMEOUT_MS);

        } catch (err: any) {
            console.error('[VibeShield Agent] Failed to start process:', err);
            this.setPhase('error_detected');
        }
    }

    /**
     * Stop the monitored process.
     */
    public async stopProcess() {
        this.clearTimers();
        await this.processManager.stop();
        this.setPhase('idle');
        this.attemptCount = 0; // Reset on manual stop
    }

    private clearTimers() {
        if (this.analysisTimer) {
            clearTimeout(this.analysisTimer);
            this.analysisTimer = null;
        }
        this.clearReadinessTimer();
    }

    private clearReadinessTimer() {
        if (this.readinessTimer) {
            clearTimeout(this.readinessTimer);
            this.readinessTimer = null;
        }
    }

    /**
     * WHY checkForReadiness:
     * While in 'bootstrapping' phase, we watch logs.
     * 1. Check for specific keywords locally (fast).
     * 2. If keywords found, ask Cortex-R to verify and extract URL (smart).
     * 3. If confirmed, transition to 'healthy'.
     */
    private async checkForReadiness(chunk: string) {
        this.recentLogsBuffer += chunk;
        if (this.recentLogsBuffer.length > 5000) {
            this.recentLogsBuffer = this.recentLogsBuffer.slice(-5000); // Keep buffer small
        }

        // Fast local check before invoking AI
        const likelyReady = /ready|listening|localhost|http:|https:|compiled client|built in/i.test(chunk);

        if (likelyReady) {
            const now = Date.now();
            if (now - this.lastReadinessCheckTime < this.READINESS_CHECK_INTERVAL) {
                return; // Throttle AI calls
            }
            this.lastReadinessCheckTime = now;

            console.log('[VibeShield Agent] Potential readiness detected. Verifying with Cortex-R...');
            const result = await this.cortexBridge.checkServerReadiness(this.recentLogsBuffer);

            if (result.isReady) {
                console.log(`[VibeShield Agent] Server Ready confirmed at ${result.url || 'unknown URL'}`);
                this.setPhase('healthy');
                this.clearReadinessTimer();

                this.connector.sendLog({
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'cortex',
                    level: 'info',
                    content: `✅ Server Ready at ${result.url || 'localhost'}`
                });

                if (result.url) {
                    vscode.window.showInformationMessage(`VibeShield: Server is ready at ${result.url}`, 'Open').then(sel => {
                        if (sel === 'Open') vscode.env.openExternal(vscode.Uri.parse(result.url!));
                    });
                }
            }
        }
    }

    /**
     * WHY handleProcessCrash:
     * This is the "reflex arc" — the automatic response when something breaks.
     * 
     * Instead of just showing "Process exited with code 1" and leaving the user
     * to read raw terminal output, we:
     *   1. Grab the smart log selection (errors + context)
     *   2. Ask Cortex-R "What happened?"
     *   3. Get a structured answer (file, line, cause, fix)
     *   4. Show it in a human-readable way
     */
    private handleProcessCrash(exitCode: number) {
        // Check retry limit
        if (this.attemptCount >= this.MAX_RETRIES) {
            this.setPhase('max_retries_reached');
            vscode.window.showErrorMessage(
                `VibeShield: Max retries (${this.MAX_RETRIES}) reached. Manual intervention needed.`
            );
            return;
        }

        // Debounce: wait a bit for any final stderr output to land
        if (this.analysisTimer) {
            clearTimeout(this.analysisTimer);
        }

        this.analysisTimer = setTimeout(async () => {
            await this.analyzeAndReport(exitCode);
        }, this.ANALYSIS_DELAY_MS);
    }

    /**
     * WHY analyzeAndReport:
     * This is the "brain processing" step. We:
     * 1. Set phase to 'analyzing' (so overlay shows a spinner)
     * 2. Get selected logs from LogSelector (smart selection, not raw dump)
     * 3. Send to CortexBridge (which calls Gemini API)
     * 4. Process the structured response
     * 5. Route feedback to UI
     */
    private async analyzeAndReport(exitCode: number) {
        if (this.isAnalyzing) return; // Prevent concurrent analysis
        this.isAnalyzing = true;

        try {
            this.setPhase('analyzing');

            // Step 1: Get intelligently selected logs
            const selectedLogs = this.logSelector.selectLogsForAnalysis();
            console.log(`[VibeShield Agent] Selected ${selectedLogs.split('\n').length} log lines for analysis.`);

            // Step 2: Check if Cortex-R is configured
            if (!this.cortexBridge.isReady()) {
                console.warn('[VibeShield Agent] Cortex-R not configured. Showing raw error.');
                this.sendFallbackFeedback(exitCode, selectedLogs);
                this.setPhase('error_detected');
                return;
            }

            // Step 3: Send to Cortex-R for analysis
            const analysis = await this.cortexBridge.analyzeLogs(selectedLogs);
            this.lastAnalysis = analysis;

            // Step 4: Route the feedback
            // Step 4: Route the feedback
            // Force error if exit code is non-zero, even if AI missed it
            if (analysis.hasError || (exitCode !== 0 && exitCode !== null)) {
                if (!analysis.hasError) {
                    analysis.hasError = true;
                    analysis.errorType = 'runtime';
                    analysis.errorMessage = `Process exited with code ${exitCode}`;
                    analysis.cause = 'Process crashed but specific error was not extracted by AI.';
                    analysis.fix = 'Check raw logs for details.';
                }

                this.setPhase('error_detected');
                this.sendAnalysisFeedback(analysis);
            } else {
                // Cortex-R didn't find an error — maybe a clean shutdown
                this.setPhase('idle');
                this.connector.sendLog({
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'cortex',
                    level: 'info',
                    content: `Process exited (code ${exitCode}) cleanly.`
                });
            }
        } catch (err: any) {
            console.error('[VibeShield Agent] Analysis pipeline error:', err);
            this.setPhase('error_detected');
        } finally {
            this.isAnalyzing = false;
        }
    }

    /**
     * WHY sendAnalysisFeedback:
     * Formats the structured AI analysis into a human + AI readable message
     * and sends it to BOTH the overlay (for the user to see) AND the chat
     * (for the AI coding assistant to act on).
     * 
     * Task 1.6.2: Feedback Generation & Chat Delivery
     * 1. Generate friendly chat response via Cortex-R
     * 2. Format feedback for chat (clear, concise, actionable)
     * 3. Check chat permission before sending
     * 4. Send via IDE chat interface
     * 5. Show "feedback sent" in overlay
     * 6. Track delivery status
     */
    private async sendAnalysisFeedback(analysis: LogAnalysisResult) {
        // Step 1: Format structured feedback for overlay
        const feedbackLines = [
            `🔴 **Error Detected** (Attempt ${this.attemptCount}/${this.MAX_RETRIES})`,
            ``,
            `**Type:** ${analysis.errorType || 'unknown'}`,
            `**Message:** ${analysis.errorMessage || 'No message'}`,
            analysis.affectedFile ? `**File:** ${analysis.affectedFile}${analysis.line ? `:${analysis.line}` : ''}` : '',
            analysis.cause ? `**Cause:** ${analysis.cause}` : '',
            analysis.fix ? `**Suggested Fix:** ${analysis.fix}` : '',
        ].filter(Boolean).join('\n');

        // Step 2: Generate friendly chat response via Cortex-R
        let chatMessage = feedbackLines; // Fallback to structured feedback
        try {
            const friendlyResponse = await this.cortexBridge.generateChatResponse(analysis);
            if (friendlyResponse) {
                chatMessage = `🔴 **Error Detected** (Attempt ${this.attemptCount}/${this.MAX_RETRIES})\n\n${friendlyResponse}`;
            }
        } catch (err) {
            console.warn('[VibeShield Agent] Could not generate friendly chat response, using structured feedback.', err);
        }

        // Step 3: Check chat permission before sending
        const autoPost = vscode.workspace.getConfiguration('vibeshield').get<boolean>('autoPostToChat', true);
        let chatDelivered = false;

        if (autoPost) {
            // Step 4: Send via IDE chat interface & Step 6: Track delivery status
            chatDelivered = this.chatProvider.sendSystemMessage(chatMessage, 'error');

            if (chatDelivered) {
                console.log('[VibeShield Agent] ✅ Chat message delivered successfully.');
            } else {
                console.warn('[VibeShield Agent] ⚠️ Chat panel not open. Message not delivered.');
            }
        } else {
            console.log('[VibeShield Agent] Chat auto-post disabled by user configuration.');
        }

        // Send to Overlay UI as a log entry 
        this.connector.sendLog({
            id: `analysis-${Date.now()}`,
            timestamp: new Date().toISOString(),
            source: 'cortex',
            level: 'error',
            content: feedbackLines
        });

        // Send as a structured analysis message to the overlay
        this.connector.sendMessageToOverlay({
            type: 'cortex_analysis',
            timestamp: new Date().toISOString(),
            payload: {
                analysis,
                attemptCount: this.attemptCount,
                maxRetries: this.MAX_RETRIES,
                feedback: feedbackLines
            }
        });

        // Step 5: Show "feedback sent" in overlay
        this.setPhase('feedback_sent');

        // Step 6: Forward to Native IDE Chat
        // Multi-strategy: tries VS Code API first, falls back to AppleScript clipboard paste
        const forwardToNative = vscode.workspace.getConfiguration('vibeshield').get<boolean>('forwardToNativeChat', true);

        if (forwardToNative) {
            const query = `Fix this ${analysis.errorType} error in ${analysis.affectedFile || 'the project'}: "${analysis.errorMessage}". ${analysis.fix ? `Suggested fix: ${analysis.fix}` : ''}`;

            // Step B: Copy to clipboard
            await vscode.env.clipboard.writeText(query);

            // Step C+D: Focus Agent Chat (Cmd+L) then Paste (Cmd+V) then Submit (Enter)
            // The Output panel steals focus after process exit.
            // Cmd+L is the IDE's native shortcut to open/focus the Agent chat input.
            let pasted = false;
            if (process.platform === 'darwin') {
                try {
                    // Wait for IDE to settle (Output panel finishes rendering)
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    await new Promise<void>((resolve, reject) => {
                        exec(`osascript -e 'tell application "System Events"
    keystroke "l" using command down
    delay 0.8
    keystroke "v" using command down
    delay 0.3
    key code 36
end tell'`, (error) => {
                            if (error) { reject(error); } else { resolve(); }
                        });
                    });
                    pasted = true;
                    console.log('[VibeShield] Cmd+L → Cmd+V → Enter succeeded.');
                } catch (err) {
                    console.warn('[VibeShield] AppleScript paste failed:', err);
                }
            }

            // Log result to overlay
            this.connector.sendLog({
                id: `native-forward-${Date.now()}`,
                timestamp: new Date().toISOString(),
                source: 'system',
                level: pasted ? 'info' : 'warn',
                content: pasted
                    ? '🤖 Error auto-forwarded to IDE Agent Chat.'
                    : '📋 Error copied to clipboard. Paste into AI Chat (Cmd+V) to fix.'
            });
        }

        // Show VS Code notification
        vscode.window.showWarningMessage(
            `VibeShield: ${analysis.errorType || 'Error'} detected. ${analysis.fix ? 'Fix: ' + analysis.fix.substring(0, 80) : 'Check chat for details.'}`,
            'View Details'
        ).then((action) => {
            if (action === 'View Details') {
                vscode.workspace.openTextDocument({
                    content: feedbackLines,
                    language: 'markdown'
                }).then(doc => vscode.window.showTextDocument(doc));
            }
        });

        console.log('[VibeShield Agent] Feedback pipeline complete.');
    }

    /**
     * Fallback: Uses AppleScript to simulate Cmd+V (paste) and Enter (submit)
     * in the native chat panel. Only used when VS Code Chat API commands fail.
     */
    private async simulatePasteViaAppleScript(): Promise<void> {
        // 1. Wait for IDE to fully settle
        await new Promise(resolve => setTimeout(resolve, 2000));

        // DIAGNOSTIC: Log all available chat commands so we can pick the right one
        try {
            const allCommands = await vscode.commands.getCommands(true);
            const chatCommands = allCommands.filter((c: string) => c.toLowerCase().includes('chat'));
            console.log('[VibeShield] Available chat commands:', JSON.stringify(chatCommands));
            this.connector.sendLog({
                id: `diag-${Date.now()}`,
                timestamp: new Date().toISOString(),
                source: 'system',
                level: 'info',
                content: `🔍 Chat commands found: ${chatCommands.join(', ')}`
            });
        } catch { /* ignore diagnostic errors */ }

        // 2. Focus chat via AVAILABLE API commands (found in diagnostics)
        const focusCommands = [
            'antigravity.toggleChatFocus',             // Current User Env (confirmed exists)
            'workbench.panel.chat.view.copilot.focus', // Copilot
            'vibeshield.chat.focus',                   // VibeShield Self
            'workbench.action.chat.open'               // Standard (fallback)
        ];

        let focused = false;
        for (const cmd of focusCommands) {
            try {
                await vscode.commands.executeCommand(cmd);
                console.log(`[VibeShield] Focus command succeeded: ${cmd}`);
                focused = true;
                break;
            } catch { /* try next */ }
        }

        if (!focused) console.warn('[VibeShield] No chat focus command succeeded.');

        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Strategy A: Try VS Code 'type' command (types into focused editor widget)
        //    This works if the chat input has focus (it's a Monaco editor widget)
        const query = await vscode.env.clipboard.readText();
        try {
            await vscode.commands.executeCommand('type', { text: query });
            console.log('[VibeShield] type command succeeded. Submitting...');

            // Try to submit via Enter key simulation
            await new Promise(resolve => setTimeout(resolve, 200));
            return new Promise((resolve, reject) => {
                exec(`osascript -e 'tell application "System Events" to key code 36'`, (error) => {
                    if (error) { reject(error); } else { resolve(); }
                });
            });
        } catch (typeErr) {
            console.log('[VibeShield] type command failed:', typeErr);
        }

        // 4. Strategy B: AppleScript paste + submit (fallback)
        return new Promise((resolve, reject) => {
            const script = `tell application "System Events"
    keystroke "v" using command down
    delay 0.3
    key code 36
end tell`;

            exec(`osascript -e '${script}'`, (error, _stdout, stderr) => {
                if (error) {
                    console.warn('[VibeShield] AppleScript failed:', stderr);
                    reject(error);
                } else {
                    console.log('[VibeShield] AppleScript paste+submit succeeded.');
                    resolve();
                }
            });
        });
    }

    /**
     * WHY sendFallbackFeedback:
     * When Cortex-R is not configured (no API key), we still want to help.
     * We show the raw selected logs so the user isn't left in the dark.
     */
    private sendFallbackFeedback(exitCode: number, selectedLogs: string) {
        const fallbackMessage = [
            `⚠️ Process exited with code ${exitCode}`,
            ``,
            `Cortex-R is not configured (add your API key in Settings > VibeShield).`,
            `Here are the relevant logs:`,
            ``,
            selectedLogs.substring(0, 2000) // Truncate for display
        ].join('\n');

        this.connector.sendLog({
            id: `fallback-${Date.now()}`,
            timestamp: new Date().toISOString(),
            source: 'system',
            level: 'warn',
            content: fallbackMessage
        });

        vscode.window.showWarningMessage(
            `VibeShield: Process crashed (exit ${exitCode}). Configure API key for AI analysis.`,
            'Open Settings'
        ).then((action) => {
            if (action === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'vibeshield.apiKey');
            }
        });
    }

    /**
     * Reset the retry counter (e.g., when user manually starts fresh)
     */
    public resetAttempts() {
        this.attemptCount = 0;
    }

    /**
     * Get the last analysis result (for debug commands)
     */
    public getLastAnalysis(): LogAnalysisResult | null {
        return this.lastAnalysis;
    }

    /**
     * Get current phase
     */
    public getPhase(): AgentPhase {
        return this.currentPhase;
    }

    private setPhase(phase: AgentPhase) {
        this.currentPhase = phase;
        console.log(`[VibeShield Agent] Phase: ${phase}`);
        this.connector.sendStatusUpdate(phase);
    }

    public dispose() {
        this.clearTimers();
    }
}
