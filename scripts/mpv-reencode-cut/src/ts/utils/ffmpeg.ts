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
            '-c:a', options.audio_codec || 'aac',
            '-b:a', options.audio_bitrate || '160k',
            '-ac', '2'  // stereo mixdown
        ]);
    } else {
        outputArgs = outputArgs.concat([
            // Video settings matching Telegram preset
            '-c:v', options.video_codec || 'h264_nvenc',  // NVENC H.264 (fallback to H.265 if available)
            '-preset', options.video_preset || 'medium',
            '-b:v', options.video_bitrate || '4000k',  // 4M bitrate
            '-r', options.video_framerate || '60',  // 60 fps
            '-crf', options.video_crf || '22',  // Quality setting
            '-pix_fmt', 'yuv420p',  // Ensure compatibility
            '-vf', Array.isArray(options.video_filters) ? options.video_filters.join(',') : (options.video_filters || 'scale=1920:1080'),  // 1080p resolution
            '-aspect', '16:9',  // Maintain aspect ratio
            // Audio settings matching Telegram preset
            '-c:a', 'aac',
            '-b:a', '160k',
            '-ac', '2',  // stereo mixdown
            '-ar', '48000'  // 48kHz sample rate
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
