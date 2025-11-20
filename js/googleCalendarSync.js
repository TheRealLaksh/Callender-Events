import { getGoogleAccessToken } from './googleAuth.js';
import { state, saveToStorage } from './state.js';

// Sync single event to Google Calendar and mark it synced
export async function syncEventToGoogle(eventId) {
    const token = getGoogleAccessToken();
    if (!token) {
        console.warn('No Google token');
        return null;
    }
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return null;

    const payload = {
        summary: ev.name,
        description: ev.description || '',
        start: { dateTime: ev.datetimeStart },
        end: { dateTime: ev.datetimeEnd }
    };

    try {
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json && json.id) {
            ev.googleEventId = json.id;
            ev.synced = true;
            saveToStorage();
            return json;
        } else {
            console.error('Failed to sync:', json);
            ev.synced = false;
            saveToStorage();
            return null;
        }
    } catch (err) {
        console.error('Error syncing to Google:', err);
        ev.synced = false;
        saveToStorage();
        return null;
    }
}

// Import events from Google Calendar (primary) and merge into local state
export async function importAllFromGoogle() {
    const token = getGoogleAccessToken();
    if (!token) {
        console.warn('No Google token for import');
        return [];
    }

    try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent('1970-01-01T00:00:00Z')}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        const items = Array.isArray(json.items) ? json.items : [];
        let imported = 0;
        items.forEach(it => {
            // map google event to local event shape
            const start = it.start?.dateTime || it.start?.date;
            const end = it.end?.dateTime || it.end?.date;
            if (!start || !end) return;
            const exists = state.events.find(e => e.googleEventId === it.id);
            if (!exists) {
                const newId = state.eventIdCounter++;
                const local = {
                    id: newId,
                    name: it.summary || 'Imported',
                    description: it.description || '',
                    datetimeStart: new Date(start).toISOString(),
                    datetimeEnd: new Date(end).toISOString(),
                    googleEventId: it.id,
                    synced: true
                };
                state.events.push(local);
                imported++;
            }
        });
        if (imported > 0) {
            saveToStorage();
        }
        return items;
    } catch (err) {
        console.error('Failed to import from Google:', err);
        return [];
    }
}

// Push local unsynced events to Google
export async function pushUnsyncedEvents() {
    const unsynced = state.events.filter(e => !e.synced);
    for (const ev of unsynced) {
        await syncEventToGoogle(ev.id);
    }
}

// Auto sync handler for app saved events (called via window event)
export function registerAutoSync() {
    window.addEventListener('app:eventSaved', async (ev) => {
        const { id, action } = ev.detail || {};
        if (!id) return;
        // For create or update, attempt to sync the event
        setTimeout(() => {
            syncEventToGoogle(id);
        }, 1000); // small debounce
    });
}

// Background sync loop (import + push)
let _bgHandle = null;
export function startBackgroundSync(intervalMs = 10 * 60 * 1000) {
    if (_bgHandle) clearInterval(_bgHandle);
    _bgHandle = setInterval(async () => {
        try {
            await importAllFromGoogle();
            await pushUnsyncedEvents();
        } catch (e) {
            console.error('Background sync error', e);
        }
    }, intervalMs);
}

// One-time initialization to start listening for app events
export function initGoogleSync() {
    registerAutoSync();
}
