const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

const connectBtn = document.getElementById('connectBtn');
const statusSpn = document.getElementById('status');
const lastIDSpn = document.getElementById('lastID');
const serverMsg = document.getElementById('serverMsg');

let port; 

connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        statusSpn.innerText = "CONNECTED";
        statusSpn.style.color = "green";
        connectBtn.innerText = "LISTENING...";
        connectBtn.style.opacity = "0.5";
        connectBtn.disabled = true;

        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;

            if (buffer.includes("\n")) {
                const rawData = buffer.trim(); 
                buffer = "";

                if (rawData.includes(",")) {
                    const [tagID, mode] = rawData.split(",");
                    lastIDSpn.innerText = tagID;
                    serverMsg.innerText = "Uploading to Google Sheets...";

                    const finalUrl = `${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${mode}`;

                    // Send to Google
                    fetch(finalUrl, { mode: 'no-cors' })
                        .then(async () => {
                            serverMsg.innerText = `✅ Success: ${tagID} marked ${mode}`;
                            
                            // Small delay to let Arduino finish its "Deep" beep
                            setTimeout(async () => {
                                try {
                                    if (port.writable) {
                                        const writer = port.writable.getWriter();
                                        const signal = new TextEncoder().encode("K");
                                        await writer.write(signal);
                                        writer.releaseLock();
                                        console.log("Handshake 'K' sent to Arduino");
                                    }
                                } catch (err) {
                                    console.error("Buzzer signal failed:", err);
                                }
                            }, 500);

                            // Clear UI message
                            setTimeout(() => { serverMsg.innerText = ""; }, 4000);
                        })
                        .catch(err => {
                            serverMsg.innerText = "❌ Network Error";
                            console.error(err);
                        });
                }
            }
        }
    } catch (err) {
        console.error(err);
        statusSpn.innerText = "Connection Failed!";
        statusSpn.style.color = "red";
    }
});
