import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { PreparedSource, RenderJob } from './types';
import { runRequired } from './process';

export async function prepareSource(job: RenderJob, log: (line: string) => void): Promise<PreparedSource> {
    if (!job.source.is_stream) {
        if (!fs.existsSync(job.source.path)) {
            throw new Error(`Input file not found: ${job.source.path}`);
        }
        return { path: job.source.path, cleanupPaths: [] };
    }

    if (job.options.audio_only && !job.options.stream_prefer_full_download && job.source.direct_url) {
        log(`Using direct stream URL: ${job.source.direct_url}`);
        return { path: job.source.direct_url, cleanupPaths: [] };
    }

    const downloader = await findDownloader();
    if (!downloader) {
        if (job.source.direct_url) {
            log('yt-dlp was not found; falling back to direct stream URL.');
            return { path: job.source.direct_url, cleanupPaths: [] };
        }
        throw new Error('Stream export needs yt-dlp in PATH, or a direct stream URL from mpv.');
    }

    const tempDir = path.join(os.tmpdir(), 'mpv-reencode-cut', job.id);
    await fs.promises.mkdir(tempDir, { recursive: true });
    const outputTemplate = path.join(tempDir, 'source.%(ext)s');
    await runRequired(downloader, ['-o', outputTemplate, job.source.path], log);

    const entries = await fs.promises.readdir(tempDir);
    const downloaded = entries
        .filter(entry => entry.startsWith('source.') && !entry.endsWith('.part'))
        .map(entry => path.join(tempDir, entry))[0];

    if (!downloaded) {
        throw new Error('yt-dlp completed without producing a source file.');
    }

    return { path: downloaded, cleanupPaths: [tempDir] };
}

async function findDownloader(): Promise<string | null> {
    for (const name of ['yt-dlp', 'youtube-dl']) {
        try {
            const command = process.platform === 'win32' ? 'where' : 'which';
            await new Promise<void>((resolve, reject) => {
                const child = spawn(command, [name], { stdio: 'ignore' });
                child.on('close', (code: number) => code === 0 ? resolve() : reject(new Error()));
                child.on('error', reject);
            });
            return name;
        } catch {
            // Try the next downloader.
        }
    }
    return null;
}
