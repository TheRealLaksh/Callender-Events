import { getGoogleAccessToken } from './googleAuth.js';
import { state, saveToStorage } from './state.js';
import { renderCalendar, renderEventSlots } from './calendar.js';

// Sync single event to Google Calendar (Create or Update)
export async function syncEventToGoogle(eventId) {
    const token = getGoogleAccessToken();
    if (!token) {
        console.warn('Sync skipped: No Google token');
        return null;
    }
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return null;

    // Construct Payload
    const payload = {
        summary: ev.name,
        description: ev.description || '',
        start: { dateTime: ev.datetimeStart },
        end: { dateTime: ev.datetimeEnd }
    };

    try {
        let url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
        let method = 'POST';

        // Update logic
        if (ev.googleEventId) {
            url += `/${ev.googleEventId}`;
            // Use PATCH instead of PUT to avoid wiping other fields (attendees, meet links)
            method = 'PATCH'; 
        }

        const res = await fetch(url, {
            method: method,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Handle 404/410 (Event deleted on server)
        if (res.status === 404 || res.status === 410) {
            console.warn('Event deleted on Google. Re-creating link...');
            ev.googleEventId = null; // Clear ID to trigger a fresh POST next time
            ev.synced = false;
            saveToStorage();
            return null;
        }

        if (!res.ok) {
            const err = await res.json();
            console.error('Sync failed:', err);
            ev.synced = false;
            saveToStorage();
            return null;
        }

        const json = await res.json();
        
        // Update local state with confirmed ID
        if (json && json.id) {
            ev.googleEventId = json.id;
            ev.synced = true;
            saveToStorage();
            renderCalendar(); // Update UI (dot indicator)
            return json;
        }
    } catch (err) {
        console.error('Network error syncing to Google:', err);
        ev.synced = false;
        saveToStorage();
        return null;
    }
}

// Import events from Google Calendar (primary) and merge into local state
export async function importAllFromGoogle() {
    const token = getGoogleAccessToken();
    if (!token) return [];

    try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent('1970-01-01T00:00:00Z')}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const json = await res.json();
        const items = Array.isArray(json.items) ? json.items : [];
        let hasChanges = false;

        items.forEach(it => {
            // 1. Parse Dates
            let start = it.start?.dateTime;
            let end = it.end?.dateTime;

            // Handle All-Day events (YYYY-MM-DD)
            // Convert to local ISO to prevent timezone shifts
            if (!start && it.start?.date) {
                const parts = it.start.date.split('-'); 
                start = new Date(parts[0], parts[1] - 1, parts[2]).toISOString();
            }
            if (!end && it.end?.date) {
                const parts = it.end.date.split('-');
                end = new Date(parts[0], parts[1] - 1, parts[2]).toISOString();
            }

            if (!start || !end) return;

            // 2. Check for Zombies (Events locally deleted but present on Google)
            const isTrashed = state.trash.some(trashEv => trashEv.googleEventId === it.id);
            if (isTrashed) return; 

            // 3. Find existing
            const existingIdx = state.events.findIndex(e => e.googleEventId === it.id);
            
            if (existingIdx === -1) {
                // CREATE LOCAL
                const newId = state.eventIdCounter++;
                const local = {
                    id: newId,
                    name: it.summary || '(No Title)',
                    description: it.description || '',
                    datetimeStart: start,
                    datetimeEnd: end,
                    googleEventId: it.id,
                    synced: true,
                    color: null,
                    reminders: []
                };
                state.events.push(local);
                hasChanges = true;
            } else {
                // UPDATE LOCAL (Server Wins Strategy)
                const existing = state.events[existingIdx];

                // Do NOT overwrite local events if they have pending changes (synced === false)
                // If synced is false, we skip this update and let pushUnsyncedEvents handle it.
                if (existing.synced) {
                    // Only update if something actually changed on server
                    if (existing.name !== it.summary || 
                        existing.datetimeStart !== start || 
                        existing.datetimeEnd !== end) {
                        
                        state.events[existingIdx] = {
                            ...existing, // Keep local fields
                            name: it.summary || '(No Title)',
                            description: it.description || existing.description,
                            datetimeStart: start,
                            datetimeEnd: end,
                            synced: true
                        };
                        hasChanges = true;
                    }
                }
            }
        });

        if (hasChanges) {
            saveToStorage();
            renderCalendar();
            renderEventSlots();
            console.log('Synced with Google Calendar');
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

// Real Debounce Map to prevent race conditions
const syncTimers = {};

export function registerAutoSync() {
    window.addEventListener('app:eventSaved', async (ev) => {
        const { id } = ev.detail || {};
        if (!id) return;
        
        // Clear pending timer for this specific event
        if (syncTimers[id]) {
            clearTimeout(syncTimers[id]);
        }

        // Set new timer
        syncTimers[id] = setTimeout(() => {
            syncEventToGoogle(id);
            delete syncTimers[id];
        }, 2000); 
    });
}

// Background sync loop
let _bgHandle = null;
export function startBackgroundSync(intervalMs = 60 * 1000) { 
    if (_bgHandle) clearInterval(_bgHandle);
    
    // Initial sync
    importAllFromGoogle().then(pushUnsyncedEvents);

    _bgHandle = setInterval(async () => {
        try {
            await importAllFromGoogle();
            await pushUnsyncedEvents();
        } catch (e) {
            console.error('Background sync error', e);
        }
    }, intervalMs);
}

export function initGoogleSync() {
    registerAutoSync();
}