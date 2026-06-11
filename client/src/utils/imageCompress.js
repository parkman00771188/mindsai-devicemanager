function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function compressedFileName(name, type) {
  const base = String(name || "image").replace(/\.[^.]+$/, "") || "image";
  const extension = type === "image/webp" ? "webp" : "jpg";
  return `${base}.${extension}`;
}

export async function compressImageFile(file, options = {}) {
  if (!file || !file.type?.startsWith("image/")) return file;

  const maxSize = options.maxSize || 512;
  const quality = options.quality ?? 0.72;
  const image = await loadImageFromFile(file);
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return file;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let outputType = "image/webp";
  let blob = await canvasToBlob(canvas, outputType, quality);
  if (!blob) {
    outputType = "image/jpeg";
    blob = await canvasToBlob(canvas, outputType, quality);
  }
  if (!blob) return file;

  return new File([blob], compressedFileName(file.name, outputType), {
    type: outputType,
    lastModified: Date.now()
  });
}

export async function compressImageFiles(files = [], options = {}) {
  const list = Array.from(files || []);
  return Promise.all(list.map((file) => compressImageFile(file, options).catch(() => file)));
}
