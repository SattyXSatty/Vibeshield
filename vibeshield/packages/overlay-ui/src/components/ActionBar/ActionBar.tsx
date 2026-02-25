import React from 'react';
import './ActionBar.css';

interface Props {
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
    onExtractIntent: () => void;
    onGenerateTestPlan: () => void;
    onExecuteTestPlan: () => void;
    onViewLastReport?: () => void;
    hasLastReport?: boolean;
    isRunning: boolean;
}

export const ActionBar: React.FC<Props> = ({
    onStart,
    onStop,
    onClear,
    onExtractIntent,
    onGenerateTestPlan,
    onExecuteTestPlan,
    onViewLastReport,
    hasLastReport,
    isRunning
}) => {
    return (
        <div className="action-bar">
            {!isRunning ? (
                <button className="btn btn-primary" onClick={onStart}>
                    Start Agent
                </button>
            ) : (
                <button className="btn btn-danger" onClick={onStop}>
                    Stop Agent
                </button>
            )}
            <button className="btn btn-secondary" onClick={onExtractIntent} style={{ marginLeft: 'var(--space-sm)' }}>
                Extract Intent
            </button>
            <button className="btn btn-secondary" onClick={onGenerateTestPlan} style={{ marginLeft: 'var(--space-sm)' }}>
                Gen TestPlan
            </button>
            <button className="btn btn-primary" onClick={onExecuteTestPlan} style={{ marginLeft: 'var(--space-sm)' }}>
                Run Tests
            </button>
            {hasLastReport && onViewLastReport && !isRunning && (
                <button className="btn btn-secondary" onClick={onViewLastReport} style={{ marginLeft: 'var(--space-sm)' }}>
                    View Results
                </button>
            )}
            <button className="btn btn-secondary" onClick={onClear} style={{ marginLeft: 'var(--space-sm)' }}>
                Clear
            </button>
        </div>
    );
};
