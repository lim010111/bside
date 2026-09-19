// Characterize recommendation delivery in the production controller. No radio,
// network or AI; records current behavior, including a stale detail screen.
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createDiscoveryController } from '../../../web/src/discovery-controller.js';
import { fixture, fakeNative, observed, until } from '../../../web/tests/helpers.js';

const data = await fixture({ withProfile: true });
const native = fakeNative();
const controller = createDiscoveryController({ api: data.api, native, credentials: data.credentials });
try {
  await controller.start();
  await until(() => !controller.getState().conversationsLoading);
  await setImmediate();
  const pending = observed('latency-person', '상대', { recommendation: { status: 'pending', rank: 0 } });
  native.pushObservations({ observed_users: [pending] });
  controller.navigate('detail', pending.user_id);
  const ready = { ...pending, recommendation: { status: 'ready', rank: 0, reason: '공통 관심사가 있어요.' } };
  native.pushObservations({ observed_users: [ready] });
  assert.equal(controller.getState().people[0].recommendation.status, 'ready');
  const afterPush = {
    list: controller.getState().people[0].recommendation.status,
    detail: controller.getState().detail.recommendation.status,
  };
  await controller.refreshAll();
  console.log(JSON.stringify({
    mode: 'offline; production controller, fake native observation events',
    after_native_ready_event: afterPush,
    after_full_refresh: { detail: controller.getState().detail.recommendation.status },
  }, null, 2));
} finally {
  controller.dispose();
}
