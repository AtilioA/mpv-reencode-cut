import { spawn } from 'node:child_process';

export interface CommandResult {
    code: number | null;
    signal: NodeJS.Signals | null;
}

export function runCommand(command: string, args: string[], log: (line: string) => void): Promise<CommandResult> {
    log(`$ ${[command, ...args].map(quoteArg).join(' ')}`);

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

        child.stdout.on('data', chunk => log(chunk.toString().trimEnd()));
        child.stderr.on('data', chunk => log(chunk.toString().trimEnd()));
        child.on('error', reject);
        child.on('close', (code, signal) => resolve({ code, signal }));
    });
}

export async function runRequired(command: string, args: string[], log: (line: string) => void): Promise<void> {
    const result = await runCommand(command, args, log);
    if (result.code !== 0) {
        throw new Error(`${command} exited with ${result.code ?? result.signal ?? 'unknown status'}`);
    }
}

function quoteArg(arg: string): string {
    if (/^[a-zA-Z0-9_./:=+-]+$/.test(arg)) return arg;
    return JSON.stringify(arg);
}
