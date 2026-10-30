// =========================================================
//  SHARED FIREBASE CONFIG + CONNECTION
//  Used by index.html (board), trigger.html (visitor),
//  and volunteer.html (operator).
//
//  Uses the modular Firebase v10 SDK loaded from the CDN.
//  No build step, no bundler.
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ---------------------------------------------------------
//  TODO: Replace these placeholders with your own Firebase
//  web app config (Firebase Console -> Project settings ->
//  "Your apps" -> Web app -> SDK setup and configuration).
//
//  NOTE: The web API key below is NOT a secret. It is safe
//  to ship in frontend code. Do not put any service-account
//  key or private credential here.
// ---------------------------------------------------------
export const firebaseConfig = {
  apiKey: "AIzaSyA7uU19uV6vs6e-ypjIp2v9zWoPbSqz6RI",
  authDomain: "halloween-ouija.firebaseapp.com",
  databaseURL:
    "https://halloween-ouija-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "halloween-ouija",
  storageBucket: "halloween-ouija.firebasestorage.app",
  messagingSenderId: "1066427400063",
  appId: "1:1066427400063:web:6c12629aba261d6ae9644a",
};

// Initialise once and share the same app + database instance
// across all three pages that import this module.
const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
