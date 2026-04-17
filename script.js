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
        //last_updated: new Date().toISOString() 
    });
    if (error) console.error("Sync Error:", error);
}

// --- 5. THE SCAN HANDLER ---
async function handleScan(scannedName, scannedID, strMode, isOut) {
    console.log(`Attempting to process scan for: ${scannedName}`);

    // 1. Update UI & Database
    localScans[scannedID] = { name: scannedName, location: strMode, is_out: isOut };
    lastIDSpn.innerText = scannedName;
    updateLocalStatusTable();
    syncToSupabase(scannedID, scannedName, strMode, isOut);

    // 2. The "K" Handshake
    console.log("Checking port status for K signal...");
    
    if (!port) {
        console.error("K-Signal Failed: 'port' variable is undefined. Is the Arduino connected?");
        return;
    }

    if (port.writable) {
        try {
            const encoder = new TextEncoder();
            const writer = port.writable.getWriter();
            
            console.log("Sending 'K' to Arduino now...");
            await writer.write(encoder.encode("K\n"));
            
            writer.releaseLock();
            console.log("K-Signal successful, lock released.");
        } catch (writeErr) {
            console.error("Error writing to Serial:", writeErr);
        }
    } else {
        console.warn("K-Signal Failed: Port is not writable. It might be locked by another process.");
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
        const time = data.updated_at ? new Date(data.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "---";
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
// --- 8. ARDUINO SERIAL CONNECTION (STREAM ALIGNED) ---

// 1. Declare port globally at the top of this section (or at the very top of your file)
// let port; <--- Make sure this isn't repeated if you have it at the top of your script

document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
        // Request the port and assign it to the GLOBAL 'port' variable
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        document.getElementById('status').innerText = "Connected";
        document.getElementById('status').style.color = "green";
        console.log("Serial Port Connected and Globalized:", port);

        // Setup the Stream Decoder
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        let buffer = ""; // Accumulates choppy data until a newline \n arrives

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log("Serial stream closed.");
                reader.releaseLock();
                break;
            }

            if (value) {
                buffer += value; 
                
                // If we see a newline, we have at least one full message
                if (buffer.includes("\n")) {
                    const lines = buffer.split("\n");
                    
                    // Process all complete lines
                    for (let i = 0; i < lines.length - 1; i++) {
                        const cleanLine = lines[i].trim();
                        if (cleanLine) {
                            console.log("Full Message From Arduino:", cleanLine);
                            const parts = cleanLine.split(',');

                            if (parts.length === 4) {
                                // Trigger the scan handler which now sends the "K" back
                                handleScan(
                                    parts[0], 
                                    parts[1], 
                                    parts[2], 
                                    parts[3].toLowerCase().includes("true")
                                );
                            } else {
                                console.warn("Incomplete data received:", cleanLine);
                            }
                        }
                    }
                    // Keep any partial data for the next read
                    buffer = lines[lines.length - 1];
                }
            }
        }
    } catch (err) {
        console.error("Serial Connection Error:", err);
        alert("Connection Failed: Make sure no other program (like Arduino IDE) is using the port.");
    }
});