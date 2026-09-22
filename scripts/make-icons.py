#!/usr/bin/env python3
"""Draw a simple green block icon for the extension toolbar."""

import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(__file__), "..", "icons")


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def pixel(x, y, size, rgb):
    cx = (size - 1) / 2
    cy = (size - 1) / 2
    dx = x - cx
    dy = y - cy
    radius = size * 0.46
    if dx * dx + dy * dy > radius * radius:
        return (0, 0, 0, 0)
    if abs(dy) <= size * 0.09 and abs(dx) <= size * 0.24:
        return (255, 255, 255, 255)
    return rgb


def write_png(path, size, rgb):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row.extend(pixel(x, y, size, rgb))
        rows.append(bytes(row))
    raw = b"".join(rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def main():
    os.makedirs(ROOT, exist_ok=True)
    colors = {
        "icon": (19, 115, 51, 255),
        "off": (95, 99, 104, 255),
        "bad": (217, 48, 37, 255),
    }
    for name, rgb in colors.items():
        for size in (16, 32, 48, 128):
            write_png(os.path.join(ROOT, f"{name}{size}.png"), size, rgb)


if __name__ == "__main__":
    main()
