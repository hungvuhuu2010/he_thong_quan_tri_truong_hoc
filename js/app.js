// =========================================================
// CÁC BIẾN TOÀN CỤC VÀ KHỞI TẠO
// =========================================================
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

const userDisplayName = document.getElementById('user-display-name');
const userRole = document.getElementById('user-role');
const userOrg = document.getElementById('user-org');
const btnLogout = document.getElementById('btn-logout');

const ownerPanel = document.getElementById('owner-panel');
const adminPanel = document.getElementById('admin-panel');
const employeePanel = document.getElementById('employee-panel');

const formAddField = document.getElementById('form-add-field');


const schemaFieldsList = document.getElementById('schema-fields-list');
const formCreateModule = document.getElementById('form-create-module');

const dynamicFieldsContainer = document.getElementById('dynamic-fields-container');
const formEmployeePersonnel = document.getElementById('form-employee-personnel');
const empSaveMsg = document.getElementById('emp-save-msg');

let selectedPersonnelId = null;
let currentSelectedModuleId = null;
let masterEntitiesList = [];

// =========================================================
// 1. AUTHENTICATION & LOGIN
// =========================================================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        currentUserProfile = userDoc.data();
        if (!currentUserProfile.active) {
          alert("Tài khoản đã bị khóa.");
          auth.signOut();
          return;
        }

        userDisplayName.textContent = currentUserProfile.displayName || currentUserProfile.email;
        userRole.textContent = currentUserProfile.role;
        userOrg.textContent = currentUserProfile.organizationId || 'HỆ THỐNG (SYSTEM)';

        loginScreen.style.display = 'none';
        appScreen.style.display = 'block';

        renderDashboardByRole();
      } else {
        loginError.textContent = "Không tìm thấy thông tin tài khoản.";
        auth.signOut();
      }
    } catch (error) { console.error("Lỗi auth:", error); }
  } else {
    currentUser = null;
    currentUserProfile = null;
    loginScreen.style.display = 'block';
    appScreen.style.display = 'none';
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    loginError.textContent = "Đăng nhập thất bại: Sai email hoặc mật khẩu.";
  }
});

btnLogout.addEventListener('click', () => { auth.signOut(); });

// =========================================================
// 2. ĐỔI MẬT KHẨU CÁ NHÂN
// =========================================================
window.openChangePasswordModal = function() {
  document.getElementById('change-password-modal').style.display = 'flex';
};
window.closeChangePasswordModal = function() {
  document.getElementById('change-password-modal').style.display = 'none';
  document.getElementById('form-change-password').reset();
};
document.getElementById('form-change-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPass = document.getElementById('new-password').value;
  const confirmPass = document.getElementById('confirm-password').value;
  if (newPass !== confirmPass) return alert("Mật khẩu xác nhận không khớp!");

  try {
    await auth.currentUser.updatePassword(newPass);
    alert("Đổi mật khẩu cá nhân thành công!");
    closeChangePasswordModal();
  } catch (error) { alert("Không thể đổi mật khẩu: " + error.message); }
});

// =========================================================
// 3. PHÂN LUỒNG DASHBOARD & SWITCH TAB ADMIN
// =========================================================

async function renderDashboardByRole() {
  // 1. Ẩn tất cả các Panel
  if (ownerPanel) ownerPanel.style.display = 'none';
  if (adminPanel) adminPanel.style.display = 'none';
  if (employeePanel) employeePanel.style.display = 'none';

  // 2. Phân luồng hiển thị
  if (currentUserProfile.role === 'OWNER') {
    ownerPanel.style.display = 'block';

  } else if (currentUserProfile.role === 'ADMIN') {
    adminPanel.style.display = 'block';
    if (typeof attachFormFieldListener === 'function') attachFormFieldListener();
    if (typeof attachCreateModuleListener === 'function') attachCreateModuleListener();
    switchAdminTab('schema');
    await loadOrganizationSchema();
    await loadAdminEntityList();

  } else if (currentUserProfile.role === 'EMPLOYEE') {
    employeePanel.style.display = 'block';

    // BỔ SUNG: Dò tìm entityType từ bảng entities dựa vào Email đăng nhập
    try {
      const orgId = currentUserProfile.organizationId;
      const userEmail = currentUserProfile.email;
      
      const entitySnap = await db.collection('entities')
        .where('organizationId', '==', orgId)
        .where('email', '==', userEmail)
        .get();

      if (!entitySnap.empty) {
        const entityData = entitySnap.docs[0].data();
        currentUserProfile.entityType = entityData.entityType; // Gán 'STUDENT' hoặc 'TEACHER'
        currentUserProfile.category = entityData.category;
      }
    } catch (err) {
      console.error("Lỗi xác định loại thực thể người dùng:", err);
    }

    await loadOrganizationSchema();
    setupEmployeeModuleSelector();
  }
}

window.switchAdminTab = function(tabName) {
  const tabs = ['entities', 'assignments', 'schema', 'grid'];
  
  // Ẩn tất cả các Section và Reset màu nút
  tabs.forEach(s => {
    const el = document.getElementById(`admin-sec-${s}`);
    const btn = document.getElementById(`btn-tab-${s}`);
    if (el) el.style.display = 'none';
    if (btn) { btn.style.backgroundColor = 'transparent'; btn.style.color = '#333'; }
  });

  // Hiển thị Section được chọn
  const sec = document.getElementById(`admin-sec-${tabName}`);
  const btn = document.getElementById(`btn-tab-${tabName}`);
  if (sec) sec.style.display = 'block';
  if (btn) { btn.style.backgroundColor = '#0d6efd'; btn.style.color = 'white'; }

  // Phân luồng nạp dữ liệu tương ứng cho từng thẻ
  if (tabName === 'entities') {
    loadCustomLabels();
    loadAdminEntityList();
  } else if (tabName === 'assignments') {
    setupAssignMenuDropdowns();
    populateAssignmentCheckboxes();
  } else if (tabName === 'schema') {
    if (typeof attachFormFieldListener === 'function') attachFormFieldListener();
    if (typeof attachCreateModuleListener === 'function') attachCreateModuleListener();
    populateModuleSelectDropdowns();
    populateAssignedFilterModuleDropdown();
    loadAssignedUsersListByModule();
  } else if (tabName === 'grid') {
    loadAdminDataGrid();
  }
};


// =========================================================
// 4. ADMIN: CẤU HÌNH TRƯỜNG & MODULE BÀI TOÁN
// =========================================================
// =========================================================
// BIẾN TOÀN CỤC BỔ SUNG CHO CẤU HÌNH DANH XƯNG & PHÂN CÔNG
// =========================================================
let currentCustomLabels = {
  teacherLabel: 'Giáo viên',
  studentLabel: 'Học sinh'
};

// CẬP NHẬT HÀM LOAD SCHEMA BỔ SUNG NÚT XÓA TRƯỜNG Ở SECTION 1
async function loadOrganizationSchema() {
  const orgId = currentUserProfile.organizationId;
  try {
    const doc = await db.collection('organization_schemas').doc(orgId).get();
    schemaFieldsList.innerHTML = '';
    const containerCheckboxes = document.getElementById('module-fields-checkboxes');
    if (containerCheckboxes) containerCheckboxes.innerHTML = '';

    currentOrgSchema = (doc.exists && doc.data()) ? doc.data() : { fieldDefinitions: {}, modules: {} };
    const fields = currentOrgSchema.fieldDefinitions || {};
    const fieldKeys = Object.keys(fields);

    if (fieldKeys.length === 0) {
      schemaFieldsList.innerHTML = '<li>Chưa có trường thông tin nào được tạo.</li>';
    } else {
      fieldKeys.forEach(key => {
        const f = fields[key];
        
        // 1. Tạo dòng hiển thị có Nút Xóa
        const li = document.createElement('li');
        li.style.cssText = "margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; padding: 6px 10px; border-radius: 4px; border: 1px solid #dee2e6;";
        li.innerHTML = `
          <span><b>[${key}]</b> ${f.label} <i style="color:#6c757d;">(Kiểu: ${f.dataType})</i></span>
          <button onclick="deleteSchemaField('${key}')" style="color: red; border: 1px solid red; background: white; border-radius: 4px; cursor: pointer; padding: 2px 8px; font-weight: bold;">Xóa trường</button>
        `;
        schemaFieldsList.appendChild(li);

        // 2. Tạo Checkbox cho Section 2 (Tạo Module)
        if (containerCheckboxes) {
          const lbl = document.createElement('label');
          lbl.style.display = 'block';
          lbl.style.marginBottom = '4px';
          lbl.innerHTML = `<input type="checkbox" class="mod-field-cb" value="${key}"> [${key}] ${f.label}`;
          containerCheckboxes.appendChild(lbl);
        }
      });
    }

    renderModulesListContainer();
    populateModuleSelectDropdowns();
  } catch (error) { 
    console.error("Lỗi tải Schema:", error); 
  }
}

// HÀM XÓA TRƯỜNG THÔNG TIN KHỎI SCHEMA (SECTION 1)
window.deleteSchemaField = async function(fieldKey) {
  if (!confirm(`Bạn có chắc chắn muốn xóa trường thông tin [${fieldKey}] không? (Các bài toán cũ chứa trường này cũng sẽ bỏ trường này)`)) {
    return;
  }

  const orgId = currentUserProfile.organizationId;
  try {
    const schemaRef = db.collection('organization_schemas').doc(orgId);
    const doc = await schemaRef.get();

    if (doc.exists) {
      let data = doc.data();
      if (data.fieldDefinitions && data.fieldDefinitions[fieldKey]) {
        // Xóa trường khỏi fieldDefinitions
        delete data.fieldDefinitions[fieldKey];

        // Dọn dẹp trường khỏi các Module bài toán đã tạo (nếu có)
        if (data.modules) {
          Object.keys(data.modules).forEach(mKey => {
            if (data.modules[mKey].fields) {
              data.modules[mKey].fields = data.modules[mKey].fields.filter(f => f !== fieldKey);
            }
          });
        }

        // Cập nhật lại Firestore
        await schemaRef.set(data);
        alert(`Đã xóa thành công trường [${fieldKey}]!`);
        
        // Tải lại giao diện
        await loadOrganizationSchema();
      }
    }
  } catch (error) {
    console.error("Lỗi xóa trường:", error);
    alert("Không thể xóa trường. Lỗi: " + error.message);
  }
};

