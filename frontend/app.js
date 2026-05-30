// ============================================================
// app.js - MedAI Platform SPA Controller
// ============================================================

const API_BASE = 'http://localhost:8000';

// ============================================================
// State
// ============================================================
const state = {
  currentPage: 'home',
  currentScanId: null,
  currentMetadata: null,
  currentFindings: null,
  currentReport: null,
  scanImage: null,
  gradcamImage: null,
  segMasks: null,
  showGradcam: false,
  activeOrgan: 'brain',
  brightness: 100,
  contrast: 100,
  windowLevel: 50,
  windowWidth: 80,
  canvasScale: 1,
  canvasOffsetX: 0,
  canvasOffsetY: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  monitoringInterval: null,

  // MedAI Premium Extension States
  mprPlane: 'axial',
  rulerMode: false,
  rulerPoints: [],
  activeRulerStart: null,
  activeRulerEnd: null,
  maskOverlay: false,
  maskOpacity: 0.5,
};

// ============================================================
// Navigation
// ============================================================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.getElementById(`nav-${page}`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  state.currentPage = page;

  // Update header
  const titles = {
    home: { title: 'Dashboard Overview', sub: 'Real-time platform metrics and system status' },
    upload: { title: 'Scan Upload', sub: 'Upload DICOM, PNG, or JPEG medical scans' },
    analysis: { title: 'AI Analysis', sub: 'Disease detection, segmentation, and Grad-CAM' },
    viewer: { title: 'Medical Viewer', sub: '2D scan viewer and 3D organ reconstruction' },
    reports: { title: 'AI Reports', sub: 'Generated medical reports and PDF export' },
    monitoring: { title: 'System Monitoring', sub: 'GPU usage, inference latency, and logs' },
    timeline: { title: 'Patient Timeline', sub: 'Disease progression and treatment tracking' },
  };
  const info = titles[page] || titles.home;
  setEl('header-title', info.title);
  setEl('header-subtitle', info.sub);

  // Page-specific init
  if (page === 'home') loadHomeStats();
  if (page === 'monitoring') startMonitoring();
  else stopMonitoring();
  if (page === 'viewer') setTimeout(() => init3DViewer('viewer-3d'), 100);
  if (page === 'timeline') loadTimeline();
  if (page === 'reports') { renderReport(); renderReportFindingsSummary(); }

}

// ============================================================
// Utility
// ============================================================
function setEl(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setAttr(id, attr, val) {
  const el = document.getElementById(id);
  if (el) el[attr] = val;
}

function getEl(id) { return document.getElementById(id); }

function showToast(message, type = 'info', duration = 3500) {
  const container = getEl('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show'); }); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

function animateNumber(id, target, decimals = 0, suffix = '') {
  const el = getEl(id);
  if (!el) return;
  const start = parseFloat(el.textContent) || 0;
  const duration = 1000;
  const startTime = performance.now();
  function update(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = start + (target - start) * eased;
    el.textContent = val.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function formatMarkdown(md) {
  // Very lightweight markdown to HTML converter
  if (!md) return '';
  return md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\|(.+)\|/g, (m) => {
      const cells = m.split('|').filter(c => c.trim());
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>)/gs, '<table>$1</table>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[h1-6ul>]|<tr|<hr|<li)(.+)$/gm, '<p>$1</p>');
}

// ============================================================
// Home Page
// ============================================================
async function loadHomeStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    animateNumber('stat-total-scans', data.total_scans, 0);
    animateNumber('stat-today-analyses', data.today_analyses, 0);
    animateNumber('stat-model-accuracy', data.model_accuracy, 1, '%');
    animateNumber('stat-active-models', data.active_models, 0);
    animateNumber('stat-alerts-today', data.critical_alerts_today, 0);
    animateNumber('stat-inference-ms', data.avg_inference_ms, 0, 'ms');
    animateNumber('stat-patients', data.patients_monitored, 0);
    animateNumber('stat-reports', data.reports_generated, 0);

    // Modality breakdown
    const breakdown = data.modality_breakdown;
    Object.entries(breakdown).forEach(([mod, pct]) => {
      const bar = getEl(`modality-bar-${mod.toLowerCase()}`);
      const label = getEl(`modality-pct-${mod.toLowerCase()}`);
      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = `${pct}%`;
    });
  } catch (e) {
    // Use mock data
    animateNumber('stat-total-scans', 13856, 0);
    animateNumber('stat-today-analyses', 214, 0);
    animateNumber('stat-model-accuracy', 96.8, 1, '%');
    animateNumber('stat-active-models', 4, 0);
    animateNumber('stat-alerts-today', 7, 0);
    animateNumber('stat-inference-ms', 342, 0, 'ms');
    animateNumber('stat-patients', 3842, 0);
    animateNumber('stat-reports', 1120, 0);
  }
}

// ============================================================
// Upload Page
// ============================================================
function initUploadZone() {
  const zone = getEl('upload-zone');
  const fileInput = getEl('file-input');
  if (!zone || !fileInput) return;

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
  });
}

