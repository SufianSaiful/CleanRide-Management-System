/**
 * CleanRide - script.js
 * Synchronized frontend client connecting index.html directly to Python Flask API
 * running at http://127.0.0.1:5000 with complete MySQL database persistence.
 * 
 * Strict Zero-Mock Implementation:
 * - NO forms or buttons save data to local-only arrays or localStorage.
 * - Every Create, Read, Update, Delete operation executes real fetch() requests to MySQL.
 * - Equipment Tracking auto-refreshes immediately after POST without page reload.
 * - All server & database errors are prominently surfaced via status alerts and console.
 */

// API Base Endpoints
const API_BASE = "http://127.0.0.1:5000/api";
const AUTH_API = `${API_BASE}/auth`;
const EQUIPMENT_API = `${API_BASE}/equipment`;
const ITEMS_API = `${API_BASE}/items`;
const BOOKINGS_API = `${API_BASE}/bookings`;
const COMPLAINTS_API = `${API_BASE}/complaints`;

// State tracking in memory
let activeAuthMode = "signin";
let activeOpsTab = "equipment";
let pendingAdminUsername = null;
let currentSessionUser = null;

// ==========================================================================
// 1. Status & Non-Shifting Alert System
// ==========================================================================

let statusTimeout = null;

function showStatus(message, type = "success") {
    const container = document.getElementById("status-container");
    if (!container) {
        alert(message);
        return;
    }

    clearTimeout(statusTimeout);

    container.className = `status-container ${type}`;
    container.textContent = message;
    container.style.display = "flex";

    // Auto-dismiss success and info alerts after 6 seconds; keep errors visible longer
    const timeoutDuration = (type === "error") ? 10000 : 5000;
    statusTimeout = setTimeout(() => {
        container.style.display = "none";
        container.className = "status-container";
    }, timeoutDuration);
}

function clearStatus() {
    const container = document.getElementById("status-container");
    if (container) {
        container.style.display = "none";
        container.className = "status-container";
    }
}

// ==========================================================================
// 2. Authentication UI & Session Handling
// ==========================================================================

function getActiveUser() {
    if (currentSessionUser && currentSessionUser.id) {
        return currentSessionUser;
    }

    // Check shared state if present
    if (window.CleanRide?.user) {
        const u = window.CleanRide.user();
        if (u && u.id) {
            currentSessionUser = u;
            return currentSessionUser;
        }
    }

    try {
        const raw = localStorage.getItem("cleanride-demo-v1");
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.session && parsed.session.id) {
                currentSessionUser = parsed.session;
                return currentSessionUser;
            }
        }
    } catch (e) {
        console.error("[CleanRide] Error reading session token:", e);
    }

    return null;
}

function syncSessionState(user) {
    currentSessionUser = user;
    if (window.CleanRide?.setState && window.CleanRide?.getState) {
        const state = window.CleanRide.getState();
        state.session = { id: user.id, name: user.name, role: user.role || "customer", email: user.email || "" };
        if (!Array.isArray(state.users)) state.users = [];
        const idx = state.users.findIndex(u => u.id === user.id);
        if (idx >= 0) {
            state.users[idx] = { ...state.users[idx], ...state.session };
        } else {
            state.users.push(state.session);
        }
        window.CleanRide.setState();
    }
}

function updateAuthView() {
    const tabSignin = document.getElementById("tab-signin");
    const tabSignup = document.getElementById("tab-signup");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const adminCodeContainer = document.getElementById("admin-code-container");
    const authTitle = document.getElementById("auth-title");
    const authSubtitle = document.getElementById("auth-subtitle");

    if (adminCodeContainer) {
        adminCodeContainer.style.display = "none";
        pendingAdminUsername = null;
    }

    if (activeAuthMode === "signin") {
        tabSignin?.classList.add("active");
        tabSignup?.classList.remove("active");
        if (loginForm) loginForm.style.display = "flex";
        if (registerForm) registerForm.style.display = "none";
        if (authTitle) authTitle.textContent = "Account Sign In";
        if (authSubtitle) authSubtitle.textContent = "Enter your credentials to access your CleanRide account.";
    } else {
        tabSignup?.classList.add("active");
        tabSignin?.classList.remove("active");
        if (loginForm) loginForm.style.display = "none";
        if (registerForm) registerForm.style.display = "flex";
        if (authTitle) authTitle.textContent = "Create Account";
        if (authSubtitle) authSubtitle.textContent = "Register a new CleanRide customer account.";
    }
}

