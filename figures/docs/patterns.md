# Aven exercise library: movement patterns

Rules every figure follows (look, build, grip, motion and timing, loop, camera, render, checks): [figure-rules.md](figure-rules.md).

One pattern = one body choreography on the full-body rig (its own `motions/<pattern>.py`). Each exercise in a pattern reuses that choreography; only the equipment (prop) and, where noted, the bench angle or grip changes, then it is re-rendered.

- Built-in library: **185 exercises** (`src/data/exercises.ts` + `exercises-more.ts`). Omar's custom exercises live on his phone and are not counted here.
- They collapse into **99 patterns**. About 25 of those are single-exercise or near-static holds (plank, wall sit, dead hang) that are quick to author.
- Most patterns need their own equipment model too (benches at angles, cable stack, rack, machines, cardio machines). Machines are the slowest part to build, slower than the motion.
- Done: **Standing curl** (barbell curl, live in v0.1.110). Its 6 equipment twins are next-cheapest: same motion, new prop.

Order to work in: Omar's own saved workouts and recent history first (read from his backup or asked), then the most common patterns (presses, squats, deadlift/RDL, rows, pull-ups, pulldown, overhead press, raises, pushdown, leg press/curl/extension), then the rest.

## Flat press, lying  (7)
_lying on a flat bench, press from chest to straight arms_

- Barbell Bench Press (`bench-press`): barbell + rack + flat bench
- Close-grip Bench Press (`close-grip-bench`): barbell, hands narrow
- Smith Machine Bench Press (`smith-bench-press`): smith machine + flat bench
- Smith Machine Close-grip Bench (`smith-close-grip-bench`): smith machine, hands narrow
- Dumbbell Bench Press (`db-bench-press`): dumbbells + flat bench
- Svend Press (`svend-press`): plate squeezed at the chest (press forward variant)
- Dumbbell Floor Press (`db-floor-press`): dumbbells, lying on the floor (no bench)

## Incline press, lying  (3)
_bench at 30-45°, press up over the upper chest_

- Incline Barbell Bench Press (`incline-bench-press`): barbell + incline bench
- Incline Dumbbell Press (`incline-db-press`): dumbbells + incline bench
- Incline Smith Machine Press (`smith-incline-press`): smith + incline bench

## Decline press, lying  (3)
_decline bench, legs hooked, press over the lower chest_

- Decline Barbell Bench Press (`decline-bench-press`): barbell + decline bench
- Decline Dumbbell Press (`decline-db-press`): dumbbells + decline bench
- Decline Smith Machine Press (`smith-decline-press`): smith + decline bench

## Seated machine press  (2)
_seated, back on the pad, handles pushed forward_

- Machine Chest Press (`machine-chest-press`): chest press machine
- Incline Machine Chest Press (`incline-machine-press`): incline press machine

## Fly, lying  (2)
_lying, soft elbows, arms open wide and hug back up_

- Dumbbell Fly (`db-fly`): dumbbells + flat bench
- Incline Dumbbell Fly (`incline-db-fly`): dumbbells + incline bench

## Fly, standing cable  (3)
_split stance between two pulleys, arms sweep together_

- Cable Fly (`chest-fly-cable`): cable crossover, pulleys at chest
- Low-to-High Cable Fly (`low-cable-fly`): pulleys low, sweep up
- High-to-Low Cable Fly (`high-cable-fly`): pulleys high, sweep down

## Pec deck  (2)
_seated, arms on pads/handles, sweep together_

- Pec Deck (`pec-deck`): pec deck machine
- Reverse Pec Deck (`reverse-pec-deck`): same machine facing the pad, arms sweep back (rear delts)

## Push-up  (4)
_plank on hands, body lowers and presses as one line_

- Push-up (`push-up`): floor
- Incline Push-up (`incline-push-up`): hands on a bench
- Decline Push-up (`decline-push-up`): feet on a bench
- Diamond Push-up (`diamond-push-up`): hands together

## Pike push-up  (1)
_hips high, head lowers between the hands_

- Pike Push-up (`pike-push-up`): floor

## Dip  (3)
_on parallel bars, body lowers and presses up_

- Dip (`dip`): dip bars
- Assisted Dip (`assisted-dip`): assisted dip machine (knee pad)
- Seated Dip Machine (`machine-dip`): seated dip machine (seated variant)

