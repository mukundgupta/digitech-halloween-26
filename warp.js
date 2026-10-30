// =========================================================
//  PROJECTOR WARP / KEYSTONE CALIBRATION
//
//  Warps the ENTIRE rendered page as one flat image, the way a
//  projector keystone correction would. Nothing inside the page
//  changes - the finished composite (board, text, particles, all
//  effects) is perspective-warped as a whole so it lands square
//  on the wall even when the projector is off-axis.
//
//  USAGE (on the laptop driving the projector):
//    - Press  C  to toggle calibration mode (drag the 4 corners).
//    - Drag each corner handle to line the board up with the wall.
//    - Arrow keys nudge the currently selected corner by 1px
//      (Shift+Arrow = 10px) for fine adjustment.
//    - Press  S  to save, the layout also auto-saves on each change.
//    - Press  R  to reset to a perfect rectangle.
//    - Press  H  to hide/show the help hint.
//  The configuration is stored in localStorage on this machine.
// =========================================================

(function () {
    "use strict";

    const STORAGE_KEY = "ouija.warp.corners.v1";

    // ---------------------------------------------------------
    //  1. Wrap all existing body content in a single warp root.
    //     Everything the browser renders goes inside this node,
    //     so transforming it warps the whole composite at once.
    // ---------------------------------------------------------
    const warpRoot = document.createElement("div");
    warpRoot.id = "warp-root";

    // Move every current child of <body> into the warp root.
    while (document.body.firstChild) {
        warpRoot.appendChild(document.body.firstChild);
    }
    document.body.appendChild(warpRoot);

    // Styles for the warp root and the calibration overlay.
    const style = document.createElement("style");
    style.textContent = `
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }

        #warp-root {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            transform-origin: 0 0;
            /* matrix3d is injected here by applyWarp() */
        }

        /* Calibration overlay sits ABOVE the warped view and is itself
           un-warped, so the handles track the real screen pixels. */
        #warp-cal {
            position: fixed;
            inset: 0;
            z-index: 2147483000;
            pointer-events: none;
            display: none;
            font-family: system-ui, sans-serif;
        }
        #warp-cal.active { display: block; }

        #warp-cal .edge {
            position: absolute;
            stroke: #39ff14;
            stroke-width: 2;
            fill: rgba(57, 255, 20, 0.06);
        }

        #warp-cal .handle {
            position: absolute;
            width: 34px;
            height: 34px;
            margin: -17px 0 0 -17px;
            border: 2px solid #39ff14;
            border-radius: 50%;
            background: rgba(57, 255, 20, 0.15);
            box-shadow: 0 0 10px rgba(57, 255, 20, 0.8);
            pointer-events: auto;
            cursor: grab;
            touch-action: none;
        }
        #warp-cal .handle::after {
            content: "";
            position: absolute;
            inset: 13px;
            border-radius: 50%;
            background: #39ff14;
        }
        #warp-cal .handle.selected {
            border-color: #fff200;
            box-shadow: 0 0 16px rgba(255, 242, 0, 0.9);
        }
        #warp-cal .handle.selected::after { background: #fff200; }

        #warp-cal .label {
            position: absolute;
            margin: 20px 0 0 20px;
            color: #39ff14;
            font-size: 12px;
            letter-spacing: 1px;
            text-shadow: 0 0 4px #000;
            pointer-events: none;
        }

        #warp-help {
            position: fixed;
            left: 50%;
            bottom: 22px;
            transform: translateX(-50%);
            z-index: 2147483001;
            background: rgba(0, 0, 0, 0.78);
            border: 1px solid #39ff14;
            color: #cfffc4;
            font-family: system-ui, sans-serif;
            font-size: 13px;
            line-height: 1.6;
            padding: 12px 18px;
            border-radius: 8px;
            max-width: 90vw;
            display: none;
            pointer-events: none;
        }
        #warp-help.active { display: block; }
        #warp-help b { color: #fff200; }

        #warp-toast {
            position: fixed;
            top: 18px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2147483002;
            background: rgba(0, 0, 0, 0.85);
            border: 1px solid #39ff14;
            color: #cfffc4;
            font-family: system-ui, sans-serif;
            font-size: 13px;
            padding: 8px 16px;
            border-radius: 6px;
            opacity: 0;
            transition: opacity 0.25s;
            pointer-events: none;
        }
        #warp-toast.show { opacity: 1; }
    `;
    document.head.appendChild(style);

    // ---------------------------------------------------------
    //  2. Corner state. Corners are stored as fractions of the
    //     viewport (0..1) so a saved config survives different
    //     window sizes / resolutions reasonably well.
    //     Order: TL, TR, BR, BL.
    // ---------------------------------------------------------
    const DEFAULT = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
    ];

    let corners = loadCorners() || clone(DEFAULT);
    let selected = 0;

    function clone(pts) {
        return pts.map((p) => ({ x: p.x, y: p.y }));
    }

    function loadCorners() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length === 4) {
                return parsed.map((p) => ({ x: +p.x, y: +p.y }));
            }
        } catch (_) {
            /* ignore corrupt config */
        }
        return null;
    }

    function saveCorners() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(corners));
        } catch (_) {
            /* storage may be unavailable; warp still works this session */
        }
    }

    // ---------------------------------------------------------
    //  3. Homography: map the source rectangle (the full viewport)
    //     to the 4 target corners, then express it as a CSS
    //     matrix3d. Standard general 2D projective transform.
    // ---------------------------------------------------------
    function applyWarp() {
        const W = window.innerWidth;
        const H = window.innerHeight;

        // Source: the untransformed viewport rectangle.
        const src = [
            [0, 0],
            [W, 0],
            [W, H],
            [0, H],
        ];

        // Destination: dragged corners in pixels.
        const dst = corners.map((c) => [c.x * W, c.y * H]);

        const m = computeMatrix3d(src, dst);
        warpRoot.style.transform = m
            ? `matrix3d(${m.join(",")})`
            : "none";
    }

    // Solve the 8 coefficients of the projective transform that maps
    // the 4 src points to the 4 dst points, then lay them out as the
    // 4x4 column-major matrix3d CSS expects.
    function computeMatrix3d(src, dst) {
        const A = [];
        const b = [];

        for (let i = 0; i < 4; i++) {
            const [sx, sy] = src[i];
            const [dx, dy] = dst[i];
            A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
            b.push(dx);
            A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
            b.push(dy);
        }

        const h = solve(A, b);
        if (!h) return null;

        // h = [a b c d e f g i]; projective matrix is
        //   [ a b 0 c ]
        //   [ d e 0 f ]
        //   [ 0 0 1 0 ]
        //   [ g i 0 1 ]  (column-major for matrix3d)
        const [a, bb, c, d, e, f, g, i] = h;
        return [
            a, d, 0, g,
            bb, e, 0, i,
            0, 0, 1, 0,
            c, f, 0, 1,
        ];
    }

    // Gaussian elimination for an 8x8 linear system.
    function solve(A, b) {
        const n = b.length;
        const M = A.map((row, r) => row.concat(b[r]));

        for (let col = 0; col < n; col++) {
            // Partial pivot.
            let pivot = col;
            for (let r = col + 1; r < n; r++) {
                if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
            }
            if (Math.abs(M[pivot][col]) < 1e-12) return null;
            [M[col], M[pivot]] = [M[pivot], M[col]];

            // Eliminate.
            for (let r = 0; r < n; r++) {
                if (r === col) continue;
                const factor = M[r][col] / M[col][col];
                for (let k = col; k <= n; k++) {
                    M[r][k] -= factor * M[col][k];
                }
            }
        }

        return M.map((row, r) => row[n] / row[r]);
    }

    // ---------------------------------------------------------
    //  4. Calibration overlay (SVG edges + corner handles).
    // ---------------------------------------------------------
    const cal = document.createElement("div");
    cal.id = "warp-cal";
    cal.innerHTML = `
        <svg id="warp-svg" width="100%" height="100%"
             style="position:absolute;inset:0;pointer-events:none;">
            <polygon class="edge" points="" />
        </svg>
    `;
    document.body.appendChild(cal);

    const poly = cal.querySelector(".edge");
    const labels = ["TL", "TR", "BR", "BL"];
    const handles = labels.map((name, idx) => {
        const h = document.createElement("div");
        h.className = "handle";
        h.dataset.index = idx;

        const lbl = document.createElement("div");
        lbl.className = "label";
        lbl.textContent = name;
        h.appendChild(lbl);

        cal.appendChild(h);
        return h;
    });

    const help = document.createElement("div");
    help.id = "warp-help";
    help.innerHTML =
        `<b>C</b> toggle calibration &nbsp; drag corners to align &nbsp; ` +
        `<b>Arrows</b> nudge (Shift = 10px) &nbsp; <b>S</b> save &nbsp; ` +
        `<b>R</b> reset &nbsp; <b>H</b> hide this`;
    document.body.appendChild(help);

    const toast = document.createElement("div");
    toast.id = "warp-toast";
    document.body.appendChild(toast);

    let toastTimer = null;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 1400);
    }

    function renderOverlay() {
        const W = window.innerWidth;
        const H = window.innerHeight;

        const pts = corners.map((c) => [c.x * W, c.y * H]);
        poly.setAttribute(
            "points",
            pts.map((p) => `${p[0]},${p[1]}`).join(" ")
        );

        handles.forEach((h, idx) => {
            h.style.left = pts[idx][0] + "px";
            h.style.top = pts[idx][1] + "px";
            h.classList.toggle("selected", idx === selected);
        });
    }

    // ---------------------------------------------------------
    //  5. Dragging.
    // ---------------------------------------------------------
    let dragging = null;

    handles.forEach((h) => {
        h.addEventListener("pointerdown", (e) => {
            dragging = +h.dataset.index;
            selected = dragging;
            h.setPointerCapture(e.pointerId);
            h.style.cursor = "grabbing";
            renderOverlay();
            e.preventDefault();
        });

        h.addEventListener("pointermove", (e) => {
            if (dragging === null) return;
            const W = window.innerWidth;
            const H = window.innerHeight;
            corners[dragging] = {
                x: clamp01(e.clientX / W),
                y: clamp01(e.clientY / H),
            };
            applyWarp();
            renderOverlay();
        });

        const end = (e) => {
            if (dragging === null) return;
            h.style.cursor = "grab";
            dragging = null;
            saveCorners();
        };
        h.addEventListener("pointerup", end);
        h.addEventListener("pointercancel", end);
    });

    function clamp01(v) {
        return Math.max(-0.5, Math.min(1.5, v));
    }

    // ---------------------------------------------------------
    //  6. Keyboard controls.
    // ---------------------------------------------------------
    let calActive = false;

    function setCalActive(on) {
        calActive = on;
        cal.classList.toggle("active", on);
        help.classList.toggle("active", on);
        if (on) renderOverlay();
    }

    window.addEventListener("keydown", (e) => {
        const key = e.key.toLowerCase();

        if (key === "c") {
            setCalActive(!calActive);
            return;
        }

        if (!calActive) return;

        if (key === "s") {
            saveCorners();
            showToast("Warp saved");
            e.preventDefault();
            return;
        }

        if (key === "r") {
            corners = clone(DEFAULT);
            applyWarp();
            renderOverlay();
            saveCorners();
            showToast("Warp reset");
            e.preventDefault();
            return;
        }

        if (key === "h") {
            help.classList.toggle("active");
            e.preventDefault();
            return;
        }

        // Cycle selected corner with Tab.
        if (key === "tab") {
            selected = (selected + (e.shiftKey ? 3 : 1)) % 4;
            renderOverlay();
            e.preventDefault();
            return;
        }

        // Arrow-key nudging of the selected corner.
        const step = (e.shiftKey ? 10 : 1);
        let moved = true;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const c = corners[selected];

        if (key === "arrowleft") c.x -= step / W;
        else if (key === "arrowright") c.x += step / W;
        else if (key === "arrowup") c.y -= step / H;
        else if (key === "arrowdown") c.y += step / H;
        else moved = false;

        if (moved) {
            applyWarp();
            renderOverlay();
            saveCorners();
            e.preventDefault();
        }
    });

    // ---------------------------------------------------------
    //  7. Keep the warp correct on resize / orientation change.
    // ---------------------------------------------------------
    window.addEventListener("resize", () => {
        applyWarp();
        if (calActive) renderOverlay();
    });

    // Initial paint.
    applyWarp();
    renderOverlay();
})();
