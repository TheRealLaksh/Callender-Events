import { state, saveToStorage } from './state.js';
import { generateUniqueId, showMessage } from './utils.js';
import { renderCalendar, renderEventSlots } from './calendar.js'; 

function escapeICSText(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\')
              .replace(/\n/g, '\\n')
              .replace(/,/g, '\\,')
              .replace(/;/g, '\\;');
}

function unescapeICSText(str) {
    if (!str) return '';
    return str.replace(/\\n/g, '\n')
              .replace(/\\N/g, '\n')
              .replace(/\\,/g, ',')
              .replace(/\\;/g, ';')
              .replace(/\\\\/g, '\\');
}

function formatToICSDateUTC(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    
    const pad = n => n < 10 ? '0' + n : n;
    return d.getUTCFullYear() +
           pad(d.getUTCMonth() + 1) +
           pad(d.getUTCDate()) + 'T' +
           pad(d.getUTCHours()) +
           pad(d.getUTCMinutes()) +
           pad(d.getUTCSeconds()) + 'Z';
}

function createAlarmBlock(reminderValue) {
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    return [
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 
        `TRIGGER:${reminderValue}`, `UID:${generateUniqueId()}-alarm`, `DTSTAMP:${now}`, 'END:VALARM'
    ].join('\r\n');
}

function formatICSDateToISO(icsDate) {
    const year = icsDate.substring(0, 4);
    const month = icsDate.substring(4, 6);
    const day = icsDate.substring(6, 8);
    
    if (icsDate.length >= 8 && icsDate.includes('T')) {
        const timePart = icsDate.split('T')[1];
        const hour = timePart.substring(0, 2);
        const min = timePart.substring(2, 4);
        const sec = timePart.substring(4, 6) || '00';
        
        if (icsDate.endsWith('Z')) {
            const date = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
            
            return date.getFullYear() + '-' +
                String(date.getMonth() + 1).padStart(2, '0') + '-' +
                String(date.getDate()).padStart(2, '0') + 'T' +
                String(date.getHours()).padStart(2, '0') + ':' +
                String(date.getMinutes()).padStart(2, '0');
        } else {
            return `${year}-${month}-${day}T${hour}:${min}`;
        }
    }
    
    return `${year}-${month}-${day}T00:00`;
}

function unfoldICSLines(content) {
    return content.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r\n|\n|\r/);
}

function parseICS(icsContent) {
    const lines = unfoldICSLines(icsContent).map(line => line.trim());
    const importedEvents = [];
    let currentEvent = null;

    lines.forEach(line => {
        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = { name: 'Untitled', timezone: 'Asia/Kolkata', reminders: [] };
        } else if (line.startsWith('END:VEVENT') && currentEvent) {
            if (currentEvent.datetimeStart) {
                if (!currentEvent.datetimeEnd) {
                    const start = new Date(currentEvent.datetimeStart);
                    const end = new Date(start.getTime() + 3600000); 
                    currentEvent.datetimeEnd = end.toISOString().substring(0, 16);
                }
                importedEvents.push(currentEvent);
            }
            currentEvent = null;
        } else if (currentEvent) {
            const firstColonIndex = line.indexOf(':');
            if (firstColonIndex === -1) return;
            
            const keyFull = line.substring(0, firstColonIndex);
            const value = line.substring(firstColonIndex + 1);
            
            const keyPart = keyFull.split(';')[0];

            if (keyPart === 'SUMMARY') currentEvent.name = unescapeICSText(value);
            else if (keyPart === 'DESCRIPTION') currentEvent.description = unescapeICSText(value);
            else if (keyPart === 'LOCATION') currentEvent.location = unescapeICSText(value);
            else if (keyPart === 'DTSTART') {
                const tzid = keyFull.match(/TZID=([^;:]+)/);
                if (tzid) currentEvent.timezone = tzid[1];
                
                const val = value.match(/(\d{8}T\d{6}Z?|\d{8})/);
                if (val) currentEvent.datetimeStart = formatICSDateToISO(val[0]);
            } else if (keyPart === 'DTEND') {
                 const val = value.match(/(\d{8}T\d{6}Z?|\d{8})/);
                 if (val) currentEvent.datetimeEnd = formatICSDateToISO(val[0]);
            } else if (keyPart === 'TRIGGER') {
                 const durMatch = value.match(/(-?P[\d\w]+)/);
                 if (durMatch && !currentEvent.reminders.includes(durMatch[0])) {
                     currentEvent.reminders.push(durMatch[0]);
                 }
            }
        }
    });
    return importedEvents;
}

export function importICS(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = parseICS(e.target.result);
            if (imported.length === 0) { showMessage('No events found.', 'error'); return; }
            
            imported.forEach(ev => { 
                state.events.push({ ...ev, id: state.eventIdCounter++ }); 
            });
            
            saveToStorage(); 
            renderCalendar(); 
            renderEventSlots(); 
            showMessage(`Imported ${imported.length} events!`, 'success');
        } catch (error) { 
            console.error(error);
            showMessage('Failed to parse file.', 'error'); 
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

export function setupExport() {
    const btn = document.getElementById('export-btn');
    if (!btn) return;
    
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        if (state.events.length === 0) { showMessage('No events to export.', 'error'); return; }
        let fileName = document.getElementById('export-file-name').value.trim() || 'Calibridge_Export';
        if (!fileName.endsWith('.ics')) fileName += '.ics';

        const lines = [
            'BEGIN:VCALENDAR', 
            'VERSION:2.0', 
            'PRODID:-//Calibridge//EN', 
            'CALSCALE:GREGORIAN'
        ];
        
        const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        state.events.forEach(e => {
            const summary = escapeICSText(e.name || 'Untitled');
            const loc = escapeICSText(e.location || '');
            const desc = escapeICSText(e.description || '');
            
            const dtStart = formatToICSDateUTC(e.datetimeStart);
            const dtEnd = formatToICSDateUTC(e.datetimeEnd);

            lines.push(
                'BEGIN:VEVENT', 
                `UID:${generateUniqueId()}`, 
                `DTSTAMP:${now}`,
                `DTSTART:${dtStart}`, 
                `DTEND:${dtEnd}`,
                `SUMMARY:${summary}`, 
                `LOCATION:${loc}`, 
                `DESCRIPTION:${desc}`
            );
            
            e.reminders.forEach(r => lines.push(createAlarmBlock(r)));
            lines.push('END:VEVENT');
        });
        lines.push('END:VCALENDAR');
        
        const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showMessage(`Exported to ${fileName}!`, 'success');
    });
}