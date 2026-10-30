// Firebase (modular SDK). Stage 1: connection check only.
import { db } from "./firebase-config.js";
import {
    ref,
    onValue,
    set,
    get,
    update,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const board = document.getElementById("board");
const planchette = document.getElementById("planchette");
const statusText = document.getElementById("status");
const responseText = document.getElementById("response");
const micButton = document.getElementById("micButton");
const testButton = document.getElementById("testButton");

const responses = [
    "WE HAVE BEEN WAITING",
    "YOU ALREADY KNOW",
    "THE ANSWER IS UNCLEAR",
    "NOT YET",
    "ASK AGAIN",
    "DO NOT LOOK BEHIND YOU",
    "THEY ARE STILL HERE",
    "IT HAS BEEN DECIDED",
    "SOME THINGS MUST REMAIN HIDDEN",
    "THE NIGHT KNOWS",
    "WE HEAR YOU",
    "LEAVE THIS PLACE",
    "THE PAST IS NOT FINISHED",
    "YOU MUST WAIT",
    "IT IS TOO LATE",
    "SOMEONE IS LISTENING",
    "FOLLOW THE SILENCE",
    "NEVER ASK TWICE"
];

let isResponding = false;
let lastResponse = "";
let microphoneStream = null;
let audioContext = null;
let animationFrame = null;
let speechStartedAt = null;
let lastLoudAt = null;
let triggeredAt = 0;

// Utility: wait for a specified duration
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Find the board element corresponding to a character
function findBoardElement(character) {
    if (character === " ") return null;

    const letters = [...document.querySelectorAll(".letter")];
    const letter = letters.find(el => el.textContent === character);

    if (letter) return letter;

    return [...document.querySelectorAll(".board-symbol")]
        .find(el => el.dataset.letter === character) || null;
}

// Move the planchette to an element on the board
function moveToElement(element) {
    if (!element) return;

    const boardRect = board.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const x = elementRect.left + elementRect.width / 2 - boardRect.left;
    const y = elementRect.top + elementRect.height / 2 - boardRect.top;

    planchette.style.left = `${x}px`;
    planchette.style.top = `${y}px`;
}

// Move the planchette to the center
function resetPlanchette() {
    planchette.style.left = "50%";
    planchette.style.top = "50%";

    document.querySelectorAll(".letter.active")
        .forEach(el => el.classList.remove("active"));
}



function positionLetters() {
    const rows = document.querySelectorAll(".letter-row");

    rows.forEach((row, rowIndex) => {
        const letters = row.querySelectorAll(".letter");
        const total = letters.length;

        letters.forEach((letter, index) => {
            const t = (index / (total - 1)) * 2 - 1;

            const x = 5 + (index / (total - 1)) * 90;

            // Both rows curve upwards
            const curve = 30 * (1 - t * t);

            // Keep the rows vertically separated
            const baseline = rowIndex === 0 ? 30 : 70;
            const y = baseline - curve;

            // Both rows follow the same rotational direction
            const angle = Math.atan(25 * t / 45) * 180 / Math.PI;

            letter.style.left = `${x}%`;
            letter.style.top = `${y}%`;

            letter.style.transform =
                `translate(-50%, -50%) rotate(${angle}deg)`;
        });
    });
}


// Select a random answer without immediately repeating the previous one
function getRandomResponse() {
    let response;

    do {
        response = responses[Math.floor(Math.random() * responses.length)];
    } while (response === lastResponse && responses.length > 1);

    lastResponse = response;
    return response;
}

// Animate the planchette spelling a response
async function spellResponse(response) {
    isResponding = true;
    responseText.textContent = "";
    statusText.textContent = "THE BOARD IS RESPONDING";

    const characters = response.split("");

    for (const character of characters) {
        responseText.textContent += character;

        if (character === " ") {
            await sleep(350);
            continue;
        }

        const element = findBoardElement(character);

        if (element) {
            document.querySelectorAll(".letter.active")
                .forEach(el => el.classList.remove("active"));

            if (element.classList.contains("letter")) {
                element.classList.add("active");
            }

            moveToElement(element);
        }

        await sleep(650);
    }

    statusText.textContent = "THE BOARD HAS SPOKEN";

    await sleep(3500);

    document.querySelectorAll(".letter.active")
        .forEach(el => el.classList.remove("active"));

    resetPlanchette();
    responseText.textContent = "";
    statusText.textContent = "THE BOARD IS WAITING";

    isResponding = false;
    // socket.emit("board:ready"); // Socket.IO removed; board no longer spells
    triggeredAt = Date.now();
}

// Start a complete response


async function triggerResponse() {
    if (isResponding) return;

    if (Date.now() - triggeredAt < 5000) return;

    isResponding = true;
    triggeredAt = Date.now();

    const response = getRandomResponse();

    statusText.textContent = "THE BOARD IS LISTENING...";

    await sleep(1500);

    await spellResponse(response);
}



// Manual test button
testButton.addEventListener("click", () => {
    triggerResponse();
});

// Microphone setup
async function enableMicrophone() {
    try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        audioContext = new AudioContext();

        const source = audioContext.createMediaStreamSource(microphoneStream);
        const analyser = audioContext.createAnalyser();

        analyser.fftSize = 2048;
        source.connect(analyser);

        const samples = new Float32Array(analyser.fftSize);

        micButton.textContent = "MICROPHONE ACTIVE";
        micButton.disabled = true;
        statusText.textContent = "THE BOARD IS WAITING";

        function listen() {
            analyser.getFloatTimeDomainData(samples);

            // Calculate the audio volume (RMS)
            let sum = 0;

            for (const sample of samples) {
                sum += sample * sample;
            }

            const volume = Math.sqrt(sum / samples.length);
            const now = Date.now();

            // Adjust this threshold depending on room noise
            const threshold = 0.035;

            if (volume > threshold && !isResponding) {
                if (!speechStartedAt) {
                    speechStartedAt = now;
                }

                lastLoudAt = now;
            }

            // Trigger after speech has stopped
            if (
                speechStartedAt &&
                lastLoudAt &&
                now - lastLoudAt > 1400
            ) {
                const speechDuration = lastLoudAt - speechStartedAt;

                speechStartedAt = null;
                lastLoudAt = null;

                // Ignore very short noises
                if (
                    speechDuration > 250 &&
                    now - triggeredAt > 5000 &&
                    !isResponding
                ) {
                    // Mic auto-trigger DISABLED: activation is now
                    // controlled by the visitor phone via Firebase.
                    // triggerResponse();
                }
            }

            // Reset stale speech detection
            if (speechStartedAt && now - speechStartedAt > 10000) {
                speechStartedAt = null;
                lastLoudAt = null;
            }

            animationFrame = requestAnimationFrame(listen);
        }

        listen();

    } catch (error) {
        console.error("Microphone error:", error);
        statusText.textContent = "MICROPHONE ACCESS FAILED";
    }
}

