#!/bin/bash
# Usage: measure.sh <tree> <outdir> [calibrate]
# Runs the F57 measurement set sequentially (at most 2 BDS jobs: only the suite uses 2).
# Holds /home/user/TIMING_SOAK_RUNNING while any timing run is going; fix agents must not run BDS then.
TREE=$1; OUT=$2; CAL=$3
mkdir -p "$OUT"; cd "$TREE" || exit 1
LOCK=/home/user/TIMING_SOAK_RUNNING
echo "$TREE $(date -u +%FT%TZ)" > $LOCK
log() { echo "[$(date -u +%T)] $*" | tee -a "$OUT/progress.log"; }
R="node tools/test-bds/run.mjs --quiet --no-relay"
soak() { # name, extra args... ; one retry when the population was not complete (both kept)
  local name=$1; shift
  log "start $name"
  ( cd ${SOAKDIR:-.} && $R "$@" ) > "$OUT/$name.out" 2>&1; local rc=$?
  log "end $name rc=$rc"; tail -5 "$OUT/$name.out" >> "$OUT/progress.log"
  if [ $rc -ne 0 ] && grep -q 'population: spawned' "$OUT/$name.out"; then
    mv "$OUT/$name.out" "$OUT/$name.try1.out"; [ -f "$OUT/$name.json" ] && mv "$OUT/$name.json" "$OUT/$name.try1.json"
    log "retry $name"; ( cd ${SOAKDIR:-.} && $R "$@" ) > "$OUT/$name.out" 2>&1; rc=$?
    log "end $name retry rc=$rc"; tail -3 "$OUT/$name.out" >> "$OUT/progress.log"
  fi
}
# contamination watch: any second bedrock_server or test-bds job from another tree is logged
( while [ -e $LOCK ] || [ -e /home/user/SUITE_RUNNING ]; do
    n=$(pgrep -xc bedrock_server); o=$(pgrep -fa 'test-bds/(run|suite).mjs' | grep -v "$TREE" | grep -vc calib)
    [ "$n" -gt 2 ] || [ "$o" -gt 0 ] && echo "$(date -u +%T) bds=$n foreign=$o" >> "$OUT/contamination.log"
    sleep 10; done ) &
if [ -n "$CAL" ]; then
  SOAKDIR=/home/user/wt/calib soak calib-7dac598-10 --profile --profile-json "$OUT/calib-7dac598-10.json" --scenario tools/test-bds/examples/perf-soak.js --arg players=10 --arg seconds=300 --timeout 3000
fi
soak soak-10  --profile --profile-json "$OUT/soak-10.json"  --scenario tools/test-bds/examples/perf-soak.js --arg players=10  --arg seconds=900 --timeout 5000
soak soak-40  --profile --profile-json "$OUT/soak-40.json"  --scenario tools/test-bds/examples/perf-soak.js --arg players=40  --arg seconds=900 --timeout 6000
soak soak-100 --profile --profile-json "$OUT/soak-100.json" --scenario tools/test-bds/examples/perf-soak.js --arg players=100 --arg seconds=300 --timeout 6000
soak bundle-10 --flat --bundle dist/realm_bundle.mcpack --profile --profile-json "$OUT/bundle-10.json" --scenario tools/test-bds/examples/perf-soak.js --arg players=10 --arg seconds=300 --timeout 3000
soak bundle-40 --flat --bundle dist/realm_bundle.mcpack --profile --profile-json "$OUT/bundle-40.json" --scenario tools/test-bds/examples/perf-soak.js --arg players=40 --arg seconds=300 --timeout 4000
soak saga-100 --profile --profile-json "$OUT/saga-100.json" --only saga_bp,npc_bp,hud_bp --scenario tools/test-bds/examples/saga-perf-quests.js --arg players=100 --arg seconds=120 --timeout 4000
soak weather-crowd-40 --profile --profile-json "$OUT/weather-crowd-40.json" --only rain_bp,weather_bp,storm_bp,climate_bp,calendar_bp,tornado_bp,rainbow_bp,moon_bp,meteor_bp,night_bp,leaves_bp,translucent_bp --scenario tools/test-bds/examples/weather-crowd.js --arg players=40 --timeout 3000
soak autostore-perf --profile --profile-json "$OUT/autostore-perf.json" --only stash_bp --scenario docs/audits/2026-10-deep-audit/fleet-review/scenarios/autostore-perf.js --timeout 600
# 60-minute unprofiled memory soak at 40, RSS of bedrock_server every 10 s
log "start mem-40"
$R --scenario tools/test-bds/examples/perf-soak.js --arg players=40 --arg seconds=3600 --timeout 6000 > "$OUT/mem-40.out" 2>&1 &
RP=$!
: > "$OUT/mem-40.rss.csv"
while kill -0 $RP 2>/dev/null; do
  for p in $(pgrep -f bedrock_server); do echo "$(date +%s),$p,$(awk '/VmRSS/{print $2}' /proc/$p/status 2>/dev/null)" >> "$OUT/mem-40.rss.csv"; done
  sleep 10
done
wait $RP; log "end mem-40 rc=$?"
rm -f $LOCK
# Full suite last (2 BDS jobs); not a timing run, but nothing else may run BDS while it goes either.
echo "suite $(date -u +%FT%TZ)" > /home/user/SUITE_RUNNING
log "start suite"
node tools/test-bds/suite.mjs --jobs 2 --retry --json "$OUT/suite.json" > "$OUT/suite.out" 2>&1
log "end suite rc=$?"; tail -30 "$OUT/suite.out" >> "$OUT/progress.log"
rm -f /home/user/SUITE_RUNNING
log DONE
