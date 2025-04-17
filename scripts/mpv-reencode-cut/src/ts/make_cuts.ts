import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { StreamInfo, Options, Cut, StreamData } from './types';
import { ensureDirectoryExists, isSubdirectory, cleanupFiles, setFileTimestamps, rotateTempFiles } from './utils/filesystem';
import { buildFFmpegArgs, runFFmpeg, buildMergeArgs } from './utils/ffmpeg';
import { handleStreamDownload } from './utils/stream';

// ANSI color codes for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    purple: '\x1b[34m',
    plain: '\x1b[0m'
};

// Parse command line arguments
const [indir, optionsStr, filename, cutsStr, streamInfoStr] = process.argv.slice(2);
const options: Options = JSON.parse(optionsStr || '{}');
const streamInfo: StreamInfo | null = streamInfoStr ? JSON.parse(streamInfoStr) : null;
const isStreaming = !!streamInfo;

// Create temp directory for streaming content if needed
const tempDir = os.tmpdir();
const tempStreamDir = path.join(tempDir, 'mpv-reencode-cut-temp');

function toHMS(secs: number): string {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remainingSeconds = ((secs % 3600) % 60).toFixed(1);
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds !== '0.0') parts.push(`${remainingSeconds}s`);
    return parts.join('') || '0';
}

async function renderCut(
    inpath: string,
    outpath: string,
    start: number,
    duration: number
): Promise<string> {
    // Check if input file exists when it's a local file
    if (inpath.startsWith('/') || inpath.includes(':\\') || inpath.includes(':/')) {
        if (!fs.existsSync(inpath)) {
            throw new Error(`Input file not found: ${inpath}`);
        }
    }

    // Create output directory if needed
    const outDir = path.dirname(outpath);
    ensureDirectoryExists(outDir);

    // Build and run FFmpeg command
    const args = buildFFmpegArgs(inpath, outpath, start, duration, options);
    await runFFmpeg([...args.input, ...args.output]);

    // Set timestamps on output file
    if (fs.existsSync(outpath)) {
        if (fs.existsSync(inpath)) {
            await setFileTimestamps(inpath, outpath);
        } else {
            await setFileTimestamps(null, outpath, true);
        }
        return outpath;
    }

    throw new Error('FFmpeg did not generate an output file');
}

async function mergeCuts(tempPath: string, filepaths: string[], outpath: string): Promise<string> {
    console.log(`${colors.green}Merging cuts:${colors.plain}`);
    console.log(`${colors.green}Audio only:${colors.plain} ${options.audio_only ? 'yes' : 'no'}`);
    console.log(`${colors.green}Files to merge:${colors.plain}`, filepaths);

    const mergeFile = path.join(tempPath, 'merging.txt');
    const mergeContent = filepaths
        .map(filepath => `file '${filepath.replace(/[\\]/g, '\\\\').replace(/[']/g, "\\'")}'`)
        .join('\n');

    await fs.promises.writeFile(mergeFile, mergeContent);

    try {
        await runFFmpeg(buildMergeArgs(mergeFile, outpath));
        await setFileTimestamps(null, outpath, true);

        // Clean up temporary files
        await fs.promises.unlink(mergeFile);
        for (const filepath of filepaths) {
            await fs.promises.unlink(filepath);
        }

        return outpath;
    } catch (error) {
        // Clean up merge file even if merge failed
        if (fs.existsSync(mergeFile)) {
            await fs.promises.unlink(mergeFile);
        }
        throw error;
    }
}

async function main() {
    let streamData: StreamData | null = null;

    try {
        // Validate input directory
        if (!fs.existsSync(indir) || !fs.statSync(indir).isDirectory()) {
            throw new Error('Input directory is invalid');
        }

        // Validate and create output directory
        const outdir = path.resolve(indir, options.output_dir);
        if (!fs.existsSync(outdir)) {
            if (!isSubdirectory(indir, outdir)) {
                throw new Error('Output directory is invalid');
            }
            await fs.promises.mkdir(outdir, { recursive: true });
        }

        // Parse cuts and prepare paths
        const cutsMap: Record<string, Cut> = JSON.parse(cutsStr);
        const cuts = Object.values(cutsMap).sort((a, b) => a.start - b.start);
        const { name: filename_noext, ext } = path.parse(filename);
        let inpath = path.join(indir, filename);

        // Handle streaming content if detected
        if (isStreaming && streamInfo) {
            streamData = await handleStreamDownload(streamInfo, options, cutsMap, tempStreamDir);
            inpath = streamData.path;
            console.log(`${colors.green}Using stream path: ${inpath}${colors.plain}`);
        }

        // Process each cut
        const outpaths: string[] = [];
        for (const [i, cut] of cuts.entries()) {
            if (!('end' in cut)) continue;

            const duration = Number(cut.end) - Number(cut.start);
            const cutName = `(cut${cuts.length === 1 ? '' : i + 1}) ${filename_noext} (${toHMS(cut.start)} - ${toHMS(cut.end)})${options.audio_only ? '.mp3' : ext}`;
            const outpath = path.join(outdir, cutName);

            console.log(`${colors.green}(${i + 1}/${cuts.length})${colors.plain} ${inpath} ${colors.green}->${colors.plain}`);
            console.log(`${outpath}\n`);

            const finalOutpath = await renderCut(inpath, outpath, cut.start, duration);
            outpaths.push(finalOutpath);
        }

        // Merge cuts if requested
        if (outpaths.length > 1 && options.multi_cut_mode === 'merge') {
            const extension = options.audio_only ? '.mp3' : ext;
            const cutName = `(${outpaths.length} merged cuts) ${filename_noext}${extension}`;
            const outpath = path.join(outdir, cutName);
            console.log(`\nMerging ${outpaths.length} cuts into a single file...`);
            const mergedPath = await mergeCuts(indir, outpaths, outpath);
            console.log(`${colors.green}Merged file created:${colors.plain} ${mergedPath}`);
        }

        // Clean up streaming files if needed
        if (streamData?.isLocalFile && streamData.path) {
            const baseFileName = path.basename(streamData.path).split('.')[0];
            cleanupFiles(tempStreamDir, baseFileName);

            // Rotate temp files after successful render
            rotateTempFiles(tempStreamDir);
        }

        console.log('Done.\n');
    } catch (error) {
        console.error(`${colors.red}Error:${colors.plain}`, error);

        // Clean up streaming files even if there was an error
        if (streamData?.isLocalFile && streamData.path) {
            const baseFileName = path.basename(streamData.path).split('.')[0];
            cleanupFiles(tempStreamDir, baseFileName);

            // Still rotate temp files even on error
            rotateTempFiles(tempStreamDir);
        }

        process.exit(1);
    }
}

main();
