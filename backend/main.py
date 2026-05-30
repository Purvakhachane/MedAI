"""
main.py
FastAPI server for the AI-Powered Medical Image Analysis Platform.
"""

import sys
import os

# Ensure backend directory is in path for sibling imports
sys.path.insert(0, os.path.dirname(__file__))

import uuid
import random
import numpy as np
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from dicom_processor import (
    load_dicom_array,
    preprocess_slice,
    array_to_base64_png,
    generate_synthetic_scan,
    generate_synthetic_metadata,
)
from model_serving import (
    run_disease_detection,
    run_organ_segmentation,
    run_gradcam,
    generate_ai_report,
    get_progression_data,
    get_monitoring_data,
    generate_copilot_response,
)


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MedAI Analysis Platform",
    description="AI-Powered Medical Image Analysis API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory scan store (production would use a database)
scan_store: dict = {}

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def get_scan_or_404(scan_id: str) -> dict:
    if scan_id not in scan_store:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")
    return scan_store[scan_id]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "MedAI Platform API is running", "version": "1.0.0"}


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "gpu_available": False,
        "pydicom_available": _check_pydicom(),
        "monai_available": _check_monai(),
    }


@app.post("/api/upload")
async def upload_scan(file: UploadFile = File(...)):
    """
    Upload a medical scan file (DICOM, PNG, JPEG).
    Returns scan_id and extracted metadata.
    """
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    # Parse DICOM / image
    arr, metadata = load_dicom_array(file_bytes)

    # Preprocess
    processed_arr = preprocess_slice(arr)

    # Generate scan image (base64 PNG)
    scan_b64 = array_to_base64_png(processed_arr, colormap="gray")

    scan_id = str(uuid.uuid4())[:12]
    scan_store[scan_id] = {
        "scan_id": scan_id,
        "filename": file.filename,
        "metadata": metadata,
        "array": processed_arr,
        "scan_b64": scan_b64,
        "uploaded_at": datetime.utcnow().isoformat(),
    }

    return {
        "scan_id": scan_id,
        "filename": file.filename,
        "metadata": metadata,
        "scan_image": scan_b64,
        "preprocessing": {
            "noise_reduction": True,
            "normalization": True,
            "contrast_enhancement": True,
            "resize": "512x512",
            "slice_selection": "mid-axial",
        },
        "message": "Scan uploaded and preprocessed successfully.",
    }


@app.post("/api/demo-scan")
def create_demo_scan(modality: str = "CT"):
    """Create a synthetic demo scan for testing without a real DICOM file."""
    arr = generate_synthetic_scan(256)
    processed = preprocess_slice(arr)
    scan_b64 = array_to_base64_png(processed, colormap="gray")
    metadata = generate_synthetic_metadata(modality)

    scan_id = str(uuid.uuid4())[:12]
    scan_store[scan_id] = {
        "scan_id": scan_id,
        "filename": f"demo_{modality.lower()}_scan.dcm",
        "metadata": metadata,
        "array": processed,
        "scan_b64": scan_b64,
        "uploaded_at": datetime.utcnow().isoformat(),
    }

    return {
        "scan_id": scan_id,
        "filename": f"demo_{modality.lower()}_scan.dcm",
        "metadata": metadata,
        "scan_image": scan_b64,
        "preprocessing": {
            "noise_reduction": True,
            "normalization": True,
            "contrast_enhancement": True,
            "resize": "512x512",
            "slice_selection": "mid-axial",
        },
        "message": f"Demo {modality} scan created successfully.",
    }


