export interface VibeShieldConfig {
    enabled: boolean;
    projectRoot: string;
    startCommand: string;
    cortex: {
        endpoint: string;
        model: string;
        apiKey?: string;
    };
    overlay: {
        position: 'top-right' | 'bottom-right' | 'custom';
        opacity: number;
        theme: 'dark' | 'light' | 'system';
    };
}
