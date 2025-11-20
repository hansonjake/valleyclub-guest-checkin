// client/src/App.jsx
import { useState, useRef, useEffect } from "react";
import { BrowserPDF417Reader } from "@zxing/browser";

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

  // ----- Camera / scanning -----
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [isDecodingSnapshot, setIsDecodingSnapshot] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState(null); // data URL of captured image

  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const streamRef = useRef(null);

useEffect(() => {
  if (isScanning && videoRef.current && streamRef.current) {
    const video = videoRef.current;
    video.srcObject = streamRef.current;

    video
      .play()
      .catch((err) => {
        console.error("Error starting video playback:", err);
        setScanError("Unable to show camera preview.");
      });
  }
}, [isScanning]);

  // ----- Check-in state -----
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [campus, setCampus] = useState(CAMPUSES[0]);
  const [licenseState, setLicenseState] = useState("ID");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState(null); // "checked-in" | "already-checked-in-today" | "blocked" | null
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
          "New guest. Please enter first and last name if available."
        );
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to look up guest");
      }

      const data = await res.json();
      const g = data.guest;
      if (g) {
        if (g.firstName) setFirstName(g.firstName);
        if (g.lastName) setLastName(g.lastName);
        setAutoFillMessage("Existing guest found. Name auto-filled.");
      }
    } catch (err) {
      console.error("Error in handleLicenseBlur:", err);
      setAutoFillMessage("");
      // Don’t block check-in on errors
    }
  };

  // -------- Camera scanning + OpenAI parse (snapshot based) --------
  async function handleBarcodeDecoded(rawBarcodeText) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/parse-barcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawBarcodeData: rawBarcodeText }),
      });

      if (!res.ok) {
        throw new Error("Failed to parse barcode");
      }

      const data = await res.json();
      const parsed = data.parsed || {};

      if (parsed.licenseState) setLicenseState(parsed.licenseState);
      if (parsed.licenseNumber) setLicenseNumber(parsed.licenseNumber);
      if (parsed.firstName) setFirstName(parsed.firstName);
      if (parsed.lastName) setLastName(parsed.lastName);

      setScanError("");
      setAutoFillMessage("Info filled from scanned license.");
    } catch (err) {
      console.error("Error parsing barcode:", err);
      setScanError(
        "Scanned barcode, but could not read license info. Please enter manually."
      );
    }
  }

