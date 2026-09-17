"""
Pulls the outlines of MUSETRADE out of Baloo 2 (the face musebook sets everything
in) and writes them as SVG path data, Y-down, em box normalised to 1. Run once at
build time so the 3D wordmark ships as JSON and the browser never parses a font.
"""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

WEIGHT = sys.argv[1] if len(sys.argv) > 1 else "800"
SRC = sys.argv[2] if len(sys.argv) > 2 else f"/private/tmp/claude-501/-Users-diego-carsten-Desktop-Claude/bdd3551e-8412-4362-b0ae-a3b8492bef5a/scratchpad/fonts/baloo2-{WEIGHT}.ttf"
OUT = "lib/wordmark.json"
WORD = "MUSETRADE"

font = TTFont(SRC)
upem = font["head"].unitsPerEm
glyphSet = font.getGlyphSet()
cmap = font.getBestCmap()
hmtx = font["hmtx"]

letters = []
for ch in WORD:
    name = cmap[ord(ch)]
    pen = SVGPathPen(glyphSet)
    tp = TransformPen(pen, (1.0 / upem, 0, 0, -1.0 / upem, 0, 0))
    glyphSet[name].draw(tp)
    adv, lsb = hmtx[name]
    letters.append({"char": ch, "d": pen.getCommands(), "advance": adv / upem})

os2 = font["OS/2"]
data = {
    "word": WORD, "weight": int(WEIGHT), "family": "Baloo 2",
    "capHeight": (os2.sCapHeight / upem) if getattr(os2, "sCapHeight", 0) else 0.7,
    "letters": letters,
}
json.dump(data, open(OUT, "w"), indent=1)
print(f"{OUT}: {WORD} at weight {WEIGHT}, {sum(len(l['d']) for l in letters)} bytes, capHeight {data['capHeight']:.3f}")
