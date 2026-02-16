import * as vscode from 'vscode';
import { OverlayConnector } from './OverlayConnector';

export class ChangeTracker {
    private debouncers: Map<string, NodeJS.Timeout> = new Map();
    private readonly DEBOUNCE_MS = 600;

    constructor(
        private context: vscode.ExtensionContext,
        private connector: OverlayConnector
    ) {
        this.trackFileChanges();
    }

    private trackFileChanges() {
        const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
            const doc = event.document;

            // Only track relevant files (e.g., skip git, output, log files)
            if (doc.uri.scheme !== 'file') return;
            // Maybe filter out massive files for perf?
            if (doc.lineCount > 5000) return;

            // Debounce logic
            const filePath = doc.fileName;

            // Clear existing timeout for this file
            if (this.debouncers.has(filePath)) {
                clearTimeout(this.debouncers.get(filePath));
            }

            // Set new timeout
            const timeout = setTimeout(() => {
                this.sendChange(doc);
                this.debouncers.delete(filePath);
            }, this.DEBOUNCE_MS);

            this.debouncers.set(filePath, timeout);
        });

        this.context.subscriptions.push(disposable);
    }

    private sendChange(doc: vscode.TextDocument) {
        console.log(`[VibeShield] Sending file update: ${doc.fileName}`);
        this.connector.sendFileChange({
            file: doc.fileName,
            content: doc.getText(),
            reason: 'typing'
        });
    }

    public dispose() {
        this.debouncers.forEach(timeout => clearTimeout(timeout));
        this.debouncers.clear();
    }
}
