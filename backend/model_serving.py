"""
model_serving.py
Simulates MONAI AI model inference pipeline.
Returns segmentation masks, disease predictions, Grad-CAM overlays, and AI reports.
"""

import random
import numpy as np
from typing import Dict, Any, List
from datetime import datetime

from dicom_processor import (
    generate_gradcam_overlay,
    generate_segmentation_mask,
    generate_synthetic_scan,
    normalize_intensity,
)

# ---------------------------------------------------------------------------
# Disease detection configuration
# ---------------------------------------------------------------------------

DISEASE_PROFILES = {
    "CT": [
        {"name": "Lung Nodule", "base_confidence": (78, 97), "severity": "moderate"},
        {"name": "Pneumonia", "base_confidence": (82, 96), "severity": "high"},
        {"name": "Pleural Effusion", "base_confidence": (70, 91), "severity": "moderate"},
        {"name": "Pulmonary Embolism", "base_confidence": (60, 88), "severity": "critical"},
        {"name": "Aortic Aneurysm", "base_confidence": (55, 85), "severity": "critical"},
    ],
    "MRI": [
        {"name": "Brain Tumor", "base_confidence": (85, 98), "severity": "critical"},
        {"name": "Brain Hemorrhage", "base_confidence": (88, 97), "severity": "critical"},
        {"name": "Multiple Sclerosis Lesion", "base_confidence": (72, 93), "severity": "high"},
        {"name": "Hydrocephalus", "base_confidence": (78, 95), "severity": "high"},
        {"name": "Ischemic Stroke", "base_confidence": (80, 96), "severity": "critical"},
    ],
    "X-Ray": [
        {"name": "Pneumonia", "base_confidence": (88, 97), "severity": "high"},
        {"name": "Rib Fracture", "base_confidence": (76, 93), "severity": "moderate"},
        {"name": "Cardiomegaly", "base_confidence": (82, 95), "severity": "high"},
        {"name": "Atelectasis", "base_confidence": (70, 89), "severity": "moderate"},
        {"name": "Pneumothorax", "base_confidence": (85, 96), "severity": "critical"},
    ],
    "Ultrasound": [
        {"name": "Kidney Stone", "base_confidence": (80, 95), "severity": "moderate"},
        {"name": "Gallbladder Polyp", "base_confidence": (72, 90), "severity": "low"},
        {"name": "Liver Lesion", "base_confidence": (78, 94), "severity": "high"},
        {"name": "Ovarian Cyst", "base_confidence": (75, 92), "severity": "moderate"},
        {"name": "Thyroid Nodule", "base_confidence": (70, 88), "severity": "moderate"},
    ],
}

ORGAN_MAP = {
    "CT": ["lung", "liver", "kidney"],
    "MRI": ["brain", "liver", "kidney"],
    "X-Ray": ["lung"],
    "Ultrasound": ["liver", "kidney"],
}

SEVERITY_COLORS = {
    "low": "#22c55e",
    "moderate": "#f59e0b",
    "high": "#f97316",
    "critical": "#ef4444",
}


def run_disease_detection(scan_array: np.ndarray, modality: str) -> List[Dict]:
    """Simulate multi-disease detection inference pipeline."""
    profile_key = modality if modality in DISEASE_PROFILES else "CT"
    diseases = DISEASE_PROFILES[profile_key]

    # Select 2-4 diseases to report
    n_findings = random.randint(2, min(4, len(diseases)))
    selected = random.sample(diseases, n_findings)

    findings = []
    for d in selected:
        low, high = d["base_confidence"]
        confidence = round(random.uniform(low, high), 1)
        size = round(random.uniform(0.8, 4.5), 1)
        location = random.choice([
            "right upper lobe", "left lower lobe", "bilateral",
            "right parietal region", "frontal lobe", "temporal region",
            "right atrium", "left ventricle", "mediastinum",
            "right kidney", "hepatic dome",
        ])
        findings.append({
            "disease": d["name"],
            "confidence": confidence,
            "severity": d["severity"],
            "severity_color": SEVERITY_COLORS[d["severity"]],
            "size_cm": size,
            "location": location,
            "model": random.choice(["SwinUNETR", "UNet-3D", "SegResNet", "DenseNet-121"]),
        })

    # Sort by confidence descending
    return sorted(findings, key=lambda x: x["confidence"], reverse=True)


