# NWC Converter & Viewer

v1.0.824

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

NWC 제목·파트 이름·가사는 UTF-8과 EUC-KR/CP949(확장 한글 포함)를 지원합니다. NWCTXT는 필드별로 인코딩을 판별하며, 한글 가사는 MusicXML 변환에도 유지됩니다.

## 기술 스택

- **NWC 파싱 / 렌더링 / MusicXML 변환**: (GPL-2.0) 기반, 다수의 렌더링·재생 버그 수정 및 기능 추가
  - 레거시 NWC 파서의 가사 유실·싱크 어긋남, 조표(key signature) 오표기 버그 수정
  - `nwctxt-parser.js`의 key signature 버그 수정 (sharpOrder/flatOrder 배열 오류)
  - iOS Safari에서 재생 시 무음이 되던 AudioContext 제스처 문제 수정
  - 내장 피아노 신디사이저의 유니즌 노트 스터터/필터 문제 수정
  - 페이지 레이아웃에서 마지막 시스템이 페이지 밖으로 밀려나던 줄바꿈 버그 수정
  - 다단 시스템 간 커서 이동 보간 및 도돌이표/반복 구간 재생 커서 추적 안정화
  - 모바일 · 태블릿 반응형 레이아웃 대응
- **MusicXML → MIDI**: 브라우저 내 순수 JS 구현
- **zlib 압축 해제**: inflate.min.js
- **오디오 재생**: 자체 번들된 soundfont-engine 기반 — 사운드폰트 미탑재 시 내장 웨이브테이블 피아노로 자동 대체

## License

이 프로젝트는 GPL-2.0을 따릅니다.

## 업데이트 이력

Git 커밋에서 확인할 수 있는 주요 변경 사항을 최신순으로 정리했습니다. 같은 날짜의 항목도 커밋 순서를 따르며, 버전이 명확하지 않은 항목은 `—`로 표시했습니다. 문서 정리와 중복·롤백 커밋은 일부 생략했습니다.

