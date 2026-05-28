local mp = require "mp"
local msg = require "mp.msg"
local utils = require "mp.utils"

local function dirname(path)
    return path and (path:match("^(.*)[/\\][^/\\]+$") or ".") or "."
end

local function current_script_dir()
    local script_dir = mp.get_script_directory()
    if script_dir and script_dir ~= "" then return script_dir end

    local source = debug.getinfo(1, "S").source
    if source and source:sub(1, 1) == "@" then
        return dirname(source:sub(2))
    end

    return "."
end

local SCRIPT_DIR = current_script_dir()
package.path = table.concat({
    utils.join_path(SCRIPT_DIR, "?.lua"),
    utils.join_path(utils.join_path(SCRIPT_DIR, "?"), "init.lua"),
    package.path,
}, ";")

local menu = require "menu"
local options_module = require "options"

local DISPATCH_SCRIPT_PATH = utils.join_path(utils.join_path(SCRIPT_DIR, "dist"), "dispatch.js")

options_module.init()
menu.init()

local options = options_module.get_options()
local cuts = {}
local cut_index = 1
local active_jobs = {}
local job_poll_timer = nil

local function log(text)
    msg.info(text)
    mp.osd_message(text)
end

local function cut_key()
    return tostring(cut_index)
end

local function sorted_complete_cuts()
    local result = {}
    for _, cut in pairs(cuts) do
        if cut.start and cut["end"] and cut["end"] > cut.start then
            table.insert(result, { start = cut.start, ["end"] = cut["end"] })
        end
    end
    table.sort(result, function(a, b) return a.start < b.start end)
    return result
end

local function update_chapters()
    local chapters = {}
    local chapter_index = 1

    for i, cut in ipairs(sorted_complete_cuts()) do
        chapters[chapter_index] = { title = string.format("Cut %d Start", i), time = cut.start }
        chapter_index = chapter_index + 1
        chapters[chapter_index] = { title = string.format("Cut %d End", i), time = cut["end"] }
        chapter_index = chapter_index + 1
    end

    local active = cuts[cut_key()]
    if active and active.start and not active["end"] then
        chapters[chapter_index] = { title = string.format("Cut %d Start", cut_index), time = active.start }
    end

    mp.set_property_native("chapter-list", chapters)
end

local function cut_toggle_mode()
    options.multi_cut_mode = options.multi_cut_mode == "separate" and "merge" or "separate"
    options_module.save_options()
    log(string.format("Cut mode set to %s", options.multi_cut_mode))
end

local function cut_set_start(start_time)
    if not start_time then
        log("No playback position available")
        return
    end

    if cuts[cut_key()] and cuts[cut_key()]["end"] then
        cut_index = cut_index + 1
    end

    cuts[cut_key()] = { start = start_time }
    log(string.format("[cut %d] Start: %.2fs", cut_index, start_time))
    update_chapters()
end

local function cut_set_end(end_time)
    if not end_time then
        log("No playback position available")
        return
    end

    local cut = cuts[cut_key()]
    if not cut or not cut.start then
        log("Set a start point first")
        return
    end

    if end_time <= cut.start then
        log("End point must be after start point")
        return
    end

    cut["end"] = end_time
    log(string.format("[cut %d] End: %.2fs", cut_index, end_time))
    update_chapters()
end

local function cut_clear()
    cuts = {}
    cut_index = 1
    mp.set_property_native("chapter-list", {})
    log("Cuts cleared")
end

local function is_stream_path(path)
    return path and (path:match("^https?://") or path:match("^ytdl://"))
end

local function sanitize_filename(value)
    return (value or "stream"):gsub("[\\/:*?\"<>|]", "_"):gsub("^%s+", ""):gsub("%s+$", "")
end

local function script_state_dir()
    local base = os.getenv("LOCALAPPDATA") or os.getenv("XDG_STATE_HOME") or os.getenv("TMP") or os.getenv("TEMP") or os.getenv("HOME") or "."
    local dir = utils.join_path(base, "mpv-reencode-cut")
    return dir
end

local function ensure_dir(path)
    local result = utils.subprocess({ args = { "node", "-e", "require('fs').mkdirSync(process.argv[1],{recursive:true})", path } })
    return result.status == 0
end

local function write_file(path, content)
    local file = io.open(path, "w")
    if not file then return false end
    file:write(content)
    file:close()
    return true
end

local function read_file(path)
    local file = io.open(path, "r")
    if not file then return nil end
    local content = file:read("*a")
    file:close()
    return content
end

local function status_path_for_job(job_path)
    return (job_path:gsub("%.json$", ".status.json"))
end

