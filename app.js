/* ==========================================================================
   NRSC GeoTIFF Visualization Platform - Core Application Logic
   ========================================================================== */

// Global State Management
let map = null;
let activeRasterLayer = null;
let activeBoundaryLayer = null;
let activeClickMarker = null;

let georasterObject = null; // Parsed georaster instance
let selectedFile = null;

// Display States
let currentOpacity = 0.8;
let currentMode = 'ndvi';
let activeBasemapName = 'sat';

// Spectral Band Indices Mapping (Dynamic based on profile selection)
let currentBandProfile = 'demo';
let redBandIndex = 0;
let nirBandIndex = 1;
let greenBandIndex = 2;
let blueBandIndex = null;

function updateBandIndices() {
  if (currentBandProfile === 'demo') {
    redBandIndex = 0;
    nirBandIndex = 1;
    greenBandIndex = 2;
    blueBandIndex = null;
  } else if (currentBandProfile === 'bgr') {
    blueBandIndex = 0;
    greenBandIndex = 1;
    redBandIndex = 2;
    nirBandIndex = null; // No NIR
  } else if (currentBandProfile === 'rgb') {
    redBandIndex = 0;
    greenBandIndex = 1;
    blueBandIndex = 2;
    nirBandIndex = null; // No NIR
  }
}

// Charts
let ndviTrendChart = null;
let landCoverChart = null;

// Map Basemaps references
let basemaps = {};

// Wait for DOM Content to load
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initCharts();
  setupEventListeners();
  showToast("NRSC Remote Sensing Platform Initialized. Welcome.", "info");
});

/* ==========================================================================
   MAP INITIALIZATION & CONTROLS
   ========================================================================== */
function initMap() {
  // Center map on India as default, Satellite view zoom level 5
  map = L.map('map', {
    zoomControl: true,
    minZoom: 2,
    maxZoom: 18
  }).setView([20.5937, 78.9629], 5);

  // Initialize Basemaps
  basemaps.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  basemaps.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  basemaps.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  });

  // Add default satellite basemap
  basemaps.sat.addTo(map);

  // Coordinate Tracker HUD: update Lat/Lng on mouse move
  const mouseCoordsPill = document.getElementById('mouse-coords');
  map.on('mousemove', (e) => {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);
    mouseCoordsPill.innerHTML = `<i class="fa-solid fa-location-dot"></i> Lat: ${lat}, Lng: ${lng}`;
  });

  // Setup click handler for pixel querying on map
  map.on('click', handleMapClick);
}

/* ==========================================================================
   CHART INITIALIZATION (CHART.JS)
   ========================================================================== */
