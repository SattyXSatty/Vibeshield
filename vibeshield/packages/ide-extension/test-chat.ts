// 1. Mock VS Code API
const listeners: any = {};
const vscode = {
    Uri: { file: (path: string) => ({ fsPath: path }) },
    window: {
        showInformationMessage: (msg: string) => console.log(`[VSCode Mock] Info: ${msg}`)
    }
};

// 2. Mock require
import module from 'module';
const originalRequire = module.prototype.require;
// @ts-ignore
module.prototype.require = function (path: string) {
    if (path === 'vscode') return vscode;
    // @ts-ignore
    return originalRequire.apply(this, arguments);
};

// 3. Import Classes
import { OverlayConnector } from './src/services/OverlayConnector';
import { ChatViewProvider } from './src/providers/ChatViewProvider';

async function testChatProvider() {
    console.log('--- Testing Chat View Provider ---');

    // Setup Connector
    const connector = new OverlayConnector({} as any);
    connector.connect();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for WS

    // Setup Chat Provider
    const provider = new ChatViewProvider({} as any, connector);

    // Mock Webview
    const mockWebview = {
        options: {},
        html: '',
        onDidReceiveMessage: (cb: any) => { listeners.onDidReceiveMessage = cb; }
    };

    const mockWebviewView = { webview: mockWebview };

    // Initialize View
    console.log('Initializing Chat View...');
    provider.resolveWebviewView(mockWebviewView as any, {} as any, {} as any);

    // Verify HTML generation
    if (mockWebview.html.includes('Ask VibeShield...')) {
        console.log('✅ HTML Content Generated Correctly');
    } else {
        console.error('❌ HTML Content Generation Failed');
    }

    // Simulate User Message
    console.log('--- Simulating User Chat Message ---');
    if (listeners.onDidReceiveMessage) {
        listeners.onDidReceiveMessage({
            type: 'sendMessage',
            value: 'Hello VibeShield, how are you?'
        });
    } else {
        console.error('❌ onDidReceiveMessage listener not registered');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    connector.dispose();
    console.log('--- Test Complete ---');
}

testChatProvider().catch(console.error);
