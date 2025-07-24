import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { v4 as uuidv4 } from "https://jspm.dev/uuid";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  query,
  collectionGroup,
  where,
  getDocs,
  collection,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
const storage = getStorage(app);

export function openAddProductModal(inventoryId, currentStockType, onOpen, onClose) {
  generateAddProductModal();

  const modal = document.getElementById('productModal');
  const productForm = document.getElementById('productForm');
  const imagePreview = document.getElementById('imagePreview');
  const productImage = document.getElementById('productImage');
  const imageFileInput = document.getElementById('productImageFile');
  const imageUploadContainer = document.getElementById('imageUploadContainer');
  const cancelBtn = document.getElementById('cancelBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const saveBtn = document.getElementById('saveBtn');
  const quickProductSelect = document.getElementById('quickProductSelect');
  const warehouseLocationSelect = document.getElementById('warehouseLocation');

  // Reset form
  productForm.reset();
  imageFileInput.value = '';
  document.getElementById('previewImg').src = '';
  document.getElementById('productImage').value = '';
  document.getElementById('uploadInstructions').classList.remove('hidden');
  document.getElementById('imagePreview').classList.add('hidden');
  modal.classList.remove('hidden');

  if (typeof onOpen === 'function') {
    onOpen();
  }

  function closeModal() {
    modal.classList.add('hidden');
    if (typeof onClose === 'function') {
        onClose();
    }
  }

  cancelBtn.onclick = closeModalBtn.onclick = closeModal;

  modal.addEventListener('click', (e) => {
    // If the click target is the overlay (the element with the 'modal-overlay' class)
    // and not a child element, then close the modal.
    if (e.target === modal) {
        closeModal();
    }
  });

  if (currentStockType === 'ph') {
    warehouseLocationSelect.value = 'PH-Stocks-meta';
  } else if (currentStockType === 'us') {
    warehouseLocationSelect.value = 'US-Stocks-meta';
  }

  async function loadQuickProducts() {
    try {
      const productListRef = collection(db, 'ProductListWorkspace', inventoryId, 'ProductList');
      const querySnap = await getDocs(productListRef);

      quickProductSelect.innerHTML = `<option value="">-- Select a product to pre-fill --</option>`; // Reset

      querySnap.forEach(doc => {
        const product = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = product.name;
        // Store the full product data on the option element for easy access
        option.dataset.productData = JSON.stringify(product);
        quickProductSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Could not load quick products:", error);
      quickProductSelect.innerHTML = `<option value="">Could not load products</option>`;
    }
  }

  /**
   * Handles the selection change on the quick products dropdown.
   */
  function onQuickProductSelect() {
    const selectedOption = quickProductSelect.options[quickProductSelect.selectedIndex];
    if (!selectedOption || !selectedOption.dataset.productData) {
      // If the user selects the default option, you might want to clear the form
      // productForm.reset(); 
      return;
    }

    const product = JSON.parse(selectedOption.dataset.productData);

    // Pre-fill the form fields
    document.getElementById('productName').value = product.name || '';
    document.getElementById('productSku').value = product.sku || '';
    document.getElementById('productCost').value = product.cost || '';
    // The master list stores supplier as an object, so we access its name property
    document.getElementById('productSupplier').value = product.supplier?.name || '';
    document.getElementById('supplierName').value = product.supplier?.name || '';
    document.getElementById('productDescription').value = product.description || '';

    const supplierName = product.supplier?.name;
    if (supplierName) {
      // Find the option in the project dropdown that matches the supplier name
      for (const option of supplierProjectSelect.options) {
        if (option.textContent === supplierName) {
          supplierProjectSelect.value = option.value;
          break; // Stop searching once found
        }
      }
    }

    // Handle the image preview
    if (product.image) {
      document.getElementById('uploadInstructions').classList.add('hidden');
      imagePreview.classList.remove('hidden');
      document.getElementById('previewImg').src = product.image;
      // Store the URL in the hidden input for saving
      productImage.value = product.image;
    } else {
      imagePreview.classList.add('hidden');
      document.getElementById('uploadInstructions').classList.remove('hidden');
      document.getElementById('previewImg').src = '';
      productImage.value = '';
    }
  }

  quickProductSelect.addEventListener('change', onQuickProductSelect);
  loadQuickProducts();

  function previewImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('uploadInstructions').classList.add('hidden');
      document.getElementById('imagePreview').classList.remove('hidden');
      document.getElementById('previewImg').src = e.target.result;
    };
    reader.readAsDataURL(file);
  }


  imageFileInput.onchange = () => {
    const file = imageFileInput.files[0];
    if (file) previewImage(file);
  };

  // Click to open file
  imageUploadContainer.addEventListener('click', () => imageFileInput.click());

  // Drag & drop
  imageUploadContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadContainer.style.backgroundColor = '#eef6ff';
  });

  imageUploadContainer.addEventListener('dragleave', () => {
    imageUploadContainer.style.backgroundColor = '';
  });

  imageUploadContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadContainer.style.backgroundColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      imageFileInput.files = e.dataTransfer.files;
      previewImage(file);
    }
  });

  // Paste image from clipboard
  imageUploadContainer.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        const dt = new DataTransfer();
        dt.items.add(file);
        imageFileInput.files = dt.files;
        previewImage(file);
        break;
      }
    }
  });

  const supplierProjectSelect = document.getElementById('supplierProject');

  async function loadProjectsIntoDropdown() {
    const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const selectedWorkspace = userSnap.data()?.selectedWorkspace;

    if (!selectedWorkspace) return;

    const projectsQuery = query(
      collectionGroup(db, 'projects'),
      where('workspaceId', '==', selectedWorkspace),
      where('memberUIDs', 'array-contains', auth.currentUser.uid)
    );

    const querySnap = await getDocs(projectsQuery);
    supplierProjectSelect.innerHTML = `<option value="">-- Select Project --</option>`; // Reset

    querySnap.forEach(doc => {
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = doc.data().title || 'Unnamed Project';
      option.dataset.title = doc.data().title || 'Unnamed Project'; // 🔥 store title

      supplierProjectSelect.appendChild(option);
    });
  }


  loadProjectsIntoDropdown();

  saveBtn.onclick = async () => {
    const name = document.getElementById('productName').value.trim();
    const sku = document.getElementById('productSku').value.trim();
    const cost = parseFloat(document.getElementById('productCost').value);
    const supplier = document.getElementById('productSupplier').value.trim();
    const supplierName = document.getElementById('supplierName').value.trim();
    const Stocks = parseFloat(document.getElementById('countStocks').value)
    const supplierProjectSelect = document.getElementById('supplierProject');
    const selectedOption = supplierProjectSelect.options[supplierProjectSelect.selectedIndex];
    const supplierProjectIdOnly = selectedOption?.value || '';
    const supplierProjectTitle = selectedOption?.dataset.title || '';

    const supplierProject = supplierProjectIdOnly
      ? { id: supplierProjectIdOnly, name: supplierProjectTitle }
      : null;

    const warehouseLocation = document.getElementById('warehouseLocation').value;
    if (!warehouseLocation) {
      alert('Please select a warehouse location.');
      return;
    }
    const productVendor = document.getElementById('productVendor').value.trim();
    const size_s = parseInt(document.getElementById('size_s').value) || 0;
    const size_m = parseInt(document.getElementById('size_m').value) || 0;
    const size_l = parseInt(document.getElementById('size_l').value) || 0;
    const size_xl = parseInt(document.getElementById('size_xl').value) || 0;
    const size_xxl = parseInt(document.getElementById('size_xxl').value) || 0;
    const size_c = parseInt(document.getElementById('size_c').value) || 0;
    const size_others = parseInt(document.getElementById('size_others').value) || 0;

    const description = document.getElementById('productDescription').value.trim();

    if (!name || !sku || isNaN(cost) || !supplier) {
      alert('Please fill all required fields.');
      return;
    }

    const id = uuidv4();
    let imageUrl = '';

    const file = imageFileInput.files[0];
    const existingImageUrl = productImage.value;

    if (file) {
      // Case 1: A new file was selected by the user. Upload it.
      console.log("New file detected. Uploading to Firebase Storage...");
      const storageRef = ref(storage, `products/${id}/${file.name}`);
      await uploadBytes(storageRef, file);
      imageUrl = await getDownloadURL(storageRef);
    } else if (existingImageUrl && existingImageUrl.includes("firebasestorage.googleapis.com")) {
      console.log("Reusing existing Firebase Storage URL.");
      imageUrl = existingImageUrl;
    }
    const warehouseLocationLabel = warehouseLocation === "PH-Stocks-meta" ? "PH Stocks" :
      warehouseLocation === "US-Stocks-meta" ? "US Stocks" : "";

    const savingModal = document.getElementById('savingModal');
    savingModal.classList.remove('hidden');

    try {
      const docRef = doc(collection(db, 'InventoryWorkspace', inventoryId, warehouseLocation), id);
      await setDoc(docRef, {
        id,
        name,
        productSku: sku,
        supplierCost: cost,
        supplier: supplier,
        supplierName,
        countStocks: Stocks || 0,
        supplierProject: supplierProject,
        warehouseLocation: warehouseLocationLabel,
        description,
        productVendor,
        s: size_s,
        m: size_m,
        l: size_l,
        xl: size_xl,
        xxl: size_xxl,
        c: size_c,
        others: size_others,
        imageUrl,
        createdAt: Date.now()
      });


      modal.classList.add('hidden');

      if (typeof onSaved === 'function') onSaved();
      if (typeof onClose === 'function') {
            onClose();
        }
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Something went wrong while saving. Please try again.');
    } finally {
      savingModal.classList.add('hidden'); 
    }
  };
}

