export interface StreamInfo {
    url: string;
    isDirectUrl: boolean;
    title?: string;
    format?: string;
    quality?: string;
    path: string;
    direct_url?: string;
    media_title?: string;
    ytdl_format?: string;
    file_format?: string;
    duration: number;
}

export interface Cut {
    start: number;
    end: number;
    duration?: number;
}

export interface Options {
    output_dir: string;
    audio_only: boolean;
    multi_cut_mode: 'merge' | 'separate';
    video_codec?: string;
    audio_codec?: string;
    video_bitrate?: string;
    audio_bitrate?: string;
    video_filters?: string[];
    audio_filters?: string[];
    extra_args?: string[];
    stream_prefer_full_download?: boolean;
    stream_keep_downloads?: boolean;
    audio_encoder?: string;
    encoder?: string;
    bitrate?: string;
    // Telegram preset specific options
    video_preset?: string;
    video_framerate?: string;
    video_crf?: string;
    video_resolution?: string;
    video_aspect_ratio?: string;
}

export interface StreamData {
    path: string;
    isLocalFile: boolean;
    tempDir?: string;
    needsCleanup?: boolean;
}

export interface FFmpegArgs {
    input: string[];
    output: string[];
}
