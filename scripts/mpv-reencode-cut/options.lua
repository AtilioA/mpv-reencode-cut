local options_module = {}

local mp = require "mp"
local msg = require "mp.msg"

-- Helper function to determine the config file path
-- Based on mpv's find_config_file function
local function get_config_file_path(identifier)
    identifier = identifier or mp.get_script_name() or "default"
    local filename = identifier .. ".conf"
    local preferred_path = "mpv/script-opts/" .. filename
    local found_path = mp.find_config_file(preferred_path)
    if found_path then
        return found_path
    end
    local legacy_path = "lua-settings/" .. filename
    found_path = mp.find_config_file(legacy_path)
    if found_path then
        msg.warn(legacy_path .. " is deprecated, use " .. preferred_path .. " instead.")
        return found_path
    end
    -- File doesn't exist yet: default to the preferred path
    return preferred_path
end

local identifier = "mpv-reencode-cut"
local config_path = get_config_file_path(identifier)

-- Shared options state
local options = {
    output_dir = ".",
    multi_cut_mode = "separate",
    encoder = "libx264",
    bitrate = "3k",
    audio_encoder = "libmp3lame",
    audio_bitrate = "192k",
    config_path = config_path,
    audio_only = false,
}

-- Returns a direct reference to the shared options table
function options_module.get_options()
    return options
end

-- Saves the current options to the configuration file
function options_module.save_options()
    local conf_path = get_config_file_path(identifier)
    if not conf_path then
        mp.osd_message("Could not determine config path")
        return
    end

    local f = io.open(conf_path, "w")
    if f then
        f:write("output_dir=" .. options.output_dir .. "\n")
        f:write("multi_cut_mode=" .. options.multi_cut_mode .. "\n")
        f:write("encoder=" .. options.encoder .. "\n")
        f:write("bitrate=" .. options.bitrate .. "\n")
        f:write("audio_encoder=" .. options.audio_encoder .. "\n")
        f:write("audio_bitrate=" .. options.audio_bitrate .. "\n")
        f:write("audio_only=" .. tostring(options.audio_only) .. "\n")
        f:close()
        msg.info("Options saved to " .. conf_path)
    else
        mp.osd_message("Failed to save options to " .. conf_path .. ".\nPlease check if you have write permissions.", 5)
    end
end

-- Updates the shared options state with new values
function options_module.init(opts)
    for k, v in pairs(opts) do
        options[k] = v
    end
end

return options_module
