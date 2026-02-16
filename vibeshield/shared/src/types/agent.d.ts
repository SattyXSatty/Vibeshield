/**
 * Represents the high-level phase of the VibeShield agent.
 * Mapped from AgentLoop4 phases.
 */
export type AgentPhase = 'idle' | 'bootstrapping' | 'planning' | 'executing' | 'analyzing' | 'error' | 'completed' | 'stopped';
/**
 * Detailed state of the agent system.
 */
export interface AgentState {
    phase: AgentPhase;
    subPhase?: string;
    sessionId?: string;
    startTime?: string;
    activeStepId?: string;
    attemptCount: number;
    lastError?: string;
}
