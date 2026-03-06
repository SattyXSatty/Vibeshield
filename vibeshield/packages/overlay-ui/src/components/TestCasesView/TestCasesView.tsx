import { useState } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { PlayIcon, PlusIcon, EditIcon, TrashIcon } from '../Icons/Icons';
import './TestCasesView.css';

interface EditingState {
    index: number;
    stepName: string;
    action: string;
    expectedResult: string;
}

export function TestCasesView() {
    const { testPlan, addStep, updateStep, removeStep, isExecuting } = useAgentStore();
    const [showAddForm, setShowAddForm] = useState(false);
    const [editing, setEditing] = useState<EditingState | null>(null);
    const [newStep, setNewStep] = useState({ stepName: '', action: '', expectedResult: '' });
    const [newStepType, setNewStepType] = useState<'ui' | 'api' | 'cli'>('ui');

    const dynamicSteps = testPlan?.steps || [];
    const hasTests = dynamicSteps.length > 0;


    const handleRunSingle = (index: number) => {
        if (!hasTests || isExecuting) return;
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({
                type: 'command',
                timestamp: new Date().toISOString(),
                payload: { action: 'execute_single_test', targetIndex: index, testPlan }
            } as any);
        }
    };

    const handleRunAll = () => {
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({ type: 'command', timestamp: new Date().toISOString(), payload: { action: 'execute_test_plan', testPlan } } as any);
        }
    };

    const handleAddStep = () => {
        if (!newStep.stepName.trim() || !newStep.action.trim()) return;
        addStep({
            stepName: newStep.stepName.trim(),
            action: newStep.action.trim(),
            expectedResult: newStep.expectedResult.trim() || undefined,
        }, newStepType);
        setNewStep({ stepName: '', action: '', expectedResult: '' });
        setNewStepType('ui');
        setShowAddForm(false);
    };

    const handleStartEdit = (idx: number, step: any) => {
        setEditing({
            index: idx,
            stepName: step.stepName || '',
            action: step.action || '',
            expectedResult: step.expectedResult || '',
        });
        setShowAddForm(false);
    };

    const handleSaveEdit = () => {
        if (!editing) return;
        if (!editing.stepName.trim() || !editing.action.trim()) return;
        updateStep(editing.index, {
            stepName: editing.stepName.trim(),
            action: editing.action.trim(),
            expectedResult: editing.expectedResult.trim() || undefined,
        });
        setEditing(null);
    };

    const handleDelete = (idx: number) => {
        if (window.confirm(`Delete step "${dynamicSteps[idx]?.stepName}"?`)) {
            removeStep(idx);
            if (editing?.index === idx) setEditing(null);
        }
    };

    return (
        <div className="test-cases-container">
            {/* Header section */}
            <div className="tc-header">
                <div>
                    <h2>Test Cases</h2>
                    <span className="tc-subtitle">
                        {hasTests
                            ? `${dynamicSteps.length} step${dynamicSteps.length !== 1 ? 's' : ''} · ${testPlan?.testType?.toUpperCase() || 'UNKNOWN'}`
                            : 'No tests yet'}
                    </span>
                </div>
                <div className="tc-actions">
                    <button
                        className="tc-btn-secondary"
                        onClick={handleRunAll}
                        disabled={!hasTests || isExecuting}
                        style={{ opacity: hasTests && !isExecuting ? 1 : 0.5 }}
                    >
                        <PlayIcon className="tc-icon-sm" /> {isExecuting ? 'Running...' : 'Run All'}
                    </button>
                    <button
                        className="tc-btn-primary"
                        onClick={() => { setShowAddForm(!showAddForm); setEditing(null); }}
                    >
                        <PlusIcon className="tc-icon-sm tc-add-icon" /> Add
                    </button>
                </div>
            </div>

            {/* Add New Step Form */}
            {showAddForm && (
                <div className="tc-form-card">
                    <span className="tc-form-title">Add New Test Step</span>
                    <div className="tc-type-selector">
                        {(['ui', 'api', 'cli'] as const).map(t => (
                            <button
                                key={t}
                                className={`tc-type-btn ${newStepType === t ? 'active' : ''}`}
                                onClick={() => setNewStepType(t)}
                                type="button"
                            >
                                {t.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    <input
                        className="tc-input"
                        placeholder="Step name (e.g. Click Login Button)"
                        value={newStep.stepName}
                        onChange={(e) => setNewStep({ ...newStep, stepName: e.target.value })}
                        autoFocus
                    />
                    <textarea
                        className="tc-textarea"
                        placeholder={newStepType === 'ui' ? "UI action (e.g. Click the 'Login' button on the top-right corner)" : newStepType === 'api' ? "API endpoint (e.g. GET https://api.example.com/users)" : "CLI command (e.g. npm test)"}
                        value={newStep.action}
                        onChange={(e) => setNewStep({ ...newStep, action: e.target.value })}
                        rows={2}
                    />
                    <input
                        className="tc-input"
                        placeholder="Expected result (optional)"
                        value={newStep.expectedResult}
                        onChange={(e) => setNewStep({ ...newStep, expectedResult: e.target.value })}
                    />
                    <div className="tc-form-actions">
                        <button className="tc-btn-cancel" onClick={() => { setShowAddForm(false); setNewStep({ stepName: '', action: '', expectedResult: '' }); }}>
                            Cancel
                        </button>
                        <button
                            className="tc-btn-save"
                            onClick={handleAddStep}
                            disabled={!newStep.stepName.trim() || !newStep.action.trim()}
                        >
                            Add Step
                        </button>
                    </div>
                </div>
            )}

            {/* Test Case List */}
            <div className="tc-list">
                {!hasTests && !showAddForm ? (
                    <div className="tc-empty-state">
                        <p>No test steps yet.</p>
                        <span>Use the Dashboard to generate test steps automatically, or click <strong>Add</strong> above to create one manually.</span>
                    </div>
                ) : (
                    dynamicSteps.map((step: any, idx: number) => (
                        <div key={idx} className="tc-card">
                            {editing?.index === idx ? (
                                /* ---- INLINE EDIT MODE ---- */
                                <div className="tc-edit-form">
                                    <input
                                        className="tc-input"
                                        value={editing.stepName}
                                        onChange={(e) => setEditing({ ...editing, stepName: e.target.value })}
                                        placeholder="Step name"
                                        autoFocus
                                    />
                                    <textarea
                                        className="tc-textarea"
                                        value={editing.action}
                                        onChange={(e) => setEditing({ ...editing, action: e.target.value })}
                                        placeholder="Action description"
                                        rows={2}
                                    />
                                    <input
                                        className="tc-input"
                                        value={editing.expectedResult}
                                        onChange={(e) => setEditing({ ...editing, expectedResult: e.target.value })}
                                        placeholder="Expected result (optional)"
                                    />
                                    <div className="tc-form-actions">
                                        <button className="tc-btn-cancel" onClick={() => setEditing(null)}>Cancel</button>
                                        <button
                                            className="tc-btn-save"
                                            onClick={handleSaveEdit}
                                            disabled={!editing.stepName.trim() || !editing.action.trim()}
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* ---- READ MODE ---- */
                                <>
                                    <div className="tc-card-header">
                                        <div className="tc-title-row">
                                            <span className="tc-step-number">{idx + 1}</span>
                                            <div className="tc-title-text">
                                                <h3>{step.stepName}</h3>
                                                <p>{step.action}</p>
                                            </div>
                                        </div>
                                        <div className="tc-card-actions">
                                            <button className="tc-action-btn" title="Run this step" onClick={() => handleRunSingle(idx)} disabled={isExecuting}><PlayIcon /></button>
                                            <button className="tc-action-btn" title="Edit" onClick={() => handleStartEdit(idx, step)}><EditIcon /></button>
                                            <button className="tc-action-btn tc-trash" title="Delete" onClick={() => handleDelete(idx)}><TrashIcon /></button>
                                        </div>
                                    </div>

                                    {step.expectedResult && (
                                        <div className="tc-expected">
                                            <span className="tc-steps-label">EXPECTED</span>
                                            <span className="tc-expected-text">{step.expectedResult}</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
