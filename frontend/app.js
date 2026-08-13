const API_URL = "https://maquetes-web-app.onrender.com";

let allEntities = [];
let filteredEntities = [];
let selectedEntities = new Map(); // handle -> { entity, height }
let selectedEntities_temp = new Map()
let layers = new Map()

let colors = [ "#fb866e",  "#4c3458",  "#786996",  "#cbd6b0",  "#8a901b",  "#d6ee78",  "#d392a2",  "#ae7da2",  "#67b3d3",  "#40738d"]

const canvas = document.getElementById("viewport");
const ctx = canvas.getContext("2d");

let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let startPan = { x: 0, y: 0 };

// Track Shift Key state for multi-select
let isShiftPressed = false;

window.addEventListener("keydown", (e) => { if (e.key === "Shift") isShiftPressed = true; });
window.addEventListener("keyup", (e) => { if (e.key === "Shift") isShiftPressed = false; });

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
        const isSelected = selectedEntities.has(e.handle)
        const isTempSelected = selectedEntities_temp.has(e.handle);

        ctx.beginPath();
        ctx.lineWidth = 4;
        if (isTempSelected) {
            ctx.strokeStyle = "#00ffff"; // Cyan
            console.log(selectedEntities_temp.get(e.handle));
            console.log(selectedEntities_temp.get(e.handle).corner);
            if (selectedEntities_temp.get(e.handle).corner == 1) {
                ctx.strokeStyle = "#ff0000"; // Red
            }
            ctx.lineWidth = 3 ;
        } else if (isSelected) {
            ctx.strokeStyle = "#00ff00"; // Green 
        } else {
            ctx.strokeStyle = "#0a0a0a"; // Default White
            ctx.lineWidth = 1
        }

        layers.forEach((layerEntities, layerName) => {
            const islayer = layerEntities.has(e.handle)
            const color = colors[layerName]
            console.log(`Layer: ${layerName}, Color: ${color}, Entity Handle: ${e.handle}, Is in Layer: ${islayer}`);
            if (islayer) {
                ctx.strokeStyle = color; // Green if selected, else layer color
                ctx.lineWidth = 10 ;
            }
        });

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

// Canvas Click Event Listener
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // Hit test lines
    for (let ent of filteredEntities) {
        for (let i = 0; i < ent.xs.length - 1; i++) {
            const p1 = { x: ent.xs[i], y: ent.ys[i] };
            const p2 = { x: ent.xs[i+1], y: ent.ys[i+1] };

            if (distToSegment(clickPos, p1, p2) < (8 / camera.zoom)) {
                // If Shift is held, then entity needs to consider the paper width
                if (isShiftPressed) {
                    if (!selectedEntities_temp.has(ent.handle)){
                        selectedEntities_temp.set(ent.handle, { entity: ent, height: 2.8, corner: 1 });
                    }
                    else{
                        selectedEntities_temp.set(ent.handle, { entity: ent, height: 2.8, corner: 0 });
                    }
                } else if (selectedEntities.has(ent.handle)) {
                    selectedEntities.delete(ent.handle);

                } else if (selectedEntities_temp.has(ent.handle)) {
                    selectedEntities_temp.delete(ent.handle);
                } else {
                    // Default height of 2.8 until explicitly changed
                    selectedEntities_temp.set(ent.handle, { entity: ent, height: 2.8, corner: 0 });
                }

                updateUI();
                draw();
                return;
            }
        }
    }
});

// Update button states and counters
function updateUI() {
    const count = selectedEntities.size + selectedEntities_temp.size;
    document.getElementById("selCount").innerText = count;
    document.getElementById("setHeightBtn").disabled = count === 0;
    document.getElementById("clearSelBtn").disabled = count === 0;
    document.getElementById("addLayer").disabled = count === 0;
    const totalEntities = count + layers.size;
    document.getElementById("genBtn").disabled = totalEntities === 0;
}

// Bulk Height Assignment Button
document.getElementById("setHeightBtn").addEventListener("click", () => {
    if (selectedEntities_temp.size === 0) return;

    const inputHeight = prompt(
        `Enter height for all ${selectedEntities_temp.size} selected entities:`, 
        "2.8"
    );

    if (inputHeight !== null) {
        const heightVal = parseFloat(inputHeight) || 2.8;
        selectedEntities_temp.forEach((val, handle) => {
            val.height = heightVal;
            console.log(val);
            console.log(handle);
        });
        selectedEntities_temp.forEach((value, key) => {
            selectedEntities.set(key, value);
        }); // Commit temp selection to main selection

        selectedEntities_temp.clear(); // Clear temp selection after committing
        alert(`Assigned height ${heightVal}m to ${selectedEntities.size} entities.`);
    }
});

document.getElementById("addLayer").addEventListener("click", () => {
    createNewLayer();
});

function createNewLayer() {
    if (selectedEntities.size === 0) {
        alert("No entities selected to add to a new layer.");
        return false;
    }
    if (selectedEntities_temp.size > 0) {
        alert("Select height for all entities before adding to a new layer.");
        return false;
    }

    const layerContent = new Map(selectedEntities);
    layers.set(`${layers.size}`, layerContent);
    selectedEntities.clear();
    
    updateUI();
    draw();
    return true; // Successfully created
}

// Clear Selection Button
document.getElementById("clearSelBtn").addEventListener("click", () => {
    selectedEntities.clear();
    selectedEntities_temp.clear();
    updateUI();
    draw();
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
    let layerCoords = [];
    let startPointData = null;

    if (selectedEntities.size > 0) {
        createNewLayer(); // Commit any remaining temp selections to a new layer
    }

    layers.forEach((layerEntities, layerName) => {  
        let entitiesCoords = [];
        layerEntities.forEach((val, handle) => {
            console.log(`generating perfil`);
            const ent = val.entity;
            console.log(`Entity Handle: ${ent}, Height: ${val.height}`);
            console.log(`Entity Coordinates: Xs: ${ent.xs}, Ys: ${ent.ys}`);
            
            // Extract start and end coordinates of the entity
            const startPt = [ent.xs[0], ent.ys[0]];
            const endPt = [ent.xs[1], ent.ys[1]];
            
            // Match the structure expected by generate-perfil: [ [x1, y1], [x2, y2], height ]
            const formatted = [startPt, endPt, val.height, val.corner];

            entitiesCoords.push(formatted);

        });
        layerCoords.push(entitiesCoords);
    });

    const paperWidth = document.getElementById("paperWidth").value;
    console.log(paperWidth.value);
    if (typeof paperWidth == 'undefined'){
        alert('paper width is missing');
        return false;
    }

    const res = await fetch(`${API_URL}/generate-perfil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            layerCoords: layerCoords,
            paperWidth: paperWidth
        })
    });

    if (!res.ok) {
        alert("Error generating perfil DXF");
        return;
    }

    const data = await res.json();
    // 1. Plot the ordered entities on your Canvas
    if (data.orderedEntities) {
        localStorage.setItem("orderedEntitiesPlot", JSON.stringify(data.orderedEntities));
        window.open("plot.html", "_blank"); // Opens plot page in a new tab
    }

    // 2. Convert Base64 back to Blob and trigger File Download
    if (data.fileData) {
        const byteCharacters = atob(data.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/dxf" });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = data.fileName || "perfil.dxf";
        link.click();
        URL.revokeObjectURL(link.href);
    }
});

