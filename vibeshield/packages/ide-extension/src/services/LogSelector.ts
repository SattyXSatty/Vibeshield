import { LogEntry } from '@vibeshield/shared';
import { LogCapture } from './LogCapture';

export class LogSelector {
    constructor(private logCapture: LogCapture) { }

    /**
     * Selects relevant logs to send to Cortex-R for analysis.
     * Strategy:
     * 1. Get recent logs (last 50).
     * 2. Scan entire history for "Error" blocks.
     * 3. Include stack traces if found.
     * 4. Format into a concise string.
     */
    public selectLogsForAnalysis(): string {
        const allLogs = this.logCapture.getLogs();
        if (allLogs.length === 0) return 'No logs captured.';

        const errorBlocks = this.findErrorBlocks(allLogs);
        const recentLogs = allLogs.slice(-50); // Always include recent context

        // Combine and De-duplicate
        const combinedLogs: LogEntry[] = [...errorBlocks];
        const errorIds = new Set(errorBlocks.map(l => l.id));

        // If errors are old, add a separator
        let separatorAdded = false;
        if (errorBlocks.length > 0 && recentLogs.length > 0) {
            const lastErrorLog = errorBlocks[errorBlocks.length - 1];
            const firstRecentLog = recentLogs[0];

            // If the last error is significantly older than the recent logs, add a separator
            if (new Date(lastErrorLog.timestamp).getTime() < new Date(firstRecentLog.timestamp).getTime() - 1000) {
                combinedLogs.push({
                    id: 'divider',
                    timestamp: new Date().toISOString(), // Valid timestamp needed
                    source: 'system',
                    level: 'info',
                    content: '\n--- RECENT LOGS ---\n'
                });
                separatorAdded = true;
            }
        }

        recentLogs.forEach(l => {
            if (!errorIds.has(l.id)) {
                combinedLogs.push(l);
            }
        });

        // Sort by timestamp if no separator was used (to keep timeline linear)
        if (!separatorAdded) {
            combinedLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }

        return combinedLogs.map(l => {
            if (l.id === 'divider') return l.content;
            return `[${l.timestamp.split('T')[1].split('.')[0]}] [${l.level.toUpperCase()}] ${l.content}`;
        }).join('\n');
    }

    private findErrorBlocks(logs: LogEntry[]): LogEntry[] {
        const errorBlocks: LogEntry[] = [];
        const seenIds = new Set<string>();
        const LINES_BEFORE = 5;
        const LINES_AFTER = 20;

        let capturing = false;
        let captureCount = 0;

        for (let i = 0; i < logs.length; i++) {
            const content = logs[i].content.toLowerCase();
            // A permissive detection for errors
            const isError =
                logs[i].level === 'error' ||
                content.includes('error') ||
                content.includes('exception') ||
                content.includes('fail') ||
                content.includes('fatal');

            if (isError) {
                if (!capturing) {
                    const prevContext = logs.slice(Math.max(0, i - LINES_BEFORE), i);
                    prevContext.forEach(ctxLog => {
                        if (!seenIds.has(ctxLog.id)) {
                            errorBlocks.push(ctxLog);
                            seenIds.add(ctxLog.id);
                        }
                    });
                }
                capturing = true;
                captureCount = 0; // Reset capture count when an error is found

                // Add the current error log
                if (!seenIds.has(logs[i].id)) {
                    errorBlocks.push(logs[i]);
                    seenIds.add(logs[i].id);
                }

                // Fast-forward 'i' to avoid rescanning the same block immediately?
                // Actually, overlapping blocks are handled by 'seenIds', so we are fine.
                // But for efficiency, we could skip.
                // i = end - 1;
            } else if (capturing) {
                // If we are currently capturing due to a previous error,
                // continue capturing for LINES_AFTER logs after the last error.
                if (captureCount < LINES_AFTER) {
                    if (!seenIds.has(logs[i].id)) {
                        errorBlocks.push(logs[i]);
                        seenIds.add(logs[i].id);
                    }
                    captureCount++;
                } else {
                    capturing = false; // Stop capturing after LINES_AFTER non-error logs
                    captureCount = 0;
                }
            }
        }

        // Sort by timestamp just in case
        return errorBlocks.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
}
