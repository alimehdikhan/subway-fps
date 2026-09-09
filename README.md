# Last Train — Northgate Station

A wave-survival first-person shooter set on a locked-down subway platform, built on three.js (r128)
with no build step. Open `index.html` from any static server (or the Vercel deployment) and play.

## Modes

- **Last Train** — hold the platform through five waves, then board the train when it rolls in.
- **Overtime** — endless. Waves are rolled from a weighted pool that gets nastier every round, and every
  unit gets a little tougher and quicker. No train is coming; the run ends when you fall.
- **Difficulty** (Easy / Normal / Hard) scales enemy health, enemy damage and score. Best scores for
  both modes are kept in `localStorage`.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint (C while sprinting slides) |
| Mouse / RMB | Look and aim down sights |
| LMB | Fire |
| 1–5, Q, wheel | Switch weapon / last weapon |
| R | Reload |
| **G** | Throw a frag grenade (bounces, 2 s fuse, hurts you too) |
| F | Inspect weapon |
| Space | Jump |
| Esc / P | Pause |

Touch devices get a floating joystick, look zone and a thumb cluster with the same actions.

## Station lighting and materials update

- **Baked fixture light.** At load, `bakeSurface` (`js/textures.js`) evaluates every fluorescent troffer, track lamp, amber emergency lamp and lit sign per texel for the floor, walls, ceiling, wainscot, pillars and track bed, and writes the result into a `lightMap` plus an `aoMap` (uv2) on each surface material (`bakeStation` in `js/world.js`). The whole platform reads as lit by its own fittings at zero frame cost; the three roaming point lights only add specular response and light the things that move. Contact occlusion under props comes from the same bake, so the old decal blobs are gone. One tube (`FLICKER_INDEX`) fails intermittently; it is steady under `prefers-reduced-motion`.
- **Materials.** Tile, concrete, wainscot, brushed metal, the ceiling soffit and the train carry roughness maps as well as normal maps, so glaze, damp concrete, grout and grime answer light differently instead of being painted into the albedo. Rails are rusted webs with a polished running surface on baseplates; the third rail sits on insulator pots. Signs sit in steel frames, the ceiling carries conduits, a cable tray and a duct, and the train has bogies, roof gear, window frames and a lit destination blind.
- **View model.** Anodised receiver, bare steel, polymer furniture, rubber pads, painted heavy plate and tan polymer are separate finishes; gloves are synthetic leather and sleeves ripstop at millimetre scale. The view-model key light follows the nearest fixture. Static weapon parts are batched by material (moving parts are flagged `userData.keep`).
- **Enemies.** Painted machine steel with panel lines and scratches, a contact shadow under every unit, and one extra silhouette cue per type (sentry aerial, runner fin, heavy exhausts, blue-steel warden plates, hazard-striped charger payload). Behaviour and hit spheres are unchanged.
- **Effects.** Petal muzzle flashes that shrink when aiming, world-space smoke puffs (normal blending) on impacts and kills, and a shared `blastFx` (fireball, floor shockwave, smoke, brief sane light) for barrels, grenades and chargers; the railgun gets a cyan impact ring. All from fixed pools.
- **Post (Ultra).** Threshold pass to quarter resolution, two separable blurs, then a composite with a light vignette (`renderPost` in `js/core.js`). No chromatic aberration, depth of field or motion blur. Performance drops the volumetric cones and runs two fixture lights; Balanced keeps shadows on desktop with no post; Auto still adapts resolution.
- **FPS counter.** Average FPS, frame time and the slowest frame of the last half second, bottom right during play. "FPS counter: on/off" in both menus, remembered in `localStorage`.

## Graphics, aiming and handling update

- Graphics defaults to Auto, targeting a stable 60 FPS by adjusting effects and resolution. Performance, Balanced and Ultra are available in both menus. Gameplay is uncapped on faster displays; actual FPS depends on the device and browser.
- Static station pieces and glove parts are batched. Mobile rendering caps resolution, skips expensive default post-processing and removes control backdrop blur. Hidden tabs stop rendering; menus run at 20 FPS.
- Shots originate from the camera and resolve before recoil. ADS first shots are accurate while stationary; movement, jumping and sustained fire add spread. Damage is immediate and independent of the visual tracer pool.
- The railgun uses a centered 3× scope, actual range/contact readout and no obstructing view model. Touch aim assist slows manual aiming over a visible target; it can be disabled.
- Crouching lowers the viewpoint, jump presses have a small input buffer, and slides have a cooldown. Each weapon has its own support grip and trigger finger, with anchored sleeves and phased magazine/pump handling.
- Touch controls support movement, look and fire together, clean up cancelled touches, and fit portrait and landscape layouts.

