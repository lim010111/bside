// 상태 4종 고르기. prototype의 renderPicks()/pick()(608~618줄)를 컴포넌트로.
import { STATUSES } from '../api/index.js';

export default function StatusPicker({ value, onChange }) {
  return (
    <div className="picks">
      {STATUSES.map((s) => (
        <button
          key={s.k}
          type="button"
          className={`pick s-${s.k}`}
          aria-pressed={value === s.k}
          onClick={() => onChange(s.k)}
        >
          <svg className="ic"><use href={`#${s.icon}`} /></svg>
          <b>{s.label}</b>
        </button>
      ))}
    </div>
  );
}
