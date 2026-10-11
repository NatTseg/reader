"""Export reader's SVG artwork for iPhone and other app launchers.

Requires CairoSVG and the Cairo native library.
Run from any directory: python3 scripts/build_icons.py
For Homebrew Cairo on macOS, prefix the command with
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib if Cairo is not found.
"""

from pathlib import Path
import xml.etree.ElementTree as ET

import cairosvg


root = Path(__file__).resolve().parent.parent
artwork = (root / "icon.svg").read_bytes()
for filename, size in [("apple-touch-icon.png", 180), ("icon-512.png", 512)]:
    cairosvg.svg2png(
        bytestring=artwork,
        write_to=str(root / filename),
        output_width=size,
        output_height=size,
        background_color="#252a27",
    )

# Keep the whole mark within the circular safe area of a maskable app icon.
maskable = ET.fromstring(artwork)
maskable.find("{http://www.w3.org/2000/svg}g").set(
    "transform", "translate(40.96 40.96) scale(.84)"
)
cairosvg.svg2png(
    bytestring=ET.tostring(maskable),
    write_to=str(root / "icon-maskable-512.png"),
    output_width=512,
    output_height=512,
    background_color="#252a27",
)
