/**
 * CleanRide — Customer Portal Script
 * Handles overview, booking, appointments history, feedback and customer interactions.
 */
(() => {
    "use strict";

    const {
        getState,
        setState,
        user: getCurrentUser,
        visibleBookings,
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
        uniqueComplaintId,
        capacityData,
        serviceNames,
        equipmentNames,
        serviceFields,
        quoteFrom,
        breakdown,
        requireAuth,
        logout
    } = window.CleanRide;

    const state = getState();

    // Redirect to login if no valid customer session
    if (!requireAuth("customer")) return;

    const user = getCurrentUser() || {};

    // DOM references
    const appShell = document.getElementById("app-shell");
    const viewContainer = document.getElementById("customer-view-container");
    const userDisplayName = document.getElementById("user-display-name");
    const userAvatar = document.getElementById("user-avatar");
    const topBreadcrumb = document.getElementById("top-breadcrumb");
    const topTitle = document.getElementById("top-title");
    const pendingNavCount = document.getElementById("pending-nav-count");

    // Page state
    let activePage = "customer-home";
    let collapsed = false;
    let selectedBookingDraft = null;

    // Set user info in header
    if (userDisplayName) userDisplayName.textContent = user.name || "Customer";
    if (userAvatar) {
        const initials = (user.name || "C").split(" ").map(w => w[0]).slice(0, 2).join("");
        userAvatar.textContent = initials;
    }

    const pageTitles = {
        "customer-home": "Your overview",
        "new-booking": "Book a service",
        "appointments": "Appointments & history",
        "reports": "Feedback & reports"
    };

    function updateNavBadge() {
        if (!pendingNavCount) return;
        const pending = visibleBookings().filter(b => b.status === "Pending").length;
        if (pending > 0) {
            pendingNavCount.textContent = pending;
            pendingNavCount.style.display = "inline-block";
        } else {
            pendingNavCount.style.display = "none";
        }
    }

    // --------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------

    function bookingRows(rows, showAction = true) {
        if (!rows.length) {
            return `<tr><td colspan="6">${empty("Nothing to show yet", "New appointments will appear here.")}</td></tr>`;
        }
        return rows.map(b => `
            <tr>
                <td><span class="primary-cell">${esc(b.id)}</span><span class="sub-cell">${esc(b.serviceLabel || serviceNames[b.service] || b.service)}</span></td>
                <td>${esc((b.items || []).map(i => i.label).join(", "))}</td>
                <td>${fmtDate(b.date)}<span class="sub-cell">${esc(b.time || "")}</span></td>
                <td class="primary-cell">${money(b.total)}</td>
                <td>${badge(b.status)}</td>
                <td>${showAction ? `<button class="text-link" data-action="booking-detail" data-id="${esc(b.id)}">Details</button>` : ""}</td>
            </tr>
        `).join("");
    }

    function serviceTiles() {
        return Object.entries(serviceNames).map(([id, n], i) => `
            <div class="service-row">
                <div class="service-symbol">${["U", "C", "V", "R"][i]}</div>
                <div>
                    <div class="service-label">${n}</div>
                    <div class="service-meta">${["Sofas, mattresses & fabric", "Room-by-room carpet care", "Seats, mats & interior", "Professional kit, ready to use"][i]}</div>
                </div>
                <button type="button" class="text-link" data-page="new-booking" data-service="${id}">Choose</button>
            </div>
        `).join("");
    }

    function renderCustomerHome() {
        const rows = visibleBookings().sort((a, b) => a.date.localeCompare(b.date));
        const upcoming = rows.filter(b => b.date >= todayStr() && !["Cancelled", "Completed"].includes(b.status));
        const next = upcoming[0];
        const userFirstName = (user.name || "Customer").split(" ")[0];

        return `
            ${head("CUSTOMER PORTAL", "Welcome back.", `Here’s your booking overview, ${esc(userFirstName)}.`, `<button type="button" class="btn btn-primary" data-page="new-booking">＋ Book a service</button>`)}
            <div class="stats-grid">
                ${stat("Upcoming appointments", upcoming.length, upcoming.length ? "Next scheduled visit" : "Book your first service", "▤")}
                ${stat("Completed visits", rows.filter(b => b.status === "Completed").length, "Services completed", "✓")}
                ${stat("Open balance", money(rows.reduce((s, b) => s + (b.balance || 0), 0)), "All bookings", "RM")}
                ${stat("Feedback sent", (state.complaints || []).filter(c => c.userId === user.id).length, "Feedback submitted", "◇")}
            </div>
            <div class="dashboard-grid">
                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">Coming up</div>
                            <div class="panel-sub">Next scheduled service</div>
                        </div>
                        <button type="button" class="text-link" data-page="appointments">See appointments →</button>
                    </div>
                    ${next ? `
                        <div class="service-row">
                            <div class="service-symbol">CR</div>
                            <div>
                                <div class="service-label">${esc(next.serviceLabel)}</div>
                                <div class="service-meta">${fmtDate(next.date)} · ${esc(next.time)} · ${esc(next.address)}</div>
                            </div>
                            <div class="service-price">${money(next.total)}</div>
                        </div>
                        <div style="margin-top:15px">
                            ${badge(next.status)} <button type="button" class="text-link" data-action="booking-detail" data-id="${esc(next.id)}">View details</button>
                        </div>
                    ` : empty("No visits booked", "Book a service to get started.", `<button type="button" class="btn btn-primary btn-small" data-page="new-booking">Book a service</button>`)}
                </section>
                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">How we can help</div>
                            <div class="panel-sub">Available services</div>
                        </div>
                    </div>
                    <div class="service-list">${serviceTiles()}</div>
                </section>
            </div>
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">Recent bookings</div>
                        <div class="panel-sub">Latest activity</div>
                    </div>
                    <button type="button" class="text-link" data-page="appointments">Full history →</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Reference / service</th>
                                <th>Service details</th>
                                <th>Appointment</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${bookingRows(rows.slice(-4).reverse())}</tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderBookingPage(preselectedService = "") {
        return `
            ${head("NEW APPOINTMENT", "Book a service", "Select a service, enter your details and choose a time.")}
            <form id="booking-form" class="form-layout" novalidate>
                <div class="panel">
                    <div class="form-section">
                        <div class="section-label">1. Choose your service</div>
                        <div class="form-grid">
                            <div class="field full">
                                <label for="service">Service type</label>
                                <select class="select" name="service" id="service" required>
                                    <option value="">Select a service</option>
                                    ${Object.entries(serviceNames).map(([k, v]) => `<option value="${k}" ${k === preselectedService ? "selected" : ""}>${v}</option>`).join("")}
                                </select>
                            </div>
                            <div class="field full" id="service-fields">
                                ${serviceFields(preselectedService)}
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="section-label">2. Service address</div>
                        <div class="form-grid">
                            <div class="field">
                                <label>Your name</label>
                                <input class="input" name="name" required value="${esc(user.name)}" minlength="2">
                            </div>
                            <div class="field">
                                <label>Email address</label>
                                <input class="input" name="email" type="email" required value="${esc(user.email)}">
                            </div>
                            <div class="field">
                                <label>Phone number</label>
                                <input class="input" name="phone" required value="${esc(user.phone || "")}" pattern="[0-9+() .-]{8,18}">
                            </div>
                            <div class="field">
                                <label>Service address</label>
                                <input class="input" name="address" required minlength="8" placeholder="Street, area, city">
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="section-label">3. Date & time</div>
                        <div class="capacity-strip">
                            <span id="capacity-label">Select a date to check availability</span>
                            <div class="capacity-meter"><span id="capacity-meter" style="width:0%"></span></div>
                            <strong id="capacity-count">—</strong>
                        </div>
                        <div class="form-grid">
                            <div class="field">
                                <label>Preferred date</label>
                                <input class="input" name="date" type="date" min="${todayStr()}" required>
                                <small class="date-warning" id="date-warning"></small>
                            </div>
                            <div class="field">
                                <label>Arrival window</label>
                                <select class="select" name="time" required>
                                    <option value="">Choose a window</option>
                                    <option>09:00</option>
                                    <option>11:00</option>
                                    <option>13:00</option>
                                    <option>15:00</option>
                                </select>
                            </div>
                            <div class="field full">
                                <label>Anything we should know?</label>
                                <textarea class="textarea" name="instructions" placeholder="Access notes, parking, fabric concerns..."></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" type="submit">Review booking & deposit →</button>
                    </div>
                </div>

                <aside class="summary-card">
                    <h3>Your estimate</h3>
                    <p>Estimated price (RM)</p>
                    <div id="booking-breakdown">${breakdown(null)}</div>
                    <div class="summary-total">
                        <span>Total</span>
                        <span id="booking-total">${money(0)}</span>
                    </div>
                    <div style="font-size:11px;color:#b1cbd3;margin-top:7px">
                        20% simulated deposit: <strong id="booking-deposit" style="color:white">${money(0)}</strong>
                    </div>
                    <button class="btn" type="submit">Continue to deposit review</button>
                </aside>
            </form>
        `;
    }

    function appointmentRow(b) {
        return `
            <tr>
                <td><span class="primary-cell">${esc(b.id)}</span><span class="sub-cell">${esc(b.serviceLabel)}</span></td>
                <td>${esc((b.items || []).map(i => i.label).join(", "))}</td>
                <td>${fmtDate(b.date)}<span class="sub-cell">${esc(b.time || "")}</span></td>
                <td class="primary-cell">${money(b.total)}<span class="sub-cell">Deposit ${money(b.deposit)}</span></td>
                <td>${badge(b.status)}${b.rescheduleRequest ? `<span class="sub-cell">Reschedule requested: ${fmtDate(b.rescheduleRequest.date)}</span>` : ""}</td>
                <td>${badge(b.paymentStatus)}<span class="sub-cell">Balance ${money(b.balance)}</span></td>
                <td><button type="button" class="text-link" data-action="booking-detail" data-id="${esc(b.id)}">Details</button></td>
            </tr>
        `;
    }

    function renderAppointmentsPage() {
        const list = visibleBookings().sort((a, b) => b.date.localeCompare(a.date));
        return `
            ${head("YOUR SERVICE HISTORY", "Your appointments", "View bookings, payments and appointment updates.", `<button type="button" class="btn btn-primary" data-page="new-booking">＋ New booking</button>`)}
            <div class="filters">
                <input class="input" data-filter="appointments-search" placeholder="Search reference or service">
                <select class="select" data-filter="appointments-status">
                    <option value="">All statuses</option>
                    ${["Pending", "Confirmed", "In Progress", "Completed", "Cancelled"].map(x => `<option>${x}</option>`).join("")}
                </select>
                <select class="select" data-filter="appointments-sort">
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </select>
            </div>
            <section class="panel">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Reference / service</th>
                                <th>Service details</th>
                                <th>Appointment</th>
                                <th>Estimate</th>
                                <th>Booking status</th>
                                <th>Payment status / balance</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="appointments-body">
                            ${list.length ? list.map(b => appointmentRow(b)).join("") : `<tr><td colspan="7">${empty("No appointments yet", "Your confirmed bookings and past visits will be listed here.", `<button type="button" class="btn btn-primary btn-small" data-page="new-booking">Book your first service</button>`)}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderReportsPage() {
        const mine = (state.complaints || []).filter(c => c.userId === user.id);
        const myBookings = visibleBookings();
        return `
            ${head("FEEDBACK & SUPPORT", "Feedback & support", "Send feedback or check your response status.")}
            <div class="dashboard-grid">
                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">Tell us how it went</div>
                            <div class="panel-sub">Your note goes straight to our local team</div>
                        </div>
                    </div>
                    <form id="complaint-form" class="form-grid" novalidate>
                        <div class="field">
                            <label>Booking reference</label>
                            <select name="bookingId" class="select" required>
                                <option value="">Choose an appointment</option>
                                ${myBookings.map(b => `<option value="${esc(b.id)}">${esc(b.id)} · ${esc(b.serviceLabel)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>What is this about?</label>
                            <select name="category" class="select">
                                <option>Service quality</option>
                                <option>Appointment timing</option>
                                <option>Billing question</option>
                                <option>Equipment rental</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div class="field full">
                            <label>Subject</label>
                            <input class="input" name="subject" minlength="4" required placeholder="A short summary">
                        </div>
                        <div class="field full">
                            <label>Details</label>
                            <textarea class="textarea" name="description" minlength="12" required placeholder="Tell us what happened and how we can help"></textarea>
                        </div>
                        <div class="field">
                            <label>Date of experience</label>
                            <input class="input" type="date" name="date" max="${todayStr()}" value="${todayStr()}" required>
                        </div>
                        <div class="full">
                            <button type="submit" class="btn btn-primary">Send feedback</button>
                        </div>
                    </form>
                </section>
                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">Your conversations</div>
                            <div class="panel-sub">We keep every follow-up in one place</div>
                        </div>
                    </div>
                    ${mine.length ? mine.slice().reverse().map(c => `
                        <div class="service-row">
                            <div class="service-symbol">◇</div>
                            <div style="min-width:0">
                                <div class="service-label">${esc(c.subject)}</div>
                                <div class="service-meta">${esc(c.id)} · ${fmtDate(c.date)} · ${esc(c.category)}</div>
                                <div class="service-meta" style="margin-top:7px;white-space:normal">${esc(c.description)}</div>
                                ${c.response ? `<div class="notice" style="margin:9px 0 0"><strong>CleanRide replied:</strong> ${esc(c.response)}</div>` : ""}
                            </div>
                            <div style="margin-left:auto">${badge(c.status)}</div>
                        </div>
                    `).join("") : empty("No notes sent", "Your feedback and our replies will show here.")}
                </section>
            </div>
        `;
    }

    // --------------------------------------------------------------------------
    // Navigation & Rendering
    // --------------------------------------------------------------------------

    function renderView(pageId, draftService = "") {
        activePage = pageId;
        const title = pageTitles[pageId] || "Your overview";
        if (topBreadcrumb) topBreadcrumb.textContent = `CleanRide / ${title}`;
        if (topTitle) topTitle.textContent = title;

        // Highlight sidebar nav item
        document.querySelectorAll(".sidebar .nav-item").forEach(item => {
            item.classList.toggle("active", item.dataset.page === pageId);
        });

        updateNavBadge();

        if (pageId === "customer-home") {
            viewContainer.innerHTML = renderCustomerHome();
        } else if (pageId === "new-booking") {
            viewContainer.innerHTML = renderBookingPage(draftService);
            if (draftService) {
                updateQuote();
            }
        } else if (pageId === "appointments") {
            viewContainer.innerHTML = renderAppointmentsPage();
        } else if (pageId === "reports") {
            viewContainer.innerHTML = renderReportsPage();
        }
    }

    // --------------------------------------------------------------------------
    // Live Calculation Helpers
    // --------------------------------------------------------------------------

    function updateQuote() {
        const form = document.getElementById("booking-form");
        if (!form) return;
        const q = quoteFrom(form);
        const breakdownEl = document.getElementById("booking-breakdown");
        const totalEl = document.getElementById("booking-total");
        const depositEl = document.getElementById("booking-deposit");
        if (breakdownEl) breakdownEl.innerHTML = breakdown(q);
        if (totalEl) totalEl.textContent = money(q?.total);
        if (depositEl) depositEl.textContent = money(q?.deposit);
    }

    function updateCapacity() {
        const dateInput = document.querySelector('#booking-form [name="date"]');
        if (!dateInput || !dateInput.value) return;
        const date = dateInput.value;
        const c = capacityData(date);
        const label = document.getElementById("capacity-label");
        const cnt = document.getElementById("capacity-count");
        const meter = document.getElementById("capacity-meter");
        const warn = document.getElementById("date-warning");

        if (label) label.textContent = c.available ? `${c.used} booked · ${c.available} slots available` : "This date is full";
        if (cnt) cnt.textContent = `${c.used}/${c.limit}`;
        if (meter) meter.style.width = `${Math.min(100, (c.used / c.limit) * 100)}%`;
        if (warn) {
            warn.textContent = c.available ? "" : `This date has reached its ${c.limit}-job limit. Please choose another.`;
            warn.classList.toggle("show", !c.available);
        }
    }

    function filterAppointments() {
        const searchInput = document.querySelector('[data-filter="appointments-search"]');
        const statusSelect = document.querySelector('[data-filter="appointments-status"]');
        const sortSelect = document.querySelector('[data-filter="appointments-sort"]');
        const body = document.getElementById("appointments-body");
        if (!body) return;

        const q = (searchInput?.value || "").toLowerCase();
        const status = statusSelect?.value || "";
        const sort = sortSelect?.value || "newest";

        let arr = visibleBookings().filter(b =>
            (!q || `${b.id} ${b.serviceLabel}`.toLowerCase().includes(q)) &&
            (!status || b.status === status)
        );

        arr.sort((a, b) => sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));

        body.innerHTML = arr.length
            ? arr.map(appointmentRow).join("")
            : `<tr><td colspan="7">${empty("No matching appointments", "Try a different search or filter.")}</td></tr>`;
    }

    // --------------------------------------------------------------------------
    // Booking Actions
    // --------------------------------------------------------------------------

    function submitBooking(form) {
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const quote = quoteFrom(form);
        if (!quote) {
            toast("Choose a service to continue.");
            return;
        }
        const date = String(fd.get("date"));
        const cap = capacityData(date);
        if (!cap.available) {
            toast("That date is full. Choose a date with an open slot.");
            updateCapacity();
            return;
        }

        const service = String(fd.get("service"));
        const items = [];
        let details = {};

        if (service === "upholstery") {
            const key = String(fd.get("upholsteryType"));
            const qty = Number(fd.get("quantity"));
            items.push({ label: `${qty} × ${key}`, qty, unit: state.pricing.upholstery[key] });
            details = { upholsteryType: key, quantity: qty };
        }
        if (service === "carpet") {
            const area = Number(fd.get("area"));
            items.push({ label: `Carpet area · ${area} m²`, qty: area, unit: state.pricing.carpet.rate });
            details = { area };
        }
        if (service === "vehicle") {
            const typ = String(fd.get("vehicleType"));
            const fleet = Number(fd.get("fleet"));
            const seats = Number(fd.get("seats"));
            items.push({ label: `${fleet} × ${typ.toUpperCase()} · ${seats} seats`, qty: fleet, unit: quote.base / fleet });
            details = { vehicleType: typ, registration: String(fd.get("registration")), seats, fleet };
        }
        if (service === "rental") {
            const equipment = String(fd.get("equipment"));
            const start = String(fd.get("rentalStart"));
            const hours = Number(fd.get("rentalHours"));
            if (start < todayStr()) {
                toast("Choose a rental start date from today onwards.");
                return;
            }
            const collision = (state.rentals || []).some(r => r.equipment === equipment && r.start === start && ["Requested", "Approved"].includes(r.status));
            if (collision) {
                toast("That equipment is already requested for this date. Choose another date or item.");
                return;
            }
            if (start !== date) {
                toast("For a rental, appointment date and rental start date must match.");
                return;
            }
            items.push({ label: `${equipmentNames[equipment]} · ${hours} hours`, qty: hours, unit: state.pricing.rental[equipment] });
            details = { equipment, rentalStart: start, rentalHours: hours };
        }

        const id = uniqueId("CR");
        selectedBookingDraft = {
            id,
            userId: user.id,
            name: String(fd.get("name")).trim(),
            email: String(fd.get("email")).trim(),
            phone: String(fd.get("phone")).trim(),
            address: String(fd.get("address")).trim(),
            date,
            time: String(fd.get("time")),
            service,
            serviceLabel: serviceNames[service],
            items,
            ...details,
            dirtiness: quote.dirtiness,
            instructions: String(fd.get("instructions") || "").trim(),
            base: quote.base,
            surcharge: quote.surcharge,
            total: quote.total,
            deposit: quote.deposit,
            balance: quote.total - quote.deposit,
            status: "Pending",
            paymentStatus: "Unpaid",
            paid: 0,
            createdAt: new Date().toISOString()
        };

        openModal(
            "Review simulated deposit",
            `${esc(id)} · ${fmtDate(date)} · ${esc(fd.get("time"))}`,
            `
                <div class="notice"><strong>Demo only.</strong> No card details are requested and no transfer takes place. Confirming records a simulated deposit payment in this browser.</div>
                <div class="summary-breakdown" style="color:var(--ink)">
                    <div class="summary-line"><span>${esc(quote.label)}</span><strong>${money(quote.base)}</strong></div>
                    <div class="summary-line"><span>Service adjustment</span><strong>${money(quote.surcharge)}</strong></div>
                    <div class="summary-line"><span>Total</span><strong>${money(quote.total)}</strong></div>
                    <div class="summary-line"><span>20% deposit today</span><strong>${money(quote.deposit)}</strong></div>
                    <div class="summary-line"><span>Remaining balance</span><strong>${money(quote.total - quote.deposit)}</strong></div>
                </div>
                <div class="field" style="margin-top:15px">
                    <label>Simulated deposit method</label>
                    <select class="select" id="deposit-method">
                        <option>Online transfer (simulated)</option>
                        <option>Cash at appointment</option>
                    </select>
                </div>
            `,
            `<button type="button" class="btn btn-quiet" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="confirm-booking">Confirm booking & deposit</button>`
        );
    }

    function confirmBooking() {
        const b = selectedBookingDraft;
        if (!b) return;

        if (!capacityData(b.date).available) {
            toast("The date filled before confirmation. Please choose another.");
            selectedBookingDraft = null;
            closeModal();
            renderView("new-booking");
            return;
        }

        if (b.service === "rental" && (state.rentals || []).some(r => r.equipment === b.equipment && r.start === b.rentalStart && ["Requested", "Approved"].includes(r.status))) {
            toast("That equipment date is no longer available.");
            selectedBookingDraft = null;
            closeModal();
            return;
        }

        const method = document.getElementById("deposit-method")?.value || "Online transfer (simulated)";
        b.paid = b.deposit;
        b.balance = Number((b.total - b.paid).toFixed(2));
        b.paymentStatus = "Deposit paid";

        state.payments.push({
            id: uniqueId("PAY"),
            bookingId: b.id,
            amount: b.deposit,
            date: todayStr(),
            method,
            note: "Booking deposit (simulated)"
        });

        state.bookings.push(b);

        if (b.service === "rental") {
            state.rentals.push({
                id: uniqueId("RN"),
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

        setState();
        selectedBookingDraft = null;
        closeModal();
        renderView("appointments");
        toast("Booking saved. Your request is now with our team.");
    }

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
                    ${b.rescheduleRequest ? `<div class="notice">You requested a change to ${fmtDate(b.rescheduleRequest.date)} at ${esc(b.rescheduleRequest.time)}. The service team will review it shortly.</div>` : ""}
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
                ${["Pending", "Confirmed"].includes(b.status) ? `
                    <button type="button" class="btn btn-secondary" data-action="reschedule" data-id="${esc(id)}">Request reschedule</button>
                    <button type="button" class="btn btn-danger" data-action="cancel-booking" data-id="${esc(id)}">Cancel booking</button>
                ` : ""}
            `
        );
    }

    function doCancel(id) {
        const b = bookingBy(id);
        if (!b) return;
        openModal(
            "Cancel this booking?",
            `${b.id} · ${fmtDate(b.date)}`,
            `
                <div class="notice">Cancelling releases one daily capacity slot. Any recorded demo payment remains visible in the ledger.</div>
                <p class="panel-sub">Are you sure you want to cancel your appointment for ${esc(b.serviceLabel)}?</p>
            `,
            `
                <button type="button" class="btn btn-quiet" data-action="close-modal">Keep booking</button>
                <button type="button" class="btn btn-danger" data-action="confirm-cancel" data-id="${esc(id)}">Yes, cancel booking</button>
            `
        );
    }

    function requestReschedule(id) {
        const b = bookingBy(id);
        if (!b) return;
        openModal(
            "Request a new appointment time",
            `${esc(b.id)} · Current date ${fmtDate(b.date)}`,
            `
                <form id="reschedule-form" novalidate>
                    <input type="hidden" name="id" value="${esc(id)}">
                    <div class="form-grid">
                        <div class="field">
                            <label>Preferred date</label>
                            <input class="input" type="date" name="date" min="${todayStr()}" required>
                        </div>
                        <div class="field">
                            <label>Preferred arrival window</label>
                            <select class="select" name="time">
                                <option>09:00</option>
                                <option>11:00</option>
                                <option>13:00</option>
                                <option>15:00</option>
                            </select>
                        </div>
                    </div>
                    <div class="notice" style="margin-top:15px">This sends a request to the service team; your current appointment remains scheduled until they approve the change.</div>
                </form>
            `,
            `
                <button type="button" class="btn btn-quiet" data-action="close-modal">Close</button>
                <button type="button" class="btn btn-primary" data-action="submit-reschedule" data-id="${esc(id)}">Send request</button>
            `
        );
    }

    // --------------------------------------------------------------------------
    // Event Delegation
    // --------------------------------------------------------------------------

    document.addEventListener("click", e => {
        // Page links
        const pageLink = e.target.closest("[data-page]");
        if (pageLink) {
            e.preventDefault();
            const targetPage = pageLink.dataset.page;
            const draftService = pageLink.dataset.service || "";
            appShell?.classList.remove("mobile-open");
            renderView(targetPage, draftService);
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
        if (action === "confirm-booking") {
            confirmBooking();
        }
        if (action === "cancel-booking") {
            doCancel(id);
        }
        if (action === "confirm-cancel") {
            const b = bookingBy(id);
            if (b) {
                b.status = "Cancelled";
                if (b.service === "rental") {
                    const r = state.rentals.find(x => x.bookingId === id);
                    if (r && r.status !== "Returned") {
                        r.status = "Rejected";
                    }
                }
                setState();
                closeModal();
                renderView(activePage);
                toast("Booking cancelled and capacity released.");
            }
        }
        if (action === "reschedule") {
            requestReschedule(id);
        }
        if (action === "submit-reschedule") {
            const f = document.getElementById("reschedule-form");
            if (f?.reportValidity()) {
                const fd = new FormData(f);
                const b = bookingBy(id);
                const d = String(fd.get("date"));
                if (!capacityData(d, d === b.date ? b.id : null).available) {
                    toast("That date is full. Choose another date.");
                    return;
                }
                b.rescheduleRequest = {
                    date: d,
                    time: String(fd.get("time")),
                    requestedAt: new Date().toISOString()
                };
                setState();
                closeModal();
                renderView(activePage);
                toast("Reschedule request sent to the team.");
            }
        }
    });

    document.addEventListener("input", e => {
        if (e.target.matches('[data-filter="appointments-search"]')) {
            filterAppointments();
        }
        if (e.target.closest("#booking-form")) {
            updateQuote();
        }
    });

    document.addEventListener("change", e => {
        const target = e.target;
        if (target.id === "service") {
            const fields = document.getElementById("service-fields");
            if (fields) {
                fields.innerHTML = serviceFields(target.value);
            }
            updateQuote();
        }
        if (target.matches('[name="date"]') && target.closest("#booking-form")) {
            updateCapacity();
        }
        if (target.closest("#booking-form")) {
            updateQuote();
        }
        if (target.matches('[data-filter="appointments-status"],[data-filter="appointments-sort"]')) {
            filterAppointments();
        }
    });

    document.addEventListener("submit", e => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        e.preventDefault();

        if (form.id === "booking-form") {
            submitBooking(form);
        }

        if (form.id === "complaint-form") {
            if (!form.reportValidity()) return;
            const fd = new FormData(form);
            const bookingId = String(fd.get("bookingId"));
            const b = bookingBy(bookingId);
            if (!b) {
                toast("Choose a booking to attach your feedback to.");
                return;
            }

            state.complaints.push({
                id: uniqueComplaintId(),
                bookingId: b.id,
                userId: user.id,
                name: user.name,
                category: String(fd.get("category")),
                subject: String(fd.get("subject")).trim(),
                description: String(fd.get("description")).trim(),
                date: String(fd.get("date")),
                status: "In review",
                response: "",
                createdAt: new Date().toISOString()
            });

            setState();
            renderView("reports");
            toast("Feedback sent. The team will follow up here.");
        }
    });

    // Check URL hash on load
    const hash = window.location.hash.replace("#", "");
    if (["customer-home", "new-booking", "appointments", "reports"].includes(hash)) {
        activePage = hash;
    }

    // Initial render
    renderView(activePage);
})();
