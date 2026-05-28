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
