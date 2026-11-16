local mp = require "mp"

local crop = {}

local MIN_SIZE = 16
local HANDLE_SIZE = 8
local GRAB_RADIUS = 16
local EDITOR_KEYS = { "MBTN_LEFT", "MBTN_LEFT_DBL", "ENTER", "KP_ENTER", "ESC", "DEL", "BS" }

-- Applied crop in source pixels: { x, y, w, h, src_w, src_h }, or nil.
local applied = nil
local editor = nil
local overlay = mp.create_osd_overlay("ass-events")

local function log(text)
    mp.osd_message(text)
end

local function even(value)
    return math.floor(value / 2 + 0.5) * 2
end

local function clamp(value, low, high)
    return math.max(low, math.min(high, value))
end

local function video_area()
    local dims = mp.get_property_native("osd-dimensions")
    if not dims or dims.w == 0 then return nil end
    return {
        osd_w = dims.w,
        osd_h = dims.h,
        x = dims.ml,
        y = dims.mt,
        w = dims.w - dims.ml - dims.mr,
        h = dims.h - dims.mt - dims.mb,
    }
end

-- Converts an OSD mouse position to a clamped source pixel position.
local function to_source(area, pos)
    return {
        x = clamp((pos.x - area.x) / area.w * editor.src_w, 0, editor.src_w),
        y = clamp((pos.y - area.y) / area.h * editor.src_h, 0, editor.src_h),
    }
end

local function selection()
    if not editor.anchor or not editor.cursor then return editor.selection end

    local x0 = even(math.min(editor.anchor.x, editor.cursor.x))
    local y0 = even(math.min(editor.anchor.y, editor.cursor.y))
    local x1 = even(math.max(editor.anchor.x, editor.cursor.x))
    local y1 = even(math.max(editor.anchor.y, editor.cursor.y))
    if x1 - x0 < MIN_SIZE or y1 - y0 < MIN_SIZE then return editor.selection end
    return { x = x0, y = y0, w = x1 - x0, h = y1 - y0 }
end

local function rect(x0, y0, x1, y1)
    return string.format("m %d %d l %d %d l %d %d l %d %d", x0, y0, x1, y0, x1, y1, x0, y1)
end

-- Converts a source pixel selection to OSD corner coordinates.
local function to_osd(area, sel)
    local sx = area.w / editor.src_w
    local sy = area.h / editor.src_h
    return math.floor(area.x + sel.x * sx + 0.5),
        math.floor(area.y + sel.y * sy + 0.5),
        math.floor(area.x + (sel.x + sel.w) * sx + 0.5),
        math.floor(area.y + (sel.y + sel.h) * sy + 0.5)
end

local function render()
    local area = video_area()
    if not editor or not area then return end

    overlay.res_x = area.osd_w
    overlay.res_y = area.osd_h

    local events = {}
    local sel = selection()
    local hint = "Drag to select the crop area · Drag a corner to resize\\NEnter: apply · Del: full frame · Esc: cancel"

    if sel then
        local x0, y0, x1, y1 = to_osd(area, sel)
        local W, H = area.osd_w, area.osd_h

        -- Dim everything outside the selection, so the bright area matches the output frame.
        local shade = "{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H000000&\\1a&H60&\\p1}"
        table.insert(events, shade .. rect(0, 0, W, y0))
        table.insert(events, shade .. rect(0, y1, W, H))
        table.insert(events, shade .. rect(0, y0, x0, y1))
        table.insert(events, shade .. rect(x1, y0, W, y1))
        table.insert(events, "{\\an7\\pos(0,0)\\bord1\\shad0\\1a&HFF&\\3c&HFFFFFF&\\p1}" .. rect(x0, y0, x1, y1))
        local half = HANDLE_SIZE / 2
        for _, corner in ipairs({ { x0, y0 }, { x1, y0 }, { x0, y1 }, { x1, y1 } }) do
            table.insert(events, "{\\an7\\pos(0,0)\\bord0\\shad0\\1c&HFFFFFF&\\p1}"
                .. rect(corner[1] - half, corner[2] - half, corner[1] + half, corner[2] + half))
        end
        table.insert(events, string.format(
            "{\\an3\\pos(%d,%d)\\fs18\\bord1.5\\shad0\\3c&H000000&}%d × %d",
            x1 - 6, y1 - 4, sel.w, sel.h))
    end

    table.insert(events, string.format(
        "{\\an8\\pos(%d,%d)\\fs20\\bord1.5\\shad0\\3c&H000000&}%s", area.osd_w / 2, 12, hint))
    overlay.data = table.concat(events, "\n")
    overlay:update()
end

