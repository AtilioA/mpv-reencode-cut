import { Options } from './types';

export function buildCutArgs(
    inputPath: string,
    outputPath: string,
    start: number,
    duration: number,
    options: Options
): string[] {
    const args = [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-ss', String(start),
        '-t', String(duration),
        '-i', inputPath
    ];

    if (options.audio_only) {
        args.push(
            '-map', '0:a:0?',
            '-vn',
            '-c:a', options.audio_encoder || 'libmp3lame',
            '-b:a', options.audio_bitrate || '192k',
            '-ar', '44100',
            '-ac', '2',
            '-f', 'mp3'
        );
    } else {
        args.push(
            '-map', '0:v:0?',
            '-map', '0:a:0?',
            '-c:v', options.encoder || 'libx264',
            '-b:v', options.bitrate || '3M',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '160k',
            '-ac', '2',
            '-movflags', '+faststart'
        );
    }

    args.push(outputPath);
    return args;
}

export function buildConcatArgs(listPath: string, outputPath: string, options: Options): string[] {
    const args = [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath
    ];

    if (options.audio_only) {
        args.push(
            '-vn',
            '-c:a', options.audio_encoder || 'libmp3lame',
            '-b:a', options.audio_bitrate || '192k',
            '-ar', '44100',
            '-ac', '2',
            '-f', 'mp3'
        );
    } else {
        args.push('-c', 'copy');
    }

    args.push(outputPath);
    return args;
}
