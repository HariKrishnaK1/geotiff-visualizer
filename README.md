# NRSC GeoTIFF Visualization Platform

A professional, standalone, desktop-style remote sensing and GIS web dashboard designed to visualize georeferenced satellite imagery (GeoTIFFs) and perform real-time vegetative analytics (NDVI) entirely inside the web browser. 

This platform mimics lightweight GIS dashboards used in academic and research environments, such as ISRO's National Remote Sensing Centre (NRSC) Decision Support Systems.

## 🚀 Key Features

*   **100% Client-Side Processing**: Zero backend databases, zero authentication, and zero complex server APIs. Decodes geographic raster structures directly inside the main thread.
*   **Dual Ingestion Engine**:
    *   **Direct GeoTIFF Uploader**: Ingest `.tif` / `.tiff` files. Leverages `georaster.js` to parse geographical tags, pixel scales, and projection matrices.
    *   **In-Memory Synthetic Data Synthesis**: Allows testing the entire app immediately via the **"Load Demo Scene"** button, creating a highly realistic, multi-spectral agricultural scene near Hyderabad (Telangana, India) in EPSG:4326.
*   **Scientific Visualization composites**:
    *   *NDVI Index Map*: Dynamic continuous color gradient mapping vegetation vigor thresholds.
    *   *False-Color Infrared*: Renders NIR, Red, and Green spectral band composites to make vegetated regions stand out in vibrant neon red.
    *   *True-Color Composite*: Standard RGB natural-light visual representation.
    *   *Single-Band Grayscale*: Raw band intensity visualization.
*   **Interactive Spatial HUD Probe**: Click on any pixel of the rendered overlay to deploy a scientific HUD popup displaying coordinates, pixel index coordinates (`[row, col]`), raw spectral reflectance values, and live land cover categorization.
*   **Dynamic Analytics**:
    *   *Temporal Trend Graph (Chart.js)*: Line chart representing vegetation indices across different years (2018–2022).
    *   *Scene Cover Distribution (Chart.js)*: Doughnut chart that performs a real-time pixel count scan of the active raster to plot the overall percentages of Water, Urban, Scrub, Grassland, crops, and Dense Forest.
*   **Map Controls**: Includes Esri Satellite, OpenStreetMap, and Dark Scientific Basemap toggles, opacity sliders, and spatial coordinate readouts.

## 📁 Project Directory Structure

```
nrsc-geotiff-viewer/
│
├── index.html        # Dashboard grid structure, uploader controls, formulas & tables
├── index.css         # Space-dark custom theme, cyber HUD styles, and responsive queries
├── app.js            # Leaflet init, synthetic raster generator, coordinate converters, and charts
└── README.md         # This user manual and documentation
```

## ⚙️ Running Locally

Since the application utilizes high-performance HTML5 canvas matrices and handles CDN assets, it is highly recommended to run it through a secure web port origin (`http://localhost`) rather than opening raw file links (`file://`) to avoid browser restrictions on canvas pollution and CORS settings.

### Option A: Using node/npx (Recommended)
Inside the project directory, run a quick static HTTP server:
```bash
# Run using npx directly (does not require permanent installation)
npx -y http-server -p 8080
```
Open `http://localhost:8080` in your web browser.

### Option B: Using Python
If you have Python installed:
```bash
# Python 3
python -m http-server 8080
```
Open `http://localhost:8080` in your web browser.

## 📚 Libraries Utilized (via CDN)

1.  **Leaflet.js** (v1.9.4): High-performance, mobile-friendly interactive mapping layer.
2.  **georaster** (v1.6.0): Decodes raw binary GeoTIFF files and extracts spatial bands in the browser.
3.  **georaster-layer-for-leaflet**: Leaflet grid layer plugin that translates parsed georaster matrices to canvas pixels.
4.  **Chart.js**: Animated, responsive scientific charting dashboard vectors.
5.  **FontAwesome** (v6.4.0): GIS vector icon system.
6.  **Google Fonts**: "Plus Jakarta Sans" for modern administrative dashboard UI; "Space Grotesk" for coordinate readouts and labels.
