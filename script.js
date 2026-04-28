// Global variables
let calendarData = {};
let defaultPeriods = [];
let tz = 'Asia/Hong_Kong';
let periods = [];
let timeOffset = 0;

// UI References
const app = document.getElementById('normalView');
const fsLayer = document.getElementById('fullscreenLayer');
const settingsPanel = document.getElementById('settingsPanel');
const dayPicker = document.getElementById('dayPicker');
const autoBtn = document.getElementById('autoSetBtn');
const pill = document.getElementById('activeDayPill');

// State Variables
let currentDay = 1;
let isFullscreen = false;
let testModeOffset = null;
let isTomorrowView = false;
let isAutoMode = true;
let loopId = null;

// 1. INITIALIZE (FORCED JSON LOADING)
async function init() {
    try {
        const response = await fetch('timetable_store.json');
        const configData = await response.json();

        calendarData = configData.calendar;
        
        // FORCE the app to use JSON data every time, ignoring previous edits in localStorage
        defaultPeriods = configData.defaultPeriods;
        periods = JSON.parse(JSON.stringify(defaultPeriods));

        if (configData.settings && configData.settings.timeZone) {
            tz = configData.settings.timeZone;
        }
        timeOffset = (configData.settings && configData.settings.defaultOffsetSeconds !== undefined)
            ? configData.settings.defaultOffsetSeconds * 1000 : 0;

        const savedDay = localStorage.getItem('lessonTimer_day');
        if (savedDay) currentDay = Number(savedDay);

        const savedAuto = localStorage.getItem('lessonTimer_isAuto');
        if (savedAuto !== null) isAutoMode = savedAuto === 'true';
        startApp();
    } catch (error) {
        console.error('Failed to load JSON config:', error);
    }
}

init();

function startApp() {
    dayPicker.value = currentDay;
    updateOffsetDisplay();
    updateAutoButtonUI();
    if (isAutoMode) {
        activateAutoMode();
    }

    // Setup Event Listeners
    document.getElementById('dayPicker').onchange = setDay;
    document.getElementById('toggleSettingsBtn').onclick = () => {
        if (settingsPanel.classList.contains('show')) closeSettings();
        else settingsPanel.classList.add('show');
    };
    document.getElementById('fullscreenBtn').onclick = enterFullscreen;
    document.getElementById('fsExitBtn').onclick = exitFullscreen;

    populateTable(currentDay);
    tick();
}

// --- LOOP SYSTEM ---
function tick() {
    updateInfo();
    if (isFullscreen) {
        loopId = requestAnimationFrame(tick);
    } else {
        loopId = setTimeout(tick, 1000);
    }
}

// --- LOGIC FUNCTIONS ---
function getRealTimeHK() {
    const now = new Date();
    const str = now.toLocaleString('en-US', { timeZone: tz });
    const d = new Date(str);
    d.setMilliseconds(now.getMilliseconds());
    return new Date(d.getTime() + timeOffset);
}

function nowHK() {
    const real = getRealTimeHK();
    if (testModeOffset !== null) {
        return new Date(real.getTime() + testModeOffset);
    }
    return real;
}

function activateAutoMode() {
    isAutoMode = true;
    localStorage.setItem('lessonTimer_isAuto', 'true');
    checkAutoDate();
    updateAutoButtonUI();
}

function checkAutoDate() {
    if (!isAutoMode) return;
    let t = nowHK();
    let useDate = t;
    isTomorrowView = false;
    // After 15:40, switch to tomorrow
    if (t.getHours() > 15 || (t.getHours() === 15 && t.getMinutes() >= 40)) {
        useDate = new Date(t);
        useDate.setDate(t.getDate() + 1);
        isTomorrowView = true;
    }
    const key = `${useDate.getFullYear()}-${useDate.getMonth() + 1}-${useDate.getDate()}`;
    const autoDay = calendarData[key];
    if (autoDay) {
        currentDay = autoDay;
        dayPicker.value = currentDay;
        localStorage.setItem('lessonTimer_day', currentDay);
        populateTable(currentDay);
        updateInfo();
    }
}

function updateAutoButtonUI() {
    if (isAutoMode) {
        autoBtn.classList.add('active-auto');
        autoBtn.textContent = "Auto Mode Active (Day Locked)";
    } else {
        autoBtn.classList.remove('active-auto');
        autoBtn.textContent = "✨ Auto Set Day";
    }
}

