# Character sprites

The family is a family of animals: the player picks a capybara, cat, unicorn,
dog or frog, and their spouse and children are the same animal. Until custom
art is added, the game draws placeholder animals in code (`js/sprites.js`).

Drop PNGs into this folder and the game picks them up automatically. Any file
that is missing falls back to the drawn placeholder, so art can arrive in
batches.

## Walk sheets

`{animal}-{stage}-walk.png`

| Part   | Values                                         |
|--------|------------------------------------------------|
| animal | `capybara`, `cat`, `unicorn`, `dog`, `frog`    |
| stage  | `baby`, `child`, `teen`, `adult`, `senior`     |

That is 5 × 5 = 25 files, for example `capybara-adult-walk.png`.

- 4 square frames side by side, transparent background. Any square size works;
  the sheets made so far use 128 × 128 frames (512 × 128).
- The animal faces **right**. The game mirrors it to walk left.
- Frames: contact, passing (body 2–3 px higher), contact with the other leg, passing.
  The frog hops instead: crouch, push off, in the air, land.
- Feet stand on the same row near the bottom of every frame. Younger animals are
  drawn smaller inside the same 64 × 64 frame, so they line up when they stand together.

Optional: `{animal}-{stage}-she-walk.png` (for example `cat-adult-she-walk.png`)
is used for female family members, for example with a bow.

Children appear as `baby` (under 3), `child` (3–12), `teen` (13–20) and
`adult` (21+). The player is `child` from 7, `teen` from 13, `adult` from 21 and
`senior` from 65.

## Turning a generated strip into sheets

`tools/slice_sheet.py` takes a 4-frame strip on magenta (as in `source/`) and
writes the walk and `-she` (with a bow) sheets for every stage, scaling the same
model per age:

    python3 tools/slice_sheet.py assets/sprites/source/dog-walk.png assets/sprites dog

All five animals are done (capybara, cat, dog, frog, unicorn). The frog strip had a fake
checkerboard background instead of magenta; the script handles that too.

## Shop items

`item-{id}.png`, 64 × 64 (or 128 × 64 for wide furniture). The ids are in
`SHOP` in `js/data.js`. All 27 are done: `tools/slice_items.py` cuts them out of the
generated sheets in `source/items-{stage}.png`. Item heights in the room are set in
`ITEM_HEIGHT` in `js/sprites.js`.

The image-generation prompts for all of these, with exact sizes, are in the
"FLIT art prompts: animal family and shop items" doc.
