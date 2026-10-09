# Swapping in your own art

All art in this game is generated in code (`client/src/game/art/`). To replace any
piece with a real image, put the PNG in this folder and list it in `manifest.json`
using the texture key below. Anything not listed keeps using the generated art.

```json
{
  "textures": {
    "tree_0":   { "file": "oak.png" },
    "player_0": { "file": "hero-orange.png", "frameWidth": 16, "frameHeight": 20 }
  }
}
```

| Key | Size | Notes |
| --- | --- | --- |
| `tileset` | 256 x 128 | 16 columns x 8 rows of 16x16 ground tiles. Row order: grass, flowers, path, dirt, soil, porch, lane, water. See `art/tiles.ts` for the edge-mask column layout. |
| `player_0` … `player_5` | 192 x 20 | 12 frames of 16x20, one sheet per color: down x3, left x3, right x3, up x3. |
| `shadow` | 12 x 5 | Under every character. |
| `tree_0` … `tree_3` | 32 x 40 | Green, orange, gold, red. Bottom-center sits on the tree's tile. |
| `corn_0`, `corn_1` | 16 x 28 | |
| `hay`, `pumpkin`, `lantern`, `lantern_lit` | 16 x 16 | |
| `fenceH`, `fenceV`, `fencePost` | 16 x 20 | |
| `leaf_0` … `leaf_2` | 5 x 4 | Falling leaf particles. |
| `prop_<type>` | (w x 16) x (h x 16 + overhang) | Multi-tile props, e.g. `prop_farmhouse` (144 x 112). Bottom-left sits on the prop's footprint. |
