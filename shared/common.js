/**
 * CleanRide Shared Core
 * State management, data persistence, business rules, and shared UI helpers.
 */
(() => {
    "use strict";

    const KEY = "cleanride-demo-v1";

    const pricingDefaults = {
        upholstery: { sofa: 120, mattress: 95, dining: 45, curtains: 75 },
        carpet: { rate: 45, dirt: { Light: 0, Moderate: 25, Heavy: 55 } },
        vehicle: { car: 150, suv: 190, mpv: 220, van: 270, seat: 12 },
        rental: { extractor: 85, steam: 65, dryer: 45 }
    };

    // Empty initial state — no demo data

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

    const dateString = d => [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
    ].join("-");

    const datePlus = n => {
        const d = new Date(today);
        d.setDate(d.getDate() + n);
        return dateString(d);
    };

    const todayStr = () => dateString(new Date());

    const fmtDate = v => v
        ? new Date(`${v}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
        : "—";

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY));
            if (saved) {
                if (!Array.isArray(saved.users)) saved.users = [];
                if (!saved.pricing) saved.pricing = pricingDefaults;
                if (!saved.capacity) saved.capacity = 5;
                if (!Array.isArray(saved.bookings)) saved.bookings = [];
                if (!Array.isArray(saved.complaints)) saved.complaints = [];
                if (!Array.isArray(saved.rentals)) saved.rentals = [];
                if (!Array.isArray(saved.payments)) saved.payments = [];
                if (!Array.isArray(saved.equipment)) saved.equipment = [];
                if (!Array.isArray(saved.supplies)) saved.supplies = [];
                // Normalise complaint IDs if any are malformed
                let nextCC = saved.complaints.reduce((hi, c) => {
                    const m = String(c.id || "").match(/^CC-(\d+)$/);
                    return m ? Math.max(hi, Number(m[1])) : hi;
                }, 1000) + 1;
                saved.complaints.forEach(c => {
                    if (!/^CC-\d+$/.test(String(c.id || ""))) {
                        c.id = `CC-${nextCC++}`;
                    }
                });
                localStorage.setItem(KEY, JSON.stringify(saved));
                return saved;
            }
        } catch { }

        // Fresh install — empty state, no demo data
        return save({
            users: [],
            session: null,
            pricing: pricingDefaults,
            capacity: 5,
            bookings: [],
            complaints: [],
            rentals: [],
            payments: [],
            equipment: [],
            supplies: []
        });
    }

    function save(s) {
        localStorage.setItem(KEY, JSON.stringify(s));
        return s;
    }

    let state = load();

    function getState() {
        return state;
    }

    function setState() {
        save(state);
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

    const money = n => `RM ${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const getCurrentUser = () => {
        if (!state.session || !state.session.id) return null;
        if (!Array.isArray(state.users)) state.users = [];
        let u = state.users.find(x => x.id === state.session.id);
        if (!u) {
            u = {
                id: state.session.id,
                name: state.session.name || (state.session.role === "owner" ? "Admin" : "Customer"),
                email: state.session.email || "",
                phone: state.session.phone || "",
                role: state.session.role || "customer"
            };
            state.users.push(u);
            save(state);
        }
        return u;
    };

    const isOwner = () => state.session?.role === "owner";
    const isCustomer = () => state.session?.role === "customer";

    const bookings = () => state.bookings || [];
    const visibleBookings = () => isOwner() ? bookings() : bookings().filter(b => b.userId === state.session?.id);
    const bookingBy = id => bookings().find(b => b.id === id);

    const statusClass = s => String(s || "").toLowerCase().replaceAll(" ", "-");
    const badge = s => `<span class="badge ${statusClass(s)}">${esc(s || "—")}</span>`;

    function icon(s) {
        return `<span class="nav-icon" aria-hidden="true">${s}</span>`;
    }

    function openModal(title, subtitle, body, actions = "") {
        const modal = document.querySelector("#modal");
        if (!modal) return;
        modal.querySelector(".modal").innerHTML = `
            <div class="modal-head">
                <div>
                    <div class="modal-title">${title}</div>
                    <div class="modal-sub">${subtitle || ""}</div>
                </div>
                <button class="icon-btn" data-action="close-modal" aria-label="Close">×</button>
            </div>
            ${body}
            ${actions ? `<div class="modal-actions">${actions}</div>` : ""}
        `;
        modal.classList.add("open");
    }

    function closeModal() {
        const m = document.querySelector("#modal");
        if (m) m.classList.remove("open");
    }

    function toast(msg) {
        const t = document.querySelector("#toast");
        if (!t) return;
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
    }

    function empty(title, desc, action = "") {
        return `<div class="empty-state"><div class="empty-icon">＋</div><strong>${title}</strong><p>${desc}</p>${action}</div>`;
    }

    function head(kicker, title, desc, actions = "") {
        return `<div class="page-head"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${desc || ""}</p></div><div class="actions">${actions}</div></div>`;
    }

    function stat(label, value, note, mark) {
        return `<article class="stat-card"><div class="stat-mark">${mark}</div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;
    }

    function uniqueId(prefix) {
        const pool = [
            ...bookings().map(b => b.id),
            ...(state.rentals || []).map(r => r.id),
            ...(state.complaints || []).map(c => c.id),
            ...(state.payments || []).map(p => p.id)
        ];
        let id;
        do {
            id = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
        } while (pool.includes(id));
        return id;
    }

    function uniqueComplaintId() {
        const complaints = state.complaints || [];
        const highestNumber = complaints.reduce((highest, complaint) => {
            const match = String(complaint.id || "").match(/^CC-(\d+)$/);
            return match ? Math.max(highest, Number(match[1])) : highest;
        }, 1000);
        return `CC-${highestNumber + 1}`;
    }

    function uniqueEquipmentId() {
        const list = state.equipment || [];
        const highestNumber = list.reduce((highest, eq) => {
            const match = String(eq.id || "").match(/^EQ-(\d+)$/);
            return match ? Math.max(highest, Number(match[1])) : highest;
        }, 100);
        return `EQ-${highestNumber + 1}`;
    }

    function uniqueSupplyId() {
        const list = state.supplies || [];
        const highest = list.reduce((hi, s) => {
            const m = String(s.id || "").match(/^SP-(\d+)$/);
            return m ? Math.max(hi, Number(m[1])) : hi;
        }, 100);
        return `SP-${highest + 1}`;
    }

    function capacityData(date, excludeId) {
        const day = date || "";
        const used = bookings().filter(b => b.date === day && b.id !== excludeId && !["Cancelled", "Rejected"].includes(b.status)).length;
        return {
            used,
            available: Math.max(0, Number(state.capacity) - used),
            limit: Number(state.capacity)
        };
    }

    function serviceFields(type = "") {
        const dirt = `<div class="field"><label>Soiling level</label><select class="select" name="dirtiness"><option>Light</option><option selected>Moderate</option><option>Heavy</option></select></div>`;
        if (type === "upholstery") {
            return `<div class="form-grid"><div class="field"><label>Upholstery item</label><select class="select" name="upholsteryType"><option value="sofa">3-seater sofa</option><option value="mattress">Mattress</option><option value="dining">Dining chair</option><option value="curtains">Curtain set</option></select></div><div class="field"><label>Quantity</label><input class="input" type="number" name="quantity" min="1" max="20" value="1" required></div>${dirt}</div>`;
        }
        if (type === "carpet") {
            return `<div class="form-grid"><div class="field"><label>Carpet area (m²)</label><input class="input" type="number" name="area" min="5" max="500" value="30" required></div>${dirt}</div>`;
        }
        if (type === "vehicle") {
            return `<div class="form-grid"><div class="field"><label>Vehicle type</label><select class="select" name="vehicleType"><option value="car">Sedan / hatchback</option><option value="suv">SUV</option><option value="mpv">MPV</option><option value="van">Van</option></select></div><div class="field"><label>Registration</label><input class="input" name="registration" required placeholder="e.g. VBC 2841"></div><div class="field"><label>Seat count</label><input class="input" type="number" name="seats" min="2" max="20" value="5" required></div><div class="field"><label>Fleet count</label><input class="input" type="number" name="fleet" min="1" max="8" value="1" required></div>${dirt}</div>`;
        }
        if (type === "rental") {
            return `<div class="form-grid"><div class="field"><label>Equipment</label><select class="select" name="equipment">${Object.entries(equipmentNames).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div><div class="field"><label>Rental start date</label><input class="input" type="date" name="rentalStart" min="${todayStr()}" required></div><div class="field"><label>Rental duration (hours)</label><input class="input" type="number" name="rentalHours" min="2" max="72" value="4" required></div></div>`;
        }
        return `<div class="notice">Select a service above to see the right details.</div>`;
    }

    function quoteFrom(form) {
        const d = new FormData(form);
        const service = d.get("service");
        if (!service) return null;
        let base = 0, surcharge = 0, label = "";
        const dirt = d.get("dirtiness") || "Moderate";
        if (service === "upholstery") {
            const key = d.get("upholsteryType") || "sofa";
            const qty = Number(d.get("quantity") || 1);
            base = state.pricing.upholstery[key] * qty;
            label = `${d.get("quantity") || 1} × ${key}`;
            surcharge = ({ Light: 0, Moderate: .12, Heavy: .25 }[dirt] || 0) * base;
        }
        if (service === "carpet") {
            const area = Number(d.get("area") || 0);
            base = area * state.pricing.carpet.rate;
            label = `Carpet · ${area} m²`;
            surcharge = state.pricing.carpet.dirt[dirt] || 0;
        }
        if (service === "vehicle") {
            const typ = d.get("vehicleType") || "car";
            const fleet = Number(d.get("fleet") || 1);
            const seats = Number(d.get("seats") || 5);
            base = (state.pricing.vehicle[typ] + Math.max(0, seats - 5) * state.pricing.vehicle.seat) * fleet;
            label = `${fleet} × ${typ.toUpperCase()} interior`;
            surcharge = ({ Light: 0, Moderate: .1, Heavy: .2 }[dirt] || 0) * base;
        }
        if (service === "rental") {
            const equip = d.get("equipment") || "extractor";
            const hrs = Number(d.get("rentalHours") || 4);
            base = state.pricing.rental[equip] * hrs;
            label = `${equipmentNames[equip]} · ${hrs} hrs`;
        }
        const total = Math.round((base + surcharge) * 100) / 100;
        return { service, label, base, surcharge, total, deposit: Math.round(total * .2 * 100) / 100, dirtiness: dirt };
    }

    function breakdown(quote) {
        if (!quote) {
            return `<div class="summary-line"><span>Service estimate</span><strong>Choose service</strong></div><div class="summary-line"><span>Extras & adjustments</span><strong>—</strong></div><div class="summary-line"><span>Deposit due</span><strong>—</strong></div>`;
        }
        return `<div class="summary-line"><span>${esc(quote.label)}</span><strong>${money(quote.base)}</strong></div><div class="summary-line"><span>Dirtiness adjustment</span><strong>${money(quote.surcharge)}</strong></div><div class="summary-line"><span>Estimated balance</span><strong>${money(quote.total - quote.deposit)}</strong></div>`;
    }

    function requireAuth(expectedRole) {
        const u = getCurrentUser();
        if (!state.session || !u) {
            state.session = null;
            save(state);
            window.location.replace("../login/login.html");
            return false;
        }
        if (expectedRole && u.role !== expectedRole) {
            if (u.role === "owner") {
                window.location.replace("../owner/owner.html");
            } else {
                window.location.replace("../customer/customer.html");
            }
            return false;
        }
        return true;
    }

    function logout() {
        state.session = null;
        setState();
        window.location.replace("../login/login.html");
    }

    // Attach global API object
    window.CleanRide = {
        KEY,
        pricingDefaults,
        serviceNames,
        equipmentNames,
        load,
        save,
        getState,
        setState,
        getCurrentUser,
        user: getCurrentUser,
        isOwner,
        isCustomer,
        bookings,
        visibleBookings,
        bookingBy,
        todayStr,
        fmtDate,
        dateString,
        datePlus,
        esc,
        money,
        statusClass,
        badge,
        icon,
        openModal,
        closeModal,
        toast,
        empty,
        head,
        stat,
        uniqueId,
        uniqueComplaintId,
        uniqueEquipmentId,
        uniqueSupplyId,
        capacityData,
        serviceFields,
        quoteFrom,
        breakdown,
        requireAuth,
        logout
    };
})();