// 1. RENDER DANH SÁCH BÀI TOÁN CÓ NÚT SỬA VÀ NÚT XÓA (SECTION 3)
function renderModulesListContainer() {
  const container = document.getElementById('modules-list-container');
  if (!container) return;
  const modules = (currentOrgSchema && currentOrgSchema.modules) ? currentOrgSchema.modules : {};
  const keys = Object.keys(modules);

  if (keys.length === 0) {
    container.innerHTML = '<p style="color:#6c757d;">Chưa có Bài toán Module nào được tạo.</p>';
    return;
  }

  let html = '<ul style="list-style:none; padding:0;">';
  keys.forEach(k => {
    const m = modules[k];
    const fieldCount = (m.fields || []).length;
    html += `
      <li style="margin-bottom:8px; background:#f8f9fa; padding:10px; border-radius:4px; border:1px solid #dee2e6; display:flex; justify-style:space-between; align-items:center;">
        <div>
          <b>[${k}] ${m.moduleName}</b> 
          <br><small style="color:#6c757d;">Số trường thông tin chọn: ${fieldCount}</small>
        </div>
        <div>
          <button type="button" onclick="editModuleDef('${k}')" style="color:#0d6efd; border:1px solid #0d6efd; background:white; border-radius:4px; cursor:pointer; padding:4px 10px; font-weight:bold; margin-right:6px;">
            <i class="fa-solid fa-pen-to-square"></i> Sửa
          </button>
          <button type="button" onclick="deleteModuleDef('${k}')" style="color:red; border:1px solid red; background:white; border-radius:4px; cursor:pointer; padding:4px 10px; font-weight:bold;">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </div>
      </li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

// 2. KHI BẤM NÚT SỬA BÀI TOÁN: ĐẨY DỮ LIỆU LÊN FORM P VÀ TỰ TÍCH CHỌN TRƯỜNG
window.editModuleDef = function(modId) {
  const modules = (currentOrgSchema && currentOrgSchema.modules) ? currentOrgSchema.modules : {};
  const m = modules[modId];
  if (!m) return;

  const modIdInput = document.getElementById('mod-id');
  const modNameInput = document.getElementById('mod-name');
  const targetTypeSelect = document.getElementById('mod-target-type');
  const modeInput = document.getElementById('module-edit-mode');
  const submitBtn = document.getElementById('btn-submit-module');
  const cancelBtn = document.getElementById('btn-cancel-edit-module');

  // Đổ thông tin cơ bản
  modIdInput.value = modId;
  modIdInput.readOnly = true; // Khóa Mã Module không cho sửa
  modIdInput.style.backgroundColor = '#e9ecef';

  modNameInput.value = m.moduleName;
  
  // Đổ lại giá trị targetEntityType lên form khi chỉnh sửa
  if (targetTypeSelect && m.targetEntityType) {
    targetTypeSelect.value = m.targetEntityType;
  }

  modeInput.value = 'UPDATE';

  // Tự động tích chọn đúng danh sách trường thông tin cũ
  const selectedFields = m.fields || [];
  document.querySelectorAll('.mod-field-cb').forEach(cb => {
    cb.checked = selectedFields.includes(cb.value);
  });

  // Đổi trạng thái Nút Form
  submitBtn.textContent = 'Cập nhật Bài toán Module';
  submitBtn.style.background = '#0d6efd';
  cancelBtn.style.display = 'inline-block';

  // Cuộn màn hình lên Form Section 2
  document.getElementById('form-create-module').scrollIntoView({ behavior: 'smooth' });
};

// 3. RESET FORM BÀI TOÁN VỀ TRẠNG THÁI THÊM MỚI
window.resetModuleFormState = function() {
  const modIdInput = document.getElementById('mod-id');
  const modeInput = document.getElementById('module-edit-mode');
  const submitBtn = document.getElementById('btn-submit-module');
  const cancelBtn = document.getElementById('btn-cancel-edit-module');
  const form = document.getElementById('form-create-module');
  if (form) form.reset();
  
  const targetTypeSelect = document.getElementById('mod-target-type');
	if (targetTypeSelect) targetTypeSelect.selectedIndex = 0;


  modIdInput.readOnly = false;
  modIdInput.style.backgroundColor = 'white';
  modeInput.value = 'CREATE';

  // Bỏ tích tất cả các checkbox
  document.querySelectorAll('.mod-field-cb').forEach(cb => cb.checked = false);

  submitBtn.textContent = 'Khởi tạo Bài toán Module';
  submitBtn.style.background = '#198754';
  cancelBtn.style.display = 'none';
};


window.deleteModuleDef = async function(modId) {
  if (!confirm(`Bạn có chắc muốn xóa Bài toán Module [${modId}] không?`)) return;
  const orgId = currentUserProfile.organizationId;
  try {
    const schemaRef = db.collection('organization_schemas').doc(orgId);
    const doc = await schemaRef.get();
    if (doc.exists) {
      let data = doc.data();
      if (data.modules && data.modules[modId]) {
        delete data.modules[modId];
        await schemaRef.set(data);
        alert("Đã xóa Bài toán Module!");
        await loadOrganizationSchema();
      }
    }
  } catch (error) { alert("Lỗi xóa Module: " + error.message); }
};


// CẬP NHẬT HÀM POPULATE MODULE DROPDOWNS & RENDER CHECKBOXES PHÂN CÔNG
function populateModuleSelectDropdowns() {
  const modules = (currentOrgSchema && currentOrgSchema.modules) ? currentOrgSchema.modules : {};
  const moduleKeys = Object.keys(modules);

  // 1. ĐỔ DỮ LIỆU CHO CÁC MENU THẢ XUỐNG (DROPDOWNS)
  const selects = ['select-module-preview', 'select-grid-module', 'unlock-module-select'];
  selects.forEach(sId => {
    const el = document.getElementById(sId);
    if (el) {
      el.innerHTML = '';
      if (moduleKeys.length === 0) {
        el.innerHTML = '<option value="">-- Chưa có bài toán nào --</option>';
      } else {
        moduleKeys.forEach(k => {
          const opt = document.createElement('option');
          opt.value = k; 
          opt.textContent = modules[k].moduleName || k;
          el.appendChild(opt);
        });
      }
    }
  });

  // 2. RENDER ĐỘNG DẠNG CHECKBOXES CHO PHẦN PHÂN CÔNG NHIỆM VỤ (#assign-modules-checkboxes)
  const assignContainer = document.getElementById('assign-modules-checkboxes');
  if (assignContainer) {
    assignContainer.innerHTML = '';

    if (moduleKeys.length === 0) {
      assignContainer.innerHTML = '<p style="color:#6c757d; font-style:italic;">Chưa có Module bài toán nào được tạo. Vui lòng tạo bài toán ở Khối 1 trước.</p>';
    } else {
      moduleKeys.forEach(k => {
        const m = modules[k];
        const lbl = document.createElement('label');
        lbl.style.cssText = "display: block; margin-bottom: 6px; cursor: pointer; font-weight: 500;";
        lbl.innerHTML = `
          <input type="checkbox" class="assign-mod-cb" value="${k}" style="margin-right: 8px;"> 
          <span style="color:#0d6efd; font-weight:bold;">[${k}]</span> ${m.moduleName} 
          <small style="color:#6c757d;">(${(m.fields || []).length} trường thông tin)</small>
        `;
        assignContainer.appendChild(lbl);
      });
    }
  }

  // 3. TỰ ĐỘNG CẬP NHẬT LẠI VÙNG PREVIEW EXCEL CHO BÀI TOÁN ĐẦU TIÊN
  if (typeof previewExcelTemplate === 'function') {
    previewExcelTemplate();
  }
}


// SECTION 4: EXCEL PREVIEW DYNAMIC
// =========================================================
// KHỐI 1 - SECTION 4: XỬ LÝ SẮP XẾP CỘT EXCEL ĐỘNG
// =========================================================

// Biến toàn cục lưu danh sách các trường đang được sắp xếp
window.currentModuleOrderedFields = [];

// 1. KHI CHỌN BÀI TOÁN TỪ DROPDOWN PREVIEW (ĐÃ SỬA LỖI TỰ ĐỘNG NẠP TRƯỜNG)
window.previewExcelTemplate = function() {
  const selectPreview = document.getElementById('select-module-preview');
  if (!selectPreview) return;
  
  const modId = selectPreview.value;
  const container = document.getElementById('fields-order-container');
  const modules = (currentOrgSchema && currentOrgSchema.modules) ? currentOrgSchema.modules : {};

  if (!modId || !modules[modId]) {
    if (container) container.innerHTML = '<i style="color: #6c757d;">Vui lòng chọn Bài toán Module.</i>';
    const previewTable = document.getElementById('excel-template-preview-table');
    if (previewTable) previewTable.innerHTML = '';
    window.currentModuleOrderedFields = [];
    return;
  }

  // Nạp danh sách trường từ Module vào mảng sắp xếp
  const modFields = modules[modId].fields || [];
  window.currentModuleOrderedFields = Array.from(modFields);

  // Tải lại Khung sắp xếp và Bảng xem trước
  renderFieldsOrderingUI();
  renderExcelPreviewTable();
};

// 2. VẼ VÙNG NÚT BẤM SẮP XẾP (ĐÃ GẮN SỰ KIỆN CHÍNH XÁC)
function renderFieldsOrderingUI() {
  const container = document.getElementById('fields-order-container');
  if (!container) return;

  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};
  container.innerHTML = '';

  // Thẻ cố định định danh ở đầu
  const fixedHeader = document.createElement('div');
  fixedHeader.style.cssText = "background: #e9ecef; padding: 6px 10px; border-radius: 4px; font-weight: bold; color: #495057;";
  fixedHeader.innerHTML = `<i class="fa-solid fa-lock"></i> Các cột cố định: [Mã Định Danh] - [Tên Thực Thể] - [Tổ / Lớp]`;
  container.appendChild(fixedHeader);

  if (!window.currentModuleOrderedFields || window.currentModuleOrderedFields.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = "color: orange; margin-top: 5px;";
    emptyMsg.textContent = 'Bài toán này chưa được tích chọn trường thông tin nào.';
    container.appendChild(emptyMsg);
    return;
  }

window.currentModuleOrderedFields.forEach((fKey, index) => {
    const label = fieldsDef[fKey] ? fieldsDef[fKey].label : fKey;
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: white; padding: 6px 10px; border: 1px solid #dee2e6; border-radius: 4px; margin-top: 4px;";
    
    const isFirst = index === 0;
    const isLast = index === window.currentModuleOrderedFields.length - 1;

    itemDiv.innerHTML = `
      <span><b>Cột ${index + 4}:</b> ${label} <i style="color:#6c757d;">[${fKey}]</i></span>
      <div>
        <button type="button" onclick="moveFieldOrder(${index}, -1)" ${isFirst ? 'disabled style="opacity:0.5;"' : 'style="cursor:pointer;"'} style="padding: 2px 8px; margin-right: 4px;">⬆ Lên</button>
        <button type="button" onclick="moveFieldOrder(${index}, 1)" ${isLast ? 'disabled style="opacity:0.5;"' : 'style="cursor:pointer;"'} style="padding: 2px 8px;">⬇ Xuống</button>
      </div>
    `;
    container.appendChild(itemDiv);
  });
}



// 3. THUẬT TOÁN HOÁN ĐỔI VỊ TRÍ CỘT VÀ CẬP NHẬT GIAO DIỆN
window.moveFieldOrder = function(index, direction) {
  const newIndex = index + direction;
  
  if (!window.currentModuleOrderedFields || newIndex < 0 || newIndex >= window.currentModuleOrderedFields.length) {
    return;
  }

  const temp = window.currentModuleOrderedFields[index];
  window.currentModuleOrderedFields[index] = window.currentModuleOrderedFields[newIndex];
  window.currentModuleOrderedFields[newIndex] = temp;

  renderFieldsOrderingUI();
  renderExcelPreviewTable();
};



// 4. VẼ BẢNG PREVIEW THEO ĐÚNG THỨ TỰ TRONG MẢNG
function renderExcelPreviewTable() {
  const previewDiv = document.getElementById('excel-template-preview-table');
  if (!previewDiv) return;

  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};

  let tableHtml = '<table border="1" cellpadding="6" style="border-collapse:collapse; background:#eef6ff; width:100%;"><thead><tr><th>Mã Định Danh</th><th>Họ và tên</th><th>Tổ / Lớp</th>';
  
  if (window.currentModuleOrderedFields && window.currentModuleOrderedFields.length > 0) {
    window.currentModuleOrderedFields.forEach(fKey => {
      const label = fieldsDef[fKey] ? fieldsDef[fKey].label : fKey;
      tableHtml += `<th style="color:#0d6efd;">${label} [${fKey}]</th>`;
    });
  }

  tableHtml += '</tr></thead><tbody><tr><td>GV101 / HS1001</td><td>Nguyễn Văn A</td><td>Tổ Toán / 10A1</td>';
  if (window.currentModuleOrderedFields) {
    window.currentModuleOrderedFields.forEach(() => tableHtml += '<td style="color:#6c757d;">...</td>');
  }
  tableHtml += '</tr></tbody></table>';

  previewDiv.innerHTML = tableHtml;
}

// 5. XUẤT FILE EXCEL MẪU DỰA TRÊN THỨ TỰ ĐÃ SẮP XẾP
window.downloadDynamicExcelTemplate = function() {
  const selectPreview = document.getElementById('select-module-preview');
  const modId = selectPreview ? selectPreview.value : null;
  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};

  if (!modId) return alert("Vui lòng chọn bài toán!");

  const row = { "Mã Định Danh": "HS1001", "Tên Thực Thể": "Nguyễn Văn A", "Tổ / Lớp": "10A1" };
  
  if (window.currentModuleOrderedFields && window.currentModuleOrderedFields.length > 0) {
    window.currentModuleOrderedFields.forEach(fKey => {
      const label = fieldsDef[fKey] ? fieldsDef[fKey].label : fKey;
      row[label] = "";
    });
  }

  const worksheet = XLSX.utils.json_to_sheet([row]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ExcelMau");
  XLSX.writeFile(workbook, `File_Excel_Mau_${modId}.xlsx`);
};

// =========================================================
// 5. ADMIN: QUẢN LÝ THỰC THỂ & MENU XỔ 2 CẤP PHÂN CÔNG
// =========================================================
// 1. IMPORT EXCEL: LẤY CHÍNH XÁC EMAIL TRONG FILE (KHÔNG TỰ SINH)
window.uploadEntityExcel = async function() {
  const fileInput = document.getElementById('excel-file-input');
  const entityType = document.getElementById('entity-type-selector').value;
  if (!fileInput.files || fileInput.files.length === 0) return alert("Vui lòng chọn file Excel!");

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

      const batch = db.batch();
      const orgId = currentUserProfile.organizationId;

      jsonData.forEach(row => {
        const id = String(row["Mã Định Danh"] || '').trim();
        const name = String(row["Tên Thực Thể"] || '').trim();
        const category = String(row["Tổ / Lớp"] || row["Phân Loại / Đơn vị"] || '').trim();
        
        // ĐỒNG BỘ CHÍNH XÁC EMAIL KÊ KHAI TRONG FILE EXCEL
        const email = String(row["Email"] || row["Email Kê Khai"] || row["Email Giáo Viên"] || '').trim();

        if (id && name) {
          const docRef = db.collection('entities').doc(`${orgId}_${id}`);
          batch.set(docRef, {
            organizationId: orgId,
            entityType: entityType,
            entityId: id,
            name: name,
            category: category,
            email: email, // Lưu đúng email kê khai thực tế
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      });

      await batch.commit();
      alert(`Import thành công ${jsonData.length} thực thể!`);
      fileInput.value = '';
      await loadAdminEntityList();
      setupAssignMenuDropdowns();
    } catch (error) { 
      alert("Lỗi Import: " + error.message); 
    }
  };
  reader.readAsArrayBuffer(fileInput.files[0]);
};
async function loadAdminEntityList() {
  const orgId = currentUserProfile.organizationId;
  const tbody = document.getElementById('entity-table-body');
  try {
    const snapshot = await db.collection('entities').where('organizationId', '==', orgId).get();
    tbody.innerHTML = '';
    masterEntitiesList = [];

    if (snapshot.empty) { tbody.innerHTML = '<tr><td colspan="5">Chưa có dữ liệu.</td></tr>'; return; }

    snapshot.forEach(doc => {
      const item = doc.data();
      masterEntitiesList.push(item);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.entityId}</b></td>
        <td>${item.name}</td>
        <td><span style="background:#e7f1ff; color:#0d6efd; padding:2px 6px; border-radius:4px;">${item.category}</span></td>
        <td>${item.email}</td>
        <td><button onclick="deleteEntityDoc('${doc.id}')" style="color:red; cursor:pointer;">Xóa</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) { tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Lỗi: ${error.message}</td></tr>`; }
}

window.deleteEntityDoc = async function(docId) {
  if (!confirm("Bạn có chắc chắn muốn xóa thực thể này?")) return;
  await db.collection('entities').doc(docId).delete();
  await loadAdminEntityList();
};

function setupAssignMenuDropdowns() {
  const selectGroup = document.getElementById('select-group-category');
  if (!selectGroup) return;

  const categories = [...new Set(masterEntitiesList.map(item => item.category))];
  selectGroup.innerHTML = '<option value="">-- Chọn Tổ/Lớp --</option>';

  categories.forEach(cat => {
    if (cat) {
      const opt = document.createElement('option');
      opt.value = cat; opt.textContent = cat;
      selectGroup.appendChild(opt);
    }
  });
}

window.onGroupCategoryChange = function() {
  const selectedCat = document.getElementById('select-group-category').value;
  const selectMember = document.getElementById('select-entity-member');
  selectMember.innerHTML = '<option value="">-- Chọn Thực thể --</option>';

  const filtered = masterEntitiesList.filter(item => item.category === selectedCat);
  filtered.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.entityId;
    opt.textContent = `[${item.entityId}] ${item.name}`;
    selectMember.appendChild(opt);
  });
};

window.onEntityMemberChange = async function() {
  const memberId = document.getElementById('select-entity-member').value;
  const member = masterEntitiesList.find(item => item.entityId === memberId);

  const nameInput = document.getElementById('assign-name');
  const emailInput = document.getElementById('assign-email');
  const passwordInput = document.getElementById('assign-password');
  const assignMsg = document.getElementById('assign-msg');

  // Nếu chưa chọn thực thể
  if (!member) {
    nameInput.value = '';
    emailInput.value = '';

    // Bỏ tích toàn bộ Module
    document.querySelectorAll('.assign-mod-cb').forEach(cb => {
      cb.checked = false;
    });

    return;
  }

  // ---------------------------------------------------------
  // 1. HIỂN THỊ THÔNG TIN THỰC THỂ
  // ---------------------------------------------------------
  nameInput.value = member.name || '';
  emailInput.value = member.email || '';

  // ---------------------------------------------------------
  // 2. MẶC ĐỊNH MẬT KHẨU CHỈ DÙNG KHI TẠO TÀI KHOẢN MỚI
  // ---------------------------------------------------------
  if (passwordInput && !passwordInput.value) {
    passwordInput.value = '123456';
  }

  // ---------------------------------------------------------
  // 3. XÓA TRẠNG THÁI TÍCH CŨ TRƯỚC KHI NẠP QUYỀN MỚI
  // ---------------------------------------------------------
  document.querySelectorAll('.assign-mod-cb').forEach(cb => {
    cb.checked = false;
  });

  if (!member.email) {
    if (assignMsg) {
      assignMsg.style.color = 'orange';
      assignMsg.textContent =
        'Thực thể này chưa có Email đăng nhập nên chưa thể xác định quyền đã giao.';
    }
    return;
  }

  // ---------------------------------------------------------
  // 4. TÌM TÀI KHOẢN USER THEO EMAIL
  // ---------------------------------------------------------
  try {
    if (assignMsg) {
      assignMsg.style.color = 'blue';
      assignMsg.textContent = 'Đang kiểm tra các nhiệm vụ đã được giao...';
    }

    const orgId = currentUserProfile.organizationId;

    const userSnapshot = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('email', '==', member.email)
      .limit(1)
      .get();

    // -------------------------------------------------------
    // 5. NẾU CHƯA CÓ TÀI KHOẢN
    // -------------------------------------------------------
    if (userSnapshot.empty) {
      if (assignMsg) {
        assignMsg.style.color = '#6c757d';
        assignMsg.textContent =
          'Thực thể này chưa có tài khoản. Chưa có nhiệm vụ nào được giao.';
      }

      return;
    }

    // -------------------------------------------------------
    // 6. ĐỌC DANH SÁCH MODULE ĐÃ ĐƯỢC GIAO
    // -------------------------------------------------------
    const userData = userSnapshot.docs[0].data();

    const assignedModules =
      (userData.permissions &&
       Array.isArray(userData.permissions.assignedModules))
        ? userData.permissions.assignedModules
        : [];

    // -------------------------------------------------------
    // 7. TỰ ĐỘNG TÍCH CÁC MODULE ĐÃ ĐƯỢC GIAO
    // -------------------------------------------------------
    document.querySelectorAll('.assign-mod-cb').forEach(cb => {
      cb.checked = assignedModules.includes(cb.value);
    });

    // -------------------------------------------------------
    // 8. THÔNG BÁO TRẠNG THÁI
    // -------------------------------------------------------
    if (assignMsg) {
      if (assignedModules.length > 0) {
        assignMsg.style.color = '#198754';
        assignMsg.textContent =
          `${assignedModules.length} nhiệm vụ hiện có`;
      } else {
        assignMsg.style.color = '#6c757d';
        assignMsg.textContent =
          'Thực thể đã có tài khoản nhưng chưa được giao nhiệm vụ nào.';
      }
    }

  } catch (error) {
    console.error('Lỗi tải quyền đã giao:', error);

    if (assignMsg) {
      assignMsg.style.color = 'red';
      assignMsg.textContent =
        'Không thể tải nhiệm vụ đã giao: ' + error.message;
    }
  }
};


