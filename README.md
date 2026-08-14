# NWC Converter & Viewer

v1.0.818

NoteWorthy Composer(`.nwc`) 파일을 브라우저에서 바로 열어보고, **MusicXML** 또는 **MIDI**로 변환합니다. 서버 없이 전부 브라우저 안에서 처리되며, 파일이 외부로 전송되지 않습니다.

## 기능

### 변환기
- `.nwc`, `.musicxml`, `.mxl` 파일 드래그 & 드롭 또는 파일 선택
- **MusicXML** 변환 — Logic Pro, Sibelius, Finale 등에서 임포트 가능 (가사 포함)
- **MIDI** 변환 — 모든 DAW에서 사용 가능 (가사 미지원)

### 악보 뷰어 (NWC Viewer)
- `.nwc` / `.nwz` / `.nwctxt` / `.mid` / `.midi` / `.musicxml` / `.mxl` 파일을 바로 열어서 렌더링
- **재생**: 속도 · 음량 조절, 파트별 솔로/뮤트, 재생 중 자동 스크롤, 스페이스바로 재생/일시정지
- **레이아웃**: 스크롤 / 줄바꿈 / 페이지(두 페이지씩 등) 모드, 페이지 방향(세로·가로) 설정 (용지는 A4 고정)
- **전체보기**: 툴바 없이 악보만 표시 (우측 상단 축소 버튼 또는 Esc로 복귀)
- NWC 파서 두 가지(새 파서 / 기존 파서) 중 선택 가능 — 문제가 있는 파일은 다른 파서로 전환해서 비교 가능
- 모바일 · 태블릿 반응형 레이아웃

변환기에서 변환 결과 화면의 "악보 뷰어에서 보기" 버튼으로 바로 넘어갈 수 있고, 뷰어 툴바의 "Convert" 버튼으로 다시 변환기로 돌아올 수 있습니다.

## 사용법

**[→ 바로 사용하기](https://waceh.github.io/nwc/)**

또는 로컬 실행:

```bash
python3 -m http.server 8765
# 브라우저에서 http://localhost:8765 열기
```

> ES 모듈 때문에 `file://`로 직접 열면 동작하지 않아요. 로컬 서버가 필요합니다.

## 지원 포맷

변환기는 `.nwc` 파일(바이너리 v1.5~v2.0, NWCTXT 내장 v2.75 모두) 하나로 **MusicXML 4.0**(가사 포함)과 **MIDI**(Format 1, 가사 미지원) 두 가지를 동시에 만들어냅니다.

뷰어는 `.nwc`/`.nwz`/`.nwctxt` 외에도 MID/MIDI, MusicXML(.musicxml/.mxl)을 바로 열어서 렌더링·재생할 수 있습니다.

## 기술 스택

- **NWC 파싱 / 렌더링 / MusicXML 변환**: (GPL-2.0) 기반, 다수의 렌더링·재생 버그 수정 및 기능 추가
  - 레거시 NWC 파서의 가사 유실·싱크 어긋남, 조표(key signature) 오표기 버그 수정
  - `nwctxt-parser.js`의 key signature 버그 수정 (sharpOrder/flatOrder 배열 오류)
  - iOS Safari에서 재생 시 무음이 되던 AudioContext 제스처 문제 수정
  - 내장 피아노 신디사이저의 유니즌 노트 스터터/필터 문제 수정
  - 페이지 레이아웃에서 마지막 시스템이 페이지 밖으로 밀려나던 줄바꿈 버그 수정
  - 모바일 · 태블릿 반응형 레이아웃 대응
- **MusicXML → MIDI**: 브라우저 내 순수 JS 구현
- **zlib 압축 해제**: inflate.min.js
- **오디오 재생**: 자체 번들된 soundfont-engine 기반 — 사운드폰트 미탑재 시 내장 웨이브테이블 피아노로 자동 대체

## License

이 프로젝트는 GPL-2.0을 따릅니다.
