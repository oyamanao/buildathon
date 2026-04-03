import { useState, useEffect, useRef, useCallback } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [mode, setMode] = useState('MOVE'); // 'MOVE', 'SWORD', 'SPELL'
  const [error, setError] = useState('');
  const [lastCommand, setLastCommand] = useState('');
  
  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);
  const restartTimeoutRef = useRef(null);
  const isActiveRef = useRef(false); // tracks if we WANT to be listening

  useEffect(() => {
    if (!SpeechRecognition) {
      setError('Web Speech API is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Use interim results for split-second reaction!
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const transcript = (finalTranscript + ' ' + interimTranscript).trim().toLowerCase();
      
      if (transcript !== '') {
        setLastCommand(transcript);
      }

      // Check keywords continuously inside interim results for instant reaction
      if (transcript.includes('attack') || transcript.includes('sword') || transcript.includes('slash')) {
        setMode('SWORD');
        
        if (window.voiceTimeout) clearTimeout(window.voiceTimeout);
        window.voiceTimeout = setTimeout(() => {
          setMode(prev => {
            if (prev === 'SWORD') return 'MOVE';
            return prev;
          });
        }, 3000); 
      } else if (transcript.includes('fire') || transcript.includes('dragon') || transcript.includes('magic')) {
        setMode('SPELL');
        
        if (window.voiceTimeout) clearTimeout(window.voiceTimeout);
        window.voiceTimeout = setTimeout(() => {
          setMode(prev => {
            if (prev === 'SPELL') return 'MOVE';
            return prev;
          });
        }, 3000);
      } else if (transcript.includes('move') || transcript.includes('walk') || transcript.includes('stop')) {
        setMode('MOVE');
        if (window.voiceTimeout) clearTimeout(window.voiceTimeout);
      }
    };

    recognition.onerror = (event) => {
      // Ignore common non-critical errors
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('Speech recognition error:', event.error);
      setError(`Microphone error: ${event.error}`);
    };

    recognition.onend = () => {
      // Only auto-restart if we WANT to be listening (not manually stopped)
      if (!manualStopRef.current && isActiveRef.current) {
        // Small delay before restart to avoid rapid restart loops
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          if (isActiveRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              // Already started or other issue — just update state
              setIsListening(false);
              isActiveRef.current = false;
            }
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isActiveRef.current = false;
      manualStopRef.current = true;
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (window.voiceTimeout) clearTimeout(window.voiceTimeout);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      // Stop listening
      manualStopRef.current = true;
      isActiveRef.current = false;
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      try { recognitionRef.current.stop(); } catch (e) {}
      setIsListening(false);
    } else {
      // Start listening
      manualStopRef.current = false;
      isActiveRef.current = true;
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
        setError('Could not start microphone. Check permissions.');
        isActiveRef.current = false;
      }
    }
  }, [isListening]);

  return { isListening, mode, setMode, lastCommand, error, toggleVoice };
}
