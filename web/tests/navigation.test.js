import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation } from '../src/lib/navigation.js';

function fixture(hash = '#nearby') {
  const entries = [{ hash, state: null }];
  let index = 0;
  const browser = {
    location: { get hash() { return entries[index].hash; } },
    history: {
      get state() { return entries[index].state; },
      replaceState(state, _, hash) { entries[index] = { hash, state }; },
      pushState(state, _, hash) { entries.splice(++index, entries.length, { hash, state }); },
      back() { assert.ok(index > 0, 'must not leave the app'); index--; },
    },
  };
  const navigation = createNavigation(browser);
  navigation.initialize();
  const navigate = (view, id, write = true) => { if (write) navigation.write({ view, id }); };
  return { navigation, navigate, browser };
}

test('chat → introduction → back preserves the originating conversation', () => {
  const { navigation, navigate } = fixture();
  navigate('conversations');
  navigate('chat', '상대/1');
  navigate('detail', '상대/1');
  assert.equal(navigation.back(navigate), true);
  assert.deepEqual(navigation.read(), { view: 'chat', id: '상대/1' });
  navigation.back(navigate);
  assert.equal(navigation.read().view, 'conversations');
  navigation.back(navigate);
  assert.equal(navigation.read().view, 'nearby');
  assert.equal(navigation.back(navigate), false);
});

test('tab switches and repeated navigation do not accumulate back loops', () => {
  const { navigation, navigate, browser } = fixture();
  navigate('conversations'); navigate('nearby'); navigate('conversations');
  navigate('profile'); navigate('profile');
  assert.equal(browser.history.state.bsideDepth, 1);
  navigation.back(navigate);
  assert.equal(navigation.read().view, 'conversations');
  navigation.back(navigate);
  assert.equal(navigation.read().view, 'nearby');
});

test('direct chat/detail links fall back inside the app without a history loop', () => {
  for (const view of ['chat', 'detail', 'profile']) {
    const { navigation, navigate } = fixture('#' + view + '/peer');
    navigation.back(navigate);
    assert.equal(navigation.read().view, view === 'chat' ? 'conversations' : 'nearby');
    if (view === 'chat') navigation.back(navigate);
    assert.equal(navigation.back(navigate), false);
  }
});

test('a reload retains app history and malformed ID encoding does not throw', () => {
  const { navigate, browser } = fixture();
  navigate('profile');
  const reloaded = createNavigation(browser);
  reloaded.initialize();
  reloaded.back(navigate);
  assert.equal(reloaded.read().view, 'nearby');
  assert.equal(fixture('#detail/%not-encoded').navigation.read().id, undefined);
});