// CẬP NHẬT HOÀN CHỈNH LUỒNG PHÂN CÔNG & TỰ ĐỘNG LÀM MỚI SECTION 3
// =========================================================
// SỬA LỖI: existingDoc is not defined KHI PHÂN CÔNG NHIỆM VỤ
// =========================================================
document.getElementById('form-assign-permission').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById('assign-name');
  const emailInput = document.getElementById('assign-email');
  const passInput = document.getElementById('assign-password');
  const assignMsg = document.getElementById('assign-msg');

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passInput.value;

  // Lấy mảng các Module bài toán được tích chọn
  const assignedMods = [];
  document.querySelectorAll('.assign-mod-cb:checked').forEach(cb => assignedMods.push(cb.value));

  if (!email) return alert("Vui lòng nhập/chọn Email thực tế của Giáo viên!");
  if (assignedMods.length === 0) return alert("Vui lòng tích chọn ít nhất 1 bài toán/module!");

  const orgId = currentUserProfile.organizationId;
  assignMsg.style.color = "blue";
  assignMsg.textContent = "Đang xử lý phân quyền và cập nhật dữ liệu...";

  try {
    // BƯỚC 1: KIỂM TRA HỒ SƠ FIRESTORE
    const userQuery = await db.collection('users').where('email', '==', email).get();

    if (!userQuery.empty) {
      // TRƯỜNG HỢP A: TÀI KHOẢN ĐÃ CÓ SẴN (KHAI BÁO RÕ existingDoc)
      const existingDoc = userQuery.docs[0]; // Khai báo chính xác biến existingDoc tại đây

      await db.collection('users').doc(existingDoc.id).update({
        displayName: name || existingDoc.data().displayName,
        active: true,
        organizationId: orgId,
        role: 'EMPLOYEE',
        "permissions.assignedModules": assignedMods,
        "permissions.isPrimaryAssignee": true, // Đánh dấu Chủ thể gốc
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    } else {
      // TRƯỜNG HỢP B: TẠO TÀI KHOẢN MỚI HOÀN TOÀN
      let secondaryApp = null;
      try {
        secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryAppAssignTemp_" + Date.now());
        const userCred = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);

        await db.collection('users').doc(userCred.user.uid).set({
          email: email,
          displayName: name,
          role: 'EMPLOYEE',
          organizationId: orgId,
          active: true,
          permissions: { 
            assignedModules: assignedMods,
            isPrimaryAssignee: true // Đánh dấu Chủ thể gốc
          },
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') {
          // Nếu đã có Auth nhưng chưa có trong Firestore
          await db.collection('users').add({
            email: email,
            displayName: name,
            role: 'EMPLOYEE',
            organizationId: orgId,
            active: true,
            permissions: { 
              assignedModules: assignedMods,
              isPrimaryAssignee: true // Đánh dấu Chủ thể gốc
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          throw authErr;
        }
      } finally {
        if (secondaryApp) await secondaryApp.delete();
      }
    }

    // BƯỚC 2: THÔNG BÁO THÀNH CÔNG VÀ RESET FORM
    assignMsg.style.color = "green";
    assignMsg.textContent = `Khởi tạo & Phân quyền thành công cho [${email}]!`;

    document.getElementById('form-assign-permission').reset();
    document.getElementById('assign-password').value = '123456'; 
    document.querySelectorAll('.assign-mod-cb').forEach(cb => cb.checked = false);

    // BƯỚC 3: CẬP NHẬT LẠI SECTION 3
    const filterSelect = document.getElementById('select-assigned-filter-module');
    if (filterSelect) filterSelect.value = 'ALL';

    if (typeof loadAssignedUsersListByModule === 'function') {
      await loadAssignedUsersListByModule();
    }

  } catch (error) {
    console.error("Lỗi phân công:", error);
    assignMsg.style.color = "red";
    assignMsg.textContent = "Không thể phân công: " + error.message;
  }
});

// =========================================================
// 6. ADMIN: MỞ KHÓA THEO THỰC THỂ & BẢNG TỔNG HỢP
// =========================================================
window.openUnlockModal = function() {
  document.getElementById('unlock-modal').style.display = 'flex';
  const selectT = document.getElementById('unlock-teacher-select');
  selectT.innerHTML = '';
  masterEntitiesList.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.email; opt.textContent = `${item.name} (${item.email})`;
    selectT.appendChild(opt);
  });
};

window.closeUnlockModal = function() {
  document.getElementById('unlock-modal').style.display = 'none';
};

window.confirmGrantUnlockPermission = async function() {
  const teacherEmail = document.getElementById('unlock-teacher-select').value;
  const modId = document.getElementById('unlock-module-select').value;
  alert(`Đã mở khóa sửa dữ liệu cũ của Bài toán [${modId}] cho Thực thể [${teacherEmail}]!`);
  closeUnlockModal();
};

// =========================================================
// HÀM HIỂN THỊ DASHBOARD ADMIN THEO NGÀY ĐƯỢC CHỌN (MẶC ĐỊNH NGÀY HÔM NAY)
// =========================================================
async function loadAdminDataGrid() {
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  const modSelect = document.getElementById('select-grid-module');
  const modId = modSelect ? modSelect.value : null;
  const gridBody = document.getElementById('grid-body-rows');
  const dateInput = document.getElementById('admin-grid-date-select');

  if (!orgId || !modId || !gridBody) return;

  // 1. TỰ ĐỘNG THIẾT LẬP MẶC ĐỊNH LÀ NGÀY HÔM NAY NẾU CHƯA CÓ GIÁ TRỊ
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
  }

  const selectedDateStr = dateInput ? dateInput.value : '';

  try {
    gridBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Đang tải số liệu ngày <b>${selectedDateStr}</b>...</td></tr>`;

    const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};

    // 2. TRUY VẤN DỮ LIỆU PERSONNEL THEO BÀI TOÁN VÀ NGÀY ĐƯỢC CHỌN
    const recordsSnap = await db.collection('personnel')
      .where('organizationId', '==', orgId)
      .where('moduleId', '==', modId)
      .where('recordDate', '==', selectedDateStr)
      .get();

    // 3. TRUY VẤN NHẬT KÝ XÓA (AUDIT LOGS) THEO BÀI TOÁN
    const auditSnap = await db.collection('audit_logs')
      .where('organizationId', '==', orgId)
      .where('moduleId', '==', modId)
      .where('actionType', '==', 'DELETE')
      .get();

    // Gom nhóm Nhật ký Xóa theo entityId
    const deletedLogsMap = {};
    auditSnap.forEach(doc => {
      const log = doc.data();
      if (!deletedLogsMap[log.entityId]) deletedLogsMap[log.entityId] = [];
      deletedLogsMap[log.entityId].push(log);
    });

    // 4. GOM NHÓM DỮ LIỆU THEO ENTITY_ID
    const groupedEntities = {};
    recordsSnap.forEach(doc => {
      const rec = doc.data();
      const entityId = rec.entityId;

      if (!groupedEntities[entityId]) {
        groupedEntities[entityId] = {
          entityId: entityId,
          entityName: rec.entityName,
          category: rec.category,
          logsMap: {}
        };
      }

      const currentLogs = rec.logs || {};
      Object.keys(currentLogs).forEach(fKey => {
        if (!groupedEntities[entityId].logsMap[fKey]) {
          groupedEntities[entityId].logsMap[fKey] = [];
        }
        groupedEntities[entityId].logsMap[fKey].push(...currentLogs[fKey]);
      });
    });

    gridBody.innerHTML = '';
    let renderedRowCount = 0;

    // 5. RENDER DỮ LIỆU BẢNG
    Object.keys(groupedEntities).forEach(entityId => {
      const rec = groupedEntities[entityId];
      const logsMap = rec.logsMap;
      const deletedLogs = deletedLogsMap[entityId] || [];

      let totalActiveCount = 0;
      let detailsHtml = '<div style="display: flex; flex-direction: column; gap: 6px;">';

      // --- A. CÁC DÒNG ĐANG CÓ HIỆU LỰC ---
      Object.keys(logsMap).forEach(fieldKey => {
        const fieldLogs = logsMap[fieldKey] || [];
        const fieldLabel = fieldsDef[fieldKey] ? fieldsDef[fieldKey].label : fieldKey;

        if (fieldLogs.length > 0) {
          totalActiveCount += fieldLogs.length;
          fieldLogs.forEach(log => {
            detailsHtml += `
              <div style="background: #f8f9fa; padding: 6px 10px; border-radius: 4px; border: 1px solid #dee2e6;">
                <span style="color: #0d6efd; font-weight: bold;">[${fieldLabel}]:</span> 
                <span style="color: #212529; font-weight: 500;">${log.content}</span>
                <br>
                <small style="color: #6c757d;">
                  <i class="fa-solid fa-user-pen"></i> Ghi bởi: <b>${log.createdBy}</b> <i>(${log.time})</i>
                </small>
              </div>`;
          });
        }
      });

      // --- B. CÁC DÒNG ĐÃ BỊ XÓA ---
      if (deletedLogs.length > 0) {
        deletedLogs.forEach(delLog => {
          const timeStr = delLog.timestamp ? new Date(delLog.timestamp.toDate()).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '';
          const fieldLabel = fieldsDef[delLog.fieldKey] ? fieldsDef[delLog.fieldKey].label : delLog.fieldKey;

          detailsHtml += `
            <div style="background: #fff0f1; padding: 6px 10px; border-radius: 4px; border: 1px dashed #dc3545;">
              <span style="color: #dc3545; font-weight: bold;">🔴 [ĐÃ XÓA - ${fieldLabel}]:</span> 
              <span style="color: #dc3545; text-decoration: line-through;">${delLog.deletedContent || 'Nội dung bị xóa'}</span>
              <br>
              <small style="color: #b02a37;">
                <i class="fa-solid fa-trash-can"></i> Xóa bởi: <b>${delLog.editedByName || delLog.editedByEmail}</b> <i>(${timeStr})</i>
              </small>
            </div>`;
        });
      }

      detailsHtml += '</div>';

      // Bỏ qua đối tượng nếu lượt bằng 0 và không có vết xóa
      if (totalActiveCount === 0 && deletedLogs.length === 0) {
        return;
      }

      renderedRowCount++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${rec.entityId}</b></td>
        <td>
          <div style="font-weight: bold; color: #0d6efd;">${rec.entityName}</div>
          <small style="color: #6c757d;">Tổ/Lớp: ${rec.category || '-'}</small>
        </td>
        <td style="text-align: center;">
          <span style="background: #dc3545; color: white; padding: 3px 10px; border-radius: 12px; font-weight: bold;">${totalActiveCount} lượt</span>
        </td>
        <td>${detailsHtml}</td>
      `;
      gridBody.appendChild(tr);
    });

    if (renderedRowCount === 0) {
      gridBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#6c757d;">Không có ghi nhận lỗi/vi phạm nào vào ngày <b>${selectedDateStr}</b>.</td></tr>`;
    }

  } catch (error) {
    console.error("Lỗi nạp Dashboard Admin:", error);
    gridBody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Lỗi: ${error.message}</td></tr>`;
  }
}

//==========================================================
//	TỔNG HỢP SỐ LIỆU CHO ADMIN
//==========================================================

// Hàm hiển thị bản ghi cho Admin có kèm chi tiết người ghi
function renderAdminRecordRow(docData) {
  const logs = docData.logs || {};
  let totalViolations = 0;
  let detailHtml = '<ul style="margin:0; padding-left:15px; font-size:0.9em;">';

  // Duyệt qua tất cả các trường dữ liệu
  Object.keys(logs).forEach(fieldKey => {
    const fieldLogs = logs[fieldKey] || [];
    totalViolations += fieldLogs.length;

    fieldLogs.forEach(log => {
      detailHtml += `
        <li style="margin-bottom: 4px;">
          <b>${log.content}</b>
          <br>
          <small style="color: #6c757d;">
            <i class="fa-solid fa-user-pen"></i> Ghi bởi: <b>${log.createdBy}</b> (${log.time})
          </small>
        </li>`;
    });
  });

  detailHtml += '</ul>';

  return `
    <tr>
      <td><b>${docData.entityId}</b></td>
      <td>${docData.entityName}</td>
      <td style="text-align: center;">
        <span style="background:#dc3545; color:white; padding:2px 8px; border-radius:10px; font-weight:bold;">
          ${totalViolations} lượt
        </span>
      </td>
      <td>${totalViolations > 0 ? detailHtml : '<i>Không có vi phạm</i>'}</td>
    </tr>
  `;
}

// =========================================================
// 7. EMPLOYEE: CHUYỂN MODULE & 3 THẺ CÔNG VIỆC
// =========================================================
window.switchEmpTab = function(tabIdx) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`emp-tab-sec-${i}`).style.display = 'none';
    const btn = document.getElementById(`btn-emp-tab-${i}`);
    btn.style.background = '#e9ecef'; btn.style.color = '#333';
  });

  document.getElementById(`emp-tab-sec-${tabIdx}`).style.display = 'block';
  const activeBtn = document.getElementById(`btn-emp-tab-${tabIdx}`);
  activeBtn.style.background = '#0d6efd'; activeBtn.style.color = 'white';

  if (tabIdx === 2) loadEmployeePersonnelList();
  if (tabIdx === 3) loadAuditLogsTimeline();
};

function setupEmployeeModuleSelector() {
  const select = document.getElementById('emp-module-select');
  const assigned = (currentUserProfile.permissions && currentUserProfile.permissions.assignedModules) || [];
  select.innerHTML = '';

	if (typeof loadAssistantDropdownOptions === 'function') {
	  loadAssistantDropdownOptions();
	}
  if (assigned.length === 0) {
    select.innerHTML = '<option value="">-- Chưa được giao nhiệm vụ --</option>';
    dynamicFieldsContainer.innerHTML = '<p style="color:red;">Chưa có nhiệm vụ nào được gán.</p>';
    return;
  }

  assigned.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    select.appendChild(opt);
  });

  currentSelectedModuleId = assigned[0];
  select.value = currentSelectedModuleId;
  renderEmployeeFormByModule();
}

window.switchEmployeeModule = function() {
  currentSelectedModuleId = document.getElementById('emp-module-select').value;
  renderEmployeeFormByModule();
  loadEmployeePersonnelList();
  loadAuditLogsTimeline();
};

// Nạp danh sách đồng nghiệp để nhờ hỗ trợ
async function loadAssistantDropdownOptions() {
  const select = document.getElementById('select-assistant-user');
  if (!select) return;

  const orgId = currentUserProfile.organizationId;
  try {
    const snapshot = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('role', '==', 'EMPLOYEE')
      .get();

    select.innerHTML = '<option value="">-- Chọn người hỗ trợ --</option>';

    snapshot.forEach(doc => {
      const u = doc.data();
      // Bỏ qua chính bản thân người đang đăng nhập
      if (u.email !== currentUserProfile.email) {
        const opt = document.createElement('option');
        opt.value = doc.id; // User ID
        opt.textContent = `${u.displayName || u.email} (${u.email})`;
        select.appendChild(opt);
      }
    });
  } catch (err) {
    console.error("Lỗi nạp danh sách người hỗ trợ:", err);
  }
};

// Cấp quyền nhập liệu tạm thời cho đồng nghiệp
window.grantTemporarySupport = async function() {
  const assistantUserId = document.getElementById('select-assistant-user').value;
  if (!assistantUserId) return alert("Vui lòng chọn người bạn muốn nhờ hỗ trợ!");

  const modId = currentSelectedModuleId;
  if (!modId) return alert("Chưa chọn bài toán nhập liệu!");

  try {
    const userRef = db.collection('users').doc(assistantUserId);
    const docSnap = await userRef.get();

    if (docSnap.exists) {
      let mods = (docSnap.data().permissions && docSnap.data().permissions.assignedModules) || [];

      // Thêm bài toán vào mảng nhiệm vụ của người được nhờ nếu chưa có
      if (!mods.includes(modId)) {
        mods.push(modId);
        await userRef.update({
          "permissions.assignedModules": mods
        });
        alert(`Đã gửi nhờ hỗ trợ thành công! Tài khoản được chọn đã có thể tham gia nhập bài toán [${modId}].`);
      } else {
        alert("Người này đã có quyền nhập bài toán này từ trước.");
      }
    }
  } catch (error) {
    alert("Lỗi cấp quyền hỗ trợ: " + error.message);
  }
};

// =========================================================
// NẠP TIÊU ĐỀ BẢNG VÀ DỮ LIỆU NHẬP LIỆU NGÀY HÔM NAY (THẺ 1)
// =========================================================

// 1. Render lại tiêu đề cột động và nạp danh sách
async function renderEmployeeFormByModule() {
  const headerRow = document.getElementById('emp-entry-table-header');
  const tbody = document.getElementById('emp-entry-table-body');
  if (!headerRow || !tbody) return;

  // Lấy danh sách trường của Module hiện tại
  const modules = (currentOrgSchema && currentOrgSchema.modules) ? currentOrgSchema.modules : {};
  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};
  const currentMod = modules[currentSelectedModuleId];

  // Khôi phục cột cố định
  let headerHtml = `
    <th style="width: 110px;">Mã ID</th>
    <th style="width: 180px;">Họ và Tên</th>
    <th style="width: 100px;">Tổ / Lớp</th>
  `;

  // Thêm các cột động theo Module bài toán
  const modFields = (currentMod && currentMod.fields) ? currentMod.fields : [];
  modFields.forEach(fKey => {
    const label = fieldsDef[fKey] ? fieldsDef[fKey].label : fKey;
    headerHtml += `<th style="color: #0d6efd;">${label}</th>`;
  });

  headerHtml += `<th style="width: 100px;">Thao tác</th>`;
  headerRow.innerHTML = headerHtml;

  // Nạp danh sách bản ghi hôm nay
  await searchAndRenderTodayPersonnelRecords();
}

// 2. Tìm kiếm thực thể và đổ dữ liệu bản ghi trong ngày

	let currentEmployeeRecordsList = [];

// =========================================================
// HÀM RENDER DỮ LIỆU NHẬP LIỆU CHUẨN THEO ĐỐI TƯỢNG BÀI TOÁN
// =========================================================
window.searchAndRenderTodayPersonnelRecords = async function() {
  const tbody = document.getElementById('emp-entry-table-body');
  const searchInput = document.getElementById('emp-live-search-input');
  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
  
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  const modId = currentSelectedModuleId;

  if (!orgId || !modId) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:red;">Chưa chọn bài toán nhập liệu.</td></tr>';
    return;
  }

  // 1. LẤY CẤU HÌNH BÀI TOÁN VÀ ĐỐI TƯỢNG ÁP DỤNG (STUDENT HAY TEACHER)
  const modules = (currentOrgSchema && currentOrgSchema.modules) ? currentOrgSchema.modules : {};
  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};
  const activeModule = modules[modId] || { fields: [], targetEntityType: 'STUDENT' };
  
  // Mặc định là STUDENT nếu bài toán cũ chưa gán targetEntityType
  const targetEntityType = (activeModule.targetEntityType || 'STUDENT').toUpperCase(); 
  const moduleFields = activeModule.fields || [];

  // Tính Ngày hôm nay YYYY-MM-DD
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  try {
    // 2. Nạp toàn bộ danh sách Thực thể của trường
    if (!masterEntitiesList || masterEntitiesList.length === 0) {
      const entitySnap = await db.collection('entities').where('organizationId', '==', orgId).get();
      masterEntitiesList = [];
      entitySnap.forEach(doc => masterEntitiesList.push(doc.data()));
    }

    // 3. Tải các bản ghi nhập liệu ĐÃ LƯU của HÔM NAY từ Firestore
    const recordsSnap = await db.collection('personnel')
      .where('organizationId', '==', orgId)
      .where('moduleId', '==', modId)
      .where('recordDate', '==', todayStr)
      .get();

    const todayRecordsMap = {};
    recordsSnap.forEach(doc => {
      const data = doc.data();
      todayRecordsMap[data.entityId] = data;
    });

    // 4. Render lại Tiêu đề Bảng (Header)
    const thead = document.getElementById('emp-entry-table-header');
    if (thead) {
      let headerHtml = `
        <th style="width: 100px;">Mã ID</th>
        <th style="width: 180px;">Họ và Tên</th>
        <th style="width: 100px;">${targetEntityType === 'TEACHER' ? 'Tổ chuyên môn' : 'Lớp'}</th>
      `;
      moduleFields.forEach(fKey => {
        const label = fieldsDef[fKey] ? fieldsDef[fKey].label : fKey;
        headerHtml += `<th>${label}</th>`;
      });
      headerHtml += `<th style="width: 120px;">Thao tác</th>`;
      thead.innerHTML = headerHtml;
    }

    // 5. LỌC CHÍNH XÁC THEO ĐỐI TƯỢNG CỦA BÀI TOÁN & TỪ KHÓA TÌM KIẾM
    const filteredEntities = masterEntitiesList.filter(item => {
      const itemType = (item.entityType || 'STUDENT').toUpperCase();

      // Chỉ giữ lại thực thể trùng khớp với Đối tượng Bài toán (TEACHER / STUDENT)
      if (itemType !== targetEntityType) {
        return false;
      }

      // Lọc theo từ khóa tìm kiếm (Mã ID, Tên, Lớp/Tổ)
      if (!keyword) return true;
      const idMatch = (item.entityId || '').toLowerCase().includes(keyword);
      const nameMatch = (item.name || '').toLowerCase().includes(keyword);
      const catMatch = (item.category || '').toLowerCase().includes(keyword);
      return idMatch || nameMatch || catMatch;
    });

    if (tbody) tbody.innerHTML = '';

    if (filteredEntities.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#6c757d;">Không có danh sách ${targetEntityType === 'TEACHER' ? 'Giáo viên' : 'Học sinh'} phù hợp.</td></tr>`;
      return;
    }

    // 6. RENDER DÒNG DỮ LIỆU
    filteredEntities.forEach(item => {
      const tr = document.createElement('tr');

      let rowHtml = `
        <td><b>${item.entityId}</b></td>
        <td>${item.name}</td>
        <td><span style="background:#e7f1ff; color:#0d6efd; padding:2px 6px; border-radius:4px;">${item.category || '-'}</span></td>
      `;

      moduleFields.forEach(fKey => {
        const existingLogs = (todayRecordsMap[item.entityId] && todayRecordsMap[item.entityId].logs) 
                              ? (todayRecordsMap[item.entityId].logs[fKey] || []) 
                              : [];

        let logsHtml = '<div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px;">';

        if (existingLogs.length > 0) {
          existingLogs.forEach((log) => {
            const isMyLog = (log.createdEmail === currentUserProfile.email);

            if (isMyLog) {
              logsHtml += `
                <div style="background: #e7f1ff; padding: 6px; border-radius: 4px; border: 1px solid #b6d4fe;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <small style="color: #0d6efd; font-weight: bold;">Do bạn ghi (${log.time})</small>
                    <button type="button" onclick="deleteSingleLogEntry('${item.entityId}', '${fKey}', '${log.id}')" 
                            style="color: red; background: none; border: none; cursor: pointer; font-size: 0.85em; font-weight: bold;">
                      <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                  </div>
                  <input type="text" 
                         class="emp-log-item-${item.entityId}" 
                         data-field-key="${fKey}" 
                         data-log-id="${log.id}" 
                         data-created-email="${log.createdEmail}" 
                         value="${log.content}" 
                         style="width: 100%; padding: 4px; border: 1px solid #9ec5fe; border-radius: 3px; font-size: 0.9em;">
                </div>`;
            } else {
              logsHtml += `
                <div style="background: #e9ecef; padding: 6px; border-radius: 4px; border: 1px solid #ced4da; font-size: 0.85em;">
                  <div style="color: #495057;">🔒 <b>${log.content}</b></div>
                  <small style="color: #6c757d; display: block; margin-top: 2px;">
                    <i><b>${log.createdBy}</b> ghi lúc (${log.time})</i>
                  </small>
                </div>`;
            }
          });
        }

        logsHtml += '</div>';

        rowHtml += `
          <td>
            ${logsHtml}
            <textarea class="emp-new-field-${item.entityId}" 
                      data-field-key="${fKey}" 
                      rows="1" 
                      placeholder="+ Thêm thông tin..." 
                      style="width: 100%; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; font-size: 0.9em;"></textarea>
          </td>
        `;
      });

      rowHtml += `
        <td>
          <button type="button" 
                  onclick="saveEmployeeEntryRecord('${item.entityId}', '${item.name}', '${item.category}')" 
                  style="padding: 6px 12px; background: #198754; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">
            <i class="fa-solid fa-floppy-disk"></i> Lưu
          </button>
        </td>
      `;

      tr.innerHTML = rowHtml;
      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error("Lỗi tải danh sách nhập liệu:", error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:red;">Lỗi dữ liệu: ${error.message}</td></tr>`;
  }
};


// =========================================================
// HÀM LÀM MỚI: TẢI LẠI DỮ LIỆU FIRESTORE & XÓA KHUNG TÌM KIẾM
// =========================================================
window.refreshAndRenderEmployeeData = async function() {
  const searchInput = document.getElementById('emp-live-search-input');
  if (searchInput) {
    searchInput.value = ''; // Reset khung tìm kiếm về rỗng
  }

  // Làm sạch mảng tạm để buộc tải mới từ Firestore
  masterEntitiesList = [];

  // Tải lại và render bảng
  await searchAndRenderTodayPersonnelRecords();
};
    

// 3. Hàm Lưu/Cập nhật bản ghi kèm ghi vết Audit Log
window.saveSingleEntityRecord = async function(entityId, entityName, category, existingDocId) {
  const saveMsg = document.getElementById('emp-save-msg');
  const inputs = document.querySelectorAll(`.emp-record-input-${entityId}`);
  const recordData = {};

  inputs.forEach(inp => {
    const key = inp.dataset.fieldKey;
    recordData[key] = inp.value.trim();
  });

  const orgId = currentUserProfile.organizationId;
  const userEmail = currentUser.email;
  const userName = currentUserProfile.displayName || userEmail;

  try {
    saveMsg.style.color = "blue";
    saveMsg.textContent = `Đang lưu dữ liệu cho [${entityName}]...`;

    let recordDocId = existingDocId;

    if (recordDocId) {
      // Cập nhật bản ghi cũ trong ngày
      await db.collection('personnel').doc(recordDocId).update({
        recordData: recordData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedByEmail: userEmail,
        updatedByName: userName
      });
    } else {
      // Tạo bản ghi mới
      const newRef = await db.collection('personnel').add({
        organizationId: orgId,
        moduleId: currentSelectedModuleId,
        entityId: entityId,
        entityName: entityName,
        category: category,
        recordData: recordData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdByEmail: userEmail,
        createdByName: userName
      });
      recordDocId = newRef.id;
    }

    // GHI NHẬT KÝ BIẾN ĐỘNG (AUDIT LOGS) ĐỂ ADMIN KIỂM TRA
    await db.collection('audit_logs').add({
      organizationId: orgId,
      moduleId: currentSelectedModuleId,
      personnelRecordId: recordDocId,
      entityId: entityId,
      entityName: entityName,
      editedByEmail: userEmail,
      editedByName: userName,
      recordDataSnapshot: recordData,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    saveMsg.style.color = "green";
    saveMsg.textContent = `Đã lưu thành công cho [${entityName}] lúc ${new Date().toLocaleTimeString('vi-VN')}!`;

    // Tải lại để cập nhật ID bản ghi mới tạo (nếu có)
    await searchAndRenderTodayPersonnelRecords();

  } catch (error) {
    console.error("Lỗi lưu bản ghi:", error);
    saveMsg.style.color = "red";
    saveMsg.textContent = "Không thể lưu: " + error.message;
  }
};

window.updateLivePreview = function() {
  const container = document.getElementById('live-preview-container');
  const inputs = document.querySelectorAll('.emp-dynamic-input');
  let html = '<ul style="list-style:none; padding:0;">';
  let hasVal = false;

  inputs.forEach(inp => {
    const v = inp.value.trim();
    if (v !== '') { hasVal = true; html += `<li>${inp.dataset.fieldLabel}: <b>${v}</b></li>`; }
  });
  html += '</ul>';
  container.innerHTML = hasVal ? html : '<p style="color:#6c757d; font-style:italic;">Chưa có dữ liệu...</p>';
};

// =========================================================
// HÀM TẢI NHẬT KÝ BIẾN ĐỘNG CỦA NGƯỜI NHẬP LIỆU THEO NGÀY CHỌN
// =========================================================
async function loadAuditLogsTimeline() {
  const container = document.getElementById('audit-logs-timeline');
  const dateInput = document.getElementById('emp-audit-date-select');
  if (!container) return;

  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  if (!orgId) {
    container.innerHTML = '<p style="color:red;">Chưa xác định đơn vị.</p>';
    return;
  }

  // 1. MẶC ĐỊNH LẤY NGÀY HÔM NAY NẾU CHƯA CHỌN
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
  }

  const selectedDateStr = dateInput ? dateInput.value : '';

  try {
    container.innerHTML = `<p style="color:#0d6efd;">Đang tải nhật ký biến động ngày <b>${selectedDateStr}</b>...</p>`;

    // 2. TRUY VẤN AUDIT LOGS THUỘC ĐƠN VỊ VÀ BÀI TOÁN HIỆN TẠI
    const snapshot = await db.collection('audit_logs')
      .where('organizationId', '==', orgId)
      .where('moduleId', '==', currentSelectedModuleId)
      .get();

    container.innerHTML = '';
    let count = 0;

    snapshot.forEach(doc => {
      const log = doc.data();

      // Chuyển timestamp về chuỗi YYYY-MM-DD để so sánh chuẩn xác
      let logDateStr = '';
      if (log.timestamp) {
        const logDate = log.timestamp.toDate();
        const y = logDate.getFullYear();
        const m = String(logDate.getMonth() + 1).padStart(2, '0');
        const d = String(logDate.getDate()).padStart(2, '0');
        logDateStr = `${y}-${m}-${d}`;
      }

      // Lọc các log phát sinh đúng trong ngày được chọn
      if (logDateStr === selectedDateStr) {
        count++;
        const timeStr = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '-';
        
        const isDelete = (log.actionType === 'DELETE');
        const borderColor = isDelete ? '#dc3545' : '#0d6efd';
        const badgeTag = isDelete ? '<span style="color:#dc3545; font-weight:bold;">[XÓA DỮ LIỆU]</span>' : '<span style="color:#198754; font-weight:bold;">[LƯU / CẬP NHẬT]</span>';

        const div = document.createElement('div');
        div.style.cssText = `border-left:4px solid ${borderColor}; padding-left:10px; margin-bottom:10px; background:white; padding:10px; border-radius:4px; border: 1px solid #dee2e6;`;
        
        div.innerHTML = `
          <div style="font-size:0.85em; color:#6c757d; margin-bottom: 4px;">
            🔔 <b>[Lúc ${timeStr}]</b> - ${badgeTag}
          </div>
          <div>
            <b>${log.editedByName || log.editedByEmail}</b> 
            ${isDelete 
              ? `đã <b style="color:red;">XÓA</b> nội dung "<i>${log.deletedContent || ''}</i>" của đối tượng <b>${log.entityId}</b>` 
              : `đã thực hiện <b style="color:green;">LƯU</b> điều chỉnh cho đối tượng <b>${log.entityId}</b> (Lượt thứ ${log.editSequence || 1})`
            }.
          </div>
        `;
        container.appendChild(div);
      }
    });

    if (count === 0) {
      container.innerHTML = `<p style="color:#6c757d;">Không có nhật ký biến động nào trong ngày <b>${selectedDateStr}</b>.</p>`;
    }

  } catch (error) {
    console.error("Lỗi nạp nhật ký:", error);
    container.innerHTML = `<p style="color:red;">Lỗi: ${error.message}</p>`;
  }
}



// =========================================================
// KHỐI 1 - SECTION 1: XỬ LÝ THÊM, CẬP NHẬT VÀ XÓA TRƯỜNG SCHEMA
// =========================================================

// 1. TẢI VÀ HIỂN THỊ DANH SÁCH TRƯỜNG CỦA TRƯỜNG
// TẢI DANH SÁCH TRƯỜNG VÀ RENDER CÁC NÚT SỬA / XÓA
async function loadOrganizationSchema() {
  if (!currentUserProfile || !currentUserProfile.organizationId) return;
  const orgId = currentUserProfile.organizationId;

  try {
    const doc = await db.collection('organization_schemas').doc(orgId).get();
    const schemaFieldsList = document.getElementById('schema-fields-list');
    const containerCheckboxes = document.getElementById('module-fields-checkboxes');

    if (schemaFieldsList) schemaFieldsList.innerHTML = '';
    if (containerCheckboxes) containerCheckboxes.innerHTML = '';

    currentOrgSchema = (doc.exists && doc.data()) ? doc.data() : { fieldDefinitions: {}, modules: {} };
    const fields = currentOrgSchema.fieldDefinitions || {};
    const fieldKeys = Object.keys(fields);

    if (fieldKeys.length === 0) {
      if (schemaFieldsList) schemaFieldsList.innerHTML = '<li>Chưa có trường thông tin nào được tạo.</li>';
    } else {
      fieldKeys.forEach(key => {
        const f = fields[key];
        
        // Render dòng danh sách có NÚT SỬA và NÚT XÓA
        if (schemaFieldsList) {
          const li = document.createElement('li');
          li.style.cssText = "margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; padding: 8px 12px; border-radius: 4px; border: 1px solid #dee2e6;";
          
          li.innerHTML = `
            <span><b>[${key}]</b> ${f.label} <i style="color:#6c757d;">(Kiểu: ${f.dataType})</i></span>
            <div>
              <button type="button" onclick="editSchemaField('${key}')" style="color: #0d6efd; border: 1px solid #0d6efd; background: white; border-radius: 4px; cursor: pointer; padding: 3px 8px; font-weight: bold; margin-right: 6px;">
                <i class="fa-solid fa-pen-to-square"></i> Sửa
              </button>
              <button type="button" onclick="deleteSchemaField('${key}')" style="color: red; border: 1px solid red; background: white; border-radius: 4px; cursor: pointer; padding: 3px 8px; font-weight: bold;">
                <i class="fa-solid fa-trash"></i> Xóa
              </button>
            </div>
          `;
          schemaFieldsList.appendChild(li);
        }

        // Tự động đổ Checkbox sang Section 2
        if (containerCheckboxes) {
          const lbl = document.createElement('label');
          lbl.style.display = 'block';
          lbl.style.marginBottom = '4px';
          lbl.innerHTML = `<input type="checkbox" class="mod-field-cb" value="${key}"> [${key}] ${f.label}`;
          containerCheckboxes.appendChild(lbl);
        }
      });
    }

    if (typeof renderModulesListContainer === 'function') renderModulesListContainer();
    if (typeof populateModuleSelectDropdowns === 'function') populateModuleSelectDropdowns();

  } catch (error) { 
    console.error("Lỗi tải Schema:", error); 
  }
}

// 2. BẮT SỰ KIỆN SUBMIT DÀNH CHO FORM THÊM / CẬP NHẬT TRƯỜNG
document.addEventListener('DOMContentLoaded', () => {
  attachFormFieldListener();
});


// 2. KHI BẤM NÚT SỬA TRÊN MỖI DÒNG: ĐẨY DỮ LIỆU LÊN FORM P
window.editSchemaField = function(fieldKey) {
  const fields = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};
  const f = fields[fieldKey];

  if (!f) return;

  const keyInput = document.getElementById('field-key');
  const labelInput = document.getElementById('field-label');
  const typeInput = document.getElementById('field-type');
  const modeInput = document.getElementById('field-edit-mode');
  const submitBtn = document.getElementById('btn-submit-field');
  const cancelBtn = document.getElementById('btn-cancel-edit-field');

  // Đổ dữ liệu lên các ô nhập
  keyInput.value = fieldKey;
  keyInput.readOnly = true; // Khóa không cho sửa Mã trường (Key)
  keyInput.style.backgroundColor = '#e9ecef';

  labelInput.value = f.label;
  typeInput.value = f.dataType;
  modeInput.value = 'UPDATE';

  // Đổi trạng thái Nút Form sang chế độ Cập nhật
  submitBtn.textContent = 'Cập nhật trường thông tin';
  submitBtn.style.background = '#198754';
  cancelBtn.style.display = 'inline-block';

  // Cuộn màn hình lên vị trí Form
  document.getElementById('form-add-field').scrollIntoView({ behavior: 'smooth' });
};


// 3. HÀM RESET FORM VỀ TRẠNG THÁI THÊM MỚI BAN ĐẦU
window.resetFormFieldState = function() {
  const keyInput = document.getElementById('field-key');
  const modeInput = document.getElementById('field-edit-mode');
  const submitBtn = document.getElementById('btn-submit-field');
  const cancelBtn = document.getElementById('btn-cancel-edit-field');
  const form = document.getElementById('form-add-field');

  if (form) form.reset();

  // Reset các ô cấu hình KPI
  const isKpiCb = document.getElementById('field-is-kpi');
  if (isKpiCb) {
    isKpiCb.checked = false;
    toggleKPISettings(false);
  }

  keyInput.readOnly = false;
  keyInput.style.backgroundColor = 'white';
  modeInput.value = 'CREATE';

  submitBtn.textContent = 'Thêm trường thông tin';
  submitBtn.style.background = '#0d6efd';
  cancelBtn.style.display = 'none';
};



// 4. LẮNG NGHE SỰ KIỆN SUBMIT FORM (HỖ TRỢ CẢ THÊM MỚI LẪN CẬP NHẬT)
function attachFormFieldListener() {
  const formAddField = document.getElementById('form-add-field');
  if (formAddField && !formAddField.dataset.bound) {
    formAddField.dataset.bound = "true";
    
    formAddField.addEventListener('submit', async (e) => {
      e.preventDefault();

      const keyInput = document.getElementById('field-key');
      const labelInput = document.getElementById('field-label');
      const typeInput = document.getElementById('field-type');
      const modeInput = document.getElementById('field-edit-mode');

      const key = keyInput.value.trim();
      const label = labelInput.value.trim();
      const type = typeInput.value;
      const isUpdate = modeInput.value === 'UPDATE';
      const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
//KPI
	  const isKPI = document.getElementById('field-is-kpi').checked;
	  const scoreWeight = parseFloat(document.getElementById('field-score-weight').value) || 0;
	  const aggType = document.getElementById('field-agg-type').value;
      
	  if (!orgId) return alert("Chưa xác định đơn vị trường. Vui lòng đăng nhập lại!");

      try {
        const schemaRef = db.collection('organization_schemas').doc(orgId);
        const doc = await schemaRef.get();
        
        let data = doc.exists ? doc.data() : { fieldDefinitions: {}, modules: {} };
        if (!data.fieldDefinitions) data.fieldDefinitions = {};

        // Cập nhật giá trị trường với thông tin KPI
		data.fieldDefinitions[key] = {
		  label: label,
		  dataType: type,
		  isKPI: isKPI,
		  scoreWeight: isKPI ? scoreWeight : 0,
		  aggregationType: isKPI ? aggType : 'NONE'
		};

        await schemaRef.set(data, { merge: true });

        alert(isUpdate ? `Đã cập nhật thành công trường [${key}]!` : `Đã thêm thành công trường [${key}]!`);
        
        resetFormFieldState();
        await loadOrganizationSchema();

      } catch (error) {
        console.error("Lỗi lưu trường:", error);
        alert("Không thể lưu trường. Lỗi: " + error.message);
      }
    });
  }
}


// =========================================================
// IMPORT / EXPORT DANH SÁCH TRƯỜNG THÔNG TIN BẰNG EXCEL
// =========================================================

// 1. TẢI FILE EXCEL MẪU
window.downloadSchemaFieldTemplate = function() {

  const data = [
    {
      "Mã trường": "loiDiMuon",
      "Tên hiển thị": "Đi muộn",
      "Kiểu dữ liệu": "number"
    },
    {
      "Mã trường": "ghiChu",
      "Tên hiển thị": "Ghi chú",
      "Kiểu dữ liệu": "text"
    },
    {
      "Mã trường": "ngayViPham",
      "Tên hiển thị": "Ngày vi phạm",
      "Kiểu dữ liệu": "date"
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Độ rộng cột
  worksheet['!cols'] = [
    { wch: 25 },
    { wch: 30 },
    { wch: 20 }
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "DanhSachTruong"
  );

  XLSX.writeFile(
    workbook,
    "Mau_Import_Truong_Thong_Tin.xlsx"
  );
};


// 2. IMPORT TRƯỜNG THÔNG TIN TỪ XLSX
window.importSchemaFieldsFromExcel = async function(input) {

  if (!input.files || input.files.length === 0) {
    return;
  }

  const file = input.files[0];

  try {

    const data = await file.arrayBuffer();

    const workbook = XLSX.read(data, {
      type: "array"
    });

    const sheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: ""
    });

    if (!rows.length) {
      alert("File Excel không có dữ liệu!");
      input.value = "";
      return;
    }

    const orgId = currentUserProfile
      ? currentUserProfile.organizationId
      : null;

    if (!orgId) {
      alert("Chưa xác định được đơn vị trường. Vui lòng đăng nhập lại!");
      input.value = "";
      return;
    }

    const schemaRef = db
      .collection("organization_schemas")
      .doc(orgId);

    const doc = await schemaRef.get();

    let dataSchema = doc.exists
      ? doc.data()
      : {
          fieldDefinitions: {},
          modules: {}
        };

    if (!dataSchema.fieldDefinitions) {
      dataSchema.fieldDefinitions = {};
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    rows.forEach((row, index) => {

      const rowNumber = index + 2;

      const key = String(
        row["Mã trường"] ||
        row["Field Key"] ||
        row["fieldKey"] ||
        ""
      ).trim();

      const label = String(
        row["Tên hiển thị"] ||
        row["Label"] ||
        row["label"] ||
        ""
      ).trim();

      const type = String(
        row["Kiểu dữ liệu"] ||
        row["Data Type"] ||
        row["dataType"] ||
        "text"
      ).trim().toLowerCase();

      // Kiểm tra dữ liệu
      if (!key) {
        errorCount++;
        errors.push(`Dòng ${rowNumber}: Thiếu Mã trường`);
        return;
      }

      if (!label) {
        errorCount++;
        errors.push(`Dòng ${rowNumber}: Thiếu Tên hiển thị`);
        return;
      }

      // Kiểm tra kiểu dữ liệu
      const validTypes = ["number", "text", "date"];

      if (!validTypes.includes(type)) {
        errorCount++;
        errors.push(
          `Dòng ${rowNumber}: Kiểu dữ liệu "${type}" không hợp lệ. Chỉ dùng number, text hoặc date`
        );
        return;
      }

      // Kiểm tra mã trường
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
        errorCount++;
        errors.push(
          `Dòng ${rowNumber}: Mã trường "${key}" không hợp lệ`
        );
        return;
      }

      // Ghi vào Schema
      dataSchema.fieldDefinitions[key] = {
        label: label,
        dataType: type
      };

      successCount++;
    });

    // Nếu không có dòng hợp lệ
    if (successCount === 0) {
      alert(
        "Không có trường nào được Import!\n\n" +
        errors.join("\n")
      );

      input.value = "";
      return;
    }

    // Lưu Firestore
    await schemaRef.set(
      {
        fieldDefinitions: dataSchema.fieldDefinitions
      },
      {
        merge: true
      }
    );

    // Tải lại giao diện
    await loadOrganizationSchema();

    let message =
      `Import thành công ${successCount} trường thông tin.`;

    if (errorCount > 0) {
      message +=
        `\nCó ${errorCount} dòng bị bỏ qua.`;

      if (errors.length > 0) {
        message +=
          "\n\nChi tiết:\n" +
          errors.slice(0, 10).join("\n");

        if (errors.length > 10) {
          message +=
            `\n... và ${errors.length - 10} lỗi khác.`;
        }
      }
    }

    alert(message);

  } catch (error) {

    console.error(
      "Lỗi Import trường thông tin:",
      error
    );

    alert(
      "Không thể Import file Excel!\n\n" +
      error.message
    );

  } finally {

    // Cho phép chọn lại chính file đó
    input.value = "";
  }
};


// =========================================================
// KHỐI 1 - SECTION 2: BẮT SỰ KIỆN KHỞI TẠO BÀI TOÁN MODULE
// =========================================================

// 4. LẮNG NGHE SỰ KIỆN SUBMIT (HỖ TRỢ THÊM MỚI VÀ CẬP NHẬT BÀI TOÁN)
function attachCreateModuleListener() {
  const formCreateModule = document.getElementById('form-create-module');

  if (formCreateModule && !formCreateModule.dataset.bound) {
    formCreateModule.dataset.bound = "true";

    formCreateModule.addEventListener('submit', async (e) => {
      e.preventDefault();

      const modIdInput = document.getElementById('mod-id');
      const modNameInput = document.getElementById('mod-name');
      const modeInput = document.getElementById('module-edit-mode');
      const targetTypeSelect = document.getElementById('mod-target-type'); // Lấy thẻ select

      const modId = modIdInput.value.trim().toUpperCase();
      const modName = modNameInput.value.trim();
      // ĐỌC GIÁ TRỊ TẠI THỜI ĐIỂM BẤM SUBMIT (ĐÃ SỬA LỖI)
      const modTargetType = targetTypeSelect ? targetTypeSelect.value : 'STUDENT'; 
      const isUpdate = modeInput.value === 'UPDATE';
      const orgId = currentUserProfile ? currentUserProfile.organizationId : null;

      if (!orgId) return alert("Chưa xác định đơn vị trường. Vui lòng đăng nhập lại!");

      // Lấy danh sách trường được tích chọn mới
      const selectedFields = [];
      document.querySelectorAll('.mod-field-cb:checked').forEach(cb => {
        selectedFields.push(cb.value);
      });

      if (selectedFields.length === 0) {
        return alert("Vui lòng tích chọn ít nhất 1 trường thông tin cho bài toán!");
      }

      try {
        const schemaRef = db.collection('organization_schemas').doc(orgId);
        const doc = await schemaRef.get();

        let data = doc.exists ? doc.data() : { fieldDefinitions: {}, modules: {} };
        if (!data.modules) data.modules = {};

        // Cập nhật đối tượng lưu vào Firestore
        data.modules[modId] = {
          moduleName: modName,
          targetEntityType: modTargetType, // 'STUDENT' hoặc 'TEACHER'
          fields: selectedFields,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await schemaRef.set(data, { merge: true });

        alert(isUpdate ? `Đã cập nhật thành công Bài toán: [${modName}]!` : `Đã khởi tạo thành công Bài toán: [${modName}]!`);
        
        resetModuleFormState();
        await loadOrganizationSchema();

      } catch (error) {
        console.error("Lỗi lưu Module:", error);
        alert("Không thể lưu Bài toán. Lỗi: " + error.message);
      }
    });
  }
}


// 1. NÚT THÊM NHANH: CHỌN PHẦN TỬ HIỆN TẠI VÀ CHUYỂN TỰ ĐỘNG SANG NGƯỜI TIẾP THEO
window.quickSelectNextEntity = function() {
  const memberSelect = document.getElementById('select-entity-member');
  if (!memberSelect || memberSelect.options.length <= 1) {
    return alert("Vui lòng chọn Tổ/Lớp có thực thể trước!");
  }

  const currentIndex = memberSelect.selectedIndex;
  if (currentIndex <= 0) {
    memberSelect.selectedIndex = 1; // Chọn người đầu tiên
  } else if (currentIndex < memberSelect.options.length - 1) {
    memberSelect.selectedIndex = currentIndex + 1; // Chuyển người tiếp theo
  } else {
    alert("Đã đến thực thể cuối cùng trong Tổ/Lớp này!");
  }

  // Kích hoạt lại sự kiện cập nhật thông tin lên ô nhập
  onEntityMemberChange();
};

// 2. POPULATE DROPDOWN LỌC BÀI TOÁN DÀNH CHO SECTION 3
function populateAssignedFilterModuleDropdown() {
  const modules = (currentOrgSchema && currentOrgSchema.modules) ? currentOrgSchema.modules : {};
  const filterSelect = document.getElementById('select-assigned-filter-module');
  if (!filterSelect) return;

  filterSelect.innerHTML = '<option value="ALL">-- Tất cả bài toán --</option>';
  Object.keys(modules).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = `[${k}] ${modules[k].moduleName}`;
    filterSelect.appendChild(opt);
  });
}

