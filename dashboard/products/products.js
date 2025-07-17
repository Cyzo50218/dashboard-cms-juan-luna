import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  arrayUnion,
  onSnapshot,
  collectionGroup,
  orderBy,
  limit,
  getDoc,
  getDocs,
  addDoc,
  documentId,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  increment,
  deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "/services/firebase-config.js";
import { openInventoryModal } from '/dashboard/components/settingsInventoryWorkspace.js';

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");

const products = [
{
  id: 1,
  name: "Phone 16 Pro Max",
  sku: "PHN-16PM",
  cost: 62093.5,
  supplier: "Apple Inc.",
  description: "Flagship smartphone with advanced camera system and A18 chip",
  image: "https://img.freepik.com/free-photo/shirt-hanger-with-green-background_23-2150264156.jpg?semt=ais_hybrid&w=740",
},
{
  id: 2,
  name: "Predator Helios 16 AI",
  sku: "LAP-PH16AI",
  cost: 107293.5,
  supplier: "Acer Corporation",
  description: "Gaming laptop with AI-enhanced performance and cooling",
  image: "https://d1csarkz8obe9u.cloudfront.net/posterpreviews/plain-dark-green-t-shirt-mock-up-instagram-po-design-template-93bc81ccc943b866ffa3e1003b523c79_screen.jpg?ts=1723107646",
},
{
  id: 3,
  name: "Närro V 17",
  sku: "LAP-NV17",
  cost: 73393.5,
  supplier: "Närro Technologies",
  description: "Ultra-slim laptop with 17-inch OLED display and all-day battery",
  image: "https://png.pngtree.com/thumb_back/fh260/background/20241030/pngtree-plain-white-t-shirt-on-hanger-image_16329568.jpg",
}, ];

// State management
let selectedProductId = null;
let isEditing = false;
let searchInput, clearSearchBtn;
// DOM elements
let grid,
  addBtn,
  settingsBtn,
  overlay,
  closeBtn,
  productContent,
  productSettings,
  modal,
  closeModalBtn,
  cancelBtn,
  saveBtn,
  notification,
  notificationMessage,
  imageUploadContainer,
  fileInput,
  // Form elements
  productNameInput,
  productSkuInput,
  productCostInput,
  productSupplierInput,
  trigger,
  allOptions,
  productDescriptionInput,
  optionsContainer,
  productImageInput;

let currentUserId = null;
let currentWorkspaceId = null;
let productList = [];
let supplierList = [];
let canUserModify = false;

let activeProductList = []; // The list currently being displayed (can be filtered)
let productsCurrentlyShown = 0;
let isLoading = false; // Prevents multiple loads at once
const INITIAL_LOAD_COUNT = 10;
const PRODUCTS_PER_LOAD = 5;

let productListUnsub = null;
let activeListeners = {
  user: null,
  workspace: null,
};

function detachAllListeners() {
  if (activeListeners.user) {
    activeListeners.user();
    activeListeners.user = null;
  }
  if (activeListeners.workspace) {
    activeListeners.workspace();
    activeListeners.workspace = null;
  }
  if (productListUnsub) {
    productListUnsub();
    productListUnsub = null;
  }
  console.log('%c🔌 All Firestore listeners detached.', 'color: #ff5722;');
}

function attachProductListListener(userId) {
  detachAllListeners(); // Ensure no old listeners are running
  currentUserId = userId;
  
  const userDocRef = doc(db, 'users', userId);
  
  onSnapshot(userDocRef, async (userSnap) => {
    if (!userSnap.exists()) {
      console.error(`❌ User document not found for ID: ${userId}`);
      showRestrictedAccessUI('User profile not found.');
      return;
    }
    
    const userData = userSnap.data();
    const selectedWorkspaceId = userData.selectedWorkspace;
    
    if (!selectedWorkspaceId || selectedWorkspaceId === currentWorkspaceId) {
      if (!selectedWorkspaceId) {
        console.warn('%c⚠️ No selected workspace found for user.', 'color: #ffc107;');
        showRestrictedAccessUI('No workspace selected.');
      }
      return; // No change or no workspace, do nothing
    }
    
    currentWorkspaceId = selectedWorkspaceId;
    console.log(`%c🚀 Switching to workspace: ${currentWorkspaceId}`, 'color: #8a2be2; font-weight: bold;');
    
    // Detach previous product listener if it exists
    if (productListUnsub) productListUnsub();
    
    const workspaceDocRef = doc(db, 'ProductListWorkspace', currentWorkspaceId);
    
    // ** NEW: Permission Check Logic **
    await checkUserPermissions(userId, currentWorkspaceId, userData.role);
    
    // Listen to the ProductList subcollection within the workspace
    const productListRef = collection(workspaceDocRef, 'ProductList');
    const q = query(productListRef);
    
    productListUnsub = onSnapshot(q, async (snapshot) => {
      productList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('%c📦 Product List Updated:', 'color: #4caf50;', productList);
      
      await fetchDropdownOptions(userId, currentWorkspaceId);
      
      activeProductList = [...productList]; // Set the active list to the full list
      productsCurrentlyShown = 0; // Reset the counter
      const initialBatch = activeProductList.slice(0, INITIAL_LOAD_COUNT);
      renderProducts(initialBatch, false); // Render the initial 10 products
      productsCurrentlyShown = initialBatch.length;
    }, (error) => {
      console.error(`%c❌ Error listening to product list for workspace ${currentWorkspaceId}:`, 'color: #dc3545;', error);
      showRestrictedAccessUI('Could not load products for this workspace.');
    });
    
  }, (error) => {
    console.error('%c❌ Error loading user snapshot.', 'color: #dc3545;', error);
    showRestrictedAccessUI('An error occurred while loading your profile.');
  });
}

