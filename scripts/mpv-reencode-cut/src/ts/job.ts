import * as fs from 'node:fs';
import { Cut, RenderJob } from './types';

export async function readJob(filePath: string): Promise<RenderJob> {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(stripJsonBom(raw)) as RenderJob;
}

export function stripJsonBom(raw: string): string {
    return raw.replace(/^\uFEFF/, '').replace(/^\u00ef\u00bb\u00bf/, '');
}

export function normalizeCuts(cuts: Cut[]): Cut[] {
    const normalized = cuts
        .map(cut => ({ start: Number(cut.start), end: Number(cut.end) }))
        .filter(cut => Number.isFinite(cut.start) && Number.isFinite(cut.end) && cut.end > cut.start)
        .sort((a, b) => a.start - b.start);

    if (normalized.length === 0) {
        throw new Error('No valid cuts were provided.');
    }

    return normalized;
}
