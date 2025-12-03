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
            trash: state.trash, // FIX: Persist trash so Undo works after reload
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
        let trash = [];
        let storedCounter = 1;

        // Support for legacy array format vs new object format
        if (Array.isArray(parsed)) {
            events = parsed;
        } else if (parsed && typeof parsed === 'object') {
            events = Array.isArray(parsed.events) ? parsed.events : [];
            trash = Array.isArray(parsed.trash) ? parsed.trash : []; // FIX: Load trash
            if (Number.isFinite(parsed.eventIdCounter)) {
                storedCounter = parsed.eventIdCounter;
            }
        }

        // Helper to sanitize an event list
        const sanitize = (list) => {
            return list.filter(ev => {
                if (!ev) return false;
                if (!ev.datetimeStart || !ev.datetimeEnd) return false;
                try {
                    const s = new Date(ev.datetimeStart);
                    const e = new Date(ev.datetimeEnd);
                    return isValidDate(s) && isValidDate(e);
                } catch { return false; }
            }).map(ev => {
                // Ensure ID is always a number
                let id = typeof ev.id === 'number' ? ev.id : parseInt(ev.id);
                if (isNaN(id)) id = 0; 

                return {
                    ...ev,
                    id: id,
                    synced: ev.synced === true,
                    googleEventId: ev.googleEventId || null
                };
            });
        };

        state.events = sanitize(events);
        state.trash = sanitize(trash);

        // Safe Counter Calculation (Prevents Stack Overflow)
        // We must check both events AND trash to ensure we don't reuse an ID that is currently in the trash
        const maxIdEvents = state.events.reduce((max, ev) => (ev.id > max ? ev.id : max), 0);
        const maxIdTrash = state.trash.reduce((max, ev) => (ev.id > max ? ev.id : max), 0);
        const maxId = Math.max(maxIdEvents, maxIdTrash);
        
        // Ensure counter is always ahead of the highest existing ID
        state.eventIdCounter = Math.max(storedCounter, maxId + 1);
        
        return true;
    } catch (err) {
        console.error('Failed to load from storage', err);
        // Reset state to avoid crash loops on corrupted data
        state.events = [];
        state.trash = [];
        state.eventIdCounter = 1;
        return false;
    }
}