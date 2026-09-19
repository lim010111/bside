export default function PersonCard({ participant, ranked, onOpen }) {
  return <button type="button" className="person" onClick={() => onOpen(participant.id)}>
    <span className="section-head"><strong className="trunc">{participant.nickname}</strong>{ranked && <span className="badge">추천</span>}</span>
    <span className="person-description clamp-two">{participant.self_description}</span>
    <span className="sr-only">상세 보기</span>
  </button>;
}
