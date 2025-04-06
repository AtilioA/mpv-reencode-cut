const fs = require("node:fs");
const child_process = require("node:child_process");
const path = require("node:path");

const red = "\x1b[31m";
const plain = "\x1b[0m";
const green = "\x1b[32m";
const purple = "\x1b[34m";

// Parse command line arguments early
const argv = process.argv.slice(2);
const [indir, optionsStr, filename, cutsStr] = argv;
const options = JSON.parse(optionsStr || "{}");

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

async function renderCut(inpath, outpath, start, duration) {
  const args = [
    "-ss", start,
    "-t", duration,
    "-i", inpath,
    "-vf", "scale=1920:1080",
    "-c:v", options.encoder || "libx264",
    "-b:v", options.bitrate || "3M",
    "-c:a", "aac",
    "-b:a", "160k",
    outpath,
  ];
  await ffmpeg(args);
}

async function mergeCuts(tempPath, filepaths, outpath) {
  const mergeFile = path.join(tempPath, "merging.txt");
  await fs.promises.writeFile(
    mergeFile,
    filepaths.map((filepath) => `file '${ffmpegEscapeFilepath(filepath)}'`).join("\n")
  );

  // First, concatenate the reencoded segments without reencoding into a temporary file.
  const mergedTempPath = outpath + ".tmp.mp4";
  await ffmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", mergeFile,
    "-c", "copy",
    mergedTempPath,
  ]);

  // Now reencode the merged file to ensure the final output is at the desired lower bitrate.
  await ffmpeg([
    "-i", mergedTempPath,
    "-vf", "scale=1920:1080",
    "-c:v", options.encoder || "libx264",
    "-b:v", options.bitrate || "3.5k",
    "-c:a", "aac",
    "-b:a", "160k",
    outpath,
  ]);

  await fs.promises.unlink(mergeFile);
  await fs.promises.unlink(mergedTempPath);
  for (const filepath of filepaths) {
    await fs.promises.unlink(filepath);
  }
}

async function transferTimestamps(inPath, outPath, offset = 0) {
  try {
    const { atime, mtime } = fs.statSync(inPath);
    fs.utimesSync(
      outPath,
      atime.getTime() / 1000 + offset,
      mtime.getTime() / 1000 + offset
    );
  } catch (err) {
    console.error("Failed to set output file modified time", err);
  }
}

async function main() {
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
  const inpath = path.join(indir, filename);
  const outpaths = [];

  for (const [i, cut] of cuts.entries()) {
    if (!("end" in cut)) continue;
    const duration = Number.parseFloat(cut.end) - Number.parseFloat(cut.start);
    const cutName = `(cut${cuts.length === 1 ? "" : i + 1}) ${filename_noext} (${toHMS(cut.start)} - ${toHMS(cut.end)})${ext}`;
    const outpath = path.join(outdir, cutName);
    console.log(`${green}(${i + 1}/${cuts.length})${plain} ${inpath} ${green}->${plain}`);
    console.log(`${outpath}\n`);
    await renderCut(inpath, outpath, cut.start, duration);
    // await transferTimestamps(inpath, outpath);
    outpaths.push(outpath);
  }

  if (outpaths.length > 1 && options.multi_cut_mode === "merge") {
    const cutName = `(${outpaths.length} merged cuts) ${filename}`;
    const outpath = path.join(outdir, cutName);
    await mergeCuts(indir, outpaths, outpath);
    // await transferTimestamps(inpath, outpath);
  }

  console.log("Done.\n");
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
