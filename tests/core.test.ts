import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, schedule } from '../src/srs';
import { matchesStroke } from '../src/strokes';
import type { Point } from '../src/strokes';
test('SM-2 progression and relearning',()=>{
  const initial={repetitions:0,interval:0,ease:2.5,due:0};
  const one=schedule(initial,'Good',0), two=schedule(one,'Good',DAY);
  assert.equal(one.interval,1); assert.equal(two.interval,6);
  assert.equal(schedule(two,'Good',0).interval,15);
  const fail=schedule(two,'Again',1000);
  assert.equal(fail.due,61000);assert.equal(fail.repetitions,0);
  assert.ok(schedule({...initial,ease:1.3},'Again',0).ease>=1.3);
  assert.ok(schedule(two,'Hard',0).interval<schedule(two,'Good',0).interval);
  assert.ok(schedule(two,'Easy',0).interval>schedule(two,'Good',0).interval);
});
test('writing accepts jitter, rejects reverse, wrong order and scribble',()=>{
  const expected:Point[]=[[100,800],[300,700],[600,600]];
  assert.ok(matchesStroke([[105,802],[302,695],[603,603]],expected));
  assert.equal(matchesStroke([...expected].reverse(),expected),false);
  assert.equal(matchesStroke([[800,800],[800,200]],expected),false);
  assert.equal(matchesStroke([[100,800],[900,100],[100,900],[600,600]],expected),false);
  assert.equal(matchesStroke([[100,800]],expected),false);
});
