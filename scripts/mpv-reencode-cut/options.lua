local options_module = {}

local mp = require "mp"
local msg = require "mp.msg"

-- Helper function to determine the config file path
-- Based on mpv's find_config_file function
local function get_config_file_path(identifier)
    identifier = identifier or mp.get_script_name() or "default"
    local filename = identifier .. ".conf"
    -- On Windows, should be something like C:\Users\AAD\AppData\Roaming\mpv\script-opts
    local preferred_path = mp.get_config_dir() .. "/script-opts/" .. filename
    msg.info("Preferred path: " .. preferred_path)
    local found_path = mp.find_config_file(preferred_path)
    if found_path then
        return found_path
    end
    -- On Linux, should be something like /home/username/.config/mpv/script-opts
    local legacy_path = mp.get_config_dir() .. "/lua-settings/" .. filename
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

-- Define option types and their conversion/validation rules
local option_types = {
    output_dir = { type = "string" },
    multi_cut_mode = { type = "string", valid_values = { "separate", "merge" } },
    encoder = { type = "string" },
    bitrate = { type = "string" },
    audio_encoder = { type = "string" },
    audio_bitrate = { type = "string" },
    -- For boolean values, we use string representation to avoid MPV's type conversion problems
    audio_only = {
        type = "boolean",
        mpv_type = "string", -- Tell MPV to read this as a string
        to_string = function(val) return val and "1" or "0" end,
        from_string = function(val)
            if type(val) == "boolean" then
                return val
            end
            return val == "yes" or val == "true" or val == "1"
        end
    },
    -- Streaming options
    stream_output_dir = { type = "string" },
    stream_prefer_full_download = {
        type = "boolean",
        mpv_type = "string",
        to_string = function(val) return val and "1" or "0" end,
        from_string = function(val)
            if type(val) == "boolean" then
                return val
            end
            return val == "yes" or val == "true" or val == "1"
        end
    },
}

-- Default options
local options = {
    output_dir = ".",
    multi_cut_mode = "separate",
    encoder = "libx264",
    bitrate = "3M",
    audio_encoder = "libmp3lame",
    audio_bitrate = "192k",
    config_path = config_path,
    audio_only = false,
    -- Streaming defaults
    stream_output_dir = "stream_cuts",
    stream_prefer_full_download = false,
}

-- Validate option against its type definition
local function validate_option(key, value)
    local type_def = option_types[key]
    if not type_def then
        return value -- No type definition, return as is
    end

    -- Check for valid values if defined
    if type_def.valid_values then
        local valid = false
        for _, valid_value in ipairs(type_def.valid_values) do
            if value == valid_value then
                valid = true
                break
            end
        end
        if not valid then
            msg.warn("Invalid value '" .. tostring(value) .. "' for option '" .. key .. "'. Using default.")
            return options[key] -- Use default instead
        end
    end

    return value
end

-- Convert value from string to proper type
local function convert_from_string(key, value)
    local type_def = option_types[key]
    if not type_def or type(value) ~= "string" then
        return value
    end

    if type_def.type == "boolean" and type_def.from_string then
        return type_def.from_string(value)
    elseif type_def.type == "number" then
        return tonumber(value)
    end

    return value
end

-- Convert value to string for saving
local function convert_to_string(key, value)
    local type_def = option_types[key]
    if not type_def then
        return tostring(value)
    end

    if type_def.type == "boolean" and type_def.to_string then
        return type_def.to_string(value)
    end

    return tostring(value)
end

-- Create a options table for MPV's option reader with appropriate types
local function create_mpv_options_table()
    local mpv_opts = {}

    for key, default_value in pairs(options) do
        -- Skip internal options
        if key ~= "config_path" then
            local type_def = option_types[key]
            if type_def and type_def.mpv_type == "string" then
                -- Use string representation for booleans to avoid MPV's conversion issues
                if type_def.type == "boolean" then
                    mpv_opts[key] = type_def.to_string(default_value)
                else
                    mpv_opts[key] = tostring(default_value)
                end
            else
                mpv_opts[key] = default_value
            end
        end
    end

    return mpv_opts
end

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
        for key, value in pairs(options) do
            -- Skip internal options
            if key ~= "config_path" then
                local str_value = convert_to_string(key, value)
                f:write(key .. "=" .. str_value .. "\n")
            end
        end
        f:close()
        msg.info("Options saved to " .. conf_path)
    else
        mp.osd_message("Failed to save options to " .. conf_path .. ".\nPlease check if you have write permissions.", 5)
    end
end

-- Initialize and read options
function options_module.init()
    -- Check if config file exists, create it with defaults if it doesn't
    local conf_path = get_config_file_path(identifier)
    local f = io.open(conf_path, "r")
    local config_exists = f ~= nil
    if f then
        f:close()
    end

    -- Create MPV-compatible options table
    local mpv_opts = create_mpv_options_table()

    -- Read options from file into our MPV-compatible structure
    mp.options.read_options(mpv_opts, identifier)

    -- Process the read options
    for k, v in pairs(mpv_opts) do
        -- Convert strings to appropriate types
        local converted_value = convert_from_string(k, v)
        -- Validate the converted value
        local validated_value = validate_option(k, converted_value)
        -- Update the actual options table
        options[k] = validated_value
    end

    -- If config file didn't exist, save defaults
    if not config_exists then
        msg.info("Creating default configuration file at " .. conf_path)
        options_module.save_options()
    end

    -- Log initialized options
    msg.debug("Options initialized: " .. mp.utils.format_json(options))
end

return options_module
