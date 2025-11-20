// server/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

import {
  getTodayDateString,
  findOrCreateGuestByName,
  findGuestById,
  findGuestByExactName,
  findSimilarGuestsByName,
  updateGuest,
  softDeleteGuest,
  restoreGuest,
  deleteVisitById,
  getVisitForGuestOnDate,
  getVisitsForDate,
  getVisitsForGuestInYear,
  getVisitsForGuestInMonth,
  searchGuests,
  getGuestVisitsSummary,
  getAllGuests,
  getDeletedGuests,
  createVisit,
  addDepartmentToVisit,
} from "./dataStore.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// --- OpenAI client (used only for /api/parse-barcode if you go back to it) ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper to parse barcode text with OpenAI (optional)
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

// CSV helper
function csvValue(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// -----------------------------
// Health check
// -----------------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// -----------------------------
// (Optional) /api/parse-barcode
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
// /api/guest-name-suggestions
// -----------------------------
app.get("/api/guest-name-suggestions", (req, res) => {
  const { first, last } = req.query;

  if (!first || !last) {
    return res.status(400).json({
      error: "Missing first or last query parameters.",
    });
  }

  const exactMatch = findGuestByExactName(first, last);
  const similar = findSimilarGuestsByName(first, last);

  res.json({
    exactMatch: exactMatch || null,
    similar,
  });
});

// -----------------------------
// /api/visits-today (optional ?date=YYYY-MM-DD)
// -----------------------------
app.get("/api/visits-today", (req, res) => {
  const dateStr = req.query.date || getTodayDateString();
  const visitsForDay = getVisitsForDate(dateStr);

  const visitsWithGuests = visitsForDay
    .map((visit) => {
      const guest = findGuestById(visit.guestId);
      return {
        id: visit.id,
        guestId: visit.guestId,
        firstName: guest?.firstName || "Unknown",
        lastName: guest?.lastName || "Guest",
        visitDate: visit.visitDate,
        createdAt: visit.createdAt,
        campus: visit.campus,
        firstDepartment: visit.firstDepartment,
        departments: visit.departments || [],
      };
    })
    .sort((a, b) => {
      const aTs = a.createdAt || `${a.visitDate}T00:00:00`;
      const bTs = b.createdAt || `${b.visitDate}T00:00:00`;
      return aTs > bTs ? -1 : aTs < bTs ? 1 : 0; // newest first
    });

  res.json({ date: dateStr, visits: visitsWithGuests });
});

// -----------------------------
// /api/checkin (name + visitDate)
// -----------------------------
app.post("/api/checkin", (req, res) => {
  const {
    guestId, // optional
    firstName,
    lastName,
    department,
    campus,
    visitDate, // NEW - optional
  } = req.body;

  if (!department) {
    return res.status(400).json({ error: "Missing department." });
  }
  if (!campus) {
    return res.status(400).json({ error: "Missing campus." });
  }

  // Use provided date or default to today
  const dateStr = visitDate || getTodayDateString();

  // Parse that date to figure out year/month for rules
  const visitDay = new Date(`${dateStr}T12:00:00`); // T12 avoids timezone edge quirks
  if (isNaN(visitDay.getTime())) {
    return res.status(400).json({ error: "Invalid visitDate." });
  }
  const visitYear = visitDay.getFullYear();
  const visitMonth = visitDay.getMonth() + 1; // 1-12

  let guest;

  // 1) Resolve guest
  if (guestId) {
    guest = findGuestById(Number(guestId));
    if (!guest) {
      return res.status(400).json({ error: "Guest ID not found." });
    }
    if (guest.isDeleted) {
      return res.status(400).json({
        error:
          "This guest is archived. Restore them in Deleted Guests before checking in.",
      });
    }
  } else {
    if (!firstName || !lastName) {
      return res
        .status(400)
        .json({ error: "Missing firstName or lastName." });
    }
    guest = findOrCreateGuestByName({ firstName, lastName });
  }

  // 2) Check if there's already a visit on that date
  const existingVisit = getVisitForGuestOnDate(guest.id, dateStr);
  const yearVisits = getVisitsForGuestInYear(guest.id, visitYear);
  const currentYearCount = yearVisits.length;

  if (existingVisit) {
    // Already used that day's visit; just add department usage
    addDepartmentToVisit(existingVisit.id, department, campus);
    return res.json({
      status: "already-checked-in-today",
      message:
        "Guest has already checked into the club on this date. Department visit recorded.",
      guest,
      visit: {
        ...existingVisit,
        departments: existingVisit.departments,
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

  // 4) Enforce July / August rules based on visit month
  if (visitMonth === 7) {
    const julyVisits = getVisitsForGuestInMonth(guest.id, visitYear, 7);
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

  if (visitMonth === 8) {
    const augustVisits = getVisitsForGuestInMonth(guest.id, visitYear, 8);
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

  // 5) Create new visit for that date
  const { visit } = createVisit({
    guestId: guest.id,
    department,
    campus,
    visitDate: dateStr,
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
// /api/lookup - search active guests
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
// PATCH /api/guests/:guestId - edit guest
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
// SOFT DELETE /api/guests/:guestId/delete
// -----------------------------
app.post("/api/guests/:guestId/delete", (req, res) => {
  const guestId = Number(req.params.guestId);
  if (!guestId) {
    return res.status(400).json({ error: "Invalid guest id." });
  }

  const existing = findGuestById(guestId);

  // If the guest truly doesn't exist, just respond OK so the UI doesn’t blow up.
  if (!existing) {
    return res.json({
      ok: true,
      message: "Guest was already missing or deleted.",
    });
  }

  const updated = softDeleteGuest(guestId);

  return res.json({
    ok: true,
    guest: updated,
  });
});

// -----------------------------
// RESTORE /api/guests/:guestId/restore
// -----------------------------
app.post("/api/guests/:guestId/restore", (req, res) => {
  const guestId = Number(req.params.guestId);
  if (!guestId) {
    return res.status(400).json({ error: "Invalid guest id." });
  }

  const updated = restoreGuest(guestId);
  if (!updated) {
    return res.status(404).json({ error: "Guest not found." });
  }

  res.json(updated);
});

// -----------------------------
// DELETE /api/visits/:visitId - remove a visit (fix counts)
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
// GET /api/deleted-guests - list archived guests
// -----------------------------
app.get("/api/deleted-guests", (req, res) => {
  const guests = getDeletedGuests();
  res.json(guests);
});

// -----------------------------
// CSV report of all active guests for a given year
// -----------------------------
app.get("/api/report/guests", (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  const guests = getAllGuests().filter((g) => !g.isDeleted);

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
