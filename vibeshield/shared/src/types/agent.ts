/**
 * Represents the high-level phase of the VibeShield agent.
 * Mapped from AgentLoop4 phases.
 */
export type AgentPhase =
    | 'idle'
    | 'bootstrapping' // Initial startup
    | 'planning'      // PlannerAgent running
    | 'executing'     // AgentLoop executing graph
    | 'analyzing'     // Analyzing results/logs
    | 'error'         // Failed state
    | 'completed'     // All tasks done
    | 'stopped';      // User requested stop

/**
 * Detailed state of the agent system.
 */
export interface AgentState {
    phase: AgentPhase;
    subPhase?: string; // E.g., "Wait for IDE" or "Running Tests"

    // Metadata matching AgentLoop4 context
    sessionId?: string;
    startTime?: string;
    activeStepId?: string; // Currently running step in the graph

    // Metrics
    attemptCount: number;
    lastError?: string;
}
