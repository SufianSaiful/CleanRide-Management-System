/**
 * CleanRide Management System - Authentication & Session Helper
 * Modularized authentication system with role-based routing
 */
(() => {
  "use strict";

  function getStore() {
    return window.CleanRideStore ? window.CleanRideStore.getStore() : null;
  }

  function saveStore() {
    if (window.CleanRideStore) window.CleanRideStore.saveStore();
  }

  function getCurrentSession() {
    const s = getStore();
    if (!s || !s.session) return null;
    const user = (s.users || []).find(u => u.id === s.session.id);
    return user || null;
  }

  function setCurrentSession(user) {
    const s = getStore();
    if (!s) return;
    s.session = { id: user.id, role: user.role };
    saveStore();
  }

  function clearCurrentSession() {
    const s = getStore();
    if (!s) return;
    s.session = null;
    saveStore();
  }

  function loginUser(email, password) {
    const s = getStore();
    if (!s) return { success: false, message: "Storage unavailable" };

    const normEmail = String(email || "").trim().toLowerCase();
    const cleanPass = String(password || "").trim();

    // 1. Direct match in users list
    let user = (s.users || []).find(
      u => u.email.toLowerCase() === normEmail && u.password === cleanPass
    );

    // 2. Friendly fallback for standard demo credentials
    if (!user) {
      if ((normEmail === "aisha@example.com" || normEmail === "customer@cleanride.com") &&
          (cleanPass === "cleanride123" || cleanPass === "password123")) {
        user = s.users.find(u => u.email === "aisha@example.com") || {
          id: "u-customer",
          name: "Aisha Rahman",
          email: "aisha@example.com",
          phone: "012-345 6789",
          role: "customer"
        };
      } else if ((normEmail === "owner@cleanride.my" || normEmail === "owner@cleanride.com") &&
                 (cleanPass === "owner123" || cleanPass === "admin123")) {
        user = s.users.find(u => u.email === "owner@cleanride.my") || {
          id: "u-owner",
          name: "Sufian",
          email: "owner@cleanride.my",
          phone: "03-5550 0188",
          role: "owner"
        };
      }
    }

    if (user) {
      setCurrentSession(user);
      return { success: true, user };
    }

    return {
      success: false,
      message: "Email or password did not match a demo account."
    };
  }

  function registerUser(name, email, phone, password, role = "customer") {
    const s = getStore();
    if (!s) return { success: false, message: "Storage unavailable" };

    const normEmail = String(email || "").trim().toLowerCase();
    if ((s.users || []).some(u => u.email.toLowerCase() === normEmail)) {
      return { success: false, message: "An account already exists with that email." };
    }

    const newUser = {
      id: window.CleanRideStore.uniqueId("USR"),
      name: String(name || "").trim(),
      email: normEmail,
      phone: String(phone || "").trim(),
      password: String(password || ""),
      role: role
    };

    s.users.push(newUser);
    setCurrentSession(newUser);
    saveStore();

    return { success: true, user: newUser };
  }

  function logoutUser(fallbackPath = "../login.html") {
    clearCurrentSession();
    window.location.href = fallbackPath;
  }

  function requireAuth(roleRequired, fallbackPath = "../login.html") {
    const user = getCurrentSession();
    if (!user) {
      window.location.href = fallbackPath;
      return null;
    }
    if (roleRequired && user.role !== roleRequired) {
      // If wrong role, navigate to their proper portal
      if (user.role === "owner") {
        window.location.href = "../owner/owner.html";
      } else {
        window.location.href = "../customer/customer.html";
      }
      return null;
    }
    return user;
  }

  // Public CleanRideAuth API attached to window
  window.CleanRideAuth = {
    getCurrentSession,
    setCurrentSession,
    clearCurrentSession,
    loginUser,
    registerUser,
    logoutUser,
    requireAuth
  };
})();