local function on_mouse_move(_, pos)
    if not editor or not editor.anchor or not pos then return end
    local area = video_area()
    if not area then return end
    editor.cursor = to_source(area, pos)
    render()
end

local function on_mouse_button(event)
    local area = video_area()
    local pos = mp.get_property_native("mouse-pos")
    if not area or not pos then return end

    if event.event == "down" then
        local sel = editor.selection
        local grabbed = false
        if sel then
            -- A press near a corner resizes: the opposite corner stays fixed.
            local x0, y0, x1, y1 = to_osd(area, sel)
            for _, c in ipairs({ { x0, y0, 1, 1 }, { x1, y0, 0, 1 }, { x0, y1, 1, 0 }, { x1, y1, 0, 0 } }) do
                if not grabbed and math.abs(pos.x - c[1]) <= GRAB_RADIUS and math.abs(pos.y - c[2]) <= GRAB_RADIUS then
                    editor.anchor = { x = sel.x + c[3] * sel.w, y = sel.y + c[4] * sel.h }
                    editor.cursor = { x = sel.x + (1 - c[3]) * sel.w, y = sel.y + (1 - c[4]) * sel.h }
                    grabbed = true
                end
            end
        end
        if not grabbed then
            editor.anchor = to_source(area, pos)
            editor.cursor = editor.anchor
        end
    elseif event.event == "up" and editor.anchor then
        editor.cursor = to_source(area, pos)
        editor.selection = selection()
        editor.anchor = nil
        editor.cursor = nil
    end
    render()
end

local function crop_string(rect_value)
    if not rect_value then return "" end
    return string.format("%dx%d+%d+%d", rect_value.w, rect_value.h, rect_value.x, rect_value.y)
end

local function close_editor()
    for _, key in ipairs(EDITOR_KEYS) do
        mp.remove_key_binding("crop_editor_" .. key)
    end
    mp.unobserve_property(on_mouse_move)
    mp.unobserve_property(render)
    mp.set_property_native("window-dragging", editor.window_dragging)
    overlay:remove()
    editor = nil
end

local function apply()
    local sel = selection()
    local full = not sel or (sel.w >= editor.src_w and sel.h >= editor.src_h)
    if full then
        applied = nil
    else
        applied = { x = sel.x, y = sel.y, w = sel.w, h = sel.h, src_w = editor.src_w, src_h = editor.src_h }
    end
    close_editor()
    mp.set_property("video-crop", crop_string(applied))
    log(applied and string.format("Crop applied: %d × %d", applied.w, applied.h) or "Crop removed")
end

local function cancel()
    close_editor()
    mp.set_property("video-crop", crop_string(applied))
    log("Crop unchanged")
end

local function reset_selection()
    editor.selection = nil
    editor.anchor = nil
    render()
end

function crop.open_editor()
    if editor then
        apply()
        return
    end

    local params = mp.get_property_native("video-params")
    if not params or not params.w or params.w == 0 then
        log("No video to crop")
        return
    end
    if (params.rotate or 0) ~= 0 then
        log("Crop is not available for rotated video")
        return
    end

    editor = {
        src_w = params.w,
        src_h = params.h,
        selection = applied and { x = applied.x, y = applied.y, w = applied.w, h = applied.h } or nil,
        window_dragging = mp.get_property_native("window-dragging"),
    }

    -- Show the full frame while editing, so the user can widen an existing crop.
    mp.set_property("video-crop", "")
    mp.set_property_native("window-dragging", false)

    local handlers = {
        MBTN_LEFT = { on_mouse_button, { complex = true } },
        MBTN_LEFT_DBL = { function() end },
        ENTER = { apply },
        KP_ENTER = { apply },
        ESC = { cancel },
        DEL = { reset_selection },
        BS = { reset_selection },
    }
    for _, key in ipairs(EDITOR_KEYS) do
        mp.add_forced_key_binding(key, "crop_editor_" .. key, handlers[key][1], handlers[key][2])
    end
    mp.observe_property("mouse-pos", "native", on_mouse_move)
    mp.observe_property("osd-dimensions", "native", render)
    render()
end

-- Returns HandBrake crop margins in source pixels, or nil when no crop is applied.
function crop.margins()
    if not applied then return nil end
    return {
        top = applied.y,
        bottom = applied.src_h - applied.y - applied.h,
        left = applied.x,
        right = applied.src_w - applied.x - applied.w,
    }
end

function crop.size()
    return applied and { w = applied.w, h = applied.h } or nil
end

function crop.reset()
    if editor then close_editor() end
    if applied then mp.set_property("video-crop", "") end
    applied = nil
end

return crop
