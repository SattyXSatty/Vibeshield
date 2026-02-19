export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogSource = 'stdout' | 'stderr' | 'system' | 'cortex' | 'ide-extension';
/**
 * A single log entry captured from the terminal or system.
 */
export interface LogEntry {
    id: string;
    timestamp: string;
    source: LogSource;
    content: string;
    level: LogLevel;
    metadata?: Record<string, any>;
}
export interface LogBatch {
    entries: LogEntry[];
    sourceId: string;
}
