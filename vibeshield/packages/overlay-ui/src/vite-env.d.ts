/// <reference types="vite/client" />
import { IPCMessage } from '@vibeshield/shared';

interface IElectronAPI {
    onMessage: (callback: (msg: IPCMessage) => void) => void;
    sendMessage: (msg: IPCMessage) => Promise<void>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
