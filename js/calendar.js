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

    // Padding for empty days
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        // Tailwind: Transparent, no interaction
        emptyCell.className = 'aspect-square';
        emptyCell.setAttribute('aria-hidden', 'true');
        calendarGrid.appendChild(emptyCell);
    }

    const today = new Date();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        
        // BASE STYLES: Aspect ratio square, flex center, rounded corners, transition, cursor
        let classes = "aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 relative group border border-transparent";
        
        // Standard hover
        classes += " hover:bg-slate-800 hover:border-slate-700 text-slate-300 hover:text-white";

        // IS TODAY?
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            classes = classes.replace("border-transparent", "border-primary bg-primary/10 text-primary font-bold shadow-[0_0_15px_rgba(129,140,248,0.3)]");
            dayEl.setAttribute('aria-current', 'date');
        }

        dayEl.className = classes;
        dayEl.textContent = day;
        
        // Accessibility
        dayEl.setAttribute('tabindex', '0');
        dayEl.setAttribute('role', 'gridcell');
        dayEl.setAttribute('aria-label', `${monthNames[month]} ${day}`);

        // EVENT INDICATORS
        const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = state.events.some(e => e.datetimeStart.startsWith(cellDateStr));
        
        if (hasEvent) {
            const dot = document.createElement('div');
            // Tailwind dot style
            dot.className = "w-1.5 h-1.5 bg-secondary rounded-full mt-1 shadow-sm group-hover:scale-125 transition-transform";
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