// 3. TẢI DANH SÁCH THỰC THỂ ĐÃ ĐƯỢC PHÂN CÔNG VÀ LỌC THEO BÀI TOÁN (SECTION 3)
// =========================================================
// HÀM TẢI DANH SÁCH SECTION 3 VỚI TRUY VẤN SNAPSHOT CHUẨN XÁC
// =========================================================
window.loadAssignedUsersListByModule = async function() {
  const tbody = document.getElementById('assigned-users-table-body');
  if (!tbody) return;

  const filterSelect = document.getElementById('select-assigned-filter-module');
  const filterModId = filterSelect ? filterSelect.value : 'ALL';
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;

  if (!orgId) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Chưa xác định đơn vị trường.</td></tr>';
    return;
  }

  try {
    tbody.innerHTML = '<tr><td colspan="5">Đang tải dữ liệu phân công...</td></tr>';

    // 1. TRUY VẤN FIRESTORE ĐỂ LẤY SNAPSHOT DỮ LIỆU USER
    const snapshot = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('role', '==', 'EMPLOYEE')
      .get();

    tbody.innerHTML = '';

    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5">Chưa có thực thể nào được phân công nhiệm vụ.</td></tr>';
      return;
    }

    let count = 0;

    // 2. VÒNG LẶP RENDER DUYỆT QUA TỪNG DOCUMENT TRONG SNAPSHOT
    snapshot.forEach(doc => {
      const user = doc.data();
      const assignedMods = (user.permissions && user.permissions.assignedModules) || [];

      // Kiểm tra điều kiện lọc theo Bài toán Module
      if (filterModId === 'ALL' || assignedMods.includes(filterModId)) {
        count++;
        const tr = document.createElement('tr');
        
        // Render Badge Module
        let modsBadgeHtml = assignedMods.map(m => `
          <span style="background:#e7f1ff; color:#0d6efd; padding:2px 8px; border-radius:4px; font-weight:bold; margin-right:4px;">${m}</span>
        `).join('');
        if (assignedMods.length === 0) modsBadgeHtml = '<i style="color:red;">Chưa gán module</i>';

        // Render Nút Xóa chuẩn xác theo từng Module
        let actionButtonsHtml = '';
        if (assignedMods.length === 0) {
          actionButtonsHtml = '<i style="color:#6c757d;">Không có quyền</i>';
        } else {
          actionButtonsHtml = assignedMods.map(modCode => `
            <button type="button" onclick="revokeSingleModule('${doc.id}', '${user.displayName || user.email}', '${modCode}')" style="color:red; border:1px solid red; background:white; border-radius:4px; cursor:pointer; padding:3px 6px; font-weight:bold; margin: 2px; font-size: 0.9em;">
              <i class="fa-solid fa-trash"></i> Xóa [${modCode}]
            </button>
          `).join('');
        }

        tr.innerHTML = `
          <td><b>${user.displayName || 'Chưa đặt tên'}</b></td>
          <td>${user.email}</td>
          <td><span style="background:#d1e7dd; color:#0f5132; padding:2px 6px; border-radius:4px; font-weight:bold;">EMPLOYEE</span></td>
          <td>${modsBadgeHtml}</td>
          <td>${actionButtonsHtml}</td>
        `;
        tbody.appendChild(tr);
      }
    });

    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="5">Không có thực thể nào phụ trách bài toán <b>[${filterModId}]</b>.</td></tr>`;
    }

  } catch (error) {
    console.error("Lỗi nạp Section 3:", error);
    tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
  }
};

// 4. XÓA / THU HỒI PHÂN CÔNG NHIỆM VỤ CỦA THỰC THỂ (SECTION 3)

// =========================================================
// HÀM TẢI BẢNG SECTION 3: ẨN HOÀN TOÀN TÀI KHOẢN KHÔNG CÓ NHIỆM VỤ
// =========================================================
window.loadAssignedUsersListByModule = async function() {
  const tbody = document.getElementById('assigned-users-table-body');
  if (!tbody) return;

  const filterSelect = document.getElementById('select-assigned-filter-module');
  const filterModId = filterSelect ? filterSelect.value : 'ALL';
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;

  if (!orgId) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Chưa xác định đơn vị trường.</td></tr>';
    return;
  }

  try {
    tbody.innerHTML = '<tr><td colspan="5">Đang tải dữ liệu phân công...</td></tr>';

    // 1. Truy vấn các user có vai trò EMPLOYEE
    const snapshot = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('role', '==', 'EMPLOYEE')
      .get();

    tbody.innerHTML = '';

    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5">Chưa có thực thể nào được phân công nhiệm vụ.</td></tr>';
      return;
    }

    let count = 0;

    // 2. Vòng lặp duyệt danh sách và LỌC BỎ tài khoản không có nhiệm vụ
    snapshot.forEach(doc => {
      const user = doc.data();
      const assignedMods = (user.permissions && user.permissions.assignedModules) || [];

      // ĐIỀU KIỆN LỌC CHÍNH: 
      // - Phải có ÍT NHẤT 1 module được gán (assignedMods.length > 0)
      // - Nếu chọn bài toán cụ thể thì module đó phải nằm trong danh sách gán
      const hasAnyModule = assignedMods.length > 0;
      const matchesFilter = (filterModId === 'ALL') || assignedMods.includes(filterModId);

      if (hasAnyModule && matchesFilter) {
        count++;
        const tr = document.createElement('tr');
        
        // Render Badge đại diện cho các Module
        const modsBadgeHtml = assignedMods.map(m => `
          <span style="background:#e7f1ff; color:#0d6efd; padding:2px 8px; border-radius:4px; font-weight:bold; margin-right:4px;">${m}</span>
        `).join('');

        // Render Nút Xóa tương ứng với từng Module
        const actionButtonsHtml = assignedMods.map(modCode => `
          <button type="button" onclick="revokeSingleModule('${doc.id}', '${user.displayName || user.email}', '${modCode}')" style="color:red; border:1px solid red; background:white; border-radius:4px; cursor:pointer; padding:3px 6px; font-weight:bold; margin: 2px; font-size: 0.9em;">
            <i class="fa-solid fa-trash"></i> Xóa [${modCode}]
          </button>
        `).join('');

        tr.innerHTML = `
          <td><b>${user.displayName || 'Chưa đặt tên'}</b></td>
          <td>${user.email}</td>
          <td><span style="background:#d1e7dd; color:#0f5132; padding:2px 6px; border-radius:4px; font-weight:bold;">EMPLOYEE</span></td>
          <td>${modsBadgeHtml}</td>
          <td>${actionButtonsHtml}</td>
        `;
        tbody.appendChild(tr);
      }
    });

    // 3. Nếu không có ai thỏa mãn điều kiện
    if (count === 0) {
      if (filterModId === 'ALL') {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#6c757d;">Hiện không có thực thể nào đang được gán nhiệm vụ.</td></tr>';
      } else {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#6c757d;">Không có thực thể nào phụ trách bài toán <b>[${filterModId}]</b>.</td></tr>`;
      }
    }

  } catch (error) {
    console.error("Lỗi nạp Section 3:", error);
    tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
  }
};