async function handleFileUpload(file) {
  showToast(`Uploading ${file.name}...`, 'info');
  const zone = getEl('upload-zone');
  if (zone) zone.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <div style="color:var(--text-muted);font-size:14px;">Processing DICOM metadata...</div>
    </div>`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    handleUploadSuccess(data);
  } catch (e) {
    // Try to load a demo scan on failure
    try {
      const mod = file.name.toLowerCase().includes('mri') ? 'MRI' : 'CT';
      const res = await fetch(`${API_BASE}/api/demo-scan?modality=${mod}`, { method: 'POST' });
      const data = await res.json();
      handleUploadSuccess(data);
    } catch (e2) {
      showToast('Backend not running. Using demo mode.', 'error');
      handleUploadSuccess(getDemoScanData());
      resetUploadZone();
    }
  }
}

async function loadDemoScan(modality = 'CT') {
  showToast(`Loading demo ${modality} scan...`, 'info');
  try {
    const res = await fetch(`${API_BASE}/api/demo-scan?modality=${modality}`, { method: 'POST' });
    const data = await res.json();
    handleUploadSuccess(data);
    showToast(`Demo ${modality} scan loaded!`, 'success');
  } catch (e) {
    // Pure frontend demo mode
    handleUploadSuccess(getDemoScanData(modality));
    showToast('Demo scan loaded (offline mode)', 'success');
  }
}

function getDemoScanData(modality = 'CT') {
  const modalities = { CT: 'CT', MRI: 'MRI', 'X-Ray': 'X-Ray', Ultrasound: 'Ultrasound' };
  const mod = modalities[modality] || 'CT';
  return {
    scan_id: 'DEMO-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
    filename: `demo_${mod.toLowerCase()}_scan.dcm`,
    metadata: {
      patient_id: 'PAT-' + Math.floor(Math.random() * 90000 + 10000),
      patient_name: 'Anonymous Patient',
      modality: mod,
      study_description: `${mod} Chest Analysis`,
      slice_thickness: (Math.random() * 4 + 0.5).toFixed(2) + ' mm',
      acquisition_date: '2026-05-28',
      institution: 'MedAI Clinical Center',
      series_description: 'Axial Reconstructed Series',
      rows: '512',
      columns: '512',
      pixel_spacing: '0.703 mm',
      bits_allocated: '16',
      manufacturer: 'Siemens Healthineers',
    },
    scan_image: null,
    preprocessing: {
      noise_reduction: true,
      normalization: true,
      contrast_enhancement: true,
      resize: '512x512',
      slice_selection: 'mid-axial',
    },
    message: 'Demo scan loaded.',
  };
}

function handleUploadSuccess(data) {
  state.currentScanId = data.scan_id;
  state.currentMetadata = data.metadata;
  if (data.scan_image) {
    state.scanImage = `data:image/png;base64,${data.scan_image}`;
  }

  resetUploadZone();
  displayMetadata(data);
  showToast('Scan uploaded successfully!', 'success');

  // Auto-navigate to analysis tab after short delay
  setTimeout(() => {
    if (state.currentScanId) {
      getEl('analyze-btn-header')?.classList.remove('hidden');
    }
  }, 500);
}

function resetUploadZone() {
  const zone = getEl('upload-zone');
  if (!zone) return;
  zone.innerHTML = `
    <span class="upload-icon">🩻</span>
    <div class="upload-title">Drop Your Medical Scan Here</div>
    <div class="upload-subtitle">or click to browse files from your computer</div>
    <div class="upload-formats">
      <span class="format-badge dcm">DICOM</span>
      <span class="format-badge png">PNG</span>
      <span class="format-badge jpg">JPEG</span>
      <span class="format-badge nii">NIfTI</span>
    </div>`;
}

function displayMetadata(data) {
  const meta = data.metadata;
  const prep = data.preprocessing;

  const metaRows = [
    ['Patient ID', meta.patient_id],
    ['Patient Name', meta.patient_name],
    ['Modality', `<span class="tag tag-cyan">${meta.modality}</span>`],
    ['Study Description', meta.study_description],
    ['Acquisition Date', meta.acquisition_date],
    ['Institution', meta.institution],
    ['Slice Thickness', meta.slice_thickness],
    ['Series', meta.series_description],
    ['Dimensions', `${meta.rows} × ${meta.columns}`],
    ['Pixel Spacing', meta.pixel_spacing],
    ['Bits Allocated', meta.bits_allocated],
    ['Manufacturer', meta.manufacturer],
    ['Scan ID', `<span class="scan-id-tag">${data.scan_id}</span>`],
    ['File', data.filename],
  ];

  const tableHTML = metaRows.map(([k, v]) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`
  ).join('');
  setEl('metadata-table-body', tableHTML);

  // Preprocessing indicators
  const prepHTML = Object.entries(prep).map(([k, v]) => {
    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const val = typeof v === 'boolean' ? (v ? '✅ Applied' : '⛔ Skipped') : v;
    return `<tr><td>${label}</td><td>${val}</td></tr>`;
  }).join('');
  setEl('preprocessing-table-body', prepHTML);

  // Show scan preview
  if (data.scan_image) {
    const preview = getEl('scan-preview');
    if (preview) {
      preview.src = `data:image/png;base64,${data.scan_image}`;
      preview.style.display = 'block';
    }
  } else {
    drawSyntheticScan();
  }

  const metaSection = getEl('metadata-section');
  if (metaSection) { metaSection.style.display = 'block'; metaSection.classList.remove('hidden'); }

  // Show preview canvas if no image
  if (!data.scan_image) {
    const cv = getEl('scan-preview-canvas');
    if (cv) { cv.style.display = 'block'; drawSyntheticScan(); }
  }
}

// ============================================================
// Analysis Page
// ============================================================
async function runAnalysis() {
  if (!state.currentScanId) {
    showToast('Please upload a scan first.', 'error');
    navigate('upload');
    return;
  }

  setEl('analysis-content', `
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">Running AI inference pipeline...</div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">SwinUNETR · DenseNet-121 · Grad-CAM</div>
    </div>`);

  try {
    const res = await fetch(`${API_BASE}/api/analyze/${state.currentScanId}`);
    if (!res.ok) throw new Error('Analysis failed');
    const data = await res.json();
    renderAnalysisResults(data);
  } catch (e) {
    // Demo mode
    renderAnalysisResults(getDemoAnalysisData());
    showToast('Using demo analysis (backend offline)', 'info');
  }
}

function getDemoAnalysisData() {
  const modality = state.currentMetadata?.modality || 'CT';
  const profiles = {
    CT: [
      { disease: 'Lung Nodule', confidence: 94.2, severity: 'moderate', severity_color: '#f59e0b', size_cm: 2.1, location: 'right upper lobe', model: 'SwinUNETR' },
      { disease: 'Pneumonia', confidence: 88.7, severity: 'high', severity_color: '#f97316', size_cm: 3.4, location: 'bilateral lower lobes', model: 'DenseNet-121' },
      { disease: 'Pleural Effusion', confidence: 78.3, severity: 'moderate', severity_color: '#f59e0b', size_cm: 1.8, location: 'right pleural space', model: 'SegResNet' },
    ],
    MRI: [
      { disease: 'Brain Tumor', confidence: 97.8, severity: 'critical', severity_color: '#ef4444', size_cm: 2.3, location: 'right parietal lobe', model: 'SwinUNETR' },
      { disease: 'Ischemic Stroke', confidence: 91.2, severity: 'critical', severity_color: '#ef4444', size_cm: 1.5, location: 'left temporal region', model: 'UNet-3D' },
    ],
    'X-Ray': [
      { disease: 'Pneumonia', confidence: 96.1, severity: 'high', severity_color: '#f97316', size_cm: 4.2, location: 'bilateral', model: 'DenseNet-121' },
      { disease: 'Cardiomegaly', confidence: 84.5, severity: 'high', severity_color: '#f97316', size_cm: 0, location: 'cardiac region', model: 'ResNet-50' },
    ],
    Ultrasound: [
      { disease: 'Kidney Stone', confidence: 89.3, severity: 'moderate', severity_color: '#f59e0b', size_cm: 0.8, location: 'right kidney', model: 'UNet-2D' },
      { disease: 'Liver Lesion', confidence: 76.4, severity: 'high', severity_color: '#f97316', size_cm: 2.1, location: 'hepatic lobe', model: 'SegResNet' },
    ],
  };
  const findings = profiles[modality] || profiles.CT;
  const critical = findings.filter(f => f.severity === 'critical');
  const emergency = critical.length > 0 && critical[0].confidence > 92 ? {
    alert: true,
    disease: critical[0].disease,
    confidence: critical[0].confidence,
    severity: 'CRITICAL',
    message: `⚠️ ${critical[0].disease} detected with ${critical[0].confidence}% confidence. Immediate clinical review required.`,
  } : null;

  const organs = { CT: { lung: null, liver: null }, MRI: { brain: null }, 'X-Ray': { lung: null }, Ultrasound: { liver: null, kidney: null } };

  return {
    scan_id: state.currentScanId,
    modality,
    findings,
    segmentation_masks: organs[modality] || {},
    gradcam_overlay: null,
    scan_image: null,
    ai_report: generateDemoReport(findings, state.currentMetadata),
    emergency_alert: emergency,
    inference_time_ms: Math.floor(Math.random() * 400 + 200),
    model_versions: { segmentation: 'SwinUNETR-v2.1', detection: 'DenseNet-121-Medical', report: 'GPT-Medical-3.5' },
  };
}

function generateDemoReport(findings, metadata) {
  const pat = metadata || {};
  const primary = findings[0];
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `# AI-Assisted Radiology Report

**Patient ID:** ${pat.patient_id || 'PAT-DEMO'}  
**Imaging Modality:** ${pat.modality || 'CT'}  
**Report Date:** ${date}  
**Institution:** ${pat.institution || 'MedAI Clinical Center'}  
**AI Model:** MONAI SwinUNETR v2.1 + GPT-Medical Report Engine  

---

## Clinical Indication

Routine ${pat.modality || 'CT'} scan for diagnostic evaluation. AI-assisted analysis performed to identify potential abnormalities.

---

## Findings

### Primary Finding
A ${primary?.size_cm || '2.1'} cm lesion consistent with **${primary?.disease || 'Lung Nodule'}** has been identified in the ${primary?.location || 'right upper lobe'}, with a diagnostic confidence of ${primary?.confidence || '94.2'}%.

### Additional Findings
${findings.slice(1).map(f => `- **${f.disease}** in ${f.location} (Confidence: ${f.confidence}%, Severity: ${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)})`).join('\n')}

---

## AI Confidence Metrics

| Finding | Confidence | Severity |
|---------|-----------|----------|
${findings.map(f => `| ${f.disease} | ${f.confidence}% | ${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)} |`).join('\n')}

---

## Recommendation

${primary?.severity === 'critical' ?
  '**[CRITICAL]** Immediate clinical intervention is strongly advised. Emergency protocol may be warranted.' :
  primary?.severity === 'high' ?
  'Prompt follow-up with clinical specialist recommended within 48-72 hours.' :
  'Follow-up imaging recommended within 4-6 weeks. Clinical correlation advised.'}

---

*⚠️ This report is AI-generated and must be reviewed by a licensed radiologist before clinical use.*`;
}

