import { OpenPathFlow } from './element.js';
import { OpenPathJobs } from './jobs.js';
import { setSpeechProvider, setVoiceProvider } from './providers.js';

if (!customElements.get('openpath-flow')) customElements.define('openpath-flow', OpenPathFlow);
if (!customElements.get('openpath-jobs')) customElements.define('openpath-jobs', OpenPathJobs);

// Available to host pages as window.OpenPath.setSpeechProvider(...) etc.
export { OpenPathFlow, OpenPathJobs, setSpeechProvider, setVoiceProvider };
