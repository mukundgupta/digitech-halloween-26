// =========================================================
//  VISITOR PAGE
//  - Two buttons: SUMMON THE SPIRIT / I HAVE FINISHED
//  - On "Finished": create a new session (status "asking")
//  - Then listen for the answer and reveal it letter by letter
//  No authentication, minimal logic.
// =========================================================

import { db } from "./firebase-config.js";
import {
    ref,
    set,
    onValue,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const askScreen = document.getElementById("askScreen");
const revealScreen = document.getElementById("revealScreen");

const summonButton = document.getElementById("summonButton");
const finishedButton = document.getElementById("finishedButton");
const status = document.getElementById("status");

const revealStatus = document.getElementById("revealStatus");
const revealText = document.getElementById("revealText");

const sessionRef = ref(db, "session");

// Which session id this phone created / is currently watching.
let mySessionId = null;
// Guard so we only reveal the answer once per session.
let revealedForId = null;

// Simple unique id for each interaction.
function makeSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function showScreen(which) {
    askScreen.classList.toggle("active", which === "ask");
    revealScreen.classList.toggle("active", which === "reveal");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------
//  Button 1: SUMMON — just arms the "Finished" button.
//  (No Firebase write needed; the spirit is "summoned"
//  locally so the visitor has a clear two-step ritual.)
// ---------------------------------------------------------
summonButton.addEventListener("click", () => {
    finishedButton.disabled = false;
    summonButton.disabled = true;
    status.textContent = "SPEAK YOUR QUESTION...";
});

// ---------------------------------------------------------
//  Button 2: FINISHED — create a new session in Firebase.
// ---------------------------------------------------------
finishedButton.addEventListener("click", () => {
    if (finishedButton.disabled) return;

    mySessionId = makeSessionId();
    revealedForId = null;

    // Create a fresh session. This replaces any previous one,
    // which also clears a stale answer/source from last time.
    set(sessionRef, {
        id: mySessionId,
        status: "asking",
        answer: "",
        source: "",
    }).catch((err) => {
        console.error("[Visitor] Failed to create session:", err);
        status.textContent = "CONNECTION ERROR - TRY AGAIN";
    });

    // Move to the waiting / reveal screen.
    showScreen("reveal");
    revealStatus.textContent = "The board is listening...";
    revealText.textContent = "";
});

// ---------------------------------------------------------
//  Listen for the answer to OUR session, then reveal it.
// ---------------------------------------------------------
onValue(sessionRef, (snapshot) => {
    const session = snapshot.val();
    if (!session) return;

    // Only react to the session this phone created.
    if (session.id !== mySessionId) return;

    if (session.status === "answered" && revealedForId !== session.id) {
        revealedForId = session.id; // reveal exactly once
        revealAnswer(session.answer || "");
    }
});

// ---------------------------------------------------------
//  Reveal the answer one character at a time on the phone.
//  (Adapted cadence from the board's spellResponse: ~650ms
//  per letter, ~350ms per space. No planchette here.)
// ---------------------------------------------------------
async function revealAnswer(answer) {
    revealStatus.textContent = "THE SPIRIT ANSWERS";
    revealText.textContent = "";

    const characters = answer.split("");

    for (const character of characters) {
        revealText.textContent += character;
        await sleep(character === " " ? 350 : 650);
    }

    // Hold the full answer briefly so it can be read.
    await sleep(3500);

    // Return to the idle screen, ready for the next visitor.
    resetToIdle();
}

function resetToIdle() {
    mySessionId = null;
    showScreen("ask");
    status.textContent = "READY";
    summonButton.disabled = false;
    finishedButton.disabled = true;
}

// ---------------------------------------------------------
//  Connection status (nice-to-have feedback on idle screen).
// ---------------------------------------------------------
const connectedRef = ref(db, ".info/connected");
onValue(connectedRef, (snapshot) => {
    if (askScreen.classList.contains("active")) {
        status.textContent = snapshot.val() === true ? "READY" : "CONNECTION LOST";
    }
});
