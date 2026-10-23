// S.A.Y.A.D. Native App Installation Engine
// @ts-nocheck

let deferredPrompt = null;
let isInitialized = false;

// 1. Check if running inside an iframe container
export function isInIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

// 2. Check if already installed & running in standalone mode
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://') ||
    window.location.search.includes('source=pwa')
  );
}

// 3. Detect iOS / iPadOS
export function isIOS() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

// 4. Lock screen orientation to portrait
export function lockPortraitOrientation() {
  try {
    if (window.screen?.orientation && typeof window.screen.orientation.lock === 'function') {
      window.screen.orientation.lock('portrait-primary').catch(() => {});
    }
  } catch (e) {}
}

// 5. Register Service Worker & Handle Updates
let swRegistration = null;

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        swRegistration = reg;
        console.log('[SAYAD PWA] Service Worker Active with scope:', reg.scope);

        // Check for updates periodically & on registration
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateAvailableBanner();
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[SAYAD PWA] SW Registration:', err);
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

/**
 * Shows an unobtrusive floating pill when a new version of the app is ready.
 */
export function showUpdateAvailableBanner() {
  if (document.getElementById('sayad-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'sayad-update-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 74px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #1e293b, #0f172a);
    color: #ffffff;
    padding: 10px 16px;
    border-radius: 30px;
    border: 1px solid var(--accent, #FF6A2B);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    font-weight: 600;
    animation: sayadSlideUp 0.3s ease-out;
  `;

  banner.innerHTML = `
    <span style="display:flex; align-items:center; gap:6px;">
      <span style="font-size:16px;">🚀</span>
      <span>Naya Update Available Hai!</span>
    </span>
    <button id="sayad-update-now-btn" style="
      background: var(--accent, #FF6A2B);
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(255,106,43,0.4);
    ">Update Now</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('sayad-update-now-btn')?.addEventListener('click', () => {
    forceAppUpdateAndRefresh();
  });
}

/**
 * 100% Safe App Refresh & Update Engine:
 * - Purges Service Worker cache & HTTP cache
 * - Forces SW update check
 * - NEVER touches IndexedDB (All books, PDFs, notes, bookmarks remain 100% safe)
 * - Reloads into the fresh code
 */
export async function forceAppUpdateAndRefresh(isPull = false) {
  if (typeof window.toast === 'function') {
    window.toast(isPull ? '🔄 Refreshing app & checking updates…' : '🔄 Refreshing app & clearing cache… (Books safe)');
  }

  try {
    // 1. Purge all Service Worker Caches
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
      console.log('[SAYAD PWA] Cleaned HTTP caches:', cacheNames);
    }

    // 2. Notify waiting Service Worker to take over
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        await reg.update().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[SAYAD PWA] Cache purge error:', err);
  }

  // 3. Reload cleanly to newest build
  setTimeout(() => {
    window.location.reload();
  }, 400);
}

/**
 * Mobile Pull-To-Refresh Gesture (Disabled to prevent accidental reload during normal scrolling)
 */
export function initPullToRefresh() {
  // Intentionally disabled: Prevents unwanted app restarts while scrolling near top
}

// 6. Global PWA Event Listeners
export function initPWAListeners() {
  if (isInitialized) return;
  isInitialized = true;

  registerServiceWorker();

  // If captured in index.html head
  if (window.deferredInstallPrompt) {
    deferredPrompt = window.deferredInstallPrompt;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.deferredInstallPrompt = e;
    console.log('[SAYAD PWA] Native beforeinstallprompt captured!');
    
    const btn = document.getElementById('sayad-inst-submit-btn');
    const btnText = document.getElementById('sayad-inst-btn-text');
    if (btn && btn.getAttribute('data-waiting') === 'true') {
      btn.removeAttribute('data-waiting');
      if (btnText) btnText.textContent = 'Install S.A.Y.A.D. App';
      triggerDirectInstall();
    }
  });

  window.onDeferredPromptReady = (e) => {
    deferredPrompt = e;
    window.deferredInstallPrompt = e;
  };

  // Event fired when app is successfully installed onto the device
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.deferredInstallPrompt = null;
    try {
      localStorage.setItem('sayad_app_installed', 'true');
    } catch(e) {}
    console.log('[SAYAD PWA] App successfully installed on device!');
    if (typeof window.toast === 'function') {
      window.toast('🎉 S.A.Y.A.D. App aapke phone me install ho gaya! Home screen check karein.');
    }
    closeInstallModal();
  });
}

