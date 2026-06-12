# Device Manager Local

로컬 PC에서 실행하는 장비 대여·반납 관리 웹사이트입니다. 별도 DB 없이 `server/data/devices.xlsx` 파일을 데이터 저장소처럼 사용하고, 사진과 QR 이미지는 `server/uploads/` 아래에 저장합니다.

https://mindsai-devicemanager.pages.dev/login

## 주요 기능

- 관리자 로그인: `admin / admin123!`
- 대시보드: 전체, 대여 가능, 대여 중, 점검 중, 고장 현황
- QR 스캔: `html5-qrcode` 기반 카메라 스캔과 장비번호 직접 입력
- 장비 관리: 등록, 목록, 상세, 수정, 폐기 처리
- 대여·반납: 상태 조건 검증, 사진 업로드, 이력 저장
- 점검·고장 관리: 점검/수리/고장 이력과 상태 변경
- Excel 관리: 다운로드, 백업, 초기 데이터 생성

## 설치

```bash
npm install
```

## 개발 실행

```bash
npm run dev
```

- 웹사이트: http://localhost:3000
- API 서버: http://localhost:3001
- 프론트 개발 서버가 `/api`, `/uploads` 요청을 API 서버로 프록시합니다.

## 운영 실행

```bash
npm run build
npm start
```

운영 실행은 Express 서버가 React 빌드 결과와 API를 함께 `http://localhost:3000`에서 제공합니다.

## 모바일 접속

같은 Wi-Fi에 연결된 모바일에서 PC의 내부 IP로 접속할 수 있습니다.

예:

```text
http://192.168.0.10:3000
```

모바일 카메라 QR 스캔은 브라우저 보안 정책에 따라 `localhost`가 아닌 내부망 주소에서 HTTPS를 요구할 수 있습니다.

### 모바일 HTTPS 접속

주소만 `https://192.168.0.10:3000`처럼 바꾸면 동작하지 않습니다. 개발 서버가 HTTPS 인증서와 키로 실행되어야 합니다.

가장 간단한 테스트 방법은 ngrok, Cloudflare Tunnel 같은 터널 도구로 `http://localhost:3000`을 HTTPS 주소로 공개하는 것입니다. 예를 들어 ngrok을 쓰면 아래처럼 실행한 뒤 표시되는 `https://...` 주소를 모바일에서 열면 됩니다.

```bash
ngrok http 3000
```

같은 Wi-Fi 내부 IP로 직접 접속하려면 `certs/localhost.pem`, `certs/localhost-key.pem` 인증서 파일을 만든 뒤 아래 명령으로 실행합니다.

```bash
npm run dev:https
```

Windows에서는 OpenSSL 없이 아래 명령으로 `certs/localhost.pfx` 인증서를 만들 수 있습니다. IP를 생략하면 현재 PC의 내부 IPv4를 자동으로 찾습니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-https-cert.ps1
```

현재 PC의 내부 IP가 `192.168.0.10`이라면 생성 후 아래 주소로 접속합니다.

```text
https://192.168.0.10:3000
```

`certs/localhost.cer` 파일은 모바일 기기에 설치해서 신뢰 등록할 때 사용합니다.

OpenSSL이 설치되어 있다면 PowerShell에서 아래처럼 PC의 내부 IP를 넣어 인증서를 만들 수 있습니다.

```powershell
New-Item -ItemType Directory -Force certs
openssl req -x509 -newkey rsa:2048 -nodes `
  -keyout certs/localhost-key.pem `
  -out certs/localhost.pem `
  -days 365 `
  -subj "/CN=192.168.0.10" `
  -addext "subjectAltName=IP:192.168.0.10,DNS:localhost,IP:127.0.0.1"
```

이 방식은 자체 서명 인증서라서 모바일에서 신뢰 설정을 해야 할 수 있습니다. iPhone은 인증서를 설치한 뒤 `설정 > 일반 > 정보 > 인증서 신뢰 설정`에서 전체 신뢰를 켜야 카메라 권한이 안정적으로 동작합니다.

## Excel 초기화

웹사이트의 `설정` 화면에서 `초기화` 버튼을 누르면 아래 시트가 포함된 `server/data/devices.xlsx`가 샘플 데이터로 다시 생성됩니다.

- `Devices`
- `Transactions`
- `Maintenance`
- `Users`
- `AuditLogs`

현재 Excel 파일을 직접 내려받으려면 `설정 > Excel 다운로드`를 사용하거나 아래 주소를 열면 됩니다.

```text
http://localhost:3000/api/excel/download
```

## 저장 경로

```text
server/data/devices.xlsx
server/uploads/devices/
server/uploads/transactions/
server/uploads/maintenance/
server/uploads/qrcodes/
server/uploads/backups/
```

사진 파일은 Excel 안에 직접 저장하지 않고, Excel에는 `/uploads/...` 형태의 경로만 기록합니다.

## Cloudflare Pages 배포

이 저장소는 public으로 운영될 수 있으므로 실제 운영 데이터(`server/data/devices.xlsx`)와 프로필 사진은 Git에 올리지 않습니다. Cloudflare Pages에서는 D1에 Excel 내용을 seed해서 `/api`가 동작하도록 구성합니다.

```bash
npm run build:pages
npm run deploy:pages
```

Cloudflare Pages 설정:

- Build command: `npm run build:pages`
- Build output directory: `client/dist`
- D1 binding: `DB` -> `mindsai-devicemanager-db`
- Secrets: `ADMIN_PASSWORD`, `SEED_TOKEN`

배포 후 현재 Excel 데이터를 D1에 반영합니다.

```bash
$env:PAGES_URL="https://<pages-domain>"
$env:SEED_TOKEN="<cloudflare-secret>"
npm run seed:pages
```

`ADMIN_PASSWORD`는 Cloudflare Pages 로그인용 관리자 비밀번호입니다. Git에 올리지 말고 Cloudflare secret으로만 관리하세요.

## 권장 사용 흐름

1. `admin / admin123!`로 로그인
2. 장비 등록에서 장비번호 자동 생성 후 저장
3. 장비 상세에서 QR 코드 다운로드 및 부착
4. 현장에서 QR 스캔 또는 장비 검색으로 상세 이동
5. 상태에 따라 대여 처리 또는 반납 처리
6. 필요 시 점검·고장 관리에 사진과 조치 내역 등록
