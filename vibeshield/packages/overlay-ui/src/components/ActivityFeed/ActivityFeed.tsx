import React, { useEffect, useRef } from 'react';
import { LogEntry, LogLevel } from '@vibeshield/shared';
import './ActivityFeed.css';

interface Props {
    logs: LogEntry[];
}

const LogItem: React.FC<{ entry: LogEntry }> = React.memo(({ entry }) => {
    const getLevelColor = (level: LogLevel) => {
        switch (level) {
            case 'error': return 'var(--color-error)';
            case 'warn': return 'var(--color-warning)';
            case 'info': return 'var(--color-info)';
            default: return 'var(--color-text-secondary)';
        }
    };

    return (
        <div className={`log-entry log-${entry.level}`}>
            <span className="log-time">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
            <span className="log-source">[{entry.source}]</span>
            <span className="log-content" style={{ color: getLevelColor(entry.level) }}>
                {entry.content}
            </span>
        </div>
    );
});

export const ActivityFeed: React.FC<Props> = ({ logs }) => {
    const endRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="activity-feed">
            {logs.length === 0 && (
                <div className="empty-state">No activity yet.</div>
            )}
            {logs.map((log) => (
                <LogItem key={log.id} entry={log} />
            ))}
            <div ref={endRef} />
        </div>
    );
};