// HÀM XÓA CHÍNH XÁC 1 MODULE KHỎI THỰC THỂ (BẤT KỂ ĐANG Ở CHẾ ĐỘ LỌC NÀO)
window.revokeSingleModule = async function(userId, userName, modCodeToRevoke) {
  if (!confirm(`Bạn có chắc muốn XÓA bài toán [${modCodeToRevoke}] khỏi danh sách nhiệm vụ của [${userName}] không?`)) {
    return;
  }

  try {
    const userDocRef = db.collection('users').doc(userId);
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      let mods = (userDoc.data().permissions && userDoc.data().permissions.assignedModules) || [];
      
      // Lọc bỏ module cần xóa ra khỏi mảng
      mods = mods.filter(m => m !== modCodeToRevoke);

      // Cập nhật lại mảng mới lên Firestore
      await userDocRef.update({
        "permissions.assignedModules": mods
      });

      alert(`Đã xóa thành công bài toán [${modCodeToRevoke}] của [${userName}]!`);

      // TỰ ĐỘNG LÀM MỚI NGAY LẬP TỨC BẢNG RÀ SOÁT SECTION 3
      await loadAssignedUsersListByModule();

      // Đồng bộ lại danh sách thực thể nếu cần
      if (typeof loadAdminEntityList === 'function') await loadAdminEntityList();
    }
  } catch (error) {
    console.error("Lỗi khi xóa bài toán:", error);
    alert("Không thể xóa bài toán. Lỗi: " + error.message);
  }
};