async function checkUserPermissions(userId, workspaceId, userRole) {
  canUserModify = false; // Reset permission
  if (!userId || !workspaceId) {
    console.warn("Cannot check permissions without User ID and Workspace ID.");
    return;
  }
  
  try {
    // --- Get Workspace and check for Ownership ---
    const myWorkspaceRef = doc(db, `users/${userId}/myworkspace/${workspaceId}`);
    const myWorkspaceSnap = await getDoc(myWorkspaceRef);
    const workspaceData = myWorkspaceSnap.exists() ? myWorkspaceSnap.data() : null;
    
    // Condition 1: Check if the user is the owner (from workspace data)
    const ownerRef = workspaceData?.ownerWorkspaceRef;
    const ownerPath = typeof ownerRef === 'string' ? ownerRef : ownerRef?.path;
    const isOwner = ownerPath?.includes(currentUserId);
    
    // Condition 2: Check if the user's role is Admin or Developer
    const isAdminOrDev = userRole === 3 || userRole === 0; // 3 = Admin, 0 = Developer
    
    // --- Final Permission: True if EITHER condition is met ---
    canUserModify = isOwner && isAdminOrDev;
    
    if (canUserModify) {
      console.log(`%c✅ Permission Granted: User is ${isOwner ? 'Owner' : ''}${isOwner && isAdminOrDev ? ' and ' : ''}${isAdminOrDev ? 'Admin/Dev' : ''}.`, 'color: #28a745;');
    } else {
      console.log('%c🚫 Permission Denied: User is not Owner, Admin, or Developer.', 'color: #dc3545;');
    }
    
  } catch (error) {
    console.error("Error checking permissions:", error);
    canUserModify = false; // Default to no permissions on error
  }
}

// Format currency to PHP
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

// Add this separate function for better clarity
function renderFilteredProducts(filteredProducts) {
  renderProducts(filteredProducts);
}

function loadMoreProducts() {
  if (isLoading) return;
  
  const remainingProducts = activeProductList.length - productsCurrentlyShown;
  if (remainingProducts <= 0) {
    console.log("All products loaded.");
    return; // No more products to load
  }
  
  isLoading = true;
  console.log("Loading more products...");
  
  // Get the next batch of products to load
  const nextBatch = activeProductList.slice(
    productsCurrentlyShown,
    productsCurrentlyShown + PRODUCTS_PER_LOAD
  );
  
  // Append the new products to the grid
  renderProducts(nextBatch, true);
  
  // Update the count of shown products
  productsCurrentlyShown += nextBatch.length;
  isLoading = false;
}

function handleScroll() {
  // Check if the user has scrolled close to the bottom of the page
  const buffer = 300; // Load 300px before the bottom
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - buffer) {
    loadMoreProducts();
  }
}

