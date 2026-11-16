/**
 * CleanRide Management System - Owner Portal Controller
 * Modularized logic for operations dashboard, requests, jobs, rentals, complaints, revenue & settings
 */
(() => {
  "use strict";

  const store = window.CleanRideStore;
  const auth = window.CleanRideAuth;

  let currentUser = null;
  let activeTab = "owner-dashboard";
  let chartFilter = "6m";
  let dateRange = null;
  let revenueStatus = "all";

  function initOwnerApp() {
    currentUser = auth.getCurrentSession();
    if (!currentUser) {
      currentUser = {
        id: "u-owner",
        name: "Sufian (Owner)",
        email: "owner@cleanride.my",
        role: "owner"
      };
    }

    renderHeaderProfile();
    setupSidebarNavigation();

    // Render views
    renderDashboard();
    renderRequests();
    renderJobs();
    renderRentals();
    renderComplaints();
    renderRevenue();
    renderSettings();

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
      avatar.textContent = (currentUser.name || "HQ")
        .split(" ")
        .map(x => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    }
    if (name) name.textContent = currentUser.name;
    if (email) email.textContent = currentUser.email;

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

  function navigateTo(pageId) {
    activeTab = pageId;

    document.querySelectorAll(".sidebar-nav [data-page]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.page === pageId);
    });

    document.querySelectorAll(".view-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `view-${pageId}`);
    });

    if (pageId === "owner-dashboard") renderDashboard();
    if (pageId === "requests") renderRequests();
    if (pageId === "jobs") renderJobs();
    if (pageId === "rentals") renderRentals();
    if (pageId === "complaints") renderComplaints();
    if (pageId === "revenue") renderRevenue();
    if (pageId === "settings") renderSettings();
  }

  // =========================================================
  // 1. OPERATIONS DASHBOARD
  // =========================================================
  function renderDashboard() {
    const s = store.getStore();
    const all = s.bookings || [];
    const pending = all.filter(b => b.status === "Pending");
    const todayJobs = all.filter(
      b => b.date === store.todayStr() && !["Cancelled", "Rejected"].includes(b.status)
    );
    const paidThisMonth = (s.payments || [])
      .filter(p => p.date.slice(0, 7) === store.todayStr().slice(0, 7))
      .reduce((a, p) => a + Number(p.amount), 0);
    const openComplaints = (s.complaints || []).filter(c => c.status !== "Resolved").length;

    // Badges in sidebar
    const pendingNavBadge = document.getElementById("pendingNavBadge");
    if (pendingNavBadge) {
      pendingNavBadge.textContent = pending.length || "";
      pendingNavBadge.style.display = pending.length ? "inline-block" : "none";
    }

    // KPI stats
    const statPending = document.getElementById("statPendingRequests");
    const statToday = document.getElementById("statTodayJobs");
    const statCollected = document.getElementById("statCollectedMonth");
    const statOpenComp = document.getElementById("statOpenComplaints");
    if (statPending) statPending.textContent = pending.length;
    if (statToday) statToday.textContent = todayJobs.length;
    if (statCollected) statCollected.textContent = store.money(paidThisMonth);
    if (statOpenComp) statOpenComp.textContent = openComplaints;

    // Welcome title
    const welcomeTitle = document.getElementById("ownerWelcomeName");
    if (welcomeTitle) welcomeTitle.textContent = currentUser.name.split(" ")[0];

    // Today's run sheet
    const runSheetBody = document.getElementById("todayRunSheetBody");
    const runSheetSub = document.getElementById("todayRunSheetSub");
    if (runSheetSub) {
      runSheetSub.textContent = `${store.fmtDate(store.todayStr())} · ${todayJobs.length} scheduled job${todayJobs.length === 1 ? "" : "s"}`;
    }
    if (runSheetBody) {
      if (!todayJobs.length) {
        runSheetBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">No visits scheduled for today.</td></tr>`;
      } else {
        runSheetBody.innerHTML = todayJobs.map(b => `
          <tr>
            <td>
              <span class="primary-cell">${store.esc(b.name)}</span>
              <span class="sub-cell">${store.esc(b.id)}</span>
            </td>
            <td>${store.esc(b.serviceLabel)}</td>
            <td>${store.esc(b.time)}</td>
            <td>${store.esc(b.address)}</td>
            <td>${store.badge(b.status)}</td>
          </tr>
        `).join("");
      }
    }

    // Needs a look section
    const needsLookBox = document.getElementById("needsLookBox");
    if (needsLookBox) {
      const requestedRentals = (s.rentals || []).filter(r => r.status === "Requested").length;
      needsLookBox.innerHTML = `
        <div class="service-row">
          <div class="service-symbol">↘</div>
          <div style="flex:1">
            <div class="service-label">${pending.length} incoming booking request${pending.length === 1 ? "" : "s"}</div>
            <div class="service-meta">Review dates and approve availability</div>
          </div>
          <button class="btn btn-secondary btn-small" onclick="CleanRideOwner.navigateTo('requests')">Review</button>
        </div>
        <div class="service-row">
          <div class="service-symbol">◇</div>
          <div style="flex:1">
            <div class="service-label">${openComplaints} open customer inquiries</div>
            <div class="service-meta">Awaiting manager reply</div>
          </div>
          <button class="btn btn-secondary btn-small" onclick="CleanRideOwner.navigateTo('complaints')">Open Desk</button>
        </div>
        <div class="service-row">
          <div class="service-symbol">◈</div>
          <div style="flex:1">
            <div class="service-label">${requestedRentals} rental requests</div>
            <div class="service-meta">Check machine availability</div>
          </div>
          <button class="btn btn-secondary btn-small" onclick="CleanRideOwner.navigateTo('rentals')">View Rentals</button>
        </div>
      `;
    }

    // Latest requests table
    const latestBody = document.getElementById("latestRequestsTableBody");
    if (latestBody) {
      const recents = pending.slice(0, 5);
      if (!recents.length) {
        latestBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;">No pending requests waiting.</td></tr>`;
      } else {
        latestBody.innerHTML = recents.map(b => `
          <tr>
            <td>
              <span class="primary-cell">${store.esc(b.name)}</span>
              <span class="sub-cell">${store.esc(b.id)}</span>
            </td>
            <td>${store.esc(b.serviceLabel)}</td>
            <td>${store.fmtDate(b.date)}</td>
            <td>${store.esc(b.address)}</td>
            <td class="primary-cell">${store.money(b.total)}</td>
            <td>${store.badge(b.status)}</td>
          </tr>
        `).join("");
      }
    }
  }

  // =========================================================
  // 2. INCOMING REQUESTS
  // =========================================================
  function renderRequests() {
    const s = store.getStore();
    const list = (s.bookings || []).filter(b => b.status === "Pending");

    const qInput = document.getElementById("reqSearchInput");
    const serviceSelect = document.getElementById("reqServiceFilter");
    const dateInput = document.getElementById("reqDateFilter");

    const q = (qInput?.value || "").toLowerCase();
    const serv = serviceSelect?.value || "";
    const dt = dateInput?.value || "";

    const filtered = list.filter(b => {
      const matchQ = !q || `${b.id} ${b.name} ${b.address} ${b.serviceLabel}`.toLowerCase().includes(q);
      const matchServ = !serv || b.service === serv;
      const matchDt = !dt || b.date === dt;
      return matchQ && matchServ && matchDt;
    });

    const body = document.getElementById("requestsTableBody");
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;">No matching booking requests found.</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map(b => `
      <tr>
        <td>
          <span class="primary-cell">${store.esc(b.name)}</span>
          <span class="sub-cell">${store.esc(b.id)} · ${store.esc(b.phone)}</span>
        </td>
        <td>
          ${store.esc(b.serviceLabel)}
          <span class="sub-cell">${store.esc((b.items || []).map(i => i.label).join(", "))}</span>
        </td>
        <td>
          ${store.fmtDate(b.date)} · ${store.esc(b.time)}
          ${b.rescheduleRequest ? `<span class="sub-cell" style="color:var(--status-pending)">Reschedule: ${store.fmtDate(b.rescheduleRequest.date)}</span>` : ""}
        </td>
        <td>${store.esc(b.address)}</td>
        <td class="primary-cell">
          ${store.money(b.total)}
          <span class="sub-cell">Deposit: ${store.money(b.deposit)}</span>
        </td>
        <td>${store.badge(b.status)}</td>
        <td>
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button class="btn btn-primary btn-small" onclick="CleanRideOwner.approveBooking('${store.esc(b.id)}')">Approve</button>
            <button class="btn btn-secondary btn-small" onclick="CleanRideOwner.showBookingDetail('${store.esc(b.id)}')">Details</button>
            <button class="btn btn-danger btn-small" onclick="CleanRideOwner.rejectBooking('${store.esc(b.id)}')">Reject</button>
          </div>
        </td>
      </tr>
    `).join("");

    if (qInput && !qInput.dataset.bound) {
      qInput.dataset.bound = "true";
      qInput.addEventListener("input", renderRequests);
    }
    if (serviceSelect && !serviceSelect.dataset.bound) {
      serviceSelect.dataset.bound = "true";
      serviceSelect.addEventListener("change", renderRequests);
    }
    if (dateInput && !dateInput.dataset.bound) {
      dateInput.dataset.bound = "true";
      dateInput.addEventListener("change", renderRequests);
    }
  }

  function approveBooking(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    if (!store.capacityData(b.date).available) {
      showToast("No remaining capacity slots on that date. Increase capacity or reschedule.");
      return;
    }

    b.status = "Confirmed";
    store.saveStore();
    renderRequests();
    renderDashboard();
    renderJobs();
    showToast(`Appointment ${b.id} confirmed!`);
  }

  function rejectBooking(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    b.status = "Rejected";
    if (b.service === "rental") {
      const r = (s.rentals || []).find(x => x.bookingId === bookingId);
      if (r) r.status = "Rejected";
    }

    store.saveStore();
    renderRequests();
    renderDashboard();
    renderJobs();
    showToast(`Request ${b.id} declined and slot released.`);
  }

  // =========================================================
  // 3. JOB OPERATIONS BOARD
  // =========================================================
  function renderJobs() {
    const s = store.getStore();
    const all = (s.bookings || []).slice();

    const qInput = document.getElementById("jobsSearchInput");
    const stSelect = document.getElementById("jobsStatusFilter");
    const servSelect = document.getElementById("jobsServiceFilter");
    const sortSelect = document.getElementById("jobsSortFilter");

    const q = (qInput?.value || "").toLowerCase();
    const st = stSelect?.value || "";
    const serv = servSelect?.value || "";
    const sort = sortSelect?.value || "date-asc";

    let arr = all.filter(b => {
      const matchQ = !q || `${b.id} ${b.name} ${b.address}`.toLowerCase().includes(q);
      const matchSt = !st || b.status === st;
      const matchServ = !serv || b.service === serv;
      return matchQ && matchSt && matchServ;
    });

    arr.sort((a, b) => {
      if (sort === "date-desc") return b.date.localeCompare(a.date);
      if (sort === "amount-desc") return b.total - a.total;
      return a.date.localeCompare(b.date);
    });

    const body = document.getElementById("jobsTableBody");
    if (!body) return;

    if (!arr.length) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;">No jobs match criteria.</td></tr>`;
      return;
    }

    body.innerHTML = arr.map(b => `
      <tr>
        <td>
          <span class="primary-cell">${store.esc(b.name)}</span>
          <span class="sub-cell">${store.esc(b.id)}</span>
        </td>
        <td>${store.esc(b.serviceLabel)}</td>
        <td>
          ${store.fmtDate(b.date)}
          <span class="sub-cell">${store.esc(b.time)}</span>
        </td>
        <td>${store.esc(b.address)}</td>
        <td>
          <span class="primary-cell">${store.money(b.total)}</span>
          <span class="sub-cell">Due: ${store.money(b.balance)}</span>
        </td>
        <td>${store.badge(b.status)}</td>
        <td>${store.badge(b.paymentStatus)}</td>
        <td>
          <button class="btn btn-secondary btn-small" onclick="CleanRideOwner.openManageJobModal('${store.esc(b.id)}')">Manage</button>
        </td>
      </tr>
    `).join("");

    if (qInput && !qInput.dataset.bound) {
      qInput.dataset.bound = "true";
      qInput.addEventListener("input", renderJobs);
    }
    if (stSelect && !stSelect.dataset.bound) {
      stSelect.dataset.bound = "true";
      stSelect.addEventListener("change", renderJobs);
    }
    if (servSelect && !servSelect.dataset.bound) {
      servSelect.dataset.bound = "true";
      servSelect.addEventListener("change", renderJobs);
    }
    if (sortSelect && !sortSelect.dataset.bound) {
      sortSelect.dataset.bound = "true";
      sortSelect.addEventListener("change", renderJobs);
    }
  }

  function openManageJobModal(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    openModal(
      `Manage Job ${store.esc(b.id)}`,
      `${store.esc(b.name)} · ${store.esc(b.serviceLabel)}`,
      `
        ${b.rescheduleRequest ? `
          <div class="notice" style="margin-bottom:1rem;">
            Customer requested to reschedule to <strong>${store.fmtDate(b.rescheduleRequest.date)} (${store.esc(b.rescheduleRequest.time)})</strong>. Save with that date to approve.
          </div>
        ` : ""}
        <form id="manageJobModalForm">
          <div class="form-grid">
            <div class="field">
              <label>Appointment Date</label>
              <input class="input" type="date" id="manageDate" min="${store.todayStr()}" value="${b.rescheduleRequest?.date || b.date}" required>
            </div>
            <div class="field">
              <label>Arrival Window</label>
              <select class="select" id="manageTime">
                ${["09:00", "11:00", "13:00", "15:00"].map(t => `<option ${(b.rescheduleRequest?.time || b.time) === t ? "selected" : ""}>${t}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Job Workflow Status</label>
              <select class="select" id="manageStatus">
                ${["Pending", "Confirmed", "In Progress", "Completed", "Cancelled", "Rejected"].map(st => `<option ${b.status === st ? "selected" : ""}>${st}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Record Payment (RM)</label>
              <input class="input" type="number" id="managePaymentAmount" min="0" step="0.01" max="${b.balance}" placeholder="Up to ${store.money(b.balance)}">
            </div>
            <div class="field">
              <label>Payment Method</label>
              <select class="select" id="managePaymentMethod">
                <option>Cash</option>
                <option>Online transfer (simulated)</option>
                <option>Card (not collected)</option>
                <option>Other</option>
              </select>
            </div>
            <div class="field">
              <label>Payment Note</label>
              <input class="input" type="text" id="managePaymentNote" placeholder="e.g. Balance settlement">
            </div>
          </div>
        </form>
      `,
      `
        <button class="btn btn-quiet" onclick="CleanRideOwner.closeModal()">Close</button>
        <button class="btn btn-primary" onclick="CleanRideOwner.saveManageJob('${store.esc(b.id)}')">Save Changes</button>
      `
    );
  }

  function saveManageJob(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    const date = document.getElementById("manageDate")?.value;
    const time = document.getElementById("manageTime")?.value;
    const status = document.getElementById("manageStatus")?.value;
    const amount = Number(document.getElementById("managePaymentAmount")?.value || 0);
    const method = document.getElementById("managePaymentMethod")?.value || "Cash";
    const note = document.getElementById("managePaymentNote")?.value || "Payment recorded";

    if (date !== b.date && !store.capacityData(date).available) {
      showToast("Selected date has reached its capacity limit. Choose another date.");
      return;
    }

    if (amount > b.balance) {
      showToast("Payment cannot exceed the remaining balance.");
      return;
    }

    b.date = date;
    b.time = time;
    b.status = status;
    b.rescheduleRequest = null;

    if (b.service === "rental") {
      const r = (s.rentals || []).find(x => x.bookingId === b.id);
      if (r) r.start = date;
    }

    if (amount > 0) {
      b.paid = Number((b.paid + amount).toFixed(2));
      b.balance = Number((b.total - b.paid).toFixed(2));
      b.paymentStatus = b.balance <= 0 ? "Paid" : "Part-paid";
      s.payments.push({
        id: store.uniqueId("PAY"),
        bookingId: b.id,
        amount,
        date: store.todayStr(),
        method,
        note
      });
    }

    if (status === "Completed" && b.balance === 0) {
      b.paymentStatus = "Paid";
    }

    store.saveStore();
    closeModal();
    renderJobs();
    renderDashboard();
    renderRevenue();
    showToast("Job operations updated.");
  }

  // =========================================================
  // 4. TOOL RENTALS
  // =========================================================
  function renderRentals() {
    const s = store.getStore();
    const rows = s.rentals || [];

    const qInput = document.getElementById("rentalSearchInput");
    const stSelect = document.getElementById("rentalStatusFilter");

    const q = (qInput?.value || "").toLowerCase();
    const st = stSelect?.value || "";

    const filtered = rows.filter(r => {
      const matchQ = !q || `${r.name} ${store.equipmentNames[r.equipment]} ${r.id}`.toLowerCase().includes(q);
      const matchSt = !st || r.status === st;
      return matchQ && matchSt;
    });

    const body = document.getElementById("rentalsTableBody");
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2.5rem;">No equipment rental records found.</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map(r => `
      <tr>
        <td>
          <span class="primary-cell">${store.esc(r.id)}</span>
          <span class="sub-cell">${store.esc(r.name)}</span>
        </td>
        <td>${store.esc(store.equipmentNames[r.equipment] || r.equipment)}</td>
        <td>
          ${store.fmtDate(r.start)}
          <span class="sub-cell">${store.esc(r.hours)} hours hire</span>
        </td>
        <td class="primary-cell">${store.money(r.price)}</td>
        <td>${store.badge(r.status)}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-quiet btn-small" onclick="CleanRideOwner.showRentalDetail('${store.esc(r.id)}')">Details</button>
            ${r.status === "Requested" ? `
              <button class="btn btn-primary btn-small" onclick="CleanRideOwner.approveRental('${store.esc(r.id)}')">Approve</button>
            ` : ""}
            ${r.status === "Approved" ? `
              <button class="btn btn-secondary btn-small" onclick="CleanRideOwner.returnRental('${store.esc(r.id)}')">Returned</button>
            ` : ""}
          </div>
        </td>
      </tr>
    `).join("");

    if (qInput && !qInput.dataset.bound) {
      qInput.dataset.bound = "true";
      qInput.addEventListener("input", renderRentals);
    }
    if (stSelect && !stSelect.dataset.bound) {
      stSelect.dataset.bound = "true";
      stSelect.addEventListener("change", renderRentals);
    }
  }

  function approveRental(rentalId) {
    const s = store.getStore();
    const r = (s.rentals || []).find(x => x.id === rentalId);
    if (!r) return;

    if (s.rentals.some(x => x.id !== rentalId && x.equipment === r.equipment && x.start === r.start && ["Requested", "Approved"].includes(x.status))) {
      showToast("This kit is already booked for that date.");
      return;
    }

    r.status = "Approved";
    store.saveStore();
    renderRentals();
    showToast("Rental approved.");
  }

  function returnRental(rentalId) {
    const s = store.getStore();
    const r = (s.rentals || []).find(x => x.id === rentalId);
    if (r) {
      r.status = "Returned";
      store.saveStore();
      renderRentals();
      showToast("Equipment marked as returned.");
    }
  }

  function showRentalDetail(rentalId) {
    const s = store.getStore();
    const r = (s.rentals || []).find(x => x.id === rentalId);
    if (!r) return;

    openModal(
      `Rental ${store.esc(r.id)}`,
      `${store.fmtDate(r.start)} · ${store.esc(r.hours)} hours duration`,
      `
        <div class="service-row">
          <div style="flex:1">
            <div class="service-label">${store.esc(store.equipmentNames[r.equipment] || r.equipment)}</div>
            <div class="service-meta">Customer: ${store.esc(r.name)}</div>
            <div class="service-meta">Booking Reference: ${store.esc(r.bookingId)}</div>
          </div>
          ${store.badge(r.status)}
        </div>
        <div class="summary-line" style="margin-top:1rem;">
          <span>Rental Total Price</span><strong>${store.money(r.price)}</strong>
        </div>
      `,
      `<button class="btn btn-quiet" onclick="CleanRideOwner.closeModal()">Close</button>`
    );
  }

  // =========================================================
  // 5. COMPLAINT DESK
  // =========================================================
  function renderComplaints() {
    const s = store.getStore();
    const list = (s.complaints || []).slice();

    const qInput = document.getElementById("compSearchInput");
    const stSelect = document.getElementById("compStatusFilter");
    const catSelect = document.getElementById("compCategoryFilter");

    const q = (qInput?.value || "").toLowerCase();
    const st = stSelect?.value || "";
    const cat = catSelect?.value || "";

    const filtered = list.filter(c => {
      const matchQ = !q || `${c.name} ${c.subject} ${c.bookingId}`.toLowerCase().includes(q);
      const matchSt = !st || c.status === st;
      const matchCat = !cat || c.category === cat;
      return matchQ && matchSt && matchCat;
    });

    const box = document.getElementById("complaintsDeskListBox");
    if (!box) return;

    if (!filtered.length) {
      box.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <strong>No customer complaints</strong>
          <p>All inquiries and quality reports have been addressed.</p>
        </div>
      `;
      return;
    }

    box.innerHTML = filtered.reverse().map(c => `
      <section class="owner-complaint-card">
        <div class="owner-complaint-header">
          <div>
            <div class="owner-complaint-title">${store.esc(c.subject)}</div>
            <div class="owner-complaint-meta">
              ${store.esc(c.id)} · ${store.esc(c.name)} · Booking ${store.esc(c.bookingId)} · ${store.fmtDate(c.date)}
            </div>
          </div>
          ${store.badge(c.status)}
        </div>
        <div class="notice" style="margin-bottom:1rem;">
          <strong>${store.esc(c.category)}:</strong> ${store.esc(c.description)}
        </div>
        ${c.response ? `
          <div style="font-size:0.8rem; color:var(--muted); margin-bottom:0.75rem;">
            <strong>Saved Response:</strong> ${store.esc(c.response)}
          </div>
        ` : ""}
        <div class="field full">
          <label>Team Reply to Customer</label>
          <textarea class="textarea" id="replyText_${store.esc(c.id)}" placeholder="Write an informative, professional response...">${store.esc(c.response || "")}</textarea>
        </div>
        <div style="display:flex; gap:0.65rem; margin-top:0.85rem;">
          <button class="btn btn-secondary btn-small" onclick="CleanRideOwner.saveComplaintReply('${store.esc(c.id)}')">Save Response</button>
          <button class="btn btn-primary btn-small" onclick="CleanRideOwner.toggleComplaintResolved('${store.esc(c.id)}')">
            ${c.status === "Resolved" ? "Reopen Case" : "Mark Resolved"}
          </button>
        </div>
      </section>
    `).join("");

    if (qInput && !qInput.dataset.bound) {
      qInput.dataset.bound = "true";
      qInput.addEventListener("input", renderComplaints);
    }
    if (stSelect && !stSelect.dataset.bound) {
      stSelect.dataset.bound = "true";
      stSelect.addEventListener("change", renderComplaints);
    }
    if (catSelect && !catSelect.dataset.bound) {
      catSelect.dataset.bound = "true";
      catSelect.addEventListener("change", renderComplaints);
    }
  }

  function saveComplaintReply(complaintId) {
    const s = store.getStore();
    const c = (s.complaints || []).find(x => x.id === complaintId);
    const reply = document.getElementById(`replyText_${complaintId}`)?.value.trim();
    if (c) {
      c.response = reply || "";
      store.saveStore();
      renderComplaints();
      showToast("Response saved and visible to customer.");
    }
  }

  function toggleComplaintResolved(complaintId) {
    const s = store.getStore();
    const c = (s.complaints || []).find(x => x.id === complaintId);
    if (c) {
      c.status = c.status === "Resolved" ? "In review" : "Resolved";
      store.saveStore();
      renderComplaints();
      renderDashboard();
      showToast(c.status === "Resolved" ? "Inquiry marked resolved." : "Case reopened.");
    }
  }

  // =========================================================
  // 6. REVENUE & FINANCIAL REPORT
  // =========================================================
  function renderRevenue() {
    const s = store.getStore();
    const month = store.todayStr().slice(0, 7);
    const range = chartFilter === "month" ? month : null;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const startSix = sixMonthsAgo.toISOString().slice(0, 7);

    const inPeriod = d =>
      dateRange ? (d >= dateRange.from && d <= dateRange.to) : range ? d.slice(0, 7) === range : chartFilter === "all" || d.slice(0, 7) >= startSix;

    const bookingBy = id => (s.bookings || []).find(b => b.id === id);
    const matchesStatus = b => revenueStatus === "all" || b?.status === revenueStatus;

    const filtered = (s.payments || []).filter(
      p => inPeriod(p.date) && matchesStatus(bookingBy(p.bookingId))
    );

    const totalRev = filtered.reduce((acc, p) => acc + Number(p.amount), 0);
    const completedJobs = (s.bookings || []).filter(
      b => b.status === "Completed" && matchesStatus(b) && inPeriod(b.date)
    );
    const outstandingDue = (s.bookings || [])
      .filter(b => !["Cancelled", "Rejected"].includes(b.status) && matchesStatus(b) && inPeriod(b.date))
      .reduce((sum, b) => sum + Number(b.balance || 0), 0);
    const depositTotal = filtered
      .filter(p => /deposit/i.test(p.note || ""))
      .reduce((acc, p) => acc + Number(p.amount), 0);
    const settlementTotal = filtered
      .filter(p => !/deposit/i.test(p.note || ""))
      .reduce((acc, p) => acc + Number(p.amount), 0);

    // Update KPI metrics
    const revStat = document.getElementById("revRecordedAmount");
    const compStat = document.getElementById("revCompletedCount");
    const outStat = document.getElementById("revOutstandingDue");
    const depStat = document.getElementById("revDepositsRatio");
    if (revStat) revStat.textContent = store.money(totalRev);
    if (compStat) compStat.textContent = completedJobs.length;
    if (outStat) outStat.textContent = store.money(outstandingDue);
    if (depStat) depStat.textContent = `${store.money(depositTotal)} / ${store.money(settlementTotal)}`;

    // Draw SVG Chart
    const chartBox = document.getElementById("revenueChartBox");
    if (chartBox) {
      chartBox.innerHTML = renderChartSvg(range, s, matchesStatus, bookingBy);
    }

    // Transactions table
    const tableBody = document.getElementById("revenueLedgerTableBody");
    if (tableBody) {
      if (!filtered.length) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">No recorded payments in this period.</td></tr>`;
      } else {
        tableBody.innerHTML = filtered.slice().reverse().map(p => `
          <tr>
            <td>
              <span class="primary-cell">${store.esc(p.id)}</span>
              <span class="sub-cell">${store.esc(p.bookingId)}</span>
            </td>
            <td>${store.fmtDate(p.date)}</td>
            <td>${store.esc(p.method)}</td>
            <td>${store.esc(p.note || "Payment")}</td>
            <td class="primary-cell">${store.money(p.amount)}</td>
          </tr>
        `).join("");
      }
    }

    // Filter controls
    const rangeSelect = document.getElementById("revenueRangeFilter");
    const statusSelect = document.getElementById("revenueStatusFilter");
    if (rangeSelect && !rangeSelect.dataset.bound) {
      rangeSelect.dataset.bound = "true";
      rangeSelect.addEventListener("change", e => {
        chartFilter = e.target.value;
        dateRange = null;
        renderRevenue();
      });
    }
    if (statusSelect && !statusSelect.dataset.bound) {
      statusSelect.dataset.bound = "true";
      statusSelect.addEventListener("change", e => {
        revenueStatus = e.target.value;
        renderRevenue();
      });
    }

    const applyDateBtn = document.getElementById("applyRevenueDatesBtn");
    if (applyDateBtn && !applyDateBtn.dataset.bound) {
      applyDateBtn.dataset.bound = "true";
      applyDateBtn.addEventListener("click", () => {
        const from = document.getElementById("revDateFrom")?.value;
        const to = document.getElementById("revDateTo")?.value;
        if (from && to && from > to) {
          showToast("Start date must be before end date.");
          return;
        }
        dateRange = from && to ? { from, to } : null;
        renderRevenue();
      });
    }

    const exportBtn = document.getElementById("exportRevenueCsvBtn");
    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = "true";
      exportBtn.addEventListener("click", exportRevenueCsv);
    }
  }

  function renderChartSvg(monthOnly, s, matchesStatus, bookingBy) {
    const months = [];
    const now = new Date();
    const count = chartFilter === "all" ? 12 : 6;
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString("en-MY", { month: "short" })
      });
    }
    if (monthOnly) {
      months.splice(0, months.length, {
        key: new Date().toISOString().slice(0, 7),
        label: new Date().toLocaleDateString("en-MY", { month: "short" })
      });
    }

    const vals = months.map(m =>
      (s.payments || [])
        .filter(p => p.date.slice(0, 7) === m.key && matchesStatus(bookingBy(p.bookingId)))
        .reduce((sum, p) => sum + Number(p.amount), 0)
    );

    const max = Math.max(1, ...vals);
    const w = 760, h = 210, left = 45, right = 20, top = 20, bottom = 30;
    const innerW = w - left - right, innerH = h - top - bottom;

    const pts = vals.map((v, i) => [
      left + (months.length === 1 ? innerW / 2 : (i * innerW) / (months.length - 1)),
      top + innerH - (v / max) * innerH
    ]);

    const path = pts.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ");
    const area = `${path} L ${pts[pts.length - 1]?.[0] || left} ${top + innerH} L ${pts[0]?.[0] || left} ${top + innerH} Z`;

    return `
      <svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Monthly revenue breakdown">
        ${[0, 0.5, 1].map(t => `<line class="chart-grid" x1="${left}" x2="${w - right}" y1="${top + innerH * t}" y2="${top + innerH * t}"/>`).join("")}
        <path class="chart-area" d="${area}"/>
        <path class="chart-line" d="${path}"/>
        ${pts.map((p, i) => `
          <circle class="chart-dot" cx="${p[0]}" cy="${p[1]}" r="4"/>
          <text class="chart-label" x="${p[0]}" y="${h - 8}" text-anchor="middle">${months[i].label}</text>
        `).join("")}
        <text class="chart-label" x="2" y="${top + 4}">${Math.round(max).toLocaleString()}</text>
        <text class="chart-label" x="2" y="${top + innerH}">0</text>
      </svg>
    `;
  }

  function exportRevenueCsv() {
    const s = store.getStore();
    const rows = [
      ["Payment ID", "Booking ID", "Date", "Method", "Note", "Amount (RM)"],
      ...(s.payments || []).map(p => [p.id, p.bookingId, p.date, p.method, p.note, p.amount])
    ];
    const csv = rows
      .map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cleanride-revenue.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Downloaded cleanride-revenue.csv");
  }

  // =========================================================
  // 7. SETTINGS & PRICING CONTROLS
  // =========================================================
  function renderSettings() {
    const s = store.getStore();
    const p = s.pricing || store.defaultPricing;

    const capInput = document.getElementById("settingCapacity");
    if (capInput) capInput.value = s.capacity || 5;

    // Upholstery
    const upSofa = document.getElementById("up_sofa");
    const upMatt = document.getElementById("up_mattress");
    const upDining = document.getElementById("up_dining");
    const upCurt = document.getElementById("up_curtains");
    if (upSofa) upSofa.value = p.upholstery?.sofa || 120;
    if (upMatt) upMatt.value = p.upholstery?.mattress || 95;
    if (upDining) upDining.value = p.upholstery?.dining || 45;
    if (upCurt) upCurt.value = p.upholstery?.curtains || 75;

    // Carpet
    const carpRate = document.getElementById("carpet_rate");
    const dirtLight = document.getElementById("dirt_Light");
    const dirtMod = document.getElementById("dirt_Moderate");
    const dirtHvy = document.getElementById("dirt_Heavy");
    if (carpRate) carpRate.value = p.carpet?.rate || 45;
    if (dirtLight) dirtLight.value = p.carpet?.dirt?.Light ?? 0;
    if (dirtMod) dirtMod.value = p.carpet?.dirt?.Moderate ?? 25;
    if (dirtHvy) dirtHvy.value = p.carpet?.dirt?.Heavy ?? 55;

    // Vehicle
    const vehCar = document.getElementById("veh_car");
    const vehSuv = document.getElementById("veh_suv");
    const vehMpv = document.getElementById("veh_mpv");
    const vehVan = document.getElementById("veh_van");
    const vehSeat = document.getElementById("veh_seat");
    if (vehCar) vehCar.value = p.vehicle?.car || 150;
    if (vehSuv) vehSuv.value = p.vehicle?.suv || 190;
    if (vehMpv) vehMpv.value = p.vehicle?.mpv || 220;
    if (vehVan) vehVan.value = p.vehicle?.van || 270;
    if (vehSeat) vehSeat.value = p.vehicle?.seat || 12;

    // Rental
    const rentExt = document.getElementById("rent_extractor");
    const rentStm = document.getElementById("rent_steam");
    const rentDry = document.getElementById("rent_dryer");
    if (rentExt) rentExt.value = p.rental?.extractor || 85;
    if (rentStm) rentStm.value = p.rental?.steam || 65;
    if (rentDry) rentDry.value = p.rental?.dryer || 45;

    const form = document.getElementById("serviceSettingsForm");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", handleSettingsSubmit);
    }

    const resetBtn = document.getElementById("resetDemoDataBtn");
    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.dataset.bound = "true";
      resetBtn.addEventListener("click", openResetConfirmModal);
    }
  }

  function handleSettingsSubmit(e) {
    e.preventDefault();
    const s = store.getStore();

    s.capacity = Number(document.getElementById("settingCapacity")?.value || 5);

    if (!s.pricing) s.pricing = {};
    s.pricing.upholstery = {
      sofa: Number(document.getElementById("up_sofa")?.value || 120),
      mattress: Number(document.getElementById("up_mattress")?.value || 95),
      dining: Number(document.getElementById("up_dining")?.value || 45),
      curtains: Number(document.getElementById("up_curtains")?.value || 75)
    };

    s.pricing.carpet = {
      rate: Number(document.getElementById("carpet_rate")?.value || 45),
      dirt: {
        Light: Number(document.getElementById("dirt_Light")?.value || 0),
        Moderate: Number(document.getElementById("dirt_Moderate")?.value || 25),
        Heavy: Number(document.getElementById("dirt_Heavy")?.value || 55)
      }
    };

    s.pricing.vehicle = {
      car: Number(document.getElementById("veh_car")?.value || 150),
      suv: Number(document.getElementById("veh_suv")?.value || 190),
      mpv: Number(document.getElementById("veh_mpv")?.value || 220),
      van: Number(document.getElementById("veh_van")?.value || 270),
      seat: Number(document.getElementById("veh_seat")?.value || 12)
    };

    s.pricing.rental = {
      extractor: Number(document.getElementById("rent_extractor")?.value || 85),
      steam: Number(document.getElementById("rent_steam")?.value || 65),
      dryer: Number(document.getElementById("rent_dryer")?.value || 45)
    };

    store.saveStore();
    showToast("Pricing and appointment capacity saved.");
  }

  function openResetConfirmModal() {
    openModal(
      "Reset All Demo Data?",
      "Restore prototype to original seed records",
      `
        <div class="notice">
          All changes made in this browser (new bookings, payments, rental records, complaints, capacity adjustments) will be erased and reset to sample seed data.
        </div>
        <p style="margin-top:1rem; font-weight:600;">Are you sure you want to reset the CleanRide workspace?</p>
      `,
      `
        <button class="btn btn-quiet" onclick="CleanRideOwner.closeModal()">Keep My Data</button>
        <button class="btn btn-danger" onclick="CleanRideOwner.confirmResetDemo()">Reset Workspace</button>
      `
    );
  }

  function confirmResetDemo() {
    store.resetStore();
    closeModal();
    showToast("Demo database reset. Returning to sign in...");
    setTimeout(() => {
      auth.logoutUser("../login.html");
    }, 600);
  }

  function showBookingDetail(bookingId) {
    const s = store.getStore();
    const b = (s.bookings || []).find(x => x.id === bookingId);
    if (!b) return;

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
        <div class="service-row" style="margin-bottom:1rem;">
          <div style="flex:1">
            <div class="service-label">Service Details</div>
            <div class="service-meta">${store.esc((b.items || []).map(i => i.label).join(" · "))}</div>
            ${b.instructions ? `<div class="service-meta" style="margin-top:4px;">Note: ${store.esc(b.instructions)}</div>` : ""}
          </div>
        </div>
        <div class="summary-breakdown">
          <div class="summary-line"><span>Total Estimate</span><strong>${store.money(b.total)}</strong></div>
          <div class="summary-line"><span>Paid (${store.esc(b.paymentStatus)})</span><strong>${store.money(b.paid)}</strong></div>
          <div class="summary-line"><span>Due</span><strong>${store.money(b.balance)}</strong></div>
        </div>
      `,
      `
        <button class="btn btn-quiet" onclick="CleanRideOwner.closeModal()">Close</button>
        <button class="btn btn-primary" onclick="CleanRideOwner.openManageJobModal('${store.esc(b.id)}')">Manage Job</button>
      `
    );
  }

  // =========================================================
  // 8. MODAL & TOAST HELPERS
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

  // Public CleanRideOwner API
  window.CleanRideOwner = {
    navigateTo,
    approveBooking,
    rejectBooking,
    openManageJobModal,
    saveManageJob,
    showBookingDetail,
    approveRental,
    returnRental,
    showRentalDetail,
    saveComplaintReply,
    toggleComplaintResolved,
    confirmResetDemo,
    closeModal,
    showToast
  };

  document.addEventListener("DOMContentLoaded", initOwnerApp);
})();