// Hàm tìm kiếm và lọc danh sách bản ghi cá nhân 
window.searchEmployeePersonnelList = function() {
  const keyword = document.getElementById('emp-search-input').value.trim().toLowerCase();
  const tbody = document.getElementById('emp-grid-body-rows');
  const rows = tbody.getElementsByTagName('tr');

  if (!rows || rows.length === 0) return;

  let hasMatch = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Bỏ qua dòng thông báo không có dữ liệu
    if (row.cells.length === 1) continue; 

    const textContent = row.textContent.toLowerCase();
    
    if (textContent.includes(keyword)) {
      row.style.display = '';
      hasMatch = true;
    } else {
      row.style.display = 'none';
    }
  }

  // Thông báo nếu không tìm thấy kết quả nào
  if (!hasMatch && keyword !== '') {
    let emptyRow = document.getElementById('emp-search-empty-msg');
    if (!emptyRow) {
      emptyRow = document.createElement('tr');
      emptyRow.id = 'emp-search-empty-msg';
      emptyRow.innerHTML = `<td colspan="3" style="text-align:center; color:#6c757d; italic;">Không tìm thấy kết quả phù hợp với từ khóa "${keyword}".</td>`;
      tbody.appendChild(emptyRow);
    } else {
      emptyRow.style.display = '';
      emptyRow.cells[0].textContent = `Không tìm thấy kết quả phù hợp với từ khóa "${keyword}".`;
    }
  } else {
    const emptyRow = document.getElementById('emp-search-empty-msg');
    if (emptyRow) emptyRow.style.display = 'none';
  }
};



// 1. Hàm lọc danh sách Thực thể theo từ khóa tìm kiếm khi bấm nút Tìm kiếm
window.filterEntityListLocal = function() {
  const searchInput = document.getElementById('entity-search-input');
  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const tbody = document.getElementById('entity-table-body');
  
  if (!tbody) return;
  const rows = tbody.getElementsByTagName('tr');

  let hasMatch = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Bỏ qua dòng thông báo "Đang tải..." hoặc "Chưa có dữ liệu"
    if (row.cells.length === 1) continue;

    const rowText = row.textContent.toLowerCase();

    if (rowText.includes(keyword)) {
      row.style.display = '';
      hasMatch = true;
    } else {
      row.style.display = 'none';
    }
  }

  // Hiển thị dòng thông báo nếu không khớp từ khóa nào
  let emptyMsgRow = document.getElementById('entity-search-empty-msg');
  if (!hasMatch && keyword !== '') {
    if (!emptyMsgRow) {
      emptyMsgRow = document.createElement('tr');
      emptyMsgRow.id = 'entity-search-empty-msg';
      emptyMsgRow.innerHTML = `<td colspan="5" style="text-align: center; color: #6c757d; font-style: italic;">Không tìm thấy thực thể phù hợp với từ khóa "${keyword}".</td>`;
      tbody.appendChild(emptyMsgRow);
    } else {
      emptyMsgRow.style.display = '';
      emptyMsgRow.cells[0].textContent = `Không tìm thấy thực thể phù hợp với từ khóa "${keyword}".`;
    }
  } else if (emptyMsgRow) {
    emptyMsgRow.style.display = 'none';
  }
};

// 2. Hàm Tải lại danh sách: Xóa rỗng khung tìm kiếm và tải/hiển thị lại đầy đủ bảng
window.resetAndReloadAdminEntityList = async function() {
  const searchInput = document.getElementById('entity-search-input');
  if (searchInput) {
    searchInput.value = ''; // Xóa rỗng khung tìm kiếm
  }
  
  // Tải lại danh sách dữ liệu từ CSDL
  await loadAdminEntityList();
};



