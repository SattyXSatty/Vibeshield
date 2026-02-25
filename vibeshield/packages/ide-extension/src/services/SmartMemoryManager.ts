import * as fs from 'fs';
import * as path from 'path';

export class SmartMemoryManager {
    private memoryPath: string;

    constructor(workspaceRoot: string) {
        const vsDir = path.join(workspaceRoot, '.vibeshield');
        if (!fs.existsSync(vsDir)) {
            fs.mkdirSync(vsDir, { recursive: true });
        }
        this.memoryPath = path.join(vsDir, 'smart_memory.txt');
    }

    public getMemory(): string {
        try {
            if (fs.existsSync(this.memoryPath)) {
                return fs.readFileSync(this.memoryPath, 'utf8');
            }
        } catch (e) {
            console.error('[VibeShield] Error reading smart memory:', e);
        }
        return '';
    }

    public updateMemoryLocally(updatedMemory: string) {
        try {
            fs.writeFileSync(this.memoryPath, updatedMemory, 'utf8');
            console.log(`[VibeShield] Smart memory updated locally.`);
        } catch (e) {
            console.error('[VibeShield] Error writing smart memory:', e);
        }
    }

    public clearMemoryLocally() {
        try {
            if (fs.existsSync(this.memoryPath)) {
                fs.unlinkSync(this.memoryPath);
                console.log(`[VibeShield] Smart memory cleared locally.`);
            }
        } catch (e) {
            console.error('[VibeShield] Error clearing smart memory:', e);
        }
    }
}