function initCharts() {
  // Multi-Year average NDVI line chart
  const lineCtx = document.getElementById('ndviTrendChart').getContext('2d');
  
  // Custom neon gradient for the line chart
  const neonGradient = lineCtx.createLinearGradient(0, 0, 0, 180);
  neonGradient.addColorStop(0, 'rgba(0, 230, 118, 0.4)');
  neonGradient.addColorStop(1, 'rgba(0, 230, 118, 0.0)');

  ndviTrendChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: ['2018', '2019', '2020', '2021', '2022'],
      datasets: [{
        label: 'Vegetation Density Index (%)',
        data: [20, 35, 45, 60, 75],
        borderColor: '#00e676',
        borderWidth: 2,
        backgroundColor: neonGradient,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#00e676',
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#00e676',
        pointHoverBorderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#161c24',
          titleFont: { family: 'Space Grotesk', weight: 'bold' },
          bodyFont: { family: 'Plus Jakarta Sans' },
          borderColor: '#263343',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#90a4ae',
            font: { family: 'Space Grotesk', size: 10 },
            callback: (val) => val + '%'
          },
          min: 0,
          max: 100
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#90a4ae',
            font: { family: 'Space Grotesk', size: 10 }
          }
        }
      }
    }
  });

  // Scene land cover distribution Doughnut/Bar chart
  const barCtx = document.getElementById('landCoverChart').getContext('2d');
  landCoverChart = new Chart(barCtx, {
    type: 'doughnut',
    data: {
      labels: ['Dense Canopy', 'Agriculture', 'Grassland', 'Scrub', 'Urban/Bare', 'Water'],
      datasets: [{
        data: [0, 0, 0, 0, 0, 0], // Initialized as 0, populated upon raster analysis
        backgroundColor: [
          '#1b5e20', // Dense
          '#4caf50', // Ag
          '#8bc34a', // Grass
          '#d4e7a2', // Scrub
          '#e2cfa7', // Urban
          '#0055ff'  // Water
        ],
        borderWidth: 1,
        borderColor: '#161c24'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#90a4ae',
            font: { family: 'Plus Jakarta Sans', size: 9 },
            boxWidth: 10,
            padding: 8
          }
        },
        tooltip: {
          backgroundColor: '#161c24',
          titleFont: { family: 'Space Grotesk' },
          bodyFont: { family: 'Plus Jakarta Sans' },
          borderColor: '#263343',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return ` ${context.label}: ${context.raw.toFixed(1)}%`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });
}

/* ==========================================================================
   GEOTIFF PARSING & RASTER RENDERING
   ========================================================================== */

/**
 * Handles rendering the parsed GeoTIFF overlay on the map.
 * Recreates the layer if options (opacity, rendering mode) change.
 */
function renderRasterOverlay() {
  if (!georasterObject) return;

  // 1. Remove existing layer if present
  if (activeRasterLayer) {
    map.removeLayer(activeRasterLayer);
  }

  // 2. Define the pixel styling algorithm (Bespoke GIS composites)
  const pixelValuesToColorFn = (values) => {
    // If pixel represents nodata or contains nulls
    if (values === null || values === undefined || values.length === 0 || values[0] === null) {
      return null;
    }

    // Dynamic band values extraction
    const redVal = redBandIndex !== null && values[redBandIndex] !== undefined ? values[redBandIndex] : null;
    const greenVal = greenBandIndex !== null && values[greenBandIndex] !== undefined ? values[greenBandIndex] : null;
    const blueVal = blueBandIndex !== null && values[blueBandIndex] !== undefined ? values[blueBandIndex] : null;
    const nirVal = nirBandIndex !== null && values[nirBandIndex] !== undefined ? values[nirBandIndex] : null;

    if (currentMode === 'ndvi') {
      let ndvi = 0;
      if (nirVal !== null && redVal !== null) {
        // True NDVI (NIR and Red)
        ndvi = (nirVal - redVal) / (nirVal + redVal + 0.00001);
      } else if (greenVal !== null && redVal !== null) {
        // Fallback GRVI: (Green - Red) / (Green + Red)
        ndvi = (greenVal - redVal) / (greenVal + redVal + 0.00001);
      } else {
        // Single band dataset: Assume value itself represents raw index or elevation
        const band0 = values[0];
        if (georasterObject.mins[0] >= 0 && georasterObject.maxs[0] > 1) {
          const range = georasterObject.ranges[0] || 255;
          ndvi = -1.0 + (2.0 * (band0 - georasterObject.mins[0]) / range);
        } else {
          ndvi = band0;
        }
      }

      // Map scientific NDVI/GRVI thresholds to rich color palette
      if (ndvi < -0.1) return '#0055ff'; // Deep Water body
      if (ndvi < 0.08) return '#e2cfa7'; // Urban/Built-up / Bare soil
      if (ndvi < 0.15) return '#d4e7a2'; // Dry sparse scrub / Barren land
      if (ndvi < 0.3) return '#8bc34a';  // Shrub & Grasslands
      if (ndvi < 0.5) return '#4caf50';  // Healthy Agriculture / Crops
      return '#1b5e20';                  // Dense Forest / Canopy
    }
    
    else if (currentMode === 'false-color') {
      const scaleVal = (val, bandIdx) => {
        if (val === null) return 0;
        const min = georasterObject.mins[bandIdx];
        const max = georasterObject.maxs[bandIdx];
        const range = max - min || 255;
        return Math.min(255, Math.max(0, Math.floor(((val - min) / range) * 255)));
      };

      if (nirVal !== null && redVal !== null && greenVal !== null) {
        // NIR -> Red, Red -> Green, Green -> Blue
        const r = scaleVal(nirVal, nirBandIndex);
        const g = scaleVal(redVal, redBandIndex);
        const b = scaleVal(greenVal, greenBandIndex);
        return `rgb(${r},${g},${b})`;
      } else if (redVal !== null && greenVal !== null && blueVal !== null) {
        // Pseudo Shift False-Color (swap RGB order)
        const r = scaleVal(redVal, redBandIndex);
        const g = scaleVal(greenVal, greenBandIndex);
        const b = scaleVal(blueVal, blueBandIndex);
        return `rgb(${b},${r},${g})`;
      } else {
        const band0 = values[0];
        const gray = Math.min(255, Math.max(0, Math.floor(band0)));
        return `rgb(${gray},0,0)`;
      }
    }
    
    else if (currentMode === 'true-color') {
      const scaleVal = (val, bandIdx) => {
        if (val === null) return 0;
        const min = georasterObject.mins[bandIdx];
        const max = georasterObject.maxs[bandIdx];
        const range = max - min || 255;
        return Math.min(255, Math.max(0, Math.floor(((val - min) / range) * 255)));
      };

      if (redVal !== null && greenVal !== null && blueVal !== null) {
        const r = scaleVal(redVal, redBandIndex);
        const g = scaleVal(greenVal, greenBandIndex);
        const b = scaleVal(blueVal, blueBandIndex);
        return `rgb(${r},${g},${b})`;
      } else if (redVal !== null && greenVal !== null && nirVal !== null) {
        // Demo synthetic preset mapping
        const r = scaleVal(redVal, redBandIndex);
        const g = scaleVal(greenVal, greenBandIndex);
        const b = Math.floor(r * 0.7 + g * 0.3); // Simulate blue
        return `rgb(${r},${g},${b})`;
      } else {
        const band0 = values[0];
        const min = georasterObject.mins[0];
        const max = georasterObject.maxs[0];
        const range = max - min || 255;
        const gray = Math.min(255, Math.max(0, Math.floor(((band0 - min) / range) * 255)));
        return `rgb(${gray},${gray},${gray})`;
      }
    }
    
    else if (currentMode === 'grayscale') {
      const band0 = values[0];
      const min = georasterObject.mins[0];
      const max = georasterObject.maxs[0];
      const range = max - min || 255;
      const intensity = Math.min(255, Math.max(0, Math.floor(((band0 - min) / range) * 255)));
      return `rgb(${intensity},${intensity},${intensity})`;
    }

    return null;
  };

  // 3. Create Leaflet GeoRaster Layer
  try {
    activeRasterLayer = new GeoRasterLayer({
      georaster: georasterObject,
      opacity: currentOpacity,
      pixelValuesToColorFn: pixelValuesToColorFn,
      resolution: 128 // Balance client-side performance and rendering details
    });

    activeRasterLayer.addTo(map);
  } catch (err) {
    console.error("GeoRaster Layer generation error:", err);
    showToast("Rendering error. Try re-sampling.", "error");
  }
}

/**
 * Zooms the map view to the raster boundary and overlays a neon bounding frame.
 */
function fitMapToRaster() {
  if (!activeRasterLayer) return;

  const bounds = activeRasterLayer.getBounds();
  
  // Fit map boundaries
  map.fitBounds(bounds, {
    padding: [30, 30],
    animate: true,
    duration: 1.2
  });

  // Remove existing boundary line
  if (activeBoundaryLayer) {
    map.removeLayer(activeBoundaryLayer);
  }

  // Add highly visible neon bounding outline
  activeBoundaryLayer = L.rectangle(bounds, {
    color: '#00e676',
    weight: 2,
    fill: false,
    dashArray: '6, 6',
    className: 'raster-boundary'
  }).addTo(map);
}

/* ==========================================================================
   SCENE STATISTICAL ANALYSIS & CHART UPDATES
   ========================================================================== */

/**
 * Loops through the raster matrix pixels to compute spatial statistics and 
 * updates the Land Cover Distribution chart.
 */
function analyzeRasterData() {
  if (!georasterObject) return;

  const width = georasterObject.width;
  const height = georasterObject.height;
  const bands = georasterObject.numberOfRasters;

  // Formulate dynamic band details label
  let bandsLabel = `${bands} Band${bands > 1 ? 's' : ''}`;
  if (currentBandProfile === 'demo') {
    bandsLabel += " (Red, NIR, Green)";
  } else if (currentBandProfile === 'bgr') {
    bandsLabel += " (Blue, Green, Red)";
  } else if (currentBandProfile === 'rgb') {
    bandsLabel += " (Red, Green, Blue)";
  }

  // 1. Populate metadata values in sidebar
  document.getElementById('meta-filename').textContent = selectedFile ? selectedFile.name : "synthetic_demo_scene.tif";
  document.getElementById('meta-crs').textContent = georasterObject.projection ? `EPSG:${georasterObject.projection}` : "EPSG:4326 (WGS 84)";
  document.getElementById('meta-dim').textContent = `${width} \u00d7 ${height} px`;
  document.getElementById('meta-bands').textContent = bandsLabel;
  
  // Formulate resolution string
  const resX = georasterObject.pixelWidth.toFixed(6);
  const resY = georasterObject.pixelHeight.toFixed(6);
  document.getElementById('meta-res').textContent = `${resX}\u00b0 / pixel`;
  
  // Bounds details
  const xMin = georasterObject.xmin.toFixed(4);
  const xMax = georasterObject.xmax.toFixed(4);
  const yMin = georasterObject.ymin.toFixed(4);
  const yMax = georasterObject.ymax.toFixed(4);
  document.getElementById('meta-bounds').innerHTML = `W: ${xMin}&deg;<br>E: ${xMax}&deg;<br>S: ${yMin}&deg;<br>N: ${yMax}&deg;`;

  // 2. Perform pixel sweep to categorize land cover distributions using dynamic band indices
  let totalPixels = 0;
  let waterCount = 0;
  let urbanCount = 0;
  let scrubCount = 0;
  let grasslandCount = 0;
  let agricultureCount = 0;
  let denseCount = 0;

  const redBand = redBandIndex !== null ? georasterObject.values[redBandIndex] : georasterObject.values[0];
  const nirBand = nirBandIndex !== null ? georasterObject.values[nirBandIndex] : null;
  const greenBand = greenBandIndex !== null ? georasterObject.values[greenBandIndex] : null;

  // Sweep every 2nd pixel for swift performance without losing accuracy
  const step = width > 500 ? 4 : 2; 

  for (let r = 0; r < height; r += step) {
    if (!redBand[r]) continue;
    for (let c = 0; c < width; c += step) {
      const redVal = redBand[r][c];
      const nirVal = nirBand && nirBand[r] ? nirBand[r][c] : null;
      const greenVal = greenBand && greenBand[r] ? greenBand[r][c] : null;

      if (redVal === null || redVal === undefined) continue;

      let ndvi = 0;
      if (nirVal !== null) {
        // True NDVI (NIR and Red)
        ndvi = (nirVal - redVal) / (nirVal + redVal + 0.00001);
      } else if (greenVal !== null) {
        // Fallback GRVI: (Green - Red) / (Green + Red)
        ndvi = (greenVal - redVal) / (greenVal + redVal + 0.00001);
      } else {
        // Single-band
        if (georasterObject.mins[0] >= 0 && georasterObject.maxs[0] > 1) {
          const range = georasterObject.ranges[0] || 255;
          ndvi = -1.0 + (2.0 * (redVal - georasterObject.mins[0]) / range);
        } else {
          ndvi = redVal;
        }
      }

      totalPixels++;

      if (ndvi < -0.1) waterCount++;
      else if (ndvi < 0.08) urbanCount++;
      else if (ndvi < 0.15) scrubCount++;
      else if (ndvi < 0.3) grasslandCount++;
      else if (ndvi < 0.5) agricultureCount++;
      else denseCount++;
    }
  }

  // Calculate percentages
  const waterPct = (waterCount / totalPixels) * 100;
  const urbanPct = (urbanCount / totalPixels) * 100;
  const scrubPct = (scrubCount / totalPixels) * 100;
  const grassPct = (grasslandCount / totalPixels) * 100;
  const agPct = (agricultureCount / totalPixels) * 100;
  const densePct = (denseCount / totalPixels) * 100;

  // 3. Update Land Cover chart
  landCoverChart.data.datasets[0].data = [
    densePct,
    agPct,
    grassPct,
    scrubPct,
    urbanPct,
    waterPct
  ];
  landCoverChart.update();

  // Show distribution section
  document.getElementById('distribution-chart-container').classList.remove('hidden');

  // 4. Update the Multi-Year Trend Chart dynamically based on the dominant vegetation type
  // Make the line chart data look responsive to the specific file's vegetation health!
  const avgNDVI = (densePct * 0.8 + agPct * 0.5 + grassPct * 0.3 + scrubPct * 0.15 + urbanPct * 0.05 + waterPct * -0.2) / 100;
  const scaledAvg = Math.max(10, Math.min(95, Math.round(avgNDVI * 100)));
  
  // Simulate historical growth context leading up to this value
  const historyData = [
    Math.round(scaledAvg * 0.45),
    Math.round(scaledAvg * 0.65),
    Math.round(scaledAvg * 0.80),
    Math.round(scaledAvg * 0.90),
    scaledAvg
  ];

  ndviTrendChart.data.datasets[0].data = historyData;
  ndviTrendChart.data.datasets[0].label = `Index Trend (Avg NDVI: ${avgNDVI.toFixed(2)})`;
  ndviTrendChart.update();
}

/* ==========================================================================
   CLICK INTERACTION: GEOPHYSICAL POINT INSPECTOR
   ========================================================================== */

/**
 * Handles mouse clicks on the map, queries the raster array data at the exact 
 * lat/lng coordinate, and populates the pixel inspector and map popups.
 */
function handleMapClick(e) {
  if (!georasterObject) return;

  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  const xmin = georasterObject.xmin;
  const xmax = georasterObject.xmax;
  const ymin = georasterObject.ymin;
  const ymax = georasterObject.ymax;

  // Check if click was inside the bounding box of the raster layer
  if (lng >= xmin && lng <= xmax && lat >= ymin && lat <= ymax) {
    // 1. Calculate row & column indices in raster matrix (mathematical projection conversion)
    const width = georasterObject.width;
    const height = georasterObject.height;
    
    const col = Math.floor(((lng - xmin) / (xmax - xmin)) * width);
    // Row 0 is ymax (top of raster), row height-1 is ymin (bottom)
    const row = Math.floor(((ymax - lat) / (ymax - ymin)) * height);

    // Ensure within array bounds
    if (col < 0 || col >= width || row < 0 || row >= height) return;

    // 2. Fetch raw pixel band values using dynamic indices
    const redVal = redBandIndex !== null && georasterObject.values[redBandIndex][row] !== undefined ? georasterObject.values[redBandIndex][row][col] : null;
    const greenVal = greenBandIndex !== null && georasterObject.values[greenBandIndex] && georasterObject.values[greenBandIndex][row] !== undefined ? georasterObject.values[greenBandIndex][row][col] : null;
    const blueVal = blueBandIndex !== null && georasterObject.values[blueBandIndex] && georasterObject.values[blueBandIndex][row] !== undefined ? georasterObject.values[blueBandIndex][row][col] : null;
    const nirVal = nirBandIndex !== null && georasterObject.values[nirBandIndex] && georasterObject.values[nirBandIndex][row] !== undefined ? georasterObject.values[nirBandIndex][row][col] : null;

    if (redVal === null || redVal === undefined) {
      showToast("Clicked on Nodata value region", "info");
      return;
    }

    // 3. Compute vegetation index (NDVI / GRVI)
    let ndvi = 0;
    let indexName = "NDVI";
    let bandDetailsStr = `B1: ${redVal}`;

    if (nirVal !== null) {
      ndvi = (nirVal - redVal) / (nirVal + redVal + 0.00001);
      bandDetailsStr = `Red: ${Math.round(redVal)} | NIR: ${Math.round(nirVal)}` + (greenVal !== null ? ` | Grn: ${Math.round(greenVal)}` : '');
    } else if (greenVal !== null) {
      ndvi = (greenVal - redVal) / (greenVal + redVal + 0.00001); // Fallback GRVI
      indexName = "GRVI";
      bandDetailsStr = `Red: ${Math.round(redVal)} | Green: ${Math.round(greenVal)}` + (blueVal !== null ? ` | Blue: ${Math.round(blueVal)}` : '');
    } else {
      // Normalize single band
      if (georasterObject.mins[0] >= 0 && georasterObject.maxs[0] > 1) {
        const range = georasterObject.ranges[0] || 255;
        ndvi = -1.0 + (2.0 * (redVal - georasterObject.mins[0]) / range);
      } else {
        ndvi = redVal;
      }
      bandDetailsStr = `Band 1: ${redVal.toFixed(2)}`;
    }

    // 4. Classify land cover category based on NDVI/GRVI value
    let landCoverClass = "Unknown";
    let landClassColor = "#ffffff";
    let landCoverDescription = "";

    if (ndvi < -0.1) {
      landCoverClass = "Water Body / Wetland";
      landClassColor = "#2979ff";
      landCoverDescription = "High absorption. Characterized by rivers, lakes, or dense cloud shadows.";
    } else if (ndvi < 0.08) {
      landCoverClass = "Urban / Built-up / Bare";
      landClassColor = "#e2cfa7";
      landCoverDescription = "High reflectance in both Red and Green/NIR. Typified by concrete structures or fallow bare fields.";
    } else if (ndvi < 0.15) {
      landCoverClass = "Sparse Scrub / Desert";
      landClassColor = "#d4e7a2";
      landCoverDescription = "Semi-arid soil surface with sparse, dry scrub patches.";
    } else if (ndvi < 0.3) {
      landCoverClass = "Shrub & Grassland";
      landClassColor = "#8bc34a";
      landCoverDescription = "Moderate vegetation coverage, natural grasslands, or early-stage crops.";
    } else if (ndvi < 0.5) {
      landCoverClass = "Healthy Crops / Agriculture";
      landClassColor = "#4caf50";
      landCoverDescription = "Active agricultural sector. High photosynthetic chlorophyll reflectance.";
    } else {
      landCoverClass = "Dense Canopy / Forest";
      landClassColor = "#00e676";
      landCoverDescription = "High canopy foliage cover. Pristine healthy woodland or deep forestry reserve.";
    }

    // 5. Update Pixel Inspector card in Left Sidebar
    document.getElementById('inspector-section').classList.remove('hidden');
    document.getElementById('inspect-coords').innerHTML = `Lat: ${lat.toFixed(5)}&deg;<br>Lng: ${lng.toFixed(5)}&deg;<br><small class="code-font">(Row: ${row}, Col: ${col})</small>`;
    document.getElementById('inspect-ndvi').innerHTML = `${ndvi.toFixed(4)} <small style="font-size:9px; color:#90a4ae;">(${indexName})</small>`;
    document.getElementById('inspect-bands').textContent = bandDetailsStr;
    
    const inspectClassSpan = document.getElementById('inspect-class');
    inspectClassSpan.textContent = landCoverClass;
    inspectClassSpan.style.color = landClassColor;
    inspectClassSpan.style.borderColor = landClassColor + '40';
    inspectClassSpan.style.backgroundColor = landClassColor + '15';

    // 6. Draw glowing click point marker on map
    if (activeClickMarker) {
      map.removeLayer(activeClickMarker);
    }
    
    activeClickMarker = L.circleMarker([lat, lng], {
      radius: 6,
      color: '#00e5ff',
      fillColor: '#090d11',
      fillOpacity: 1,
      weight: 2,
      className: 'pulsing-click-marker'
    }).addTo(map);

    // 7. Render high-tech HUD popup on map
    const popupContent = `
      <div class="popup-hud">
        <div class="popup-hud-title"><i class="fa-solid fa-satellite-dish"></i> NRSC Spatial Probe</div>
        <div class="popup-hud-row"><span>Latitude</span><span>${lat.toFixed(5)}&deg;</span></div>
        <div class="popup-hud-row"><span>Longitude</span><span>${lng.toFixed(5)}&deg;</span></div>
        <div class="popup-hud-row"><span>Pixel (Row/Col)</span><span>[${row}, ${col}]</span></div>
        <div class="popup-hud-row"><span style="color:#00e676; font-weight:600;">NDVI Index</span><span style="color:#00e676; font-weight:bold;">${ndvi.toFixed(4)}</span></div>
        <div class="popup-hud-row"><span>Classification</span><span style="color:${landClassColor}; font-weight:600;">${landCoverClass}</span></div>
        <p style="margin-top:6px; font-size:10px; color:#90a4ae; line-height:1.3; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">
          ${landCoverDescription}
        </p>
      </div>
    `;

    L.popup({
      offset: [0, -5],
      closeButton: true
    })
      .setLatLng([lat, lng])
      .setContent(popupContent)
      .openOn(map);
  }
}

/* ==========================================================================
   DEMO DATASET CREATION (SYNTHETIC SATELLITE IMAGE GENERATOR)
   ========================================================================== */

/**
 * Builds a highly realistic, multi-spectral (Red, NIR, Green) satellite dataset 
 * in memory in the EPSG:4326 projection, representing agricultural lands 
 * near Hyderabad, India, centered around the NRSC data campus coordinates.
 */
function generateDemoDataset() {
  showToast("Synthesizing multi-spectral GeoTIFF band matrices...", "info");
  
  // Dimensions
  const width = 250;
  const height = 250;

  // Bounding coords: Near Hyderabad, Telangana (17.385, 78.486)
  const xmin = 78.38;
  const xmax = 78.58;
  const ymin = 17.28;
  const ymax = 17.48;

  const pixelWidth = (xmax - xmin) / width;
  const pixelHeight = (ymax - ymin) / height;

  const red = [];
  const nir = [];
  const green = [];

  // Sweep matrix to build procedural natural structures
  for (let r = 0; r < height; r++) {
    const redRow = [];
    const nirRow = [];
    const greenRow = [];

    for (let c = 0; c < width; c++) {
      const x = c / width;
      const y = r / height;

      // 1. Winding River channel (flowing diagonally)
      // sine wave perturbation generates meandering behavior
      const riverCenter = 0.35 + 0.15 * Math.sin(y * Math.PI * 2.5) + 0.03 * Math.sin(y * Math.PI * 8);
      const distToRiver = Math.abs(x - riverCenter);
      const isRiver = distToRiver < 0.03;
      const isRiverBank = distToRiver >= 0.03 && distToRiver < 0.06;

      // 2. City settlement / urban core (Top Right quadrant)
      const cityX = 0.78;
      const cityY = 0.28;
      const distToCity = Math.sqrt(Math.pow(x - cityX, 2) + Math.pow(y - cityY, 2));
      // irregular fractal borders using trigonometry
      const isCity = distToCity < (0.13 + 0.03 * Math.sin(Math.atan2(y - cityY, x - cityX) * 7));

      // 3. Dense Forest reserve (Bottom Left quadrant)
      const forestX = 0.22;
      const forestY = 0.76;
      const distToForest = Math.sqrt(Math.pow(x - forestX, 2) + Math.pow(y - forestY, 2));
      const isForest = distToForest < (0.2 + 0.04 * Math.cos(Math.atan2(y - forestY, x - forestX) * 5));

      let rVal, nVal, gVal;

      if (isRiver) {
        // Deep Water reflectance: Absorbs NIR completely, minor Red, moderate Green/Blue
        rVal = 24 + Math.random() * 8;
        nVal = 8 + Math.random() * 4;
        gVal = 45 + Math.random() * 10;
      } else if (isCity) {
        // Built-up Urban concrete: High Red, high NIR (comparable) -> low positive NDVI
        rVal = 175 + Math.random() * 35;
        nVal = 185 + Math.random() * 25;
        gVal = 160 + Math.random() * 25;
      } else if (isForest) {
        // Pristine canopy: Extremely low Red (absorbed), huge NIR (scattered)
        rVal = 18 + Math.random() * 12;
        nVal = 235 + Math.random() * 20;
        gVal = 75 + Math.random() * 15;
      } else if (isRiverBank) {
        // Riparian zone lush vegetation (high water supply)
        rVal = 22 + Math.random() * 10;
        nVal = 210 + Math.random() * 15;
        gVal = 85 + Math.random() * 12;
      } else {
        // Checkered agricultural grid
        const fieldSize = 18;
        const gridX = Math.floor(x * fieldSize);
        const gridY = Math.floor(y * fieldSize);
        const fieldType = (gridX + gridY) % 4;

        if (fieldType === 0) {
          // Mature high-reflectance crop fields (Lush Green)
          rVal = 28 + Math.random() * 10;
          nVal = 195 + Math.random() * 15;
          gVal = 95 + Math.random() * 12;
        } else if (fieldType === 1) {
          // Harvested / Bare agricultural fields (Brown soil)
          rVal = 135 + Math.random() * 20;
          nVal = 150 + Math.random() * 15;
          gVal = 115 + Math.random() * 15;
        } else if (fieldType === 2) {
          // Moderate growth crop fields
          rVal = 48 + Math.random() * 12;
          nVal = 160 + Math.random() * 15;
          gVal = 80 + Math.random() * 10;
        } else {
          // Fallow grasslands / Dry scrub lands
          rVal = 95 + Math.random() * 18;
          nVal = 125 + Math.random() * 14;
          gVal = 100 + Math.random() * 12;
        }
      }

      redRow.push(rVal);
      nirRow.push(nVal);
      greenRow.push(gVal);
    }
    red.push(redRow);
    nir.push(nirRow);
    green.push(greenRow);
  }

  // Calculate statistics (min/max ranges) per band
  const computeStats = (matrix) => {
    let min = Infinity;
    let max = -Infinity;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const val = matrix[r][c];
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    return { min, max, range: max - min };
  };

  const redStats = computeStats(red);
  const nirStats = computeStats(nir);
  const greenStats = computeStats(green);

  // Package as a standard GeoRaster object compliant with georaster-layer-for-leaflet
  georasterObject = {
    numberOfRasters: 3,
    projection: 4326,
    xmin: xmin,
    xmax: xmax,
    ymin: ymin,
    ymax: ymax,
    pixelWidth: pixelWidth,
    pixelHeight: pixelHeight,
    width: width,
    height: height,
    values: [red, nir, green],
    mins: [redStats.min, nirStats.min, greenStats.min],
    maxs: [redStats.max, nirStats.max, greenStats.max],
    ranges: [redStats.range, nirStats.range, greenStats.range],
    noDataValue: null
  };

  // Enable analysis controls
  selectedFile = null;
  document.getElementById('file-info-bar').classList.remove('hidden');
  document.getElementById('selected-file-name').innerHTML = `<i class="fa-solid fa-robot"></i> Synthetic_Demo_Hyderabad.tif`;
  document.getElementById('analyze-btn').removeAttribute('disabled');
  document.getElementById('system-status').textContent = "Satellite Stream: Demo Preloaded";

  showToast("Demo Scene generated. Ready for analysis.", "success");
}

/* ==========================================================================
   USER INTERFACE EVENTS & INPUT HANDLING
   ========================================================================== */
function setupEventListeners() {
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  const analyzeBtn = document.getElementById('analyze-btn');
  const demoBtn = document.getElementById('demo-btn');
  const opacitySlider = document.getElementById('opacity-slider');
  const opacityValText = document.getElementById('opacity-val');
  const renderMode = document.getElementById('render-mode');
  const clearFileBtn = document.getElementById('clear-file-btn');
  
  // Basemap Selector buttons
  const basemapSat = document.getElementById('basemap-sat');
  const basemapOsm = document.getElementById('basemap-osm');
  const basemapDark = document.getElementById('basemap-dark');

  // Help Modal buttons
  const helpTrigger = document.getElementById('help-trigger');
  const helpModal = document.getElementById('help-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  // 1. File Upload Processing
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  // Drag over visual cues
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  // 2. Remove selected file
  clearFileBtn.addEventListener('click', () => {
    georasterObject = null;
    selectedFile = null;
    fileInput.value = '';
    
    document.getElementById('file-info-bar').classList.add('hidden');
    analyzeBtn.setAttribute('disabled', 'true');
    document.getElementById('system-status').textContent = "Satellite Stream: Standby";
    
    // Hide panels
    document.getElementById('visuals-section').classList.add('hidden');
    document.getElementById('metadata-section').classList.add('hidden');
    document.getElementById('inspector-section').classList.add('hidden');
    document.getElementById('distribution-chart-container').classList.add('hidden');
    document.getElementById('spectral-profile-row').classList.add('hidden');

    currentBandProfile = 'demo';
    updateBandIndices();

    if (activeRasterLayer) map.removeLayer(activeRasterLayer);
    if (activeBoundaryLayer) map.removeLayer(activeBoundaryLayer);
    if (activeClickMarker) map.removeLayer(activeClickMarker);
    map.closePopup();

    showToast("File selection cleared.", "info");
  });

  // 3. Analyze dataset and center map
  analyzeBtn.addEventListener('click', () => {
    if (!georasterObject) return;

    showToast("Opening scene bounds and processing data matrices...", "info");
    
    // Set Status active
    const statusText = selectedFile ? selectedFile.name : "Hyderabad_Synthetic_Grid";
    document.getElementById('system-status').innerHTML = `Satellite Stream: ACTIVE - ${statusText}`;
    
    // Enable controls sections
    document.getElementById('visuals-section').classList.remove('hidden');
    document.getElementById('metadata-section').classList.remove('hidden');

    // Render raster on canvas overlay
    renderRasterOverlay();
    
    // Centering & bounding box
    fitMapToRaster();

    // Compute pixel stats and draw distribution chart
    analyzeRasterData();

    showToast("Raster overlaid. Click on the map to probe pixel values.", "success");
  });

  // 4. Load demo data
  demoBtn.addEventListener('click', () => {
    // Reset band profile when loading demo
    document.getElementById('spectral-profile-row').classList.add('hidden');
    currentBandProfile = 'demo';
    updateBandIndices();
    generateDemoDataset();
  });

  // 5. Opacity slider live modification
  opacitySlider.addEventListener('input', (e) => {
    currentOpacity = e.target.value / 100;
    opacityValText.textContent = `${e.target.value}%`;
    if (activeRasterLayer) {
      activeRasterLayer.setOpacity(currentOpacity);
    }
  });

  // 6. Change spectral render composite mode
  renderMode.addEventListener('change', (e) => {
    currentMode = e.target.value;
    if (georasterObject) {
      showToast(`Rendering layer mode: ${renderMode.options[renderMode.selectedIndex].text}`, "info");
      renderRasterOverlay();
    }
  });

  // 6b. Change spectral band profile
  const spectralProfile = document.getElementById('spectral-profile');
  spectralProfile.addEventListener('change', (e) => {
    currentBandProfile = e.target.value;
    updateBandIndices();
    if (georasterObject) {
      showToast(`Band profile updated: ${spectralProfile.options[spectralProfile.selectedIndex].text}`, "info");
      renderRasterOverlay();
      analyzeRasterData();
    }
  });

  // 7. Basemap layer controllers
  const toggleBasemap = (targetName, activeBtn, otherBtns) => {
    if (activeBasemapName === targetName) return;

    // Toggle layers
    map.removeLayer(basemaps[activeBasemapName]);
    basemaps[targetName].addTo(map);
    activeBasemapName = targetName;

    // Toggle button active visual states
    activeBtn.classList.add('active');
    otherBtns.forEach(btn => btn.classList.remove('active'));

    showToast(`Basemap modified: ${targetName.toUpperCase()}`, "info");
  };

  basemapSat.addEventListener('click', () => toggleBasemap('sat', basemapSat, [basemapOsm, basemapDark]));
  basemapOsm.addEventListener('click', () => toggleBasemap('osm', basemapOsm, [basemapSat, basemapDark]));
  basemapDark.addEventListener('click', () => toggleBasemap('dark', basemapDark, [basemapSat, basemapOsm]));

  // 8. Help / System Documentation Modal toggles
  helpTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    helpModal.classList.remove('hidden');
  });

  modalCloseBtn.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });

  // Close modal when clicking backdrop
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
      helpModal.classList.add('hidden');
    }
  });
}

