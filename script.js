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
let isEditMode = false;
let isFullscreen = false;
let testModeOffset = null;
let isTomorrowView = false;
let isAutoMode = true;
let loopId = null;

// 1. INITIALIZE
function init() {
    const config = configData;
    calendarData = config.calendar;
    defaultPeriods = config.defaultPeriods;
    tz = config.settings.timeZone;
    const defaultOffsetSec = config.settings.defaultOffsetSeconds;

    periods = JSON.parse(localStorage.getItem('lessonTimer_data') || JSON.stringify(defaultPeriods));
    timeOffset = defaultOffsetSec * 1000;
    const storedDay = localStorage.getItem('lessonTimer_day');
    currentDay = storedDay ? parseInt(storedDay) : 1;
    const storedAuto = localStorage.getItem('lessonTimer_isAuto');
    isAutoMode = storedAuto === null ? true : (storedAuto === 'true');
    startApp();
}

init();

function startApp() {
    dayPicker.value = currentDay;
    updateOffsetDisplay();
    updateAutoButtonUI();
    if (isAutoMode) { activateAutoMode(); }
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

function tick() {
    updateInfo();
    if (isFullscreen) {
        loopId = requestAnimationFrame(tick);
    } else {
        loopId = setTimeout(tick, 1000);
    }
}

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
    } else {
        if (isTomorrowView && !autoDay) {
            isTomorrowView = false;
        }
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

function adjustTime(ms) {
    timeOffset += ms;
    localStorage.setItem('lessonTimer_offset', timeOffset);
    updateOffsetDisplay();
    if (isAutoMode) checkAutoDate();
    updateInfo();
}

function enableTestMode() {
    const input = document.getElementById('testTimeInput').value;
    if (!input) return;
    const [h, m] = input.split(':').map(Number);
    const realNow = getRealTimeHK();
    const targetTime = new Date(realNow);
    targetTime.setHours(h, m, 0, 0);
    testModeOffset = targetTime.getTime() - realNow.getTime();
    document.getElementById('testModeBadge').style.display = 'inline';
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
// ... remaining logic from original file