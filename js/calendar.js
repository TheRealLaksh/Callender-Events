import { state } from './state.js';
// Removed { deleteEvent, editEvent } import to prevent circular dependency crash

export function renderCalendar() {
    const year = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const display = document.getElementById('month-year-display');
    if(display) display.textContent = `${monthNames[month]} ${year}`;

    const calendarGrid = document.getElementById('calendar-grid');
    if(!calendarGrid) return;
    
    calendarGrid.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Padding
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'aspect-square'; 
        calendarGrid.appendChild(emptyCell);
    }

    const today = new Date();
    const selected = state.selectedDate;

    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('button');
        
        // Base Classes for shadcn-like calendar cell
        let classes = "aspect-square flex flex-col items-center justify-center rounded-md text-sm transition-all hover:bg-slate-800 text-slate-300 relative";

        // Is this specific day "Selected"?
        const isSelected = selected && day === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear();
        
        if (isSelected) {
            classes += " bg-primary text-slate-900 font-bold hover:bg-primary hover:text-slate-900 shadow-md";
        }

        // Is Today?
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear() && !isSelected) {
            classes += " bg-slate-800 text-white font-semibold";
        }

        dayEl.className = classes;
        dayEl.textContent = day;
        
        // Accessibility
        dayEl.setAttribute('type', 'button');
        
        // Check for events on this day (Small Dot)
        const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = state.events.some(e => e.datetimeStart.startsWith(cellDateStr));
        
        if (hasEvent) {
            const dot = document.createElement('div');
            dot.className = `w-1 h-1 rounded-full absolute bottom-1.5 ${isSelected ? 'bg-slate-900' : 'bg-primary'}`;
            dayEl.appendChild(dot);
        }

        // Click Handler: Select date & Render slots
        dayEl.onclick = () => {
            state.selectedDate = new Date(year, month, day);
            renderCalendar(); // Re-render grid to update selection style
            renderEventSlots(); // Update footer list
        };

        calendarGrid.appendChild(dayEl);
    }

    // Always render slots on load
    renderEventSlots();
}

// Render the "Footer" list of events for the selected day
export function renderEventSlots() {
    const container = document.getElementById('event-slots-container');
    const dateDisplay = document.getElementById('selected-date-display');
    if (!container || !dateDisplay) return;

    const sel = state.selectedDate;
    // Format Header: "June 12, 2025"
    dateDisplay.textContent = sel.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

    // Filter Events
    const selStr = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`;
    const dayEvents = state.events.filter(e => e.datetimeStart.startsWith(selStr));
    
    container.innerHTML = '';

    if (dayEvents.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-500 italic py-2">No events for this day.</div>`;
        return;
    }

    // Render Slots matching the shadcn design
    // Design: bg-muted (slate-800), rounded, relative, after:absolute bar
    dayEvents.sort((a, b) => new Date(a.datetimeStart) - new Date(b.datetimeStart));

    dayEvents.forEach(event => {
        const startTime = new Date(event.datetimeStart).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        const endTime = new Date(event.datetimeEnd).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        
        const slot = document.createElement('div');
        slot.className = "bg-slate-800/50 hover:bg-slate-800 relative rounded-md p-2 pl-4 text-sm transition-colors group cursor-pointer border border-transparent hover:border-slate-700 mb-2";
        
        // Use window.editEvent and window.deleteEvent to avoid circular import
        slot.innerHTML = `
            <div class="absolute left-1 top-2 bottom-2 w-1 bg-primary/70 rounded-full"></div>
            <div class="flex justify-between items-start">
                <div>
                    <div class="font-medium text-white">${event.name}</div>
                    <div class="text-slate-400 text-xs">${startTime} - ${endTime}</div>
                    ${event.location ? `<div class="text-indigo-400 text-[10px] mt-0.5 truncate max-w-[150px]">📍 ${event.location}</div>` : ''}
                </div>
                <div class="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <button onclick="event.stopPropagation(); window.editEvent(${event.id})" class="p-1 hover:text-white text-slate-400" title="Edit">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button onclick="event.stopPropagation(); window.deleteEvent(${event.id})" class="p-1 hover:text-red-400 text-slate-400" title="Delete">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(slot);
    });
}

// Helper for month navigation
export function changeMonth(offset) {
    state.currentCalendarDate.setDate(1);
    state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + offset);
    renderCalendar();
}