import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { readJob } from './job';
import { createStatus, launcherLogPathForJob, writeStatus } from './status';

const jobPath = process.argv[2];

if (!jobPath) {
    console.error('Usage: node dispatch.js <job.json>');
    process.exit(2);
}

void main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});

async function main(): Promise<void> {
    const job = await readJob(jobPath);
    const workerPath = path.join(__dirname, 'worker.js');
    const logPath = launcherLogPathForJob(jobPath);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    await writeStatus(jobPath, createStatus(job, jobPath, 'queued'));

    const out = fs.openSync(logPath, 'a');
    try {
        const child = spawn(process.execPath, [workerPath, jobPath], {
            detached: true,
            stdio: ['ignore', out, out],
            windowsHide: true
        });

        child.unref();
        fs.writeSync(out, `[${new Date().toISOString()}] started worker pid ${child.pid} for ${jobPath}\n`);
        console.log(`Started background cut job ${path.basename(jobPath)} with pid ${child.pid}.`);
    } finally {
        fs.closeSync(out);
    }
}
