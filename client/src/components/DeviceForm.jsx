import { Camera, ImagePlus, Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { DEVICE_FIELDS, isLaptopDevice, splitPhotoPaths } from "../constants.js";
import { compressImageFiles } from "../utils/imageCompress.js";

const emptyDevice = {
  device_id: "",
  legacy_device_id: "",
  device_name: "",
  category: "",
  manufacturer: "",
  model_name: "",
  capacity_gb: "",
  capacity_unit: "GB",
  ram_capacity: "",
  storage_capacity: "",
  cpu: "",
  gpu: "",
  windows_spec: "",
  serial_number: "",
  purchase_date: "",
  purchase_price: "",
  department: "",
  manager: "",
  location: "",
  status: "AVAILABLE",
  components: "",
  memo: ""
};

const deviceFormFieldNames = new Set(Object.keys(emptyDevice));

const primaryFields = DEVICE_FIELDS.filter(([name]) => ["location"].includes(name));
const detailFields = DEVICE_FIELDS.filter(([name]) => ["legacy_device_id", "manufacturer", "serial_number", "components", "memo"].includes(name));
const purchaseFields = DEVICE_FIELDS.filter(([name]) => ["purchase_date", "purchase_price", "department", "manager"].includes(name));
const laptopFields = [
  ["ram_capacity", "램 용량"],
  ["storage_capacity", "저장장치 용량"],
  ["cpu", "CPU"],
  ["gpu", "GPU"],
  ["windows_spec", "Windows 사양"]
];

function FormRow({ label, required, children, hint, className = "" }) {
  return (
    <div className={`grid min-w-0 gap-2 border-b border-line/80 pb-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start ${className}`}>
      <div className="pt-3 text-sm font-extrabold text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-[#ef5f7a]">*</span> : null}
      </div>
      <div className="min-w-0">
        {children}
        {hint ? <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function normalizeDateValue(value) {
  const source = String(value || "").trim();
  const match = source.match(/^(\d{4,})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return source;
  return `${match[1].slice(0, 4)}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function formatCapacityInput(value, unit) {
  if (!value) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const display = unit === "TB" ? number / 1024 : number;
  return Number.isInteger(display) ? String(display) : String(Number(display.toFixed(3)));
}

function normalizeCapacityInput(value, unit) {
  if (value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "";
  const capacityGb = unit === "TB" ? number * 1024 : number;
  return Number.isInteger(capacityGb) ? String(capacityGb) : String(Number(capacityGb.toFixed(3)));
}

function Field({ name, label, type = "text", required, value, onChange, className = "" }) {
  const isDate = type === "date";
  const inputValue = isDate ? normalizeDateValue(value) : value || "";
  const handleChange = (event) => {
    onChange(name, isDate ? normalizeDateValue(event.target.value) : event.target.value);
  };

  return (
    <FormRow label={label} required={required} className={className}>
      {type === "textarea" ? (
        <textarea name={name} className="textarea text-base" value={value || ""} onChange={(event) => onChange(name, event.target.value)} />
      ) : (
        <input
          name={name}
          className="input text-base"
          type={type}
          value={inputValue}
          min={isDate ? "1900-01-01" : undefined}
          max={isDate ? "2099-12-31" : undefined}
          onChange={handleChange}
          onBlur={handleChange}
          required={Boolean(required)}
        />
      )}
    </FormRow>
  );
}

function CapacityField({ value, unit = "GB", onChange }) {
  const displayValue = formatCapacityInput(value, unit);

  return (
    <FormRow label="용량" hint="기본은 GB이며, 필요한 경우 TB로 바꿔 입력할 수 있습니다. 필수 항목은 아닙니다.">
      <div className="flex max-w-md min-w-0 overflow-hidden rounded-lg border border-line bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-[#e5e1ff]">
        <input
          name="capacity_gb"
          className="h-12 min-w-0 flex-1 bg-white px-4 text-base font-semibold text-ink outline-none placeholder:text-slate-400"
          type="number"
          min="0"
          step="1"
          value={displayValue}
          onChange={(event) => onChange("capacity_gb", normalizeCapacityInput(event.target.value, unit))}
          placeholder={unit === "TB" ? "1" : "128"}
        />
        <select
          name="capacity_unit"
          className="h-12 shrink-0 border-l border-line bg-slate-50 px-3 text-sm font-extrabold text-slate-600 outline-none"
          value={unit}
          onChange={(event) => onChange("capacity_unit", event.target.value)}
          aria-label="용량 단위"
        >
          <option value="GB">GB</option>
          <option value="TB">TB</option>
        </select>
      </div>
    </FormRow>
  );
}

function formatFileSize(size) {
  const number = Number(size) || 0;
  if (number >= 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1)}MB`;
  if (number >= 1024) return `${Math.round(number / 1024)}KB`;
  return `${number}B`;
}

const PHOTO_LIMIT = 10;

function uniqueDevicePhotos(device = {}) {
  return [...new Set([...splitPhotoPaths(device.photo_paths), ...splitPhotoPaths(device.main_photo_path)])];
}

function serializePhotoPaths(paths = []) {
  const list = [...new Set(paths.map((path) => String(path || "").trim()).filter(Boolean))];
  if (list.some((path) => path.startsWith("data:"))) return JSON.stringify(list);
  return list.join(";");
}

function photoNameFromPath(path) {
  if (String(path || "").startsWith("data:")) return "등록된 사진";
  const name = String(path || "").split(/[\\/]/).filter(Boolean).pop() || "등록된 사진";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export default function DeviceForm({ initialDevice, mode = "create", onSubmit, busy }) {
  const [form, setForm] = useState(initialDevice || emptyDevice);
  const [categories, setCategories] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [keptPhotoPaths, setKeptPhotoPaths] = useState(() => uniqueDevicePhotos(initialDevice || {}));
  const [existingPhotoSizes, setExistingPhotoSizes] = useState({});
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [compressing, setCompressing] = useState(false);
  const isCreate = mode === "create";
  const canGenerate = useMemo(() => isCreate && form.category, [isCreate, form.category]);
  const previewName = form.category && form.model_name ? `${form.category} (${form.model_name})` : form.category || form.model_name || form.device_name || "장비 정보를 입력하세요";
  const hasCurrentCategory = categories.some((category) => category.category_name === form.category);
  const selectedCategory = categories.find((category) => category.category_name === form.category);
  const typesForCategory = deviceTypes.filter(
    (type) => type.category_id === selectedCategory?.category_id || type.category_name === form.category
  );
  const hasCurrentType = typesForCategory.some((type) => type.type_name === form.model_name);
  const isLaptop = isLaptopDevice(form);
  const selectedPhotos = photos;
  const existingPhotos = keptPhotoPaths;
  const totalPhotoCount = existingPhotos.length + selectedPhotos.length;
  const canAddPhotos = totalPhotoCount < PHOTO_LIMIT;
  const selectedPhotoSize = useMemo(() => selectedPhotos.reduce((sum, photo) => sum + (Number(photo.size) || 0), 0), [selectedPhotos]);
  const existingPhotoSize = useMemo(
    () => existingPhotos.reduce((sum, path) => sum + (Number(existingPhotoSizes[path]) || 0), 0),
    [existingPhotos, existingPhotoSizes]
  );
  const totalKnownPhotoSize = selectedPhotoSize + existingPhotoSize;

  useEffect(() => {
    setForm({ ...emptyDevice, ...(initialDevice || {}) });
    setKeptPhotoPaths(uniqueDevicePhotos(initialDevice || {}));
    setPhotos([]);
  }, [initialDevice]);

  useEffect(() => {
    Promise.all([api("/categories"), api("/device-types")])
      .then(([categoryData, typeData]) => {
        setCategories(categoryData);
        setDeviceTypes(typeData);
      })
      .catch(() => {
        setCategories([]);
        setDeviceTypes([]);
      });
  }, []);

  useEffect(() => {
    const previews = photos.map((photo) => ({
      key: `${photo.name}-${photo.size}-${photo.lastModified}`,
      name: photo.name,
      size: photo.size,
      url: URL.createObjectURL(photo)
    }));
    setPhotoPreviews(previews);
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [photos]);

  useEffect(() => {
    let ignore = false;
    const paths = existingPhotos;
    setExistingPhotoSizes((current) =>
      Object.fromEntries(paths.filter((path) => current[path] !== undefined).map((path) => [path, current[path]]))
    );
    paths.forEach((path) => {
      fetch(path, { method: "HEAD" })
        .then((response) => {
          const size = Number(response.headers.get("content-length"));
          if (!ignore) {
            setExistingPhotoSizes((current) => ({ ...current, [path]: Number.isFinite(size) && size > 0 ? size : null }));
          }
        })
        .catch(() => {
          if (!ignore) setExistingPhotoSizes((current) => ({ ...current, [path]: null }));
        });
    });
    return () => {
      ignore = true;
    };
  }, [existingPhotos.join(";")]);

  async function generateId(category = form.category, modelName = form.model_name, capacityGb = isLaptopDevice(category) ? "" : form.capacity_gb) {
    const result = await api(
      `/devices/next-id?category=${encodeURIComponent(category || "")}&model_name=${encodeURIComponent(modelName || "")}&capacity_gb=${encodeURIComponent(capacityGb || "")}`
    );
    setForm((current) =>
      current.category === category && (current.model_name || "") === (modelName || "") && (isLaptopDevice(current) ? "" : current.capacity_gb || "") === (capacityGb || "")
        ? { ...current, device_id: result.device_id }
        : current
    );
  }

  const idCapacity = isLaptop ? "" : form.capacity_gb;

  useEffect(() => {
    if (isCreate && form.category && !form.device_id) generateId(form.category, form.model_name, idCapacity).catch(() => {});
  }, [form.category, form.model_name, idCapacity, form.device_id, isCreate]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value, device_id: isCreate && name === "capacity_gb" && !isLaptopDevice(current) ? "" : current.device_id }));
  }

  function selectCategory(category) {
    const nextCategory = categories.find((item) => item.category_name === category);
    const nextTypes = deviceTypes.filter((type) => type.category_id === nextCategory?.category_id || type.category_name === category);
    const nextIsLaptop = isLaptopDevice(category);
    setForm((current) => ({
      ...current,
      category,
      model_name: nextTypes.some((type) => type.type_name === current.model_name) ? current.model_name : "",
      capacity_gb: nextIsLaptop ? "" : current.capacity_gb,
      ram_capacity: nextIsLaptop ? current.ram_capacity : "",
      storage_capacity: nextIsLaptop ? current.storage_capacity : "",
      cpu: nextIsLaptop ? current.cpu : "",
      gpu: nextIsLaptop ? current.gpu : "",
      windows_spec: nextIsLaptop ? current.windows_spec : "",
      device_id: isCreate ? "" : current.device_id
    }));
  }

  function selectType(modelName) {
    setForm((current) => ({
      ...current,
      model_name: modelName,
      device_id: isCreate ? "" : current.device_id
    }));
  }

  function addPhotos(fileList) {
    const incoming = Array.from(fileList || []);
    const availableSlots = Math.max(0, PHOTO_LIMIT - existingPhotos.length);
    if (!incoming.length || availableSlots <= 0) return;
    setPhotos((current) => {
      const next = [...current];
      incoming.forEach((photo) => {
        if (next.length >= availableSlots) return;
        const duplicate = next.some(
          (item) => item.name === photo.name && item.size === photo.size && item.lastModified === photo.lastModified
        );
        if (!duplicate) next.push(photo);
      });
      return next;
    });
  }

  function removePhoto(index) {
    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function removeExistingPhoto(index) {
    setKeptPhotoPaths((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setCompressing(true);
    const data = new FormData(event.currentTarget);
    Object.entries(form).forEach(([key, value]) => {
      if (!deviceFormFieldNames.has(key)) return;
      if (!data.has(key)) data.append(key, value ?? "");
    });
    if (isLaptopDevice(form)) {
      data.set("capacity_gb", "");
    } else {
      ["ram_capacity", "storage_capacity", "cpu", "gpu", "windows_spec"].forEach((key) => data.set(key, ""));
    }
    if (isCreate) data.set("status", "AVAILABLE");
    if (!isCreate) data.set("keep_photo_paths", serializePhotoPaths(existingPhotos));
    data.set("device_name", previewName);
    const compressedPhotos = await compressImageFiles(selectedPhotos, { maxSize: 1280, quality: 0.72, maxBytes: 450 * 1024 });
    compressedPhotos.forEach((photo) => data.append("photos", photo));
    try {
      await onSubmit(data);
    } finally {
      setCompressing(false);
    }
  }

  return (
    <form className="mx-auto max-w-5xl space-y-5" onSubmit={submit}>
      <section className="panel px-4 py-6 sm:px-8 sm:py-8">
        <div className="text-center">
          <p className="page-kicker">{isCreate ? "신규 등록" : "정보 수정"}</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-normal text-ink">{isCreate ? "장비 등록" : "장비 정보 수정"}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">{previewName}</p>
        </div>

        <div className="mt-8 flex justify-end text-xs font-extrabold text-slate-500">
          <span className="text-[#ef5f7a]">*</span>
          필수입력사항
        </div>

        <div className="mt-3 border-t-2 border-ink/70 pt-5">
          <div className="grid gap-4">
            <FormRow label="장비번호" required hint="분류와 모델명 기준으로 자동 생성됩니다.">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <input name="device_id" className="input bg-slate-50 text-base text-slate-600" value={form.device_id || ""} readOnly required placeholder="분류 선택 후 자동 생성" />
                {isCreate ? (
                  <button type="button" className="btn-secondary shrink-0 px-4" onClick={() => generateId()} disabled={!canGenerate}>
                    <Wand2 size={17} />
                    자동
                  </button>
                ) : null}
              </div>
            </FormRow>

            <FormRow label="분류" required hint="설정의 분류 관리에서 등록한 항목을 선택합니다.">
              <select name="category" className="select text-base" value={form.category || ""} onChange={(event) => selectCategory(event.target.value)} required>
                <option value="">분류 선택</option>
                {form.category && !hasCurrentCategory ? <option value={form.category}>{form.category}</option> : null}
                {categories.map((category) => (
                  <option key={category.category_id} value={category.category_name}>
                    {category.category_name} ({category.prefix})
                  </option>
                ))}
              </select>
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category.category_id}
                    type="button"
                    className={`chip ${form.category === category.category_name ? "chip-active" : ""}`}
                    onClick={() => selectCategory(category.category_name)}
                  >
                    {category.category_name}
                  </button>
                ))}
                {!categories.length ? <p className="text-sm font-semibold text-slate-500">설정에서 분류를 먼저 등록해주세요.</p> : null}
              </div>
            </FormRow>

            <FormRow label="모델명" required>
              <select name="model_name" className="select text-base" value={form.model_name || ""} onChange={(event) => selectType(event.target.value)} required>
                <option value="">{form.category ? "모델명 선택" : "분류를 먼저 선택"}</option>
                {form.model_name && !hasCurrentType ? <option value={form.model_name}>{form.model_name}</option> : null}
                {typesForCategory.map((type) => (
                  <option key={type.type_id} value={type.type_name}>
                    {type.type_prefix ? `${type.type_name} (${type.type_prefix})` : type.type_name}
                  </option>
                ))}
              </select>
            </FormRow>

            {primaryFields.map(([name, label, type = "text", required]) => (
              <Field key={name} name={name} label={label} type={type} required={required} value={form[name]} onChange={update} />
            ))}

          </div>
        </div>
      </section>

      <section className="panel px-4 py-5 sm:px-8">
        <div className="border-b border-line pb-3">
          <h2 className="section-title">상세 정보</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">필수는 아니지만 이력 추적과 장비 식별에 도움이 되는 항목입니다.</p>
        </div>
        <div className="mt-4 grid gap-4">
          {!isLaptop ? <CapacityField value={form.capacity_gb} unit={form.capacity_unit || "GB"} onChange={update} /> : null}
          {isLaptop ? (
            <>
              <div className="border-b border-line/80 pb-2">
                <h3 className="text-sm font-extrabold text-ink">노트북 사양</h3>
              </div>
              {laptopFields.map(([name, label]) => (
                <Field key={name} name={name} label={label} value={form[name]} onChange={update} />
              ))}
            </>
          ) : null}
          {detailFields.map(([name, label, type = "text", required]) => (
            <Field
              key={name}
              name={name}
              label={label}
              type={type}
              required={required}
              value={form[name]}
              onChange={update}
            />
          ))}
        </div>
      </section>

      <section className="panel px-4 py-5 sm:px-8">
        <div className="border-b border-line pb-3">
          <h2 className="section-title">구매 및 관리</h2>
        </div>
        <div className="mt-4 grid gap-4">
          {purchaseFields.map(([name, label, type = "text", required]) => (
            <Field key={name} name={name} label={label} type={type} required={required} value={form[name]} onChange={update} />
          ))}
        </div>
      </section>

      <section className="panel px-4 py-5 sm:px-8">
        <div className="border-b border-line pb-3">
          <h2 className="section-title">장비 사진</h2>
        </div>
        <FormRow label="대표/상세 사진" hint="JPG, PNG, WEBP 최대 10장까지 선택할 수 있습니다." className="mt-4 border-b-0 pb-0">
          <label className={`flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-[#c9c4ff] bg-[#f7f7fd] px-4 py-6 text-center transition hover:bg-[#f2f0ff] ${canAddPhotos ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
            <ImagePlus size={28} className="text-brand" />
            <span className="mt-2 text-sm font-extrabold text-ink">{canAddPhotos ? (totalPhotoCount ? "사진 추가 선택" : "사진 여러 장 선택") : "최대 10장 선택됨"}</span>
            <span className="mt-1 text-xs font-bold text-slate-500">
              {totalPhotoCount
                ? `${totalPhotoCount}/${PHOTO_LIMIT}장 선택됨${totalKnownPhotoSize ? ` · 총 ${formatFileSize(totalKnownPhotoSize)}` : ""}`
                : "선택 후 아래에서 미리보기와 삭제가 가능합니다."}
            </span>
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={!canAddPhotos}
              onChange={(event) => {
                addPhotos(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {totalPhotoCount ? (
            <div className="mt-4 rounded-lg border border-line bg-white p-3">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-ink">사진 목록</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">첫 번째 사진이 대표 사진으로 저장됩니다. 기존 사진도 삭제할 수 있습니다.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-lg bg-[#f2f0ff] px-2 py-1 text-[11px] font-extrabold text-brand">총 {totalPhotoCount}장</span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-600">
                      확인된 용량 {totalKnownPhotoSize ? formatFileSize(totalKnownPhotoSize) : "-"}
                    </span>
                    {selectedPhotoSize ? (
                      <span className="rounded-lg bg-[#eaf7ff] px-2 py-1 text-[11px] font-extrabold text-sky-700">
                        신규 {formatFileSize(selectedPhotoSize)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <label className={`btn-secondary h-10 px-3 text-xs ${canAddPhotos ? "cursor-pointer" : "pointer-events-none cursor-not-allowed opacity-50"}`}>
                  <Plus size={15} />
                  사진 추가
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={!canAddPhotos}
                    onChange={(event) => {
                      addPhotos(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {existingPhotos.map((path, index) => {
                  const name = photoNameFromPath(path);
                  const size = existingPhotoSizes[path];
                  return (
                    <div key={`${path}-${index}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-[#f7f7fd] p-2">
                      <img src={path} alt={`등록된 장비 사진 ${index + 1}`} className="h-16 w-16 shrink-0 rounded-lg border border-line bg-white object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          {index === 0 ? <span className="shrink-0 rounded-lg bg-[#f2f0ff] px-2 py-0.5 text-[11px] font-extrabold text-brand">대표</span> : null}
                          <span className="shrink-0 rounded-lg bg-white px-2 py-0.5 text-[11px] font-extrabold text-slate-500">기존</span>
                          <p className="truncate text-sm font-extrabold text-ink">{name}</p>
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          등록된 사진 · {size === undefined ? "용량 확인 중" : size ? formatFileSize(size) : "용량 정보 없음"}
                        </p>
                      </div>
                      <button
                        className="btn-danger h-10 w-10 shrink-0 p-0"
                        type="button"
                        onClick={() => removeExistingPhoto(index)}
                        aria-label={`${name} 삭제`}
                        title="삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
                {photoPreviews.map((photo, index) => (
                  <div key={photo.key} className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-[#f7f7fd] p-2">
                    <img src={photo.url} alt={`${photo.name} 미리보기`} className="h-16 w-16 shrink-0 rounded-lg border border-line bg-white object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {existingPhotos.length + index === 0 ? <span className="shrink-0 rounded-lg bg-[#f2f0ff] px-2 py-0.5 text-[11px] font-extrabold text-brand">대표</span> : null}
                        <span className="shrink-0 rounded-lg bg-[#eaf7ff] px-2 py-0.5 text-[11px] font-extrabold text-sky-700">신규</span>
                        <p className="truncate text-sm font-extrabold text-ink">{photo.name}</p>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatFileSize(photo.size)}</p>
                    </div>
                    <button
                      className="btn-danger h-10 w-10 shrink-0 p-0"
                      type="button"
                      onClick={() => removePhoto(index)}
                      aria-label={`${photo.name} 삭제`}
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </FormRow>
      </section>

      <div className="sticky bottom-20 z-10 flex justify-center rounded-lg bg-white/80 p-2 backdrop-blur lg:static lg:bg-transparent lg:p-0">
        <button type="submit" className="btn-primary w-full max-w-sm" disabled={busy || compressing}>
          <Camera size={18} />
          {compressing ? "사진 압축 중" : busy ? "저장 중" : isCreate ? "장비 등록" : "수정 저장"}
        </button>
      </div>
    </form>
  );
}
