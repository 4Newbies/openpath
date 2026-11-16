// Default read-aloud provider. Fallback chain for each request:
//   1. the question's audio file for this language (loaded only when played)
//   2. a browser speechSynthesis voice for this language
//   3. not available (isAvailable() is false, so the Listen button is hidden)
//
// Provider interface (hosts can register their own, see providers.js):
//   speak(text, lang, { audioUrl }?) -> Promise that settles when done or stopped
//   stop()
//   isAvailable(lang, { audioUrl }?) -> boolean

const baseLang = (tag) => String(tag || '').toLowerCase().replace('_', '-').split('-')[0];

export function createBrowserSpeech(win = globalThis) {
  const synth = win.speechSynthesis;
  const hasAudio = typeof win.Audio === 'function';
  let current = null; // { cancel() } for whatever is playing now

  const voiceFor = (lang) => (synth?.getVoices?.() ?? []).find((v) => baseLang(v.lang) === lang) ?? null;

  function stop() {
    const c = current;
    current = null;
    c?.cancel();
  }

  function once(resolve, reject) {
    let done = false;
    return {
      ok: (v) => !done && ((done = true), resolve(v)),
      fail: (e) => !done && ((done = true), reject(e)),
    };
  }

  function playAudio(url) {
    return new Promise((resolve, reject) => {
      const end = once(resolve, reject);
      const audio = new win.Audio(); // the file is only fetched now, when asked for
      const me = {
        cancel: () => {
          audio.pause();
          audio.removeAttribute('src');
          end.ok();
        },
      };
      current = me;
      audio.addEventListener('ended', () => end.ok());
      audio.addEventListener('error', () => end.fail(new Error('audio_failed')));
      audio.src = url;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch((e) => end.fail(e));
    });
  }

  function synthesize(text, lang) {
    return new Promise((resolve, reject) => {
      const voice = voiceFor(lang);
      if (!voice || !text) return reject(new Error('unavailable'));
      const end = once(resolve, reject);
      const u = new win.SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.95;
      current = {
        cancel: () => {
          synth.cancel();
          end.ok();
        },
      };
      u.onend = () => end.ok();
      u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? end.ok() : end.fail(new Error(e.error || 'speech_failed')));
      synth.cancel();
      synth.speak(u);
    });
  }

  return {
    isAvailable(lang, { audioUrl } = {}) {
      return Boolean(audioUrl && hasAudio) || Boolean(voiceFor(lang));
    },

    async speak(text, lang, { audioUrl } = {}) {
      stop();
      if (audioUrl && hasAudio) {
        try {
          await playAudio(audioUrl);
          return;
        } catch {
          if (!current) return; // stopped while loading
          // fall through to a browser voice
        }
      }
      await synthesize(text, lang);
    },

    stop,

    /** Browsers load voices late. Resolves when they are known, or after `ms`. */
    whenReady(ms = 1000) {
      if (!synth || synth.getVoices().length) return Promise.resolve();
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        synth.addEventListener?.(
          'voiceschanged',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    },
  };
}
