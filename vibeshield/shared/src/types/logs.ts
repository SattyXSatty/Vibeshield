export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogSource = 'stdout' | 'stderr' | 'system' | 'cortex' | 'ide-extension';

/**
 * A single log entry captured from the terminal or system.
 */
export interface LogEntry {
    id: string; // Unique ID for React keys
    timestamp: string; // ISO string
    source: LogSource;
    content: string;
    level: LogLevel;

    // Optional metadata (file path, line number, etc.)
    metadata?: Record<string, any>;
}

export interface LogBatch {
    entries: LogEntry[];
    sourceId: string; // ID of the process producing logs
}
