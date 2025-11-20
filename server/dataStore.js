// server/dataStore.js
// In-memory + file-backed "database" for guests, visits, and visit department check-ins.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve path to data.json next to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "data.json");

// ---------------------------
// In-memory state
// ---------------------------
let guests = []; // { id, licenseState, licenseNumber, firstName, lastName }
let visits = []; // { id, guestId, visitDate, createdAt, firstDepartment, campus }
let visitDepartments = []; // { id, visitId, department, checkedInAt }

let guestIdCounter = 1;
let visitIdCounter = 1;
let visitDeptIdCounter = 1;

// ---------------------------
// Persistence helpers
// ---------------------------
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log("[dataStore] No existing data file, starting fresh.");
      return;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw) return;
    const parsed = JSON.parse(raw);

    guests = parsed.guests || [];
    visits = parsed.visits || [];
    visitDepartments = parsed.visitDepartments || [];

    // Restore counters or compute from existing data
    guestIdCounter =
      parsed.guestIdCounter ||
      (guests.length ? Math.max(...guests.map((g) => g.id)) + 1 : 1);
    visitIdCounter =
      parsed.visitIdCounter ||
      (visits.length ? Math.max(...visits.map((v) => v.id)) + 1 : 1);
    visitDeptIdCounter =
      parsed.visitDeptIdCounter ||
      (visitDepartments.length
        ? Math.max(...visitDepartments.map((vd) => vd.id)) + 1
        : 1);

    console.log(
      `[dataStore] Loaded ${guests.length} guests, ${visits.length} visits.`
    );
  } catch (err) {
    console.error("[dataStore] Error loading data:", err);
  }
}

function saveData() {
  const payload = {
    guests,
    visits,
    visitDepartments,
    guestIdCounter,
    visitIdCounter,
    visitDeptIdCounter,
  };

  fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), (err) => {
    if (err) {
      console.error("[dataStore] Error saving data:", err);
    }
  });
}

// Load existing data (if any) at startup
loadData();

// ---------------------------
// Utility helpers
// ---------------------------
function getTodayDateString() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getYearFromDate(dateStr) {
  return Number(dateStr.slice(0, 4));
}

// ---------------------------
// Core guest functions
// ---------------------------
function findOrCreateGuest({ licenseState, licenseNumber, firstName, lastName }) {
  let guest =
    guests.find(
      (g) =>
        g.licenseState === licenseState && g.licenseNumber === licenseNumber
    ) || null;

  if (!guest) {
    guest = {
      id: guestIdCounter++,
      licenseState,
      licenseNumber,
      firstName: firstName || null,
      lastName: lastName || null,
    };
    guests.push(guest);
    saveData();
  } else {
    // If we now have a name and guest didn't, update it
    let changed = false;
    if (firstName && !guest.firstName) {
      guest.firstName = firstName;
      changed = true;
    }
    if (lastName && !guest.lastName) {
      guest.lastName = lastName;
      changed = true;
    }
    if (changed) saveData();
  }

  return guest;
}

function findGuestByLicense(licenseState, licenseNumber) {
  return (
    guests.find(
      (g) =>
        g.licenseState === licenseState && g.licenseNumber === licenseNumber
    ) || null
  );
}

function getAllGuests() {
  return guests;
}

function updateGuest(guestId, { licenseState, licenseNumber, firstName, lastName }) {
  const guest = guests.find((g) => g.id === guestId);
  if (!guest) return null;

  if (licenseState !== undefined && licenseState !== null) {
    guest.licenseState = licenseState;
  }
  if (licenseNumber !== undefined && licenseNumber !== null) {
    guest.licenseNumber = licenseNumber;
  }
  if (firstName !== undefined) {
    guest.firstName = firstName || null;
  }
  if (lastName !== undefined) {
    guest.lastName = lastName || null;
  }

  saveData();
  return guest;
}

// ---------------------------
// Visit helper functions
// ---------------------------
function getVisitForGuestOnDate(guestId, dateStr) {
  return visits.find(
    (v) => v.guestId === guestId && v.visitDate === dateStr
  );
}

function getVisitsForGuestInYear(guestId, year) {
  return visits.filter(
    (v) =>
      v.guestId === guestId && getYearFromDate(v.visitDate) === year
  );
}

function getVisitsForGuestInMonth(guestId, year, month) {
  const monthStr = String(month).padStart(2, "0");
  return visits.filter(
    (v) =>
      v.guestId === guestId &&
      v.visitDate.startsWith(`${year}-${monthStr}`)
  );
}

function getVisitsByDate(dateStr) {
  return visits.filter((v) => v.visitDate === dateStr);
}

function getGuestById(id) {
  return guests.find((g) => g.id === id) || null;
}

// ---------------------------
// Visit creation / modification
// ---------------------------
function createVisit({ guestId, department, campus }) {
  const today = getTodayDateString();
  const createdAt = new Date().toISOString();

  const visit = {
    id: visitIdCounter++,
    guestId,
    visitDate: today,
    createdAt,
    firstDepartment: department,
    campus,
  };
  visits.push(visit);

  const deptEntry = {
    id: visitDeptIdCounter++,
    visitId: visit.id,
    department,
    checkedInAt: createdAt,
  };
  visitDepartments.push(deptEntry);

  saveData();
  return { visit, deptEntry };
}

function addDepartmentToVisit(visitId, department) {
  const createdAt = new Date().toISOString();
  const existing = visitDepartments.find(
    (vd) => vd.visitId === visitId && vd.department === department
  );
  if (existing) return existing;

  const deptEntry = {
    id: visitDeptIdCounter++,
    visitId,
    department,
    checkedInAt: createdAt,
  };
  visitDepartments.push(deptEntry);
  saveData();
  return deptEntry;
}

function getDepartmentsForVisit(visitId) {
  return visitDepartments.filter((vd) => vd.visitId === visitId);
}

function deleteVisitById(visitId) {
  const index = visits.findIndex((v) => v.id === visitId);
  if (index === -1) return false;

  visits.splice(index, 1);

  for (let i = visitDepartments.length - 1; i >= 0; i--) {
    if (visitDepartments[i].visitId === visitId) {
      visitDepartments.splice(i, 1);
    }
  }

  saveData();
  return true;
}

// ---------------------------
// Search & summary
// ---------------------------
function searchGuests(query) {
  const q = query.toLowerCase();
  return guests.filter((g) => {
    const fullName = `${g.firstName || ""} ${g.lastName || ""}`.toLowerCase();
    return (
      fullName.includes(q) ||
      g.licenseNumber.toLowerCase().includes(q)
    );
  });
}

function getGuestVisitsSummary(guestId) {
  const currentYear = new Date().getFullYear();
  const yearVisits = getVisitsForGuestInYear(guestId, currentYear);

  const julyVisits = getVisitsForGuestInMonth(guestId, currentYear, 7);
  const augustVisits = getVisitsForGuestInMonth(guestId, currentYear, 8);

  const detailedVisits = yearVisits.map((v) => ({
    id: v.id,
    date: v.visitDate,
    createdAt: v.createdAt,
    firstDepartment: v.firstDepartment,
    campus: v.campus,
    departments: getDepartmentsForVisit(v.id).map((vd) => ({
      department: vd.department,
      checkedInAt: vd.checkedInAt,
    })),
  }));

  return {
    totalYearVisits: yearVisits.length,
    julyVisits,
    augustVisits,
    visits: detailedVisits,
  };
}

export {
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
  getDepartmentsForVisit,
  searchGuests,
  getGuestVisitsSummary,
  getAllGuests,
  // extra helpers if we want them later
  getVisitsByDate,
  getGuestById,
};
