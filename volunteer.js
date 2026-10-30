// =========================================================
//  VOLUNTEER (OPERATOR) PAGE
//  - Reports presence: /volunteerOnline = true (false on disconnect)
//  - Reports typing:   /typing = true/false
//  - Shows the answer box when a session is "asking"
//  - Submits an answer only if the session is still "asking"
//  No authentication (supervised single-volunteer event).
// =========================================================

import { db } from "./firebase-config.js";
import {
    ref,
    set,
    get,
    update,
    onValue,
    onDisconnect,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const status = document.getElementById("status");
const answerArea = document.getElementById("answerArea");
const answerInput = document.getElementById("answer");
const sendButton = document.getElementById("sendButton");
const presenceButton = document.getElementById("presenceButton");

const sessionRef = ref(db, "session");
const onlineRef = ref(db, "volunteerOnline");
const typingRef = ref(db, "typing");
// A monotonically increasing timestamp written on every keystroke.
// Because the value changes each time, the board's onValue listener
// fires on every keystroke and can keep resetting its fallback timer.
const typingPulseRef = ref(db, "typingPulse");
const connectedRef = ref(db, ".info/connected");

// The session id we are currently allowed to answer.
let activeSessionId = null;
// Prevents re-showing / double-submitting within one session.
let answeredForId = null;

// Clean the answer the same way everywhere:
// uppercase, letters/numbers/spaces only, collapse spaces, cap length.
function cleanAnswer(text) {
    return String(text)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 50);
}

// ---------------------------------------------------------
//  PRESENCE: controlled by the ONLINE/OFFLINE toggle.
//  The board reads /volunteerOnline to choose the fallback
//  timing (random 1-5s when offline, 4s when online).
//
//  onDisconnect still forces it to false if the page closes
//  or the connection drops, so a closed tab never leaves the
//  board thinking a volunteer is present.
// ---------------------------------------------------------
let isOnline = false;

function setPresence(online) {
    isOnline = online;
    set(onlineRef, online);

    presenceButton.textContent = online ? "ONLINE" : "OFFLINE";
    presenceButton.classList.toggle("online", online);
}

presenceButton.addEventListener("click", () => {
    setPresence(!isOnline);
});

onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === true) {
        // Safety net: if this page closes, mark offline automatically.
        onDisconnect(onlineRef).set(false);
        // Re-assert current toggle state on (re)connect.
        set(onlineRef, isOnline);
        if (!answerArea.style.display || answerArea.style.display === "none") {
            status.textContent = "CONNECTED - WAITING FOR A QUESTION";
        }
    } else {
        status.textContent = "CONNECTION LOST";
    }
});

// Start offline until the operator toggles on.
setPresence(false);

// ---------------------------------------------------------
//  TYPING SIGNAL: set /typing true on input, and false
//  after a short pause. The board uses this to reset its
//  4-second inactivity timer.
// ---------------------------------------------------------
let typingClearTimer = null;

answerInput.addEventListener("input", () => {
    set(typingRef, true);
    // Changing value on every keystroke -> board listener fires every
    // time and resets its inactivity timer. Without this, a sustained
    // "typing === true" never re-fires and the spirit cuts in mid-answer.
    set(typingPulseRef, Date.now());

    clearTimeout(typingClearTimer);
    typingClearTimer = setTimeout(() => {
        set(typingRef, false);
    }, 1500); // "stopped typing" after 1.5s of no keystrokes
});

// ---------------------------------------------------------
//  REACT TO SESSION STATE.
// ---------------------------------------------------------
onValue(sessionRef, (snapshot) => {
    const session = snapshot.val();
    if (!session) {
        hideAnswerBox("WAITING FOR A QUESTION");
        return;
    }

    if (session.status === "speaking") {
        // The visitor is asking their question aloud. No answer box yet -
        // it appears only once they finish speaking (status "asking").
        hideAnswerBox("A VISITOR IS SPEAKING THEIR QUESTION...");
        activeSessionId = null;
    } else if (session.status === "asking" && answeredForId !== session.id) {
        // Visitor finished speaking: now the volunteer can answer.
        activeSessionId = session.id;
        showAnswerBox();
    } else if (session.status === "answered") {
        // Someone (this volunteer or the fallback) already won.
        if (activeSessionId === session.id) {
            const bySpirit = session.source === "fallback";
            hideAnswerBox(bySpirit ? "THE SPIRIT ANSWERED ON ITS OWN" : "ANSWER SENT");
        }
        activeSessionId = null;
    } else if (session.status === "idle") {
        hideAnswerBox("WAITING FOR A QUESTION");
        activeSessionId = null;
    }
});

function showAnswerBox() {
    status.textContent = "A QUESTION HAS BEEN ASKED";
    answerArea.style.display = "block";
    answerInput.value = "";
    answerInput.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = "SEND TO THE BOARD";
    answerInput.focus();
}

function hideAnswerBox(message) {
    answerArea.style.display = "none";
    status.textContent = message;
}

// ---------------------------------------------------------
//  SUBMIT AN ANSWER.
//  Re-read the session first and only write if it is still
//  "asking" with the same id. This rejects late answers
//  after the fallback has already won, without needing a
//  full transaction (fine for one supervised volunteer).
// ---------------------------------------------------------
sendButton.addEventListener("click", async () => {
    const answer = cleanAnswer(answerInput.value);
    if (!activeSessionId || !answer) return;

    // Lock the UI immediately to avoid a double tap.
    answerInput.disabled = true;
    sendButton.disabled = true;

    try {
        const snap = await get(sessionRef);
        const session = snap.val();

        // Guard: the session must still be open and the same one.
        if (!session || session.id !== activeSessionId || session.status !== "asking") {
            hideAnswerBox("THE SPIRIT ALREADY ANSWERED");
            answeredForId = activeSessionId;
            activeSessionId = null;
            return;
        }

        await update(sessionRef, {
            answer,
            source: "volunteer",
            status: "answered",
        });

        set(typingRef, false);
        answeredForId = session.id;
        status.textContent = "ANSWER SENT";
        sendButton.textContent = "SENT";
    } catch (err) {
        console.error("[Volunteer] Failed to send answer:", err);
        status.textContent = "SEND FAILED - TRY AGAIN";
        answerInput.disabled = false;
        sendButton.disabled = false;
    }
});
