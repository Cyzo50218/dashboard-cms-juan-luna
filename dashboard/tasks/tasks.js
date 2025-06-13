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
// File: /dashboard/tasks/tasks.js

export function init(params) {
    // [FIX 1] Declare variables at the top of the function's scope.
    // This is crucial for currentTabCleanup to be accessible by all inner functions.
    let currentTabCleanup = null;
    let tabClickListener = null;
    
    // --- 1. Get Parameters and DOM Elements ---
    const { tabId = 'list', accountId, projectId } = params;
    
    const tabs = document.querySelectorAll('.tab-link');
    const shareButton = document.querySelector('.share-btn');
    const customizeButton = document.querySelector('.customize-btn');
    
    document.getElementById('share-project-btn').addEventListener('click', () => {
        if (document.getElementById('modalBackdrop')) {
            return;
        }
        createShareModal();
    });
    
    // --- 2. Define Core Functions ---
    
    /**
     * Dynamically loads the HTML, CSS, and JS for a specific tab.
     * @param {string} targetTabId - The ID of the tab to load (e.g., 'list', 'board').
     */
    async function loadTabContent(targetTabId) {
        // Now this check will work correctly because currentTabCleanup is declared.
        if (typeof currentTabCleanup === 'function') {
            currentTabCleanup();
            currentTabCleanup = null;
        }
        
        const container = document.getElementById('tab-content-container');
        if (!container) return;
        
        container.innerHTML = '<div class="section-loader"></div>';
        document.getElementById('tab-specific-css')?.remove();
        
        const htmlPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.html`;
        const cssPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.css`;
        const jsPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.js?v=${new Date().getTime()}`;
        
        try {
            const htmlRes = await fetch(htmlPath);
            if (!htmlRes.ok) throw new Error(`HTML not found for tab: ${targetTabId}`);
            const tabHtml = await htmlRes.text();
            
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssPath;
            link.id = "tab-specific-css";
            document.head.appendChild(link);
            
            const tabModule = await import(jsPath);
            
            container.innerHTML = tabHtml;
            
            if (tabModule.init) {
                // Store the cleanup function for the NEWLY loaded tab
                currentTabCleanup = tabModule.init({ accountId, projectId });
            }
        } catch (err) {
            let userMessage = `<p>An unexpected error occurred while loading the <strong>${targetTabId}</strong> tab.</p>`;
            let logMessage = `Failed to load tab '${targetTabId}':`;
            
            if (err.message.startsWith('HTML not found for tab')) {
                userMessage = `<p>Could not load the necessary HTML file for the <strong>${targetTabId}</strong> tab.</p>`;
                logMessage = `[HTML Load Error] Failed to fetch ${htmlPath}.`;
            } else if (err instanceof SyntaxError) {
                userMessage = `<p>The <strong>${targetTabId}</strong> tab could not be loaded due to a code error.</p><p>Please check the console for details.</p>`;
                logMessage = `[JS Syntax Error] A syntax error was found in ${jsPath}.`;
            } else if (err.message.includes('Failed to fetch dynamically imported module')) {
                userMessage = `<p>Could not load the necessary script file for the <strong>${targetTabId}</strong> tab.</p>`;
                logMessage = `[JS Load Error] The JavaScript module at ${jsPath} could not be fetched (e.g., 404 Not Found).`;
            }
            
            container.innerHTML = userMessage;
            console.error(logMessage, err);
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
    
    // --- 3. Attach Event Listeners ---
    
    // Define the click listener function
    tabClickListener = (event) => {
        event.preventDefault();
        const currentTab = document.querySelector('.tab-link.active')?.getAttribute('data-tab');
        const newTabId = event.currentTarget.getAttribute('data-tab');
        
        // Prevent redundant loading
        if (newTabId && newTabId !== currentTab) {
            const newUrl = `/tasks/${accountId}/${newTabId}/${projectId}`;
            history.pushState({ path: newUrl }, '', newUrl);
            
            setActiveTabLink(newTabId);
            loadTabContent(newTabId);
        }
    };
    
    tabs.forEach(tab => {
        tab.addEventListener('click', tabClickListener);
    });
    
    // --- 4. Initial Load ---
    // This now runs correctly after all functions and variables are defined.
    setActiveTabLink(tabId);
    loadTabContent(tabId); // Load the content for the initial tab from the URL.
    
    // --- 5. Return the Main Cleanup Function ---
    // This cleans up the tasks section itself when navigating away (e.g., to 'home').
    return function cleanup() {
        console.log("Cleaning up 'tasks' section and its active tab...");
        // Clean up the last active tab's JS module
        if (typeof currentTabCleanup === 'function') {
            currentTabCleanup();
        }
        // Clean up the listeners for the main tabs
        tabs.forEach(tab => tab.removeEventListener('click', tabClickListener));
    };
}