## Bench dip  (1)
_hands on a bench behind, hips lower and press_

- Bench Dip (`bench-dip`): flat bench

## Pullover  (1)
_lying across a bench, straight-ish arms arc behind the head_

- Dumbbell Pullover (`db-pullover`): one dumbbell + flat bench

## Deadlift from floor  (4)
_hinge + squat from the floor to standing_

- Deadlift (`deadlift`): barbell
- Sumo Deadlift (`sumo-deadlift`): barbell, wide stance
- Trap Bar Deadlift (`trap-bar-deadlift`): trap bar
- Rack Pull (`rack-pull`): barbell from blocks/rack at knee height

## Romanian deadlift  (3)
_hinge from standing, bar slides to mid-shin_

- Romanian Deadlift (`romanian-deadlift`): barbell
- Smith Machine Romanian Deadlift (`smith-rdl`): smith machine
- Good Morning (`good-morning`): barbell on the back (bar stays on traps)

## Single-leg RDL  (1)
_balance on one leg, hinge with the other leg back_

- Single-leg Romanian Deadlift (`single-leg-rdl`): dumbbell(s)

## Bent-over row  (4)
_hinged ~45°, row to the ribs_

- Barbell Row (`barbell-row`): barbell
- Pendlay Row (`pendlay-row`): barbell from the floor each rep
- Smith Machine Row (`smith-row`): smith machine
- T-bar Row (`tbar-row`): T-bar / landmine handle

## One-arm row  (1)
_hand and knee on a bench, row one dumbbell_

- One-arm Dumbbell Row (`one-arm-db-row`): dumbbell + flat bench

## Chest-supported row  (3)
_chest on an incline pad, row up_

- Chest-supported Dumbbell Row (`chest-supported-row`): dumbbells + incline bench
- Seal Row (`seal-row`): barbell/dumbbells, lying on a high flat bench
- Machine Row (`machine-row`): row machine

## Seated cable row  (2)
_seated, feet braced, row the handle to the belly_

- Seated Cable Row (`seated-cable-row`): low cable + V handle
- Single-arm Cable Row (`single-arm-cable-row`): one handle, one arm

## Pull-up  (5)
_hang and pull the chest to the bar_

- Pull-up (`pull-up`): pull-up bar, overhand
- Chin-up (`chin-up`): pull-up bar, underhand
- Neutral-grip Pull-up (`neutral-grip-pull-up`): parallel handles
- Towel Pull-up (`towel-pull-up`): towels over the bar
- Assisted Pull-up (`assisted-pull-up`): assisted machine (knee pad)

## Lat pulldown  (3)
_seated under the pad, pull the bar to the upper chest_

- Lat Pulldown (`lat-pulldown`): pulldown machine, wide bar
- Close-grip Lat Pulldown (`close-grip-pulldown`): V handle
- Single-arm Cable Pulldown (`single-arm-pulldown`): one handle, one arm

## Straight-arm pulldown  (1)
_standing hinge, straight arms sweep down_

- Straight-arm Pulldown (`straight-arm-pulldown`): high cable + bar/rope

## Inverted row  (1)
_body straight under a bar, pull the chest up_

- Inverted Row (`inverted-row`): bar in a rack / smith

## Face pull  (1)
_standing, rope pulled to the face, elbows high_

- Face Pull (`face-pull`): high cable + rope

## Back extension  (1)
_hips on the pad, hinge down and up_

- Back Extension (`back-extension`): 45° back-extension bench

## Shrug  (2)
_standing, shoulders lift to the ears_

- Shrug (`shrug`): barbell or dumbbells
- Smith Machine Shrug (`smith-shrug`): smith machine

## Dead hang  (1)
_hang still from a bar (breathing, slight sway)_

- Dead Hang (`dead-hang`): pull-up bar

## Standing overhead press  (2)
_standing, bar from the shoulders to overhead_

- Overhead Press (`overhead-press`): barbell
- Landmine Press (`landmine-press`): landmine, one arm, angled up

## Push press  (1)
_small dip and drive, then the press_

- Push Press (`push-press`): barbell

## Seated overhead press  (4)
_seated upright, press overhead_