local function snapshot_options()
    return {
        output_dir = options.output_dir,
        multi_cut_mode = options.multi_cut_mode,
        encoder = options.encoder,
        bitrate = options.bitrate,
        handbrake_path = options.handbrake_path,
        audio_encoder = options.audio_encoder,
        audio_bitrate = options.audio_bitrate,
        audio_only = options.audio_only,
        stream_output_dir = options.stream_output_dir,
        stream_prefer_full_download = options.stream_prefer_full_download,
    }
end

local function snapshot_source()
    local path_value = mp.get_property("path")
    local stream = is_stream_path(path_value)
    local directory = "."
    local filename = mp.get_property("filename", "stream")

    if stream then
        directory = os.getenv("USERPROFILE") or os.getenv("HOME") or "."
        local title = mp.get_property("media-title", "")
        if title ~= "" then
            filename = sanitize_filename(title) .. ".mp4"
        end
    else
        directory, filename = utils.split_path(path_value)
    end

    return {
        path = path_value,
        filename = filename,
        directory = directory,
        is_stream = stream,
        media_title = mp.get_property("media-title", ""),
        direct_url = mp.get_property("stream-path", path_value),
        duration = mp.get_property_number("duration", 0),
    }
end

local function create_job()
    local complete_cuts = sorted_complete_cuts()
    if #complete_cuts == 0 then
        return nil, "No complete cuts to render"
    end

    local source = snapshot_source()
    if not source.path or source.path == "" then
        return nil, "No input file loaded"
    end

    local id = tostring(os.time()) .. "-" .. tostring(math.random(100000, 999999))
    return {
        id = id,
        created_at = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        source = source,
        options = snapshot_options(),
        cuts = complete_cuts,
    }, nil
end

local function describe_outputs(status)
    if type(status.outputs) ~= "table" or #status.outputs == 0 then
        return "no output paths reported"
    end

    if #status.outputs == 1 then
        local _, filename = utils.split_path(status.outputs[1])
        return filename or status.outputs[1]
    end

    return tostring(#status.outputs) .. " output files"
end

local function poll_jobs()
    if next(active_jobs) == nil then return end

    for id, job in pairs(active_jobs) do
        local raw = read_file(job.status_path)
        if raw then
            local ok, status = pcall(utils.parse_json, raw)
            if ok and type(status) == "table" then
                if status.state ~= job.last_state then
                    job.last_state = status.state
                    if status.state == "running" then
                        msg.info("Background cut running: " .. id)
                    end
                end

                if status.state == "succeeded" then
                    log("Background cut finished: " .. describe_outputs(status))
                    active_jobs[id] = nil
                elseif status.state == "failed" then
                    log("Background cut failed: " .. (status.error or id))
                    active_jobs[id] = nil
                end
            end
        end
    end
end

local function cut_render()
    local job, err = create_job()
    if not job then
        log(err)
        return
    end

    if not ensure_dir(script_state_dir()) then
        log("Could not create background job directory")
        return
    end

    local job_path = utils.join_path(script_state_dir(), job.id .. ".json")
    if not write_file(job_path, utils.format_json(job)) then
        log("Could not write background job file")
        return
    end

    local result = utils.subprocess({
        args = { "node", DISPATCH_SCRIPT_PATH, job_path },
        capture_stdout = true,
        capture_stderr = true,
    })

    if result.status == 0 then
        active_jobs[job.id] = {
            status_path = status_path_for_job(job_path),
            last_state = "queued",
        }
        log("Started background cut job: " .. job.id)
        msg.info(result.stdout or "")
    else
        msg.error(result.stderr or result.stdout or "unknown dispatcher error")
        log("Failed to start background cut job")
    end
end

mp.add_key_binding("g", "cut_set_start", function() cut_set_start(mp.get_property_number("time-pos")) end)
mp.add_key_binding("h", "cut_set_end", function() cut_set_end(mp.get_property_number("time-pos")) end)
mp.add_key_binding("G", "cut_set_start_sof", function() cut_set_start(0) end)
mp.add_key_binding("H", "cut_set_end_eof", function() cut_set_end(mp.get_property_number("duration")) end)
mp.add_key_binding("ctrl+g", "cut_toggle_mode", cut_toggle_mode)
mp.add_key_binding("ctrl+h", "cut_clear", cut_clear)
mp.add_key_binding("r", "cut_render", cut_render)
mp.add_key_binding("ctrl+e", "open_menu", menu.open)

mp.register_event("start-file", function()
    cuts = {}
    cut_index = 1
    mp.set_property_native("chapter-list", {})
end)

job_poll_timer = mp.add_periodic_timer(2, poll_jobs)

mp.msg.info("mpv-reencode-cut loaded")
