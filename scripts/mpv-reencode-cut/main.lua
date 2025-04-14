local mp = require "mp"
mp.msg = require "mp.msg"
mp.utils = require "mp.utils"
mp.options = require "mp.options"
local menu = require "menu"
local options_module = require "options"

MAKE_CUTS_SCRIPT_PATH = mp.utils.join_path(mp.get_script_directory(), "make_cuts")

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
    if cuts[cut_key()] ~= nil and cuts[cut_key()]["end"] then
        cut_index = cut_index + 1
    end

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

local function cut_render()
    if cuts[cut_key()] == nil or cuts[cut_key()]["end"] == nil then
        log("No cuts to render")
        return
    end

    local cuts_json = mp.utils.format_json(cuts)
    local options_json = mp.utils.format_json(options)
    local inpath = mp.get_property("path")
    local filename = mp.get_property("filename")
    local indir = mp.utils.split_path(inpath)

    log("Rendering cuts...")
    print("Rendering cut with options:", options_json)

    local args = { "node", MAKE_CUTS_SCRIPT_PATH, indir, options_json, filename, cuts_json }

    mp.command_native_async({
        name = "subprocess",
        playback_only = false,
        args = args,
    }, function(result)
        if result == true then
            log("Successfully rendered cut for " .. filename)
        else
            log("Failed to render cuts. Verify your Node.js and FFmpeg installations.")
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
