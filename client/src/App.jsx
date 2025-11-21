// client/src/App.jsx
import { useEffect, useState } from "react";
import baldMountain from "./assets/bald-mountain-illustration.svg";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL &&
    import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")) ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "http://localhost:5001");

const DEPARTMENTS = [
  "Golf Round",
  "Simulator Round",
  "Pool Entry",
  "Gym Entry",
  "Tennis Entry",
];

const CAMPUSES = ["Main Clubhouse", "Fitness Center"];

const getLocalDateString = () => {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offsetMinutes * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
};

function App() {
  const [activeTab, setActiveTab] = useState("checkin"); // "checkin" | "lookup" | "deleted"

  // ----- Check-in state -----
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [campus, setCampus] = useState(CAMPUSES[0]);
  const [visitDate, setVisitDate] = useState(() => getLocalDateString());
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState(null); // "checked-in" | "already-checked-in-today" | "blocked" | null
  const [checkinMessage, setCheckinMessage] = useState("");
  const [checkinError, setCheckinError] = useState("");
  const [visitStats, setVisitStats] = useState(null);

  // For name suggestion flow
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [exactSuggestion, setExactSuggestion] = useState(null);
  const [pendingCheckinName, setPendingCheckinName] = useState(null); // { firstName, lastName }
  const [showSuggestionBox, setShowSuggestionBox] = useState(false);

  // ----- Today's activity state -----
  const [todayVisits, setTodayVisits] = useState([]);
  const [todayVisitsLoading, setTodayVisitsLoading] = useState(false);
  const [todayVisitsError, setTodayVisitsError] = useState("");

    // ----- Watch list state -----
  const [watchListGuests, setWatchListGuests] = useState([]);
  const [watchListLoading, setWatchListLoading] = useState(false);
  const [watchListError, setWatchListError] = useState("");

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

  // ----- Deleted guests -----
  const [deletedGuests, setDeletedGuests] = useState([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState("");

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

  // -----------------------------
  // Report download
  // -----------------------------
  const handleDownloadReport = () => {
    const year = new Date().getFullYear();
    const url = `${API_BASE_URL}/api/report/guests?year=${year}`;
    window.open(url, "_blank");
  };

    // -----------------------------
  // Today's activity
  // -----------------------------
  const loadTodayVisits = async () => {
    const todayStr = getLocalDateString();
    setTodayVisitsLoading(true);
    setTodayVisitsError("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/visits-today?date=${encodeURIComponent(todayStr)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setTodayVisitsError(data.error || "Failed to load today's activity.");
        setTodayVisits([]);
        return;
      }
      setTodayVisits(data.visits || []);
    } catch (err) {
      console.error("Error loading today's activity:", err);
      setTodayVisitsError("Network error loading today's activity.");
      setTodayVisits([]);
    } finally {
      setTodayVisitsLoading(false);
    }
  };

    const loadWatchList = async () => {
    setWatchListLoading(true);
    setWatchListError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/watchlist`);
      const data = await res.json();
      if (!res.ok) {
        setWatchListError(data.error || "Failed to load watch list.");
        setWatchListGuests([]);
        return;
      }

      setWatchListGuests(data.guests || []);
    } catch (err) {
      console.error("Error loading watch list:", err);
      setWatchListError("Network error loading watch list.");
      setWatchListGuests([]);
    } finally {
      setWatchListLoading(false);
    }
  };

  useEffect(() => {
    loadTodayVisits();
    loadWatchList();
    const interval = setInterval(() => {
      loadTodayVisits();
      loadWatchList();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // -----------------------------
  // Check-in helpers
  // -----------------------------
  const performCheckin = async ({ guestIdOverride = null }) => {
    setCheckinError("");
    setCheckinMessage("");
    setCheckinStatus(null);
    setVisitStats(null);

    if (!firstName.trim() || !lastName.trim()) {
      setCheckinError("First and last name are required.");
      return;
    }

    setCheckinLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: guestIdOverride,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          department,
          campus,
          visitDate, // <-- new
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCheckinError(data.error || data.message || "Check-in failed.");
        return;
      }

      setCheckinStatus(data.status || "checked-in");
      setCheckinMessage(data.message || "");
      setVisitStats(data.stats || null);

      await loadTodayVisits();
      await loadWatchList();

      // After successful check-in, reload visits if we have that guest selected
      if (selectedGuest && data.guest && selectedGuest.id === data.guest.id) {
        await loadVisitSummary(data.guest.id);
      }
    } catch (err) {
      console.error("Error calling /api/checkin:", err);
      setCheckinError("Network error during check-in.");
    } finally {
      setCheckinLoading(false);
      // Clear suggestion UI
      setShowSuggestionBox(false);
      setNameSuggestions([]);
      setExactSuggestion(null);
      setPendingCheckinName(null);
    }
  };

  const handleCheckinClick = async () => {
    resetCheckinMessages();
    setCheckinError("");
    setShowSuggestionBox(false);
    setNameSuggestions([]);
    setExactSuggestion(null);
    setPendingCheckinName(null);

    const fn = firstName.trim();
    const ln = lastName.trim();

    if (!fn || !ln) {
      setCheckinError("First and last name are required.");
      return;
    }

    // Ask backend for exact + similar guests
    setSuggestionsLoading(true);
    try {
      const params = new URLSearchParams({
        first: fn,
        last: ln,
      }).toString();

      const res = await fetch(
        `${API_BASE_URL}/api/guest-name-suggestions?${params}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCheckinError(
          data.error || "Unable to check existing guests for similar names."
        );
        setSuggestionsLoading(false);
        return;
      }

      const data = await res.json();
      const { exactMatch, similar } = data;

      const cleanedSimilar = (similar || []).filter(
        (g) => !(exactMatch && g.id === exactMatch.id)
      );

      // If nothing at all, just check in as a new guest
      if (!exactMatch && cleanedSimilar.length === 0) {
        setSuggestionsLoading(false);
        await performCheckin({ guestIdOverride: null });
        return;
      }

      // Otherwise, show suggestion choices to the staff
      setExactSuggestion(exactMatch || null);
      setNameSuggestions(cleanedSimilar);
      setPendingCheckinName({ firstName: fn, lastName: ln });
      setShowSuggestionBox(true);
    } catch (err) {
      console.error("Error fetching name suggestions:", err);
      setCheckinError("Network error fetching name suggestions.");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleChooseExistingGuest = async (guest) => {
    await performCheckin({ guestIdOverride: guest.id });
  };

  const handleCreateNewGuestFromSuggestion = async () => {
    await performCheckin({ guestIdOverride: null });
  };

  // -----------------------------
  // Lookup & visit history
  // -----------------------------
  const handleLookupSearch = async (e) => {
    e.preventDefault();
    setLookupError("");
    setLookupResults([]);
    setSelectedGuest(null);
    setVisitSummary(null);
    setVisitError("");

    const q = lookupQuery.trim();
    if (!q) return;

    setLookupLoading(true);
    try {
      const params = new URLSearchParams({ q }).toString();
      const res = await fetch(`${API_BASE_URL}/api/lookup?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLookupError(data.error || "Lookup failed.");
        return;
      }
      const data = await res.json();
      setLookupResults(data);
    } catch (err) {
      console.error("Error calling /api/lookup:", err);
      setLookupError("Network error during lookup.");
    } finally {
      setLookupLoading(false);
    }
  };

  const loadVisitSummary = async (guestId) => {
    setVisitsLoading(true);
    setVisitError("");
    setVisitSummary(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${guestId}`);
      const data = await res.json();

      if (!res.ok) {
        setVisitError(data.error || "Failed to load visit history.");
        return;
      }

      setVisitSummary(data);
    } catch (err) {
      console.error("Error loading visits:", err);
      setVisitError("Network error loading visits.");
    } finally {
      setVisitsLoading(false);
    }
  };

  const handleSelectGuest = async (guest) => {
    setSelectedGuest(guest);
    populateEditFieldsFromGuest(guest);
    await loadVisitSummary(guest.id);
  };

  const handleDeleteVisit = async (visitId) => {
    if (!selectedGuest) return;
    if (!window.confirm("Remove this visit? This will affect yearly counts.")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${visitId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to remove visit.");
        return;
      }
      await loadVisitSummary(selectedGuest.id);
      await loadTodayVisits();
      await loadWatchList();
    } catch (err) {
      console.error("Error deleting visit:", err);
      alert("Network error removing visit.");
    }
  };

  // -----------------------------
  // Edit guest info
  // -----------------------------
  const handleSaveGuestEdits = async () => {
    if (!selectedGuest) return;

    setEditError("");
    setEditMessage("");
    setEditSaving(true);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/guests/${selectedGuest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: editFirstName.trim(),
            lastName: editLastName.trim(),
            licenseState: editLicenseState.trim().toUpperCase() || null,
            licenseNumber: editLicenseNumber.trim() || null,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to save guest changes.");
        return;
      }

      setEditMessage("Guest details updated.");
      setSelectedGuest(data);
      populateEditFieldsFromGuest(data);

      // also refresh the visit summary label info
      await loadVisitSummary(data.id);
    } catch (err) {
      console.error("Error saving guest edits:", err);
      setEditError("Network error saving guest changes.");
    } finally {
      setEditSaving(false);
    }
  };

  // -----------------------------
  // Soft delete (archive) guest
  // -----------------------------
  const handleArchiveGuest = async () => {
    if (!selectedGuest) return;
    const confirm = window.confirm(
      "Archive this guest? They will move to Deleted Guests and no longer appear in search."
    );
    if (!confirm) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/guests/${selectedGuest.id}/delete`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to archive guest.");
        return;
      }

      alert("Guest archived.");
      setSelectedGuest(null);
      setVisitSummary(null);
      setLookupResults((prev) =>
        prev.filter((g) => g.id !== selectedGuest.id)
      );
      // Refresh deleted list if on that tab later
    } catch (err) {
      console.error("Error archiving guest:", err);
      alert("Network error archiving guest.");
    }
  };

  // -----------------------------
  // Deleted guests tab
  // -----------------------------
  const loadDeletedGuests = async () => {
    setDeletedLoading(true);
    setDeletedError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/deleted-guests`);
      const data = await res.json();
      if (!res.ok) {
        setDeletedError(data.error || "Failed to load deleted guests.");
        return;
      }
      setDeletedGuests(data);
    } catch (err) {
      console.error("Error loading deleted guests:", err);
      setDeletedError("Network error loading deleted guests.");
    } finally {
      setDeletedLoading(false);
    }
  };

  const handleRestoreGuest = async (guestId) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/guests/${guestId}/restore`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to restore guest.");
        return;
      }
      // Refresh lists
      await loadDeletedGuests();
      // If the restored guest was in a recent search, you could also re-run lookup
      alert("Guest restored to active list.");
    } catch (err) {
      console.error("Error restoring guest:", err);
      alert("Network error restoring guest.");
    }
  };

  // automatically load deleted guests when switching to that tab
  useEffect(() => {
    if (activeTab === "deleted") {
      loadDeletedGuests();
    }
  }, [activeTab]);

  // -----------------------------
  // Rendering helpers
  // -----------------------------
  const renderSuggestionBox = () => {
    if (!showSuggestionBox || !pendingCheckinName) return null;

    const { firstName: fn, lastName: ln } = pendingCheckinName;

    const hasExact = !!exactSuggestion;
    const hasSimilar = nameSuggestions && nameSuggestions.length > 0;

    return (
      <div
        style={{
          marginTop: "0.75rem",
          padding: "0.75rem 1rem",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #f5f7ff, #eef2ff)",
          border: "1px solid #d7defc",
          boxShadow: "0 16px 38px rgba(27, 51, 122, 0.12)",
        }}
      >
        <p
          style={{
            marginTop: 0,
            marginBottom: "0.5rem",
            fontWeight: 600,
            color: "#1f2a4d",
          }}
        >
          Possible match found for “{fn} {ln}”.
        </p>

        {hasExact && (
          <div
            style={{
              padding: "0.5rem 0.6rem",
              borderRadius: "8px",
              border: "1px solid #ccc",
              marginBottom: "0.5rem",
              background: "#f8f8f8",
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {exactSuggestion.firstName} {exactSuggestion.lastName}{" "}
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "#0a0",
                  marginLeft: "0.25rem",
                }}
              >
                (exact match)
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleChooseExistingGuest(exactSuggestion)}
              style={{
                marginTop: "0.35rem",
                padding: "0.3rem 0.8rem",
                borderRadius: "999px",
                border: "none",
                background: "#006400",
                color: "white",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Use this guest
            </button>
          </div>
        )}

        {hasSimilar && (
          <div style={{ marginBottom: "0.5rem" }}>
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                marginBottom: "0.3rem",
              }}
            >
              Similar names:
            </div>
            <ul
              style={{
                listStyle: "none",
                paddingLeft: 0,
                margin: 0,
              }}
            >
              {nameSuggestions.map((g) => (
                <li
                  key={g.id}
                  style={{
                    padding: "0.35rem 0.4rem",
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>
                    {g.firstName} {g.lastName}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleChooseExistingGuest(g)}
                    style={{
                      padding: "0.25rem 0.7rem",
                      borderRadius: "999px",
                      border: "1px solid #006400",
                      background: "white",
                      color: "#006400",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            onClick={handleCreateNewGuestFromSuggestion}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              background: "#004d99",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
              marginRight: "0.5rem",
            }}
          >
            Create new guest “{fn} {ln}”
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSuggestionBox(false);
              setNameSuggestions([]);
              setExactSuggestion(null);
              setPendingCheckinName(null);
            }}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid #aaa",
              background: "white",
              color: "#333",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderCheckinTab = () => {
   const todayStr = getLocalDateString();

    const buttonDisabled =
      checkinLoading ||
      suggestionsLoading ||
      !firstName.trim() ||
      !lastName.trim() ||
      !department ||
      !campus ||
      !visitDate;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)",
          gap: "1.5rem",
        }}
      >
        {/* LEFT: form */}
        <section
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "10px",
            border: "1px solid #ddd",
            background: "#fafafa",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            Guest Check-In
          </h2>
          <p
            style={{
              fontSize: "0.9rem",
              color: "#555",
              marginTop: 0,
              marginBottom: "0.75rem",
            }}
          >
            Guests may use multiple departments in a day, but it only counts as
            one visit per day. System enforces 9 visits per year and 1 visit in
            July & 1 in August.
          </p>

          {/* Campus */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{ fontWeight: 600, display: "block", marginBottom: "0.25rem" }}
            >
              Campus <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid #ccc",
              }}
            >
              {CAMPUSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{ fontWeight: 600, display: "block", marginBottom: "0.25rem" }}
            >
              Department <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid #ccc",
              }}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Visit date */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{ fontWeight: 600, display: "block", marginBottom: "0.25rem" }}
            >
              Visit Date <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="date"
              value={visitDate}
              max={todayStr} // no future dates
              onChange={(e) => setVisitDate(e.target.value)}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid #ccc",
              }}
            />
            <p
              style={{
                fontSize: "0.8rem",
                color: "#666",
                marginTop: "0.25rem",
              }}
            >
              Defaults to today. Change only when logging a missed visit from a
              previous day.
            </p>
          </div>

          {/* Name fields */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <div>
              <label
                style={{
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                First Name <span style={{ color: "red" }}>*</span>
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                Last Name <span style={{ color: "red" }}>*</span>
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>

          {/* Status & errors */}
          {checkinError && (
            <p style={{ color: "red", fontSize: "0.9rem" }}>{checkinError}</p>
          )}
          {checkinMessage && (
            <p
              style={{
                color:
                  checkinStatus === "blocked"
                    ? "red"
                    : checkinStatus === "already-checked-in-today"
                    ? "#b36b00"
                    : "#0b5c0b",
                fontSize: "0.9rem",
              }}
            >
              {checkinMessage}
            </p>
          )}
          {visitStats && (
            <p style={{ fontSize: "0.85rem", color: "#333" }}>
              <strong>Visits this year:</strong> {visitStats.visitsThisYear} /{" "}
              {visitStats.maxVisitsPerYear}
            </p>
          )}

          <button
            type="button"
            onClick={handleCheckinClick}
            disabled={buttonDisabled}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 1.4rem",
              borderRadius: "999px",
              border: "none",
              background: buttonDisabled ? "#ccc" : "#006400",
              color: "white",
              fontWeight: 600,
              cursor: buttonDisabled ? "not-allowed" : "pointer",
            }}
          >
            {checkinLoading || suggestionsLoading
              ? "Checking..."
              : "Check In Guest"}
          </button>

          {renderSuggestionBox()}
        </section>

        {/* RIGHT: can be debug, instructions, etc. For now, simple info */}
        <div style={{ display: "grid", gap: "1rem" }}>
                    <div
            aria-hidden="true"
            style={{
              position: "relative",
              minHeight: "220px",
              overflow: "hidden",
              borderRadius: "12px",
              border: "1px solid #f4c430",
              backgroundImage: `linear-gradient(120deg, rgba(255, 250, 240, 0.78), rgba(246, 229, 199, 0.48)), url(${baldMountain})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundBlendMode: "overlay",
              boxShadow: "0 16px 32px rgba(244, 196, 48, 0.22)",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: "1rem",
                left: "1rem",
                background: "rgba(255, 250, 240, 0.9)",
                color: "#3f3410",
                padding: "0.5rem 1rem",
                borderRadius: "999px",
                fontWeight: 800,
                letterSpacing: "0.01em",
                boxShadow: "0 10px 22px rgba(63, 52, 16, 0.12)",
                border: "1px solid rgba(244, 196, 48, 0.55)",
              }}
            >
              Bald Mountain · Sun Valley, Idaho
            </div>
          </div>
          <section
            style={{
              padding: "1rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid #f4c430",
              background: "#fffaf0",
              boxShadow: "0 10px 24px rgba(244, 196, 48, 0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 0 }}>Watch List</h2>
              <span
                style={{
                  background: "#fff3cd",
                  color: "#856404",
                  borderRadius: "999px",
                  padding: "0.35rem 0.9rem",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  boxShadow: "0 10px 24px rgba(133, 100, 4, 0.14)",
                }}
              >
                {watchListGuests.length} guest
                {watchListGuests.length === 1 ? "" : "s"}
              </span>
            </div>
            <p style={{ marginTop: "0.5rem", color: "#5c4c1d" }}>
              Guests who have reached 7 or more visits this year.
            </p>

            {watchListError && (
              <div
                style={{
                  background: "#fff4f4",
                  border: "1px solid #f2c4c4",
                  color: "#8a1f1f",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  marginBottom: "0.75rem",
                }}
              >
                {watchListError}
              </div>
            )}

            {watchListLoading ? (
              <p style={{ marginTop: "0.5rem", color: "#4a3b0f" }}>
                Loading watch list...
              </p>
            ) : watchListGuests.length === 0 ? (
              <p style={{ marginTop: "0.5rem", color: "#4a3b0f" }}>
                No guests are on the watch list yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {watchListGuests.map((guest) => {
                  const lastVisitLabel = guest.lastVisitDate
                    ? new Date(`${guest.lastVisitDate}T12:00:00`).toLocaleDateString()
                    : "—";

                  return (
                    <div
                      key={guest.id}
                      style={{
                        border: "1px solid #f6d365",
                        borderRadius: "10px",
                        padding: "0.65rem 0.75rem",
                        background: "#fffdf5",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                          {guest.firstName} {guest.lastName}
                        </div>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color: "#5c4c1d",
                            background: "#ffe8a3",
                            borderRadius: "999px",
                            padding: "0.2rem 0.6rem",
                            fontWeight: 700,
                          }}
                        >
                          {guest.visitsThisYear} visit
                          {guest.visitsThisYear === 1 ? "" : "s"} this year
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "0.35rem 0 0",
                          color: "#5c4c1d",
                          fontSize: "0.9rem",
                        }}
                      >
                        Last visit: {lastVisitLabel}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            style={{
              padding: "1rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid #ddd",
              background: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 0 }}>Today's Activity</h2>
              <span
                style={{
                  background: "linear-gradient(120deg, #e0f2fe, #e6e9ff)",
                  color: "#0f2c60",
                  borderRadius: "999px",
                  padding: "0.35rem 0.9rem",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  boxShadow: "0 10px 24px rgba(15, 44, 96, 0.18)",
                }}
              >
                {todayVisits.length} check-in{todayVisits.length === 1 ? "" : "s"}
              </span>
            </div>
            <p style={{ marginTop: "0.5rem", color: "#444" }}>
              Quick view of guests who have checked in today (newest first).
            </p>

                        {todayVisitsError && (
              <div
                style={{
                  background: "#fff4f4",
                  border: "1px solid #f2c4c4",
                  color: "#8a1f1f",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  marginBottom: "0.75rem",
                }}
              >
                {todayVisitsError}
              </div>
            )}

            {todayVisitsLoading ? (
              <p style={{ marginTop: "0.5rem", color: "#333" }}>
                Loading today's check-ins...
              </p>
            ) : todayVisits.length === 0 ? (
              <p style={{ marginTop: "0.5rem", color: "#333" }}>
                No guests have checked in yet today.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {todayVisits.map((visit) => {
                  const departmentLabels = Array.from(
                    new Set((visit.departments || []).map((d) => d.department))
                  );
                  const departmentBadges =
                    departmentLabels.length > 0
                      ? departmentLabels
                      : visit.firstDepartment
                        ? [visit.firstDepartment]
                        : [];
                  const visitTime = visit.createdAt
                    ? new Date(visit.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "";

                  return (
                    <div
                      key={visit.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "10px",
                        padding: "0.65rem 0.75rem",
                        background: "#f9fafb",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          marginBottom: "0.25rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                          {visit.firstName} {visit.lastName}
                        </div>
                        {visitTime && (
                          <span
                            style={{
                              fontSize: "0.85rem",
                              color: "#333",
                              background: "#eef2ff",
                              borderRadius: "999px",
                              padding: "0.2rem 0.6rem",
                            }}
                          >
                            {visitTime}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.4rem",
                          marginTop: "0.35rem",
                        }}
                      >
                        {visit.campus && (
                          <span
                            style={{
                              background: "#e7f2ff",
                              color: "#0f3c99",
                              borderRadius: "999px",
                              padding: "0.2rem 0.6rem",
                              fontSize: "0.82rem",
                              border: "1px solid #cddcf7",
                            }}
                          >
                            {visit.campus}
                          </span>
                        )}
                        {departmentBadges.map((dept) => (
                          <span
                            key={dept}
                            style={{
                              background: "#e7f2ff",
                              color: "#0f3c99",
                              borderRadius: "999px",
                              padding: "0.2rem 0.6rem",
                              fontSize: "0.82rem",
                              border: "1px solid #cddcf7",
                            }}
                          >
                            {dept}
                          </span>
                        ))}
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  const renderLookupTab = () => {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1.2fr)",
          gap: "1.5rem",
        }}
      >
        {/* LEFT: search + results */}
        <div>
          <h2>Guest Lookup</h2>
          <section
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              border: "1px solid #ddd",
              marginBottom: "1rem",
            }}
          >
            <form
              onSubmit={handleLookupSearch}
              style={{ marginBottom: "0.75rem" }}
            >
              <label
                style={{
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                Search by name
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  placeholder="Enter first or last name"
                  style={{
                    flex: 1,
                    padding: "0.4rem 0.6rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "0.45rem 1rem",
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
              </div>
            </form>
            {lookupError && (
              <p style={{ color: "red", fontSize: "0.9rem" }}>{lookupError}</p>
            )}

            {lookupResults.length === 0 && !lookupLoading && (
              <p style={{ fontSize: "0.9rem", color: "#666" }}>
                No guests yet. Search by first or last name to begin.
              </p>
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
                        <span
                          style={{ fontSize: "0.85rem", color: "#555" }}
                        ></span>
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
                  <ul
                    style={{ fontSize: "0.9rem", paddingLeft: "1.1rem" }}
                  >
                    {visitSummary.visits.map((v) => (
                      <li key={v.id} style={{ marginBottom: "0.4rem" }}>
                        <div>
                          {v.date} — {v.campus} — {v.firstDepartment}
                        </div>
                        {v.departments && v.departments.length > 0 && (
                          <div
                            style={{
                              fontSize: "0.85rem",
                              color: "#555",
                            }}
                          >
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
                Use this to correct typos in name or license info. Changes
                affect future check-ins.
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

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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

                <button
                  type="button"
                  onClick={handleArchiveGuest}
                  style={{
                    marginTop: "0.25rem",
                    padding: "0.45rem 0.9rem",
                    borderRadius: "999px",
                    border: "1px solid #b30000",
                    background: "#ffe6e6",
                    color: "#900",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Archive (Delete) Guest
                </button>
              </div>

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
  };

  const renderDeletedTab = () => {
    return (
      <section
        style={{
          padding: "1rem 1.25rem",
          borderRadius: "10px",
          border: "1px solid #ddd",
          background: "#fafafa",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Deleted Guests (Archive)</h2>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Guests listed here do not appear in normal search. You can restore
          them if they were deleted by mistake.
        </p>

        {deletedLoading && <p>Loading deleted guests…</p>}
        {deletedError && (
          <p style={{ color: "red", fontSize: "0.9rem" }}>{deletedError}</p>
        )}

        {!deletedLoading && deletedGuests.length === 0 && !deletedError && (
          <p style={{ fontSize: "0.9rem", color: "#666" }}>
            No deleted guests in the archive.
          </p>
        )}

        {deletedGuests.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              paddingLeft: 0,
              marginTop: "0.75rem",
            }}
          >
            {deletedGuests.map((g) => (
              <li
                key={g.id}
                style={{
                  padding: "0.5rem 0.4rem",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  <strong>
                    {(g.firstName || "").trim()}{" "}
                    {(g.lastName || "").trim()}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => handleRestoreGuest(g.id)}
                  style={{
                    padding: "0.35rem 0.9rem",
                    borderRadius: "999px",
                    border: "1px solid #006400",
                    background: "white",
                    color: "#006400",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  // -----------------------------
  // Main render
  // -----------------------------
  return (
    <div
      style={{
        fontFamily: "Inter, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
        padding: "2rem 1.5rem",
        maxWidth: "1200px",
        margin: "0 auto",
        background: "rgba(255, 255, 255, 0.82)",
        borderRadius: "28px",
        boxShadow: "0 24px 70px rgba(15, 23, 42, 0.12)",
        border: "1px solid #e5e7eb",
        backdropFilter: "blur(10px)",
      }}
    >
      <header
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>The Valley Club — Guest Check-In</h1>
          <p style={{ color: "#555", marginTop: "0.25rem" }}>
            Staff tool for recording daily guest visits and tracking yearly limits.
          </p>
        </div>
                <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "16px",
              border: "1px solid #d6e4ff",
              background: "linear-gradient(135deg, #eef4ff, #f7fbff)",
              minWidth: "240px",
              boxShadow: "0 18px 45px rgba(27, 51, 122, 0.12)",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.05em",
                fontWeight: 700,
                color: "#0f3c99",
                textTransform: "uppercase",
              }}
            >
              Today's Check-Ins
            </div>
            <div
              style={{
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "#0c2a66",
                marginTop: "0.25rem",
              }}
            >
              {todayVisits.length}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#2c4d93" }}>
              Guests checked in today. See details in the Today's Activity panel
              below.
            </div>
          </div>
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
      </header>

      {/* Tabs */}
      <div
        style={{
          display: "inline-flex",
          borderRadius: "999px",
          border: "1px solid #d0d7e7",
          background: "#f7f9fc",
          boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
          overflow: "hidden",
          marginBottom: "1.25rem",
          padding: "0.2rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("checkin")}
          style={{
            padding: "0.5rem 1.5rem",
            border: "none",
            background: activeTab === "checkin" ? "#0f766e" : "transparent",
            color: activeTab === "checkin" ? "white" : "#0f172a",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "999px",
            transition: "all 0.2s ease",
            boxShadow:
              activeTab === "checkin"
                ? "0 12px 28px rgba(15, 118, 110, 0.25)"
                : "none",
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
            background: activeTab === "lookup" ? "#0f766e" : "transparent",
            color: activeTab === "lookup" ? "white" : "#0f172a",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "999px",
            transition: "all 0.2s ease",
            boxShadow:
              activeTab === "lookup"
                ? "0 12px 28px rgba(15, 118, 110, 0.25)"
                : "none",
          }}
        >
          Guest Lookup
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("deleted")}
          style={{
            padding: "0.5rem 1.5rem",
            border: "none",
            background: activeTab === "deleted" ? "#0f766e" : "transparent",
            color: activeTab === "deleted" ? "white" : "#0f172a",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "999px",
            transition: "all 0.2s ease",
            boxShadow:
              activeTab === "deleted"
                ? "0 12px 28px rgba(15, 118, 110, 0.25)"
                : "none",
          }}
        >
          Deleted Guests
        </button>
      </div>

      {activeTab === "checkin"
        ? renderCheckinTab()
        : activeTab === "lookup"
        ? renderLookupTab()
        : renderDeletedTab()}
    </div>
  );
}

export default App;