async function fetchDropdownOptions(userId, workspaceId) {
  console.log('%cFetching options via projects subcollection...', 'color: #17a2b8;');
  try {
    // --- 1. Query the 'projects' SUBCOLLECTION directly ---
    // This is the main logical change.
    const projectsRef = collection(db, `users/${userId}/myworkspace/${workspaceId}/projects`);
    const projectDocsSnap = await getDocs(projectsRef);
    
    if (projectDocsSnap.empty) {
      console.log("No projects found in the subcollection.");
      populateSupplierDropdown([]);
      return;
    }
    
    // --- 2. Process the projects and collect all unique member UIDs ---
    const allMemberUids = new Set();
    
    const projectSuppliers = projectDocsSnap.docs.map(doc => {
  const projectData = doc.data();

  const members = projectData.memberUIDs || [];
  members.forEach(uid => allMemberUids.add(uid));

  // Convert HSL to Hex color string if needed
  let hexColor = '#cccccc'; 
  console.log(`original color: ${projectData.color}`);
  if (projectData.color && typeof projectData.color === 'string') {
  const match = projectData.color.match(/^hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)$/i);
  if (match) {
    const h = parseInt(match[1], 10);
    const s = parseInt(match[2], 10);
    const l = parseInt(match[3], 10);
    hexColor = hslToHex(h, s, l);
  }
}
console.log(`converted color: ${hexColor}`);
  return {
    id: doc.id,
    color: hexColor,
    name: projectData.title,
    type: 'Project'
  };
});
    
    // --- 3. Fetch all unique User documents ---
    let userSuppliers = [];
    const uniqueMemberUidsArray = [...allMemberUids]; // Convert Set to Array
    
    if (uniqueMemberUidsArray.length > 0) {
      const usersRef = collection(db, 'users');
      const userQuery = query(usersRef, where(documentId(), 'in', uniqueMemberUidsArray));
      const userDocsSnap = await getDocs(userQuery);
      userSuppliers = userDocsSnap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        email: doc.data().email,
        avatar: doc.data().avatar,
        type: 'User'
      }));
    }
    
    // --- 4. Combine and Sort the final list ---
    // to be use soon ..projectSuppliers,
    supplierList = [...projectSuppliers];
    supplierList.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log('%c✅ All options loaded and sorted:', 'color: #28a745;', supplierList);
    populateSupplierDropdown(supplierList);
    
  } catch (error) {
    console.error("Error fetching dropdown options:", error);
    supplierList = [];
    populateSupplierDropdown([]); // Clear dropdown on error
  }
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  
  let c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs((h / 60) % 2 - 1)),
    m = l - c / 2,
    r = 0,
    g = 0,
    b = 0;
  
  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  return [r, g, b];
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  const toHex = (c) => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function createSupplierDisplayHTML(supplierData, fallbackName) {
  if (!supplierData) {
    return fallbackName;
  }

  let iconContent = '';
  let detailsContent = '';

  if (supplierData.type === 'User') {
    const bgImage = supplierData.avatar ? `url('${supplierData.avatar}')` : 'none';
    iconContent = `<div class="option-icon" style="background-image: ${bgImage}; background-size: cover;"></div>`;
    detailsContent = `
      <div class="option-details">
        <div class="option-name">${supplierData.name}</div>
        <div class="option-email">${supplierData.email}</div>
      </div>
    `;
  } else { // Project
    const color = supplierData.color || '#cccccc';
    iconContent = `<div class="option-icon" style="background-color: ${color};"></div>`;
    detailsContent = `
      <div class="option-details">
        <div class="option-name">${supplierData.name}</div>
      </div>
    `;
  }

  return `<div class="supplier-display">${iconContent} ${detailsContent}</div>`;
}

function populateSupplierDropdown(options) {
  const triggerText = document.querySelector('#supplierDropdownTrigger .selected-text');
  if (!optionsContainer || !triggerText) return;

  optionsContainer.innerHTML = ''; // Clear old options

  if (options.length === 0) {
    triggerText.textContent = 'No suppliers available';
    return;
  }

  options.forEach(option => {
    const optionEl = document.createElement('div');
    optionEl.className = 'custom-option';
    optionEl.dataset.value = option.name;

    let iconContent = '';
    if (option.type === 'User') {
      const bgImage = option.avatar ? `url('${option.avatar}')` : 'none';
      iconContent = `<div class="option-icon" style="background-image: ${bgImage}; background-size: cover;"></div>`;
    } else { // Project
      const color = option.color || '#cccccc'; // fallback color
      iconContent = `<div class="option-icon" style="background-color: ${color};"></div>`;
    }

    const emailText = option.email ? `<div class="option-email">${option.email}</div>` : '';

    optionEl.innerHTML = `
      ${iconContent}
      <div class="option-details">
        <div class="option-name">${option.name}</div>
        ${emailText}
      </div>
    `;

    optionEl.addEventListener('click', () => {
      selectSupplier(option.name);
      optionsContainer.classList.add('hidden');
    });

    optionsContainer.appendChild(optionEl);
  });
}

