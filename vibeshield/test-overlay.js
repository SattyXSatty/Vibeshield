import { WebSocket } from 'ws';

// Connect to the Overlay's WebSocket Server
const ws = new WebSocket('ws://localhost:54321');

console.log('Attempting to connect to Overlay IPC Server at ws://localhost:54321...');

ws.on('open', () => {
    console.log('✅ Connected to Overlay IPC Server!');

    // 1. Update State to 'Planning'
    console.log('-> Sending: Status Update -> Planning');
    ws.send(JSON.stringify({
        type: 'state_update',
        timestamp: new Date().toISOString(),
        payload: { phase: 'planning' }
    }));

    // 2. Send some Logs
    setTimeout(() => {
        console.log('-> Sending: Log Entry 1 (Info)');
        ws.send(JSON.stringify({
            type: 'log_entry',
            timestamp: new Date().toISOString(),
            payload: {
                id: 'log-1',
                timestamp: new Date().toISOString(),
                source: 'TestScript',
                level: 'info',
                content: 'Hello! I am simulating the VS Code Extension.'
            }
        }));
    }, 1500);

    setTimeout(() => {
        console.log('-> Sending: Log Entry 2 (Error)');
        ws.send(JSON.stringify({
            type: 'log_entry',
            timestamp: new Date().toISOString(),
            payload: {
                id: 'log-2',
                timestamp: new Date().toISOString(),
                source: 'TestScript',
                level: 'error',
                content: 'Simulation of an error event to test red styling.'
            }
        }));
    }, 3000);

    // 3. Finish
    setTimeout(() => {
        console.log('Test Complete. Closing connection..');
        ws.close();
        process.exit(0);
    }, 4500);
});

ws.on('error', (err) => {
    console.error('❌ Connection Failed.');
    console.error('Ensure the Overlay UI is running first! (npm run dev in packages/overlay-ui)');
    console.error(err.message);
    process.exit(1);
});
