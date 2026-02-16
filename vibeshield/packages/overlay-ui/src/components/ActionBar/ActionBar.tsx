import React from 'react';
import './ActionBar.css';

interface Props {
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
    isRunning: boolean;
}

export const ActionBar: React.FC<Props> = ({ onStart, onStop, onClear, isRunning }) => {
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
            <button className="btn btn-secondary" onClick={onClear}>
                Clear Logs
            </button>
        </div>
    );
};
