const fs = require("node:fs");
const child_process = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

const red = "\x1b[31m";
const plain = "\x1b[0m";
const green = "\x1b[32m";
const purple = "\x1b[34m";
const yellow = "\x1b[33m";

const argv = process.argv.slice(2);
const [indir, optionsStr, filename, cutsStr, streamInfoStr] = argv;
const options = JSON.parse(optionsStr || "{}");
const streamInfo = streamInfoStr ? JSON.parse(streamInfoStr) : null;
const isStreaming = !!streamInfo;

// Create temp directory for streaming content if needed
const tempDir = os.tmpdir();
const tempStreamDir = path.join(tempDir, "mpv-reencode-cut-temp");

// Check if commands are available
function commandExists(command) {
  try {
    const checkCmd = process.platform === 'win32'
      ? `where ${command}`
      : `which ${command}`;

    child_process.execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// https://stackoverflow.com/a/45242825
const isSubdirectory = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const ffmpegEscapeFilepath = (filepath) =>
  filepath.replaceAll("\\", "\\\\").replaceAll("'", "'\\''");

async function ffmpeg(args) {
  const cmd = "ffmpeg";
  const baseArgs = [
    "-nostdin",
    "-loglevel",
    "error",
    "-y", // overwrite output files
  ];
  const fullArgs = baseArgs.concat(args);
  const cmdStr = `${cmd} ${fullArgs.join(" ")}`;
  console.log(`${purple}${cmdStr}${plain}\n`);
  child_process.spawnSync(cmd, fullArgs, { stdio: "inherit" });
}

// Function to handle streaming content
async function handleStreamingContent() {
  console.log(`${green}Processing streaming content: ${streamInfo.media_title}${plain}`);

  // Ensure temp directory exists
  if (!fs.existsSync(tempStreamDir)) {
    fs.mkdirSync(tempStreamDir, { recursive: true });
  }

  // Determine if we should use direct URL or need to download via yt-dlp
  const useDirectUrl = !options.stream_prefer_full_download &&
                      streamInfo.direct_url &&
                      streamInfo.direct_url !== streamInfo.path &&
                      streamInfo.direct_url.match(/^https?:\/\//);

  if (useDirectUrl) {
    console.log(`${green}Using direct media URL for streaming content${plain}`);
    // We can use the direct URL with ffmpeg
    return {
      path: streamInfo.direct_url,
      isLocalFile: false,
      needsCleanup: false
    };
  } else {
    // Check if yt-dlp is available
    const ytdlpExists = commandExists("yt-dlp");
    const youtubeDlExists = commandExists("youtube-dl");

    if (!ytdlpExists && !youtubeDlExists) {
      console.error(`${red}Error: Neither yt-dlp nor youtube-dl found. Cannot process streaming URL.${plain}`);
      console.error(`${yellow}Please install yt-dlp or youtube-dl: https://github.com/yt-dlp/yt-dlp#installation${plain}`);
      process.exit(1);
    }

    const dlCmd = ytdlpExists ? "yt-dlp" : "youtube-dl";

    // Generate a safe temporary filename - using a unique timestamp
    const timeStamp = Date.now();
    const tempFileBaseName = `stream_${timeStamp}`;
    const tempOutputTemplate = path.join(tempStreamDir, tempFileBaseName);

    // Let yt-dlp decide the extension based on format selected
    const outputTemplate = `${tempOutputTemplate}.%(ext)s`;

    console.log(`${green}Downloading stream to temporary file using ${dlCmd}...${plain}`);

    try {
      // Download only the relevant portion if format supports it and we have duration info
      // unless stream_prefer_full_download is true
      let shouldTryPartialDownload = !options.stream_prefer_full_download;
      const cuts = JSON.parse(cutsStr);
      const firstCut = Object.values(cuts)[0];
      const lastCut = Object.values(cuts)[Object.keys(cuts).length - 1];

      let dlCommand = "";

      if (shouldTryPartialDownload && firstCut && lastCut && streamInfo.duration > 0) {
        // Add a small buffer (10s) before and after to ensure we get the full segment
        const startTime = Math.max(0, Number(firstCut.start) - 10);
        const endTime = Math.min(streamInfo.duration, Number(lastCut.end) + 10);

        console.log(`${green}Attempting partial download from ${startTime}s to ${endTime}s${plain}`);

        dlCommand = `${dlCmd} --external-downloader ffmpeg --external-downloader-args "ffmpeg_i:-ss ${startTime} -to ${endTime}" -o "${outputTemplate}" "${streamInfo.path}"`;
      } else {
        // If we can't do partial download or prefer full download, just download the whole file
        const reason = options.stream_prefer_full_download ?
                      "Full download preferred in settings" :
                      "Unable to determine segment boundaries";
        console.log(`${yellow}${reason}, downloading full stream${plain}`);

        dlCommand = `${dlCmd} -o "${outputTemplate}" "${streamInfo.path}"`;
      }

      console.log(`${purple}${dlCommand}${plain}`);
      child_process.execSync(dlCommand, { stdio: "inherit" });

      // Find the actual downloaded file with the correct extension
      const filesInTempDir = fs.readdirSync(tempStreamDir);
      const downloadedFiles = filesInTempDir.filter(file =>
        file.startsWith(tempFileBaseName) && !file.includes(".part")
      );

      if (downloadedFiles.length === 0) {
        throw new Error("No downloaded file found after download completed");
      }

      // Take the most recently modified file if there are multiple matches
      let mostRecentFile = downloadedFiles[0];
      let mostRecentTime = 0;

      for (const file of downloadedFiles) {
        const filePath = path.join(tempStreamDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs > mostRecentTime) {
          mostRecentTime = stats.mtimeMs;
          mostRecentFile = file;
        }
      }

      const localStreamPath = path.join(tempStreamDir, mostRecentFile);
      console.log(`${green}Stream downloaded to: ${localStreamPath}${plain}`);

      return {
        path: localStreamPath,
        isLocalFile: true,
        needsCleanup: !options.stream_keep_downloads
      };
    } catch (err) {
      console.error(`${red}Failed to download stream: ${err.message}${plain}`);
      // Fallback to direct URL as last resort
      console.log(`${yellow}Falling back to direct URL access${plain}`);
      return {
        path: streamInfo.path,
        isLocalFile: false,
        needsCleanup: false
      };
    }
  }
}

async function transferTimestamps(inPath, outPath, useCurrentTime = false) {
  try {
    if (useCurrentTime) {
      // Use current time
      const now = Date.now() / 1000;
      fs.utimesSync(outPath, now, now);
      console.log(`Set current timestamp on ${path.basename(outPath)}`);
    } else {
      // Transfer from source
      const { atime, mtime } = fs.statSync(inPath);
      fs.utimesSync(outPath, atime.getTime() / 1000, mtime.getTime() / 1000);
      console.log(`Transferred timestamps from source to ${path.basename(outPath)}`);
    }
  } catch (err) {
    console.error(`${red}Failed to set file timestamps:${plain}`, err);
  }
}

async function renderCut(inpath, outpath, start, duration) {
  // Check if input file exists when it's a local file
  if (inpath.startsWith("/") || inpath.includes(":\\") || inpath.includes(":/")) {
    if (!fs.existsSync(inpath)) {
      console.error(`${red}Error: Input file does not exist: ${inpath}${plain}`);
      throw new Error(`Input file not found: ${inpath}`);
    }
  }

  let args = [
    "-ss", start,
    "-t", duration,
    "-i", inpath,
  ];

  if (options.audio_only) {
    args = args.concat([
      "-vn",  // No video
      "-c:a", options.audio_encoder || "libmp3lame",
      "-b:a", options.audio_bitrate || "192k",
    ]);
    // Change file extension to mp3 if audio_only is true
    outpath = outpath.replace(/\.[^.]+$/, '.mp3');
  } else {
    args = args.concat([
      "-c:v", options.encoder || "libx264",
      "-b:v", options.bitrate || "3M",
      "-c:a", "aac",
      "-b:a", "160k",
    ]);
  }

  // Create output directory if it doesn't exist
  const outDir = path.dirname(outpath);
  if (!fs.existsSync(outDir)) {
    console.log(`${green}Creating output directory: ${outDir}${plain}`);
    fs.mkdirSync(outDir, { recursive: true });
  }

  args.push(outpath);

  try {
    await ffmpeg(args);

    // If output file was successfully created, set timestamps
    if (fs.existsSync(outpath)) {
      // Transfer timestamps from source file if it's a local file
      if (fs.existsSync(inpath)) {
        await transferTimestamps(inpath, outpath);
      } else {
        // Use current time for remote/stream sources
        await transferTimestamps(null, outpath, true);
      }
      return outpath;
    } else {
      throw new Error("ffmpeg didn't generate an output file");
    }
  } catch (error) {
    console.error(`${red}Failed to render cut: ${error.message}${plain}`);
    throw error;
  }
}

async function mergeCuts(tempPath, filepaths, outpath) {
  console.log(`${green}Merging cuts:${plain}`);
  console.log(`${green}Audio only:${plain} ${options.audio_only ? "yes" : "no"}`);
  console.log(`${green}Files to merge:${plain}`, filepaths);

  const mergeFile = path.join(tempPath, "merging.txt");
  await fs.promises.writeFile(
    mergeFile,
    filepaths.map((filepath) => `file '${ffmpegEscapeFilepath(filepath)}'`).join("\n")
  );

  // Create the final output path for the merged file with correct extension
  let finalOutputPath = path.join(path.dirname(outpath), `${path.basename(outpath)}`);

  // Change extension to .mp3 if audio_only is true
  if (options.audio_only) {
    finalOutputPath = finalOutputPath.replace(/\.[^.]+$/, '.mp3');
    console.log(`${green}Using .mp3 extension for merged file:${plain} ${finalOutputPath}`);
  }

  // Concatenate the reencoded segments without reencoding
  await ffmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", mergeFile,
    "-c", "copy",
    finalOutputPath,
  ]);

  // Set current timestamp on the merged file
  await transferTimestamps(null, finalOutputPath, true);

  // Clean up temporary files
  await fs.promises.unlink(mergeFile);
  for (const filepath of filepaths) {
    await fs.promises.unlink(filepath);
  }

  return finalOutputPath;
}

async function cleanupTempFiles(streamData) {
  if (!streamData) return;

  // If user wants to keep downloads, don't clean up
  if (options.stream_keep_downloads) {
    console.log(`${green}Keeping downloaded stream files${plain}`);
    return;
  }

  if (streamData.isLocalFile && streamData.path) {
    try {
      // Clean up the main file
      if (fs.existsSync(streamData.path)) {
        console.log(`${green}Cleaning up temporary stream file: ${streamData.path}${plain}`);
        fs.unlinkSync(streamData.path);
      }

      // Clean up any other temporary files with the same base name
      // This helps when yt-dlp downloads separate audio/video tracks
      if (streamData.path.includes("stream_")) {
        const tempDirFiles = fs.readdirSync(tempStreamDir);
        const baseFileName = path.basename(streamData.path).split('.')[0];

        for (const file of tempDirFiles) {
          if (file.startsWith(baseFileName)) {
            const filePath = path.join(tempStreamDir, file);
            if (filePath !== streamData.path && fs.existsSync(filePath)) {
              console.log(`${green}Cleaning up additional temporary file: ${filePath}${plain}`);
              fs.unlinkSync(filePath);
            }
          }
        }
      }

      // If temp directory is empty, remove it
      const remainingFiles = fs.readdirSync(tempStreamDir);
      if (remainingFiles.length === 0) {
        console.log(`${green}Removing empty temporary directory: ${tempStreamDir}${plain}`);
        fs.rmdirSync(tempStreamDir);
      }
    } catch (err) {
      console.error(`${red}Failed to cleanup temporary files: ${err.message}${plain}`);
    }
  }
}

async function main() {
  let streamData = null;

  try {
    if (!fs.existsSync(indir) || !fs.statSync(indir).isDirectory())
      throw new Error("Input directory is invalid");

    const outdir = path.resolve(indir, options.output_dir);
    if (!fs.existsSync(outdir)) {
      if (!isSubdirectory(indir, outdir)) throw new Error("Output directory is invalid");
      await fs.promises.mkdir(outdir, { recursive: true });
    }

    const cutsMap = JSON.parse(cutsStr);
    const cuts = Object.values(cutsMap).sort((a, b) => a.start - b.start);
    const { name: filename_noext, ext } = path.parse(filename);
    let inpath = path.join(indir, filename);

    // Handle streaming content if detected
    if (isStreaming) {
      streamData = await handleStreamingContent();
      inpath = streamData.path;
      console.log(`${green}Using stream path: ${inpath}${plain}`);
    }

    const outpaths = [];

    for (const [i, cut] of cuts.entries()) {
      if (!("end" in cut)) continue;
      const duration = Number.parseFloat(cut.end) - Number.parseFloat(cut.start);
      const cutName = `(cut${cuts.length === 1 ? "" : i + 1}) ${filename_noext} (${toHMS(cut.start)} - ${toHMS(cut.end)})${options.audio_only ? '.mp3' : ext}`;
      const outpath = path.join(outdir, cutName);
      console.log(`${green}(${i + 1}/${cuts.length})${plain} ${inpath} ${green}->${plain}`);
      console.log(`${outpath}\n`);
      const finalOutpath = await renderCut(inpath, outpath, cut.start, duration);
      outpaths.push(finalOutpath);
    }

    if (outpaths.length > 1 && options.multi_cut_mode === "merge") {
      const extension = options.audio_only ? '.mp3' : ext;
      const cutName = `(${outpaths.length} merged cuts) ${filename_noext}${extension}`;
      const outpath = path.join(outdir, cutName);
      console.log(`\nMerging ${outpaths.length} cuts into a single file...`);
      const mergedPath = await mergeCuts(indir, outpaths, outpath);
      console.log(`${green}Merged file created:${plain} ${mergedPath}`);
    }

    // Clean up temporary files if we used any for streaming
    if (streamData) {
      await cleanupTempFiles(streamData);
    }

    console.log("Done.\n");
  } catch (error) {
    console.error(`${red}Error:${plain}`, error);

    // Clean up temporary files even if there was an error
    if (streamData) {
      await cleanupTempFiles(streamData);
    }

    process.exit(1);
  }
}

function toHMS(secs) {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const remainingSeconds = ((secs % 3600) % 60).toFixed(1);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0) parts.push(`${remainingSeconds}s`);
  return parts.join("") || "0";
}

main();
