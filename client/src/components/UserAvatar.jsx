import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

const sizeClasses = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl"
};

export default function UserAvatar({ user, size = "md", className = "" }) {
  const [failed, setFailed] = useState(false);
  const src = user?.profile_photo_path || "";
  const hasImage = src && !failed;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-br from-[#7f6df2] to-[#22c7ba] font-extrabold text-white shadow-soft",
        hasImage ? "" : "bg-none bg-[#c9ccd4] text-white",
        sizeClasses[size] || sizeClasses.md,
        className
      ].join(" ")}
    >
      {hasImage ? (
        <img
          className="h-full w-full object-cover"
          src={src}
          alt={`${user?.name || "사용자"} 프로필 사진`}
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound size={size === "xl" ? 54 : size === "lg" ? 34 : size === "sm" ? 20 : 24} strokeWidth={2.4} />
      )}
    </span>
  );
}
