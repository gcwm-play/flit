# Character sprites

The game currently draws simple placeholder characters in code (`js/sprites.js`).
To use your own art, add one PNG per life stage, gender and skin tone here and
set `CUSTOM_SPRITES = true` in `js/sprites.js`.

## File names

`{stage}-{gender}-{tone}.png`

| Part   | Values                                      |
|--------|---------------------------------------------|
| stage  | `baby`, `child`, `teen`, `adult`, `senior`  |
| gender | `male`, `female`                            |
| tone   | `0` Light, `1` Fair, `2` Medium, `3` Tan, `4` Deep |

That is 5 × 2 × 5 = 50 files, for example `adult-female-3.png`.

## How they are used

- The player picks gender and skin tone at the start. The spouse is the other
  gender with the same skin tone, and children share it too.
- Children appear as `baby` (under 3), `child` (3–12), `teen` (13–20) and
  `adult` (21+).
- Draw each sprite facing forward on a transparent background, with the feet
  touching the bottom edge. Keep one pixel scale across all files: the game
  scales them up with nearest-neighbour so they stay crisp.
- Heights the placeholders use (in pixels), so family members keep sensible
  sizes next to each other: baby 16, child 23, teen 28, adult 30, senior 29.
  If your art uses different heights, update `SHAPES` in `js/sprites.js`.
- Outfit colours only apply to the placeholder art.