function updateSessionUI(user) {
    const badgeContainer = document.getElementById("user-badge-container");
    const badge = document.getElementById("current-user-badge");

    if (user && user.role) {
        if (badgeContainer) badgeContainer.style.display = "flex";
        if (badge) badge.textContent = `${user.name || "User"} (${user.role.toUpperCase()})`;
    } else {
        if (badgeContainer) badgeContainer.style.display = "none";
    }
}

// A. Handle Registration
async function handleRegister(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("reg-submit");

    const name = document.getElementById("reg-name")?.value.trim();
    const email = document.getElementById("reg-email")?.value.trim().toLowerCase();
    const phone = document.getElementById("reg-phone")?.value.trim();
    const password = document.getElementById("reg-password")?.value;

    if (!name || !email || !phone || !password) {
        showStatus("Please fill in all registration fields.", "error");
        return;
    }

    if (password.length < 6) {
        showStatus("Password must be at least 6 characters.", "error");
        return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(`${AUTH_API}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, phone, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            form.reset();
            showStatus("Account created successfully in MySQL! You can now sign in.", "success");

            if (data.user) {
                syncSessionState(data.user);
            }

            activeAuthMode = "signin";
            updateAuthView();

            const usernameInput = document.getElementById("login-username");
            if (usernameInput) {
                usernameInput.value = email;
                document.getElementById("login-password")?.focus();
            }
        } else {
            console.error("[CleanRide Registration Error]:", data);
            showStatus(data.error || "Registration failed. Check server connection.", "error");
        }
    } catch (err) {
        console.error("[CleanRide Registration Network Error]:", err);
        showStatus(`Server unreachable: ${err.message}. Check Flask backend at http://127.0.0.1:5000.`, "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// B. Handle Sign In
async function handleLogin(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("login-submit");

    const username = document.getElementById("login-username")?.value.trim();
    const password = document.getElementById("login-password")?.value;

    if (!username || !password) {
        showStatus("Please enter your username/email and password.", "error");
        return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(`${AUTH_API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error("[CleanRide Login Error]:", data);
            showStatus(data.error || "Invalid username or password.", "error");
            return;
        }

        if (data.requires_code && data.role === "owner") {
            pendingAdminUsername = data.username || username;
            showAdminCodePrompt(pendingAdminUsername);
            showStatus("Admin credentials verified. Enter 4-digit security code.", "info");
            return;
        }

        showStatus(`Welcome back, ${data.user?.name || "Customer"}! Signed in successfully.`, "success");
        updateSessionUI(data.user);

        if (data.user) {
            syncSessionState(data.user);
        }
    } catch (err) {
        console.error("[CleanRide Sign In Network Error]:", err);
        showStatus(`Unable to connect to Flask server: ${err.message}.`, "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// C. Admin 2FA PIN Prompt & Verification
function showAdminCodePrompt(username) {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const adminCodeContainer = document.getElementById("admin-code-container");
    const authTabs = document.getElementById("auth-tabs");

    if (loginForm) loginForm.style.display = "none";
    if (registerForm) registerForm.style.display = "none";
    if (authTabs) authTabs.style.display = "none";

    if (adminCodeContainer) {
        adminCodeContainer.style.display = "block";
        const pinInput = document.getElementById("admin-pin");
        if (pinInput) {
            pinInput.value = "";
            pinInput.focus();
        }
    }
}

function hideAdminCodePrompt() {
    const loginForm = document.getElementById("login-form");
    const adminCodeContainer = document.getElementById("admin-code-container");
    const authTabs = document.getElementById("auth-tabs");

    if (adminCodeContainer) adminCodeContainer.style.display = "none";
    if (authTabs) authTabs.style.display = "flex";
    if (loginForm) loginForm.style.display = "flex";
    pendingAdminUsername = null;
}

async function handleAdminCodeSubmit(event) {
    event.preventDefault();
    const pinInput = document.getElementById("admin-pin");
    const code = pinInput?.value.trim();
    const verifyBtn = document.getElementById("btn-verify-pin");

    if (!code || code.length !== 4) {
        showStatus("Please enter your 4-digit security code.", "error");
        return;
    }

    if (verifyBtn) verifyBtn.disabled = true;

    try {
        const response = await fetch(`${AUTH_API}/verify-admin-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, username: pendingAdminUsername || "adminCleanRide" })
        });

        const data = await response.json();

        if (response.ok && data.success && data.verified) {
            showStatus("Security PIN verified! Admin session authorized.", "success");
            updateSessionUI(data.user);

            if (data.user) {
                syncSessionState(data.user);
            }

            setTimeout(() => {
                window.location.href = "./owner/owner.html";
            }, 600);
        } else {
            console.error("[CleanRide PIN Verification Error]:", data);
            showStatus(data.error || "Invalid 4-digit code. Access denied.", "error");
            if (pinInput) {
                pinInput.value = "";
                pinInput.focus();
            }
        }
    } catch (err) {
        console.error("[CleanRide Admin Code Network Error]:", err);
        showStatus(`Verification server error: ${err.message}.`, "error");
    } finally {
        if (verifyBtn) verifyBtn.disabled = false;
    }
}

