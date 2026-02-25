import React, { useState } from 'react';
import './TestResultsPanel.css';

interface TestStepResult {
    stepName: string;
    action: string;
    passed: boolean;
    analysis: string;
    rootCause?: string;
    durationMs: number;
    testType: 'cli' | 'api' | 'manual';
}

interface TestReportProps {
    report: {
        testType: string;
        planName: string;
        totalSteps: number;
        passedSteps: number;
        failedSteps: number;
        durationMs: number;
        allPassed: boolean;
        results: TestStepResult[];
        aiFeedback?: string;
    };
    onClose: () => void;
}

export const TestResultsPanel: React.FC<TestReportProps> = ({ report, onClose }) => {
    const [expandedStep, setExpandedStep] = useState<number | null>(null);

    const toggleStep = (index: number) => {
        setExpandedStep(expandedStep === index ? null : index);
    };

    return (
        <div className="test-results-overlay">
            <div className="test-results-container">
                <header className="test-results-header">
                    <h2>Test Execution Report: {report.planName}</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </header>

                <div className="test-results-summary">
                    <div className="summary-item">
                        <span className="label">Result</span>
                        <span className={`value ${report.allPassed ? 'pass' : 'fail'}`}>
                            {report.allPassed ? 'PASSED' : 'FAILED'}
                        </span>
                    </div>
                    <div className="summary-item">
                        <span className="label">Passed</span>
                        <span className="value pass">{report.passedSteps} / {report.totalSteps}</span>
                    </div>
                    <div className="summary-item">
                        <span className="label">Duration</span>
                        <span className="value">{report.durationMs}ms</span>
                    </div>
                    <div className="summary-item">
                        <span className="label">Target</span>
                        <span className="value">{report.testType.toUpperCase()}</span>
                    </div>
                </div>

                {report.aiFeedback && (
                    <div className="ai-feedback-section">
                        <h3>💡 AI Fix Suggestion</h3>
                        <p>{report.aiFeedback}</p>
                    </div>
                )}

                <div className="test-steps-list">
                    <h3>Execution Details</h3>
                    {report.results.map((step, index) => (
                        <div key={index} className={`test-step-card ${step.passed ? 'step-pass' : 'step-fail'}`}>
                            <div className="step-header" onClick={() => toggleStep(index)}>
                                <div className="step-status-icon">{step.passed ? '✅' : '❌'}</div>
                                <div className="step-title">
                                    <span className="step-number">Step {index + 1}:</span> {step.stepName}
                                </div>
                                <div className="step-duration">{step.durationMs}ms</div>

                                <div className="expansion-arrow">
                                    {expandedStep === index ? '▼' : '▶'}
                                </div>
                            </div>

                            {expandedStep === index && (
                                <div className="step-details">
                                    <div className="detail-row">
                                        <strong>Action:</strong> <span>{step.action}</span>
                                    </div>
                                    <div className="detail-row">
                                        <strong>Analysis:</strong> <span>{step.analysis}</span>
                                    </div>
                                    {!step.passed && step.rootCause && (
                                        <div className="detail-row error-row">
                                            <strong>Root Cause:</strong> <span>{step.rootCause}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
