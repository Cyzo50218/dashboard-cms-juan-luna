const products = [
  {
    id: 1,
    name: "Phone 16 Pro Max",
    sku: "PHN-16PM",
    cost: 62093.5,
    supplier: "Apple Inc.",
    description: "Flagship smartphone with advanced camera system and A18 chip",
    image: "https://cdn.mos.cms.futurecdn.net/u6ACPLnZhHS9fmJGE772nU.jpg",
  },
  {
    id: 2,
    name: "Predator Helios 16 AI",
    sku: "LAP-PH16AI",
    cost: 107293.5,
    supplier: "Acer Corporation",
    description: "Gaming laptop with AI-enhanced performance and cooling",
    image:
      "https://cdn.uc.assets.prezly.com/0b67f184-f11f-4b5d-a698-893ebdec18c0/-/format/auto/Neo18-02.png",
  },
  {
    id: 3,
    name: "Närro V 17",
    sku: "LAP-NV17",
    cost: 73393.5,
    supplier: "Närro Technologies",
    description:
      "Ultra-slim laptop with 17-inch OLED display and all-day battery",
    image:
      "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: 4,
    name: "Galaxy Watch 7",
    sku: "WCH-GW7",
    cost: 19718.5,
    supplier: "Samsung Electronics",
    description: "Smartwatch with health monitoring and 5-day battery life",
    image:
      "https://www.greentelcom.ph/wp-content/uploads/2024/11/Samsung-watch-7-1.png",
  },
  {
    id: 5,
    name: "Nike Phantom 6",
    sku: "SNK-NP6",
    cost: 11243.5,
    supplier: "Nike Inc.",
    description: "Professional soccer cleats with precision touch technology",
    image:
      "https://www.nike.sa/dw/image/v2/BDVB_PRD/on/demandware.static/-/Sites-akeneo-master-catalog/default/dwc0766894/nk/82d/1/a/3/4/8/82d1a348_df75_4c43_8015_6e9760b09ace.jpg?sw=700&sh=700&sm=fit&q=100&strip=false",
  },
  {
    id: 6,
    name: "Small Classic Bag",
    sku: "BAG-SCB",
    cost: 16893.5,
    supplier: "Leather Goods Co.",
    description: "Handcrafted leather bag with multiple compartments",
    image:
      "https://images.unsplash.com/photo-1554342872-034a06541bad?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: 7,
    name: "Samsung Galaxy S24",
    sku: "PHN-SGS24",
    cost: 50793.5,
    supplier: "Samsung Electronics",
    description: "AI-powered smartphone with pro-grade camera system",
    image:
      "https://www.kimstore.com/cdn/shop/files/ph-galaxy-s24-sm-s921bzaqphl-539300355.png?v=1751341691",
  },
  {
    id: 8,
    name: "MacBook Pro 16",
    sku: "LAP-MBP16",
    cost: 141193.5,
    supplier: "Apple Inc.",
    description:
      "Professional laptop with M3 Max chip and Liquid Retina XDR display",
    image:
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp16-spacegray-select-202301?wid=904&hei=840&fmt=jpeg&qlt=90&.v=1671304673209",
  },
  {
    id: 9,
    name: "iPad Pro 12.9",
    sku: "TAB-IP12.9",
    cost: 62093.5,
    supplier: "Apple Inc.",
    description: "Tablet with M2 chip and stunning Liquid Retina XDR display",
    image:
      "https://powermaccenter.com/cdn/shop/files/iPad_Pro_Wi-Fi_12-9_in_6th_generation_Space_Gray_PDP_Image_Position-1b__en-US_a6624cbb-2f53-472d-b87b-d03b4cc81c35.jpg?v=1689785523&width=823",
  },
  {
    id: 10,
    name: "Apple Watch Ultra 2",
    sku: "WCH-AWU2",
    cost: 45143.5,
    supplier: "Apple Inc.",
    description:
      "Rugged smartwatch with advanced fitness features and 36-hour battery",
    image:
      "https://images.samsung.com/is/image/samsung/p6pim/ph/2407/gallery/ph-galaxy-watch-ultra-l705-sm-l705fdaaxtc-542169673?$684_547_PNG$",
  },
  {
    id: 11,
    name: "Google Pixel 8 Pro",
    sku: "PHN-GP8P",
    cost: 56443.5,
    supplier: "Google LLC",
    description: "Smartphone with AI camera features and Tensor G3 processor",
    image:
      "https://nerdherd.store/cdn/shop/files/Pixel8ProObsidian.jpg?v=1696659216",
  },
  {
    id: 12,
    name: "Dell XPS 13",
    sku: "LAP-DXPS13",
    cost: 67743.5,
    supplier: "Dell Technologies",
    description: "Ultraportable laptop with InfinityEdge display",
    image: "https://m.media-amazon.com/images/I/710EGJBdIML._AC_SL1500_.jpg",
  },
  {
    id: 13,
    name: "Microsoft Surface Pro 9",
    sku: "TAB-MSP9",
    cost: 56443.5,
    supplier: "Microsoft Corporation",
    description: "Versatile 2-in-1 tablet with detachable keyboard",
    image:
      "https://www.microsoftestore.com.hk/resource/images/skudetail/b1fa4b3720240528030105.jpg",
  },
  {
    id: 14,
    name: "Fitbit Versa 4",
    sku: "WCH-FV4",
    cost: 11243.5,
    supplier: "Fitbit Inc.",
    description: "Health & fitness smartwatch with built-in GPS",
    image:
      "https://electroworld.abenson.com/media/catalog/product/1/8/186753_2023_2.jpg",
  },
];

