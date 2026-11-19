/**
 * CleanRide — Login & Account Creation
 * Secure authentication module delegating all credential checks to the backend server.
 */
(() => {
    "use strict";

    const { getState, setState, toast } = window.CleanRide;
    const state = getState();

    // Base API URL for authentication
    const AUTH_API = "http://127.0.0.1:5000/api/auth";

    // Helper to store session and synchronize state.users
    function saveSessionUser(userData, fallbackRole = "customer") {
        const sessionUser = {
            id: userData.id || (fallbackRole === "owner" ? "USR-ADMIN-01" : "USR-DEMO"),
            name: userData.name || (fallbackRole === "owner" ? "Admin CleanRide" : "Customer"),
            email: userData.email || "",
            phone: userData.phone || "",
            role: userData.role || fallbackRole
        };
        state.session = sessionUser;
        if (!Array.isArray(state.users)) state.users = [];
        const idx = state.users.findIndex(u => u.id === sessionUser.id);
        if (idx >= 0) {
            state.users[idx] = sessionUser;
        } else {
            state.users.push(sessionUser);
        }
        setState();
    }

    // If already logged in, verify session validity before redirecting to prevent bounce loops
    if (state.session && state.session.role) {
        const u = (state.users || []).find(x => x.id === state.session.id);
        if (u) {
            if (u.role === "owner") {
                window.location.replace("../owner/owner.html");
                return;
            } else {
                window.location.replace("../customer/customer.html");
                return;
            }
        } else {
            // Desynced session — clear to prevent redirect loop
            state.session = null;
            setState();
        }
    }

    let authMode = "signin";
    let pendingAdminUsername = null; // Stored temporarily in memory during 2FA step

    const authHeading = document.getElementById("auth-heading");
    const authSubheading = document.getElementById("auth-subheading");
    const authSubmit = document.getElementById("auth-submit");
    const authFields = document.getElementById("auth-fields");
    const authForm = document.getElementById("auth-form");
    const tabSignin = document.getElementById("tab-signin");
    const tabSignup = document.getElementById("tab-signup");
    const loginTabs = document.querySelector(".login-tabs");
    const adminCodeContainer = document.getElementById("admin-code-container");

    function renderAuthFields() {
        if (!authFields) return;

        hideAdminCodePrompt();

        if (authMode === "signin") {
            authHeading.textContent = "Sign in to CleanRide";
            authSubheading.textContent = "Manage bookings and services.";
            authSubmit.textContent = "Sign in";
            tabSignin.classList.add("active");
            tabSignup.classList.remove("active");

            // Generic, secure placeholder with no account hints
            authFields.innerHTML = `
                <div class="field full">
                    <label for="input-email">Username or Email</label>
                    <input class="input" id="input-email" name="email" type="text" required autocomplete="username" placeholder="Enter your username or email">
                </div>
                <div class="field full">
                    <label for="input-password">Password</label>
                    <input class="input" id="input-password" name="password" type="password" required minlength="4" autocomplete="current-password" placeholder="••••••••">
                </div>
            `;
        } else {
            authHeading.textContent = "Create your account";
            authSubheading.textContent = "Book home cleaning & rent tools easily.";
            authSubmit.textContent = "Create account";
            tabSignup.classList.add("active");
            tabSignin.classList.remove("active");

            authFields.innerHTML = `
                <div class="field full">
                    <label for="input-name">Your full name</label>
                    <input class="input" id="input-name" name="name" required minlength="2" autocomplete="name" placeholder="e.g. Aisha Rahman">
                </div>
                <div class="field full">
                    <label for="input-phone">Phone number</label>
                    <input class="input" id="input-phone" name="phone" required pattern="[0-9+() .-]{8,18}" placeholder="e.g. 012-345 6789">
                </div>
                <div class="field full">
                    <label for="input-email">Email address</label>
                    <input class="input" id="input-email" name="email" type="email" required autocomplete="username" placeholder="e.g. user@example.com">
                </div>
                <div class="field full">
                    <label for="input-password">Password</label>
                    <input class="input" id="input-password" name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="At least 6 characters">
                </div>
            `;
        }
    }

    // Displays the 4-digit code entry view (verification handled strictly by server)
    function showAdminCodePrompt(username) {
        pendingAdminUsername = username;

        authForm.style.display = "none";
        if (loginTabs) loginTabs.style.display = "none";

        authHeading.textContent = "Admin Security Verification";
        authSubheading.textContent = "Two-step verification required for administrator access.";

        adminCodeContainer.innerHTML = `
            <div class="admin-code-box">
                <div class="admin-code-shield">🔒</div>
                <p style="font-size:12px;color:var(--ink);font-weight:600;margin-bottom:6px;">
                    Administrator Account Verified
                </p>
                <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">
                    Please enter your 4-digit security code to proceed.
                </p>
                <form id="admin-code-form">
                    <div class="code-input-wrapper">
                        <input type="password" id="admin-pin" class="pin-input" maxlength="4" pattern="[0-9]{4}" placeholder="••••" required autofocus autocomplete="one-time-code">
                    </div>
                    <div class="code-actions">
                        <button type="submit" class="btn btn-primary" style="width:100%" id="btn-verify-pin">Verify Code & Enter</button>
                        <button type="button" class="btn btn-quiet btn-small" id="btn-cancel-pin">Back to Sign in</button>
                    </div>
                </form>
            </div>
        `;

        adminCodeContainer.style.display = "block";

        const pinInput = document.getElementById("admin-pin");
        if (pinInput) pinInput.focus();

        // Submit 4-digit code to server for secure validation
        document.getElementById("admin-code-form")?.addEventListener("submit", async e => {
            e.preventDefault();
            const pinBtn = document.getElementById("btn-verify-pin");
            const enteredPin = document.getElementById("admin-pin")?.value.trim();

            if (!enteredPin || enteredPin.length !== 4) {
                toast("Please enter a valid 4-digit code.");
                return;
            }

            if (pinBtn) pinBtn.disabled = true;

            try {
                const response = await fetch(`${AUTH_API}/verify-admin-code`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        code: enteredPin,
                        username: pendingAdminUsername
                    })
                });

                const data = await response.json();

                if (response.ok && data.success && data.verified) {
                    toast("Security code accepted. Access granted.");

                    // Store session and sync users list
                    saveSessionUser(data.user || { id: "USR-ADMIN-01", name: pendingAdminUsername }, "owner");

                    setTimeout(() => {
                        window.location.href = "../owner/owner.html";
                    }, 400);

                } else {
                    toast(data.error || "Invalid 4-digit code. Access denied.");
                    const pinEl = document.getElementById("admin-pin");
                    if (pinEl) {
                        pinEl.value = "";
                        pinEl.style.borderColor = "#dc3545";
                        pinEl.focus();
                    }
                }
            } catch (err) {
                console.error("Verification server error:", err);
                toast("Cannot connect to server. Ensure Flask backend is running.");
            } finally {
                if (pinBtn) pinBtn.disabled = false;
            }
        });

        document.getElementById("btn-cancel-pin")?.addEventListener("click", () => {
            hideAdminCodePrompt();
        });
    }

    function hideAdminCodePrompt() {
        pendingAdminUsername = null;
        if (adminCodeContainer) {
            adminCodeContainer.innerHTML = "";
            adminCodeContainer.style.display = "none";
        }
        if (authForm) authForm.style.display = "block";
        if (loginTabs) loginTabs.style.display = "flex";
        authHeading.textContent = "Sign in to CleanRide";
        authSubheading.textContent = "Manage bookings and services.";
    }

    tabSignin.addEventListener("click", () => {
        authMode = "signin";
        renderAuthFields();
    });

    tabSignup.addEventListener("click", () => {
        authMode = "signup";
        renderAuthFields();
    });

    // Form Submission: delegates completely to backend server API
    authForm.addEventListener("submit", async e => {
        e.preventDefault();
        if (!authForm.reportValidity()) return;

        const fd = new FormData(authForm);
        const identifier = String(fd.get("email")).trim();
        const password = String(fd.get("password"));

        authSubmit.disabled = true;

        if (authMode === "signin") {
            try {
                const res = await fetch(`${AUTH_API}/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: identifier,
                        password: password
                    })
                });

                const data = await res.json();

                if (!res.ok || !data.success) {
                    toast(data.error || "Invalid username/email or password.");
                    authSubmit.disabled = false;
                    return;
                }

                // If owner account: server signals that 4-digit code is required
                if (data.requires_code && data.role === "owner") {
                    showAdminCodePrompt(data.username || identifier);
                    authSubmit.disabled = false;
                    return;
                }

                // If customer account: save session and redirect
                saveSessionUser(data.user, "customer");
                toast(`Welcome back, ${(data.user.name || "Customer").split(" ")[0]}.`);

                setTimeout(() => {
                    window.location.href = "../customer/customer.html";
                }, 300);

            } catch (err) {
                console.error("Login network error:", err);
                toast("Server unreachable. Please ensure the Python Flask backend is running.");
                authSubmit.disabled = false;
            }

        } else {
            // Customer Registration via backend API
            const name = String(fd.get("name")).trim();
            const phone = String(fd.get("phone")).trim();

            try {
                const res = await fetch(`${AUTH_API}/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name,
                        email: identifier,
                        phone,
                        password
                    })
                });

                const data = await res.json();

                if (!res.ok || !data.success) {
                    toast(data.error || "Registration failed. Please try again.");
                    authSubmit.disabled = false;
                    return;
                }

                saveSessionUser(data.user, "customer");
                toast("Account created successfully!");

                setTimeout(() => {
                    window.location.href = "../customer/customer.html";
                }, 300);

            } catch (err) {
                console.error("Registration network error:", err);
                toast("Server unreachable. Please ensure the Python Flask backend is running.");
                authSubmit.disabled = false;
            }
        }
    });

    // Initial render
    renderAuthFields();
})();
