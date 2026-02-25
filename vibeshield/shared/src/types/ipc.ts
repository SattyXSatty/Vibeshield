import { AgentState } from './agent';
import { LogEntry } from './logs';

export type IPCMessageType =
    | 'state_update'
    | 'log_entry'
    | 'command'
    | 'config_update'
    | 'ide_event'
    | 'chat_message'
    | 'file_change'
    | 'log_batch'
    | 'cortex_analysis'
    | 'intent_extracted'
    | 'test_plan_generated'
    | 'test_execution_report';

export interface BaseIPCMessage {
    type: IPCMessageType;
    timestamp: string;
}

export interface StateUpdateMessage extends BaseIPCMessage {
    type: 'state_update';
    payload: AgentState;
}

export interface LogEntryMessage extends BaseIPCMessage {
    type: 'log_entry';
    payload: LogEntry;
}

export interface CommandMessage extends BaseIPCMessage {
    type: 'command';
    payload: {
        action: 'start' | 'stop' | 'restart' | 'clear_logs' | 'extract_intent' | 'generate_test_plan' | 'execute_test_plan';
        args?: any;
    };
}

export interface CodeContext {
    filePath: string;
    fileName: string;
    content: string;
    selection?: string;
    cursorLine: number;
    language: string;
}

export interface IDEEventMessage extends BaseIPCMessage {
    type: 'ide_event';
    payload: {
        event: 'save' | 'terminal_start' | 'terminal_end';
        file?: string;
        exitCode?: number;
        commandLine?: string;
    };
}

export interface ChatMessage extends BaseIPCMessage {
    type: 'chat_message';
    payload: {
        id: string;
        role: 'user' | 'assistant';
        content: string;
        context?: CodeContext;
        source?: string;
    };
}

export interface FileChangeMessage extends BaseIPCMessage {
    type: 'file_change';
    payload: {
        file: string;
        content: string;
        reason?: string; // e.g. 'typing', 'undo', 'redo'
    };
}

export interface LogBatchMessage extends BaseIPCMessage {
    type: 'log_batch';
    payload: LogEntry[];
}

export interface CortexAnalysisMessage extends BaseIPCMessage {
    type: 'cortex_analysis';
    payload: {
        analysis: Record<string, any>;
        attemptCount: number;
        maxRetries: number;
        feedback: string;
    };
}

export interface IntentExtractedMessage extends BaseIPCMessage {
    type: 'intent_extracted';
    payload: {
        developerIntent: string;
        testingType: 'e2e' | 'api' | 'ui' | 'unit' | 'none';
        scenariosToTest: string[];
        edgeCases: string[];
        isUnclear: boolean;
    };
}

export interface TestPlanGeneratedMessage extends BaseIPCMessage {
    type: 'test_plan_generated';
    payload: {
        testType: 'e2e' | 'api' | 'ui' | 'unit' | 'none';
        planName: string;
        description: string;
        steps: Array<{
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
        }>;
    };
}

export interface TestExecutionReportMessage extends BaseIPCMessage {
    type: 'test_execution_report';
    payload: {
        testType: 'e2e' | 'api' | 'ui' | 'unit' | 'none';
        planName: string;
        totalSteps: number;
        passedSteps: number;
        failedSteps: number;
        durationMs: number;
        allPassed: boolean;
        results: Array<{
            stepName: string;
            action: string;
            passed: boolean;
            analysis: string;
            rootCause?: string;
            durationMs: number;
            testType: 'cli' | 'api' | 'manual';
        }>;
        aiFeedback?: string;
    };
}

export type IPCMessage =
    | StateUpdateMessage
    | LogEntryMessage
    | LogBatchMessage
    | CommandMessage
    | IDEEventMessage
    | ChatMessage
    | FileChangeMessage
    | CortexAnalysisMessage
    | IntentExtractedMessage
    | TestPlanGeneratedMessage
    | TestExecutionReportMessage;
