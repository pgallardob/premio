let channel;
try {
  if ('BroadcastChannel' in globalThis) channel = new BroadcastChannel('olivos-campaign-updates');
} catch { /* Automatic polling remains available if cross-tab messaging is blocked. */ }

export function announceParticipation() {
  channel?.postMessage({ type: 'participation-recorded' });
}

export function onParticipationRecorded(listener) {
  channel?.addEventListener('message', (event) => {
    if (event.data?.type === 'participation-recorded') listener();
  });
}
