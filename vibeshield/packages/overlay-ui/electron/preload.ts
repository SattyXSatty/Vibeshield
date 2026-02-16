import { contextBridge, ipcRenderer } from 'electron';
import { IPCMessage } from '@vibeshield/shared';

window.addEventListener('DOMContentLoaded', () => {
    console.log('Overlay UI Preloaded');
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    onMessage: (callback: (msg: IPCMessage) => void) => {
        const handler = (_event: any, msg: any) => callback(msg);
        ipcRenderer.on('ipc-message', handler);
        return () => ipcRenderer.removeListener('ipc-message', handler);
    },
    sendMessage: (msg: IPCMessage) => ipcRenderer.invoke('send-message', msg)
});
