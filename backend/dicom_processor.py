"""
dicom_processor.py
Handles DICOM file ingestion, metadata extraction, and preprocessing simulation.
Falls back to numpy-based transforms if MONAI/PyDICOM is not installed.
"""

import io
import json
import random
import base64
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# ---------------------------------------------------------------------------
# Try to import optional heavy dependencies
# ---------------------------------------------------------------------------
try:
    import pydicom
    PYDICOM_AVAILABLE = True
except ImportError:
    PYDICOM_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# ---------------------------------------------------------------------------
# Preprocessing helpers (numpy fallback for MONAI transforms)
# ---------------------------------------------------------------------------

def normalize_intensity(arr: np.ndarray) -> np.ndarray:
    """NormalizeIntensityd equivalent."""
    mn, mx = arr.min(), arr.max()
    if mx - mn == 0:
        return arr
    return (arr - mn) / (mx - mn)


def add_noise_reduction(arr: np.ndarray, sigma: float = 1.0) -> np.ndarray:
    """Gaussian-like noise reduction via simple convolution approximation."""
    try:
        from scipy.ndimage import gaussian_filter
        return gaussian_filter(arr, sigma=sigma)
    except Exception:
        # Very simple box blur fallback
        kernel = np.ones((3, 3)) / 9.0
        pad = np.pad(arr, 1, mode='reflect')
        out = np.zeros_like(arr, dtype=np.float64)
        for i in range(arr.shape[0]):
            for j in range(arr.shape[1]):
                out[i, j] = (pad[i:i+3, j:j+3] * kernel).sum()
        return out


def enhance_contrast(arr: np.ndarray, clip_limit: float = 2.0) -> np.ndarray:
    """CLAHE-like contrast enhancement using histogram equalization."""
    arr_uint8 = (arr * 255).astype(np.uint8)
    hist, bins = np.histogram(arr_uint8.flatten(), 256, [0, 256])
    cdf = hist.cumsum()
    cdf_min = cdf[cdf > 0].min()
    total = arr_uint8.size
    cdf_norm = (cdf - cdf_min) / (total - cdf_min) * 255
    return cdf_norm[arr_uint8].astype(np.float64) / 255.0


def resize_slice(arr: np.ndarray, target_size: int = 512) -> np.ndarray:
    """Resize 2D slice to target_size x target_size."""
    if arr.shape[0] == target_size and arr.shape[1] == target_size:
        return arr
    try:
        from scipy.ndimage import zoom
        fy = target_size / arr.shape[0]
        fx = target_size / arr.shape[1]
        return zoom(arr, (fy, fx), order=1)
    except Exception:
        return arr


def preprocess_slice(arr: np.ndarray) -> np.ndarray:
    """Full preprocessing pipeline for a single 2D slice."""
    arr = arr.astype(np.float64)
    arr = normalize_intensity(arr)
    arr = add_noise_reduction(arr, sigma=0.8)
    arr = enhance_contrast(arr)
    arr = resize_slice(arr, 512)
    return normalize_intensity(arr)


# ---------------------------------------------------------------------------
# DICOM / image array loading
# ---------------------------------------------------------------------------

