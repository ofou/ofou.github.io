---
title: Vibe hacking Ableton's Push 3
subtitle: Adding MIDI support without documentation
date: 2026-01-12
categories:
  - Hacking
description: >
  Reverse-engineering Push 3's MIDI, USB, and BGR565 display — dual ports,
  a CC that means two things, and 60 fps video on a $2,000 instrument
  Ableton never documented.
---

# Vibe hacking Ableton's Push 3

When Ableton shipped Push 3 in 2023, they delivered a standalone instrument: new buttons, encoders, a colour display. What they did not ship was a spec.

<!-- more -->

Push 2 had the *Push 2 MIDI and Display Interface Manual* — LEDs, pixel formats, the lot. Push 3 got silence. So we did the obvious stubborn thing: opened a MIDI monitor and poked the hardware.

This is how we reverse-engineered it, added support to `push2-python`, and why that kind of work still matters if you care about hardware you can actually extend.

## The documentation desert

Push 3 is a $2,000 instrument. Sixty-four velocity-sensitive pads, a 960×160 colour display, MPE, deep MIDI. If you want a custom controller, a live visualisation, a MIDI processor, or a teaching tool, you are on your own. Every interaction is a guess until it isn't.

We rebuilt the protocol from a monitor log. Along the way: why two buttons share a CC, how the dual MIDI ports actually split, and why the display format is more annoying than it looks.

## USB detection and Linux permissions

USB devices identify themselves with a vendor ID and a product ID. Ableton is `0x2982`. Push 2 is `0x1967`; Push 3 is `0x1969`. Try 3 first, then fall back:

```python
import usb.core

ABLETON_VENDOR_ID = 0x2982
PUSH2_PRODUCT_ID = 0x1967
PUSH3_PRODUCT_ID = 0x1969

usb_device = usb.core.find(idVendor=ABLETON_VENDOR_ID, idProduct=PUSH3_PRODUCT_ID)
if usb_device is None:
    usb_device = usb.core.find(idVendor=ABLETON_VENDOR_ID, idProduct=PUSH2_PRODUCT_ID)
```

On Linux the kernel often claims the interface at boot, which locks out user space. You have to detach it:

```python
if usb_device.is_kernel_driver_active(0):
    usb_device.detach_kernel_driver(0)
usb.util.claim_interface(usb_device, 0)
```

macOS and Windows use driver models that do not need this. You learn that by failing on a Linux box first.

## Two ports, two purposes

Push 3 exposes two MIDI ports over USB: **User** and **Live**.

Full LED control — pads and buttons lighting the way you asked — needs the User Port. Live is what Ableton Live attaches to, and it appears to withhold LED access on purpose so the DAW and a user program do not fight.

Standalone tools should try User, then degrade to Live.

The names are a mess, and they differ by OS. Python reports macOS as `Darwin`:

- **macOS**: "Ableton Push 3 User Port" / "Ableton Push 3 Live Port"
- **Windows**: "MIDIIN2 (Ableton Push 3)" / "Ableton Push 3"
- **Linux (ALSA)**: numeric suffixes (`:1` User, `:0` Live)

```python
import platform

def is_push_midi_in_port_name(port_name, use_user_port=False):
    system = platform.system()
    if system == "Darwin":
        return "User Port" in port_name if use_user_port else "Live Port" in port_name
    if system == "Windows":
        return "MIDIIN2" in port_name if use_user_port else "Ableton Push 3" in port_name
    suffix = ":1" if use_user_port else ":0"
    return port_name.endswith(suffix)
```

## MIDI detective work

Without a spec, this is archaeology.

Control Change messages use controller numbers 0–127, each with a value 0–127. Some CCs are standardised (mod wheel, sustain); the rest are whoever built the box. Note On / Note Off carry a note number and a velocity.

We logged the raw stream, then pressed everything:

