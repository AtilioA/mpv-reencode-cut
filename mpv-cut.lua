--[[
Simple MPV Cut Script
-------------------
G - Set start time
H - Set end time
R - Render cut with HandBrakeCLI
--]]

local mp = require 'mp'
local utils = require 'mp.utils'
local msg = require 'mp.msg'

local cut_start = nil
local cut_end = nil
local script_name = mp.get_script_name()

-- Function to run HandBrakeCLI
local function run_handbrake()
    if not cut_start or not cut_end then
        mp.osd_message("Error: Set both start and end times first")
        return
    end

    local path = mp.get_property("path")
    if not path then
        mp.osd_message("Error: No file loaded")
        return
    end

    -- Create output filename
    local dir, filename = utils.split_path(utils.join_path(utils.getcwd(), path))
    local name, ext = filename:match("(.+)(%..+)")
    if not name then name = filename end

    local output = utils.join_path(dir, name .. "_cut" .. (ext or ".mp4"))

    -- Ensure we don't overwrite existing files
    local counter = 1
    while utils.file_info(output) do
        output = utils.join_path(dir, string.format("%s_cut_%d%s", name, counter, ext or ".mp4"))
        counter = counter + 1
    end

    -- Build HandBrake command
    local cmd = {
        "HandBrakeCLI",
        "--input", path,
        "--output", output,
        "--start-at", string.format("duration:%f", cut_start),
        "--stop-at", string.format("duration:%f", cut_end - cut_start),
        "--encoder", "x264",
        "--quality", "20",
        "--rate", "30",
        "--pfr",
        "--audio-lang-list", "eng",
        "--all-audio",
        "--aencoder", "av_aac",
        "--ab", "160",
        "--mixdown", "stereo"
    }

    mp.osd_message("Rendering cut...")

    -- Run HandBrake in the background
    local result = utils.subprocess({
        args = cmd,
        cancellable = false,
    })

    if result.status == 0 then
        mp.osd_message(string.format("Cut saved to: %s", output))
    else
        mp.osd_message(string.format("Error: %s", result.error or "Unknown error"))
    end
end

-- Key bindings
mp.add_key_binding("g", "cut_start", function()
    cut_start = mp.get_property_number("time-pos")
    mp.osd_message(string.format("Start: %.2f", cut_start))
end)

mp.add_key_binding("h", "cut_end", function()
    cut_end = mp.get_property_number("time-pos")
    mp.osd_message(string.format("End: %.2f", cut_end))

    if cut_start and cut_end and cut_end <= cut_start then
        mp.osd_message("Warning: End time must be after start time")
        cut_end = nil
    end
end)

mp.add_key_binding("r", "render_cut", function()
    if not cut_start or not cut_end then
        mp.osd_message("Error: Set both start and end times first")
        return
    end

    mp.osd_message("Starting cut")

    -- Run in a separate thread to avoid blocking
    mp.command_native_async({
        name = "subprocess",
        args = {
            "HandBrakeCLI",
            "--input", mp.get_property("path"),
            "--output", "output.mp4",
            "--start-at", string.format("duration:%f", cut_start),
            "--stop-at", string.format("duration:%f", cut_end - cut_start),
            "--encoder", "x264",
            "--quality", "20",
            "--rate", "30",
            "--pfr",
            "--audio-lang-list", "eng",
            "--all-audio",
            "--aencoder", "av_aac",
            "--ab", "160",
            "--mixdown", "stereo"
        },
        capture_stdout = true,
        capture_stderr = true,
    }, function(success, result, error)
        if success then
            mp.osd_message("Cut rendered successfully!")
        else
            mp.osd_message(string.format("Error: %s", error or "Unknown error"))
        end
    end)
end)

-- Show help on script load
mp.osd_message("MPV Cut Script Loaded\nG - Set start time\nH - Set end time\nR - Render cut")