micButton.addEventListener("click", enableMicrophone);

// Start with the planchette in the center
resetPlanchette();
positionLetters();



/* =========================================
   ATMOSPHERIC PARTICLES
========================================= */

const canvas = document.getElementById("ambience");
const ctx = canvas.getContext("2d");

let particles = [];
let particleAnimationFrame;

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    createParticles();
}

function createParticles() {
    const count = Math.min(
        65,
        Math.floor(window.innerWidth / 18)
    );

    particles = [];

    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            radius: Math.random() * 1.5 + 0.3,
            speedX: (Math.random() - 0.5) * 0.25,
            speedY: -(Math.random() * 0.35 + 0.08),
            opacity: Math.random() * 0.35 + 0.08,
            phase: Math.random() * Math.PI * 2
        });
    }
}

function animateParticles() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    particles.forEach(particle => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;
        particle.phase += 0.015;

        // Subtle brightness variation
        const flicker =
            particle.opacity *
            (0.7 + Math.sin(particle.phase) * 0.3);

        // Wrap around screen edges
        if (particle.y < -10) {
            particle.y = height + 10;
            particle.x = Math.random() * width;
        }

        if (particle.x < -10) particle.x = width + 10;
        if (particle.x > width + 10) particle.x = -10;

        ctx.beginPath();
        ctx.arc(
            particle.x,
            particle.y,
            particle.radius,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = `rgba(232, 197, 143, ${flicker})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(230, 180, 110, 0.4)";
        ctx.fill();
    });

    ctx.shadowBlur = 0;

    particleAnimationFrame =
        requestAnimationFrame(animateParticles);
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
animateParticles();


/* =========================================
   FIREBASE: SESSION LISTENING + TIMING
   The board OWNS the timing logic. It watches the
   session, runs the fallback timers, and writes the
   fallback answer when the spirit must speak on its own.
   The board no longer spells the answer (that happens
   on the visitor's phone); it only shows status text.
========================================= */

const sessionRef = ref(db, "session");
const onlineRef = ref(db, "volunteerOnline");
const typingRef = ref(db, "typing");
// Heartbeat timestamp the volunteer writes on every keystroke.
const typingPulseRef = ref(db, "typingPulse");
const connectedRef = ref(db, ".info/connected");

// Connection status (also covered the Stage 1 check).
onValue(connectedRef, (snapshot) => {
    console.log(
        snapshot.val() === true
            ? "[Firebase] Board connected to Realtime Database"
            : "[Firebase] Board not connected to Realtime Database"
    );
});

// --- Timing state for the current question ---
let handlingSessionId = null;   // session the board is currently timing
let hardDeadlineTimer = null;   // absolute 15s cap
let inactivityTimer = null;     // 4s "no typing" / random fallback timer
let volunteerOnline = false;    // latest presence value

// Keep a live view of volunteer presence.
onValue(onlineRef, (snapshot) => {
    volunteerOnline = snapshot.val() === true;
});

function clearTimers() {
    clearTimeout(hardDeadlineTimer);
    clearTimeout(inactivityTimer);
    hardDeadlineTimer = null;
    inactivityTimer = null;
}

// Fire the fallback: the spirit answers on its own.
// Guarded so it only wins if the session is still "asking".
async function triggerFallback() {
    if (!handlingSessionId) return;

    try {
        const snap = await get(sessionRef);
        const session = snap.val();

        // Someone already answered, or the session moved on.
        if (!session || session.id !== handlingSessionId || session.status !== "asking") {
            return;
        }

        const response = getRandomResponse();

        await update(sessionRef, {
            answer: response,
            source: "fallback",
            status: "answered",
        });

        console.log("[Board] Fallback response:", response);
    } catch (err) {
        console.error("[Board] Fallback failed:", err);
    }
}

// How long the board waits with no typing activity before the
// spirit answers on its own (volunteer online). Each typing signal
// resets this, so a volunteer who keeps typing is never cut off.
const INACTIVITY_MS = 8000;

// Reset the inactivity timer (called on each typing signal).
function armInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(triggerFallback, INACTIVITY_MS);
}

// Start the timing logic for a newly-asked question.
function startTiming() {
    clearTimers();

    // Absolute maximum from the visitor pressing Finished. Even with
    // continuous typing, the spirit answers by this point.
    hardDeadlineTimer = setTimeout(triggerFallback, 30000);

    if (!volunteerOnline) {
        // Scenario C: no volunteer connected -> random 3-6s fallback,
        // so the spirit feels deliberate rather than instant.
        const delay = 3000 + Math.floor(Math.random() * 3000);
        inactivityTimer = setTimeout(triggerFallback, delay);
    } else {
        // Scenario A/B: volunteer online. Wait INACTIVITY_MS; typing resets this.
        armInactivityTimer();
    }
}

// Typing activity resets the inactivity timer (scenario A),
// but only while this session is still being timed and a
// volunteer is online.
onValue(typingRef, (snapshot) => {
    if (!handlingSessionId) return;
    if (snapshot.val() === true && volunteerOnline) {
        armInactivityTimer();
    }
});

// The typing heartbeat changes on EVERY keystroke, so this fires
// continuously while the volunteer types and keeps the fallback at bay.
// (The boolean typingRef above only fires on the rising edge, which is
// why a sustained answer used to get interrupted.)
onValue(typingPulseRef, () => {
    if (!handlingSessionId) return;
    if (volunteerOnline) {
        armInactivityTimer();
    }
});

// --- React to session changes ---
let lastAnsweredId = null; // so we react to "answered" only once

onValue(sessionRef, (snapshot) => {
    const session = snapshot.val();
    if (!session) return;

    if (session.status === "speaking") {
        // The visitor is still asking their question aloud. The board
        // listens but does NOT start its answer countdown yet.
        if (handlingSessionId !== session.id) {
            clearTimers();
            handlingSessionId = null;
        }
        statusText.textContent = "THE SPIRIT IS LISTENING...";
    } else if (session.status === "asking" && handlingSessionId !== session.id) {
        // The visitor has finished asking. Now the board starts timing
        // and waits for the spirit (volunteer or fallback) to respond.
        handlingSessionId = session.id;
        lastAnsweredId = null;
        statusText.textContent = "THE SPIRIT IS STIRRING";
        startTiming();
    } else if (session.status === "answered" && lastAnsweredId !== session.id) {
        // A winner was decided (volunteer or fallback).
        lastAnsweredId = session.id;
        handlingSessionId = null;
        clearTimers();

        // Spell the answer on the physical board with the planchette,
        // in sync with the phone's letter-by-letter reveal. When the
        // animation finishes it returns the session to idle.
        const answer = session.answer || "";
        const sessionId = session.id;

        spellResponse(answer).then(() => {
            // Return the shared session to idle for the next visitor.
            set(sessionRef, {
                id: sessionId,
                status: "idle",
                answer: "",
                source: "",
            }).catch((err) => console.error("[Board] Reset failed:", err));
        });
    }
});
