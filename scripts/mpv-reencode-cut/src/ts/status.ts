import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobState, JobStatus, RenderJob } from './types';

export function logPathForJob(jobPath: string): string {
    return replaceJobExtension(jobPath, '.log');
}

export function launcherLogPathForJob(jobPath: string): string {
    return replaceJobExtension(jobPath, '.launcher.log');
}

export function statusPathForJob(jobPath: string): string {
    return replaceJobExtension(jobPath, '.status.json');
}

export function createStatus(
    job: RenderJob,
    jobPath: string,
    state: JobState,
    fields: Partial<Omit<JobStatus, 'id' | 'state' | 'created_at' | 'updated_at' | 'source' | 'log_path' | 'outputs'>> & {
        outputs?: string[];
        log_path?: string;
    } = {}
): JobStatus {
    const now = new Date().toISOString();
    return {
        id: job.id,
        state,
        created_at: job.created_at,
        updated_at: now,
        source: job.source,
        log_path: fields.log_path ?? logPathForJob(jobPath),
        outputs: fields.outputs ?? [],
        pid: fields.pid,
        current_cut: fields.current_cut,
        total_cuts: fields.total_cuts,
        error: fields.error
    };
}

export async function writeStatus(jobPath: string, status: JobStatus): Promise<void> {
    const statusPath = statusPathForJob(jobPath);
    await fs.promises.mkdir(path.dirname(statusPath), { recursive: true });
    const tempPath = `${statusPath}.${process.pid}.tmp`;
    await fs.promises.writeFile(tempPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tempPath, statusPath);
}

function replaceJobExtension(jobPath: string, extension: string): string {
    return /\.json$/i.test(jobPath) ? jobPath.replace(/\.json$/i, extension) : `${jobPath}${extension}`;
}
