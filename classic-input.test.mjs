import assert from 'node:assert/strict';
import test from 'node:test';
import { createClassicWebcamInput } from './classic-input.mjs';

function tracked(id, x, gesture = 'FOLLOW') {
  return { id, position: { x, y: 0.5 }, trackingStatus: 'tracked', gesture };
}

test('the same tracked hand keeps control through reordered detections and coordinates map once', () => {
  const input = createClassicWebcamInput({ width: 320, height: 180 });
  const first = tracked('one', 0.25);
  const second = tracked('two', 0.75);
  assert.deepEqual(input.update({ hands: [first, second] }).hand.target, { x: 80, y: 90 });
  const reordered = input.update({ hands: [second, { ...first, gesture: 'GRAB' }] });
  assert.equal(reordered.hand.handId, 'one');
  assert.equal(reordered.hand.gesture, 'GRAB');
  assert.equal(reordered.changed, false);
  assert.equal(input.update({ hands: [second] }).changed, true);
  assert.equal(input.update({ hands: [] }).hand, undefined);
});

test('horns and two-hand gap events trigger the classic slams once', () => {
  const input = createClassicWebcamInput({ width: 320, height: 180 });
  const hands = [tracked('one', 0.25), tracked('two', 0.75)];
  const events = [
    { type: 'ATTACK', handId: 'two', sequenceId: 1 },
    { type: 'ATTACK', handId: 'one', sequenceId: 2 },
    { type: 'GAP', handIds: ['one', 'two'], timestamp: 3 },
  ];
  assert.deepEqual(input.update({ hands, events }).actions, ['attackSlam', 'defenseSlam']);
  assert.deepEqual(input.update({ hands, events }).actions, []);
});
