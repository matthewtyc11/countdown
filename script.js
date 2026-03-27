let configData = {};
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

    const savedDay = localStorage.getItem('lessonTimer_day');
    if (savedDay) currentDay = Number(savedDay);

    const savedData = localStorage.getItem('lessonTimer_data');
    if (savedData) {
        periods = JSON.parse(savedData);
    } else {
        periods = JSON.parse(JSON.stringify(defaultPeriods));
    }

    const savedOffset = localStorage.getItem('lessonTimer_offset');
    if (savedOffset) {
        timeOffset = Number(savedOffset);
    } else {
        timeOffset = (config.settings.defaultOffsetSeconds || 0) * 1000;
    }

    const savedAuto = localStorage.getItem('lessonTimer_isAuto');
    if (savedAuto !== null) {
        isAutoMode = savedAuto === 'true';
    } else {
        isAutoMode = true;
    }

    startApp();
}

function startApp() {
    dayPicker.value = currentDay;
    updateOffsetDisplay();
    updateAutoButtonUI();
    if (isAutoMode) {
        activateAutoMode();
    }

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

// ... [Keep ALL your exact functions like parseHM, getCombinedLesson, setDay, populateTable, diffFmtMs, diffFmt, updateInfo, enterFullscreen etc.] ...

// Load JSON dynamically to start everything
fetch('timetable.json')
    .then(response => response.json())
    .then(data => {
        configData = data;
        init(); // 100% logic retained, but triggered after separating.
    })
    .catch(error => console.error("Error loading timetable.json:", error));