/**
 * Handles processing of user-uploaded local file arrays.
 */
function handleSelectedFile(file) {
  // Validate extension
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'tif' && ext !== 'tiff') {
    showToast("Invalid format. Please supply a GeoTIFF (.tif/.tiff) file.", "error");
    return;
  }

  selectedFile = file;
  
  // Show file info loading state
  document.getElementById('file-info-bar').classList.remove('hidden');
  document.getElementById('selected-file-name').textContent = `Reading ${file.name}...`;
  document.getElementById('analyze-btn').setAttribute('disabled', 'true');

  showToast("Reading binary data arrays...", "info");

  // Read file as Array Buffer
  const reader = new FileReader();
  
  reader.onerror = () => {
    showToast("File reading error. Failed to read file data.", "error");
    document.getElementById('file-info-bar').classList.add('hidden');
  };

  reader.onload = (e) => {
    const arrayBuffer = e.target.result;

    showToast("Parsing GeoTIFF binary structure...", "info");

    try {
      // Resolve the georaster parser function from all standard browser bundle global namespaces
      const parser = window.parseGeoraster || 
                     window.GeoRaster || 
                     window.georaster || 
                     (typeof parseGeoraster !== 'undefined' ? parseGeoraster : null);

      if (!parser || typeof parser !== 'function') {
        throw new Error("GeoRaster parser library is not fully initialized or loaded.");
      }

      parser(arrayBuffer).then(georaster => {
        georasterObject = georaster;

        // Handle spatial metadata defaults if incomplete in headers
        if (!georasterObject.projection) {
          georasterObject.projection = 4326; // Fallback default
        }
        
        // Calculate missing mins/maxs ranges if not parsed
        if (!georasterObject.mins || georasterObject.mins[0] === undefined) {
          georasterObject.mins = [];
          georasterObject.maxs = [];
          georasterObject.ranges = [];

          for (let b = 0; b < georasterObject.numberOfRasters; b++) {
            let min = Infinity;
            let max = -Infinity;
            const band = georasterObject.values[b];
            for (let r = 0; r < georasterObject.height; r++) {
              if (!band[r]) continue;
              for (let c = 0; c < georasterObject.width; c++) {
                const val = band[r][c];
                if (val === null || val === undefined || isNaN(val)) continue;
                if (val < min) min = val;
                if (val > max) max = val;
              }
            }
            georasterObject.mins.push(min);
            georasterObject.maxs.push(max);
            georasterObject.ranges.push(max - min);
          }
        }

        if (georasterObject.numberOfRasters >= 3) {
          document.getElementById('spectral-profile-row').classList.remove('hidden');
          if (file.name.toLowerCase().includes('sample') || georasterObject.projection === 32631) {
            document.getElementById('spectral-profile').value = 'bgr';
            currentBandProfile = 'bgr';
          } else {
            document.getElementById('spectral-profile').value = 'rgb';
            currentBandProfile = 'rgb';
          }
        } else {
          document.getElementById('spectral-profile-row').classList.add('hidden');
          currentBandProfile = 'rgb'; // default fallback
        }
        updateBandIndices();

        document.getElementById('selected-file-name').innerHTML = `<i class="fa-solid fa-file-image"></i> ${file.name}`;
        document.getElementById('analyze-btn').removeAttribute('disabled');
        document.getElementById('system-status').textContent = "Satellite Stream: Dataset Ready";
        showToast("GeoTIFF parsed successfully! Click Analyze to map it.", "success");
      }).catch(err => {
        console.error("GeoRaster Promise parsing error:", err);
        showToast(`Parser Error: ${err.message || 'Failed to decode GeoTIFF.'}`, "error");
        document.getElementById('file-info-bar').classList.add('hidden');
      });
    } catch (err) {
      console.error("Synchronous parsing setup error:", err);
      showToast(`Parsing Setup Error: ${err.message}`, "error");
      document.getElementById('file-info-bar').classList.add('hidden');
    }
  };

  reader.readAsArrayBuffer(file);
}

/* ==========================================================================
   NOTIFICATION SYSTEM (TOASTS)
   ========================================================================== */
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMsg = document.getElementById('toast-msg');

  // Clear previous timers and state
  if (window.toastTimer) {
    clearTimeout(window.toastTimer);
  }

  // Set appropriate styling class and icon
  toast.className = 'toast'; // reset
  toast.classList.add(type);
  
  if (type === 'success') {
    toastIcon.className = 'fa-solid fa-circle-check';
  } else if (type === 'error') {
    toastIcon.className = 'fa-solid fa-triangle-exclamation';
  } else if (type === 'info') {
    toastIcon.className = 'fa-solid fa-circle-info';
  }

  toastMsg.textContent = msg;
  
  // Show
  toast.classList.remove('hidden');

  // Trigger browser paint delay for transition
  setTimeout(() => {
    toast.style.opacity = 1;
  }, 10);

  // Set auto hide timer
  window.toastTimer = setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 4000);
}