function renderAnalysisResults(data) {
  state.currentFindings = data.findings;
  state.currentReport = data.ai_report;
  if (data.scan_image) state.scanImage = `data:image/png;base64,${data.scan_image}`;
  if (data.gradcam_overlay) state.gradcamImage = `data:image/png;base64,${data.gradcam_overlay}`;
  if (data.segmentation_masks) state.segMasks = data.segmentation_masks;

  // Emergency alert
  if (data.emergency_alert?.alert) {
    showEmergencyAlert(data.emergency_alert);
  }

  // Render findings
  const findingsHTML = data.findings.map((f, i) => `
    <div class="finding-item">
      <div class="finding-rank">${i + 1}</div>
      <div class="finding-info">
        <div class="finding-name">${f.disease}</div>
        <div class="finding-detail">📍 ${f.location} · ${f.size_cm > 0 ? f.size_cm + ' cm · ' : ''}${f.model}</div>
        <div class="confidence-bar-wrap">
          <div class="confidence-bar" style="width:${f.confidence}%;background:${i === 0 ? 'var(--grad-cyan)' : i === 1 ? 'var(--grad-purple)' : 'var(--grad-emerald)'}"></div>
        </div>
      </div>
      <div class="finding-confidence">
        <div class="confidence-value" style="color:${f.severity_color || 'var(--accent-cyan)'}">${f.confidence}%</div>
        <div class="severity-pill ${f.severity}">${f.severity}</div>
      </div>
    </div>`).join('');

  // Segmentation masks
  const masksHTML = data.segmentation_masks && Object.keys(data.segmentation_masks).length > 0
    ? Object.entries(data.segmentation_masks).map(([organ, b64]) => `
    <div class="seg-card">
      <img src="${b64 ? 'data:image/png;base64,' + b64 : ''}" alt="${organ} mask" 
           style="${b64 ? '' : 'min-height:150px;background:var(--bg-glass);display:flex;align-items:center;justify-content:center;'}">
      <div class="seg-label">🫁 ${organ.charAt(0).toUpperCase() + organ.slice(1)} Segmentation</div>
    </div>`).join('')
    : `<div style="color:var(--text-muted);font-size:13px;padding:20px;">Run on a real scan to see segmentation overlays.</div>`;

  setEl('analysis-content', `
    <div class="section-row two-col">
      <div>
        <div class="glass-card" style="margin-bottom:16px;">
          <div class="card-header">
            <div class="card-title">🔬 Disease Detection Results</div>
            <div class="tag tag-cyan">${data.modality}</div>
          </div>
          <div class="card-body">
            <div class="findings-list">${findingsHTML}</div>
          </div>
        </div>
        <div class="glass-card">
          <div class="card-header">
            <div class="card-title">📊 Model Info</div>
          </div>
          <div class="card-body">
            <table class="metadata-table">
              <tr><td>Segmentation Model</td><td>${data.model_versions.segmentation}</td></tr>
              <tr><td>Detection Model</td><td>${data.model_versions.detection}</td></tr>
              <tr><td>Report Model</td><td>${data.model_versions.report}</td></tr>
              <tr><td>Inference Time</td><td>${data.inference_time_ms} ms</td></tr>
            </table>
          </div>
        </div>
      </div>
      <div>
        <div class="glass-card" style="margin-bottom:16px;">
          <div class="card-header">
            <div class="card-title">🧠 Explainable AI - Grad-CAM</div>
            <div class="btn-row">
              <button class="tool-btn ${state.showGradcam ? 'active' : ''}" onclick="toggleGradcam()">Toggle Heatmap</button>
              <button class="tool-btn" onclick="navigate('viewer')">Open Viewer</button>
            </div>
          </div>
          <div class="card-body" style="padding:12px;text-align:center;">
            <canvas id="analysis-canvas" style="width:100%;max-width:400px;height:auto;border-radius:8px;border:1px solid var(--border-card);cursor:pointer;" onclick="toggleGradcam()"></canvas>
            <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Click to toggle Grad-CAM overlay · Red = high activation</div>
          </div>
        </div>
        <div class="glass-card">
          <div class="card-header">
            <div class="card-title">🫀 Organ Segmentation</div>
            <button class="btn-primary" onclick="navigate('reports')">View Full Report</button>
          </div>
          <div class="card-body">
            <div class="seg-grid">${masksHTML}</div>
          </div>
        </div>
      </div>
    </div>`);

  // Draw scan + Grad-CAM on canvas
  setTimeout(() => {
    drawAnalysisCanvas();
  }, 100);

  // Navigate to analysis
  navigate('analysis');
  showToast('AI analysis complete!', 'success');
}

function drawAnalysisCanvas() {
  const canvas = getEl('analysis-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 400;
  canvas.height = 400;

  if (state.scanImage) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 400, 400);
      if (state.showGradcam && state.gradcamImage) {
        drawGradcamOverlay(ctx, 400, 400);
      } else if (state.showGradcam) {
        drawSyntheticGradcam(ctx, 400, 400);
      }
    };
    img.src = state.scanImage;
  } else {
    drawSyntheticScanOnCanvas(ctx, 400, 400);
    if (state.showGradcam) drawSyntheticGradcam(ctx, 400, 400);
  }
}

function drawGradcamOverlay(ctx, w, h) {
  if (!state.gradcamImage) return;
  const img = new Image();
  img.onload = () => {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  };
  img.src = state.gradcamImage;
}

function drawSyntheticGradcam(ctx, w, h) {
  const n = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < n; i++) {
    const cx = w * 0.3 + Math.random() * w * 0.4;
    const cy = h * 0.3 + Math.random() * h * 0.4;
    const r = Math.random() * 60 + 30;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255, 60, 0, 0.65)');
    grad.addColorStop(0.4, 'rgba(255, 120, 0, 0.4)');
    grad.addColorStop(0.8, 'rgba(255, 200, 0, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 0, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function toggleGradcam() {
  state.showGradcam = !state.showGradcam;
  drawAnalysisCanvas();
  const btn = document.querySelector('[onclick="toggleGradcam()"]');
  if (btn) btn.classList.toggle('active', state.showGradcam);
  showToast(state.showGradcam ? 'Grad-CAM overlay enabled' : 'Grad-CAM overlay disabled', 'info');
}

