"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
/**
 * Default configuration values used when no user config works.
 */
exports.DEFAULT_CONFIG = {
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
//# sourceMappingURL=defaults.js.map