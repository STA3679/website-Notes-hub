
// Constants
const CLOUD_NAME = "dkoz7zbnl";
const UPLOAD_PRESET = "notes_db";

// DOM Elements
const uploadStatus = document.getElementById("uploadStatus");
const viewStatus = document.getElementById("viewStatus");
const uploadBtn = document.getElementById("upload_widget");
const searchBtn = document.getElementById("searchBtn");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

// Initialize State
const today = new Date().toISOString().split("T")[0];
document.getElementById("upDate").value = today;
document.getElementById("viewDate").value = today;

// --- Tab Logic ---
tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        // Remove active class from all buttons and contents
        tabBtns.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));

        // Add active class to clicked button and corresponding content
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");
    });
});

// --- Cloudinary Upload Widget ---
let myWidget;

// Helper to create widget safely
function initWidget() {
    if (typeof cloudinary === 'undefined') {
        setTimeout(initWidget, 500);
        return;
    }

    myWidget = cloudinary.createUploadWidget(
        {
            cloudName: CLOUD_NAME,
            uploadPreset: UPLOAD_PRESET,
            clientAllowedFormats: ["png", "jpg", "jpeg", "heic"],
            multiple: false, // Changed to false to ensure single file public_id assignment works per file
            maxFiles: 10,
            sources: ['local', 'camera'],
            styles: {
                palette: {
                    window: "#FFFFFF",
                    windowBorder: "#90A0B3",
                    tabIcon: "#4F46E5",
                    menuIcons: "#5A616A",
                    textDark: "#000000",
                    textLight: "#FFFFFF",
                    link: "#4F46E5",
                    action: "#FF620C",
                    inactiveTabIcon: "#0E2F5A",
                    error: "#F44235",
                    inProgress: "#0078FF",
                    complete: "#20B832",
                    sourceBg: "#E4EBF1"
                },
            },
            prepareUploadParams: (cb, params) => {
                const dateStr = document.getElementById("upDate").value;
                if (!dateStr) {
                    showStatus(uploadStatus, "Please select a lecture date first.", "error");
                    cb({ cancel: true });
                    return;
                }

                const d = dateStr.split("-");
                const hour = document.getElementById("upHour").value;
                const subject = document.getElementById("upSubject").value;
                const description = document.getElementById("upDescription").value || "";

                if (!subject) {
                    showStatus(uploadStatus, "Please select a subject.", "error");
                    cb({ cancel: true });
                    return;
                }

                // Tag format: notes_DD_MM_YYYY_hHOUR
                const tag = `notes_${d[2]}_${d[1]}_${d[0]}_h${hour}`;

                // Create a clean subject slug for the filename
                const safeSubject = subject.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                const uniqueId = new Date().getTime();

                params.tags = [tag];
                // Store subject in public_id as fallback
                params.public_id = `${tag}_${safeSubject}_${uniqueId}`;

                params.context = {
                    subject: subject,
                    description: description
                };

                cb(params);
            }
        },
        (error, result) => {
            if (error) {
                console.error("Upload error:", error);
                showStatus(uploadStatus, "Upload failed. Please try again.", "error");
                return;
            }
            if (result.event === "queues-start") {
                showStatus(uploadStatus, "Uploading notes...", "normal");
            }
            if (result.event === "success") {
                console.log("Upload success:", result.info);
                showStatus(uploadStatus, "Note uploaded successfully!", "success");
            }
        }
    );
}

// Start widget initialization
initWidget();

// Open widget on click
uploadBtn.addEventListener("click", () => {
    // Check form validity first
    const dateStr = document.getElementById("upDate").value;
    const subject = document.getElementById("upSubject").value;

    if (!dateStr || !subject) {
        showStatus(uploadStatus, "Please fill in all required fields (Date & Subject)", "error");
        return;
    }

    showStatus(uploadStatus, "", "normal");
    if (myWidget) {
        myWidget.open();
    } else {
        showStatus(uploadStatus, "Widget loading... please wait.", "normal");
    }
});

