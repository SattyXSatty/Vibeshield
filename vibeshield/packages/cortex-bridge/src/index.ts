
export interface CortexBridgeConfig {
    apiKey: string;
}

export class CortexBridgeCore {
    constructor(private config: CortexBridgeConfig) { }

    // Placeholder implementation to allow build to succeed
    async echo(msg: string): Promise<string> {
        return msg;
    }
}