function enableTestMode() {
    const input = document.getElementById('testTimeInput').value;
    if (!input) return;
    const [h, m] = input.split(':').map(Number);
    const realNow = getRealTimeHK();
    const target = new Date(realNow.getFullYear(), realNow.getMonth(), realNow.getDate(), h, m, 0);
    testModeOffset = target.getTime() - realNow.getTime();

    document.getElementById('testModeBadge').style.display = 'inline-block';
    document.getElementById('resetTestBtn').style.display = 'block';

    if (isAutoMode) checkAutoDate();
    updateInfo();
}

function disableTestMode() {
    testModeOffset = null;
    document.getElementById('testModeBadge').style.display = 'none';
    document.getElementById('resetTestBtn').style.display = 'none';
    document.getElementById('testTimeInput').value = '';
    if (isAutoMode) checkAutoDate();
    updateInfo();
}

function updateOffsetDisplay() {
    const s = timeOffset / 1000;
    const sign = s >= 0 ? '+' : '';
    const displayElement = document.getElementById('offsetDisplay');
    if (displayElement) {
        displayElement.textContent = `${sign}${s}s`;
    }
}

function parseHM(hm) {
    const n = nowHK();
    const [h, m] = hm.split(':').map(Number);
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m);
}

function diffFmt(ms) {
    if (ms <= 0) return '00:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function diffFmtMs(ms) {
    if (ms <= 0) return '00:00.00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const centi = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${centi.toString().padStart(2, '0')}`;
}

function getDaySchedule(day) {
    return periods.map((p, index) => {
        const rawSubject = p.type === "class" ? (p[`day${day}`] || "") : p.display;
        return {
            index: index,
            start: parseHM(p.start),
            end: parseHM(p.end),
            rawStart: p.start,
            rawEnd: p.end,
            type: p.type,
            subject: rawSubject
        };
    });
}

function getCombinedLesson(period, schedule) {
    if (!period || period.type !== 'class') return period;
    let combined = { ...period };
    let isConnected = false;

    let backIdx = period.index - 1;
    while (backIdx >= 0) {
        let prev = schedule[backIdx];
        if (prev.subject === combined.subject && prev.end.getTime() === combined.start.getTime()) {
            combined.start = prev.start;
            combined.rawStart = prev.rawStart;
            isConnected = true;
            backIdx--;
        } else break;
    }

    let fwdIdx = period.index + 1;
    let activeEndTime = combined.end;
    while (fwdIdx < schedule.length) {
        let next = schedule[fwdIdx];
        if (next.subject === combined.subject && next.start.getTime() === activeEndTime.getTime()) {
            activeEndTime = next.end;
            combined.end = activeEndTime;
            combined.rawEnd = next.rawEnd;
            isConnected = true;
            fwdIdx++;
        } else break;
    }

    if (isConnected) combined.isDouble = true;
    return combined;
}

function closeSettings() {
    settingsPanel.classList.remove('show');
}

function setDay() {
    if (isAutoMode) {
        isAutoMode = false;
        localStorage.setItem('lessonTimer_isAuto', 'false');
        isTomorrowView = false;
        updateAutoButtonUI();
    }
    currentDay = Number(document.getElementById('dayPicker').value);
    localStorage.setItem('lessonTimer_day', currentDay);
    populateTable(currentDay);
    updateInfo();
}

