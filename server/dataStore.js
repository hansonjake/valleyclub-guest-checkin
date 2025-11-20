// server/dataStore.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Where data is stored on disk
const DATA_FILE = path.join(__dirname, "data.json");

let guests = [];
let visits = [];

// -------- Persistence helpers --------
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      guests = parsed.guests || [];
      visits = parsed.visits || [];
      console.log("[dataStore] Loaded data from", DATA_FILE);
    } else {
      console.log("[dataStore] No existing data file, starting fresh.");
    }
  } catch (err) {
    console.error("[dataStore] Failed to read data file:", err);
    guests = [];
    visits = [];
  }
}

function saveData() {
  const payload = {
    guests,
    visits,
  };
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.error("[dataStore] Failed to write data file:", err);
  }
}

// Load data on module import
loadData();

// -------- Utility --------
export function getTodayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function normalizeName(name) {
  return (name || "").trim();
}

function normalizeNameLower(name) {
  return normalizeName(name).toLowerCase();
}

// -------- Guest helpers --------

export function getAllGuests() {
  return guests;
}

export function getDeletedGuests() {
  return guests.filter((g) => g.isDeleted);
}

export function findGuestById(id) {
  return guests.find((g) => g.id === id);
}

export function findOrCreateGuestByName({ firstName, lastName }) {
  const fnNorm = normalizeName(firstName);
  const lnNorm = normalizeName(lastName);

  // Try to find an existing ACTIVE guest with same name (case-insensitive)
  const existing = guests.find(
    (g) =>
      !g.isDeleted &&
      normalizeNameLower(g.firstName) === fnNorm.toLowerCase() &&
      normalizeNameLower(g.lastName) === lnNorm.toLowerCase()
  );

  if (existing) return existing;

  const newGuest = {
    id: guests.length ? Math.max(...guests.map((g) => g.id)) + 1 : 1,
    firstName: fnNorm,
    lastName: lnNorm,
    licenseState: null,
    licenseNumber: null,
    isDeleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  guests.push(newGuest);
  saveData();
  return newGuest;
}

export function findGuestByExactName(firstName, lastName) {
  const fn = normalizeNameLower(firstName);
  const ln = normalizeNameLower(lastName);

  return (
    guests.find(
      (g) =>
        !g.isDeleted &&
        normalizeNameLower(g.firstName) === fn &&
        normalizeNameLower(g.lastName) === ln
    ) || null
  );
}

// Simple similarity check for “similar name”
function namesAreSimilar(firstA, lastA, firstB, lastB) {
  const fa = normalizeNameLower(firstA);
  const fb = normalizeNameLower(firstB);
  const la = normalizeNameLower(lastA);
  const lb = normalizeNameLower(lastB);

  if (!fa || !fb || !la || !lb) return false;

  // Last name must match exactly
  if (la !== lb) return false;

  // First names:
  // - exact match OR
  // - one starts with the other OR
  // - first letter matches and length difference <= 3
  if (fa === fb) return true;
  if (fa.startsWith(fb) || fb.startsWith(fa)) return true;
  if (fa[0] === fb[0] && Math.abs(fa.length - fb.length) <= 3) return true;

  return false;
}

export function findSimilarGuestsByName(firstName, lastName) {
  return guests.filter(
    (g) =>
      !g.isDeleted && namesAreSimilar(firstName, lastName, g.firstName, g.lastName)
  );
}

export function updateGuest(id, fields) {
  const guest = findGuestById(id);
  if (!guest) return null;

  if (fields.firstName !== undefined) {
    guest.firstName = normalizeName(fields.firstName);
  }
  if (fields.lastName !== undefined) {
    guest.lastName = normalizeName(fields.lastName);
  }
  if (fields.licenseState !== undefined) {
    guest.licenseState = fields.licenseState || null;
  }
  if (fields.licenseNumber !== undefined) {
    guest.licenseNumber = fields.licenseNumber || null;
  }
  if (fields.isDeleted !== undefined) {
    guest.isDeleted = !!fields.isDeleted;
  }

  guest.updatedAt = new Date().toISOString();
  saveData();
  return guest;
}

export function softDeleteGuest(id) {
  const guest = findGuestById(id);
  if (!guest) return null;
  guest.isDeleted = true;
  guest.updatedAt = new Date().toISOString();
  saveData();
  return guest;
}

export function restoreGuest(id) {
  const guest = findGuestById(id);
  if (!guest) return null;
  guest.isDeleted = false;
  guest.updatedAt = new Date().toISOString();
  saveData();
  return guest;
}

// -------- Visit helpers --------

export function createVisit({ guestId, department, campus, visitDate }) {
  const dateStr = visitDate || getTodayDateString(); // default to today
  const nowIso = new Date().toISOString();

  const newVisit = {
    id: visits.length ? Math.max(...visits.map((v) => v.id)) + 1 : 1,
    guestId,
    visitDate: dateStr,
    createdAt: nowIso,
    firstDepartment: department,
    campus,
    departments: [
      {
        department,
        campus,
        timestamp: nowIso,
      },
    ],
  };

  visits.push(newVisit);
  saveData();

  return { visit: newVisit };
}

export function addDepartmentToVisit(visitId, department, campus) {
  const visit = visits.find((v) => v.id === visitId);
  if (!visit) return null;

  const entry = {
    department,
    campus: campus || visit.campus,
    timestamp: new Date().toISOString(),
  };
  visit.departments = visit.departments || [];
  visit.departments.push(entry);
  saveData();
  return entry;
}

export function deleteVisitById(visitId) {
  const index = visits.findIndex((v) => v.id === visitId);
  if (index === -1) return false;
  visits.splice(index, 1);
  saveData();
  return true;
}

export function getVisitForGuestOnDate(guestId, dateStr) {
  return (
    visits.find(
      (v) => v.guestId === guestId && v.visitDate === dateStr
    ) || null
  );
}

export function getVisitsForGuestInYear(guestId, year) {
  return visits.filter((v) => {
    if (v.guestId !== guestId) return false;
    if (!v.visitDate) return false;
    const visitYear = Number(v.visitDate.slice(0, 4));
    return visitYear === year;
  });
}

export function getVisitsForGuestInMonth(guestId, year, month) {
  // month = 1-12
  return visits.filter((v) => {
    if (v.guestId !== guestId) return false;
    if (!v.visitDate || v.visitDate.length < 7) return false;
    const visitYear = Number(v.visitDate.slice(0, 4));
    const visitMonth = Number(v.visitDate.slice(5, 7));
    return visitYear === year && visitMonth === month;
  });
}

export function getGuestVisitsSummary(guestId) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const yearVisits = getVisitsForGuestInYear(guestId, currentYear);
  const julyVisits = getVisitsForGuestInMonth(guestId, currentYear, 7);
  const augustVisits = getVisitsForGuestInMonth(guestId, currentYear, 8);

  const visitSummaries = yearVisits
    .slice()
    .sort((a, b) => (a.visitDate < b.visitDate ? -1 : 1))
    .map((v) => ({
      id: v.id,
      date: v.visitDate,
      campus: v.campus,
      firstDepartment: v.firstDepartment,
      departments: v.departments || [],
    }));

  return {
    totalYearVisits: yearVisits.length,
    julyVisits,
    augustVisits,
    visits: visitSummaries,
  };
}

// -------- Simple search (for lookup) --------
export function searchGuests(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return guests
    .filter((g) => !g.isDeleted)
    .filter((g) => {
      const fullName =
        `${normalizeNameLower(g.firstName)} ${normalizeNameLower(
          g.lastName
        )}`.trim();
      return (
        normalizeNameLower(g.firstName).includes(q) ||
        normalizeNameLower(g.lastName).includes(q) ||
        fullName.includes(q)
      );
    })
    .slice(0, 50); // limit
}
