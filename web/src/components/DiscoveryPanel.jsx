import { useDiscovery } from '../use-discovery.js';
import { nativeBlocker } from '../lib/native.js';

// 발견 참여(사용자의 의사)와 실제 작동(권한·Bluetooth·OS)을 한곳에 두되 분명히 나눈다.
// 권한이 막혀 있다고 해서 참여 설정을 대신 꺼주지 않는다 — 켜둔 의사는 그대로 유지된다.
export default function DiscoveryPanel() {
  const { state, actions } = useDiscovery();
  const enabled = Boolean(state.me?.discovery_enabled);
  const busy = state.busy === 'setDiscovery';
  const blocker = enabled ? nativeBlocker(state.native) : null;
  return <section className="discovery-panel" aria-labelledby="discovery-title">
    <div className="section-head">
      <div>
        <h2 id="discovery-title">주변 발견 {enabled ? '켜짐' : '꺼짐'}</h2>
        <p className="dim">{enabled
          ? '주변 사람에게 내 소개가 보이고, 가까이 있는 사람을 찾고 있어요.'
          : '새로 발견하지 않고 내 소개도 보이지 않아요. 나눈 대화는 그대로 있어요.'}</p>
      </div>
      <button type="button" className="btn btn-ghost" disabled={busy}
        aria-pressed={enabled} onClick={() => actions.setDiscovery(!enabled)}>
        {busy ? '변경 중…' : enabled ? '끄기' : '켜기'}
      </button>
    </div>
    {blocker && <p className={'operation-notice ' + blocker.level} role="status">
      {blocker.text}
      {blocker.action === 'permission' && <button type="button" className="text-button" onClick={actions.requestNativePermission}>권한 허용하기</button>}
    </p>}
  </section>;
}
