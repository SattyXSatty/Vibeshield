import { LogEntry } from './logs';

/**
 * Response structure from Cortex-R AgentRunner.
 */
export interface CortexAgentResponse<T = any> {
    success: boolean;
    agent_type: string;
    output: T;
    cost?: number;
    error?: string;
    executed_model?: string;
}

/**
 * Standard error analysis result from Cortex-R.
 */
export interface LogAnalysisResult {
    hasError: boolean;
    errorType?: 'module_not_found' | 'syntax' | 'type' | 'runtime' | 'build' | 'other';
    message?: string;
    affectedFile?: string;
    line?: number;
    suggestedFix?: string;
    confidence: number;
}

/**
 * Intent extracted from chat/diff.
 */
export interface IntentAnalysis {
    developerIntent: string;
    testingType: 'e2e' | 'api' | 'ui' | 'unit' | 'none';
    scenariosToTest: string[];
    edgeCases: string[];
    isUnclear: boolean;
}

export interface TestStep {
    stepName: string;
    action: string;
    cliCommand?: string;
    apiRequest?: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: any;
    };
    expectedResult: string;
}

export interface TestPlan {
    testType: 'e2e' | 'api' | 'ui' | 'unit' | 'none';
    planName: string;
    description: string;
    steps: TestStep[];
}

/**
 * Interface for the Bridge to implement.
 */
export interface ICortexBridge {
    analyzeLog(logs: LogEntry[]): Promise<CortexAgentResponse<LogAnalysisResult>>;
    extractIntent(chatHistory: string, diff: string): Promise<CortexAgentResponse<IntentAnalysis>>;
    generateTestPlan(intent: any, projectContext: string): Promise<TestPlan>;
    checkServerReady(logs: LogEntry[]): Promise<CortexAgentResponse<{ ready: boolean; url?: string }>>;
}
