import { useEffect, useRef } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { toast } from 'react-hot-toast';
import { RefreshCwIcon, ZapIcon, PlayIcon, StopIcon } from '../Icons/Icons';
import './DashboardView.css';

export function DashboardView() {
    const { phase, logs, testPlan, isExtracting, isGenerating, isAnalyzingIntent, isExecuting, executionProgress, setExtracting, setGenerating, setExecuting, setExecutionProgress, backendConnected, autoModeConfig } = useAgentStore();
    const activityRef = useRef<HTMLDivElement>(null);

    // Auto-scroll activity feed to bottom
    useEffect(() => {
        if (activityRef.current) {
            activityRef.current.scrollTop = activityRef.current.scrollHeight;
        }
    }, [logs]);

    const isAutoPipelineRunning = isExtracting || isGenerating || isExecuting;

    const handleAutoMode = () => {
        if (!backendConnected) {
            toast.error('VS Code Extension disconnected. Please start VibeShield in the IDE.');
            return;
        }
        if (isAutoPipelineRunning) return;

        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({
                type: 'command',
                timestamp: new Date().toISOString(),
                payload: { action: 'execute_auto_pipeline', payload: autoModeConfig }
            } as any);
        }
        toast.success("Auto Mode Pipeline started");
    };

    const handleExtract = () => {
        if (!backendConnected) {
            toast.error('VS Code Extension disconnected. Please start VibeShield in the IDE.');
            return;
        }
        if (isExtracting) return;
        setExtracting(true);
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({ type: 'command', timestamp: new Date().toISOString(), payload: { action: 'extract_intent' } } as any);
        }
    };

    const handleGenerate = () => {
        if (!backendConnected) {
            toast.error('VS Code Extension disconnected. Please start VibeShield in the IDE.');
            return;
        }
        if (isGenerating) return;
        setGenerating(true);
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({ type: 'command', timestamp: new Date().toISOString(), payload: { action: 'generate_test_plan' } } as any);
        }
    };

    const handleRun = () => {
        if (!backendConnected) {
            toast.error('VS Code Extension disconnected. Please start VibeShield in the IDE.');
            return;
        }
        if (isExecuting) return;
        if (!testPlan || !testPlan.steps || testPlan.steps.length === 0) {
            return; // Button should be disabled, but guard anyway
        }
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({ type: 'command', timestamp: new Date().toISOString(), payload: { action: 'execute_test_plan', testPlan } } as any);
        }
    };

    const handleStop = (task: 'extract' | 'generate' | 'execute') => {
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({ type: 'command', timestamp: new Date().toISOString(), payload: { action: `stop_${task}` } } as any);
        }
        if (task === 'extract') setExtracting(false);
        if (task === 'generate') setGenerating(false);
        if (task === 'execute') { setExecuting(false); setExecutionProgress(null); }
        toast.success(`Stopped ${task}.`);
    };

    const canRun = testPlan?.steps?.length > 0 && !isExecuting && backendConnected;

    // Find the latest intent log to display in the Intent card
    const intentLog = [...logs].reverse().find(l => l.content.startsWith('Intent Extracted:'));
    const intentText = intentLog
        ? intentLog.content.split('\n').slice(1).join(' ').replace(/• Intent: |• Strategy: |• Scenarios: /g, '')
        : 'Connect to an active file or chat in the IDE to extract intent.';

    // Filter out generic info logs to just show major activity milestones
    const majorLogs = logs.filter(l => l.source === 'cortex' || l.source === 'system' || l.level === 'error');

    // Determine the run button state text
    const getRunButtonText = () => {
        if (isExecuting && executionProgress) {
            return `Running ${executionProgress.current}/${executionProgress.total}`;
        }
        if (isExecuting) return 'Running Tests...';
        return 'Run Tests';
    };

    const displayPhase = (() => {
        if (isExtracting) return 'EXTRACTING';
        if (isGenerating) return 'GENERATING';
        if (isExecuting) return 'EXECUTING';
        return phase ? phase.toUpperCase() : 'IDLE';
    })();

    return (
        <div className="dashboard-container">
            {/* Status Section */}
            <div className="status-panel">
                <span className="section-label">Status</span>
                <span className={`status-badge phase-${displayPhase.toLowerCase()}`}>
                    {displayPhase}
                </span>
            </div>

            {/* Auto Mode Control */}
            <div className="action-row" style={{ marginBottom: '-8px' }}>
                <button
                    className={`action-btn run-btn ${(!backendConnected || isAutoPipelineRunning) ? 'disabled' : ''}`}
                    onClick={handleAutoMode}
                    disabled={!backendConnected || isAutoPipelineRunning}
                    style={{ backgroundColor: 'var(--color-accent-primary)', color: 'var(--color-bg-base)', border: 'none', fontWeight: 600 }}
                >
                    <ZapIcon className="action-icon" /> Start Auto Pipeline
                </button>
            </div>

            {/* Action Bar */}
            <div className="action-row">
                {isExtracting ? (
                    <button className="action-btn stop-btn" onClick={() => handleStop('extract')}>
                        <StopIcon className="action-icon" /> Stop
                    </button>
                ) : (
                    <button
                        className={`action-btn extract-btn ${(!backendConnected) ? 'loading' : ''}`}
                        onClick={handleExtract}
                        disabled={!backendConnected}
                    >
                        <RefreshCwIcon className="action-icon" /> Extract Intent
                    </button>
                )}
                {isGenerating ? (
                    <button className="action-btn stop-btn" onClick={() => handleStop('generate')}>
                        <StopIcon className="action-icon" /> Stop
                    </button>
                ) : isAnalyzingIntent ? (
                    <button className="action-btn generate-btn loading" disabled>
                        <ZapIcon className="action-icon" /> Analyzing Intent...
                    </button>
                ) : (
                    <button
                        className={`action-btn generate-btn ${(!backendConnected) ? 'loading' : ''}`}
                        onClick={handleGenerate}
                        disabled={!backendConnected}
                    >
                        <ZapIcon className="action-icon" /> Generate Tests
                    </button>
                )}
                {isExecuting ? (
                    <button className="action-btn stop-btn" onClick={() => handleStop('execute')}>
                        <StopIcon className="action-icon" /> Stop
                    </button>
                ) : (
                    <button
                        className={`action-btn run-btn ${(!canRun || !backendConnected) ? 'disabled' : ''}`}
                        onClick={handleRun}
                        disabled={!canRun || !backendConnected}
                    >
                        <PlayIcon className="action-icon" /> {getRunButtonText()}
                    </button>
                )}
            </div>

            {/* Execution Progress Bar */}
            {isExecuting && executionProgress && executionProgress.total > 0 && (
                <div className="progress-container">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${(executionProgress.current / executionProgress.total) * 100}%` }}
                        />
                    </div>
                    <span className="progress-text">
                        Step {executionProgress.current} of {executionProgress.total}
                    </span>
                </div>
            )}

            {/* Intent Card */}
            <div className="card-section">
                <span className="section-label-small">INTENT</span>
                <div className="intent-card">
                    <p>{intentText}</p>
                </div>
            </div>

            {/* Activity Feed */}
            <div className="card-section flex-1 min-h-[300px]">
                <span className="section-label-small">ACTIVITY</span>
                <div className="activity-card" ref={activityRef}>
                    {majorLogs.length === 0 ? (
                        <div className="activity-empty">
                            <h4>Waiting</h4>
                            <p>Click Extract to begin</p>
                            <span className="time-ago">Idle</span>
                        </div>
                    ) : (
                        majorLogs.map((log) => {
                            // Format title and desc from log
                            let title = 'System Event';
                            let desc = log.content;

                            if (log.content.includes('Intent Extracted')) {
                                title = 'Intent Extracted';
                                desc = 'Parsed from IDE context';
                            } else if (log.content.includes('Test Plan Generated')) {
                                title = 'Test Plan Ready';
                                desc = 'Generated via Cortex-R';
                            }

                            const isRecent = Date.now() - new Date(log.timestamp).getTime() < 60000;

                            return (
                                <div key={log.id} className="activity-row">
                                    <div className="activity-content">
                                        <h4>{title}</h4>
                                        <p>{desc.length > 80 ? desc.substring(0, 80) + '...' : desc}</p>
                                    </div>
                                    <span className="time-ago">{isRecent ? 'Just now' : 'Archived'}</span>
                                </div>
                            );
                        })
                    )}
                    {(isExtracting || isGenerating || isExecuting) && (
                        <div className="activity-row pulse">
                            <div className="activity-content">
                                <h4>{isExtracting ? 'Extracting Intent' : isGenerating ? 'Generating Tests' : 'Executing Tests'}</h4>
                                <p>{isExtracting ? 'Cortex-R is analyzing IDE context...' : isGenerating ? 'Cortex-R is building test cases...' : executionProgress ? `Running step ${executionProgress.current}/${executionProgress.total}...` : 'Cortex engine is working...'}</p>
                            </div>
                            <span className="time-ago">Now</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
