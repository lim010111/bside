#!/usr/bin/env bash
# 실기기 두 대를 동시에 녹화해 시연 영상 원본을 만든다.
#
#   bash tools/record-demo.sh check     기기·빌드·배터리·서버 점검만
#   bash tools/record-demo.sh reset     두 대를 깨끗한 상태로 (앱 데이터 삭제 + 권한 부여)
#   bash tools/record-demo.sh rec 50    50초 동시 녹화 후 회수
#   bash tools/record-demo.sh stack     회수한 두 영상을 나란히 합성
#
# 조작은 손으로 한다. BLE 발견에 걸리는 실제 지연이 화면에 남아야 하고,
# 그게 무선이 진짜로 돈다는 증거다. 좌표 자동 탭은 기기마다 깨진다.
set -u

# MSYS가 /sdcard 를 Windows 경로로 바꿔버린다. adb 인자에는 변환이 들어가면 안 된다.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

ADB="${ADB:-/c/Users/Sungbin/AppData/Local/Android/Sdk/platform-tools/adb.exe}"
# winget 설치분은 새 셸이 열리기 전까지 PATH에 안 잡힌다.
FFMPEG="${FFMPEG:-/c/Users/Sungbin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin/ffmpeg.exe}"
command -v ffmpeg >/dev/null 2>&1 && FFMPEG=ffmpeg
PKG="${PKG:-app.bside}"
API="${API:-https://bside-api.sungblab.com}"

# 기기 두 대. adb devices 에 보이는 이름 그대로 넣는다.
A="${A:-192.168.137.212:45561}"
B="${B:-adb-R3CY10D47SH-yUlJZ6._adb-tls-connect._tcp}"

HERE="$(cd "$(dirname "$0")/.." && pwd)"
# python·adb 는 Windows 바이너리라 /c/... 경로를 못 읽는다. 저장소로 이동해 상대 경로로 부른다.
cd "$HERE"
CDP="tools/cdp.py"
OUT="$HERE/output/demo"
# adb.exe 는 Windows 바이너리라 로컬 경로를 Windows 형식으로 줘야 pull 이 된다.
WOUT="$(cd "$HERE" && pwd -W 2>/dev/null || echo "$HERE")/output/demo"

PERMS=(BLUETOOTH_SCAN BLUETOOTH_ADVERTISE BLUETOOTH_CONNECT POST_NOTIFICATIONS)

model () { "$ADB" -s "$1" shell getprop ro.product.model 2>/dev/null | tr -d '\r'; }
prop  () { "$ADB" -s "$1" shell getprop "$2" 2>/dev/null | tr -d '\r'; }

check () {
  local bad=0
  local code; code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API/health" 2>/dev/null)"
  if [ "$code" = "200" ]; then echo "서버       HTTP 200  $API"
  else echo "서버       응답 ${code:-없음} ← 확인 필요  $API"; bad=1; fi
  # 설치 시각은 같은 APK를 깔아도 다르다. 설치된 APK의 해시를 본다.
  local builds=()
  for d in "$A" "$B"; do
    local m; m="$(model "$d")"
    if [ -z "$m" ]; then echo "── $d : 연결 안 됨"; bad=1; continue; fi
    echo "── $m  ($d)"

    local bt; bt="$("$ADB" -s "$d" shell settings get global bluetooth_on 2>/dev/null | tr -d '\r')"
    [ "$bt" = "1" ] && echo "   블루투스   켜짐" || { echo "   블루투스   꺼짐 ← 켜야 함"; bad=1; }

    local lvl; lvl="$("$ADB" -s "$d" shell dumpsys battery 2>/dev/null | grep -m1 level | tr -dc '0-9')"
    if [ "${lvl:-0}" -lt 50 ]; then echo "   배터리     ${lvl}% ← 충전 권장"; else echo "   배터리     ${lvl}%"; fi

    if "$ADB" -s "$d" shell dumpsys deviceidle whitelist 2>/dev/null | grep -qi "$PKG"; then
      echo "   절전 제외  됨"
    else
      echo "   절전 제외  안 됨 ← 발견이 끊길 수 있음"; bad=1
    fi

    local miss=""
    for p in "${PERMS[@]}"; do
      "$ADB" -s "$d" shell dumpsys package "$PKG" 2>/dev/null \
        | grep -q "android.permission.$p: granted=true" || miss="$miss $p"
    done
    [ -z "$miss" ] && echo "   권한       전부 부여" || { echo "   권한       빠짐:$miss"; bad=1; }

    local path sum
    path="$("$ADB" -s "$d" shell pm path "$PKG" 2>/dev/null | head -1 | sed 's/^package://' | tr -d '\r')"
    sum="$("$ADB" -s "$d" shell md5sum "$path" 2>/dev/null | awk '{print $1}' | tr -d '\r')"
    echo "   APK        ${sum:0:12}  ($("$ADB" -s "$d" shell dumpsys package "$PKG" 2>/dev/null | grep -m1 lastUpdateTime | sed 's/.*=//' | tr -d '\r') 설치)"
    builds+=("$sum")

    echo "   밀도       $(prop "$d" ro.sf.lcd_density)$("$ADB" -s "$d" shell wm density 2>/dev/null | tr -d '\r' | sed 's/.*: / → /')"
    echo "   로케일     $(prop "$d" persist.sys.locale)"
  done

  if [ "${#builds[@]}" -eq 2 ] && [ "${builds[0]}" != "${builds[1]}" ]; then
    echo
    echo "!! 두 대에 서로 다른 APK가 깔려 있다. UI가 어긋나 보이므로 같은 것으로 맞추고 찍을 것."
    bad=1
  fi
  return $bad
}