// ============================================================
// 2D Viewer Canvas
// ============================================================
function initViewerCanvas() {
  const canvas = getEl('scan-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 500;
  canvas.height = canvas.offsetHeight || 500;

  drawViewerScan(ctx);

  // Mouse pan / Ruler
  canvas.addEventListener('mousedown', e => {
    const coords = getViewerImageCoords(e, canvas);
    if (state.rulerMode) {
      state.activeRulerStart = coords;
      state.activeRulerEnd = coords;
    } else {
      state.isDragging = true;
      state.dragStart = { x: e.clientX - state.canvasOffsetX, y: e.clientY - state.canvasOffsetY };
    }
  });

  canvas.addEventListener('mousemove', e => {
    const coords = getViewerImageCoords(e, canvas);
    if (state.rulerMode && state.activeRulerStart) {
      state.activeRulerEnd = coords;
      drawViewerScan(ctx);
    } else if (state.isDragging) {
      state.canvasOffsetX = e.clientX - state.dragStart.x;
      state.canvasOffsetY = e.clientY - state.dragStart.y;
      drawViewerScan(ctx);
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (state.rulerMode && state.activeRulerStart && state.activeRulerEnd) {
      const p1 = state.activeRulerStart;
      const p2 = state.activeRulerEnd;
      const dx = p1.ix - p2.ix;
      const dy = p1.iy - p2.iy;
      const pixelDist = Math.sqrt(dx * dx + dy * dy);

      // Calculate real mm distance
      const spacingStr = state.currentMetadata?.pixel_spacing || "0.703 mm";
      const spacingVal = parseFloat(spacingStr) || 0.65;
      const distanceMm = pixelDist * spacingVal;

      if (pixelDist > 5) {
        state.rulerPoints.push({
          start: p1,
          end: p2,
          distanceMm: distanceMm
        });
        updateRulerUI();
        showToast(`Measurement: ${distanceMm.toFixed(1)} mm`, 'success');
      }
      state.activeRulerStart = null;
      state.activeRulerEnd = null;
      drawViewerScan(ctx);
    }
    state.isDragging = false;
  });

  canvas.addEventListener('mouseleave', () => {
    state.activeRulerStart = null;
    state.activeRulerEnd = null;
    state.isDragging = false;
    drawViewerScan(ctx);
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    state.canvasScale = Math.max(0.5, Math.min(5, state.canvasScale - e.deltaY * 0.001));
    drawViewerScan(ctx);
  }, { passive: false });
}

function getViewerImageCoords(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = canvas.width;
  const h = canvas.height;
  return {
    ix: (x - w / 2 - state.canvasOffsetX) / state.canvasScale,
    iy: (y - h / 2 - state.canvasOffsetY) / state.canvasScale
  };
}

function drawViewerScan(ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2 + state.canvasOffsetX, h / 2 + state.canvasOffsetY);
  ctx.scale(state.canvasScale, state.canvasScale);

  if (state.scanImage && state.mprPlane === 'axial') {
    // If it's a real uploaded scan image, draw it
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%)`;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();

      // Draw segmentation mask if active
      if (state.maskOverlay && state.segMasks) {
        const maskImg = new Image();
        maskImg.onload = () => {
          ctx.save();
          ctx.globalAlpha = state.maskOpacity;
          ctx.globalCompositeOperation = 'screen';
          ctx.drawImage(maskImg, -w / 2, -h / 2, w, h);
          ctx.restore();
          drawPostImageLayers(ctx, w, h);
        };
        const activeMaskB64 = state.segMasks[state.activeOrgan] || Object.values(state.segMasks)[0];
        maskImg.src = activeMaskB64 ? `data:image/png;base64,${activeMaskB64}` : '';
      } else {
        drawPostImageLayers(ctx, w, h);
      }
    };
    img.src = state.scanImage;
  } else {
    // Render synthetic scan (Axial, Coronal, Sagittal)
    drawSyntheticScanOnCanvas(ctx, w, h, -w/2, -h/2);
    drawPostImageLayers(ctx, w, h);
  }
  ctx.restore();
}

function drawPostImageLayers(ctx, w, h) {
  if (state.showGradcam) drawSyntheticGradcam(ctx, w, h);
  drawViewerOverlays(ctx, w, h);
  drawRulerMeasurementsOnCanvas(ctx);
}

function drawRulerMeasurementsOnCanvas(ctx) {
  ctx.save();

  // Draw established ruler lines
  state.rulerPoints.forEach((r, idx) => {
    drawSingleRulerLine(ctx, r.start.ix, r.start.iy, r.end.ix, r.end.iy, `${r.distanceMm.toFixed(1)} mm`, idx + 1);
  });

  // Draw currently drawing ruler line
  if (state.activeRulerStart && state.activeRulerEnd) {
    const p1 = state.activeRulerStart;
    const p2 = state.activeRulerEnd;
    const dx = p1.ix - p2.ix;
    const dy = p1.iy - p2.iy;

    const spacingStr = state.currentMetadata?.pixel_spacing || "0.703 mm";
    const spacingVal = parseFloat(spacingStr) || 0.65;
    const distanceMm = Math.sqrt(dx * dx + dy * dy) * spacingVal;

    drawSingleRulerLine(ctx, p1.ix, p1.iy, p2.ix, p2.iy, `${distanceMm.toFixed(1)} mm`, null);
  }

  ctx.restore();
}

function drawSingleRulerLine(ctx, x1, y1, x2, y2, label, index) {
  // Dashed neon cyan ruler line
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  // Outer glow
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 6;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw circles at ends
  ctx.fillStyle = '#ec4899'; // pink end nodes
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.0;
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  [ {x: x1, y: y1}, {x: x2, y: y2} ].forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Draw label text background
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  ctx.font = '10px JetBrains Mono, monospace';
  const textWidth = ctx.measureText(label).width;

  ctx.fillStyle = 'rgba(3, 7, 18, 0.85)';
  ctx.fillRect(mx - textWidth/2 - 4, my - 7, textWidth + 8, 14);
  ctx.strokeStyle = '#ec4899';
  ctx.strokeRect(mx - textWidth/2 - 4, my - 7, textWidth + 8, 14);

  // Text
  ctx.fillStyle = '#f1f5f9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, mx, my);

  // Draw index number if available
  if (index !== null) {
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(x1 - 16, y1 - 6, 12, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '8px sans-serif';
    ctx.fillText(index.toString(), x1 - 10, y1);
  }
}

function drawSyntheticScanOnCanvas(ctx, w, h, ox = 0, oy = 0) {
  // Background
  ctx.fillStyle = '#111';
  ctx.fillRect(ox, oy, w, h);

  const cx = ox + w / 2, cy = oy + h / 2;
  const organ = state.activeOrgan || 'brain';

  if (state.mprPlane === 'axial') {
    // -------------------------------------------------------------
    // AXIAL VIEW (Existing Chest or Organ Scan)
    // -------------------------------------------------------------
    // Outer body
    const bodyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.45);
    bodyGrad.addColorStop(0, 'rgba(80, 80, 80, 0.6)');
    bodyGrad.addColorStop(0.7, 'rgba(50, 50, 50, 0.4)');
    bodyGrad.addColorStop(1, 'rgba(20, 20, 20, 0)');
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.42, h * 0.40, 0, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Lungs (if active or standard chest scan)
    for (const lx of [cx - w * 0.18, cx + w * 0.18]) {
      ctx.beginPath();
      ctx.ellipse(lx, cy, w * 0.12, h * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 15, 15, 0.9)';
      ctx.fill();

      // Segmentation direct overlay
      if (state.maskOverlay && (organ === 'lung' || organ === 'brain')) {
        ctx.fillStyle = `rgba(6, 182, 212, ${state.maskOpacity})`;
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Heart
    const hGrad = ctx.createRadialGradient(cx, cy - h * 0.03, 0, cx, cy - h * 0.03, w * 0.09);
    hGrad.addColorStop(0, 'rgba(180, 80, 80, 0.85)');
    hGrad.addColorStop(1, 'rgba(100, 40, 40, 0.4)');
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.03, w * 0.08, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = hGrad;
    ctx.fill();

    // Spine
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.025, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 200, 180, 0.7)';
    ctx.fill();

    // Ribs
    for (let i = 0; i < 5; i++) {
      const ry = cy - h * 0.2 + i * h * 0.1;
      ctx.beginPath();
      ctx.ellipse(cx, ry, w * 0.35, h * 0.012, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(180, 160, 140, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Interactive Tumor nodule (axial location)
    drawLesion(ctx, cx + w * 0.12, cy - h * 0.10, 12);
  }
  else if (state.mprPlane === 'coronal') {
    // -------------------------------------------------------------
    // CORONAL VIEW (Frontal vertical view)
    // -------------------------------------------------------------
    // Outer body silhouette
    ctx.fillStyle = 'rgba(40, 40, 40, 0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - w*0.35, cy - h*0.45);
    ctx.quadraticCurveTo(cx - w*0.40, cy, cx - w*0.30, cy + h*0.45);
    ctx.lineTo(cx + w*0.30, cy + h*0.45);
    ctx.quadraticCurveTo(cx + w*0.40, cy, cx + w*0.35, cy - h*0.45);
    ctx.closePath();
    ctx.fill();

    // Vertical Lungs (Coronal plane)
    for (const lx of [cx - w * 0.15, cx + w * 0.15]) {
      ctx.beginPath();
      ctx.ellipse(lx, cy - h*0.05, w * 0.10, h * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 15, 15, 0.95)';
      ctx.fill();

      // Mask overlay
      if (state.maskOverlay) {
        ctx.fillStyle = organ === 'lung' ? `rgba(6, 182, 212, ${state.maskOpacity})` : organ === 'liver' ? `rgba(16, 185, 129, ${state.maskOpacity})` : `rgba(139, 92, 246, ${state.maskOpacity})`;
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Vertical Spine in Center
    ctx.fillStyle = 'rgba(230, 215, 200, 0.8)';
    ctx.fillRect(cx - w*0.02, cy - h*0.45, w*0.04, h*0.9);
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = 'rgba(3, 7, 18, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - w*0.02, cy - h*0.45 + i * (h*0.05), w*0.04, h*0.045);
    }

    // Trachea Bifurcation
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h*0.42);
    ctx.lineTo(cx, cy - h*0.15);
    ctx.lineTo(cx - w*0.08, cy - h*0.05);
    ctx.moveTo(cx, cy - h*0.15);
    ctx.lineTo(cx + w*0.08, cy - h*0.05);
    ctx.stroke();

    // Rib cross-sections (horizontal arcs)
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = 'rgba(160, 140, 120, 0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy - h*0.35 + i * (h*0.09), w*0.32, -Math.PI*0.08, Math.PI*0.08);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - h*0.35 + i * (h*0.09), w*0.32, Math.PI*0.92, Math.PI*1.08);
      ctx.stroke();
    }

    // Interactive Tumor nodule (coronal location)
    drawLesion(ctx, cx + w * 0.10, cy - h * 0.08, 12);
  }
  else if (state.mprPlane === 'sagittal') {
    // -------------------------------------------------------------
    // SAGITTAL VIEW (Side vertical view)
    // -------------------------------------------------------------
    // Body silhouette side view (left = back, right = chest/front)
    ctx.fillStyle = 'rgba(35, 35, 35, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx - w*0.25, cy - h*0.45); // top spine
    ctx.quadraticCurveTo(cx - w*0.35, cy, cx - w*0.20, cy + h*0.45); // back curve
    ctx.lineTo(cx + w*0.25, cy + h*0.45); // bottom
    ctx.quadraticCurveTo(cx + w*0.30, cy + h*0.1, cx + w*0.28, cy - h*0.2); // front chest bulge
    ctx.quadraticCurveTo(cx + w*0.15, cy - h*0.4, cx - w*0.25, cy - h*0.45); // shoulder/neck
    ctx.closePath();
    ctx.fill();

    // Single central Lung profile
    ctx.beginPath();
    ctx.ellipse(cx + w*0.02, cy - h*0.05, w * 0.16, h * 0.26, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 15, 15, 0.95)';
    ctx.fill();

    // Mask overlay
    if (state.maskOverlay) {
      ctx.fillStyle = organ === 'lung' ? `rgba(6, 182, 212, ${state.maskOpacity})` : organ === 'liver' ? `rgba(16, 185, 129, ${state.maskOpacity})` : `rgba(139, 92, 246, ${state.maskOpacity})`;
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Curved Spine along the back (left)
    ctx.save();
    ctx.translate(cx - w*0.22, cy);
    ctx.rotate(-0.06);
    ctx.fillStyle = 'rgba(230, 215, 200, 0.8)';
    ctx.fillRect(-w*0.02, -h*0.42, w*0.04, h*0.84);
    for (let i = 0; i < 16; i++) {
      ctx.strokeStyle = 'rgba(3, 7, 18, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-w*0.02, -h*0.42 + i * (h*0.052), w*0.04, h*0.048);
    }
    ctx.restore();

    // Heart profile towards front (right)
    ctx.fillStyle = 'rgba(130, 50, 50, 0.8)';
    ctx.beginPath();
    ctx.arc(cx + w*0.08, cy + h*0.12, w*0.08, 0, Math.PI*2);
    ctx.fill();

    // Rib cross section markers (little front ribs)
    ctx.fillStyle = 'rgba(180, 160, 140, 0.5)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(cx + w*0.22 - i*2, cy - h*0.25 + i * (h*0.09), 3, 0, Math.PI*2);
      ctx.fill();
    }

    // Interactive Tumor nodule (sagittal location)
    drawLesion(ctx, cx + w * 0.05, cy - h * 0.05, 12);
  }

  // Common UI overlay info text
  ctx.fillStyle = 'rgba(6, 182, 212, 0.75)';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillText(`WL: ${state.windowLevel} WW: ${state.windowWidth}`, ox + 8, oy + 16);
  ctx.fillText(`PLANE: ${state.mprPlane.toUpperCase()}`, ox + 8, oy + 30);
  ctx.fillText(state.currentMetadata?.modality || 'CT', ox + 8, oy + 44);
  ctx.fillText(state.currentMetadata?.acquisition_date || '2026-05-28', ox + 8, oy + 58);
  ctx.fillText(`${(state.canvasScale * 100).toFixed(0)}%`, ox + w - 40, oy + 16);
}

function drawLesion(ctx, lx, ly, baseRadius) {
  ctx.save();
  const pulse = 1 + 0.08 * Math.sin(Date.now() * 0.0035);
  const r = baseRadius * pulse;

  // Radial glow
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 2);
  glow.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
  glow.addColorStop(0.3, 'rgba(239, 68, 68, 0.5)');
  glow.addColorStop(0.8, 'rgba(239, 68, 68, 0.1)');
  glow.addColorStop(1, 'rgba(239, 68, 68, 0)');

  ctx.beginPath();
  ctx.arc(lx, ly, r * 2, 0, Math.PI*2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Solid center
  ctx.beginPath();
  ctx.arc(lx, ly, r * 0.4, 0, Math.PI*2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.restore();
}

function drawViewerOverlays(ctx, w, h) {
  // Crosshair
  ctx.save();
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
  ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2);
  ctx.stroke();
  ctx.restore();
}

function drawSyntheticScan() {
  const canvas = getEl('scan-preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 400;
  canvas.height = 400;
  drawSyntheticScanOnCanvas(ctx, 400, 400);
}

// ============================================================
// Viewer Controls
// ============================================================
function zoomIn() { state.canvasScale = Math.min(5, state.canvasScale * 1.25); refreshViewerCanvas(); }
function zoomOut() { state.canvasScale = Math.max(0.3, state.canvasScale * 0.8); refreshViewerCanvas(); }
function resetViewerZoom() { state.canvasScale = 1; state.canvasOffsetX = 0; state.canvasOffsetY = 0; refreshViewerCanvas(); }

function refreshViewerCanvas() {
  const canvas = getEl('scan-canvas');
  if (!canvas) return;
  drawViewerScan(canvas.getContext('2d'));
}

function updateWindowLevel(val) {
  state.windowLevel = parseInt(val);
  const lbl = getEl('wl-value');
  if (lbl) lbl.textContent = val;
  refreshViewerCanvas();
}

function updateWindowWidth(val) {
  state.windowWidth = parseInt(val);
  const lbl = getEl('ww-value');
  if (lbl) lbl.textContent = val;
  state.brightness = Math.round(60 + val * 0.8);
  state.contrast = Math.round(60 + (val / 400) * 80);
  refreshViewerCanvas();
}

function toggleViewerGradcam() {
  state.showGradcam = !state.showGradcam;
  document.querySelectorAll('[onclick="toggleViewerGradcam()"]').forEach(b => b.classList.toggle('active', state.showGradcam));
  refreshViewerCanvas();
  showToast(state.showGradcam ? 'Grad-CAM heatmap ON' : 'Grad-CAM heatmap OFF', 'info');
}

// ============================================================
// Premium Extension Controllers (MPR, Ruler, Mask, Co-Pilot)
// ============================================================

function switchMPRPlane(plane) {
  state.mprPlane = plane;
  document.querySelectorAll('.mpr-tab').forEach(b => b.classList.remove('active'));
  const activeBtn = getEl(`mpr-${plane}`);
  if (activeBtn) activeBtn.classList.add('active');

  refreshViewerCanvas();
  showToast(`Switched 2D viewer to ${plane.toUpperCase()} plane`, 'success');
}

function toggleRulerMode() {
  state.rulerMode = !state.rulerMode;
  const btn = getEl('btn-ruler');
  if (btn) btn.classList.toggle('active', state.rulerMode);

  const canvas = getEl('scan-canvas');
  if (canvas) {
    canvas.style.cursor = state.rulerMode ? 'crosshair' : 'default';
  }

  // Update clear button visibility
  updateRulerUI();

  showToast(state.rulerMode ? 'Ruler tool enabled. Click and drag to measure.' : 'Ruler tool disabled.', 'info');
}

function updateRulerUI() {
  const clearBtn = getEl('btn-clear-ruler');
  if (clearBtn) {
    clearBtn.style.display = state.rulerPoints.length > 0 ? 'inline-block' : 'none';
  }
}

function clearRulerMeasurements() {
  state.rulerPoints = [];
  state.activeRulerStart = null;
  state.activeRulerEnd = null;
  updateRulerUI();
  refreshViewerCanvas();
  showToast('Cleared all measurements', 'info');
}

function toggleMaskOverlay() {
  state.maskOverlay = !state.maskOverlay;
  const btn = getEl('btn-overlay-mask');
  if (btn) btn.classList.toggle('active', state.maskOverlay);

  const blendCtrl = getEl('blend-control');
  if (blendCtrl) {
    blendCtrl.style.display = state.maskOverlay ? 'flex' : 'none';
  }

  // Attach slide listener once
  const slider = getEl('blend-opacity-slider');
  if (slider && !slider.dataset.hasListener) {
    slider.dataset.hasListener = 'true';
    slider.addEventListener('input', e => {
      state.maskOpacity = parseFloat(e.target.value) / 100.0;
      setEl('blend-opacity-val', `${e.target.value}%`);
      refreshViewerCanvas();
    });
  }

  refreshViewerCanvas();
  showToast(state.maskOverlay ? 'Direct Segmentation Overlay ON' : 'Direct Segmentation Overlay OFF', 'info');
}

// Co-Pilot Chat Engine
async function sendCopilotQuery() {
  const input = getEl('copilot-chat-input');
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;

  input.value = '';
  appendCopilotMessage(query, 'clinician');

  // Typing indicator
  const typingId = appendCopilotTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        scan_id: state.currentScanId
      })
    });

    // Remove typing indicator
    removeCopilotTypingIndicator(typingId);

    if (!res.ok) throw new Error('Copilot response error');
    const data = await res.json();
    appendCopilotMessage(data.response, 'ai');
  } catch (e) {
    // offline backup simulation
    removeCopilotTypingIndicator(typingId);
    const mockReply = simulateCopilotOfflineResponse(query);
    setTimeout(() => {
      appendCopilotMessage(mockReply, 'ai');
    }, 600);
  }
}

function sendCopilotSuggestion(text) {
  const input = getEl('copilot-chat-input');
  if (input) {
    input.value = text;
    sendCopilotQuery();
  }
}

function appendCopilotMessage(text, sender) {
  const history = getEl('copilot-chat-history');
  if (!history) return;

  const msg = document.createElement('div');
  msg.className = `copilot-message ${sender}`;

  if (sender === 'ai') {
    msg.innerHTML = formatMarkdown(text);
  } else {
    msg.textContent = text;
  }

  history.appendChild(msg);
  history.scrollTop = history.scrollHeight;
}

function appendCopilotTypingIndicator() {
  const history = getEl('copilot-chat-history');
  if (!history) return null;

  const id = 'typing-' + Date.now();
  const indicator = document.createElement('div');
  indicator.className = 'copilot-message ai';
  indicator.id = id;
  indicator.innerHTML = `<span class="status-dot" style="display:inline-block; margin-right:4px;"></span>Analyzing scan structures...`;

  history.appendChild(indicator);
  history.scrollTop = history.scrollHeight;
  return id;
}

function removeCopilotTypingIndicator(id) {
  const el = getEl(id);
  if (el) el.remove();
}

function simulateCopilotOfflineResponse(query) {
  const q = query.toLowerCase();
  const patId = state.currentMetadata?.patient_id || 'PAT-DEMO';
  const modality = state.currentMetadata?.modality || 'CT';
  const findings = state.currentFindings || [
    { disease: 'Lung Nodule', confidence: 94.2, severity: 'moderate', size_cm: 2.1, location: 'right upper lobe' }
  ];
  const primary = findings[0];

  if (q.includes('hello') || q.includes('hi ') || q.includes('hey')) {
    return `Hello! I am your MedAI Clinical Co-Pilot (offline mode). I am synchronized with **Patient ID: ${patId}** (${modality} scan). How can I assist you today?`;
  }
  if (q.includes('finding') || q.includes('abnormality') || q.includes('nodule') || q.includes('tumor') || q.includes('detect')) {
    let resp = `### AI Offline Detection Summary\n\nFor patient **${patId}**, we detected:\n- **Primary Finding:** \`${primary.disease}\`\n- **Location:** \`${primary.location}\`\n- **Confidence:** \`${primary.confidence}%\`\n`;
    if (primary.size_cm > 0) resp += `- **Diameter:** \`${primary.size_cm} cm\`\n`;
    resp += `- **Severity Rating:** **${primary.severity.toUpperCase()}**\n\n`;
    if (findings.length > 1) {
      resp += `### Secondary Findings:\n`;
      findings.slice(1).forEach(f => {
        resp += `- **${f.disease}** in \`${f.location}\` (${f.confidence}% confidence, *${f.severity}*)\n`;
      });
    }
    return resp;
  }
  if (q.includes('recommend') || q.includes('next step') || q.includes('follow up') || q.includes('action')) {
    const recs = {
      critical: `1. **Immediate Specialist Referral:** Urgent clinical consultation is advised.\n2. **Emergency Review:** Correlate with active labs.\n3. **Volumetric Review:** Trace boundaries via 3D viewer.`,
      high: `1. **Consultation:** Refer to clinical specialist within 48 hours.\n2. **Short-Interval Repeat:** Schedule repeat image in 30 days.`,
      moderate: `1. **Clinical Consultation:** Schedule within 2-3 weeks.\n2. **Follow-up Scan:** Repeat high-resolution imaging in 3-6 months to assess interval change.`,
      low: `1. **Routine Observation:** Reschedule repeat imaging in 6-12 months.\n2. **Low Malignancy Risk:** No urgent pathological intervention indicated.`
    };
    return `### Clinical Recommendations (Offline)\n\nBased on findings for **${primary.disease}** (${primary.severity.toUpperCase()} severity):\n\n${recs[primary.severity] || recs.moderate}\n\n*MedAI guidelines conform to Fleischner Society criteria.*`;
  }
  if (q.includes('malignant') || q.includes('benign') || q.includes('cancer')) {
    const risk = primary.severity === 'critical' ? 'High (>85%)' : primary.severity === 'high' ? 'Moderate-to-High (60-85%)' : primary.severity === 'moderate' ? 'Moderate (25-60%)' : 'Low (<25%)';
    return `### Pathological Risk Assessment\n\n- **Abnormality:** ${primary.disease}\n- **AI Estimated Malignancy Risk:** **${risk}**\n- **Diagnostic Confidence:** \`${primary.confidence}%\`\n\n*Note: Explainable AI heatmap highlights boundary markers in red. A histopathologic biopsy is required for definitive diagnostic confirmation.*`;
  }
  if (q.includes('model') || q.includes('swinunetr') || q.includes('accuracy')) {
    return `### MedAI Active Framework (Offline)\n\n- **Segmentation Model:** MONAI SwinUNETR v2.1 Transformer (~96.8% DSC accuracy)\n- **Detection Model:** DenseNet-121-Medical multi-label classifier\n- **Explainability:** Grad-CAM saliency map computing gradient attention boundaries.`;
  }

  return `I have analyzed your query regarding patient **${patId}** and the primary finding **${primary.disease}**.\n\nTo help you better, try asking:
- *'Summarize abnormalities detected.'*
- *'What are the follow-up next steps?'*
- *'What is the malignancy score of the lesion?'*`;
}


