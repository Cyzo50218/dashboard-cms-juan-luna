/**
 * @file tasks.js
 * @description A "sub-router" that controls the tasks section.
 * It dynamically loads content for its own internal tabs (List, Board, etc.).
 */

// --- Module-Scoped Variables for Cleanup ---
// For the main section's listeners (the tabs themselves)
let tabClickListener = null;
const buttonListeners = [];
// For the currently loaded SUB-MODULE (the content of a tab like 'list.js')
let currentTabCleanup = null;

/**
 * Main initialization function for the entire tasks section.
 * @param {object} params - Route parameters from the main router.
 * @returns {function} The main cleanup function for the tasks section.
 */
export function init(params) {
    const { tabId = 'list', accountId, projectId } = params;

    const tabs = document.querySelectorAll('.tab-link');
    const shareButton = document.querySelector('.share-btn');
    const customizeButton = document.querySelector('.customize-btn');
    
    document.getElementById('share-project-btn').addEventListener('click', () => {
    // Prevent creating multiple modals
    if (document.getElementById('modalBackdrop')) {
        return;
    }
    createShareModal();
});

    /**
     * Dynamically loads the HTML, CSS, and JS for a specific tab.
     * @param {string} targetTabId - The ID of the tab to load (e.g., 'list', 'board').
     */
    // --- UPDATED TAB LOADER ---

async function loadTabContent(targetTabId) {
    // 1. Clean up the previously loaded tab's JS module, if it exists.
    if (typeof currentTabCleanup === 'function') {
        currentTabCleanup();
        currentTabCleanup = null;
    }
    
    const container = document.getElementById('tab-content-container');
    if (!container) return; // Safety check
    
    // 2. Clear old content and remove old tab-specific CSS
    container.innerHTML = '<div class="section-loader"></div>'; // Use the same loader style
    document.getElementById('tab-specific-css')?.remove();
    
    const htmlPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.html`;
    const cssPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.css`;
    const jsPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.js?v=${new Date().getTime()}`;
    
    try {
        // 4. Fetch and inject the new content
        const htmlRes = await fetch(htmlPath);
        if (!htmlRes.ok) throw new Error(`HTML not found for tab: ${targetTabId}`);
        container.innerHTML = await htmlRes.text();
        
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssPath;
        link.id = "tab-specific-css";
        document.head.appendChild(link);
        
        // 5. Import the tab's own JS module
        const tabModule = await import(jsPath);
        if (tabModule.init) {
            // Pass any necessary info down to the sub-module and store its cleanup function
            currentTabCleanup = tabModule.init({ accountId, projectId });
        }
        
    } catch (err) {
        // --- START: MORE SPECIFIC ERROR HANDLING ---
        let userMessage = `<p>An unexpected error occurred while loading the <strong>${targetTabId}</strong> tab.</p>`;
        let logMessage = `Failed to load tab '${targetTabId}':`;
        
        if (err.message.startsWith('HTML not found for tab')) {
            // Case 1: The fetch for the HTML file failed (e.g., 404).
            userMessage = `<p>Could not load the necessary HTML file for the <strong>${targetTabId}</strong> tab.</p>`;
            logMessage = `[HTML Load Error] Failed to fetch ${htmlPath}.`;
        } else if (err instanceof SyntaxError) {
            // Case 2: The imported JavaScript file has a syntax error.
            userMessage = `<p>The <strong>${targetTabId}</strong> tab could not be loaded due to a code error.</p><p>Please check the console for details.</p>`;
            logMessage = `[JS Syntax Error] A syntax error was found in ${jsPath}.`;
        } else if (err.message.includes('Failed to fetch dynamically imported module')) {
            // Case 3: The import for the JS module failed (e.g., 404).
            userMessage = `<p>Could not load the necessary script file for the <strong>${targetTabId}</strong> tab.</p>`;
            logMessage = `[JS Load Error] The JavaScript module at ${jsPath} could not be fetched (e.g., 404 Not Found).`;
        }
        
        container.innerHTML = userMessage;
        // Log the specific, readable message AND the original error object for the full trace.
        console.error(logMessage, err);
        // --- END: MORE SPECIFIC ERROR HANDLING ---
    }
}

    /**
     * Updates the 'active' class on the tab navigation links.
     * @param {string} targetTabId - The ID of the tab to highlight.
     */
    function setActiveTabLink(targetTabId) {
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-tab') === targetTabId);
        });
    }

    // Event handler for clicking on one of the main tabs
    tabClickListener = (event) => {
        event.preventDefault();
        const newTabId = event.currentTarget.getAttribute('data-tab');

        if (newTabId) {
            // Update the main browser URL
            const newUrl = `/tasks/${accountId}/${newTabId}/${projectId}`;
            history.pushState({ path: newUrl }, '', newUrl);

            // Update the active link style and load the new tab's content
            setActiveTabLink(newTabId);
            loadTabContent(newTabId);
        }
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', tabClickListener);
    });

    // --- Initial Load ---
    setActiveTabLink(tabId);
    loadTabContent(tabId); // Load the content for the initial tab

    // --- Main Cleanup Function ---
    // This cleans up the tasks section itself when navigating away (e.g., to 'home').
    return function cleanup() {
        console.log("Cleaning up 'tasks' section and its active tab...");
        // Clean up the last active tab's JS
        if (typeof currentTabCleanup === 'function') {
            currentTabCleanup();
        }
        // Clean up the listeners for the main tabs
        tabs.forEach(tab => tab.removeEventListener('click', tabClickListener));
        // ... cleanup for share/customize buttons if needed
    };
}