- Dumbbell Shoulder Press (`db-shoulder-press`): dumbbells + upright bench
- Arnold Press (`arnold-press`): dumbbells, palms rotate
- Machine Shoulder Press (`machine-shoulder-press`): shoulder press machine
- Smith Machine Shoulder Press (`smith-shoulder-press`): smith + upright bench

## Lateral raise  (3)
_standing, arms rise out to the sides_

- Lateral Raise (`lateral-raise`): dumbbells
- Single-arm Cable Lateral Raise (`cable-lateral-raise`): low cable, one arm
- Machine Lateral Raise (`machine-lateral-raise`): lateral raise machine (seated)

## Front raise  (1)
_standing, straight arms rise in front_

- Front Raise (`front-raise`): dumbbells/plate

## Rear-delt fly  (2)
_hinged forward, arms open out to the sides_

- Rear Delt Fly (`rear-delt-fly`): dumbbells
- Cable Rear Delt Fly (`cable-rear-delt-fly`): crossed cables at shoulder height, standing

## Y raise  (1)
_chest on an incline bench, arms rise in a Y_

- Incline Y-Raise (`incline-y-raise`): light dumbbells + incline bench

## Upright row  (1)
_standing, elbows lead the bar up to the chest_

- Upright Row (`upright-row`): barbell/EZ bar

## Band pull-apart  (1)
_standing, straight arms pull a band apart_

- Band Pull-apart (`band-pull-apart`): resistance band

## Cable external rotation  (1)
_elbow at the side, forearm rotates out_

- Cable External Rotation (`cable-external-rotation`): cable at elbow height

## Standing curl  (7)
_standing, elbows at the sides, curl to the shoulders  [DONE: barbell-curl r10]_

- Barbell Curl (`barbell-curl`): barbell  ✓ live
- EZ-bar Curl (`ez-bar-curl`): EZ bar
- Dumbbell Curl (`db-curl`): dumbbells
- Hammer Curl (`hammer-curl`): dumbbells, neutral grip
- Reverse Curl (`reverse-curl`): barbell/EZ, overhand
- Cable Curl (`cable-curl`): low cable + bar
- Rope Hammer Curl (`rope-hammer-curl`): low cable + rope

## Preacher curl  (3)
_upper arms on an angled pad, curl_

- Preacher Curl (`preacher-curl`): EZ bar + preacher bench
- Machine Preacher Curl (`machine-preacher-curl`): preacher curl machine
- Spider Curl (`spider-curl`): chest on an incline bench, arms hanging (pad-free variant)

## Incline curl  (1)
_lying back on an incline bench, arms hanging behind_

- Incline Dumbbell Curl (`incline-db-curl`): dumbbells + incline bench

## Concentration curl  (1)
_seated, elbow on the inner thigh, one arm_

- Concentration Curl (`concentration-curl`): dumbbell + bench

## Bayesian curl  (1)
_facing away from a low cable, arm behind, curl_

- Bayesian Cable Curl (`bayesian-curl`): low cable, one arm

## Triceps pushdown  (3)
_standing at a high cable, elbows pinned, push down_

- Triceps Pushdown (`tricep-pushdown`): bar
- Rope Pushdown (`rope-pushdown`): rope
- Single-arm Cable Pushdown (`single-arm-pushdown`): one handle

## Skullcrusher  (1)
_lying, forearms lower the bar to the forehead and extend_

- Skullcrusher (`skullcrusher`): EZ bar + flat bench

## Overhead triceps extension  (2)
_arms overhead, forearms lower behind the head_

- Overhead Triceps Extension (`overhead-tricep-ext`): one dumbbell, seated/standing
- Overhead Cable Triceps Extension (`overhead-cable-extension`): cable + rope, facing away

## Kickback  (1)
_hinged, upper arm still, forearm extends back_

- Triceps Kickback (`db-kickback`): dumbbell + bench support

## Wrist curl  (2)
_forearms on the thighs/bench, wrists curl_

- Wrist Curl (`wrist-curl`): barbell/dumbbells, palms up
- Reverse Wrist Curl (`reverse-wrist-curl`): palms down

## Back squat  (5)
_bar on the back, squat to depth_

