// =========================================================
//  VISITOR PAGE
//  One main button that cycles:
//    SUMMON THE SPIRIT  -> (click) ->  FINISH SPEAKING
//    FINISH SPEAKING    -> (click) ->  reveal the answer
//  During the reveal a small "SUMMON AGAIN" button is shown.
//  After ~7s it is replaced by the full-size SUMMON button.
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

const mainButton = document.getElementById("mainButton");
const smallButton = document.getElementById("smallButton");
const status = document.getElementById("status");

const revealStatus = document.getElementById("revealStatus");
const revealText = document.getElementById("revealText");

const sessionRef = ref(db, "session");

// Which session id this phone created / is currently watching.
let mySessionId = null;
// Guard so we only reveal the answer once per session.
let revealedForId = null;
// Current state of the main button: "summon" or "finish".
let phase = "summon";
// True once the visitor pressed FINISH SPEAKING and is on the reveal
// screen. We only reveal the answer after this, so an answer that
// arrives while they are still speaking waits for them.
let waitingToReveal = false;
// If the answer lands before the visitor finishes, stash it here.
let pendingAnswer = null;
// Timer that swaps the small button back to the full one.
let swapButtonTimer = null;

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
//  MAIN BUTTON: toggles between summoning and finishing.
// ---------------------------------------------------------
mainButton.addEventListener("click", () => {
    if (phase === "summon") {
        startSummon();
    } else if (phase === "finish") {
        finishSpeaking();
    }
});

// Step 1: create a fresh session in the "speaking" state. The visitor
// is now asking their question aloud. The board does NOT start its
// answer countdown yet, and the volunteer sees only that a question is
// being asked (no answer box until the visitor finishes).
function startSummon() {
    mySessionId = makeSessionId();
    revealedForId = null;

    set(sessionRef, {
        id: mySessionId,
        status: "speaking",
        answer: "",
        source: "",
    }).catch((err) => {
        console.error("[Visitor] Failed to create session:", err);
        status.textContent = "CONNECTION ERROR - TRY AGAIN";
    });

    phase = "finish";
    mainButton.innerHTML = "FINISH<br />SPEAKING";
    status.textContent = "SPEAK YOUR QUESTION, THEN FINISH";
}

// Step 2: the visitor is done asking. Flip the session to "asking",
// which lets the volunteer answer and starts the board's countdown.
// Then move to the waiting / reveal screen.
function finishSpeaking() {
    phase = "summon";
    mainButton.innerHTML = "SUMMON<br />THE SPIRIT";
    waitingToReveal = true;

    // Only advance the session if it is still ours and still "speaking".
    set(sessionRef, {
        id: mySessionId,
        status: "asking",
        answer: "",
        source: "",
    }).catch((err) => {
        console.error("[Visitor] Failed to finish speaking:", err);
    });

    showScreen("reveal");
    revealStatus.textContent = "The board is listening...";
    revealText.textContent = "";
    // Small "summon again" button is available right away while waiting.
    clearTimeout(swapButtonTimer);
    smallButton.style.display = "inline-block";

    // If the spirit already answered while the visitor was speaking,
    // reveal it now.
    if (pendingAnswer !== null) {
        const answer = pendingAnswer;
        pendingAnswer = null;
        revealAnswer(answer);
    }
}

// ---------------------------------------------------------
//  Once the full answer is shown, keep it on screen with the
//  small "summon again" button for ~7s, then return to the
//  full-size SUMMON button.
// ---------------------------------------------------------
function holdThenSwapToFullButton() {
    clearTimeout(swapButtonTimer);
    smallButton.style.display = "inline-block";

    swapButtonTimer = setTimeout(() => {
        // Return to the full idle screen with the big SUMMON button.
        resetToIdle();
    }, 7000);
}

// The small button restarts the ritual immediately.
smallButton.addEventListener("click", () => {
    clearTimeout(swapButtonTimer);
    resetToIdle();
    startSummon();
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
        const answer = session.answer || "";

        if (waitingToReveal) {
            // Visitor has finished speaking and is watching: reveal now.
            revealAnswer(answer);
        } else {
            // Answer arrived while the visitor is still speaking. Hold it
            // until they press FINISH SPEAKING.
            pendingAnswer = answer;
        }
    }
});

// ---------------------------------------------------------
//  Reveal the answer one character at a time on the phone.
//  (~650ms per letter, ~350ms per space. No planchette here.)
// ---------------------------------------------------------
async function revealAnswer(answer) {
    revealStatus.textContent = "THE SPIRIT ANSWERS";
    revealText.textContent = "";

    const characters = answer.split("");

    for (const character of characters) {
        revealText.textContent += character;
        await sleep(character === " " ? 350 : 650);
    }

    // Full answer is now shown: hold ~7s, then swap back to the big button.
    holdThenSwapToFullButton();
}

function resetToIdle() {
    clearTimeout(swapButtonTimer);
    mySessionId = null;
    phase = "summon";
    waitingToReveal = false;
    pendingAnswer = null;
    mainButton.innerHTML = "SUMMON<br />THE SPIRIT";
    smallButton.style.display = "none";
    showScreen("ask");
    status.textContent = "READY";
}

// Start on the idle screen with the small button hidden.
resetToIdle();

// ---------------------------------------------------------
//  Connection status (nice-to-have feedback on idle screen).
// ---------------------------------------------------------
const connectedRef = ref(db, ".info/connected");
onValue(connectedRef, (snapshot) => {
    if (askScreen.classList.contains("active")) {
        status.textContent = snapshot.val() === true ? "READY" : "CONNECTION LOST";
    }
});