// 7. Direct 1-Tap Installation Trigger (Synchronous Prompt on User Gesture)
export function triggerDirectInstall() {
  const isIos = isIOS();
  const inFrame = isInIframe();
  const promptObj = deferredPrompt || window.deferredInstallPrompt;

  const btn = document.getElementById('sayad-inst-submit-btn');
  const btnText = document.getElementById('sayad-inst-btn-text');

  // Case A: Inside iframe preview sandbox -> Open full browser tab
  if (inFrame) {
    if (typeof window.toast === 'function') {
      window.toast('📲 Opening S.A.Y.A.D. in full Chrome tab for direct installation...');
    }
    window.open(window.location.href, '_blank');
    closeInstallModal();
    return;
  }

  // Case B: iOS Safari
  if (isIos) {
    if (typeof window.toast === 'function') {
      window.toast('Safari me neeche Share (⎋) -> "Add to Home Screen" dabayein');
    }
    closeInstallModal();
    return;
  }

  // Case C: Native Chrome beforeinstallprompt is ready
  if (promptObj) {
    if (btnText) btnText.textContent = 'Opening Installer…';
    if (btn) btn.disabled = true;

    // Direct synchronous call to prompt() to comply strictly with user gesture security
    promptObj.prompt();

    promptObj.userChoice
      .then((choiceResult) => {
        console.log('[SAYAD PWA] User install choice:', choiceResult?.outcome);
        if (choiceResult?.outcome === 'accepted') {
          try {
            localStorage.setItem('sayad_app_installed', 'true');
          } catch(e) {}
          if (typeof window.toast === 'function') {
            window.toast('📲 S.A.Y.A.D. App download & installation shuru ho gayi hai!');
          }
        }
        deferredPrompt = null;
        window.deferredInstallPrompt = null;
        closeInstallModal();
      })
      .catch((err) => {
        console.warn('[SAYAD PWA] Prompt execution error:', err);
        closeInstallModal();
      });
    return;
  }

  // Case D: If already in standalone app
  if (isStandalone() || localStorage.getItem('sayad_app_installed') === 'true') {
    if (typeof window.toast === 'function') {
      window.toast('✅ S.A.Y.A.D. pehle se aapke phone me installed hai!');
    }
    closeInstallModal();
    return;
  }

  // Case E: Prompt not yet captured -> Wait for event and auto-prompt
  if (btn && btnText) {
    btnText.textContent = 'Connecting Chrome Installer…';
    btn.setAttribute('data-waiting', 'true');
  }

  // Fallback timeout if Chrome does not provide prompt (e.g. unsupported desktop or already added)
  setTimeout(() => {
    const freshPrompt = deferredPrompt || window.deferredInstallPrompt;
    if (freshPrompt) {
      freshPrompt.prompt();
      closeInstallModal();
    } else {
      if (typeof window.toast === 'function') {
        window.toast('📲 Chrome menu (⋮) -> "Add to Home screen" / "Install app" dabayein');
      }
      closeInstallModal();
    }
  }, 1200);
}

