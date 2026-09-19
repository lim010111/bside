import { PageHeader, EmptyState } from '../components/Feedback.jsx';

export default function Dashboard() {
  return <section className="screen">
    <PageHeader title="운영진 화면" eyebrow="Bside" />
    <EmptyState title="운영진 대시보드는 준비 중이에요" text="참가자 입장과 대화는 참가자 화면에서 이용할 수 있어요."
      action={<a className="btn btn-ghost" href={window.location.pathname + '?r=' + encodeURIComponent(new URLSearchParams(window.location.search).get('r') || 'KOSS26')}>참가자 화면으로</a>} />
  </section>;
}
