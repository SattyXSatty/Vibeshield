import { VibeShieldConfig } from '@vibeshield/shared';
/**
 * Manages loading, merging, and providing configuration.
 */
export declare class ConfigManager {
    private currentConfig;
    private projectRoot;
    constructor(projectRoot?: string);
    /**
     * Initialize configuration by loading from disk and detecting environment.
     */
    initialize(): Promise<VibeShieldConfig>;
    /**
     * Get the current configuration.
     */
    get(): VibeShieldConfig;
    /**
     * Update configuration at runtime (e.g. from VS Code settings).
     */
    update(partial: Partial<VibeShieldConfig>): void;
    private detectFromPackageJson;
    private loadUserConfig;
}
