// 행사 종료 화면. 누가 판단하나: 운영자가 수동으로 방을 닫는다. 예정 시각도
// 없고 자동 타이머도 없다(development-contract.md "Q15·Q16"). 그 순간부터
// 목록·상세·채팅 조회와 새 메시지 전송이 전부 막힌다.
export default function Ended({ title }) {
  return (
    <section className="screen on">
      <div className="empty" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
        <svg className="ic"><use href="#i-inbox" /></svg>
        <p className="t-md" style={{ margin: '0 0 6px' }}>{title} 행사가 종료됐어요</p>
        <p className="t-sm dim" style={{ margin: 0, lineHeight: 1.6 }}>
          운영자가 방을 닫았어요.<br />목록·상세·채팅을 더 이상 열 수 없어요.
        </p>
      </div>
    </section>
  );
}
