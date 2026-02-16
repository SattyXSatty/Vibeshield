import * as vscode from 'vscode';
import * as Diff from 'diff';
import { OverlayConnector } from './OverlayConnector';

export class ActivityTracker {
    private changeTimers: Map<string, NodeJS.Timeout> = new Map();
    // Stores the last "Reported" content for a file. 
    // We compare current VS Code content against this to calculate net changes.
    private committedContent: Map<string, string> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private connector: OverlayConnector
    ) {
        this.initializeCache();
        this.trackFileSaves();
        this.trackFileChanges();
        this.trackTerminalEvents();
    }

    private initializeCache() {
        // Pre-populate cache with current open documents
        const cacheDoc = (doc: vscode.TextDocument) => {
            if (doc.uri.scheme === 'file') {
                this.committedContent.set(doc.fileName, doc.getText());
            }
        };

        vscode.workspace.textDocuments.forEach(cacheDoc);

        const disposable = vscode.workspace.onDidOpenTextDocument(cacheDoc);
        this.context.subscriptions.push(disposable);
    }

    private trackFileChanges() {
        const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
            const doc = event.document;
            if (doc.uri.scheme !== 'file') return;

            const filePath = doc.fileName;

            // Ensure we have a baseline. If not, assume empty string (new file) or grab current (too late for diff?)
            // If we missed onDidOpen, we might miss the 'before' state. 
            // Better to assume empty if unknown, OR assume we missed the start and just sync up.
            // If we assume empty, we might report "+1000 lines" for a file we just opened and typed 1 char in.
            // So if unknown, we should probably set it to current state minus the change? No, too hard.
            // Let's just set it to current state and skip reporting THIS change if we really have no history.
            // But usually onDidOpen handles it.
            if (!this.committedContent.has(filePath)) {
                this.committedContent.set(filePath, doc.getText());
                return; // Skip reporting the very first blip if we weren't tracking it
            }

            // Debounce
            if (this.changeTimers.has(filePath)) {
                clearTimeout(this.changeTimers.get(filePath)!);
            }

            const timer = setTimeout(() => {
                this.changeTimers.delete(filePath);
                this.processAccumulatedChanges(doc);
            }, 1000); // 1-second capture window

            this.changeTimers.set(filePath, timer);
        });

        this.context.subscriptions.push(disposable);
    }

    private processAccumulatedChanges(doc: vscode.TextDocument) {
        const filePath = doc.fileName;
        const oldContent = this.committedContent.get(filePath) || '';
        const newContent = doc.getText();

        if (oldContent === newContent) return; // No net change

        // Calculate precise diff
        const diffs = Diff.diffLines(oldContent, newContent);

        let addedCount = 0;
        let removedCount = 0;
        const changes: { line: number; text: string; type: 'added' | 'removed' | 'change' }[] = [];
        let lineNo = 1;

        diffs.forEach(part => {
            const count = part.count || 0;

            if (part.added) {
                addedCount += count;
                changes.push({ line: lineNo, text: part.value, type: 'added' });
            } else if (part.removed) {
                removedCount += count;
                changes.push({ line: lineNo, text: part.value, type: 'removed' });
            }

            if (!part.removed) {
                lineNo += count;
            }
        });

        // Determine reason based on magnitude
        const totalLines = oldContent.split('\n').length;
        const isMassive = (addedCount + removedCount) > (totalLines * 0.3);
        const reason = isMassive ? 'agent-rewrite' : 'typing';

        if (changes.length > 0) {
            this.connector.sendFileChange({
                file: filePath,
                content: newContent,
                reason: reason,
                changes: changes,
                stats: { added: addedCount, removed: removedCount }
            });
            console.log(`[VibeShield] Broadcast ${filePath}: +${addedCount}/-${removedCount}`);
        }

        // Commit state
        this.committedContent.set(filePath, newContent);
    }

    private trackFileSaves() {
        const disposable = vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.uri.scheme === 'file') {
                // We don't send stats here, just the event marker
                // The 'typing/rewrite' event will likely carry the heavy payload
                console.log(`[VibeShield] File saved: ${doc.fileName}`);
                this.connector.sendIDEEvent({
                    event: 'save',
                    file: doc.fileName
                });

                // Optional: We *could* force a flush here if we wanted to sync save with diff.
                // But let's keep them separate to avoid race conditions.
            }
        });
        this.context.subscriptions.push(disposable);
    }

    private trackTerminalEvents() {
        if (vscode.window.onDidStartTerminalShellExecution) {
            const startListener = vscode.window.onDidStartTerminalShellExecution((event) => {
                const commandLine = event.execution.commandLine.value;
                this.connector.sendIDEEvent({
                    event: 'terminal_start',
                    commandLine: commandLine
                });
            });
            this.context.subscriptions.push(startListener);
        }

        if (vscode.window.onDidEndTerminalShellExecution) {
            const endListener = vscode.window.onDidEndTerminalShellExecution((event) => {
                const commandLine = event.execution.commandLine.value;
                const exitCode = event.exitCode;
                this.connector.sendIDEEvent({
                    event: 'terminal_end',
                    commandLine: commandLine,
                    exitCode: exitCode
                });
                if (exitCode && exitCode !== 0) {
                    this.connector.sendLog({
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        source: 'ide-extension',
                        level: 'error',
                        content: `Command failed: ${commandLine} (Exit Code: ${exitCode})`
                    });
                }
            });
            this.context.subscriptions.push(endListener);
        }
    }
}
