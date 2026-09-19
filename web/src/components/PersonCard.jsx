export default function PersonCard({ person, ranked, onOpen }) {
  return <button type="button" className="person" onClick={() => onOpen(person.user_id)}>
    <span className="section-head"><strong className="trunc">{person.profile.nickname}</strong>{ranked && <span className="badge">추천</span>}</span>
    <span className="person-description clamp-two">{person.profile.self_description}</span>
    <span className="sr-only">상세 보기</span>
  </button>;
}
