import { create } from 'zustand';
import { AgentPhase, LogEntry } from '@vibeshield/shared';
// We'll optionally import the TestExecutionReport payload from shared 
// but since this is a mono-repo it's easier to type inline if it's not exported.

interface AgentStore {
    phase: AgentPhase;
    logs: LogEntry[];
    logsLimit: number;
    currentReport: any | null; // Will hold the active test_execution_report payload
    lastReport: any | null;    // Holds the most recently run report to bring it back to view

    // Actions
    setPhase: (phase: AgentPhase) => void;
    addLog: (log: LogEntry) => void;
    clearLogs: () => void;
    setReport: (report: any) => void;
    reset: () => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
    phase: 'idle',
    logs: [],
    logsLimit: 1000,
    currentReport: null,
    lastReport: null,

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

    clearLogs: () => set({ logs: [], currentReport: null, lastReport: null }),

    setReport: (report) => set((state) => ({
        currentReport: report,
        // Only override lastReport if report is not null
        lastReport: report ? report : state.lastReport
    })),

    reset: () => set({ phase: 'idle', logs: [], currentReport: null, lastReport: null }),
}));
