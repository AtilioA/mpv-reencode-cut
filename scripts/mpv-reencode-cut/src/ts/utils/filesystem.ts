import * as fs from 'node:fs';
import * as path from 'node:path';
import { StreamData } from '../types';

export function ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function isSubdirectory(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function findMostRecentFile(directory: string, prefix: string): string | null {
    const files = fs.readdirSync(directory)
        .filter(file => file.startsWith(prefix) && !file.includes('.part'));

    if (files.length === 0) return null;

    let mostRecentFile = files[0];
    let mostRecentTime = 0;

    for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs > mostRecentTime) {
            mostRecentTime = stats.mtimeMs;
            mostRecentFile = file;
        }
    }

    return path.join(directory, mostRecentFile);
}

export function cleanupFiles(directory: string, baseFileName: string): void {
    const files = fs.readdirSync(directory)
        .filter(file => file.startsWith(baseFileName));

    for (const file of files) {
        const filePath = path.join(directory, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    // Remove directory if empty
    const remainingFiles = fs.readdirSync(directory);
    if (remainingFiles.length === 0) {
        fs.rmdirSync(directory);
    }
}

export function setFileTimestamps(inPath: string | null, outPath: string, useCurrentTime = false): void {
    try {
        if (useCurrentTime) {
            const now = Date.now() / 1000;
            fs.utimesSync(outPath, now, now);
        } else if (inPath && fs.existsSync(inPath)) {
            const { atime, mtime } = fs.statSync(inPath);
            fs.utimesSync(outPath, atime.getTime() / 1000, mtime.getTime() / 1000);
        }
    } catch (err) {
        console.error('Failed to set file timestamps:', err);
    }
}

interface TempFileInfo {
    path: string;
    size: number;
    mtime: number;
}

const MAX_TEMP_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
const MAX_TEMP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function rotateTempFiles(tempDir: string): void {
    if (!fs.existsSync(tempDir)) return;

    // Get all files with their sizes and modification times
    const files: TempFileInfo[] = fs.readdirSync(tempDir)
        .map(file => {
            const filePath = path.join(tempDir, file);
            try {
                const stats = fs.statSync(filePath);
                return {
                    path: filePath,
                    size: stats.size,
                    mtime: stats.mtimeMs
                };
            } catch (err) {
                console.error(`Error getting stats for ${filePath}:`, err);
                return null;
            }
        })
        .filter((file): file is TempFileInfo => file !== null);

    const now = Date.now();

    // First pass: Delete files older than 24 hours
    for (const file of files) {
        const age = now - file.mtime;
        if (age > MAX_TEMP_AGE_MS) {
            try {
                fs.unlinkSync(file.path);
                console.log(`Deleted old temp file ${path.basename(file.path)} (Age: ${Math.round(age / 3600000)}h)`);
            } catch (err) {
                console.error(`Error deleting ${file.path}:`, err);
            }
        }
    }

    // Second pass: Check total size and remove oldest files if over limit
    const remainingFiles = files.filter(file => fs.existsSync(file.path));
    const totalSize = remainingFiles.reduce((sum, file) => sum + file.size, 0);

    if (totalSize > MAX_TEMP_SIZE_BYTES) {
        // Sort by modification time (oldest first)
        remainingFiles.sort((a, b) => a.mtime - b.mtime);

        let currentSize = totalSize;
        for (const file of remainingFiles) {
            if (currentSize <= MAX_TEMP_SIZE_BYTES) break;

            try {
                fs.unlinkSync(file.path);
                currentSize -= file.size;
                console.log(`Deleted temp file due to space limit ${path.basename(file.path)} (Size: ${Math.round(file.size / 1024 / 1024)}MB)`);
            } catch (err) {
                console.error(`Error deleting ${file.path}:`, err);
            }
        }
    }
}
