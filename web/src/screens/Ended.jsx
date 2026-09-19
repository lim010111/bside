import { EmptyState } from '../components/Feedback.jsx';

export default function Ended({ title }) {
  return <section className="screen centered"><h1 tabIndex={-1}>{title} 행사가 종료됐어요</h1><EmptyState title="함께해 주셔서 고마워요" text="운영자가 행사를 마쳐 참가자 정보와 대화를 더 이상 열 수 없어요." /></section>;
}