// ==========================================================================
// 3. Equipment Tracking (Live MySQL Integration & Auto-Refresh)
// ==========================================================================

/**
 * GET: Fetches all equipment records directly from MySQL database and renders UI table.
 */
async function fetchEquipment() {
    const listContainer = document.getElementById("equipment-list");
    if (!listContainer) return;

    try {
        const response = await fetch(EQUIPMENT_API, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            renderEquipmentTable(result.data);
        } else {
            listContainer.innerHTML = `<div class="empty-state"><p>No equipment records found in MySQL database.</p></div>`;
        }
    } catch (error) {
        console.error("[CleanRide] Error fetching equipment from MySQL:", error);
        listContainer.innerHTML = `
            <div class="empty-state">
                <p style="color:var(--error-text);">Could not load equipment from MySQL database.</p>
                <small style="color:var(--muted);">Verify Flask server is running at http://127.0.0.1:5000</small>
            </div>
        `;
        showStatus(`Equipment fetch error: ${error.message}`, "error");
    }
}

/**
 * Renders the equipment table from MySQL rows with full action handlers.
 */
function renderEquipmentTable(items) {
    const listContainer = document.getElementById("equipment-list");
    if (!listContainer) return;

    if (items.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <p>No equipment currently registered in MySQL database. Add an item above.</p>
            </div>
        `;
        return;
    }

    const rows = items.map(eq => `
        <tr>
            <td>
                <strong>${escapeHtml(eq.id)}</strong>
                <div><code>${escapeHtml(eq.serial_number || "No S/N")}</code></div>
            </td>
            <td>
                <div style="font-weight:700;">${escapeHtml(eq.name)}</div>
                <small style="color:var(--muted);">${escapeHtml(eq.category)}</small>
            </td>
            <td>${escapeHtml(eq.location || "HQ Store")}</td>
            <td>
                <span style="font-weight:700; color:var(--primary);">${escapeHtml(eq.status || "Available")}</span>
            </td>
            <td>
                <span class="badge" style="background:#eafaf1; color:#197042; padding:3px 8px; border-radius:4px; font-size:11px;">
                    ${escapeHtml(eq.condition || "Good")}
                </span>
            </td>
            <td>RM ${Number(eq.hourly_rate || 0).toFixed(2)}/hr</td>
            <td>
                <button type="button" class="btn btn-quiet btn-small" style="color:var(--error-text); border-color:var(--error-border);" data-action="delete-equipment" data-id="${escapeHtml(eq.id)}">Delete</button>
            </td>
        </tr>
    `).join("");

    listContainer.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID / Serial</th>
                        <th>Equipment / Category</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Condition</th>
                        <th>Rate</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * POST: Inserts a new equipment item into MySQL, then IMMEDIATELY re-fetches and updates table.
 */
async function handleEquipmentSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("eq-submit-btn");

    const name = document.getElementById("eq-name")?.value.trim();
    const category = document.getElementById("eq-category")?.value.trim();
    const serial = document.getElementById("eq-serial")?.value.trim();
    const location = document.getElementById("eq-location")?.value.trim() || "HQ Store";
    const condition = document.getElementById("eq-condition")?.value.trim() || "Good";
    const hourlyRate = parseFloat(document.getElementById("eq-rate")?.value || 0);
    const notes = document.getElementById("eq-notes")?.value.trim();

    if (!name) {
        showStatus("Please enter an equipment name.", "error");
        return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
        const payload = {
            name,
            category,
            serial_number: serial || `SN-EQ-${Date.now().toString(36).toUpperCase()}`,
            location,
            status: "Available",
            condition,
            hourly_rate: hourlyRate,
            notes
        };

        const response = await fetch(EQUIPMENT_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(`Equipment "${name}" successfully registered in MySQL database!`, "success");
            form.reset();

            // Strict Requirement: Auto-refresh equipment list immediately from MySQL without manual reload
            await fetchEquipment();
        } else {
            console.error("[CleanRide Equipment POST Error]:", data);
            showStatus(data.error || "Failed to save equipment to database.", "error");
        }
    } catch (err) {
        console.error("[CleanRide Equipment POST Network Error]:", err);
        showStatus(`Database insert error: ${err.message}. Check Flask server.`, "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

/**
 * DELETE: Removes an equipment record from MySQL and immediately refreshes table.
 */
async function handleEquipmentDelete(equipmentId) {
    if (!confirm(`Are you sure you want to delete equipment ${equipmentId} from the MySQL database?`)) {
        return;
    }

    try {
        const response = await fetch(`${EQUIPMENT_API}/${encodeURIComponent(equipmentId)}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(`Equipment ${equipmentId} deleted from MySQL database.`, "info");
            await fetchEquipment();
        } else {
            console.error("[CleanRide Equipment DELETE Error]:", data);
            showStatus(data.error || "Failed to delete equipment from database.", "error");
        }
    } catch (err) {
        console.error("[CleanRide Equipment DELETE Network Error]:", err);
        showStatus(`Network error deleting equipment: ${err.message}`, "error");
    }
}

