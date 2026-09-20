# -*- coding: utf-8 -*-
"""디버그 WebView에 CDP로 자바스크립트를 넣는다.

`adb shell input text`는 비ASCII를 못 넣어서 한글 프로필을 타이핑할 수 없다.
디버그 빌드는 WebView가 debuggable이므로 DevTools 프로토콜로 직접 값을 넣는다.

    adb -s <기기> forward tcp:19222 localabstract:webview_devtools_remote_<pid>
    python tools/cdp.py 19222 eval "document.title"
    python tools/cdp.py 19222 form "닉네임" "자기소개" "만나고 싶은 사람"
    python tools/cdp.py 19222 dump

React는 `.value` 대입만으로는 상태를 갱신하지 않는다. 네이티브 setter를 호출한 뒤
`input` 이벤트를 bubbles로 디스패치해야 onChange가 걸린다.
"""
import asyncio
import json
import sys
import urllib.request

import websockets

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def target(port):
    with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=5) as r:
        for t in json.load(r):
            if t.get("type") == "page":
                return t["webSocketDebuggerUrl"]
    raise SystemExit("page 타깃을 찾지 못했다")


async def evaluate(port, expression):
    async with websockets.connect(target(port), max_size=20 * 1024 * 1024) as ws:
        await ws.send(json.dumps({
            "id": 1, "method": "Runtime.evaluate",
            "params": {"expression": expression, "returnByValue": True, "awaitPromise": True},
        }))
        while True:
            msg = json.loads(await ws.recv())
            if msg.get("id") == 1:
                result = msg.get("result", {})
                if "exceptionDetails" in result:
                    raise SystemExit("JS 오류: " + json.dumps(result["exceptionDetails"], ensure_ascii=False))
                return result.get("result", {}).get("value")


# 폼 구조를 눈으로 확인할 때 쓴다. 필드 id는 빌드마다 바뀔 수 있다.
DUMP = """
(() => {
  const f = [...document.querySelectorAll('input, textarea')].map(e => ({
    tag: e.tagName.toLowerCase(), id: e.id, name: e.name,
    placeholder: e.placeholder, value: e.value, type: e.type,
  }));
  const b = [...document.querySelectorAll('button')].map(e => e.innerText.trim()).filter(Boolean);
  return JSON.stringify({ url: location.href, hash: location.hash, fields: f, buttons: b }, null, 2);
})()
"""

# 네이티브 setter + input 이벤트. 이걸 빼면 React가 입력을 못 알아챈다.
SET_TMPL = """
(() => {
  const put = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const all = [...document.querySelectorAll('input, textarea')];
  const pick = (...keys) => all.find(e => keys.some(k =>
    (e.id || '').includes(k) || (e.name || '').includes(k)));
  const targets = [
    [pick('nickname', 'nick'), %s],
    [pick('self_description', 'self', 'intro'), %s],
    [pick('connection_intent', 'intent', 'connection'), %s],
  ];
  const done = [];
  for (const [el, v] of targets) {
    if (!el) { done.push('없음'); continue; }
    put(el, v);
    done.push((el.id || el.name) + '=' + el.value.slice(0, 18));
  }
  return done.join(' | ');
})()
"""


def main():
    port = int(sys.argv[1])
    cmd = sys.argv[2]
    if cmd == "dump":
        print(asyncio.run(evaluate(port, DUMP)))
    elif cmd == "eval":
        print(asyncio.run(evaluate(port, sys.argv[3])))
    elif cmd == "form":
        args = [json.dumps(a, ensure_ascii=False) for a in sys.argv[3:6]]
        print(asyncio.run(evaluate(port, SET_TMPL % tuple(args))))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