function switchOrgan(organ) {
  state.activeOrgan = organ;
  document.querySelectorAll('.organ-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.organ-btn[data-organ="${organ}"]`).forEach(b => b.classList.add('active'));
  switch3DOrgan(organ);
  showToast(`Loaded 3D ${organ} model`, 'success');
}

// ============================================================
// Reports Page
// ============================================================
function renderReport() {
  const container = getEl('report-container');
  if (!container) return;

  if (!state.currentReport) {
    container.innerHTML = `<div class="empty-state">
      <span class="icon">📋</span>
      <h3>No Report Generated</h3>
      <p>Run an AI analysis first to generate a report.</p>
    </div>`;
    return;
  }

  container.innerHTML = `<div class="report-container">${formatMarkdown(state.currentReport)}</div>`;
}

function renderReportFindingsSummary() {
  const container = getEl('report-findings-summary');
  if (!container) return;
  if (!state.currentFindings) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;">Run analysis to see findings.</div>`;
    return;
  }
  container.innerHTML = state.currentFindings.map(f => `
    <div class="finding-item" style="margin-bottom:8px;">
      <div class="finding-info">
        <div class="finding-name">${f.disease}</div>
        <div class="finding-detail">📍 ${f.location}</div>
      </div>
      <div class="finding-confidence">
        <div class="confidence-value" style="font-size:16px;color:${f.severity_color || 'var(--accent-cyan)'}">${f.confidence}%</div>
        <div class="severity-pill ${f.severity}">${f.severity}</div>
      </div>
    </div>`).join('');
}


