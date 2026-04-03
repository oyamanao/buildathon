import { useCallback, useEffect, useState } from 'react';

const parseLine = (line) => {
  const clean = line.trim();
  if (!clean) return null;

  // Primary format: 2-bit signal code, e.g. "00", "01", "10", "11" exactly
  const token = clean.split(/\s+/)[0];
  if (['00', '01', '10', '11'].includes(token)) {
    const sensor1 = token[0] === '1' ? 1 : 0;
    const sensor2 = token[1] === '1' ? 1 : 0;
    const action = token;
    const result = { sensor1, sensor2, action };
    console.log(`[Parse] ✓ 2-bit signal: ${clean} ->`, result);
    return result;
  }

  // Reject non-conforming submissions to keep control via 00/01/10/11 only
  console.log(`[Parse] Rejected unsupported signal: "${clean}"`);
  return null;

  // Backward compatibility: "SENSOR1,SENSOR2,ACTION" old mode
  if (clean.includes(',')) {
    const parts = clean.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const sensor1 = parseInt(parts[0]);
      const sensor2 = parseInt(parts[1]);
      if (isNaN(sensor1) || isNaN(sensor2)) {
        console.log(`[Parse] Invalid numbers: S1=${parts[0]}, S2=${parts[1]}`);
        return null;
      }
      const action = parts[2] || 'IDLE';
      const result = { sensor1, sensor2, action };
      console.log(`[Parse] ✓ Old format: ${clean} ->`, result);
      return result;
    }
    console.log(`[Parse] Not enough parts (${parts.length}): ${clean}`);
  }

  
  console.log(`[Parse] Unknown format (no comma, not old format): "${clean}"`);
  return null;
};

export function useSerial() {
  const [port, setPort] = useState(null);
  const [serialData, setSerialData] = useState({ sensor1: 0, sensor2: 0, action: 'IDLE' });
  const [connected, setConnected] = useState(false);
  const [rawBuffer, setRawBuffer] = useState([]);

  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) {
      alert('Web Serial API not supported in this browser. Please use Chrome/Edge.');
      console.error('[Serial] Web Serial API not available');
      return false;
    }

    try {
      console.log('[Serial] Requesting port...');
      const requestedPort = await navigator.serial.requestPort();
      console.log('[Serial] Port selected, opening at 115200 baud...');
      
      await requestedPort.open({ baudRate: 115200 });
      setPort(requestedPort);
      setConnected(true);
      console.log('[Serial] Port opened successfully - reading data...');

      const decoder = new TextDecoderStream();
      const inputStream = decoder.readable;
      const reader = inputStream.getReader();
      requestedPort.readable.pipeTo(decoder.writable).catch(err => {
        console.error('[Serial] Pipe error:', err);
      });

      async function readLoop() {
        try {
          console.log('[Serial] Starting read loop...');
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              console.log('[Serial] Reader closed');
              break;
            }
            if (!value) continue;
            
            console.log('[Serial] Raw data received:', JSON.stringify(value));
            setRawBuffer(prev => [...prev.slice(-19), value]);
            
            const lines = value.split(/[\r\n]+/).filter(Boolean);
            console.log(`[Serial] Split into ${lines.length} line(s): ${JSON.stringify(lines)}`);
            
            for (const l of lines) {
              const parsed = parseLine(l);
              if (parsed) {
                console.log(`[Serial] ✓ Parsed line: ${l} -> `, parsed);
                setSerialData(parsed);
              } else {
                console.log(`[Serial] ✗ Could not parse line: "${l}"`);
              }
            }
          }
        } catch (error) {
          console.error('[Serial] Read loop error:', error);
          setConnected(false);
        }
      }

      readLoop();
      return true;
    } catch (err) {
      console.error('[Serial] Connect error:', err.message);
      setConnected(false);
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (!port) return;
      console.log('[Serial] Closing port...');
      port.close().catch(() => {});
    };
  }, [port]);

  return { serialData, connectSerial, connected, rawBuffer };
}
