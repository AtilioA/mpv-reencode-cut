import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { StreamInfo, StreamData, Options, Cut } from '../types';
import { findMostRecentFile, ensureDirectoryExists } from './filesystem';

export function commandExists(command: string): boolean {
    try {
        const checkCmd = process.platform === 'win32'
            ? `where ${command}`
            : `which ${command}`;

        execSync(checkCmd, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export async function handleStreamDownload(
    streamInfo: StreamInfo,
    options: Options,
    cuts: Record<string, Cut>,
    tempDir: string
): Promise<StreamData> {
    ensureDirectoryExists(tempDir);

    const useDirectUrl = !options.stream_prefer_full_download &&
        streamInfo.direct_url &&
        streamInfo.direct_url !== streamInfo.path &&
        streamInfo.direct_url.match(/^https?:\/\//);

    if (useDirectUrl && streamInfo.direct_url) {
        console.log('Using direct media URL for streaming content');
        return {
            path: streamInfo.direct_url,
            isLocalFile: false,
            needsCleanup: false
        };
    }

    const ytdlpExists = commandExists('yt-dlp');
    const youtubeDlExists = commandExists('youtube-dl');

    if (!ytdlpExists && !youtubeDlExists) {
        throw new Error('Neither yt-dlp nor youtube-dl found. Please install one of them.');
    }

    const dlCmd = ytdlpExists ? 'yt-dlp' : 'youtube-dl';
    const timeStamp = Date.now();
    const tempFileBaseName = `stream_${timeStamp}`;
    const tempOutputTemplate = path.join(tempDir, tempFileBaseName);
    const outputTemplate = `${tempOutputTemplate}.%(ext)s`;

    console.log(`Downloading stream using ${dlCmd}...`);

    try {
        const shouldTryPartialDownload = !options.stream_prefer_full_download;
        const cutValues = Object.values(cuts);
        const firstCut = cutValues[0];
        const lastCut = cutValues[cutValues.length - 1];

        let dlCommand = '';

        if (shouldTryPartialDownload && firstCut && lastCut && streamInfo.duration > 0) {
            const startTime = Math.max(0, firstCut.start - 10);
            const endTime = Math.min(streamInfo.duration, lastCut.end + 10);

            console.log(`Attempting partial download from ${startTime}s to ${endTime}s`);
            dlCommand = `${dlCmd} --external-downloader ffmpeg --external-downloader-args "ffmpeg_i:-ss ${startTime} -to ${endTime}" -o "${outputTemplate}" "${streamInfo.path}"`;
        } else {
            const reason = options.stream_prefer_full_download
                ? 'Full download preferred in settings'
                : 'Unable to determine segment boundaries';
            console.log(`${reason}, downloading full stream`);
            dlCommand = `${dlCmd} -o "${outputTemplate}" "${streamInfo.path}"`;
        }

        execSync(dlCommand, { stdio: 'inherit' });

        const downloadedFile = findMostRecentFile(tempDir, tempFileBaseName);
        if (!downloadedFile) {
            throw new Error('No downloaded file found after download completed');
        }

        return {
            path: downloadedFile,
            isLocalFile: true,
            tempDir,
            needsCleanup: !options.stream_keep_downloads
        };
    } catch (err) {
        console.error('Failed to download stream:', err);
        console.log('Falling back to direct URL access');
        return {
            path: streamInfo.path,
            isLocalFile: false,
            needsCleanup: false
        };
    }
}
