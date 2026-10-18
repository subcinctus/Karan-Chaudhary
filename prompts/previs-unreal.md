# Previs in Unreal: six moves, one stage, one light table

This is the consolidated prompt for the local Unreal Engine session that turns
`previs/shotlist.json` into six rendered previs shots. It is written for Claude Opus 5.5 in the
collection's block style, and it gathers the steps from `previs/README.md` into one prompt.

How to run it:

- Paste it into Claude Code started **in the folder that holds `.mcp.json`** (the Unreal project
  folder; on a source build, the workspace root), with
  `--add-dir /path/to/Karan-Chaudhary`.
- The Unreal Engine Skills plugin must be installed and the editor's MCP server running. Setup is in
  `previs/README.md` → "Before you start".

The camera moves come from Motion Prompt (MIT, Shohei Ohtaki), numbers only:

- **#027** Dolly in
- **#033** Rack focus
- **#030** Orbit
- **#032** Dolly zoom
- **#031** Crane up
- **#043** Whip pan

The lighting presets are **#101**, **#102**, **#100**, **#098**, **#097** and **#114**, by way of
`assets/js/core/presets.js`.

---

<inputs>
Ask me for these, and use the default when I don't answer:
- The website repo path. Default: the directory passed with `--add-dir`. Call it `<repo>` below.
- Which shots. Default: all six, PV-010 to PV-060, in order.
- Build depth. Default: the 8-primitive lighting maquette from `<repo>/previs/bust.md`, plus the
  full bust only if the maquette reads under Rembrandt and butterfly.
- Render. Default: Movie Render Queue, PNG, 2048 × 858, 8 temporal samples (PV-060: 9 at a 360°
  shutter), written to `<repo>/media/previs/<shot id>/{frame_number}` padded to 4 digits.
</inputs>

<direction>
This is a DP's previs, not a game level. It should look like a lighting test on a grey stage:
- an 18 % grey cyc and floor;
- a matte plaster bust;
- twelve grey columns on a 10 m ring for parallax;
- a bare 2700 K practical;
- nothing else.

The point is to prove three things before a shoot day: the move, the lens and the light.

- **Single source.** Every number comes from `<repo>/previs/shotlist.json`. That file is generated
  from the same presets and optics the website's Light and Focus studies use. Never invent a
  value. If something is missing, ask me.
- **Units and axes.** Centimetres. Unreal axes: X forward, Y right, Z up. The subject is at the
  origin facing −X, with the head centre at (0, 0, 150). Positive yaw turns right; positive pitch
  tilts up.
- **Camera.** A CineCameraActor with:
  - filmback "Super 35mm" (24.89 × 18.66 mm), crop 2.39:1;
  - `CurrentFocalLength`, and `CurrentAperture` = the T-stop;
  - `DiaphragmBladeCount` = 9;
  - manual focus, with `ManualFocusDistance` in cm (planar depth to the head);
  - White Balance Temp = the preset's `cameraWB`.
- **Light.** RectLights at the listed `loc` and `rot`, already aimed at the head, with
  `bUseTemperature` on and `Temperature` = `kelvin`.
  - Intensities are relative: key 1, fill 1/(ratio − 1).
  - Pick one base intensity on Rembrandt (lit cheek near 70 %, manual exposure) and keep it for
    every preset.
  - Check the formulas: `X = −d·cos el·cos az`, `Y = −d·cos el·sin az`, `Z = 150 + d·sin el`,
    with az positive = camera-left.
- **Moves.** Keys go at their `t` (sub-frame keys are fine) with the shot's `ease`.
  - Cubic in-out is `cubic-bezier(0.65, 0, 0.35, 1)`: flat weighted tangents, each handle 65 % of
    the span.
  - Baked keys (PV-050) use Auto tangents.
- **#030 Orbit is a rig.** Parent the camera to a pivot at the head, at the local offset
  (−600, 0, 20) and pitch −4.01°. Key only the pivot's yaw, +54.43° → −54.43°.
- **#032 Dolly zoom.** Key focal and location on identical times and easing, so focal ÷ distance
  stays at 3 mm per metre and the head never changes size.
- **#043 Whip pan.** It needs two cameras. Make a camera-cut track that cuts to camera B on frame
  50, where the blur peaks.

