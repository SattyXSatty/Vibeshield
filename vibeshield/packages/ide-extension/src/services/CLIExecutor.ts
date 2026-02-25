import * as cp from 'child_process';
import { OverlayConnector } from './OverlayConnector';

export interface CommandExecutionOptions {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
}

export interface CommandExecutionResult {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
}

export class CLIExecutor {
    constructor(private connector: OverlayConnector) { }

    public async executeCommand(command: string, options: CommandExecutionOptions): Promise<CommandExecutionResult> {
        return new Promise((resolve) => {
            const timeout = options.timeoutMs || 45000; // default 45s for commands like testing
            let stdout = '';
            let stderr = '';
            let timedOut = false;

            this.connector.sendLog({
                id: Date.now().toString() + Math.random().toString(),
                timestamp: new Date().toISOString(),
                source: 'system',
                level: 'info',
                content: `> Executing: ${command}`
            });

            const env = { ...process.env, ...options.env };

            const child = cp.spawn(command, {
                shell: true,
                cwd: options.cwd,
                env,
            });

            let timeoutId: NodeJS.Timeout;

            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    timedOut = true;
                    child.kill('SIGKILL');
                    this.connector.sendLog({
                        id: Date.now().toString() + Math.random().toString(),
                        timestamp: new Date().toISOString(),
                        source: 'system',
                        level: 'error',
                        content: `Command timed out after ${timeout}ms: ${command}`
                    });
                }, timeout);
            }

            // Stream output
            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'stdout',
                    level: 'debug',
                    content: text.replace(/\n$/, '')
                });
            });

            child.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'stderr',
                    level: 'warn',
                    content: text.replace(/\n$/, '')
                });
            });

            child.on('close', (code) => {
                if (timeoutId) clearTimeout(timeoutId);

                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'system',
                    level: code === 0 ? 'info' : 'warn',
                    content: `Command finished with exit code ${code}`
                });

                resolve({
                    command,
                    stdout,
                    stderr,
                    exitCode: code,
                    timedOut
                });
            });

            child.on('error', (err) => {
                if (timeoutId) clearTimeout(timeoutId);
                stderr += err.message;

                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'system',
                    level: 'error',
                    content: `Command execution error: ${err.message}`
                });

                resolve({
                    command,
                    stdout,
                    stderr,
                    exitCode: null,
                    timedOut
                });
            });
        });
    }

    /**
     * Executes a chain of commands sequentially. Stops if any command fails.
     */
    public async executeChain(commands: string[], options: CommandExecutionOptions): Promise<{ success: boolean; results: CommandExecutionResult[] }> {
        const results: CommandExecutionResult[] = [];

        for (const cmd of commands) {
            const result = await this.executeCommand(cmd, options);
            results.push(result);

            if (result.exitCode !== 0) {
                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'system',
                    level: 'error',
                    content: `Command chain aborted. "${cmd}" failed with exit code ${result.exitCode}.`
                });
                return { success: false, results };
            }
        }

        return { success: true, results };
    }
}
