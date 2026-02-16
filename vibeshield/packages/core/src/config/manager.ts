import { VibeShieldConfig } from '@vibeshield/shared';
import { DEFAULT_CONFIG } from './defaults';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Manages loading, merging, and providing configuration.
 */
export class ConfigManager {
    private currentConfig: VibeShieldConfig;
    private projectRoot: string;

    constructor(projectRoot: string = process.cwd()) {
        this.projectRoot = projectRoot;
        this.currentConfig = { ...DEFAULT_CONFIG, projectRoot };
    }

    /**
     * Initialize configuration by loading from disk and detecting environment.
     */
    async initialize(): Promise<VibeShieldConfig> {
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
    get(): VibeShieldConfig {
        return this.currentConfig;
    }

    /**
     * Update configuration at runtime (e.g. from VS Code settings).
     */
    update(partial: Partial<VibeShieldConfig>): void {
        this.currentConfig = {
            ...this.currentConfig,
            ...partial,
            cortex: { ...this.currentConfig.cortex, ...(partial.cortex || {}) },
            overlay: { ...this.currentConfig.overlay, ...(partial.overlay || {}) }
        };
    }

    private async detectFromPackageJson(): Promise<Partial<VibeShieldConfig>> {
        try {
            const pkgPath = path.join(this.projectRoot, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                const scripts = pkg.scripts || {};

                let startCommand = this.currentConfig.startCommand;

                // Auto-detect common start scripts
                if (scripts.dev) startCommand = "npm run dev";
                else if (scripts.start) startCommand = "npm start";

                // Detect package manager
                if (fs.existsSync(path.join(this.projectRoot, 'pnpm-lock.yaml'))) {
                    startCommand = startCommand.replace('npm', 'pnpm');
                } else if (fs.existsSync(path.join(this.projectRoot, 'yarn.lock'))) {
                    startCommand = startCommand.replace('npm run', 'yarn').replace('npm', 'yarn');
                }

                return { startCommand };
            }
        } catch (e) {
            console.warn("Failed to detect package.json settings:", e);
        }
        return {};
    }

    private async loadUserConfig(): Promise<Partial<VibeShieldConfig>> {
        try {
            const configPath = path.join(this.projectRoot, 'vibeshield.config.json');
            if (fs.existsSync(configPath)) {
                const raw = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(raw);
            }
        } catch (e) {
            console.warn("Failed to load vibeshield.config.json:", e);
        }
        return {};
    }
}
