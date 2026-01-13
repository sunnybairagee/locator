const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const img = new Image();
const output = document.getElementById("output");
let imageLoaded = false;
// output.onclick = copyFromOutput;

let mode = "scroll"; // scroll | draw | edit
let scale = 1;

let virtualW = 0;
let virtualH = 0;

/* rectangle in REAL coordinates */
let rect = null;

/* interaction */
let action = null; // draw | move | resize
let startX = 0, startY = 0;
let offsetX = 0, offsetY = 0;

/* ================= IMAGE LOAD ================= */

document.getElementById("file").onchange = e => {
  img.src = URL.createObjectURL(e.target.files[0]);
  img.onload = () => {
    virtualW = img.width;
    virtualH = img.height;
    imageLoaded = true;
    fitCanvas();
    rect = null;
    draw();
  };
};

/* ================= MODE ================= */

function setMode(m) {
  mode = m;
  canvas.style.pointerEvents = (m === "scroll") ? "none" : "auto";
  action = null;
  // output.innerText = "Mode: " + m.toUpperCase();
  output.innerText = m.toUpperCase();
}

/* ================= RATIO ================= */

function setRatio() {
  const r = document.getElementById("ratio").value;

  if (r === "9:16") { virtualW = 1080; virtualH = 1920; }
  else if (r === "1:1") { virtualW = 1080; virtualH = 1080; }
  else if (r === "16:9") { virtualW = 1920; virtualH = 1080; }
  else { virtualW = img.width; virtualH = img.height; }

  fitCanvas();
  draw();
}

/* ================= CANVAS & ZOOM ================= */

function fitCanvas() {
  scale = Math.min(window.innerWidth / virtualW, 1);
  canvas.width = virtualW * scale;
  canvas.height = virtualH * scale;
}

function zoomIn() { 
  if(!imageLoaded) return;
  scale *= 1.2; redrawZoom(); 
}
function zoomOut() {
  if(!imageLoaded) return; 
  scale /= 1.2; redrawZoom(); 
}
function resetZoom() {
  if(!imageLoaded) return; 
  fitCanvas(); 
  draw(); 
}

function redrawZoom() {
  canvas.width = virtualW * scale;
  canvas.height = virtualH * scale;
  draw();
}

/* ================= DRAW ================= */

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (!rect) return;

  const sx = rect.x * scale;
  const sy = rect.y * scale;
  const sw = rect.w * scale;
  const sh = rect.h * scale;

  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, sw, sh);

  ctx.fillStyle = "red";
  ctx.fillRect(sx + sw - 14, sy + sh - 14, 14, 14);
}

/* ================= TOUCH EVENTS (KEY FIX) ================= */

function getTouchPos(touch) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - r.left) / scale,
    y: (touch.clientY - r.top) / scale
  };
}

canvas.addEventListener("touchstart", e => {
  if (mode === "scroll") return;

  e.preventDefault();
  const t = getTouchPos(e.touches[0]);

  if (mode === "draw") {
    rect = { x: t.x, y: t.y, w: 0, h: 0 };
    action = "draw";
    startX = t.x;
    startY = t.y;
    return;
  }

  if (mode === "edit" && rect) {
    const inside =
      t.x > rect.x && t.x < rect.x + rect.w &&
      t.y > rect.y && t.y < rect.y + rect.h;

    const nearCorner =
      t.x > rect.x + rect.w - 20 &&
      t.y > rect.y + rect.h - 20;

    if (nearCorner) {
      action = "resize";
      return;
    }

    if (inside) {
      action = "move";
      offsetX = t.x - rect.x;
      offsetY = t.y - rect.y;
    }
  }
});

canvas.addEventListener("touchmove", e => {
  if (!action || !rect) return;

  e.preventDefault();
  const t = getTouchPos(e.touches[0]);

  if (action === "draw") {
    rect.w = Math.max(10, t.x - startX);
    rect.h = Math.max(10, t.y - startY);
    rect.x = startX;
    rect.y = startY;
  }

  if (action === "move") {
    rect.x = t.x - offsetX;
    rect.y = t.y - offsetY;
  }

  if (action === "resize") {
    rect.w = Math.max(10, t.x - rect.x);
    rect.h = Math.max(10, t.y - rect.y);
  }

  draw();
});

canvas.addEventListener("touchend", () => {
  action = null;
});

/* ================= CONFIRM ================= */

function confirmBox() {
  if (!rect) {
    alert("Draw rectangle first");
    return;
  }

  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const w = Math.round(rect.w)
  const h = Math.round(rect.h)

  const text = `x = ${x}
y = ${y}
w = ${w}
h = ${h}`;

  document.getElementById("popoverOutput").innerText = text;

  coordPopover.showPopover();   // 🔥 HTML popover API
}

/* ================= RESET ================= */

function resetDraw(){
    rect = null;
    action = null;
    draw();
}

/* ================= COPY ================= */

function copyPopover() {
  const text = document.getElementById("popoverOutput").innerText;

  // 1️⃣ Modern Clipboard API (secure context)
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      console.log("Copied using Clipboard API");
      let copyBtn = document.getElementById("copyBtn");
      copyBtn.innerText = "📄 Copied";
    }).catch(() => {
      fallbackCopy(text);
    });
  } 
  // 2️⃣ Fallback (old but reliable)
  else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";   // avoid scroll jump
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand("copy");
    let copyBtn = document.getElementById("copyBtn");
    copyBtn.innerText = "📄 Copied";
    console.log("Copied using fallback");
  } catch (err) {
    alert("Copy not supported in this browser");
  }

  document.body.removeChild(textarea);
}