export type MultiCutMode = 'separate' | 'merge';

export interface Options {
    output_dir: string;
    multi_cut_mode: MultiCutMode;
    encoder: string;
    bitrate: string;
    handbrake_path: string;
    audio_encoder: string;
    audio_bitrate: string;
    audio_only: boolean;
    stream_output_dir: string;
    stream_prefer_full_download: boolean;
}

export interface Cut {
    start: number;
    end: number;
}

export interface SourceInfo {
    path: string;
    filename: string;
    directory: string;
    is_stream: boolean;
    media_title?: string;
    direct_url?: string;
    duration?: number;
}

export interface RenderJob {
    id: string;
    created_at: string;
    source: SourceInfo;
    options: Options;
    cuts: Cut[];
}

export interface PreparedSource {
    path: string;
    cleanupPaths: string[];
}

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed';

export interface JobStatus {
    id: string;
    state: JobState;
    created_at: string;
    updated_at: string;
    source: SourceInfo;
    log_path: string;
    outputs: string[];
    pid?: number;
    current_cut?: number;
    total_cuts?: number;
    error?: string;
}
