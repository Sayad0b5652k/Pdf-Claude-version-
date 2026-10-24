import { useEffect, useRef, useState } from 'react';
import './app.js';

interface QuoteItem {
  text: string;
  author: string;
}

const INSPIRATIONAL_QUOTES: QuoteItem[] = [
  {
    text: "You could always be better at something but not perfect.",
    author: "Sayad Athar"
  },
  {
    text: "Life is full of ups and downs, you can't judge it with 2-3 phases — you could be a topper, an average, a failure, and a loser in the same life.",
    author: "Sayad Athar"
  },
  {
    text: "Wisdom is not a product of schooling, but of the lifelong attempt to acquire it.",
    author: "Albert Einstein"
  },
  {
    text: "Dream is not that which you see while sleeping, it is something that does not let you sleep.",
    author: "Dr. A.P.J. Abdul Kalam"
  },
  {
    text: "Education is not the learning of facts, but the training of the mind to think.",
    author: "Albert Einstein"
  },
  {
    text: "Arise, awake, and stop not until the goal is reached.",
    author: "Swami Vivekananda"
  },
  {
    text: "The soul becomes dyed with the color of its thoughts.",
    author: "Marcus Aurelius"
  },
  {
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela"
  },
  {
    text: "Small daily study habits yield masterly academic growth.",
    author: "S.A.Y.A.D."
  },
  {
    text: "Consistency is what transforms average into excellence.",
    author: "Academic Wisdom"
  }
];

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [activeChips, setActiveChips] = useState<number[]>([]);
  const [currentQuote] = useState<QuoteItem>(() => {
    const randomIndex = Math.floor(Math.random() * INSPIRATIONAL_QUOTES.length);
    return INSPIRATIONAL_QUOTES[randomIndex];
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Inject base containers dynamically if missing
    const requiredContainers = [
      { id: 'sheet-backdrop', className: 'backdrop' },
      { id: 'sheet', className: 'bottom-sheet' },
      { id: 'sel-toolbar', className: 'sel-toolbar' },
      { id: 'toast-container', className: 'toast-container' }
    ];

    requiredContainers.forEach(({ id, className }) => {
      if (!document.getElementById(id)) {
        const el = document.createElement('div');
        el.id = id;
        el.className = className;
        document.body.appendChild(el);
      }
    });

    // -------------------------------------------------------------
    // INTERACTIVE PARTICLE CONSTELLATION CANVAS
    // -------------------------------------------------------------
    const canvas = canvasRef.current;
    let animId = 0;
    // Stops the particle loop and its listener. The loop used to keep running (drawing into a
    // detached canvas) for the whole session after the splash was gone.
    let stopSplashCanvas = () => {};
    let ripples: { x: number; y: number; r: number; alpha: number }[] = [];

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const width = (canvas.width = window.innerWidth);
        const height = (canvas.height = window.innerHeight);

        const numParticles = 35;
        const particles = Array.from({ length: numParticles }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.7,
          vy: (Math.random() - 0.5) * 0.7,
          radius: Math.random() * 2.2 + 1,
        }));

        const handleCanvasClick = (e: MouseEvent | TouchEvent) => {
          const rect = canvas.getBoundingClientRect();
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
          ripples.push({
            x: clientX - rect.left,
            y: clientY - rect.top,
            r: 2,
            alpha: 0.8,
          });
        };

        window.addEventListener('pointerdown', handleCanvasClick);

        const render = () => {
          ctx.clearRect(0, 0, width, height);

          // Get active theme dynamically
          const theme = document.documentElement.dataset.theme || 'light';

          let nodeFill: string;
          let nodeRing: string;
          let rippleColor: (alpha: number) => string;
          let lineStroke: (distRatio: number) => { color: string; width: number };

          if (theme === 'dark') {
            nodeFill = 'rgba(255, 122, 0, 0.85)';
            nodeRing = 'rgba(47, 198, 188, 0.4)';
            rippleColor = (a) => `rgba(255, 122, 0, ${a})`;
            lineStroke = (r) => ({
              color: `rgba(47, 198, 188, ${0.55 * r})`,
              width: 1.1,
            });
          } else if (theme === 'sepia') {
            nodeFill = 'rgba(181, 86, 15, 0.95)';
            nodeRing = 'rgba(106, 87, 56, 0.5)';
            rippleColor = (a) => `rgba(181, 86, 15, ${a})`;
            lineStroke = (r) => ({
              color: `rgba(80, 58, 28, ${0.68 * r})`, // Crisp warm bronze contrast for sepia
              width: 1.4,
            });
          } else {
            // 'light' (Day) theme
            nodeFill = 'rgba(217, 84, 14, 0.95)';
            nodeRing = 'rgba(14, 122, 140, 0.5)';
            rippleColor = (a) => `rgba(217, 84, 14, ${a})`;
            lineStroke = (r) => ({
              color: `rgba(14, 122, 140, ${0.75 * r})`, // Deep vivid teal contrast for day theme
              width: 1.4,
            });
          }

          // Update & draw ripples
          for (let i = ripples.length - 1; i >= 0; i--) {
            const rip = ripples[i];
            rip.r += 3.5;
            rip.alpha -= 0.02;
            if (rip.alpha <= 0) {
              ripples.splice(i, 1);
              continue;
            }
            ctx.beginPath();
            ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
            ctx.strokeStyle = rippleColor(rip.alpha);
            ctx.lineWidth = 2.0;
            ctx.stroke();
          }

          // Update & draw particles & constellation lines
          for (let i = 0; i < numParticles; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;

            // Core particle
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = nodeFill;
            ctx.fill();

            // Subtle outer node ring
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius + 1.5, 0, Math.PI * 2);
            ctx.strokeStyle = nodeRing;
            ctx.lineWidth = 0.8;
            ctx.stroke();

            for (let j = i + 1; j < numParticles; j++) {
              const p2 = particles[j];
              const dx = p.x - p2.x;
              const dy = p.y - p2.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 115) {
                const ratio = 1 - dist / 115;
                const style = lineStroke(ratio);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = style.color;
                ctx.lineWidth = style.width;
                ctx.stroke();
              }
            }
          }

          animId = requestAnimationFrame(render);
        };

        render();
        stopSplashCanvas = () => {
          if (animId) cancelAnimationFrame(animId);
          animId = 0;
          window.removeEventListener('pointerdown', handleCanvasClick);
        };
      }
    }

    // -------------------------------------------------------------
    // CONTINUOUS FLUID TIMELINE SEQUENCER (Zero Jumping, 60fps Motion)
    // -------------------------------------------------------------
    let cancelled = false;
    let progressAnimId: number | null = null;

    const fullQuoteString = currentQuote.author
      ? `“${currentQuote.text}” — ${currentQuote.author}`
      : `“${currentQuote.text}”`;
    // The splash used to run for a fixed 5.5 s on every launch even when the app was ready in a
    // fraction of that. It now plays for MIN_SPLASH_MS and then waits only for boot() to finish
    // (never longer than MAX_SPLASH_MS). Raise MIN_SPLASH_MS for a longer cinematic intro.
    const MIN_SPLASH_MS = 1800;
    const MAX_SPLASH_MS = 8000;
    const totalDuration = MIN_SPLASH_MS;

    const dismissSplash = () => {
      if (cancelled) return;
      cancelled = true;
      if (progressAnimId) cancelAnimationFrame(progressAnimId);
      const splashEl = document.getElementById('sayad-splash');
      if (splashEl) {
        splashEl.classList.add('splash-dissolve');
        setTimeout(() => {
          stopSplashCanvas();
          setSplashVisible(false);
          if (typeof (window as any).triggerAutoInstallPromptAfterLoading === 'function') {
            (window as any).triggerAutoInstallPromptAfterLoading();
          }
        }, 400);
      } else {
        stopSplashCanvas();
        setSplashVisible(false);
        if (typeof (window as any).triggerAutoInstallPromptAfterLoading === 'function') {
          (window as any).triggerAutoInstallPromptAfterLoading();
        }
      }
    };

    // Boot database in parallel immediately (once: boot() registers global listeners)
    let bootDone = false;
    if (typeof (window as any).boot === 'function' && !(window as any).__sayadBootStarted) {
      (window as any).__sayadBootStarted = true;
      Promise.resolve((window as any).boot())
        .catch(console.error)
        .finally(() => { bootDone = true; });
    } else {
      bootDone = true;
    }

    const runContinuousSequence = () => {
      const startTime = performance.now();

      const fillEl = document.getElementById('splash-fill');
      const statusEl = document.getElementById('splash-status');
      const pctEl = document.getElementById('splash-pct');
      const quoteEl = document.getElementById('splash-quote-display');

      let lastPhase = -1;
      let lastTypeChar = 0;

      const tick = (now: number) => {
        if (cancelled) return;
        const elapsed = Math.max(0, now - startTime);
        const rawProgress = Math.min(1, elapsed / totalDuration);

        // Smooth cubic-out easing curve for natural fluid deceleration
        const eased = rawProgress < 0.8
          ? rawProgress / 0.8 * 0.85
          : 0.85 + (rawProgress - 0.8) / 0.2 * 0.15;

        const currentPct = Math.min(100, Math.floor(eased * 100));

        // Update progress bar width and counter continuously
        if (fillEl) fillEl.style.width = `${(eased * 100).toFixed(1)}%`;
        if (pctEl) pctEl.textContent = `${currentPct}%`;

        // Continuous Phase & Status updates
        if (currentPct < 22) {
          if (lastPhase !== 0) {
            lastPhase = 0;
            if (statusEl) statusEl.textContent = '⚡ Initializing S.A.Y.A.D. Core Engine…';
          }
        } else if (currentPct < 45) {
          if (lastPhase !== 1) {
            lastPhase = 1;
            if (statusEl) statusEl.textContent = '📄 Activating PDF Annotator & Reader…';
            setActiveChips([0]);
          }
        } else if (currentPct < 65) {
          if (lastPhase !== 2) {
            lastPhase = 2;
            if (statusEl) statusEl.textContent = '🧠 Synchronizing FSRS Spaced Repetition engine…';
            setActiveChips([0, 1]);
          }
        } else if (currentPct < 85) {
          if (lastPhase !== 3) {
            lastPhase = 3;
            if (statusEl) statusEl.textContent = '🤖 Connecting Gemini AI Study Assistant…';
            setActiveChips([0, 1, 2]);
          }
        } else if (currentPct < 96) {
          if (lastPhase !== 4) {
            lastPhase = 4;
            if (statusEl) statusEl.textContent = '📈 Loading Reading Retention & Goal tracker…';
            setActiveChips([0, 1, 2, 3]);
          }
        } else {
          if (lastPhase !== 5) {
            lastPhase = 5;
            if (statusEl) statusEl.textContent = '✨ Academic Workspace Ready! Opening…';
            setActiveChips([0, 1, 2, 3]);
          }
        }

        // Ultra-smooth quote typing progression (Direct DOM update - 60fps locked, zero React re-render lag)
        const quoteProgress = Math.max(0, Math.min(1, (rawProgress - 0.06) / 0.82));
        const charsToShow = Math.floor(quoteProgress * fullQuoteString.length);
        if (quoteEl && charsToShow !== lastTypeChar) {
          lastTypeChar = charsToShow;
          quoteEl.textContent = fullQuoteString.slice(0, charsToShow);
        }

        if (rawProgress < 1 || (!bootDone && elapsed < MAX_SPLASH_MS)) {
          progressAnimId = requestAnimationFrame(tick);
        } else {
          if (fillEl) fillEl.style.width = '100%';
          if (pctEl) pctEl.textContent = '100%';
          setTimeout(() => {
            dismissSplash();
          }, 200);
        }
      };

      progressAnimId = requestAnimationFrame(tick);
    };

    runContinuousSequence();

    (window as any).skipSplash = () => {
      dismissSplash();
    };

    return () => {
      cancelled = true;
      if (progressAnimId) cancelAnimationFrame(progressAnimId);
      stopSplashCanvas();
    };
  }, []);

  const [proTheme, setProTheme] = useState<string>(() => {
    if (typeof window !== 'undefined' && (window as any).State && (window as any).State.proTheme) {
      return (window as any).State.proTheme;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('sayad_pro_theme') || 'classic';
    }
    return 'classic';
  });

  return (
    <>
      <main id="app" className="app-container"></main>

      {splashVisible && (
        <div id="sayad-splash" className={`sayad-splash-container splash-theme-${proTheme}`}>
          <canvas ref={canvasRef} className="splash-canvas" />

          <button
            className="splash-skip-btn"
            onClick={() => (window as any).skipSplash && (window as any).skipSplash()}
          >
            <span>Skip to Workspace</span>
            <span style={{ fontSize: '14px' }}>➔</span>
          </button>

          <div className="splash-content-wrap">
            <div className={`splash-emblem-wrap splash-emblem-${proTheme}`}>
              <div className="splash-glow-aura"></div>
              <div className="splash-orbit-outer"></div>
              <div className="splash-orbit-inner"></div>
              <div className="splash-logo-card">
                <img
                  src={typeof (window as any).getThemeCrestUrl === 'function' ? (window as any).getThemeCrestUrl() : '/icons/theme-classic-512.png'}
                  alt="S.A.Y.A.D."
                  className="splash-logo-img"
                />
              </div>
            </div>

            <div className="splash-brand-title">
              S.A.Y.A.D<span className="splash-brand-accent">.</span>
            </div>

            <div className="splash-subtitle">
              Study Assistant for Your Academic Development
            </div>

            <div className="splash-modules-grid">
              <div className={`splash-module-chip ${activeChips.includes(0) ? 'chip-active' : ''}`}>
                <span>📄</span> Smart PDF & Reader
              </div>
              <div className={`splash-module-chip ${activeChips.includes(1) ? 'chip-active' : ''}`}>
                <span>🧠</span> FSRS Flashcards
              </div>
              <div className={`splash-module-chip ${activeChips.includes(2) ? 'chip-active' : ''}`}>
                <span>🤖</span> Gemini AI Copilot
              </div>
              <div className={`splash-module-chip ${activeChips.includes(3) ? 'chip-active' : ''}`}>
                <span>📈</span> Reading Retention
              </div>
            </div>

            <div className="splash-quote-box">
              <span id="splash-quote-display" className="splash-quote-text">
                “Preparing your personalized academic workspace…”
              </span>
            </div>

            <div className="splash-progress-card">
              <div className="splash-progress-track">
                <div id="splash-fill" className="splash-progress-fill" style={{ width: '0%' }}></div>
              </div>
              <div className="splash-progress-row">
                <span id="splash-status" className="splash-status-msg">
                  ⚡ Initializing environment…
                </span>
                <span id="splash-pct" className="font-mono">
                  0%
                </span>
              </div>
            </div>

            <div className="splash-tap-tip">💡 Tap anywhere on screen for interactive energy ripples</div>
          </div>
        </div>
      )}
    </>
  );
}


