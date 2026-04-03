const api = window.location.origin + '/api/game';
const gloveStateEl = document.getElementById('gloveState');
const voiceWordEl = document.getElementById('voiceWord');
const sendBtn = document.getElementById('sendBtn');
const comboVal = document.getElementById('comboVal');
const effectVal = document.getElementById('effectVal');
const historyLog = document.getElementById('historyLog');
const refreshHist = document.getElementById('refreshHist');

async function sendState() {
  try {
    const payload = { gloveState: gloveStateEl.value, voiceWord: voiceWordEl.value };
    const res = await fetch(api + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    comboVal.textContent = data.combo || 'NONE';
    effectVal.textContent = data.effect ? 'Active' : 'Inactive';
    await loadHistory();
  } catch (err) {
    console.error('Error sending state:', err);
    alert('Failed to send action: ' + err.message);
  }
}

async function loadHistory() {
  try {
    const res = await fetch(api + '/history');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const events = await res.json();
    if (!events || events.length === 0) {
      historyLog.textContent = '[No events yet]';
      return;
    }
    historyLog.textContent = events.map(e => {
      const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '?';
      return `${time} | ${e.gloveState} | ${e.voiceWord} | ${e.combo}`;
    }).join('\n');
  } catch (err) {
    console.error('Error loading history:', err);
    historyLog.textContent = '[Error loading history: ' + err.message + ']';
  }
}

sendBtn.addEventListener('click', sendState);
refreshHist.addEventListener('click', loadHistory);

// Load initial history
loadHistory();
