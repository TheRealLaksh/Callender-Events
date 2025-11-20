import { STORAGE_KEY } from './config.js';

export const state = {
    events: [],
    eventIdCounter: 1,
    currentReminders: [],
    editingEventId: null,
    currentCalendarDate: new Date()
};

export function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
}

export function loadFromStorage() {
    const storedEvents = localStorage.getItem(STORAGE_KEY);
    if (storedEvents) {
        try {
            state.events = JSON.parse(storedEvents);
            // Fix ID counter to avoid collisions with existing events
            if (state.events.length > 0) {
                const maxId = Math.max(...state.events.map(e => e.id));
                state.eventIdCounter = maxId + 1;
            }
        } catch (error) {
            console.error("Corrupted LocalStorage data found. Resetting.", error);
            state.events = [];
            state.eventIdCounter = 1;
        }
    }
}