export interface VibeShieldConfig {
    // General
    enabled: boolean;

    // Project
    projectRoot: string;
    startCommand: string; // e.g., "npm run dev"

    // Cortex-R
    cortex: {
        endpoint: string;
        model: string;
        apiKey?: string;
    };

    // Overlay UI
    overlay: {
        position: 'top-right' | 'bottom-right' | 'custom';
        opacity: number;
        theme: 'dark' | 'light' | 'system';
    };
}
