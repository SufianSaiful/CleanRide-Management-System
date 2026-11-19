/**
 * CleanRide - script.js
 * Synchronized frontend client connecting index.html to Flask backend at http://127.0.0.1:5000
 */

// API Base Endpoints
const API_BASE = "http://127.0.0.1:5000/api";
const ITEMS_API = `${API_BASE}/items`;
const AUTH_API = `${API_BASE}/auth`;

// State tracking in memory
let activeAuthMode = "signin";
let pendingAdminUsername = null;

// ==========================================================================
// 1. Status & Non-Shifting Alert System
// ==========================================================================

let statusTimeout = null;

function showStatus(message, type = "success") {
    const container = document.getElementById("status-container");
    if (!container) return;

    clearTimeout(statusTimeout);

    // Apply clean classes without changing layout structure
    container.className = `status-container ${type}`;
    container.textContent = message;
    container.style.display = "flex";

    // Auto-dismiss success and info alerts after 5 seconds
    if (type === "success" || type === "info") {
        statusTimeout = setTimeout(() => {
            container.style.display = "none";
            container.className = "status-container";
        }, 5000);
    }
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

function updateAuthView() {
    const tabSignin = document.getElementById("tab-signin");
    const tabSignup = document.getElementById("tab-signup");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const adminCodeContainer = document.getElementById("admin-code-container");
    const authTitle = document.getElementById("auth-title");
    const authSubtitle = document.getElementById("auth-subtitle");

    // Hide admin code prompt if switching tabs
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
    const authTabs = document.getElementById("auth-tabs");

    if (user && user.role) {
        if (badgeContainer) badgeContainer.style.display = "flex";
        if (badge) badge.textContent = `${user.name || "User"} (${user.role.toUpperCase()})`;
    } else {
        if (badgeContainer) badgeContainer.style.display = "none";
    }
}

// ==========================================================================
// 3. Form Submission Listeners
// ==========================================================================

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
            showStatus("Account created successfully! You can now sign in below.", "success");

            // Switch cleanly to signin tab without breaking layout
            activeAuthMode = "signin";
            updateAuthView();

            const usernameInput = document.getElementById("login-username");
            if (usernameInput) {
                usernameInput.value = email;
                document.getElementById("login-password")?.focus();
            }
        } else {
            showStatus(data.error || "Registration failed. Please try again.", "error");
        }
    } catch (err) {
        console.error("Registration error:", err);
        showStatus("Server unreachable. Please verify that the Flask backend is running.", "error");
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
            showStatus(data.error || "Invalid username or password.", "error");
            return;
        }

        // If owner account: server signals that 4-digit code is required
        if (data.requires_code && data.role === "owner") {
            pendingAdminUsername = data.username || username;
            showAdminCodePrompt(pendingAdminUsername);
            showStatus("Admin credentials verified. Please enter the 4-digit security code.", "info");
            return;
        }

        // Customer login successful
        showStatus(`Welcome back, ${data.user?.name || "Customer"}! Signed in successfully.`, "success");
        updateSessionUI(data.user);

        // Store session in common.js state if present
        if (window.CleanRide?.setState && window.CleanRide?.getState) {
            const state = window.CleanRide.getState();
            state.session = { id: data.user.id, name: data.user.name, role: "customer" };
            window.CleanRide.setState();
        }

    } catch (err) {
        console.error("Sign in error:", err);
        showStatus("Unable to connect to authentication server. Check Flask backend at http://127.0.0.1:5000.", "error");
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

            if (window.CleanRide?.setState && window.CleanRide?.getState) {
                const state = window.CleanRide.getState();
                state.session = { id: data.user.id, name: data.user.name, role: "owner" };
                window.CleanRide.setState();
            }

            // Redirect option
            setTimeout(() => {
                window.location.href = "./owner/owner.html";
            }, 600);

        } else {
            showStatus(data.error || "Invalid 4-digit code. Access denied.", "error");
            if (pinInput) {
                pinInput.value = "";
                pinInput.focus();
            }
        }
    } catch (err) {
        console.error("Code verification error:", err);
        showStatus("Verification server error. Check Flask backend.", "error");
    } finally {
        if (verifyBtn) verifyBtn.disabled = false;
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
            listContainer.innerHTML = `<div class="empty-state"><p>No items found in database.</p></div>`;
        }
    } catch (error) {
        console.error("Error fetching items:", error);
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
        listContainer.innerHTML = `<div class="empty-state"><p>No service items found. Add one above.</p></div>`;
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
            showStatus(`Item "${itemLabel}" recorded successfully to MySQL database!`, "success");

            // Reset only label and price, keep booking ID for rapid entry
            const labelInput = document.getElementById("item-label");
            const priceInput = document.getElementById("item-unit-price");
            if (labelInput) labelInput.value = "";
            if (priceInput) priceInput.value = "";

            // Refresh table
            await fetchItems();
        } else {
            showStatus(data.error || "Failed to insert item into database.", "error");
        }
    } catch (err) {
        console.error("Error creating item:", err);
        showStatus("Database insert failed. Ensure backend server is running.", "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
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
// 5. Initialization on DOMContentLoaded
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    console.log("[*] CleanRide UI synchronized with backend at", API_BASE);

    // Initial item fetch from MySQL
    fetchItems();

    // Tab switching
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

    // Form Submissions
    document.getElementById("register-form")?.addEventListener("submit", handleRegister);
    document.getElementById("login-form")?.addEventListener("submit", handleLogin);
    document.getElementById("admin-code-form")?.addEventListener("submit", handleAdminCodeSubmit);
    document.getElementById("btn-cancel-pin")?.addEventListener("click", hideAdminCodePrompt);

    // Item form & refresh button
    document.getElementById("item-form")?.addEventListener("submit", handleItemSubmit);
    document.getElementById("btn-refresh-items")?.addEventListener("click", () => {
        showStatus("Refreshing items from MySQL database...", "info");
        fetchItems();
    });

    // Logout
    document.getElementById("header-logout-btn")?.addEventListener("click", () => {
        if (window.CleanRide?.setState && window.CleanRide?.getState) {
            const state = window.CleanRide.getState();
            state.session = null;
            window.CleanRide.setState();
        }
        updateSessionUI(null);
        showStatus("You have been signed out.", "info");
    });
});
