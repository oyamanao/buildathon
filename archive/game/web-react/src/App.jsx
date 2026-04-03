import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import GameScene from './GameScene';

export default function App() {
  const containerRef = useRef(null);
  const sensorData = useRef({ flex1: 0, flex2: 0, mic: 0 });
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const [message, setMessage] = useState('Click button to connect your ESP32 glove');
  const [readyToPlay, setReadyToPlay] = useState(false);

  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) {
      setMessage('Web Serial API NOT supported in this browser. Use Chrome or Edge.');
      return;
    }

    try {
      setStatus('connecting');
      setMessage('Please select your ESP32 COM port...');

      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;

      const decoder = new TextDecoder();
      const reader = port.readable.getReader();
      readerRef.current = reader;

      setStatus('connected');
      setMessage('Connected. Game running. Use sensor inputs now.');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const parts = trimmed.split(',');
          if (parts.length !== 3) continue;

          sensorData.current.flex1 = Number(parts[0]) || 0;
          sensorData.current.flex2 = Number(parts[1]) || 0;
          sensorData.current.mic = Number(parts[2]) || 0;
        }
      }
    } catch (error) {
      console.error('Serial error:', error);
      setStatus('error');
      setMessage('Serial connection failed. Check USB and baud rate.');
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const config = {
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      pixelArt: true,
      roundPixels: true,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 900 },
          debug: false
        }
      },
      scene: GameScene,
      parent: containerRef.current
    };

    const game = new Phaser.Game(config);
    game.registry.set('sensors', sensorData);

    return () => {
      if (readerRef.current) readerRef.current.releaseLock();
      if (portRef.current) portRef.current.close();
      game.destroy(true);
    };
  }, [connectSerial]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#080818' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 999, color: '#fff', fontFamily: 'monospace', fontSize: '14px', textShadow: '0 0 6px rgba(0,0,0,.85)' }}>
        <div><strong>Status:</strong> {status}</div>
        <div>{message}</div>
      </div>
      <button
        onClick={connectSerial}
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 999, padding: '8px 16px', borderRadius: 6, border: 0, background: status === 'connected' ? '#2c8f2a' : '#1f8fff', color: '#fff', cursor: 'pointer' }}
      >
        {status === 'connected' ? 'ESP32 Connected' : 'Connect ESP32'}
      </button>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}


