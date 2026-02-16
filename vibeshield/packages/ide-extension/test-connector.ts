// Mock VS Code API
const vscode = {
    ExtensionContext: class { },
    window: {
        showInformationMessage: (msg: string) => console.log(`[VSCode Mock] Info: ${msg}`)
    }
};

// Mock require for vscode module
import module from 'module';
const originalRequire = module.prototype.require;
// @ts-ignore
module.prototype.require = function (path: string) {
    if (path === 'vscode') return vscode;
    // @ts-ignore
    return originalRequire.apply(this, arguments);
};

// Import our connector (now that vscode is mocked)
import { OverlayConnector } from './src/services/OverlayConnector';

async function testConnection() {
    console.log('--- Testing OverlayConnector ---');

    // Create instance with mocked context
    const connector = new OverlayConnector({} as any);

    // Attempt connection
    console.log('Connecting...');
    connector.connect();

    // Wait a bit for async WS events
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send a test log
    console.log('Sending Test Log...');
    connector.sendLog({
        id: 'test-log-1',
        timestamp: new Date().toISOString(),
        source: 'ide-extension',
        level: 'info',
        content: 'Hello from Verified Extension Test!'
    });

    // Send a status update
    console.log('Sending Status Update...');
    connector.sendStatusUpdate('planning');

    // Wait and cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    connector.dispose();
    console.log('--- Test Complete ---');
}

testConnection().catch(console.error);
