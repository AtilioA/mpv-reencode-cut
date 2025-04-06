# mpv-reencode-cut

`mpv-reencode-cut` is a modular, scriptable video cutting tool for [mpv](https://mpv.io), designed for users who want both interactive control for creating clips from cuts while re-encoding files, which allows for more precise timing compared to keyframe-based cutting.


✨ `mpv-reencode-cut` offers:

- **Multiple cuts per video**
- **Optional merging** of cut segments into a single output
- **Re-encoding**, enabling precise timing and customizable compression
- A built-in, in-player **OSD menu** (via `Ctrl + e`) to change settings such as:
  - Video codec
  - Bitrate
  - Multi-cut output mode

Perfect for sharing clips, creating highlights, or trimming videos quickly where loss of quality isn't a concern or is even necessary due to size constraints.

---

## ✂️ Features

- Set **start** and **end** times for multiple cuts with simple hotkeys.
- Supports both **separate** file output or **merged** cuts.
- Automatically launches an external **Node.js + ffmpeg** cut renderer.
- Allows real-time adjustment of:
  - **Video encoder** (auto-detected from `ffmpeg`)
  - **Bitrate** (selectable presets)
  - **Multi-cut mode** (`separate` or `merge`)
- Saves your preferences for future sessions.
- User-friendly **OSD configuration menu** built into mpv.

---

## 📦 Installation

1. **Download the latest version** of `mpv-reencode-cut` from the [Releases](https://github.com/yourusername/mpv-reencode-cut/releases) section.
2. Extract the contents to your mpv scripts directory, such as:

```
# On Linux
~/.config/mpv/scripts/mpv-reencode-cut/

# On Windows
%APPDATA%\mpv\scripts\mpv-reencode-cut\

# or for portable builds:
mpv/portable_config/scripts/mpv-reencode-cut/
```

3. Ensure [`node`](https://nodejs.org/) and [`ffmpeg`](https://www.ffmpeg.org/download.html) are available in your system `PATH`.

---

## ⚙️ Configuration

You can access the configuration menu directly in mpv by pressing (case-sensitive):

```
Ctrl + e
```

Use arrow keys to change settings:

- `↑ / ↓`: navigate between encoder, bitrate, and multi-cut mode options
- `← / →`: change the current option's value
- `Enter / Esc`: save and exit

All changes are persisted to your `script-opts` config (`mpv-reencode-cut.conf`) file.

---

## 🎬 Usage

Open a video in mpv and use the following keybindings:

| Key        | Action                    |
|------------|---------------------------|
| `g`        | Set cut start at current time |
| `h`        | Set cut end at current time   |
| `G`        | Set cut start at beginning    |
| `H`        | Set cut end at end            |
| `r`        | Render cuts (launches Node.js + ffmpeg) |
| `Ctrl + g` | Toggle cut mode (merge/separate) |
| `Ctrl + h` | Clear all cuts                |
| `Ctrl + e` | Open configuration menu       |

---

## 📁 Output

Rendered files are saved to the `output_dir` (default is the same as the input file’s directory). Output filenames include cut indices and timestamps.

---

## 🛠 Dependencies

- [mpv](https://mpv.io)
- [Node.js](https://nodejs.org)
- [ffmpeg](https://ffmpeg.org)

Make sure both `ffmpeg` and `node` are available in your command-line environment/'PATH'.

---

## 💡 Advanced tips

- Press `Ctrl+g` to quickly switch between `merge` and `separate` cut modes.
- Encoders are dynamically listed based on your ffmpeg build output, and default to `libx264`.

---

## 👥 Contributing

Pull requests and feature suggestions are welcome. Feel free to open an issue or fork the project to extend it.

---

## 📜 License

GPLv3 License. See [LICENSE](./LICENSE) for details.

These scripts are developed based on the foundation provided by <https://github.com/f0e/mpv-lossless-cut> and utilize the mpv scripting API. I extend my gratitude to the mpv community for their contributions.
