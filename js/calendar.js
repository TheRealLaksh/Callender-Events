import { state, saveToStorage } from './state.js';
import { isValidDate } from './utils.js';

// --- Drag and Drop Logic (#5) ---
let draggedEventId = null;

function handleDragStart(e, eventId) {
    draggedEventId = eventId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
    e.stopPropagation(); // Prevent bubbling to the grid cell
}

function handleDrop(e, targetDateStr) {
    e.preventDefault();
    e.stopPropagation(); // Stop browser handling
    
    // Ensure we are working with an event ID, not a date string
    const ev = state.events.find(e => e.id == draggedEventId);
    
    if (!ev) {
        console.warn("Drop failed: Event not found or invalid ID", draggedEventId);
        return;
    }

    // update event start/end to targetDateStr (keep duration)
    try {
        const oldStart = new Date(ev.datetimeStart);
        const oldEnd = new Date(ev.datetimeEnd);
        const target = new Date(targetDateStr);
        
        // Preserve time of day? 
        // Current logic sets it to midnight of target date. 
        // If you want to keep the specific time, logic would need adjustment.
        // For now, we assume dragging to a day slot resets time to default or start of day.
        
        const durationMs = oldEnd - oldStart;
        
        // Construct new start based on target date
        const newStart = new Date(target); 
        // Optional: If you want to keep the original hour/minute, copy them here:
        newStart.setHours(oldStart.getHours(), oldStart.getMinutes());

        const newEnd = new Date(newStart.getTime() + durationMs);
        
        ev.datetimeStart = newStart.toISOString();
        ev.datetimeEnd = newEnd.toISOString();
        
        saveToStorage();
        renderCalendar();
    } catch (err) {
        console.error('Failed to drop event:', err);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

// --- Calendar rendering & helpers ---

export function renderEventSlots() {
    // FIX: Correct ID matched to index.html
    const listEl = document.getElementById('event-slots-container');
    if (!listEl) return;
    listEl.innerHTML = '';

    // show next upcoming 20 events
    const upcoming = state.events
        .filter(ev => new Date(ev.datetimeStart) >= new Date().setHours(0,0,0,0)) // Optional: only show future
        .sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart))
        .slice(0, 20);

    if (upcoming.length === 0) {
        listEl.innerHTML = '<div class="text-xs text-slate-500 text-center py-4">No upcoming events</div>';
        return;
    }

    upcoming.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'py-2 px-3 rounded-md hover:bg-slate-800/40 cursor-pointer border border-transparent hover:border-slate-700 transition-colors';
        const start = new Date(ev.datetimeStart);
        
        // Formatting date for list
        const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const timeStr = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="text-sm font-medium text-slate-200">${ev.name || 'Untitled'}</div>
                <div class="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">${dateStr}</div>
            </div>
            <div class="text-xs text-slate-500 mt-0.5">${timeStr}</div>
        `;
        
        item.onclick = () => {
            // focus date and scroll into view
            state.selectedDate = new Date(ev.datetimeStart);
            state.currentCalendarDate = new Date(ev.datetimeStart); // Ensure month view switches
            renderCalendar();
            
            // Wait for render, then scroll
            setTimeout(() => {
                const dateKey = ev.datetimeStart.split('T')[0];
                const target = document.querySelector(`[data-date="${dateKey}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('ring-2', 'ring-primary'); // Temporary highlight
                    setTimeout(() => target.classList.remove('ring-2', 'ring-primary'), 2000);
                }
            }, 50);
        };
        listEl.appendChild(item);
    });
}

