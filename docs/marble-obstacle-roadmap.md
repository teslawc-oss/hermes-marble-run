# Marble Obstacle Roadmap

> This roadmap is the working agreement for future obstacle development.

## Operating Rules

- Create a rollback point before starting each obstacle. Prefer a git commit or lightweight tag on a clean branch before code changes.
- Keep one obstacle per development slice. Do not bundle multiple new obstacle implementations unless explicitly requested.
- Verify the new obstacle in browser before claiming it works. Evidence must include console checks and a visual inspection pass.
- Validate spectacle and flow: the obstacle should look distinct, read clearly from the broadcast camera, and produce interesting race moments.
- Validate safety: marbles must not repeatedly stall, clip through rails, get trapped, or produce long no-progress sections.
- If validation fails, rollback to the pre-obstacle point or revert only that obstacle before trying a safer design.
- Close browser tabs after verification.

## Verification Checklist Per Obstacle

1. Backup / rollback
   - Confirm current branch and status.
   - Commit or tag the pre-development state.
   - Record the rollback command in the task notes.

2. Static verification
   - Run syntax/build checks for the Marble Race repo.
   - Sync/verify dashboard obstacle catalog if dashboard options are affected.

3. Browser console verification
   - Force or seed the new obstacle type so it appears without relying on random generation.
   - Confirm the app can remain idle/ready for inspection when possible.
   - Confirm visual mesh, physics body, debug payload, catalog entry, category, dimensions, and track-slope alignment.
   - Confirm no obvious collider/mesh mismatch.

4. Flow / anti-stall verification
   - Run focused race simulations or render checks with the new obstacle enabled.
   - Watch for stalled marbles, trapped marbles, excessive pileups, rail leaks, or no-forward-progress loops.
   - Check console/debug output for DNF/no-progress/stall indicators when available.

5. Visual quality verification
   - Inspect from broadcast/default camera and a focused obstacle camera.
   - Confirm the obstacle is visually distinct from existing bumpers/gates/targets.
   - Confirm effects are dramatic but not cluttered.

## Release Ratio

Use a repeating 7-week cycle:

- 5 normal obstacles
- 1 buff obstacle
- 1 debuff obstacle

This keeps the long-term balance at 5:1:1.

## 14-Week Candidate Roadmap

1. Week 1 normal — `tiltBridge`
   - A narrow bridge that tilts left/right like a small pirate-ship platform.
   - Goal: timing and stability without using a bumper/gate shape.

2. Week 2 normal — `orbitRing`
   - A half-ring guide that carries marbles around a visible arc before releasing them.
   - Goal: cinematic circular motion and overtakes.

3. Week 3 normal — `splitterFork`
   - A Y-shaped splitter with two exits and different launch angles.
   - Goal: route choice and pack separation.

4. Week 4 normal — `pendulumHammer`
   - A swinging hammer with strong readable timing.
   - Goal: big slow-motion collision moments.

5. Week 5 normal — `ripplePads`
   - A sequence of small pads that rise/fall like a wave.
   - Goal: rhythmic motion and chain reactions.

6. Week 6 buff — `draftTunnel`
   - A short wind tunnel that grants a temporary forward speed boost.
   - Goal: visible comeback moments with blue wind particles.

7. Week 7 debuff — `stickyTarPatch`
   - A dark sticky patch that briefly reduces speed/rotation.
   - Goal: readable slowdown without permanently trapping marbles.

8. Week 8 normal — `elevatorStep`
   - A rising/falling platform step.
   - Goal: vertical timing distinct from `movingGate`.

9. Week 9 normal — `flipperPair`
   - A pair of pinball flippers that slap marbles across lanes.
   - Goal: classic arcade readability and sudden lane changes.

10. Week 10 normal — `magnetArc`
    - An electric arc that gently bends marble paths sideways.
    - Goal: lateral drama without direct speed boost/penalty.

11. Week 11 normal — `rollingLog`
    - A horizontal rolling cylinder across the lane.
    - Goal: physical pushing/deflection with clear silhouette.

12. Week 12 normal — `cannonPopper`
    - A floor air cannon that pops marbles upward slightly.
    - Goal: vertical spectacle and clean white smoke effects.

13. Week 13 buff — `shieldStar`
    - A golden star that gives a short shield against the next debuff/heavy hit.
    - Goal: visible racer state and strategic recovery.

14. Week 14 debuff — `confettiScrambler`
    - A colorful disruption field that adds brief lateral wobble.
    - Goal: playful penalty that looks fun, not punitive.