- Back Squat (`back-squat`): barbell + rack
- Smith Machine Squat (`smith-squat`): smith machine
- Box Squat (`box-squat`): barbell + box behind
- Belt Squat (`belt-squat`): belt squat machine (load at the hips)
- Pendulum Squat (`pendulum-squat`): pendulum squat machine

## Front-loaded squat  (4)
_load in front, torso upright, squat_

- Front Squat (`front-squat`): barbell in front rack
- Goblet Squat (`goblet-squat`): one dumbbell/kettlebell at the chest
- Bodyweight Squat (`bodyweight-squat`): arms forward, no load
- Jump Squat (`jump-squat`): bodyweight, explodes into a jump

## Hack squat  (1)
_back on the sled pad, squat on the angle_

- Hack Squat (`hack-squat`): hack squat machine

## Leg press  (3)
_seated on the sled, press the platform away_

- Leg Press (`leg-press`): leg press machine
- Single-leg Leg Press (`single-leg-press`): same, one leg
- Leg Press Calf Raise (`leg-press-calf-raise`): same, only the ankles move

## Split squat  (2)
_one foot forward, other back, drop straight down_

- Bulgarian Split Squat (`bulgarian-split-squat`): rear foot on a bench, dumbbells
- Smith Machine Split Squat (`smith-split-squat`): smith machine

## Lunge  (3)
_step and lower, then return_

- Walking Lunge (`walking-lunge`): dumbbells, travelling forward
- Reverse Lunge (`reverse-lunge`): step back
- Lateral Lunge (`lateral-lunge`): step to the side

## Step-up  (1)
_step onto a box and stand tall_

- Step-up (`step-up`): box/bench + dumbbells

## Sissy squat  (1)
_knees travel forward, body leans back in one line_

- Sissy Squat (`sissy-squat`): bodyweight / sissy pad

## Wall sit  (1)
_back on a wall, thighs level, hold (breathing)_

- Wall Sit (`wall-sit`): wall

## Leg extension  (1)
_seated, knees straighten against a pad_

- Leg Extension (`leg-extension`): leg extension machine

## Leg curl, seated  (2)
_seated, heels pull down and back_

- Leg Curl (`leg-curl`): leg curl machine
- Seated Leg Curl (`seated-leg-curl`): seated leg curl machine

## Leg curl, lying  (1)
_face down, heels curl to the glutes_

- Lying Leg Curl (`lying-leg-curl`): lying leg curl machine

## Nordic curl  (1)
_kneeling, body lowers forward from the knees_

- Nordic Hamstring Curl (`nordic-curl`): ankles anchored

## Hip thrust  (3)
_upper back on a bench, hips drive up_

- Hip Thrust (`hip-thrust`): barbell + bench
- Smith Machine Hip Thrust (`smith-hip-thrust`): smith + bench
- Hip Thrust Machine (`hip-thrust-machine`): hip thrust machine

## Glute bridge  (1)
_lying on the floor, hips lift_

- Glute Bridge (`glute-bridge`): floor, optional bar

## Glute kickback  (1)
_one leg kicks straight back_

- Cable Glute Kickback (`glute-kickback`): cable ankle strap or machine

## Hip abduction / adduction  (2)
_seated, knees press out / squeeze in_

- Hip Abduction Machine (`hip-abduction`): hip abduction machine
- Hip Adduction Machine (`hip-adduction`): same machine, inward

## Standing calf raise  (2)
_standing on the balls of the feet, heels rise_

- Standing Calf Raise (`standing-calf-raise`): calf machine / step
- Smith Machine Calf Raise (`smith-calf-raise`): smith on a step

## Seated calf raise  (1)
_seated, pad on the knees, heels rise_

- Seated Calf Raise (`seated-calf-raise`): seated calf machine

## Kettlebell swing  (1)
_hip hinge snaps the bell to chest height_

- Kettlebell Swing (`kb-swing`): kettlebell

## Sled push  (1)
_leaning into a sled, driving steps_

- Sled Push (`sled-push`): sled

## Plank  (2)
_forearm plank, hold (breathing)_

- Plank (`plank`): floor
- Side Plank (`side-plank`): on one forearm, side on

## Hollow / dead bug  (2)
_on the back, low back pressed down_

- Hollow Hold (`hollow-hold`): hold
- Dead Bug (`dead-bug`): opposite arm and leg extend