function populateTable(day) {
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = '';
    const sched = getDaySchedule(day);

    sched.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="time">${r.rawStart}–${r.rawEnd}</td><td class="subject">${r.subject}</td>`;
        tbody.appendChild(tr);
    });

    const pillText = `Day ${day}`;
    if (isTomorrowView) {
        pill.innerHTML = `⚠️ ${pillText} (Tomorrow)`;
        pill.classList.add('tomorrow-pill');
    } else {
        pill.textContent = pillText;
        pill.classList.remove('tomorrow-pill');
    }
}

function between(t, a, b) {
    return t >= a && t < b;
}

function analyze(day) {
    if (isTomorrowView) {
        return { current: null, nextEvent: null, nextLesson: null, countdownTo: null };
    }

    const schedule = getDaySchedule(day);
    const t = nowHK();
    const nowIdx = schedule.findIndex(p => between(t, p.start, p.end));
    let current = null, nextEvent = null, nextLesson = null, countdownTo = null;

    if (nowIdx !== -1) {
        current = getCombinedLesson(schedule[nowIdx], schedule);
        countdownTo = current.end;
        let nextSearchIdx = schedule.findIndex(p => p.start.getTime() >= current.end.getTime());
        if (nextSearchIdx !== -1) {
            nextEvent = schedule.slice(nextSearchIdx).find(p => p.type === "event");
            let foundNextLesson = schedule.slice(nextSearchIdx).find(p => p.type === "class");
            if (foundNextLesson) nextLesson = getCombinedLesson(foundNextLesson, schedule);
        }
    } else {
        nextEvent = schedule.find(p => p.start > t && p.type === "event");
        let foundNextLesson = schedule.find(p => p.start > t && p.type === "class");
        if (foundNextLesson) nextLesson = getCombinedLesson(foundNextLesson, schedule);
        if (nextEvent || nextLesson) {
            const eStart = nextEvent ? nextEvent.start : new Date(8640000000000000);
            const lStart = nextLesson ? nextLesson.start : new Date(8640000000000000);
            const upcoming = (eStart < lStart) ? nextEvent : nextLesson;
            countdownTo = upcoming.start;
        }
    }
    return { current, nextEvent, nextLesson, countdownTo };
}

function updateInfo() {
    const t = nowHK();
    const { current, nextEvent, nextLesson, countdownTo } = analyze(currentDay);

    const timeLeft = countdownTo ? countdownTo - t : 0;
    const timeStr = isFullscreen ? diffFmtMs(timeLeft) : diffFmt(timeLeft);
    const clockStr = t.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const mainStatusLabel = document.getElementById('mainStatusLabel');
    const scheduleLabel = document.getElementById('scheduleLabel');
    const nowSt = document.getElementById('nowStatus');
    const bar = document.getElementById('lessonProgressBar');
    const pctText = document.getElementById('progressPercent');

    if (current && countdownTo && !isTomorrowView) {
        const totalDuration = current.end - current.start;
        const elapsed = t - current.start;
        let pct = (elapsed / totalDuration) * 100;
        if (pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        const pctFixed = pct.toFixed(2);

        bar.style.width = `${pct}%`;
        pctText.textContent = `${Math.floor(pct)}%`;

        const fsBar = document.getElementById('fsProgressBar');
        const fsText = document.getElementById('fsProgressPercent');
        if (fsBar && fsText) {
            fsBar.style.width = `${pct}%`;
            fsText.textContent = `${pctFixed}%`;

            if (timeLeft < 60000) fsBar.style.backgroundColor = 'var(--danger)';
            else if (current.type === 'event') fsBar.style.backgroundColor = 'var(--break-color)';
            else fsBar.style.backgroundColor = 'var(--accent)';
        }

        if (timeLeft < 60000) bar.classList.add('danger');
        else bar.classList.remove('danger');

        if (current.type === 'event') bar.classList.add('break');
        else bar.classList.remove('break');
    } else {
        bar.style.width = '0%';
        pctText.textContent = '';
        bar.classList.remove('danger', 'break');
        const fsBar = document.getElementById('fsProgressBar');
        const fsText = document.getElementById('fsProgressPercent');
        if (fsBar && fsText) {
            fsBar.style.width = '0%';
            fsText.textContent = '';
        }
    }

    if (isTomorrowView) {
        document.getElementById('clock').textContent = clockStr;
        mainStatusLabel.textContent = "PREVIEWING TOMORROW";
        mainStatusLabel.classList.add('tomorrow-mode-text');
        nowSt.innerHTML = `<span class="tomorrow-mode-text">Day ${currentDay}</span>`;
        document.getElementById('nowDetail').textContent = "Pack your bags for this schedule";
        scheduleLabel.innerHTML = `TOMORROW'S SCHEDULE`;
        scheduleLabel.classList.add('tomorrow-mode-text');

        document.getElementById('countdown').textContent = "--:--";
        document.getElementById('countdown').style.color = "#334155";
        document.getElementById('nextEvent').textContent = "—";
        document.getElementById('nextEventTime').textContent = "";
        document.getElementById('nextLesson').textContent = "—";
        document.getElementById('nextLessonTime').textContent = "";
        document.getElementById('doubleLesson').style.display = 'none';

        if (isFullscreen) {
            document.getElementById('fsClock').textContent = clockStr;
            document.getElementById('fsCountdown').textContent = "--:--";
            const fsSub = document.getElementById('fsCurrentSubject');
            fsSub.textContent = "VIEWING TOMORROW";
            fsSub.classList.add('tomorrow-mode-text');
            document.getElementById('fsCurrentTime').textContent = `Day ${currentDay}`;
            document.getElementById('fsCurrentLabel').textContent = "Tomorrow";
            document.getElementById('fsNextSubject').textContent = "—";
            document.getElementById('fsNextTime').textContent = "";
            document.getElementById('fsNextLabel').textContent = "Next";
        }
        return;
    }

    scheduleLabel.innerHTML = `Today’s Schedule`;
    scheduleLabel.classList.remove('tomorrow-mode-text');

    document.getElementById('clock').textContent = clockStr;

    let isBreak = false;
    if (current) {
        mainStatusLabel.textContent = "Current";
        mainStatusLabel.classList.remove('tomorrow-mode-text');
        nowSt.textContent = current.subject;
        document.getElementById('nowDetail').textContent = `${current.rawStart}–${current.rawEnd}`;
        if (current.type === 'event') isBreak = true;
    } else if (countdownTo) {
        mainStatusLabel.textContent = "Up Next";
        mainStatusLabel.classList.remove('tomorrow-mode-text');
        const upcoming = nextLesson && nextLesson.start.getTime() === countdownTo.getTime() ? nextLesson : nextEvent;
        nowSt.textContent = upcoming ? upcoming.subject : "Loading...";
        document.getElementById('nowDetail').textContent = upcoming ? `Starts at ${upcoming.rawStart}` : "";
    } else {
        mainStatusLabel.textContent = "Status";
        mainStatusLabel.classList.remove('tomorrow-mode-text');
        nowSt.textContent = "Done for the day";
        document.getElementById('nowDetail').textContent = "See you tomorrow";
    }

    document.getElementById('nextEvent').textContent = nextEvent ? nextEvent.subject : '—';
    document.getElementById('nextEventTime').textContent = nextEvent ? `${nextEvent.rawStart}–${nextEvent.rawEnd}` : '';

    document.getElementById('nextLesson').textContent = nextLesson ? nextLesson.subject : '—';
    document.getElementById('nextLessonTime').textContent = nextLesson ? `${nextLesson.rawStart}–${nextLesson.rawEnd}` : '';

    const dbl = document.getElementById('doubleLesson');
    if (current && current.isDouble) {
        dbl.style.display = 'inline-block';
        dbl.textContent = `Double/Triple Session`;
    } else {
        dbl.style.display = 'none';
    }

    const cd = document.getElementById('countdown');
    let statusColor = '#e5e7eb';
    if (current) {
        if (isBreak) {
            statusColor = 'var(--break-color)';
        } else if (timeLeft < 60000) {
            statusColor = 'var(--danger)';
        } else {
            statusColor = 'var(--ok)';
        }
    } else if (!countdownTo) {
        statusColor = 'var(--muted)';
    } else {
        statusColor = 'var(--warn)';
    }

    if (countdownTo) {
        cd.textContent = timeStr;
        cd.style.color = statusColor;
        if (timeLeft < 60000 && timeLeft > 0 && current) cd.classList.add('status-warn');
        else cd.classList.remove('status-warn');
    } else {
        cd.textContent = "--:--";
        cd.style.color = "#334155";
        cd.classList.remove('status-warn');
    }

    // Fullscreen Updates
    if (isFullscreen) {
        document.getElementById('fsClock').textContent = clockStr;
        const fsCd = document.getElementById('fsCountdown');
        if (countdownTo) {
            fsCd.textContent = timeStr;
            fsCd.style.color = statusColor;
        } else {
            fsCd.textContent = "--:--";
            fsCd.style.color = '#334155';
        }

        const cSub = document.getElementById('fsCurrentSubject');
        cSub.classList.remove('tomorrow-mode-text');
        document.getElementById('fsCurrentLabel').textContent = "Now";
        const cTime = document.getElementById('fsCurrentTime');

        if (current) {
            cSub.textContent = current.subject;
            cSub.style.color = isBreak ? 'var(--break-color)' : 'var(--accent)';
            cTime.textContent = `${current.rawStart}–${current.rawEnd}`;
        } else {
            cSub.textContent = "Free / Sleep";
            cSub.style.color = "var(--muted)";
            cTime.textContent = "";
        }

        const nSub = document.getElementById('fsNextSubject');
        const nTime = document.getElementById('fsNextTime');
        const nLabel = document.getElementById('fsNextLabel');

        let upcoming = null;
        if (nextLesson && nextEvent) upcoming = (nextLesson.start < nextEvent.start) ? nextLesson : nextEvent;
        else if (nextLesson) upcoming = nextLesson;
        else if (nextEvent) upcoming = nextEvent;

        if (upcoming) {
            nSub.textContent = upcoming.display || upcoming.subject;
            nSub.style.color = "#e5e7eb";
            nTime.textContent = `${upcoming.rawStart}–${upcoming.rawEnd}`;
        } else {
            nSub.textContent = "—";
            nTime.textContent = "";
        }
    }
}

function enterFullscreen() {
    isFullscreen = true;
    fsLayer.classList.add('active');
    app.style.display = 'none';
    if (loopId) clearTimeout(loopId);
    if (loopId) cancelAnimationFrame(loopId);
    tick();
}

function exitFullscreen() {
    isFullscreen = false;
    fsLayer.classList.remove('active');
    app.style.display = 'flex';
    if (loopId) cancelAnimationFrame(loopId);
    if (loopId) clearTimeout(loopId);
    tick();
}
