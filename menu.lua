local menu = {}

local mp = require "mp"
mp.msg = require "mp.msg"
mp.opts = require "mp.options"
mp.utils = require "mp.utils"
local options_module = require "options"

local options = options_module.get_options()

-- Helper functions
local function table_contains(tbl, val)
    for _, v in ipairs(tbl) do
        if v == val then return true end
    end
    return false
end

-- Platform detection and path handling
local function is_windows()
    return package.config:sub(1, 1) == '\\'
end

if is_windows() then
    mp.msg.info("Windows users: config file should be at %APPDATA%/mpv/script-opts/mpv-lossless-cut.conf")
else
    mp.msg.info("Linux users: config file should be at ~/.config/mpv/script-opts/mpv-lossless-cut.conf")
end

-----------------------------
-- OSD Menu Implementation --
-----------------------------

local osd_overlay = mp.create_osd_overlay("ass-events")
osd_overlay.hidden = true

local menu_visible = false
local menu_selected_index = 1
local menu_items = {} -- each item: { name, value, choices }

-- Build menu items (encoder, bitrate, multi-cut mode)
local function build_menu_items()
    menu_items = {}

    -- Get available video encoders from ffmpeg output
    local function get_available_encoders()
        local encoders = {}
        local res = mp.utils.subprocess({ args = { "ffmpeg", "-encoders" }, capture_stdout = true, capture_stderr = true })
        if res.status ~= 0 and res.killed_by_us == false then
            mp.msg.warn("Could not run ffmpeg -encoders; using default encoder.")
            mp.osd_message("Could not run ffmpeg -encoders; using default encoders.\nPlease check your ffmpeg installation.", 5)
            -- Fallback to default encoders
            return { "libx264", "libx265" }
        end
        for line in res.stdout:gmatch("[^\r\n]+") do
            -- Look for lines beginning with a space and a 'V' flag (video encoder)
            -- Example line: " V..... libx264             H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10"
            if line:match("^%s*V") then
                local enc = line:match("V[%p%w]*%s+(%S+)")
                if enc and not table_contains(encoders, enc) then
                    table.insert(encoders, enc)
                end
            end
        end
        if #encoders == 0 then
            encoders = { "libx264", "libx265" }
        end
        table.sort(encoders)
        return encoders
    end

    local available_encoders = get_available_encoders()

    table.insert(menu_items, { name = "Encoder", value = options.encoder, choices = available_encoders })
    table.insert(menu_items,
        { name = "Bitrate", value = options.bitrate, choices = { "500k", "1M", "2M", "3M", "5M", "10M" } })
    table.insert(menu_items,
        { name = "Multi-cut handling", value = options.multi_cut_mode, choices = { "separate", "merge" } })
end

local function draw_menu()
    local text = "{\\an7}" -- top left alignment
    text = text .. "Cut settings:\n"
    text = text .. "Navigate: ↑/↓ | Adjust: ←/→ | Save: Enter | Close: ESC\n\n"
    for i, item in ipairs(menu_items) do
        if i == menu_selected_index then
            text = text .. string.format("> %s: %s\n", item.name, item.value)
        else
            text = text .. string.format("  %s: %s\n", item.name, item.value)
        end
    end
    return text
end

local function update_menu_overlay()
    if not menu_visible then return end
    osd_overlay.data = draw_menu()
    osd_overlay.hidden = false
    osd_overlay:update()
end

-- Navigate menu items: delta = +1 (down) or -1 (up)
local function menu_navigate(delta)
    menu_selected_index = menu_selected_index + delta
    if menu_selected_index < 1 then
        menu_selected_index = #menu_items
    elseif menu_selected_index > #menu_items then
        menu_selected_index = 1
    end
    update_menu_overlay()
end

-- Adjust current menu item: delta = +1 (next option) or -1 (previous option)
local function menu_adjust(delta)
    local options = options_module.get_options()
    local item = menu_items[menu_selected_index]
    local choices = item.choices
    local cur_index = 1
    for i, v in ipairs(choices) do
        if v == item.value then
            cur_index = i
            break
        end
    end
    cur_index = cur_index + delta
    if cur_index < 1 then
        cur_index = #choices
    elseif cur_index > #choices then
        cur_index = 1
    end
    item.value = choices[cur_index]

    -- Update the shared options
    if item.name == "Encoder" then
        options.encoder = item.value
    elseif item.name == "Bitrate" then
        options.bitrate = item.value
    elseif item.name == "Multi-cut handling" then
        options.multi_cut_mode = item.value
    end

    update_menu_overlay()
end

local function unbind_menu_keys()
    mp.remove_key_binding("menu_up")
    mp.remove_key_binding("menu_down")
    mp.remove_key_binding("menu_left")
    mp.remove_key_binding("menu_right")
    mp.remove_key_binding("menu_enter")
    mp.remove_key_binding("menu_escape")
end

local function close_menu()
    menu_visible = false
    osd_overlay.hidden = true
    osd_overlay:update()
    unbind_menu_keys()
    options_module.save_options()
    mp.msg.info("Configuration saved: Encoder=" .. options.encoder ..
        ", Bitrate=" .. options.bitrate ..
        ", Multi-cut mode=" .. options.multi_cut_mode)
end

-- Accept selection and close menu
local function menu_accept()
    close_menu()
end

-- Cancel (also closes the menu)
local function menu_cancel()
    close_menu()
end

local function bind_menu_keys()
    mp.add_forced_key_binding("up", "menu_up", function() menu_navigate(-1) end)
    mp.add_forced_key_binding("down", "menu_down", function() menu_navigate(1) end)
    mp.add_forced_key_binding("left", "menu_left", function() menu_adjust(-1) end, { repeatable = true })
    mp.add_forced_key_binding("right", "menu_right", function() menu_adjust(1) end, { repeatable = true })
    mp.add_forced_key_binding("enter", "menu_enter", menu_accept)
    mp.add_forced_key_binding("ESC", "menu_escape", menu_cancel)
end

local function open_menu()
    menu_visible = true
    menu_selected_index = 1
    build_menu_items()
    update_menu_overlay()
    bind_menu_keys()
end

-----------------------------------
-- Key Bindings for the OSD Menu --
-----------------------------------

-- Open the menu (e.g., Ctrl+e)
mp.add_key_binding("Ctrl+e", "open_config_menu", function() open_menu() end)

mp.msg.info("OSD configuration menu loaded. Press Ctrl+e to open.")

-- Export the open_menu function
function menu.open()
    open_menu()
end

-- Initialize function that main.lua will call
function menu.init()
    build_menu_items()
end

return menu
