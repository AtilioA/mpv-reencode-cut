import * as os from 'node:os';
import * as path from 'node:path';
import { Options } from './types';

export function expandHome(input: string): string {
    if (input === '~') return os.homedir();
    if (input.startsWith(`~${path.sep}`) || input.startsWith('~/')) {
        return path.join(os.homedir(), input.slice(2));
    }
    return input;
}

export function resolveOutputDirectory(inputDirectory: string, options: Options, isStream: boolean): string {
    const configured = isStream && options.stream_output_dir ? options.stream_output_dir : options.output_dir;
    const expanded = expandHome(configured || '.');
    return path.resolve(inputDirectory, expanded);
}

export function sanitizeFilename(input: string): string {
    const sanitized = input
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return sanitized || 'cut';
}

export function formatTime(seconds: number): string {
    const safe = Math.max(0, seconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const rest = (safe % 60).toFixed(1).replace(/\.0$/, '');
    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (rest !== '0') parts.push(`${rest}s`);
    return parts.join('') || '0s';
}

export function outputExtension(inputFilename: string, audioOnly: boolean): string {
    if (audioOnly) return '.mp3';
    return path.extname(inputFilename) || '.mp4';
}