```python
import time
import mido

def on_raw_midi(msg):
    timestamp = time.strftime("%H:%M:%S.%f")[:-3]
    if msg.type == "control_change":
        print(f"[{timestamp}] CC{msg.control:3d} = {msg.value:3d}")
    elif msg.type in ("note_on", "note_off"):
        print(f"[{timestamp}] Note {msg.note} {msg.type} vel={msg.velocity}")

with mido.open_input("Ableton Push 3 User Port") as port:
    for msg in port:
        on_raw_midi(msg)
```

Some mappings were boring in a good way. Add is CC 32. Swap is CC 33. Session, Save, Capture, Sets, Learn, Lock, New — each has a number.

Then it got weird.

### The jog wheel shares a brain

CC 88 does two jobs.

Duplicate sends CC 88 with 127 on press and 0 on release. Jog-wheel rotation also sends CC 88: 1 for counter-clockwise, 65 for clockwise.

Same controller number, different meaning. The only tell is the value:

```python
def handle_cc_88(msg):
    val = msg.value
    if val in (1, 65):
        direction = "CW" if val == 65 else "CCW"
        print(f"Jog Wheel {direction}")
    elif val in (0, 127):
        action = "PRESSED" if val == 127 else "RELEASED"
        print(f"Duplicate {action}")
```

Why? No idea. A manual would have said.

### Touch and click are different

The D-Pad centre is touch-sensitive. Touching it sends **Note 13**. Clicking it sends **CC 91**. One piece of plastic, two MIDI types:

```python
def handle_dpad_center(msg):
    if msg.type == "note_on" and msg.note == 13:
        print("D-Pad Center touched")
    elif msg.type == "control_change" and msg.control == 91:
        print("D-Pad Center clicked")
```

If you only click, you never see the note. If you only graze it, you never see the CC.

## Display hacking: BGR565 and frame rates

The display wants **BGR565**: sixteen bits per pixel, red and blue swapped relative to the RGB565 everyone else uses.

Send RGB565 and reds come out blue. A Python loop per pixel will not keep up, so we vectorized it:

```python
import numpy

def rgb565_to_bgr565(rgb565_frame):
    frame_r = numpy.right_shift(numpy.bitwise_and(rgb565_frame, 0xF800), 11)
    frame_g = numpy.bitwise_and(rgb565_frame, 0x07E0)
    frame_b = numpy.left_shift(numpy.bitwise_and(rgb565_frame, 0x001F), 11)
    return frame_r + frame_g + frame_b
```

For video we skip Python. FFmpeg emits BGR565 directly, hardware-accelerated through VideoToolbox on macOS. Frames arrive as raw bytes, wrap in NumPy with no copy, and go straight to the display.

Result: 60 fps video on a MIDI controller.

## Velocity to colour: 127 shades

Pads have 127 colours, one per velocity.

HSV is easier to aim than RGB: hue is the colour, saturation the intensity, value the brightness. Hue runs 0–0.85 so it does not wrap back to red; saturation stays maxed; brightness starts at 0.3 so a ghosted hit still reads:

```python
import colorsys

def velocity_to_rgb(velocity):
    h = (velocity / 127.0) * 0.85
    s = 1.0
    v_bright = 0.3 + (velocity / 127.0) * 0.7
    return [int(c * 255) for c in colorsys.hsv_to_rgb(h, s, v_bright)]
```

Every strike gets a colour tied to how hard you hit it.

## Why this matters

The hardware already does these things. The missing piece was the map:

- Custom controllers and workflows
- Real-time visualisations
- MIDI processors and effects
- Teaching and experimental tools
- Talking to other hardware and software

Push 3 is a capable instrument. Writing the protocol down lowers the cost of the next person doing something Ableton did not design for.

The code is in `push2-python`. Push 3 support works. The process also made the obvious point: with a real manual, more people would have shipped more things, with fewer late nights on CC 88.

The tools are there. What you build with them is the interesting part.