| 날짜 | 버전 | 변경 내용 | 커밋 |
| --- | --- | --- | --- |
| 2026-10-02 | v1.0.824 | README 하단에 최신순 업데이트 이력과 관련 커밋 링크 추가. | 작성 중 |
| 2026-10-02 | v1.0.823 | NWC 두 번째 성부 및 음표별 길이·부분 붙임줄 처리 개선, 보표 설정과 표현 기호 반영, 일시정지 후 파트 변경 시 재생 위치 유지. | [92c105f](https://github.com/waceh/nwc/commit/92c105f) |
| 2026-10-02 | v1.0.822 | RestChord 파싱과 렌더링 오류 수정. | [a1449aa](https://github.com/waceh/nwc/commit/a1449aa) |
| 2026-10-02 | v1.0.821 | UTF-8·EUC-KR/CP949 인코딩 처리 개선으로 한글 제목·파트 이름·가사 및 MusicXML 변환 지원. | [2b66f46](https://github.com/waceh/nwc/commit/2b66f46) |
| 2026-10-02 | v1.0.820 | 붙임줄에 따른 가사 배정과 Always/Never 옵션 처리 수정, One Call Away 샘플 가사 복구, 샘플 로딩 후 스페이스바 재생 오류 수정. | [94209d4](https://github.com/waceh/nwc/commit/94209d4) |
| 2026-10-02 | v1.0.820 | 버전 표시를 3초 안에 5번 누르면 샘플악보 버튼을 표시하는 이스터 에그와 샘플 두 곡 추가. | [7775edf](https://github.com/waceh/nwc/commit/7775edf) |
| 2026-10-02 | v1.0.820 | 변환 결과의 파일명·제목·통계 표시에서 HTML 삽입 취약점 수정. | [7a22e6b](https://github.com/waceh/nwc/commit/7a22e6b) |
| 2026-10-02 | v1.0.819 | 악보 클릭 시 즉시 탐색 위치 표시, 반복 구간 이후 커서·재생 동기화 및 셋잇단음표 파싱 수정, 마디 폭과 원본 줄바꿈을 반영한 배치 개선. | [f5db0bc](https://github.com/waceh/nwc/commit/f5db0bc) |
| 2026-09-06 | — | 재생 진행 막대와 악보 배치 개선, 시스템당 마디 수 및 너비 맞춤 설정 추가. | [a65bb20](https://github.com/waceh/nwc/commit/a65bb20) |
| 2026-08-14 | v1.0.818 | 다성부·가사 악보에서 시스템 인덱스 기반 재생 위치 추적 및 커서 튀김 방지. | [365f7b9](https://github.com/waceh/nwc/commit/365f7b9) |
| 2026-08-14 | v1.0.817 | 여러 시스템 사이에서 커서가 이전 단으로 튀는 오류 수정. | [57ee8de](https://github.com/waceh/nwc/commit/57ee8de) |
| 2026-08-14 | v1.0.816 | 다성부·쉼표 구간의 진행 막대 높이와 위치 보간 안정화. | [fd2630f](https://github.com/waceh/nwc/commit/fd2630f) |
| 2026-08-14 | v1.0.815 | 메뉴 보기/간략히 전환 시 캔버스 상단 빈 공간 수정, 기본 NWC 파서를 새 파서로 변경해 제목·마디·조표 표시 개선. | [95db507](https://github.com/waceh/nwc/commit/95db507) |
| 2026-08-08 | — | 옥타브 조절 버튼 추가 및 툴바 메뉴 구조 개편. | [85c0325](https://github.com/waceh/nwc/commit/85c0325) |
| 2026-08-08 | — | 변환기에 MusicXML/MXL 업로드 및 MIDI 변환 추가, 압축 파일 처리와 뷰어 렌더링·오디오 로딩 안정성 개선. | [63e02fa](https://github.com/waceh/nwc/commit/63e02fa) |
| 2026-07-26 | — | 악보 PDF 내보내기 추가. | [6e8721f](https://github.com/waceh/nwc/commit/6e8721f) |
| 2026-07-23 | — | 새 파서 붙임줄 인식, 고급 패널 크기 조절 및 스페이스바 재개 오류 수정. | [830efef](https://github.com/waceh/nwc/commit/830efef) |
| 2026-07-23 | — | NWCTXT 붙임줄 미인식으로 인한 가사 밀림 수정 및 음표 하이라이트 시점 개선. | [d1c25d2](https://github.com/waceh/nwc/commit/d1c25d2) |
| 2026-07-23 | — | 메뉴 간략히 모드 추가: 재생·정지·음량을 한 줄로 표시. | [258e500](https://github.com/waceh/nwc/commit/258e500) |
| 2026-07-22 | — | 반복 재생 시 가사·커서 밀림과 메뉴 전환 시 캔버스 위치 오류 수정. | [46940d8](https://github.com/waceh/nwc/commit/46940d8) |
| 2026-07-22 | — | 메뉴 숨기기 추가 및 기본 음량 조정으로 클리핑 방지. | [bc8ac51](https://github.com/waceh/nwc/commit/bc8ac51) |
| 2026-07-22 | v1.0.28 | 변환기와 뷰어 디렉터리 분리 및 저장소 구조 정리. | [85fa559](https://github.com/waceh/nwc/commit/85fa559) |
| 2026-07-22 | — | 악보 전체보기 및 스페이스바 재생 단축키 추가. | [9544889](https://github.com/waceh/nwc/commit/9544889) |
| 2026-07-22 | — | 페이지당 시스템 배치 개선 및 유니즌 음표 재생 끊김 수정. | [79ef9b8](https://github.com/waceh/nwc/commit/79ef9b8) |
| 2026-07-22 | — | 자동 스크롤 오류 수정 및 기본 레이아웃·음색 조정. | [a7738f7](https://github.com/waceh/nwc/commit/a7738f7) |
| 2026-07-21 | — | 뷰어 음량 조절 슬라이더 추가. | [af6f496](https://github.com/waceh/nwc/commit/af6f496) |
| 2026-07-21 | — | 중복 코드 정리 및 파서 전환 버튼명 수정. | [ce58271](https://github.com/waceh/nwc/commit/ce58271) |
| 2026-07-21 | — | 원본 파서 조표 표시 오류 수정. | [0db100d](https://github.com/waceh/nwc/commit/0db100d) |
| 2026-07-21 | — | 뷰어 기본 파서를 원본 파서로 변경하고 가사 누락 수정. | [9c41dc0](https://github.com/waceh/nwc/commit/9c41dc0) |
| 2026-07-21 | — | iOS Safari 무음 재생 오류 수정. | [a3fea66](https://github.com/waceh/nwc/commit/a3fea66) |
| 2026-07-21 | — | 휴대폰·태블릿 화면 대응 추가. | [6424134](https://github.com/waceh/nwc/commit/6424134) |
| 2026-07-21 | — | 악보 뷰어 추가. | [b67f5b9](https://github.com/waceh/nwc/commit/b67f5b9) |
| 2026-07-18 | — | MIDI 가사 미지원 안내 추가. | [5a68527](https://github.com/waceh/nwc/commit/5a68527) |
| 2026-07-18 | — | MusicXML 변환 시 가사 포함 지원. | [7736427](https://github.com/waceh/nwc/commit/7736427) |
| 2026-07-17 | — | README 사용 안내 추가. | [1b42a70](https://github.com/waceh/nwc/commit/1b42a70) |
| 2026-07-17 | — | 브라우저에서 NWC를 MusicXML/MIDI로 변환하는 기능 최초 추가. | [8111b86](https://github.com/waceh/nwc/commit/8111b86) |

v1.0.819의 재생·탐색·줄바꿈 회귀 테스트는 후속 커밋 [d7ae644](https://github.com/waceh/nwc/commit/d7ae644)에서 추가했습니다. v1.0.815 버전 표기는 [89973d1](https://github.com/waceh/nwc/commit/89973d1), 기본 파서 변경은 [9f1dd12](https://github.com/waceh/nwc/commit/9f1dd12)에서 확인할 수 있습니다.
