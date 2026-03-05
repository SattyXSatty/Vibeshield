import { useEffect, useState } from 'react';
import { LogEntry, IPCMessage } from '@vibeshield/shared';
import { useAgentStore } from './store/useAgentStore';
import toast, { Toaster } from 'react-hot-toast';
import { LogoIcon, SettingsIcon, ActivityIcon, ClipboardCheckIcon, TrashIcon, ZapIcon } from './components/Icons/Icons';
import { DashboardView } from './components/DashboardView/DashboardView';
import { TestCasesView } from './components/TestCasesView/TestCasesView';
import { SettingsView } from './components/SettingsView/SettingsView';
import { TestResultsPanel } from './components/TestResultsPanel/TestResultsPanel';
import './styles/theme.css';
import './App.css';

type TabView = 'dashboard' | 'test-cases' | 'results';

function ResultsTabView({ onViewReport }: { onViewReport?: () => void }) {
    const { currentReport, lastReport, setReport } = useAgentStore();
    const report = currentReport || lastReport;

    if (!report) {
        return (
            <div className="results-empty-state">
                <span style={{ fontSize: 32, marginBottom: 8 }}>📊</span>
                <p>No results yet.</p>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                    Run a Test Plan from the Dashboard or Test Cases tab to see results here.
                </span>
            </div>
        );
    }

    const isLive = report._isLive === true;
    const completedSteps = report.results?.length || 0;
    const totalSteps = report.totalSteps || 0;
    const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    return (
        <div className="results-tab-container">
            {/* Header */}
            <div className="results-tab-header">
                <div>
                    <h2 style={{ margin: 0 }}>{report.planName || 'Test Results'}</h2>
                    <span className="tc-subtitle">
                        {isLive
                            ? `Running \u2014 ${completedSteps}/${totalSteps} steps completed`
                            : `${report.allPassed ? 'All Passed' : 'Some Failed'} \u00b7 ${report.passedSteps}/${totalSteps} passed \u00b7 ${report.durationMs}ms`
                        }
                    </span>
                </div>
                {isLive && <span className="results-live-badge pulse">LIVE</span>}
                {!isLive && report.testType && (
                    <span className={`results-status-badge ${report.allPassed ? 'pass' : 'fail'}`}>
                        {report.allPassed ? 'PASSED' : 'FAILED'}
                    </span>
                )}
            </div>

            {/* Progress bar during live execution */}
            {isLive && totalSteps > 0 && (
                <div className="results-progress-bar">
                    <div className="results-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
            )}

            {/* Step Results */}
            <div className="results-step-list">
                {(report.results || []).map((step: any, idx: number) => (
                    <div key={idx} className={`results-step-card ${step.passed ? 'step-pass' : 'step-fail'}`}>
                        <div className="results-step-icon">{step.passed ? '\u2705' : '\u274C'}</div>
                        <div className="results-step-info">
                            <span className="results-step-name">Step {idx + 1}: {step.stepName}</span>
                            <span className="results-step-action">{step.action}</span>
                            {!step.passed && step.analysis && (
                                <span className="results-step-analysis">{step.analysis}</span>
                            )}
                        </div>
                        <span className="results-step-duration">{step.durationMs}ms</span>
                    </div>
                ))}

                {/* Pending steps placeholders during live execution */}
                {isLive && Array.from({ length: totalSteps - completedSteps }).map((_, idx) => (
                    <div key={`pending-${idx}`} className="results-step-card step-pending">
                        <div className="results-step-icon">⏳</div>
                        <div className="results-step-info">
                            <span className="results-step-name">Step {completedSteps + idx + 1}: Waiting...</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* AI Feedback */}
            {!isLive && report.aiFeedback && (
                <div className="results-ai-feedback">
                    <strong>💡 AI Suggestion:</strong>
                    <p>{report.aiFeedback}</p>
                </div>
            )}

            {/* View Full Report button (when complete, shows overlay) */}
            {!isLive && (
                <div style={{ padding: 'var(--space-md)', textAlign: 'center' }}>
                    <button className="tc-btn-save" onClick={() => { setReport(report); onViewReport?.(); }}>
                        View Full Report
                    </button>
                </div>
            )}
        </div>
    );
}

function App() {
    const { currentReport, setPhase, addLog, clearLogs, setReport, setTestPlan, setSettings, setExtracting, setGenerating, setExecuting, setExecutionProgress, initLiveReport, addStepResult, backendConnected, setBackendConnected } = useAgentStore();
    const [currentTab, setCurrentTab] = useState<TabView>('dashboard');
    const [showSettings, setShowSettings] = useState(false);
    const [showReportOverlay, setShowReportOverlay] = useState(false);

    // IPC WebSocket setup (same as before)
    useEffect(() => {
        let cleanup: (() => void) | undefined;
        if ((window as any).electronAPI) {
            cleanup = ((window as any).electronAPI.onMessage as any)((msg: IPCMessage | any) => {
                if (msg.type === 'extension_connected') {
                    setBackendConnected(true);
                } else if (msg.type === 'extension_disconnected') {
                    setBackendConnected(false);
                } else if (msg.type === 'state_update') {
                    setPhase(msg.payload.phase);
                } else if (msg.type === 'log_entry') {
                    addLog(msg.payload);
                    if (msg.payload.level === 'error' && msg.payload.source === 'system') {
                        toast.error(msg.payload.content, { duration: 5000, position: 'bottom-center' });
                    }
                } else if (msg.type === 'command') {
                    if (msg.payload.action === 'clear_logs') clearLogs();
                } else if (msg.type === 'ide_event') {
                    const { event, file, commandLine, exitCode } = msg.payload;
                    let logContent = '';
                    if (event === 'save') logContent = `File Saved: ${file}`;
                    else if (event === 'terminal_end') logContent = `Terminal Command Finished: ${commandLine} (Exit Code: ${exitCode})`;
                    else if (event === 'terminal_start') logContent = `Terminal Command Started: ${commandLine}`;
                    if (logContent) {
                        addLog({ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), source: 'ide-extension', level: 'info', content: logContent });
                    }
                } else if (msg.type === 'chat_message') {
                    const { content, context, role, source } = msg.payload as any;
                    const contextInfo = context ? ` [Context: ${context.fileName}]` : '';
                    const prefix = role === 'assistant' ? '🤖 AI' : '👤 User';
                    addLog({ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), source: (source as any) || 'cortex', level: 'info', content: `${prefix}: ${content}${contextInfo}` });
                } else if (msg.type === 'file_change') {
                    const { file, reason, content, changes } = msg.payload as any;
                    let preview = '';
                    if (changes && changes.length > 0) {
                        const first = changes[0];
                        const firstLineText = first.text ? `"${first.text.replace(/\n/g, '\\n').substring(0, 50)}"` : '[Deletion]';
                        preview = `Line ${first.line}: ${firstLineText}` + (changes.length > 1 ? ` +${changes.length - 1} more event(s)` : '');
                    } else {
                        preview = content ? content.substring(0, 50).replace(/\n/g, ' ') + '...' : 'No content';
                    }
                    addLog({ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), source: 'ide-extension', level: 'debug', content: `File Changed: ${file} [${reason}] ${preview}` });
                } else if (msg.type === 'log_batch') {
                    msg.payload.forEach((log: LogEntry) => addLog(log));
                } else if (msg.type === 'extracting_started') {
                    setExtracting(true);
                } else if (msg.type === 'generating_started') {
                    setGenerating(true);
                } else if (msg.type === 'intent_extracted') {
                    setExtracting(false);
                    const intent = msg.payload as any;
                    const content = `Intent Extracted:\n• Intent: ${intent.developerIntent}\n• Strategy: ${intent.testingType}\n• Scenarios: ${intent.scenariosToTest?.join(', ')}`;
                    addLog({ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), source: 'cortex', level: intent.isUnclear ? 'warn' : 'info', content: content });
                } else if (msg.type === 'intent_extracted_error') {
                    setExtracting(false);
                } else if (msg.type === 'test_plan_generated') {
                    setGenerating(false);
                    const plan = msg.payload as any;
                    setTestPlan(plan);
                    const content = `Test Plan Generated:\n• Target: ${plan.testType}\n• Steps: ${plan.steps?.length || 0}`;
                    addLog({ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), source: 'cortex', level: 'info', content: content });
                } else if (msg.type === 'test_plan_generated_error') {
                    setGenerating(false);
                } else if (msg.type === 'settings_data') {
                    setSettings(msg.payload);
                } else if (msg.type === 'test_execution_report') {
                    setReport(msg.payload);
                    setExecuting(false);
                    setExecutionProgress(null);
                    setShowReportOverlay(true);
                } else if (msg.type === 'execution_started') {
                    setExecuting(true);
                    setExecutionProgress({ current: 0, total: msg.payload?.total || 0 });
                    // Initialize a live report and auto-switch to Results tab
                    const plan = useAgentStore.getState().testPlan;
                    initLiveReport(
                        plan?.planName || 'Test Execution',
                        plan?.testType || 'unknown',
                        msg.payload?.total || 0
                    );
                    setCurrentTab('results');
                } else if (msg.type === 'execution_step_result') {
                    // Live step result — append to the live report
                    addStepResult(msg.payload);
                } else if (msg.type === 'execution_step_progress') {
                    setExecutionProgress({ current: msg.payload.current, total: msg.payload.total });
                } else if (msg.type === 'execution_error') {
                    setExecuting(false);
                    setExecutionProgress(null);
                }
            });
        }
        return () => {
            if (cleanup && typeof cleanup === 'function') cleanup();
        };
    }, [setPhase, addLog, clearLogs, setTestPlan, setReport, setExtracting, setGenerating, setExecuting, setExecutionProgress, initLiveReport, addStepResult, setBackendConnected]);

    const handleClearMemory = () => {
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({ type: 'command', timestamp: new Date().toISOString(), payload: { action: 'clear_memory' } } as any);
        }
        clearLogs();
        setPhase('idle');
        addLog({ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), source: 'system', level: 'info', content: 'Cleared logs & reset smart memory.' });
    };

    return (
        <div className="app-container">
            {/* Top Navigation Bar */}
            <header className="app-header draggable">
                <div className="header-brand">
                    <LogoIcon className="header-logo" />
                    <h1>VibeShield</h1>
                    {!backendConnected && (
                        <div className="connection-badge" title="VS Code Extension disconnected. Open VS Code to reconnect."></div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="settings-button no-drag"
                        onClick={handleClearMemory}
                        title="Clear Memory"
                    >
                        <TrashIcon />
                    </button>
                    <button
                        className="settings-button no-drag"
                        onClick={() => setShowSettings(!showSettings)}
                        title="Settings"
                    >
                        <SettingsIcon />
                    </button>
                </div>
            </header>

            {/* Tab Navigation */}
            <nav className="app-nav">
                <button
                    className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => { setCurrentTab('dashboard'); setShowSettings(false); }}
                >
                    <ActivityIcon className="nav-icon" />
                    Dashboard
                </button>
                <button
                    className={`nav-item ${currentTab === 'test-cases' ? 'active' : ''}`}
                    onClick={() => { setCurrentTab('test-cases'); setShowSettings(false); }}
                >
                    <ClipboardCheckIcon className="nav-icon" />
                    Test Cases
                </button>
                <button
                    className={`nav-item ${currentTab === 'results' ? 'active' : ''}`}
                    onClick={() => { setCurrentTab('results'); setShowSettings(false); }}
                >
                    <ZapIcon className="nav-icon" />
                    Results
                </button>
            </nav>

            <Toaster toastOptions={{
                style: {
                    background: 'var(--color-bg-elevated)',
                    color: 'var(--color-text-bright)',
                    border: '1px solid var(--color-border)',
                },
                success: { iconTheme: { primary: 'var(--color-success)', secondary: '#000' } },
                error: { iconTheme: { primary: 'var(--color-error)', secondary: '#fff' } }
            }} />

            {/* Main Content Area */}
            <main className="app-main custom-scrollbar">
                {showSettings ? (
                    <SettingsView />
                ) : currentTab === 'dashboard' ? (
                    <DashboardView />
                ) : currentTab === 'test-cases' ? (
                    <TestCasesView />
                ) : (
                    <ResultsTabView onViewReport={() => setShowReportOverlay(true)} />
                )}
            </main>

            {showReportOverlay && currentReport && !currentReport._isLive && (
                <TestResultsPanel
                    report={currentReport}
                    onClose={() => setShowReportOverlay(false)}
                />
            )}
        </div>
    );
}

export default App;