async function startScanner() {
  setScanError("");
  setLastSnapshot(null);

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScanError("Camera not supported on this device/browser.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }, // back camera if possible
      audio: false,
    });

    // Save stream for later; we attach it to the <video> in a useEffect
    streamRef.current = stream;
    setIsScanning(true);
  } catch (err) {
    console.error("Error accessing camera:", err);
    setScanError(
      "Unable to access camera. Check browser permissions or try a different device."
    );
    setIsScanning(false);
  }
}
function stopScanner() {
  setIsScanning(false);

  try {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  } catch (err) {
    console.error("Error stopping camera:", err);
  }
}

  async function captureSnapshotAndDecode() {
    setScanError("");

    const video = videoRef.current;
    if (!video) {
      setScanError("Camera not ready.");
      return;
    }

    // Create an in-memory canvas to capture a frame
    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/png");
    setLastSnapshot(dataUrl);

    // Convert canvas to image for ZXing
    const img = new Image();
    img.src = dataUrl;

    setIsDecodingSnapshot(true);

    img.onload = async () => {
      try {
        if (!codeReaderRef.current) {
          codeReaderRef.current = new BrowserPDF417Reader();
        }

        const result = await codeReaderRef.current.decodeFromImageElement(img);

        if (result) {
          console.log("Snapshot barcode detected:", result);
          const text = result.getText();
          await handleBarcodeDecoded(text);
        } else {
          setScanError(
            "Could not read barcode from snapshot. Try holding closer and try again."
          );
        }
      } catch (err) {
        console.error("Error decoding snapshot:", err);
        setScanError(
          "Could not read barcode from snapshot. Try better lighting or hold the barcode closer and flatter."
        );
      } finally {
        setIsDecodingSnapshot(false);
      }
    };

    img.onerror = () => {
      setIsDecodingSnapshot(false);
      setScanError("Failed to capture image from camera.");
    };
  }

  // -------- Download report --------
  const handleDownloadReport = () => {
    const year = new Date().getFullYear();
    const url = `${API_BASE_URL}/api/report/guests?year=${year}`;
    window.open(url, "_blank");
  };

  // -------- Check-in submit --------
  const handleCheckinSubmit = async (e) => {
    e.preventDefault();
    resetCheckinMessages();
    setAutoFillMessage("");
    setCheckinLoading(true);

    if (!licenseState || !licenseNumber || !department || !campus) {
      setCheckinError("Please fill in all required fields.");
      setCheckinLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseState,
          licenseNumber,
          firstName: firstName || null,
          lastName: lastName || null,
          department,
          campus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.status === "blocked") {
          setCheckinStatus("blocked");
          setCheckinMessage(data.message || "Guest is blocked.");
          setVisitStats(data.stats || null);
        } else {
          setCheckinError(
            data.error || data.message || "Failed to check in guest."
          );
        }
        return;
      }

      setCheckinStatus(data.status);
      setCheckinMessage(data.message || "");
      setVisitStats(data.stats || null);
    } catch (err) {
      console.error("Error checking in guest:", err);
      setCheckinError("Network error while checking in guest.");
    } finally {
      setCheckinLoading(false);
    }
  };

  // -------- Lookup guest list --------
  const handleLookupSubmit = async (e) => {
    e.preventDefault();
    setLookupError("");
    setLookupResults([]);
    setSelectedGuest(null);
    setVisitSummary(null);

    const q = lookupQuery.trim();
    if (!q) return;

    setLookupLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/lookup?q=${encodeURIComponent(q)}`
      );
      if (!res.ok) {
        throw new Error("Failed to search guests");
      }
      const list = await res.json();
      setLookupResults(list || []);
    } catch (err) {
      console.error("Error searching guests:", err);
      setLookupError("Failed to search guests.");
    } finally {
      setLookupLoading(false);
    }
  };

  // -------- Fetch visits for selected guest --------
  const fetchVisitsForGuest = async (guestId) => {
    setVisitsLoading(true);
    setVisitError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${guestId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch visits");
      }
      const summary = await res.json();
      setVisitSummary(summary);
    } catch (err) {
      console.error("Error fetching visits:", err);
      setVisitError("Failed to load visit history.");
    } finally {
      setVisitsLoading(false);
    }
  };

  const handleSelectGuest = async (guest) => {
    setSelectedGuest(guest);
    populateEditFieldsFromGuest(guest);
    await fetchVisitsForGuest(guest.id);
  };

  // -------- Delete a visit (fix mistakes) --------
  const handleDeleteVisit = async (visitId) => {
    if (!selectedGuest) return;
    const confirmDelete = window.confirm(
      "Remove this visit? This will reduce the guest's visit count."
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${visitId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      // Reload summary
      await fetchVisitsForGuest(selectedGuest.id);
    } catch (err) {
      console.error("Error deleting visit:", err);
      alert("Failed to remove visit.");
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update guest.");
      }

      const updated = await res.json();
      setSelectedGuest(updated);
      setEditMessage("Guest info updated.");
    } catch (err) {
      console.error("Error updating guest:", err);
      setEditError(err.message || "Failed to update guest.");
    } finally {
      setEditSaving(false);
    }
  };

  // -------- Render Check-in Tab --------
  const renderCheckinTab = () => (
    <form onSubmit={handleCheckinSubmit}>
      <section
        style={{
          padding: "0.75rem 1rem",
          border: "1px solid #ddd",
          borderRadius: "10px",
          marginBottom: "1rem",
        }}
      >
        <p style={{ fontSize: "0.85rem", color: "#555", marginTop: 0 }}>
          <strong>Required fields are marked with *</strong>
        </p>

        {/* Campus & Department */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <label>
            Campus *
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem",
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
          </label>
          <label>
            Department *
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.4rem",
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
          </label>
        </div>

        {/* License info */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <label>
            License State *
            <input
              value={licenseState}
              onChange={(e) => setLicenseState(e.target.value.toUpperCase())}
              onBlur={handleLicenseBlur}
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
            License Number *
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

        {/* Camera controls */}
        <div style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
          <button
            type="button"
            onClick={isScanning ? stopScanner : startScanner}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid #004d99",
              background: isScanning ? "#ffe6e6" : "#004d99",
              color: isScanning ? "#900" : "white",
              fontSize: "0.9rem",
              cursor: "pointer",
              marginRight: "0.5rem",
            }}
          >
            {isScanning ? "Stop Camera" : "Start Camera"}
          </button>

          <button
            type="button"
            onClick={captureSnapshotAndDecode}
            disabled={!isScanning || isDecodingSnapshot}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid #004d99",
              background: !isScanning ? "#ccc" : "#e0f0ff",
              color: !isScanning ? "#777" : "#004d99",
              fontSize: "0.9rem",
              cursor: !isScanning ? "not-allowed" : "pointer",
            }}
          >
            {isDecodingSnapshot ? "Reading..." : "Capture & Read Barcode"}
          </button>

          <p
            style={{
              fontSize: "0.8rem",
              color: "#555",
              marginTop: "0.3rem",
            }}
          >
            Tap "Start Camera" and point at the barcode on the back of the
            license. When it looks clear, tap "Capture &amp; Read Barcode".
            We'll show the captured image and auto-fill the license and name if
            possible.
          </p>
        </div>

        {isScanning && (
          <div
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          >
            <p
              style={{
                fontSize: "0.8rem",
                marginBottom: "0.25rem",
                color: "#555",
              }}
            >
              Live camera preview:
            </p>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: "100%", borderRadius: "8px" }}
            />
            {scanError && (
              <p
                style={{
                  color: "red",
                  fontSize: "0.8rem",
                  marginTop: "0.4rem",
                }}
              >
                {scanError}
              </p>
            )}
          </div>
        )}

        {lastSnapshot && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem",
              borderRadius: "8px",
              border: "1px dashed #aaa",
            }}
          >
            <p
              style={{
                fontSize: "0.8rem",
                marginBottom: "0.25rem",
                color: "#555",
              }}
            >
              Last captured image (used for barcode reading):
            </p>
            <img
              src={lastSnapshot}
              alt="Captured snapshot"
              style={{ width: "100%", borderRadius: "8px" }}
            />
          </div>
        )}

        {/* Name fields */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            marginTop: "0.75rem",
          }}
        >
          <label>
            First Name
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
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.85rem",
              color: "#0b5c0b",
            }}
          >
            {autoFillMessage}
          </p>
        )}

        {/* Messages */}
        {checkinError && (
          <p style={{ marginTop: "0.5rem", color: "red", fontSize: "0.9rem" }}>
            {checkinError}
          </p>
        )}
        {checkinMessage && (
          <p
            style={{
              marginTop: "0.5rem",
              color:
                checkinStatus === "checked-in"
                  ? "#0b5c0b"
                  : checkinStatus === "blocked"
                  ? "#b30000"
                  : "#004d99",
              fontSize: "0.95rem",
              fontWeight: 500,
            }}
          >
            {checkinMessage}
          </p>
        )}

        {visitStats && (
          <p style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
            <strong>Visits this year:</strong> {visitStats.visitsThisYear} /{" "}
            {visitStats.maxVisitsPerYear}
          </p>
        )}

        <button
          type="submit"
          disabled={checkinLoading}
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 1.2rem",
            borderRadius: "999px",
            border: "none",
            background: "#006400",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
            opacity: checkinLoading ? 0.7 : 1,
          }}
        >
          {checkinLoading ? "Checking in..." : "Check In Guest"}
        </button>
      </section>
    </form>
  );

  // -------- Render Lookup Tab --------
  const renderLookupTab = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1.5fr",
        gap: "1.25rem",
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
            marginBottom: "1rem",
          }}
        >
          <form onSubmit={handleLookupSubmit}>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Search by name or license info
              <input
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                placeholder="e.g. Smith, Jane, ID 12345"
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
              type="submit"
              disabled={lookupLoading}
              style={{
                marginTop: "0.25rem",
                padding: "0.45rem 0.9rem",
                borderRadius: "999px",
                border: "none",
                background: "#004d99",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
                opacity: lookupLoading ? 0.7 : 1,
              }}
            >
              {lookupLoading ? "Searching..." : "Search"}
            </button>
          </form>

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
                      <span
                        style={{ fontSize: "0.85rem", color: "#555" }}
                      >
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

  // -------- Main render --------
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
          Staff tool for recording daily guest visits and tracking yearly
          limits.
        </p>
      </header>

      {/* Download report button */}
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
