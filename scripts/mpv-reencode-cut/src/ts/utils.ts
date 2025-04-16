import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as child_process from 'node:child_process';
import { StreamInfo, StreamData } from './types';

export const Colors = {
    Reset: "\x1b[0m",
    Red: "\x1b[31m",
    Green: "\x1b[32m",
    Yellow: "\x1b[33m",
    Blue: "\x1b[34m",
    Magenta: "\x1b[35m",
    Cyan: "\x1b[36m"
};

export function toHMS(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function cleanupTempFiles(files: string[]): void {
    for (const file of files) {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
}

export async function getStreamData(info: StreamInfo): Promise<StreamData> {
    if (info.isDirectUrl) {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpv-reencode-'));
        const outputPath = path.join(tempDir, `download.${info.format || 'mp4'}`);

        await new Promise<void>((resolve, reject) => {
            const ffmpeg = child_process.spawn('ffmpeg', [
                '-i', info.url,
                '-c', 'copy',
                outputPath
            ]);

            ffmpeg.on('close', (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg download failed with code ${code}`));
                }
            });

            ffmpeg.on('error', reject);
        });

        return {
            path: outputPath,
            isLocalFile: false,
            tempDir
        };
    }

    return {
        path: info.url,
        isLocalFile: true
    };
}

export function validateInputFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Input file does not exist: ${filePath}`);
    }
}

export function validateOutputDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
            throw new Error(`Failed to create output directory: ${dir}`);
        }
    }
}

export function getOutputFilename(inputPath: string, index: number, prefix = 'cut'): string {
    const ext = path.extname(inputPath);
    const basename = path.basename(inputPath, ext);
    return `${prefix}_${basename}_${index}${ext}`;
}

export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
}