function toggleSupplierDropdown(forceClose = false) {
  console.log(`%cToggling supplier dropdown. Force close: ${forceClose}`, 'color: #17a2b8;');
  if (!optionsContainer.classList.contains('hidden')) {
    optionsContainer.classList.add('hidden');
    trigger.classList.remove('open');
  } else {
    optionsContainer.classList.remove('hidden');
    trigger.classList.add('open');
  }
}

function selectSupplier(supplierName) {
  const selectedOptionData = supplierList.find(opt => opt.name === supplierName);

  if (selectedOptionData && productSupplierInput && trigger) {
    productSupplierInput.value = supplierName;

    let iconContent = '';
    let detailsContent = '';

    if (selectedOptionData.type === 'User') {
      const bgImage = selectedOptionData.avatar ? `url('${selectedOptionData.avatar}')` : 'none';
      iconContent = `<div class="option-icon" style="background-image: ${bgImage}; background-size: cover;"></div>`;
      detailsContent = `
        <div class="option-details">
          <div class="option-name">${selectedOptionData.name}</div>
          <div class="option-email">${selectedOptionData.email}</div>
        </div>
      `;
    } else { // Project
      const color = selectedOptionData.color || '#cccccc';
      iconContent = `<div class="option-icon" style="background-color: ${color};"></div>`;
      detailsContent = `
        <div class="option-details">
          <div class="option-name">${selectedOptionData.name}</div>
        </div>
      `;
    }

    trigger.querySelector('.selected-text').innerHTML = `${iconContent} ${detailsContent}`;

    allOptions.forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === supplierName);
    });

  } else {
    hiddenInput.value = '';
    trigger.querySelector('.selected-text').innerHTML = 'Select a supplier...';
  }
}

function renderSupplierInfo(supplier) {
  if (!supplier || !supplier.name) return '';

  let icon = '';
  let details = '';

  if (supplier.type === 'User') {
    const bgImage = supplier.avatar ? `url('${supplier.avatar}')` : 'none';
    icon = `<div class="option-icon" style="background-image: ${bgImage}; background-size: cover;"></div>`;
    details = `
      <div class="option-details">
        <div class="option-name">${supplier.name}</div>
        <div class="option-email">${supplier.email || ''}</div>
      </div>
    `;
  } else if (supplier.type === 'Project') {
    const color = supplier.color || '#cccccc';
    icon = `<div class="option-icon-smaller" style="background-color: ${color};"></div>`;
    details = `
      <div class="option-details">
        <div class="option-name-smaller">${supplier.name}</div>
      </div>
    `;
  } else {
    return supplier.name; // fallback text if type unknown
  }

  return `<div class="supplier-display">${icon}${details}</div>`;
}

