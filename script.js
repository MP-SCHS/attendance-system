// --- 1. CONFIGURATION ---
const SUPABASE_URL = "https://boaosspeeplhersbqqqm.supabase.co"; // REPLACE WITH YOUR ACTUAL URL
const SUPABASE_KEY = "sb_publishable_O1K4-KqcwdE4w_Fr3GmKxQ_PR-4w26o";
const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbzFl4M2pyzkhUvrLex691-3fZ4yeb6_11BUTAKGLYX8-UgSWhLkDl-vDTe7ExncgX3-/exec";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. STATE MANAGEMENT ---
let localScans = {};   
let globalScans = {};  // This is the source for the Global Tab
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
    console.log("Initializing Supabase connection...");
    await fetchLatestGlobalData();
    subscribeToChanges();
}
init();

// --- 4. SUPABASE DATA LOGIC ---

// Initial pull from database
async function fetchLatestGlobalData() {
    const { data, error } = await _supabase.from('students').select('*');
    if (error) {
        console.error("Error fetching global data:", error);
        return;
    }
    if (data) {
        console.log("Global data loaded:", data);
        globalScans = {}; // Clear old data
        data.forEach(student => {
            globalScans[student.id] = student;
        });
        renderGlobalTable();
    }
}

// REALTIME LISTENER: This is what makes it "Live" across instances
function subscribeToChanges() {
    _supabase
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, payload => {
            console.log("Realtime Update Received:", payload);
            
            // Update the global object with the incoming data
            if (payload.eventType === 'DELETE') {
                delete globalScans[payload.old.id];
            } else {
                globalScans[payload.new.id] = payload.new;
            }
            
            // Re-draw ONLY the global table
            renderGlobalTable();
        })
        .subscribe();
}

async function syncToSupabase(id, name, location, isOut) {
    const { error } = await _supabase.from('students').upsert({ 
        id: id, 
        name: name, 
        location: location, 
        is_out: isOut,
        last_updated: new Date().toISOString() 
    });
    if (error) console.error("Sync Error:", error);
}

// --- 5. THE SCAN HANDLER ---
async function handleScan(scannedName, scannedID, strMode, isOut) {
    // 1. Update LOCAL UI
    localScans[scannedID] = { name: scannedName, location: strMode, is_out: isOut };
    lastIDSpn.innerText = scannedName;
    updateLocalStatusTable();
    
    // 2. Update SUPABASE
    syncToSupabase(scannedID, scannedName, strMode, isOut);

    // 3. Backup to Google
    fetch(`${GOOGLE_URL}?id=${scannedID}&name=${scannedName}&mode=${strMode}&isOut=${isOut}`, { mode: 'no-cors' });

    // --- 4. SEND "K" SIGNAL BACK TO ARDUINO ---
    if (port && port.writable) {
        const encoder = new TextEncoder();
        const writer = port.writable.getWriter();
        await writer.write(encoder.encode("K\n")); // The newline \n is important!
        writer.releaseLock(); // Crucial: You must release the lock so the next scan can use it
        console.log("Sent 'K' to Arduino");
    }
}

// --- 6. TABLE RENDERING ---

function updateLocalStatusTable() {
    if (!statusBody) return;
    statusBody.innerHTML = ""; 
    for (const [id, data] of Object.entries(localScans)) {
        const stateClass = data.is_out ? 'status-out' : 'status-here'; 
        statusBody.innerHTML += `<tr>
            <td>${data.name}</td>
            <td>${id}</td>
            <td><span class="${stateClass}">${data.location}</span></td>
            <td><button class="removeBtn" onclick="deleteLocal('${id}')">Remove</button></td>
        </tr>`;
    }
}

function renderGlobalTable() {
    if (!globalStatusBody) return;
    globalStatusBody.innerHTML = "";
    
    // Iterate through globalScans (Database data)
    for (const [id, data] of Object.entries(globalScans)) {
        const time = data.last_updated ? new Date(data.last_updated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "---";
        const stateClass = data.is_out ? 'status-out' : 'status-here';
        
        globalStatusBody.innerHTML += `<tr>
            <td>${data.name}</td>
            <td>${id}</td>
            <td><span class="${stateClass}">${data.location}</span></td>
            <td>${time}</td>
        </tr>`;
    }
}

// Helper to remove from local view only
window.deleteLocal = function(id) {
    delete localScans[id];
    updateLocalStatusTable();
};

// --- 7. UI CONTROLS ---

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
        alert("Access Denied");
    }
});

document.getElementById('submitManualEntry').addEventListener('click', () => {
    const name = document.getElementById('manualNameInput').value.trim();
    const id = document.getElementById('manualIdInput').value.trim();
    const loc = document.getElementById('manualLocationSelect').value;
    if (name && id && loc !== "Select Location") {
        handleScan(name, id, loc, (loc !== "Enter"));
        document.getElementById("manualNameInput").value = "";
        document.getElementById("manualIdInput").value = "";
        document.getElementById("manualLocationSelect").value = "Select Location";
    }
});

// --- 8. ARDUINO SERIAL ---
// --- 8. ARDUINO SERIAL CONNECTION (STREAM ALIGNED) ---
document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        document.getElementById('status').innerText = "Connected";
        document.getElementById('status').style.color = "green";

        // Step 1: Create a decoder to turn bits into text
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        
        // Step 2: Create a Line Smoother (Wait for the \n from Arduino)
        // Note: If 'TextLineStream' isn't supported, we manually buffer
        const reader = textDecoder.readable.getReader();

        let buffer = ""; // This catches the "choppy" data bits

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            if (value) {
                buffer += value; // Add new bits to the buffer
                
                // Check if we have a full line (ending in \n)
                if (buffer.includes("\n")) {
                    const lines = buffer.split("\n");
                    // Process all complete lines except the last partial one
                    for (let i = 0; i < lines.length - 1; i++) {
                        const cleanLine = lines[i].trim();
                        if (cleanLine) {
                            console.log("Full Line Received:", cleanLine);
                            const parts = cleanLine.split(',');

                            if (parts.length === 4) {
                                handleScan(
                                    parts[0], 
                                    parts[1], 
                                    parts[2], 
                                    parts[3].toLowerCase().includes("true")
                                );
                            }
                        }
                    }
                    // Keep the leftover partial line in the buffer
                    buffer = lines[lines.length - 1];
                }
            }
        }
    } catch (err) {
        console.error("Serial Error:", err);
    }
});