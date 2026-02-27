import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
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
import { SmartMemoryManager } from './services/SmartMemoryManager';

import { CLIExecutor } from './services/CLIExecutor';
import { HTTPExecutor } from './services/HTTPExecutor';
import { BrowserAgent } from '@vibeshield/browser-agent';
import { VisualRegressionTracker } from './services/VisualRegressionTracker';

let connector: OverlayConnector;
let chatProvider: ChatViewProvider;
let processManager: ProcessManager;
let logCapture: LogCapture;
let logSelector: LogSelector;
let cortexBridge: CortexBridge;
let agentLoop: AgentLoop;
let smartMemoryManager: SmartMemoryManager;
let cliExecutor: CLIExecutor;
let httpExecutor: HTTPExecutor;
let visualRegressionTracker: VisualRegressionTracker;
let latestExtractedIntent: any = null;
let latestTestPlan: any = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('VibeShield Extension is now active!');

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        smartMemoryManager = new SmartMemoryManager(folders[0].uri.fsPath);
    }

    visualRegressionTracker = new VisualRegressionTracker();

    // ─── Layer 1: Communication ───────────────────────────────────
    // WHY: OverlayConnector is the WebSocket bridge to the Electron Overlay UI.
    // Everything that needs to appear in the overlay goes through this.
    connector = new OverlayConnector(context);
    connector.connect();
    cliExecutor = new CLIExecutor(connector);
    httpExecutor = new HTTPExecutor(connector);

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
    chatProvider = new ChatViewProvider(context.extensionUri, connector, contextExtractor, chatExtractor);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
    );

    // ─── Layer 8: Agent Loop (The Nervous System) ─────────────────
    // MOVED DOWN: AgentLoop needs EVERYTHING: ProcessManager, LogCapture,
    // LogSelector, CortexBridge, OverlayConnector, AND ChatViewProvider.
    agentLoop = new AgentLoop(processManager, logCapture, logSelector, cortexBridge, connector, chatProvider);
    context.subscriptions.push(agentLoop);

    // ─── Wiring: Chat Panel → AgentLoop ──────────────────────────
    chatProvider.onMessageReceived(async (msgPayload) => {
        // We get chat history so cortex knows what was said
        const chatContext = await contextExtractor.getIntentContext();

        // Pass to Cortex
        const aiResponse = await cortexBridge.respondToChat(msgPayload.text, chatContext.chatHistory, msgPayload.context);

        // Send back to Chat Sidebar
        chatProvider.sendAIMessage(aiResponse);

        // Also push it to the Overlay feed so the webview syncs
        connector.sendMessageToOverlay({
            type: 'chat_message',
            timestamp: new Date().toISOString(),
            payload: {
                id: Date.now().toString(),
                role: 'assistant',
                content: aiResponse,
                source: 'cortex'
            }
        } as any);

        // Optionally save this aiResponse back to chat history if we had pushAccess right here
        chatExtractor.pushMessage('assistant', aiResponse);
    });

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
        console.log('[VibeShield] Running command handler for action:', cmd.action);
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
        } else if (cmd.action === 'extract_intent') {
            vscode.commands.executeCommand('vibeshield.extractIntent');
        } else if (cmd.action === 'clear_memory') {
            if (smartMemoryManager) {
                smartMemoryManager.clearMemoryLocally();
                vscode.window.showInformationMessage('VibeShield: Smart Memory Cleared!');
                console.log('[VibeShield] Smart memory wiped locally for the workspace.');
            }
        } else if (cmd.action === 'generate_test_plan') {
            vscode.commands.executeCommand('vibeshield.generateTestPlan');
        } else if (cmd.action === 'execute_test_plan') {
            vscode.commands.executeCommand('vibeshield.executeTestPlan');
        }
    });

    const extractIntentLogic = async () => {
        if (!cortexBridge.isReady()) {
            connector.sendLog({
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                source: 'system',
                level: 'error',
                content: 'Failed to extract intent: No API key configured. Go to Settings > VibeShield.'
            });
            vscode.window.showErrorMessage('VibeShield: No API key configured. Setting needed for Cortex-R.');
            return;
        }

        vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Extracting Intent via Cortex-R...' },
            async () => {
                try {
                    connector.sendLog({
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        source: 'cortex',
                        level: 'info',
                        content: 'Beginning Intent Extraction in IDE Context...'
                    });

                    // Extract chat history
                    const chatContext = await contextExtractor.getIntentContext();

                    // Generate git diff for code changes
                    let diffSummary = '';
                    const folders = vscode.workspace.workspaceFolders;
                    if (folders) {
                        try {
                            diffSummary = cp.execSync('git diff HEAD', { cwd: folders[0].uri.fsPath, encoding: 'utf8' });
                            if (diffSummary.length > 8000) {
                                diffSummary = diffSummary.substring(0, 8000) + '... (truncated due to length)';
                            }
                        } catch (err: any) {
                            diffSummary = 'Could not generate git diff: ' + err.message;
                        }
                    }

                    let currentMemory = '';
                    if (smartMemoryManager) {
                        currentMemory = smartMemoryManager.getMemory();
                        if (chatContext.chatHistory.trim() !== '') {
                            // Update memory with new info
                            vscode.window.showInformationMessage('VibeShield: Updating Smart Memory...');
                            const updatedMemory = await cortexBridge.updateSmartMemory(currentMemory, chatContext.chatHistory);

                            // Save back safely
                            if (updatedMemory && updatedMemory !== currentMemory) {
                                smartMemoryManager.updateMemoryLocally(updatedMemory);
                                currentMemory = updatedMemory;
                            }
                        }
                    }

                    // Send to Cortex-R
                    const intentResult = await cortexBridge.extractIntent(chatContext.chatHistory, diffSummary, currentMemory);
                    latestExtractedIntent = intentResult;

                    // Send back to overlay
                    connector.sendMessageToOverlay({
                        type: 'intent_extracted',
                        timestamp: new Date().toISOString(),
                        payload: intentResult
                    });

                    // Show info in VS Code
                    const resultDoc = await vscode.workspace.openTextDocument({
                        content: JSON.stringify({ intent: intentResult, memory_snapshot: currentMemory }, null, 2),
                        language: 'json'
                    });
                    vscode.window.showTextDocument(resultDoc);
                } catch (e: any) {
                    vscode.window.showErrorMessage('Intent Extraction Failed: ' + e.message);
                }
            }
        );
    };

    const generateTestPlanLogic = async () => {
        if (!latestExtractedIntent) {
            vscode.window.showErrorMessage('VibeShield: No intent extracted yet. Please extract intent first.');
            return;
        }

        if (!cortexBridge.isReady()) {
            vscode.window.showErrorMessage('VibeShield: No API key configured. Setting needed for Cortex-R.');
            return;
        }

        vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Generating Test Plan via Cortex-R...' },
            async () => {
                try {
                    let projectContext = '';
                    const folders = vscode.workspace.workspaceFolders;
                    if (folders) {
                        try {
                            const packageJson = cp.execSync('cat package.json', { cwd: folders[0].uri.fsPath, encoding: 'utf8' });
                            projectContext = 'package.json: ' + packageJson;
                        } catch (e) {
                            projectContext = 'No package.json found.';
                        }
                    }

                    const testPlan = await cortexBridge.generateTestPlan(latestExtractedIntent, projectContext);

                    latestTestPlan = testPlan;
                    connector.sendMessageToOverlay({
                        type: 'test_plan_generated',
                        timestamp: new Date().toISOString(),
                        payload: testPlan
                    } as any);

                    const resultDoc = await vscode.workspace.openTextDocument({
                        content: JSON.stringify(testPlan, null, 2),
                        language: 'json'
                    });
                    vscode.window.showTextDocument(resultDoc);
                } catch (e: any) {
                    vscode.window.showErrorMessage('Test Plan Generation Failed: ' + e.message);
                }
            }
        );
    };

    const executeTestPlanLogic = async () => {
        if (!latestTestPlan || !latestTestPlan.steps || latestTestPlan.steps.length === 0) {
            vscode.window.showErrorMessage('VibeShield: No valid test plan to execute.');
            return;
        }

        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            vscode.window.showErrorMessage('VibeShield: No workspace folder open.');
            return;
        }

        vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'VibeShield: Executing Test Plan with Cortex-R Analysis...' },
            async () => {
                connector.sendLog({
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'system',
                    level: 'info',
                    content: `========== Starting Test execution for Target: ${latestTestPlan.testType} ==========`
                });

                const steps = latestTestPlan.steps;
                let allPassed = true;

                // --- Aggregation State ---
                const startTime = Date.now();
                const stepResults: any[] = [];
                let failedLogBuffer = '';

                let sharedBrowserAgent: BrowserAgent | null = null;
                const apiKey = vscode.workspace.getConfiguration('vibeshield').get<string>('apiKey');

                if ((latestTestPlan.testType === 'ui' || latestTestPlan.testType === 'e2e') && apiKey) {
                    try {
                        sharedBrowserAgent = new BrowserAgent({
                            apiKey,
                            headless: false,
                            artifactsPath: `${folders[0].uri.fsPath}/.vibeshield/artifacts`
                        });
                        await sharedBrowserAgent.start();
                    } catch (e: any) {
                        vscode.window.showErrorMessage('Failed to start BrowserAgent: ' + e.message);
                        if (sharedBrowserAgent) await sharedBrowserAgent.close();
                        return;
                    }
                }

                try {
                    for (let i = 0; i < steps.length; i++) {
                        const step = steps[i];
                        const stepStartTime = Date.now();

                        connector.sendLog({
                            id: Date.now().toString(),
                            timestamp: new Date().toISOString(),
                            source: 'system',
                            level: 'info',
                            content: `--- Step ${i + 1}: ${step.stepName} ---`
                        });

                        let stepPassed = false;
                        let stepAnalysis = '';
                        let stepRootCause = '';
                        let stepType: 'api' | 'cli' | 'manual' = 'manual';
                        let visualData: any = undefined;

                        if (latestTestPlan.testType === 'ui' || latestTestPlan.testType === 'e2e') {
                            stepType = 'manual'; // Treat it somewhat like manual but we will try running UI logic

                            connector.sendLog({
                                id: Date.now().toString(),
                                timestamp: new Date().toISOString(),
                                source: 'cortex',
                                level: 'info',
                                content: `Booting up BrowserAgent for UI Step ${i + 1}...`
                            });

                            // ===== PRODUCTION-GRADE TARGET URL RESOLUTION =====
                            // Works on any OS, any project structure, for any user installing VibeShield
                            let targetUrl = '';

                            // TIER 1: Explicit URL from test plan action, description, or name
                            const urlMatchInAction = step.action.match(/(https?|file):\/\/[^\s]+/);
                            if (urlMatchInAction) {
                                targetUrl = urlMatchInAction[0];
                            } else if (latestTestPlan.description && latestTestPlan.description.match(/(https?|file):\/\/[^\s]+/)) {
                                targetUrl = latestTestPlan.description.match(/(https?|file):\/\/[^\s]+/)[0];
                            } else if (latestTestPlan.planName && latestTestPlan.planName.match(/(https?|file):\/\/[^\s]+/)) {
                                targetUrl = latestTestPlan.planName.match(/(https?|file):\/\/[^\s]+/)[0];
                            }

                            // TIER 2: VS Code configuration setting (user-defined)
                            if (!targetUrl) {
                                targetUrl = vscode.workspace.getConfiguration('vibeshield').get<string>('defaultTestUrl') || '';
                            }

                            // TIER 3: Detect running dev server via cross-platform TCP probe (Node.js net module)
                            if (!targetUrl) {
                                const commonPorts = [3000, 3001, 4200, 5173, 5174, 8080, 4000, 9000];
                                for (const port of commonPorts) {
                                    try {
                                        await new Promise<void>((resolve, reject) => {
                                            const socket = new net.Socket();
                                            socket.setTimeout(300);
                                            socket.on('connect', () => {
                                                socket.destroy();
                                                resolve();
                                            });
                                            socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
                                            socket.on('error', (err: any) => { reject(err); });
                                            socket.connect(port, '127.0.0.1');
                                        });
                                        // Port is open! Use it.
                                        targetUrl = `http://localhost:${port}`;
                                        connector.sendLog({
                                            id: Date.now().toString(),
                                            timestamp: new Date().toISOString(),
                                            source: 'system',
                                            level: 'info',
                                            content: `🎯 Live Dev Server Detected: ${targetUrl}`
                                        });
                                        break;
                                    } catch (e) {
                                        // Port not open, try next
                                    }
                                }
                            }

                            // TIER 4: Detect framework from workspace package.json (cross-platform via VS Code API)
                            if (!targetUrl) {
                                try {
                                    const pkgFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 15);
                                    for (const file of pkgFiles) {
                                        try {
                                            const content = Buffer.from(await vscode.workspace.fs.readFile(file)).toString('utf8');
                                            const pkg = JSON.parse(content);
                                            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                                            if (deps['vite']) { targetUrl = 'http://localhost:5173'; break; }
                                            if (deps['next'] || deps['react-scripts']) { targetUrl = 'http://localhost:3000'; break; }
                                            if (deps['@angular/cli']) { targetUrl = 'http://localhost:4200'; break; }
                                            if (deps['nuxt'] || deps['@vue/cli-service']) { targetUrl = 'http://localhost:8080'; break; }
                                        } catch (e) { /* skip unreadable package.json */ }
                                    }
                                    if (targetUrl) {
                                        connector.sendLog({
                                            id: Date.now().toString(),
                                            timestamp: new Date().toISOString(),
                                            source: 'system',
                                            level: 'info',
                                            content: `🎯 Framework Detected → Default dev URL: ${targetUrl} (make sure your dev server is running!)`
                                        });
                                    }
                                } catch (e) { /* findFiles failed */ }
                            }

                            // TIER 5: Static HTML app — find index.html in workspace (cross-platform)
                            if (!targetUrl) {
                                try {
                                    const htmlFiles = await vscode.workspace.findFiles('**/index.html', '{**/node_modules/**,**/dist/**}', 10);
                                    if (htmlFiles.length > 0) {
                                        targetUrl = vscode.Uri.file(htmlFiles[0].fsPath).toString();
                                        connector.sendLog({
                                            id: Date.now().toString(),
                                            timestamp: new Date().toISOString(),
                                            source: 'system',
                                            level: 'info',
                                            content: `🎯 Static HTML App Found: ${targetUrl}`
                                        });
                                    }
                                } catch (e) { /* findFiles failed */ }
                            }


                            if (!targetUrl) {
                                stepPassed = false;
                                stepAnalysis = "Failed because no target URL was provided in the intent, and 'vibeshield.defaultTestUrl' is not set in VS Code settings.";
                                allPassed = false;
                                vscode.window.showErrorMessage("VibeShield Error: Missing Target URL. Please set 'vibeshield.defaultTestUrl' in your VS Code settings.");
                                connector.sendLog({
                                    id: Date.now().toString(),
                                    timestamp: new Date().toISOString(),
                                    source: 'system',
                                    level: 'error',
                                    content: `❌ UI Step Failed! No Target URL could be determined. Please specify a URL in your intent or configure 'vibeshield.defaultTestUrl' in your workspace settings.`
                                });
                            } else if (apiKey && sharedBrowserAgent) {
                                try {
                                    // Navigate first (only on step 0 or if URL is in the action)
                                    if (i === 0 || urlMatchInAction) {
                                        await sharedBrowserAgent.execute(`Navigate to ${targetUrl}`, 3);
                                    }
                                    // Then execute the actual action as a clean, focused goal
                                    const success = await sharedBrowserAgent.execute(step.action, 5);
                                    const finalScreenshot = await sharedBrowserAgent.getLastScreenshot();

                                    let diffBase64: string | undefined = undefined;
                                    let isRegression = false;

                                    if (finalScreenshot) {
                                        // Visual Regression check
                                        const diffResult = await visualRegressionTracker.compare(latestTestPlan.planName + '_' + step.stepName, finalScreenshot);

                                        visualData = {
                                            screenshotBase64: finalScreenshot,
                                            baselineBase64: diffResult.baselineBase64,
                                            diffBase64: diffResult.diffBase64,
                                            matchPercentage: diffResult.mismatchPercentage
                                        };

                                        diffBase64 = diffResult.diffBase64;
                                        isRegression = diffResult.isRegression;

                                        if (isRegression) {
                                            connector.sendLog({
                                                id: Date.now().toString(),
                                                timestamp: new Date().toISOString(),
                                                source: 'system',
                                                level: 'warn',
                                                content: `⚠️ Visual Regression Detected (${diffResult.mismatchPercentage?.toFixed(2)}% difference)! Passing diff to Cortex-R for analysis...`
                                            });
                                        }
                                    }

                                    connector.sendLog({
                                        id: Date.now().toString(),
                                        timestamp: new Date().toISOString(),
                                        source: 'cortex',
                                        level: 'info',
                                        content: `Analyzing final UI state via Cortex-R...`
                                    });

                                    const uiAnalysis = await cortexBridge.analyzeUIState(
                                        finalScreenshot || '',
                                        step.expectedResult,
                                        diffBase64
                                    );

                                    // If Cortex says it passed even WITH a visual diff, we should update the baseline
                                    if (uiAnalysis.passed && finalScreenshot) {
                                        visualRegressionTracker.updateBaseline(latestTestPlan.planName + '_' + step.stepName, finalScreenshot);
                                    }

                                    stepPassed = success && uiAnalysis.passed;
                                    stepAnalysis = uiAnalysis.analysis;
                                    stepRootCause = uiAnalysis.rootCause || '';

                                    if (stepPassed) {
                                        connector.sendLog({
                                            id: Date.now().toString(),
                                            timestamp: new Date().toISOString(),
                                            source: 'cortex',
                                            level: 'info',
                                            content: `✅ UI Step Passed! Analysis: ${uiAnalysis.analysis}`
                                        });
                                    } else {
                                        allPassed = false;
                                        connector.sendLog({
                                            id: Date.now().toString(),
                                            timestamp: new Date().toISOString(),
                                            source: 'cortex',
                                            level: 'error',
                                            content: `❌ UI Step Failed!\nAnalysis: ${uiAnalysis.analysis}\nRoot Cause: ${uiAnalysis.rootCause}`
                                        });
                                        failedLogBuffer += `\nStep: ${step.stepName}\nReason: ${uiAnalysis.rootCause || uiAnalysis.analysis}\n`;
                                    }
                                } catch (err: any) {
                                    stepPassed = false;
                                    stepAnalysis = "Error during UI execution: " + err.message;
                                    allPassed = false;
                                    connector.sendLog({
                                        id: Date.now().toString(),
                                        timestamp: new Date().toISOString(),
                                        source: 'cortex',
                                        level: 'error',
                                        content: `❌ UI Step Error!\n${err.message}`
                                    });
                                }
                            } else {
                                stepPassed = false;
                                stepAnalysis = "Failed because API key is not configured for BrowserAgent.";
                                allPassed = false;
                            }

                        } else if (step.apiRequest) {
                            stepType = 'api';
                            const result = await httpExecutor.executeRequest(step.apiRequest);

                            connector.sendLog({
                                id: Date.now().toString(),
                                timestamp: new Date().toISOString(),
                                source: 'cortex',
                                level: 'info',
                                content: `Analyzing API result for step ${i + 1} via Cortex-R...`
                            });

                            const analysis = await cortexBridge.analyzeAPIResult(
                                step.apiRequest.url,
                                step.apiRequest.method,
                                step.apiRequest.headers,
                                step.apiRequest.body,
                                step.expectedResult,
                                result.status,
                                result.headers,
                                result.data,
                                result.responseTimeMs
                            );

                            stepPassed = analysis.passed;
                            stepAnalysis = analysis.analysis;
                            stepRootCause = analysis.rootCause || '';

                            if (analysis.passed) {
                                connector.sendLog({
                                    id: Date.now().toString(),
                                    timestamp: new Date().toISOString(),
                                    source: 'cortex',
                                    level: 'info',
                                    content: `✅ Step Passed! Analysis: ${analysis.analysis}`
                                });
                            } else {
                                allPassed = false;
                                connector.sendLog({
                                    id: Date.now().toString(),
                                    timestamp: new Date().toISOString(),
                                    source: 'cortex',
                                    level: 'error',
                                    content: `❌ Step Failed!\nAnalysis: ${analysis.analysis}\nRoot Cause: ${analysis.rootCause}`
                                });
                                failedLogBuffer += `\nStep: ${step.stepName}\nReason: ${analysis.rootCause || analysis.analysis}\n`;
                                // We don't break anymore, so we can aggregate all failures!
                            }
                        } else if (step.cliCommand && step.cliCommand.trim() !== '') {
                            stepType = 'cli';
                            const result = await cliExecutor.executeCommand(step.cliCommand, { cwd: folders[0].uri.fsPath });

                            connector.sendLog({
                                id: Date.now().toString(),
                                timestamp: new Date().toISOString(),
                                source: 'cortex',
                                level: 'info',
                                content: `Analyzing result for step ${i + 1} via Cortex-R...`
                            });

                            const analysis = await cortexBridge.analyzeTestResult(
                                step.cliCommand,
                                step.expectedResult,
                                result.stdout,
                                result.stderr,
                                result.exitCode
                            );

                            stepPassed = analysis.passed;
                            stepAnalysis = analysis.analysis;
                            stepRootCause = analysis.rootCause || '';

                            if (analysis.passed) {
                                connector.sendLog({
                                    id: Date.now().toString(),
                                    timestamp: new Date().toISOString(),
                                    source: 'cortex',
                                    level: 'info',
                                    content: `✅ Step Passed! Analysis: ${analysis.analysis}`
                                });
                            } else {
                                allPassed = false;
                                connector.sendLog({
                                    id: Date.now().toString(),
                                    timestamp: new Date().toISOString(),
                                    source: 'cortex',
                                    level: 'error',
                                    content: `❌ Step Failed!\nAnalysis: ${analysis.analysis}\nRoot Cause: ${analysis.rootCause}`
                                });
                                failedLogBuffer += `\nStep: ${step.stepName}\nReason: ${analysis.rootCause || analysis.analysis}\n`;
                            }
                        } else {
                            stepType = 'manual';
                            stepPassed = true; // Mark as passed logically so it doesn't fail the suite
                            stepAnalysis = 'Skipped automated execution (Manual Step).';
                            connector.sendLog({
                                id: Date.now().toString(),
                                timestamp: new Date().toISOString(),
                                source: 'system',
                                level: 'warn',
                                content: `Manual Test Step: ${step.action}\n(No automated CLI/API command available. Skipping execution.)`
                            });
                        }

                        // Store Result
                        stepResults.push({
                            stepName: step.stepName,
                            action: step.action,
                            passed: stepPassed,
                            analysis: stepAnalysis,
                            rootCause: stepRootCause,
                            durationMs: Date.now() - stepStartTime,
                            testType: stepType,
                            visualData: visualData
                        });

                        if (!allPassed) break; // Still stop on first failure to save tokens
                    }
                } finally {
                    if (sharedBrowserAgent) {
                        await sharedBrowserAgent.close();
                    }
                }

                const totalDuration = Date.now() - startTime;
                let aiFeedback: string | undefined = undefined;

                if (allPassed) {
                    vscode.window.showInformationMessage('VibeShield: Tests executed and verified successfully by Cortex-R.');
                    connector.sendLog({
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        source: 'system',
                        level: 'info',
                        content: `Test Plan Successfully completed in ${totalDuration}ms!`
                    });
                } else {
                    vscode.window.showErrorMessage('VibeShield: Test execution encountered a failure.');

                    // Task 2.4.2: Generate Failure Feedback via Cortex-R
                    connector.sendLog({
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        source: 'cortex',
                        level: 'info',
                        content: `Generating AI Fix suggestions for failed tests...`
                    });

                    aiFeedback = await cortexBridge.generateFailureFeedback(failedLogBuffer);

                    connector.sendLog({
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        source: 'cortex',
                        level: 'error',
                        content: `💡 AI Suggestion:\n${aiFeedback}`
                    });

                    // Send the AI feedback to the IDE Chat sidebar as well
                    if (chatProvider) {
                        if (chatProvider.isViewReady()) {
                            chatProvider.sendAIMessage(`**Test Execution Failed**\n\n${aiFeedback}`);
                        } else {
                            console.warn('[VibeShield] chatProvider not ready! Cannot send AI Feedback to chat side panel.');
                            vscode.window.showWarningMessage('Open the VibeShield Chat panel to see the AI failure analysis!');
                        }
                    }

                    // Forward to Native IDE Chat (Copilot/etc) via clipboard, but NO dangerous AppleScript
                    const forwardToNative = vscode.workspace.getConfiguration('vibeshield').get<boolean>('forwardToNativeChat', false);
                    if (forwardToNative && aiFeedback) {
                        const query = `Fix this test failure:\n${aiFeedback}`;
                        await vscode.env.clipboard.writeText(query);
                        vscode.window.showInformationMessage('VibeShield: Copied AI failure analysis to clipboard. Paste it in your chat to resolve!');
                    }
                }

                // Send 2.4.1 Aggregation Report to Overlay
                connector.sendMessageToOverlay({
                    type: 'test_execution_report',
                    timestamp: new Date().toISOString(),
                    payload: {
                        testType: latestTestPlan.testType,
                        planName: latestTestPlan.planName,
                        totalSteps: steps.length,
                        passedSteps: stepResults.filter(r => r.passed).length,
                        failedSteps: stepResults.filter(r => !r.passed).length,
                        durationMs: totalDuration,
                        allPassed,
                        results: stepResults,
                        aiFeedback
                    }
                } as any);
            }
        );
    };

    // ─── Register VS Code Commands ───────────────────────────────
    const extractIntentCmd = vscode.commands.registerCommand('vibeshield.extractIntent', extractIntentLogic);
    const generateTestPlanCmd = vscode.commands.registerCommand('vibeshield.generateTestPlan', generateTestPlanLogic);
    const executeTestPlanCmd = vscode.commands.registerCommand('vibeshield.executeTestPlan', executeTestPlanLogic);
    context.subscriptions.push(extractIntentCmd, generateTestPlanCmd, executeTestPlanCmd);

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
