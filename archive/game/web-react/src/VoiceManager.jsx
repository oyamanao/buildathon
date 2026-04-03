import { useCallback, useEffect, useRef, useState } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useVoice() {
  const [voiceWord, setVoiceWord] = useState('None');
  const recognitionRef = useRef(null);

  const startVoice = useCallback(() => {
    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not supported');
      return;
    }

    if (recognitionRef.current) {
      try {
        if (recognitionRef.current.state !== 'started') {
          recognitionRef.current.start();
        }
      } catch (err) {
        console.warn('SpeechRecognition start ignored (already started or bad state)', err);
      }
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.trim();
      const token = transcript.split(' ').pop();
      const normalized = token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();

      if (['Strike', 'Ignis', 'Heal'].includes(normalized)) {
        setVoiceWord(normalized);
        setTimeout(() => setVoiceWord('None'), 2000);
      }
    };

    rec.onerror = (e) => {
      console.error('Voice recognition error', e);
    };

    rec.onend = () => {
      if (!recognitionRef.current) return;
      setTimeout(() => {
        try {
          recognitionRef.current.start();
        } catch (err) {
          console.warn('SpeechRecognition restart ignored', err);
        }
      }, 200);
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      console.warn('SpeechRecognition start failed', err);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return { voiceWord, startVoice };
}