function generateAddProductModal() {
  if (document.getElementById('productModal')) return;

  const modalHtml = `
  <div id="savingModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 hidden">
  <div class="bg-white rounded-md px-6 py-4 shadow-lg flex items-center gap-2">
    <span class="loader"></span>
    <span>Saving product, please wait...</span>
  </div>
</div>

    <div class="modal-overlay hidden" id="productModal">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title" id="modalTitle">Add New Product</h3>
          <button class="modal-close" id="closeModalBtn">✕</button>
        </div>
        <div class="modal-body">
          <form id="productForm">
            <div class="form-group">
              <label class="form-label">Quick Products Selection</label>
              <select class="form-input" id="quickProductSelect">
                <option value="">-- Select a product to pre-fill --</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Product Name</label>
              <input type="text" class="form-input" id="productName" required />
            </div>
            <div class="form-group">
              <label class="form-label">SKU</label>
              <input type="text" class="form-input" id="productSku" required />
            </div>
            <div class="form-group">
              <label class="form-label">Stocks</label>
              <input type="number" class="form-input" id="countStocks" min="0" step="1" required />
            </div>
            <div class="form-group">
              <label class="form-label">Cost</label>
              <input type="number" class="form-input" id="productCost" min="0" step="0.01" required />
            </div>
            <div class="form-group" style="display: none;">
  <label class="form-label">Supplier</label>
  <input type="text" class="form-input" id="productSupplier" required />
</div>
<div class="form-group">
  <label class="form-label">Supplier Name</label>
  <input type="text" class="form-input" id="supplierName" />
</div>
<div class="form-group">
  <label class="form-label">Select Project</label>
  <select class="form-input" id="supplierProject">
  <option value="">-- Select Project --</option>
</select>
</div>
<div class="form-group" style="display: none;">
  <label class="form-label">Warehouse Location</label>
  <select class="form-input" id="warehouseLocation" required>
    <option value="">-- Select Warehouse --</option>
    <option value="PH-Stocks-meta">PH Stocks</option>
    <option value="US-Stocks-meta">US Stocks</option>
  </select>
</div>
<div class="form-group" style="display: none;">
  <label class="form-label">Vendor</label>
  <input type="text" class="form-input" id="productVendor" />
</div>

<div class="form-group">
  <label class="form-label">Shirt Sizes</label>
  <div class="grid grid-cols-3 gap-2">
    <input type="number" class="form-input" placeholder="S" id="size_s" min="0" />
    <input type="number" class="form-input" placeholder="M" id="size_m" min="0" />
    <input type="number" class="form-input" placeholder="L" id="size_l" min="0" />
    <input type="number" class="form-input" placeholder="XL" id="size_xl" min="0" />
    <input type="number" class="form-input" placeholder="XXL" id="size_xxl" min="0" />
    <input type="number" class="form-input" placeholder="C" id="size_c" min="0" />
    <input type="number" class="form-input col-span-3" placeholder="Others" id="size_others" min="0" />
  </div>
</div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-input" id="productDescription" rows="3"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Product Image</label>
              <div class="image-upload-container" id="imageUploadContainer">
  <div class="upload-instructions" id="uploadInstructions">
    <p>Drag & drop an image here</p>
    <p>or</p>
    <p>Click to browse</p>
    <p>or</p>
    <p>Paste (Ctrl+V)</p>
  </div>
  <input type="file" class="hidden" id="productImageFile" accept="image/*" />
  <div class="image-preview hidden" id="imagePreview">
    <span class="remove-image-btn" id="removeImageBtn">✕</span>
    <img id="previewImg" />
  </div>
  <input type="hidden" id="productImage" />
</div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" id="cancelBtn">Cancel</button>
          <button class="btn btn-primary" id="saveBtn">Save</button>
        </div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.innerHTML = `
    .modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.6);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-container {
      background: #fff;
      border-radius: 8px;
      width: 100%;
      max-width: 550px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      animation: slideIn 0.3s ease-out;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #ddd;
      background: #f8f8f8;
    }
    .modal-title {
      margin: 0;
      font-size: 1.25rem;
    }
    .modal-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
    }
    .modal-body {
      padding: 1.25rem;
      max-height: 70vh;
      overflow-y: auto;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    .form-label {
      display: block;
      font-weight: 600;
      color: #161616ff;
      margin-bottom: 0.25rem;
    }
    .form-input,
    textarea {
      width: 100%;
      padding: 0.65rem;
      border: 1px solid #ccc;
      border-radius: 5px;
      font-size: 0.95rem;
      resize: vertical;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      border-top: 1px solid #eee;
      background: #fafafa;
    }
    .btn {
      padding: 0.55rem 1.2rem;
      font-weight: 600;
      border-radius: 5px;
      font-size: 0.95rem;
      cursor: pointer;
    }
    .btn-primary {
      background-color: #2d8cf0;
      color: white;
      border: none;
    }
    .btn-cancel {
      background-color: #e0e0e0;
      border: none;
      color: #333;
    }
    .image-upload-container {
      border: 2px dashed #ccc;
      border-radius: 6px;
      padding: 1rem;
      text-align: center;
      cursor: pointer;
      background-color: #f9f9f9;
    }
    .upload-instructions p {
      margin: 0.25rem 0;
      font-size: 0.85rem;
      color: #777;
    }
    .image-preview {
  position: relative;
  margin-top: 0.5rem;
}
.image-preview img {
  max-width: 100%;
  border-radius: 6px;
}
.remove-image-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #e74c3c;
  color: white;
  font-weight: bold;
  border-radius: 50%;
  cursor: pointer;
  padding: 0.3rem 0.5rem;
  font-size: 0.8rem;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
}
  #savingModal {
  position: fixed;
  inset: 0;
  z-index: 99999; /* ⬅ ensure it's above modals */
  background-color: rgba(0, 0, 0, 0.4); /* dim background */
  display: flex;
  align-items: center;
  justify-content: center;
}
  .loader {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #3498db;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
    .hidden {
      display: none !important;
    }
    @keyframes slideIn {
      from {
        transform: translateY(-30px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;

  document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}
