---
title: Vibe hacking Ableton's Push 3
subtitle: Adding MIDI Support Without Documentation
date: 2026-01-12
categories:
  - Hacking
---

# Vibe hacking Ableton's Push 3

When Ableton shipped Push 3 in 2023, they delivered a powerful standalone instrument packed with new buttons, encoders, and a gorgeous color display. What they didn’t ship was documentation.

<!-- more -->

For Push 2, developers had the excellent *Push 2 MIDI and Display Interface Manual*, which explained everything from LED control to display formats. For Push 3? Radio silence. So we did what any stubborn developer would do: fired up a MIDI monitor and started poking at the hardware.

This post documents how we reverse engineered Push 3 and added full support to `push2-python`—and why this kind of work matters if you care about extensible hardware.

---

## The Documentation Desert

Push 3 is a $2,000 instrument. You get sixty-four velocity-sensitive pads, a 960×160 color display, full MPE support, and deep MIDI capabilities. But if you want to build custom controllers, real-time visualizations, MIDI processors, or educational tools, you’re on your own.

No documentation means no clear path to custom integrations, alternative workflows, or experimental software. Every interaction becomes guesswork.

We ended up reverse engineering the protocol from scratch. Along the way, we discovered why some buttons share control change numbers, how Push’s dual-port MIDI setup actually works, and why the display format matters more than you’d expect.

Here’s what we learned.

---

## USB Detection and Linux Permissions

Everything starts with finding the device.

USB devices identify themselves using vendor IDs (VIDs) and product IDs (PIDs)—sixteen-bit numbers assigned by the USB Implementers Forum. Ableton’s vendor ID is `0x2982`. Push 2 uses product ID `0x1967`; Push 3 uses `0x1969`.

We try Push 3 first, then fall back to Push 2:

```python
import usb.core

ABLETON_VENDOR_ID = 0x2982
PUSH2_PRODUCT_ID = 0x1967
PUSH3_PRODUCT_ID = 0x1969

usb_device = usb.core.find(idVendor=ABLETON_VENDOR_ID, idProduct=PUSH3_PRODUCT_ID)
if usb_device is None:
    usb_device = usb.core.find(idVendor=ABLETON_VENDOR_ID, idProduct=PUSH2_PRODUCT_ID)
```

On Linux, there’s an extra wrinkle. Kernel drivers often claim USB interfaces at boot, which prevents user-space programs from accessing them. To take control, you have to explicitly detach the kernel driver and claim the interface yourself:

```python
if usb_device.is_kernel_driver_active(0):
    usb_device.detach_kernel_driver(0)
usb.util.claim_interface(usb_device, 0)
```

macOS and Windows handle this differently, using driver models that don’t require manual detachment. That’s one of those undocumented platform quirks you only learn by failing first.

---

## Two Ports, Two Purposes

Push 3 exposes two MIDI ports over USB: the **User Port** and the **Live Port**.

The User Port is required for full LED control—pads and buttons won’t light correctly without it. The Live Port is what Ableton Live connects to, and it appears to intentionally restrict LED access to avoid conflicts.

This means any standalone tool needs fallback logic: try the User Port first, then gracefully degrade to the Live Port if necessary.

Port naming also varies wildly by operating system:

* **macOS**: “Ableton Push 3 User Port” / “Ableton Push 3 Live Port”
* **Windows**: “MIDIIN2 (Ableton Push 3)” / “Ableton Push 3”
* **Linux (ALSA)**: numeric suffixes (`:1` for User, `:0` for Live)

All of this was discovered experimentally:

```python
import platform

def is_push_midi_in_port_name(port_name, use_user_port=False):
    if platform.system() == "macOS":
        return "User Port" in port_name if use_user_port else "Live Port" in port_name
    elif platform.system() == "Windows":
        return "MIDIIN2" in port_name if use_user_port else "Ableton Push 3" in port_name
    else:  # Linux
        suffix = ":1" if use_user_port else ":0"
        return port_name.endswith(suffix)
```

