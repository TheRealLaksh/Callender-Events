import { state } from './state.js';

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
        emptyCell.classList.add('calendar-day', 'empty');
        emptyCell.setAttribute('aria-hidden', 'true');
        calendarGrid.appendChild(emptyCell);
    }

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.classList.add('calendar-day');
        dayEl.textContent = day;
        
        // Accessibility: Make focusable
        dayEl.setAttribute('tabindex', '0');
        dayEl.setAttribute('role', 'gridcell');
        dayEl.setAttribute('aria-label', `${monthNames[month]} ${day}`);

        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dayEl.classList.add('is-today');
            dayEl.setAttribute('aria-current', 'date');
        }

        const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = state.events.some(e => e.datetimeStart.startsWith(cellDateStr));
        
        if (hasEvent) {
            const dot = document.createElement('div');
            dot.classList.add('event-indicator');
            dayEl.appendChild(dot);
            dayEl.setAttribute('aria-label', `${monthNames[month]} ${day}, has events`);
        }
        calendarGrid.appendChild(dayEl);
    }
}

export function changeMonth(offset) {
    state.currentCalendarDate.setDate(1); 
    state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + offset);
    renderCalendar();
}