// --- Fetch & View Notes ---
searchBtn.addEventListener("click", fetchNotes);

async function fetchNotes() {
    const gallery = document.getElementById("gallery");
    gallery.innerHTML = "";
    showStatus(viewStatus, "Fetching notes...", "normal");

    const dateStr = document.getElementById("viewDate").value;
    const hour = document.getElementById("viewHour").value;
    const filterSubject = document.getElementById("viewSubject").value;

    if (!dateStr) {
        showStatus(viewStatus, "Please select a date.", "error");
        return;
    }

    const d = dateStr.split("-");
    const tag = `notes_${d[2]}_${d[1]}_${d[0]}_h${hour}`;

    try {
        const url = `https://res.cloudinary.com/${CLOUD_NAME}/image/list/${tag}.json`;

        // Bypassing cache with timestamp
        const response = await fetch(`${url}?t=${new Date().getTime()}`);

        if (!response.ok) {
            if (response.status === 404) {
                showStatus(viewStatus, "No notes found for this time slot.", "normal");
            } else {
                throw new Error("Network response was not ok");
            }
            return;
        }

        const data = await response.json();

        if (!data.resources || data.resources.length === 0) {
            showStatus(viewStatus, "No notes found for this time slot.", "normal");
            return;
        }

        // Sort by upload time
        data.resources.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        let shownCount = 0;

        data.resources.forEach((img, index) => {
            // Robust context extraction
            let contextData = {};
            if (img.context) {
                if (img.context.custom) {
                    contextData = img.context.custom;
                } else {
                    contextData = img.context;
                }
            }

            let subject = contextData.subject || null;
            const description = contextData.description || "";

            // Helper to normalize strings for robust comparison
            const normalize = (str) => String(str || "").replace(/[^a-zA-Z0-9]/g, "").trim().toLowerCase();
            const normFilter = normalize(filterSubject);

            // Fallback: If subject context is missing, try to extract from public_id
            if (!subject) {
                if (filterSubject && img.public_id.toLowerCase().includes(normFilter)) {
                    subject = "Matched via Filename";
                }
            }

            const normSubject = normalize(subject);

            console.log(`Checking Note: Subject="${subject}" vs Filter="${filterSubject}"`);

            // Apply Filter
            if (filterSubject) {
                const idMatches = img.public_id.toLowerCase().includes(normFilter);
                const contextMatches = normSubject.includes(normFilter);

                // If neither context nor filename matches, skip
                if (!idMatches && !contextMatches) {
                    return;
                }
            }

            const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_thumb,w_400,q_auto,f_auto/v${img.version}/${img.public_id}.${img.format}`;
            const fullUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_auto/v${img.version}/${img.public_id}.${img.format}`;

            const uploadTime = new Date(img.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

            const card = document.createElement("div");
            card.className = "note-card";

            // Stagger animation
            card.style.animationDelay = `${index * 0.1}s`;

            card.innerHTML = `
        <a href="${fullUrl}" target="_blank" class="card-image-link">
          <img src="${thumbUrl}" alt="Note from ${uploadTime}" loading="lazy">
        </a>
        <div class="note-info">
          <span class="time-tag">${uploadTime}</span>
          <div class="note-subject">${subject === "Matched via Filename" ? filterSubject : (subject || "General Note")}</div>
          <div class="note-desc">${description || ""}</div>
        </div>
      `;
            gallery.appendChild(card);
            shownCount++;
        });

        if (shownCount === 0) {
            showStatus(viewStatus, "No notes match the selected filters.", "normal");
        } else {
            showStatus(viewStatus, `Found ${shownCount} note(s).`, "success");
        }

    } catch (err) {
        console.error(err);
        showStatus(viewStatus, "Could not load notes from Cloudinary. (404/List not found is normal if no tags exist yet)", "error");
    }
}

// Utility for status messages
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = "status-message"; // reset
    if (type === "error") element.classList.add("error");
    if (type === "success") element.classList.add("success");
}
