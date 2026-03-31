// --- 1. CONFIGURATION ---
const SUPABASE_URL = "https://your-project-id.supabase.co"; // REPLACE WITH YOUR ACTUAL URL
const SUPABASE_KEY = "sb_publishable_O1K4-KqcwdE4w_Fr3GmKxQ_PR-4w26o";
const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbzFl4M2pyzkhUvrLex691-3fZ4yeb6_11BUTAKGLYX8-UgSWhLkDl-vDTe7ExncgX3-/exec";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. STATE MANAGEMENT ---
let localScans = {};   // Only shows what YOU scanned this session
let globalScans = {};  // Shows everyone in the school from Supabase
let port; 
let keepReading = true;
const ACCESS_CODE = "Salpointe2026";

// DOM Elements
const statusBody = document.getElementById('statusBody');
const globalStatusBody = document.getElementById('globalStatusBody');
const lastIDSpn = document.getElementById('lastID');
const facultyPass = document.getElementById('facultyPass');
const loginOverlay = document.getElementById('loginOverlay');
const globalContent = document.getElementById('globalContent');

// --- 3. INITIALIZATION ---
async function init() {
    await fetchLatestGlobalData();
    subscribeToChanges();
}
init();

// --- 4. SUPABASE & DATA LOGIC ---

// Pulls everyone from Supabase on page load
async function fetchLatestGlobalData() {
    const { data, error } = await _supabase.from('students').select('*');
    if (data) {
        data.forEach(student => {
            globalScans[student.id] = student;
        });
        renderGlobalTable();
    }
}

// Listens for updates from OTHER computers
function subscribeToChanges() {
    _supabase
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, payload => {
            // Update the global list when anyone in the school scans
            globalScans[payload.new.id] = payload.new;
            renderGlobalTable();
        })
        .subscribe();
}

// Sends your scan to the cloud
async function syncToSupabase(id, name, location, isOut) {
    await _supabase.from('students').upsert({ 
        id: id, 
        name: name, 
        location: location, 
        is_out: isOut,
        last_updated: new Date().toISOString() 
    });
}

// --- 5. THE MAIN SCAN HANDLER ---
async function handleScan(scannedName, scannedID, strMode, isOut) {
    // A. Update LOCAL UI (Student Status Tab)
    localScans[scannedID] = { name: scannedName, location: strMode, is_out: isOut };
    lastIDSpn.innerText = scannedName;
    updateLocalStatusTable();
    
    // B. Update GLOBAL Database (Supabase)
    syncToSupabase(scannedID, scannedName, strMode, isOut);

    // C. Backup (Google Sheets)
    fetch(`${GOOGLE_URL}?id=${scannedID}&name=${scannedName}&mode=${strMode}&isOut=${isOut}`, { mode: 'no-cors' });
}

// --- 6. TABLE RENDERING ---

function updateLocalStatusTable() {
    statusBody.innerHTML = ""; 
    for (const [id, data] of Object.entries(localScans)) {
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
    for (const [id, data] of Object.entries(globalScans)) {
        const time = data.last_updated ? new Date(data.last_updated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "---";
        globalStatusBody.innerHTML += `<tr>
            <td>${data.name}</td>
            <td>${id}</td>
            <td>${data.location}</td>
            <td>${time}</td>
        </tr>`;
    }
}

// --- 7. TAB & BUTTON LOGIC ---

window.showTab = function(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

document.getElementById('loginBtn').addEventListener('click', () => {
    if (facultyPass.value === ACCESS_CODE) {
        loginOverlay.style.display = "none";
        globalContent.style.display = "block";
        renderGlobalTable();
    } else {
        alert("Incorrect Access Code");
    }
});

document.getElementById('submitManualEntry').addEventListener('click', () => {
    const name = document.getElementById('manualNameInput').value.trim();
    const id = document.getElementById('manualIdInput').value.trim();
    const loc = document.getElementById('manualLocationSelect').value;
    if (name && id && loc !== "Location") {
        handleScan(name, id, loc, (loc !== "Enter"));
        document.getElementById("manualNameInput").value = "";
        document.getElementById("manualIdInput").value = "";
        document.getElementById("manualLocationSelect").value = "Select Location";
    } else {
        alert("Please fill in all fields");
    }
});

// --- 8. ARDUINO SERIAL CONNECTION ---
document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        document.getElementById('status').innerText = "Connected";
        document.getElementById('status').style.color = "green";
        
        const decoder = new TextDecoderStream();
        port.readable.pipeTo(decoder.writable);
        const reader = decoder.readable.getReader();

        while (keepReading) {
            const { value, done } = await reader.read();
            if (value) {
                // Arduino sends: Name,ID,Mode,isOut
                const parts = value.split(',');
                if (parts.length === 4) {
                    handleScan(parts[0], parts[1], parts[2], parts[3].trim() === "true");
                    
                    // Send "K" back to Arduino to unlock it
                    const encoder = new TextEncoder();
                    const writer = port.writable.getWriter();
                    await writer.write(encoder.encode("K\n"));
                    writer.releaseLock();
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
});