---

## MIDI Detective Work

With no spec, reverse engineering becomes archaeology.

MIDI defines several message types. Control Change (CC) messages use controller numbers from 0 to 127, each with a value from 0 to 127. Some CCs are standardized (mod wheel, sustain pedal), while others are left to manufacturers. Note On and Note Off messages carry note numbers and velocities.

Step one was building a raw MIDI logger. Step two was pressing *everything*:

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

Some mappings were straightforward. Add is CC 32. Swap is CC 33. Session, Save, Capture, Sets, Learn, Lock, New—each has its own CC number.

Then things got weird.

---

### The Jog Wheel Shares a Brain

CC 88 does double duty.

The Duplicate button sends CC 88 with value 127 when pressed and 0 when released. But the Jog Wheel rotation also uses CC 88, sending 1 for counter-clockwise and 65 for clockwise.

Same CC number. Completely different semantics. The only way to disambiguate is by inspecting the value range:

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

Why do this? No idea. The documentation would have told us.

---

### Touch and Click Are Different

The D-Pad center button revealed another pattern.

It’s touch-sensitive, so touching it sends **Note 13**. Clicking it sends **CC 91**. Same physical control, two completely different MIDI message types:

```python
def handle_dpad_center(msg):
    if msg.type == "note_on" and msg.note == 13:
        print("D-Pad Center touched")
    elif msg.type == "control_change" and msg.control == 91:
        print("D-Pad Center clicked")
```

Without exhaustively testing every interaction, this would have been easy to miss.

---

## Display Hacking: BGR565 and Frame Rates

Push’s display expects pixels in **BGR565** format: sixteen bits per pixel, with red and blue swapped relative to the more common RGB565.

If you send RGB565 directly, reds appear blue and blues appear red. Converting per pixel in Python tanks performance, so we wrote a vectorized NumPy converter:

```python
import numpy

def rgb565_to_bgr565(rgb565_frame):
    frame_r = numpy.right_shift(numpy.bitwise_and(rgb565_frame, 0xF800), 11)
    frame_g = numpy.bitwise_and(rgb565_frame, 0x07E0)
    frame_b = numpy.left_shift(numpy.bitwise_and(rgb565_frame, 0x001F), 11)
    return frame_r + frame_g + frame_b
```

For video playback, we avoid Python entirely. FFmpeg outputs BGR565 directly, hardware-accelerated via VideoToolbox on macOS. Frames are streamed as raw bytes, wrapped in NumPy with zero-copy, and pushed straight to the display.

Result: smooth 60 fps video on a MIDI controller. Because why not.

---

## Velocity to Color: 127 Shades

Push pads support 127 colors—one for each velocity value.

We map velocity to color using HSV instead of RGB. HSV is easier to reason about: hue controls color, saturation controls intensity, and value controls brightness. Hue sweeps from 0 to 0.85 (avoiding the red wrap-around), saturation stays maxed, and brightness ramps from 0.3 to 1.0 so low-velocity hits remain visible:

```python
import colorsys

def velocity_to_rgb(velocity):
    h = (velocity / 127.0) * 0.85
    s = 1.0
    v_bright = 0.3 + (velocity / 127.0) * 0.7
    return [int(c * 255) for c in colorsys.hsv_to_rgb(h, s, v_bright)]
```

Now every pad strike produces a distinct color tied directly to how hard you hit it.

---

## Why This Matters

This work unlocks capabilities that the hardware clearly supports—but that aren’t officially documented:

* Custom controllers and workflows
* Real-time visualizations
* MIDI processors and effects
* Educational and experimental tools
* Integration with other hardware and software

Push 3 is an extremely capable instrument. By documenting what we reverse engineered, we lower the barrier for other developers and expand what the device can do beyond its intended use.

The code is complete, tested, and available in `push2-python`. Push 3 support works today. But the process made one thing painfully clear: with proper documentation, developers could build more, faster, and with fewer hacks.

We’ve built the tools. Now it’s up to the community to decide what to build with them.
