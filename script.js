// USE YOUR NEWEST LINK HERE
const GOOGLE_URL = "https://script.google.com/macros/s/AKfycbxshlkitd9gapxoN6gdkguZp8diyy1Mo8I_hNwWRXScMvQooxv_IuEl6vFpFyhYjvBz/exec";

// ... inside your serial reading loop ...
if (buffer.includes("\n")) {
    const rawData = buffer.trim(); 
    buffer = "";

    if (rawData.includes(",")) {
        const [tagID, studentMode] = rawData.split(",");

        // encodeURIComponent handles the spaces in "82 6D A1 04"
        const finalUrl = `${GOOGLE_URL}?id=${encodeURIComponent(tagID)}&mode=${studentMode}`;

        fetch(finalUrl, { mode: 'no-cors' })
            .then(() => {
                serverMsg.innerText = "Logged " + studentMode + " for " + tagID;
            });
    }
}
