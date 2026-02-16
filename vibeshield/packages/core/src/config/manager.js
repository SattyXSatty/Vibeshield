"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const defaults_1 = require("./defaults");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Manages loading, merging, and providing configuration.
 */
class ConfigManager {
    currentConfig;
    projectRoot;
    constructor(projectRoot = process.cwd()) {
        this.projectRoot = projectRoot;
        this.currentConfig = { ...defaults_1.DEFAULT_CONFIG, projectRoot };
    }
    /**
     * Initialize configuration by loading from disk and detecting environment.
     */
    async initialize() {
        // 1. Auto-detect from package.json
        const detected = await this.detectFromPackageJson();
        // 2. Load user config file (vibeshield.config.json)
        const userConfig = await this.loadUserConfig();
        // 3. Merge: Defaults < Detected < User Config
        this.currentConfig = {
            ...this.currentConfig,
            ...detected,
            ...userConfig,
            // Deep merge nested objects
            cortex: { ...this.currentConfig.cortex, ...userConfig.cortex },
            overlay: { ...this.currentConfig.overlay, ...userConfig.overlay }
        };
        return this.currentConfig;
    }
    /**
     * Get the current configuration.
     */
    get() {
        return this.currentConfig;
    }
    /**
     * Update configuration at runtime (e.g. from VS Code settings).
     */
    update(partial) {
        this.currentConfig = {
            ...this.currentConfig,
            ...partial,
            cortex: { ...this.currentConfig.cortex, ...(partial.cortex || {}) },
            overlay: { ...this.currentConfig.overlay, ...(partial.overlay || {}) }
        };
    }
    async detectFromPackageJson() {
        try {
            const pkgPath = path.join(this.projectRoot, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                const scripts = pkg.scripts || {};
                let startCommand = this.currentConfig.startCommand;
                // Auto-detect common start scripts
                if (scripts.dev)
                    startCommand = "npm run dev";
                else if (scripts.start)
                    startCommand = "npm start";
                // Detect package manager
                if (fs.existsSync(path.join(this.projectRoot, 'pnpm-lock.yaml'))) {
                    startCommand = startCommand.replace('npm', 'pnpm');
                }
                else if (fs.existsSync(path.join(this.projectRoot, 'yarn.lock'))) {
                    startCommand = startCommand.replace('npm run', 'yarn').replace('npm', 'yarn');
                }
                return { startCommand };
            }
        }
        catch (e) {
            console.warn("Failed to detect package.json settings:", e);
        }
        return {};
    }
    async loadUserConfig() {
        try {
            const configPath = path.join(this.projectRoot, 'vibeshield.config.json');
            if (fs.existsSync(configPath)) {
                const raw = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(raw);
            }
        }
        catch (e) {
            console.warn("Failed to load vibeshield.config.json:", e);
        }
        return {};
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=manager.js.map