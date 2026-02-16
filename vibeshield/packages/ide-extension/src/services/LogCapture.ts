import * as vscode from 'vscode';
import { OverlayConnector } from './OverlayConnector';
import { LogEntry } from '@vibeshield/shared';

export class LogCapture {
    private buffer: LogEntry[] = [];
    private history: LogEntry[] = []; // Persistent history across batches
    private flushTimer: NodeJS.Timeout | null = null;
    private readonly FLUSH_INTERVAL_MS = 100; // Batch logs every 100ms
    private readonly MAX_BUFFER_SIZE = 1000;
    private readonly MAX_HISTORY_SIZE = 2000; // Keep last 2000 lines for analysis

    constructor(
        private context: vscode.ExtensionContext,
        private connector: OverlayConnector
    ) { }

    public getLogs(): LogEntry[] {
        return [...this.history];
    }

    public addLog(source: LogEntry['source'], content: string, level: LogEntry['level'] = 'info') {
        const entry: LogEntry = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            source,
            content,
            level
        };

        this.buffer.push(entry);
        this.history.push(entry);

        // Maintain history size
        if (this.history.length > this.MAX_HISTORY_SIZE) {
            this.history = this.history.slice(-this.MAX_HISTORY_SIZE);
        }

        if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
            this.flush();
        } else if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
        }
    }

    private flush() {
        if (this.buffer.length === 0) return;

        const logsToSend = [...this.buffer];
        this.buffer = [];
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        this.connector.sendLogBatch(logsToSend);
    }

    public dispose() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flush(); // Flush remaining
        }
    }
}
