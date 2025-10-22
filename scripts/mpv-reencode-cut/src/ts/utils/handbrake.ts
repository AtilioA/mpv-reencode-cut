import * as child_process from 'node:child_process';
import { Options } from '../types';

export function buildHandbrakeArgs(
    inpath: string,
    outpath: string,
    start: number,
    duration: number,
    options: Options
): string[] {
    const args: string[] = [
        '--input', inpath,
        '--output', outpath,
        '--start-at', `duration:${start}`,
        '--stop-at', `duration:${duration}`,
    ];

    // Use a default preset for simplicity, can be configured further.
    args.push('--preset', 'Fast 1080p30');

    if (options.audio_only) {
        // Handbrake requires a video track, so we can't do audio-only in the same way.
        // This will create a video with no picture and the selected audio.
        args.push('--no-video');
        args.push('--encoder', options.audio_codec || 'ca_aac');
        if (options.audio_bitrate) {
            args.push('--ab', options.audio_bitrate.replace('k', ''));
        }
    } else {
        // Video arguments
        args.push('--encoder', options.video_codec || 'x264');
        if (options.video_bitrate) {
            // Handbrake bitrate is in kbps, remove 'M' and convert.
            const bitrate = parseInt(options.video_bitrate.replace('M', ''), 10) * 1000;
            args.push('--vb', bitrate.toString());
        }

        // Audio arguments
        args.push('--aencoder', 'ca_aac');
        args.push('--ab', '160');
    }

    return args;
}

export function runHandbrakeCLI(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const handbrake = child_process.spawn('HandBrakeCLI', args, { stdio: 'inherit' });

        handbrake.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`HandBrakeCLI process exited with code ${code}`));
            }
        });

        handbrake.on('error', (err) => {
            reject(new Error(`Failed to start HandBrakeCLI: ${err.message}`));
        });
    });
}
