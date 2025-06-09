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
    
    /**
     * Dynamically loads the HTML, CSS, and JS for a specific tab.
     * @param {string} targetTabId - The ID of the tab to load (e.g., 'list', 'board').
     */
    async function loadTabContent(targetTabId) {
        // 1. Clean up the previously loaded tab's JS module, if it exists.
        if (typeof currentTabCleanup === 'function') {
            currentTabCleanup();
            currentTabCleanup = null;
        }
        
        const container = document.getElementById('tab-content-container');
        if (!container) return; // Safety check
        
        // 2. Clear old content and remove old tab-specific CSS
        container.innerHTML = "";
        document.getElementById('tab-specific-css')?.remove();
        
        try {
            
            const htmlPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.html`;
            const cssPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.css`;
            const jsPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.js?v=${new Date().getTime()}`;
    
            // 4. Fetch and inject the new content
            const htmlRes = await fetch(htmlPath);
            if (!htmlRes.ok) throw new Error(`HTML not found for tab: ${targetTabId}`);
            container.innerHTML = await htmlRes.text();
            
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssPath;
            link.id = "tab-specific-css"; // Give it a specific ID for easy removal
            document.head.appendChild(link);
            
            // 5. Import the tab's own JS module
            const tabModule = await import(jsPath);
            if (tabModule.init) {
                // Pass any necessary info down to the sub-module and store its cleanup function
                currentTabCleanup = tabModule.init({ accountId, projectId });
            }
            
        } catch (err) {
            container.innerHTML = `<p>Error loading tab content for: <strong>${targetTabId}</strong></p>`;
            console.error(`Failed to load tab '${targetTabId}':`, err);
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