// Initialize the product grid
function renderProducts(productsToRender, shouldAppend = false) {
  // If not appending, clear the grid for a fresh render (e.g., initial load or search)
  if (!shouldAppend) {
    grid.innerHTML = "";
  }
  
  if (!productsToRender || productsToRender.length === 0) {
    if (!shouldAppend) {
      grid.innerHTML = `<p class="col-span-full text-center text-gray-500">No products found.</p>`;
    }
    return;
  }
  
  if (!canUserModify) {
    if (addBtn) {
      addBtn.classList.add('hidden');
    }
  }
  productsToRender.forEach((product) => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
            <div class="product-actions">
                <div class="action-btn edit-icon" data-id="${product.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </div>
                <div class="action-btn delete-icon" data-id="${product.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </div>
            </div>
            <div class="product-image">
                <img src="${product.image}" alt="${product.name
      }" class="loading" />
            </div>
            <div class="product-name">${product.name}</div>
            <div class="product-sku">${product.sku}</div>
            <div class="product-cost">${formatCurrency(product.cost)}</div>
            <div class="product-supplier">
              ${renderSupplierInfo(product.supplier)}
              </div>
        `;
    if (!canUserModify) {
      const editIcon = card.querySelector('.edit-icon');
      const deleteIcon = card.querySelector('.delete-icon');
      
      if (editIcon) editIcon.classList.add('hidden');
      if (deleteIcon) deleteIcon.classList.add('hidden');
    }
    card.dataset.id = product.id;
    if (selectedProductId === product.id) {
      card.classList.add("selected");
    }
    grid.appendChild(card);
  });
  
  // Simulate loading effect
  const images = document.querySelectorAll(".product-image img");
  images.forEach((img) => {
    img.classList.add("loading");
    img.onload = () => {
      img.classList.remove("loading");
    };
  });
}

// Show notification
function showNotification(message, duration = 3000) {
  notificationMessage.textContent = message;
  notification.classList.add("show");
  setTimeout(() => {
    notification.classList.remove("show");
  }, duration);
}

// Show modal
function showModal(product = null) {
  const modalTitle = document.getElementById("modalTitle");
  const imagePreview = document.getElementById("imagePreview");
  
  // Reset form and preview
  document.getElementById("productForm").reset();
  imagePreview.innerHTML = "";
  productImageInput.value = "";
  
  if (product) {
    // Edit mode
    modalTitle.textContent = "Edit Product";
    productNameInput.value = product.name;
    productSkuInput.value = product.sku;
    productCostInput.value = product.cost;
    productSupplierInput.value = product.supplier;
    productDescriptionInput.value = product.description || "";
    productImageInput.value = product.image;
    
    // Show preview of existing image
    if (product.image) {
      imagePreview.innerHTML = `
        <img src="${product.image}" alt="Preview" style="max-width: 100px; max-height: 100px; margin-top: 10px;" />
      `;
    }
    
    isEditing = true;
  } else {
    // Add mode
    modalTitle.textContent = "Add New Product";
    isEditing = false;
  }
  
  modal.classList.remove("hidden");
}

// Hide modal
function hideModal() {
  modal.classList.add("hidden");
}

function renderProductSidebar(product) {
  const { name, sku, cost, supplier, description, image } = product;
  const formattedCost = formatCurrency(cost);
  const supplierDisplayHtml = createSupplierDisplayHTML(supplier, supplier.name);
  
  return `
        <div class="settings-section">
            <span class="settings-label">Product Name</span>
            <div class="settings-value">${name}</div>
        </div>
        <div class="settings-section">
            <div class="flex justify-between items-start">
                <div>
                    <span class="settings-label">SKU</span>
                    <div class="settings-value">${sku}</div>
                </div>
                <span class="important-tag hidden">Important</span>
            </div>
        </div>
        <div class="settings-section">
            <span class="settings-label">Cost</span>
            <div class="settings-value">${cost}</div>
        </div>
        <div class="settings-section">
            <span class="settings-label">Supplier</span>
            <div class="settings-value">${supplierDisplayHtml}</div>
        </div>
        <div class="settings-section">
            <span class="settings-label">Description</span>
            <div class="settings-value">${description || "No description available"}</div>
        </div>
        <div class="settings-section">
            <span class="settings-label">Product image</span>
            <div class="product-image-container">
                <img src="${image}" alt="${name}" class="w-[80%] h-[80%] object-contain">
            </div>
        </div>
    `;
}

// UPDATED: Update sidebar with product details
function updateSidebar(product) {
  if (!product) {
    productSettings.innerHTML = ""; // Clear content when no product is selected
    productContent.classList.remove("hidden");
    productSettings.classList.add("hidden");
    return;
  }
  
  // Render the product details into the sidebar
  productSettings.innerHTML = renderProductSidebar(product);
  
  // Toggle visibility
  productContent.classList.add("hidden");
  productSettings.classList.remove("hidden");
}

// Handle image file
function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataURL = event.target.result;
    productImageInput.value = dataURL;
    const preview = document.getElementById("imagePreview");
    preview.innerHTML = `<img src="${dataURL}" alt="Preview" style="max-width: 100px; max-height: 100px; margin-top: 10px;" />`;
  };
  reader.readAsDataURL(file);
}

function showSavingDialog() {
  const overlay = document.getElementById('savingOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
  }
}

function hideSavingDialog() {
  const overlay = document.getElementById('savingOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

//Add New product
async function addProduct() {
  if (!canUserModify) {
    showNotification("Permission Denied: You cannot add products.", 5000);
    return;
  }

  showSavingDialog();

  const supplierName = productSupplierInput.value;
  const supplierData = supplierList.find(s => s.name === supplierName);

  const supplierInfoToSave = {
    name: supplierData?.name || supplierName,
    avatar: supplierData?.avatar || null,
    email: supplierData?.email || null,
    type: supplierData?.type || 'Unknown',
  };

  // If it's a project, and not a user (no avatar/email), include the color
  if (supplierInfoToSave.type === 'Project' && !supplierData?.avatar && !supplierData?.email) {
    supplierInfoToSave.color = supplierData?.color || '#cccccc';
  }

  const newProduct = {
    name: productNameInput.value,
    sku: productSkuInput.value,
    cost: parseFloat(productCostInput.value),
    supplier: supplierInfoToSave,
    description: productDescriptionInput.value,
    image: productImageInput.value,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const productListRef = collection(db, 'ProductListWorkspace', currentWorkspaceId, 'ProductList');
    await addDoc(productListRef, newProduct);
    hideModal();
    showNotification("Product added successfully");
  } catch (error) {
    console.error("Error adding product: ", error);
    showNotification("Error: Could not add product.", 5000);
  } finally {
    hideSavingDialog();
  }
}

// Update existing product
async function updateProduct() {
  if (!canUserModify) {
    showNotification("Permission Denied: You cannot edit products.", 5000);
    return;
  }

  if (!selectedProductId) return;
  showSavingDialog();

  const supplierName = productSupplierInput.value;
  const supplierData = supplierList.find(s => s.name === supplierName);

  const supplierInfoToSave = {
    name: supplierData?.name || supplierName,
    avatar: supplierData?.avatar || null,
    email: supplierData?.email || null,
    type: supplierData?.type || 'Unknown',
  };

  if (supplierInfoToSave.type === 'Project' && !supplierData?.avatar && !supplierData?.email) {
    supplierInfoToSave.color = supplierData?.color || '#cccccc';
  }

  const productDocRef = doc(db, 'ProductListWorkspace', currentWorkspaceId, 'ProductList', selectedProductId);
  const updatedData = {
    name: productNameInput.value,
    sku: productSkuInput.value,
    cost: parseFloat(productCostInput.value),
    supplier: supplierInfoToSave,
    description: productDescriptionInput.value,
    image: productImageInput.value,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(productDocRef, updatedData);
    const updatedProduct = { id: selectedProductId, ...updatedData };
    updateSidebar(updatedProduct);
    hideModal();
    showNotification("Product updated successfully");
  } catch (error) {
    console.error("Error updating product: ", error);
    showNotification("Error: Could not update product.", 5000);
  } finally {
    hideSavingDialog();
  }
}

// Delete product
async function deleteProduct(productId) {
  if (!canUserModify) {
    showNotification("Permission Denied: You cannot delete products.", 5000);
    return;
  }
  
  const productName = productList.find(p => p.id === productId)?.name || "The product";
  const productDocRef = doc(db, 'ProductListWorkspace', currentWorkspaceId, 'ProductList', productId);
  
  try {
    await deleteDoc(productDocRef);
    
    if (selectedProductId === productId) {
      selectedProductId = null;
      updateSidebar(null);
    }
    showNotification(`"${productName}" has been deleted.`);
    // UI will update automatically via the onSnapshot listener
  } catch (error) {
    console.error("Error deleting product: ", error);
    showNotification("Error: Could not delete product.", 5000);
  }
}

// Event handlers
async function handleGridClick(e) {
  const card = e.target.closest(".product-card");
  const editBtn = e.target.closest(".edit-icon");
  const deleteBtn = e.target.closest(".delete-icon");
  
  if (!card) {
    handleCloseClick();
    return;
  }
  
  if (editBtn) {
    e.stopPropagation(); // Prevent card selection
    const productId = editBtn.dataset.id;
    const product = productList.find((p) => p.id === productId);
    if (product) {
      selectedProductId = productId;
      showModal(product); // showModal needs to handle edit mode
    }
    return;
  }
  
  if (deleteBtn) {
    e.stopPropagation(); // Prevent card selection
    const productId = deleteBtn.dataset.id;
    if (confirm("Are you sure you want to delete this product?")) {
      await deleteProduct(productId);
    }
    return;
  }
  
  if (!card) return;
  
  selectedProductId = card.dataset.id;
  document.querySelectorAll(".product-card").forEach((c) => c.classList.remove("selected"));
  card.classList.add("selected");
  
  const product = productList.find((p) => p.id === selectedProductId);
  if (product) {
    updateSidebar(product);
  }
}

function handleOutsideClick(e) {
  // Do nothing if no product is currently selected
  if (selectedProductId === null) {
    return;
  }
  
  // Define the areas where a click should NOT trigger a deselect
  const isClickInGrid = e.target.closest("#productGridList");
  const isClickInSidebar = e.target.closest("#productSettings");
  const isClickOnAddButton = e.target.closest("#addBtn");
  const isModalOpen = !modal.classList.contains('hidden');
  
  // If the click is inside any of these "safe" areas, or if the modal is open, do nothing.
  if (isClickInGrid || isClickInSidebar || isClickOnAddButton || isModalOpen) {
    return;
  }
  
  // If the click was outside, trigger the deselection logic.
  handleCloseClick();
}

function handleAddClick() {
  showModal();
}

function handleSettingsClick() {
  /*const sidebar = document.querySelector("aside");
  const isVisible = sidebar.style.right === "0px";
  sidebar.style.right = isVisible ? "-300px" : "0px";*/
  
}

function handleCloseClick() {
  if (selectedProductId !== null) {
    console.log("Closing selection and sidebar.");
    document
      .querySelectorAll(".product-card.selected")
      .forEach((c) => c.classList.remove("selected"));
    selectedProductId = null;
    updateSidebar(null);
  }
}

function handleDragOver(e) {
  e.preventDefault();
  imageUploadContainer.classList.add("dragover");
}

function handleDragLeave() {
  imageUploadContainer.classList.remove("dragover");
}

function handleDrop(e) {
  e.preventDefault();
  imageUploadContainer.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type.match("image.*")) {
    handleImageFile(file);
  }
}

function handleFileInputChange(e) {
  if (this.files && this.files[0]) {
    handleImageFile(this.files[0]);
  }
}

function handlePaste(e) {
  if (modal.classList.contains("hidden")) return;
  
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      const blob = items[i].getAsFile();
      handleImageFile(blob);
      break;
    }
  }
}

async function handleSaveClick(e) {
  e.preventDefault();
  saveBtn.disabled = true; // Prevent double-clicking
  if (isEditing) {
    await updateProduct();
  } else {
    await addProduct();
  }
  saveBtn.disabled = false;
}

function filterProducts(searchTerm) {
  if (!searchTerm) {
    return [...productList]; // Return a copy of the master list
  }
  const term = searchTerm.toLowerCase();
  return productList.filter(
    (product) =>
    product.name.toLowerCase().includes(term) ||
    product.sku.toLowerCase().includes(term)
  );
}


function handleSearchInput(e) {
  const term = e.target.value.trim();
  clearSearchBtn.classList.toggle("hidden", !term);
  
  activeProductList = filterProducts(term); // filterProducts now returns the filtered list
  productsCurrentlyShown = 0; // Reset counter for the new filtered list
  const initialBatch = activeProductList.slice(0, INITIAL_LOAD_COUNT);
  renderProducts(initialBatch, false); // Render the initial batch of the filtered list
  productsCurrentlyShown = initialBatch.length;
}

function handleClearSearch() {
  searchInput.value = "";
  clearSearchBtn.classList.add("hidden");
  activeProductList = [...productList]; // Reset to the full master list
  productsCurrentlyShown = 0;
  const initialBatch = activeProductList.slice(0, INITIAL_LOAD_COUNT);
  renderProducts(initialBatch, false);
  productsCurrentlyShown = initialBatch.length;
}


function initElements() {
  console.log(
    "%c--- Initializing All DOM Elements ---",
    "color: yellow; font-weight: bold;"
  );
  overlay = document.getElementById('restricted-overlay');
  searchInput = document.getElementById("searchInput");
  clearSearchBtn = document.getElementById("clearSearchBtn");
  // Core App Elements
  grid = document.getElementById("productGridList");
  console.log("grid:", grid);
  addBtn = document.getElementById("addBtn");
  console.log("addBtn:", addBtn);
  settingsBtn = document.getElementById("settingsBtn");
  console.log("settingsBtn:", settingsBtn);
  closeBtn = document.getElementById("closeBtn");
  console.log("closeBtn:", closeBtn);
  productContent = document.getElementById("productContent");
  console.log("productContent:", productContent);
  productSettings = document.getElementById("productSettings");
  console.log("productSettings:", productSettings);
  
  // Modal Elements
  modal = document.getElementById("productModal");
  console.log("modal:", modal);
  closeModalBtn = document.getElementById("closeModalBtn");
  console.log("closeModalBtn:", closeModalBtn);
  cancelBtn = document.getElementById("cancelBtn");
  console.log("cancelBtn:", cancelBtn);
  saveBtn = document.getElementById("saveBtn");
  console.log("saveBtn:", saveBtn);
  
  // Notification Elements
  notification = document.getElementById("notification");
  console.log("notification:", notification);
  notificationMessage = document.getElementById("notificationMessage");
  console.log("notificationMessage:", notificationMessage);
  
  // Image Upload Elements
  imageUploadContainer = document.getElementById("imageUploadContainer");
  console.log("imageUploadContainer:", imageUploadContainer);
  fileInput = document.getElementById("productImageFile");
  console.log("fileInput:", fileInput);
  
  // Form Input Elements
  console.log("%c--- Initializing Form Inputs ---", "color: cyan;");
  productNameInput = document.getElementById("productName");
  console.log("productNameInput:", productNameInput);
  productSkuInput = document.getElementById("productSku");
  console.log("productSkuInput:", productSkuInput);
  productCostInput = document.getElementById("productCost");
  console.log("productCostInput:", productCostInput);
  productSupplierInput = document.getElementById("productSupplierValue");
  trigger = document.getElementById('supplierDropdownTrigger');
  optionsContainer = document.getElementById('supplierDropdownOptions');
  allOptions = document.querySelectorAll('.custom-option');
  console.log("productSupplierInput:", productSupplierInput);
  productDescriptionInput = document.getElementById("productDescription");
  console.log("productDescriptionInput:", productDescriptionInput);
  
  productImageInput = document.getElementById("productImage");
  console.log("productImageInput:", productImageInput);
  
  console.log(
    "%c--- DOM Element Initialization Complete ---",
    "color: yellow; font-weight: bold;"
  );
}

// Setup event listeners
function setupEventListeners() {
  grid.addEventListener("click", handleGridClick);
  addBtn.addEventListener("click", handleAddClick);
  settingsBtn.addEventListener("click", handleSettingsClick);
  closeBtn.addEventListener("click", handleCloseClick);
  closeModalBtn.addEventListener("click", hideModal);
  cancelBtn.addEventListener("click", hideModal);
  saveBtn.addEventListener("click", handleSaveClick);
  
  imageUploadContainer.addEventListener("click", () => fileInput.click());
  imageUploadContainer.addEventListener("dragover", handleDragOver);
  imageUploadContainer.addEventListener("dragleave", handleDragLeave);
  imageUploadContainer.addEventListener("drop", handleDrop);
  fileInput.addEventListener("change", handleFileInputChange);
  document.addEventListener("paste", handlePaste);
  
  searchInput.addEventListener("input", handleSearchInput);
  clearSearchBtn.addEventListener("click", handleClearSearch);
  trigger.addEventListener('click', toggleSupplierDropdown);
  document.addEventListener('click', handleOutsideClick);
  window.addEventListener('scroll', handleScroll);
}

// Cleanup event listeners
function cleanup() {
  console.log("[Products Module] Cleaning up old event listeners.");
  
  detachAllListeners();
  
  if (grid) grid.removeEventListener("click", handleGridClick);
  if (addBtn) addBtn.removeEventListener("click", handleAddClick);
  if (settingsBtn)
    settingsBtn.removeEventListener("click", handleSettingsClick);
  if (closeBtn) closeBtn.removeEventListener("click", handleCloseClick);
  if (closeModalBtn) closeModalBtn.removeEventListener("click", hideModal);
  if (cancelBtn) cancelBtn.removeEventListener("click", hideModal);
  if (saveBtn) saveBtn.removeEventListener("click", handleSaveClick);
  if (imageUploadContainer) {
    const fileInputClickHandler = () => fileInput.click();
    imageUploadContainer.removeEventListener("click", fileInputClickHandler);
    imageUploadContainer.removeEventListener("dragover", handleDragOver);
    imageUploadContainer.removeEventListener("dragleave", handleDragLeave);
    imageUploadContainer.removeEventListener("drop", handleDrop);
  }
  if (fileInput) fileInput.removeEventListener("change", handleFileInputChange);
  if (searchInput) searchInput.removeEventListener("input", handleSearchInput);
  if (clearSearchBtn)
    clearSearchBtn.removeEventListener("click", handleClearSearch);
  document.removeEventListener("paste", handlePaste);
  
  window.removeEventListener('scroll', handleScroll);
}

function showRestrictedAccessUI(message) {
  if (overlay) {
    overlay.querySelector('.message').textContent = message || 'Restricted Access';
    overlay.classList.remove('hidden');
  }
  
  const container = document.querySelector('.product-list-container');
  if (container) container.classList.add('hidden');
  
  const okBtn = document.getElementById('restricted-ok-btn');
  if (okBtn) {
    okBtn.onclick = () => {
      window.location.href = '/home';
    };
  }
}

// Initialize app
export function init(params) {
  console.log("[Products Module] Initializing...");
  
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log(`User ${user.uid} signed in. Attaching listeners.`);
      attachProductListListener(user.uid);
      initElements();
      setupEventListeners();
      renderProducts([]);
      updateSidebar(null);
      
    } else {
      console.log("User signed out. Detaching listeners.");
      detachAllListeners();
      project = { customColumns: [], sections: [], customPriorities: [], customStatuses: [] };
      productList = [];
      canUserModify = false;
      initElements();
      setupEventListeners();
      renderProducts([]);
      updateSidebar(null);
      
    }
  });
  
  const loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen) {
    setTimeout(() => {
      loadingScreen.classList.add("hidden");
    }, 1000);
  }
  return cleanup;
}