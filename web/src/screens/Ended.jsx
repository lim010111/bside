// 행사 종료 화면. scenario.md 컷 8 "행사 종료 후 방이 사라지는 화면"에 대응한다.
//
// 누가 판단하나: 운영진이 방 만들 때 정한 endsAt 시각 하나뿐이다. 그 순간 누가
// 버튼을 누르는 게 아니라, 그냥 now > endsAt을 매 조회마다 비교한다(protocol.md
// 0-1번). 참가자 쪽에서 자동으로 이 화면만 보이게 되는 이유가 그거다.
//
// 실제로 없어지나: 사용자 입장에선 그렇다 — 입장·조회·매칭이 전부 이 화면으로
// 막힌다. 메모리 자체가 그 순간 지워지는 건 아니다(능동적 스윕 없음, DB 없는
// 구조를 단순하게 유지하려고). 완전한 회수는 서버 재시작 때고, 그 전에도 개인
// 상태들은 각자 5분 하트비트로 만료된다.
export default function Ended({ title }) {
  return (
    <section className="screen on">
      <div className="empty" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
        <svg className="ic"><use href="#i-inbox" /></svg>
        <p className="t-md" style={{ margin: '0 0 6px' }}>{title} 행사가 끝났어요</p>
        <p className="t-sm dim" style={{ margin: 0, lineHeight: 1.6 }}>
          방 안의 상태는 전부 사라졌습니다.<br />계정도, 남은 기록도 없습니다.
        </p>
      </div>
    </section>
  );
}
