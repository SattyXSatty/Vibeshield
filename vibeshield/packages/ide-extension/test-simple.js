const WebSocket = require('ws');

// Mock minimal VS Code API structure
const mockContext = {};

class SimpleConnector {
    constructor() {
        this.ws = null;
    }

    connect() {
        console.log('[Test] Connecting to ws://localhost:54321...');
        try {
            this.ws = new WebSocket('ws://localhost:54321');

            this.ws.on('open', () => {
                console.log('[Test] Connected!');
                this.ws.send(JSON.stringify({
                    type: 'state_update',
                    timestamp: new Date().toISOString(),
                    payload: { phase: 'planning' }
                }));

                setTimeout(() => {
                    console.log('[Test] Sending log...');
                    this.ws.send(JSON.stringify({
                        type: 'log_entry',
                        timestamp: new Date().toISOString(),
                        payload: {
                            id: 'test-js-' + Date.now(),
                            timestamp: new Date().toISOString(),
                            source: 'ide-extension',
                            level: 'info',
                            content: 'Hello from Simple JS Test Script!'
                        }
                    }));
                }, 1000);

                setTimeout(() => {
                    console.log('[Test] Closing...');
                    this.ws.close();
                }, 2000);
            });

            this.ws.on('error', (err) => {
                console.error('[Test] Connection Error Object:', err);
                console.error('[Test] Connection Error Message:', err.message);
                console.error('[Test] Connection Error Code:', err.code);
            });

            this.ws.on('close', () => {
                console.log('[Test] Disconnected');
            });

        } catch (e) {
            console.error('[Test] Exception:', e);
        }
    }
}

new SimpleConnector().connect();
