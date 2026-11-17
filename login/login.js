/**
 * CleanRide — Login & Account Creation
 */
(() => {
    "use strict";

    const { getState, setState, uniqueId, toast } = window.CleanRide;
    const state = getState();

    // If already logged in, redirect immediately to the respective portal
    if (state.session) {
        const currentUser = state.users.find(u => u.id === state.session.id);
        if (currentUser) {
            if (currentUser.role === "owner") {
                window.location.replace("../owner/owner.html");
                return;
            } else {
                window.location.replace("../customer/customer.html");
                return;
            }
        }
    }

    let authMode = "signin";

    const authHeading = document.getElementById("auth-heading");
    const authSubheading = document.getElementById("auth-subheading");
    const authSubmit = document.getElementById("auth-submit");
    const authFields = document.getElementById("auth-fields");
    const authForm = document.getElementById("auth-form");
    const tabSignin = document.getElementById("tab-signin");
    const tabSignup = document.getElementById("tab-signup");

    function renderAuthFields() {
        if (!authFields) return;

        if (authMode === "signin") {
            authHeading.textContent = "Sign in to CleanRide";
            authSubheading.textContent = "Manage bookings and services.";
            authSubmit.textContent = "Sign in";
            tabSignin.classList.add("active");
            tabSignup.classList.remove("active");

            authFields.innerHTML = `
                <div class="field full">
                    <label for="input-email">Email address</label>
                    <input class="input" id="input-email" name="email" type="email" required autocomplete="username" placeholder="e.g. aisha@example.com">
                </div>
                <div class="field full">
                    <label for="input-password">Password</label>
                    <input class="input" id="input-password" name="password" type="password" required minlength="6" autocomplete="current-password" placeholder="••••••••">
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

    tabSignin.addEventListener("click", () => {
        authMode = "signin";
        renderAuthFields();
    });

    tabSignup.addEventListener("click", () => {
        authMode = "signup";
        renderAuthFields();
    });

    // Form Submission
    authForm.addEventListener("submit", e => {
        e.preventDefault();
        if (!authForm.reportValidity()) return;

        const fd = new FormData(authForm);
        const email = String(fd.get("email")).trim().toLowerCase();
        const password = String(fd.get("password"));

        if (authMode === "signin") {
            const found = state.users.find(u => u.email.toLowerCase() === email && u.password === password);
            if (!found) {
                toast("Email or password is incorrect. Please try again.");
                return;
            }
            state.session = { id: found.id, role: found.role };
            setState();
            toast(`Welcome back, ${found.name.split(" ")[0]}.`);

            setTimeout(() => {
                if (found.role === "owner") {
                    window.location.href = "../owner/owner.html";
                } else {
                    window.location.href = "../customer/customer.html";
                }
            }, 300);
        } else {
            if (state.users.some(u => u.email.toLowerCase() === email)) {
                toast("An account already uses that email.");
                return;
            }
            const newUser = {
                id: uniqueId("USR"),
                name: String(fd.get("name")).trim(),
                email,
                phone: String(fd.get("phone")).trim(),
                password,
                role: "customer"
            };
            state.users.push(newUser);
            state.session = { id: newUser.id, role: newUser.role };
            setState();
            toast("Your demo account is ready.");

            setTimeout(() => {
                window.location.href = "../customer/customer.html";
            }, 300);
        }
    });

    // Demo Fill Helpers
    document.getElementById("fill-customer")?.addEventListener("click", () => {
        authMode = "signin";
        renderAuthFields();
        const emailInput = document.getElementById("input-email");
        const passInput = document.getElementById("input-password");
        if (emailInput && passInput) {
            emailInput.value = "aisha@example.com";
            passInput.value = "cleanride123";
        }
    });

    document.getElementById("fill-owner")?.addEventListener("click", () => {
        authMode = "signin";
        renderAuthFields();
        const emailInput = document.getElementById("input-email");
        const passInput = document.getElementById("input-password");
        if (emailInput && passInput) {
            emailInput.value = "owner@cleanride.my";
            passInput.value = "owner123";
        }
    });

    // Initial render
    renderAuthFields();
})();
