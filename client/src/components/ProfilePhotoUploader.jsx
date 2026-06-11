import { Camera, ImageUp, Pencil } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client.js";
import { compressImageFile } from "../utils/imageCompress.js";
import UserAvatar from "./UserAvatar.jsx";

function bytesToKb(value) {
  return Math.max(1, Math.round(value / 1024));
}

export default function ProfilePhotoUploader({ user, onUploaded, disabled = false, compact = false, buttonOnly = false, iconOnly = false, className = "" }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.user_id) return;

    setBusy(true);
    setMessage("");
    setError("");
    try {
      const compressed = await compressImageFile(file, { maxSize: 512, quality: 0.72 });
      const formData = new FormData();
      formData.append("photo", compressed);
      const saved = await api(`/users/${encodeURIComponent(user.user_id)}/profile-photo`, {
        method: "POST",
        body: formData
      });
      const originalKb = bytesToKb(file.size);
      const compressedKb = bytesToKb(compressed.size || file.size);
      setMessage(`업로드 완료: ${originalKb}KB -> ${compressedKb}KB`);
      onUploaded?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (iconOnly) {
    return (
      <div className={className}>
        <label
          className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-4 border-white bg-[#7f8797] text-white shadow-lift transition hover:bg-brand ${
            busy || disabled ? "pointer-events-none opacity-50" : ""
          }`}
          title={busy ? "압축·업로드 중" : "프로필 사진 변경"}
          aria-label={busy ? "압축·업로드 중" : "프로필 사진 변경"}
        >
          {busy ? <Camera size={20} /> : <Pencil size={19} />}
          <input className="sr-only" type="file" accept="image/*" onChange={upload} disabled={busy || disabled} />
        </label>
        {error ? <p className="absolute left-0 top-full mt-1 w-44 rounded-lg bg-white px-2 py-1 text-xs font-extrabold text-[#d84f71] shadow-soft">{error}</p> : null}
      </div>
    );
  }

  if (buttonOnly) {
    return (
      <div>
        <label className={`btn-secondary w-full cursor-pointer ${busy || disabled ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? <Camera size={18} /> : <ImageUp size={18} />}
          {busy ? "압축·업로드 중" : "프로필 사진 변경"}
          <input className="sr-only" type="file" accept="image/*" onChange={upload} disabled={busy || disabled} />
        </label>
        {message ? <p className="mt-2 text-center text-xs font-extrabold text-[#1eb6a5]">{message}</p> : null}
        {error ? <p className="mt-2 text-center text-xs font-extrabold text-[#d84f71]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-line bg-white p-4 ${compact ? "" : "shadow-soft"}`}>
      {!compact ? (
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <UserAvatar user={user} size="xl" className="h-32 w-32" />
            <label className={`absolute bottom-1 right-1 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-4 border-white bg-[#7f8797] text-white shadow-lift transition hover:bg-brand ${busy || disabled ? "pointer-events-none opacity-50" : ""}`}>
              <Camera size={22} />
              <input className="sr-only" type="file" accept="image/*" onChange={upload} disabled={busy || disabled} />
            </label>
          </div>
          <p className="mt-4 text-sm font-extrabold text-brand">프로필 사진</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">업로드 전 512px 기준 WebP로 압축합니다.</p>
          {message ? <p className="mt-2 text-xs font-extrabold text-[#1eb6a5]">{message}</p> : null}
          {error ? <p className="mt-2 text-xs font-extrabold text-[#d84f71]">{error}</p> : null}
        </div>
      ) : (
        <>
      <div className="flex items-center gap-4">
        <UserAvatar user={user} size={compact ? "lg" : "xl"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-brand">프로필 사진</p>
          <p className="mt-1 truncate text-base font-extrabold text-ink">{user?.name || "사용자"}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            선택한 이미지는 업로드 전에 512px 기준 WebP로 압축합니다.
          </p>
        </div>
      </div>
      <label className={`btn-secondary mt-4 w-full cursor-pointer ${busy || disabled ? "pointer-events-none opacity-50" : ""}`}>
        {busy ? <Camera size={18} /> : <ImageUp size={18} />}
        {busy ? "압축·업로드 중" : "사진 선택"}
        <input className="sr-only" type="file" accept="image/*" onChange={upload} disabled={busy || disabled} />
      </label>
      {message ? <p className="mt-2 text-xs font-extrabold text-[#1eb6a5]">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-extrabold text-[#d84f71]">{error}</p> : null}
        </>
      )}
    </div>
  );
}
