import { useRef, useState } from 'react';
import { useDiscovery } from '../use-discovery.js';
import { LIMITS, lengthOf, validateProfile } from '../lib/contracts.js';
import { ErrorNotice, PageHeader } from '../components/Feedback.jsx';

export default function Entry() {
  const { state, actions } = useDiscovery();
  const { me, busy } = state;
  const editing = Boolean(me);
  const form = useRef(null);
  const [values, setValues] = useState(() => ({
    nickname: me?.nickname ?? '', self_description: me?.self_description ?? '', connection_intent: me?.connection_intent ?? '',
  }));
  const [revision, setRevision] = useState(me?.profile_revision);
  const [fields, setFields] = useState({});
  const [error, setError] = useState(null);
  const changedElsewhere = editing && me.profile_revision !== revision;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const errors = validateProfile(values, editing);
    setFields(errors); setError(null);
    if (Object.keys(errors).length) { form.current.elements.namedItem(Object.keys(errors)[0])?.focus(); return; }
    const payload = { self_description: values.self_description.trim(), connection_intent: values.connection_intent.trim() };
    if (editing) payload.expected_profile_revision = revision;
    else payload.nickname = values.nickname.trim();
    const result = await actions.mutate(editing ? 'updateProfile' : 'createProfile', payload);
    if (result.error) {
      setError(result.error); setFields(result.error.fields ?? {});
      if (Object.keys(result.error.fields ?? {}).length) form.current.elements.namedItem(Object.keys(result.error.fields)[0])?.focus();
    }
  }
  function reloadProfile() {
    setValues({ nickname: me.nickname, self_description: me.self_description, connection_intent: me.connection_intent });
    setRevision(me.profile_revision); setError(null); setFields({});
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
    <PageHeader title={editing ? '내 정보' : 'Bside'} onBack={editing ? () => actions.navigate('nearby') : undefined} eyebrow={editing ? me.nickname : '가까이 있는 사람과 이야기를 시작해요'} />
    <p className="intro">{editing ? '지금의 나와 만나고 싶은 사람을 알려주세요.' : '어떤 이야기를 나누고 싶나요?\n소개를 남기면 주변 사람을 찾기 시작해요.'}</p>
    <p className="privacy-note">자기소개와 만나고 싶은 사람은 주변에서 발견된 사람에게 보여요.</p>
    <form ref={form} onSubmit={submit} noValidate className="profile-form">
      {!editing && input('nickname', '닉네임', '어떤 이름으로 불러드릴까요?')}
      {input('self_description', '자기소개', '퇴근 후 작은 앱을 만드는 프론트엔드 개발자입니다.', true)}
      {input('connection_intent', '어떤 사람을 만나고 싶나요?', '사이드 프로젝트를 만드는 사람과 시행착오를 나누고 싶어요.', true)}
      {changedElsewhere && <div className="notice" role="status"><p>다른 화면에서 정보가 바뀌었어요. 작성 중인 내용은 그대로 남겨뒀어요.</p><button type="button" className="text-button" onClick={reloadProfile}>최신 정보 불러오기</button></div>}
      <ErrorNotice error={error} />
      <div className="form-actions"><button type="submit" className="btn" disabled={Boolean(busy) || changedElsewhere}>{busy === 'createProfile' || busy === 'updateProfile' ? '저장 중…' : editing ? '변경 내용 저장' : '시작하기'}</button></div>
    </form>
    {/* 발견 ON/OFF는 주변 목록 한곳에서만 조작한다. 설정이 두 군데 있으면 어느 쪽이 실제인지 흐려진다. */}
  </section>;
}
