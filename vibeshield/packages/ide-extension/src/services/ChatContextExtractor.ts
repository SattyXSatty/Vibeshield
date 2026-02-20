import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';

export type IDEType = 'cursor' | 'antigravity' | 'vscode' | 'unknown';

/**
 * ChatContextExtractor uses multiple strategies to capture the developer's chat context:
 * 
 * Strategy 1 (Live): Register a VS Code Chat Participant to receive messages in real-time.
 * Strategy 2 (Brain): Read Antigravity brain task files for high-level intent.
 * Strategy 3 (DB): Query workspace SQLite storage for Cursor composer data.
 * Strategy 4 (Manual): Accept manually pushed messages from extension commands.
 * Strategy 5 (Import): Parse Antigravity chat export (.md) files.
 * Strategy 6 (Scraper): EXPERIMENTAL - Use macOS Accessibility API to scrape chat text.
 */
export class ChatContextExtractor {
    private workspaceStoragePath: string | undefined;
    private ideType: IDEType = 'unknown';
    private diagnostics: string[] = [];

    // In-memory store for captured messages (Strategy 1 & 4 & 6)
    private capturedMessages: { role: string; text: string; timestamp: number; source?: string }[] = [];
    private scraperInterval: NodeJS.Timeout | undefined;
    private persistTimeout: NodeJS.Timeout | undefined;
    private conversationWatcher: fs.FSWatcher | undefined;
    private knownConversations = new Set<string>();
    private _onChatMessageFound = new vscode.EventEmitter<{ role: string; text: string; source: string; timestamp: number }>();
    public readonly onChatMessageFound = this._onChatMessageFound.event;

    private emitMessage(role: string, text: string, source: string, timestamp: number = Date.now()) {
        const msg = { role, text, timestamp, source };
        // De-dupe against in-memory store
        if (!this.capturedMessages.some(m => m.text === text)) {
            this.capturedMessages.push(msg);
            this._onChatMessageFound.fire({ role, text, source, timestamp });
            this.diagnostics.push(`[Event] Captured new message from ${source}`);
        }
    }

    constructor(private context: vscode.ExtensionContext) {
        this.detectIDE();
        this.resolveWorkspaceStoragePath();
        this.registerChatParticipant();
        this.startBrainWatcher();
        this.startDatabaseWatcher();
        this.startConversationWatcher();

        // Initial extraction on startup (5s delay to let IDE settle)
        setTimeout(() => this.triggerPersist('startup'), 5000);
    }

    // ─── IDE Detection ───────────────────────────────────────────

    private detectIDE() {
        const appName = vscode.env.appName.toLowerCase();
        this.diagnostics.push(`App Name: ${vscode.env.appName}`);

        if (appName.includes('cursor')) {
            this.ideType = 'cursor';
        } else if (appName.includes('antigravity') || appName.includes('gemini') || appName.includes('kiro')) {
            this.ideType = 'antigravity';
        } else {
            this.ideType = 'vscode';
        }
        this.diagnostics.push(`Detected IDE Type: ${this.ideType}`);
    }

    private resolveWorkspaceStoragePath() {
        if (!this.context.storageUri) {
            this.diagnostics.push('No storageUri available.');
            return;
        }

        const extensionStorageDir = this.context.storageUri.fsPath;
        const workspaceStorageDir = path.dirname(extensionStorageDir);
        const dbPath = path.join(workspaceStorageDir, 'state.vscdb');

        if (fs.existsSync(dbPath)) {
            this.workspaceStoragePath = dbPath;
            this.diagnostics.push(`Found state.vscdb at: ${dbPath}`);
        } else {
            this.diagnostics.push('state.vscdb NOT found.');
        }
    }

    // ─── Strategy 1: VS Code Chat Participant API ────────────────

