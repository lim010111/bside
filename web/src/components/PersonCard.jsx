// 목록 배너 하나. "간결한 배너로 표시하고 추천 우선순위를 반영. 교류 의도·
// 추천 이유 전문과 숫자 점수는 목록에 펼치지 않음"(development-contract.md).
// 그래서 여기 보이는 건 닉네임 + 자기소개 한 줄뿐 — 추천 이유는 상세에서만.
export default function PersonCard({ participant, ranked, onOpen }) {
  return (
    <button type="button" className="person" onClick={() => onOpen(participant.id)}>
      <div className="row" style={{ gap: 8 }}>
        <span className="t-lg grow trunc">{participant.nickname}</span>
        {ranked && <span className="badge">추천</span>}
      </div>
      <div className="t-body wrap" style={{ marginTop: 4 }}>{participant.self_description}</div>
    </button>
  );
}