def load_dicom_array(file_bytes: bytes) -> tuple[np.ndarray, dict]:
    """
    Attempt to load a DICOM file with pydicom.
    Falls back to PIL image loading for PNG/JPEG inputs.
    Returns (pixel_array_2d, metadata_dict).
    """
    metadata = {}

    if PYDICOM_AVAILABLE:
        try:
            ds = pydicom.dcmread(io.BytesIO(file_bytes), force=True)
            arr = ds.pixel_array.astype(np.float64)
            if arr.ndim == 3:
                # Take middle slice for 3D volumes
                arr = arr[arr.shape[0] // 2]
            # Extract DICOM tags (safe .get with defaults)
            metadata = extract_dicom_metadata(ds)
            return arr, metadata
        except Exception:
            pass  # Fall through to PIL / synthetic

    if PIL_AVAILABLE:
        try:
            img = Image.open(io.BytesIO(file_bytes)).convert("L")
            arr = np.array(img, dtype=np.float64)
            metadata = generate_synthetic_metadata("Unknown")
            return arr, metadata
        except Exception:
            pass

    # Last resort: generate a synthetic "scan"
    arr = generate_synthetic_scan()
    metadata = generate_synthetic_metadata("CT")
    return arr, metadata


def extract_dicom_metadata(ds) -> dict:
    """Extract standard DICOM header fields safely."""
    def safe_get(tag, default="N/A"):
        try:
            val = getattr(ds, tag, None)
            return str(val) if val is not None else default
        except Exception:
            return default

    modality = safe_get("Modality", "CT")
    acq_date_raw = safe_get("AcquisitionDate", "")
    try:
        acq_date = datetime.strptime(acq_date_raw, "%Y%m%d").strftime("%Y-%m-%d")
    except Exception:
        acq_date = datetime.now().strftime("%Y-%m-%d")

    return {
        "patient_id": safe_get("PatientID", f"PAT-{random.randint(10000,99999)}"),
        "patient_name": safe_get("PatientName", "Anonymous Patient"),
        "modality": modality,
        "study_description": safe_get("StudyDescription", f"{modality} Scan"),
        "slice_thickness": safe_get("SliceThickness", f"{round(random.uniform(0.5, 5.0), 2)} mm"),
        "acquisition_date": acq_date,
        "institution": safe_get("InstitutionName", "MedAI Clinical Center"),
        "series_description": safe_get("SeriesDescription", "Axial Series"),
        "rows": safe_get("Rows", "512"),
        "columns": safe_get("Columns", "512"),
        "pixel_spacing": safe_get("PixelSpacing", "0.703 mm"),
        "bits_allocated": safe_get("BitsAllocated", "16"),
        "manufacturer": safe_get("Manufacturer", "Siemens Healthineers"),
    }


def generate_synthetic_metadata(modality: str = "CT") -> dict:
    """Generate realistic-looking synthetic DICOM metadata."""
    patient_num = random.randint(10000, 99999)
    date = (datetime.now() - timedelta(days=random.randint(0, 365))).strftime("%Y-%m-%d")
    modalities = ["CT", "MRI", "X-Ray", "Ultrasound"]
    mod = modality if modality in modalities else random.choice(modalities)
    institutions = [
        "MedAI Clinical Center", "Stanford Medical", "Mayo Clinic Imaging",
        "Johns Hopkins Radiology", "Cleveland Clinic"
    ]
    manufacturers = [
        "Siemens Healthineers", "GE Healthcare", "Philips Medical",
        "Canon Medical", "Fujifilm"
    ]
    return {
        "patient_id": f"PAT-{patient_num}",
        "patient_name": "Anonymous Patient",
        "modality": mod,
        "study_description": f"{mod} Chest/Brain Analysis",
        "slice_thickness": f"{round(random.uniform(0.5, 5.0), 2)} mm",
        "acquisition_date": date,
        "institution": random.choice(institutions),
        "series_description": "Axial Reconstructed Series",
        "rows": "512",
        "columns": "512",
        "pixel_spacing": f"{round(random.uniform(0.4, 1.0), 3)} mm",
        "bits_allocated": "16",
        "manufacturer": random.choice(manufacturers),
    }


def generate_synthetic_scan(size: int = 256) -> np.ndarray:
    """Generate a realistic-looking synthetic medical scan using numpy."""
    arr = np.zeros((size, size), dtype=np.float64)
    cx, cy = size // 2, size // 2
    Y, X = np.ogrid[:size, :size]

    # Outer body outline (ellipse)
    outer = ((X - cx) / (cx * 0.9))**2 + ((Y - cy) / (cy * 0.85))**2
    arr[outer < 1] = 0.25

    # Lung regions
    for lx in [cx - size//5, cx + size//5]:
        lung = ((X - lx) / (size*0.12))**2 + ((Y - cy) / (size*0.18))**2
        arr[lung < 1] = 0.05

    # Heart region
    heart = ((X - cx) / (size*0.08))**2 + ((Y - (cy - size//20)) / (size*0.09))**2
    arr[heart < 1] = 0.55

    # Spine
    spine = ((X - cx) / (size*0.02))**2 + ((Y - cy) / (cy*0.7))**2
    arr[spine < 1] = 0.9

    # Ribs (simplified)
    for i in range(4):
        rib_y = cy - size//6 + i * (size//8)
        rib = ((X - cx) / (cx*0.65))**2 + ((Y - rib_y) / (size*0.01))**2
        arr[rib < 1] = 0.85

    # Add gaussian noise
    noise = np.random.normal(0, 0.03, arr.shape)
    arr = np.clip(arr + noise, 0, 1)

    return arr


def array_to_base64_png(arr: np.ndarray, colormap: str = "gray") -> str:
    """Convert a numpy array to a base64-encoded PNG string."""
    if not PIL_AVAILABLE:
        return ""
    arr_norm = normalize_intensity(arr)
    arr_uint8 = (arr_norm * 255).astype(np.uint8)

    if colormap == "hot":
        # Apply a warm colormap for Grad-CAM
        r = np.clip(arr_uint8 * 2, 0, 255)
        g = np.clip((arr_uint8 - 64) * 2, 0, 255)
        b = np.zeros_like(arr_uint8)
        rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
        img = Image.fromarray(rgb, "RGB")
    elif colormap == "jet":
        # Jet-like colormap for segmentation overlay
        r = np.clip(((arr_uint8.astype(float) - 128) / 128 * 255), 0, 255).astype(np.uint8)
        g = np.clip((255 - np.abs(arr_uint8.astype(float) - 128) / 128 * 255), 0, 255).astype(np.uint8)
        b = np.clip(((128 - arr_uint8.astype(float)) / 128 * 255), 0, 255).astype(np.uint8)
        rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
        img = Image.fromarray(rgb, "RGB")
    else:
        img = Image.fromarray(arr_uint8, "L")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def generate_gradcam_overlay(base_arr: np.ndarray, lesion_center: tuple = None) -> str:
    """Generate a Grad-CAM style heatmap overlay."""
    size = base_arr.shape[0] if base_arr.ndim >= 1 else 256
    cam = np.zeros((size, size), dtype=np.float64)
    Y, X = np.ogrid[:size, :size]

    # Place 1-3 activation hotspots
    n_spots = random.randint(1, 3)
    for _ in range(n_spots):
        if lesion_center and _ == 0:
            cx, cy = lesion_center
        else:
            cx = random.randint(size//4, 3*size//4)
            cy = random.randint(size//4, 3*size//4)
        radius = random.randint(size//10, size//5)
        dist = np.sqrt((X - cx)**2 + (Y - cy)**2)
        intensity = np.exp(-dist**2 / (2 * (radius/2)**2))
        cam += intensity * random.uniform(0.5, 1.0)

    cam = normalize_intensity(cam)
    # Blend with base for realistic appearance
    cam = cam * 0.75 + normalize_intensity(base_arr) * 0.25
    return array_to_base64_png(cam, colormap="hot")


def generate_segmentation_mask(base_arr: np.ndarray, organ: str = "lung") -> str:
    """Generate a colored segmentation mask for the specified organ."""
    size = base_arr.shape[0] if base_arr.ndim >= 1 else 256
    mask = np.zeros((size, size), dtype=np.float64)
    Y, X = np.ogrid[:size, :size]
    cx, cy = size // 2, size // 2

    if organ == "lung":
        for lx in [cx - size//5, cx + size//5]:
            lung = ((X - lx) / (size*0.14))**2 + ((Y - cy) / (size*0.20))**2
            mask[lung < 1] = 0.8
        # Add a subtle nodule
        nod_x = cx + random.randint(-size//6, size//6)
        nod_y = cy + random.randint(-size//8, size//8)
        nodule = ((X - nod_x) / (size*0.03))**2 + ((Y - nod_y) / (size*0.03))**2
        mask[nodule < 1] = 1.0
    elif organ == "brain":
        brain = ((X - cx) / (cx*0.7))**2 + ((Y - cy) / (cy*0.75))**2
        mask[brain < 1] = 0.6
        tumor_x = cx + random.randint(-size//8, size//8)
        tumor_y = cy + random.randint(-size//8, size//8)
        tumor = ((X - tumor_x) / (size*0.05))**2 + ((Y - tumor_y) / (size*0.05))**2
        mask[tumor < 1] = 1.0
    elif organ == "liver":
        liver = ((X - (cx + size//8)) / (size*0.18))**2 + ((Y - cy) / (size*0.14))**2
        mask[liver < 1] = 0.7
    elif organ == "kidney":
        for kx in [cx - size//6, cx + size//6]:
            kidney = ((X - kx) / (size*0.07))**2 + ((Y - (cy + size//8)) / (size*0.10))**2
            mask[kidney < 1] = 0.75

    noise = np.random.normal(0, 0.02, mask.shape)
    mask = np.clip(mask + noise, 0, 1)
    return array_to_base64_png(mask, colormap="jet")
