import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildConcatArgs, buildCutArgs } from './ffmpeg';
import { readJob } from './job';
import { outputExtension } from './paths';
import { createStatus, statusPathForJob, writeStatus } from './status';
import { Options } from './types';

const options: Options = {
    output_dir: '.',
    multi_cut_mode: 'merge',
    encoder: 'libx264',
    bitrate: '4M',
    handbrake_path: 'HandBrakeCLI',
    audio_encoder: 'libmp3lame',
    audio_bitrate: '192k',
    audio_only: true,
    stream_output_dir: 'stream_cuts',
    stream_prefer_full_download: false
};

test('audio-only cuts are encoded as real MP3 outputs', () => {
    const args = buildCutArgs('input.mp4', 'out.mp3', 1, 2, options);
    assert.equal(args.at(-1), 'out.mp3');
    assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('out.mp3')), [
        '-map', '0:a:0?',
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'mp3'
    ]);
});

test('merged audio cuts are re-encoded instead of stream-copied', () => {
    const args = buildConcatArgs('concat.txt', 'merged.mp3', options);
    assert.ok(args.includes('-c:a'));
    assert.ok(!args.includes('copy'));
    assert.equal(args.at(-1), 'merged.mp3');
});

test('audio-only outputs use mp3 extension', () => {
    assert.equal(outputExtension('input.mkv', true), '.mp3');
    assert.equal(outputExtension('input.mkv', false), '.mkv');
    assert.equal(outputExtension('input', false), '.mp4');
});

test('job reader accepts UTF-8 BOM prefixed JSON', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mpv-cut-test-'));
    try {
        const jobPath = path.join(tempDir, 'job.json');
        await fs.promises.writeFile(jobPath, `\uFEFF${JSON.stringify({
            id: 'bom-job',
            created_at: '2026-05-28T00:00:00.000Z',
            source: {
                path: 'input.wav',
                filename: 'input.wav',
                directory: tempDir,
                is_stream: false
            },
            options,
            cuts: [{ start: 0, end: 1 }]
        })}`, 'utf8');

        const job = await readJob(jobPath);
        assert.equal(job.id, 'bom-job');
        assert.equal(job.cuts[0]?.end, 1);
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
});

test('status writer emits valid job status JSON', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mpv-cut-status-'));
    try {
        const jobPath = path.join(tempDir, 'job.json');
        const job = {
            id: 'status-job',
            created_at: '2026-05-28T00:00:00.000Z',
            source: {
                path: 'input.wav',
                filename: 'input.wav',
                directory: tempDir,
                is_stream: false
            },
            options,
            cuts: [{ start: 0, end: 1 }]
        };

        await writeStatus(jobPath, createStatus(job, jobPath, 'succeeded', {
            pid: 123,
            outputs: [path.join(tempDir, 'out.mp3')]
        }));

        const raw = await fs.promises.readFile(statusPathForJob(jobPath), 'utf8');
        const status = JSON.parse(raw);
        assert.equal(status.id, 'status-job');
        assert.equal(status.state, 'succeeded');
        assert.equal(status.pid, 123);
        assert.deepEqual(status.outputs, [path.join(tempDir, 'out.mp3')]);
        assert.match(status.log_path, /job\.log$/);
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
});