## Hands, optics and mobile controls update

- First-person hands are built procedurally (`makeHand` / `makeFinger` in `js/weapons.js`): a proper pistol-grip hold with the index on the trigger and the thumb over the back of the grip, and a support hand cupping the handguard or pump. Elbows are anchored in view space below the frame (`js/handling.js`), sleeves are mid-dark ripstop, and a camera-side fill light keeps gloves readable.
- Tracers are camera-facing ribbons with a hot core that always run from the muzzle to the exact hit point; the railgun draws its full beam instantly and lets it fade. The scope has a mil-dot reticle, lens shading, a lock bracket on contact and breathing sway applied to the camera itself, so the beam lands where the reticle points. Hold Shift while scoped to steady the sight for about three seconds.
- Mobile: fullscreen requests use every vendor API and explain themselves when a browser cannot do it (iPhone Safari has no page fullscreen; Add to Home Screen is the route). Layout options in both menus: Right-/Left-handed presets (the joystick and look halves swap with the cluster), Normal/Large buttons, and "Edit touch layout" in the pause menu to drag every control where your thumbs land, with Save and Reset. Positions are stored per handedness in `localStorage`.

## Hands, muzzle sockets and smoke update

- **Muzzle sockets.** Every weapon carries an empty at its barrel tip (`userData.muzzle`, `updateMuzzleTransform` in `js/weapons.js`). Because it is a child of the weapon group it already carries every layer of view-model animation (sway, bob, sprint, ADS, recoil, reload, inspect, the switch drop). The view model is drawn in its own scene, so the socket is carried into the station through the screen: the pixel the muzzle occupies is unprojected through the world camera 0.65 m from the eye. Tracers, the world muzzle light and the smoke all start there.
- **Smoke.** Propellant smoke is emitted from the socket and then belongs to the station: one instanced mesh (`js/weapons.js`, `MZ_SMOKE_MAX` particles, one draw call) of billboards that drag to a stop, expand, rise, wander on turbulence and thin out, lit warm by the flash for the first tenth of a second (cyan for the rail). Turning or walking after a shot leaves the trail hanging where the barrel was. Density depends on the weapon and on barrel heat: sustained fire thickens the bursts and a hot barrel breathes thin wisps between shots. Aiming thins the cloud so the sight stays usable.
- **Hands.** `js/hands.js` rebuilds both hands on every weapon after the models load: real-scale gloved hands whose fingers are wrapped numerically around each weapon's contact volumes (a finger curls joint by joint until it meets the grip, the palm is pushed out of the grip, the trigger finger and thumb are aimed at their rest points), so nothing clips. Each weapon has its own support hold: rear handguard for the rifle, pump for the shotgun (the hand rides the pump), a stubby vertical foregrip on the SMG, and a palm-up chassis hold under the railgun's rails. Bars and grips are held in the fingers rather than the middle of the palm: the knuckle line sits just past the contact, so the fingers close evenly round the surface instead of hooking over it, and the firing hand sits low enough on the grip for the thumb to wrap the backstrap under the receiver. Each hand owns one sleeve: a tapered forearm that starts at the wrist and runs, in view space, down and back toward the player until it has left the bottom of the frame, so no elbow or upper arm is ever drawn (a real arm cannot reach a weapon held this far from the eye). Reloads, inspection, the trigger pull and the pump are animated on the fitted poses and blended, so an interrupted reload never snaps.
- **Aiming.** When aimed, the carbine, shotgun and SMG come in close (`adsZ` in the weapon table puts the sight 18–30 cm from the eye) and the view-model camera tightens by 42 % (`HD_ADS_TIGHTEN` in `js/hands.js`), so the sight fills about a fifth of the frame like a real sight at eye relief. The carbine's holographic sight is a thin matte hood with nearly clear glass, a shaded rim and a crisp 512 px ring-and-dot reticle; the SMG's red dot is a hollow tube that is looked through; the shotgun is aimed through a standing rear leaf over a front bead. That sight line already ran down the middle of the screen, but in bare steel it read as nothing at all against a dark platform, so it carries tritium the way a real ghost ring does: a lamp in the bead and one either side of the notch, all three level and the bead standing on the point of impact (`cfg.sights` in `js/models.js`). The railgun's scope overlay is unchanged.

## Weapon models and hands update

