import * as fs from 'node:fs';
import * as path from 'node:path';
import { Options } from './types';

export function buildHandBrakeArgs(
    inputPath: string,
    outputPath: string,
    start: number,
    duration: number,
    options: Options
): string[] {
    return [
        '--input', inputPath,
        '--output', outputPath,
        '--start-at', `duration:${start}`,
        '--stop-at', `duration:${duration}`,
        '--encoder', options.encoder || 'x264',
        '--vb', videoBitrateKbps(options.bitrate || '3000k'),
        '--rate', '60',
        '--pfr',
        '--maxWidth', '1920',
        '--maxHeight', '1080',
        '--ab', '160',
        '--mixdown', 'stereo',
        '--optimize',
        '--non-anamorphic'
    ];
}

export function videoBitrateKbps(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (/^\d+m$/.test(trimmed)) {
        return String(Number.parseInt(trimmed, 10) * 1000);
    }
    if (/^\d+k$/.test(trimmed)) {
        return String(Number.parseInt(trimmed, 10));
    }
    if (/^\d+$/.test(trimmed)) {
        return trimmed;
    }
    return '3000';
}

export function resolveHandBrakeCommand(
    options: Pick<Options, 'handbrake_path'>,
    env: NodeJS.ProcessEnv = process.env,
    exists: (filePath: string) => boolean = fs.existsSync
): string {
    const configured = options.handbrake_path || 'HandBrakeCLI';
    if (isExplicitPath(configured)) {
        if (exists(configured)) return configured;
        throw new Error(`HandBrakeCLI not found at configured handbrake_path: ${configured}`);
    }

    for (const candidate of commandCandidates(configured, env)) {
        if (exists(candidate)) return candidate;
    }

    throw new Error(
        'HandBrakeCLI was not found. Install HandBrakeCLI or set handbrake_path in mpv-reencode-cut.conf to the full HandBrakeCLI.exe path.'
    );
}

function isExplicitPath(value: string): boolean {
    return path.isAbsolute(value) || value.includes('/') || value.includes('\\');
}

function commandCandidates(command: string, env: NodeJS.ProcessEnv): string[] {
    const executableNames = process.platform === 'win32' && !command.toLowerCase().endsWith('.exe')
        ? [command, `${command}.exe`]
        : [command];

    const candidates: string[] = [];
    for (const directory of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
        for (const executableName of executableNames) {
            candidates.push(path.join(directory, executableName));
        }
    }

    if (process.platform === 'win32') {
        for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.ChocolateyInstall]) {
            if (!base) continue;
            candidates.push(path.join(base, 'HandBrake', 'HandBrakeCLI.exe'));
            candidates.push(path.join(base, 'bin', 'HandBrakeCLI.exe'));
        }
    }

    return candidates;
}