def run_organ_segmentation(scan_array: np.ndarray, modality: str) -> Dict[str, str]:
    """Generate segmentation masks for detected organs."""
    organs = ORGAN_MAP.get(modality, ["lung"])
    masks = {}
    for organ in organs:
        masks[organ] = generate_segmentation_mask(scan_array, organ)
    return masks


def run_gradcam(scan_array: np.ndarray, findings: List[Dict]) -> str:
    """Generate Grad-CAM heatmap based on primary finding."""
    size = scan_array.shape[0]
    center = (
        random.randint(size // 4, 3 * size // 4),
        random.randint(size // 4, 3 * size // 4),
    )
    return generate_gradcam_overlay(scan_array, lesion_center=center)


def generate_ai_report(metadata: Dict, findings: List[Dict], modality: str) -> str:
    """Generate a structured AI draft medical report."""
    date_str = datetime.now().strftime("%B %d, %Y")
    patient_id = metadata.get("patient_id", "Unknown")
    institution = metadata.get("institution", "MedAI Clinical Center")

    # Primary finding
    primary = findings[0] if findings else None
    primary_text = ""
    if primary:
        primary_text = (
            f"A {primary['size_cm']} cm lesion/abnormality consistent with "
            f"**{primary['disease']}** has been identified in the {primary['location']}, "
            f"with a diagnostic confidence of {primary['confidence']}%."
        )

    additional_findings = []
    for f in findings[1:]:
        additional_findings.append(
            f"- **{f['disease']}** detected in {f['location']} "
            f"(Confidence: {f['confidence']}%, Severity: {f['severity'].title()})"
        )

    additional_text = "\n".join(additional_findings) if additional_findings else "- No additional significant findings."

    severity = primary["severity"] if primary else "low"
    recommendation_map = {
        "critical": (
            "Immediate clinical intervention is strongly advised. "
            "Expedite referral to specialist. Emergency protocol may be warranted."
        ),
        "high": (
            "Prompt follow-up with clinical specialist recommended within 48-72 hours. "
            "Correlate with clinical history and laboratory findings."
        ),
        "moderate": (
            "Follow-up imaging recommended within 4-6 weeks. "
            "Clinical correlation advised. Consider biopsy if clinically indicated."
        ),
        "low": (
            "Routine surveillance recommended. Repeat imaging in 3-6 months "
            "to assess for interval change."
        ),
    }
    recommendation = recommendation_map.get(severity, recommendation_map["moderate"])

    report = f"""# AI-Assisted Radiology Report

**Patient ID:** {patient_id}  
**Imaging Modality:** {modality}  
**Report Date:** {date_str}  
**Institution:** {institution}  
**AI Model:** MONAI SwinUNETR v2.1 + GPT-Medical Report Engine  

---

## Clinical Indication

Routine {modality} scan for diagnostic evaluation. AI-assisted analysis performed to identify potential abnormalities and support radiologist review.

---

## Technique

{modality} scan acquired with standard protocol. AI preprocessing pipeline applied including noise reduction, intensity normalization, contrast enhancement, and multi-planar reconstruction.

---

## Findings

### Primary Finding
{primary_text}

### Additional Findings
{additional_text}

### Organ Assessment
- **Lung volumes:** Within normal limits (bilateral).
- **Cardiac silhouette:** Normal in size and configuration.
- **Mediastinum:** No widening or mass effect identified.
- **Osseous structures:** No acute fracture or destructive lesion detected.

---

## AI Confidence Metrics

| Finding | Confidence | Severity |
|---------|-----------|----------|
{"".join([f"| {f['disease']} | {f['confidence']}% | {f['severity'].title()} |" + chr(10) for f in findings])}

---

## Impression

{'**[CRITICAL]** ' if severity == 'critical' else '**[HIGH PRIORITY]** ' if severity == 'high' else ''}Primary impression: {primary['disease'] if primary else 'No significant abnormality detected'} with {primary['confidence'] if primary else 'N/A'}% AI confidence.

---

## Recommendation

{recommendation}

---

*⚠️ This report is AI-generated and must be reviewed and verified by a licensed radiologist before clinical use. AI analysis is intended to assist, not replace, clinical judgment.*

**Reviewed by:** ________________________________  
**Date:** ________________  
**Signature:** ________________
"""
    return report


def get_progression_data(patient_id: str) -> List[Dict]:
    """Generate simulated disease progression timeline data."""
    base_size = round(random.uniform(0.5, 1.5), 2)
    scans = []
    years = [2023, 2024, 2025, 2026]
    modalities = ["CT", "MRI"]
    mod = random.choice(modalities)

    for i, year in enumerate(years):
        growth = round(base_size * (1 + 0.15 * i + random.uniform(-0.05, 0.1)), 2)
        scans.append({
            "date": f"{year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "year": year,
            "modality": mod,
            "lesion_size_cm": growth,
            "organ_volume_ml": round(300 + i * random.uniform(5, 25), 1),
            "confidence": round(random.uniform(88, 98), 1),
            "scan_id": f"SCAN-{patient_id}-{year}",
            "findings": random.choice([
                "Lesion stable", "Slight growth observed", "Significant progression",
                "Partial regression", "Stable disease"
            ]),
        })

    return scans


def get_monitoring_data() -> Dict[str, Any]:
    """Generate real-time GPU and inference monitoring metrics."""
    return {
        "gpu_usage": round(random.uniform(45, 92), 1),
        "gpu_memory": round(random.uniform(6.2, 15.8), 1),
        "gpu_memory_total": 16.0,
        "inference_latency_ms": round(random.uniform(120, 850), 0),
        "throughput_scans_per_hour": random.randint(28, 156),
        "active_endpoints": random.randint(2, 8),
        "model_accuracy": round(random.uniform(94.2, 98.7), 1),
        "total_inferences_today": random.randint(240, 1450),
        "error_rate": round(random.uniform(0.1, 1.2), 2),
        "uptime_hours": round(random.uniform(120, 720), 1),
        "logs": generate_inference_logs(),
        "gpu_history": [round(random.uniform(40, 95), 1) for _ in range(20)],
        "latency_history": [round(random.uniform(100, 900), 0) for _ in range(20)],
    }


def generate_inference_logs() -> List[Dict]:
    """Generate realistic inference log entries."""
    levels = ["INFO", "INFO", "INFO", "WARN", "INFO", "INFO", "ERROR"]
    messages = [
        "Scan PAT-{id} inference completed in {ms}ms",
        "MONAI SwinUNETR model loaded successfully",
        "GPU memory allocation: {mem}GB / 16GB",
        "High latency detected: {ms}ms > 500ms threshold",
        "Segmentation pipeline completed: lung, liver",
        "Grad-CAM overlay generated for scan {id}",
        "Model checkpoint auto-saved to /models/checkpoint_v2.1.pt",
        "New scan uploaded: {id} [{mod}]",
        "Emergency alert triggered: Brain Hemorrhage confidence > 95%",
        "Batch preprocessing queue: {q} scans pending",
    ]
    modalities = ["CT", "MRI", "X-Ray", "Ultrasound"]
    logs = []
    for i in range(12):
        level = random.choice(levels)
        msg_template = random.choice(messages)
        msg = msg_template.format(
            id=f"PAT-{random.randint(10000,99999)}",
            ms=random.randint(80, 900),
            mem=round(random.uniform(6, 15), 1),
            mod=random.choice(modalities),
            q=random.randint(1, 20),
        )
        logs.append({
            "level": level,
            "message": msg,
            "timestamp": f"2026-05-30T{random.randint(0,23):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}Z",
        })
    return sorted(logs, key=lambda x: x["timestamp"], reverse=True)


def generate_copilot_response(query: str, metadata: dict, findings: list) -> str:
    """
    Generate an intelligent, clinical assistant response based on the scan context.
    """
    q = query.lower()
    modality = metadata.get("modality", "CT")
    patient_id = metadata.get("patient_id", "Anonymous")

    primary = findings[0] if findings else None
    primary_name = primary["disease"] if primary else "No active abnormalities"
    primary_loc = primary["location"] if primary else "N/A"
    primary_conf = primary["confidence"] if primary else "N/A"
    primary_size = primary.get("size_cm", 0.0) if primary else 0.0
    primary_sev = primary["severity"] if primary else "normal"

    # Generate response
    if "hello" in q or "hi " in q or "hey" in q or "greetings" in q:
        return (
            f"Hello! I am your MedAI Clinical Co-Pilot. I am synchronized with **Patient ID: {patient_id}** "
            f"({modality} scan). I can assist you with interpreting the AI findings, explaining confidence metrics, "
            f"or drafting clinical recommendations. How can I help you today?"
        )

    elif "finding" in q or "abnormality" in q or "detect" in q or "diagnos" in q or "tumor" in q or "nodule" in q or "lesion" in q or "cancer" in q:
        if not primary:
            return "The AI analysis did not detect any high-confidence abnormalities on this scan. All structures appear within normal clinical limits."

        response = (
            f"### AI Detection Summary\n\n"
            f"For patient **{patient_id}**, the primary AI model (**DenseNet-121-Medical**) detected:\n"
            f"- **Abnormality:** `{primary_name}`\n"
            f"- **Confidence:** `{primary_conf}%`\n"
            f"- **Anatomical Location:** `{primary_loc}`\n"
        )
        if primary_size > 0:
            response += f"- **Estimated Dimensions:** `{primary_size} cm` in maximum diameter\n"

        response += f"- **AI Severity Classification:** **{primary_sev.upper()}**\n\n"

        if len(findings) > 1:
            response += "### Secondary Findings:\n"
            for f in findings[1:]:
                response += f"- **{f['disease']}** detected in the `{f['location']}` with **{f['confidence']}%** confidence (Severity: *{f['severity']}*).\n"

        return response

    elif "recommend" in q or "next step" in q or "follow up" in q or "action" in q or "guideline" in q:
        if not primary:
            return "As no active lesions or abnormalities were flagged, routine clinical surveillance according to standard health guidelines is advised."

        recommendations = {
            "critical": "1. **Immediate Specialist Referral:** Urgent clinical consultation with an oncologist/pulmonologist/specialist is indicated.\n2. **Emergency Review:** Verify boundaries via 3D Reconstruction and correlate with urgent laboratory findings.\n3. **Confirmatory Biopsy:** Strongly recommended if clinically feasible.",
            "high": "1. **Prompt Specialty Consultation:** Referral within 48-72 hours.\n2. **Diagnostic Correlation:** Correlate with patient's active symptom history and serum inflammatory markers.\n3. **Short-Interval Follow-up:** Schedule repeat high-resolution imaging in 30 days if biopsy is deferred.",
            "moderate": "1. **Routine Specialist Review:** Patient should be scheduled for specialist consultation within 2-4 weeks.\n2. **Interval Scan:** Follow-up high-resolution imaging in 3 to 6 months to monitor for volumetric changes.\n3. **Clinical Monitoring:** Instruct patient to report any new respiratory or neurological symptoms immediately.",
            "low": "1. **Surveillance Plan:** Standard imaging surveillance in 6 to 12 months to assess interval stability.\n2. **No Urgent Actions Required:** The AI classifies this finding as low risk, suitable for routine outpatient observation."
        }

        rec_text = recommendations.get(primary_sev, recommendations["moderate"])
        return (
            f"### Clinical Recommendations for {primary_name}\n\n"
            f"Based on the **{primary_sev.upper()}** severity rating and diagnostic confidence of **{primary_conf}%**, "
            f"the MedAI Platform proposes the following next steps:\n\n{rec_text}\n\n"
            f"*Disclaimer: MedAI recommendations are based on ACC/AHA and Fleischner Society guidelines. These must be reviewed by the attending physician.*"
        )

    elif "malignant" in q or "benign" in q or "cancer" in q or "severity" in q:
        if not primary:
            return "No anomalies detected. The risk of malignancy on this scan is evaluated as negligible."

        malignancy_risk = "N/A"
        if primary_sev == "critical":
            malignancy_risk = "High (>85%)"
        elif primary_sev == "high":
            malignancy_risk = "Moderate-to-High (60% - 85%)"
        elif primary_sev == "moderate":
            malignancy_risk = "Moderate (25% - 60%)"
        else:
            malignancy_risk = "Low (<25%)"

        return (
            f"### Severity & Malignancy Evaluation\n\n"
            f"- **Primary Finding:** {primary_name}\n"
            f"- **Model Severity:** `{primary_sev.upper()}`\n"
            f"- **Statistically Estimated Malignancy Index:** **{malignancy_risk}**\n\n"
            f"**Pathological Details:** The {primary_name} is located in the `{primary_loc}` with a thickness/diameter of `{primary_size} cm` (where measurable). "
            f"Anomalous borders are outlined in red on the Explainable AI (Grad-CAM) heatmap. "
            f"A histologic biopsy remains the gold standard for definitive diagnosis, but the AI flags this with a confidence level of `{primary_conf}%`."
        )

    elif "accuracy" in q or "model" in q or "confidence" in q or "monai" in q or "swinunetr" in q:
        return (
            f"### MedAI Active Model Architecture\n\n"
            f"1. **Segmentation Pipeline (MONAI SwinUNETR v2.1):**\n"
            f"   - **Type:** Shifted Window Transformer for 3D/2D Medical Segmentation.\n"
            f"   - **Role:** Delineates tissue boundaries for organs (brain, lungs, liver) and pathological volumes.\n"
            f"   - **Accuracy:** ~96.8% Dice Similarity Coefficient (DSC) on standard clinical validation cohorts.\n\n"
            f"2. **Classification Pipeline (DenseNet-121-Medical):**\n"
            f"   - **Role:** Performs multi-label classification to identify the presence and localization of 15+ pathologies.\n"
            f"   - **Training Set:** 100k+ clinical radiology images.\n\n"
            f"3. **Explainability Engine (Grad-CAM XAI):**\n"
            f"   - **Role:** Computes gradients at the final convolutional layers to render visual activation maps (heatmaps) highlighting regions of diagnostic interest."
        )

    elif "help" in q or "capability" in q or "can you do" in q:
        return (
            f"### MedAI Co-Pilot Capabilities\n"
            f"I can assist you with the following tasks regarding this medical scan:\n"
            f"- **Explain Findings:** Ask me about the detected abnormalities or lesions.\n"
            f"- **Next Steps:** Ask what clinical recommendations or follow-up timelines apply.\n"
            f"- **Malignancy Assessment:** Ask about severity rankings and statistical risk indexing.\n"
            f"- **Explain AI Technology:** Ask how our SwinUNETR segmentation or Grad-CAM maps operate.\n"
            f"- **Navigate UI:** You can also command me using voice to switch pages or toggle overlays!"
        )

    else:
        return (
            f"I have analyzed your query regarding the current scan (Patient: {patient_id}).\n\n"
            f"**Scan Context:** {modality} scan displaying a `{primary_name}` in the `{primary_loc}` "
            f"with **{primary_conf}%** confidence.\n\n"
            f"To better assist you, you can ask specific clinical questions such as:\n"
            f"- *'Summarize the primary abnormalities detected on this scan.'*\n"
            f"- *'What are the recommended clinical next steps and follow-up intervals?'*\n"
            f"- *'Explain the active AI model architectures and their accuracy.'*\n"
            f"- *'What is the severity classification of this lesion?'*"
        )

