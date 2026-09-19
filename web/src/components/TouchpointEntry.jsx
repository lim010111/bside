// 접점 상시 진입 행. 사용자 레퍼런스에서 가져온 것 — 매칭 시트가 자동으로 뜨고
// 닫히면, 프로토타입엔 다시 열 방법이 없었다. 이 행이 그 재진입 경로다.
export default function TouchpointEntry({ member, onOpen }) {
  if (!member) return null;
  return (
    <div className="section">
      <span className="t-sm faint">접점 1개</span>
      <button type="button" className="touchpoint-entry" style={{ marginTop: 9 }} onClick={onOpen}>
        <span className="t-lg">{member.name}님과 이야기해 보세요</span>
        <svg className="ic"><use href="#i-arrow-up-right" /></svg>
      </button>
    </div>
  );
}
