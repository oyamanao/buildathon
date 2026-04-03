import { useState, useEffect, useRef, useCallback } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [mode, setMode] = useState('MOVE'); // 'MOVE', 'ATTACK'
  const [error, setError] = useState('');
  const [lastCommand, setLastCommand] = useState('');
  
  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);

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
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        // We do not stop on 'no-speech' since silence is normal
        setError(`Microphone error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (!manualStopRef.current) {
        // Automatically restart if it dropped out natively
        try {
          recognitionRef.current.start();
        } catch (e) {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        manualStopRef.current = true;
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      manualStopRef.current = true;
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      manualStopRef.current = false;
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  }, [isListening]);

  return { isListening, mode, setMode, lastCommand, error, toggleVoice };
}
