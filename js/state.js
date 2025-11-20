import { STORAGE_KEY } from './config.js';
import { isValidDate } from './utils.js';

export const state = {
    events: [],
    eventIdCounter: 1,
    currentReminders: [],
    editingEventId: null,
    currentCalendarDate: new Date(), 
    selectedDate: new Date(),
    trash: [],           
    viewMode: 'month',   
    categories: ['Work', 'Personal', 'Health', 'Important'], 
};

export function saveToStorage() {
    try {
        const payload = {
            events: state.events,
            eventIdCounter: state.eventIdCounter
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        // notify other modules that state changed
        window.dispatchEvent(new CustomEvent('app:stateSaved', { detail: { timestamp: Date.now() } }));
    } catch (err) {
        console.error('Failed to save to storage', err);
    }
}

export function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return true;
        const parsed = JSON.parse(raw);
        let events = [];
        let counter = 1;
        if (Array.isArray(parsed)) {
            events = parsed;
            counter = events.length > 0 ? Math.max(...events.map(e => e.id || 0)) + 1 : 1;
        } else if (parsed && typeof parsed === 'object') {
            events = Array.isArray(parsed.events) ? parsed.events : [];
            counter = Number.isFinite(parsed.eventIdCounter) ? parsed.eventIdCounter : (events.length > 0 ? Math.max(...events.map(e => e.id || 0)) + 1 : 1);
        }
        // sanitize events
        state.events = events.filter(ev => {
            if (!ev) return false;
            if (!ev.datetimeStart || !ev.datetimeEnd) return false;
            try {
                const s = new Date(ev.datetimeStart);
                const e = new Date(ev.datetimeEnd);
                return isValidDate(s) && isValidDate(e);
            } catch { return false; }
        }).map(ev => ({
            ...ev,
            id: typeof ev.id === 'number' ? ev.id : (parseInt(ev.id) || undefined),
            synced: ev.synced === true,
            googleEventId: ev.googleEventId || null
        }));
        state.eventIdCounter = Number.isFinite(counter) ? counter : (state.events.length > 0 ? Math.max(...state.events.map(e => e.id || 0)) + 1 : 1);
        return true;
    } catch (err) {
        console.error('Failed to load from storage', err);
        state.events = [];
        state.eventIdCounter = 1;
        return false;
    }
}