function downloadReport() {
  if (!state.currentReport) {
    showToast('No report to download.', 'error');
    return;
  }
  const blob = new Blob([state.currentReport], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MedAI_Report_${state.currentScanId || 'DEMO'}_${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Report downloaded!', 'success');
}


// ============================================================
// Monitoring Page
// ============================================================
async function loadMonitoringData() {
  try {
    const res = await fetch(`${API_BASE}/api/monitoring`);
    const data = await res.json();
    updateMonitoringUI(data);
  } catch (e) {
    updateMonitoringUI(getMockMonitoringData());
  }
}

function getMockMonitoringData() {
  return {
    gpu_usage: Math.random() * 45 + 45,
    gpu_memory: Math.random() * 8 + 6,
    gpu_memory_total: 16,
    inference_latency_ms: Math.random() * 400 + 150,
    throughput_scans_per_hour: Math.floor(Math.random() * 100 + 60),
    active_endpoints: Math.floor(Math.random() * 4 + 2),
    model_accuracy: Math.random() * 3 + 95,
    total_inferences_today: Math.floor(Math.random() * 800 + 500),
    error_rate: Math.random() * 0.8 + 0.1,
    uptime_hours: Math.random() * 200 + 200,
    logs: getMockLogs(),
    gpu_history: Array.from({ length: 20 }, () => Math.random() * 50 + 40),
    latency_history: Array.from({ length: 20 }, () => Math.random() * 400 + 150),
  };
}

function getMockLogs() {
  const levels = ['INFO', 'INFO', 'INFO', 'WARN', 'ERROR'];
  const messages = [
    'Scan PAT-78432 inference completed in 342ms',
    'MONAI SwinUNETR model loaded successfully',
    'GPU memory allocation: 11.2GB / 16GB',
    'High latency detected: 678ms > 500ms threshold',
    'Segmentation pipeline completed: lung, liver',
    'Grad-CAM overlay generated for scan PAT-93810',
    'New scan uploaded: PAT-12045 [MRI]',
    'Emergency alert triggered: Brain Tumor confidence > 95%',
    'Batch preprocessing queue: 4 scans pending',
    'Model checkpoint auto-saved',
  ];
  return Array.from({ length: 10 }, (_, i) => ({
    level: levels[Math.floor(Math.random() * levels.length)],
    message: messages[i % messages.length],
    timestamp: new Date(Date.now() - i * 90000).toISOString(),
  }));
}

function updateMonitoringUI(data) {
  animateNumber('mon-gpu-usage', data.gpu_usage, 1, '%');
  animateNumber('mon-gpu-mem', data.gpu_memory, 1, 'GB');
  animateNumber('mon-latency', data.inference_latency_ms, 0, 'ms');
  animateNumber('mon-throughput', data.throughput_scans_per_hour, 0, '/hr');
  animateNumber('mon-accuracy', data.model_accuracy, 1, '%');
  animateNumber('mon-inferences', data.total_inferences_today, 0);
  animateNumber('mon-uptime', data.uptime_hours, 1, 'h');
  animateNumber('mon-error-rate', data.error_rate, 2, '%');

  // GPU Arc
  updateGPUArc(data.gpu_usage);

  // GPU History Chart
  renderMiniChart('gpu-chart', data.gpu_history, 'var(--grad-cyan)');

  // Latency History Chart
  renderMiniChart('latency-chart', data.latency_history, 'var(--grad-purple)');

  // Logs
  const logsHTML = data.logs.map(l => `
    <div class="log-entry">
      <span class="log-timestamp">${l.timestamp.substr(11, 8)}</span>
      <span class="log-level-${l.level.toLowerCase()}">[${l.level}]</span>
      <span class="log-message">${l.message}</span>
    </div>`).join('');
  setEl('log-container', logsHTML);
}

function updateGPUArc(pct) {
  const arc = getEl('gpu-arc-fill');
  if (!arc) return;
  const circumference = 2 * Math.PI * 44;
  const offset = circumference * (1 - pct / 100);
  arc.style.strokeDasharray = circumference;
  arc.style.strokeDashoffset = offset;
  setEl('gpu-arc-text', `${pct.toFixed(1)}%`);
}

function renderMiniChart(id, data, color) {
  const container = getEl(id);
  if (!container) return;
  const max = Math.max(...data);
  container.innerHTML = data.map(v => `
    <div class="chart-bar" style="height:${(v / max * 100)}%;background:${color};" title="${v.toFixed(1)}"></div>
  `).join('');
}

function startMonitoring() {
  loadMonitoringData();
  state.monitoringInterval = setInterval(loadMonitoringData, 4000);
}

function stopMonitoring() {
  if (state.monitoringInterval) {
    clearInterval(state.monitoringInterval);
    state.monitoringInterval = null;
  }
}

// ============================================================
// Timeline Page
// ============================================================
async function loadTimeline() {
  const patientId = state.currentMetadata?.patient_id || 'PAT-DEMO';
  setEl('timeline-patient-id', patientId);
  try {
    const res = await fetch(`${API_BASE}/api/timeline/${patientId}`);
    const data = await res.json();
    renderTimeline(data.timeline, data.summary);
  } catch (e) {
    renderTimeline(getMockTimeline(), null);
  }
}

function getMockTimeline() {
  const mods = ['CT', 'CT', 'MRI', 'CT'];
  const findings = ['Lesion stable', 'Slight growth observed', 'Significant progression', 'Partial regression'];
  let size = 0.8;
  return [2023, 2024, 2025, 2026].map((year, i) => {
    size = parseFloat((size * (1.05 + Math.random() * 0.1)).toFixed(2));
    return {
      date: `${year}-${String(Math.ceil(Math.random() * 12)).padStart(2, '0')}-15`,
      year,
      modality: mods[i],
      lesion_size_cm: size,
      organ_volume_ml: Math.round(300 + i * 18 + Math.random() * 10),
      confidence: parseFloat((88 + Math.random() * 10).toFixed(1)),
      scan_id: `SCAN-${year}-${Math.floor(Math.random() * 9000 + 1000)}`,
      findings: findings[i],
    };
  });
}

function renderTimeline(entries, summary) {
  // Chart data
  const labels = entries.map(e => e.year);
  const sizes = entries.map(e => e.lesion_size_cm);

  const timelineHTML = entries.map((e, i) => `
    <div class="timeline-entry">
      <div class="timeline-dot" style="${i === entries.length - 1 ? 'background:var(--grad-critical)' : ''}"></div>
      <div class="timeline-content">
        <div class="timeline-date">${e.date} · <span class="tag tag-cyan" style="font-size:10px;">${e.modality}</span></div>
        <div class="timeline-title">${e.findings}</div>
        <div class="timeline-stats">
          <div class="timeline-stat">Lesion: <strong>${e.lesion_size_cm} cm</strong></div>
          <div class="timeline-stat">Volume: <strong>${e.organ_volume_ml} mL</strong></div>
          <div class="timeline-stat">Confidence: <strong>${e.confidence}%</strong></div>
        </div>
        <div class="scan-id-tag" style="margin-top:6px;">${e.scan_id}</div>
      </div>
    </div>`).join('');

  setEl('timeline-entries', timelineHTML);

  // Mini size chart
  const maxSz = Math.max(...sizes);
  const chartBars = sizes.map((s, i) => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
      <div style="font-size:10px;color:var(--text-muted);">${s}cm</div>
      <div style="width:100%;border-radius:4px 4px 0 0;background:${i === sizes.length - 1 ? 'var(--grad-critical)' : 'var(--grad-cyan)'};height:${(s / maxSz * 100).toFixed(0)}px;min-height:8px;transition:height 1s;"></div>
      <div style="font-size:11px;color:var(--text-muted);">${labels[i]}</div>
    </div>`).join('');

  setEl('progression-chart', `<div style="display:flex;gap:8px;align-items:flex-end;padding:16px;height:160px;">${chartBars}</div>`);

  if (summary) {
    setEl('timeline-summary', `
      <div class="metadata-table" style="font-size:13px;">
        <tr><td>Total Scans</td><td>${summary.total_scans}</td></tr>
        <tr><td>First Scan</td><td>${summary.first_scan}</td></tr>
        <tr><td>Latest Scan</td><td>${summary.latest_scan}</td></tr>
        <tr><td>Progression</td><td>${summary.progression}</td></tr>
        <tr><td>Treatment Response</td><td>${summary.treatment_response}</td></tr>
      </div>`);
  }
}

// ============================================================
// Emergency Alert
// ============================================================
function showEmergencyAlert(data) {
  const alert = getEl('emergency-alert');
  if (!alert) return;
  setEl('emergency-disease', data.disease);
  setEl('emergency-message', data.message);
  setEl('emergency-confidence', `${data.confidence}%`);
  alert.classList.add('visible');

  // Update alert badge
  const badge = getEl('alert-badge');
  if (badge) badge.style.display = 'block';

  // Auto-dismiss after 12s
  setTimeout(() => dismissAlert(), 12000);
}

function dismissAlert() {
  const alert = getEl('emergency-alert');
  if (alert) alert.classList.remove('visible');
}

function triggerTestAlert() {
  showEmergencyAlert({
    disease: 'Brain Hemorrhage',
    confidence: 97.2,
    message: '⚠️ Brain Hemorrhage detected with 97.2% confidence. Immediate clinical review required.',
  });
}

// ============================================================
// Voice Command Handler
// ============================================================
function handleVoiceCommand(action) {
  const actions = {
    show_tumor: () => { state.showGradcam = true; drawAnalysisCanvas(); showToast('Tumor overlay activated', 'info'); },
    compare: () => navigate('timeline'),
    generate_report: () => { if (!state.currentReport) runAnalysis(); else navigate('reports'); },
    zoom_in: () => { zoomIn(); navigate('viewer'); },
    zoom_out: () => { zoomOut(); navigate('viewer'); },
    '3d_view': () => navigate('viewer'),
    '2d_view': () => navigate('viewer'),
    organ_brain: () => { switchOrgan('brain'); navigate('viewer'); },
    organ_lung: () => { switchOrgan('lung'); navigate('viewer'); },
    organ_liver: () => { switchOrgan('liver'); navigate('viewer'); },
    show_alert: () => triggerTestAlert(),
    nav_home: () => navigate('home'),
    nav_upload: () => navigate('upload'),
    nav_analysis: () => navigate('analysis'),
    nav_monitoring: () => navigate('monitoring'),
    reset_view: () => resetCamera3D(),
    gradcam: () => toggleGradcam(),
    switch_mpr_axial: () => { switchMPRPlane('axial'); navigate('viewer'); },
    switch_mpr_coronal: () => { switchMPRPlane('coronal'); navigate('viewer'); },
    switch_mpr_sagittal: () => { switchMPRPlane('sagittal'); navigate('viewer'); },
    toggle_ruler: () => { toggleRulerMode(); navigate('viewer'); },
    toggle_mask: () => { toggleMaskOverlay(); navigate('viewer'); },
    help: () => showToast('Try: "show tumor", "generate report", "3D view", "zoom in", "axial", "coronal", "sagittal", "ruler", "mask"', 'info', 7000),
  };
  if (actions[action]) actions[action]();
}

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) navigate(page);
    });
  });

  // Upload zone
  initUploadZone();

  // Voice assistant
  VoiceAssistant.init(handleVoiceCommand);
  const voiceBtn = getEl('voice-assistant-btn');
  if (voiceBtn) voiceBtn.addEventListener('click', () => VoiceAssistant.startListening());

  // Window level sliders
  const wlSlider = getEl('wl-slider');
  const wwSlider = getEl('ww-slider');
  if (wlSlider) wlSlider.addEventListener('input', e => updateWindowLevel(e.target.value));
  if (wwSlider) wwSlider.addEventListener('input', e => updateWindowWidth(e.target.value));

  // Canvas init on viewer tab
  document.querySelector('[data-page="viewer"]')?.addEventListener('click', () => {
    setTimeout(initViewerCanvas, 200);
  });

  // Load home
  navigate('home');

  // Load Three.js dynamically
  loadThreeJS();

  // Show welcome toast
  setTimeout(() => showToast('Welcome to MedAI Platform 🩺', 'success'), 800);

  // Simulate random alert after 20s (demo)
  setTimeout(() => {
    if (Math.random() > 0.5) triggerTestAlert();
  }, 20000);
});

function loadThreeJS() {
  if (typeof THREE !== 'undefined') return;
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  script.onload = () => console.log('Three.js loaded');
  document.head.appendChild(script);
}