# 같은 1080x2340이라도 밀도가 다르면 UI 크기가 달라 한 제품처럼 안 보인다.
density () {
  local v="${1:-}"
  if [ -z "$v" ]; then
    for d in "$A" "$B"; do echo "$(model "$d") : $("$ADB" -s "$d" shell wm density 2>/dev/null|tr -d '\r')"; done
    echo "사용법: bash tools/record-demo.sh density 480   ·   reset 으로 되돌림"
    return 0
  fi
  for d in "$A" "$B"; do
    if [ "$v" = "reset" ]; then "$ADB" -s "$d" shell wm density reset >/dev/null 2>&1
    else "$ADB" -s "$d" shell wm density "$v" >/dev/null 2>&1; fi
    echo "$(model "$d") → $("$ADB" -s "$d" shell wm density 2>/dev/null|tr -d '\r')"
  done
}

# pm clear 는 WebView 프로세스도 같이 죽인다. 앱을 다시 띄운 뒤 소켓을 새로 찾아
# 포워딩을 다시 걸어야 CDP가 붙는다. PID가 매번 바뀌므로 고정할 수 없다.
forward () {
  local d="$1" port="$2" sock pid
  for _ in $(seq 1 15); do
    sock="$("$ADB" -s "$d" shell cat /proc/net/unix 2>/dev/null \
      | grep -o 'webview_devtools_remote_[0-9]*' | head -1 | tr -d '\r')"
    [ -n "$sock" ] && break
    sleep 1
  done
  [ -n "$sock" ] || { echo "   CDP 소켓을 못 찾음"; return 1; }
  "$ADB" -s "$d" forward "tcp:$port" "localabstract:$sock" >/dev/null 2>&1
  echo "   CDP tcp:$port → $sock"
}

