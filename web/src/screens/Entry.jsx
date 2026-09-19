import { useRef, useState } from 'react';
import { useRoom } from '../use-room.js';
import { LIMITS, lengthOf, validateProfile } from '../lib/contracts.js';
import { ErrorNotice, PageHeader } from '../components/Feedback.jsx';

export default function Entry() {
  const { state, actions } = useRoom();
  const { me, room, busy } = state;
  const editing = Boolean(me);
  const form = useRef(null);
  const [values, setValues] = useState(() => ({
    nickname: me?.nickname ?? '', self_description: me?.self_description ?? '', connection_intent: me?.connection_intent ?? '',
  }));
  const [version, setVersion] = useState(me?.profile_version);
  const [fields, setFields] = useState({});
  const [error, setError] = useState(null);
  const stopped = me?.participation_status === 'stopped';
  const changedElsewhere = editing && me.profile_version !== version;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const errors = validateProfile(values, editing);
    setFields(errors); setError(null);
    if (Object.keys(errors).length) { form.current.elements.namedItem(Object.keys(errors)[0])?.focus(); return; }
    const payload = { self_description: values.self_description.trim(), connection_intent: values.connection_intent.trim() };
    if (editing) payload.expected_profile_version = version;
    else payload.nickname = values.nickname.trim();
    const result = await actions.mutate(editing ? 'updateMe' : 'join', payload);
    if (result.error) {
      setError(result.error); setFields(result.error.fields ?? {});
      if (Object.keys(result.error.fields ?? {}).length) form.current.elements.namedItem(Object.keys(result.error.fields)[0])?.focus();
    }
  }
  async function toggleParticipation() {
    setError(null);
    const result = await actions.mutate(stopped ? 'resume' : 'stop');
    if (result.error) setError(result.error);
  }
  function reloadProfile() {
    setValues({ nickname: me.nickname, self_description: me.self_description, connection_intent: me.connection_intent });
    setVersion(me.profile_version); setError(null); setFields({});
  }
  const input = (name, label, placeholder, multiline = false) => {
    const Component = multiline ? 'textarea' : 'input';
    return <div className="form-group">
      <div className="field-label"><label htmlFor={name}>{label}</label><span id={name + '-count'} className="counter">{lengthOf(values[name].trim())} / {LIMITS[name]}</span></div>
      <Component id={name} name={name} className="field" placeholder={placeholder} autoComplete={name === 'nickname' ? 'nickname' : 'off'}
        value={values[name]} disabled={Boolean(busy)} rows={4}
        aria-invalid={Boolean(fields[name])} aria-describedby={name + '-count' + (fields[name] ? ' ' + name + '-error' : '')}
        onChange={(event) => { setValues({ ...values, [name]: event.target.value }); setFields({ ...fields, [name]: null }); }} />
      {fields[name] && <p className="field-error" id={name + '-error'}>{fields[name]}</p>}
    </div>;
  };
  return <section className="screen entry-screen">
    <PageHeader title={editing ? '내 정보' : room.name} onBack={editing ? () => actions.navigate('people') : undefined} eyebrow={editing ? me.nickname : 'Bside · 함께 이야기할 사람을 찾아요'} />
    <p className="intro">{editing ? '지금의 나와 만나고 싶은 사람을 알려주세요.' : '어떤 이야기를 나누고 싶나요?\n소개를 남기고 같은 행사 사람들을 만나보세요.'}</p>
    <p className="privacy-note">자기소개와 찾는 사람은 같은 행사 참가자가 볼 수 있어요.</p>
    <form ref={form} onSubmit={submit} noValidate className="profile-form">
      {!editing && input('nickname', '닉네임', '어떤 이름으로 불러드릴까요?')}
      {input('self_description', '자기소개', '퇴근 후 작은 앱을 만드는 프론트엔드 개발자입니다.', true)}
      {input('connection_intent', '어떤 사람을 만나고 싶나요?', '사이드 프로젝트를 만드는 사람과 시행착오를 나누고 싶어요.', true)}
      {changedElsewhere && <div className="notice" role="status"><p>다른 화면에서 정보가 바뀌었어요. 작성 중인 내용은 그대로 남겨뒀어요.</p><button type="button" className="text-button" onClick={reloadProfile}>최신 정보 불러오기</button></div>}
      <ErrorNotice error={error} />
      <div className="form-actions"><button type="submit" className="btn" disabled={Boolean(busy) || changedElsewhere}>{busy === 'join' || busy === 'updateMe' ? '저장 중…' : editing ? '변경 내용 저장' : '참여하기'}</button></div>
    </form>
    {editing && <div className="participation-panel">
      <h2>{stopped ? '참여를 잠시 쉬고 있어요' : '잠시 쉬고 싶다면'}</h2>
      <p className="dim">{stopped ? '기존 대화는 볼 수 있어요. 재개하면 목록에 다시 표시되고 메시지를 주고받을 수 있어요.' : '참여를 중단하면 목록에서 숨겨지고 새 메시지를 주고받지 않아요. 기존 대화는 유지돼요.'}</p>
      <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={toggleParticipation}>{busy === 'resume' || busy === 'stop' ? '변경 중…' : stopped ? '참여 재개하기' : '참여 중단하기'}</button>
    </div>}
  </section>;
}
