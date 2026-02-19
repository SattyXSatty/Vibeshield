import { useEffect } from 'react';
import { LogEntry, IPCMessage } from '@vibeshield/shared';
import { StatusIndicator } from './components/StatusIndicator/StatusIndicator';
import { ActivityFeed } from './components/ActivityFeed/ActivityFeed';
import { ActionBar } from './components/ActionBar/ActionBar';
import { useAgentStore } from './store/useAgentStore';
import './styles/theme.css';

function App() {
    const { phase, logs, setPhase, addLog, clearLogs } = useAgentStore();

    // Listen for IPC messages from Main Process (via WebSocket/IPC)
    useEffect(() => {
        let cleanup: (() => void) | undefined;

        if ((window as any).electronAPI) {
            // onMessage now returns a cleanup function from preload.ts
            cleanup = ((window as any).electronAPI.onMessage as any)((msg: IPCMessage) => {
                if (msg.type === 'state_update') {
                    setPhase(msg.payload.phase);
                } else if (msg.type === 'log_entry') {
                    addLog(msg.payload);
                } else if (msg.type === 'command') {
                    if (msg.payload.action === 'clear_logs') {
                        clearLogs();
                    }
                } else if (msg.type === 'ide_event') {
                    const { event, file, commandLine, exitCode } = msg.payload;
                    let logContent = '';
                    if (event === 'save') {
                        logContent = `File Saved: ${file}`;
                    } else if (event === 'terminal_end') {
                        logContent = `Terminal Command Finished: ${commandLine} (Exit Code: ${exitCode})`;
                    } else if (event === 'terminal_start') {
                        logContent = `Terminal Command Started: ${commandLine}`;
                    }

                    if (logContent) {
                        addLog({
                            id: Math.random().toString(36).substr(2, 9),
                            timestamp: new Date().toISOString(),
                            source: 'ide-extension',
                            level: 'info',
                            content: logContent
                        });
                    }
                } else if (msg.type === 'chat_message') {
                    const { content, context, role, source } = msg.payload as any;
                    const contextInfo = context ? ` [Context: ${context.fileName}]` : '';
                    const prefix = role === 'assistant' ? '🤖 AI' : '👤 User';
                    addLog({
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        source: (source as any) || 'cortex',
                        level: 'info',
                        content: `${prefix}: ${content}${contextInfo}`
                    });
                } else if (msg.type === 'file_change') {
                    const { file, reason, content, changes } = msg.payload as any;

                    let preview = '';
                    if (changes && changes.length > 0) {
                        const payloadStats = (msg.payload as any).stats;

                        let statStr = '';
                        if (payloadStats) {
                            const s = [];
                            if (payloadStats.added > 0) s.push(`+${payloadStats.added}`);
                            if (payloadStats.removed > 0) s.push(`-${payloadStats.removed}`);
                            statStr = s.length > 0 ? ` (${s.join(', ')})` : '';
                        } else {
                            const added = changes.filter((c: any) => c.text !== '' && c.type !== 'removed').length;
                            const removed = changes.filter((c: any) => c.text === '' || c.type === 'removed').length;
                            const s = [];
                            if (added > 0) s.push(`+${added}`);
                            if (removed > 0) s.push(`-${removed}`);
                            statStr = s.length > 0 ? ` (${s.join(', ')})` : '';
                        }

                        const first = changes[0];
                        const firstLineText = first.text ? `"${first.text.replace(/\n/g, '\\n').substring(0, 50)}"` : '[Deletion]';
                        preview = `${statStr} Line ${first.line}: ${firstLineText}` + (changes.length > 1 ? ` +${changes.length - 1} more event(s)` : '');
                    } else {
                        preview = content ? content.substring(0, 50).replace(/\n/g, ' ') + '...' : 'No content';
                    }

                    addLog({
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        source: 'ide-extension',
                        level: 'debug',
                        content: `File Changed: ${file} [${reason}] ${preview}`
                    });
                } else if (msg.type === 'log_batch') {
                    msg.payload.forEach(log => addLog(log));
                }
            });
        }

        return () => {
            if (cleanup && typeof cleanup === 'function') {
                cleanup();
            }
        };
    }, [setPhase, addLog, clearLogs]);

    const handleStart = () => {
        // Send command back to Extension via WebSocket
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({
                type: 'command',
                timestamp: new Date().toISOString(),
                payload: { action: 'start' }
            } as any);
        }

        setPhase('bootstrapping');
        addLog(createLog('system', 'Starting VibeShield Agent...', 'info'));

        // Simulate process
        setTimeout(() => {
            setPhase('planning');
            addLog(createLog('cortex', 'Analyzing user intent...', 'info'));
        }, 1500);

        setTimeout(() => {
            setPhase('executing');
            addLog(createLog('stdout', 'Running tests...', 'debug'));
        }, 3000);
    };

    const handleStop = () => {
        setPhase('stopped');
        addLog(createLog('system', 'Agent stopped by user.', 'warn'));
    };

    const handleClear = () => {
        clearLogs();
        setPhase('idle');
    };

    const createLog = (source: LogEntry['source'], content: string, level: LogEntry['level']): LogEntry => {
        return {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            source,
            content,
            level
        };
    };

    return (
        <div className="app-container" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            padding: 'var(--space-md)',
            backgroundColor: 'var(--color-bg-glass)',
            backdropFilter: 'blur(var(--backdrop-blur))',
            boxSizing: 'border-box',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden'
        }}>
            <header className="draggable" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-md)'
            }}>
                <h1 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>VibeShield</h1>
                <StatusIndicator phase={phase} /> {/* Might need no-drag if clickable? StatusIndicator is usually just display */}
            </header>

            <ActivityFeed logs={logs} />

            <ActionBar
                onStart={handleStart}
                onStop={handleStop}
                onClear={handleClear}
                isRunning={phase !== 'idle' && phase !== 'stopped' && phase !== 'completed' && phase !== 'error'}
            />
        </div>
    );
}

export default App;
