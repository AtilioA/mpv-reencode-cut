local mp = require "mp"
mp.msg = require "mp.msg"
mp.utils = require "mp.utils"
mp.options = require "mp.options"
local menu = require "menu"
local options_module = require "options"

-- Script paths
local SCRIPT_DIR = mp.get_script_directory()
DIST_PATH = mp.utils.join_path(SCRIPT_DIR, "dist")
MAKE_CUTS_SCRIPT_PATH = mp.utils.join_path(DIST_PATH, "make_cuts.js")

-- Initialize options directly from the module
options_module.init()
menu.init()

-- Get reference to shared options
local options = options_module.get_options()

local cuts = {}
local cut_index = 0

local function log(...)
    mp.msg.info(...)
    mp.osd_message(...)
end

local function cut_toggle_mode()
    if options["multi_cut_mode"] == "separate" then
        options["multi_cut_mode"] = "merge"
    else
        options["multi_cut_mode"] = "separate"
    end
    options_module.save_options()
    log(string.format('Cut mode set to "%s"', options["multi_cut_mode"]))
end

local function cut_key()
    return tostring(cut_index)
end

local function cut_set_start(start_time)
    -- Check if we need to move to the next cut
    if cuts[cut_key()] ~= nil and cuts[cut_key()]["end"] then
        cut_index = cut_index + 1
    end

    -- Initialize the cut if it doesn't exist
    if cuts[cut_key()] == nil then
        cuts[cut_key()] = {}
    end

    cuts[cut_key()]["start"] = start_time
    log(string.format("[cut %d] Set start time: %.2fs", cut_index + 1, start_time))
end

local function cut_set_end(end_time)
    if cuts[cut_key()] == nil then
        log("No start point found")
        return
    end

    cuts[cut_key()]["end"] = end_time
    log(string.format("[cut %d] Set end time: %.2fs", cut_index + 1, end_time))
end

local function cut_clear()
    if next(cuts) then
        cuts = {}
        cut_index = 0
        log("Cuts cleared")
    else
        log("No cuts to clear")
    end
end

-- Check if the current media is a stream rather than a local file
local function is_stream()
    local path = mp.get_property("path")
    -- Check if it's an HTTP/HTTPS URL or something loaded through ytdl
    return path and (path:match("^https?://") or path:match("^ytdl://"))
end

-- Get streaming info from mpv
local function get_stream_info()
    local stream_info = {}
    stream_info.path = mp.get_property("path")
    stream_info.media_title = mp.get_property("media-title", "")
    stream_info.ytdl_format = mp.get_property("ytdl-format", "")
    stream_info.file_format = mp.get_property("file-format", "")
    stream_info.duration = mp.get_property_number("duration", 0)

    -- Try to get the direct media URL if available
    stream_info.direct_url = mp.get_property("stream-path", stream_info.path)

    return stream_info
end

-- Sanitize string for use as filename
local function sanitize_filename(str)
    -- Replace invalid filename characters with underscores
    local sanitized = str:gsub("[\\/*:?\"<>|]", "_")
    return sanitized
end

local function cut_render()
    if cuts[cut_key()] == nil or cuts[cut_key()]["end"] == nil then
        log("No cuts to render")
        return
    end

    local cuts_json = mp.utils.format_json(cuts)
    local options_json = mp.utils.format_json(options)
    local inpath = mp.get_property("path")
    local filename = mp.get_property("filename")
    local indir
    local is_streaming = is_stream()
    local stream_info = {}
    local original_output_dir = nil

    if is_streaming then
        -- Handle streaming content
        log("Processing streaming content...")
        stream_info = get_stream_info()

        -- Use the media title as the filename if available
        if stream_info.media_title and stream_info.media_title ~= "" then
            filename = sanitize_filename(stream_info.media_title) .. ".mp4"
        end

        -- Get the user's home directory for output (or use temp)
        local home = os.getenv("HOME") or os.getenv("USERPROFILE") or os.getenv("TEMP")
        indir = home

        -- Remember original output_dir
        original_output_dir = options["output_dir"]

        -- Use stream-specific output directory if set
        if options["stream_output_dir"] and options["stream_output_dir"] ~= "" then
            options["output_dir"] = options["stream_output_dir"]
            log("Using stream output directory: " .. options["stream_output_dir"])
        end

        -- Update options_json with the modified options
        options_json = mp.utils.format_json(options)
    else
        -- Regular local file
        indir = mp.utils.split_path(inpath)
    end

    log("Rendering cuts...")
    mp.msg.info("Rendering with options: " .. options_json)

    -- Add stream info to the arguments if streaming
    local args = { "node", MAKE_CUTS_SCRIPT_PATH, indir, options_json, filename, cuts_json }

    if is_streaming then
        local stream_info_json = mp.utils.format_json(stream_info)
        table.insert(args, stream_info_json)
        log("Stream detected - using direct streaming mode")
    end

    mp.command_native_async({
        name = "subprocess",
        playback_only = false,
        args = args,
    }, function(result)
        -- Restore original output_dir if it was changed for streaming
        if is_streaming and original_output_dir then
            options["output_dir"] = original_output_dir
        end

        if result == true then
            log("Successfully rendered cut for " .. filename)
            mp.msg.info("Cut render complete")

            -- Increment the cut_index to allow for new cuts without clearing previous ones
            -- but only if the current cut has both start and end points
            if cuts[cut_key()] and cuts[cut_key()]["start"] and cuts[cut_key()]["end"] then
                cut_index = cut_index + 1
                mp.msg.info("Incremented cut index to " .. cut_index)
            end
        else
            log("Failed to render cuts. Verify your Node.js and FFmpeg installations.")
            mp.msg.error("Cut render failed: " .. tostring(result))
        end
    end)
end

-- Register keybindings
mp.add_key_binding("g", "cut_set_start", function()
    cut_set_start(mp.get_property_number("time-pos"))
end)

mp.add_key_binding("h", "cut_set_end", function()
    cut_set_end(mp.get_property_number("time-pos"))
end)

mp.add_key_binding("G", "cut_set_start_sof", function()
    cut_set_start(0)
end)

mp.add_key_binding("H", "cut_set_end_eof", function()
    cut_set_end(mp.get_property("duration"))
end)

mp.add_key_binding("ctrl+g", "cut_toggle_mode", cut_toggle_mode)
mp.add_key_binding("ctrl+h", "cut_clear", cut_clear)
mp.add_key_binding("r", "cut_render", cut_render)
mp.add_key_binding("ctrl+e", "open_menu", menu.open)

mp.register_event("end-file", cut_clear)

mp.msg.info("mpv-reencode-cut loaded")
