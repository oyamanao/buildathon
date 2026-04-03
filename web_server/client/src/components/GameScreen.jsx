import { useEffect, useRef, useState } from 'react';
import { useSerial } from '../hooks/useSerial';
import { useVoice } from '../hooks/useVoice';
import { GameEngine } from '../game/GameEngine';

export default function GameScreen({ user, onLogout }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const gestureRef = useRef('IDLE');
  const { serialData, serialDataRef, connectSerial, disconnectSerial, connected } = useSerial();
  const { isListening, mode: voiceMode, setMode, toggleVoice, error: voiceError } = useVoice();
  const connectedRef = useRef(false);
  const modeRef = useRef('MOVE');
  const [gesture, setGesture] = useState('IDLE');
  const [score, setScore] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  // ─── Keyboard input ────────────────────────────────
  const keysDown = useRef(new Set());
  const keysPressedThisFrame = useRef(new Set());

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code)) {
        e.preventDefault();
        keysDown.current.add(e.code);
        keysPressedThisFrame.current.add(e.code);
      }
    };
    const handleKeyUp = (e) => {
      keysDown.current.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Keep connected ref in sync
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    modeRef.current = voiceMode;
    if (engineRef.current) {
      engineRef.current.setMode(voiceMode);
    }
  }, [voiceMode]);

  // ─── Resolve input: two channels (jump + horizontal) + mode ─────
  useEffect(() => {
    const interval = setInterval(() => {
      let jump = false;
      let horizontal = 'none'; // 'left', 'right', 'none'
      let displayGesture = 'IDLE';

      // Base keyboard input
      const keys = keysDown.current;
      const tapped = keysPressedThisFrame.current;

      jump = keys.has('Space') || keys.has('ArrowUp') || tapped.has('Space') || tapped.has('ArrowUp');
      
      if (keys.has('ArrowRight') || tapped.has('ArrowRight')) {
        horizontal = 'right';
      } else if (keys.has('ArrowLeft') || tapped.has('ArrowLeft')) {
        horizontal = 'left';
      }

      tapped.clear(); // Consume taps for this frame

      // Override with glove input if connected AND sending a non-idle signal
      if (connectedRef.current) {
        const signal = serialDataRef.current?.signal;
        if (signal === '01') { jump = false; horizontal = 'right'; }
        else if (signal === '10') { jump = false; horizontal = 'left'; }
        else if (signal === '11') { jump = true; horizontal = 'none'; }
        // If signal is '00', we just let the keyboard input remain
      }

      if (engineRef.current) {
        const casted = engineRef.current.setInput(jump, horizontal, modeRef.current);
        if (casted) {
          setMode('MOVE');
          modeRef.current = 'MOVE';
        }
        
        displayGesture = engineRef.current.getGestureName();
        setScore(Math.floor(engineRef.current.score));
      }

      setGesture(displayGesture);
    }, 16); // ~60fps polling

    return () => clearInterval(interval);
  }, [serialDataRef]);

  // ─── Initialize game engine ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const wrapper = canvas.parentElement;
      if (!wrapper) return;
      canvas.width = wrapper.clientWidth;
      canvas.height = wrapper.clientHeight;
    };

    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas.parentElement);

    const engine = new GameEngine(canvas);
    engineRef.current = engine;

    engine.load().then((ok) => {
      setLoading(false);
      if (ok) {
        setLoaded(true);
        engine.start();
      }
    });

    return () => {
      engine.stop();
      ro.disconnect();
    };
  }, []);

  // ─── Save progress ──────────────────────────────
  const saveProgress = async (level) => {
    try {
      await fetch('/api/user/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, level }),
      });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  };

  return (
    <div className="game-container fade-in">
      {/* Header bar */}
      <div className="game-header">
        <div className="game-header-left">
          <span className="game-logo">Echo-Blade</span>
          <span className="game-user-info">
            ⚔ {user.username} • Lv.{user.level}
          </span>
        </div>

        <div className="game-header-right">
          <div className={`status-badge ${isListening ? 'status-badge--connected' : 'status-badge--disconnected'} ${voiceMode !== 'MOVE' ? 'status-badge--combat pulse' : ''}`}>
            <span className="status-dot"></span>
            Voice: {voiceMode}
          </div>
          
          <button className="pixel-btn--ghost pixel-btn" onClick={toggleVoice} style={{ fontSize: 7, padding: '4px 10px' }}>
            {isListening ? 'Mic Off' : 'Mic On'}
          </button>

          <div className={`status-badge ${connected ? 'status-badge--connected' : 'status-badge--disconnected'}`}>
            <span className="status-dot"></span>
            {connected ? 'Glove' : 'Keys'}
          </div>

          {!connected ? (
            <button className="pixel-btn--ghost pixel-btn" onClick={connectSerial} style={{ fontSize: 7, padding: '4px 10px' }}>
              Connect
            </button>
          ) : (
            <button className="pixel-btn--ghost pixel-btn" onClick={disconnectSerial} style={{ fontSize: 7, padding: '4px 10px' }}>
              Disconnect
            </button>
          )}

          <button
            className="pixel-btn--ghost pixel-btn"
            onClick={onLogout}
            style={{ fontSize: 7, padding: '4px 10px' }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Game canvas */}
      <div className="game-canvas-wrapper">
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            background: 'var(--color-bg-deep)',
          }}>
            <div className="pixel-text" style={{ color: 'var(--color-primary)' }}>
              Loading assets...
            </div>
          </div>
        )}

        <canvas ref={canvasRef} />

        {/* HUD overlay */}
        {loaded && (
          <>
            <div className="game-hud">
              <div className="hud-item">
                <span className="label">Score</span>
                <span className="value">{score}</span>
              </div>
              <div className="hud-item">
                <span className="label">Action</span>
                <span className={`value ${gesture !== 'IDLE' ? 'value--active' : ''}`}>
                  {gesture}
                </span>
              </div>
              {connected && (
                <div className="hud-item">
                  <span className="label">Signal</span>
                  <span className="value">{serialData.signal}</span>
                </div>
              )}
            </div>

            {/* Gesture grid indicator */}
            <div className="gesture-display">
              <div className="gesture-grid">
                <div className={`gesture-cell ${gesture === 'IDLE' ? 'gesture-cell--active' : ''}`}>
                  00
                </div>
                <div className={`gesture-cell ${gesture === 'FORWARD' ? 'gesture-cell--active' : ''}`}>
                  01
                </div>
                <div className={`gesture-cell ${gesture === 'BACK' ? 'gesture-cell--active' : ''}`}>
                  10
                </div>
                <div className={`gesture-cell ${gesture === 'JUMP' ? 'gesture-cell--active' : ''}`}>
                  11
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
