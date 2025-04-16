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
