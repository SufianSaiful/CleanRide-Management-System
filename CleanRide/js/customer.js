/**
 * CleanRide Management System - Customer Portal Controller
 * Fixed customer list: Created jobs guaranteed to appear immediately.
 * Clean initial state with zero mock data.
 */
(() => {
  "use strict";

  const store = window.CleanRideStore;
  const auth = window.CleanRideAuth;

  let currentUser = null;
  let activeTab = "customer-home";
  let selectedBookingDraft = null;

  function initCustomerApp() {
    // Safe session acquisition: if no session in localStorage, default to customer guest so page never crashes
    currentUser = auth.getCurrentSession();
    if (!currentUser) {
      currentUser = {
        id: "u-customer",
        name: "Aisha Rahman",
        email: "aisha@example.com",
        phone: "012-345 6789",
        role: "customer"
      };
    }

    renderHeaderProfile();
    setupSidebarNavigation();

    // Render initial views
    renderOverview();
    renderBookingForm();
    renderAppointments();
    renderFeedback();

    navigateTo(activeTab);

    // Global modal close handlers
    const modalCloseBtn = document.getElementById("modalCloseBtn");
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
    const modal = document.getElementById("modalBackdrop");
    if (modal) {
      modal.addEventListener("click", e => {
        if (e.target === modal) closeModal();
      });
    }
  }

  function renderHeaderProfile() {
    const avatar = document.getElementById("headerAvatar");
    const name = document.getElementById("headerUserName");
    const email = document.getElementById("headerUserEmail");

    if (avatar) {
      avatar.textContent = (currentUser.name || "CU")
        .split(" ")
        .map(x => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    }
    if (name) name.textContent = currentUser.name || "Customer Profile";
    if (email) email.textContent = currentUser.email || "customer@cleanride.com";

    const exitBtn = document.getElementById("headerExitBtn");
    if (exitBtn) {
      exitBtn.addEventListener("click", () => {
        auth.logoutUser("../login.html");
      });
    }

    const toggleBtn = document.getElementById("sidebarToggleBtn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const layout = document.querySelector(".app-main-layout");
        if (layout) layout.classList.toggle("sidebar-collapsed");
      });
    }
  }

  function setupSidebarNavigation() {
    document.querySelectorAll(".sidebar-nav [data-page]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        navigateTo(btn.dataset.page);
      });
    });
  }

  function getMyBookings() {
    const s = store.getStore();
    const all = s.bookings || [];
    return all.filter(b => {
      if (!currentUser || !currentUser.id) return true;
      return (
        b.userId === currentUser.id ||
        (b.email && currentUser.email && b.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        b.userId === "u-customer" ||
        !b.userId
      );
    });
  }

  function navigateTo(pageId) {
    activeTab = pageId;

    document.querySelectorAll(".sidebar-nav [data-page]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.page === pageId);
    });

    document.querySelectorAll(".view-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `view-${pageId}`);
    });

    if (pageId === "customer-home") renderOverview();
    if (pageId === "appointments") renderAppointments();
    if (pageId === "reports") renderFeedback();
    if (pageId === "new-booking") updateCapacityUI();
  }

  // =========================================================
  // 1. OVERVIEW VIEW
  // =========================================================
  function renderOverview() {
    const myBookings = getMyBookings();
    const s = store.getStore();

    const sorted = myBookings.slice().sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = sorted.filter(
      b => !["Cancelled", "Completed", "Rejected"].includes(b.status)
    );
    const next = upcoming[0];
    const completed = myBookings.filter(b => b.status === "Completed");
    const openBal = myBookings.reduce((sum, b) => sum + (Number(b.balance) || 0), 0);
    const myComplaints = (s.complaints || []).filter(c => c.userId === currentUser?.id || !c.userId);

    // Update KPI Metric Cards
    const statUpcoming = document.getElementById("statUpcomingCount");
    const statCompleted = document.getElementById("statCompletedCount");
    const statBalance = document.getElementById("statOpenBalance");
    const statFeedback = document.getElementById("statFeedbackCount");
    if (statUpcoming) statUpcoming.textContent = upcoming.length;
    if (statCompleted) statCompleted.textContent = completed.length;
    if (statBalance) statBalance.textContent = store.money(openBal);
    if (statFeedback) statFeedback.textContent = myComplaints.length;

    // Sidebar badge
    const custApptBadge = document.getElementById("custApptNavBadge");
    if (custApptBadge) {
      custApptBadge.textContent = upcoming.length;
      custApptBadge.style.display = upcoming.length > 0 ? "inline-block" : "none";
    }

    const welcomeName = document.getElementById("welcomeCustName");
    if (welcomeName) welcomeName.textContent = (currentUser?.name || "Customer").split(" ")[0];

    // Coming up next card
    const nextCardBox = document.getElementById("nextVisitBox");
    if (nextCardBox) {
      if (next) {
        nextCardBox.innerHTML = `
          <div class="service-row">
            <div class="service-symbol">CR</div>
            <div style="flex:1">
              <div class="service-label">${store.esc(next.serviceLabel)}</div>
              <div class="service-meta">${store.fmtDate(next.date)} · ${store.esc(next.time)} · ${store.esc(next.address)}</div>
            </div>
            <div class="service-price">${store.money(next.total)}</div>
          </div>
          <div style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between;">
            ${store.badge(next.status)}
            <button class="btn btn-secondary btn-small" onclick="CleanRideCustomer.showBookingDetail('${store.esc(next.id)}')">View Details</button>
          </div>
        `;
      } else {
        nextCardBox.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">✓</div>
            <strong>No upcoming visits</strong>
            <p>You have not made any service bookings yet.</p>
            <button class="btn btn-primary btn-small" onclick="CleanRideCustomer.openNewBooking()">＋ Request Service Now</button>
          </div>
        `;
      }
    }

    // Service list tiles
    const servicesBox = document.getElementById("servicesListTiles");
    if (servicesBox) {
      const descriptions = {
        upholstery: "Sofas, mattresses, curtains & dining fabric",
        carpet: "Room-by-room deep carpet washing",
        vehicle: "Seats, mats & complete car interior",
        rental: "Commercial extractor, steam cleaner & dryer"
      };
      servicesBox.innerHTML = Object.entries(store.serviceNames).map(([id, label], i) => `
        <div class="service-row">
          <div class="service-symbol">${["U", "C", "V", "R"][i]}</div>
          <div style="flex:1">
            <div class="service-label">${store.esc(label)}</div>
            <div class="service-meta">${descriptions[id] || ""}</div>
          </div>
          <button class="btn btn-secondary btn-small" onclick="CleanRideCustomer.openNewBooking('${id}')">Choose →</button>
        </div>
      `).join("");
    }

    // Recent bookings table
    const recentBody = document.getElementById("recentBookingsTableBody");
    if (recentBody) {
      const recents = myBookings.slice().reverse().slice(0, 5);
      if (!recents.length) {
        recentBody.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="empty-state">
                <div class="empty-icon">▤</div>
                <strong>Nothing to show yet</strong>
                <p>New service requests will appear here once created.</p>
                <button class="btn btn-primary btn-small" onclick="CleanRideCustomer.openNewBooking()">＋ Request Service</button>
              </div>
            </td>
          </tr>
        `;
      } else {
        recentBody.innerHTML = recents.map(b => `
          <tr>
            <td>
              <span class="primary-cell">${store.esc(b.id)}</span>
              <span class="sub-cell">${store.esc(b.serviceLabel)}</span>
            </td>
            <td>${store.esc((b.items || []).map(i => i.label).join(", "))}</td>
            <td>${store.fmtDate(b.date)}<span class="sub-cell">${store.esc(b.time || "")}</span></td>
            <td class="primary-cell">${store.money(b.total)}</td>
            <td>${store.badge(b.status)}</td>
            <td>
              <button class="text-link" onclick="CleanRideCustomer.showBookingDetail('${store.esc(b.id)}')">Details</button>
            </td>
          </tr>
        `).join("");
      }
    }
  }

  // =========================================================
  // 2. REQUEST SERVICE (BOOKING FORM)
  // =========================================================
  function renderBookingForm() {
    const serviceSelect = document.getElementById("bookingServiceSelect");
    const serviceFieldsBox = document.getElementById("dynamicServiceFields");
    const form = document.getElementById("customerBookingForm");

    if (serviceSelect && serviceFieldsBox) {
      serviceSelect.addEventListener("change", () => {
        serviceFieldsBox.innerHTML = getServiceFieldsHTML(serviceSelect.value);
        updateLiveQuote();
      });
    }

    const dateInput = document.getElementById("bookingDate");
    if (dateInput) {
      dateInput.min = store.todayStr();
      dateInput.addEventListener("change", updateCapacityUI);
    }

    if (form) {
      form.addEventListener("input", updateLiveQuote);
      form.addEventListener("submit", handleBookingSubmit);
    }
  }

  function getServiceFieldsHTML(type) {
    const dirtOptions = `
      <div class="field">
        <label>Soil / Dirtiness Level</label>
        <select class="select" name="dirtiness">
          <option>Light</option>
          <option selected>Moderate</option>
          <option>Heavy</option>
        </select>
      </div>
    `;

    if (type === "upholstery") {
      return `
        <div class="form-grid">
          <div class="field">
            <label>Upholstery Item</label>
            <select class="select" name="upholsteryType">
              <option value="sofa">3-seater sofa (RM 120)</option>
              <option value="mattress">Mattress (RM 95)</option>
              <option value="dining">Dining chair (RM 45)</option>
              <option value="curtains">Curtain set (RM 75)</option>
            </select>
          </div>
          <div class="field">
            <label>Quantity</label>
            <input class="input" type="number" name="quantity" min="1" max="20" value="1" required>
          </div>
          ${dirtOptions}
        </div>
      `;
    }
    if (type === "carpet") {
      return `
        <div class="form-grid">
          <div class="field">
            <label>Carpet Area (m²)</label>
            <input class="input" type="number" name="area" min="5" max="500" placeholder="e.g. 30" required>
          </div>
          ${dirtOptions}
        </div>
      `;
    }
    if (type === "vehicle") {
      return `
        <div class="form-grid">
          <div class="field">
            <label>Vehicle Type</label>
            <select class="select" name="vehicleType">
              <option value="car">Sedan / Hatchback (RM 150)</option>
              <option value="suv">SUV (RM 190)</option>
              <option value="mpv">MPV (RM 220)</option>
              <option value="van">Van (RM 270)</option>
            </select>
          </div>
          <div class="field">
            <label>Registration Number</label>
            <input class="input" name="registration" required placeholder="e.g. VBC 2841">
          </div>
          <div class="field">
            <label>Total Seats</label>
            <input class="input" type="number" name="seats" min="2" max="20" value="5" required>
          </div>
          <div class="field">
            <label>Fleet Count</label>
            <input class="input" type="number" name="fleet" min="1" max="8" value="1" required>
          </div>
          ${dirtOptions}
        </div>
      `;
    }
    if (type === "rental") {
      return `
        <div class="form-grid">
          <div class="field">
            <label>Equipment Kit</label>
            <select class="select" name="equipment">
              ${Object.entries(store.equipmentNames).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Rental Start Date</label>
            <input class="input" type="date" name="rentalStart" min="${store.todayStr()}" required>
          </div>
          <div class="field">
            <label>Hire Duration (Hours)</label>
            <input class="input" type="number" name="rentalHours" min="2" max="72" value="4" required>
          </div>
        </div>
      `;
    }
    return `<div class="notice">Select a service category above to specify quantity and requirements.</div>`;
  }

  function getFormDataObj(form) {
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    return obj;
  }

  function updateLiveQuote() {
    const form = document.getElementById("customerBookingForm");
    if (!form) return;
    const data = getFormDataObj(form);
    const service = data.service;

    const breakdownBox = document.getElementById("liveQuoteBreakdown");
    const totalBox = document.getElementById("liveQuoteTotal");
    const depositBox = document.getElementById("liveQuoteDeposit");

    if (!service) {
      if (breakdownBox) {
        breakdownBox.innerHTML = `
          <div class="summary-line"><span>Service estimate</span><strong>Choose service</strong></div>
          <div class="summary-line"><span>Extras & adjustments</span><strong>—</strong></div>
          <div class="summary-line"><span>Estimated balance</span><strong>—</strong></div>
        `;
      }
      if (totalBox) totalBox.textContent = store.money(0);
      if (depositBox) depositBox.textContent = store.money(0);
      return;
    }

    const quote = store.quoteFrom(service, data, data.dirtiness);
    if (breakdownBox) {
      breakdownBox.innerHTML = `
        <div class="summary-line"><span>${store.esc(quote.label)}</span><strong>${store.money(quote.base)}</strong></div>
        <div class="summary-line"><span>Soil / Surcharge</span><strong>${store.money(quote.surcharge)}</strong></div>
        <div class="summary-line"><span>Estimated balance</span><strong>${store.money(quote.total - quote.deposit)}</strong></div>
      `;
    }
    if (totalBox) totalBox.textContent = store.money(quote.total);
    if (depositBox) depositBox.textContent = store.money(quote.deposit);
  }

  function updateCapacityUI() {
    const dateInput = document.getElementById("bookingDate");
    const date = dateInput ? dateInput.value : "";
    const label = document.getElementById("capacityLabel");
    const meter = document.getElementById("capacityMeterBar");
    const count = document.getElementById("capacityCount");
    const warning = document.getElementById("dateCapacityWarning");

    if (!date) {
      if (label) label.textContent = "Select a date to check availability";
      if (meter) meter.style.width = "0%";
      if (count) count.textContent = "—";
      if (warning) warning.classList.remove("show");
      return;
    }

    const c = store.capacityData(date);
    if (label) {
      label.textContent = c.available
        ? `${c.used} booked · ${c.available} slot${c.available === 1 ? "" : "s"} available`
        : "This date is fully booked";
    }
    if (meter) {
      meter.style.width = `${Math.min(100, (c.used / c.limit) * 100)}%`;
    }
    if (count) {
      count.textContent = `${c.used}/${c.limit}`;
    }
    if (warning) {
      warning.textContent = c.available
        ? ""
        : `This date has reached its ${c.limit}-job capacity limit. Please pick another date.`;
      warning.classList.toggle("show", !c.available);
    }
  }

  function handleBookingSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;

    const data = getFormDataObj(form);
    const service = data.service;
    if (!service) {
      showToast("Please choose a service to continue.");
      return;
    }

    const date = data.date;
    const cap = store.capacityData(date);
    if (!cap.available) {
      showToast("Selected date is full. Please pick another date.");
      updateCapacityUI();
      return;
    }

    if (service === "rental") {
      const start = data.rentalStart;
      if (start < store.todayStr()) {
        showToast("Rental start date must be from today onwards.");
        return;
      }
      if (start !== date) {
        showToast("For equipment rental, service date and rental start date must match.");
        return;
      }
      const s = store.getStore();
      const collision = (s.rentals || []).some(
        r => r.equipment === data.equipment && r.start === start && ["Requested", "Approved"].includes(r.status)
      );
      if (collision) {
        showToast("That equipment is already booked on this date. Choose another date.");
        return;
      }
    }

    const quote = store.quoteFrom(service, data, data.dirtiness);
    const items = [];
    let details = {};

    if (service === "upholstery") {
      const key = data.upholsteryType;
      const qty = Number(data.quantity || 1);
      items.push({ label: `${qty} × ${key}`, qty, unit: quote.base / qty });
      details = { upholsteryType: key, quantity: qty };
    } else if (service === "carpet") {
      const area = Number(data.area || 30);
      items.push({ label: `Carpet area · ${area} m²`, qty: area, unit: quote.base / area });
      details = { area };
    } else if (service === "vehicle") {
      const typ = data.vehicleType;
      const fleet = Number(data.fleet || 1);
      const seats = Number(data.seats || 5);
      items.push({ label: `${fleet} × ${typ.toUpperCase()} · ${seats} seats`, qty: fleet, unit: quote.base / fleet });
      details = { vehicleType: typ, registration: data.registration, seats, fleet };
    } else if (service === "rental") {
      const equip = data.equipment;
      const hours = Number(data.rentalHours || 4);
      items.push({ label: `${store.equipmentNames[equip] || equip} · ${hours} hours`, qty: hours, unit: quote.base / hours });
      details = { equipment: equip, rentalStart: data.rentalStart, rentalHours: hours };
    }

    const bookingId = store.uniqueId("CR");

    selectedBookingDraft = {
      id: bookingId,
      userId: currentUser ? currentUser.id : "u-customer",
      name: String(data.name).trim(),
      email: String(data.email).trim(),
      phone: String(data.phone).trim(),
      address: String(data.address).trim(),
      date,
      time: String(data.time),
      service,
      serviceLabel: store.serviceNames[service] || service,
      items,
      ...details,
      dirtiness: quote.dirtiness,
      instructions: String(data.instructions || "").trim(),
      base: quote.base,
      surcharge: quote.surcharge,
      total: quote.total,
      deposit: quote.deposit,
      balance: quote.total - quote.deposit,
      status: "Pending",
      paymentStatus: "Deposit paid",
      paid: quote.deposit,
      createdAt: new Date().toISOString()
    };

    // Open deposit review modal
    openModal(
      "Review Booking & Simulated Deposit",
      `${store.esc(bookingId)} · ${store.fmtDate(date)} · ${store.esc(data.time)}`,
      `
        <div class="notice">
          <strong>Demo environment:</strong> No real bank charges or cards are required. Confirming records this booking into your Customer List.
        </div>
        <div class="summary-breakdown" style="margin-top: 1.25rem;">
          <div class="summary-line"><span>${store.esc(quote.label)}</span><strong>${store.money(quote.base)}</strong></div>
          <div class="summary-line"><span>Soil / Surcharge</span><strong>${store.money(quote.surcharge)}</strong></div>
          <div class="summary-line"><span>Total Estimate</span><strong>${store.money(quote.total)}</strong></div>
          <div class="summary-line" style="color:var(--primary); font-weight:700;">
            <span>20% Deposit Due Today</span><strong>${store.money(quote.deposit)}</strong>
          </div>
          <div class="summary-line"><span>Remaining Balance</span><strong>${store.money(quote.total - quote.deposit)}</strong></div>
        </div>
        <div class="field" style="margin-top: 1rem;">
          <label>Deposit Payment Method</label>
          <select class="select" id="depositPaymentMethod">
            <option>Online transfer (simulated)</option>
            <option>Cash at arrival</option>
          </select>
        </div>
      `,
      `
        <button class="btn btn-quiet" onclick="CleanRideCustomer.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="CleanRideCustomer.confirmBooking()">Confirm & Save to Customer List</button>
      `
    );
  }

  function confirmBooking() {
    if (!selectedBookingDraft) return;
    const b = selectedBookingDraft;
    const s = store.getStore();

    const method = document.getElementById("depositPaymentMethod")?.value || "Online transfer (simulated)";

    b.paid = b.deposit;
    b.balance = Number((b.total - b.paid).toFixed(2));
    b.paymentStatus = "Deposit paid";

    // Record payment in ledger
    if (!Array.isArray(s.payments)) s.payments = [];
    s.payments.push({
      id: store.uniqueId("PAY"),
      bookingId: b.id,
      amount: b.deposit,
      date: store.todayStr(),
      method,
      note: "Booking deposit (simulated)"
    });

    // Record booking in store
    if (!Array.isArray(s.bookings)) s.bookings = [];
    s.bookings.push(b);

    // Record rental if equipment
    if (b.service === "rental") {
      if (!Array.isArray(s.rentals)) s.rentals = [];
      s.rentals.push({
        id: store.uniqueId("RN"),
        bookingId: b.id,
        userId: b.userId,
        name: b.name,
        equipment: b.equipment,
        start: b.rentalStart,
        hours: b.rentalHours,
        status: "Requested",
        price: b.total
      });
    }

    // Persist immediately to localStorage
    store.saveStore(s);
    selectedBookingDraft = null;
    closeModal();

    // Reset form
    const form = document.getElementById("customerBookingForm");
    if (form) form.reset();
    const fieldsBox = document.getElementById("dynamicServiceFields");
    if (fieldsBox) fieldsBox.innerHTML = `<div class="notice">Select a service category above to specify quantity and requirements.</div>`;
    updateLiveQuote();

    showToast(`Booking ${b.id} created successfully! Listed below.`);

    // Switch to Customer List and force fresh render!
    navigateTo("appointments");
  }

  // =========================================================
  // 3. CUSTOMER LIST (APPOINTMENTS VIEW)
  // =========================================================
  function renderAppointments() {
    const myBookings = getMyBookings();

    const qInput = document.getElementById("apptSearchInput");
    const statusSelect = document.getElementById("apptStatusFilter");
    const sortSelect = document.getElementById("apptSortFilter");
    const titleEl = document.getElementById("apptListTitle");

    const q = (qInput?.value || "").toLowerCase();
    const st = statusSelect?.value || "";
    const sort = sortSelect?.value || "newest";

    let arr = myBookings.filter(b => {
      const matchQ = !q || `${b.id} ${b.serviceLabel} ${b.name}`.toLowerCase().includes(q);
      const matchSt = !st || b.status === st;
      return matchQ && matchSt;
    });

    arr.sort((a, b) => (sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));

    if (titleEl) {
      titleEl.textContent = `Your Customer List (${myBookings.length} Appointment${myBookings.length === 1 ? "" : "s"})`;
    }

    // Sidebar badge
    const custApptBadge = document.getElementById("custApptNavBadge");
    if (custApptBadge) {
      custApptBadge.textContent = myBookings.length;
      custApptBadge.style.display = myBookings.length > 0 ? "inline-block" : "none";
    }

    const body = document.getElementById("appointmentsTableBody");
    if (!body) return;

    if (!arr.length) {
      body.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-icon">▤</div>
              <strong>No appointments in your list</strong>
              <p>When you request a service, your booked job will appear right here.</p>
              <button class="btn btn-primary btn-small" onclick="CleanRideCustomer.navigateTo('new-booking')">＋ Request a Service</button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = arr.map(b => `
      <tr>
        <td>
          <span class="primary-cell">${store.esc(b.id)}</span>
          <span class="sub-cell">${store.esc(b.serviceLabel)}</span>
        </td>
        <td>${store.esc((b.items || []).map(i => i.label).join(", "))}</td>
        <td>
          ${store.fmtDate(b.date)}
          <span class="sub-cell">${store.esc(b.time || "")}</span>
        </td>
        <td class="primary-cell">
          ${store.money(b.total)}
          <span class="sub-cell">Deposit: ${store.money(b.deposit)}</span>
        </td>
        <td>
          ${store.badge(b.status)}
          ${b.rescheduleRequest ? `<span class="sub-cell" style="color:var(--status-pending)">Reschedule requested</span>` : ""}
        </td>
        <td>
          ${store.badge(b.paymentStatus)}
          <span class="sub-cell">Balance: ${store.money(b.balance)}</span>
        </td>
        <td>
          <button class="text-link" onclick="CleanRideCustomer.showBookingDetail('${store.esc(b.id)}')">Details</button>
        </td>
      </tr>
    `).join("");

    if (qInput && !qInput.dataset.bound) {
      qInput.dataset.bound = "true";
      qInput.addEventListener("input", renderAppointments);
    }
    if (statusSelect && !statusSelect.dataset.bound) {
      statusSelect.dataset.bound = "true";
      statusSelect.addEventListener("change", renderAppointments);
    }
    if (sortSelect && !sortSelect.dataset.bound) {
      sortSelect.dataset.bound = "true";
      sortSelect.addEventListener("change", renderAppointments);
    }
  }

  function showBookingDetail(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    const payments = (s.payments || []).filter(p => p.bookingId === bookingId);

    openModal(
      `Booking ${store.esc(b.id)}`,
      `${store.esc(b.serviceLabel)} · ${store.fmtDate(b.date)} at ${store.esc(b.time)}`,
      `
        <div class="service-row" style="margin-bottom:1rem;">
          <div style="flex:1">
            <div class="service-label">${store.esc(b.name)}</div>
            <div class="service-meta">${store.esc(b.email)} · ${store.esc(b.phone)}</div>
            <div class="service-meta">${store.esc(b.address)}</div>
          </div>
          ${store.badge(b.status)}
        </div>

        ${b.rescheduleRequest ? `
          <div class="notice" style="margin-bottom:1rem;">
            You requested a reschedule to <strong>${store.fmtDate(b.rescheduleRequest.date)} (${store.esc(b.rescheduleRequest.time)})</strong>. The team is reviewing availability.
          </div>
        ` : ""}

        <div class="service-row" style="margin-bottom:1rem;">
          <div style="flex:1">
            <div class="service-label">Service Items</div>
            <div class="service-meta">${store.esc((b.items || []).map(i => i.label).join(" · "))}</div>
            ${b.instructions ? `<div class="service-meta" style="margin-top:4px;">Note: ${store.esc(b.instructions)}</div>` : ""}
          </div>
        </div>

        <div class="summary-breakdown">
          <div class="summary-line"><span>Service Estimate</span><strong>${store.money(b.total)}</strong></div>
          <div class="summary-line"><span>Paid So Far (${store.esc(b.paymentStatus)})</span><strong>${store.money(b.paid)}</strong></div>
          <div class="summary-line"><span>Remaining Due</span><strong>${store.money(b.balance)}</strong></div>
        </div>

        ${payments.length ? `
          <div style="font-size:0.78rem; color:var(--muted); margin-top:0.75rem;">
            <strong>Recorded Payments:</strong> ${payments.map(p => `${store.esc(p.method)}: ${store.money(p.amount)}`).join(" · ")}
          </div>
        ` : ""}
      `,
      `
        <button class="btn btn-quiet" onclick="CleanRideCustomer.closeModal()">Close</button>
        ${["Pending", "Confirmed"].includes(b.status) ? `
          <button class="btn btn-secondary" onclick="CleanRideCustomer.openRescheduleModal('${store.esc(b.id)}')">Request Reschedule</button>
          <button class="btn btn-danger" onclick="CleanRideCustomer.openCancelModal('${store.esc(b.id)}')">Cancel Booking</button>
        ` : ""}
      `
    );
  }

  function openRescheduleModal(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    openModal(
      "Request New Appointment Date",
      `Booking ${store.esc(b.id)} · Current date: ${store.fmtDate(b.date)}`,
      `
        <form id="customerRescheduleForm">
          <div class="form-grid">
            <div class="field">
              <label>Preferred New Date</label>
              <input class="input" type="date" id="reschedDate" min="${store.todayStr()}" required>
            </div>
            <div class="field">
              <label>Arrival Window</label>
              <select class="select" id="reschedTime">
                <option>09:00</option>
                <option>11:00</option>
                <option>13:00</option>
                <option>15:00</option>
              </select>
            </div>
          </div>
          <div class="notice" style="margin-top: 1rem;">
            Your current visit remains scheduled until the operations team confirms and approves your new date.
          </div>
        </form>
      `,
      `
        <button class="btn btn-quiet" onclick="CleanRideCustomer.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="CleanRideCustomer.submitReschedule('${store.esc(b.id)}')">Send Request</button>
      `
    );
  }

  function submitReschedule(bookingId) {
    const newDate = document.getElementById("reschedDate")?.value;
    const newTime = document.getElementById("reschedTime")?.value;
    if (!newDate) {
      showToast("Please choose a preferred date.");
      return;
    }

    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    b.rescheduleRequest = {
      date: newDate,
      time: newTime,
      requestedAt: new Date().toISOString()
    };

    store.saveStore(s);
    closeModal();
    renderAppointments();
    showToast("Reschedule request submitted to operations.");
  }

  function openCancelModal(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    openModal(
      "Cancel This Booking?",
      `${store.esc(b.id)} · ${store.fmtDate(b.date)}`,
      `
        <div class="notice">
          Cancelling will release your reserved appointment slot.
        </div>
        <p style="margin-top:1rem; font-weight:600;">Are you sure you want to cancel your ${store.esc(b.serviceLabel)} booking?</p>
      `,
      `
        <button class="btn btn-quiet" onclick="CleanRideCustomer.closeModal()">Keep Booking</button>
        <button class="btn btn-danger" onclick="CleanRideCustomer.confirmCancelBooking('${store.esc(b.id)}')">Yes, Cancel Booking</button>
      `
    );
  }

  function confirmCancelBooking(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (b) {
      b.status = "Cancelled";
      if (b.service === "rental") {
        const r = (s.rentals || []).find(x => x.bookingId === bookingId);
        if (r && r.status !== "Returned") r.status = "Rejected";
      }
      store.saveStore(s);
      closeModal();
      renderAppointments();
      renderOverview();
      showToast("Booking cancelled and slot released.");
    }
  }

  // =========================================================
  // 4. FEEDBACK & REPORTS VIEW
  // =========================================================
  function renderFeedback() {
    const s = store.getStore();
    const myBookings = getMyBookings();
    const myComplaints = (s.complaints || []).filter(c => c.userId === currentUser?.id || !c.userId);

    const select = document.getElementById("feedbackBookingSelect");
    if (select) {
      select.innerHTML = `<option value="">Choose an appointment</option>` +
        myBookings.map(b => `<option value="${store.esc(b.id)}">${store.esc(b.id)} · ${store.esc(b.serviceLabel)} (${store.fmtDate(b.date)})</option>`).join("");
    }

    const form = document.getElementById("customerFeedbackForm");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", handleFeedbackSubmit);
    }

    const feedBox = document.getElementById("feedbackFeedBox");
    if (!feedBox) return;

    if (!myComplaints.length) {
      feedBox.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">◇</div>
          <strong>No conversations yet</strong>
          <p>Feedback or quality inquiries submitted here will appear with manager replies.</p>
        </div>
      `;
      return;
    }

    feedBox.innerHTML = myComplaints.slice().reverse().map(c => `
      <div class="complaint-feed-card">
        <div class="complaint-card-top">
          <div>
            <div class="complaint-subject">${store.esc(c.subject)}</div>
            <div class="complaint-meta">${store.esc(c.id)} · ${store.fmtDate(c.date)} · ${store.esc(c.category)}</div>
          </div>
          ${store.badge(c.status)}
        </div>
        <div class="complaint-desc">${store.esc(c.description)}</div>
        ${c.response ? `
          <div class="reply-box">
            <strong>CleanRide Operations Replied:</strong>
            <p style="margin:4px 0 0;">${store.esc(c.response)}</p>
          </div>
        ` : `
          <div style="font-size:0.75rem; color:var(--status-pending); margin-top:6px;">
            Awaiting team response...
          </div>
        `}
      </div>
    `).join("");
  }

  function handleFeedbackSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;

    const bookingId = document.getElementById("feedbackBookingSelect")?.value;
    const category = document.getElementById("feedbackCategory")?.value;
    const subject = document.getElementById("feedbackSubject")?.value;
    const description = document.getElementById("feedbackDesc")?.value;
    const date = document.getElementById("feedbackDate")?.value || store.todayStr();

    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) {
      showToast("Please choose an appointment to attach feedback to.");
      return;
    }

    const newComplaint = {
      id: store.uniqueComplaintId(),
      bookingId: b.id,
      userId: currentUser?.id || "u-customer",
      name: currentUser?.name || b.name,
      category,
      subject: subject.trim(),
      description: description.trim(),
      date,
      status: "In review",
      response: "",
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(s.complaints)) s.complaints = [];
    s.complaints.push(newComplaint);
    store.saveStore(s);

    form.reset();
    renderFeedback();
    renderOverview();
    showToast("Feedback sent! Operations will follow up.");
  }

  // =========================================================
  // 5. MODAL & TOAST HELPERS
  // =========================================================
  function openModal(title, subtitle, bodyHtml, actionsHtml = "") {
    const modal = document.getElementById("modalBackdrop");
    const titleEl = document.getElementById("modalTitle");
    const subEl = document.getElementById("modalSubtitle");
    const bodyEl = document.getElementById("modalBody");
    const actionsEl = document.getElementById("modalActions");

    if (!modal) return;
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle || "";
    if (bodyEl) bodyEl.innerHTML = bodyHtml;
    if (actionsEl) actionsEl.innerHTML = actionsHtml;

    modal.classList.add("open");
  }

  function closeModal() {
    const modal = document.getElementById("modalBackdrop");
    if (modal) modal.classList.remove("open");
  }

  function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function openNewBooking(serviceId) {
    navigateTo("new-booking");
    if (serviceId) {
      const select = document.getElementById("bookingServiceSelect");
      if (select) {
        select.value = serviceId;
        const fields = document.getElementById("dynamicServiceFields");
        if (fields) fields.innerHTML = getServiceFieldsHTML(serviceId);
        updateLiveQuote();
      }
    }
  }

  // Public CleanRideCustomer API
  window.CleanRideCustomer = {
    navigateTo,
    openNewBooking,
    showBookingDetail,
    openRescheduleModal,
    submitReschedule,
    openCancelModal,
    confirmCancelBooking,
    confirmBooking,
    closeModal,
    showToast
  };

  document.addEventListener("DOMContentLoaded", initCustomerApp);
})();
