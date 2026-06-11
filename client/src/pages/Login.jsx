import { LockKeyhole, TabletSmartphone } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

export default function Login() {
  const [form, setForm] = useState({ user_id: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/login", { method: "POST", body: form });
      localStorage.setItem("deviceManagerUser", JSON.stringify(result.user));
      window.dispatchEvent(new Event("deviceManagerUserChanged"));
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (localStorage.getItem("deviceManagerUser")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5fb] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 rounded-lg bg-gradient-to-r from-[#7f6df2] to-[#6554dc] px-5 py-5 text-white shadow-lift">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/18">
              <TabletSmartphone size={25} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-normal">Device Manager</h1>
              <p className="text-sm font-bold text-white/75">장비 대여·반납 관리 시스템</p>
            </div>
          </div>
        </div>

        <form className="panel p-5" onSubmit={submit}>
          <div className="mb-5">
            <p className="page-kicker">관리자 로그인</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">로컬 Excel DB에 접근하려면 로그인하세요.</p>
          </div>
          <div className="space-y-4">
            <label>
              <span className="field-label">ID</span>
              <input
                className="input"
                value={form.user_id}
                onChange={(event) => setForm((current) => ({ ...current, user_id: event.target.value }))}
                autoComplete="username"
              />
            </label>
            <label>
              <span className="field-label">PW</span>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
              />
            </label>
          </div>
          {error ? <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
          <button className="btn-primary mt-6 w-full" disabled={busy}>
            <LockKeyhole size={18} />
            {busy ? "로그인 중" : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
