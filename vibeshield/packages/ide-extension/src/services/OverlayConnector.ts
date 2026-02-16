import * as vscode from 'vscode';
import WebSocket from 'ws';
import { LogEntry, IPCMessage } from '@vibeshield/shared';

export class OverlayConnector {
    private ws: WebSocket | null = null;
    private isParams: boolean = false;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private readonly PORT = 54321;
    private readonly RECONNECT_DELAY = 3000;

    private _onCommand = new vscode.EventEmitter<{ action: string, args?: any }>();
    public readonly onCommand = this._onCommand.event;

    constructor(private context: vscode.ExtensionContext) { }

    public connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        console.log(`[VibeShield] Connecting to Overlay on port ${this.PORT}...`);

        try {
            this.ws = new WebSocket(`ws://localhost:${this.PORT}`);

            this.ws.on('open', () => {
                console.log('[VibeShield] Connected to Overlay.');
                this.isParams = true;
                this.sendStatusUpdate('idle');
                this.sendLog({
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'ide-extension',
                    level: 'info',
                    content: 'VibeShield Extension Connected.'
                });
            });

            this.ws.on('message', (data: WebSocket.RawData) => {
                try {
                    const msg = JSON.parse(data.toString()) as IPCMessage;
                    this.handleMessage(msg);
                } catch (e) {
                    console.error('[VibeShield] Failed to parse message:', e);
                }
            });

            this.ws.on('close', () => {
                console.log('[VibeShield] Disconnected from Overlay.');
                this.isParams = false;
                this.scheduleReconnect();
            });

            this.ws.on('error', (err: any) => {
                console.error('[VibeShield] Connection error:', err.message || err);
                if (err.code) console.error('Error Code:', err.code);
                this.ws?.close();
            });

        } catch (e: any) {
            console.error('[VibeShield] Failed to create WebSocket:', e);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(() => {
            console.log('[VibeShield] Attempting reconnect...');
            this.connect();
        }, this.RECONNECT_DELAY);
    }

    public sendLog(log: LogEntry) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const msg: IPCMessage = {
            type: 'log_entry',
            timestamp: new Date().toISOString(),
            payload: log
        };
        this.ws.send(JSON.stringify(msg));
    }

    public sendLogBatch(logs: LogEntry[]) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const msg: IPCMessage = {
            type: 'log_batch',
            timestamp: new Date().toISOString(),
            payload: logs
        };
        this.ws.send(JSON.stringify(msg));
    }

    public sendStatusUpdate(phase: string) { // Using string loosely to avoid strict dep coupling for now
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const msg: IPCMessage = {
            type: 'state_update',
            timestamp: new Date().toISOString(),
            payload: { phase } as any // Temporary loose typing until strict State type is imported
        };
        this.ws.send(JSON.stringify(msg));
    }

    private handleMessage(msg: IPCMessage) {
        // Handle incoming commands from Overlay (e.g. Stop)
        if (msg.type === 'command') {
            console.log('[VibeShield] Received command:', msg.payload);
            this._onCommand.fire(msg.payload);
        }
    }

    public sendIDEEvent(payload: { event: 'save' | 'terminal_start' | 'terminal_end'; file?: string; exitCode?: number; commandLine?: string; }) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const msg: IPCMessage = {
            type: 'ide_event',
            timestamp: new Date().toISOString(),
            payload: payload
        };
        this.ws.send(JSON.stringify(msg));
    }

    public sendFileChange(payload: {
        file: string;
        content: string;
        reason?: string;
        changes?: any[];
        stats?: { added: number; removed: number };
    }) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const msg: IPCMessage = {
            type: 'file_change',
            timestamp: new Date().toISOString(),
            payload: payload
        };
        this.ws.send(JSON.stringify(msg));
    }

    public sendMessageToOverlay(msg: IPCMessage) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(msg));
    }

    public dispose() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.ws?.close();
    }
}