- **Arsenal.** Five slots: `[1]` AK-47 rifle, `[2]` S1897 pump shotgun, `[3]` M416 assault rifle (850 rpm, the HK416 cyclic rate), `[4]` Apex-50 railgun and `[5]` P-9 sidearm, a semi-automatic 9 mm pistol (one round per press, `semi` in the weapon table) with a 15-round magazine that is held closer than the long guns (`hip` offset in the table). Ammo crates and wave rewards top it up like the others; the weapon dock, the touch cycle button, the number keys and the wheel all run off `WEAPONS.length`.
- **GLB view models.** `js/models.js` swaps four procedural weapons for the models in `models/` (`MODEL_CFG`): the AK-47, the pump shotgun, the Quaternius assault rifle and the pistol; the railgun stays procedural, and each of the others keeps a procedural stand-in that is used if its model fails to load. Each model is loaded with `THREE.GLTFLoader`, baked into weapon space (bore along -Z), given the game's finishes, has iron sights that would sit in a red dot's picture flattened, has moving parts carved out of the mesh (`carve`: the rifles' magazines for the reload, the shotgun's wooden fore-end so the pump rides it), gets a procedural magazine where the model has none (the pistol), and has any optic and the muzzle socket re-seated. Tests and the review tools await `MODELS_READY` before they touch the weapons.
- **Contact volumes follow the models.** Every hand is fitted against boxes and cylinders that trace the real mesh: the AK grip is a 50 mm raked wedge and its stock a slab whose underside runs from just behind the grip to the toe of the butt, so the thumb has room to pass over the backstrap under it; the assault rifle's stock is a tall block above the receiver line with a wedge butt under its rear half. Wrong volumes were what buried the thumbs inside both grips.
- **Thumbs.** The thumb's reach decides how it approaches its rest point (over a backstrap, forward along a handguard); the wrap now starts from that pose, backs off if it touches and closes each joint a little further onto the surface, instead of closing from straight and lying along whatever the base pointed at. Support thumbs lie forward along the handguard's lower edge rather than standing up its side into the sight picture. A spec may instead give the thumb an explicit start pose in hand space (`thumb.pose`) and move its root toward the wrist and the far side of the grip (`thumbBack`, `thumbIn`): the pistol's firing thumb crosses behind the backstrap and folds forward along the left of the frame, on top of the support hand, which is not a pose a target reach converges on.
- **Shotgun and pistol holds.** The shotgun is a classic stock: the firing hand wraps the wrist of the stock behind the trigger guard, fingers under, thumb over the comb, and the support hand rides the wooden fore-end that the pump animation slides. The pistol is a two-handed thumbs-forward grip, and the support hand there is fitted against the firing hand as well as the gun: `hdHandVols` turns the already-fitted firing hand into capsules (one per phalanx, three across the palm) that the support hand's `overFiring` flag adds to its contact set, so its fingers close onto the firing fingers instead of arching in the air beside them. The firing thumb crosses behind the backstrap and lies forward along the frame above the support thumb. Both forearms splay down and out to the elbows (per-weapon `exit` directions).
- **Close hands at ADS.** A hand held close to the face must not send its sleeve toward the camera: inside 65 cm the camera-ward component fades out so the forearm drops away below the frame instead of swelling toward the lens. `HD_ADS_TIGHTEN` is per weapon and may be negative, which widens the view-model field of view instead of narrowing it; the stocked shotgun uses that, because its firing hand sits about 24 cm from the eye and any magnification there turns the hand and the comb into the whole frame. A stocked gun also has to be pulled back far enough at ADS that its butt ends up behind the eye, or the butt fills the bottom of the screen.
- **Handgun fitting.** Two things the fitter could not express before. The trigger guard has to be modelled as a hoop (a dust cover above, a bar below, an opening between) rather than one solid box, or the trigger finger is pushed up off the gun and reads as a point. And the fold profile is capped, so a finger that cannot fold far enough to reach its target overshoots past it; a weapon can now raise that cap (`restK`, `pullK`), which is what lets the index finger index along a frame only a finger's length from the knuckle.
- **Hand anatomy.** The hand is built to measured proportions: 86 mm across the knuckles, 30 mm thick, 98 mm from the wrist crease to the knuckle line, with real finger lengths (index 74, middle 81, ring 75, little 59 from the knuckle) split 47/30/23 across the phalanges. The palm is three blocks tapering from the knuckle line back to the wrist plus a thenar and a hypothenar mass, because the single slab it used to be read as a brick from every angle; the knuckle line is an arc, with the middle metacarpal leading and the little trailing, and each metacarpal head stands proud so the knuckles read. Each phalanx tapers along its own length and the next starts narrower, so a finger narrows from knuckle to tip instead of reading as one tube. The thumb leaves the palm at its radial edge from inside the thenar, so it opposes the fingers rather than standing beside them as a fifth digit.
- **No finger is ever straight.** A trigger target further from the knuckle than the finger can reach used to leave it fully extended and still short of the mark, which is the "pointing" finger no hand makes. Every reach now has a minimum fold (`restMin`, `pullMin`), and the AK and shotgun rest points were moved within reach — the shotgun's firing hand is on the wrist of the stock, so its finger indexes on the receiver behind the guard rather than reaching for the guard's front.
- **Carry pose.** At rest the weapon is carried canted, muzzle up and across the body, the way it is held when nobody is aiming (`hipRotX/Y/Z` in `js/player.js`); it blends fully straight when aiming because the ADS rotation is zero, so the sight picture is unaffected. The support forearm runs out toward the lower-left corner rather than straight down, so it reads as one slim diagonal limb instead of a post under the gun, and the sleeve is slimmer at both the wrist and the elbow.
- **Judging it.** `node tools/hands-review.cjs <outdir> <tag> <port> <weapons> struct` renders each hand from six directions with the weapon hidden and every hand material replaced by one flat matte, so the pose is judged as anatomy rather than as gloves. That view is what the proportions above were fixed against.
- **Forearms.** One sleeve per hand, from the wrist down and out of the frame, now with real proportions: 55 mm at the wrist swelling to 86 mm about 22 cm up, three bunched folds, a stronger ripstop weave, and a steeper exit so the support forearm leaves the bottom of the frame sooner. More of the hand's own wrist axis is blended into the sleeve direction so the wrist does not kink. Fingers are a millimetre slimmer; the hard knuckle shells are now soft padded glove backs.
- **Recoil.** The firing hand tightens on the kick as before; the support hand now gives a few millimetres and cocks its wrist slightly before settling home, so both hands move with the weapon as one system.
- **Tooling.** `node tools/hands-review.cjs <outdir> <tag> [port] [weapons] [poses] [closeups]` renders every weapon and pose from the eye plus hand close-ups; `EXPFILE=path` (or `EXP='js'`) runs a snippet before capture for tuning experiments, e.g. rebuilding a weapon's hands with a different spec.


