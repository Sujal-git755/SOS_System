// SafeLink Core Application & State Controller
(function () {
  "use strict";

  const evidenceStorageKey = "safelink-private-evidence-v1";

  function loadSavedEvidence() {
    try {
      const saved = JSON.parse(localStorage.getItem(evidenceStorageKey) || "[]");
      return Array.isArray(saved) ? saved.filter(item => item && typeof item === "object") : [];
    } catch (error) {
      console.error("Unable to load private evidence:", error);
      return [];
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  // Application State
  const AppState = {
    currentScreen: "home", // welcome, home, journey, map, checkin, sos, safecircle, helpers, profile, camera, assistant
    secondaryScreen: "helper-alert", // for dual view
    viewMode: "single", // "single", "dual", "admin", "presentation"
    activeJourney: {
      isActive: false,
      startPoint: "Campus Central Library",
      destination: "Green Park Residence",
      etaMinutes: 22,
      remainingSeconds: 22 * 60,
      startedAt: null,
      isOverdue: false,
      selectedContacts: ["Ronak", "Kabir Sharma"],
      approximateLocationOnly: true,
      intervalId: null
    },
    activeHelpRequest: {
      isActive: false,
      type: "Safety Concern",
      note: "Uncomfortable with unfamiliar group lingering nearby",
      location: "South Campus Quad Path",
      requestedAt: null,
      assignedHelper: null, // will become Rahul Verma
      status: "idle", // "idle", "broadcast", "accepted", "resolved"
      shareApproximateLocation: true
    },
    sosActive: false,
    soundEnabled: true,
    theme: "dark",
    evidence: loadSavedEvidence(),
    assistantTranscript: "",
    assistantResponse: "Hi, I’m your Safe Assistant. Tell me what you need, or try “I feel unsafe.”",
    assistantConfirmation: false,
    assistantConfirmationAction: "",
    cameraFacing: "environment",
    cameraFlashOn: false,
    demoCameraPreviewOnly: false,
    safetyRecording: {
      isActive: false,
      isPaused: false,
      microphoneEnabled: true,
      startedAt: null,
      elapsedBeforePause: 0,
      statusMessage: "",
      locationSharing: "off",
      sosSnapshotStatus: ""
    },
    helpers: [...SafeLinkData.verifiedHelpers],
    safeCircle: [...SafeLinkData.safeCircle],
    adminRequests: [...SafeLinkData.adminRequests],
    adminStats: { ...SafeLinkData.adminStats }
  };

  // Helper references
  window.AppState = AppState;
  let demoScenarioTimeouts = [];

  // Initialize App
  function init() {
    setupEventListeners();
    setupDemoControls();
    setupMapInteraction();
    renderCurrentViews();
    startClock();
  }

  // Ticking system clock for status bar
  function startClock() {
    function update() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.querySelectorAll(".phone-clock").forEach(el => el.textContent = timeStr);
    }
    update();
    setInterval(update, 10000);
  }

  // Event Listeners for UI
  function setupEventListeners() {
    document.addEventListener("visibilitychange", () => {
      if (!AppState.safetyRecording.isActive) return;
      if (document.hidden) {
        AppState.safetyRecording.statusMessage = "Background camera access depends on your device and browser. Recording may pause while this app is hidden.";
      } else if (cameraStream && cameraStream.getVideoTracks().some(track => track.muted)) {
        AppState.safetyRecording.statusMessage = "Your device is still restricting camera access in the background. Keep SafeLink visible to continue.";
      } else {
        AppState.safetyRecording.statusMessage = "";
      }
      updateRecordingIndicators();
    });

    document.getElementById("recording-review-save").addEventListener("click", saveStoppedRecording);
    document.getElementById("recording-review-discard").addEventListener("click", discardStoppedRecording);
    document.getElementById("recording-review-share").addEventListener("change", event => {
      const picker = document.getElementById("recording-review-contacts");
      picker.innerHTML = AppState.safeCircle.map(contact => `<label><input type="checkbox" value="${escapeHtml(contact.id)}"> ${escapeHtml(contact.name)}</label>`).join("");
      picker.hidden = !event.target.checked;
    });

    // Navigation items (Single phone view)
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const targetScreen = item.getAttribute("data-screen");
        if (targetScreen) {
          SafeLinkAudio.playClick();
          navigateTo(targetScreen);
        }
      });
    });

    // SOS Slider / Button Handlers
    const sosTrigger = document.getElementById("home-sos-btn");
    if (sosTrigger) {
      sosTrigger.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        openSOSScreen();
      });
    }

    // Modal Close buttons
    document.querySelectorAll(".modal-close-trigger").forEach(btn => {
      btn.addEventListener("click", () => {
        closeAllModals();
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        AppState.theme = AppState.theme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", AppState.theme);
        themeBtn.innerHTML = AppState.theme === "dark"
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Light`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark`;
      });
    }

    // Sound Toggle
    const soundBtn = document.getElementById("sound-toggle-btn");
    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        AppState.soundEnabled = SafeLinkAudio.toggleSound();
        soundBtn.innerHTML = AppState.soundEnabled
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Sound: ON`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg> Sound: OFF`;
      });
    }
  }

  // Navigation Controller
  function navigateTo(screenId, isSecondary = false) {
    if (isSecondary) {
      AppState.secondaryScreen = screenId;
    } else {
      if (AppState.currentScreen === "camera" && screenId !== "camera") stopCameraPreview();
      if (AppState.currentScreen === "assistant" && screenId !== "assistant") stopVoiceRecognition();
      AppState.currentScreen = screenId;
      // Update active nav tab
      document.querySelectorAll(".bottom-nav .nav-item").forEach(item => {
        if (item.getAttribute("data-screen") === screenId) {
          item.classList.add("active");
        } else {
          item.classList.remove("active");
        }
      });
    }
    renderCurrentViews();
  }

  window.navigateTo = navigateTo;

  // View Mode Switcher
  function setViewMode(mode) {
    AppState.viewMode = mode;
    SafeLinkAudio.playClick();

    document.querySelectorAll(".view-toggle-btn").forEach(btn => {
      if (btn.getAttribute("data-mode") === mode) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    const singleDevice = document.getElementById("primary-device-container");
    const secondaryDevice = document.getElementById("secondary-device-container");
    const adminContainer = document.getElementById("admin-view-stage");

    if (mode === "single") {
      singleDevice.style.display = "flex";
      secondaryDevice.style.display = "none";
      adminContainer.style.display = "none";
    } else if (mode === "dual") {
      singleDevice.style.display = "flex";
      secondaryDevice.style.display = "flex";
      adminContainer.style.display = "none";
    } else if (mode === "admin") {
      singleDevice.style.display = "none";
      secondaryDevice.style.display = "none";
      adminContainer.style.display = "block";
      renderAdminDashboard();
    }
  }

  window.setViewMode = setViewMode;

  // Setup Top Controls for Judge Demo
  function setupDemoControls() {
    // Mode Buttons
    document.querySelectorAll(".view-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode");
        setViewMode(mode);
      });
    });

    // Pitch Presentation Modal Triggers
    const pitchBtn = document.getElementById("open-pitch-deck-btn");
    const pitchModal = document.getElementById("pitch-presentation-modal");
    const closePitchBtn = document.getElementById("close-pitch-modal-btn");

    if (pitchBtn && pitchModal) {
      pitchBtn.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        pitchModal.classList.add("active");
      });
    }

    if (closePitchBtn && pitchModal) {
      closePitchBtn.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        pitchModal.classList.remove("active");
      });
    }

    // Quick Scenario 1: Complete Live Demo Walkthrough
    const scenario1Btn = document.getElementById("scenario-1-btn");
    if (scenario1Btn) {
      scenario1Btn.addEventListener("click", () => {
        runFullDemoScenario();
      });
    }

    // Quick Scenario 2: Missed Check-in
    const scenario2Btn = document.getElementById("scenario-2-btn");
    if (scenario2Btn) {
      scenario2Btn.addEventListener("click", () => {
        runMissedCheckinScenario();
      });
    }

    // Quick Scenario 3: Instant SOS
    const scenario3Btn = document.getElementById("scenario-3-btn");
    if (scenario3Btn) {
      scenario3Btn.addEventListener("click", () => {
        openSOSScreen();
      });
    }

    // Fluid / Wide View Toggle
    const fluidToggleBtn = document.getElementById("fluid-mode-toggle-btn");
    const fluidBtnText = document.getElementById("fluid-mode-btn-text");
    if (fluidToggleBtn) {
      fluidToggleBtn.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        const isFluid = document.body.classList.toggle("fluid-layout-mode");
        if (fluidBtnText) {
          fluidBtnText.textContent = isFluid ? "Phone Frame" : "Wide View";
        }
        fluidToggleBtn.classList.toggle("active", isFluid);
        showToast(isFluid ? "Switched to Fluid Responsive View" : "Switched to Mobile Phone Mockup");
      });
    }

    // Reset Demo State
    const resetBtn = document.getElementById("reset-demo-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetAppDemoState();
      });
    }
  }

  // Reset entire state cleanly
  function resetAppDemoState() {
    SafeLinkAudio.playClick();
    stopRecordingForReset();
    if (AppState.currentScreen === "camera") stopCameraPreview();
    if (AppState.currentScreen === "assistant") stopVoiceRecognition();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    AppState.assistantTranscript = "";
    AppState.assistantResponse = "Hi, I’m your Safe Assistant. Tell me what you need, or try “I feel unsafe.”";
    AppState.assistantConfirmation = false;
    AppState.assistantConfirmationAction = "";
    isMicrophoneMuted = false;
    voiceInputUnavailable = false;
    AppState.cameraFacing = "environment";
    AppState.cameraFlashOn = false;
    AppState.demoCameraPreviewOnly = false;
    demoScenarioTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    demoScenarioTimeouts = [];
    if (AppState.activeJourney.intervalId) {
      clearInterval(AppState.activeJourney.intervalId);
    }
    AppState.activeJourney.isActive = false;
    AppState.activeJourney.isOverdue = false;
    AppState.activeHelpRequest.isActive = false;
    AppState.activeHelpRequest.status = "idle";
    AppState.activeHelpRequest.assignedHelper = null;
    AppState.sosActive = false;
    AppState.currentScreen = "home";
    AppState.secondaryScreen = "helper-alert";
    closeAllModals();
    renderCurrentViews();
    showToast("Demo state reset successfully. Ready for demonstration.");
  }

  function stopRecordingForReset() {
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = null;
    if (cameraRecorder && cameraRecorder.state !== "inactive") {
      cameraRecorder.ondataavailable = null;
      cameraRecorder.onstop = null;
      cameraRecorder.stop();
    }
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    cameraRecorder = null;
    cameraStream = null;
    cameraRecordingChunks = [];
    recordedVideoSegments = [];
    pendingStoppedRecording = null;
    AppState.safetyRecording.isActive = false;
    AppState.safetyRecording.isPaused = false;
    AppState.safetyRecording.microphoneEnabled = false;
    AppState.safetyRecording.startedAt = null;
    AppState.safetyRecording.elapsedBeforePause = 0;
    AppState.safetyRecording.statusMessage = "";
    AppState.safetyRecording.sosSnapshotStatus = "";
  }

  window.resetAppDemoState = resetAppDemoState;

  // Render the current views based on state
  function renderCurrentViews() {
    renderPrimaryViewport();
    renderSecondaryViewport();
    renderDynamicNotch();
  }

  // Render Dynamic Island / Notch status
  function renderDynamicNotch() {
    const notchPrimary = document.getElementById("primary-notch");
    const notchText = document.getElementById("primary-notch-text");

    if (AppState.sosActive) {
      notchPrimary.classList.add("expanded");
      notchText.textContent = "🚨 SOS ACTIVE";
      notchText.style.display = "inline-block";
    } else if (AppState.activeHelpRequest.isActive) {
      notchPrimary.classList.add("expanded");
      if (AppState.activeHelpRequest.status === "accepted") {
        notchText.textContent = "🛡️ Helper Responding";
      } else {
        notchText.textContent = "📡 Alert Broadcast";
      }
      notchText.style.display = "inline-block";
    } else if (AppState.activeJourney.isActive) {
      notchPrimary.classList.add("expanded");
      notchText.textContent = AppState.activeJourney.isOverdue ? "⚠️ Check-in Overdue" : "📍 Journey Active";
      notchText.style.display = "inline-block";
    } else {
      notchPrimary.classList.remove("expanded");
      notchText.style.display = "none";
    }
  }

  // Render Primary Viewport (User Aanya)
  function renderPrimaryViewport() {
    const container = document.getElementById("primary-viewport-content");
    if (!container) return;

    let html = "";

    switch (AppState.currentScreen) {
      case "welcome":
        html = renderWelcomeScreen();
        break;
      case "home":
        html = renderHomeScreen();
        break;
      case "journey":
        html = renderJourneyScreen();
        break;
      case "map":
        html = renderSafetyMapScreen();
        break;
      case "checkin":
        html = renderCheckInTimerScreen();
        break;
      case "sos":
        html = renderSOSScreen();
        break;
      case "safecircle":
        html = renderSafeCircleScreen();
        break;
      case "helpers":
        html = renderHelperNetworkScreen();
        break;
      case "profile":
        html = renderProfileScreen();
        break;
      case "camera":
        html = renderSafetyCameraScreen();
        break;
      case "assistant":
        html = renderVoiceAssistantScreen();
        break;
      case "help-response":
        html = renderHelpResponseScreen();
        break;
      default:
        html = renderHomeScreen();
    }

    container.innerHTML = html;
    container.closest(".device-screen").classList.toggle("camera-mode", AppState.currentScreen === "camera");
    container.closest(".device-screen").classList.toggle("recording-active", AppState.safetyRecording.isActive);
    if (AppState.currentScreen === "camera") syncCameraPreviewUI();
    container.classList.remove("screen-fade-enter");
    void container.offsetWidth; // force DOM reflow
    container.classList.add("screen-fade-enter");
    attachDynamicViewListeners();
    updateRecordingIndicators();
  }

  // Render Secondary Viewport (Helper Rahul in Dual Mode)
  function renderSecondaryViewport() {
    const container = document.getElementById("secondary-viewport-content");
    if (!container) return;

    let html = "";
    if (AppState.activeHelpRequest.isActive) {
      if (AppState.activeHelpRequest.status === "accepted") {
        html = renderHelperActiveResponseView();
      } else {
        html = renderHelperIncomingAlertView();
      }
    } else {
      html = renderHelperIdleView();
    }

    container.innerHTML = html;
    attachHelperViewListeners();
  }

  // -------------------------------------------------------------
  // SCREEN 1 — WELCOME / LOGIN
  // -------------------------------------------------------------
  function renderWelcomeScreen() {
    return `
      <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; padding: 24px 8px 16px;">
        <div style="text-align: center; margin-top: 40px;">
          <div class="welcome-mark">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <h1 style="font-family: var(--font-heading); font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px;">SafeLink</h1>
          <p style="color: var(--accent-cyan); font-weight: 600; font-size: 15px; margin-bottom: 8px;">“When help is nearby, help is faster.”</p>
          <p style="color: var(--text-muted); font-size: 12px; max-width: 280px; margin: 0 auto; line-height: 1.4;">
            Community-powered personal safety network for students, commuters, and travelers.
          </p>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; margin: 20px 0;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <span>Prototype Quick Access</span>
            <span style="color: var(--accent-teal);">● No Auth Required</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button class="btn-primary" id="btn-login-student" style="width: 100%;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Login as Student (Aanya)
            </button>
            <button class="btn-secondary" id="btn-login-helper" style="width: 100%;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Login as Verified Helper (Rahul)
            </button>
            <button class="btn-secondary" id="btn-login-admin" style="width: 100%;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              Admin Dispatch Console
            </button>
          </div>
        </div>

        <div style="text-align: center; font-size: 11px; color: var(--text-dim);">
          SafeLink v1.0 • College Competition Showcase Build
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 2 — HOME DASHBOARD
  // -------------------------------------------------------------
  function renderHomeScreen() {
    const isJourneyActive = AppState.activeJourney.isActive;
    const isHelpActive = AppState.activeHelpRequest.isActive;

    return `
      <!-- App Header -->
      <div class="app-header">
        <div class="user-snippet">
          <div class="user-avatar">${SafeLinkData.currentUser.avatar}</div>
          <div class="user-info-text">
            <h3>SafeLink</h3>
            <p>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Stay connected. Stay safer.
            </p>
          </div>
        </div>
        <div class="header-icons">
          <button class="icon-btn" id="header-map-btn" title="Open Safety Map">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
          </button>
          <button class="icon-btn" id="header-privacy-btn" title="Privacy Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </button>
        </div>
      </div>

      <!-- Active Journey State Banner (if active) -->
      ${isJourneyActive ? `
        <div class="active-journey-banner">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="stat-pill teal">● Live Journey</span>
              <span style="font-size: 11px; font-weight: 700; color: var(--accent-teal);">College → Home</span>
            </div>
            <div style="font-size: 13px; font-weight: 800; color: var(--accent-cyan);" id="home-eta-countdown">
              ETA: ${Math.ceil(AppState.activeJourney.remainingSeconds / 60)} min
            </div>
          </div>
          
          <div class="journey-progress-track">
            <div class="journey-progress-bar" style="width: 58%;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted);">
            <span>Shared with 3 Safe Circle members</span>
            <button style="background: transparent; border: none; color: var(--accent-cyan); font-weight: 700; cursor: pointer;" id="view-active-journey-btn">Manage →</button>
          </div>
        </div>
      ` : `
        <!-- Idle Status Card -->
        <div class="card status-guard-card">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 10px; height: 10px; border-radius: 50%; background: var(--accent-teal); box-shadow: 0 0 8px var(--accent-teal);"></div>
              <div>
                <div style="font-size: 13px; font-weight: 700;">Location Guard Active</div>
                <div style="font-size: 11px; color: var(--text-muted);">Privacy zone enabled • Approx 250m mask</div>
              </div>
            </div>
            <span class="stat-pill teal">Protected</span>
          </div>
        </div>
      `}

      <!-- Interactive SafeScore & Daily Streak Card -->
      <div class="safescore-card">
        <div class="safescore-content">
          <div class="safescore-left">
            <div class="safescore-ring-wrapper">
              <svg class="safescore-ring-svg" viewBox="0 0 60 60">
                <circle class="safescore-ring-bg" cx="30" cy="30" r="25" />
                <circle class="safescore-ring-fill" cx="30" cy="30" r="25" />
              </svg>
              <div class="safescore-number">98%</div>
            </div>
            <div class="safescore-details">
              <h4>
                SafeScore Index
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </h4>
              <p>Campus Quad: Low Risk • High Coverage</p>
              <div class="streak-badge">
                <span>🔥 14-Day Safe Commute Streak</span>
              </div>
            </div>
          </div>
          <button class="btn-secondary" id="btn-daily-checkin" style="padding: 6px 10px; font-size: 10px; border-color: rgba(6, 214, 160, 0.4); color: var(--accent-teal);" title="Record Daily Safe Check-In">
            Check-In
          </button>
        </div>
      </div>

      <!-- Quick Safety Toolkit -->
      <div class="quick-toolkit-section">
        <div class="toolkit-header">
          <div class="toolkit-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Instant Safety Tools
          </div>
          <span style="font-size: 10px; color: var(--accent-cyan); font-weight: 600;">1-Tap Access</span>
        </div>
        <div class="toolkit-scroll">
          <div class="tool-chip" id="tool-fake-call">
            <span class="tool-icon">📞</span>
            <div class="tool-chip-info">
              <div class="tool-chip-name">Fake Call</div>
              <div class="tool-chip-desc">Escape awkward spot (5s)</div>
            </div>
          </div>
          <div class="tool-chip" id="tool-safety-siren" style="border-color: rgba(255, 51, 75, 0.35);">
            <span class="tool-icon">📢</span>
            <div class="tool-chip-info">
              <div class="tool-chip-name" style="color: var(--accent-red);">Safety Siren</div>
              <div class="tool-chip-desc">Loud acoustic strobe</div>
            </div>
          </div>
          <div class="tool-chip" id="tool-buddy-walk">
            <span class="tool-icon">🚶</span>
            <div class="tool-chip-info">
              <div class="tool-chip-name">Buddy Walk</div>
              <div class="tool-chip-desc">Virtual walk companion</div>
            </div>
          </div>
          <div class="tool-chip" id="tool-battery-guard">
            <span class="tool-icon">🔋</span>
            <div class="tool-chip-info">
              <div class="tool-chip-name">Battery Guard</div>
              <div class="tool-chip-desc">88% • Auto-ping active</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Assistance Request Alert Bar (if requested) -->
      ${isHelpActive ? `
        <div class="card" style="border-color: var(--accent-red); background: rgba(255, 51, 75, 0.1); margin-bottom: 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background: var(--accent-red); animation: pulse 1s infinite;"></div>
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #fff;">Assistance Request Active</div>
                <div style="font-size: 11px; color: var(--text-secondary);">
                  ${AppState.activeHelpRequest.status === "accepted" ? "Rahul V. (Verified Helper) is responding" : "Alert shown in 7 nearby helper demo views"}
                </div>
              </div>
            </div>
            <button class="btn-primary" style="padding: 6px 12px; font-size: 11px;" id="view-active-response-btn">
              View
            </button>
          </div>
        </div>
      ` : ""}

      <!-- Two Large Action Buttons (START JOURNEY & REQUEST HELP) -->
      <div class="hero-action-grid">
        <button class="hero-action-btn" id="btn-start-journey">
          <div class="btn-icon-box cyan">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div>
            <h4>START JOURNEY</h4>
            <p>Route tracker with automated check-in timer</p>
          </div>
        </button>

        <button class="hero-action-btn request-help" id="btn-request-help">
          <div class="btn-icon-box amber">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </div>
          <div>
            <h4>REQUEST HELP</h4>
            <p>Alert nearby verified helpers & Safe Circle</p>
          </div>
        </button>
      </div>

      <!-- Prominent Emergency SOS Button -->
      <div class="sos-container">
        <button class="sos-trigger-btn" id="home-sos-btn">
          <span>SOS</span>
        </button>
        <div class="sos-label">EMERGENCY ASSISTANCE</div>
      </div>

      <div class="safety-feature-grid">
        <button class="safety-feature-card camera-feature-card" id="home-safety-camera-btn">
          <span class="safety-feature-icon">◉</span>
          <span class="safety-feature-copy"><strong>Safety Camera</strong><small>Capture and save private evidence</small></span>
          <span class="safety-feature-arrow">→</span>
        </button>
        <button class="safety-feature-card assistant-feature-card" id="home-safe-assistant-btn">
          <span class="safety-feature-icon">✳</span>
          <span class="safety-feature-copy"><strong>Safe Assistant</strong><small>Voice help, check-ins and quick actions</small></span>
          <span class="safety-feature-arrow">→</span>
        </button>
      </div>

      <!-- Safe Circle Status Card -->
      <div class="card">
        <div class="card-title-row">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Safe Circle
          </div>
          <span class="stat-pill blue">4 Connected</span>
        </div>
        <div class="circle-row">
          ${AppState.safeCircle.map(c => `
            <div class="circle-avatar-wrap" title="${c.name} (${c.relation})">
              <div class="circle-avatar" style="background: ${c.color};">
                ${c.initials}
                <div class="status-badge"></div>
              </div>
              <div class="circle-name">${c.name.split(" ")[0]}</div>
            </div>
          `).join("")}
          <div class="circle-add-btn" id="btn-quick-manage-circle" title="Manage Contacts">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
        </div>
      </div>

      <!-- Nearby Verified Helpers & Safety Points -->
      <div class="card">
        <div class="card-title-row">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Community Safety Mesh
          </div>
          <span class="stat-pill teal">Active</span>
        </div>
        
        <div class="mesh-stat-grid">
          <div class="mesh-stat" id="home-helpers-link">
            <div style="font-size: 22px; font-weight: 800; color: var(--accent-cyan); font-family: var(--font-heading); letter-spacing: -0.04em;">7</div>
            <div style="font-size: 11px; font-weight: 700; color: #fff;">Verified Helpers</div>
            <div style="font-size: 10px; color: var(--accent-teal);">3 available now</div>
          </div>

          <div class="mesh-stat" id="home-safepoints-link">
            <div style="font-size: 22px; font-weight: 800; color: var(--accent-teal); font-family: var(--font-heading); letter-spacing: -0.04em;">4</div>
            <div style="font-size: 11px; font-weight: 700; color: #fff;">Nearby Safe Points</div>
            <div style="font-size: 10px; color: var(--text-muted);">Police, ER & Desk</div>
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 3 — START JOURNEY & ACTIVE JOURNEY
  // -------------------------------------------------------------
  function renderJourneyScreen() {
    const isJourneyActive = AppState.activeJourney.isActive;

    if (isJourneyActive) {
      // Journey Active View
      const remainingMin = Math.ceil(AppState.activeJourney.remainingSeconds / 60);
      return `
        <div class="app-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="icon-btn" id="journey-back-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <h3 style="font-size: 17px; font-weight: 700;">Active Journey</h3>
          </div>
          <span class="stat-pill teal">● Live Sync</span>
        </div>

        <div class="card" style="border-color: rgba(6, 214, 160, 0.4); background: linear-gradient(145deg, rgba(6, 214, 160, 0.08), rgba(19, 33, 68, 0.8));">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <div style="font-size: 12px; text-transform: uppercase; color: var(--accent-teal); font-weight: 700;">Journey Active</div>
              <h2 style="font-size: 20px; font-weight: 800; margin: 4px 0;">College → Home</h2>
              <p style="font-size: 12px; color: var(--text-muted);">From ${AppState.activeJourney.startPoint} to ${AppState.activeJourney.destination}</p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: var(--text-muted);">Estimated Arrival</div>
              <div style="font-size: 22px; font-weight: 800; color: var(--accent-cyan); font-family: var(--font-heading);" id="journey-live-eta">
                ETA: ${remainingMin} min
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="journey-progress-track">
            <div class="journey-progress-bar" style="width: 55%;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 14px;">
            <span>College Gate (Started 12 min ago)</span>
            <span>Home (ETA 4:25 PM)</span>
          </div>

          <!-- Privacy status row -->
          <div style="background: rgba(255,255,255,0.04); border-radius: var(--radius-xs); padding: 8px 10px; font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Controlled Location Sharing: Approximate corridor only</span>
          </div>

          <!-- 4 Required Buttons -->
          <div class="journey-buttons-row">
            <button class="btn-secondary" id="btn-journey-camera" style="border-color: rgba(72, 202, 228, 0.4); color: var(--accent-cyan);">
              <span aria-hidden="true">◉</span>
              Safety Camera
            </button>
            <button class="btn-secondary" id="btn-journey-assistant">
              <span aria-hidden="true">✳</span>
              Safe Assistant
            </button>
            <button class="btn-secondary" id="btn-share-journey">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
              Share Journey
            </button>
            <button class="btn-primary" id="btn-journey-checkin">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Check In
            </button>
            <button class="btn-secondary" id="btn-journey-request-help" style="border-color: rgba(255, 183, 3, 0.4); color: var(--accent-amber);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
              Request Help
            </button>
            <button class="btn-secondary" id="btn-end-journey" style="color: var(--accent-red); border-color: rgba(255, 51, 75, 0.4);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>
              End Journey
            </button>
          </div>
        </div>

        <!-- Competition Judge Simulation Fast-Forward Box -->
        <div class="card" style="border-style: dashed; border-color: rgba(94, 234, 212, 0.32); background: rgba(94, 234, 212, 0.04);">
          <div style="font-size: 11px; font-weight: 700; color: var(--accent-cyan); text-transform: uppercase; margin-bottom: 6px;">
            ⚡ Competition Judge Quick-Tester
          </div>
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px;">
            Simulate a missed check-in without waiting 22 minutes to demonstrate Screen 8:
          </p>
          <button class="btn-secondary" id="btn-simulate-overdue" style="width: 100%; border-color: var(--accent-amber); color: var(--accent-amber);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            Trigger "Missed Check-in / Overdue" State
          </button>
        </div>
      `;
    }

    // Start Journey Form View
    return `
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" id="journey-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h3 style="font-size: 17px; font-weight: 700;">Plan New Journey</h3>
        </div>
        <span class="stat-pill blue">Safe Corridor</span>
      </div>

      <div class="card">
        <form id="start-journey-form">
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">
              Starting Point
            </label>
            <input type="text" id="journey-start-input" value="North Campus Central Library" 
              style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>

          <div style="margin-bottom: 14px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">
              Destination
            </label>
            <input type="text" id="journey-dest-input" value="Green Park Residence, Block B" 
              style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>

          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 6px;">
              <span style="color: var(--text-muted); text-transform: uppercase;">Expected Travel Time</span>
              <span style="color: var(--accent-cyan);" id="eta-display">22 Minutes</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn-secondary eta-preset-btn active" data-min="15" style="flex: 1; padding: 6px 0; font-size: 11px;">15 min</button>
              <button type="button" class="btn-secondary eta-preset-btn" data-min="22" style="flex: 1; padding: 6px 0; font-size: 11px;">22 min</button>
              <button type="button" class="btn-secondary eta-preset-btn" data-min="30" style="flex: 1; padding: 6px 0; font-size: 11px;">30 min</button>
              <button type="button" class="btn-secondary eta-preset-btn" data-min="45" style="flex: 1; padding: 6px 0; font-size: 11px;">45 min</button>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">
              Select Safe Circle Contacts
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${AppState.safeCircle.map(c => `
                <label style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); padding: 8px 12px; border-radius: var(--radius-xs); border: 1px solid var(--border-subtle); cursor: pointer;">
                  <span style="font-size: 12px; font-weight: 600;">${c.name} (${c.relation})</span>
                  <input type="checkbox" checked name="circle-contact" value="${c.name}" style="accent-color: var(--accent-cyan); width: 16px; height: 16px;">
                </label>
              `).join("")}
            </div>
          </div>

          <!-- Controlled Location Sharing Toggle -->
          <div style="background: rgba(94, 234, 212, 0.08); border: 1px solid rgba(94, 234, 212, 0.22); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 18px;">
            <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
              <div>
                <div style="font-size: 12px; font-weight: 700; color: var(--accent-cyan);">Controlled Location Sharing</div>
                <div style="font-size: 10px; color: var(--text-muted);">Share approximate corridor only (no exact GPS exposure)</div>
              </div>
              <input type="checkbox" checked id="toggle-controlled-privacy" style="accent-color: var(--accent-cyan); width: 18px; height: 18px;">
            </label>
          </div>

          <button type="submit" class="btn-primary" style="width: 100%; padding: 12px; font-size: 14px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            START ACTIVE JOURNEY
          </button>
        </form>
      </div>
    `;
  }

  let cameraStream = null;
  let cameraRequestPending = false;
  let cameraPermissionMessage = "SafeLink only uses your camera and microphone when you explicitly enable Safety Recording. Recording status will always be visible.";
  let cameraRecorder = null;
  let cameraRecordingChunks = [];
  let recordedVideoSegments = [];
  let pendingStoppedRecording = null;
  let recordingSwitchInProgress = false;
  let recordingSnapshotInProgress = false;
  let microphoneFallbackAvailable = false;
  let pendingEvidence = null;
  let voiceRecognition = null;
  let isMicrophoneMuted = false;
  let voiceInputUnavailable = false;
  let recordingTimer = null;
  let demoRecording = false;

  function renderSafetyCameraScreen() {
    const evidence = AppState.evidence.slice(0, 5);
    return `
      <div class="app-header camera-screen-header">
        <div style="display:flex;align-items:center;gap:8px">
          <button class="icon-btn" id="camera-back-btn" aria-label="Back to previous screen">←</button>
          <div><h3 style="font-size:17px;font-weight:700">Safety Camera</h3><small style="color:var(--text-muted)">Private evidence capture</small></div>
        </div>
        <button class="camera-sos-shortcut" id="camera-sos-btn">SOS</button>
      </div>

      <div class="camera-preview" id="camera-preview">
        <video id="camera-video" autoplay muted playsinline aria-label="Camera preview"></video>
        <div class="camera-demo-scene" id="camera-demo-scene" aria-hidden="true">
          <div class="camera-scene-lights"></div>
          <div class="camera-scene-horizon"></div>
          <div class="camera-scene-caption">SAFE LINK · PRIVATE PREVIEW</div>
        </div>
        <div class="camera-live-indicator ${AppState.safetyRecording.isActive ? "camera-is-live" : ""}" id="camera-live-indicator"><span></span><b>${AppState.safetyRecording.isActive ? AppState.safetyRecording.isPaused ? "RECORDING PAUSED" : "SAFETY RECORDING ACTIVE" : "PREVIEW OFF"}</b></div>
        <div class="camera-preview-shade"></div>
        <div class="camera-preview-meta"><span id="camera-preview-status">Demo preview · enable camera for live view</span><span id="camera-recording-clock"></span></div>
        <button class="camera-flash-toggle" id="camera-flash-btn" aria-label="Toggle flash">⚡ <span>Flash off</span></button>
      </div>
      <div class="camera-permission-note" id="camera-permission-note" role="status">${escapeHtml(cameraPermissionMessage)}</div>

      <div class="camera-controls">
        <button class="camera-control-btn" id="camera-switch-btn"><span>↺</span><small>Switch to ${AppState.cameraFacing === "environment" ? "front" : "back"} camera</small></button>
        <button class="camera-capture-btn" id="camera-capture-btn" aria-label="Capture photo"><span></span></button>
        <button class="camera-control-btn camera-record-btn ${AppState.safetyRecording.isActive ? "is-recording" : ""}" id="camera-record-btn"><span>●</span><small>${AppState.safetyRecording.isActive ? "Recording active" : "Record evidence"}</small></button>
      </div>
      <div class="safety-recording-panel ${AppState.safetyRecording.isActive ? "is-active" : ""}" id="safety-recording-panel">
        <div class="safety-recording-title"><span class="${AppState.safetyRecording.isActive ? "recording-dot" : "safety-recording-idle-dot"}"></span><strong>${AppState.safetyRecording.isActive ? AppState.safetyRecording.isPaused ? "SAFETY RECORDING PAUSED" : "SAFETY RECORDING ACTIVE" : "Safety Recording"}</strong></div>
        <p>${AppState.safetyRecording.isActive ? `Camera: ON · Microphone: ${AppState.safetyRecording.microphoneEnabled ? "ON" : "OFF"} · Duration: <span id="recording-duration">00:00</span>` : "Begin a visible continuous recording session when you choose. Camera and microphone permission will be requested."}</p>
        ${AppState.safetyRecording.statusMessage ? `<p class="recording-platform-note">${escapeHtml(AppState.safetyRecording.statusMessage)}</p>` : ""}
        <div class="safety-recording-actions">
          ${AppState.safetyRecording.isActive ? `
            <button class="btn-secondary" id="safety-recording-switch">Switch Camera</button>
            <button class="btn-secondary" id="safety-recording-pause">${AppState.safetyRecording.isPaused ? "Resume" : "Pause"}</button>
            <button class="btn-secondary" id="safety-recording-mic">${AppState.safetyRecording.microphoneEnabled ? "Mute Mic" : "Unmute Mic"}</button>
            <button class="btn-primary" id="safety-recording-save">Save Securely</button>
            <button class="btn-secondary" id="safety-recording-share-action">Share with Safe Circle</button>
            <label class="camera-share-toggle"><input type="checkbox" id="safety-recording-share"> Save a shared copy (demo)</label>
            <button class="btn-danger" id="safety-recording-stop">STOP RECORDING</button>
            <button class="camera-sos-shortcut" id="safety-recording-sos">SOS</button>
          ` : `
            <button class="btn-primary" id="safety-recording-start">Start Safety Recording</button>
            ${microphoneFallbackAvailable ? `<button class="btn-secondary" id="safety-recording-start-muted">Start with camera only</button>` : ""}
            <button class="btn-secondary" id="camera-demo-preview-toggle">Open camera preview only</button>
          `}
        </div>
        <div class="camera-contact-picker" id="safety-recording-contacts" hidden>
          ${AppState.safeCircle.map(contact => `<label><input type="checkbox" value="${escapeHtml(contact.id)}"> ${escapeHtml(contact.name)}</label>`).join("")}
        </div>
      </div>
      <div class="camera-save-row">
        <button class="btn-primary" id="camera-save-btn" disabled>Save Securely</button>
        <label class="camera-share-toggle"><input type="checkbox" id="camera-share-circle"> Share with Safe Circle</label>
      </div>
      <div class="camera-contact-picker" id="camera-contact-picker" hidden>
        ${AppState.safeCircle.map(contact => `<label><input type="checkbox" value="${escapeHtml(contact.id)}"> ${escapeHtml(contact.name)}</label>`).join("")}
      </div>
      <p class="camera-legal-note">Only record where legally permitted and stay safe. Do not confront anyone to capture evidence.</p>
      <p class="recording-privacy-notice">SafeLink only uses your camera and microphone when you explicitly enable Safety Recording. Recording status will always be visible. A one-time still photo also requires your explicit Capture action and camera-only permission.</p>
      <section class="evidence-section">
        <div class="evidence-heading"><div><h4>Recent evidence</h4><small>Stored privately on this device</small></div><span>${evidence.length.toString().padStart(2, "0")}</span></div>
        ${evidence.length ? `<div class="evidence-list">${evidence.map((item, index) => `
          <div class="evidence-item">
            <div class="evidence-thumb">${item.thumbnail ? `<img src="${item.thumbnail}" alt="">` : `<span>${item.type === "video" ? "▶" : "◉"}</span>`}</div>
            <div class="evidence-detail"><strong>Evidence ${String(AppState.evidence.length - index).padStart(2, "0")}</strong><small>${escapeHtml(item.createdAt)} · ${item.type === "video" ? (item.isDemo ? "Demo recording" : "Video") : item.isDemo ? "Demo photo" : "Photo"}</small></div>
            <span class="evidence-status">${item.shared ? "Shared with Safe Circle" : "Private"}</span>
          </div>`).join("")}</div>` : `<div class="evidence-empty">Your saved evidence will appear here. Nothing is shared unless you choose contacts.</div>`}
      </section>
    `;
  }

  function renderVoiceAssistantScreen() {
    const helper = SafeLinkData.safePoints[2];
    return `
      <div class="app-header">
        <div style="display:flex;align-items:center;gap:8px">
          <button class="icon-btn" id="assistant-back-btn" aria-label="Back to previous screen">←</button>
          <div><h3 style="font-size:17px;font-weight:700">Safe Assistant</h3><small style="color:var(--text-muted)">Your safety, your choices</small></div>
        </div>
        <button class="camera-sos-shortcut" id="assistant-sos-btn">SOS</button>
      </div>
      <div class="assistant-listening-card">
        <div class="assistant-orb" id="assistant-orb"><span>✳</span></div>
        <div class="assistant-listening-label" id="assistant-listening-label">${isMicrophoneMuted ? "Microphone muted" : "Safe Assistant is listening"}</div>
        <p>Speak naturally or type a safety command below.</p>
        <div class="assistant-mic-controls">
          <button class="btn-secondary" id="assistant-mute-btn">${isMicrophoneMuted ? "Unmute microphone" : "Mute microphone"}</button>
          <button class="btn-secondary" id="assistant-end-btn">End conversation</button>
        </div>
      </div>
      <div class="assistant-conversation">
        <div class="assistant-message user-message"><small>You said</small><p id="assistant-transcript">${escapeHtml(AppState.assistantTranscript || "Try: “I feel unsafe”")}</p></div>
        <div class="assistant-message response-message"><small>Safe Assistant</small><p id="assistant-response">${escapeHtml(AppState.assistantResponse)}</p></div>
      </div>
      ${AppState.assistantConfirmation ? `<div class="assistant-confirm-card" id="assistant-confirm-card">
        <strong>${AppState.assistantConfirmationAction === "call-contact" ? `Call ${escapeHtml(AppState.safeCircle[0]?.name || "your emergency contact")}?` : AppState.assistantConfirmationAction === "share-journey" ? "Share your active journey with your Safe Circle?" : AppState.assistantConfirmationAction === "notify-circle" ? "Send a demo safety update to your Safe Circle?" : "Do you want me to send a SafeLink assistance request?"}</strong>
        <p>${AppState.assistantConfirmationAction === "help-request" ? "This demo updates the Safe Circle status and nearby helper views with approximate location sharing; no external messages are sent." : AppState.assistantConfirmationAction === "call-contact" ? "Your call app will open after you confirm. SafeLink does not place calls without your approval." : "No external message will be sent by this demo."}</p>
        <div><button class="btn-danger" id="${AppState.assistantConfirmationAction === "help-request" ? "assistant-confirm-alert" : "assistant-confirm-action"}">${AppState.assistantConfirmationAction === "call-contact" ? "YES, CALL CONTACT" : AppState.assistantConfirmationAction === "share-journey" ? "YES, SHARE JOURNEY" : AppState.assistantConfirmationAction === "notify-circle" ? "YES, SEND UPDATE" : "YES, SEND ALERT"}</button><button class="btn-secondary" id="assistant-cancel-alert">CANCEL</button></div>
      </div>` : ""}
      <form class="assistant-input-row" id="assistant-command-form">
        <input id="assistant-command-input" type="text" placeholder="Type a safety command…" aria-label="Type a safety command">
        <button class="btn-primary" type="submit">Send</button>
      </form>
      <div class="assistant-quick-actions">
        <button class="btn-danger" id="assistant-request-help">REQUEST HELP</button>
        <button class="btn-danger" id="assistant-activate-sos">ACTIVATE SOS</button>
        <button class="btn-secondary" id="assistant-notify-circle">NOTIFY SAFE CIRCLE</button>
        <button class="btn-secondary" id="assistant-open-camera">OPEN SAFETY CAMERA</button>
        <a class="btn-secondary" href="tel:112" id="assistant-call-emergency">CONTACT EMERGENCY SERVICES · 112</a>
      </div>
      <div class="assistant-safe-point"><span>NEAREST VERIFIED SAFE POINT</span><strong>${helper.name}</strong><small>${helper.distance} · ${helper.hours}</small><button class="btn-secondary" id="assistant-show-safe-point">View on Safety Map</button></div>
      <p class="assistant-disclaimer">Demo assistant: commands run local prototype workflows only. It cannot contact emergency services automatically or guarantee safety.</p>
    `;
  }

  async function startCameraPreview() {
    if (!document.getElementById("camera-video")) return;
    syncCameraPreviewUI();
    if (AppState.demoCameraPreviewOnly) {
      cameraPermissionMessage = "Guided demo preview only. No camera or microphone permission was requested.";
    } else if (!cameraStream && !AppState.safetyRecording.isActive) {
      cameraPermissionMessage = "SafeLink only uses your camera and microphone when you explicitly enable Safety Recording. Recording status will always be visible.";
    }
    syncCameraPreviewUI();
  }

  async function requestCameraStream(withMicrophone) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera and microphone access is unavailable in this browser.");
    }
    const requestedStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: AppState.cameraFacing } },
      audio: withMicrophone
    });
    if (AppState.currentScreen !== "camera") {
      requestedStream.getTracks().forEach(track => track.stop());
      throw new Error("Camera screen closed before permission was granted.");
    }
    return requestedStream;
  }

  function syncCameraPreviewUI() {
    const video = document.getElementById("camera-video");
    const scene = document.getElementById("camera-demo-scene");
    const indicator = document.getElementById("camera-live-indicator");
    const status = document.getElementById("camera-preview-status");
    const note = document.getElementById("camera-permission-note");
    if (!video || !scene || !indicator || !status || !note) return;
    const hasLiveTrack = cameraStream && cameraStream.getVideoTracks().some(track => track.readyState === "live");
    if (hasLiveTrack) {
      video.srcObject = cameraStream;
      scene.hidden = true;
      indicator.classList.add("camera-is-live");
      indicator.querySelector("b").textContent = AppState.safetyRecording.isActive ? AppState.safetyRecording.isPaused ? "RECORDING PAUSED" : "SAFETY RECORDING ACTIVE" : "CAMERA ACTIVE";
      status.textContent = AppState.safetyRecording.isActive ? `Safety recording ${AppState.safetyRecording.isPaused ? "paused" : "active"} · camera and microphone status shown below` : "Live camera preview · capture only when ready";
      note.textContent = AppState.safetyRecording.isActive
        ? "Recording is active only after your explicit start and permission. It stays on this device unless you choose to share."
        : "Camera preview is active because you requested a photo. Leave the camera screen to turn off the preview.";
      return;
    }
    cameraStream = null;
    video.srcObject = null;
    video.style.visibility = "";
    scene.hidden = false;
    indicator.classList.remove("camera-is-live");
    indicator.querySelector("b").textContent = AppState.demoCameraPreviewOnly ? "GUIDED DEMO" : "PREVIEW OFF";
    status.textContent = AppState.demoCameraPreviewOnly ? "Guided demo preview · camera and microphone are off" : "Preview off · start Safety Recording or capture a photo";
    note.textContent = cameraPermissionMessage;
  }

  function stopCameraPreview() {
    if (AppState.safetyRecording.isActive) return;
    pendingEvidence = null;
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    cameraPermissionMessage = "SafeLink only uses your camera and microphone when you explicitly enable Safety Recording. Recording status will always be visible.";
  }

  function sampleEvidenceImage() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#102f59"/><stop offset="1" stop-color="#080d1d"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="500" cy="170" r="80" fill="#48cae4" opacity=".35"/><path d="M0 590 Q170 480 320 590T640 560V900H0" fill="#12274a"/><text x="320" y="780" fill="#d5eaf5" font-family="sans-serif" font-size="24" text-anchor="middle">SafeLink evidence</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function captureCameraEvidence() {
    const video = document.getElementById("camera-video");
    if (!cameraStream) {
      try {
        cameraPermissionMessage = "Requesting camera permission for your photo…";
        syncCameraPreviewUI();
        cameraStream = await requestCameraStream(false);
        cameraPermissionMessage = "Photo preview active. Recording has not started.";
        syncCameraPreviewUI();
      } catch (error) {
        console.warn("Unable to open camera for photo capture:", error);
        cameraPermissionMessage = `${error.message} Try the demo preview or check browser permissions.`;
        syncCameraPreviewUI();
        showToast("Camera access is unavailable. No photo was captured.");
        return;
      }
    }
    if (!video || !video.videoWidth) {
      showToast("Camera is still starting. Try the capture button again in a moment.");
      return;
    }
    let image;
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      image = canvas.toDataURL("image/jpeg", 0.78);
      const thumbnailCanvas = document.createElement("canvas");
      const thumbnailScale = Math.min(1, 240 / video.videoWidth);
      thumbnailCanvas.width = Math.round(video.videoWidth * thumbnailScale);
      thumbnailCanvas.height = Math.round(video.videoHeight * thumbnailScale);
      thumbnailCanvas.getContext("2d").drawImage(video, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
      pendingEvidence = {
        type: "photo",
        data: image,
        blob: dataUrlToBlob(image),
        thumbnail: thumbnailCanvas.toDataURL("image/jpeg", 0.58),
        isDemo: false
      };
    } catch (error) {
      console.error("Unable to capture photo from camera:", error);
      showToast("Could not capture a photo from the camera.");
      return;
    }
    const preview = document.getElementById("camera-preview");
    preview.style.backgroundImage = `url("${image}")`;
    preview.classList.add("has-capture");
    if (video) video.style.visibility = "hidden";
    const saveButton = document.getElementById("camera-save-btn");
    saveButton.disabled = false;
    saveButton.textContent = "Save Securely";
    showToast("Photo captured. Save it privately or discard by leaving the screen.");
  }

  async function savePendingEvidence() {
    if (!pendingEvidence) {
      showToast("Capture a photo or finish a recording before saving.");
      return;
    }
    const selectedContacts = document.querySelectorAll("#camera-contact-picker input:checked");
    const selectedContactIds = [...selectedContacts].map(input => input.value);
    const shared = document.getElementById("camera-share-circle").checked && selectedContactIds.length > 0;
    const record = {
      id: `evidence-${Date.now()}`,
      type: pendingEvidence.type,
      createdAt: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
      shared,
      sharedWith: shared ? AppState.safeCircle.filter(contact => selectedContactIds.includes(contact.id)).map(contact => contact.name) : [],
      isDemo: pendingEvidence.isDemo,
      thumbnail: pendingEvidence.thumbnail
    };
    if (pendingEvidence.blob) {
      try {
        await saveVideoBlob(record.id, pendingEvidence.blob);
      } catch (error) {
        console.error("Unable to store private camera evidence:", error);
        showToast("Could not securely store the photo or video. Check browser storage and try again.");
        return;
      }
    }
    const updatedEvidence = [record, ...AppState.evidence].slice(0, 10);
    try {
      localStorage.setItem(evidenceStorageKey, JSON.stringify(updatedEvidence));
    } catch (error) {
      console.error("Unable to save private evidence metadata:", error);
      showToast("Could not save evidence on this device. Check available browser storage.");
      return;
    }
    AppState.evidence = updatedEvidence;
    pendingEvidence = null;
    renderCurrentViews();
    showToast(shared
      ? "Evidence saved locally. Safe Circle sharing is demo-only; no external upload was made."
      : "Evidence saved privately on this device. It was not shared publicly.");
  }

  function dataUrlToBlob(dataUrl) {
    const [metadata, content] = dataUrl.split(",");
    const mimeType = metadata.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType });
  }

  function saveVideoBlob(id, blob) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("Private video storage is unavailable."));
        return;
      }
      const request = indexedDB.open("safelink-private-media", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("evidence", { keyPath: "id" });
      request.onerror = () => reject(request.error || new Error("Could not open private media storage."));
      request.onsuccess = () => {
        const database = request.result;
        let transaction;
        try {
          transaction = database.transaction("evidence", "readwrite");
          transaction.objectStore("evidence").put({ id, blob });
        } catch (error) {
          database.close();
          reject(error);
          return;
        }
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error || new Error("Could not write private video evidence."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error || new Error("Private video storage transaction was aborted."));
        };
      };
    });
  }

  function currentRecordingDurationSeconds() {
    if (!AppState.safetyRecording.isActive) return AppState.safetyRecording.elapsedBeforePause;
    return AppState.safetyRecording.elapsedBeforePause
      + (AppState.safetyRecording.isPaused ? 0 : Math.floor((Date.now() - AppState.safetyRecording.startedAt) / 1000));
  }

  function formatRecordingDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function updateRecordingIndicators() {
    const state = AppState.safetyRecording;
    const duration = formatRecordingDuration(currentRecordingDurationSeconds());
    const fixed = document.getElementById("safety-recording-persistent");
    if (fixed) {
      fixed.hidden = !state.isActive;
      if (state.isActive) {
        const signature = `${state.isPaused}-${state.microphoneEnabled}-${state.statusMessage}`;
        if (fixed.dataset.signature !== signature) {
          fixed.dataset.signature = signature;
          fixed.innerHTML = `
            <div class="persistent-recording-status"><span class="recording-dot"></span><strong>SAFETY RECORDING ${state.isPaused ? "PAUSED" : "ACTIVE"}</strong><span id="persistent-recording-duration">${duration}</span><span>Camera ON · Mic ${state.microphoneEnabled ? "ON" : "OFF"}</span></div>
            ${state.statusMessage ? `<small>${escapeHtml(state.statusMessage)}</small>` : ""}
            <div class="persistent-recording-actions">
              <button id="persistent-recording-camera">Recording controls</button>
              <button id="persistent-recording-pause">${state.isPaused ? "Resume" : "Pause"}</button>
              <button id="persistent-recording-sos">SOS</button>
              <button class="stop-recording-mini" id="persistent-recording-stop">STOP RECORDING</button>
            </div>`;
          bindPersistentRecordingControls();
        } else {
          const durationElement = document.getElementById("persistent-recording-duration");
          if (durationElement) durationElement.textContent = duration;
        }
      } else {
        fixed.dataset.signature = "";
        fixed.innerHTML = "";
      }
    }
    const time = document.getElementById("recording-duration");
    if (time) time.textContent = duration;
    const clock = document.getElementById("camera-recording-clock");
    if (clock && state.isActive) clock.textContent = `${state.isPaused ? "Ⅱ" : "●"} ${duration}`;
  }

  function bindPersistentRecordingControls() {
    const bind = (id, action) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", action);
    };
    bind("persistent-recording-camera", () => navigateTo("camera"));
    bind("persistent-recording-pause", toggleSafetyRecordingPause);
    bind("persistent-recording-sos", openSOSScreen);
    bind("persistent-recording-stop", () => stopSafetyRecording());
  }

  function startRecorderSegment() {
    if (!cameraStream || !window.MediaRecorder) throw new Error("Video recording is not supported in this browser.");
    cameraRecordingChunks = [];
    cameraRecorder = new MediaRecorder(cameraStream);
    cameraRecorder.ondataavailable = event => {
      if (event.data.size) cameraRecordingChunks.push(event.data);
    };
    cameraRecorder.onerror = event => {
      console.error("Safety Recording encountered a browser media error:", event.error);
      AppState.safetyRecording.statusMessage = "The browser reported a recording error. Stop recording and save any available footage.";
      updateRecordingIndicators();
    };
    cameraRecorder.start(1000);
  }

  async function startSafetyRecording(withMicrophone = true) {
    if (AppState.safetyRecording.isActive || cameraRequestPending) return;
    if (!window.MediaRecorder) {
      AppState.safetyRecording.statusMessage = "This browser cannot record video. Camera preview and photo capture may still be available.";
      microphoneFallbackAvailable = withMicrophone;
      cameraPermissionMessage = AppState.safetyRecording.statusMessage;
      renderCurrentViews();
      return;
    }
    cameraRequestPending = true;
    AppState.safetyRecording.statusMessage = "Requesting camera and microphone permission…";
    renderCurrentViews();
    try {
      cameraStream = await requestCameraStream(withMicrophone);
      if (!cameraStream.getVideoTracks().some(track => track.readyState === "live")) {
        throw new Error("Camera permission was not granted.");
      }
      const audioTracks = cameraStream.getAudioTracks();
      AppState.safetyRecording.isActive = true;
      AppState.safetyRecording.isPaused = false;
      AppState.safetyRecording.microphoneEnabled = withMicrophone && audioTracks.length > 0;
      AppState.safetyRecording.startedAt = Date.now();
      AppState.safetyRecording.elapsedBeforePause = 0;
      AppState.safetyRecording.locationSharing = AppState.activeJourney.isActive || AppState.activeHelpRequest.isActive ? "approximate" : "off";
      AppState.safetyRecording.statusMessage = document.hidden
        ? "Background camera access may be paused by your device or browser."
        : "Camera and microphone are active only after your permission.";
      microphoneFallbackAvailable = false;
      recordedVideoSegments = [];
      pendingEvidence = null;
      cameraPermissionMessage = AppState.safetyRecording.statusMessage;
      cameraStream.getTracks().forEach(track => {
        track.onended = handleRecordingTrackEnded;
        track.onmute = handleRecordingTrackMuted;
        track.onunmute = handleRecordingTrackUnmuted;
      });
      startRecorderSegment();
      recordingTimer = setInterval(updateRecordingIndicators, 500);
      renderCurrentViews();
      updateRecordingIndicators();
      SafeLinkAudio.playSuccess();
      showToast(`Safety Recording started. Camera ON, microphone ${AppState.safetyRecording.microphoneEnabled ? "ON" : "OFF"}.`);
    } catch (error) {
      console.warn("Unable to start Safety Recording:", error);
      if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
      microphoneFallbackAvailable = withMicrophone;
      AppState.safetyRecording.isActive = false;
      AppState.safetyRecording.statusMessage = withMicrophone
        ? "Camera and microphone permission is required to start with audio. You can retry with the microphone off."
        : `Camera-only recording could not start: ${error.message}`;
      cameraPermissionMessage = AppState.safetyRecording.statusMessage;
      renderCurrentViews();
      showToast(withMicrophone ? "Recording did not start. Grant permissions or choose camera-only recording." : "Camera-only recording could not start. Check camera permission and browser support.");
    } finally {
      cameraRequestPending = false;
    }
  }

  function handleRecordingTrackEnded() {
    if (!AppState.safetyRecording.isActive || recordingSwitchInProgress) return;
    AppState.safetyRecording.statusMessage = "Your device ended media access. Recording has stopped.";
    stopSafetyRecording(true);
  }

  function handleRecordingTrackMuted() {
    if (!AppState.safetyRecording.isActive) return;
    AppState.safetyRecording.statusMessage = "Your device or browser paused media access. Keep this app visible if recording must continue.";
    updateRecordingIndicators();
  }

  function handleRecordingTrackUnmuted() {
    if (!AppState.safetyRecording.isActive) return;
    AppState.safetyRecording.statusMessage = "";
    updateRecordingIndicators();
  }

  function toggleSafetyRecordingPause() {
    const state = AppState.safetyRecording;
    if (!state.isActive || !cameraRecorder) return;
    if (state.isPaused) {
      try {
        cameraRecorder.resume();
        state.startedAt = Date.now();
        state.isPaused = false;
        state.statusMessage = "";
      } catch (error) {
        console.error("Unable to resume Safety Recording:", error);
        state.statusMessage = "Recording could not resume. Stop the recording and try again.";
      }
    } else {
      try {
        cameraRecorder.pause();
        state.elapsedBeforePause += Math.floor((Date.now() - state.startedAt) / 1000);
        state.isPaused = true;
      } catch (error) {
        console.error("Unable to pause Safety Recording:", error);
        state.statusMessage = "Recording could not be paused by this browser.";
      }
    }
    renderCurrentViews();
    updateRecordingIndicators();
  }

  function muteSafetyRecordingMicrophone() {
    if (!AppState.safetyRecording.isActive || !cameraStream) return;
    const nextEnabled = !AppState.safetyRecording.microphoneEnabled;
    cameraStream.getAudioTracks().forEach(track => { track.enabled = nextEnabled; });
    AppState.safetyRecording.microphoneEnabled = nextEnabled;
    AppState.safetyRecording.statusMessage = nextEnabled ? "" : "Microphone muted. Video recording continues.";
    renderCurrentViews();
    updateRecordingIndicators();
  }

  async function switchSafetyRecordingCamera() {
    if (!AppState.safetyRecording.isActive || !cameraStream || recordingSwitchInProgress) return;
    recordingSwitchInProgress = true;
    const wasPaused = AppState.safetyRecording.isPaused;
    const previousStream = cameraStream;
    AppState.cameraFacing = AppState.cameraFacing === "environment" ? "user" : "environment";
    try {
      const replacementVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: AppState.cameraFacing } },
        audio: false
      });
      const nextVideoTrack = replacementVideoStream.getVideoTracks()[0];
      if (!nextVideoTrack) throw new Error("The selected camera is unavailable.");
      const oldRecorder = cameraRecorder;
      if (oldRecorder && oldRecorder.state !== "inactive") {
        await new Promise(resolve => {
          oldRecorder.addEventListener("stop", resolve, { once: true });
          oldRecorder.stop();
        });
        const segment = new Blob(cameraRecordingChunks, { type: oldRecorder.mimeType || "video/webm" });
        if (segment.size) recordedVideoSegments.push(segment);
      }
      const audioTracks = previousStream.getAudioTracks();
      previousStream.getVideoTracks().forEach(track => {
        track.onended = null;
        track.onmute = null;
        track.onunmute = null;
        track.stop();
      });
      cameraStream = new MediaStream([nextVideoTrack, ...audioTracks]);
      nextVideoTrack.onended = handleRecordingTrackEnded;
      nextVideoTrack.onmute = handleRecordingTrackMuted;
      nextVideoTrack.onunmute = handleRecordingTrackUnmuted;
      audioTracks.forEach(track => {
        track.onended = handleRecordingTrackEnded;
        track.onmute = handleRecordingTrackMuted;
        track.onunmute = handleRecordingTrackUnmuted;
      });
      startRecorderSegment();
      if (wasPaused) cameraRecorder.pause();
      renderCurrentViews();
      showToast(`Switched to ${AppState.cameraFacing === "environment" ? "back" : "front"} camera.`);
    } catch (error) {
      console.error("Unable to switch Safety Recording camera:", error);
      AppState.safetyRecording.statusMessage = `Camera switch failed: ${error.message}`;
      renderCurrentViews();
      showToast("Could not switch camera. The recording may need to be stopped.");
    } finally {
      recordingSwitchInProgress = false;
    }
  }

  async function flushCurrentRecordingSegment() {
    if (!cameraRecorder || cameraRecorder.state === "inactive") return;
    if (cameraRecorder.state === "paused") cameraRecorder.resume();
    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      cameraRecorder.addEventListener("dataavailable", finish, { once: true });
      cameraRecorder.requestData();
      setTimeout(finish, 1200);
    });
  }

  function selectedRecordingContacts(selector) {
    return [...document.querySelectorAll(`${selector} input:checked`)].map(input => input.value).filter(value => value !== "all");
  }

  async function saveRecordingSnapshot(isEmergency = false) {
    if (!AppState.safetyRecording.isActive || recordingSnapshotInProgress) return;
    recordingSnapshotInProgress = true;
    try {
      if (!AppState.safetyRecording.isPaused) await flushCurrentRecordingSegment();
      const segments = [...recordedVideoSegments];
      if (cameraRecordingChunks.length) segments.push(new Blob(cameraRecordingChunks, { type: cameraRecorder?.mimeType || "video/webm" }));
      if (!segments.length || segments.every(segment => !segment.size)) throw new Error("There is no recorded video data to save yet.");
      const selected = isEmergency ? [] : selectedRecordingContacts("#safety-recording-contacts");
      const share = document.getElementById("safety-recording-share");
      await persistPrivateRecording(segments, Boolean(!isEmergency && share?.checked && selected.length), selected);
      if (isEmergency) AppState.safetyRecording.sosSnapshotStatus = "Current recording snapshot saved privately on this device. It was not shared.";
      showToast(share?.checked && selected.length
        ? "Recording snapshot saved locally. Sharing is selected for the Safe Circle demo; no external upload was made."
        : "Recording snapshot saved privately on this device.");
    } catch (error) {
      console.error("Unable to save Safety Recording snapshot:", error);
      if (isEmergency) AppState.safetyRecording.sosSnapshotStatus = "Could not save the current recording snapshot. Recording remains active.";
      showToast(`Could not save the recording snapshot: ${error.message}`);
    } finally {
      recordingSnapshotInProgress = false;
      if (AppState.currentScreen === "camera" || AppState.currentScreen === "sos") renderCurrentViews();
      else updateRecordingIndicators();
    }
  }

  async function shareCurrentRecordingWithCircle() {
    const picker = document.getElementById("safety-recording-contacts");
    const selected = selectedRecordingContacts("#safety-recording-contacts");
    if (!selected.length) {
      picker.hidden = false;
      showToast("Choose one or more Safe Circle contacts, then select Share with Safe Circle again.");
      return;
    }
    document.getElementById("safety-recording-share").checked = true;
    await saveRecordingSnapshot();
  }

  async function persistPrivateRecording(segments, shared, contactIds) {
    const id = `evidence-${Date.now()}`;
    await saveVideoBlob(id, segments.length === 1 ? segments[0] : segments);
    const record = {
      id,
      type: "video",
      createdAt: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
      shared,
      sharedWith: shared ? AppState.safeCircle.filter(contact => contactIds.includes(contact.id)).map(contact => contact.name) : [],
      isDemo: false,
      thumbnail: sampleEvidenceImage()
    };
    const updated = [record, ...AppState.evidence].slice(0, 10);
    try {
      localStorage.setItem(evidenceStorageKey, JSON.stringify(updated));
    } catch (error) {
      console.error("Unable to save private recording metadata:", error);
      throw new Error("Recording bytes are stored locally, but its evidence entry could not be saved.");
    }
    AppState.evidence = updated;
    return record;
  }

  async function stopSafetyRecording(trackEnded = false) {
    if (!AppState.safetyRecording.isActive || recordingSwitchInProgress) return;
    const wasPaused = AppState.safetyRecording.isPaused;
    AppState.safetyRecording.elapsedBeforePause = currentRecordingDurationSeconds();
    AppState.safetyRecording.isActive = false;
    AppState.safetyRecording.isPaused = false;
    AppState.safetyRecording.startedAt = null;
    AppState.safetyRecording.microphoneEnabled = false;
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = null;
    if (cameraRecorder && cameraRecorder.state !== "inactive") {
      if (wasPaused) cameraRecorder.resume();
      await new Promise(resolve => {
        cameraRecorder.addEventListener("stop", resolve, { once: true });
        cameraRecorder.stop();
      });
      const segment = new Blob(cameraRecordingChunks, { type: cameraRecorder.mimeType || "video/webm" });
      if (segment.size) recordedVideoSegments.push(segment);
    }
    cameraRecorder = null;
    if (cameraStream) cameraStream.getTracks().forEach(track => {
      track.onended = null;
      track.onmute = null;
      track.onunmute = null;
      track.stop();
    });
    cameraStream = null;
    const clips = recordedVideoSegments.filter(segment => segment.size);
    pendingStoppedRecording = clips.length ? clips : null;
    recordedVideoSegments = [];
    cameraRecordingChunks = [];
    AppState.safetyRecording.statusMessage = trackEnded
      ? "The browser or operating system ended camera access."
      : "Recording stopped. Choose whether to save it privately or discard it.";
    renderCurrentViews();
    if (pendingStoppedRecording) {
      document.getElementById("recording-stopped-modal").classList.add("active");
    } else {
      showToast(trackEnded ? "Camera access ended. No video data was available to save." : "Recording stopped. No video data was captured.");
    }
  }

  async function saveStoppedRecording() {
    if (!pendingStoppedRecording) return;
    const contacts = selectedRecordingContacts("#recording-review-contacts");
    const share = document.getElementById("recording-review-share").checked && contacts.length > 0;
    const segments = pendingStoppedRecording;
    try {
      await persistPrivateRecording(segments, share, contacts);
      pendingStoppedRecording = null;
      closeAllModals();
      if (AppState.currentScreen === "camera") renderCurrentViews();
      showToast(share ? "Recording saved locally. Selected Safe Circle sharing is demo-only; no external upload was made." : "Recording saved privately on this device.");
    } catch (error) {
      console.error("Unable to save stopped recording:", error);
      showToast(`Could not save the recording: ${error.message}`);
    }
  }

  function discardStoppedRecording() {
    pendingStoppedRecording = null;
    recordedVideoSegments = [];
    cameraRecordingChunks = [];
    closeAllModals();
    showToast("Recording discarded. No footage was saved.");
  }

  function toggleEvidenceRecording() {
    if (AppState.safetyRecording.isActive) stopSafetyRecording();
    else startSafetyRecording(true);
  }

  function stopVoiceRecognition() {
    if (voiceRecognition) {
      voiceRecognition.onresult = null;
      voiceRecognition.onend = null;
      voiceRecognition.stop();
      voiceRecognition = null;
    }
  }

  function speakAssistantResponse(message) {
    if (!window.speechSynthesis || isMicrophoneMuted) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function updateAssistantMessage(transcript, response, requiresConfirmation = false, confirmationAction = "help-request") {
    AppState.assistantTranscript = transcript;
    AppState.assistantResponse = response;
    AppState.assistantConfirmation = requiresConfirmation;
    AppState.assistantConfirmationAction = requiresConfirmation ? confirmationAction : "";
    renderCurrentViews();
    speakAssistantResponse(response);
  }

  function processAssistantCommand(command) {
    const text = command.trim();
    const normalized = text.toLowerCase();
    if (!text) return;
    if (/feel unsafe|need help|send an alert|send alert|help me/.test(normalized)) {
      updateAssistantMessage(text, "I’m here with you. Do you want me to send a SafeLink assistance request?", true);
    } else if (/start my journey|start journey/.test(normalized)) {
      updateAssistantMessage(text, "Let’s set up your journey and choose who can follow your progress.");
      navigateTo("journey");
    } else if (/activate sos|emergency sos/.test(normalized)) {
      updateAssistantMessage(text, "I’ll ask you to confirm before activating SOS.");
      openSOSScreen();
    } else if (/call my emergency contact|call emergency contact/.test(normalized)) {
      updateAssistantMessage(text, `Do you want to call ${AppState.safeCircle[0]?.name || "your emergency contact"}?`, true, "call-contact");
    } else if (/share my journey|share journey/.test(normalized)) {
      if (AppState.activeJourney.isActive) {
        updateAssistantMessage(text, "Do you want to share your active journey with your Safe Circle?", true, "share-journey");
      } else {
        updateAssistantMessage(text, "Start a journey first, then you can share its progress with your Safe Circle.");
        navigateTo("journey");
      }
    } else if (/notify (my )?safe circle|send.*safe circle/.test(normalized)) {
      updateAssistantMessage(text, "Do you want to send a demo safety update to your Safe Circle?", true, "notify-circle");
    } else if (/i am safe|i'm safe|im safe|safe now/.test(normalized)) {
      AppState.activeJourney.isActive = false;
      AppState.activeJourney.isOverdue = false;
      if (AppState.activeJourney.intervalId) clearInterval(AppState.activeJourney.intervalId);
      AppState.activeHelpRequest.isActive = false;
      AppState.activeHelpRequest.status = "resolved";
      AppState.sosActive = false;
      updateAssistantMessage(text, "I’m glad you’re safe. Your journey and active help request have been closed in this demo.");
      showToast("Safe status confirmed. Journey and help request ended.");
      navigateTo("home");
    } else if (/start a check.?in|check.?in/.test(normalized)) {
      updateAssistantMessage(text, "Your journey check-in is ready. Confirm your status when you arrive.");
      navigateTo("checkin");
    } else if (/open (the )?safety camera|safety camera|open camera/.test(normalized)) {
      updateAssistantMessage(text, "Opening the private Safety Camera. Live camera access will ask for permission.");
      navigateTo("camera");
    } else if (/nearest safe point|safe point/.test(normalized)) {
      const point = SafeLinkData.safePoints[2];
      updateAssistantMessage(text, `The nearest listed verified safe point is ${point.name}, ${point.distance} away. This is demo map data.`);
    } else {
      updateAssistantMessage(text, "I can help you start a journey, request help, contact a trusted person, open the safety camera, or find a nearby safe point.");
    }
  }

  function confirmAssistantPendingAction() {
    const action = AppState.assistantConfirmationAction;
    const transcript = AppState.assistantTranscript;
    AppState.assistantConfirmation = false;
    AppState.assistantConfirmationAction = "";
    if (action === "help-request") {
      handleCreateHelpRequest("I feel unsafe");
      navigateTo("help-response");
    } else if (action === "call-contact") {
      const contact = AppState.safeCircle[0];
      if (contact) {
        updateAssistantMessage(transcript, `Opening a call to ${contact.name}. Confirm any external call in your phone dialer.`);
        triggerPhoneCall(contact.name, contact.phone, "☎");
      } else {
        updateAssistantMessage(transcript, "There is no emergency contact in your Safe Circle yet.");
      }
    } else if (action === "share-journey") {
      updateAssistantMessage(transcript, "Journey shared in the Safe Circle demo view; no external message was sent.");
      showToast("Journey shared in the Safe Circle demo view; no external message was sent.");
    } else if (action === "notify-circle") {
      updateAssistantMessage(transcript, "Your Safe Circle demo status has been updated. No external message was sent.");
      showToast("Safe Circle demo status updated.");
    }
  }

  function setupSafetyFeatureListeners() {
    const homeSos = document.getElementById("home-sos-btn");
    if (homeSos) homeSos.addEventListener("click", openSOSScreen);
    ["home-safety-camera-btn", "btn-journey-camera"].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", () => navigateTo("camera"));
    });
    ["home-safe-assistant-btn", "btn-journey-assistant"].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", () => navigateTo("assistant"));
    });

    const cameraBack = document.getElementById("camera-back-btn");
    if (cameraBack) cameraBack.addEventListener("click", () => navigateTo(AppState.activeJourney.isActive ? "journey" : "home"));
    const cameraSos = document.getElementById("camera-sos-btn");
    if (cameraSos) cameraSos.addEventListener("click", openSOSScreen);
    if (document.getElementById("camera-video")) {
      startCameraPreview();
      document.getElementById("camera-capture-btn").addEventListener("click", captureCameraEvidence);
      document.getElementById("camera-save-btn").addEventListener("click", savePendingEvidence);
      document.getElementById("camera-record-btn").addEventListener("click", toggleEvidenceRecording);
      document.getElementById("camera-share-circle").addEventListener("change", event => {
        document.getElementById("camera-contact-picker").hidden = !event.target.checked;
      });
      document.getElementById("camera-flash-btn").addEventListener("click", event => {
        AppState.cameraFlashOn = !AppState.cameraFlashOn;
        event.currentTarget.classList.toggle("is-on", AppState.cameraFlashOn);
        event.currentTarget.querySelector("span").textContent = AppState.cameraFlashOn ? "Flash on" : "Flash off";
        const track = cameraStream && cameraStream.getVideoTracks()[0];
        if (track && track.getCapabilities && track.getCapabilities().torch) {
          track.applyConstraints({ advanced: [{ torch: AppState.cameraFlashOn }] }).catch(error => {
            console.warn("Camera flash could not be changed:", error);
            showToast("This camera does not support flash control.");
          });
        } else {
          showToast("Flash preference updated. This camera does not expose a torch.");
        }
      });
      document.getElementById("camera-switch-btn").addEventListener("click", async () => {
        if (AppState.safetyRecording.isActive) {
          await switchSafetyRecordingCamera();
          return;
        }
        const previousFacing = AppState.cameraFacing;
        AppState.cameraFacing = AppState.cameraFacing === "environment" ? "user" : "environment";
        if (!cameraStream) {
          cameraPermissionMessage = `Selected ${AppState.cameraFacing === "user" ? "front" : "back"} camera. Capture a photo or start Safety Recording to enable it.`;
          renderCurrentViews();
          return;
        }
        try {
          const replacement = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: AppState.cameraFacing } },
            audio: false
          });
          const currentAudioTracks = cameraStream.getAudioTracks();
          cameraStream.getVideoTracks().forEach(track => track.stop());
          cameraStream = new MediaStream([...replacement.getVideoTracks(), ...currentAudioTracks]);
          renderCurrentViews();
        } catch (error) {
          AppState.cameraFacing = previousFacing;
          console.warn("Unable to switch preview camera:", error);
          showToast("Could not switch camera. Check camera permission and device support.");
        }
      });

      const startRecording = document.getElementById("safety-recording-start");
      if (startRecording) startRecording.addEventListener("click", () => startSafetyRecording(true));
      const startMuted = document.getElementById("safety-recording-start-muted");
      if (startMuted) startMuted.addEventListener("click", () => startSafetyRecording(false));
      const demoPreview = document.getElementById("camera-demo-preview-toggle");
      if (demoPreview) demoPreview.addEventListener("click", () => {
        AppState.demoCameraPreviewOnly = true;
        cameraPermissionMessage = "Guided demo preview only. No camera or microphone permission was requested.";
        renderCurrentViews();
      });
      const pauseRecording = document.getElementById("safety-recording-pause");
      if (pauseRecording) pauseRecording.addEventListener("click", toggleSafetyRecordingPause);
      const muteRecording = document.getElementById("safety-recording-mic");
      if (muteRecording) muteRecording.addEventListener("click", muteSafetyRecordingMicrophone);
      const stopRecording = document.getElementById("safety-recording-stop");
      if (stopRecording) stopRecording.addEventListener("click", () => stopSafetyRecording());
      const saveRecording = document.getElementById("safety-recording-save");
      if (saveRecording) saveRecording.addEventListener("click", () => saveRecordingSnapshot());
      const shareRecording = document.getElementById("safety-recording-share-action");
      if (shareRecording) shareRecording.addEventListener("click", shareCurrentRecordingWithCircle);
      const sosRecording = document.getElementById("safety-recording-sos");
      if (sosRecording) sosRecording.addEventListener("click", openSOSScreen);
      const shareToggle = document.getElementById("safety-recording-share");
      if (shareToggle) shareToggle.addEventListener("change", event => {
        document.getElementById("safety-recording-contacts").hidden = !event.target.checked;
      });
    }

    const assistantBack = document.getElementById("assistant-back-btn");
    if (assistantBack) assistantBack.addEventListener("click", () => navigateTo("home"));
    const assistantSos = document.getElementById("assistant-sos-btn");
    if (assistantSos) assistantSos.addEventListener("click", openSOSScreen);
    const assistantForm = document.getElementById("assistant-command-form");
    if (assistantForm) assistantForm.addEventListener("submit", event => {
      event.preventDefault();
      processAssistantCommand(document.getElementById("assistant-command-input").value);
    });
    const muteButton = document.getElementById("assistant-mute-btn");
    if (muteButton) muteButton.addEventListener("click", () => {
      isMicrophoneMuted = !isMicrophoneMuted;
      muteButton.textContent = isMicrophoneMuted ? "Unmute microphone" : "Mute microphone";
      const label = document.getElementById("assistant-listening-label");
      label.textContent = isMicrophoneMuted ? "Microphone muted" : "Safe Assistant is listening";
      if (isMicrophoneMuted) stopVoiceRecognition();
      else {
        voiceInputUnavailable = false;
        beginVoiceRecognition();
      }
    });
    const endButton = document.getElementById("assistant-end-btn");
    if (endButton) endButton.addEventListener("click", () => {
      stopVoiceRecognition();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      isMicrophoneMuted = true;
      navigateTo("home");
    });
    const confirmButton = document.getElementById("assistant-confirm-alert");
    if (confirmButton) confirmButton.addEventListener("click", confirmAssistantPendingAction);
    const confirmActionButton = document.getElementById("assistant-confirm-action");
    if (confirmActionButton) confirmActionButton.addEventListener("click", confirmAssistantPendingAction);
    const cancelButton = document.getElementById("assistant-cancel-alert");
    if (cancelButton) cancelButton.addEventListener("click", () => {
      updateAssistantMessage(AppState.assistantTranscript, "Okay. No action was taken. You can still use the camera or choose another safety option.");
    });
    const requestButton = document.getElementById("assistant-request-help");
    if (requestButton) requestButton.addEventListener("click", () => updateAssistantMessage("I need help", "Do you want me to send a SafeLink assistance request?", true));
    const activateButton = document.getElementById("assistant-activate-sos");
    if (activateButton) activateButton.addEventListener("click", openSOSScreen);
    const notifyButton = document.getElementById("assistant-notify-circle");
    if (notifyButton) notifyButton.addEventListener("click", () => {
      updateAssistantMessage("Notify my Safe Circle", "Your Safe Circle has been notified in this demo. No external message was sent.");
      showToast("Safe Circle notification simulated in demo.");
    });
    const cameraButton = document.getElementById("assistant-open-camera");
    if (cameraButton) cameraButton.addEventListener("click", () => navigateTo("camera"));
    const safePointButton = document.getElementById("assistant-show-safe-point");
    if (safePointButton) safePointButton.addEventListener("click", () => navigateTo("map"));
    const sosRecordingControls = document.getElementById("sos-recording-controls");
    if (sosRecordingControls) sosRecordingControls.addEventListener("click", () => navigateTo("camera"));
    if (assistantForm && !isMicrophoneMuted) beginVoiceRecognition();
  }

  function beginVoiceRecognition() {
    if (voiceRecognition || isMicrophoneMuted || voiceInputUnavailable) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const label = document.getElementById("assistant-listening-label");
    if (!Recognition) {
      if (label) label.textContent = "Voice input unavailable · type a command below";
      return;
    }
    try {
      voiceRecognition = new Recognition();
      voiceRecognition.lang = "en-US";
      voiceRecognition.interimResults = false;
      voiceRecognition.onresult = event => processAssistantCommand(event.results[0][0].transcript);
      voiceRecognition.onerror = event => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          voiceInputUnavailable = true;
          console.warn("Voice recognition unavailable:", event.error);
          const currentLabel = document.getElementById("assistant-listening-label");
          if (currentLabel) currentLabel.textContent = "Voice input unavailable · type a command below";
        }
        voiceRecognition = null;
      };
      voiceRecognition.onend = () => {
        voiceRecognition = null;
        if (!voiceInputUnavailable && !isMicrophoneMuted && AppState.currentScreen === "assistant") {
          setTimeout(beginVoiceRecognition, 250);
        }
      };
      voiceRecognition.start();
    } catch (error) {
      console.warn("Could not start voice recognition:", error);
      voiceRecognition = null;
      voiceInputUnavailable = true;
      if (label) label.textContent = "Voice input unavailable · type a command below";
    }
  }

  // -------------------------------------------------------------
  // SCREEN 4 — SAFETY MAP
  // -------------------------------------------------------------
  function renderSafetyMapScreen() {
    return `
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" id="map-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h3 style="font-size: 17px; font-weight: 700;">Safety Map</h3>
        </div>
        <span class="stat-pill teal">Mesh Active</span>
      </div>

      <!-- Map Filter Pills -->
      <div style="display: flex; gap: 6px; margin-bottom: 10px; overflow-x: auto; padding-bottom: 2px;">
        <button class="btn-secondary map-filter-btn active" data-filter="all" style="padding: 4px 10px; font-size: 11px;">All Points</button>
        <button class="btn-secondary map-filter-btn" data-filter="helpers" style="padding: 4px 10px; font-size: 11px; color: var(--accent-cyan);">● Helpers (7)</button>
        <button class="btn-secondary map-filter-btn" data-filter="safepoints" style="padding: 4px 10px; font-size: 11px; color: var(--accent-teal);">● Safe Points (4)</button>
      </div>

      <!-- Interactive Map Canvas Container -->
      <div class="map-canvas-container" id="interactive-safety-map">
        <!-- SVG Interactive Map Grid -->
        <svg class="map-svg-grid" viewBox="0 0 100 100" preserveAspectRatio="none">
          <!-- Street Grids & Blocks -->
          <rect x="0" y="0" width="100" height="100" fill="#070B12" />
          <path d="M 0,25 Q 30,22 50,30 T 100,28" stroke="#1A2433" stroke-width="3" fill="none" />
          <path d="M 0,50 L 100,50" stroke="#243044" stroke-width="4.5" fill="none" />
          <path d="M 0,75 L 100,75" stroke="#1A2433" stroke-width="3" fill="none" />
          <path d="M 30,0 L 30,100" stroke="#1A2433" stroke-width="3.5" fill="none" />
          <path d="M 65,0 L 65,100" stroke="#243044" stroke-width="4" fill="none" />

          <!-- Campus Quad Green Patch -->
          <rect x="34" y="32" width="26" height="14" rx="2" fill="rgba(6, 214, 160, 0.08)" stroke="rgba(6, 214, 160, 0.2)" stroke-dasharray="1 1" />
          <text x="36" y="40" fill="#4B6A9B" font-size="3" font-weight="600">CENTRAL QUAD</text>

          <!-- User Controlled Privacy Radius (Translucent Blue Disk) -->
          <circle cx="50" cy="50" r="14" fill="rgba(72, 202, 228, 0.12)" stroke="rgba(72, 202, 228, 0.4)" stroke-width="0.8" stroke-dasharray="1.5 1" />
          
          <!-- High-Tech Rotating Radar Sweep Beam -->
          <g class="radar-sweep-beam">
            <line x1="50" y1="50" x2="50" y2="36" stroke="rgba(72, 202, 228, 0.8)" stroke-width="0.7" />
            <polygon points="50,50 50,36 58,38" fill="rgba(72, 202, 228, 0.25)" />
          </g>

          <!-- User Marker (Approximate Location) -->
          <circle cx="50" cy="50" r="2.8" fill="#5EEAD4" stroke="#FFFFFF" stroke-width="0.8" />
          <circle cx="50" cy="50" r="4.5" fill="none" stroke="#5EEAD4" stroke-width="0.5">
            <animate attributeName="r" values="2.8; 6; 2.8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1; 0; 1" dur="2s" repeatCount="indefinite" />
          </circle>

          <!-- Verified Assistance Points (Green) -->
          <!-- Police (sp_1) -->
          <g class="map-pin-group" data-pin="sp_1" style="cursor: pointer;">
            <circle cx="36" cy="28" r="3" fill="#34F5B0" stroke="#FFFFFF" stroke-width="0.6" />
            <text x="36" y="29.2" fill="#05070C" font-size="2.6" font-weight="900" text-anchor="middle">P</text>
          </g>

          <!-- Hospital ER (sp_2) -->
          <g class="map-pin-group" data-pin="sp_2" style="cursor: pointer;">
            <circle cx="70" cy="40" r="3" fill="#34F5B0" stroke="#FFFFFF" stroke-width="0.6" />
            <text x="70" y="41.2" fill="#05070C" font-size="2.6" font-weight="900" text-anchor="middle">+</text>
          </g>

          <!-- College Security Desk (sp_3) -->
          <g class="map-pin-group" data-pin="sp_3" style="cursor: pointer;">
            <circle cx="44" cy="48" r="2.6" fill="#34F5B0" stroke="#FFFFFF" stroke-width="0.6" />
            <text x="44" y="49.2" fill="#05070C" font-size="2.2" font-weight="900" text-anchor="middle">S</text>
          </g>

          <!-- Public Safe Haven Pharmacy (sp_4) -->
          <g class="map-pin-group" data-pin="sp_4" style="cursor: pointer;">
            <circle cx="60" cy="72" r="2.6" fill="#34F5B0" stroke="#FFFFFF" stroke-width="0.6" />
            <text x="60" y="73.2" fill="#05070C" font-size="2.2" font-weight="900" text-anchor="middle">Rx</text>
          </g>

          <!-- Verified SafeLink Helpers (Blue Shields/Pins) -->
          <!-- Rahul Verma (hlp_204) -->
          <g class="map-pin-group" data-pin="hlp_204" style="cursor: pointer;">
            <circle cx="48" cy="52" r="2.8" fill="#0EA5E9" stroke="#5EEAD4" stroke-width="0.8" />
            <text x="48" y="53.1" fill="#FFFFFF" font-size="2.4" font-weight="900" text-anchor="middle">H</text>
          </g>

          <!-- Dr. Maya (hlp_205) -->
          <g class="map-pin-group" data-pin="hlp_205" style="cursor: pointer;">
            <circle cx="62" cy="35" r="2.6" fill="#0EA5E9" stroke="#5EEAD4" stroke-width="0.8" />
            <text x="62" y="36.1" fill="#FFFFFF" font-size="2.2" font-weight="900" text-anchor="middle">H</text>
          </g>

          <!-- Priya (hlp_206) -->
          <g class="map-pin-group" data-pin="hlp_206" style="cursor: pointer;">
            <circle cx="32" cy="68" r="2.6" fill="#0EA5E9" stroke="#5EEAD4" stroke-width="0.8" />
            <text x="32" y="69.1" fill="#FFFFFF" font-size="2.2" font-weight="900" text-anchor="middle">H</text>
          </g>

          <!-- Active Emergency / Request (Red) if active -->
          ${AppState.activeHelpRequest.isActive || AppState.sosActive ? `
            <g>
              <circle cx="52" cy="51" r="3.4" fill="#FF4D6D" stroke="#FFFFFF" stroke-width="0.8" />
              <circle cx="52" cy="51" r="6" fill="none" stroke="#FF4D6D" stroke-width="0.6">
                <animate attributeName="r" values="3.4; 8; 3.4" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1; 0; 1" dur="1.2s" repeatCount="indefinite" />
              </circle>
              <text x="52" y="52.2" fill="#FFFFFF" font-size="2.5" font-weight="900" text-anchor="middle">!</text>
            </g>
          ` : ""}
        </svg>

        <!-- Map Quick Legend Badge -->
        <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(7, 13, 30, 0.85); backdrop-filter: blur(8px); padding: 4px 8px; border-radius: var(--radius-xs); border: 1px solid var(--border-subtle); font-size: 9px; display: flex; gap: 8px;">
          <span style="color: #5EEAD4;">● You (~250m)</span>
          <span style="color: #34F5B0;">● Safe Point</span>
          <span style="color: #38BDF8;">● Helper</span>
          ${AppState.activeHelpRequest.isActive ? '<span style="color: #FF4D6D;">● Active Alert</span>' : ''}
        </div>
      </div>

      <!-- Selected Pin Information Card (Dynamically updated on click) -->
      <div id="map-pin-details-card" class="card" style="margin-bottom: 8px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <span class="stat-pill teal" style="margin-bottom: 4px;">Verified Safe Haven</span>
            <h4 style="font-size: 14px; font-weight: 700;">Campus Police Desk & 24/7 Hub</h4>
            <p style="font-size: 11px; color: var(--text-muted);">Main Admin Gate • Staffed 24/7 with CCTV</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: 700; color: var(--accent-teal);">350m</div>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 10px; margin-top: 4px;">Navigate</button>
          </div>
        </div>
      </div>

      <!-- Mandatory Safety Map Disclaimer -->
      <div class="map-disclaimer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        <span>
          “Community reports and safety information may be incomplete or outdated. SafeLink does not guarantee personal safety.”
        </span>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 5 — REQUEST HELP (Modal & Flow)
  // -------------------------------------------------------------
  function openRequestHelpModal() {
    SafeLinkAudio.playClick();
    const modal = document.getElementById("request-help-modal");
    if (modal) {
      modal.classList.add("active");
    }
  }

  window.openRequestHelpModal = openRequestHelpModal;

  function handleCreateHelpRequest(type) {
    SafeLinkAudio.playAlert();
    AppState.activeHelpRequest.isActive = true;
    AppState.activeHelpRequest.type = type || "I feel unsafe";
    AppState.activeHelpRequest.status = "broadcast";
    AppState.activeHelpRequest.shareApproximateLocation = document.getElementById("share-approx-loc-check")?.checked !== false;
    AppState.activeHelpRequest.requestedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Update admin log
    AppState.adminRequests.unshift({
      id: "#" + Math.floor(1025 + Math.random() * 50),
      area: "South Campus Quad Walk",
      type: AppState.activeHelpRequest.type,
      time: AppState.activeHelpRequest.requestedAt,
      status: "Responding",
      user: "Aanya S.",
      responder: "Rahul V. (Pending)",
      priority: "High"
    });
    AppState.adminStats.activeRequests += 1;

    closeAllModals();
    renderCurrentViews();
    showToast("Demo help request active: Safe Circle notice simulated and 7 helper views updated.");
  }

  // -------------------------------------------------------------
  // SCREEN 6 & 7 — NEARBY HELPER ALERT & RESPONSE (Helper Perspective)
  // -------------------------------------------------------------
  function renderHelperIdleView() {
    return `
      <div style="padding: 16px 8px;">
        <div class="app-header">
          <div class="user-snippet">
            <div class="user-avatar" style="background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));">${SafeLinkData.helperUser.avatar}</div>
            <div class="user-info-text">
              <h3>${SafeLinkData.helperUser.name}</h3>
              <p>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Verified Campus Marshal
              </p>
            </div>
          </div>
          <span class="stat-pill teal">● On Duty</span>
        </div>

        <div class="card" style="text-align: center; padding: 32px 16px; margin-top: 40px;">
          <div style="width: 60px; height: 60px; margin: 0 auto 16px; border-radius: 50%; background: rgba(72, 202, 228, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-cyan);">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">Safety Network Standby</h4>
          <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5; max-width: 260px; margin: 0 auto 20px;">
            You are active in the South Campus mesh. You will receive real-time alerts if a community member requests nearby assistance.
          </p>
          <div style="display: inline-flex; align-items: center; gap: 8px; font-size: 11px; background: rgba(6, 214, 160, 0.1); color: var(--accent-teal); padding: 6px 14px; border-radius: var(--radius-full); border: 1px solid rgba(6, 214, 160, 0.3);">
            <span>7 Helpers in Quadrant</span> • <span>Ready</span>
          </div>
        </div>

        <div class="card" style="margin-top: 16px;">
          <div style="font-size: 12px; font-weight: 700; margin-bottom: 8px; color: var(--text-secondary);">Marshal Quick Tools</div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" id="helper-simulate-alert-trigger" style="flex: 1; font-size: 11px; color: var(--accent-amber); border-color: rgba(255, 183, 3, 0.4);">
              Simulate Alert
            </button>
            <button class="btn-secondary" id="helper-emergency-call" style="flex: 1; font-size: 11px;">
              Call Campus Security
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // SCREEN 6: Helper Alert Incoming Box
  function renderHelperIncomingAlertView() {
    return `
      <div style="padding: 14px 6px;">
        <div class="app-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="alert-badge">DEMO ALERT</span>
            <span style="font-size: 13px; font-weight: 800; color: #fff;">SafeLink Dispatch</span>
          </div>
          <span style="font-size: 11px; color: var(--accent-cyan); font-weight: 700;">Helper Demo View</span>
        </div>

        <!-- Alert Container (Screen 6 Required Content) -->
        <div class="helper-alert-box">
          <div class="alert-header-row">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--accent-red); display: flex; align-items: center; justify-content: center; color: white;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
            </div>
            <div>
              <h3 style="font-size: 16px; font-weight: 800; color: #fff;">Assistance Request Nearby</h3>
              <p style="font-size: 11px; color: var(--text-secondary);">Someone nearby has requested assistance.</p>
            </div>
          </div>

          <div style="background: rgba(0,0,0,0.35); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 12px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
              <div>
                <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Approximate Distance (demo):</span>
                <div style="font-weight: 700; color: var(--accent-cyan); font-size: 14px;">~280m away</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Area:</span>
                <div style="font-weight: 700; color: #fff;">South Campus Quad</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Request Type:</span>
                <div style="font-weight: 700; color: var(--accent-amber);">${AppState.activeHelpRequest.type}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Time:</span>
                <div style="font-weight: 700; color: #fff;">${AppState.activeHelpRequest.requestedAt || "Just now"}</div>
              </div>
            </div>
          </div>

          <!-- Non-confrontational safety instructions (CRITICAL REQUIREMENT) -->
          <div class="safety-notice-card">
            <strong>⚠️ SAFETY INSTRUCTIONS:</strong>
            <p style="margin-top: 4px;">
              Do not physically intervene or confront dangerous individuals. Maintain a safe distance, provide a calm escort to a verified Safe Point, or contact emergency/security services.
            </p>
          </div>

          <!-- Helper Response Buttons -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">
            <button class="btn-primary" id="btn-helper-accept" style="background: linear-gradient(135deg, var(--accent-teal), #0096C7); font-size: 14px; padding: 12px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              I CAN ASSIST
            </button>

            <button class="btn-secondary" id="btn-helper-call-dispatch" style="color: var(--accent-amber); border-color: rgba(255, 183, 3, 0.4);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              CONTACT EMERGENCY SERVICES
            </button>

            <button class="btn-secondary" id="btn-helper-decline" style="color: var(--text-muted);">
              I CANNOT ASSIST (Route to Next)
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // SCREEN 7: Help Response View (Helper Screen after accepting)
  function renderHelperActiveResponseView() {
    return `
      <div style="padding: 14px 6px;">
        <div class="app-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="stat-pill teal">Active Escort</span>
            <span style="font-size: 13px; font-weight: 800; color: #fff;">Response Coordinated</span>
          </div>
        </div>

        <div class="card" style="border-color: var(--accent-teal); background: rgba(6, 214, 160, 0.08);">
          <div style="text-align: center; margin-bottom: 14px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--accent-teal); color: var(--ink); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style="font-size: 17px; font-weight: 800; color: #fff;">Assistance request accepted.</h3>
            <p style="font-size: 12px; color: var(--accent-teal);">Help is being coordinated safely.</p>
          </div>

          <div style="background: rgba(255,255,255,0.04); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--text-muted);">Requester:</span>
              <span style="font-weight: 700;">Aanya S. (Student)</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--text-muted);">Approx Location:</span>
              <span style="font-weight: 700; color: var(--accent-cyan);">South Campus Quad Walk</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-muted);">Privacy Guard:</span>
              <span style="color: var(--accent-teal);">250m Corridor Mode Active</span>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="btn-secondary" id="helper-call-emergency-btn" style="color: var(--accent-amber); border-color: rgba(255, 183, 3, 0.4);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Contact Emergency Services
            </button>
            <button class="btn-secondary" id="helper-mark-unavailable-btn">
              Mark Unavailable
            </button>
            <button class="btn-primary" id="helper-end-response-btn" style="background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue));">
              End Response & Confirm Safe
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // SCREEN 7: Help Response View (User Screen when helper responds)
  function renderHelpResponseScreen() {
    const helperAccepted = AppState.activeHelpRequest.status === "accepted";
    return `
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" id="help-response-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h3 style="font-size: 17px; font-weight: 700;">Assistance Request</h3>
        </div>
        <span class="stat-pill ${AppState.activeHelpRequest.status === "accepted" ? "teal" : "amber"}">${AppState.activeHelpRequest.status === "accepted" ? "Helper Responding" : "Request Active"}</span>
      </div>

      <div class="card" style="border-color: rgba(6, 214, 160, 0.5); background: linear-gradient(145deg, rgba(6, 214, 160, 0.1), rgba(19, 33, 68, 0.9));">
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-teal), var(--accent-cyan)); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; color: var(--ink);">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style="font-size: 12px; color: var(--accent-teal); font-weight: 700; text-transform: uppercase;">HELP REQUEST ACTIVE</div>
          <h2 style="font-size: 20px; font-weight: 800; margin: 4px 0;">${AppState.activeHelpRequest.status === "accepted" ? "1 verified helper is responding" : "Nearby verified helpers have been alerted"}</h2>
          <p style="font-size: 11px; color: var(--accent-cyan); font-weight: 600;">Approximate location sharing ${AppState.activeHelpRequest.shareApproximateLocation ? "on" : "off"} · ${helperAccepted ? "Helper ETA about 2 min" : "waiting for a helper to accept"} · exact location is not shown publicly</p>
        </div>

        <!-- Responder Mini Profile (Screen 7 Privacy compliant) -->
        <div style="background: rgba(255,255,255,0.05); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px; border: 1px solid var(--border-subtle);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 42px; height: 42px; border-radius: 16px; background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan)); color: var(--ink); display: flex; align-items: center; justify-content: center; font-weight: 800;">
                RV
              </div>
              <div>
                <h4 style="font-size: 14px; font-weight: 700;">Rahul Verma</h4>
                <div style="font-size: 11px; color: var(--accent-teal); display: flex; align-items: center; gap: 4px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Verified Campus Marshal • Rating 4.9
                </div>
              </div>
            </div>
            <span class="stat-pill ${helperAccepted ? "teal" : "amber"}">${helperAccepted ? "On Route" : "Alert Sent"}</span>
          </div>

          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>Privacy Note: Personal phone numbers remain masked.</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button class="btn-secondary" id="btn-help-open-camera" style="width:100%;justify-content:center;">OPEN SAFETY CAMERA</button>
          <button class="btn-primary" id="btn-user-im-safe" style="background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue)); width: 100%; padding: 12px; font-size: 14px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            I’M SAFE — RESOLVE REQUEST
          </button>
          <button class="btn-secondary" id="btn-escalate-police" style="color: var(--accent-red); border-color: rgba(255, 51, 75, 0.4);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Contact Campus Police (112)
          </button>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 8 — CHECK-IN TIMER & MISSED CHECK-IN
  // -------------------------------------------------------------
  function renderCheckInTimerScreen() {
    const isOverdue = AppState.activeJourney.isOverdue;

    if (isOverdue) {
      // Overdue Screen (Required Screen 8 State)
      return `
        <div class="app-header">
          <h3 style="font-size: 17px; font-weight: 700; color: var(--accent-amber);">Check-in Warning</h3>
          <span class="stat-pill amber">Overdue</span>
        </div>

        <div class="card" style="border-color: var(--accent-amber); background: rgba(255, 183, 3, 0.08); text-align: center; padding: 24px 16px;">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(255, 183, 3, 0.2); border: 2px solid var(--accent-amber); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-amber);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          </div>

          <h2 style="font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 6px;">Your check-in is overdue.</h2>
          <p style="font-size: 16px; font-weight: 700; color: var(--accent-amber); margin-bottom: 12px;">Are you okay?</p>
          <p style="font-size: 12px; color: var(--text-muted); max-width: 280px; margin: 0 auto 24px; line-height: 1.5;">
            Expected arrival was 4:15 PM. If you do not respond, SafeLink will notify your Safe Circle contacts.
          </p>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button class="btn-primary" id="btn-overdue-safe" style="background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue)); padding: 14px; font-size: 15px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              I’M SAFE
            </button>

            <button class="btn-danger" id="btn-overdue-request-help" style="padding: 14px; font-size: 15px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
              REQUEST HELP
            </button>
          </div>
        </div>
      `;
    }

    // Normal Check-in State
    return `
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" id="checkin-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h3 style="font-size: 17px; font-weight: 700;">Journey Check-In</h3>
        </div>
        <span class="stat-pill teal">Active Timer</span>
      </div>

      <div class="card" style="text-align: center; padding: 28px 16px;">
        <div style="font-size: 12px; font-weight: 700; color: var(--accent-teal); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
          CHECK-IN
        </div>
        <h2 style="font-size: 32px; font-weight: 800; font-family: var(--font-heading); margin-bottom: 4px;">4:15 PM</h2>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 24px;">Expected arrival at Green Park Residence</div>

        <button class="btn-primary" id="btn-checkin-im-safe" style="width: 100%; padding: 16px; font-size: 16px; background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue)); margin-bottom: 16px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          I’M SAFE
        </button>

        <div style="border-top: 1px solid var(--border-subtle); padding-top: 14px;">
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px;">
            Demo Simulator for Judges:
          </p>
          <button class="btn-secondary" id="btn-checkin-trigger-overdue" style="width: 100%; font-size: 11px; color: var(--accent-amber); border-color: rgba(255, 183, 3, 0.4);">
            ⚡ Fast-Forward: Simulate Missed Check-in
          </button>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 9 — SOS EMERGENCY SCREEN
  // -------------------------------------------------------------
  function openSOSScreen() {
    SafeLinkAudio.playClick();
    if (AppState.currentScreen === "assistant") {
      stopVoiceRecognition();
      const label = document.getElementById("assistant-listening-label");
      if (label) label.textContent = "Microphone paused for SOS confirmation";
    }
    // Open Confirmation Dialog to prevent accidental activation (Screen 9 Requirement)
    const modal = document.getElementById("sos-confirm-modal");
    if (modal) {
      modal.classList.add("active");
    }
  }

  window.openSOSScreen = openSOSScreen;

  function activateSOSConfirmed() {
    SafeLinkAudio.playSOS();
    const approximateLocationEnabled = AppState.activeJourney.isActive
      || (AppState.activeHelpRequest.isActive && AppState.activeHelpRequest.shareApproximateLocation);
    AppState.sosActive = true;
    AppState.activeHelpRequest.isActive = true;
    AppState.activeHelpRequest.type = "Emergency SOS";
    AppState.activeHelpRequest.status = "broadcast";
    AppState.activeHelpRequest.requestedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    AppState.activeHelpRequest.shareApproximateLocation = approximateLocationEnabled;
    if (AppState.safetyRecording.isActive) {
      AppState.safetyRecording.sosSnapshotStatus = "Saving the current recording privately on this device…";
      void saveRecordingSnapshot(true);
    } else {
      AppState.safetyRecording.sosSnapshotStatus = "";
    }

    // Update Admin Log
    AppState.adminRequests.unshift({
      id: "#" + Math.floor(1050 + Math.random() * 20),
      area: "Campus Central (Live SOS)",
      type: "Emergency SOS",
      time: AppState.activeHelpRequest.requestedAt,
      status: "Emergency Alert",
      user: "Aanya S.",
      responder: "Dispatch + Helpers",
      priority: "Emergency"
    });
    AppState.adminStats.activeRequests += 1;

    closeAllModals();
    navigateTo("sos");
  }

  window.activateSOSConfirmed = activateSOSConfirmed;

  function renderSOSScreen() {
    return `
      <div class="sos-active-screen">
        <div>
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 12px; height: 12px; border-radius: 50%; background: white; animation: pulse 0.8s infinite;"></span>
              <span style="font-weight: 800; font-size: 14px; letter-spacing: 1px;">DEMO SOS ACTIVE</span>
            </div>
            <span style="font-size: 11px; background: rgba(0,0,0,0.4); padding: 4px 8px; border-radius: 12px;">Live Broadcast</span>
          </div>

          <div style="text-align: center; margin: 16px 0;">
            <h1 style="font-size: 38px; font-weight: 900; letter-spacing: 1px; font-family: var(--font-heading); margin-bottom: 4px;">
              SOS ACTIVE
            </h1>
            <p style="font-size: 15px; font-weight: 700; color: #FFE3E6;">
              Active alert in this demo.
            </p>
          </div>

          ${AppState.safetyRecording.isActive ? `
            <div class="sos-recording-status">
              <strong>🔴 SAFETY RECORDING ACTIVE</strong>
              <span>Camera: ON · Microphone: ${AppState.safetyRecording.microphoneEnabled ? "ON" : "OFF"} · Duration: ${formatRecordingDuration(currentRecordingDurationSeconds())}</span>
              <span>${escapeHtml(AppState.safetyRecording.sosSnapshotStatus || "Recording continues while this screen is open.")}</span>
              <button class="btn-secondary" id="sos-recording-controls">Recording controls</button>
            </div>
          ` : ""}
          <div class="sos-recording-status">
            <strong>Safety status</strong>
            <span>Safe Circle: demo alert active · no SMS was sent</span>
            <span>Location sharing: ${AppState.activeHelpRequest.shareApproximateLocation ? "Approximate location enabled" : "Off"}</span>
            ${AppState.safetyRecording.sosSnapshotStatus ? `<span>${escapeHtml(AppState.safetyRecording.sosSnapshotStatus)}</span>` : ""}
          </div>

          <!-- Network Notification Checklist (Required Screen 9) -->
          <div style="background: rgba(0,0,0,0.45); backdrop-filter: blur(12px); border-radius: var(--radius-md); padding: 14px; border: 1px solid rgba(255,255,255,0.15); margin-bottom: 16px;">
            <div style="display: flex; flex-direction: column; gap: 10px; font-size: 12px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #06D6A0; font-weight: 800;">✓</span>
                <span>Safe Circle demo alert created · no SMS was sent</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #06D6A0; font-weight: 800;">✓</span>
                <span>Alert shown in nearby helper demo views</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #06D6A0; font-weight: 800;">✓</span>
                <span>Campus dispatch not contacted · use a call option if needed</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #06D6A0; font-weight: 800;">✓</span>
                <span>Approximate location status shown for this demo only</span>
              </div>
            </div>
          </div>

          <!-- Emergency Contact Direct Options -->
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #FFA8B3; margin-bottom: 8px;">
            Direct Emergency Call Links:
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="btn-secondary" id="sos-call-police" style="background: #FFFFFF; color: #D90429; font-weight: 800; font-size: 13px; justify-content: center; padding: 12px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              CALL EMERGENCY POLICE (112 / 911)
            </button>
            <button class="btn-secondary" id="sos-call-campus" style="background: rgba(255,255,255,0.15); color: #fff; font-weight: 700; font-size: 12px; justify-content: center;">
              CALL CAMPUS SECURITY DESK (011-2345-6789)
            </button>
          </div>
        </div>

        <div style="padding-top: 16px;">
          <!-- Cancel SOS Button (requires confirmation) -->
          <button class="btn-secondary" id="btn-trigger-cancel-sos" style="width: 100%; background: transparent; border-color: rgba(255,255,255,0.4); color: white; padding: 12px; font-weight: 700;">
            CANCEL SOS
          </button>
          <div style="font-size: 10px; text-align: center; color: rgba(255,255,255,0.7); margin-top: 8px;">
            SafeLink coordinates community assistance and does not replace official emergency services.
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 10 — SAFE CIRCLE
  // -------------------------------------------------------------
  function renderSafeCircleScreen() {
    return `
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" id="circle-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h3 style="font-size: 17px; font-weight: 700;">Safe Circle</h3>
        </div>
        <button class="btn-secondary" id="btn-add-contact-modal" style="padding: 4px 10px; font-size: 11px;">
          + Add Contact
        </button>
      </div>

      <div class="card" style="background: rgba(72, 202, 228, 0.08); border-color: rgba(72, 202, 228, 0.25); margin-bottom: 14px;">
        <p style="font-size: 12px; color: var(--accent-cyan); line-height: 1.4;">
          “Your Safe Circle receives alerts when you choose to share them.”
        </p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${AppState.safeCircle.map((c, idx) => `
          <div class="card" style="padding: 12px 14px; margin-bottom: 0;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${c.color}; color: var(--ink); display: flex; align-items: center; justify-content: center; font-weight: 800;">
                  ${c.initials}
                </div>
                <div>
                  <h4 style="font-size: 14px; font-weight: 700;">${c.name}</h4>
                  <p style="font-size: 11px; color: var(--text-muted);">${c.relation} • ${c.phone}</p>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <button class="icon-btn call-contact-btn" data-name="${c.name}" data-phone="${c.phone}" title="Call ${c.name}" style="width: 32px; height: 32px; background: rgba(6, 214, 160, 0.15); color: var(--accent-teal); border-color: rgba(6, 214, 160, 0.3);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </button>
                <button class="icon-btn test-ping-btn" data-contact="${c.name}" title="Simulate Alert Ping" style="width: 32px; height: 32px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                </button>
                <button class="icon-btn remove-contact-btn" data-idx="${idx}" title="Remove Contact" style="width: 32px; height: 32px; color: var(--accent-red);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 11 — VERIFIED HELPER NETWORK
  // -------------------------------------------------------------
  function renderHelperNetworkScreen() {
    return `
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" id="network-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h3 style="font-size: 17px; font-weight: 700;">Verified Helpers</h3>
        </div>
        <span class="stat-pill teal">7 Nearby</span>
      </div>

      <div class="card" style="padding: 10px 14px; margin-bottom: 12px; background: rgba(19, 33, 68, 0.6);">
        <p style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">
          All helpers are identity-verified university staff, campus marshals, and trained student safety leads. Sensitive contact information remains private.
        </p>
      </div>

      <div style="display: flex; flex-direction: column;">
        ${AppState.helpers.map(h => `
          <div class="helper-card">
            <div class="helper-left">
              <div class="helper-avatar-badge">${h.name.split(" ")[0][0]}</div>
              <div class="helper-details">
                <h5>
                  ${h.name}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </h5>
                <p>${h.role} • ${h.credential}</p>
              </div>
            </div>
            <div class="helper-right">
              <div class="helper-dist">${h.distance}</div>
              <div class="helper-role" style="color: ${h.availability.includes('Now') || h.availability.includes('Staffed') ? 'var(--accent-teal)' : 'var(--text-muted)'};">
                ${h.availability}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // -------------------------------------------------------------
  // SCREEN 12 — PROFILE & PRIVACY SETTINGS
  // -------------------------------------------------------------
  function renderProfileScreen() {
    const user = SafeLinkData.currentUser;
    return `
      <div class="app-header">
        <h3 style="font-size: 17px; font-weight: 700;">Member Profile</h3>
        <span class="stat-pill teal">Verified</span>
      </div>

      <div class="card" style="text-align: center; padding: 20px 16px;">
        <div style="width: 64px; height: 64px; border-radius: 20px; background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan)); color: var(--ink); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; margin: 0 auto 12px; border: 1px solid rgba(255,255,255,0.2);">
          ${user.avatar}
        </div>
        <h3 style="font-size: 18px; font-weight: 800;">${user.name}</h3>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">${user.role}</p>
        <span class="stat-pill teal" style="margin-bottom: 12px;">✓ University ID Verified</span>
      </div>

      <!-- Settings & Privacy Section -->
      <div class="card">
        <div class="card-title-row">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Privacy & Location Controls
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 12px;">
          <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div>
              <div style="font-weight: 600;">Approximate Location Only</div>
              <div style="font-size: 10px; color: var(--text-muted);">Mask exact GPS with 250m safety corridor</div>
            </div>
            <input type="checkbox" checked style="accent-color: var(--accent-cyan); width: 18px; height: 18px;">
          </label>

          <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div>
              <div style="font-weight: 600;">Auto-Expire Journey Sharing</div>
              <div style="font-size: 10px; color: var(--text-muted);">Location sharing terminates when journey ends</div>
            </div>
            <input type="checkbox" checked style="accent-color: var(--accent-cyan); width: 18px; height: 18px;">
          </label>

          <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div>
              <div style="font-weight: 600;">Community Helper Alerts</div>
              <div style="font-size: 10px; color: var(--text-muted);">Receive notifications for nearby emergencies</div>
            </div>
            <input type="checkbox" checked style="accent-color: var(--accent-cyan); width: 18px; height: 18px;">
          </label>
        </div>
      </div>

      <!-- Future Vision / Future Scope Link Button -->
      <div class="card" style="cursor: pointer; border-color: rgba(72, 202, 228, 0.4);" id="profile-future-scope-btn">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: rgba(72, 202, 228, 0.15); color: var(--accent-cyan); display: flex; align-items: center; justify-content: center;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="12 8 8 12 12 16 12 8"></polygon></svg>
            </div>
            <div>
              <h4 style="font-size: 13px; font-weight: 700;">Future Vision & Roadmap</h4>
              <p style="font-size: 10px; color: var(--text-muted);">Campus mesh, AI analysis, CAD dispatch</p>
            </div>
          </div>
          <span style="color: var(--accent-cyan); font-weight: 700;">Explore →</span>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // ADMIN DASHBOARD SCREEN (Screen 13 / Web Style View)
  // -------------------------------------------------------------
  function renderAdminDashboard() {
    const container = document.getElementById("admin-view-stage");
    if (!container) return;

    container.innerHTML = `
      <div class="admin-container">
        <div class="admin-header">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--accent-cyan); text-transform: uppercase; letter-spacing: 1px;">
              SafeLink Operations & Dispatch
            </div>
            <h2 style="font-size: 24px; font-weight: 800; font-family: var(--font-heading);">
              University Safety Admin Dashboard
            </h2>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" id="admin-verify-helper-btn" style="font-size: 12px;">
              + Verify New Helper
            </button>
            <button class="btn-primary" id="admin-back-to-app-btn" style="font-size: 12px;">
              Back to Mobile Demo
            </button>
          </div>
        </div>

        <!-- 4 Stats Cards (Screen 13 Requirement) -->
        <div class="admin-stats-grid">
          <div class="admin-stat-card">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-sm); background: rgba(72, 202, 228, 0.15); color: var(--accent-cyan); display: flex; align-items: center; justify-content: center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            </div>
            <div>
              <div class="admin-stat-number">${AppState.adminStats.activeUsers}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Active Users</div>
            </div>
          </div>

          <div class="admin-stat-card">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-sm); background: rgba(6, 214, 160, 0.15); color: var(--accent-teal); display: flex; align-items: center; justify-content: center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <div class="admin-stat-number">${AppState.adminStats.verifiedHelpers}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Verified Helpers</div>
            </div>
          </div>

          <div class="admin-stat-card">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-sm); background: rgba(255, 51, 75, 0.15); color: var(--accent-red); display: flex; align-items: center; justify-content: center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
            </div>
            <div>
              <div class="admin-stat-number">${AppState.adminStats.activeRequests}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Active Requests</div>
            </div>
          </div>

          <div class="admin-stat-card">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-sm); background: rgba(255, 183, 3, 0.15); color: var(--accent-amber); display: flex; align-items: center; justify-content: center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div class="admin-stat-number">${AppState.adminStats.resolvedRequests}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Resolved Requests</div>
            </div>
          </div>
        </div>

        <!-- Requests Table (Screen 13 Requirement) -->
        <div style="margin-top: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="font-size: 16px; font-weight: 700;">Live Community Incident Dispatch Log</h3>
            <span style="font-size: 11px; color: var(--text-muted);">Real-time synchronized mesh</span>
          </div>

          <table class="admin-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Area</th>
                <th>Type</th>
                <th>Time</th>
                <th>Status</th>
                <th>User</th>
                <th>Responder</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${AppState.adminRequests.map(r => `
                <tr>
                  <td style="font-weight: 700; color: var(--accent-cyan);">${r.id}</td>
                  <td>${r.area}</td>
                  <td>
                    <span class="stat-pill ${r.type.includes('Medical') || r.type.includes('SOS') ? 'red' : 'amber'}" style="font-size: 10px;">
                      ${r.type}
                    </span>
                  </td>
                  <td>${r.time}</td>
                  <td>
                    <span class="stat-pill ${r.status === 'Resolved' ? 'teal' : 'amber'}" style="font-size: 10px;">
                      ${r.status}
                    </span>
                  </td>
                  <td>${r.user}</td>
                  <td>${r.responder}</td>
                  <td>
                    ${r.status !== 'Resolved' ? `
                      <button class="btn-secondary admin-resolve-btn" data-id="${r.id}" style="padding: 4px 8px; font-size: 10px; color: var(--accent-teal);">
                        Mark Resolved
                      </button>
                    ` : `
                      <span style="font-size: 11px; color: var(--text-dim);">Closed</span>
                    `}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Admin listeners
    const backBtn = document.getElementById("admin-back-to-app-btn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        setViewMode("single");
      });
    }

    document.querySelectorAll(".admin-resolve-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const req = AppState.adminRequests.find(r => r.id === id);
        if (req) {
          req.status = "Resolved";
          AppState.adminStats.activeRequests = Math.max(0, AppState.adminStats.activeRequests - 1);
          AppState.adminStats.resolvedRequests += 1;
          SafeLinkAudio.playSuccess();
          renderAdminDashboard();
          showToast(`Request ${id} marked resolved.`);
        }
      });
    });

    const verifyBtn = document.getElementById("admin-verify-helper-btn");
    if (verifyBtn) {
      verifyBtn.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        showToast("New volunteer helper credential verified and added to mesh.");
        AppState.adminStats.verifiedHelpers += 1;
        renderAdminDashboard();
      });
    }
  }

  // -------------------------------------------------------------
  // ATTACH EVENT LISTENERS TO RENDERED VIEWS
  // -------------------------------------------------------------
  function attachDynamicViewListeners() {
    setupSafetyFeatureListeners();

    // Welcome Screen Logins
    const btnLoginStudent = document.getElementById("btn-login-student");
    if (btnLoginStudent) {
      btnLoginStudent.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        navigateTo("home");
      });
    }

    const btnLoginHelper = document.getElementById("btn-login-helper");
    if (btnLoginHelper) {
      btnLoginHelper.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        setViewMode("dual");
      });
    }

    const btnLoginAdmin = document.getElementById("btn-login-admin");
    if (btnLoginAdmin) {
      btnLoginAdmin.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        setViewMode("admin");
      });
    }

    // Home Screen Actions
    const btnStartJourney = document.getElementById("btn-start-journey");
    if (btnStartJourney) {
      btnStartJourney.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        navigateTo("journey");
      });
    }

    const btnRequestHelp = document.getElementById("btn-request-help");
    if (btnRequestHelp) {
      btnRequestHelp.addEventListener("click", () => {
        openRequestHelpModal();
      });
    }

    const headerMapBtn = document.getElementById("header-map-btn");
    if (headerMapBtn) {
      headerMapBtn.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        navigateTo("map");
      });
    }

    const headerPrivacyBtn = document.getElementById("header-privacy-btn");
    if (headerPrivacyBtn) {
      headerPrivacyBtn.addEventListener("click", () => {
        openPrivacyModal();
      });
    }

    const homeHelpersLink = document.getElementById("home-helpers-link");
    if (homeHelpersLink) {
      homeHelpersLink.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        navigateTo("helpers");
      });
    }

    const homeSafepointsLink = document.getElementById("home-safepoints-link");
    if (homeSafepointsLink) {
      homeSafepointsLink.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        navigateTo("map");
      });
    }

    const quickManageCircle = document.getElementById("btn-quick-manage-circle");
    if (quickManageCircle) {
      quickManageCircle.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        navigateTo("safecircle");
      });
    }

    const viewActiveJourneyBtn = document.getElementById("view-active-journey-btn");
    if (viewActiveJourneyBtn) {
      viewActiveJourneyBtn.addEventListener("click", () => {
        navigateTo("journey");
      });
    }

    const viewActiveResponseBtn = document.getElementById("view-active-response-btn");
    if (viewActiveResponseBtn) {
      viewActiveResponseBtn.addEventListener("click", () => {
        navigateTo("help-response");
      });
    }

    // SafeScore Check-in button
    const btnDailyCheckin = document.getElementById("btn-daily-checkin");
    if (btnDailyCheckin) {
      btnDailyCheckin.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        btnDailyCheckin.textContent = "Checked ✓";
        btnDailyCheckin.style.background = "var(--accent-teal)";
        btnDailyCheckin.style.color = "var(--ink)";
        showToast("🔥 Daily Safe Commute Logged! Streak increased to 15 Days.");
      });
    }

    // Quick Toolkit - Fake Call
    const toolFakeCall = document.getElementById("tool-fake-call");
    if (toolFakeCall) {
      toolFakeCall.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        showToast("⏳ Fake Call scheduled: Phone will ring in 5 seconds to help you exit safely.");
        setTimeout(() => {
          triggerPhoneCall("Ronak", "+91 98111 22334", "👩‍👧");
        }, 5000);
      });
    }

    // Quick Toolkit - Safety Siren
    const toolSafetySiren = document.getElementById("tool-safety-siren");
    if (toolSafetySiren) {
      toolSafetySiren.addEventListener("click", () => {
        startSafetySiren();
      });
    }

    // Quick Toolkit - Buddy Walk
    const toolBuddyWalk = document.getElementById("tool-buddy-walk");
    if (toolBuddyWalk) {
      toolBuddyWalk.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        showToast("🚶 Virtual Buddy Walk corridor active with Campus Security Mesh.");
      });
    }

    // Quick Toolkit - Battery Guard
    const toolBatteryGuard = document.getElementById("tool-battery-guard");
    if (toolBatteryGuard) {
      toolBatteryGuard.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        showToast("🔋 Battery Guard Active: 88% battery. Emergency low-power alert armed.");
      });
    }

    // Journey Form
    const startJourneyForm = document.getElementById("start-journey-form");
    if (startJourneyForm) {
      startJourneyForm.addEventListener("submit", (e) => {
        e.preventDefault();
        SafeLinkAudio.playSuccess();
        const startVal = document.getElementById("journey-start-input").value;
        const destVal = document.getElementById("journey-dest-input").value;
        AppState.activeJourney.isActive = true;
        AppState.activeJourney.startPoint = startVal;
        AppState.activeJourney.destination = destVal;
        AppState.activeJourney.isOverdue = false;
        AppState.activeJourney.remainingSeconds = 22 * 60;

        // Timer countdown simulation
        if (AppState.activeJourney.intervalId) clearInterval(AppState.activeJourney.intervalId);
        AppState.activeJourney.intervalId = setInterval(() => {
          if (AppState.activeJourney.remainingSeconds > 0) {
            AppState.activeJourney.remainingSeconds -= 5;
            const etaLive = document.getElementById("journey-live-eta");
            const homeEta = document.getElementById("home-eta-countdown");
            const minLeft = Math.max(1, Math.ceil(AppState.activeJourney.remainingSeconds / 60));
            if (etaLive) etaLive.textContent = `ETA: ${minLeft} min`;
            if (homeEta) homeEta.textContent = `ETA: ${minLeft} min`;
          }
        }, 1000);

        renderCurrentViews();
        showToast("Journey started. Safe Circle demo status updated; no external message was sent.");
      });
    }

    // Journey Presets
    document.querySelectorAll(".eta-preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".eta-preset-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const min = btn.getAttribute("data-min");
        const display = document.getElementById("eta-display");
        if (display) display.textContent = `${min} Minutes`;
      });
    });

    // Active Journey Action Buttons
    const btnShareJourney = document.getElementById("btn-share-journey");
    if (btnShareJourney) {
      btnShareJourney.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        showToast("Journey shared in the Safe Circle demo view; no external message was sent.");
      });
    }

    const btnJourneyCheckin = document.getElementById("btn-journey-checkin");
    if (btnJourneyCheckin) {
      btnJourneyCheckin.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        navigateTo("checkin");
      });
    }

    const btnJourneyRequestHelp = document.getElementById("btn-journey-request-help");
    if (btnJourneyRequestHelp) {
      btnJourneyRequestHelp.addEventListener("click", () => {
        openRequestHelpModal();
      });
    }

    const btnEndJourney = document.getElementById("btn-end-journey");
    if (btnEndJourney) {
      btnEndJourney.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        if (AppState.activeJourney.intervalId) clearInterval(AppState.activeJourney.intervalId);
        AppState.activeJourney.isActive = false;
        AppState.activeJourney.isOverdue = false;
        renderCurrentViews();
        showToast("Journey ended. Location sharing automatically terminated.");
      });
    }

    // Missed Check-in Simulator Button
    const btnSimulateOverdue = document.getElementById("btn-simulate-overdue");
    if (btnSimulateOverdue) {
      btnSimulateOverdue.addEventListener("click", () => {
        runMissedCheckinScenario();
      });
    }

    // Checkin Screen Buttons
    const btnCheckinImSafe = document.getElementById("btn-checkin-im-safe");
    if (btnCheckinImSafe) {
      btnCheckinImSafe.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        showToast("Check-in confirmed! Safe Circle informed you are on track.");
        navigateTo("journey");
      });
    }

    const btnCheckinTriggerOverdue = document.getElementById("btn-checkin-trigger-overdue");
    if (btnCheckinTriggerOverdue) {
      btnCheckinTriggerOverdue.addEventListener("click", () => {
        runMissedCheckinScenario();
      });
    }

    const btnOverdueSafe = document.getElementById("btn-overdue-safe");
    if (btnOverdueSafe) {
      btnOverdueSafe.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        AppState.activeJourney.isOverdue = false;
        renderCurrentViews();
        showToast("Check-in confirmed. Safe Circle demo status updated.");
        navigateTo("journey");
      });
    }

    const btnOverdueRequestHelp = document.getElementById("btn-overdue-request-help");
    if (btnOverdueRequestHelp) {
      btnOverdueRequestHelp.addEventListener("click", () => {
        handleCreateHelpRequest("Missed Check-in Alert");
        navigateTo("map");
      });
    }

    // Help Response Screen Buttons (User View)
    const btnUserImSafe = document.getElementById("btn-user-im-safe");
    if (btnUserImSafe) {
      btnUserImSafe.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        if (AppState.activeJourney.intervalId) clearInterval(AppState.activeJourney.intervalId);
        AppState.activeJourney.isActive = false;
        AppState.activeJourney.isOverdue = false;
        AppState.activeHelpRequest.isActive = false;
        AppState.activeHelpRequest.status = "idle";
        AppState.activeHelpRequest.assignedHelper = null;
        renderCurrentViews();
        showToast("Assistance request resolved. Thank you for confirming you are safe!");
        navigateTo("home");
      });
    }

    const btnHelpOpenCamera = document.getElementById("btn-help-open-camera");
    if (btnHelpOpenCamera) btnHelpOpenCamera.addEventListener("click", () => navigateTo("camera"));

    // Back buttons
    ["journey", "map", "circle", "network", "checkin", "help-response"].forEach(prefix => {
      const btn = document.getElementById(`${prefix}-back-btn`);
      if (btn) {
        btn.addEventListener("click", () => {
          SafeLinkAudio.playClick();
          navigateTo("home");
        });
      }
    });

    // Profile Screen Buttons
    const profileFutureScopeBtn = document.getElementById("profile-future-scope-btn");
    if (profileFutureScopeBtn) {
      profileFutureScopeBtn.addEventListener("click", () => {
        openFutureScopeModal();
      });
    }

    // SOS Emergency Screen Buttons
    const btnTriggerCancelSOS = document.getElementById("btn-trigger-cancel-sos");
    if (btnTriggerCancelSOS) {
      btnTriggerCancelSOS.addEventListener("click", () => {
        openCancelSOSModal();
      });
    }

    const sosCallPolice = document.getElementById("sos-call-police");
    if (sosCallPolice) {
      sosCallPolice.addEventListener("click", () => {
        triggerPhoneCall("National Emergency Police", "112", "🚨");
      });
    }

    const sosCallCampus = document.getElementById("sos-call-campus");
    if (sosCallCampus) {
      sosCallCampus.addEventListener("click", () => {
        triggerPhoneCall("Campus Security Hub", "011-2345-6789", "🛡️");
      });
    }

    const btnEscalatePolice = document.getElementById("btn-escalate-police");
    if (btnEscalatePolice) {
      btnEscalatePolice.addEventListener("click", () => {
        triggerPhoneCall("National Emergency Police", "112", "🚨");
      });
    }

    // Safe Circle Direct Call Buttons
    document.querySelectorAll(".call-contact-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-name");
        const phone = btn.getAttribute("data-phone");
        triggerPhoneCall(name, phone, "📞");
      });
    });

    // Safe Circle Test Ping
    document.querySelectorAll(".test-ping-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        const contact = btn.getAttribute("data-contact");
        showToast(`Simulated encrypted safety ping sent to ${contact}`);
      });
    });

    document.querySelectorAll(".remove-contact-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        AppState.safeCircle.splice(idx, 1);
        renderCurrentViews();
        showToast("Contact removed from Safe Circle.");
      });
    });

    const btnAddContactModal = document.getElementById("btn-add-contact-modal");
    if (btnAddContactModal) {
      btnAddContactModal.addEventListener("click", () => {
        openAddContactModal();
      });
    }
  }

  // -------------------------------------------------------------
  // CALLING SCREEN & PHONE DIALER CONTROLLER
  // -------------------------------------------------------------
  let activeCallTimer = null;
  let callSeconds = 0;

  function triggerPhoneCall(name, number, avatarIcon = "📞") {
    SafeLinkAudio.playClick();
    const modal = document.getElementById("in-app-call-modal");
    if (!modal) return;

    // Start ringtone
    SafeLinkAudio.playRingtone();

    // Populate UI
    const nameEl = document.getElementById("call-contact-name");
    const numEl = document.getElementById("call-contact-number");
    const avatarEl = document.getElementById("call-avatar-circle");
    const statusEl = document.getElementById("call-status-text");
    const nativeLink = document.getElementById("native-sim-dial-btn");

    if (nameEl) nameEl.textContent = name;
    if (numEl) numEl.textContent = number;
    if (avatarEl) avatarEl.textContent = avatarIcon;
    if (nativeLink) {
      nativeLink.href = "tel:" + number.replace(/[^0-9+]/g, "");
    }

    if (statusEl) {
      statusEl.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent-teal); animation: pulse 1s infinite;"></span> Ringing...`;
    }

    // Reset Call duration
    if (activeCallTimer) clearInterval(activeCallTimer);
    callSeconds = 0;

    // Simulate pick-up after 3.2 seconds
    setTimeout(() => {
      if (modal.classList.contains("active")) {
        SafeLinkAudio.stopRingtone();
        SafeLinkAudio.playSuccess();
        if (statusEl) {
          statusEl.innerHTML = `<span style="color: var(--accent-teal); font-weight: 700;">● Connected (00:00)</span>`;
        }
        activeCallTimer = setInterval(() => {
          callSeconds++;
          const mins = String(Math.floor(callSeconds / 60)).padStart(2, "0");
          const secs = String(callSeconds % 60).padStart(2, "0");
          if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--accent-teal); font-weight: 700;">● Connected (${mins}:${secs})</span>`;
          }
        }, 1000);
      }
    }, 3200);

    modal.classList.add("active");
  }

  function endCurrentCall() {
    SafeLinkAudio.playClick();
    SafeLinkAudio.stopRingtone();
    if (activeCallTimer) {
      clearInterval(activeCallTimer);
      activeCallTimer = null;
    }
    callSeconds = 0;
    const modal = document.getElementById("in-app-call-modal");
    if (modal) modal.classList.remove("active");
    showToast("Call ended.");
  }

  window.triggerPhoneCall = triggerPhoneCall;
  window.endCurrentCall = endCurrentCall;

  // Safety Siren Strobe Controller
  function startSafetySiren() {
    SafeLinkAudio.playSiren();
    const overlay = document.getElementById("siren-strobe-overlay");
    if (overlay) overlay.classList.add("active");
    showToast("⚠️ Safety Siren Active! High-frequency acoustic deterrent armed.");
  }

  function stopSafetySiren() {
    SafeLinkAudio.playClick();
    SafeLinkAudio.stopSiren();
    const overlay = document.getElementById("siren-strobe-overlay");
    if (overlay) overlay.classList.remove("active");
    showToast("Safety Siren turned off.");
  }

  window.startSafetySiren = startSafetySiren;
  window.stopSafetySiren = stopSafetySiren;

  // -------------------------------------------------------------
  // HELPER VIEW LISTENERS (Rahul's phone)
  // -------------------------------------------------------------
  function attachHelperViewListeners() {
    const btnHelperAccept = document.getElementById("btn-helper-accept");
    if (btnHelperAccept) {
      btnHelperAccept.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        AppState.activeHelpRequest.status = "accepted";
        AppState.activeHelpRequest.assignedHelper = SafeLinkData.helperUser;
        renderCurrentViews();
        showToast("Assistance accepted! Navigating to requester approximate zone.");
      });
    }

    const btnHelperDecline = document.getElementById("btn-helper-decline");
    if (btnHelperDecline) {
      btnHelperDecline.addEventListener("click", () => {
        SafeLinkAudio.playClick();
        showToast("Alert dismissed. Automatically routed to next closest verified helper.");
        AppState.activeHelpRequest.status = "broadcast";
        renderCurrentViews();
      });
    }

    const helperEndResponseBtn = document.getElementById("helper-end-response-btn");
    if (helperEndResponseBtn) {
      helperEndResponseBtn.addEventListener("click", () => {
        SafeLinkAudio.playSuccess();
        AppState.activeHelpRequest.isActive = false;
        AppState.activeHelpRequest.status = "idle";
        AppState.activeHelpRequest.assignedHelper = null;
        renderCurrentViews();
        showToast("Response complete and logged as Safe in Admin Dispatch.");
      });
    }

    const btnHelperCallDispatch = document.getElementById("btn-helper-call-dispatch");
    if (btnHelperCallDispatch) {
      btnHelperCallDispatch.addEventListener("click", () => {
        triggerPhoneCall("National Emergency Police", "112", "🚨");
      });
    }

    const helperCallEmergencyBtn = document.getElementById("helper-call-emergency-btn");
    if (helperCallEmergencyBtn) {
      helperCallEmergencyBtn.addEventListener("click", () => {
        triggerPhoneCall("National Emergency Police", "112", "🚨");
      });
    }

    const helperEmergencyCall = document.getElementById("helper-emergency-call");
    if (helperEmergencyCall) {
      helperEmergencyCall.addEventListener("click", () => {
        triggerPhoneCall("Campus Security Hub", "011-2345-6789", "🛡️");
      });
    }

    const helperSimulateAlertTrigger = document.getElementById("helper-simulate-alert-trigger");
    if (helperSimulateAlertTrigger) {
      helperSimulateAlertTrigger.addEventListener("click", () => {
        handleCreateHelpRequest("Safety Escort Needed");
      });
    }
  }

  // -------------------------------------------------------------
  // INTERACTIVE SAFETY MAP PIN CLICK HANDLERS
  // -------------------------------------------------------------
  function setupMapInteraction() {
    document.addEventListener("click", (e) => {
      const pinGroup = e.target.closest(".map-pin-group");
      if (pinGroup) {
        const pinId = pinGroup.getAttribute("data-pin");
        displayMapPinDetails(pinId);
      }
    });
  }

  function displayMapPinDetails(pinId) {
    SafeLinkAudio.playClick();
    const detailsContainer = document.getElementById("map-pin-details-card");
    if (!detailsContainer) return;

    // Check if SafePoint
    const safePoint = SafeLinkData.safePoints.find(sp => sp.id === pinId);
    if (safePoint) {
      detailsContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <span class="stat-pill teal" style="margin-bottom: 4px;">Verified Safe Point</span>
            <h4 style="font-size: 14px; font-weight: 700;">${safePoint.name}</h4>
            <p style="font-size: 11px; color: var(--text-muted);">${safePoint.location} • ${safePoint.hours}</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: 700; color: var(--accent-teal);">${safePoint.distance}</div>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 10px; margin-top: 4px;" onclick="SafeLinkAudio.playClick(); alert('Walking directions simulated to SafePoint.');">
              Direct Route
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Check if Helper
    const helper = SafeLinkData.verifiedHelpers.find(h => h.id === pinId);
    if (helper) {
      detailsContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <span class="stat-pill blue" style="margin-bottom: 4px;">${helper.badge}</span>
            <h4 style="font-size: 14px; font-weight: 700;">${helper.name}</h4>
            <p style="font-size: 11px; color: var(--text-muted);">${helper.role} • Rating ${helper.rating} ★</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: 700; color: var(--accent-cyan);">${helper.distance}</div>
            <span class="stat-pill teal" style="margin-top: 4px; font-size: 10px;">${helper.availability}</span>
          </div>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------
  // COMPETITION DEMO FLOW SCENARIOS (Judges' Favorite!)
  // -------------------------------------------------------------

  function scheduleDemoStep(delay, callback) {
    const timeoutId = setTimeout(() => {
      demoScenarioTimeouts = demoScenarioTimeouts.filter(id => id !== timeoutId);
      callback();
    }, delay);
    demoScenarioTimeouts.push(timeoutId);
  }

  // SCENARIO 1: Journey -> Assistant confirmation -> helper alert -> camera -> safe
  function runFullDemoScenario() {
    setViewMode("dual");
    resetAppDemoState();
    showToast("Starting guided SafeLink demo: Journey, Assistant, helper alert, camera and safe check-out.");

    scheduleDemoStep(800, () => {
      AppState.activeJourney.isActive = true;
      AppState.activeJourney.remainingSeconds = 22 * 60;
      navigateTo("journey");
      showToast("Step 1: Journey active with approximate sharing.");
    });

    scheduleDemoStep(2400, () => {
      isMicrophoneMuted = true;
      AppState.assistantTranscript = "I feel unsafe";
      AppState.assistantResponse = "I’m here with you. Do you want me to send a SafeLink assistance request?";
      AppState.assistantConfirmation = true;
      AppState.assistantConfirmationAction = "help-request";
      navigateTo("assistant");
      showToast("Step 2: Safe Assistant asks for confirmation. Demo transcript shown; microphone stays off.");
    });

    scheduleDemoStep(4300, () => {
      const confirmButton = document.getElementById("assistant-confirm-alert");
      if (confirmButton) confirmButton.click();
      showToast("Step 3: Confirmed help request appears in the nearby helper demo view.");
    });

    scheduleDemoStep(6000, () => {
      SafeLinkAudio.playSuccess();
      AppState.activeHelpRequest.status = "accepted";
      AppState.activeHelpRequest.assignedHelper = SafeLinkData.helperUser;
      renderCurrentViews();
      showToast("Step 4: Rahul accepts the demo alert. You can open Safety Camera.");
    });

    scheduleDemoStep(7600, () => {
      AppState.demoCameraPreviewOnly = true;
      navigateTo("camera");
      showToast("Step 5: Private camera preview opened. No camera permission or capture is triggered in the guided demo.");
    });

    scheduleDemoStep(10300, () => {
      AppState.demoCameraPreviewOnly = false;
      navigateTo("help-response");
      showToast("Step 6: Confirm you are safe to end the journey and help request.");
    });

    scheduleDemoStep(12500, () => {
      const safeButton = document.getElementById("btn-user-im-safe");
      if (safeButton) safeButton.click();
      isMicrophoneMuted = false;
    });
  }

  window.runFullDemoScenario = runFullDemoScenario;

  // SCENARIO 2: Journey Missed Check-in -> Request Help
  function runMissedCheckinScenario() {
    AppState.activeJourney.isActive = true;
    AppState.activeJourney.isOverdue = true;
    SafeLinkAudio.playAlert();
    navigateTo("checkin");
    renderCurrentViews();
    showToast("Simulated: Expected arrival passed! Screen 8 Check-in Warning Triggered.");
  }

  window.runMissedCheckinScenario = runMissedCheckinScenario;

  // -------------------------------------------------------------
  // MODALS MANAGEMENT
  // -------------------------------------------------------------
  function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
    if (AppState.currentScreen === "assistant" && !isMicrophoneMuted && !AppState.assistantConfirmation) {
      const label = document.getElementById("assistant-listening-label");
      if (label) label.textContent = "Safe Assistant is listening";
      beginVoiceRecognition();
    }
  }

  window.closeAllModals = closeAllModals;

  function openPrivacyModal() {
    SafeLinkAudio.playClick();
    const modal = document.getElementById("privacy-features-modal");
    if (modal) modal.classList.add("active");
  }

  window.openPrivacyModal = openPrivacyModal;

  function openFutureScopeModal() {
    SafeLinkAudio.playClick();
    const modal = document.getElementById("future-scope-modal");
    if (modal) modal.classList.add("active");
  }

  window.openFutureScopeModal = openFutureScopeModal;

  function openAddContactModal() {
    SafeLinkAudio.playClick();
    const modal = document.getElementById("add-contact-modal");
    if (modal) modal.classList.add("active");
  }

  window.openAddContactModal = openAddContactModal;

  function openCancelSOSModal() {
    SafeLinkAudio.playClick();
    const modal = document.getElementById("cancel-sos-modal");
    if (modal) modal.classList.add("active");
  }

  window.openCancelSOSModal = openCancelSOSModal;

  function confirmCancelSOS() {
    SafeLinkAudio.playSuccess();
    AppState.sosActive = false;
    AppState.activeHelpRequest.isActive = false;
    AppState.activeHelpRequest.status = "idle";
    closeAllModals();
    navigateTo("home");
    showToast("SOS Broadcast cancelled. Safe Circle and network notified.");
  }

  window.confirmCancelSOS = confirmCancelSOS;

  // Simple Clean Toast Notification
  function showToast(message) {
    let toast = document.getElementById("app-live-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-live-toast";
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span style="color: var(--accent-teal);">●</span> ${message}`;
    toast.style.transform = "translateX(-50%) translateY(0)";

    clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => {
      toast.style.transform = "translateX(-50%) translateY(100px)";
    }, 4000);
  }

  window.showToast = showToast;
  window.handleCreateHelpRequest = handleCreateHelpRequest;

  // Initialize on DOM ready
  document.addEventListener("DOMContentLoaded", init);

})();
