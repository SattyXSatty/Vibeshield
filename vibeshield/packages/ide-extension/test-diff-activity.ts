// 1. Mock VS Code API
const listeners: any = {};
const vscode = {
    ExtensionContext: class {
        subscriptions = { push: (d: any) => { } }
    },
    workspace: {
        onDidSaveTextDocument: (cb: any) => { listeners.onDidSaveTextDocument = cb; return { dispose: () => { } }; }
    },
    window: {
        showInformationMessage: (msg: string) => console.log(`[VSCode Mock] Info: ${msg}`),
        onDidStartTerminalShellExecution: (cb: any) => { listeners.onDidStartTerminalShellExecution = cb; return { dispose: () => { } }; },
        onDidEndTerminalShellExecution: (cb: any) => { listeners.onDidEndTerminalShellExecution = cb; return { dispose: () => { } }; }
    },
    EventEmitter: class {
        event = (listener: any) => { return { dispose: () => { } }; };
        fire(data: any) { }
    },
    Uri: {
        file: (path: string) => ({ fsPath: path, scheme: 'file' }),
        joinPath: () => ({ fsPath: '/mock/path' })
    }
};

// 2. Mock require for vscode module
import module from 'module';
const originalRequire = module.prototype.require;
// @ts-ignore
module.prototype.require = function (path: string) {
    if (path === 'vscode') return vscode;
    // @ts-ignore
    return originalRequire.apply(this, arguments);
};

// 3. Import ActivityTracker
import { ActivityTracker } from './src/services/ActivityTracker';

async function testDiffCapture() {
    console.log('--- Testing Activity Tracker with Mock Connector ---');

    // Create Mock Connector
    const mockConnector = {
        connect: () => console.log('[Mock] Connector connecting...'),
        dispose: () => console.log('[Mock] Connector disposed.'),
        sendIDEEvent: (payload: any) => console.log('[Mock] SENT Event:', payload.event, payload.file || payload.commandLine),
        sendFileChange: (payload: any) => {
            console.log(`[Mock] SENT FileChange: ${payload.file}`);
            console.log(`[Mock] Content Check: ${payload.content === "console.log('changed code');" ? 'PASS' : 'FAIL'}`);
            console.log(`[Mock] Content Length: ${payload.content.length}`);
        },
        sendLog: (log: any) => console.log('[Mock] Log:', log.message)
    };

    // Instantiate ActivityTracker
    console.log('Initializing ActivityTracker...');
    new ActivityTracker({ subscriptions: [] } as any, mockConnector as any);

    // TEST 1: Simulate File Save with Content
    console.log('--- Simulating File Save ---');
    if (listeners.onDidSaveTextDocument) {
        listeners.onDidSaveTextDocument({
            uri: { scheme: 'file' },
            fileName: '/path/to/project/index.ts',
            getText: () => "console.log('changed code');"
        });
    } else {
        console.error('FAIL: onDidSaveTextDocument listener not registered!');
    }

    // Wait slightly
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('--- Test Complete ---');
}

testDiffCapture().catch(console.error);
