import { useCallback, useEffect, useState, useRef } from 'react';

/**
 * Parses a line from serial into a gesture signal.
 * Expects 2-bit codes: "00", "01", "10", "11"
 * ESP32 sends: "01   s1=350 s2=800\n"
 */
const parseLine = (line) => {
  const clean = line.trim();
  if (!clean) return null;

  const token = clean.split(/\s+/)[0];
  if (['00', '01', '10', '11'].includes(token)) {
    const a = token[0] === '1' ? 1 : 0;
    const b = token[1] === '1' ? 1 : 0;
    return { a, b, signal: token };
  }

  return null;
};

/**
 * Maps a 2-bit signal to a game gesture.
 * 00 = IDLE, 01 = FORWARD, 10 = BACK, 11 = JUMP
 */
export function signalToGesture(signal) {
  switch (signal) {
    case '01': return 'FORWARD';
    case '10': return 'BACK';
    case '11': return 'JUMP';
    default: return 'IDLE';
  }
}

/**
 * React hook for Web Serial API connection to ESP32.
 * Fixed: proper line buffering, reader cleanup, re-connect guard.
 */
export function useSerial() {
  const [connected, setConnected] = useState(false);
  const [rawBuffer, setRawBuffer] = useState([]);

  // Use refs for data that changes frequently to avoid stale closures
  const serialDataRef = useRef({ a: 0, b: 0, signal: '00' });
  const [serialData, setSerialData] = useState({ a: 0, b: 0, signal: '00' });

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const readingRef = useRef(false);
  const abortRef = useRef(null);

  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) {
      alert('Web Serial API not supported. Please use Chrome or Edge.');
      return false;
    }

    // Guard: don't re-open if already connected
    if (portRef.current && readingRef.current) {
      console.log('[Serial] Already connected');
      return true;
    }

    try {
      console.log('[Serial] Requesting port...');
      const port = await navigator.serial.requestPort();

      // If port is already open, skip open()
      if (!port.readable) {
        console.log('[Serial] Opening port at 115200 baud...');
        await port.open({ baudRate: 115200 });
      } else {
        console.log('[Serial] Port already open, reusing...');
      }

      portRef.current = port;
      setConnected(true);
      readingRef.current = true;

      // Set up abort controller for clean cancellation
      const abortController = new AbortController();
      abortRef.current = abortController;

      // Use TextDecoderStream for proper text decoding
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable, {
        signal: abortController.signal,
      }).catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('[Serial] Pipe error:', err);
        }
      });

      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      // Line buffer to handle partial data chunks
      let lineBuffer = '';

      console.log('[Serial] Reading data...');

      // Read loop
      (async () => {
        try {
          while (readingRef.current) {
            const { value, done } = await reader.read();
            if (done) {
              console.log('[Serial] Reader done');
              break;
            }
            if (!value) continue;

            // Add to raw debug buffer
            setRawBuffer((prev) => [...prev.slice(-19), value]);

            // Buffer and split by newlines
            lineBuffer += value;
            const lines = lineBuffer.split(/\r?\n/);

            // Last element is incomplete (no trailing newline) — keep it in buffer
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
              const parsed = parseLine(line);
              if (parsed) {
                serialDataRef.current = parsed;
                setSerialData({ ...parsed });
              }
            }
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error('[Serial] Read loop error:', error);
          }
        } finally {
          try {
            reader.releaseLock();
          } catch (e) {
            // Already released
          }
          readerRef.current = null;
          readingRef.current = false;
          setConnected(false);
          console.log('[Serial] Read loop ended');
        }
      })();

      return true;
    } catch (err) {
      console.error('[Serial] Connect error:', err.message);
      setConnected(false);
      readingRef.current = false;
      return false;
    }
  }, []);

  // Disconnect function
  const disconnectSerial = useCallback(async () => {
    console.log('[Serial] Disconnecting...');
    readingRef.current = false;

    // Abort the pipe
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Release reader
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
      } catch (e) {
        // Already released
      }
      readerRef.current = null;
    }

    // Close port
    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (e) {
        // Already closed
      }
      portRef.current = null;
    }

    setConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      readingRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { serialData, serialDataRef, connectSerial, disconnectSerial, connected, rawBuffer };
}
