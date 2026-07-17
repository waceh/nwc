# NWC Converter

NoteWorthy Composer(`.nwc`) 파일을 브라우저에서 직접 **MusicXML** 또는 **MIDI**로 변환합니다.

## 기능

- `.nwc` 파일 드래그 & 드롭 또는 파일 선택
- **MusicXML** 변환 — Logic Pro, Sibelius, Finale 등에서 임포트 가능
- **MIDI** 변환 — 모든 DAW에서 사용 가능
- 서버 불필요 — 변환이 브라우저 안에서 완전히 처리됨 (파일이 외부로 전송되지 않음)

## 사용법

**[→ 바로 사용하기](https://waceh.github.io/nwc-converter/)**

또는 로컬 실행:

```bash
python3 -m http.server 8765
# 브라우저에서 http://localhost:8765 열기
```

> ES 모듈 때문에 `file://`로 직접 열면 동작하지 않아요. 로컬 서버가 필요합니다.

## 지원 포맷

| 입력 | 출력 |
|------|------|
| NWC binary (v1.5 ~ v2.0) | MusicXML 4.0 |
| NWC v2.75 (NWCTXT 내장) | MIDI (Format 1) |

## 기술 스택

- **NWC 파싱 / MusicXML 변환**: [nwc-viewer](https://github.com/zz85/nwc-viewer) (GPL-2.0)
  - Key signature 버그 수정 (`nwctxt-parser.js` — sharpOrder/flatOrder 배열 오류)
- **MusicXML → MIDI**: 브라우저 내 순수 JS 구현
- **zlib 압축 해제**: inflate.min.js

## License

이 프로젝트는 [nwc-viewer](https://github.com/zz85/nwc-viewer) (GPL-2.0)를 포함하므로 GPL-2.0을 따릅니다.
