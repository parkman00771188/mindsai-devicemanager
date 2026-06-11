import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

function httpsConfig() {
  if (process.env.HTTPS !== "true") return undefined;

  const pfxPath = process.env.SSL_PFX || path.resolve("certs", "localhost.pfx");
  const certPath = process.env.SSL_CERT || path.resolve("certs", "localhost.pem");
  const keyPath = process.env.SSL_KEY || path.resolve("certs", "localhost-key.pem");

  if (fs.existsSync(pfxPath)) {
    return {
      pfx: fs.readFileSync(pfxPath),
      passphrase: process.env.SSL_PFX_PASSPHRASE || "device-manager-local"
    };
  }

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      [
        "HTTPS=true로 실행하려면 로컬 인증서 파일이 필요합니다.",
        `PFX 인증서: ${pfxPath}`,
        `인증서: ${certPath}`,
        `키 파일: ${keyPath}`,
        "README의 '모바일 HTTPS 접속' 섹션을 참고해 certs 폴더에 인증서를 만들어주세요."
      ].join("\n")
    );
  }

  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };
}

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    https: httpsConfig(),
    proxy: {
      "/api": "http://localhost:3001",
      "/uploads": "http://localhost:3001"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
