import { create } from 'zustand';
import { AgentPhase, LogEntry } from '@vibeshield/shared';

interface AgentStore {
    phase: AgentPhase;
    logs: LogEntry[];
    logsLimit: number;

    // Actions
    setPhase: (phase: AgentPhase) => void;
    addLog: (log: LogEntry) => void;
    clearLogs: () => void;
    reset: () => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
    phase: 'idle',
    logs: [],
    logsLimit: 1000,

    setPhase: (phase) => set({ phase }),

    addLog: (log) => set((state) => {
        // Keep logs within limit
        const newLogs = [...state.logs, log];
        if (newLogs.length > state.logsLimit) {
            // Remove oldest logs if limit exceeded
            return { logs: newLogs.slice(newLogs.length - state.logsLimit) };
        }
        return { logs: newLogs };
    }),

    clearLogs: () => set({ logs: [] }),

    reset: () => set({ phase: 'idle', logs: [] }),
}));