// Hàm lưu / cập nhật bản ghi nhập liệu của Nhân viên
window.saveEmployeeEntryRecord = async function(entityId, entityName, category) {
  const orgId = currentUserProfile.organizationId;
  const modId = currentSelectedModuleId;
  const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const currentUserInfo = currentUserProfile.displayName || currentUserProfile.email;

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const recordDocId = `${orgId}_${modId}_${entityId}_${dateStr}`;
  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};

	// THÊM ĐOẠN KIỂM TRA HẾT HẠN NHẠP LIỆU KHI  ===== NHỜ HỌC SINH =====
	const p = currentUserProfile ? currentUserProfile.permissions : {};
	if (p.isPrimaryAssignee !== true && p.supportExpiresAt) {
	  if (Date.now() >= p.supportExpiresAt) {
		alert("⏰ ĐÃ HẾT GIỜ HỖ TRỢ (10 phút)! Bạn không thể lưu dữ liệu.");
		auth.signOut();
		return;
	  }
}

  try {
    const recordRef = db.collection('personnel').doc(recordDocId);
    const docSnap = await recordRef.get();
    
    let currentLogs = docSnap.exists ? (docSnap.data().logs || {}) : {};
    let currentEditCount = docSnap.exists ? (docSnap.data().editCount || 0) : 0;
    let isChanged = false; // Biến kiểm tra xem có sự thay đổi thực sự không

    // 1. CẬP NHẬT LẠI CÁC DÒNG CỦA CHÍNH MÌNH VỪA CHỈNH SỬA
    const myEditedInputs = document.querySelectorAll(`.emp-log-item-${entityId}`);
    myEditedInputs.forEach(input => {
      const fieldKey = input.dataset.fieldKey;
      const logId = input.dataset.logId;
      let newContent = input.value.trim();

      if (fieldsDef[fieldKey] && fieldsDef[fieldKey].dataType === 'number') {
        newContent = parseDecimalNumber(newContent);
      }
	  

      if (currentLogs[fieldKey]) {
        const logIndex = currentLogs[fieldKey].findIndex(l => l.id === logId);
        if (logIndex !== -1 && currentLogs[fieldKey][logIndex].createdEmail === currentUserProfile.email) {
          if (currentLogs[fieldKey][logIndex].content !== newContent && newContent !== '') {
            currentLogs[fieldKey][logIndex].content = newContent;
            isChanged = true;
          }
        }
      }
    });

    // 2. BỔ SUNG CÁC DÒNG MỚI GÕ THÊM
    const newInputs = document.querySelectorAll(`.emp-new-field-${entityId}`);
    newInputs.forEach(input => {
      const fieldKey = input.dataset.fieldKey;
      const newText = input.value.trim();

      if (newText !== '') {
        const lines = newText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (!currentLogs[fieldKey]) currentLogs[fieldKey] = [];

        lines.forEach(lineText => {
          let processedText = lineText;
          if (fieldsDef[fieldKey] && fieldsDef[fieldKey].dataType === 'number') {
            processedText = parseDecimalNumber(lineText);
          }

          currentLogs[fieldKey].push({
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            content: processedText,
            createdBy: currentUserInfo,
            createdEmail: currentUserProfile.email,
            time: nowStr
          });
          isChanged = true;
        });
      }
    });

    if (!isChanged) {
      return alert("Không có thay đổi nào mới để lưu!");
    }

    // TĂNG SỐ LƯỢT CHỈNH SỬA LÊN 1
    const newEditCount = currentEditCount + 1;

    // 3. GHI VÀO FIRESTORE
    await recordRef.set({
      organizationId: orgId,
      moduleId: modId,
      entityId: entityId,
      entityName: entityName,
      category: category,
      recordDate: dateStr,
      logs: currentLogs,
      editCount: newEditCount, // Lưu tổng số lượt chỉnh sửa
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 4. GHI NHẬT KÝ BIẾN ĐỘNG AUDIT LOG
    await db.collection('audit_logs').add({
      organizationId: orgId,
      moduleId: modId,
      personnelRecordId: recordDocId,
      entityId: entityId,
      actionType: 'SAVE', // Hành động LƯU
      editSequence: newEditCount, // Lượt thứ mấy
      editedByEmail: currentUserProfile.email,
      editedByName: currentUserProfile.displayName || currentUserProfile.email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert(`Lưu thành công! (Lượt chỉnh sửa thứ ${newEditCount})`);
    await searchAndRenderTodayPersonnelRecords();

  } catch (error) {
    alert("Lỗi khi lưu: " + error.message);
  }
};

window.deleteSingleLogEntry = async function(entityId, fieldKey, logId) {
  if (!confirm("Bạn có chắc chắn muốn xóa dòng này không? Thao tác này sẽ ghi nhận vào lượt biến động.")) return;

  const orgId = currentUserProfile.organizationId;
  const modId = currentSelectedModuleId;
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const recordDocId = `${orgId}_${modId}_${entityId}_${dateStr}`;

  try {
    const recordRef = db.collection('personnel').doc(recordDocId);
    const docSnap = await recordRef.get();

    if (docSnap.exists) {
      let currentLogs = docSnap.data().logs || {};
      let currentEditCount = docSnap.data().editCount || 0;
      let deletedContent = "";

      if (currentLogs[fieldKey]) {
        const itemToDelete = currentLogs[fieldKey].find(
          log => log.id === logId && log.createdEmail === currentUserProfile.email
        );
        if (itemToDelete) {
          deletedContent = itemToDelete.content;
        }

        // Lọc bỏ dòng cần xóa
        currentLogs[fieldKey] = currentLogs[fieldKey].filter(
          log => !(log.id === logId && log.createdEmail === currentUserProfile.email)
        );

        // TĂNG SỐ LƯỢT CHỈNH SỬA LÊN 1 KHI XÓA THÀNH CÔNG
        const newEditCount = currentEditCount + 1;

        // Cập nhật lại bản ghi
        await recordRef.update({ 
          logs: currentLogs,
          editCount: newEditCount
        });

        // GHI LỊCH SỬ XÓA VÀO AUDIT LOGS
        await db.collection('audit_logs').add({
          organizationId: orgId,
          moduleId: modId,
          personnelRecordId: recordDocId,
          entityId: entityId,
          actionType: 'DELETE', // Hành động XÓA
          editSequence: newEditCount, // Lượt thứ mấy
          fieldKey: fieldKey,
          deletedContent: deletedContent,
          editedByEmail: currentUserProfile.email,
          editedByName: currentUserProfile.displayName || currentUserProfile.email,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(`Đã xóa thành công! (Lượt biến động thứ ${newEditCount})`);
        await searchAndRenderTodayPersonnelRecords();
      }
    }
  } catch (error) {
    console.error("Lỗi xóa dòng:", error);
    alert("Không thể xóa: " + error.message);
  }
};


// Hàm chuẩn hóa chuỗi nhập vào thành Số thập phân chuẩn (Number)
function parseDecimalNumber(valStr) {
  if (valStr === null || valStr === undefined || valStr === '') return '';
  
  // Chuyển dấu phẩy ',' thành dấu chấm '.' để JavaScript phân tích đúng kiểu Float
  const normalized = valStr.toString().trim().replace(',', '.');
  const parsed = parseFloat(normalized);
  
  // Trả về kiểu Number nếu là số hợp lệ, ngược lại trả về chuỗi ban đầu
  return isNaN(parsed) ? valStr : parsed;
}


// =========================================================
// CHỨC NĂNG NÚT BAY & MODAL GỌI ĐỒNG ĐỘI HỖ TRỢ
// =========================================================

let selectedAssistantUserId = null;
let masterHelpUsersList = [];

// 1. MỞ MODAL VÀ TẢI DANH SÁCH NHÂN SỰ
window.openHelpModal = async function() {
  const modal = document.getElementById('help-modal');
  const ownerView = document.getElementById('primary-owner-view');
  const assistantView = document.getElementById('assistant-only-view');

  if (!modal || !ownerView || !assistantView) return;

  modal.style.display = 'flex';
  selectedAssistantUserId = null;

  try {
    // 1. TRUY VẤN TRỰC TIẾP FIRESTORE ĐỂ LẤY QUYỀN CHÍNH XÁC CỦA USER ĐANG ĐĂNG NHẬP
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const permissions = userData.permissions || {};

    // Kiểm tra xem user này có phải là Chủ thể gốc do Admin phân công hay không
    const isOwner = (permissions.isPrimaryAssignee === true);

    if (isOwner) {
      // CHỦ THỂ GỐC (Nguyễn Thị A): Hiện giao diện Nhờ người & Quản lý Thu hồi
      ownerView.style.display = 'block';
      assistantView.style.display = 'none';

      switchHelpSubTab(1);
      const searchInput = document.getElementById('help-user-search-input');
      if (searchInput) searchInput.value = '';

      await loadMasterHelpUsersList();
    } else {
      // NGƯỜI ĐƯỢC NHỜ (Nguyễn Thị Lan Hương): CHỈ Hiện giao diện Dừng hỗ trợ / Trả lại nhiệm vụ
      ownerView.style.display = 'none';
      assistantView.style.display = 'block';
    }
  } catch (error) {
    console.error("Lỗi kiểm tra quyền trợ giúp:", error);
    alert("Không thể kiểm tra quyền: " + error.message);
  }
};

// Hàm phụ: Nạp danh sách nhân sự cho Chủ thể gốc chọn
async function loadMasterHelpUsersList() {
  const container = document.getElementById('help-user-list-container');
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  if (!orgId || !container) return;

  try {
    container.innerHTML = '<i style="color: #6c757d;">Đang tải danh sách...</i>';

    const snapshot = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('role', '==', 'EMPLOYEE')
      .get();

    masterHelpUsersList = [];
    snapshot.forEach(doc => {
      const u = doc.data();
      if (u.email !== currentUserProfile.email) {
        masterHelpUsersList.push({
          id: doc.id,
          name: u.displayName || u.email,
          email: u.email
        });
      }
    });

    renderHelpUserList(masterHelpUsersList);
  } catch (error) {
    console.error("Lỗi nạp danh sách đồng nghiệp:", error);
    container.innerHTML = `<span style="color:red;">Lỗi: ${error.message}</span>`;
  }
}

// =========================================================
// HÀM DÀNH CHO NGƯỜI HỖ TRỢ: TỰ TRẢ LẠI NHIỆM VỤ / DỪNG HỖ TRỢ
// =========================================================
window.selfQuitSupport = async function() {
  const modId = currentSelectedModuleId;
  if (!modId) return alert("Chưa chọn bài toán hiện tại!");

  if (!confirm(`Bạn có chắc chắn muốn DỪNG HỖ TRỢ và trả lại bài toán [${modId}] không?`)) {
    return;
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const docSnap = await userRef.get();

    if (docSnap.exists) {
      let mods = (docSnap.data().permissions && docSnap.data().permissions.assignedModules) || [];
      
      // Bỏ bài toán này khỏi mảng nhiệm vụ của bản thân
      mods = mods.filter(m => m !== modId);

      await userRef.update({
        "permissions.assignedModules": mods
      });

      // Cập nhật lại bộ nhớ local của hồ sơ hiện tại
      currentUserProfile.permissions.assignedModules = mods;

      alert(`Bạn đã dừng hỗ trợ bài toán [${modId}] thành công!`);
      closeHelpModal();

      // Cập nhật lại thanh chọn Nhiệm vụ
      setupEmployeeModuleSelector();
    }
  } catch (error) {
    console.error("Lỗi dừng hỗ trợ:", error);
    alert("Không thể dừng hỗ trợ: " + error.message);
  }
};


// 2. ĐÓNG MODAL
window.closeHelpModal = function() {
  const modal = document.getElementById('help-modal');
  if (modal) modal.style.display = 'none';
};

// 3. HIỂN THỊ DANH SÁCH ĐỒNG ĐỘI TRONG MODAL
function renderHelpUserList(usersList) {
  const container = document.getElementById('help-user-list-container');
  if (!container) return;

  if (usersList.length === 0) {
    container.innerHTML = '<div style="padding: 8px; color: #6c757d;">Không tìm thấy đồng nghiệp phù hợp.</div>';
    return;
  }

  let html = '';
  usersList.forEach(u => {
    html += `
      <div onclick="selectHelpUser('${u.id}', this)" 
           class="help-user-item" 
           style="padding: 8px 10px; cursor: pointer; border-bottom: 1px solid #f1f1f1; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="color: #212529;">${u.name}</b>
          <br><small style="color: #6c757d;">${u.email}</small>
        </div>
        <i class="fa-solid fa-circle-check check-icon" style="color: #198754; display: none;"></i>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 4. CHỌN 1 ĐỒNG ĐỘI TRONG DANH SÁCH
window.selectHelpUser = function(userId, element) {
  selectedAssistantUserId = userId;

  // Bỏ highlight các phần tử khác
  document.querySelectorAll('.help-user-item').forEach(el => {
    el.style.backgroundColor = 'transparent';
    const icon = el.querySelector('.check-icon');
    if (icon) icon.style.display = 'none';
  });

  // Highlight phần tử được chọn
  element.style.backgroundColor = '#e7f1ff';
  const icon = element.querySelector('.check-icon');
  if (icon) icon.style.display = 'inline-block';
};

// 5. LỌC DANH SÁCH KHI GÕ VÀO Ô TÌM KIẾM
window.filterHelpUserList = function() {
  const searchInput = document.getElementById('help-user-search-input');
  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = masterHelpUsersList.filter(u => {
    return u.name.toLowerCase().includes(keyword) || u.email.toLowerCase().includes(keyword);
  });

  renderHelpUserList(filtered);
};

// 6. GỬI YÊU CẦU TRỢ GIÚP (CẤP QUYỀN TRỰC TIẾP)
window.confirmSendHelpRequest = async function() {
  if (!selectedAssistantUserId) {
    return alert("Vui lòng chọn 1 đồng nghiệp / học sinh để gửi yêu cầu hỗ trợ!");
  }

  const modId = currentSelectedModuleId;
  if (!modId) {
    return alert("Bạn chưa chọn Bài toán nhập liệu hiện tại!");
  }

  try {
    const userRef = db.collection('users').doc(selectedAssistantUserId);
    const docSnap = await userRef.get();

    if (docSnap.exists) {
      const userData = docSnap.data();
      let mods = (userData.permissions && userData.permissions.assignedModules) || [];
      const currentIsPrimary = (userData.permissions && userData.permissions.isPrimaryAssignee === true);

      // TÍNH THỜI GIAN HẾT HẠN (10 PHÚT TÍNH TỪ HIỆN TẠI)
      const tenMinutesInMs = 10 * 60 * 1000;
      const expireTime = Date.now() + tenMinutesInMs;

      if (!mods.includes(modId)) {
        mods.push(modId);
      }

      // CẬP NHẬT THỜI GIAN HẾT HẠN TRỢ GIÚP
      await userRef.update({
        "permissions.assignedModules": mods,
        "permissions.isPrimaryAssignee": currentIsPrimary,
        "permissions.supportExpiresAt": expireTime // Lưu mốc hết hạn
      });

      alert(`Đã cấp quyền hỗ trợ 10 PHÚT thành công cho tài khoản được chọn!`);
      closeHelpModal();
    }
  } catch (error) {
    alert("Lỗi khi gửi yêu cầu hỗ trợ: " + error.message);
  }
};

// =========================================================
// BỔ SUNG CHỨC NĂNG THU HỒI TRỢ GIÚP (KẾT THÚC HỖ TRỢ)
// =========================================================

// 1. CHUYỂN DỔI TAB TRONG MODAL FAB
window.switchHelpSubTab = function(tabIdx) {
  document.getElementById('help-sub-tab-1').style.display = (tabIdx === 1) ? 'block' : 'none';
  document.getElementById('help-sub-tab-2').style.display = (tabIdx === 2) ? 'block' : 'none';

  const btn1 = document.getElementById('btn-help-tab-1');
  const btn2 = document.getElementById('btn-help-tab-2');

  if (tabIdx === 1) {
    btn1.style.borderBottom = '3px solid #0d6efd'; btn1.style.color = '#0d6efd';
    btn2.style.borderBottom = 'none'; btn2.style.color = '#6c757d';
  } else {
    btn2.style.borderBottom = '3px solid #dc3545'; btn2.style.color = '#dc3545';
    btn1.style.borderBottom = 'none'; btn1.style.color = '#6c757d';
    loadActiveAssistantsList(); // Nạp danh sách những người đang có quyền bài toán này
  }
};


// =========================================================
// CHỈNH SỬA LOGIC KIỂM TRA QUYỀN THU HỒI
// =========================================================

// 1. NẠP DANH SÁCH VÀ CHỈ HỆN NÚT THU HỒI VỚI ĐỒNG ĐỘI
async function loadActiveAssistantsList() {
  const container = document.getElementById('active-assistants-container');
  if (!container) return;

  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  const modId = currentSelectedModuleId;

  if (!orgId || !modId) return;

  try {
    container.innerHTML = '<i style="color: #6c757d;">Đang tải danh sách...</i>';

    const snapshot = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('role', '==', 'EMPLOYEE')
      .get();

    let count = 0;
    let html = '';

    snapshot.forEach(doc => {
      const u = doc.data();
      const assignedMods = (u.permissions && u.permissions.assignedModules) || [];
      const isTargetPrimaryOwner = (u.permissions && u.permissions.isPrimaryAssignee === true);

      // CHỈ HIỂN THỊ NÚT THU HỒI NẾU:
      // 1. Không phải là bản thân người đang đăng nhập
      // 2. Tài khoản đó đang được gán bài toán này
      // 3. Tài khoản đó KHÔNG PHẢI LÀ CHỦ THỂ GỐC (isTargetPrimaryOwner !== true)
      if (u.email !== currentUserProfile.email && assignedMods.includes(modId) && !isTargetPrimaryOwner) {
        count++;
        html += `
          <div style="padding: 8px 10px; border-bottom: 1px solid #dee2e6; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <b>${u.displayName || u.email}</b>
              <br><small style="color: #6c757d;">${u.email}</small>
            </div>
            <button type="button" 
                    onclick="revokeHelpPermission('${doc.id}', '${u.displayName || u.email}')" 
                    style="color: red; border: 1px solid red; background: white; border-radius: 4px; cursor: pointer; padding: 4px 8px; font-weight: bold; font-size: 0.85em;">
              <i class="fa-solid fa-handshake-slash"></i> Thu hồi
            </button>
          </div>
        `;
      }
    });

    if (count === 0) {
      container.innerHTML = '<div style="padding: 10px; color: #6c757d; text-align: center;">Hiện không có người hỗ trợ nào khác để thu hồi.</div>';
    } else {
      container.innerHTML = html;
    }

  } catch (error) {
    console.error("Lỗi nạp danh sách hỗ trợ:", error);
    container.innerHTML = `<span style="color:red;">Lỗi: ${error.message}</span>`;
  }
}

// 2. CHẶN KHÔNG CHO THU HỒI NẾU TÀI KHOẢN ĐÓ LÀ CHỦ THỂ DO ADMIN PHÂN CÔNG
window.revokeHelpPermission = async function(userId, userName) {
  const modId = currentSelectedModuleId;

  try {
    // Kiểm tra thông tin tài khoản bị bấm thu hồi
    const targetUserRef = db.collection('users').doc(userId);
    const targetDoc = await targetUserRef.get();

    if (targetDoc.exists) {
      const targetData = targetDoc.data();
      
      // MẸO CHECK CHÍNH CHỦ: Nếu tài khoản này do Admin khởi tạo chính thức (ví dụ có flag owner/originalTask)
      // Hoặc kiểm tra nếu tài khoản bị bấm xóa chính là người đã giao quyền cho mình -> Chặn lại
      if (targetData.permissions && targetData.permissions.isPrimaryAssignee) {
        return alert(`KHÔNG THỂ THU HỒI: [${userName}] là Người phụ trách chính do Admin phân công!`);
      }

      if (!confirm(`Bạn có chắc muốn KẾT THÚC nhờ hỗ trợ và thu hồi quyền bài toán [${modId}] khỏi [${userName}] không?`)) {
        return;
      }

      let mods = (targetData.permissions && targetData.permissions.assignedModules) || [];
      mods = mods.filter(m => m !== modId);

      await targetUserRef.update({
        "permissions.assignedModules": mods
      });

      alert(`Đã thu hồi quyền hỗ trợ của [${userName}] thành công!`);
      await loadActiveAssistantsList();
    }
  } catch (error) {
    alert("Lỗi khi thu hồi: " + error.message);
  }
};

// =========================================================
// BỘ ĐẾM NGƯỢC 10 PHÚT VÀ TỰ ĐỘNG LOGOUT CHO HỌC SINH HỖ TRỢ
// =========================================================

let supportTimerInterval = null;
let hasWarned30s = false;

function startSupportCountdownTimer(expiresAt) {
  if (supportTimerInterval) clearInterval(supportTimerInterval);
  hasWarned30s = false;

  // Tạo thanh / thông báo đếm ngược góc trên màn hình
  let timerBadge = document.getElementById('support-timer-badge');
  if (!timerBadge) {
    timerBadge = document.createElement('div');
    timerBadge.id = 'support-timer-badge';
    timerBadge.style.cssText = "position: fixed; top: 15px; right: 200px; background: #ffc107; color: #000; padding: 6px 12px; border-radius: 20px; font-weight: bold; z-index: 9999; box-shadow: 0 2px 6px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 6px; font-size: 0.9em;";
    document.body.appendChild(timerBadge);
  }

  supportTimerInterval = setInterval(() => {
    const now = Date.now();
    const remainingMs = expiresAt - now;
    const remainingSec = Math.floor(remainingMs / 1000);

    // 1. CẢNH BÁO TRƯỚC 30 GIÂY
    if (remainingSec <= 30 && remainingSec > 0 && !hasWarned30s) {
      hasWarned30s = true;
      timerBadge.style.background = '#dc3545';
      timerBadge.style.color = '#fff';
      alert("⚠️ CẢNH BÁO: Thời gian hỗ trợ nhập liệu chỉ còn 30 GIÂY! Hệ thống sẽ tự động Đăng xuất khi hết giờ.");
    }

    // 2. HẾT HẠN 10 PHÚT -> TỰ ĐỘNG BỎ QUYỀN VÀ DĂNG XUẤT
    if (remainingMs <= 0) {
      clearInterval(supportTimerInterval);
      if (timerBadge) timerBadge.remove();

      alert("⏰ HẾT GIỜ: Đã hết 10 phút hỗ trợ nhập liệu. Hệ thống sẽ tự động Đăng xuất!");
      
      // Đăng xuất người dùng
      auth.signOut();
      return;
    }

    // HIỂN THỊ THỜI GIAN ĐẾM NGƯỢC
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    timerBadge.innerHTML = `<i class="fa-solid fa-clock"></i> Thời gian hỗ trợ: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  }, 1000);
}

// TỰ ĐỘNG KÍCH HOẠT ĐẾM NGƯỢC KHI USER ĐĂNG NHẬP HOẶC TẢI LẠI TRANG
auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        const p = userDoc.data().permissions || {};
        
        // Nếu không phải Chủ thể gốc và có mốc thời gian hết hạn hỗ trợ
        if (p.isPrimaryAssignee !== true && p.supportExpiresAt) {
          if (Date.now() >= p.supportExpiresAt) {
            alert("Thời gian hỗ trợ 10 phút của bạn đã hết hạn!");
            auth.signOut();
          } else {
            startSupportCountdownTimer(p.supportExpiresAt);
          }
        }
      }
    } catch (e) {
      console.error("Lỗi đếm ngược hỗ trợ:", e);
    }
  }
});


// =========================================================
// THẺ 1: QUẢN LÝ DANH XƯNG CẤU HÌNH ĐƠN VỊ
// =========================================================

// 1. Tải Danh xưng tùy chỉnh từ Firestore
async function loadCustomLabels() {
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  if (!orgId) return;

  try {
    const doc = await db.collection('organization_schemas').doc(orgId).get();
    if (doc.exists && doc.data().customLabels) {
      currentCustomLabels = doc.data().customLabels;
      
      const teacherInput = document.getElementById('label-role-teacher');
      const studentInput = document.getElementById('label-role-student');
      
      if (teacherInput) teacherInput.value = currentCustomLabels.teacherLabel || 'Giáo viên';
      if (studentInput) studentInput.value = currentCustomLabels.studentLabel || 'Học sinh';
      
      updateUIDisplayLabels();
    }
  } catch (err) {
    console.error("Lỗi tải danh xưng:", err);
  }
}

// 2. Lưu Danh xưng tùy chỉnh lên Firestore
window.saveCustomLabels = async function() {
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  const teacherVal = document.getElementById('label-role-teacher').value.trim();
  const studentVal = document.getElementById('label-role-student').value.trim();

  if (!teacherVal || !studentVal) return alert("Vui lòng nhập đầy đủ danh xưng!");

  try {
    await db.collection('organization_schemas').doc(orgId).set({
      customLabels: {
        teacherLabel: teacherVal,
        studentLabel: studentVal
      }
    }, { merge: true });

    currentCustomLabels = { teacherLabel: teacherVal, studentLabel: studentVal };
    updateUIDisplayLabels();
    alert("Đã cập nhật danh xưng thành công!");
  } catch (err) {
    alert("Lỗi lưu danh xưng: " + err.message);
  }
};

// 3. Cập nhật nhãn hiển thị trên giao diện
function updateUIDisplayLabels() {
  const selector = document.getElementById('entity-type-selector');
  if (selector && selector.options.length >= 2) {
    selector.options[0].textContent = `${currentCustomLabels.teacherLabel} (Phân nhóm theo Tổ/Đơn vị)`;
    selector.options[1].textContent = `${currentCustomLabels.studentLabel} (Phân nhóm theo Lớp/Nhóm)`;
  }
}