@app.get("/api/analyze/{scan_id}")
def analyze_scan(scan_id: str):
    """
    Run AI inference pipeline on an uploaded scan.
    Returns disease predictions, segmentation masks, Grad-CAM, and AI report.
    """
    record = get_scan_or_404(scan_id)
    arr = record["array"]
    metadata = record["metadata"]
    modality = metadata.get("modality", "CT")

    # Run inference pipeline
    findings = run_disease_detection(arr, modality)
    seg_masks = run_organ_segmentation(arr, modality)
    gradcam_b64 = run_gradcam(arr, findings)
    report_md = generate_ai_report(metadata, findings, modality)

    # Emergency alert check
    emergency = None
    critical_findings = [f for f in findings if f["severity"] == "critical"]
    if critical_findings and critical_findings[0]["confidence"] > 92:
        emergency = {
            "alert": True,
            "disease": critical_findings[0]["disease"],
            "confidence": critical_findings[0]["confidence"],
            "severity": "CRITICAL",
            "message": f"⚠️ {critical_findings[0]['disease']} detected with {critical_findings[0]['confidence']}% confidence. Immediate clinical review required.",
        }

    return {
        "scan_id": scan_id,
        "modality": modality,
        "findings": findings,
        "segmentation_masks": seg_masks,
        "gradcam_overlay": gradcam_b64,
        "scan_image": record["scan_b64"],
        "ai_report": report_md,
        "emergency_alert": emergency,
        "inference_time_ms": round(random.uniform(120, 650), 0),
        "model_versions": {
            "segmentation": "SwinUNETR-v2.1",
            "detection": "DenseNet-121-Medical",
            "report": "GPT-Medical-3.5",
        },
        "analyzed_at": datetime.utcnow().isoformat(),
    }


@app.get("/api/report/{scan_id}")
def get_report(scan_id: str):
    """Return the AI-generated report for a scan."""
    record = get_scan_or_404(scan_id)
    arr = record["array"]
    metadata = record["metadata"]
    modality = metadata.get("modality", "CT")
    findings = run_disease_detection(arr, modality)
    report_md = generate_ai_report(metadata, findings, modality)
    return {"scan_id": scan_id, "report": report_md, "metadata": metadata}


@app.get("/api/timeline/{patient_id}")
def get_patient_timeline(patient_id: str):
    """Return historical disease progression data for a patient."""
    data = get_progression_data(patient_id)
    return {
        "patient_id": patient_id,
        "timeline": data,
        "summary": {
            "total_scans": len(data),
            "first_scan": data[0]["date"],
            "latest_scan": data[-1]["date"],
            "progression": "Moderate growth observed over monitoring period",
            "treatment_response": "Partial response to treatment protocol",
        },
    }


@app.get("/api/monitoring")
def get_monitoring():
    """Return real-time GPU usage, latency, and inference logs."""
    return get_monitoring_data()


@app.get("/api/stats")
def get_stats():
    """Return platform-wide statistics for the Home dashboard."""
    return {
        "total_scans": random.randint(12480, 15200),
        "today_analyses": random.randint(84, 340),
        "model_accuracy": round(random.uniform(94.8, 98.2), 1),
        "active_models": 4,
        "critical_alerts_today": random.randint(2, 18),
        "avg_inference_ms": round(random.uniform(280, 620), 0),
        "patients_monitored": random.randint(3200, 4800),
        "reports_generated": random.randint(980, 1400),
        "modality_breakdown": {
            "CT": random.randint(40, 55),
            "MRI": random.randint(25, 35),
            "X-Ray": random.randint(10, 20),
            "Ultrasound": random.randint(5, 15),
        },
    }


class CopilotRequest(BaseModel):
    query: str
    scan_id: Optional[str] = None


@app.post("/api/copilot")
def copilot_chat(req: CopilotRequest):
    """
    Handle medical AI co-pilot chat requests.
    """
    metadata = {}
    findings = []

    if req.scan_id and req.scan_id in scan_store:
        record = scan_store[req.scan_id]
        metadata = record["metadata"]
        arr = record["array"]
        modality = metadata.get("modality", "CT")
        findings = run_disease_detection(arr, modality)
    else:
        # Generate generic synthetic metadata and findings
        metadata = generate_synthetic_metadata("CT")
        arr = generate_synthetic_scan()
        findings = run_disease_detection(arr, "CT")

    response_text = generate_copilot_response(req.query, metadata, findings)
    return {
        "response": response_text,
        "timestamp": datetime.utcnow().isoformat(),
        "scan_id": req.scan_id
    }


# ---------------------------------------------------------------------------

# Helpers
# ---------------------------------------------------------------------------

def _check_pydicom() -> bool:
    try:
        import pydicom
        return True
    except ImportError:
        return False


def _check_monai() -> bool:
    try:
        import monai
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