// State management
let selectedProductId = null;
let isEditing = false;
let searchInput, clearSearchBtn;
// DOM elements
let grid,
  addBtn,
  settingsBtn,
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
  productDescriptionInput,
  productImageInput;

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

// Initialize the product grid
function renderProducts(productsToRender = products) {
  grid.innerHTML = "";
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
                <img src="${product.image}" alt="${
      product.name
    }" class="loading" />
            </div>
            <div class="product-name">${product.name}</div>
            <div class="product-sku">${product.sku}</div>
            <div class="product-cost">${formatCurrency(product.cost)}</div>
            <div class="product-supplier">${product.supplier}</div>
        `;
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

// NEW: Render sidebar with product details
function renderProductSidebar(product) {
  const { name, sku, cost, supplier, description, image } = product;
  const formattedCost = formatCurrency(cost);

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
      <div class="settings-value">${formattedCost}</div>
    </div>
    <div class="settings-section">
      <span class="settings-label">Supplier</span>
      <div class="settings-value">${supplier}</div>
    </div>
    <div class="settings-section">
      <span class="settings-label">Description</span>
      <div class="settings-value">${
        description || "No description available"
      }</div>
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
  reader.onload = function (event) {
    const dataURL = event.target.result;
    productImageInput.value = dataURL;
    const preview = document.getElementById("imagePreview");
    preview.innerHTML = `<img src="${dataURL}" alt="Preview" style="max-width: 100px; max-height: 100px; margin-top: 10px;" />`;
  };
  reader.readAsDataURL(file);
}

// Add new product
function addProduct() {
  const name = productNameInput.value;
  const sku = productSkuInput.value;
  const cost = parseFloat(productCostInput.value);
  const supplier = productSupplierInput.value;
  const description = productDescriptionInput.value;
  const image = productImageInput.value;

  const newProduct = {
    id: products.length > 0 ? Math.max(...products.map((p) => p.id)) + 1 : 1,
    name,
    sku,
    cost,
    supplier,
    description,
    image,
  };

  products.push(newProduct);
  renderProducts();
  hideModal();
  showNotification("Product added successfully");
}

// Update existing product
function updateProduct() {
  const product = products.find((p) => p.id === selectedProductId);
  if (!product) return;

  product.name = productNameInput.value;
  product.sku = productSkuInput.value;
  product.cost = parseFloat(productCostInput.value);
  product.supplier = productSupplierInput.value;
  product.description = productDescriptionInput.value;
  product.image = productImageInput.value;

  renderProducts();
  updateSidebar(product);
  hideModal();
  showNotification("Product updated successfully");
}

// Delete product
function deleteProduct(productId) {
  const index = products.findIndex((p) => p.id === productId);
  if (index !== -1) {
    const productName = products[index].name;
    products.splice(index, 1);
    if (selectedProductId === productId) {
      selectedProductId = null;
      updateSidebar(null);
    }
    renderProducts();
    showNotification(`"${productName}" has been deleted`);
  }
}

// Event handlers
function handleGridClick(e) {
  const card = e.target.closest(".product-card");
  const editBtn = e.target.closest(".edit-icon");
  const deleteBtn = e.target.closest(".delete-icon");

  if (editBtn) {
    const productId = parseInt(editBtn.dataset.id);
    const product = products.find((p) => p.id === productId);
    if (product) {
      selectedProductId = productId;
      showModal(product);
    }
    return;
  }

  if (deleteBtn) {
    const productId = parseInt(deleteBtn.dataset.id);
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProduct(productId);
    }
    return;
  }

  if (!card) return;

  selectedProductId = parseInt(card.dataset.id);
  document
    .querySelectorAll(".product-card")
    .forEach((c) => c.classList.remove("selected"));
  card.classList.add("selected");

  const product = products.find((p) => p.id === selectedProductId);
  if (product) {
    updateSidebar(product);
  }
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
  document.querySelector("aside").style.right = "-300px";
  document
    .querySelectorAll(".product-card")
    .forEach((c) => c.classList.remove("selected"));
  selectedProductId = null;
  updateSidebar(null);
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

function handleSaveClick(e) {
  e.preventDefault();
  if (isEditing) {
    updateProduct();
  } else {
    addProduct();
  }
}

function filterProducts(searchTerm) {
  if (!searchTerm) return products;

  const term = searchTerm.toLowerCase();
  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term)
  );
}

function handleSearchInput(e) {
  const term = e.target.value.trim();
  clearSearchBtn.classList.toggle("hidden", !term);

  const filtered = filterProducts(term);
  renderFilteredProducts(filtered);
}

function handleClearSearch() {
  searchInput.value = "";
  clearSearchBtn.classList.add("hidden");
  renderProducts(); // Reset to show all products
}

// UPDATED: Initialize DOM elements
function initElements() {
  console.log(
    "%c--- Initializing All DOM Elements ---",
    "color: yellow; font-weight: bold;"
  );
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
  productSupplierInput = document.getElementById("productSupplier");
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
}

// Cleanup event listeners
function cleanup() {
  console.log("[Products Module] Cleaning up old event listeners.");

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
}

// Initialize app
export function init(params) {
  console.log("[Products Module] Initializing...");
  initElements();
  setupEventListeners();
  renderProducts();
  const loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen) {
    setTimeout(() => {
      loadingScreen.classList.add("hidden");
    }, 1000);
  }
  return cleanup;
}