// 4. Nạp danh sách thực thể lên Thẻ 1 có kèm nút SỬA / XÓA thủ công
async function loadAdminEntityList() {
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  const tbody = document.getElementById('entity-table-body');
  if (!orgId || !tbody) return;

  try {
    const snapshot = await db.collection('entities').where('organizationId', '==', orgId).get();
    tbody.innerHTML = '';
    masterEntitiesList = [];

    if (snapshot.empty) { 
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#6c757d;">Chưa có dữ liệu. Vui lòng import file Excel.</td></tr>'; 
      return; 
    }

    snapshot.forEach(doc => {
      const item = doc.data();
      item.docId = doc.id;
      masterEntitiesList.push(item);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${item.entityId}</b></td>
        <td>${item.name}</td>
        <td><span style="background:#e7f1ff; color:#0d6efd; padding:2px 8px; border-radius:4px;">${item.category || '-'}</span></td>
        <td>${item.email || '-'}</td>
        <td style="text-align: center;">
          <button type="button" onclick="editEntityDoc('${doc.id}')" style="color:#0d6efd; border:1px solid #0d6efd; background:white; border-radius:4px; cursor:pointer; padding:3px 8px; font-weight:bold; margin-right:4px;">
            <i class="fa-solid fa-pen"></i> Sửa
          </button>
          <button type="button" onclick="deleteEntityDoc('${doc.id}')" style="color:red; border:1px solid red; background:white; border-radius:4px; cursor:pointer; padding:3px 8px; font-weight:bold;">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) { 
    tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Lỗi: ${error.message}</td></tr>`; 
  }
}

// 5. Hàm Chỉnh sửa thủ công thông tin 1 thực thể
window.editEntityDoc = async function(docId) {
  const item = masterEntitiesList.find(e => e.docId === docId);
  if (!item) return;

  const newName = prompt("Sửa Họ và Tên:", item.name);
  if (newName === null) return;

  const newCategory = prompt("Sửa Tổ / Lớp / Đơn vị:", item.category);
  if (newCategory === null) return;

  const newEmail = prompt("Sửa Email kê khai:", item.email || '');
  if (newEmail === null) return;

  try {
    await db.collection('entities').doc(docId).update({
      name: newName.trim(),
      category: newCategory.trim(),
      email: newEmail.trim()
    });

    alert("Cập nhật thông tin thành công!");
    await loadAdminEntityList();
  } catch (err) {
    alert("Lỗi cập nhật: " + err.message);
  }
};



// =========================================================
// THẺ 2: QUẢN LÝ PHÂN CÔNG CHUYÊN MÔN (CHỦ NHIỆM & BỘ MÔN)
// =========================================================

// 1. Tự động đổ danh sách Lớp vào Checkbox Phân công Chủ nhiệm & Bộ môn
function populateAssignmentCheckboxes() {
  const homeroomContainer = document.getElementById('homeroom-classes-checkboxes');
  const teachingContainer = document.getElementById('teaching-classes-checkboxes');
  
  if (!homeroomContainer || !teachingContainer) return;

  // Trích xuất danh sách tất cả các Lớp/Tổ từ mảng thực thể
  const categories = [...new Set(masterEntitiesList.map(item => item.category))].filter(Boolean);

  if (categories.length === 0) {
    homeroomContainer.innerHTML = '<i style="color:#6c757d;">Chưa có danh sách Lớp/Tổ trong Thẻ 1.</i>';
    teachingContainer.innerHTML = '<i style="color:#6c757d;">Chưa có danh sách Lớp/Tổ trong Thẻ 1.</i>';
    return;
  }

  let homeroomHtml = '';
  let teachingHtml = '';

  categories.forEach(cat => {
    homeroomHtml += `
      <label style="display: block; margin-bottom: 6px; cursor: pointer;">
        <input type="checkbox" class="cb-homeroom-class" value="${cat}"> Lớp/Đơn vị: <b>${cat}</b>
      </label>`;
      
    teachingHtml += `
      <label style="display: block; margin-bottom: 6px; cursor: pointer;">
        <input type="checkbox" class="cb-teaching-class" value="${cat}"> Lớp/Đơn vị: <b>${cat}</b>
      </label>`;
  });

  homeroomContainer.innerHTML = homeroomHtml;
  teachingContainer.innerHTML = teachingHtml;
}

// 2. Sự kiện thay đổi Nhân sự ở Thẻ 2: Đổ lại các lớp đã được phân công
window.onEntityMemberChange = async function() {
  const memberId = document.getElementById('select-entity-member').value;
  const member = masterEntitiesList.find(item => item.entityId === memberId);

  // Reset checkboxes
  document.querySelectorAll('.cb-homeroom-class').forEach(cb => cb.checked = false);
  document.querySelectorAll('.cb-teaching-class').forEach(cb => cb.checked = false);

  if (!member || !member.email) return;

  try {
    const orgId = currentUserProfile.organizationId;
    const userSnap = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('email', '==', member.email)
      .limit(1)
      .get();

    if (!userSnap.empty) {
      const userData = userSnap.docs[0].data();
      const permissions = userData.permissions || {};

      // Đánh dấu các Lớp Chủ nhiệm đã phân công
      const homeroomClasses = permissions.homeroomClasses || (permissions.homeroomClass ? [permissions.homeroomClass] : []);
      document.querySelectorAll('.cb-homeroom-class').forEach(cb => {
        cb.checked = homeroomClasses.includes(cb.value);
      });

      // Đánh dấu các Lớp Giảng dạy đã phân công
      const teachingClasses = permissions.teachingClasses || [];
      document.querySelectorAll('.cb-teaching-class').forEach(cb => {
        cb.checked = teachingClasses.includes(cb.value);
      });
    }
  } catch (err) {
    console.error("Lỗi tải thông tin phân công chuyên môn:", err);
  }
};

// 3. Hàm Lưu Phân công Chuyên môn Thẻ 2
window.saveTeachingAssignments = async function() {
  const memberId = document.getElementById('select-entity-member').value;
  const member = masterEntitiesList.find(item => item.entityId === memberId);

  if (!member || !member.email) {
    return alert("Vui lòng chọn Nhân sự/Giáo viên có Email hợp lệ!");
  }

  // Đọc danh sách các lớp Chủ nhiệm được tích chọn
  const selectedHomerooms = [];
  document.querySelectorAll('.cb-homeroom-class:checked').forEach(cb => selectedHomerooms.push(cb.value));

  // Đọc danh sách các lớp Bộ môn được tích chọn
  const selectedTeachings = [];
  document.querySelectorAll('.cb-teaching-class:checked').forEach(cb => selectedTeachings.push(cb.value));

  const orgId = currentUserProfile.organizationId;

  try {
    const userQuery = await db.collection('users')
      .where('organizationId', '==', orgId)
      .where('email', '==', member.email)
      .limit(1)
      .get();

    if (!userQuery.empty) {
      const docId = userQuery.docs[0].id;
      await db.collection('users').doc(docId).update({
        "permissions.homeroomClasses": selectedHomerooms,
        "permissions.teachingClasses": selectedTeachings,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Nếu chưa có tài khoản User, khởi tạo mới
      await db.collection('users').add({
        email: member.email,
        displayName: member.name,
        role: 'EMPLOYEE',
        organizationId: orgId,
        active: true,
        permissions: {
          homeroomClasses: selectedHomerooms,
          teachingClasses: selectedTeachings,
          assignedModules: []
        },
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    alert(`Đã lưu thành công phân công chuyên môn cho [${member.name}]!`);
  } catch (err) {
    alert("Lỗi khi lưu phân công: " + err.message);
  }
};

// =========================================================
// MỤC A: HÀM LƯU HÀNG LOẠT (BATCH SAVE) & CHỈ LOG KHI SỬA/XÓA
// =========================================================
window.saveAllEmployeeEntries = async function() {
  const saveMsg = document.getElementById('emp-save-msg');
  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  const modId = currentSelectedModuleId;
  
  if (!orgId || !modId) return alert("Chưa chọn bài toán nhập liệu!");

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nowStr = today.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const currentUserInfo = currentUserProfile.displayName || currentUserProfile.email;
  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};

  // Lấy tất cả các ô nhập mới và ô chỉnh sửa trên màn hình
  const newTextareas = document.querySelectorAll('textarea[class^="emp-new-field-"]');
  const editedInputs = document.querySelectorAll('input[class^="emp-log-item-"]');

  let hasDataToSave = false;
  
  // Gom nhóm dữ liệu theo từng entityId để xử lý
  const pendingEntitiesMap = {};

  // 1. Duyệt các dòng nhập mới
  newTextareas.forEach(textarea => {
    const val = textarea.value.trim();
    if (val !== '') {
      const entityId = textarea.className.replace('emp-new-field-', '');
      const fieldKey = textarea.dataset.fieldKey;

      if (!pendingEntitiesMap[entityId]) pendingEntitiesMap[entityId] = { newLogs: [], editedLogs: [] };
      
      const lines = val.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      lines.forEach(lineText => {
        let processedText = lineText;
        if (fieldsDef[fieldKey] && fieldsDef[fieldKey].dataType === 'number') {
          processedText = parseDecimalNumber(lineText);
        }

        pendingEntitiesMap[entityId].newLogs.push({
          fieldKey: fieldKey,
          logObj: {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            content: processedText,
            createdBy: currentUserInfo,
            createdEmail: currentUserProfile.email,
            time: nowStr
          }
        });
      });
      hasDataToSave = true;
    }
  });

  // 2. Duyệt các ô chỉnh sửa dữ liệu cũ
  editedInputs.forEach(input => {
    const entityId = input.className.replace('emp-log-item-', '');
    const fieldKey = input.dataset.fieldKey;
    const logId = input.dataset.logId;
    const newContent = input.value.trim();

    if (!pendingEntitiesMap[entityId]) pendingEntitiesMap[entityId] = { newLogs: [], editedLogs: [] };
    
    pendingEntitiesMap[entityId].editedLogs.push({
      fieldKey: fieldKey,
      logId: logId,
      newContent: newContent
    });
  });

  if (!hasDataToSave && Object.keys(pendingEntitiesMap).length === 0) {
    return alert("Không có thay đổi nào mới để lưu!");
  }

  try {
    if (saveMsg) {
      saveMsg.style.color = "blue";
      saveMsg.textContent = "Đang lưu hàng loạt dữ liệu...";
    }

    const batch = db.batch();
    let totalLogsAdded = 0;
    let totalAuditLogsCreated = 0;

    for (const entityId of Object.keys(pendingEntitiesMap)) {
      const recordDocId = `${orgId}_${modId}_${entityId}_${dateStr}`;
      const recordRef = db.collection('personnel').doc(recordDocId);
      const docSnap = await recordRef.get();

      let currentLogs = docSnap.exists ? (docSnap.data().logs || {}) : {};
      let currentEditCount = docSnap.exists ? (docSnap.data().editCount || 0) : 0;
      let isEntityChanged = false;

      // Xử lý nạp Log mới
      const itemData = pendingEntitiesMap[entityId];
      itemData.newLogs.forEach(item => {
        if (!currentLogs[item.fieldKey]) currentLogs[item.fieldKey] = [];
        currentLogs[item.fieldKey].push(item.logObj);
        isEntityChanged = true;
        totalLogsAdded++;
      });

      // Xử lý Sửa Log cũ (CHỈ GHI AUDIT LOG KHI SỬA THỰC SỰ)
      for (const editItem of itemData.editedLogs) {
        if (currentLogs[editItem.fieldKey]) {
          const idx = currentLogs[editItem.fieldKey].findIndex(l => l.id === editItem.logId);
          if (idx !== -1) {
            const oldContent = currentLogs[editItem.fieldKey][idx].content;
            if (oldContent !== editItem.newContent && editItem.newContent !== '') {
              // Cập nhật nội dung mới
              currentLogs[editItem.fieldKey][idx].content = editItem.newContent;
              isEntityChanged = true;
              currentEditCount++;

              // GHI AUDIT LOG CHO THAO TÁC SỬA
              const auditRef = db.collection('audit_logs').doc();
              batch.set(auditRef, {
                organizationId: orgId,
                moduleId: modId,
                personnelRecordId: recordDocId,
                entityId: entityId,
                actionType: 'EDIT', // Thao tác CHỈNH SỬA
                fieldKey: editItem.fieldKey,
                oldContent: oldContent,
                newContent: editItem.newContent,
                editedByEmail: currentUserProfile.email,
                editedByName: currentUserInfo,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
              });
              totalAuditLogsCreated++;
            }
          }
        }
      }

      if (isEntityChanged) {
        // Tìm thông tin entityName, category trong masterEntitiesList
        const entityInfo = masterEntitiesList.find(e => e.entityId === entityId) || {};

        batch.set(recordRef, {
          organizationId: orgId,
          moduleId: modId,
          entityId: entityId,
          entityName: entityInfo.name || '',
          category: entityInfo.category || '',
          recordDate: dateStr,
          logs: currentLogs,
          editCount: currentEditCount,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }

    // Thực thi Lưu hàng loạt trong 1 thao tác duy nhất
    await batch.commit();

    if (saveMsg) {
      saveMsg.style.color = "green";
      saveMsg.textContent = `Lưu thành công ${totalLogsAdded} nội dung mới lúc ${nowStr}!`;
    }

    alert(`Đã lưu dữ liệu hàng loạt thành công!`);
    await searchAndRenderTodayPersonnelRecords();

  } catch (error) {
    console.error("Lỗi lưu hàng loạt:", error);
    if (saveMsg) {
      saveMsg.style.color = "red";
      saveMsg.textContent = "Không thể lưu dữ liệu: " + error.message;
    }
  }
};


// =========================================================
// MỤC C: HIỂN THỊ AUDIT LOG GOM NHÓM THEO THỰC THỂ (GỌN GÀNG)
// =========================================================
async function loadAuditLogsTimeline() {
  const container = document.getElementById('audit-logs-timeline');
  const dateInput = document.getElementById('emp-audit-date-select');
  if (!container) return;

  const orgId = currentUserProfile ? currentUserProfile.organizationId : null;
  const modId = currentSelectedModuleId;
  if (!orgId || !modId) {
    container.innerHTML = '<p style="color:red;">Chưa chọn bài toán nhập liệu.</p>';
    return;
  }

  // Mặc định lấy ngày hôm nay nếu chưa chọn
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${y}-${m}-${d}`;
  }

  const selectedDateStr = dateInput.value;
  const fieldsDef = (currentOrgSchema && currentOrgSchema.fieldDefinitions) ? currentOrgSchema.fieldDefinitions : {};

  try {
    container.innerHTML = `<p style="color:#0d6efd;">Đang tải nhật ký biến động ngày <b>${selectedDateStr}</b>...</p>`;

    const snapshot = await db.collection('audit_logs')
      .where('organizationId', '==', orgId)
      .where('moduleId', '==', modId)
      .get();

    // GOM NHÓM LOG THEO ENTITY_ID
    const groupedLogs = {};

    snapshot.forEach(doc => {
      const log = doc.data();
      
      let logDateStr = '';
      if (log.timestamp) {
        const logDate = log.timestamp.toDate();
        const y = logDate.getFullYear();
        const m = String(logDate.getMonth() + 1).padStart(2, '0');
        const d = String(logDate.getDate()).padStart(2, '0');
        logDateStr = `${y}-${m}-${d}`;
      }

      // Chỉ lọc đúng log ngày chọn và là thao tác EDIT hoặc DELETE
      if (logDateStr === selectedDateStr && (log.actionType === 'EDIT' || log.actionType === 'DELETE')) {
        if (!groupedLogs[log.entityId]) {
          groupedLogs[log.entityId] = [];
        }
        groupedLogs[log.entityId].push(log);
      }
    });

    container.innerHTML = '';
    const entityKeys = Object.keys(groupedLogs);

    if (entityKeys.length === 0) {
      container.innerHTML = `<p style="color:#6c757d; font-style:italic;">Không có biến động (Sửa/Xóa) nào trong ngày <b>${selectedDateStr}</b>.</p>`;
      return;
    }

    // RENDER THẺ CỦA TỪNG ĐỐI TƯỢNG HỌC SINH/GIÁO VIÊN
    entityKeys.forEach(entityId => {
      const logsList = groupedLogs[entityId];
      const entityInfo = masterEntitiesList.find(e => e.entityId === entityId) || {};
      
      const cardDiv = document.createElement('div');
      cardDiv.style.cssText = "background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

      let logsHtml = `
        <div style="border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <b style="color: #0d6efd; font-size: 1.05em;">[Mã: ${entityId}] ${entityInfo.name || ''}</b>
          <span style="background: #e7f1ff; color: #0d6efd; padding: 2px 8px; border-radius: 10px; font-weight: bold; font-size: 0.85em;">${logsList.length} lượt biến động</span>
        </div>
        <ul style="margin: 0; padding-left: 18px; font-size: 0.9em;">
      `;

      logsList.forEach(log => {
        const timeStr = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '-';
        const fieldLabel = fieldsDef[log.fieldKey] ? fieldsDef[log.fieldKey].label : log.fieldKey;

        if (log.actionType === 'DELETE') {
          logsHtml += `
            <li style="margin-bottom: 6px; color: #dc3545;">
              <b>[🔴 XÓA - ${fieldLabel}]:</b> Nội dung "<i>${log.deletedContent || ''}</i>" đã bị xóa lúc <b>${timeStr}</b> bởi <b>${log.editedByName || log.editedByEmail}</b>.
            </li>`;
        } else if (log.actionType === 'EDIT') {
          logsHtml += `
            <li style="margin-bottom: 6px; color: #fd7e14;">
              <b>[🟡 CHỈNH SỬA - ${fieldLabel}]:</b> Sửa "<i>${log.oldContent}</i>" ➔ thành "<b>${log.newContent}</b>" lúc <b>${timeStr}</b> bởi <b>${log.editedByName || log.editedByEmail}</b>.
            </li>`;
        }
      });

      logsHtml += '</ul>';
      cardDiv.innerHTML = logsHtml;
      container.appendChild(cardDiv);
    });

  } catch (error) {
    console.error("Lỗi nạp nhật ký gom nhóm:", error);
    container.innerHTML = `<p style="color:red;">Lỗi: ${error.message}</p>`;
  }
}