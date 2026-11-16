/**
 * CleanRide Management System - Central Data Store & Service Helpers
 * Completely clean data store: NO pre-filled mock bookings, complaints, rentals, or payments.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "cleanride-demo-v1";

  const defaultPricing = {
    upholstery: { sofa: 120, mattress: 95, dining: 45, curtains: 75 },
    carpet: { rate: 45, dirt: { Light: 0, Moderate: 25, Heavy: 55 } },
    vehicle: { car: 150, suv: 190, mpv: 220, van: 270, seat: 12 },
    rental: { extractor: 85, steam: 65, dryer: 45 }
  };

  const serviceNames = {
    upholstery: "Upholstery cleaning",
    carpet: "Carpet cleaning",
    vehicle: "Vehicle interior",
    rental: "Equipment rental"
  };

  const equipmentNames = {
    extractor: "Pro upholstery extractor",
    steam: "Steam cleaner",
    dryer: "Air mover dryer"
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function dateString(d) {
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function loadInitialState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        // Purge old fake mock bookings (CR-260501..4 or CR-JOB-101) if present
        if (Array.isArray(saved.bookings)) {
          saved.bookings = saved.bookings.filter(
            b => !["CR-260501", "CR-260502", "CR-260503", "CR-260504", "CR-JOB-101", "CR-JOB-102", "CR-JOB-103"].includes(b.id)
          );
        } else {
          saved.bookings = [];
        }

        if (Array.isArray(saved.complaints)) {
          saved.complaints = saved.complaints.filter(c => c.id !== "CC-1001");
        } else {
          saved.complaints = [];
        }

        if (Array.isArray(saved.rentals)) {
          saved.rentals = saved.rentals.filter(r => r.id !== "RN-1001");
        } else {
          saved.rentals = [];
        }

        if (Array.isArray(saved.payments)) {
          saved.payments = saved.payments.filter(p => !["PAY-001", "PAY-002"].includes(p.id));
        } else {
          saved.payments = [];
        }

        if (!Array.isArray(saved.users)) saved.users = [];

        // Ensure default accounts exist for demo login
        const hasCust = saved.users.some(u => u.role === "customer");
        const hasOwner = saved.users.some(u => u.role === "owner");
        if (!hasCust) {
          saved.users.push({
            id: "u-customer",
            name: "Aisha Rahman",
            email: "aisha@example.com",
            phone: "012-345 6789",
            password: "cleanride123",
            role: "customer"
          });
        }
        if (!hasOwner) {
          saved.users.push({
            id: "u-owner",
            name: "Sufian",
            email: "owner@cleanride.my",
            phone: "03-5550 0188",
            password: "owner123",
            role: "owner"
          });
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        return saved;
      }
    } catch (e) {
      console.warn("CleanRide store init fallback", e);
    }

    // Default clean state: Completely empty bookings, complaints, rentals, and payments!
    const customer = {
      id: "u-customer",
      name: "Aisha Rahman",
      email: "aisha@example.com",
      phone: "012-345 6789",
      password: "cleanride123",
      role: "customer"
    };

    const owner = {
      id: "u-owner",
      name: "Sufian",
      email: "owner@cleanride.my",
      phone: "03-5550 0188",
      password: "owner123",
      role: "owner"
    };

    const initialData = {
      users: [customer, owner],
      session: null,
      pricing: defaultPricing,
      capacity: 5,
      bookings: [],      // NO sample bookings! Clean empty list
      complaints: [],    // NO sample complaints!
      rentals: [],       // NO sample rentals!
      payments: []       // NO sample payments!
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData));
    return initialData;
  }

  let state = loadInitialState();

  function saveStore(newState) {
    if (newState) state = newState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function getStore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        state = saved;
      }
    } catch {}
    if (!state.bookings) state.bookings = [];
    if (!state.payments) state.payments = [];
    if (!state.rentals) state.rentals = [];
    if (!state.complaints) state.complaints = [];
    return state;
  }

  function resetStore() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("cleanride_jobs_data");
    localStorage.removeItem("cleanride_complaints_data");
    state = loadInitialState();
    return state;
  }

  // Format helpers
  function money(n) {
    return `RM ${Number(n || 0).toLocaleString("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  function fmtDate(v) {
    if (!v) return "—";
    try {
      const parts = String(v).split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
      }
      return new Date(v).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return v;
    }
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function statusClass(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, "-");
  }

  function badge(s) {
    return `<span class="badge ${statusClass(s)}">${esc(s || "—")}</span>`;
  }

  function todayStr() {
    return dateString(new Date());
  }

  function capacityData(date, excludeId) {
    const s = getStore();
    const day = date || "";
    const used = (s.bookings || []).filter(
      b => b.date === day && b.id !== excludeId && !["Cancelled", "Rejected"].includes(b.status)
    ).length;
    const limit = Number(s.capacity || 5);
    return {
      used,
      available: Math.max(0, limit - used),
      limit
    };
  }

  function quoteFrom(service, details = {}, dirtiness = "Moderate") {
    const s = getStore();
    const p = s.pricing || defaultPricing;
    let base = 0, surcharge = 0, label = "";

    if (service === "upholstery") {
      const key = details.upholsteryType || "sofa";
      const qty = Number(details.quantity || 1);
      base = (p.upholstery[key] || 120) * qty;
      label = `${qty} × ${key}`;
      const factor = { Light: 0, Moderate: 0.12, Heavy: 0.25 }[dirtiness] || 0;
      surcharge = base * factor;
    } else if (service === "carpet") {
      const area = Number(details.area || 0);
      base = area * (p.carpet.rate || 45);
      label = `Carpet · ${area} m²`;
      surcharge = (p.carpet.dirt && p.carpet.dirt[dirtiness]) || 0;
    } else if (service === "vehicle") {
      const typ = details.vehicleType || "car";
      const fleet = Number(details.fleet || 1);
      const seats = Number(details.seats || 5);
      const vehBase = (p.vehicle[typ] || 150) + Math.max(0, seats - 5) * (p.vehicle.seat || 12);
      base = vehBase * fleet;
      label = `${fleet} × ${typ.toUpperCase()} interior`;
      const factor = { Light: 0, Moderate: 0.1, Heavy: 0.2 }[dirtiness] || 0;
      surcharge = base * factor;
    } else if (service === "rental") {
      const equip = details.equipment || "extractor";
      const hrs = Number(details.rentalHours || 4);
      base = (p.rental[equip] || 85) * hrs;
      label = `${equipmentNames[equip] || equip} · ${hrs} hrs`;
      surcharge = 0;
    }

    const total = Math.round((base + surcharge) * 100) / 100;
    const deposit = Math.round(total * 0.2 * 100) / 100;

    return {
      service,
      label,
      base,
      surcharge,
      total,
      deposit,
      dirtiness
    };
  }

  function uniqueId(prefix) {
    const s = getStore();
    const pool = [
      ...(s.bookings || []).map(b => b.id),
      ...(s.rentals || []).map(r => r.id),
      ...(s.complaints || []).map(c => c.id),
      ...(s.payments || []).map(p => p.id)
    ];
    let id;
    do {
      id = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    } while (pool.includes(id));
    return id;
  }

  function uniqueComplaintId() {
    const s = getStore();
    const complaints = s.complaints || [];
    const highestNumber = complaints.reduce((highest, complaint) => {
      const match = String(complaint.id || "").match(/^CC-(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 1000);
    return `CC-${highestNumber + 1}`;
  }

  // Public CleanRideStore API attached to window
  window.CleanRideStore = {
    getStore,
    saveStore,
    resetStore,
    defaultPricing,
    serviceNames,
    equipmentNames,
    money,
    fmtDate,
    esc,
    badge,
    todayStr,
    capacityData,
    quoteFrom,
    uniqueId,
    uniqueComplaintId
  };
})();
