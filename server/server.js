const fs = require("fs");
const path = require("path");
const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const multer = require("multer");
const store = require("./utils/excelStore");
const {
  absoluteQrLabelPath,
  absoluteQrPath,
  deleteQrForDevice,
  generateQrForDevice,
  generateQrLabelForDevice,
  pruneQrCodes,
  safeSegment
} = require("./utils/qrGenerator");

const app = express();
const port = Number(process.env.PORT || 3000);
const uploadsRoot = path.join(__dirname, "uploads");
const clientDist = path.join(__dirname, "..", "client", "dist");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/uploads", express.static(uploadsRoot));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function currentUser(req) {
  return req.get("x-user-id") || req.body.handled_by || "admin";
}

async function requireAdmin(req) {
  const userId = req.get("x-user-id") || req.body.handled_by || "";
  const user = userId ? await store.getUser(userId) : null;
  if (!user || user.role !== "ADMIN") {
    throw Object.assign(new Error("관리자만 처리할 수 있습니다."), { statusCode: 403 });
  }
  return user;
}

function adminOnly(req, res, next) {
  requireAdmin(req).then(() => next()).catch(next);
}

function clientOrigin(req) {
  return req.get("origin") || `${req.protocol}://${req.get("host")}`;
}

function publicFilePath(file) {
  if (!file) return "";
  return `/uploads/${path.relative(uploadsRoot, file.path).replace(/\\/g, "/")}`;
}

function publicFilePaths(files = []) {
  return files.map(publicFilePath).filter(Boolean);
}