## Crunch  (3)
_on the back, ribs curl to the hips_

- Crunch (`crunch`): floor
- Decline Sit-up (`decline-sit-up`): decline bench, full sit-up
- Ab Crunch Machine (`machine-crunch`): ab crunch machine (seated)

## Cable crunch  (1)
_kneeling at a high cable, crunch down_

- Cable Crunch (`cable-crunch`): high cable + rope

## Hanging leg raise  (2)
_hanging, legs lift_

- Hanging Leg Raise (`hanging-leg-raise`): pull-up bar, straight legs
- Captain’s Chair Knee Raise (`knee-raise`): captain's chair / bar, knees up

## Lying leg raise  (1)
_on the back, straight legs lift_

- Lying Leg Raise (`lying-leg-raise`): floor / bench

## Ab wheel  (1)
_kneeling, roll out long and back_

- Ab Wheel Rollout (`ab-wheel`): ab wheel

## Russian twist  (1)
_seated leaning back, rotate side to side_

- Russian Twist (`russian-twist`): plate/dumbbell or none

## Pallof press  (1)
_standing side-on to a cable, press out and hold_

- Pallof Press (`pallof-press`): cable at chest height

## Woodchop  (1)
_diagonal rotation, high to low_

- Cable Woodchopper (`cable-woodchop`): cable

## Mountain climber  (1)
_plank, knees drive in fast alternating_

- Mountain Climbers (`mountain-climber`): floor

## Farmer carry  (1)
_walking tall with weights at the sides (loop: walk in place)_

- Farmer’s Carry (`farmer-carry`): dumbbells/kettlebells

## Clean  (2)
_pull from the floor/hang and catch in the front rack_

- Power Clean (`power-clean`): barbell
- Kettlebell Clean (`kb-clean`): kettlebell, one arm

## Snatch  (1)
_one motion floor to overhead_

- Kettlebell Snatch (`kb-snatch`): kettlebell

## Kettlebell press  (1)
_one-arm press from the rack_

- Kettlebell Press (`kb-press`): kettlebell

## Thruster  (1)
_front squat straight into a press_

- Dumbbell Thruster (`db-thruster`): dumbbells

## Turkish get-up  (1)
_floor to standing with the bell overhead (long clip)_

- Turkish Get-up (`turkish-get-up`): kettlebell

## Burpee  (1)
_drop to a plank, back up, jump_

- Burpee (`burpee`): floor

## Box jump  (1)
_swing arms, jump onto a box, step down_

- Box Jump (`box-jump`): plyo box

## Med-ball slam  (1)
_ball overhead, slam down_

- Medicine Ball Slam (`med-ball-slam`): slam ball

## Battle ropes  (1)
_athletic stance, arms make waves_

- Battle Ropes (`battle-ropes`): ropes

## Rope climb  (1)
_climb hand over hand_

- Rope Climb (`rope-climb`): rope

## Jump rope  (1)
_small bounces, wrists turn the rope_

- Jump Rope (`jump-rope`): rope

## Sprawl / wrestling  (2)
_drop the hips to the floor and pop up; wrestling stance drill_

- Sprawls (`sprawl`): floor
- Wrestling Drilling (`wrestling-drill`): stance, shots and sprawls

## Run / walk  (4)
_running or walking gait (in place)_

- Run (`run`): none
- Walk (`walk`): none
- Treadmill (`treadmill`): treadmill
- Incline Treadmill Walk (`incline-walk`): treadmill on an incline

## Bike  (3)
_seated pedalling_

- Stationary Bike (`stationary-bike`): stationary bike
- Cycling (`cycling`): road bike
- Air Bike (`air-bike`): air bike, arms push and pull too

## Rowing machine  (1)
_drive with the legs, lean back, pull_

- Rowing Machine (`rowing-machine`): rower

## Ski erg  (1)
_arms pull down with a hip hinge_

- SkiErg (`ski-erg`): ski erg

## Stair climber  (1)
_stepping up continuous stairs_

- Stair Climber (`stair-climber`): stair machine

## Cross trainer  (1)
_gliding stride with arm handles_

- Cross Trainer (`cross-trainer`): elliptical

## Swim  (1)
_freestyle stroke (in water; low priority)_

- Swimming (`swim`): water
