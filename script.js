const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

const studentNames = {
    "82 6D A1 04": "Madden Pucci",
    "7B B8 D7 05": "Jay Slavin"
};

let attendanceTracker = {};
let port; 

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');
const statusBody = document.getElementById('statusBody');

// --- TAB LOGIC ---
// This is now global so it works even if other parts of the script fail
window.showTab = function(event, tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

function updateStatusTable() {
    statusBody.innerHTML = ""; 
    for (const [id, data] of Object.entries(attendanceTracker)) {
        const name = studentNames[id] || "Unknown";
        const stateClass = data.isOut ? 'status-out' : 'status-here'; 
        const row = `<tr>
            <td>${name}</td>
            <td>${id}</td>
            <td><span class="${stateClass}">${data.location}</span></td>
        </tr>`;
        statusBody.innerHTML += row;
    }
}

// --- MAIN SERIAL LOGIC ---
connectBtn.addEventListener('click', async () => {
    try {
        console.log("Attempting to connect to Serial Port...");
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        statusSpn.innerText = "ONLINE";
        statusSpn.style.color = "#1b5e20";
        connectBtn.innerText = "ARDUINO ACTIVE";
        connectBtn.style.background = "#080708";
        connectBtn.disabled = true;

        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        let buffer = "";
        
        console.log("Connection successful. Listening for data...");

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log("Reader closed.");
                reader.releaseLock();
                break;
            }
            
            buffer += value;

            if (buffer.includes("\n")) {
                const lines = buffer.split("\n");
                // The last element might be an incomplete line, keep it in buffer
                buffer = lines.pop(); 

                for (let rawData of lines) {
                    rawData = rawData.trim();
                    if (!rawData || !rawData.includes(",")) continue;

                    console.log("Received from Arduino:", rawData);

                    const [tagID, strMode, outModeStr] = rawData.split(",");
                    const isOut = outModeStr.toLowerCase().includes("true") || outModeStr === "1";

                    attendanceTracker[tagID] = {
                        location: strMode,
                        isOut: isOut
                    };

                    lastIDSpn.innerText = tagID;
                    updateStatusTable();

                    // Send to Google
                    fetch(`${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${strMode}&isOut=${isOut}`, { mode: 'no-cors' });
                    serverMsg.innerText = `Synced: ${strMode}`;

                    // Talk back to Arduino
                    const name = studentNames[tagID] || "";
                    const responseToArduino = name ? `>${name}\n` : "K\n";

                    if (port.writable) {
                        const writer = port.writable.getWriter();
                        await writer.write(new TextEncoder().encode(responseToArduino));
                        writer.releaseLock();
                        console.log("Sent back to LCD:", responseToArduino);
                    }

                    setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                }
            }
        }
    } catch (err) { 
        console.error("Critical Serial Error:", err);
        alert("Serial Connection Failed: " + err.message);
    }
});
