import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AgentPhase, LogEntry } from '@vibeshield/shared';

interface TestStep {
    stepName: string;
    action: string;
    expectedResult?: string;
    apiRequest?: any;
    cliCommand?: string;
}

interface AgentStore {
    phase: AgentPhase;
    logs: LogEntry[];
    logsLimit: number;
    currentReport: any | null;
    lastReport: any | null;
    testPlan: any | null;
    settings: Record<string, any> | null;

    isExtracting: boolean;
    isGenerating: boolean;
    isAnalyzingIntent: boolean;
    isExecuting: boolean;
    executionProgress: { current: number; total: number } | null;
    backendConnected: boolean;

    autoModeConfig: {
        preflightCommand: string;
        autoExtract: boolean;
        autoGenerate: boolean;
        autoRun: boolean;
    };

    // Actions
    setPhase: (phase: AgentPhase) => void;
    addLog: (log: LogEntry) => void;
    clearLogs: () => void;
    setReport: (report: any) => void;
    setTestPlan: (plan: any) => void;
    setSettings: (settings: Record<string, any>) => void;
    setExtracting: (val: boolean) => void;
    setGenerating: (val: boolean) => void;
    setAnalyzingIntent: (val: boolean) => void;
    setExecuting: (val: boolean) => void;
    setExecutionProgress: (progress: { current: number; total: number } | null) => void;
    setBackendConnected: (val: boolean) => void;
    setAutoModeConfig: (config: Partial<AgentStore['autoModeConfig']>) => void;

    // Live execution results
    initLiveReport: (planName: string, testType: string, totalSteps: number) => void;
    addStepResult: (stepResult: any) => void;

    // Test step CRUD
    addStep: (step: TestStep, testType?: string) => void;
    updateStep: (index: number, step: TestStep) => void;
    removeStep: (index: number) => void;

    reset: () => void;
}

export const useAgentStore = create<AgentStore>()(
    persist(
        (set) => {
            // Sync updated test plan to the VS Code backend
            const syncTestPlanToBackend = (plan: any) => {
                if ((window as any).electronAPI && plan) {
                    (window as any).electronAPI.sendMessage({
                        type: 'command',
                        timestamp: new Date().toISOString(),
                        payload: { action: 'update_test_plan', payload: { testPlan: plan } }
                    } as any);
                }
            };

            return ({
                phase: 'idle',
                logs: [],
                logsLimit: 1000,
                currentReport: null,
                lastReport: null,
                testPlan: null,
                settings: null,
                isExtracting: false,
                isGenerating: false,
                isAnalyzingIntent: false,
                isExecuting: false,
                executionProgress: null,
                backendConnected: false,

                autoModeConfig: {
                    preflightCommand: '',
                    autoExtract: true,
                    autoGenerate: true,
                    autoRun: false,
                },

                setPhase: (phase) => set({ phase }),

                addLog: (log) => set((state) => {
                    const newLogs = [...state.logs, log];
                    if (newLogs.length > state.logsLimit) {
                        return { logs: newLogs.slice(newLogs.length - state.logsLimit) };
                    }
                    return { logs: newLogs };
                }),

                clearLogs: () => set({ logs: [], currentReport: null, lastReport: null, testPlan: null, isExtracting: false, isGenerating: false, isAnalyzingIntent: false, isExecuting: false, executionProgress: null }),

                setReport: (report) => set((state) => ({
                    currentReport: report,
                    lastReport: report ? report : state.lastReport
                })),

                setTestPlan: (plan) => set({ testPlan: plan }),

                setSettings: (settings) => set({ settings }),

                setExtracting: (val) => set({ isExtracting: val }),
                setGenerating: (val) => set({ isGenerating: val }),
                setAnalyzingIntent: (val) => set({ isAnalyzingIntent: val }),
                setExecuting: (val) => set({ isExecuting: val }),
                setExecutionProgress: (progress) => set({ executionProgress: progress }),
                setBackendConnected: (val) => set({ backendConnected: val }),
                setAutoModeConfig: (config) => set((state) => ({ autoModeConfig: { ...state.autoModeConfig, ...config } })),

                // --- Live Execution Results ---
                initLiveReport: (planName, testType, totalSteps) => set({
                    currentReport: {
                        testType,
                        planName,
                        totalSteps,
                        passedSteps: 0,
                        failedSteps: 0,
                        durationMs: 0,
                        allPassed: true,
                        results: [],
                        _isLive: true, // Flag to indicate this is a live/in-progress report
                        _startTime: Date.now(),
                    }
                }),

                addStepResult: (stepResult) => set((state) => {
                    if (!state.currentReport) return {};
                    const results = [...(state.currentReport.results || []), stepResult];
                    const passedSteps = results.filter((r: any) => r.passed).length;
                    const failedSteps = results.filter((r: any) => !r.passed).length;
                    return {
                        currentReport: {
                            ...state.currentReport,
                            results,
                            passedSteps,
                            failedSteps,
                            allPassed: failedSteps === 0,
                            durationMs: Date.now() - (state.currentReport._startTime || Date.now()),
                        }
                    };
                }),

                // --- Test Step CRUD ---
                addStep: (step, testType) => set((state) => {
                    let newPlan;
                    if (!state.testPlan) {
                        newPlan = {
                            testType: testType || 'ui',
                            planName: 'Custom Test Suite',
                            description: 'Test steps created in VibeShield.',
                            steps: [step]
                        };
                    } else {
                        const newSteps = [...(state.testPlan.steps || []), step];
                        newPlan = { ...state.testPlan, steps: newSteps };
                    }
                    syncTestPlanToBackend(newPlan);
                    return { testPlan: newPlan };
                }),

                updateStep: (index, step) => set((state) => {
                    if (!state.testPlan?.steps) return {};
                    const newSteps = [...state.testPlan.steps];
                    newSteps[index] = { ...newSteps[index], ...step };
                    const newPlan = { ...state.testPlan, steps: newSteps };
                    syncTestPlanToBackend(newPlan);
                    return { testPlan: newPlan };
                }),

                removeStep: (index) => set((state) => {
                    if (!state.testPlan?.steps) return {};
                    const newSteps = state.testPlan.steps.filter((_: any, i: number) => i !== index);
                    const newPlan = { ...state.testPlan, steps: newSteps };
                    syncTestPlanToBackend(newPlan);
                    return { testPlan: newPlan };
                }),

                reset: () => set({ phase: 'idle', logs: [], currentReport: null, lastReport: null, testPlan: null, isExtracting: false, isGenerating: false, isAnalyzingIntent: false, isExecuting: false, executionProgress: null }),
            });
        },
        {
            name: 'vibeshield-agent-storage',
            partialize: (state) => ({ lastReport: state.lastReport, phase: state.phase, testPlan: state.testPlan, autoModeConfig: state.autoModeConfig }),
        }
    )
);
