// Read-only live smoke check: no environment keys, database writes or Telegram sends.
import {emptyState} from './lib/cloud.mjs';
import {createMonitor} from './monitor.mjs';
const state=emptyState();
await createMonitor(state,{},async()=>{}).refresh(Date.now());
console.log(JSON.stringify({jewellers:state.jewellers,qualifyingHeadlines:state.news.length,errors:state.errors},null,2));
if(!Object.values(state.jewellers||{}).some(e=>e.status==='available'))process.exitCode=1;
