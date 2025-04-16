import * as child_process from 'node:child_process';
import { Options, FFmpegArgs } from '../types';

export function buildFFmpegArgs(
    inpath: string,
    outpath: string,
    start: number,
    duration: number,
    options: Options
): FFmpegArgs {
    const inputArgs = [
        '-nostdin',
        '-loglevel', 'error',
        '-y',
        '-ss', start.toString(),
        '-t', duration.toString(),
        '-i', inpath
    ];

    let outputArgs: string[] = [];

    if (options.audio_only) {
        outputArgs = outputArgs.concat([
            '-vn',
            '-c:a', options.audio_codec || 'libmp3lame',
            '-b:a', options.audio_bitrate || '192k'
        ]);
    } else {
        outputArgs = outputArgs.concat([
            '-c:v', options.video_codec || 'libx264',
            '-b:v', options.video_bitrate || '3M',
            '-c:a', 'aac',
            '-b:a', '160k'
        ]);
    }

    outputArgs.push(outpath);

    return {
        input: inputArgs,
        output: outputArgs
    };
}

export function runFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = child_process.spawn('ffmpeg', args, { stdio: 'inherit' });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg process exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            reject(new Error(`Failed to start FFmpeg: ${err.message}`));
        });
    });
}

export function buildMergeArgs(mergeFilePath: string, outputPath: string): string[] {
    return [
        '-nostdin',
        '-loglevel', 'error',
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', mergeFilePath,
        '-c', 'copy',
        outputPath
    ];
}
