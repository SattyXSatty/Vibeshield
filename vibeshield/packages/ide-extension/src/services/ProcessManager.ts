import * as cp from 'child_process';
import * as vscode from 'vscode';

export class ProcessManager {
    private activeProcess: cp.ChildProcess | null = null;
    private outputChannel: vscode.OutputChannel;
    private _onStdout = new vscode.EventEmitter<string>();
    private _onStderr = new vscode.EventEmitter<string>();
    private _onExit = new vscode.EventEmitter<number | null>();

    public readonly onStdout = this._onStdout.event;
    public readonly onStderr = this._onStderr.event;
    public readonly onExit = this._onExit.event;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('VibeShield Process');
    }

    public async start(command: string, cwd: string) {
        if (this.activeProcess) {
            vscode.window.showWarningMessage('A process is already running. Stopping it first...');
            await this.stop();
        }

        this.outputChannel.show(true);
        this.outputChannel.appendLine(`[VibeShield] Starting process: ${command}`);
        this.outputChannel.appendLine(`[VibeShield] CWD: ${cwd}`);

        const [cmd, ...args] = command.split(' ');

        try {
            this.activeProcess = cp.spawn(cmd, args, {
                cwd,
                shell: true, // Use shell to support commands like 'npm run dev' easily
                env: { ...process.env, FORCE_COLOR: 'true' } // improved DX
            });

            if (this.activeProcess.pid) {
                console.log(`[VibeShield] Process started with PID: ${this.activeProcess.pid}`);
            }

            this.activeProcess.stdout!.on('data', (data) => {
                const output = data.toString();
                this.outputChannel.append(output);
                this._onStdout.fire(output);
            });

            this.activeProcess.stderr!.on('data', (data) => {
                const output = data.toString();
                this.outputChannel.append(output);
                this._onStderr.fire(output);
            });

            this.activeProcess.on('error', (err) => {
                vscode.window.showErrorMessage(`Process error: ${err.message}`);
                this.outputChannel.appendLine(`[Error] ${err.message}`);
                this._onStderr.fire(`[Error] ${err.message}`);
                this.activeProcess = null;
            });

            this.activeProcess.on('close', (code) => {
                this.outputChannel.appendLine(`[VibeShield] Process exited with code ${code}`);
                this.activeProcess = null;
                this._onExit.fire(code);
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to start process: ${error.message}`);
            this.activeProcess = null;
        }
    }

    public async stop() {
        if (!this.activeProcess) {
            return;
        }

        this.outputChannel.appendLine('[VibeShield] Stopping process...');

        return new Promise<void>((resolve) => {
            if (this.activeProcess) {
                // kill() only kills the shell, not the children if shell: true.
                // For Windows/Unix, tree-kill is better, but trying simple kill first.
                // On Mac/Linux, we can try killing the process group.
                try {
                    process.kill(-this.activeProcess.pid!, 'SIGTERM'); // Negative PID kills process group
                } catch (e) {
                    this.activeProcess.kill('SIGTERM');
                }

                // Force kill fallback
                setTimeout(() => {
                    if (this.activeProcess) {
                        this.activeProcess.kill('SIGKILL');
                        this.activeProcess = null;
                        resolve();
                    }
                }, 2000);

                this.activeProcess.on('exit', () => {
                    this.activeProcess = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public dispose() {
        this.stop();
        this.outputChannel.dispose();
    }
}