// ==========================================================================
// 4. Booking Items Operations (GET & POST)
// ==========================================================================

async function fetchItems() {
    const listContainer = document.getElementById("items-list");
    if (!listContainer) return;

    try {
        const response = await fetch(ITEMS_API, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            renderItemsTable(result.data);
        } else {
            listContainer.innerHTML = `<div class="empty-state"><p>No items found in MySQL database.</p></div>`;
        }
    } catch (error) {
        console.error("[CleanRide] Error fetching items:", error);
        listContainer.innerHTML = `
            <div class="empty-state">
                <p style="color:var(--error-text);">Could not load items from MySQL database.</p>
                <small style="color:var(--muted);">Verify Flask server is active at http://127.0.0.1:5000</small>
            </div>
        `;
    }
}

function renderItemsTable(items) {
    const listContainer = document.getElementById("items-list");
    if (!listContainer) return;

    if (items.length === 0) {
        listContainer.innerHTML = `<div class="empty-state"><p>No service items found in MySQL. Add one above.</p></div>`;
        return;
    }

    const rows = items.map(item => `
        <tr>
            <td><strong>#${item.id}</strong></td>
            <td><code>${escapeHtml(item.booking_id)}</code></td>
            <td>${escapeHtml(item.item_label)}</td>
            <td>${Number(item.quantity).toLocaleString()}</td>
            <td>RM ${Number(item.unit_price).toFixed(2)}</td>
            <td><strong>RM ${Number(item.total_price).toFixed(2)}</strong></td>
        </tr>
    `).join("");

    listContainer.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Booking Ref</th>
                        <th>Service / Item</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

async function handleItemSubmit(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("item-submit-btn");

    const bookingId = document.getElementById("item-booking-id")?.value.trim();
    const itemLabel = document.getElementById("item-label")?.value.trim();
    const quantity = parseFloat(document.getElementById("item-quantity")?.value || 1);
    const unitPrice = parseFloat(document.getElementById("item-unit-price")?.value || 0);

    if (!bookingId || !itemLabel || isNaN(quantity) || isNaN(unitPrice)) {
        showStatus("Please provide valid Booking Ref, Item Label, Quantity, and Unit Price.", "error");
        return;
    }

    const totalPrice = Number((quantity * unitPrice).toFixed(2));

    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(ITEMS_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                booking_id: bookingId,
                item_label: itemLabel,
                quantity: quantity,
                unit_price: unitPrice,
                total_price: totalPrice
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(`Item "${itemLabel}" successfully recorded in MySQL!`, "success");

            const labelInput = document.getElementById("item-label");
            const priceInput = document.getElementById("item-unit-price");
            if (labelInput) labelInput.value = "";
            if (priceInput) priceInput.value = "";

            await fetchItems();
        } else {
            console.error("[CleanRide Item POST Error]:", data);
            showStatus(data.error || "Failed to insert item into database.", "error");
        }
    } catch (err) {
        console.error("[CleanRide Item Network Error]:", err);
        showStatus(`Database insert failed: ${err.message}. Ensure Flask backend is running.`, "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ==========================================================================
// 5. Bookings Operations (Direct MySQL Integration)
// ==========================================================================

async function fetchBookings() {
    const listContainer = document.getElementById("bookings-list");
    if (!listContainer) return;

    try {
        const response = await fetch(BOOKINGS_API, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            renderBookingsTable(result.data);
        } else {
            listContainer.innerHTML = `<div class="empty-state"><p>No bookings found in MySQL database.</p></div>`;
        }
    } catch (error) {
        console.error("[CleanRide] Error fetching bookings from MySQL:", error);
        listContainer.innerHTML = `
            <div class="empty-state">
                <p style="color:var(--error-text);">Could not load bookings from MySQL database.</p>
            </div>
        `;
    }
}

function renderBookingsTable(bookings) {
    const listContainer = document.getElementById("bookings-list");
    if (!listContainer) return;

    if (bookings.length === 0) {
        listContainer.innerHTML = `<div class="empty-state"><p>No bookings saved in database yet.</p></div>`;
        return;
    }

    const rows = bookings.map(b => `
        <tr>
            <td>
                <strong>${escapeHtml(b.id)}</strong>
                <div><small style="color:var(--muted);">${escapeHtml(b.service_type)}</small></div>
            </td>
            <td>
                <div>${escapeHtml(b.customer_name)}</div>
                <small style="color:var(--muted);">${escapeHtml(b.customer_phone)}</small>
            </td>
            <td>
                ${escapeHtml(b.appointment_date)}
                <div><small style="color:var(--muted);">${escapeHtml(b.arrival_window)}</small></div>
            </td>
            <td>
                <strong>RM ${Number(b.total_amount).toFixed(2)}</strong>
                <div><small style="color:var(--muted);">Bal: RM ${Number(b.balance_amount).toFixed(2)}</small></div>
            </td>
            <td>
                <span class="badge" style="background:#eafaf1; color:#197042; padding:3px 8px; border-radius:4px; font-size:11px;">
                    ${escapeHtml(b.status)}
                </span>
            </td>
        </tr>
    `).join("");

    listContainer.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Booking Ref</th>
                        <th>Customer</th>
                        <th>Appointment</th>
                        <th>Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

async function handleBookingSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("bk-submit-btn");

    const service = document.getElementById("bk-service")?.value;
    const date = document.getElementById("bk-date")?.value;
    const time = document.getElementById("bk-time")?.value || "09:00";
    const total = parseFloat(document.getElementById("bk-total")?.value || 0);
    const address = document.getElementById("bk-address")?.value.trim();
    const instructions = document.getElementById("bk-instructions")?.value.trim();

    if (!date || !address || total <= 0) {
        showStatus("Please provide date, address, and valid total amount.", "error");
        return;
    }

    const user = getActiveUser();
    const bookingId = `CR-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const deposit = Number((total * 0.2).toFixed(2));

    const payload = {
        id: bookingId,
        user_id: user?.id,
        customer_name: user?.name || "Customer",
        customer_email: user?.email || "customer@cleanride.local",
        customer_phone: user?.phone || "012-3456789",
        address,
        appointment_date: date,
        arrival_window: time,
        service_type: service,
        dirtiness: "Moderate",
        instructions,
        base_price: total,
        surcharge: 0.0,
        total_amount: total,
        deposit_amount: deposit,
        paid_amount: deposit,
        balance_amount: Number((total - deposit).toFixed(2)),
        status: "Pending",
        payment_status: "Deposit paid",
        items: [
            { label: `${service.toUpperCase()} Service`, qty: 1, unit_price: total, total_price: total }
        ]
    };

    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(BOOKINGS_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(`Booking ${bookingId} successfully recorded in MySQL!`, "success");
            form.reset();
            await fetchBookings();
        } else {
            console.error("[CleanRide Booking POST Error]:", data);
            showStatus(data.error || "Failed to create booking in database.", "error");
        }
    } catch (err) {
        console.error("[CleanRide Booking Network Error]:", err);
        showStatus(`Network error saving booking: ${err.message}`, "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ==========================================================================
// 6. Complaints & Feedback Operations (Direct MySQL Integration)
// ==========================================================================

async function fetchComplaints() {
    const listContainer = document.getElementById("complaints-list");
    if (!listContainer) return;

    try {
        const response = await fetch(COMPLAINTS_API, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            renderComplaintsTable(result.data);
        } else {
            listContainer.innerHTML = `<div class="empty-state"><p>No complaints found in MySQL database.</p></div>`;
        }
    } catch (error) {
        console.error("[CleanRide] Error fetching complaints:", error);
        listContainer.innerHTML = `
            <div class="empty-state">
                <p style="color:var(--error-text);">Could not load complaints from MySQL database.</p>
            </div>
        `;
    }
}

function renderComplaintsTable(complaints) {
    const listContainer = document.getElementById("complaints-list");
    if (!listContainer) return;

    if (complaints.length === 0) {
        listContainer.innerHTML = `<div class="empty-state"><p>No feedback or complaints submitted yet.</p></div>`;
        return;
    }

    const rows = complaints.map(c => `
        <tr>
            <td>
                <strong>${escapeHtml(c.id)}</strong>
                <div><code>${escapeHtml(c.booking_id)}</code></div>
            </td>
            <td>
                <strong>${escapeHtml(c.subject)}</strong>
                <div><small style="color:var(--muted);">${escapeHtml(c.description)}</small></div>
            </td>
            <td>${escapeHtml(c.category)}</td>
            <td>
                <span class="badge" style="background:#eafaf1; color:#197042; padding:3px 8px; border-radius:4px; font-size:11px;">
                    ${escapeHtml(c.status)}
                </span>
            </td>
            <td>
                <small>${escapeHtml(c.team_response || "Pending review")}</small>
            </td>
        </tr>
    `).join("");

    listContainer.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID / Booking</th>
                        <th>Subject &amp; Details</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Team Response</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

async function handleComplaintSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("cp-submit-btn");

    const bookingId = document.getElementById("cp-booking-id")?.value.trim();
    const category = document.getElementById("cp-category")?.value;
    const subject = document.getElementById("cp-subject")?.value.trim();
    const description = document.getElementById("cp-description")?.value.trim();

    if (!bookingId || !subject || !description) {
        showStatus("Please fill in booking reference, subject, and description.", "error");
        return;
    }

    const user = getActiveUser();
    const complaintId = `CC-${Math.floor(Math.random() * 9000 + 1000)}`;

    const payload = {
        id: complaintId,
        booking_id: bookingId,
        user_id: user?.id,
        category,
        subject,
        description,
        incident_date: new Date().toISOString().slice(0, 10),
        status: "In review"
    };

    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(COMPLAINTS_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(`Feedback ${complaintId} lodged successfully in MySQL!`, "success");
            form.reset();
            await fetchComplaints();
        } else {
            console.error("[CleanRide Complaint POST Error]:", data);
            showStatus(data.error || "Failed to submit feedback to database.", "error");
        }
    } catch (err) {
        console.error("[CleanRide Complaint Network Error]:", err);
        showStatus(`Network error lodging complaint: ${err.message}`, "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ==========================================================================
// 7. Operations Tab Navigation (Equipment, Items, Bookings, Complaints)
// ==========================================================================

function switchOpsTab(targetTab) {
    activeOpsTab = targetTab;

    const tabs = ["equipment", "items", "bookings", "complaints"];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const sec = document.getElementById(`${t}-section`);
        if (btn) btn.classList.toggle("active", t === targetTab);
        if (sec) sec.style.display = (t === targetTab) ? "block" : "none";
    });

    // Auto-refresh the selected section when clicked
    if (targetTab === "equipment") fetchEquipment();
    if (targetTab === "items") fetchItems();
    if (targetTab === "bookings") fetchBookings();
    if (targetTab === "complaints") fetchComplaints();
}

function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================================================
// 8. Initialization on DOMContentLoaded
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    console.log("[*] CleanRide client active. Connected to API at", API_BASE);

    // Hydrate existing user session badge
    const existingUser = getActiveUser();
    if (existingUser) {
        updateSessionUI(existingUser);
    }

    // Set today's date on booking form date picker
    const dateInput = document.getElementById("bk-date");
    if (dateInput) {
        dateInput.value = new Date().toISOString().slice(0, 10);
        dateInput.min = new Date().toISOString().slice(0, 10);
    }

    // Load initial data from MySQL database
    fetchEquipment();
    fetchItems();
    fetchBookings();
    fetchComplaints();

    // Auth tab switching
    document.getElementById("tab-signin")?.addEventListener("click", () => {
        activeAuthMode = "signin";
        clearStatus();
        updateAuthView();
    });

    document.getElementById("tab-signup")?.addEventListener("click", () => {
        activeAuthMode = "signup";
        clearStatus();
        updateAuthView();
    });

    // Operations tab switching
    document.getElementById("tab-equipment")?.addEventListener("click", () => switchOpsTab("equipment"));
    document.getElementById("tab-items")?.addEventListener("click", () => switchOpsTab("items"));
    document.getElementById("tab-bookings")?.addEventListener("click", () => switchOpsTab("bookings"));
    document.getElementById("tab-complaints")?.addEventListener("click", () => switchOpsTab("complaints"));

    // Form Submissions
    document.getElementById("register-form")?.addEventListener("submit", handleRegister);
    document.getElementById("login-form")?.addEventListener("submit", handleLogin);
    document.getElementById("admin-code-form")?.addEventListener("submit", handleAdminCodeSubmit);
    document.getElementById("btn-cancel-pin")?.addEventListener("click", hideAdminCodePrompt);

    // Operations form submissions
    document.getElementById("equipment-form")?.addEventListener("submit", handleEquipmentSubmit);
    document.getElementById("item-form")?.addEventListener("submit", handleItemSubmit);
    document.getElementById("booking-form")?.addEventListener("submit", handleBookingSubmit);
    document.getElementById("complaint-form")?.addEventListener("submit", handleComplaintSubmit);

    // Refresh Buttons
    document.getElementById("btn-refresh-equipment")?.addEventListener("click", () => {
        showStatus("Refreshing equipment register from MySQL...", "info");
        fetchEquipment();
    });
    document.getElementById("btn-refresh-items")?.addEventListener("click", () => {
        showStatus("Refreshing items from MySQL...", "info");
        fetchItems();
    });
    document.getElementById("btn-refresh-bookings")?.addEventListener("click", () => {
        showStatus("Refreshing bookings from MySQL...", "info");
        fetchBookings();
    });
    document.getElementById("btn-refresh-complaints")?.addEventListener("click", () => {
        showStatus("Refreshing feedback from MySQL...", "info");
        fetchComplaints();
    });

    // Event delegation for table action buttons (e.g., delete equipment)
    document.addEventListener("click", (e) => {
        const delBtn = e.target.closest('[data-action="delete-equipment"]');
        if (delBtn) {
            const eqId = delBtn.dataset.id;
            if (eqId) handleEquipmentDelete(eqId);
        }
    });

    // Logout
    document.getElementById("header-logout-btn")?.addEventListener("click", () => {
        if (window.CleanRide?.setState && window.CleanRide?.getState) {
            const state = window.CleanRide.getState();
            state.session = null;
            window.CleanRide.setState();
        }
        currentSessionUser = null;
        updateSessionUI(null);
        showStatus("You have been signed out.", "info");
    });
});