reset () {
  for entry in "우현|19222|$A" "승제|19223|$B"; do
    local who port d
    who="${entry%%|*}"
    port="$(echo "$entry" | cut -d'|' -f2)"
    d="${entry##*|}"
    echo "── $(model "$d") 초기화"
    "$ADB" -s "$d" shell pm clear "$PKG" >/dev/null 2>&1
    # 권한 대화상자가 화면에 뜨면 테이크가 날아간다. 미리 부여해 건너뛴다.
    for p in "${PERMS[@]}"; do
      "$ADB" -s "$d" shell pm grant "$PKG" "android.permission.$p" >/dev/null 2>&1
    done
    "$ADB" -s "$d" shell dumpsys deviceidle whitelist "+$PKG" >/dev/null 2>&1
    # 앱이 떠 있는 채로 pm clear 를 하면 조용히 무시될 때가 있다. 멈춘 뒤 지우고 다시 띄운다.
    "$ADB" -s "$d" shell am force-stop "$PKG" >/dev/null 2>&1
    "$ADB" -s "$d" shell pm clear "$PKG" >/dev/null 2>&1
    "$ADB" -s "$d" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    sleep 3
    forward "$d" "$port" || continue

    # 입력 폼이 실제로 그려질 때까지 기다린다. 너무 일찍 넣으면 필드를 못 찾는다.
    local ready=""
    for _ in $(seq 1 12); do
      ready="$(python "$CDP" "$port" eval \
        "document.querySelector('#nickname') ? 'ok' : ''" 2>/dev/null | tail -1)"
      [ "$ready" = "ok" ] && break
      sleep 1
    done
    [ "$ready" = "ok" ] || { echo "   입장 화면이 안 뜸 — 앱 상태 확인 필요"; continue; }

    # 한글은 adb input text 로 못 넣는다(비ASCII 미지원). CDP로 React 상태까지 갱신한다.
    if [ "$who" = "우현" ]; then
      python "$CDP" "$port" form "우현" \
        "작년에 BLE 광고랑 스캔을 직접 붙여봤어요. 안드로이드 12 권한 때문에 한참 헤맸습니다." \
        "블루투스 붙이다 막힌 분 있으면 편하게 물어봐 주세요." 2>&1 | sed 's/^/   /'
    else
      python "$CDP" "$port" form "승제" \
        "동아리에서 안드로이드 앱을 만드는데 블루투스 쪽이 처음이라 스캔이 자꾸 끊겨요." \
        "BLE 붙여보신 분께 막힌 데를 여쭤보고 싶어요." 2>&1 | sed 's/^/   /'
    fi

  done
  echo
  echo "두 대 모두 입장 화면에 소개가 채워진 상태다. 녹화를 시작한 뒤 '시작하기'부터 누른다."
  echo "타이핑까지 찍으려면 화면에서 지우고 직접 입력할 것(50초 예산에는 들어가지 않는다)."
}

rec () {
  local secs="${1:-50}"
  mkdir -p "$OUT"
  echo "$secs초 녹화. 지금부터 두 폰을 조작할 것."
  for d in "$A" "$B"; do
    "$ADB" -s "$d" shell screenrecord --size 720x1560 --bit-rate 8000000 \
      --time-limit "$secs" /sdcard/bside-demo.mp4 &
  done
  wait
  "$ADB" -s "$A" pull /sdcard/bside-demo.mp4 "$WOUT/a.mp4" 2>&1 | tail -1
  "$ADB" -s "$B" pull /sdcard/bside-demo.mp4 "$WOUT/b.mp4" 2>&1 | tail -1
  ls -la "$OUT"/a.mp4 "$OUT"/b.mp4 2>/dev/null | awk '{printf "   %s  %s bytes\n", $9, $5}'
}

stack () {
  [ -x "$FFMPEG" ] || command -v "$FFMPEG" >/dev/null 2>&1 \
    || { echo "ffmpeg 을 찾지 못했다: $FFMPEG"; return 1; }
  # Windows에는 fontconfig 기본 설정이 없어서 drawtext 가 폰트를 못 찾고 죽는다.
  # 한글 라벨이라 맑은 고딕을 직접 지정한다. 필터 안에서는 드라이브 콜론을 이스케이프한다.
  local font='C\:/Windows/Fonts/malgun.ttf'
  local label="fontfile='$font':fontcolor=white:fontsize=34:x=(w-tw)/2:y=16"
  # 왼쪽이 첫 메시지를 보내는 쪽(승제), 오른쪽이 답장하는 쪽(우현).
  # 발표 중에는 말을 하지 않으므로 화면이 스스로 누구인지 설명해야 한다.
  "$FFMPEG" -y -i "$WOUT/b.mp4" -i "$WOUT/a.mp4" \
    -filter_complex "\
      [0:v]scale=540:-2,pad=iw:ih+64:0:64:color=black,drawtext=text='승제':$label[l];\
      [1:v]scale=540:-2,pad=iw:ih+64:0:64:color=black,drawtext=text='우현':$label[r];\
      [l][r]hstack=inputs=2" \
    -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -an "$WOUT/demo.mp4"
  echo "→ $OUT/demo.mp4"
  "$FFMPEG" -hide_banner -i "$WOUT/demo.mp4" 2>&1 | grep -E "Duration|Stream #0:0" | sed 's/^ */   /'
}

case "${1:-check}" in
  check)   check ;;
  reset)   reset ;;
  density) density "${2:-}" ;;
  rec)     rec "${2:-50}" ;;
  stack)   stack ;;
  *) sed -n '2,11p' "$0" ;;
esac
