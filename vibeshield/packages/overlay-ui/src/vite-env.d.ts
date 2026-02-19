/// <reference types="vite/client" />

import { IPCMessage } from '@vibeshield/shared';

interface Window {
    electronAPI: {
        sendMessage(msg: IPCMessage): Promise<void>;
        onMessage(callback: (msg: IPCMessage) => void): () => void;
    };
}
