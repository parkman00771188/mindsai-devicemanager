param(
  [string]$IpAddress = "",
  [string]$Passphrase = "device-manager-local"
)

$ErrorActionPreference = "Stop"

if (-not $IpAddress) {
  $IpAddress = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress)
}

if (-not $IpAddress) {
  throw "내부 IP를 찾지 못했습니다. 예: powershell -ExecutionPolicy Bypass -File scripts/create-https-cert.ps1 -IpAddress 192.168.0.10"
}

$certDir = Join-Path (Get-Location) "certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$pfxPath = Join-Path $certDir "localhost.pfx"
$cerPath = Join-Path $certDir "localhost.cer"
$securePassphrase = ConvertTo-SecureString $Passphrase -AsPlainText -Force
$subjectAlternativeNames = "2.5.29.17={text}DNS=localhost&IPAddress=127.0.0.1&IPAddress=$IpAddress"

$cert = New-SelfSignedCertificate `
  -Subject "CN=Device Manager Local" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(2) `
  -TextExtension @($subjectAlternativeNames)

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassphrase | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host "HTTPS 인증서를 만들었습니다."
Write-Host "PFX: $pfxPath"
Write-Host "모바일 신뢰 등록용 CER: $cerPath"
Write-Host "접속 주소: https://${IpAddress}:3000"
