// --- CONFIGURATION ---
const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbzFl4M2pyzkhUvrLex691-3fZ4yeb6_11BUTAKGLYX8-UgSWhLkDl-vDTe7ExncgX3-/exec";
const SUPABASE_URL = "https://boaosspeeplhersbqqqm.supabase.co"; // REPLACE THIS WITH YOUR SUPABASE URL
const SUPABASE_KEY = "sb_publishable_O1K4-KqcwdE4w_Fr3GmKxQ_PR-4w26o";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global State
let attendanceTracker = {};
let port; 
let keepReading = true;
const ACCESS_CODE = "Salpointe2026";

// DOM Elements
const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');
const statusBody = document.getElementById('statusBody');
const globalStatusBody = document.getElementById('globalStatusBody');
const loginOverlay = document.getElementById('loginOverlay');
const globalContent = document.getElementById('globalContent');
const facultyPass = document.getElementById('facultyPass');

// --- INITIALIZATION ---
// This runs when the page loads to get current data and start listening for changes
async function init() {
    fetchLatestData();
    subscribeToChanges();
}
init();

// --- SUPABASE REALTIME LOGIC ---
async function fetchLatestData() {
    const { data, error } = await _supabase.from('students').select('*');
    if (data) {
        data.forEach(student => {
            attendanceTracker[student.id] = student;
        });
        updateStatusTable();
        renderGlobalTable();
    }
}

function subscribeToChanges() {
    _supabase
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, payload => {
            console.log('Realtime update:', payload);
            attendanceTracker[payload.new.id] = payload.new;
            updateStatusTable();
            renderGlobalTable();
        })
        .subscribe();
}

async function syncToSupabase(id, name, location, isOut) {
    const { error } = await _supabase
        .from('students')
        .upsert({ 
            id: id, 
            name: name, 
            location: location, 
            is_out: isOut,
            last_updated: new Date().toISOString() 
        });
    if (error) console.error("Supabase Error:", error);
}

// --- UI LOGIC ---
window.showTab = function(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

function updateStatusTable() {
    statusBody.innerHTML = ""; 
    for (const [id, data] of Object.entries(attendanceTracker)) {
        const stateClass = data.is_out ? 'status-out' : 'status-here'; 
        statusBody.innerHTML += `<tr>
            <td>${data.name}</td>
            <td>${id}</td>
            <td><span class="${stateClass}">${data.location}</span></td>
        </tr>`;
    }
}

function renderGlobalTable() {
    if (!globalStatusBody) return;
    globalStatusBody.innerHTML = "";
    for (const [id, data] of Object.entries(attendanceTracker)) {
        const time = data.last_updated ? new Date(data.last_updated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "---";
        globalStatusBody.innerHTML += `<tr>
            <td>${data.name}</td>
            <td>${id}</td>
            <td>${data.location}</td>
            <td>${time}</td>
        </tr>`;
    }
}

// --- ARDUINO & MANUAL ENTRY ---
async function handleScan(scannedName, scannedID, strMode, isOut) {
    // 1. Update Local
    attendanceTracker[scannedID] = { name: scannedName, location: strMode, is_out: isOut };
    lastIDSpn.innerText = scannedName;
    updateStatusTable();
    
    // 2. Sync to Supabase (This triggers the Realtime update for everyone else)
    syncToSupabase(scannedID, scannedName, strMode, isOut);

    // 3. Sync to Google Sheets (Backup)
    fetch(`${GOOGLE_URL}?id=${scannedID}&name=${scannedName}&mode=${strMode}&isOut=${isOut}`, { mode: 'no-cors' });
}

// (Arduino readLoop calls handleScan when a card is detected)
// (Manual Entry button calls handleScan when clicked)

document.getElementById('submitManualEntry').addEventListener('click', () => {
    const name = document.getElementById('manualNameInput').value.trim();
    const id = document.getElementById('manualIdInput').value.trim();
    const loc = document.getElementById('manualLocationSelect').value;
    if (name && id) handleScan(name, id, loc, (loc !== "Enter"));
});

document.getElementById('loginBtn').addEventListener('click', () => {
    if (facultyPass.value === ACCESS_CODE) {
        loginOverlay.style.display = "none";
        globalContent.style.display = "block";
        renderGlobalTable();
    } else {
        alert("Incorrect Code");
    }
});