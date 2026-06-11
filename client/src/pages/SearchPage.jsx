import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import EmptyState from "../components/EmptyState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("keyword") || "");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);

  async function runSearch(value = keyword) {
    const trimmed = value.trim();
    setSearched(true);
    setParams(trimmed ? { keyword: trimmed } : {});
    setResults(await api(`/search?keyword=${encodeURIComponent(trimmed)}`));
  }

  useEffect(() => {
    const initial = params.get("keyword");
    if (initial) runSearch(initial);
  }, []);

  return (
    <div className="app-page">
      <section className="hero-strip">
        <h1 className="page-title">장비 검색</h1>
        <p className="mt-1 text-sm text-slate-500">장비번호, 장비명, 모델명, 시리얼번호, 위치로 검색합니다.</p>
      </section>
      <form className="panel p-4" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input className="input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="EQ-0001, Quest, 태블릿, SN12345" />
          <button className="btn-primary w-full sm:w-auto">
            <Search size={18} />
            검색
          </button>
        </div>
      </form>
      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">검색 결과</h2>
          <span className="text-sm font-semibold text-slate-500">{results.length}건</span>
        </div>
        {results.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.map((device) => (
              <Link key={device.device_id} to={`/devices/${device.device_id}`} className="mobile-card transition hover:border-cyan-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-ink">{device.device_name}</p>
                    <p className="mt-1 text-sm text-slate-500">{device.device_id}</p>
                  </div>
                  <StatusBadge status={device.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500">분류</dt><dd className="font-semibold">{device.category || "-"}</dd></div>
                  <div><dt className="text-slate-500">위치</dt><dd className="font-semibold">{device.location || "-"}</dd></div>
                  <div><dt className="text-slate-500">모델</dt><dd className="font-semibold">{device.model_name || "-"}</dd></div>
                  <div><dt className="text-slate-500">시리얼</dt><dd className="font-semibold">{device.serial_number || "-"}</dd></div>
                </dl>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title={searched ? "검색 결과가 없습니다." : "검색어를 입력하세요."} />
        )}
      </section>
    </div>
  );
}
