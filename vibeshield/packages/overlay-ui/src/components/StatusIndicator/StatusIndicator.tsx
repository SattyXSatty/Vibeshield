import React from 'react';
import { AgentPhase } from '@vibeshield/shared';
import './StatusIndicator.css';

interface Props {
    phase: AgentPhase;
}

const PHASE_LABELS: Record<AgentPhase, string> = {
    idle: 'Ready',
    bootstrapping: 'Starting Up...',
    planning: 'Planning Tasks...',
    executing: 'Executing...',
    analyzing: 'Analyzing Output...',
    error: 'Error Encountered',
    completed: 'Task Completed',
    stopped: 'Stopped Manually'
};

const PHASE_COLORS: Record<AgentPhase, string> = {
    idle: 'var(--color-text-secondary)',
    bootstrapping: 'var(--color-info)',
    planning: 'var(--color-brand)',
    executing: 'var(--color-success)',
    analyzing: 'var(--color-warning)',
    error: 'var(--color-error)',
    completed: 'var(--color-success)',
    stopped: 'var(--color-error)'
};

export const StatusIndicator: React.FC<Props> = ({ phase }) => {
    const color = PHASE_COLORS[phase];
    const isActive = ['planning', 'executing', 'analyzing'].includes(phase);

    return (
        <div className="status-indicator">
            <div
                className={`status-dot ${isActive ? 'pulsing' : ''}`}
                style={{ backgroundColor: color }}
            />
            <span className="status-label">{PHASE_LABELS[phase]}</span>
        </div>
    );
};
