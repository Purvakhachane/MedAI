// ============================================================
// voice.js - Web Speech API Voice Assistant
// ============================================================

const VoiceAssistant = (() => {
  let recognition = null;
  let synthesis = window.speechSynthesis;
  let isListening = false;
  let onCommandCallback = null;

  const COMMANDS = [
    { patterns: ['show tumor', 'tumor boundaries', 'show boundaries', 'highlight tumor'], action: 'show_tumor' },
    { patterns: ['compare', 'compare scan', 'comparison', 'show comparison'], action: 'compare' },
    { patterns: ['generate report', 'create report', 'report', 'make report'], action: 'generate_report' },
    { patterns: ['zoom in', 'zoom'], action: 'zoom_in' },
    { patterns: ['zoom out', 'zoom back'], action: 'zoom_out' },
    { patterns: ['3d', 'three d', '3d view', 'three dimensional', 'three d view'], action: '3d_view' },
    { patterns: ['2d', 'two d', '2d view', 'scan view'], action: '2d_view' },
    { patterns: ['brain', 'show brain'], action: 'organ_brain' },
    { patterns: ['lung', 'show lung', 'lungs', 'show lungs'], action: 'organ_lung' },
    { patterns: ['liver', 'show liver'], action: 'organ_liver' },
    { patterns: ['alert', 'emergency', 'show alert', 'check alert'], action: 'show_alert' },
    { patterns: ['home', 'dashboard', 'go home', 'go to home'], action: 'nav_home' },
    { patterns: ['upload', 'upload scan', 'go to upload'], action: 'nav_upload' },
    { patterns: ['analysis', 'analyze', 'go to analysis'], action: 'nav_analysis' },
    { patterns: ['monitoring', 'monitor', 'gpu', 'go to monitoring'], action: 'nav_monitoring' },
    { patterns: ['reset', 'reset view', 'reset camera'], action: 'reset_view' },
    { patterns: ['gradcam', 'heatmap', 'show heatmap', 'explainable ai', 'attention map'], action: 'gradcam' },
    { patterns: ['axial', 'axial view', 'axial plane'], action: 'switch_mpr_axial' },
    { patterns: ['coronal', 'coronal view', 'coronal plane'], action: 'switch_mpr_coronal' },
    { patterns: ['sagittal', 'sagittal view', 'sagittal plane'], action: 'switch_mpr_sagittal' },
    { patterns: ['ruler', 'measure', 'measure lesion', 'pacs ruler'], action: 'toggle_ruler' },
    { patterns: ['mask', 'overlay mask', 'tissue boundaries', 'boundaries'], action: 'toggle_mask' },
    { patterns: ['help', 'what can you do', 'commands'], action: 'help' },
  ];

  const RESPONSES = {
    show_tumor: ["Highlighting tumor boundaries now.", "Activating tumor overlay.", "Tumor regions highlighted."],
    compare: ["Switching to comparison view.", "Loading comparison mode.", "Bringing up scan comparison."],
    generate_report: ["Generating AI medical report now.", "Running report generation pipeline.", "Creating your diagnostic report."],
    zoom_in: ["Zooming in.", "Enlarging view."],
    zoom_out: ["Zooming out.", "Resetting zoom level."],
    '3d_view': ["Switching to 3D reconstruction.", "Loading 3D volume view.", "Activating three-dimensional viewer."],
    '2d_view': ["Switching to 2D scan viewer.", "Loading axial scan view."],
    organ_brain: ["Loading brain model.", "Rendering 3D brain scan."],
    organ_lung: ["Loading lung model.", "Rendering lung volume reconstruction."],
    organ_liver: ["Loading liver model.", "Rendering liver segmentation."],
    show_alert: ["Checking emergency alerts.", "Reviewing critical findings."],
    nav_home: ["Navigating to home dashboard.", "Going to the main dashboard."],
    nav_upload: ["Navigating to scan upload.", "Opening the upload interface."],
    nav_analysis: ["Navigating to analysis page.", "Opening AI analysis results."],
    nav_monitoring: ["Navigating to monitoring.", "Opening GPU and inference metrics."],
    reset_view: ["Resetting camera view.", "View reset complete."],
    gradcam: ["Activating Grad-CAM attention map.", "Overlaying explainability heatmap."],
    switch_mpr_axial: ["Switching to Axial projection view.", "Loading transverse axial cross-section."],
    switch_mpr_coronal: ["Switching to Coronal vertical projection view.", "Loading frontal coronal cross-section."],
    switch_mpr_sagittal: ["Switching to Sagittal side projection view.", "Loading side sagittal cross-section."],
    toggle_ruler: ["Ruler measurement mode toggled.", "Ruler tool status updated."],
    toggle_mask: ["Segmentation mask overlay status changed.", "Organ boundaries mask status updated."],
    help: [
      "I can help you with: show tumor, compare scans, generate report, navigate pages, zoom controls, 3D organ views, and monitoring. Just say your command!"
    ],
    unknown: [
      "I didn't catch that, please try again.",
      "Could you repeat that command?",
      "Sorry, I didn't understand. Try: show tumor, generate report, or navigate to a page."
    ],
  };

  function speak(text) {
    if (!synthesis) return;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 0.85;

    // Pick a voice - prefer a female English voice
    const voices = synthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria') || v.name.includes('Karen'))
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
    if (preferred) utterance.voice = preferred;

    synthesis.speak(utterance);
  }

  function matchCommand(transcript) {
    const lower = transcript.toLowerCase().trim();
    for (const cmd of COMMANDS) {
      for (const pattern of cmd.patterns) {
        if (lower.includes(pattern)) {
          return cmd.action;
        }
      }
    }
    return null;
  }

  function getResponse(action) {
    const responses = RESPONSES[action] || RESPONSES.unknown;
    return responses[Math.floor(Math.random() * responses.length)];
  }

  function init(onCommand) {
    onCommandCallback = onCommand;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported in this browser.');
      return false;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      isListening = true;
      updateVoiceUI(true, 'Listening...');
    };

    recognition.onresult = (event) => {
      const results = event.results;
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < results.length; i++) {
        const transcript = results[i][0].transcript;
        if (results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      // Update transcript display
      const display = interim || final;
      updateVoiceUI(true, 'Listening...', display);

      if (final) {
        const action = matchCommand(final);
        const response = getResponse(action || 'unknown');
        speak(response);
        updateVoiceUI(true, response, `"${final}"`);

        if (action && onCommandCallback) {
          setTimeout(() => onCommandCallback(action), 300);
        }

        setTimeout(() => stopListening(), 2500);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      stopListening();
    };

    recognition.onend = () => {
      if (isListening) {
        // Don't auto-restart; let user click again
        isListening = false;
        updateVoiceUI(false);
      }
    };

    return true;
  }

  function startListening() {
    if (!recognition) {
      const ok = init(onCommandCallback);
      if (!ok) {
        showToast('Speech recognition not supported in this browser.', 'error');
        return;
      }
    }
    if (isListening) {
      stopListening();
      return;
    }
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }

  function stopListening() {
    isListening = false;
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    updateVoiceUI(false);
  }

  function updateVoiceUI(active, status = '', transcript = '') {
    const btn = document.getElementById('voice-assistant-btn');
    const overlay = document.getElementById('voice-overlay');
    const statusEl = document.getElementById('voice-status');
    const transcriptEl = document.getElementById('voice-transcript');

    if (btn) btn.classList.toggle('listening', active);
    if (overlay) overlay.classList.toggle('visible', active);
    if (statusEl) statusEl.textContent = status;
    if (transcriptEl) transcriptEl.textContent = transcript;
  }

  return { init, startListening, stopListening, speak, isListening: () => isListening };
})();
