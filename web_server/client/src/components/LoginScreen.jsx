import { useState, useRef, useEffect } from 'react';

const API = '/api/auth';

// Fox idle sprite frames from atlas.json
const FOX_IDLE_FRAMES = [
  { x: 105, y: 34, w: 33, h: 32 }, // player-idle-1
  { x: 350, y: 34, w: 33, h: 32 }, // player-idle-2
  { x: 452, y: 0, w: 33, h: 32 },  // player-idle-3
  { x: 315, y: 34, w: 33, h: 32 }, // player-idle-4
];

function FoxSprite() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const img = new Image();
    img.src = '/assets/atlas/atlas.png';

    let frame = 0;
    let intervalId;

    img.onload = () => {
      const draw = () => {
        const f = FOX_IDLE_FRAMES[frame];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, canvas.width, canvas.height);
        frame = (frame + 1) % FOX_IDLE_FRAMES.length;
      };
      draw();
      intervalId = setInterval(draw, 200);
    };

    return () => clearInterval(intervalId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={33}
      height={32}
      style={{
        width: 96,
        height: 93,
        imageRendering: 'pixelated',
      }}
    />
  );
}

export default function LoginScreen({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? `${API}/register` : `${API}/login`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      onLogin(data);
    } catch (err) {
      setError('Server unreachable. Is the backend running?');
      setLoading(false);
    }
  };

  return (
    <div className="login-container fade-in">
      <div className="login-wrapper">
        {/* Title area */}
        <div className="login-title-area">
          <img
            src="/assets/sprites/title-screen.png"
            alt="Echo-Blade"
            className="login-title-image"
          />
          <p className="pixel-subtitle" style={{ marginTop: 8 }}>
            Aetherbound
          </p>

          {/* Fox sprite character */}
          <div style={{ marginTop: 8 }}>
            <FoxSprite />
          </div>
        </div>

        {/* Login Card */}
        <div className="pixel-card" style={{ width: '100%' }}>
          <h2
            className="pixel-title"
            style={{ fontSize: 14, textAlign: 'center', marginBottom: 20 }}
          >
            {isRegister ? 'Create Account' : 'Login'}
          </h2>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                type="text"
                className="pixel-input"
                placeholder="Enter username..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="pixel-input"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="pixel-btn"
              disabled={loading}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading
                ? '...'
                : isRegister
                  ? '⚔ Register'
                  : '⚔ Enter'}
            </button>
          </form>

          <div className="login-toggle" style={{ marginTop: 16 }}>
            <span>{isRegister ? 'Have an account?' : 'No account?'}</span>
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
            >
              {isRegister ? 'Login' : 'Register'}
            </button>
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="pixel-text" style={{ textAlign: 'center', color: 'var(--color-text-dim)' }}>
          Arrow keys to move • Space to jump
          <br />
          Or connect your ESP32 glove
        </p>
      </div>
    </div>
  );
}
