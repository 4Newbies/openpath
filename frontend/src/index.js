import { OpenPathFlow } from './element.js';
import { setSpeechProvider, setVoiceProvider } from './providers.js';

if (!customElements.get('openpath-flow')) customElements.define('openpath-flow', OpenPathFlow);

// Available to host pages as window.OpenPath.setSpeechProvider(...) etc.
export { OpenPathFlow, setSpeechProvider, setVoiceProvider };