Banned:
- lens flares and light leaks;
- fog that wasn't asked for;
- coloured gels not in the table;
- auto exposure and eye adaptation;
- camera shake;
- extra set dressing;
- Lumen "look" tweaks that change the ratios;
- renaming assets or folders that already exist;
- running Python without my explicit OK.
</direction>

<structure>
| Step | Prompt (one at a time; wait for me after each) | Done when |
|---|---|---|
| 0 Discover | Read-only: verify the connection, `list_toolsets`, `describe_toolset` (Sequencer, actors, lights, editor, programmatic), `AgentSkillToolset.ListSkills`. Report the exact tool names, and whether a Movie Render Queue tool exists. | I have the tool names. Nothing has changed. |
| 1 Stage | Save. Make `/Game/Previs/Maps/PV_Stage`, then build `stage` (floor, cyc, pedestal, colonnade, props) and the bust from `bust.md`. Folder `Previs/Stage`. Put `bust.md`'s backdrop card (X = 160 cm) in `Previs/Stage/LookdevCard`, hidden: it is for step 2's stills only. | Screenshots from (−300, 0, 150) and (−1200, −600, 400). |
| 2 Lighting | Build every preset in `lighting` into `Previs/Lights/<preset>`. Leave only Rembrandt on. Show the LookdevCard for the comparison stills, then hide it again. | Bust screenshots under rembrandt, butterfly and split: the cheek triangle and the nose shadow both read. |
| 3 Sequence | Create the `PV_Master` sequence at 24 fps. Per shot, make a subsequence at `masterStartFrame` with a spawnable camera, its keys, and only its own lights on. Add the PV-030 pivot, the PV-060 camera B and cuts, and the master camera-cut track. | Three stills per shot (first, middle, last) that match the site's plan views. |
| 4 Render | Movie Render Queue per shot into `<repo>/media/previs/<id>/`. With no MRQ tool: show the `execute_tool_script` Python, explain it, and **wait for OK**. | PNG folders with 101 frames each. |
| 5 Encode | Run `npm run previs:encode` in `<repo>`, paste the printed `media` block into `data/portfolio.js` → `previs.media`, then run `npm run check`. | Check passes; MP4s are ≤ 4 MB each. |
</structure>

<build>
- Discover tools before using them. Tool names differ between engine releases; use only the names
  from step 0.
- Save before and after each step, and read every tool result: anything that is not an explicit
  success is a stop.
- One subsequence per shot (`/Game/Previs/Seq/PV010` …). The camera is spawnable, named as in
  `shot.camera`. PV-060 adds `cameraB`.
- The keys list `loc`, `rot`, `focal` and `focus`. Values hold before the first key and after the
  last.
- Lights in other presets' folders are keyed to 0 inside each subsequence, so the master plays
  with the right light per shot.
- Motion blur:
  - 180° (Motion Blur Amount 0.5) everywhere;
  - PV-060 at 360° (1.0) with 9 temporal samples, which matches Motion Prompt's 9-render blur.
- Check stills before the full render: render frames 0, 50 and 100 of each shot first and show
  them to me.
</build>

<gotchas>
- An orbit keyed on the camera's own transform interpolates a straight chord through the subject's
  circle. Use the pivot.
- Dolly zoom with different easing on focal and location makes the head breathe. Same times, same
  curve.
- `ManualFocusDistance` is depth along the optical axis, not the straight-line distance; the shot
  list already gives depth.
- The crane's tilt under-follows the subject by design (0.86×), so the head sinks low in frame. Do
  not "fix" it with a look-at.
- Camera cuts land on whole frames: the whip's cut is frame 50, even though Motion Prompt's
  midpoint is 2.1 s.
- Auto exposure ruins ratio comparisons between presets. Use Manual exposure, set once.
- `bust.md`'s backdrop card at X = 160 cm hides the colonnade and the cyc. It is for the lighting
  stills only; keep it hidden in every shot, or the dolly zoom and the orbit lose their parallax.
- `execute_tool_script` runs arbitrary Python in the editor. Show it first and wait for an
  explicit OK.
- The PNG folders are git-ignored. Only the encoded `.mp4` and `.jpg` are committed.
</gotchas>

<start>
Use the unreal-mcp skill. Read `<repo>/previs/README.md`, `<repo>/previs/shotlist.json` and
`<repo>/previs/bust.md`. Then do step 0 (Discover) only. It is read-only, so change nothing.
Report the tool names, and wait for me.
</start>