    private registerChatParticipant() {
        try {
            // Register a chat participant so we can intercept user messages
            const participant = vscode.chat.createChatParticipant('vibeshield.watcher',
                async (request: vscode.ChatRequest, context: vscode.ChatContext, response: vscode.ChatResponseStream) => {
                    // Store the user's message
                    this.capturedMessages.push({
                        role: 'user',
                        text: request.prompt,
                        timestamp: Date.now()
                    });

                    // Store conversation history from context
                    for (const turn of context.history) {
                        if (turn instanceof vscode.ChatRequestTurn) {
                            // Don't duplicate if already captured
                            const exists = this.capturedMessages.some(m => m.text === turn.prompt);
                            if (!exists) {
                                this.capturedMessages.push({
                                    role: 'user',
                                    text: turn.prompt,
                                    timestamp: Date.now() - 1000 // slightly older
                                });
                            }
                        }
                    }

                    // Keep only last 20 messages
                    if (this.capturedMessages.length > 20) {
                        this.capturedMessages = this.capturedMessages.slice(-20);
                    }

                    response.markdown('VibeShield is monitoring this conversation for safety analysis.');
                    this.diagnostics.push(`Chat participant captured message: "${request.prompt.substring(0, 50)}..."`);
                }
            );

            participant.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
            this.context.subscriptions.push(participant);
            this.diagnostics.push('Chat participant registered successfully.');
        } catch (e: any) {
            this.diagnostics.push(`Chat participant registration failed: ${e.message}`);
            // Not all IDEs support this API — that's OK, we have fallbacks
        }
    }

    // ─── Strategy 4: Manual Push ─────────────────────────────────

    /**
     * Allows other parts of the extension to push messages manually.
     * Useful for intercepting messages from custom webview panels.
     */
    public pushMessage(role: string, text: string) {
        this.capturedMessages.push({ role, text, timestamp: Date.now() });
        if (this.capturedMessages.length > 20) {
            this.capturedMessages = this.capturedMessages.slice(-20);
        }
    }

    // ─── Public API ──────────────────────────────────────────────

    public getDiagnostics(): string[] {
        return this.diagnostics;
    }

    public getIDEType(): IDEType {
        return this.ideType;
    }

    public async getRecentChatHistory(limit: number = 8): Promise<string[]> {
        try {
            const allMessages: { text: string; timestamp: number; importance: number }[] = [];

            // 1. In-memory captured messages
            for (const m of this.capturedMessages) {
                allMessages.push({
                    text: m.text,
                    timestamp: m.timestamp,
                    importance: m.role === 'user' ? 2 : 1
                });
            }

            // 2. Brain Artifacts (Antigravity only)
            if (this.ideType === 'antigravity') {
                const brainHistory = await this.getAntigravityBrainHistory(limit);
                for (const text of brainHistory) {
                    allMessages.push({
                        text,
                        timestamp: Date.now() - 5000, // Heuristic: brain is historical
                        importance: 3 // Artifacts are very important for context
                    });
                }

                // 2.5 Global State (Chat trajectory)
                const globalResults = await this.extractFromGlobalStateDb(limit);
                for (const text of globalResults) {
                    allMessages.push({
                        text,
                        timestamp: Date.now() - 2000,
                        importance: 2
                    });
                }
            }

            // 3. Database Scans (Workspace History - likely recent manual inputs)
            if (this.workspaceStoragePath) {
                const dbResults = await this.performDeepDbScan(this.workspaceStoragePath, limit);
                for (const text of dbResults) {
                    // FORCE to top with future timestamp
                    allMessages.push({
                        text: `[DB] ${text}`,
                        timestamp: Date.now() + 10000,
                        importance: 2
                    });
                }
            }

            if (this.ideType === 'cursor') {
                const cursorHistory = await this.getCursorGlobalFallback(limit);
                for (const text of cursorHistory) {
                    allMessages.push({ text: `[Cursor] ${text}`, timestamp: Date.now() - 1000, importance: 1 });
                }
            }

            // --- DE-DUPE AND SORT ---
            // 1. Filter unique texts
            const seen = new Set<string>();
            const unique = allMessages.filter(m => {
                const snippet = m.text.substring(0, 50);
                if (seen.has(snippet)) return false;
                seen.add(snippet);
                return true;
            });

            // 2. Sort by timestamp (newest first)
            unique.sort((a, b) => (b.timestamp + b.importance * 1000) - (a.timestamp + a.importance * 1000));

            this.diagnostics.push(`Context Merger: Compiled ${unique.length} segments.`);
            if (unique.length > 0) {
                this.diagnostics.push(`Top 1: ${unique[0].timestamp} - ${unique[0].text.substring(0, 40)}`);
            }

            // Map back to strings
            return unique.slice(0, limit).map(m => m.text);

        } catch (error: any) {
            this.diagnostics.push(`Extraction Error: ${error.message}`);
            return [];
        }
    }


    // ─── Strategy 2: Antigravity Brain ───────────────────────────

