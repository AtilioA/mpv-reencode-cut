import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHandBrakeArgs, resolveHandBrakeCommand, videoBitrateKbps } from './handbrake';
import { Options } from './types';

const options: Options = {
    output_dir: '.',
    multi_cut_mode: 'separate',
    encoder: 'x265',
    bitrate: '4M',
    handbrake_path: 'HandBrakeCLI',
    audio_encoder: 'libmp3lame',
    audio_bitrate: '192k',
    audio_only: false,
    stream_output_dir: 'stream_cuts',
    stream_prefer_full_download: false
};

test('video cuts are encoded with HandBrakeCLI-compatible arguments', () => {
    const args = buildHandBrakeArgs('input.mkv', 'out.mp4', 12.5, 4.25, options);
    assert.deepEqual(args.slice(0, 8), [
        '--input', 'input.mkv',
        '--output', 'out.mp4',
        '--start-at', 'duration:12.5',
        '--stop-at', 'duration:4.25'
    ]);
    assert.ok(args.includes('--encoder'));
    assert.equal(args[args.indexOf('--encoder') + 1], 'x265');
    assert.equal(args[args.indexOf('--vb') + 1], '3000');
    assert.ok(args.includes('--optimize'));
});

test('video bitrate strings are converted to HandBrake kbps values', () => {
    assert.equal(videoBitrateKbps('4M'), '3000');
    assert.equal(videoBitrateKbps('500k'), '500');
    assert.equal(videoBitrateKbps('2500'), '2500');
    assert.equal(videoBitrateKbps('bad'), '3000');
});

test('HandBrakeCLI resolves from PATH-like environment entries', () => {
    const command = resolveHandBrakeCommand(options, { PATH: 'C:\\Tools' }, filePath => {
        return filePath === 'C:\\Tools\\HandBrakeCLI.exe';
    });
    assert.equal(command, 'C:\\Tools\\HandBrakeCLI.exe');
});

test('configured explicit handbrake_path is used when present', () => {
    const explicit = 'D:\\Apps\\HandBrake\\HandBrakeCLI.exe';
    const command = resolveHandBrakeCommand({ handbrake_path: explicit }, {}, filePath => filePath === explicit);
    assert.equal(command, explicit);
});

test('missing HandBrakeCLI reports a configuration-oriented error', () => {
    assert.throws(
        () => resolveHandBrakeCommand(options, { PATH: '' }, () => false),
        /set handbrake_path/
    );
});
