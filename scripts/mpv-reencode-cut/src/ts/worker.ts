import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildConcatArgs, buildCutArgs } from './ffmpeg';
import { buildHandBrakeArgs, resolveHandBrakeCommand } from './handbrake';
import { normalizeCuts, readJob } from './job';
import { formatTime, outputExtension, resolveOutputDirectory, sanitizeFilename } from './paths';
import { runRequired } from './process';
import { prepareSource } from './source';
import { createStatus, logPathForJob, writeStatus } from './status';
import { Cut, RenderJob } from './types';

if (require.main === module) {
    const jobPath = process.argv[2];
    if (!jobPath) {
        console.error('Usage: node worker.js <job.json>');
        process.exit(2);
    }

    void runJob(jobPath).catch(() => {
        process.exitCode = 1;
    });
}

export async function runJob(jobPath: string): Promise<void> {
    const logPath = logPathForJob(jobPath);
    const log = createLogger(logPath);
    let cleanupPaths: string[] = [];
    let job: RenderJob | null = null;
    let finalOutputs: string[] = [];

    try {
        job = await readJob(jobPath);
        log(`Started job ${job.id}`);
        log(`Source: ${job.source.path}`);

        const cuts = normalizeCuts(job.cuts);
        await writeStatus(jobPath, createStatus(job, jobPath, 'running', {
            pid: process.pid,
            log_path: logPath,
            total_cuts: cuts.length
        }));

        const outDir = resolveOutputDirectory(job.source.directory, job.options, job.source.is_stream);
        await fs.promises.mkdir(outDir, { recursive: true });

        const source = await prepareSource(job, log);
        cleanupPaths = source.cleanupPaths;

        const outputPaths: string[] = [];
        const inputBase = sanitizeFilename(path.parse(job.source.filename).name || job.source.media_title || 'stream');
        const ext = outputExtension(job.source.filename, job.options.audio_only);
        const tempDir = path.join(path.dirname(jobPath), `${job.id}-parts`);
        if (job.options.multi_cut_mode === 'merge' && cuts.length > 1) {
            await fs.promises.mkdir(tempDir, { recursive: true });
            cleanupPaths.push(tempDir);
        }

        for (const [index, cut] of cuts.entries()) {
            const duration = cut.end - cut.start;
            const partName = cutOutputName(inputBase, ext, cut, cuts.length === 1 ? null : index + 1);
            const outputPath = job.options.multi_cut_mode === 'merge' && cuts.length > 1
                ? path.join(tempDir, partName)
                : path.join(outDir, partName);

            log(`Rendering cut ${index + 1}/${cuts.length}: ${formatTime(cut.start)} - ${formatTime(cut.end)}`);
            await writeStatus(jobPath, createStatus(job, jobPath, 'running', {
                pid: process.pid,
                log_path: logPath,
                current_cut: index + 1,
                total_cuts: cuts.length,
                outputs: finalOutputs
            }));
            const command = job.options.audio_only ? 'ffmpeg' : resolveHandBrakeCommand(job.options);
            const args = job.options.audio_only
                ? buildCutArgs(source.path, outputPath, cut.start, duration, job.options)
                : buildHandBrakeArgs(source.path, outputPath, cut.start, duration, job.options);
            await runRequired(command, args, log);
            outputPaths.push(outputPath);
            if (!(job.options.multi_cut_mode === 'merge' && cuts.length > 1)) {
                finalOutputs = outputPaths.slice();
            }
        }

        if (job.options.multi_cut_mode === 'merge' && outputPaths.length > 1) {
            const mergedName = sanitizeFilename(`(${outputPaths.length} merged cuts) ${inputBase}`) + ext;
            const mergedPath = path.join(outDir, mergedName);
            const listPath = path.join(tempDir, 'concat.txt');
            await fs.promises.writeFile(listPath, outputPaths.map(concatLine).join('\n'));
            log(`Merging ${outputPaths.length} cuts into ${mergedPath}`);
            await runRequired('ffmpeg', buildConcatArgs(listPath, mergedPath, job.options), log);
            finalOutputs = [mergedPath];
        }

        await writeStatus(jobPath, createStatus(job, jobPath, 'succeeded', {
            pid: process.pid,
            log_path: logPath,
            outputs: finalOutputs
        }));
        log('Done.');
    } catch (error) {
        log(`ERROR: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        if (job) {
            await writeStatus(jobPath, createStatus(job, jobPath, 'failed', {
                pid: process.pid,
                log_path: logPath,
                outputs: finalOutputs,
                error: error instanceof Error ? error.message : String(error)
            })).catch(statusError => {
                log(`ERROR: Failed to write job status: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
            });
        }
        throw error;
    } finally {
        for (const cleanupPath of cleanupPaths) {
            await fs.promises.rm(cleanupPath, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}

function cutOutputName(base: string, ext: string, cut: Cut, index: number | null): string {
    const prefix = index === null ? '(cut)' : `(cut${index})`;
    return sanitizeFilename(`${prefix} ${base} (${formatTime(cut.start)} - ${formatTime(cut.end)})`) + ext;
}

function concatLine(filePath: string): string {
    return `file '${filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
}

function createLogger(filePath: string): (line: string) => void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    return (line: string) => {
        const text = `[${new Date().toISOString()}] ${line}`;
        fs.appendFileSync(filePath, `${text}\n`);
        console.log(text);
    };
}
