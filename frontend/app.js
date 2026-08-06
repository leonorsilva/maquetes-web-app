const API_URL = "http://localhost:8000";

let allEntities = [];
let filteredEntities = [];
let selectedEntities = new Map(); // handle -> { entity, height }
let startingPointHandle = null;

const canvas = document.getElementById("viewport");
const ctx = canvas.getContext("2d");

let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let startPan = { x: 0, y: 0 };

// Auto-resize Canvas
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    draw();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// File Upload Handler
document.getElementById("dxfFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_URL}/parse-dxf`, { method: "POST", body: formData });
    const data = await res.json();

    allEntities = data.entities;
    
    // Populate Layer Dropdown
    const layerSel = document.getElementById("layerSelect");
    layerSel.innerHTML = "<option value='ALL'>-- All Layers --</option>";
    data.layers.forEach(l => {
        layerSel.innerHTML += `<option value="${l}">${l}</option>`;
    });
    layerSel.disabled = false;

    // Reset View Bounds
    fitToScreen();
    filterEntities();
});

document.getElementById("layerSelect").addEventListener("change", filterEntities);

function filterEntities() {
    const layer = document.getElementById("layerSelect").value;
    filteredEntities = layer === "ALL" ? allEntities : allEntities.filter(e => e.layer === layer);
    draw();
}

function fitToScreen() {
    if (allEntities.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allEntities.forEach(e => {
        e.xs.forEach(x => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
        e.ys.forEach(y => { minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    });
    camera.x = (minX + maxX) / 2;
    camera.y = (minY + maxY) / 2;
    camera.zoom = Math.min(canvas.width / (maxX - minX || 1), canvas.height / (maxY - minY || 1)) * 0.8;
}

// Canvas Coordinate Conversions
function worldToScreen(wx, wy) {
    return {
        x: (wx - camera.x) * camera.zoom + canvas.width / 2,
        y: canvas.height / 2 - (wy - camera.y) * camera.zoom
    };
}

function screenToWorld(sx, sy) {
    return {
        x: (sx - canvas.width / 2) / camera.zoom + camera.x,
        y: camera.y - (sy - canvas.height / 2) / camera.zoom
    };
}

// Draw Loop
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    filteredEntities.forEach(e => {
        const isSelected = selectedEntities.has(e.handle);
        const isStart = startingPointHandle === e.handle;

        ctx.beginPath();
        ctx.lineWidth = isStart ? 4 : (isSelected ? 3 : 1);
        ctx.strokeStyle = isStart ? "#ff0000" : (isSelected ? "#00ff00" : "#ffffff");

        for (let i = 0; i < e.xs.length; i++) {
            const pt = worldToScreen(e.xs[i], e.ys[i]);
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
    });
}

// Interaction: Zoom & Pan
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    camera.zoom *= zoomFactor;
    draw();
});

canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    startPan = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    camera.x -= (e.clientX - startPan.x) / camera.zoom;
    camera.y += (e.clientY - startPan.y) / camera.zoom;
    startPan = { x: e.clientX, y: e.clientY };
    draw();
});

canvas.addEventListener("mouseup", () => isDragging = false);

// Picking Entities
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // Hit test lines
    for (let ent of filteredEntities) {
        for (let i = 0; i < ent.xs.length - 1; i++) {
            if (distToSegment(clickPos, {x: ent.xs[i], y: ent.ys[i]}, {x: ent.xs[i+1], y: ent.ys[i+1]}) < (8 / camera.zoom)) {
                if (selectedEntities.has(ent.handle)) {
                    selectedEntities.delete(ent.handle);
                } else {
                    const h = prompt(`Enter wall height for entity ${ent.handle}:`, "2.8");
                    if (h !== null) {
                        selectedEntities.set(ent.handle, { entity: ent, height: parseFloat(h) || 2.8 });
                        if (!startingPointHandle) startingPointHandle = ent.handle;
                    }
                }
                document.getElementById("selCount").innerText = selectedEntities.size;
                document.getElementById("genBtn").disabled = selectedEntities.size === 0;
                draw();
                return;
            }
        }
    }
});

// Segment Distance Calculation for Click Accuracy
function distToSegment(p, v, w) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Generate Perfil API Request
document.getElementById("genBtn").addEventListener("click", async () => {
    let entitiesCoords = [];
    let startPointData = null;

    selectedEntities.forEach((val, handle) => {
        const ent = val.entity;
        
        // Extract start and end coordinates of the entity
        const startPt = [ent.xs[0], ent.ys[0]];
        const endPt = [ent.xs[ent.xs.length - 1], ent.ys[ent.ys.length - 1]];
        
        // Match the structure expected by generate-perfil: [ [x1, y1], [x2, y2], height ]
        const formatted = [startPt, endPt, val.height];

        entitiesCoords.push(formatted);

        if (handle === startingPointHandle) {
            startPointData = formatted;
        }
    });

    const res = await fetch(`${API_URL}/generate-perfil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            startingPoint: startPointData || entitiesCoords[0],
            entitiesCoordinates: entitiesCoords
        })
    });

    if (!res.ok) {
        alert("Error generating perfil DXF");
        return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "perfil.dxf";
    a.click();
});