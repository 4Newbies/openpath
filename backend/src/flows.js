import fs from 'node:fs';
import path from 'node:path';
import { validateFlow } from '../../shared/flow.js';

/**
 * Load every question file (*.json) in a folder and key it by flowId.
 * Invalid files stop the server at startup: answers can't be validated
 * against a broken flow.
 */
export function loadFlows(dir) {
  const flows = new Map();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json'));
  for (const file of files) {
    const full = path.join(dir, file);
    let flow;
    try {
      flow = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      throw new Error(`Question file ${file} is not valid JSON: ${e.message}`);
    }
    const errors = validateFlow(flow);
    if (errors.length) throw new Error(`Question file ${file} is invalid:\n  - ${errors.join('\n  - ')}`);
    if (flows.has(flow.flowId)) throw new Error(`Two question files use flowId "${flow.flowId}"`);
    flows.set(flow.flowId, flow);
  }
  if (flows.size === 0) throw new Error(`No question files found in ${dir}`);
  return flows;
}