// 8. Show Play-Store Styled Native Install Card
export function showInstallModal(forced = false) {
  if (isStandalone() && !forced) {
    if (typeof window.toast === 'function') {
      window.toast('✅ S.A.Y.A.D. pehle se standalone app mode me chal raha hai!');
    }
    return;
  }

  closeInstallModal();

  const isIos = isIOS();
  const modal = document.createElement('div');
  modal.id = 'sayad-app-install-modal';
  modal.className = 'sayad-installer-backdrop';

  modal.innerHTML = `
    <div class="sayad-installer-sheet scale-up" role="dialog" aria-modal="true">
      <button class="sayad-installer-close" id="sayad-inst-close" aria-label="Close">&times;</button>
      
      <!-- App Header Banner -->
      <div class="sayad-installer-header">
        <div class="sayad-inst-icon-box">
          <img src="/icons/theme-classic-512.png" alt="S.A.Y.A.D." class="sayad-inst-icon-img" />
          <div class="sayad-inst-icon-badge">PRO</div>
        </div>

        <div class="sayad-inst-info">
          <div class="sayad-inst-title-row">
            <h3 class="sayad-inst-title">S.A.Y.A.D.</h3>
            <span class="sayad-inst-verified-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Verified
            </span>
          </div>
          <p class="sayad-inst-author">Athar Labs • AI Study Copilot</p>
          <div class="sayad-inst-rating-pill">
            <span class="star">★ 4.9</span>
            <span class="divider">•</span>
            <span>2.8 MB</span>
            <span class="divider">•</span>
            <span>Zero URL Bar</span>
          </div>
        </div>
      </div>

      <!-- Quick Highlights Grid -->
      <div class="sayad-inst-features">
        <div class="sayad-inst-feat-card">
          <div class="sayad-inst-feat-icon">📱</div>
          <div class="sayad-inst-feat-text">
            <strong>Pure Fullscreen Native App</strong>
            <span>No top browser URL, search bar, or navigation clutter</span>
          </div>
        </div>

        <div class="sayad-inst-feat-card">
          <div class="sayad-inst-feat-icon">⚡</div>
          <div class="sayad-inst-feat-text">
            <strong>Offline Academic Study</strong>
            <span>Direct access to your books, notes &amp; flashcards anywhere</span>
          </div>
        </div>

        <div class="sayad-inst-feat-card">
          <div class="sayad-inst-feat-icon">🔒</div>
          <div class="sayad-inst-feat-text">
            <strong>Private &amp; Secure Storage</strong>
            <span>All study documents stay safely encrypted on your device</span>
          </div>
        </div>
      </div>

      ${isIos ? `
        <div class="sayad-inst-ios-box">
          <div class="sayad-inst-ios-head">📲 Install on iPhone / iPad (Safari):</div>
          <div class="sayad-inst-ios-steps">
            1. Bottom menu me <strong>Share (⎋)</strong> button dabayein.<br>
            2. Neeche scroll karke <strong>"Add to Home Screen"</strong> par tap karein.<br>
            3. Top right me <strong>Add</strong> dabate hi app install ho jayegi!
          </div>
        </div>
      ` : ''}

      <!-- Action CTA Buttons -->
      <div class="sayad-inst-actions">
        <button class="sayad-inst-btn-install" id="sayad-inst-submit-btn">
          <span class="icon">📲</span>
          <span id="sayad-inst-btn-text">Install S.A.Y.A.D. App</span>
        </button>
        <button class="sayad-inst-btn-cancel" id="sayad-inst-later-btn">
          Baad Mein (Continue in Browser)
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Events Binding
  const dismiss = () => {
    try {
      sessionStorage.setItem('sayad_install_dismissed', 'true');
    } catch(e) {}
    closeInstallModal();
  };

  document.getElementById('sayad-inst-close').onclick = dismiss;
  document.getElementById('sayad-inst-later-btn').onclick = dismiss;
  modal.onclick = (e) => {
    if (e.target === modal) dismiss();
  };

  // Direct Install Action Click
  document.getElementById('sayad-inst-submit-btn').onclick = () => {
    triggerDirectInstall();
  };
}

export function closeInstallModal() {
  const el = document.getElementById('sayad-app-install-modal');
  if (el) {
    el.classList.add('fade-out');
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 220);
  }
}

// 9. Auto trigger directly after splash/loading completes
export function triggerAutoInstallPromptAfterLoading() {
  initPWAListeners();

  const isInstalled = isStandalone() || localStorage.getItem('sayad_app_installed') === 'true';
  const isDismissed = sessionStorage.getItem('sayad_install_dismissed') === 'true';

  if (!isInstalled && !isDismissed) {
    setTimeout(() => {
      showInstallModal(false);
    }, 400);
  }
}

// Initialize immediately on load
initPWAListeners();

// Attach globals
window.showInstallModal = showInstallModal;
window.closeInstallModal = closeInstallModal;
window.triggerDirectInstall = triggerDirectInstall;
window.isStandalone = isStandalone;
window.lockPortraitOrientation = lockPortraitOrientation;
window.triggerAutoInstallPromptAfterLoading = triggerAutoInstallPromptAfterLoading;
window.forceAppUpdateAndRefresh = forceAppUpdateAndRefresh;

