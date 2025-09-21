# Perform3D MCP 서버 매뉴얼

## 1. 개요
- 위치: `src/perform3d/`
- 구성: Node.js/TypeScript 서버 + C# 워커(스텁)
- 기능: REST API, Streamable HTTP MCP 엔드포인트, 구조화 로그/진행 이벤트

## 2. 필수 요건
- Windows 10/11 (Perform3D v10 설치 및 라이선스 필요)
- Node.js 20 이상
- .NET 8 SDK
- `node`, `npm`, `dotnet` 실행 가능해야 함

## 3. 설치
```powershell
cd src/perform3d
npm install
```

## 4. 빌드
```powershell
# TypeScript 컴파일
npm run build

# C# 워커 빌드 (결과: worker/Perform3D.Worker.exe)
dotnet publish worker/Perform3D.Worker.csproj -c Release -r win-x64 --self-contained false -o worker
```

## 5. 설정
- 기본 설정: `config/default.json`
- 예시
```json
{
  "perform3d": { "visible": false },
  "unitsDefault": { "force": "kN", "length": "cm" },
  "paths": { "templates": "C:/p3d-mcp/templates", "work": "C:/p3d-mcp/work" },
  "server": { "host": "127.0.0.1", "port": 8732, "cors": ["http://localhost:3000"] },
  "limits": { "analysisTimeoutSec": 7200, "commandTimeoutSec": 30 },
  "worker": { "command": "worker/Perform3D.Worker.exe", "args": [] }
}
```
- `config/local.json` 또는 환경변수 `P3D_MCP_CONFIG`(JSON 문자열)로 덮어쓰기 가능

## 6. 실행
```powershell
# 개발 모드 (tsx)
npm run dev

# 빌드 후 실행
npm start  # node dist/index.js 실행
```
- 워커 경로 변경 시 `P3D_MCP_CONFIG` 예시:
  ```powershell
  $env:P3D_MCP_CONFIG = '{"worker":{"command":"dotnet","args":["run","--project","worker/Perform3D.Worker.csproj"]}}'
  npm run dev
  ```

## 7. REST API 요약
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/project/connect` | Perform3D 프로세스 준비/접속 |
| POST | `/api/project/open` | 기존 모델 열기 |
| POST | `/api/model/add-nodes` | 노드/질량/구속 추가 |
| POST | `/api/model/add-elements` | 요소/그룹/속성 연결 |
| POST | `/api/analysis/run-series` | 해석 실행, `progressToken` 반환 |
| GET  | `/api/results/{kind}` | `nodeDisp`, `supportReaction`, `elementShear`, `componentUsage`, `pushoverCurve`, `timeHistory` |
| GET  | `/api/export/table` | 결과 테이블 CSV/JSON |
| GET  | `/api/progress/:token` | 진행 상황 SSE 스트림 |
| GET  | `/api/logs/recent` | 최근 로그 조회 |

## 8. MCP 사용
- 엔드포인트: `POST/GET/DELETE /mcp`
- Streamable HTTP 세션, `mcp-session-id` 헤더 필수
- 제공 도구: `connect`, `openModel`, `addNodes`, `runSeries`, `getResults.*`, `export.table` 등 (`MCP_TOOLS_SPEC.md` 참고)

## 9. 로그·진행 상황
- 로그: pino(JSON), 메모리 버퍼 → `GET /api/logs/recent`
- 진행 이벤트
  - REST: `GET /api/progress/:token`
  - MCP: `notifications/progress`

## 10. 파일 구조
```
src/perform3d/
 ├─ config/           기본 설정 파일
 ├─ src/
 │   ├─ config.ts     설정 로더
 │   ├─ logging.ts    구조화 로그 + 버퍼
 │   ├─ progress.ts   SSE + 콜백 허브
 │   ├─ http/rest.ts  REST 라우터
 │   ├─ mcp/streamable.ts MCP 서버
 │   └─ worker/bridge.ts 워커 IPC 브리지
 ├─ worker/
 │   ├─ Perform3D.Worker.csproj
 │   └─ Program.cs    스텁 워커
 ├─ package.json / tsconfig.json
 └─ README.md / MANUAL.md
```

## 11. 문제 해결
- `npm install` 오류: `package.json` 의 버전 확인 후 최신 버전으로 조정 (`@modelcontextprotocol/sdk`, `@types/pino` 등)
- 워커 경로 오류: 설정 파일 또는 `P3D_MCP_CONFIG`로 실행 명령 교체
- Perform3D API 미구현: 현재 워커는 스텁이므로 `Program.cs` 의 `HandleCommand` 를 실제 API 호출로 교체 필요

## 12. 다음 단계
1. C# 워커에서 Perform3D .NET API 호출 구현
2. 로드/해석/결과 스키마를 실 데이터에 맞게 확장
3. 보안(예: CORS 제한, 로그 마스킹) 및 배포 자동화를 추가 검토
