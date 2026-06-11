import XLSX from "xlsx";

const pagesUrl = (process.env.PAGES_URL || process.argv[2] || "").replace(/\/$/, "");
const seedToken = process.env.SEED_TOKEN || process.argv[3] || "";
const excelPath = process.env.EXCEL_PATH || "server/data/devices.xlsx";

if (!pagesUrl) throw new Error("PAGES_URL is required.");
if (!seedToken) throw new Error("SEED_TOKEN is required.");

const workbook = XLSX.readFile(excelPath);
const state = Object.fromEntries(
  workbook.SheetNames.map((sheetName) => [
    sheetName,
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" })
  ])
);

const response = await fetch(`${pagesUrl}/api/admin/seed`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-seed-token": seedToken
  },
  body: JSON.stringify(state)
});

if (!response.ok) {
  const message = await response.text();
  throw new Error(`Seed failed (${response.status}): ${message}`);
}

console.log(await response.text());
