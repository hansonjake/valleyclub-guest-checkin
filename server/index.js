// server/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

import {
  findOrCreateGuest,
  findGuestByLicense,
  updateGuest,
  deleteVisitById,
  getTodayDateString,
  getVisitForGuestOnDate,
  getVisitsForGuestInYear,
  getVisitsForGuestInMonth,
  createVisit,
  addDepartmentToVisit,
  searchGuests,
  getGuestVisitsSummary,
  getAllGuests,
} from "./dataStore.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// OpenAI client (OPENAI_API_KEY must be in server/.env)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper: use OpenAI to parse barcode text
async function parseBarcodeWithAI(rawBarcodeData) {
  const prompt = `
You are an API that parses the PDF417 barcode data on the back of a U.S. driver's license.

Given the raw decoded text from the barcode, extract:

- license_state: two-letter state code (e.g. "ID", "CA")
- license_number: driver's license / ID number
- first_name: first name if present, else null
- last_name: last name if present, else null

Return ONLY valid JSON in exactly this shape:

{
  "license_state": "...",
  "license_number": "...",
  "first_name": "...",
  "last_name": "..."
}

Raw barcode data:
${rawBarcodeData}
`.trim();

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const text =
    (response.output &&
      response.output[0] &&
      response.output[0].content &&
      response.output[0].content[0] &&
      response.output[0].content[0].text) ||
    response.output_text ||
    "";

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse JSON from OpenAI:", text);
    throw new Error("Failed to parse JSON from OpenAI");
  }

  return {
    licenseState: parsed.license_state || "",
    licenseNumber: parsed.license_number || "",
    firstName: parsed.first_name || null,
    lastName: parsed.last_name || null,
  };
}

