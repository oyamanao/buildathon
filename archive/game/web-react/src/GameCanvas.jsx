import { useEffect, useRef, useState } from 'react';

export default function GameCanvas({ direction, jumpRequest, onJumpConsumed, signal }) {
  const canvasRef = useRef(null);
  const xRef = useRef(120);
  const yRef = useRef(215);
  const vxRef = useRef(0);
  const vyRef = useRef(0);
  const onGroundRef = useRef(true);
  const scoreRef = useRef(0);
  const enemiesRef = useRef([]);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (jumpRequest && onGroundRef.current && !gameOver) {
      vyRef.current = -9.5;
      onGroundRef.current = false;
      onJumpConsumed();
    }
  }, [jumpRequest, onJumpConsumed, gameOver]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let rafId;
    let lastTime = 0;

    const gravity = 0.34;

    function checkCollision(playerX, playerY, enemy) {
      return playerX < enemy.x + 30 && playerX + 32 > enemy.x &&
             playerY - 38 < enemy.y + 30 && playerY > enemy.y;
    }

    function step(timestamp) {
      if (gameOver) return;

      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      // Update score
      scoreRef.current += deltaTime * 0.01;

      // Character horizontal inertia
      let vx = vxRef.current;
      if (direction === 'FORWARD') {
        vx = Math.min(vx + 0.24, 5);
      } else if (direction === 'BACK') {
        vx = Math.max(vx - 0.24, -5);
      } else {
        vx *= 0.92;
        if (Math.abs(vx) < 0.05) vx = 0;
      }
      vxRef.current = vx;

      // Jump/fall physics
      let vy = vyRef.current;
      vy = Math.min(vy + gravity, 12);
      vyRef.current = vy;

      let y = yRef.current + vy;
      if (y >= 215) {
        y = 215;
        vyRef.current = 0;
        onGroundRef.current = true;
      } else {
        onGroundRef.current = false;
      }
      yRef.current = y;

      let x = xRef.current + vx;
      x = Math.max(14, Math.min(x, canvas.width - 54));
      xRef.current = x;

      // Update enemies
      enemiesRef.current.forEach(enemy => {
        enemy.x -= 2;
        if (enemy.x < -50) enemy.x = canvas.width + 50;
      });

      // Check collisions
      for (const enemy of enemiesRef.current) {
        if (checkCollision(x, y, enemy)) {
          setGameOver(true);
          return;
        }
      }

      // Drawing
      ctx.fillStyle = '#0b162b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#274b1b';
      ctx.fillRect(0, 280, canvas.width, 60);

      // Draw enemies
      ctx.fillStyle = '#ff4444';
      enemiesRef.current.forEach(enemy => {
        ctx.fillRect(enemy.x, enemy.y, 30, 30);
      });

      // Draw player
      ctx.fillStyle = '#5b9eff';
      ctx.fillRect(x, y - 38, 32, 38);

      ctx.fillStyle = '#ffd477';
      ctx.fillRect(x + 5, y - 50, 22, 15);

      ctx.fillStyle = '#000';
      ctx.fillRect(x + 9, y - 46, 4, 4);
      ctx.fillRect(x + 19, y - 46, 4, 4);

      // HUD
      ctx.fillStyle = '#fff';
      ctx.font = '20px monospace';
      ctx.fillText(`Score: ${Math.floor(scoreRef.current)}`, 10, 30);
      ctx.fillText(`Signal: ${signal}`, 10, 60);

      rafId = requestAnimationFrame(step);
    }

    // Initialize enemies
    enemiesRef.current = [
      { x: 400, y: 250 },
      { x: 600, y: 250 },
      { x: 800, y: 250 }
    ];

    requestAnimationFrame(step);

    return () => cancelAnimationFrame(rafId);
  }, [direction, signal, gameOver]);

  if (gameOver) {
    return (
      <div style={{ backgroundColor: '#111', color: '#ddf', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <h1>Game Over</h1>
        <p>Final Score: {Math.floor(scoreRef.current)}</p>
        <button onClick={() => window.location.reload()} style={{ padding: '15px 30px', fontSize: '18px', borderRadius: '8px', background: '#2196f3', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Play Again
        </button>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      style={{ display: 'block', backgroundColor: '#0b162b' }}
    />
  );
}

