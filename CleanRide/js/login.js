/**
 * CleanRide Management System - Login Page Controller
 */
(() => {
  "use strict";

  let currentMode = "signin";

  function initLoginPage() {
    const tabSignin = document.getElementById("tabSignin");
    const tabSignup = document.getElementById("tabSignup");
    const signinForm = document.getElementById("signinForm");
    const signupForm = document.getElementById("signupForm");
    const demoCustomerBtn = document.getElementById("demoCustomerBtn");
    const demoOwnerBtn = document.getElementById("demoOwnerBtn");

    if (tabSignin && tabSignup) {
      tabSignin.addEventListener("click", () => switchAuthTab("signin"));
      tabSignup.addEventListener("click", () => switchAuthTab("signup"));
    }

    if (signinForm) {
      signinForm.addEventListener("submit", handleSignIn);
    }

    if (signupForm) {
      signupForm.addEventListener("submit", handleSignUp);
    }

    if (demoCustomerBtn) {
      demoCustomerBtn.addEventListener("click", () => {
        switchAuthTab("signin");
        document.getElementById("signinEmail").value = "aisha@example.com";
        document.getElementById("signinPassword").value = "cleanride123";
        showToast("Filled demo customer credentials. Click 'Sign In' to proceed.");
      });
    }

    if (demoOwnerBtn) {
      demoOwnerBtn.addEventListener("click", () => {
        switchAuthTab("signin");
        document.getElementById("signinEmail").value = "owner@cleanride.my";
        document.getElementById("signinPassword").value = "owner123";
        showToast("Filled demo owner credentials. Click 'Sign In' to proceed.");
      });
    }
  }

  function switchAuthTab(mode) {
    currentMode = mode;
    const tabSignin = document.getElementById("tabSignin");
    const tabSignup = document.getElementById("tabSignup");
    const signinForm = document.getElementById("signinForm");
    const signupForm = document.getElementById("signupForm");
    const authHeading = document.getElementById("authHeading");

    if (mode === "signin") {
      tabSignin.classList.add("active");
      tabSignup.classList.remove("active");
      signinForm.style.display = "flex";
      signupForm.style.display = "none";
      if (authHeading) authHeading.textContent = "Sign in to CleanRide";
    } else {
      tabSignin.classList.remove("active");
      tabSignup.classList.add("active");
      signinForm.style.display = "none";
      signupForm.style.display = "flex";
      if (authHeading) authHeading.textContent = "Create Customer Account";
    }
  }

  function handleSignIn(e) {
    e.preventDefault();
    const email = document.getElementById("signinEmail").value;
    const password = document.getElementById("signinPassword").value;

    const res = window.CleanRideAuth.loginUser(email, password);
    if (res.success) {
      showToast(`Welcome back, ${res.user.name.split(" ")[0]}! Redirecting...`);
      setTimeout(() => {
        if (res.user.role === "owner") {
          window.location.href = "owner/owner.html";
        } else {
          window.location.href = "customer/customer.html";
        }
      }, 500);
    } else {
      showToast(res.message || "Invalid credentials. Please try again.");
    }
  }

  function handleSignUp(e) {
    e.preventDefault();
    const name = document.getElementById("signupName").value;
    const email = document.getElementById("signupEmail").value;
    const phone = document.getElementById("signupPhone").value;
    const password = document.getElementById("signupPassword").value;

    const res = window.CleanRideAuth.registerUser(name, email, phone, password, "customer");
    if (res.success) {
      showToast(`Account created for ${name}! Redirecting to customer portal...`);
      setTimeout(() => {
        window.location.href = "customer/customer.html";
      }, 600);
    } else {
      showToast(res.message || "Unable to register account.");
    }
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
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
  }

  document.addEventListener("DOMContentLoaded", initLoginPage);
})();