    private async getAntigravityBrainHistory(limit: number): Promise<string[]> {
        const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
        if (!fs.existsSync(brainDir)) return [];

        try {
            const entries = fs.readdirSync(brainDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'tempmediaStorage')
                .map(d => ({ name: d.name, path: path.join(brainDir, d.name), mtime: fs.statSync(path.join(brainDir, d.name)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);

            this.diagnostics.push(`Found ${entries.length} brain folders. Deep-scanning top 5.`);
            const prompts: string[] = [];

            for (const conv of entries.slice(0, 5)) {
                const files = fs.readdirSync(conv.path);
                const metadataFiles = files.filter(f => f.endsWith('.metadata.json'));
                for (const mf of metadataFiles) {
                    try {
                        const raw = fs.readFileSync(path.join(conv.path, mf), 'utf-8');
                        const meta = JSON.parse(raw);
                        if (meta.summary && meta.summary.length > 10) {
                            const name = mf.replace('.metadata.json', '');
                            prompts.push(`[${meta.artifactType || 'artifact'}] ${name}: ${meta.summary.substring(0, 200)}`);
                            this.diagnostics.push(`Brain metadata: ${name} in ${conv.name}`);
                        }
                    } catch (_e) { /* skip */ }
                }
                const artifactFiles = ['task.md', 'implementation_plan.md', 'walkthrough.md'];
                for (const af of artifactFiles) {
                    if (files.includes(af)) {
                        try {
                            const content = fs.readFileSync(path.join(conv.path, af), 'utf-8');
                            if (content.length > 20) {
                                const snippet = content.substring(0, 300).replace(/\n/g, ' ').trim();
                                prompts.push(`Intent from ${af}: ${snippet}...`);
                                this.diagnostics.push(`Found ${af} in ${conv.name}`);
                                const exists = this.capturedMessages.some(m => m.text === snippet);
                                if (!exists) {
                                    this.capturedMessages.push({ role: 'user', text: snippet, timestamp: conv.mtime, source: 'brain' });
                                }
                            }
                        } catch (_e) { /* skip */ }
                    }
                }
                if (prompts.length >= limit * 2) break;
            }
            return prompts.slice(0, limit);
        } catch (_e) { return []; }
    }

    public startBrainWatcher() {
        const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
        if (!fs.existsSync(brainDir)) {
            this.diagnostics.push('Brain directory not found.');
            return;
        }
        const watcher = fs.watch(brainDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;

            // Only react to metadata and artifact changes
            if (filename.endsWith('.metadata.json') || filename.endsWith('.md') || filename.endsWith('.resolved')) {
                try {
                    const fullPath = path.join(brainDir, filename);
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        if (content.length > 20) {
                            const type = filename.endsWith('.metadata.json') ? 'Brain Summary' : 'Brain Artifact';
                            const text = `[${type}] ${content.substring(0, 400).replace(/\n/g, ' ')}...`;

                            // Use unified emitter
                            this.emitMessage('user', text, 'brain-watcher');
                            // Trigger persist on brain change
                            this.triggerPersist('brain-change');
                        }
                    }
                } catch (_e) { /* skip busy files */ }
            }
        });
        this.context.subscriptions.push({ dispose: () => watcher.close() });
        this.diagnostics.push('Watching brain directory for real-time intent updates.');
    }

    private dbWatcherTimeout: NodeJS.Timeout | undefined;

    public startDatabaseWatcher() {
        // Watch Workspace DB (High Value)
        if (this.workspaceStoragePath && fs.existsSync(this.workspaceStoragePath)) {
            try {
                const wsWatcher = fs.watch(this.workspaceStoragePath, (_eventType) => {
                    if (this.dbWatcherTimeout) clearTimeout(this.dbWatcherTimeout);
                    this.dbWatcherTimeout = setTimeout(async () => {
                        const newItems = await this.performDeepDbScan(this.workspaceStoragePath!, 3);
                        for (const item of newItems) {
                            this.emitMessage('user', item, 'database-watcher');
                        }
                        this.triggerPersist('workspace-db-change');
                    }, 2000); // 2s debounce
                });
                this.context.subscriptions.push({ dispose: () => wsWatcher.close() });
                this.diagnostics.push(`Watching workspace DB: ${path.basename(this.workspaceStoragePath)}`);
            } catch (e) { this.diagnostics.push('Failed to watch workspace DB'); }
        }

        // Watch Global DB (Trajectory)
        const globalDbPath = path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
        if (fs.existsSync(globalDbPath)) {
            try {
                const gWatcher = fs.watch(globalDbPath, (_eventType) => {
                    if (this.dbWatcherTimeout) clearTimeout(this.dbWatcherTimeout);
                    this.dbWatcherTimeout = setTimeout(async () => {
                        const newItems = await this.extractFromGlobalStateDb(3);
                        for (const item of newItems) {
                            this.emitMessage('user', item, 'global-db-watcher');
                        }
                        this.triggerPersist('global-db-change');
                    }, 3000); // 3s debounce (larger file)
                });
                this.context.subscriptions.push({ dispose: () => gWatcher.close() });
                this.diagnostics.push('Watching global state DB for trajectories.');
            } catch (e) { /* ignore */ }
        }
    }

    public async forceSync() {
        this.diagnostics.push('Manual Sync initialized.');

        if (this.workspaceStoragePath) {
            const items = await this.performDeepDbScan(this.workspaceStoragePath, 10);
            for (const item of items) this.emitMessage('user', item, 'manual-sync');
        }

        const globalItems = await this.extractFromGlobalStateDb(5);
        for (const item of globalItems) this.emitMessage('user', item, 'manual-sync-global');
    }


    // ─── Strategy 7: Global State DB (Trajectory Summaries) ─────
    // The globalStorage/state.vscdb contains trajectory summaries with
    // embedded tool call data, task names, and conversation content.

    private async extractFromGlobalStateDb(limit: number): Promise<string[]> {
        const globalDbPath = path.join(
            os.homedir(), 'Library', 'Application Support', 'Antigravity',
            'User', 'globalStorage', 'state.vscdb'
        );
        if (!fs.existsSync(globalDbPath)) return [];

        try {
            const trajQuery = `SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.trajectorySummaries';`;
            const rawValue = await this.runSqliteQuery(globalDbPath, trajQuery);
            if (!rawValue || rawValue.length < 50) return [];

            // Outer: base64 -> binary protobuf
            const outerDecoded = Buffer.from(rawValue.trim(), 'base64').toString('binary');

            // Inner: find nested base64 blobs inside the protobuf
            const b64Blobs = outerDecoded.match(/[A-Za-z0-9+/=]{100,}/g) || [];
            const results: string[] = [];

            for (const blob of b64Blobs) {
                try {
                    const inner = Buffer.from(blob, 'base64').toString('utf-8');
                    if (!inner.match(/[A-Za-z]{5,}/)) continue;

                    // Extract JSON tool-call blobs
                    const jsonMatches = inner.match(/\{[^{}]*"(?:Message|TaskName|TaskSummary|BlockedOnUser)"[^{}]*\}/g) || [];
                    for (const jm of jsonMatches) {
                        try {
                            const parsed = JSON.parse(jm);
                            if (parsed.TaskName && parsed.TaskSummary && parsed.TaskSummary.length > 20) {
                                results.push(`[IDE Task] ${parsed.TaskName}: ${parsed.TaskSummary.substring(0, 300)}`);
                            }
                            if (parsed.Message && parsed.Message.length > 5) {
                                const cleanMsg = parsed.Message.replace(/```[^`]*```/g, '[code]').substring(0, 400);
                                results.push(`[IDE Chat] ${cleanMsg}`);
                            }
                        } catch (_e) { /* skip */ }
                    }

                    // Extract plain-text developer messages
                    const readable = inner.match(/[A-Za-z][\w .,!?:;'"()*`#\n-]{20,}/g) || [];
                    for (const r of readable) {
                        if (r.match(/^[A-Za-z0-9+/]{50,}/) || r.includes('==')) continue;
                        const clean = r.trim().substring(0, 200);
                        if (!results.some(ex => ex.includes(clean.substring(0, 40)))) {
                            results.push(`[IDE Context] ${clean}`);
                        }
                    }
                } catch (_e) { /* decode error */ }
            }

            // NEW: Scan 'jetskiStateSync.agentManagerInitState' (Active Agent State)
            try {
                const jetskiQuery = `SELECT value FROM ItemTable WHERE key = 'jetskiStateSync.agentManagerInitState';`;
                const jetskiRaw = await this.runSqliteQuery(globalDbPath, jetskiQuery);
                if (jetskiRaw && jetskiRaw.length > 50) {
                    const decoded = Buffer.from(jetskiRaw.trim(), 'base64').toString('utf-8');
                    // Use generic text extractor
                    const prompts = this.extractPromptsFromText(decoded, limit);
                    for (const p of prompts) {
                        results.push(`[IDE Active] ${p}`);
                    }
                    // Also try permissive printable char extraction for non-JSON content
                    // Relaxed significantly to catch short chat messages: 8+ chars
                    const rawMatches = decoded.match(/[ -~]{8,}/g) || [];
                    for (const rm of rawMatches) {
                        // Heuristic filter
                        if (!rm.includes('Request') && !rm.includes('Response') && !rm.includes('{"') && !results.includes(`[IDE Active] ${rm}`)) {
                            results.push(`[IDE Raw] ${rm.substring(0, 200)}`);
                        }
                    }
                }
            } catch (e) { this.diagnostics.push('Failed to read jetski state'); }

            if (results.length > 0) {
                this.diagnostics.push(`Extracted ${results.length} items from Global DB.`);
                for (const r of results.slice(0, limit)) {
                    const exists = this.capturedMessages.some(m => m.text === r);
                    if (!exists) {
                        // Default to 'assistant' for global state items, unless they look like user input?
                        // Hard to tell. But context is valuable.
                        this.capturedMessages.push({
                            role: 'assistant', text: r, timestamp: Date.now(), source: 'global-state'
                        });
                    }
                }
            }
            return results.slice(0, limit);
        } catch (_e) {
            this.diagnostics.push('Failed to read global state DB.');
            return [];
        }
    }

    // ─── Strategy 3: SQLite DB Scan ──────────────────────────────

    private async performDeepDbScan(dbPath: string, limit: number): Promise<string[]> {
        const keyQuery = `SELECT key FROM ItemTable WHERE key LIKE '%chat%' OR key LIKE '%composer%' OR key LIKE '%conversation%' OR key LIKE '%message%' OR key LIKE '%history%' LIMIT 50;`;
        const keysRaw = await this.runSqliteQuery(dbPath, keyQuery);
        const keys = keysRaw.split('\n').map(k => k.trim()).filter(Boolean);

        if (keys.length > 0) {
            this.diagnostics.push(`Found ${keys.length} keys in DB: ${keys.slice(0, 3).join(', ')}...`);
        }

        for (const key of keys) {
            const valQuery = `SELECT value FROM ItemTable WHERE key = '${key}' LIMIT 1;`;
            const val = await this.runSqliteQuery(dbPath, valQuery);
            if (val && val.length > 30) {
                const extracted = this.extractPromptsFromText(val, limit);
                if (extracted.length > 0) {
                    this.diagnostics.push(`Extracted ${extracted.length} prompts from "${key}"`);
                    return extracted;
                }
            }
        }
        return [];
    }

    private async getCursorGlobalFallback(limit: number): Promise<string[]> {
        const base = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');
        if (!fs.existsSync(base)) return [];

        const dirs = fs.readdirSync(base)
            .map(d => {
                try {
                    return { path: path.join(base, d, 'state.vscdb'), mtime: fs.statSync(path.join(base, d)).mtimeMs };
                } catch { return null; }
            })
            .filter((x): x is { path: string; mtime: number } => x !== null)
            .sort((a, b) => b.mtime - a.mtime);

        for (const entry of dirs.slice(0, 5)) {
            const res = await this.performDeepDbScan(entry.path, limit);
            if (res.length > 0) return res;
        }
        return [];
    }

    // ─── Helpers ──────────────────────────────────────────────────

    private runSqliteQuery(dbPath: string, query: string): Promise<string> {
        return new Promise((resolve) => {
            const sqlitePath = os.platform() === 'darwin' ? '/usr/bin/sqlite3' : 'sqlite3';
            cp.exec(`"${sqlitePath}" "${dbPath}" "${query}"`, (err, stdout) => {
                resolve(err ? '' : stdout);
            });
        });
    }

    private extractPromptsFromText(rawData: string, limit: number): string[] {
        const prompts: string[] = [];
        // Look for quoted strings in JSON blobs or just loose text
        const textRegex = /"([^"]{5,5000})"/g;
        let match;
        while ((match = textRegex.exec(rawData)) !== null) {
            const text = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
            if (text.length > 8 && !text.startsWith('__') && !text.includes('{"')) {
                prompts.push(text);
            }
        }
        return prompts.reverse().slice(0, limit);
    }

    // ─── Strategy 5: Antigravity Export Parser ────────────────────

    public importChatExport(filePath: string): { userMessages: string[]; assistantMessages: string[]; actions: string[] } {
        const result = { userMessages: [] as string[], assistantMessages: [] as string[], actions: [] as string[] };

        if (!fs.existsSync(filePath)) {
            this.diagnostics.push(`Export file not found: ${filePath}`);
            return result;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        let currentSection: 'user' | 'assistant' | 'none' = 'none';
        let currentBuffer: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === '### User Input' || trimmed === '### User') {
                this.flushBuffer(currentSection, currentBuffer, result);
                currentSection = 'user';
                currentBuffer = [];
                continue;
            }

            if (trimmed === '### Planner Response' || trimmed === '### Assistant') {
                this.flushBuffer(currentSection, currentBuffer, result);
                currentSection = 'assistant';
                currentBuffer = [];
                continue;
            }

            if (line.includes('*User accepted the command')) {
                const match = line.match(/`(.+)`/);
                if (match) { result.actions.push(match[1]); }
                else { result.actions.push(line.replace(/\*User accepted the command/, '').replace(/\*/g, '').trim()); }
                continue;
            }

            if (line.includes('*Edited relevant file*') || line.includes('*Viewed file*')) {
                result.actions.push(trimmed.replace(/\*/g, ''));
                continue;
            }

            if (currentSection !== 'none') {
                currentBuffer.push(line);
            }
        }

        this.flushBuffer(currentSection, currentBuffer, result);

        for (const msg of result.userMessages) {
            if (msg.length > 5) {
                this.capturedMessages.push({ role: 'user', text: msg, timestamp: Date.now() });
            }
        }

        this.diagnostics.push(
            `Imported export: ${result.userMessages.length} user msgs, ` +
            `${result.assistantMessages.length} assistant msgs, ` +
            `${result.actions.length} actions from "${path.basename(filePath)}"`
        );

        return result;
    }

    private flushBuffer(section: 'user' | 'assistant' | 'none', buffer: string[], result: any) {
        if (buffer.length === 0) return;
        const text = buffer.join('\n').trim();
        if (!text) return;

        if (section === 'user') {
            result.userMessages.push(text);
        } else if (section === 'assistant') {
            result.assistantMessages.push(text);
        }
    }

    public startWatchingExports() {
        const downloadsDir = path.join(os.homedir(), 'Downloads');
        if (!fs.existsSync(downloadsDir)) { return; }

        const watcher = fs.watch(downloadsDir, (eventType, filename) => {
            if (eventType === 'rename' && filename && filename.endsWith('.md')) {
                const filePath = path.join(downloadsDir, filename);
                setTimeout(() => {
                    if (!fs.existsSync(filePath)) { return; }
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (content.startsWith('# Chat Conversation')) {
                        this.diagnostics.push(`Auto-detected export: ${filename}`);
                        const result = this.importChatExport(filePath);
                        vscode.window.showInformationMessage(
                            `VibeShield: Auto-imported ${result.userMessages.length} messages from "${filename}"`
                        );
                    }
                }, 1000);
            }
        });

        this.context.subscriptions.push({ dispose: () => watcher.close() });
        this.diagnostics.push('Watching Downloads folder for chat exports.');
    }

    // ─── Strategy 6: Accessibility Scraper (Experimental) ────────

    public startAccessibilityScraper() {
        if (this.scraperInterval) {
            this.diagnostics.push('Accessibility Scraper already running.');
            return;
        }

        if (process.platform !== 'darwin') {
            this.diagnostics.push('Accessibility Scraper only supported on macOS.');
            return;
        }

        // Try to find the script in common locations
        const possiblePaths = [
            path.join(this.context.extensionPath, 'src', 'scripts', 'scraper.js'),
            path.join(this.context.extensionPath, 'scripts', 'scraper.js'),
            path.join(this.context.extensionPath, 'dist', 'scripts', 'scraper.js')
        ];

        const scriptPath = possiblePaths.find(p => fs.existsSync(p));

        if (!scriptPath) {
            this.diagnostics.push(`Scraper script not found. Looked in: ${possiblePaths.join(', ')}`);
            return;
        }

        this.diagnostics.push('Starting Accessibility Scraper loop (5s interval)...');

        // Run immediately, then interval
        this.runScraper(scriptPath);
        this.scraperInterval = setInterval(() => this.runScraper(scriptPath), 5000);
    }

    private runScraper(scriptPath: string) {
        // osascript -l JavaScript src/scripts/scraper.js
        cp.exec(`osascript -l JavaScript "${scriptPath}"`, (err, stdout, stderr) => {
            if (err) {
                // Determine if it's a permission error
                if (stderr.includes('Not authorized to send Apple events')) {
                    this.diagnostics.push('Scraper Error: Permission denied. User must grant Accessibility access.');
                }
                return;
            }

            try {
                const data = JSON.parse(stdout);
                if (data.messages && Array.isArray(data.messages)) {
                    let newCount = 0;
                    for (const msg of data.messages) {
                        // msg = { role: string, value: string }
                        const text = msg.value;
                        if (!text || text.length < 10) continue;

                        // Deduplicate
                        const exists = this.capturedMessages.some(m => m.text === text);
                        if (!exists) {
                            this.capturedMessages.push({
                                role: 'user', // Heuristic: Assume most long text in sidebar is user context
                                text: text,
                                timestamp: Date.now(),
                                source: 'scraper'
                            });
                            newCount++;
                        }
                    }
                    if (newCount > 0) {
                        this.diagnostics.push(`Scraper found ${newCount} new messages from ${data.app}`);
                    }
                }
            } catch (e) {
                // JSON parse error (maybe script returned non-JSON)
            }
        });
    }

    // ─── Trigger-Based Persist (saves chat history for Cortex-R) ─────

    /**
     * Debounced trigger: schedule persistChatHistory() after a short delay.
     * Multiple rapid triggers (burst activity) collapse into a single write.
     */
    private triggerPersist(reason: string) {
        if (this.persistTimeout) clearTimeout(this.persistTimeout);
        this.persistTimeout = setTimeout(() => {
            this.persistChatHistory(reason);
        }, 3000); // 3s debounce
    }

    /**
     * Extract all chat data from known sources and save to
     * ~/.vibeshield/chat_history.json for Cortex-R consumption.
     */
    private async persistChatHistory(trigger: string) {
        const outputDir = path.join(os.homedir(), '.vibeshield');
        const outputFile = path.join(outputDir, 'chat_history.json');

        try {
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

            // Gather messages from all sources
            const allMessages: { role: string; text: string; source: string; timestamp: number }[] = [];

            // 1. In-memory captured messages
            for (const m of this.capturedMessages) {
                allMessages.push({ role: m.role, text: m.text, source: m.source || 'memory', timestamp: m.timestamp });
            }

            // 2. Global DB extraction (trajectory summaries)
            try {
                const globalItems = await this.extractFromGlobalStateDb(50);
                for (const item of globalItems) {
                    allMessages.push({ role: 'context', text: item, source: 'global-db', timestamp: Date.now() });
                }
            } catch (_e) { /* ignore */ }

            // 3. Brain artifacts
            const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
            if (fs.existsSync(brainDir)) {
                const convDirs = fs.readdirSync(brainDir, { withFileTypes: true })
                    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'tempmediaStorage')
                    .map(d => ({ name: d.name, path: path.join(brainDir, d.name), mtime: fs.statSync(path.join(brainDir, d.name)).mtimeMs }))
                    .sort((a, b) => b.mtime - a.mtime)
                    .slice(0, 10);

                for (const conv of convDirs) {
                    for (const af of ['task.md', 'implementation_plan.md', 'walkthrough.md']) {
                        const afPath = path.join(conv.path, af);
                        if (fs.existsSync(afPath)) {
                            try {
                                const content = fs.readFileSync(afPath, 'utf-8');
                                if (content.length > 20) {
                                    allMessages.push({
                                        role: 'brain_artifact',
                                        text: `[${af}] ${content.substring(0, 2000)}`,
                                        source: `brain:${conv.name}`,
                                        timestamp: conv.mtime
                                    });
                                }
                            } catch (_e) { /* skip */ }
                        }
                    }
                }
            }

            // De-duplicate by text prefix
            const seen = new Set<string>();
            const unique = allMessages.filter(m => {
                const key = m.text.substring(0, 80);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Build output
            const output = {
                extracted_at: new Date().toISOString(),
                trigger,
                total_messages: unique.length,
                messages: unique.map(m => ({
                    role: m.role,
                    text: m.text,
                    source: m.source,
                    timestamp: new Date(m.timestamp).toISOString()
                }))
            };

            fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');
            this.diagnostics.push(`[Persist] Saved ${unique.length} messages to ${outputFile} (trigger: ${trigger})`);
            console.log(`[VibeShield] Chat history persisted: ${unique.length} messages (trigger: ${trigger})`);

        } catch (err) {
            console.warn('[VibeShield] Failed to persist chat history:', err);
        }
    }

    // ─── Conversation Directory Watcher (new chat = new .pb file) ─────

    private retryTimers: NodeJS.Timeout[] = [];
    private lastConvChangeId = 0;

    /**
     * Watch ~/.gemini/antigravity/conversations/ for new .pb files.
     * A new .pb file means a new chat session was started.
     * 
     * Important: The IDE writes chat content to encrypted .pb files immediately,
     * but the global state DB (trajectory summaries) is updated ASYNCHRONOUSLY.
     * We use staggered retries (3s, 15s, 45s) to capture the data when it
     * becomes available in the DB.
     */
    private startConversationWatcher() {
        const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
        if (!fs.existsSync(convDir)) {
            this.diagnostics.push('Conversations directory not found.');
            return;
        }

        // Snapshot existing conversations with their sizes
        try {
            const existing = fs.readdirSync(convDir).filter(f => f.endsWith('.pb'));
            for (const f of existing) this.knownConversations.add(f);
            this.diagnostics.push(`Indexed ${existing.length} existing conversations.`);
        } catch (_e) { /* ignore */ }

        // Watch for new files AND changes to existing files
        this.conversationWatcher = fs.watch(convDir, (eventType, filename) => {
            if (!filename || !filename.endsWith('.pb')) return;
            // Skip .tmp files (atomic write intermediates)
            if (filename.includes('.tmp')) return;

            const convId = filename.replace('.pb', '');

            if (eventType === 'rename' && !this.knownConversations.has(filename)) {
                // New conversation detected!
                this.knownConversations.add(filename);
                this.diagnostics.push(`🆕 New conversation detected: ${convId}`);
                console.log(`[VibeShield] New chat session: ${convId}`);
                this.scheduleStaggeredExtraction(`new-conversation:${convId}`);
            } else if (eventType === 'change') {
                // Existing conversation updated (new messages added)
                this.scheduleStaggeredExtraction(`conversation-update:${convId}`);
            }
        });

        // Also watch the implicit directory (updated during active conversations)
        const implicitDir = path.join(os.homedir(), '.gemini', 'antigravity', 'implicit');
        if (fs.existsSync(implicitDir)) {
            const implicitWatcher = fs.watch(implicitDir, (_eventType, filename) => {
                if (filename && filename.endsWith('.pb')) {
                    this.triggerPersist(`implicit-update:${filename.replace('.pb', '')}`);
                }
            });
            this.context.subscriptions.push({ dispose: () => implicitWatcher.close() });
            this.diagnostics.push('Watching implicit directory for conversation updates.');
        }

        this.context.subscriptions.push({ dispose: () => this.conversationWatcher?.close() });
        this.diagnostics.push(`Watching conversations directory for new chat sessions.`);
    }

    /**
     * Schedule staggered extraction retries at 3s, 15s, and 45s.
     * The global DB trajectory data is written asynchronously by the IDE,
     * so we retry multiple times to catch the data when it becomes available.
     * Each new conversation change cancels previous retry chains.
     */
    private scheduleStaggeredExtraction(reason: string) {
        // Cancel any previous staggered retries
        this.lastConvChangeId++;
        const changeId = this.lastConvChangeId;

        // Clear existing retry timers
        for (const t of this.retryTimers) clearTimeout(t);
        this.retryTimers = [];

        const delays = [3000, 15000, 45000]; // 3s, 15s, 45s
        for (const delay of delays) {
            const timer = setTimeout(() => {
                // Only run if no newer change has superseded this one
                if (this.lastConvChangeId === changeId) {
                    this.persistChatHistory(`${reason}@${delay / 1000}s`);
                }
            }, delay);
            this.retryTimers.push(timer);
        }

        this.diagnostics.push(`Scheduled staggered extraction for: ${reason} (3s/15s/45s)`);
        console.log(`[VibeShield] Chat change detected: ${reason} — extracting at 3s/15s/45s`);
    }

    public dispose() {
        if (this.scraperInterval) {
            clearInterval(this.scraperInterval);
            this.scraperInterval = undefined;
        }
        if (this.persistTimeout) {
            clearTimeout(this.persistTimeout);
            this.persistTimeout = undefined;
        }
        if (this.conversationWatcher) {
            this.conversationWatcher.close();
            this.conversationWatcher = undefined;
        }
        for (const t of this.retryTimers) clearTimeout(t);
        this.retryTimers = [];
    }
}
