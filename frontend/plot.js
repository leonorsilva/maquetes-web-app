let colors = [
    "#fb866e", "#4c3458", "#786996", "#cbd6b0", "#8a901b",
    "#d6ee78", "#d392a2", "#ae7da2", "#67b3d3", "#40738d"
];

let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };

const canvas = document.getElementById("plotCanvas");
const ctx = canvas.getContext("2d");

// Load data from localStorage
const rawData = localStorage.getItem("orderedEntitiesPlot");
const orderedData = rawData ? JSON.parse(rawData) : [];

// -------------------------------------------------------------
// Core Plotting Function
// -------------------------------------------------------------
function drawOrderedPlot() {
    if (!orderedData || orderedData.length === 0) return;

    // Clear canvas frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let idx = 0;
    orderedData.forEach((layer, index) => {
        const colorLayer = colors[index % colors.length];

        layer.forEach(item => {
            const [[x1, y1], [x2, y2]] = item;
            const [cx1, cy1] = worldToScreen(x1, y1);
            const [cx2, cy2] = worldToScreen(x2, y2);

            // 1. Draw Line Segment
            ctx.beginPath();
            ctx.moveTo(cx1, cy1);
            ctx.lineTo(cx2, cy2);
            ctx.strokeStyle = colorLayer;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // 2. Draw Start Point Anchor (P1)
            ctx.beginPath();
            ctx.arc(cx1, cy1, 3, 0, Math.PI * 2);
            ctx.fillStyle = "#0a0a0a";
            ctx.fill();

            // 3. Draw Index Label at Midpoint
            const midX = (cx1 + cx2) / 2;
            const midY = (cy1 + cy2) / 2;

            // Optional: Uncomment to draw background pill for labels
            // ctx.beginPath();
            // ctx.arc(midX, midY, 9, 0, Math.PI * 2);
            // ctx.fillStyle = "#ffcc00";
            // ctx.fill();

            ctx.fillStyle = "#000000";
            ctx.font = "bold 11px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(idx, midX, midY);

            idx += 1;
        });
    });
}

function renderLegend(data) {
    const legendContainer = document.getElementById("legendList");
    if (!legendContainer) return;

    legendContainer.innerHTML = ""; // Clear existing items

    // Add dynamic layer colors based on loaded data
    if (data && data.length > 0) {
        data.forEach((layer, index) => {
            const layerColor = colors[index % colors.length];
            
            const li = document.createElement("li");
            li.className = "legend-item";
            li.innerHTML = `
                <span class="color-swatch" style="background: ${layerColor};"></span>
                <span>Layer ${index + 1} (${layer.length} items)</span>
            `;
            legendContainer.appendChild(li);
        });
    }
}

// -------------------------------------------------------------
// Auto-Fit Camera (Only run once on initial load)
// -------------------------------------------------------------
function fitToScreen(data) {
    if (!data || data.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    data.forEach(layer => {
        layer.forEach(item => {
            const [[x1, y1], [x2, y2]] = item;
            minX = Math.min(minX, x1, x2);
            maxX = Math.max(maxX, x1, x2);
            minY = Math.min(minY, y1, y2);
            maxY = Math.max(maxY, y1, y2);
        });
    });

    camera.x = (minX + maxX) / 2;
    camera.y = (minY + maxY) / 2;

    const dataWidth = maxX - minX || 1;
    const dataHeight = maxY - minY || 1;
    camera.zoom = Math.min(
        canvas.width / dataWidth,
        canvas.height / dataHeight
    ) * 0.8; // 80% boundary padding
}

// World to Screen Coordinate Converter
function worldToScreen(x, y) {
    return [
        (x - camera.x) * camera.zoom + canvas.width / 2,
        canvas.height / 2 - (y - camera.y) * camera.zoom
    ];
}

// -------------------------------------------------------------
// Pan & Zoom Event Listeners
// -------------------------------------------------------------

// Mouse Drag (Pan)
canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
});

window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    // Convert pixel delta to CAD world coordinates
    camera.x -= dx / camera.zoom;
    camera.y += dy / camera.zoom; // Invert Y for CAD view

    dragStart = { x: e.clientX, y: e.clientY };
    drawOrderedPlot();
});

window.addEventListener("mouseup", () => {
    isDragging = false;
});

// Scroll Wheel (Zoom to Cursor)
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    
    // Zoom limits
    const newZoom = camera.zoom * zoomFactor;
    if (newZoom > 0.001 && newZoom < 1000) {
        camera.zoom = newZoom;
        drawOrderedPlot();
    }
}, { passive: false });

// -------------------------------------------------------------
// Initialization Sequence
// -------------------------------------------------------------
function initPage() {
    // 1. Adjust canvas pixel dimensions to parent container
    canvas.width = canvas.parentElement.clientWidth || window.innerWidth;
    canvas.height = canvas.parentElement.clientHeight || window.innerHeight;

    // 2. Initial camera position setting
    if (orderedData.length > 0) {
        fitToScreen(orderedData);
        drawOrderedPlot();
        renderLegend(orderedData);
    }
}

// Handle window resizing without resetting user pan/zoom position
window.addEventListener("resize", () => {
    canvas.width = canvas.parentElement.clientWidth || window.innerWidth;
    canvas.height = canvas.parentElement.clientHeight || window.innerHeight;
    drawOrderedPlot();
});

// Trigger setup on page load
window.addEventListener("DOMContentLoaded", initPage);