export function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Update Header Display
    const monthDisplay = document.getElementById('month-year-display');
    if (monthDisplay) {
        const d = state.currentCalendarDate || new Date();
        monthDisplay.textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    const current = new Date(state.currentCalendarDate || state.selectedDate || new Date());
    current.setHours(0, 0, 0, 0);

    // month view grid: first day-of-week offset
    const firstOfMonth = new Date(current.getFullYear(), current.getMonth(), 1);
    const startDay = firstOfMonth.getDay(); // 0..6
    const startDate = new Date(firstOfMonth);
    startDate.setDate(firstOfMonth.getDate() - startDay);

    const cells = 42; // 6 * 7

    for (let i = 0; i < cells; i++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + i);
        const year = cellDate.getFullYear();
        const month = cellDate.getMonth();
        const day = cellDate.getDate();
        
        // ISO string for data attribute matching
        const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const btn = document.createElement('button');
        btn.className = 'p-2 text-left h-28 border border-transparent rounded-lg hover:bg-slate-900 transition relative group flex flex-col items-start gap-1 overflow-hidden';
        btn.setAttribute('data-date', iso);
        
        // FIX: The Day Cell is the DROP TARGET, not the drag source
        btn.ondragover = handleDragOver;
        btn.ondrop = (e) => handleDrop(e, iso);

        // mark current month vs other month
        if (month !== current.getMonth()) {
            btn.classList.add('opacity-30', 'bg-slate-950/30'); // Visual distinction for other months
        } else {
            btn.classList.add('bg-slate-900/40');
        }

        // Highlight "Today"
        const now = new Date();
        const isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
        if (isToday) {
            btn.classList.add('bg-slate-800/80', 'border-slate-700');
        }

        // highlight selected
        const sel = state.selectedDate;
        if (sel && sel.getFullYear() === year && sel.getMonth() === month && sel.getDate() === day) {
            btn.classList.add('ring-1', 'ring-offset-1', 'ring-indigo-400/80', 'z-10');
        }

        // date header
        const header = document.createElement('div');
        header.className = `text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-white' : 'text-slate-400'}`;
        header.textContent = day;
        btn.appendChild(header);

        // events for this date
        const eventsWrap = document.createElement('div');
        eventsWrap.className = 'w-full flex flex-col gap-1 overflow-hidden';

        const dayEvents = state.events.filter(ev => {
            try {
                const s = new Date(ev.datetimeStart);
                return s.getFullYear() === year && s.getMonth() === month && s.getDate() === day;
            } catch { return false; }
        }); // Removed slice here to handle "more" indicator if needed, or stick to slice(0,3)

        // Show max 3 events, indicator for more?
        const displayEvents = dayEvents.slice(0, 3);

        displayEvents.forEach(ev => {
            const evDiv = document.createElement('div');
            // FIX: Make the EVENT draggable
            evDiv.draggable = true;
            evDiv.ondragstart = (e) => handleDragStart(e, ev.id);
            
            evDiv.className = 'text-[10px] truncate rounded px-1.5 py-0.5 cursor-grab active:cursor-grabbing hover:brightness-110 shadow-sm transition w-full text-left';
            evDiv.style.background = ev.color || 'linear-gradient(90deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))';
            evDiv.style.borderLeft = '2px solid #818cf8'; // Primary color accent
            evDiv.textContent = ev.name || 'Event';
            
            // Sync Badge (Dot)
            if (ev.synced) {
                const dot = document.createElement('span');
                dot.className = 'inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full ml-1';
                dot.title = "Synced with Google";
                evDiv.appendChild(dot);
            }

            evDiv.onclick = (e) => {
                e.stopPropagation();
                if (window.editEvent) window.editEvent(ev.id);
            };
            
            eventsWrap.appendChild(evDiv);
        });

        // "More" indicator if > 3
        if (dayEvents.length > 3) {
            const more = document.createElement('div');
            more.className = 'text-[9px] text-slate-500 pl-1';
            more.textContent = `+ ${dayEvents.length - 3} more`;
            eventsWrap.appendChild(more);
        }

        // FIX: Append logic MOVED OUTSIDE the loop
        btn.appendChild(eventsWrap);

        // FIX: Click logic MOVED OUTSIDE the loop
        btn.onclick = () => {
            state.selectedDate = new Date(year, month, day);
            // Don't change view/currentDate on simple select, just highlight
            renderCalendar(); 
            // Note: If you want to sync the "Current View Month" with selection, uncomment:
            // state.currentCalendarDate = new Date(state.selectedDate);
        };

        // FIX: Append to grid MOVED OUTSIDE the loop (Runs for every day cell)
        grid.appendChild(btn);
    }
}

export function changeMonth(offset) {
    state.currentCalendarDate = state.currentCalendarDate || new Date();
    state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + offset);
    // Optional: Select the 1st of the new month? Or keep old selection?
    // Let's keep the selection logic simple for now.
    renderCalendar();
}

export function changeView(mode) {
    state.viewMode = mode;
    // Week view logic is not fully implemented in this snippet, 
    // but this switches the state flag for future expansion.
    state.currentCalendarDate = new Date(state.selectedDate || new Date());
    renderCalendar();
}