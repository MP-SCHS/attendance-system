const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');

connectBtn.addEventListener('click', async () => {
    try {
        // Step 1: Request the port
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        statusSpn.innerText = "CONNECTED";
        statusSpn.style.color = "green";
        connectBtn.innerText = "LISTENING...";
        connectBtn.style.opacity = "0.5";

        // Step 2: Read the stream
        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;

            // Step 3: Wait for a full line from Arduino
            if (buffer.includes("\n")) {
                const rawData = buffer.trim(); // Format: "ID,MODE"
                buffer = "";

                if (rawData.includes(",")) {
                    const [tagID, mode] = rawData.split(",");
                    
                    lastIDSpn.innerText = tagID;
                    serverMsg.innerText = "Sending to Sheets...";

                    // Step 4: Construct URL and Fetch
                    const finalUrl = `${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${mode}`;

                    fetch(finalUrl, { mode: 'no-cors' })
                        .then(() => {
                            serverMsg.innerText = `✅ Successfully Logged ${mode}`;
                            setTimeout(() => { serverMsg.innerText = ""; }, 3000);
                        })
                        .catch(err => {
                            serverMsg.innerText = "❌ Sync Error";
                            console.error(err);
                        });
                }
            }
        }
    } catch (err) {
        console.error(err);
        statusSpn.innerText = "Connection Failed. Check HTTPS.";
        statusSpn.style.color = "red";
    }
});
