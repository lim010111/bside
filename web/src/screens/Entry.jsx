import { useRef, useState } from 'react';
import { useDiscovery } from '../use-discovery.js';
import { LIMITS, lengthOf, validateProfile } from '../lib/contracts.js';
import { ErrorNotice, PageHeader } from '../components/Feedback.jsx';

export default function Entry() {
  const { state, actions } = useDiscovery();
  const { me, busy } = state;
  const editing = Boolean(me?.profile);
  const form = useRef(null);
  const [values, setValues] = useState(() => ({
    nickname: me?.profile?.nickname ?? '',
    self_description: me?.profile?.self_description ?? '',
    connection_intent: me?.profile?.connection_intent ?? '',
  }));
  const [fields, setFields] = useState({});
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const errors = validateProfile(values);
    setFields(errors); setError(null);
    if (Object.keys(errors).length) { form.current.elements.namedItem(Object.keys(errors)[0])?.focus(); return; }
    // The contract stores the complete profile every time; there is no partial edit.
    const result = await actions.saveProfile({
      nickname: values.nickname.trim(),
      self_description: values.self_description.trim(),
      connection_intent: values.connection_intent.trim(),
    });
    if (result.error) {
      setError(result.error); setFields(result.error.fields ?? {});
      if (Object.keys(result.error.fields ?? {}).length) form.current.elements.namedItem(Object.keys(result.error.fields)[0])?.focus();
    }
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
    <PageHeader title={editing ? '내 정보' : 'Bside'} onBack={editing ? () => actions.navigate('nearby') : undefined} eyebrow={editing ? me.profile.nickname : '가까이 있는 사람과 이야기를 시작해요'} />
    {/* 소개를 저장한다고 곧바로 내 존재를 BLE로 알리지는 않는다. 발견을 켜는 건 다음 화면의 명시적인 선택이다. */}
    <p className="intro">{editing ? '지금의 나와 만나고 싶은 사람을 알려주세요.' : '어떤 이야기를 나누고 싶나요?\n소개를 남긴 뒤 주변 발견을 켜면 가까이 있는 사람을 찾아요.'}</p>
    <p className="privacy-note">자기소개와 만나고 싶은 사람은 주변에서 발견된 사람에게 보여요.</p>
    <form ref={form} onSubmit={submit} noValidate className="profile-form">
      {input('nickname', '닉네임', '어떤 이름으로 불러드릴까요?')}
      {input('self_description', '자기소개', '퇴근 후 작은 앱을 만드는 프론트엔드 개발자입니다.', true)}
      {input('connection_intent', '어떤 사람을 만나고 싶나요?', '사이드 프로젝트를 만드는 사람과 시행착오를 나누고 싶어요.', true)}
      <ErrorNotice error={error} />
      <div className="form-actions"><button type="submit" className="btn" disabled={Boolean(busy)}>{busy === 'saveProfile' ? '저장 중…' : editing ? '변경 내용 저장' : '시작하기'}</button></div>
    </form>
    {/* 발견 ON/OFF는 주변 목록 한곳에서만 조작한다. 설정이 두 군데 있으면 어느 쪽이 실제인지 흐려진다. */}
  </section>;
}