// -----------------------------
// Health check
// -----------------------------
function csvValue(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// -----------------------------
// /api/parse-barcode
// -----------------------------
app.post("/api/parse-barcode", async (req, res) => {
  const { rawBarcodeData } = req.body;

  if (!rawBarcodeData) {
    return res.status(400).json({ error: "rawBarcodeData is required" });
  }

  try {
    const parsed = await parseBarcodeWithAI(rawBarcodeData);
    res.json({ parsed });
  } catch (err) {
    console.error("Error in /api/parse-barcode:", err);
    res.status(500).json({ error: "Failed to parse barcode with OpenAI." });
  }
});

// -----------------------------
// /api/checkin
// -----------------------------
app.post("/api/checkin", (req, res) => {
  const {
    licenseState,
    licenseNumber,
    firstName,
    lastName,
    department,
    campus,
  } = req.body;

  if (!licenseState || !licenseNumber) {
    return res
      .status(400)
      .json({ error: "Missing licenseState or licenseNumber." });
  }
  if (!department) {
    return res.status(400).json({ error: "Missing department." });
  }
  if (!campus) {
    return res.status(400).json({ error: "Missing campus." });
  }

  const normalizedState = licenseState.toUpperCase();

  // 1) Find or create guest
  const guest = findOrCreateGuest({
    licenseState: normalizedState,
    licenseNumber,
    firstName,
    lastName,
  });

  const today = getTodayDateString();
  const now = new Date();
  const currentYear = now.getFullYear();

  // 2) Check if there's already a visit today
  const existingVisit = getVisitForGuestOnDate(guest.id, today);
  const yearVisits = getVisitsForGuestInYear(guest.id, currentYear);
  const currentYearCount = yearVisits.length;

  if (existingVisit) {
    const deptEntry = addDepartmentToVisit(existingVisit.id, department);
    return res.json({
      status: "already-checked-in-today",
      message: "Guest has already checked into the club today.",
      guest,
      visit: {
        ...existingVisit,
        departments: [deptEntry],
      },
      stats: {
        visitsThisYear: currentYearCount,
        maxVisitsPerYear: 9,
      },
    });
  }

  // 3) Enforce 9 visits per year
  if (currentYearCount >= 9) {
    return res.status(403).json({
      status: "blocked",
      reason: "year-limit",
      message: "Guest has already used 9 visits this calendar year.",
      stats: {
        visitsThisYear: currentYearCount,
        maxVisitsPerYear: 9,
      },
    });
  }

  // 4) Enforce July / August rules
  const month = now.getMonth() + 1; // 1-12

  if (month === 7) {
    const julyVisits = getVisitsForGuestInMonth(guest.id, currentYear, 7);
    if (julyVisits.length >= 1) {
      return res.status(403).json({
        status: "blocked",
        reason: "july-limit",
        message: "Guest has already used their July visit this year.",
        stats: {
          visitsThisYear: currentYearCount,
          maxVisitsPerYear: 9,
        },
      });
    }
  }

  if (month === 8) {
    const augustVisits = getVisitsForGuestInMonth(guest.id, currentYear, 8);
    if (augustVisits.length >= 1) {
      return res.status(403).json({
        status: "blocked",
        reason: "august-limit",
        message: "Guest has already used their August visit this year.",
        stats: {
          visitsThisYear: currentYearCount,
          maxVisitsPerYear: 9,
        },
      });
    }
  }

  // 5) Create new visit
  const { visit } = createVisit({
    guestId: guest.id,
    department,
    campus,
  });

  const newYearCount = currentYearCount + 1;

  return res.json({
    status: "checked-in",
    message: "Guest successfully checked in.",
    guest,
    visit,
    stats: {
      visitsThisYear: newYearCount,
      maxVisitsPerYear: 9,
    },
  });
});

// -----------------------------
// NEW: /api/guest-by-license (for auto-fill)
// -----------------------------
app.get("/api/guest-by-license", (req, res) => {
  const { state, number } = req.query;

  if (!state || !number) {
    return res.status(400).json({
      error: "Missing state or number query parameters.",
    });
  }

  const normalizedState = state.toUpperCase();
  const guest = findGuestByLicense(normalizedState, number);

  if (!guest) {
    return res.status(404).json({ error: "Guest not found." });
  }

  const summary = getGuestVisitsSummary(guest.id);

  return res.json({ guest, summary });
});

// -----------------------------
// NEW: /api/guests/:guestId (edit guest)
// -----------------------------
app.patch("/api/guests/:guestId", (req, res) => {
  const guestId = Number(req.params.guestId);
  if (!guestId) {
    return res.status(400).json({ error: "Invalid guest id." });
  }

  const { licenseState, licenseNumber, firstName, lastName } = req.body;

  const updated = updateGuest(guestId, {
    licenseState: licenseState ? licenseState.toUpperCase() : undefined,
    licenseNumber,
    firstName,
    lastName,
  });

  if (!updated) {
    return res.status(404).json({ error: "Guest not found." });
  }

  res.json(updated);
});

// -----------------------------
// /api/lookup - search guests
// -----------------------------
app.get("/api/lookup", (req, res) => {
  const q = req.query.q || "";
  if (!q.trim()) return res.json([]);

  const results = searchGuests(q);
  res.json(results);
});

// -----------------------------
// /api/visits/:guestId - visit summary for guest
// -----------------------------
app.get("/api/visits/:guestId", (req, res) => {
  const guestId = Number(req.params.guestId);
  if (!guestId) {
    return res.status(400).json({ error: "Invalid guest id." });
  }

  const summary = getGuestVisitsSummary(guestId);
  res.json(summary);
});

// -----------------------------
// NEW: DELETE /api/visits/:visitId - remove a visit (fix counts)
// -----------------------------
app.delete("/api/visits/:visitId", (req, res) => {
  const visitId = Number(req.params.visitId);
  if (!visitId) {
    return res.status(400).json({ error: "Invalid visit id." });
  }

  const success = deleteVisitById(visitId);
  if (!success) {
    return res.status(404).json({ error: "Visit not found." });
  }

  res.json({ ok: true });
});

// -----------------------------
// -----------------------------
// CSV report of all guests for a given year
// -----------------------------
app.get("/api/report/guests", (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  const guests = getAllGuests();

  const header = [
    "Guest ID",
    "First Name",
    "Last Name",
    "License State",
    "License Number",
    "Year",
    "Total Visits",
    "July Visits",
    "August Visits",
    "Last Visit Date",
  ];

  const rows = [header.map(csvValue).join(",")];

  guests.forEach((g) => {
    const summary = getGuestVisitsSummary(g.id);
    const total = summary?.totalYearVisits ?? 0;
    const julyCount = summary?.julyVisits?.length ?? 0;
    const augustCount = summary?.augustVisits?.length ?? 0;

    let lastVisitDate = "";
    if (summary?.visits?.length) {
      const sorted = [...summary.visits].sort((a, b) =>
        a.date < b.date ? 1 : -1
      );
      lastVisitDate = sorted[0].date;
    }

    const row = [
      g.id,
      g.firstName || "",
      g.lastName || "",
      g.licenseState || "",
      g.licenseNumber || "",
      year,
      total,
      julyCount,
      augustCount,
      lastVisitDate,
    ].map(csvValue);

    rows.push(row.join(","));
  });

  const csv = rows.join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="guest-visits-${year}.csv"`
  );
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
