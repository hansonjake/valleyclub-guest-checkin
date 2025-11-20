import { useState } from "react";
  const handleDownloadReport = () => {
    const year = new Date().getFullYear();
    const url = `${API_BASE_URL}/api/report/guests?year=${year}`;
    window.open(url, "_blank");
  };


const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

const DEPARTMENTS = [
  "Golf Round",
  "Simulator Round",
  "Pool Entry",
  "Gym Entry",
  "Tennis Entry",
];

const CAMPUSES = ["Main Clubhouse", "Fitness Center"];

function App() {
  const [activeTab, setActiveTab] = useState("checkin"); // "checkin" | "lookup"

  // ----- Check-in state -----
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [campus, setCampus] = useState(CAMPUSES[0]);
  const [licenseState, setLicenseState] = useState("ID");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState(null); // "checked-in" | "already" | "blocked" | null
  const [checkinMessage, setCheckinMessage] = useState("");
  const [checkinError, setCheckinError] = useState("");
  const [visitStats, setVisitStats] = useState(null); // { visitsThisYear, maxVisitsPerYear }
  const [autoFillMessage, setAutoFillMessage] = useState("");

  // ----- Lookup & history state -----
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupError, setLookupError] = useState("");
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitSummary, setVisitSummary] = useState(null);
  const [visitError, setVisitError] = useState("");

  // ----- Edit Guest state -----
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editLicenseState, setEditLicenseState] = useState("");
  const [editLicenseNumber, setEditLicenseNumber] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");

  const resetCheckinMessages = () => {
    setCheckinStatus(null);
    setCheckinMessage("");
    setCheckinError("");
    setVisitStats(null);
  };

  const populateEditFieldsFromGuest = (guest) => {
    setEditFirstName(guest.firstName || "");
    setEditLastName(guest.lastName || "");
    setEditLicenseState(guest.licenseState || "");
    setEditLicenseNumber(guest.licenseNumber || "");
    setEditMessage("");
    setEditError("");
  };

  // -------- Auto-fill on license blur (returning guest) --------
  const handleLicenseBlur = async () => {
    setAutoFillMessage("");
    setCheckinError("");
    if (!licenseState || !licenseNumber) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/guest-by-license?state=${encodeURIComponent(
          licenseState
        )}&number=${encodeURIComponent(licenseNumber)}`
      );

      if (res.status === 404) {
        setAutoFillMessage(
          "New guest. Please enter first and last name (if available)."
        );
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setAutoFillMessage("");
        setCheckinError(data.error || "Error looking up guest.");
        return;
      }

      const { guest, summary } = data;

      setFirstName(guest.firstName || "");
      setLastName(guest.lastName || "");
      setAutoFillMessage(
        `Returning guest found. Visits this year: ${
          summary?.totalYearVisits ?? 0
        } / 9.`
      );

      setSelectedGuest(guest);
      setVisitSummary(summary);
      setVisitError("");
      populateEditFieldsFromGuest(guest);
    } catch (err) {
      console.error(err);
      setCheckinError("Network error finding guest by license.");
    }
  };

  // -------- Check-in handler --------
  const handleCheckIn = async () => {
    resetCheckinMessages();
    setCheckinLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseState,
          licenseNumber,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          department,
          campus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCheckinStatus("blocked");
        setCheckinError(data.message || data.error || "Error checking in guest.");
        if (data.stats) setVisitStats(data.stats);
      } else {
        if (data.status === "checked-in") {
          setCheckinStatus("checked-in");
        } else if (data.status === "already-checked-in-today") {
          setCheckinStatus("already");
        }
        setCheckinMessage(data.message || "Check-in complete.");
        if (data.stats) setVisitStats(data.stats);

        // After a successful check-in, refresh visit summary for this guest
        if (data.guest && data.guest.id) {
          setSelectedGuest(data.guest);
          try {
            const res2 = await fetch(
              `${API_BASE_URL}/api/visits/${data.guest.id}`
            );
            const summary = await res2.json();
            if (res2.ok) {
              setVisitSummary(summary);
            }
          } catch (e) {
            console.error("Error refreshing visit summary after check-in", e);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setCheckinStatus(null);
      setCheckinError("Network error calling /api/checkin.");
    } finally {
      setCheckinLoading(false);
    }
  };

  // -------- Lookup handlers --------
  const handleSearchGuests = async () => {
    setLookupLoading(true);
    setLookupError("");
    setLookupResults([]);
    setSelectedGuest(null);
    setVisitSummary(null);
    setVisitError("");
    setEditMessage("");
    setEditError("");

    if (!lookupQuery.trim()) {
      setLookupLoading(false);
      setLookupError("Enter a name or license number to search.");
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/lookup?q=${encodeURIComponent(lookupQuery.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setLookupError(data.error || "Error searching for guests.");
      } else {
        setLookupResults(data || []);
        if (data.length === 0) {
          setLookupError("No guests found matching that search.");
        }
      }
    } catch (err) {
      console.error(err);
      setLookupError("Network error searching for guests.");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSelectGuest = async (guest) => {
    setSelectedGuest(guest);
    populateEditFieldsFromGuest(guest);
    setVisitSummary(null);
    setVisitError("");
    setVisitsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${guest.id}`);
      const data = await res.json();

      if (!res.ok) {
        setVisitError(data.error || "Error fetching visit history.");
      } else {
        setVisitSummary(data);
      }
    } catch (err) {
      console.error(err);
      setVisitError("Network error fetching visit history.");
    } finally {
      setVisitsLoading(false);
    }
  };

  // -------- Save guest edits --------
  const handleSaveGuestEdits = async () => {
    if (!selectedGuest) return;

    setEditSaving(true);
    setEditMessage("");
    setEditError("");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/guests/${selectedGuest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: editFirstName || null,
            lastName: editLastName || null,
            licenseState: editLicenseState || null,
            licenseNumber: editLicenseNumber || null,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setEditError(data.error || "Error updating guest.");
      } else {
        setSelectedGuest(data);
        setEditMessage("Guest information updated.");
        // Reload summary with updated guest
        await handleSelectGuest(data);
      }
    } catch (err) {
      console.error(err);
      setEditError("Network error updating guest.");
    } finally {
      setEditSaving(false);
    }
  };

  // -------- Delete a visit --------
  const handleDeleteVisit = async (visitId) => {
    if (!selectedGuest) return;

    if (
      !window.confirm(
        "Remove this visit? This will adjust yearly counts and July/August limits."
      )
    ) {
      return;
    }

    setVisitsLoading(true);
    setVisitError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${visitId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setVisitError(data.error || "Error removing visit.");
      } else {
        // Reload summary
        await handleSelectGuest(selectedGuest);
      }
    } catch (err) {
      console.error(err);
      setVisitError("Network error removing visit.");
    } finally {
      setVisitsLoading(false);
    }
  };

  // -------- CHECK-IN TAB UI --------
  const renderCheckinTab = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "3fr 2fr",
        gap: "1.5rem",
        alignItems: "flex-start",
      }}
    >
      {/* LEFT: form */}
      <div>
        <p
          style={{
            fontSize: "0.9rem",
            color: "#777",
            marginTop: 0,
            marginBottom: "0.75rem",
          }}
        >
          <strong>Note:</strong> Fields marked with{" "}
          <span style={{ color: "#c00" }}>*</span> are required.
        </p>

        {/* Campus */}
        <section
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            border: "1px solid #ddd",
            borderRadius: "10px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            Campus <span style={{ color: "#c00" }}>*</span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {CAMPUSES.map((c) => {
              const selected = c === campus;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCampus(c)}
                  style={{
                    padding: "0.6rem",
                    borderRadius: "999px",
                    border: selected ? "2px solid #006400" : "1px solid #ccc",
                    background: selected ? "#e9f7ec" : "#f7f7f7",
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </section>

        {/* Departments */}
        <section
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            border: "1px solid #ddd",
            borderRadius: "10px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            Department <span style={{ color: "#c00" }}>*</span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {DEPARTMENTS.map((d) => {
              const selected = d === department;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepartment(d)}
                  style={{
                    padding: "0.6rem",
                    borderRadius: "999px",
                    border: selected ? "2px solid #006400" : "1px solid #ccc",
                    background: selected ? "#e9f7ec" : "#f7f7f7",
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </section>

        {/* ID + Name */}
        <section
          style={{
            padding: "0.75rem 1rem 1rem",
            border: "1px solid #ddd",
            borderRadius: "10px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Guest Details</h2>

          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              maxWidth: "420px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr",
                gap: "0.5rem",
              }}
            >
              <label>
                License State <span style={{ color: "#c00" }}>*</span>
                <input
                  value={licenseState}
                  onChange={(e) =>
                    setLicenseState(e.target.value.toUpperCase())
                  }
                  maxLength={2}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    textTransform: "uppercase",
                  }}
                />
              </label>

              <label>
                License Number <span style={{ color: "#c00" }}>*</span>
                <input
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  onBlur={handleLicenseBlur}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
              }}
            >
              <label>
                First Name
                <span style={{ fontSize: "0.8rem", color: "#777" }}>
                  {" "}
                  (optional)
                </span>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />
              </label>

              <label>
                Last Name
                <span style={{ fontSize: "0.8rem", color: "#777" }}>
                  {" "}
                  (optional)
                </span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />
              </label>
            </div>

            {autoFillMessage && (
              <div
                style={{
                  marginTop: "0.25rem",
                  fontSize: "0.9rem",
                  color: "#0b5c0b",
                }}
              >
                {autoFillMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleCheckIn}
              style={{
                marginTop: "0.5rem",
                padding: "0.7rem",
                borderRadius: "999px",
                border: "none",
                background: "#006400",
                color: "white",
                fontWeight: 700,
                fontSize: "1rem",
                cursor: "pointer",
                opacity:
                  checkinLoading || !licenseState || !licenseNumber
                    ? 0.6
                    : 1,
              }}
              disabled={checkinLoading || !licenseState || !licenseNumber}
            >
              {checkinLoading ? "Checking in..." : "Check In Guest"}
            </button>
          </div>
        </section>

        {/* Result card */}
        <section style={{ marginTop: "1rem", maxWidth: "480px" }}>
          {checkinError && (
            <div
              style={{
                border: "1px solid #ffb3b3",
                background: "#ffe6e6",
                color: "#900",
                padding: "0.75rem",
                borderRadius: "8px",
              }}
            >
              <strong>Check-in blocked</strong>
              <div>{checkinError}</div>
              {visitStats && (
                <div style={{ marginTop: "0.25rem", fontSize: "0.9rem" }}>
                  Visits this year: {visitStats.visitsThisYear} /{" "}
                  {visitStats.maxVisitsPerYear}
                </div>
              )}
            </div>
          )}

          {checkinStatus && !checkinError && (
            <div
              style={{
                border: "1px solid #b3dfb3",
                background:
                  checkinStatus === "already" ? "#fff7e0" : "#e6f7ea",
                color: "#064d06",
                padding: "0.75rem",
                borderRadius: "8px",
              }}
            >
              <strong>
                {checkinStatus === "checked-in"
                  ? "Guest checked in"
                  : "Guest already checked in today"}
              </strong>
              <div>{checkinMessage}</div>
              {visitStats && (
                <div style={{ marginTop: "0.25rem", fontSize: "0.9rem" }}>
                  Visits this year: {visitStats.visitsThisYear} /{" "}
                  {visitStats.maxVisitsPerYear}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* RIGHT: quick visit summary for current guest */}
      <div>
        <h3 style={{ marginTop: 0 }}>Current Guest Overview</h3>
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
            minHeight: "120px",
          }}
        >
          {(!selectedGuest || !visitSummary) && (
            <p style={{ color: "#777", fontSize: "0.9rem" }}>
              After checking in or auto-filling a returning guest, their visit
              history will show here.
            </p>
          )}

          {selectedGuest && visitSummary && (
            <>
              <p style={{ marginBottom: "0.25rem" }}>
                <strong>
                  {(selectedGuest.firstName || "").trim()}{" "}
                  {(selectedGuest.lastName || "").trim()}
                </strong>
                <br />
                <span style={{ fontSize: "0.9rem", color: "#555" }}>
                  {selectedGuest.licenseState} {selectedGuest.licenseNumber}
                </span>
              </p>
              <p style={{ fontSize: "0.9rem" }}>
                <strong>Visits this year:</strong>{" "}
                {visitSummary.totalYearVisits}
                <br />
                <strong>July visits:</strong>{" "}
                {visitSummary.julyVisits?.length || 0} / 1
                <br />
                <strong>August visits:</strong>{" "}
                {visitSummary.augustVisits?.length || 0} / 1
              </p>
              <p style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>
                <strong>Recent visits:</strong>
              </p>
              {visitSummary.visits.length === 0 && (
                <p style={{ fontSize: "0.9rem" }}>
                  No visits yet for this year.
                </p>
              )}
              {visitSummary.visits.length > 0 && (
                <ul style={{ fontSize: "0.9rem", paddingLeft: "1.1rem" }}>
                  {visitSummary.visits.slice(-5).map((v) => (
                    <li key={v.id}>
                      {v.date} — {v.campus} — {v.firstDepartment}
                      {v.departments && v.departments.length > 0 && (
                        <div style={{ fontSize: "0.85rem", color: "#555" }}>
                          Departments used that day:{" "}
                          {v.departments.map((d) => d.department).join(", ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {visitsLoading && <p>Loading visits…</p>}
          {visitError && (
            <p style={{ color: "red", fontSize: "0.9rem" }}>{visitError}</p>
          )}
        </div>
      </div>
    </div>
  );

  // -------- LOOKUP TAB UI --------
  const renderLookupTab = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 3fr",
        gap: "1.5rem",
        alignItems: "flex-start",
      }}
    >
      {/* LEFT: search + list */}
      <div>
        <h2>Guest Lookup</h2>
        <section
          style={{
            padding: "0.75rem 1rem",
            border: "1px solid #ddd",
            borderRadius: "10px",
          }}
        >
          <label>
            Search by name or license number
            <input
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="e.g. Smith or 12345"
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem",
                borderRadius: "6px",
                border: "1px solid #ccc",
              }}
            />
          </label>
          <button
            type="button"
            onClick={handleSearchGuests}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              background: "#006400",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {lookupLoading ? "Searching..." : "Search"}
          </button>

          {lookupError && (
            <p style={{ color: "red", marginTop: "0.5rem" }}>{lookupError}</p>
          )}

          {lookupResults.length > 0 && (
            <div
              style={{
                marginTop: "0.75rem",
                maxHeight: "260px",
                overflowY: "auto",
              }}
            >
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {lookupResults.map((g) => {
                  const selected = selectedGuest && selectedGuest.id === g.id;
                  return (
                    <li
                      key={g.id}
                      onClick={() => handleSelectGuest(g)}
                      style={{
                        padding: "0.5rem 0.4rem",
                        borderBottom: "1px solid #eee",
                        cursor: "pointer",
                        background: selected ? "#eef6ff" : "transparent",
                      }}
                    >
                      <strong>
                        {(g.firstName || "").trim()}{" "}
                        {(g.lastName || "").trim()}
                      </strong>
                      <br />
                      <span style={{ fontSize: "0.85rem", color: "#555" }}>
                        {g.licenseState} {g.licenseNumber}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* RIGHT: visit history + edit guest */}
      <div>
        <h2>Visit History & Edit Guest</h2>
        <section
          style={{
            padding: "0.75rem 1rem",
            border: "1px solid #ddd",
            borderRadius: "10px",
            marginBottom: "1rem",
            minHeight: "150px",
          }}
        >
          {!selectedGuest && !visitsLoading && (
            <p style={{ color: "#777", fontSize: "0.9rem" }}>
              Search and select a guest to see their visit history and edit
              their info.
            </p>
          )}

          {visitsLoading && <p>Loading visits…</p>}
          {visitError && (
            <p style={{ color: "red", fontSize: "0.9rem" }}>{visitError}</p>
          )}

          {selectedGuest && visitSummary && (
            <>
              <p style={{ marginBottom: "0.25rem" }}>
                <strong>
                  {(selectedGuest.firstName || "").trim()}{" "}
                  {(selectedGuest.lastName || "").trim()}
                </strong>
                <br />
                <span style={{ fontSize: "0.9rem", color: "#555" }}>
                  {selectedGuest.licenseState} {selectedGuest.licenseNumber}
                </span>
              </p>
              <p style={{ fontSize: "0.9rem" }}>
                <strong>Visits this year:</strong>{" "}
                {visitSummary.totalYearVisits}
                <br />
                <strong>July visits:</strong>{" "}
                {visitSummary.julyVisits?.length || 0} / 1
                <br />
                <strong>August visits:</strong>{" "}
                {visitSummary.augustVisits?.length || 0} / 1
              </p>
              <p style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>
                <strong>All visits this year:</strong>
              </p>
              {visitSummary.visits.length === 0 && (
                <p style={{ fontSize: "0.9rem" }}>
                  No visits yet for this year.
                </p>
              )}
              {visitSummary.visits.length > 0 && (
                <ul style={{ fontSize: "0.9rem", paddingLeft: "1.1rem" }}>
                  {visitSummary.visits.map((v) => (
                    <li key={v.id} style={{ marginBottom: "0.4rem" }}>
                      <div>
                        {v.date} — {v.campus} — {v.firstDepartment}
                      </div>
                      {v.departments && v.departments.length > 0 && (
                        <div style={{ fontSize: "0.85rem", color: "#555" }}>
                          Departments used that day:{" "}
                          {v.departments.map((d) => d.department).join(", ")}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteVisit(v.id)}
                        style={{
                          marginTop: "0.2rem",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "999px",
                          border: "1px solid #cc0000",
                          background: "#ffe6e6",
                          color: "#900",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        Remove visit (fix mistake)
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {/* Edit guest info */}
        {selectedGuest && (
          <section
            style={{
              padding: "0.75rem 1rem",
              border: "1px solid #ddd",
              borderRadius: "10px",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Edit Guest Info</h3>
            <p style={{ fontSize: "0.85rem", color: "#777" }}>
              Use this to correct typos in name or license info. Changes affect
              future check-ins.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <label>
                First Name
                <input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />
              </label>
              <label>
                Last Name
                <input
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />
              </label>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <label>
                License State
                <input
                  value={editLicenseState}
                  onChange={(e) =>
                    setEditLicenseState(e.target.value.toUpperCase())
                  }
                  maxLength={2}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    textTransform: "uppercase",
                  }}
                />
              </label>
              <label>
                License Number
                <input
                  value={editLicenseNumber}
                  onChange={(e) => setEditLicenseNumber(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleSaveGuestEdits}
              disabled={editSaving}
              style={{
                marginTop: "0.25rem",
                padding: "0.45rem 0.9rem",
                borderRadius: "999px",
                border: "none",
                background: "#004d99",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
                opacity: editSaving ? 0.7 : 1,
              }}
            >
              {editSaving ? "Saving..." : "Save Guest Changes"}
            </button>

            {editMessage && (
              <p
                style={{
                  marginTop: "0.4rem",
                  fontSize: "0.85rem",
                  color: "#0b5c0b",
                }}
              >
                {editMessage}
              </p>
            )}
            {editError && (
              <p
                style={{
                  marginTop: "0.4rem",
                  fontSize: "0.85rem",
                  color: "red",
                }}
              >
                {editError}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "1.5rem",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>The Valley Club — Guest Check-In</h1>
        <p style={{ color: "#555", marginTop: "0.25rem" }}>
          Staff tool for recording daily guest visits and tracking yearly limits.
        </p>
      </header>
            <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "0.75rem",
        }}
      >
        <button
          type="button"
          onClick={handleDownloadReport}
          style={{
            padding: "0.4rem 0.9rem",
            borderRadius: "999px",
            border: "1px solid #006400",
            background: "white",
            color: "#006400",
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Download Yearly Guest Report (CSV)
        </button>
      </div>


      {/* Tabs */}
      <div
        style={{
          display: "inline-flex",
          borderRadius: "999px",
          border: "1px solid #ccc",
          overflow: "hidden",
          marginBottom: "1.25rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("checkin")}
          style={{
            padding: "0.5rem 1.5rem",
            border: "none",
            background: activeTab === "checkin" ? "#006400" : "transparent",
            color: activeTab === "checkin" ? "white" : "#333",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Check-In
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("lookup")}
          style={{
            padding: "0.5rem 1.5rem",
            border: "none",
            background: activeTab === "lookup" ? "#006400" : "transparent",
            color: activeTab === "lookup" ? "white" : "#333",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Guest Lookup
        </button>
      </div>

      {activeTab === "checkin" ? renderCheckinTab() : renderLookupTab()}
    </div>
  );
}

export default App;
