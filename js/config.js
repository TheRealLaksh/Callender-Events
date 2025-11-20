export const STORAGE_KEY = 'calibridge_events';

export const durationMap = {
    '-PT5M': '5 Min',
    '-PT15M': '15 Min',
    '-PT30M': '30 Min',
    '-PT1H': '1 Hour',
    '-PT2H': '2 Hours',
    '-P1D': '1 Day',
    '-P2D': '2 Days',
};

export const durationRegex = /-P(\d+)([DH])|-PT(\d+)([MH])/;

export const IST_VTIMEZONE = `
BEGIN:VTIMEZONE
TZID:Asia/Kolkata
BEGIN:STANDARD
DTSTART:19000101T000000
TZOFFSETFROM:+0530
TZOFFSETTO:+0530
TZNAME:IST
END:STANDARD
END:VTIMEZONE
`.trim().replace(/\n/g, '\r\n');