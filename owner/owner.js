/**
 * CleanRide — Owner Workspace Script
 * Handles operations overview, booking requests, job management, tool rentals,
 * complaint desk, revenue analytics & CSV export, and service settings.
 */
(() => {
    "use strict";

    const {
        KEY,
        load,
        getState,
        setState,
        user: getCurrentUser,
        bookings,
        bookingBy,
        todayStr,
        fmtDate,
        money,
        esc,
        badge,
        openModal,
        closeModal,
        toast,
        empty,
        head,
        stat,
        uniqueId,
        uniqueEquipmentId,
        capacityData,
        serviceNames,
        equipmentNames,
        requireAuth,
        logout
    } = window.CleanRide;

    const state = getState();

    // Redirect to login if no valid owner session
    if (!requireAuth("owner")) return;

    const user = getCurrentUser() || {};

    // DOM references
    const appShell = document.getElementById("app-shell");
    const viewContainer = document.getElementById("owner-view-container");
    const userDisplayName = document.getElementById("user-display-name");
    const userAvatar = document.getElementById("user-avatar");
    const topBreadcrumb = document.getElementById("top-breadcrumb");
    const topTitle = document.getElementById("top-title");
    const pendingRequestsCount = document.getElementById("pending-requests-count");

    // Page state
    let activePage = "owner-dashboard";
    let collapsed = false;
    let chartFilter = "6m";
    let dateRange = null;
    let revenueStatus = "all";

    // Header profile
    if (userDisplayName) userDisplayName.textContent = user.name || "Owner";
    if (userAvatar) {
        const initials = (user.name || "O").split(" ").map(w => w[0]).slice(0, 2).join("");
        userAvatar.textContent = initials;
    }

    const pageTitles = {
        "owner-dashboard": "Operations overview",
        "requests": "Incoming requests",
        "jobs": "Job operations",
        "equipment": "Equipment & item tracking",
        "rentals": "Tool rentals",
        "complaints": "Complaint desk",
        "revenue": "Revenue report",
        "settings": "Pricing & capacity"
    };

    function updateNavBadge() {
        if (!pendingRequestsCount) return;
        const pending = bookings().filter(b => b.status === "Pending").length;
        if (pending > 0) {
            pendingRequestsCount.textContent = pending;
            pendingRequestsCount.style.display = "inline-block";
        } else {
            pendingRequestsCount.style.display = "none";
        }
    }

    function bookingRows(rows, owner = true, showAction = true) {
        if (!rows.length) {
            return `<tr><td colspan="7">${empty("Nothing to show yet", "New jobs will appear here.")}</td></tr>`;
        }
        return rows.map(b => `
            <tr>
                <td><span class="primary-cell">${esc(b.id)}</span><span class="sub-cell">${esc(b.name)}</span></td>
                <td>${esc(b.serviceLabel || serviceNames[b.service] || b.service)}<span class="sub-cell">${esc((b.items || []).map(i => i.label).join(", "))}</span></td>
                <td>${fmtDate(b.date)}<span class="sub-cell">${esc(b.time || "")}</span></td>
                ${owner ? `<td>${esc(b.address)}</td>` : ""}
                <td class="primary-cell">${money(b.total)}</td>
                <td>${badge(b.status)}</td>
                <td>${showAction ? `<button type="button" class="text-link" data-action="booking-detail" data-id="${esc(b.id)}">Details</button>` : ""}</td>
            </tr>
        `).join("");
    }

    // --------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------

    function renderOwnerDashboard() {
        const all = bookings();
        const pending = all.filter(b => b.status === "Pending");
        const todayJobs = all.filter(b => b.date === todayStr() && !["Cancelled", "Rejected"].includes(b.status));
        const paidThisMonth = (state.payments || [])
            .filter(p => p.date.slice(0, 7) === todayStr().slice(0, 7))
            .reduce((a, p) => a + Number(p.amount), 0);
        const pendingComplaints = (state.complaints || []).filter(c => c.status !== "Resolved").length;
        const ownerFirstName = (user.name || "Owner").split(" ")[0];

        return `
            ${head("OWNER WORKSPACE", `Welcome back, ${esc(ownerFirstName)}.`, "Your daily operations at a glance.", `
                <button type="button" class="btn btn-secondary" data-page="settings">Capacity & pricing</button>
                <button type="button" class="btn btn-primary" data-page="requests">Review requests · ${pending.length}</button>
            `)}
            <div class="stats-grid">
                ${stat("Requests to review", pending.length, "Waiting for a decision", "↘")}
                ${stat("Jobs today", todayJobs.length, `${Math.max(0, state.capacity - todayJobs.length)} of ${state.capacity} slots available`, "▤")}
                ${stat("Collected this month", money(paidThisMonth), "Recorded deposits & payments", "RM")}
                ${stat("Open conversations", pendingComplaints, "Needs a team response", "◇")}
            </div>
            <div class="dashboard-grid">
                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">Today’s run sheet</div>
                            <div class="panel-sub">${fmtDate(todayStr())} · ${todayJobs.length} scheduled ${todayJobs.length === 1 ? "job" : "jobs"}</div>
                        </div>
                        <button type="button" class="text-link" data-page="jobs">Open job board →</button>
                    </div>
                    ${todayJobs.length ? `
                        <div class="table-wrap">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Customer / ref</th>
                                        <th>Service</th>
                                        <th>Time</th>
                                        <th>Address</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${todayJobs.map(b => `
                                        <tr>
                                            <td><span class="primary-cell">${esc(b.name)}</span><span class="sub-cell">${esc(b.id)}</span></td>
                                            <td>${esc(b.serviceLabel)}</td>
                                            <td>${esc(b.time)}</td>
                                            <td>${esc(b.address)}</td>
                                            <td>${badge(b.status)}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        </div>
                    ` : empty("A little breathing room", "No visits scheduled for today.")}
                </section>
                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">Needs a look</div>
                            <div class="panel-sub">New requests and open conversations</div>
                        </div>
                    </div>
                    <div class="service-list">
                        <div class="service-row">
                            <div class="service-symbol">↘</div>
                            <div>
                                <div class="service-label">${pending.length} incoming ${pending.length === 1 ? "request" : "requests"}</div>
                                <div class="service-meta">Review dates and confirm availability</div>
                            </div>
                            <button type="button" class="text-link" data-page="requests">Review</button>
                        </div>
                        <div class="service-row">
                            <div class="service-symbol">◇</div>
                            <div>
                                <div class="service-label">${pendingComplaints} open conversations</div>
                                <div class="service-meta">Customers are waiting for a response</div>
                            </div>
                            <button type="button" class="text-link" data-page="complaints">Open desk</button>
                        </div>
                        <div class="service-row">
                            <div class="service-symbol">◈</div>
                            <div>
                                <div class="service-label">${(state.rentals || []).filter(r => r.status === "Requested").length} rental requests</div>
                                <div class="service-meta">Check kit availability</div>
                            </div>
                            <button type="button" class="text-link" data-page="rentals">View rentals</button>
                        </div>
                        <div class="service-row">
                            <div class="service-symbol">🛠</div>
                            <div>
                                <div class="service-label">${(state.equipment || []).filter(e => e.status === "Maintenance").length} machines in maintenance</div>
                                <div class="service-meta">${(state.equipment || []).filter(e => e.status === "Available").length} units ready in store · ${(state.equipment || []).filter(e => e.status === "In Use").length} on jobs</div>
                            </div>
                            <button type="button" class="text-link" data-page="equipment">Track kit</button>
                        </div>
                    </div>
                </section>
            </div>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">Latest requests</div>
                        <div class="panel-sub">New bookings, newest first</div>
                    </div>
                    <button type="button" class="text-link" data-page="requests">All requests →</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Customer / reference</th>
                                <th>Service</th>
                                <th>Date</th>
                                <th>Address</th>
                                <th>Estimate</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${bookingRows(pending.slice(0, 5), true)}</tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderRequestsPage() {
        const list = bookings().filter(b => b.status === "Pending");
        return `
            ${head("INCOMING REQUESTS", "Booking requests", "Review and manage new requests.", `<button type="button" class="btn btn-secondary" data-page="jobs">View all jobs</button>`)}
            <div class="filters">
                <input class="input" data-filter="request-search" placeholder="Search customer, ref, service or area">
                <select class="select" data-filter="request-service">
                    <option value="">All services</option>
                    ${Object.entries(serviceNames).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
                </select>
                <input class="input" type="date" data-filter="request-date">
            </div>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">Waiting for review</div>
                        <div class="panel-sub">${list.length} requests · approval rechecks the daily capacity limit</div>
                    </div>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Customer / ref</th>
                                <th>Service & details</th>
                                <th>Date / time</th>
                                <th>Address</th>
                                <th>Estimate</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="requests-body">
                            ${list.length ? list.map(b => `
                                <tr data-bookrow="${esc(b.id)}">
                                    <td><span class="primary-cell">${esc(b.name)}</span><span class="sub-cell">${esc(b.id)} · ${esc(b.phone)}</span></td>
                                    <td>${esc(b.serviceLabel)}<span class="sub-cell">${esc((b.items || []).map(i => i.label).join(", "))}</span></td>
                                    <td>${fmtDate(b.date)}<span class="sub-cell">${esc(b.time)}</span>${b.rescheduleRequest ? `<span class="sub-cell">Change requested: ${fmtDate(b.rescheduleRequest.date)} · ${esc(b.rescheduleRequest.time)}</span>` : ""}</td>
                                    <td>${esc(b.address)}</td>
                                    <td>${money(b.total)}<span class="sub-cell">Deposit ${money(b.deposit)}</span></td>
                                    <td>${badge(b.status)}</td>
                                    <td>
                                        <button type="button" class="btn btn-primary btn-small" data-action="approve-booking" data-id="${esc(b.id)}">Approve</button>
                                        <button type="button" class="btn btn-quiet btn-small" data-action="booking-detail" data-id="${esc(b.id)}">Details</button>
                                        <button type="button" class="btn btn-danger btn-small" data-action="reject-booking" data-id="${esc(b.id)}">Reject</button>
                                    </td>
                                </tr>
                            `).join("") : `<tr><td colspan="7">${empty("All caught up", "New customer booking requests will land here.")}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderJobsPage() {
        const all = bookings().slice().sort((a, b) => b.date.localeCompare(a.date));
        return `
            ${head("JOB OPERATIONS", "Job operations", "View jobs, update status and record payments.")}
            <div class="filters">
                <input class="input" data-filter="jobs-search" placeholder="Search name, ref or address">
                <select class="select" data-filter="jobs-status">
                    <option value="">All statuses</option>
                    ${["Pending", "Confirmed", "In Progress", "Completed", "Cancelled", "Rejected"].map(s => `<option>${s}</option>`).join("")}
                </select>
                <select class="select" data-filter="jobs-service">
                    <option value="">All services</option>
                    ${Object.entries(serviceNames).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
                </select>
                <select class="select" data-filter="jobs-sort">
                    <option value="date-asc">Appointment date ↑</option>
                    <option value="date-desc">Appointment date ↓</option>
                    <option value="amount-desc">Highest value</option>
                </select>
            </div>
            <section class="panel">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Customer / ref</th>
                                <th>Service</th>
                                <th>Appointment</th>
                                <th>Address</th>
                                <th>Price / balance</th>
                                <th>Booking</th>
                                <th>Payment</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="jobs-body">
                            ${all.length ? all.map(b => `
                                <tr data-bookrow="${esc(b.id)}">
                                    <td><span class="primary-cell">${esc(b.name)}</span><span class="sub-cell">${esc(b.id)}</span></td>
                                    <td>${esc(b.serviceLabel)}</td>
                                    <td>${fmtDate(b.date)}<span class="sub-cell">${esc(b.time)}</span></td>
                                    <td>${esc(b.address)}</td>
                                    <td>${money(b.total)}<span class="sub-cell">Due ${money(b.balance)}</span></td>
                                    <td>${badge(b.status)}</td>
                                    <td>${badge(b.paymentStatus)}</td>
                                    <td><button type="button" class="text-link" data-action="booking-manage" data-id="${esc(b.id)}">Manage</button></td>
                                </tr>
                            `).join("") : empty("No jobs yet", "New jobs will appear here.")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function equipmentConditionBadge(cond) {
        const cls = String(cond || "").toLowerCase().replace(/\s+/g, "-");
        return `<span class="condition-pill condition-${esc(cls)}">${esc(cond || "Good")}</span>`;
    }

    function renderEquipmentRow(eq) {
        return `
            <tr data-eqrow="${esc(eq.id)}">
                <td>
                    <span class="primary-cell">${esc(eq.id)}</span>
                    <span class="sub-cell">${esc(eq.serial || "No S/N")}</span>
                </td>
                <td>
                    <div style="font-weight:700">${esc(eq.name)}</div>
                    <span class="sub-cell">${esc(eq.category || "General")} ${eq.notes ? `· ${esc(eq.notes)}` : ""}</span>
                </td>
                <td>
                    <span>${esc(eq.location || "HQ Store")}</span>
                    ${eq.lastService ? `<span class="sub-cell">Serviced: ${fmtDate(eq.lastService)}</span>` : ""}
                </td>
                <td>${equipmentConditionBadge(eq.condition)}</td>
                <td class="primary-cell">${eq.hourlyRate ? `${money(eq.hourlyRate)} / hr` : "Included"}</td>
                <td>${badge(eq.status)}</td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="btn btn-quiet btn-small" data-action="equipment-edit" data-id="${esc(eq.id)}">Edit</button>
                        <button type="button" class="btn btn-secondary btn-small" data-action="equipment-toggle-status" data-id="${esc(eq.id)}">${eq.status === "Maintenance" ? "Mark Ready" : eq.status === "Available" ? "Mark In Use" : "Maintenance"}</button>
                        <button type="button" class="btn btn-danger btn-small" data-action="equipment-delete" data-id="${esc(eq.id)}" aria-label="Remove item">Remove</button>
                    </div>
                </td>
            </tr>
        `;
    }

    function renderEquipmentPage() {
        const list = state.equipment || [];
        const availableCount = list.filter(e => e.status === "Available").length;
        const inUseCount = list.filter(e => e.status === "In Use").length;
        const maintCount = list.filter(e => e.status === "Maintenance").length;
        const categories = [...new Set(list.map(e => e.category).filter(Boolean))];

        return `
            ${head("CLEANING GEAR & ASSETS", "Equipment & item tracking", "Track machines, vacuums, sprayers and rental kit in real time.", `
                <button type="button" class="btn btn-primary" data-action="equipment-add">＋ Add new equipment</button>
            `)}
            <div class="stats-grid">
                ${stat("Tracked equipment", list.length, "Total machines & tools", "🛠")}
                ${stat("Ready in store / vans", availableCount, "Available for dispatch", "✓")}
                ${stat("In active use", inUseCount, "On customer sites & jobs", "◈")}
                ${stat("In maintenance", maintCount, "Undergoing repair / check", "⚙")}
            </div>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">Equipment inventory register</div>
                        <div class="panel-sub">${list.length} tracked items · monitor condition, locations, and dispatch status</div>
                    </div>
                </div>
                <div class="filters">
                    <input class="input" data-filter="equipment-search" placeholder="Search name, ID, serial or location">
                    <select class="select" data-filter="equipment-category">
                        <option value="">All categories</option>
                        ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
                    </select>
                    <select class="select" data-filter="equipment-status">
                        <option value="">All statuses</option>
                        <option value="Available">Available</option>
                        <option value="In Use">In Use</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Retired">Retired</option>
                    </select>
                    <select class="select" data-filter="equipment-condition">
                        <option value="">All conditions</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Needs Service">Needs Service</option>
                        <option value="Damaged">Damaged</option>
                    </select>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Tag / Serial</th>
                                <th>Equipment item & category</th>
                                <th>Location / Last service</th>
                                <th>Condition</th>
                                <th>Hire rate</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="equipment-body">
                            ${list.length ? list.map(renderEquipmentRow).join("") : `<tr><td colspan="7">${empty("No equipment tracked yet", "Click 'Add new equipment' above to start tracking tools.")}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderRentalsPage() {
        const rows = state.rentals || [];
        return `
            ${head("TOOL RENTALS", "Equipment rentals", "Manage rental requests and returns.", `<button type="button" class="btn btn-secondary" data-page="settings">Rental rates</button>`)}
            <div class="stats-grid">
                ${stat("Awaiting approval", rows.filter(r => r.status === "Requested").length, "Review dates and stock", "↘")}
                ${stat("Out with customers", rows.filter(r => r.status === "Approved").length, "Return check still needed", "◈")}
                ${stat("Returned", rows.filter(r => r.status === "Returned").length, "Kit back in the store", "✓")}
                ${stat("Equipment types", Object.keys(equipmentNames).length, "Available for hire", "R")}
            </div>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">Rental register</div>
                        <div class="panel-sub">Dates, kit and customer at a glance</div>
                    </div>
                    <div class="filters" style="margin:0">
                        <input class="input" data-filter="rental-search" placeholder="Search equipment or customer">
                        <select class="select" data-filter="rental-status">
                            <option value="">All statuses</option>
                            <option>Requested</option>
                            <option>Approved</option>
                            <option>Rejected</option>
                            <option>Returned</option>
                        </select>
                    </div>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Reference / customer</th>
                                <th>Equipment</th>
                                <th>Rental period</th>
                                <th>Price</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="rentals-body">
                            ${rows.length ? rows.map(r => `
                                <tr data-rentalrow="${esc(r.id)}">
                                    <td><span class="primary-cell">${esc(r.id)}</span><span class="sub-cell">${esc(r.name)}</span></td>
                                    <td>${esc(equipmentNames[r.equipment] || r.equipment)}</td>
                                    <td>${fmtDate(r.start)}<span class="sub-cell">${esc(r.hours)} hours</span></td>
                                    <td>${money(r.price)}</td>
                                    <td>${badge(r.status)}</td>
                                    <td>
                                        <button type="button" class="btn btn-quiet btn-small" data-action="rental-detail" data-id="${esc(r.id)}">Details</button>
                                        ${r.status === "Requested" ? `<button type="button" class="btn btn-primary btn-small" data-action="rental-approve" data-id="${esc(r.id)}">Approve</button>` : ""}
                                        ${r.status === "Approved" ? `<button type="button" class="btn btn-secondary btn-small" data-action="rental-return" data-id="${esc(r.id)}">Returned</button>` : ""}
                                    </td>
                                </tr>
                            `).join("") : `<tr><td colspan="6">${empty("No equipment requests", "New rental requests will appear here.")}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderComplaintsPage() {
        const rows = state.complaints || [];
        return `
            ${head("COMPLAINT DESK", "Customer complaints", "Review complaints and reply to customers.")}
            <div class="filters">
                <input class="input" data-filter="complaint-search" placeholder="Search subject, customer or reference">
                <select class="select" data-filter="complaint-status">
                    <option value="">All statuses</option>
                    <option>In review</option>
                    <option>Resolved</option>
                </select>
                <select class="select" data-filter="complaint-category">
                    <option value="">All categories</option>
                    <option>Service quality</option>
                    <option>Appointment timing</option>
                    <option>Billing question</option>
                    <option>Equipment rental</option>
                    <option>Other</option>
                </select>
            </div>
            <div id="complaint-list">
                ${rows.length ? rows.slice().reverse().map(c => `
                    <section class="panel complaint-card" data-complaint="${esc(c.id)}">
                        <div class="panel-head">
                            <div>
                                <div class="panel-title">${esc(c.subject)}</div>
                                <div class="panel-sub">${esc(c.id)} · ${esc(c.name)} · Booking ${esc(c.bookingId)} · ${fmtDate(c.date)}</div>
                            </div>
                            ${badge(c.status)}
                        </div>
                        <div class="notice"><strong>${esc(c.category)}:</strong> ${esc(c.description)}</div>
                        ${c.response ? `<div style="font-size:11px;color:#527184;margin-bottom:12px"><strong>Current response:</strong> ${esc(c.response)}</div>` : ""}
                        <div class="form-grid">
                            <div class="field full">
                                <label>Team response</label>
                                <textarea class="textarea" data-response="${esc(c.id)}" placeholder="Write a clear, helpful reply">${esc(c.response || "")}</textarea>
                            </div>
                        </div>
                        <div class="actions" style="margin-top:11px">
                            <button type="button" class="btn btn-secondary btn-small" data-action="complaint-save" data-id="${esc(c.id)}">Save response</button>
                            <button type="button" class="btn btn-primary btn-small" data-action="complaint-resolve" data-id="${esc(c.id)}">${c.status === "Resolved" ? "Reopen case" : "Mark resolved"}</button>
                        </div>
                    </section>
                `).join("") : empty("No customer conversations", "Customer feedback will appear here.")}
            </div>
        `;
    }

    function chartSvg(monthOnly) {
        const months = [];
        const now = new Date();
        const count = chartFilter === "all" ? 12 : 6;
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en", { month: "short" }) });
        }
        if (monthOnly) {
            months.splice(0, months.length, { key: new Date().toISOString().slice(0, 7), label: new Date().toLocaleDateString("en", { month: "short" }) });
        }
        const vals = months.map(m =>
            (state.payments || []).filter(p =>
                p.date.slice(0, 7) === m.key &&
                (revenueStatus === "all" || bookingBy(p.bookingId)?.status === revenueStatus)
            ).reduce((s, p) => s + Number(p.amount), 0)
        );

        const max = Math.max(1, ...vals);
        const w = 760, h = 210, left = 42, right = 15, top = 16, bottom = 30;
        const innerW = w - left - right, innerH = h - top - bottom;
        const pts = vals.map((v, i) => [
            left + (months.length === 1 ? innerW / 2 : (i * innerW) / (months.length - 1)),
            top + innerH - (v / max) * innerH
        ]);
        const path = pts.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ");
        const area = `${path} L ${pts[pts.length - 1]?.[0] || left} ${top + innerH} L ${pts[0]?.[0] || left} ${top + innerH} Z`;

        return `
            <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Monthly recorded revenue chart">
                <defs>
                    <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="#5ab7bb" stop-opacity=".32"/>
                        <stop offset="100%" stop-color="#5ab7bb" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                ${[0, 0.5, 1].map(t => `<line class="chart-grid" x1="${left}" x2="${w - right}" y1="${top + innerH * t}" y2="${top + innerH * t}"/>`).join("")}
                <path class="chart-area" d="${area}"/>
                <path class="chart-line" d="${path}"/>
                ${pts.map((p, i) => `<circle class="chart-dot" cx="${p[0]}" cy="${p[1]}" r="4"/><text class="chart-label" x="${p[0]}" y="${h - 6}" text-anchor="middle">${months[i].label}</text>`).join("")}
                <text class="chart-label" x="0" y="${top + 4}">${Math.round(max).toLocaleString()}</text>
                <text class="chart-label" x="0" y="${top + innerH}">0</text>
            </svg>
        `;
    }

    function renderRevenuePage() {
        const month = new Date().toISOString().slice(0, 7);
        const range = chartFilter === "month" ? month : null;
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        const startSix = sixMonthsAgo.toISOString().slice(0, 7);

        const inPeriod = d => dateRange
            ? (d >= dateRange.from && d <= dateRange.to)
            : range
                ? d.slice(0, 7) === range
                : chartFilter === "all" || d.slice(0, 7) >= startSix;

        const matchesStatus = b => revenueStatus === "all" || b?.status === revenueStatus;
        const filtered = (state.payments || []).filter(p => inPeriod(p.date) && matchesStatus(bookingBy(p.bookingId)));
        const revenue = filtered.reduce((s, p) => s + Number(p.amount), 0);
        const completed = bookings().filter(b => b.status === "Completed" && matchesStatus(b) && inPeriod(b.date));
        const due = bookings().filter(b => !["Cancelled", "Rejected"].includes(b.status) && matchesStatus(b) && inPeriod(b.date)).reduce((s, b) => s + Number(b.balance || 0), 0);
        const deposit = filtered.filter(p => /deposit/i.test(p.note || "")).reduce((s, p) => s + Number(p.amount), 0);
        const full = filtered.filter(p => !/deposit/i.test(p.note || "")).reduce((s, p) => s + Number(p.amount), 0);

        return `
            ${head("BUSINESS PERFORMANCE", "Revenue report", "View recorded payments and outstanding balances.", `<button type="button" class="btn btn-quiet" data-action="export-csv">Export CSV</button>`)}
            <div class="filters">
                <select class="select" data-filter="revenue-range">
                    <option value="6m" ${chartFilter === "6m" ? "selected" : ""}>Last 6 months</option>
                    <option value="month" ${chartFilter === "month" ? "selected" : ""}>This month</option>
                    <option value="all" ${chartFilter === "all" ? "selected" : ""}>All time</option>
                </select>
                <select class="select" data-filter="revenue-status">
                    <option value="all">All booking statuses</option>
                    ${["Pending", "Confirmed", "In Progress", "Completed", "Cancelled", "Rejected"].map(s => `<option ${revenueStatus === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
                <input class="input" type="date" data-filter="revenue-from" value="${esc(dateRange?.from || "")}">
                <input class="input" type="date" data-filter="revenue-to" value="${esc(dateRange?.to || "")}">
                <button type="button" class="btn btn-secondary btn-small" data-action="apply-date-range">Apply dates</button>
            </div>
            <div class="stats-grid">
                ${stat("Recorded revenue", money(revenue), "Deposits and payments received", "RM")}
                ${stat("Completed jobs", completed.length, "Marked complete by the team", "✓")}
                ${stat("Outstanding balances", money(due), "Active jobs only", "↗")}
                ${stat("Deposits / remaining", `${money(deposit)} / ${money(full)}`, "Recorded deposit / other payment", "▤")}
            </div>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">Collected revenue</div>
                        <div class="panel-sub">Monthly recorded payments · RM</div>
                    </div>
                    <span class="role-chip">Local records only</span>
                </div>
                <div class="chart-wrap" id="revenue-chart">${chartSvg(range)}</div>
            </section>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">Payment ledger</div>
                        <div class="panel-sub">${filtered.length} recorded transactions</div>
                    </div>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Payment / booking</th>
                                <th>Date</th>
                                <th>Method</th>
                                <th>Note</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length ? filtered.slice().reverse().map(p => `
                                <tr>
                                    <td class="primary-cell">${esc(p.id)}<span class="sub-cell">${esc(p.bookingId)}</span></td>
                                    <td>${fmtDate(p.date)}</td>
                                    <td>${esc(p.method)}</td>
                                    <td>${esc(p.note || "Payment")}</td>
                                    <td class="primary-cell">${money(p.amount)}</td>
                                </tr>
                            `).join("") : `<tr><td colspan="5">${empty("No payments in this range", "Recorded payments will appear here.")}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderSettingsPage() {
        const p = state.pricing;
        return `
            ${head("SERVICE CONTROLS", "Pricing & capacity", "Update service prices and daily booking limits.", `<button type="button" class="btn btn-danger" data-action="reset-data">Clear all data</button>`)}
            <form id="settings-form" novalidate>
                <div class="settings-grid">
                    <section class="panel setting-card">
                        <h3>Daily appointment capacity</h3>
                        <p>Includes all active bookings on a date. Cancelled and rejected jobs free a slot.</p>
                        <div class="field">
                            <label>Maximum jobs per day</label>
                            <input class="input" type="number" name="capacity" min="1" max="40" value="${esc(state.capacity)}" required>
                        </div>
                    </section>
                    <section class="panel setting-card">
                        <h3>Upholstery cleaning · RM / item</h3>
                        <p>Base price before any soil-level adjustment.</p>
                        <div class="form-grid">
                            ${Object.entries(p.upholstery).map(([k, v]) => `
                                <div class="field">
                                    <label>${k[0].toUpperCase() + k.slice(1)}</label>
                                    <input class="input" type="number" min="1" step=".5" name="up_${k}" value="${v}" required>
                                </div>
                            `).join("")}
                        </div>
                    </section>
                    <section class="panel setting-card">
                        <h3>Carpet service</h3>
                        <p>Rate per square metre and one-time dirtiness adjustment.</p>
                        <div class="form-grid">
                            <div class="field">
                                <label>Rate per m²</label>
                                <input class="input" type="number" min=".1" step=".1" name="carpet_rate" value="${p.carpet.rate}">
                            </div>
                            ${Object.entries(p.carpet.dirt).map(([k, v]) => `
                                <div class="field">
                                    <label>${k} surcharge · RM</label>
                                    <input class="input" type="number" min="0" step="1" name="dirt_${k}" value="${v}">
                                </div>
                            `).join("")}
                        </div>
                    </section>
                    <section class="panel setting-card">
                        <h3>Vehicle interior · RM / vehicle</h3>
                        <p>Additional seat price applies after the standard five seats.</p>
                        <div class="form-grid">
                            ${Object.entries(p.vehicle).map(([k, v]) => `
                                <div class="field">
                                    <label>${k === "seat" ? "Additional seat" : k.toUpperCase()}</label>
                                    <input class="input" type="number" min="1" step="1" name="veh_${k}" value="${v}">
                                </div>
                            `).join("")}
                        </div>
                    </section>
                    <section class="panel setting-card">
                        <h3>Equipment rental · RM / hour</h3>
                        <p>Set the hourly hire price for each item of kit.</p>
                        <div class="form-grid">
                            ${Object.entries(p.rental).map(([k, v]) => `
                                <div class="field">
                                    <label>${esc(equipmentNames[k])}</label>
                                    <input class="input" type="number" min="1" step="1" name="rent_${k}" value="${v}">
                                </div>
                            `).join("")}
                        </div>
                    </section>
                </div>
                <div class="actions" style="margin-top:18px">
                    <button type="submit" class="btn btn-primary">Save service settings</button>
                </div>
            </form>
        `;
    }

    // --------------------------------------------------------------------------
    // Navigation & Rendering
    // --------------------------------------------------------------------------

    function renderView(pageId) {
        activePage = pageId;
        const title = pageTitles[pageId] || "Operations overview";
        if (topBreadcrumb) topBreadcrumb.textContent = `CleanRide / ${title}`;
        if (topTitle) topTitle.textContent = title;

        document.querySelectorAll(".sidebar .nav-item").forEach(item => {
            item.classList.toggle("active", item.dataset.page === pageId);
        });

        updateNavBadge();

        if (pageId === "owner-dashboard") {
            viewContainer.innerHTML = renderOwnerDashboard();
        } else if (pageId === "requests") {
            viewContainer.innerHTML = renderRequestsPage();
        } else if (pageId === "jobs") {
            viewContainer.innerHTML = renderJobsPage();
        } else if (pageId === "equipment") {
            viewContainer.innerHTML = renderEquipmentPage();
        } else if (pageId === "rentals") {
            viewContainer.innerHTML = renderRentalsPage();
        } else if (pageId === "complaints") {
            viewContainer.innerHTML = renderComplaintsPage();
        } else if (pageId === "revenue") {
            viewContainer.innerHTML = renderRevenuePage();
        } else if (pageId === "settings") {
            viewContainer.innerHTML = renderSettingsPage();
        }
    }

    // --------------------------------------------------------------------------
    // Filtering
    // --------------------------------------------------------------------------

    function filterTables() {
        // Jobs filter
        const jq = (document.querySelector('[data-filter="jobs-search"]')?.value || "").toLowerCase();
        const jStatus = document.querySelector('[data-filter="jobs-status"]')?.value || "";
        const jService = document.querySelector('[data-filter="jobs-service"]')?.value || "";
        const jSort = document.querySelector('[data-filter="jobs-sort"]')?.value || "date-asc";
        const jobsBody = document.getElementById("jobs-body");

        if (jobsBody) {
            let arr = bookings().filter(b =>
                (!jq || `${b.id} ${b.name} ${b.address}`.toLowerCase().includes(jq)) &&
                (!jStatus || b.status === jStatus) &&
                (!jService || b.service === jService)
            );
            arr.sort((a, b) =>
                jSort === "date-desc"
                    ? b.date.localeCompare(a.date)
                    : jSort === "amount-desc"
                        ? b.total - a.total
                        : a.date.localeCompare(b.date)
            );
            jobsBody.innerHTML = arr.length
                ? arr.map(b => `
                    <tr>
                        <td><span class="primary-cell">${esc(b.name)}</span><span class="sub-cell">${esc(b.id)}</span></td>
                        <td>${esc(b.serviceLabel)}</td>
                        <td>${fmtDate(b.date)}<span class="sub-cell">${esc(b.time)}</span></td>
                        <td>${esc(b.address)}</td>
                        <td>${money(b.total)}<span class="sub-cell">Due ${money(b.balance)}</span></td>
                        <td>${badge(b.status)}</td>
                        <td>${badge(b.paymentStatus)}</td>
                        <td><button type="button" class="text-link" data-action="booking-manage" data-id="${esc(b.id)}">Manage</button></td>
                    </tr>
                `).join("")
                : `<tr><td colspan="8">${empty("No matching jobs", "Try changing your search or filters.")}</td></tr>`;
        }

        // Requests filter
        const rq = (document.querySelector('[data-filter="request-search"]')?.value || "").toLowerCase();
        const rs = document.querySelector('[data-filter="request-service"]')?.value || "";
        const rd = document.querySelector('[data-filter="request-date"]')?.value || "";
        const requestsBody = document.getElementById("requests-body");

        if (requestsBody) {
            let arr = bookings().filter(b =>
                b.status === "Pending" &&
                (!rq || `${b.id} ${b.name} ${b.address} ${b.serviceLabel}`.toLowerCase().includes(rq)) &&
                (!rs || b.service === rs) &&
                (!rd || b.date === rd)
            );
            requestsBody.innerHTML = arr.length
                ? arr.map(b => `
                    <tr>
                        <td><span class="primary-cell">${esc(b.name)}</span><span class="sub-cell">${esc(b.id)} · ${esc(b.phone)}</span></td>
                        <td>${esc(b.serviceLabel)}</td>
                        <td>${fmtDate(b.date)} · ${esc(b.time)}</td>
                        <td>${esc(b.address)}</td>
                        <td>${money(b.total)}</td>
                        <td>${badge(b.status)}</td>
                        <td>
                            <button type="button" class="btn btn-primary btn-small" data-action="approve-booking" data-id="${esc(b.id)}">Approve</button>
                            <button type="button" class="btn btn-quiet btn-small" data-action="booking-detail" data-id="${esc(b.id)}">Details</button>
                            <button type="button" class="btn btn-danger btn-small" data-action="reject-booking" data-id="${esc(b.id)}">Reject</button>
                        </td>
                    </tr>
                `).join("")
                : `<tr><td colspan="7">${empty("No matching requests", "Try a different search or filter.")}</td></tr>`;
        }

        // Rentals filter
        const rsearch = (document.querySelector('[data-filter="rental-search"]')?.value || "").toLowerCase();
        const rstatus = document.querySelector('[data-filter="rental-status"]')?.value || "";
        document.querySelectorAll("[data-rentalrow]").forEach(tr => {
            const r = (state.rentals || []).find(x => x.id === tr.dataset.rentalrow);
            tr.hidden = !!r && (
                !`${r.name} ${equipmentNames[r.equipment]} ${r.id}`.toLowerCase().includes(rsearch) ||
                (rstatus && r.status !== rstatus)
            );
        });

        // Complaints filter
        const cq = (document.querySelector('[data-filter="complaint-search"]')?.value || "").toLowerCase();
        const cs = document.querySelector('[data-filter="complaint-status"]')?.value || "";
        const cc = document.querySelector('[data-filter="complaint-category"]')?.value || "";
        document.querySelectorAll("[data-complaint]").forEach(el => {
            const c = (state.complaints || []).find(x => x.id === el.dataset.complaint);
            el.hidden = !!c && (
                !`${c.name} ${c.subject} ${c.bookingId}`.toLowerCase().includes(cq) ||
                (cs && c.status !== cs) ||
                (cc && c.category !== cc)
            );
        });

        // Equipment filter
        filterEquipment();
    }

    function filterEquipment() {
        const body = document.getElementById("equipment-body");
        if (!body) return;

        const q = (document.querySelector('[data-filter="equipment-search"]')?.value || "").toLowerCase();
        const cat = document.querySelector('[data-filter="equipment-category"]')?.value || "";
        const status = document.querySelector('[data-filter="equipment-status"]')?.value || "";
        const cond = document.querySelector('[data-filter="equipment-condition"]')?.value || "";

        const list = (state.equipment || []).filter(eq =>
            (!q || `${eq.id} ${eq.name} ${eq.serial} ${eq.location} ${eq.notes}`.toLowerCase().includes(q)) &&
            (!cat || eq.category === cat) &&
            (!status || eq.status === status) &&
            (!cond || eq.condition === cond)
        );

        body.innerHTML = list.length
            ? list.map(renderEquipmentRow).join("")
            : `<tr><td colspan="7">${empty("No matching equipment", "Try adjusting your search query or filters.")}</td></tr>`;
    }

    function openEquipmentModal(eq = null) {
        const isEdit = !!eq;
        const id = eq?.id || "";
        const categories = ["Extractor", "Steam Cleaner", "Air Mover", "Rotary Scrubber", "Vacuum Detailing", "Chemical Sprayer", "Ozone Generator", "Other"];
        const selectedCat = eq?.category || "Extractor";

        openModal(
            isEdit ? `Edit equipment ${esc(eq.id)}` : "Add cleaning equipment",
            isEdit ? "Update machine specifications, condition and current location." : "Register a new machine, tool or rental item to inventory.",
            `
                <form id="equipment-form" novalidate>
                    <input type="hidden" name="id" value="${esc(id)}">
                    <div class="form-grid">
                        <div class="field full">
                            <label>Equipment name</label>
                            <input class="input" name="name" required minlength="3" placeholder="e.g. Commercial Wet/Dry Detailing Vac" value="${esc(eq?.name || "")}">
                        </div>
                        <div class="field">
                            <label>Category</label>
                            <select class="select" name="category" required>
                                ${categories.map(c => `<option value="${c}" ${c === selectedCat ? "selected" : ""}>${c}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>Serial number / Tag</label>
                            <input class="input" name="serial" placeholder="e.g. SN-VAC-8802" value="${esc(eq?.serial || "")}">
                        </div>
                        <div class="field">
                            <label>Location / Assignment</label>
                            <input class="input" name="location" required placeholder="e.g. HQ Store Shelf C, Van 1" value="${esc(eq?.location || "HQ Store")}">
                        </div>
                        <div class="field">
                            <label>Current status</label>
                            <select class="select" name="status">
                                ${["Available", "In Use", "Maintenance", "Retired"].map(s => `<option ${(eq?.status || "Available") === s ? "selected" : ""}>${s}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>Physical condition</label>
                            <select class="select" name="condition">
                                ${["Excellent", "Good", "Needs Service", "Damaged"].map(c => `<option ${(eq?.condition || "Good") === c ? "selected" : ""}>${c}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>Hourly rental rate (RM)</label>
                            <input class="input" type="number" min="0" step="1" name="hourlyRate" placeholder="e.g. 65" value="${eq ? esc(eq.hourlyRate) : 65}">
                        </div>
                        <div class="field full">
                            <label>Notes & Accessories</label>
                            <textarea class="textarea" name="notes" placeholder="Included accessories, maintenance logs, hose length...">${esc(eq?.notes || "")}</textarea>
                        </div>
                    </div>
                </form>
            `,
            `
                <button type="button" class="btn btn-quiet" data-action="close-modal">Cancel</button>
                <button type="button" class="btn btn-primary" data-action="equipment-save-submit">${isEdit ? "Save changes" : "Add equipment item"}</button>
            `
        );
    }

    function saveEquipment() {
        const form = document.getElementById("equipment-form");
        if (!form || !form.reportValidity()) return;

        const fd = new FormData(form);
        const id = String(fd.get("id") || "").trim();
        const name = String(fd.get("name") || "").trim();
        const category = String(fd.get("category") || "").trim();
        const serial = String(fd.get("serial") || "").trim();
        const location = String(fd.get("location") || "").trim();
        const status = String(fd.get("status") || "Available").trim();
        const condition = String(fd.get("condition") || "Good").trim();
        const hourlyRate = Number(fd.get("hourlyRate") || 0);
        const notes = String(fd.get("notes") || "").trim();

        if (!Array.isArray(state.equipment)) {
            state.equipment = [];
        }

        if (id) {
            const item = state.equipment.find(e => e.id === id);
            if (item) {
                item.name = name;
                item.category = category;
                item.serial = serial;
                item.location = location;
                item.status = status;
                item.condition = condition;
                item.hourlyRate = hourlyRate;
                item.notes = notes;
            }
            toast("Equipment details updated.");
        } else {
            const newId = uniqueEquipmentId();
            const newItem = {
                id: newId,
                name,
                category,
                serial: serial || `SN-${newId}`,
                location: location || "HQ Store",
                status,
                condition,
                hourlyRate,
                lastService: todayStr(),
                notes
            };
            state.equipment.unshift(newItem);
            toast("New equipment item added to inventory.");
        }

        setState();

        // Synchronize equipment to MySQL
        if (id) {
            fetch(`http://127.0.0.1:5000/api/equipment/${encodeURIComponent(id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, category, serial, location, status, condition, hourlyRate, notes })
            })
            .then(res => res.json())
            .catch(err => console.error("[CleanRide] Error updating equipment in MySQL:", err));
        } else {
            fetch("http://127.0.0.1:5000/api/equipment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: newId, name, category, serial: serial || `SN-${newId}`, location, status, condition, hourlyRate, notes })
            })
            .then(res => res.json())
            .catch(err => console.error("[CleanRide] Error adding equipment to MySQL:", err));
        }

        closeModal();
        renderView("equipment");
    }

    function deleteEquipment(id) {
        const eq = (state.equipment || []).find(e => e.id === id);
        if (!eq) return;

        openModal(
            "Remove equipment item?",
            `${esc(eq.id)} · ${esc(eq.name)}`,
            `
                <div class="notice">Removing this item will delete it permanently from the active tracking register.</div>
                <p class="panel-sub">Are you sure you want to delete <strong>${esc(eq.name)}</strong> (${esc(eq.serial || eq.id)})?</p>
            `,
            `
                <button type="button" class="btn btn-quiet" data-action="close-modal">Keep item</button>
                <button type="button" class="btn btn-danger" data-action="equipment-confirm-delete" data-id="${esc(id)}">Yes, remove item</button>
            `
        );
    }

    function toggleEquipmentStatus(id) {
        const eq = (state.equipment || []).find(e => e.id === id);
        if (!eq) return;
        const nextStatus = eq.status === "Available" ? "In Use" : eq.status === "In Use" ? "Maintenance" : "Available";
        eq.status = nextStatus;
        setState();
        renderView("equipment");
        toast(`${eq.name} status updated to ${nextStatus}.`);
    }

    // --------------------------------------------------------------------------
    // Modals and Actions
    // --------------------------------------------------------------------------

    function bookingDetail(id) {
        const b = bookingBy(id);
        if (!b) return;
        const paymentRows = (state.payments || []).filter(p => p.bookingId === id);

        openModal(
            `Booking ${esc(b.id)}`,
            `${esc(b.serviceLabel)} · ${fmtDate(b.date)} at ${esc(b.time)}`,
            `
                <div class="service-list">
                    <div class="service-row">
                        <div>
                            <div class="service-label">${esc(b.name)}</div>
                            <div class="service-meta">${esc(b.email)} · ${esc(b.phone)}</div>
                            <div class="service-meta">${esc(b.address)}</div>
                        </div>
                        ${badge(b.status)}
                    </div>
                    ${b.rescheduleRequest ? `<div class="notice">Customer requested a change to ${fmtDate(b.rescheduleRequest.date)} at ${esc(b.rescheduleRequest.time)}. Update the date and time in Manage job to approve.</div>` : ""}
                    <div class="service-row">
                        <div>
                            <div class="service-label">Service details</div>
                            <div class="service-meta">${esc((b.items || []).map(i => i.label).join(" · "))}</div>
                            ${b.instructions ? `<div class="service-meta">Note: ${esc(b.instructions)}</div>` : ""}
                        </div>
                    </div>
                </div>
                <div class="summary-breakdown" style="color:var(--ink)">
                    <div class="summary-line"><span>Estimate</span><strong>${money(b.total)}</strong></div>
                    <div class="summary-line"><span>Paid so far · ${esc(b.paymentStatus)}</span><strong>${money(b.paid)}</strong></div>
                    <div class="summary-line"><span>Remaining balance</span><strong>${money(b.balance)}</strong></div>
                </div>
                ${paymentRows.length ? `<div class="panel-sub" style="margin-top:13px">Recorded payments: ${paymentRows.map(p => `${esc(p.method)} ${money(p.amount)}`).join(" · ")}</div>` : ""}
            `,
            `
                <button type="button" class="btn btn-quiet" data-action="close-modal">Close</button>
                <button type="button" class="btn btn-primary" data-action="booking-manage" data-id="${esc(id)}">Manage job</button>
            `
        );
    }

    function manageBooking(id) {
        const b = bookingBy(id);
        if (!b) return;

        openModal(
            `Manage ${esc(b.id)}`,
            "Update the visit, its workflow or recorded payments.",
            `
                ${b.rescheduleRequest ? `<div class="notice">Customer requested ${fmtDate(b.rescheduleRequest.date)} at ${esc(b.rescheduleRequest.time)}. Save these details to approve the change.</div>` : ""}
                <form id="manage-booking-form" novalidate>
                    <input type="hidden" name="id" value="${esc(id)}">
                    <div class="form-grid">
                        <div class="field">
                            <label>Appointment date</label>
                            <input class="input" type="date" name="date" min="${todayStr()}" value="${esc(b.rescheduleRequest?.date || b.date)}" required>
                        </div>
                        <div class="field">
                            <label>Arrival window</label>
                            <select class="select" name="time">
                                ${["09:00", "11:00", "13:00", "15:00"].map(t => `<option ${(b.rescheduleRequest?.time || b.time) === t ? "selected" : ""}>${t}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>Job status</label>
                            <select class="select" name="status">
                                ${["Pending", "Confirmed", "In Progress", "Completed", "Cancelled", "Rejected"].map(s => `<option ${b.status === s ? "selected" : ""}>${s}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>Record a payment (RM)</label>
                            <input class="input" type="number" min="0" step=".01" max="${b.balance}" name="payment" placeholder="Up to ${money(b.balance)}">
                        </div>
                        <div class="field">
                            <label>Payment method</label>
                            <select class="select" name="method">
                                <option>Cash</option>
                                <option>Online transfer (simulated)</option>
                                <option>Card (not collected)</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Payment note</label>
                            <input class="input" name="paymentNote" placeholder="e.g. Balance settlement">
                        </div>
                    </div>
                    <div class="notice" style="margin-top:15px">Payments are recorded for demo reporting only. No money is collected or transferred.</div>
                </form>
            `,
            `
                <button type="button" class="btn btn-quiet" data-action="close-modal">Close</button>
                <button type="button" class="btn btn-primary" data-action="save-booking-manage" data-id="${esc(id)}">Save changes</button>
            `
        );
    }

    function updateBookingManage(id) {
        const form = document.getElementById("manage-booking-form");
        const b = bookingBy(id);
        if (!form || !b || !form.reportValidity()) return;

        const fd = new FormData(form);
        const date = String(fd.get("date"));
        const status = String(fd.get("status"));
        const cap = capacityData(date, date === b.date ? b.id : null);

        if (status === "Confirmed" && b.status !== "Confirmed" && !cap.available) {
            toast("That date is full. Increase capacity or choose another date.");
            return;
        }
        if (date !== b.date && !cap.available) {
            toast("That date is full. Choose another date.");
            return;
        }

        const amount = Number(fd.get("payment") || 0);
        if (amount > b.balance) {
            toast("Payment cannot exceed the current balance.");
            return;
        }

        if (b.service === "rental" && date !== b.date && state.rentals.some(r => r.bookingId !== b.id && r.equipment === b.equipment && r.start === date && ["Requested", "Approved"].includes(r.status))) {
            toast("That equipment is already booked on the selected date.");
            return;
        }

        b.date = date;
        b.time = String(fd.get("time"));
        b.status = status;
        b.rescheduleRequest = null;

        if (b.service === "rental") {
            const rental = state.rentals.find(r => r.bookingId === b.id);
            if (rental) rental.start = date;
        }

        if (amount > 0) {
            b.paid = Number((b.paid + amount).toFixed(2));
            b.balance = Number((b.total - b.paid).toFixed(2));
            b.paymentStatus = b.balance <= 0 ? "Paid" : "Part-paid";
            state.payments.push({
                id: uniqueId("PAY"),
                bookingId: b.id,
                amount,
                date: todayStr(),
                method: String(fd.get("method")),
                note: String(fd.get("paymentNote") || "Payment recorded")
            });
        }

        if (status === "Completed" && b.balance === 0) {
            b.paymentStatus = "Paid";
        }

        setState();

        // Synchronize job changes to MySQL backend
        fetch(`http://127.0.0.1:5000/api/bookings/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status,
                appointment_date: date,
                arrival_window: String(fd.get("time")),
                payment_amount: amount,
                method: String(fd.get("method")),
                paymentNote: String(fd.get("paymentNote") || "Payment recorded")
            })
        })
        .then(res => res.json())
        .catch(err => console.error("[CleanRide] Error updating booking in MySQL:", err));

        closeModal();
        renderView(activePage);
        toast("Job details updated.");
    }

    function approveBooking(id) {
        const b = bookingBy(id);
        if (!b) return;
        if (!capacityData(b.date).available) {
            toast("No capacity remains on that date. Edit the appointment or increase capacity.");
            return;
        }
        b.status = "Confirmed";
        setState();

        fetch(`http://127.0.0.1:5000/api/bookings/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Confirmed" })
        })
        .then(res => res.json())
        .catch(err => console.error("[CleanRide] Error confirming booking in MySQL:", err));

        renderView(activePage);
        toast("Appointment confirmed.");
    }

    function approveRental(id) {
        const r = state.rentals.find(x => x.id === id);
        if (!r) return;
        if (state.rentals.some(x => x.id !== id && x.equipment === r.equipment && x.start === r.start && ["Requested", "Approved"].includes(x.status))) {
            toast("This equipment is already booked for that date.");
            return;
        }
        r.status = "Approved";
        setState();
        renderView(activePage);
        toast("Rental approved.");
    }

    // --------------------------------------------------------------------------
    // Event Delegation
    // --------------------------------------------------------------------------

    document.addEventListener("click", e => {
        // Page navigation
        const pageLink = e.target.closest("[data-page]");
        if (pageLink) {
            e.preventDefault();
            const targetPage = pageLink.dataset.page;
            appShell?.classList.remove("mobile-open");
            renderView(targetPage);
            return;
        }

        // Action buttons
        const actionEl = e.target.closest("[data-action]");
        if (!actionEl) return;
        const action = actionEl.dataset.action;
        const id = actionEl.dataset.id;

        if (action === "mobile-menu") {
            appShell?.classList.add("mobile-open");
        }
        if (action === "close-mobile") {
            appShell?.classList.remove("mobile-open");
        }
        if (action === "collapse") {
            collapsed = !collapsed;
            appShell?.classList.toggle("collapsed", collapsed);
        }
        if (action === "logout") {
            logout();
        }
        if (action === "close-modal") {
            closeModal();
        }
        if (action === "booking-detail") {
            bookingDetail(id);
        }
        if (action === "booking-manage") {
            manageBooking(id);
        }
        if (action === "save-booking-manage") {
            updateBookingManage(id);
        }
        if (action === "approve-booking") {
            approveBooking(id);
        }
        if (action === "reject-booking") {
            const b = bookingBy(id);
            if (b) {
                b.status = "Rejected";
                if (b.service === "rental") {
                    const r = state.rentals.find(x => x.bookingId === id);
                    if (r) r.status = "Rejected";
                }
                setState();

                fetch(`http://127.0.0.1:5000/api/bookings/${encodeURIComponent(id)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "Rejected" })
                })
                .then(res => res.json())
                .catch(err => console.error("[CleanRide] Error rejecting booking in MySQL:", err));

                renderView(activePage);
                toast("Request declined and capacity released.");
            }
        }
        if (action === "rental-approve") {
            approveRental(id);
        }
        if (action === "rental-return") {
            const r = state.rentals.find(x => x.id === id);
            if (r) {
                r.status = "Returned";
                setState();
                renderView(activePage);
                toast("Equipment marked as returned.");
            }
        }
        if (action === "equipment-add") {
            openEquipmentModal(null);
        }
        if (action === "equipment-edit") {
            const eq = (state.equipment || []).find(e => e.id === id);
            if (eq) openEquipmentModal(eq);
        }
        if (action === "equipment-toggle-status") {
            toggleEquipmentStatus(id);
        }
        if (action === "equipment-delete") {
            deleteEquipment(id);
        }
        if (action === "equipment-confirm-delete") {
            state.equipment = (state.equipment || []).filter(e => e.id !== id);
            setState();

            fetch(`http://127.0.0.1:5000/api/equipment/${encodeURIComponent(id)}`, {
                method: "DELETE"
            })
            .then(res => res.json())
            .catch(err => console.error("[CleanRide] Error deleting equipment in MySQL:", err));

            closeModal();
            renderView("equipment");
            toast("Equipment item removed from inventory.");
        }
        if (action === "equipment-save-submit") {
            saveEquipment();
        }
        if (action === "rental-detail") {
            const r = state.rentals.find(x => x.id === id);
            if (r) {
                openModal(
                    `${esc(r.id)} · rental details`,
                    `${fmtDate(r.start)} · ${esc(r.hours)} hours`,
                    `
                        <div class="service-list">
                            <div class="service-row">
                                <div>
                                    <div class="service-label">${esc(equipmentNames[r.equipment])}</div>
                                    <div class="service-meta">Customer: ${esc(r.name)}</div>
                                    <div class="service-meta">Booking reference: ${esc(r.bookingId)}</div>
                                </div>
                                ${badge(r.status)}
                            </div>
                            <div class="summary-line" style="color:var(--ink)">
                                <span>Rental estimate</span><strong>${money(r.price)}</strong>
                            </div>
                        </div>
                    `,
                    `<button type="button" class="btn btn-quiet" data-action="close-modal">Close</button>`
                );
            }
        }
        if (action === "complaint-save") {
            const c = state.complaints.find(x => x.id === id);
            const responseText = document.querySelector(`[data-response="${CSS.escape(id)}"]`)?.value.trim();
            if (c) {
                c.response = responseText || "";
                setState();

                fetch(`http://127.0.0.1:5000/api/complaints/${encodeURIComponent(id)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ team_response: responseText })
                })
                .then(res => res.json())
                .catch(err => console.error("[CleanRide] Error saving complaint response in MySQL:", err));

                renderView(activePage);
                toast("Response saved.");
            }
        }
        if (action === "complaint-resolve") {
            const c = state.complaints.find(x => x.id === id);
            if (c) {
                c.status = c.status === "Resolved" ? "In review" : "Resolved";
                setState();

                fetch(`http://127.0.0.1:5000/api/complaints/${encodeURIComponent(id)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: c.status })
                })
                .then(res => res.json())
                .catch(err => console.error("[CleanRide] Error resolving complaint in MySQL:", err));

                renderView(activePage);
                toast(c.status === "Resolved" ? "Conversation marked resolved." : "Conversation reopened.");
            }
        }
        if (action === "export-csv") {
            const rows = [
                ["Payment", "Booking", "Date", "Method", "Note", "Amount"],
                ...(state.payments || []).map(p => [p.id, p.bookingId, p.date, p.method, p.note, p.amount])
            ];
            const csv = rows.map(r => r.map(x => `"${String(x ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = "cleanride-revenue.csv";
            a.click();
            URL.revokeObjectURL(a.href);
        }
        if (action === "apply-date-range") {
            const from = document.querySelector('[data-filter="revenue-from"]')?.value || "";
            const to = document.querySelector('[data-filter="revenue-to"]')?.value || "";
            if (from && to && from > to) {
                toast("Start date must be before end date.");
                return;
            }
            dateRange = from && to ? { from, to } : null;
            renderView("revenue");
        }
        if (action === "reset-data") {
            openModal(
                "Clear all workspace data?",
                "This wipes all locally saved records.",
                `<div class="notice">All bookings, accounts, complaints, payments, rentals, equipment, pricing and capacity stored in this browser will be permanently deleted. You will be signed out. This cannot be undone.</div>`,
                `
                    <button type="button" class="btn btn-quiet" data-action="close-modal">Cancel</button>
                    <button type="button" class="btn btn-danger" data-action="confirm-reset">Yes, clear everything</button>
                `
            );
        }
        if (action === "confirm-reset") {
            localStorage.removeItem(KEY);
            closeModal();
            window.location.replace("../login/login.html");
        }
    });

    document.addEventListener("input", e => {
        if (e.target.matches('[data-filter="jobs-search"],[data-filter="request-search"],[data-filter="rental-search"],[data-filter="complaint-search"],[data-filter="equipment-search"]')) {
            filterTables();
        }
    });

    document.addEventListener("change", e => {
        const target = e.target;
        if (target.matches('[data-filter="jobs-status"],[data-filter="jobs-service"],[data-filter="jobs-sort"],[data-filter="request-service"],[data-filter="request-date"],[data-filter="rental-status"],[data-filter="complaint-status"],[data-filter="complaint-category"],[data-filter="equipment-category"],[data-filter="equipment-status"],[data-filter="equipment-condition"]')) {
            filterTables();
        }
        if (target.matches('[data-filter="revenue-range"]')) {
            chartFilter = target.value;
            dateRange = null;
            renderView("revenue");
        }
        if (target.matches('[data-filter="revenue-status"]')) {
            revenueStatus = target.value;
            renderView("revenue");
        }
    });

    document.addEventListener("submit", e => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        e.preventDefault();

        if (form.id === "settings-form") {
            if (!form.reportValidity()) return;
            const fd = new FormData(form);
            state.capacity = Number(fd.get("capacity"));
            Object.keys(state.pricing.upholstery).forEach(k => state.pricing.upholstery[k] = Number(fd.get(`up_${k}`)));
            state.pricing.carpet.rate = Number(fd.get("carpet_rate"));
            Object.keys(state.pricing.carpet.dirt).forEach(k => state.pricing.carpet.dirt[k] = Number(fd.get(`dirt_${k}`)));
            Object.keys(state.pricing.vehicle).forEach(k => state.pricing.vehicle[k] = Number(fd.get(`veh_${k}`)));
            Object.keys(state.pricing.rental).forEach(k => state.pricing.rental[k] = Number(fd.get(`rent_${k}`)));
            setState();

            fetch("http://127.0.0.1:5000/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    capacity: state.capacity,
                    pricing: state.pricing
                })
            })
            .then(res => res.json())
            .catch(err => console.error("[CleanRide] Error saving settings to MySQL:", err));

            renderView("settings");
            toast("Pricing and daily capacity saved.");
        }
    });

    // Check URL hash on load
    const hash = window.location.hash.replace("#", "");
    if (["owner-dashboard", "requests", "jobs", "equipment", "rentals", "complaints", "revenue", "settings"].includes(hash)) {
        activePage = hash;
    }

    // Initial render
    renderView(activePage);
})();
