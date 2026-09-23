# Video pipeline

Everything here is reproducible from the repo and the live deployment; no screen recording by hand.

1. `pnpm --filter @accrue/console build && pnpm --filter @accrue/console start` (port 3000) with `NEXT_PUBLIC_ENVIO_GRAPHQL` set.
2. `npm i playwright` in a scratch folder next to these files, then `BASE=http://localhost:3000 node record.js`
   records one clip per scene (fake cursor, click ripples, smooth scrolls, camera zooms) into `clips/`,
   plus `<clip>.clicks.json` with click timestamps. `term.html` + `schedules.js` replay the drill reports
   in `docs/drill` as terminal scenes with their real step timings.
3. `python3 make_config.py` writes `demo.json` (scenes, captions, narration from `../narration.md`).
4. `python3 build_demo_say.py demo.json` renders `accrue-pitch.mp4`: macOS `say` narration (Samantha),
   dark brand cards, wide device layout, 0.5 s crossfades, loudness-normalised audio, click sounds
   mixed at the recorded click times. Needs ffmpeg and Pillow.

Stills of the Monad explorer and the Envio Cloud dashboard were captured from a logged-in Chrome and
turned into 9 s slow-zoom clips (`ffmpeg -loop 1 … zoompan`).