function uploadFor(kind) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const entityId = safeSegment(req.params.deviceId || req.params.userId || req.body.device_id || req.body.user_id || "unassigned");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const folder =
        kind === "devices"
          ? path.join(uploadsRoot, "devices", entityId)
          : kind === "profiles"
          ? path.join(uploadsRoot, "profiles", entityId)
          : path.join(uploadsRoot, kind, `${entityId}-${stamp}`);
      fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || ".jpg").toLowerCase() || ".jpg";
      const base = safeSegment(path.basename(file.originalname || "photo", ext)).slice(0, 40);
      cb(null, `${Date.now()}-${base}${ext}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => {
      if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
      else cb(Object.assign(new Error("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다."), { statusCode: 400 }));
    }
  });
}

const devicePhotoUpload = uploadFor("devices");
const transactionPhotoUpload = uploadFor("transactions");
const maintenancePhotoUpload = uploadFor("maintenance");
const profilePhotoUpload = uploadFor("profiles");

async function ensureQrCodes(origin = "http://localhost:3000") {
  const devices = await store.listDevices({});
  pruneQrCodes(devices.map((device) => device.device_id));
  await Promise.all(
    devices.map((device) =>
      Promise.all([
        generateQrForDevice(device.device_id, origin),
        generateQrLabelForDevice(device.device_id, origin)
      ])
    )
  );
}

app.post(
  "/api/login",
  asyncRoute(async (req, res) => {
    const user = await store.authenticate(req.body.user_id, req.body.password);
    if (!user) {
      res.status(401).json({ message: "ID 또는 비밀번호가 올바르지 않습니다." });
      return;
    }
    res.json({ user });
  })
);

app.post("/api/logout", (req, res) => res.json({ ok: true }));
app.get("/api/me", (req, res) => res.json({ user: { user_id: "admin", name: "관리자", role: "ADMIN" } }));

app.get("/api/users", asyncRoute(async (req, res) => res.json(await store.listUsers(req.query))));
app.post(
  "/api/users",
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.createUser(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.get(
  "/api/users/:userId",
  asyncRoute(async (req, res) => {
    const user = await store.getUser(req.params.userId);
    if (!user) {
      res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      return;
    }
    res.json(user);
  })
);
app.put(
  "/api/users/:userId",
  asyncRoute(async (req, res) =>
    res.json(await store.updateUser(req.params.userId, req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.post(
  "/api/users/:userId/profile-photo",
  profilePhotoUpload.single("photo"),
  asyncRoute(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "프로필 사진을 선택해주세요." });
      return;
    }
    res.json(
      await store.updateUser(
        req.params.userId,
        { profile_photo_path: publicFilePath(req.file) },
        { userId: currentUser(req), ipAddress: req.ip }
      )
    );
  })
);
app.delete(
  "/api/users/:userId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteUser(req.params.userId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get("/api/institutions", asyncRoute(async (req, res) => res.json(await store.listInstitutions(req.query))));
app.post(
  "/api/institutions",
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.createInstitution(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.get(
  "/api/institutions/:institutionId",
  asyncRoute(async (req, res) => {
    const institution = await store.getInstitution(req.params.institutionId);
    if (!institution) {
      res.status(404).json({ message: "기관을 찾을 수 없습니다." });
      return;
    }
    res.json(institution);
  })
);
app.put(
  "/api/institutions/:institutionId",
  asyncRoute(async (req, res) =>
    res.json(await store.updateInstitution(req.params.institutionId, req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.delete(
  "/api/institutions/:institutionId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteInstitution(req.params.institutionId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get(
  "/api/notifications",
  asyncRoute(async (req, res) =>
    res.json(await store.listNotifications({ ...req.query, userId: currentUser(req) }))
  )
);
app.post(
  "/api/notifications/return-request",
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.createReturnRequestNotification(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.post(
  "/api/notifications/return-request/cancel",
  asyncRoute(async (req, res) =>
    res.json(await store.cancelReturnRequestNotification(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.put(
  "/api/notifications/:notificationId/read",
  asyncRoute(async (req, res) =>
    res.json(await store.markNotificationRead(req.params.notificationId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.put(
  "/api/notifications/read-all",
  asyncRoute(async (req, res) =>
    res.json(await store.markNotificationsRead(currentUser(req), { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.delete(
  "/api/notifications/deletable",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteDeletableNotifications(currentUser(req), { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.delete(
  "/api/notifications/:notificationId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteNotification(req.params.notificationId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get("/api/user-options", asyncRoute(async (req, res) => res.json(await store.listUserOptions(req.query))));
app.post(
  "/api/user-options",
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.createUserOption(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.put(
  "/api/user-options/:optionId",
  asyncRoute(async (req, res) =>
    res.json(await store.updateUserOption(req.params.optionId, req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.delete(
  "/api/user-options/:optionId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteUserOption(req.params.optionId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get("/api/dashboard/summary", asyncRoute(async (req, res) => res.json(await store.getDashboardSummary())));
app.get(
  "/api/dashboard/recent-transactions",
  asyncRoute(async (req, res) => res.json(await store.getRecentTransactions(Number(req.query.limit || 10))))
);

app.get("/api/categories", asyncRoute(async (req, res) => res.json(await store.listCategories())));
app.post(
  "/api/categories",
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.createCategory(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.put(
  "/api/categories/:categoryId",
  asyncRoute(async (req, res) =>
    res.json(await store.updateCategory(req.params.categoryId, req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.delete(
  "/api/categories/:categoryId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteCategory(req.params.categoryId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get("/api/device-types", asyncRoute(async (req, res) => res.json(await store.listDeviceTypes(req.query))));
app.post(
  "/api/device-types",
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.createDeviceType(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.put(
  "/api/device-types/:typeId",
  asyncRoute(async (req, res) =>
    res.json(await store.updateDeviceType(req.params.typeId, req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.delete(
  "/api/device-types/:typeId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteDeviceType(req.params.typeId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get("/api/reasons", asyncRoute(async (req, res) => res.json(await store.listReasons(req.query))));
app.post(
  "/api/reasons",
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.createReason(req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.put(
  "/api/reasons/:reasonId",
  asyncRoute(async (req, res) =>
    res.json(await store.updateReason(req.params.reasonId, req.body, { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.delete(
  "/api/reasons/:reasonId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteReason(req.params.reasonId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get(
  "/api/devices/next-id",
  asyncRoute(async (req, res) =>
    res.json({ device_id: await store.getNextDeviceId(req.query.category || "", req.query.model_name || "", req.query.capacity_gb || "") })
  )
);
app.get("/api/devices", asyncRoute(async (req, res) => res.json(await store.listDevices(req.query))));
app.get("/api/search", asyncRoute(async (req, res) => res.json(await store.searchDevices(req.query.keyword || ""))));

app.get(
  "/api/devices/:deviceId/detail",
  asyncRoute(async (req, res) => {
    const detail = await store.getDeviceDetail(req.params.deviceId);
    if (!detail) {
      res.status(404).json({ message: "삭제된 장비입니다." });
      return;
    }
    res.json(detail);
  })
);

app.get(
  "/api/devices/:deviceId",
  asyncRoute(async (req, res) => {
    const device = await store.getDevice(req.params.deviceId);
    if (!device) {
      res.status(404).json({ message: "삭제된 장비입니다." });
      return;
    }
    res.json(device);
  })
);

app.post(
  "/api/devices",
  devicePhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) => {
    req.body.device_id = await store.getNextDeviceId(req.body.category || "", req.body.model_name || "", req.body.capacity_gb || "");
    const qrPath = await generateQrForDevice(req.body.device_id, clientOrigin(req));
    await generateQrLabelForDevice(req.body.device_id, clientOrigin(req));
    const device = await store.createDevice(req.body, {
      photoPaths: publicFilePaths(req.files),
      qrPath,
      userId: currentUser(req),
      ipAddress: req.ip
    });
    res.status(201).json(device);
  })
);

app.put(
  "/api/devices/:deviceId",
  devicePhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) => {
    const previousDeviceId = req.params.deviceId;
    const device = await store.updateDevice(req.params.deviceId, req.body, {
      photoPaths: publicFilePaths(req.files),
      userId: currentUser(req),
      ipAddress: req.ip
    });
    if (device.device_id !== previousDeviceId) deleteQrForDevice(previousDeviceId);
    await generateQrForDevice(device.device_id, clientOrigin(req));
    await generateQrLabelForDevice(device.device_id, clientOrigin(req));
    res.json(device);
  })
);

app.delete(
  "/api/devices/:deviceId",
  asyncRoute(async (req, res) => {
    const shouldDeleteQr = req.query.delete === "true" || req.query.remove === "true" || req.query.hard === "true";
    const result =
      req.query.delete === "true" || req.query.remove === "true"
        ? await store.deleteDevice(req.params.deviceId, { userId: currentUser(req), ipAddress: req.ip, reason: req.body?.reason })
        : req.query.hard === "true"
        ? await store.hardDeleteDevice(req.params.deviceId, { userId: currentUser(req), ipAddress: req.ip })
        : await store.disposeDevice(req.params.deviceId, { userId: currentUser(req), ipAddress: req.ip, reason: req.body?.reason });
    if (shouldDeleteQr) deleteQrForDevice(req.params.deviceId);
    res.json(result);
  })
);

app.get(
  "/api/devices/:deviceId/qrcode",
  asyncRoute(async (req, res) => {
    const style = req.query.style === "label" ? "label" : "plain";
    if (style === "label") await generateQrLabelForDevice(req.params.deviceId, clientOrigin(req));
    else await generateQrForDevice(req.params.deviceId, clientOrigin(req));
    const absolutePath = style === "label" ? absoluteQrLabelPath(req.params.deviceId) : absoluteQrPath(req.params.deviceId);
    res.set("Cache-Control", style === "label" ? "no-cache" : "public, max-age=3600");
    if (req.query.download === "1" || req.query.download === "true") {
      res.download(absolutePath, `${safeSegment(req.params.deviceId)}-${style === "label" ? "qr-label.svg" : "qr.png"}`);
      return;
    }
    res.type(style === "label" ? "image/svg+xml" : "image/png").sendFile(absolutePath);
  })
);

app.post(
  "/api/devices/:deviceId/rent",
  transactionPhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) =>
    res.json(await store.rentDevice(req.params.deviceId, req.body, publicFilePaths(req.files), { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.post(
  "/api/devices/:deviceId/delivery",
  adminOnly,
  transactionPhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) =>
    res.json(await store.deliverDevice(req.params.deviceId, req.body, publicFilePaths(req.files), { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.put(
  "/api/devices/:deviceId/rental-info",
  transactionPhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) =>
    res.json(await store.updateRentalInfo(req.params.deviceId, req.body, publicFilePaths(req.files), { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.post(
  "/api/devices/:deviceId/return",
  transactionPhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) =>
    res.json(await store.returnDevice(req.params.deviceId, req.body, publicFilePaths(req.files), { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.post(
  "/api/devices/:deviceId/recover",
  adminOnly,
  transactionPhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) =>
    res.json(await store.recoverDevice(req.params.deviceId, req.body, publicFilePaths(req.files), { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.post(
  "/api/devices/:deviceId/status",
  transactionPhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) =>
    res.json(await store.changeDeviceStatus(req.params.deviceId, req.body, publicFilePaths(req.files), { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get("/api/transactions", asyncRoute(async (req, res) => res.json(await store.listTransactions(req.query))));
app.get("/api/devices/:deviceId/transactions", asyncRoute(async (req, res) => res.json(await store.getDeviceTransactions(req.params.deviceId))));
app.delete(
  "/api/transactions/:transactionId",
  asyncRoute(async (req, res) =>
    res.json(await store.deleteTransaction(req.params.transactionId, { userId: currentUser(req), ipAddress: req.ip }))
  )
);

app.get("/api/maintenance", asyncRoute(async (req, res) => res.json(await store.listMaintenance(req.query))));
app.post(
  "/api/devices/:deviceId/maintenance",
  maintenancePhotoUpload.array("photos", 10),
  asyncRoute(async (req, res) =>
    res.status(201).json(await store.addMaintenance(req.params.deviceId, req.body, publicFilePaths(req.files), { userId: currentUser(req), ipAddress: req.ip }))
  )
);
app.put(
  "/api/maintenance/:maintenanceId",
  asyncRoute(async (req, res) => res.json(await store.updateMaintenance(req.params.maintenanceId, req.body, { userId: currentUser(req), ipAddress: req.ip })))
);

app.post("/api/upload/device-photo", devicePhotoUpload.single("photo"), (req, res) => res.json({ path: publicFilePath(req.file) }));
app.post("/api/upload/transaction-photo", transactionPhotoUpload.array("photos", 10), (req, res) => res.json({ paths: publicFilePaths(req.files) }));

app.get("/api/excel/download", (req, res) => res.download(store.excelPath, "devices.xlsx"));
app.post("/api/excel/backup", asyncRoute(async (req, res) => res.json(await store.backupWorkbook())));
app.post(
  "/api/excel/init",
  asyncRoute(async (req, res) => {
    const data = await store.initializeWorkbook({ force: req.body.force !== false, sample: req.body.sample !== false });
    await ensureQrCodes(clientOrigin(req));
    res.json({ ok: true, devices: data.Devices.length, excelPath: store.excelPath, uploadsPath: uploadsRoot });
  })
);
app.get("/api/settings/paths", (req, res) => {
  res.json({ excelPath: store.excelPath, uploadsPath: uploadsRoot, backupsPath: path.join(uploadsRoot, "backups") });
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ message: "API endpoint not found" });
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) console.error(err);
  res.status(statusCode).json({ message: err.message || "서버 오류가 발생했습니다." });
});

async function bootstrap() {
  await store.initializeWorkbook({ sample: true });
  await ensureQrCodes();
  app.listen(port, "0.0.0.0", () => {
    console.log(`Device Manager API is running on http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
