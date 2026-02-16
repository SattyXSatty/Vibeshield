import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

// Derive the directory where the built main process resides
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The output directory structure is:
// dist-electron/main.js (this file)
// dist-electron/preload.js
// dist/index.html (renderer)
const RENDERER_DIST = path.join(__dirname, '../dist');

// Disable GPU Acceleration for transparency on some systems
// app.disableHardwareAcceleration();

let win: BrowserWindow | null = null;
let wss: WebSocketServer | null = null;
const WSS_PORT = 54321;

const createOverlayWindow = () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    console.log('Creating Overlay Window on:', primaryDisplay.id);

    win = new BrowserWindow({
        title: 'VibeShield Overlay',
        width: 400,
        height: 600,
        x: width - 420,
        y: height - 620,
        frame: false, // No OS chrome (title bar, borders)
        transparent: true,
        alwaysOnTop: true, // Floats above other apps
        resizable: true,
        hasShadow: false,
        skipTaskbar: true, // Should hide from dock/taskbar if possible
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'), // Resolves to dist-electron/preload.mjs
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Development vs Production loading
    if (process.env.VITE_DEV_SERVER_URL) {
        console.log('Loading Dev URL:', process.env.VITE_DEV_SERVER_URL);
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        console.log('Loading Production File:', path.join(RENDERER_DIST, 'index.html'));
        win.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }

    // macOS: Allow the window to float over full-screen apps
    if (process.platform === 'darwin') {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        win.setAlwaysOnTop(true, 'floating');
    } else {
        win.setAlwaysOnTop(true);
    }

    win.setIgnoreMouseEvents(false);

    // Log failures
    win.webContents.on('did-fail-load', (_e, _code, desc) => {
        console.error('Failed to load window:', desc);
    });
};

const startIpcServer = () => {
    try {
        wss = new WebSocketServer({ port: WSS_PORT });
        console.log(`IPC Server started on port ${WSS_PORT}`);

        wss.on('connection', (ws) => {
            console.log('Client connected to IPC Server');

            ws.on('message', (message) => {
                try {
                    const parsed = JSON.parse(message.toString());
                    // Forward to Renderer
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('ipc-message', parsed);
                    }

                    // If it's a command, handle it here too if needed
                    if (parsed.type === 'command' && parsed.payload.action === 'stop') {
                        console.log('Received Stop command from external client');
                    }
                } catch (e) {
                    console.error('Failed to parse IPC message:', e);
                }
            });

            ws.on('close', () => console.log('Client disconnected'));
        });

        wss.on('error', (err) => {
            console.error('IPC Server Error:', err);
        });

    } catch (err) {
        console.error('Failed to start IPC Server:', err);
    }
};

/* Handle IPC from Renderer (e.g. User clicks Stop) */
ipcMain.handle('send-message', async (_event, msg) => {
    // Broadcast to all WS clients (VS Code Extension)
    if (wss) {
        const payload = JSON.stringify(msg);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
});

app.whenReady().then(() => {
    createOverlayWindow();
    startIpcServer();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createOverlayWindow();
    }
});