## Loading, interface and audio update

- **Loading screen.** The game is a stack of classic scripts that share one global scope, so they must run in order. The boot loader in `index.html` fetches them one at a time and gives the page a frame to paint between each, which is what makes the progress bar move for real instead of jumping from nothing to done; the stage line names the work actually happening. When the last script has run, `main.js` hands off to `BOOT.finish()`, which waits for the GLB weapon models before revealing the menu. `window.GAME_READY` resolves at that point and the test tools await it. If a file fails to load the screen says so rather than hanging, and an uncaught error hides the boot screen so the game's own failure screen is visible.
- **Interface.** Restyled to a minimal, low-contrast system: hairline rules instead of coloured bars, one restrained accent, lighter type at larger sizes, and no glows. The main menu is a single vertical column over the live station with one highlighted row, and the twelve settings buttons are grouped into a drawer behind Options instead of a flat wall.
- **Round minimap.** `drawMap` in `js/flow.js` draws a circular map centred on the player and rotated so the way you are facing is up, with the platform, the pillars, pickups and units panning underneath a fixed marker, plus a rim, an edge falloff and a north tick. Scale is `MAP_PPM` pixels per metre.
- **Phone layout.** Landscape on a 390 px-tall screen is the tightest case, so the title screen shrinks its heading rather than its list: all five menu rows fit above the fold at 44 px each, and the key legend drops away. In game the ammo plate is bounded so it cannot grow into the score plate, and the round map returns on touch below the pause row and above the grenade key. Portrait stays a deliberate fallback behind the rotate prompt, with the map hidden and taller rows.
- **Explosions.** Grenades, red barrels and charger drones all play the recorded blast in audio/grenade.wav through sfxAt, so the pan and distance gain apply to it exactly as they do to the synthesised effects; each falls back to the synth if the file has not decoded. The grenade previously detonated with no sound at all.
- **Recorded gunshots.** The SFX pack in audio/ supplies a single close report per weapon: AKM for the AK-47, S1897 for the shotgun and M416 for the assault rifle, each 48 kHz stereo and already trimmed to one shot, so they play whole. The AK-47 report is the focused AKM single fire, 0.38 s from crack to silence rather than the 0.48 s of the take it replaced, so the tail clears before the next round at the weapon's 0.096 s fire rate. The railgun and pistol still use the earlier recordings, which are strings of several shots rather than one, so those carry the measured offset and length of a single clean report in SHOT_CLIP. One voice per weapon is live at a time with the outgoing one faded over 35 ms, so every bullet is exactly one audible crack.
- **AK-47 burst variation.** Retriggering one recording per bullet makes held fire sound like a loop, because every crack is the same waveform. audio/akm_auto.wav is a ten-round automatic take whose rounds correlate with each other at only 0.13-0.29, so they are ten separate reports of the same gun rather than one repeated. `buildBurstVariants` in js/audio.js builds eight one-shot buffers from it when the file decodes: 92 ms of body from rounds 1-8, each crossfaded over 8 ms into the decay of the tenth round, which is the one report in the take that rings out. Rounds 1-8 are only 100 ms apart, so on their own they would end abruptly; borrowing that tail makes each a complete report. `playShotSample` uses them for any round fired within 0.22 s of the last one, stepping by one or two so eight takes never settle into an audible cycle and never repeat back to back; the round that opens a burst keeps the dedicated single-fire take and its full 0.38 s tail. If the file is missing the variants are simply never built and every round falls back to that take. Files are fetched at load and decoded once the audio context exists; anything missing falls back to the synthesised report.

