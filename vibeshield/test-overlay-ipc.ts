import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:54321');

ws.on('open', () => {
    console.log('✅ Connected to Overlay IPC Server');

    // 1. Update State to 'Planning'
    console.log('Sending: Status Update -> Planning');
    ws.send(JSON.stringify({
        type: 'state_update',
        timestamp: new Date().toISOString(),
        payload: { phase: 'planning' }
    }));

    // 2. Send some Logs
    setTimeout(() => {
        console.log('Sending: Log Entry 1');
        ws.send(JSON.stringify({
            type: 'log_entry',
            timestamp: new Date().toISOString(),
            payload: {
                id: 'log-1',
                timestamp: new Date().toISOString(),
                source: 'test-script',
                level: 'info',
                content: 'Hello from the test script!'
            }
        }));
    }, 1000);

    setTimeout(() => {
        console.log('Sending: Log Entry 2 (Error)');
        ws.send(JSON.stringify({
            type: 'log_entry',
            timestamp: new Date().toISOString(),
            payload: {
                id: 'log-2',
                timestamp: new Date().toISOString(),
                source: 'test-script',
                level: 'error',
                content: 'Simulation of an error event.'
            }
        }));
    }, 2000);

    // 3. Finish
    setTimeout(() => {
        console.log('Test Complete. Closing connection.');
        ws.close();
        process.exit(0);
    }, 3000);
});

ws.on('error', (err) => {
    console.error('❌ Connection Failed. Is the Overlay running?');
    console.error(err.message);
    process.exit(1);
});
