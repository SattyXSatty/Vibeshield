import { VibeShieldConfig } from '@vibeshield/shared';

/**
 * Default configuration values used when no user config works.
 */
export const DEFAULT_CONFIG: VibeShieldConfig = {
    enabled: true,
    projectRoot: process.cwd(),
    startCommand: "npm run dev",
    cortex: {
        // Default to local Cortex-R instance
        endpoint: "http://localhost:8000",
        model: "gemini-2.0-flash-exp"
    },
    overlay: {
        position: "bottom-right",
        opacity: 0.9,
        theme: "system"
    }
};