## Local verification

Run `node tools/serve.cjs` to serve the game at `http://127.0.0.1:4173`, and `node tools/check.cjs` for syntax and script-path checks.
`node tools/regression.cjs` runs deterministic desktop/mobile gameplay and layout checks with Playwright (install `playwright` or use the existing global Playwright CLI installation). `node tools/smoke.cjs` checks live rendering and input on installed Chromium, Firefox and WebKit browsers.

Deploy to the linked project with `npx vercel --prod`. `.vercelignore` excludes local environment files, testing tools and screenshots.

## Enemies

| Unit | Notes |
| --- | --- |
| Scrubber / Runner | Melee. Runners zigzag. |
| Sentry / Gantry | Ranged bolts; the gantry fires bursts. |
| **Warden** | Slow, turns slowly, frontal energy shield. Flank it, shoot the legs, crack the shield with the railgun, or blow it up. Shield returns after a few seconds. |
| **Charger** | Fast suicide drone that ticks louder as it closes. Detonates on you, and also when it dies, so it chain-reacts with other chargers and the red barrels. |

## Layout

Everything is plain scripts sharing one global scope, loaded in the order listed in `index.html`.
There is no bundler; keep that order if you add a file.

```
index.html        markup only (HUD, menus, touch controls)
css/game.css      all styling
js/three.min.js   three.js r128 (a CDN fallback is wired in index.html)
js/GLTFLoader.js  three.js r128 GLTF loader (classic script)
js/core.js        DOM helper, error screen, renderer, cameras, post-processing pass
js/textures.js    procedural canvas textures, bump/normal maps, shared materials
js/world.js       station geometry, train, props, barrels, lighting, gibs, collision maths
js/audio.js       Web Audio synthesis for every sound, ambience, positional playback (sfxAt)
js/weapons.js     weapon stats, first-person view models and hands, casings, particles, tracers
js/enemies.js     enemy types, difficulty, damage numbers, medals, deaths, bolts, pickups
js/player.js      player/match state, wave tables, shooting (applyHit), grenades, update()
js/flow.js        wave progression, the train, HUD, minimap, start/pause/finish, best scores
js/input.js       keyboard, mouse, touch, gyro, fullscreen, menu toggles
js/hands.js       fitted first-person hands, arm IK and hand animation (loads after handling.js)
js/performance.js station batching and adaptive graphics budgets
js/aim.js         shared camera-ray range and contact readout
js/handling.js    weapon grips, anchored forearms and phased reload poses
js/models.js      GLB weapon models swapped in over the procedural ones, with their hand specs
js/graphics.js    graphics quality presets and material tuning
js/main.js        resize, menu camera, frame loop
audio/            recorded gunshots (akm, akm_auto, s1897, m416, pistol, sniper)
models/           ak47.glb, shotgun.glb, assault-rifle.glb, pistol.glb (served by tools/serve.cjs and Vercel)
```

Because the modules are ordinary scripts, top-level code in an earlier file must not call into a
later one at load time (function calls at runtime are fine). Debugging: `P`, `G`, `enemies`,
`killEnemy`, `throwNade`, `begin('endless')` and the rest are all reachable from the console.
