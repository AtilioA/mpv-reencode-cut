# mpv-reencode-cut

`mpv-reencode-cut` is a modular, scripting video cutting tool for [mpv](https://mpv.io), designed for users who want interactive control over clip creation while re-encoding files—enabling more precise timing than traditional keyframe-based cutting.

✨ `mpv-reencode-cut` offers:

- **Multiple cuts per video**
- **Optional merging** of cut segments into a single output (when multiple cuts are defined)
- **Re-encoding**, enabling precise timing and customizable compression
- **Audio-only mode** for creating audio clips without video
- A built-in, in-player **OSD menu** (via `Ctrl + e`) to change settings on the fly such as:
  - Video/audio codec
  - Bitrate
  - Multi-cut output mode

Perfect for sharing clips, creating highlights, or trimming videos quickly where loss of quality isn't a concern or is even necessary due to size constraints.

---

## ✂️ Features

- Easily set **start** and **end** times for multiple cuts with `g` and `h` keys.
- Allows real-time adjustment of:
  - **Video/audio encoder** (auto-detected from `ffmpeg`)
  - **Bitrate** (selectable presets)
  - **Multi-cut mode** (`separate` or `merge`)
  - **Audio-only mode** for extracting audio without video
- Saves your preferences for future sessions.
- User-friendly **OSD configuration menu** built into mpv.

---

## 📦 Installation

1. **Download the latest version** of `mpv-reencode-cut` from the [Releases](https://github.com/AtilioA/mpv-reencode-cut/releases/latest) section.
2. Extract the contents to your mpv config directory, such as:

```bash
# On Linux
~/.config/mpv/

# On Windows
%APPDATA%\mpv\

# or for portable builds:
mpv/portable_config/
```

3. Ensure [`node`](https://nodejs.org/) and [`ffmpeg`](https://www.ffmpeg.org/download.html) are available in your system `PATH`.

---

## 🎬 Usage

Open a video in mpv and use the following keybindings:

| Key        | Action                    |
|------------|---------------------------|
| `g`        | Set cut start at current time |
| `h`        | Set cut end at current time   |
| `G`        | Set cut start at beginning    |
| `H`        | Set cut end at end            |
| `r`        | Render cuts |
| `Ctrl + g` | Toggle cut mode (merge/separate) |
| `Ctrl + h` | Clear all cuts                |
| `Ctrl + e` | Open configuration menu       |

Rendered files are saved to the `output_dir` (default is the same as the input file's directory). Output filenames include cut indices and timestamps.

---

## ⚙️ Configuration

You can access the configuration menu directly in mpv by pressing (case-sensitive):

```
Ctrl + e
```

Use arrow keys to change settings:

- `↑ / ↓`: navigate between options including encoder, bitrate, audio-only mode, and multi-cut mode
- `← / →`: change the current option's value
- `Enter / Esc`: save and exit

Encoders are dynamically listed based on your ffmpeg build output. Audio and video encoders default to `libmp3lame` and `libx264` respectively.

When in audio-only mode, the menu options will change to reflect audio-specific settings. Output files will be saved with .mp3 extension in this mode.

All changes are persisted to your `script-opts` config (`mpv-reencode-cut.conf`) file.

---

## 🛠 Dependencies

- [mpv](https://mpv.io)
- [Node.js](https://nodejs.org)
- [ffmpeg](https://ffmpeg.org)

Make sure both `ffmpeg` and `node` are available in your command-line environment/'PATH'.

## 👥 Contributing

Pull requests and feature suggestions are welcome. Feel free to open an issue or fork the project to extend it.

---

## 📜 License

GPLv3 License. See [LICENSE](./LICENSE) for details.

These scripts are developed based on the foundation provided by <https://github.com/f0e/mpv-lossless-cut> and utilize the mpv scripting API. I extend my gratitude to the mpv community for their contributions.
