const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const img = new Image();
const output = document.getElementById("output");
const video = document.createElement("video");
// const BACKEND_API = "https://watermark-backend-lfnp.onrender.com/process";

const BACKEND_UPLOAD_API = "https://watermark-backend-lfnp.onrender.com/upload-file";
const BACKEND_PROCESS_API = "https://watermark-backend-lfnp.onrender.com/process";



video.muted = true;
video.playsInline = true;

let uploadedFileName = "";
let uploadedFileType = "";
let imageLoaded = false;

let mode = "scroll"; // scroll | draw | edit
let scale = 1;

let virtualW = 0;
let virtualH = 0;

/* rectangle in REAL coordinates */
// let rect = null;

// New Code
let rects = [];
let activeRect = -1;

/* interaction */
let action = null; // draw | move | resize
let startX = 0, startY = 0;
let offsetX = 0, offsetY = 0;


async function uploadFileToBackend(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(BACKEND_UPLOAD_API, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Upload failed");
  return await res.json();
}


/* ================= IMAGE LOAD ================= */
document.getElementById("file").onchange = e => {

  const file = e.target.files[0];
  if (!file) return;

  uploadFileToBackend(file)
    .then(res => {
      uploadedFileName = res.file_name;
      uploadedFileType = file.type.startsWith("video") ? "video" : "image";
      console.log("Uploaded:", res);
    })
    .catch(err => {
      alert("File upload failed");
      console.error(err);
      return;
    });

  // uploadedFileName = file.name;
  // uploadedFileType = file.type.startsWith("video/") ? "video" : "image";

  // IMAGE FILE
  if (file.type.startsWith("image/")) {
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      virtualW = img.width;
      virtualH = img.height;
      imageLoaded = true;
      rects.length = 0;
      fitCanvas();
      draw();
    };
  }

  // VIDEO FILE → first frame
  else if (file.type.startsWith("video/")) {
    video.src = URL.createObjectURL(file);
    video.load();

    video.onloadeddata = () => {
      video.currentTime = 0;
    };

    video.onseeked = () => {
      virtualW = video.videoWidth;
      virtualH = video.videoHeight;

      // draw first frame into image
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = virtualW;
      tempCanvas.height = virtualH;
      const tctx = tempCanvas.getContext("2d");
      tctx.drawImage(video, 0, 0);

      img.src = tempCanvas.toDataURL("image/png");

      img.onload = () => {
        imageLoaded = true;
        rects.length = 0;
        fitCanvas();
        draw();
      };
    };
  }
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
  scale *= 1.2; 
  redrawZoom(); 
}
function zoomOut() {
  if(!imageLoaded) return; 
  scale /= 1.2; 
  redrawZoom(); 
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
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  
  rects.forEach((r, i)=>{
    const sx = r.x * scale;
    const sy = r.y * scale;
    const sw = r.w * scale;
    const sh = r.h * scale;
    
    ctx.strokeStyle = (i === activeRect) ? "lime" : "red";
    ctx.lineWidth = (i === activeRect) ? 3 : 2;
    ctx.strokeRect(sx, sy, sw, sh);
    
    // ❌ delete cross (top-right)
    if (i === activeRect) {
      ctx.fillStyle = "lime";
      ctx.fillRect(sx + sw - 14, sy, 14, 14);
      
      ctx.fillStyle = "white";
      ctx.font = "12px sans-serif";
      ctx.fillText("×", sx + sw - 11, sy + 11);
      
      ctx.fillStyle = "lime";
      ctx.fillRect(sx + sw - 14, sy + sh - 14, 14, 14);
    }
  });
}

/* ================= TOUCH EVENTS (KEY FIX) ================= */
function getTouchPos(touch) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - r.left) / scale,
    y: (touch.clientY - r.top) / scale
  };
}

// ===================== IMAGE TOUCH START =======================
canvas.addEventListener("touchstart", e=>{
  if(mode === "scroll") return;

  e.preventDefault();
  const t = getTouchPos(e.touches[0]);

  // DRAW MODE → new rect
  if(mode === "draw"){
    rects.push({ x:t.x, y:t.y, w:0, h:0 });
    activeRect = rects.length - 1;
    action = "draw";
    startX = t.x;
    startY = t.y;
    return;
  }

  // EDIT MODE → select rect
  if(mode === "edit"){
    activeRect = -1;

    for(let i = rects.length-1; i>=0; i--){

      const r = rects[i];

      const inside =
        t.x > r.x && t.x < r.x + r.w &&
        t.y > r.y && t.y < r.y + r.h;

      const nearCorner =
        t.x > r.x + r.w - 20 &&
        t.y > r.y + r.h - 20;

      // ❌ check delete cross (top-right)
      const onDelete =
        t.x > r.x + r.w - 20 &&
        t.x < r.x + r.w &&
        t.y > r.y &&
        t.y < r.y + 20;

      if (onDelete) {
        rects.splice(i, 1);        // remove that box
        activeRect = -1;
        action = null;
        draw();
        return;
      }

      if(nearCorner){
        activeRect = i;
        action = "resize";
        return;
      }

      if(inside){
        activeRect = i;
        action = "move";
        offsetX = t.x - r.x;
        offsetY = t.y - r.y;
        return;
      }
    }
  }
});

// ===================== TOUCH MOVE =======================
canvas.addEventListener("touchmove", e=>{
  if(activeRect === -1 || !action) return;
  
  e.preventDefault();
  const t = getTouchPos(e.touches[0]);
  const r = rects[activeRect];
  
  if(action === "draw"){
    r.w = Math.max(10, t.x - startX);
    r.h = Math.max(10, t.y - startY);
    r.x = startX;
    r.y = startY;
  }
  
  if(action === "move"){
    r.x = t.x - offsetX;
    r.y = t.y - offsetY;
  }
  
  if(action === "resize"){
    r.w = Math.max(10, t.x - r.x);
    r.h = Math.max(10, t.y - r.y);
  }
  
  draw();
});

/* ================= CONFIRM ================= */
function confirmBox() {
  if (!imageLoaded) {
    alert("Please upload image or video first");
    return;
  }

  if (rects.length === 0) {
    alert("Please draw at least one area");
    return;
  }

  // prepare coordinates
  const coords = rects.map(r => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.w),
    h: Math.round(r.h)
  }));

  const payload = {
    file_name: uploadedFileName,
    file_type: uploadedFileType,
    coordinates: coords
  };

  fetch(BACKEND_PROCESS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
  .then(res => {
    if (!res.ok) throw new Error("Backend error");
    return res.json();
  })
  .then(data => {
    console.log("Backend response:", data);

    if (data.status === "processed" && data.download_url) {
      const a = document.createElement("a");
      a.href = data.download_url;
      a.download = data.output_file;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      alert("Processing done, but no download link received");
    }
    
  })
  .catch(err => {
    console.error(err);
    alert("Failed to send data to backend");
  });
}

/* ================= RESET ================= */
function resetDraw(){
    rects.length = 0;
    activeRect = -1;
    action = null;
    draw();
}

/* ================= DELETE ================= */
function deleteSelectedBox() {
  if (activeRect === -1) return;
  rects.splice(activeRect, 1);
  activeRect = -1;
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

// ============= TEST BACKEND ===================
// function testBackend() {
//   fetch("https://watermark-backend-lfnp.onrender.com/remove-watermark", {
//     method: "POST"
//   })
//   .then(res => res.json())
//   .then(data => {
//     alert(JSON.stringify(data));
//   })
//   .catch(err => {
//     alert("Error: " + err);
//   });
// }
