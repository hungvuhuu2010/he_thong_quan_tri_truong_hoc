// 🌟 Biến toàn cục lưu trữ OrgId
// Khai báo chuẩn toàn cục để Console nhìn thấy được
window.currentOrgIdGlobal = null;
window.currentUserRoleGlobal = null; // hoặc currentUserRoleGlobal = null;
window.currentAcademicYearsGlobal = [];
window.currentModuleIdGlobal = null; 
window.currentUserEmailGlobal = null;
window.currentUserNameGlobal = null;
window.currentTeacherHomerooms = [];
window.currentTeacherDepartments = [];
window.cachedUsersMap = {};

// ==========================================
// 0. THỜI GIAN VIỆT Nam
// ==========================================

// Hàm lấy thời điểm hiện tại chuẩn giờ Việt Nam (GMT+7)
function getVietnamTimestamp() {
  const now = new Date();
  // Chuyển sang giờ Việt Nam (GMT+7)
  // Hoặc đơn giản dùng đối tượng Date của trình duyệt (vì máy tính/điện thoại người dùng ở VN đã là GMT+7)
  return firebase.firestore.Timestamp.fromDate(now);
}

function formatToVietnamTime(firestoreTimestamp) {
  if (!firestoreTimestamp) return "";
  const date = firestoreTimestamp.toDate(); // Chuyển Firebase Timestamp về Date object của JS
  
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// ==========================================
// 1. KHỞI TẠO & LẮNG NGHE TRẠNG THÁI XÁC THỰC (AUTH STATE)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // Lắng nghe sự kiện submit form đăng nhập từ index.html
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // Lắng nghe nút đăng xuất
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", handleLogout);
  }

  // Lắng nghe form tạo trường/đơn vị mới từ System Owner
  const formCreateOrg = document.getElementById("form-create-org");
  if (formCreateOrg) {
    formCreateOrg.addEventListener("submit", handleCreateOrganization);
  }

  // Lắng nghe form tạo tài khoản Admin cấp trường
  const formCreateAdmin = document.getElementById("form-create-admin");
  if (formCreateAdmin) {
    formCreateAdmin.addEventListener("submit", handleCreateSchoolAdmin);
  }

  // 🌟 Lắng nghe form đổi mật khẩu cá nhân
  const formChangePass = document.getElementById("form-change-password");
  if (formChangePass) {
    formChangePass.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const oldPass = document.getElementById("old-password").value;
      const newPass = document.getElementById("new-password").value;
      const confirmPass = document.getElementById("confirm-password").value;

      if (newPass !== confirmPass) {
        alert("Mật khẩu xác nhận mới không khớp!");
        return;
      }

      const user = firebase.auth().currentUser;
      if (!user || !user.email) {
        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        return;
      }

      try {
        // 1. Xác thực lại người dùng bằng mật khẩu hiện tại (tránh lỗi sensitive operation)
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPass);
        await user.reauthenticateWithCredential(credential);

        // 2. Cập nhật mật khẩu mới lên Firebase Authentication
        await user.updatePassword(newPass);

        // 3. Cập nhật trạng thái trong Firestore (tắt cờ bắt buộc đổi mật khẩu nếu có)
        if (typeof currentOrgIdGlobal !== 'undefined' && currentOrgIdGlobal) {
          const db = firebase.firestore();
          const staffQuery = await db.collection("organizations").doc(currentOrgIdGlobal).collection("users")
            .where("email", "==", user.email).get();
            
          if (!staffQuery.empty) {
            await staffQuery.docs[0].ref.update({ mustChangePassword: false });
          }
        }

        alert("Đổi mật khẩu thành công!");
        closeChangePasswordModal();
        formChangePass.reset();

      } catch (error) {
        console.error("Lỗi đổi mật khẩu:", error);
        if (error.code === 'auth/wrong-password') {
          alert("Mật khẩu hiện tại không đúng. Vui lòng kiểm tra lại.");
        } else {
          alert("Lỗi: " + error.message);
        }
      }
    });
  }

  // Theo dõi trạng thái đăng nhập Firebase Auth
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      // Người dùng đã đăng nhập, tiến hành nhận diện vai trò
      await resolveUserRoleAndDashboard(user);
    } else {
      // Chưa đăng nhập, hiển thị màn hình đăng nhập
      document.getElementById("login-screen").style.display = "block";
      document.getElementById("app-screen").style.display = "none";
    }
  });
});

// ==========================================
// 2. XỬ LÝ ĐĂNG NHẬP & PHÂN QUYỀN
// ==========================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorElement = document.getElementById("login-error");
  errorElement.textContent = "";

  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    // Trạng thái thành công sẽ được bắt tự động bởi onAuthStateChanged
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    switch (error.code) {
      case "auth/invalid-email":
        errorElement.textContent = "Địa chỉ email không hợp lệ.";
        break;
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        errorElement.textContent = "Email hoặc mật khẩu không chính xác.";
        break;
      default:
        errorElement.textContent = "Lỗi đăng nhập: " + error.message;
        break;
    }
  }
}

	// Xử lý đăng xuất
	async function handleLogout() {
	  try {
		// 1. Thực hiện đăng xuất khỏi Firebase Auth
		await firebase.auth().signOut();

		// 2. Chủ động ẩn ngay lập tức các panel để tránh bị giật giao diện trong lúc chờ onAuthStateChanged
		const loginScreen = document.getElementById("login-screen");
		const appScreen = document.getElementById("app-screen");
		const ownerPanel = document.getElementById("owner-panel");
		const adminPanel = document.getElementById("admin-panel");
		const employeePanel = document.getElementById("employee-panel");

		if (loginScreen) loginScreen.style.display = "block";
		if (appScreen) appScreen.style.display = "none";
		if (ownerPanel) ownerPanel.style.display = "none";
		if (adminPanel) adminPanel.style.display = "none";
		if (employeePanel) employeePanel.style.display = "none";

		// Đóng các modal nếu đang mở
		const changePassModal = document.getElementById("change-password-modal");
		if (changePassModal) changePassModal.style.display = "none";

		// 🌟 3. RESET / XÓA TRẮNG DỮ LIỆU ĐỘNG TRONG PHÂN HỆ NHÂN VIÊN & ADMIN
		// Xóa trắng bảng nhập liệu Thẻ 1
		const empTableBody = document.getElementById("emp-entry-table-body");
		if (empTableBody) {
			empTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #6c757d;">Đang tải danh sách thực thể...</td></tr>';
		}

		// Xóa trắng ô tìm kiếm và thông báo
		const searchInput = document.getElementById("emp-live-search-input");
		if (searchInput) searchInput.value = "";
		
		const saveMsg = document.getElementById("emp-save-msg");
		if (saveMsg) saveMsg.textContent = "";

		// Xóa trắng các dropdown chọn năm học và module của nhân viên
		const empYearSelect = document.getElementById("emp-academic-year-select");
		if (empYearSelect) empYearSelect.innerHTML = "";

		const empModuleSelect = document.getElementById("emp-module-select");
		if (empModuleSelect) empModuleSelect.innerHTML = "";

		// Ẩn các nút tab động của nhân viên (Thẻ 4, Thẻ 5 nếu có)
		const btnTab4 = document.getElementById("btn-emp-tab-4");
		const btnTab5 = document.getElementById("btn-emp-tab-5");
		if (btnTab4) btnTab4.style.display = "none";
		if (btnTab5) btnTab5.style.display = "none";
		
		console.log("Đã đăng xuất thành công.");
	  } catch (error) {
		console.error("Lỗi đăng xuất:", error);
		alert("Có lỗi xảy ra khi đăng xuất. Vui lòng thử lại.");
	  }
	}

	// Hàm phân quyền và nạp giao diện tương ứng theo yêu cầu Multi-Tenant
	async function resolveUserRoleAndDashboard(user) {
		const db = firebase.firestore();
		const email = user.email ? user.email.toLowerCase().trim() : "";

		// 🌟 Gán thông tin cơ bản định danh người dùng ngay từ đầu
		window.currentUserEmailGlobal = email;
		window.currentUserUid = user.uid;

		try {
			// Bước 1: Kiểm tra System Owner
			const ownerDoc = await db.collection("users").doc(user.uid).get();
			
			if (ownerDoc.exists && ownerDoc.data().role === "OWNER") {
				window.currentOrgIdGlobal = null;
				window.currentUserRoleGlobal = "OWNER";
				window.currentAcademicYearsGlobal = [];
				window.currentUserNameGlobal = ownerDoc.data().fullName || user.email;

				setupOwnerUI(ownerDoc.data(), user);
				return;
			}

			// Bước 2: Đọc phân quyền từ collection gốc "emails"
			const emailDoc = await db.collection("emails").doc(email).get();

			if (emailDoc.exists) {
				const userData = emailDoc.data();
				
				const orgId = userData.orgId;
				const role = userData.role || "EMPLOYEE"; // "ADMIN" hoặc "EMPLOYEE"
				const academicYears = userData.academicYears || [];
				const fullName = userData.fullName || user.email;

				// 🌟 1. Gán trọn bộ biến toàn cục cốt lõi
				window.currentOrgIdGlobal = orgId;
				window.currentUserRoleGlobal = role;
				window.currentAcademicYearsGlobal = academicYears;
				window.currentUserNameGlobal = fullName;

				// Đồng thời gán vào biến cục bộ (nếu có khai báo ngoài scope)
				if (typeof currentOrgIdGlobal !== 'undefined') currentOrgIdGlobal = orgId;
				if (typeof currentUserRoleGlobal !== 'undefined') currentUserRoleGlobal = role;
				if (typeof currentAcademicYearsGlobal !== 'undefined') currentAcademicYearsGlobal = academicYears;

				// 🌟 2. Tải sẵn bản đồ `cachedUsersMap` cho toàn tổ chức để tra cứu tên/lớp cực nhanh sau này
				try {
					const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
					window.cachedUsersMap = {};
					usersSnap.forEach(uDoc => {
						const uData = uDoc.data();
						window.cachedUsersMap[uDoc.id] = {
							fullName: uData.fullName || uDoc.id,
							category: uData.category || uData.className || ""
						};
					});
				} catch (err) {
					console.warn("⚠️ Không thể cache bảng users:", err);
				}

				// 🌟 3. Nếu là Giáo viên/Nhân sự (Employee), tải trước thông tin phân công lớp chủ nhiệm
				if (role !== "ADMIN" && academicYears.length > 0) {
					const activeYearItem = academicYears[academicYears.length - 1];
					const activeYearId = String(typeof activeYearItem === 'object' && activeYearItem !== null ? (activeYearItem.id || activeYearItem.name || activeYearItem.year) : activeYearItem).trim();

					if (activeYearId) {
						try {
							const assignDoc = await db.collection("organizations")
								.doc(orgId)
								.collection("academicYears")
								.doc(activeYearId)
								.collection("assignments")
								.doc(user.uid)
								.get();

							if (assignDoc.exists) {
								const assignData = assignDoc.data();
								let hr = assignData.homeroom || assignData.homeroomClasses || [];
								if (typeof hr === 'string') {
									window.currentTeacherHomerooms = hr.split(',').map(s => s.trim()).filter(Boolean);
								} else if (Array.isArray(hr)) {
									window.currentTeacherHomerooms = hr;
								} else {
									window.currentTeacherHomerooms = [];
								}
							}
						} catch (assignErr) {
							console.warn("⚠️ Chưa có thông tin phân công lớp chủ nhiệm:", assignErr);
						}
					}
				}

				// Gọi hàm dựng giao diện Member (Admin trường hoặc Giáo viên)
				setupMemberUI(userData, orgId, user);

			} else {
				// Không tìm thấy email trong bảng tra cứu
				document.getElementById("login-error").textContent = "Tài khoản chưa được cấu hình phân quyền trong hệ thống!";
				await firebase.auth().signOut();
			}

		} catch (error) {
			console.error("Lỗi phân quyền người dùng:", error);
			document.getElementById("login-error").textContent = "Lỗi hệ thống khi kiểm tra phân quyền: " + error.message;
		}
	}

// ==========================================
// 3. THIẾT LẬP GIAO DIỆN SYSTEM OWNER	- OWNER Panel
// ==========================================



// Hàm lấy OrgId		phụ trợ lấy orgid của member
async function ensureOrgId() {
  if (currentOrgIdGlobal) return currentOrgIdGlobal; // Nếu có rồi thì dùng luôn

  const user = firebase.auth().currentUser;
  if (!user) {
    console.warn("⚠️ Chưa có user đăng nhập.");
    return null;
  }

  try {
    if (typeof getCurrentAdminOrgId === 'function') {
      currentOrgIdGlobal = await getCurrentAdminOrgId(user.uid);
      console.log("🏢 Đã tự động khởi tạo thành công currentOrgIdGlobal:", currentOrgIdGlobal);
    }
  } catch (e) {
    console.error("❌ Lỗi khi tự động lấy orgId:", e);
  }

  return currentOrgIdGlobal;
}


// 🌟 Hàm trợ giúp lấy đường dẫn năm học (Siêu an toàn cho cả admin mới)
async function getAcademicYearDocRef() {
  const user = firebase.auth().currentUser;
  if (!user) {
    console.warn("⚠️ Chưa có user đăng nhập.");
    return null;
  }

  // Nếu trong RAM chưa có orgId, tiến hành đi tìm
  if (!currentOrgIdGlobal) {
    try {
      if (typeof getCurrentAdminOrgId === 'function') {
        currentOrgIdGlobal = await getCurrentAdminOrgId(user.uid);
      }
    } catch (e) {
      console.error("Lỗi khi lấy orgId:", e);
    }
  }

  // 🛑 KIỂM TRA AN TOÀN: Nếu tài khoản mới chưa được gắn orgId -> Dừng lại êm ái, không gây lỗi treo app
  if (!currentOrgIdGlobal) {
    console.warn("⚠️ Tài khoản này chưa được cấu hình Tổ chức (OrgId) hoặc dữ liệu đang trống.");
    return null; 
  }

  const activeYear = window.currentAcademicYear || currentAcademicYear;
  if (!activeYear) {
    console.warn("⚠️ Chưa chọn năm học hiện tại.");
    return null;
  }

  // Trả về thẳng đường dẫn document năm học để các hàm sau chỉ việc .get() hoặc .set()
  return firebase.firestore()
                 .collection("organizations")
                 .doc(currentOrgIdGlobal)
                 .collection("academicYears")
                 .doc(activeYear);
}

	// 🌟 Hàm dựng giao diện riêng cho System Owner
	// 🌟 Hàm dựng giao diện riêng cho System Owner
	function setupOwnerUI(userData, authUser) {
	  const loginScreen = document.getElementById("login-screen");
	  const appScreen = document.getElementById("app-screen");
	  const ownerPanel = document.getElementById("owner-panel");
	  const adminPanel = document.getElementById("admin-panel");
	  const employeePanel = document.getElementById("employee-panel");

	  // 1. Chuyển đổi màn hình hiển thị chính
	  if (loginScreen) loginScreen.style.display = "none";
	  if (appScreen) appScreen.style.display = "block";

	  // 2. Bật panel của Owner, ẩn các panel khác
	  if (ownerPanel) ownerPanel.style.display = "block";
	  if (adminPanel) adminPanel.style.display = "none";
	  if (employeePanel) employeePanel.style.display = "none";

	  // 3. Đổ thông tin tài khoản lên thanh Header (nếu có các thẻ hiển thị này)
	  const displayNameEl = document.getElementById("user-display-name");
	  const roleEl = document.getElementById("user-role");
	  const orgEl = document.getElementById("user-org");

	  if (displayNameEl) displayNameEl.textContent = userData.fullName || authUser.email;
	  if (roleEl) roleEl.textContent = "System Owner";
	  if (orgEl) orgEl.textContent = "Hệ thống Toàn cục";
	  
	  loadOrganizationsDropdown();
	  
	}
		// Hàm tải danh sách module ngay khi Admin đăng nhập và gán sẵn window.currentModuleIdGlobal
	async function preloadAdminModules(orgId) {
		try {
			const db = firebase.firestore();
			const snapshot = await db.collection("organizations").doc(orgId).collection("modules").get();
			
			let modulesList = [];
			snapshot.forEach(doc => {
				modulesList.push({ id: doc.id, ...doc.data() });
			});

			// Lưu vào RAM cache chung
			window.cachedModulesList = modulesList;

			if (modulesList.length > 0) {
				// 🌟 GÁN SẴN BIẾN TOÀN CỤC CHO MODULE ĐẦU TIÊN
				window.currentModuleIdGlobal = modulesList[0].id;
				console.log("✅ Đã nạp module mặc định toàn cục:", window.currentModuleIdGlobal);
			} else {
				window.currentModuleIdGlobal = "";
			}
		} catch (error) {
			console.error("❌ Lỗi tải module khi đăng nhập:", error);
		}
	}
	
	
	async function setupMemberUI(userData, orgId, authUser) {
		document.getElementById("login-screen").style.display = "none";
		document.getElementById("app-screen").style.display = "block";

		// 🌟 Đồng bộ các biến toàn cục an toàn tại đây
		window.currentOrgIdGlobal = orgId;
		window.currentUserRoleGlobal = userData.role || "EMPLOYEE";
		window.currentAcademicYearsGlobal = userData.academicYears || [];
		
		currentOrgIdGlobal = orgId;
		currentUserRoleGlobal = userData.role || "EMPLOYEE";
		currentAcademicYearsGlobal = userData.academicYears || [];

		document.getElementById("user-display-name").textContent = userData.fullName || authUser.email;
		
		// Hiển thị tên vai trò trực quan theo đúng role thực tế
		let roleText = "Giáo viên / Nhân sự";
		if (userData.role === "ADMIN") {
			roleText = "Quản trị viên Trường";
		} else if (userData.role === "STUDENT") {
			roleText = "Học sinh";
		}
		document.getElementById("user-role").textContent = roleText;
		
		document.getElementById("user-org").textContent = orgId;
		document.getElementById("owner-panel").style.display = "none";
		  
		if (userData.role === "ADMIN") {
			const adminPanel = document.getElementById("admin-panel");
			if (adminPanel) adminPanel.style.display = "block";
			const employeePanel = document.getElementById("employee-panel");
			if (employeePanel) employeePanel.style.display = "none";

			// 1. Khởi tạo năm học cho Admin
			await initAcademicYears(orgId);

			// 🌟 2. Nạp ngay danh sách module và gán window.currentModuleIdGlobal
			await preloadAdminModules(orgId);

			// 3. Mặc định vào bảng ma trận (grid) khi Admin đăng nhập
			if (typeof switchAdminTab === 'function') {
				switchAdminTab('grid'); 
			}

			// 4. Khởi tạo Thẻ 5 (lúc này ô select và window.currentModuleIdGlobal đã có sẵn giá trị 100%)
			if (typeof initGridCard5 === 'function') {
				await initGridCard5();
			}

		} else {
			const adminPanel = document.getElementById("admin-panel");
			if (adminPanel) adminPanel.style.display = "none";
			const employeePanel = document.getElementById("employee-panel");
			if (employeePanel) employeePanel.style.display = "block";

			// Khởi tạo năm học cho Giáo viên / Học sinh
			if (typeof initEmployeeAcademicYears === 'function') {
				await initEmployeeAcademicYears(orgId);
			}
			// 🌟 THÊM DÒNG NÀY: Quét thu hồi quyền trợ giúp quá hạn (30 phút)
			if (typeof checkAndExpireSupporters === 'function') {
				await checkAndExpireSupporters();
			}
			
			// 🌟 Tự động kích hoạt Thẻ 1 hiển thị mặc định khi nhân viên đăng nhập
			if (typeof switchEmpTab === 'function') {
			switchEmpTab(1);
			}
		}
	}

// ==========================================
// 4. CHỨC NĂNG CỦA SYSTEM OWNER
// ==========================================

// 4.1. Tạo Trường / Đơn vị mới (Lưu vào HOME > organizations > {orgCode})
async function handleCreateOrganization(e) {
  e.preventDefault();
  const orgCode = document.getElementById("org-code").value.trim();
  const orgName = document.getElementById("org-name").value.trim();
  const orgMsg = document.getElementById("org-msg");
  orgMsg.textContent = "";

  const db = firebase.firestore();

  try {
    // Kiểm tra xem mã trường đã tồn tại chưa
    const orgRef = db.collection("organizations").doc(orgCode);
    const docSnap = await orgRef.get();

    if (docSnap.exists) {
      alert("Mã trường (ID) này đã tồn tại trong hệ thống. Vui lòng chọn mã khác!");
      return;
    }

    // Tạo document đơn vị mới
    await orgRef.set({
      code: orgCode,
      name: orgName,
      createdAt: getVietnamTimestamp()
    });

    orgMsg.textContent = `Tạo thành công đơn vị: ${orgName} (${orgCode})`;
    document.getElementById("form-create-org").reset();

    // Cập nhật lại danh sách dropdown đơn vị ngay lập tức mà không bị văng
    await loadOrganizationsDropdown();

  } catch (error) {
    console.error("Lỗi tạo đơn vị:", error);
    alert("Lỗi khi tạo đơn vị: " + error.message);
  }
}

// 4.2. Tải danh sách đơn vị vào dropdown cho form tạo Admin cấp trường
async function loadOrganizationsDropdown() {
  const selectOrg = document.getElementById("admin-org-select");
  if (!selectOrg) return;

  // Giữ lại option mặc định đầu tiên
  selectOrg.innerHTML = '<option value="">-- Chọn đơn vị --</option>';

  const db = firebase.firestore();
  try {
    const snapshot = await db.collection("organizations").orderBy("name").get();
    snapshot.forEach((doc) => {
      const orgData = doc.data();
      const option = document.createElement("option");
      option.value = doc.id; // doc.id chính là orgCode
      option.textContent = `${orgData.name} (Mã: ${doc.id})`;
      selectOrg.appendChild(option);
    });
  } catch (error) {
    console.error("Lỗi tải danh sách đơn vị:", error);
  }
}

// 4.3. Tạo tài khoản ADMIN cấp trường (Lưu vào HOME > organizations > {orgId} > users)
async function handleCreateSchoolAdmin(event) {
  event.preventDefault();

  const orgSelect = document.getElementById("admin-org-select");
  const nameInput = document.getElementById("admin-name");
  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");
  const initialYearInput = document.getElementById("admin-initial-year");

  const orgId = orgSelect ? orgSelect.value : "";
  const fullName = nameInput ? nameInput.value.trim() : "";
  const rawEmail = emailInput ? emailInput.value.trim() : "";
  const email = rawEmail.toLowerCase().trim(); // 🌟 Chuẩn hóa email chữ thường
  const password = passwordInput ? passwordInput.value.trim() : "";
  const initialYear = initialYearInput ? initialYearInput.value.trim() : "";

  if (!orgId || !fullName || !email || !password || !initialYear) {
    alert("Vui lòng điền đầy đủ tất cả các trường thông tin và năm học!");
    return;
  }

  const msgElem = document.getElementById("admin-msg");
  if (msgElem) {
    msgElem.style.color = "green";
    msgElem.textContent = "Đang tiến hành tạo tài khoản Admin và thiết lập niên khóa...";
  }

  try {
    const db = firebase.firestore();

    // 1. Tạo tài khoản trên Firebase Authentication bằng Secondary App 
    const secondaryApp = firebase.initializeApp({
      apiKey: firebase.app().options.apiKey,
      authDomain: firebase.app().options.authDomain,
      projectId: firebase.app().options.projectId
    }, "SecondaryApp");

    const secondaryAuth = firebase.auth(secondaryApp);
    const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const newAdminUid = userCredential.user.uid;

    // Đăng xuất và xóa app phụ ngay sau khi tạo xong Auth
    await secondaryAuth.signOut();
    await secondaryApp.delete();

    // 2. Lưu thông tin Admin vào sub-collection `users` của tổ chức
    await db.collection("organizations")
            .doc(orgId)
            .collection("users")
            .doc(newAdminUid)
            .set({
              fullName: fullName,
              email: email,
              role: "ADMIN",
              createdAt: getVietnamTimestamp()
            });

    // 3. 🌟 Tạo thêm bản ghi tra cứu tại collection gốc `emails` (Dùng email làm Document ID để tối ưu đăng nhập)
    await db.collection("emails")
            .doc(email)
            .set({
              orgId: orgId,
              role: "ADMIN",
              fullName: fullName,
              activated: true,
			  academicYears: [initialYear],
              createdAt: getVietnamTimestamp()
            });

    // 4. Cập nhật mảng academicYears chứa niên khóa đầu tiên vào document tổ chức
    await db.collection("organizations").doc(orgId).set({
      academicYears: [initialYear]
    }, { merge: true });

    // 5. Tạo sẵn sub-collection con tương ứng cho năm học đó
    await db.collection("organizations")
            .doc(orgId)
            .collection("academicYears")
            .doc(initialYear)
            .set({
              createdAt: getVietnamTimestamp()
            }, { merge: true });

    if (msgElem) {
      msgElem.style.color = "green";
      msgElem.textContent = `Tạo tài khoản ADMIN [${fullName}] và niên khóa [${initialYear}] thành công!`;
    }

    // Reset form
    document.getElementById("form-create-admin").reset();

  } catch (error) {
    console.error("Lỗi khi tạo tài khoản admin:", error);
    if (msgElem) {
      msgElem.style.color = "red";
      msgElem.textContent = "Lỗi: " + error.message;
    }
  }
}

	// ==========================================
	// 5. THIẾT LẬP TẠM THỜI CHO THÀNH VIÊN KHÁC (ADMIN TRƯỜNG / GIÁO VIÊN)
	// ==========================================
	async function initAcademicYears() {
	  console.log("--- [DEBUG] BẮT ĐẦU CHẠY initAcademicYears ---");

	  const select = document.getElementById("select-academic-year");
	  if (!select) {
		console.error("[DEBUG] LỖI: Không tìm thấy thẻ <select id='select-academic-year'> trên giao diện HTML!");
		return;
	  }

	  const user = firebase.auth().currentUser;
	  if (!user) {
		console.error("[DEBUG] LỖI: Chưa có user đăng nhập (firebase.auth().currentUser là null).");
		return;
	  }

	  try {
		isInitializingAcademicYears = true;

		const orgId = await getCurrentAdminOrgId(user.uid);
		console.log("[DEBUG] OrgId lấy được từ hàm getCurrentAdminOrgId:", orgId);
		
		if (!orgId) {
		  console.error("[DEBUG] LỖI: orgId trả về bị rỗng hoặc không tìm thấy!");
		  return;
		}

		const db = firebase.firestore();
		const orgDoc = await db.collection("organizations").doc(orgId).get();

		if (!orgDoc.exists) {
		  console.error("[DEBUG] LỖI: Document tổ chức không tồn tại trên Firestore với ID:", orgId);
		  return;
		}

		const orgData = orgDoc.data();
		console.log("[DEBUG] Dữ liệu document tổ chức đọc được:", orgData);

		availableAcademicYears = [];
		if (orgData.academicYears && Array.isArray(orgData.academicYears)) {
		  availableAcademicYears = orgData.academicYears;
		}
		console.log("[DEBUG] Mảng availableAcademicYears sau khi trích xuất:", availableAcademicYears);

		// Sắp xếp danh sách niên khóa
		availableAcademicYears.sort();

		// Nếu mảng vẫn rỗng, thông báo qua console
		if (availableAcademicYears.length === 0) {
		  console.warn("[DEBUG] CẢNH BÁO: Trường academicYears trên Firestore đang bị trống mảng!");
		}

		// Render ra thẻ select
		select.innerHTML = "";
		availableAcademicYears.forEach(year => {
		  const opt = document.createElement("option");
		  opt.value = year;
		  opt.textContent = `Năm học: ${year}`;
		  select.appendChild(opt);
		});

		// Khôi phục năm học từ localStorage hoặc lấy phần tử đầu tiên
		const savedYear = localStorage.getItem("currentAcademicYear");
		if (savedYear && availableAcademicYears.includes(savedYear)) {
		  currentAcademicYear = savedYear;
		} else {
		  currentAcademicYear = availableAcademicYears[0];
		}

		select.value = currentAcademicYear;
		localStorage.setItem("currentAcademicYear", currentAcademicYear);
		console.log("[DEBUG] THÀNH CÔNG: Đã gán năm học vào giao diện:", currentAcademicYear);

	  } catch (error) {
		console.error("[DEBUG] LỖI EXCEPTION TRONG initAcademicYears:", error);
		if (select) {
		  select.innerHTML = '<option value="">Lỗi tải năm học</option>';
		}
	  } finally {
		isInitializingAcademicYears = false;
	  }
	}

	//==========================================
	// Các hàm tiện ích hỗ trợ modal đổi mật khẩu
	//==========================================
	function openChangePasswordModal() {
	  const modal = document.getElementById("change-password-modal");
	  if (modal) modal.style.display = "flex";
	}

	function closeChangePasswordModal() {
	  const modal = document.getElementById("change-password-modal");
	  if (modal) modal.style.display = "none";
	}
	document.addEventListener("DOMContentLoaded", () => {
	  const formChangePass = document.getElementById("form-change-password");
	  if (formChangePass) {
		formChangePass.addEventListener("submit", async (e) => {
		  e.preventDefault();
		  
		  const newPass = document.getElementById("new-password").value;
		  const confirmPass = document.getElementById("confirm-password").value;

		  if (newPass !== confirmPass) {
			alert("Mật khẩu xác nhận không khớp!");
			return;
		  }

		  const user = firebase.auth().currentUser;
		  if (!user) {
			alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
			return;
		  }

		  try {
			// 1. Cập nhật mật khẩu trực tiếp lên Firebase Authentication
			await user.updatePassword(newPass);

			// 2. Cập nhật trạng thái trong Firestore (đã đổi mật khẩu lần đầu)
			// Giả sử bạn lưu thông tin nhân viên ở organizations/{orgId}/users/{user.uid} hoặc theo email
			if (typeof currentOrgIdGlobal !== 'undefined' && currentOrgIdGlobal) {
			  const db = firebase.firestore();
			  // Tìm document của nhân viên này để tắt cờ bắt buộc đổi mật khẩu
			  const staffQuery = await db.collection("organizations").doc(currentOrgIdGlobal).collection("users")
				.where("email", "==", user.email).get();
				
			  if (!staffQuery.empty) {
				await staffQuery.docs[0].ref.update({ mustChangePassword: false });
			  }
			}

			alert("Đổi mật khẩu thành công!");
			closeChangePasswordModal();
			
			// Reset form
			formChangePass.reset();

		  } catch (error) {
			console.error("Lỗi đổi mật khẩu:", error);
			alert("Lỗi: " + error.message + " (Lưu ý: Nếu đăng nhập đã lâu, Firebase có thể yêu cầu đăng nhập lại để xác thực).");
		  }
		});
	  }
	});

	// Hàm mở / đóng modal
	function openChangePasswordModal() {
	  const modal = document.getElementById("change-password-modal");
	  if (modal) modal.style.display = "flex";
	}

	function closeChangePasswordModal() {
	  const modal = document.getElementById("change-password-modal");
	  if (modal) modal.style.display = "none";
	}

// ==========================================
// ĐIỀU HƯỚNG 5 THẺ CHỨC NĂNG TRONG ADMIN PANEL
// ==========================================

// ==========================================
// QUẢN LÝ NIÊN KHÓA (ACADEMIC YEAR MANAGEMENT)
// ==========================================

	// Khai báo biến trạng thái toàn cục
	let currentAcademicYear = localStorage.getItem("currentAcademicYear") || "";
	let availableAcademicYears = [];
	let isInitializingAcademicYears = false; // Biến cờ chặn sự kiện onchange kích hoạt nhầm

	// 1. Hàm khởi tải danh sách năm học từ trường academicYears của document tổ chức
	// Thêm tham số `orgIdParam` để có thể nhận trực tiếp nếu được truyền vào
	async function initAcademicYears(orgIdParam) {
	  const select = document.getElementById("select-academic-year");
	  if (!select) return;

	  const user = firebase.auth().currentUser;
	  if (!user) return;

	  try {
		isInitializingAcademicYears = true;

		// Nếu truyền trực tiếp vào thì dùng luôn, nếu không thì mới đi tìm
		const orgId = orgIdParam || (await getCurrentAdminOrgId(user.uid));
		if (!orgId) return;

		const db = firebase.firestore();
		const orgDoc = await db.collection("organizations").doc(orgId).get();

		availableAcademicYears = [];
		if (orgDoc.exists && orgDoc.data().academicYears && Array.isArray(orgDoc.data().academicYears)) {
		  availableAcademicYears = orgDoc.data().academicYears;
		}

		availableAcademicYears.sort();

		if (availableAcademicYears.length === 0) {
		  availableAcademicYears = ["2026-2027"];
		  await db.collection("organizations").doc(orgId).set({
			academicYears: availableAcademicYears
		  }, { merge: true });

		  await db.collection("organizations").doc(orgId).collection("academicYears").doc("2026-2027").set({
			createdAt: getVietnamTimestamp() 
		  }, { merge: true });
		}

		select.innerHTML = "";
		availableAcademicYears.forEach(year => {
		  const opt = document.createElement("option");
		  opt.value = year;
		  opt.textContent = `Năm học: ${year}`;
		  select.appendChild(opt);
		});

		const savedYear = localStorage.getItem("currentAcademicYear");
		if (savedYear && availableAcademicYears.includes(savedYear)) {
		  currentAcademicYear = savedYear;
		} else {
		  currentAcademicYear = availableAcademicYears[0];
		}

		select.value = currentAcademicYear;
		localStorage.setItem("currentAcademicYear", currentAcademicYear);

	  } catch (error) {
		console.error("Lỗi khởi tạo năm học:", error);
		if (select) {
		  select.innerHTML = '<option value="">Lỗi tải năm học</option>';
		}
	  } finally {
		isInitializingAcademicYears = false;
	  }
	}

	// 2. Sự kiện khi Admin thay đổi lựa chọn năm học trên Dropdown
	async function onAcademicYearChange(newYear) {
	  if (isInitializingAcademicYears) return; // Chặn nếu do code tự gán
	  if (!newYear) return;
	  
	  currentAcademicYear = newYear;
	  localStorage.setItem("currentAcademicYear", currentAcademicYear);

	  // [QUAN TRỌNG]: Xóa sạch toàn bộ cache trong RAM của các Thẻ
	  isEntitiesCacheLoaded = false;
	  card2CachedMembers = [];
	  cachedSchemaFields = [];

	  alert(`Đã chuyển sang không gian làm việc năm học: ${currentAcademicYear}`);

	  // Tải lại dữ liệu của thẻ đang mở hiện tại
	  reloadActiveAdminTab();
	}

	// 3. Hộp thoại thêm năm học mới (Đồng bộ chuẩn giờ Việt Nam)
	async function promptAddNewAcademicYear() {
	  const newYearInput = prompt("Nhập tên năm học mới muốn tạo (Ví dụ: 2027-2028):");
	  if (!newYearInput) return;

	  const formattedYear = newYearInput.trim();
	  if (!formattedYear) return;

	  if (availableAcademicYears.includes(formattedYear)) {
		alert("Năm học này đã tồn tại trong danh sách!");
		return;
	  }

	  // 🌟 TẢI PHÂN CÔNG CHUẨN XÁC DỰA TRÊN ID NHÂN SỰ (VD: GV001)
			try {
				const db = firebase.firestore();
				
				let academicYearId = "";
				const yearsArr = window.currentAcademicYearsGlobal || userData.academicYears || [];
				if (Array.isArray(yearsArr) && yearsArr.length > 0) {
					const lastYearItem = yearsArr[yearsArr.length - 1];
					academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
				}

				// Lấy chính xác ID nhân sự được lưu trong document emails (VD: "GV001")
				const memberId = userData.userId || userData.memberId || "";

				console.log("🔍 Đang tìm phân công cho MemberID:", memberId, "Năm học:", academicYearId);

				if (orgId && academicYearId && memberId) {
					const assignRef = db.collection("organizations").doc(orgId).collection("academicYears").doc(academicYearId).collection("assignments");
					
					// Đọc trực tiếp bằng Document ID chính là memberId (Giống cách Admin lưu)
					const assignDoc = await assignRef.doc(memberId).get();

					let assignData = null;
					if (assignDoc.exists) {
						assignData = assignDoc.data();
						console.log("✅ Tìm thấy phân công trực tiếp theo ID:", assignData);
					} else {
						// Dự phòng: Quét xem có document nào lưu trường memberId khớp không
						const allAssigns = await assignRef.get();
						allAssigns.forEach(d => {
							const data = d.data();
							if (data.memberId === memberId || d.id === memberId) {
								assignData = data;
								console.log("✅ Tìm thấy phân công qua quét:", assignData);
							}
						});
					}

					if (assignData) {
						let rawData = assignData.homeroom || assignData.homeroomClasses || assignData.classes || [];
						let itemsList = [];

						if (typeof rawData === 'string') {
							itemsList = rawData.split(',').map(s => s.trim()).filter(Boolean);
						} else if (Array.isArray(rawData)) {
							itemsList = rawData;
						}

						let homeroomClasses = [];
						let departments = [];

						// Phân tách thông minh: Chứa số -> Lớp chủ nhiệm, Không chứa số -> Tổ chuyên môn
						itemsList.forEach(item => {
							const val = String(item).trim();
							if (/\d/.test(val)) {
								homeroomClasses.push(val);
							} else {
								departments.push(val);
							}
						});

						window.currentTeacherHomerooms = homeroomClasses;
						window.currentTeacherDepartments = departments;

						console.log("🎯 Nạp phân công thành công tuyệt đối:", {
							homerooms: window.currentTeacherHomerooms,
							departments: window.currentTeacherDepartments
						});
					} else {
						console.warn("⚠️ Không tìm thấy bản ghi assignments nào cho nhân sự này trong năm học hiện tại.");
						window.currentTeacherHomerooms = [];
						window.currentTeacherDepartments = [];
					}
				} else {
					console.warn("⚠️ Thiếu thông tin orgId, academicYearId hoặc memberId của giáo viên.");
				}
			} catch (err) {
				console.error("❌ Lỗi tải phân công:", err);
				window.currentTeacherHomerooms = [];
				window.currentTeacherDepartments = [];
			}
	}

	// 4. Hàm hỗ trợ tự động refresh lại dữ liệu theo tab đang mở
	function reloadActiveAdminTab() {
	  const sec1 = document.getElementById("admin-sec-entities");
	  const sec2 = document.getElementById("admin-sec-assignments");
	  const sec3 = document.getElementById("admin-sec-schema");

	  if (sec1 && sec1.style.display !== "none") {
		reloadAndRenderAdminEntityList(true);
	  } else if (sec2 && sec2.style.display !== "none") {
		initAdminAssignmentsTab();
	  } else if (sec3 && sec3.style.display !== "none") {
		initAdminSchemaFieldsTab();
	  }
	}
	
	// CHUỂN TAB CỦA Admin
	function switchAdminTab(tabName) {
	  // Danh sách các id của các section tương ứng trong admin-panel
	  const sections = {
		'entities': 'admin-sec-entities',
		'assignments': 'admin-sec-assignments',
		'schema': 'admin-sec-schema',
		'kpi-config': 'admin-sec-kpi-config',
		'grid': 'admin-sec-grid',
		'modules': 'admin-sec-modules' // 🌟 Thêm key modules nếu bạn có section riêng cho nó
	  };

	  // Danh sách id của các nút trên sidebar điều hướng
	  const buttons = {
		'entities': 'btn-tab-entities',
		'assignments': 'btn-tab-assignments',
		'schema': 'btn-tab-schema',
		'kpi-config': 'btn-tab-kpi-config',
		'grid': 'btn-tab-grid',
		'modules': 'btn-tab-modules' // 🌟 Thêm nút sidebar tương ứng nếu có
	  };

	  // Ẩn tất cả các section và reset style của toàn bộ nút sidebar về mặc định
	  Object.keys(sections).forEach(key => {
		const secEl = document.getElementById(sections[key]);
		const btnEl = document.getElementById(buttons[key]);
		
		if (secEl) {
		  secEl.style.display = "none";
		}
		if (btnEl) {
		  btnEl.style.backgroundColor = "transparent";
		  btnEl.style.color = "#333";
		}
	  });

	  // Hiển thị section được chọn và làm nổi bật nút tương ứng trên sidebar
	  if (sections[tabName] && buttons[tabName]) {
		const activeSec = document.getElementById(sections[tabName]);
		const activeBtn = document.getElementById(buttons[tabName]);

		if (activeSec) {
		  activeSec.style.display = "block";
		}
		if (activeBtn) {
		  activeBtn.style.backgroundColor = "#0d6efd";
		  activeBtn.style.color = "white";
		}
	  }

	  // ==========================================
	  // 🌟 GỌI HÀM NẠP DỮ LIỆU TỰ ĐỘNG KHI CHUYỂN TAB
	  // ==========================================
	  if (tabName === 'schema') {
		// Nếu chuyển sang tab schema, tự động nạp danh sách trường
		if (typeof loadSchemaFields === 'function') loadSchemaFields();			// goi truong du lieu the 3.1
		if (typeof loadModulesList === 'function') loadModulesList();			// goi bai toan the 3.2
		if (typeof initAssignmentCard3 === 'function') initAssignmentCard3();	// goi phan cong the 3.3
	  }
	  else if (tabName === 'modules') { 
		// 🌟 Nếu chuyển sang tab Bài toán Module -> Tự động nạp danh sách bài toán & danh sách checkbox trường
		if (typeof loadModulesList === 'function') loadModulesList();
		if (typeof renderModuleFieldsCheckboxes === 'function') renderModuleFieldsCheckboxes();
	  }
	  else if (tabName === 'kpi-config') {
		// 🌟 Tự động nạp Cấu hình Ma trận Ngưỡng KPI khi mở Thẻ 4
		if (typeof initMonthlyKPIConfigCard4 === 'function') {
		  initMonthlyKPIConfigCard4();
		}
	  }
	}
	
	//GIAO DIỆN	
	// 	khung chọn năm học
	async function setupMemberUI(userData, orgId, authUser) {
			document.getElementById("login-screen").style.display = "none";
			document.getElementById("app-screen").style.display = "block";

			// Hiển thị giao diện người dùng
			document.getElementById("user-display-name").textContent = userData.fullName || authUser.email;
			document.getElementById("user-role").textContent = userData.role === "ADMIN" ? "Quản trị viên Trường" : "Giáo viên / Nhân sự";
			document.getElementById("user-org").textContent = orgId;

			// 🌟 LƯU THÔNG TIN NGƯỜI ĐĂNG NHẬP VÀO BIẾN TOÀN CỤC
			window.currentOrgIdGlobal = orgId;
			window.currentUserEmailGlobal = userData.email || authUser.email;
			window.currentUserNameGlobal = userData.fullName || authUser.email;

			document.getElementById("owner-panel").style.display = "none";
			
			if (userData.role === "ADMIN") {
				const adminPanel = document.getElementById("admin-panel");
				if (adminPanel) adminPanel.style.display = "block";
				const employeePanel = document.getElementById("employee-panel");
				if (employeePanel) employeePanel.style.display = "none";

				await initAcademicYears(orgId);

				if (typeof switchAdminTab === 'function') {
					switchAdminTab('grid');
				}

			} else {
				// Giao diện Giáo viên / Nhân sự (Employee)
				const adminPanel = document.getElementById("admin-panel");
				if (adminPanel) adminPanel.style.display = "none";
				const employeePanel = document.getElementById("employee-panel");
				if (employeePanel) employeePanel.style.display = "block";
				
				// 🌟 1. TỰ ĐỘNG NẠP LỚP CHỦ NHIỆM VÀ TỔ CHUYÊN MÔN KHI EMPLOYEE ĐĂNG NHẬP
				try {
					const db = firebase.firestore();
					
					// Lấy ID năm học hiện tại (phần tử cuối cùng của mảng academicYears)
					let academicYearId = "";
					const yearsArr = window.currentAcademicYearsGlobal || userData.academicYears || [];
					if (Array.isArray(yearsArr) && yearsArr.length > 0) {
						const lastYearItem = yearsArr[yearsArr.length - 1];
						academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
					}

					// Lấy UID cá nhân đã được lưu sẵn trong document `emails` (hoặc dùng authUser.uid dự phòng)
					const teacherUid = userData.userId || userData.uid || authUser.uid;

					if (orgId && academicYearId && teacherUid) {
						const assignDoc = await db.collection("organizations")
							.doc(orgId)
							.collection("academicYears")
							.doc(academicYearId)
							.collection("assignments")
							.doc(teacherUid)
							.get();

						if (assignDoc.exists) {
							const assignData = assignDoc.data();
							
							// Lấy dữ liệu thô từ trường homeroom hoặc các trường tương đương
							let rawData = assignData.homeroom || assignData.homeroomClasses || assignData.classes || [];
							let itemsList = [];

							if (typeof rawData === 'string') {
								itemsList = rawData.split(',').map(s => s.trim()).filter(Boolean);
							} else if (Array.isArray(rawData)) {
								itemsList = rawData;
							}

							let homeroomClasses = [];
							let departments = [];

							// 🌟 Phân tách thông minh: Chứa số -> Lớp chủ nhiệm, Không chứa số -> Tổ chuyên môn
							itemsList.forEach(item => {
								const val = String(item).trim();
								if (/\d/.test(val)) {
									homeroomClasses.push(val);
								} else {
									departments.push(val);
								}
							});

							window.currentTeacherHomerooms = homeroomClasses;
							window.currentTeacherDepartments = departments;

							console.log("🎯 Đã nạp phân công thành công:", {
								homerooms: window.currentTeacherHomerooms,
								departments: window.currentTeacherDepartments
							});
						} else {
							window.currentTeacherHomerooms = [];
							window.currentTeacherDepartments = [];
						}
					}
				} catch (err) {
					console.warn("⚠️ Không thể tải thông tin phân công của giáo viên:", err);
					window.currentTeacherHomerooms = [];
					window.currentTeacherDepartments = [];
				}

				// 2. Tiếp tục khởi tạo các năm học và module của nhân sự
				if (typeof initEmployeeAcademicYears === 'function') {
					await initEmployeeAcademicYears(orgId);
				}
			}
		}
//=======================
//  ADMIN Panel
//=======================
	// ==========================================
	// THẺ 1: QUẢN LÝ DANH MỤC ĐỐI TƯỢNG & DANH XƯNG
	// ==========================================

	// Biến lưu trữ tạm danh sách thực thể đang hiển thị trên bảng
	let currentLoadedEntities = [];

	// 1. Tự động nạp dữ liệu Thẻ 1 khi Admin đăng nhập hoặc mở tab entities
	async function initAdminEntitiesTab() {
	  await loadCustomLabelsConfig();
	  await reloadAndRenderAdminEntityList();
	}
	
	// 1.1 Lưu hoặc Cập nhật cấu hình Danh xưng chủ thể - khách thể (Lưu tại document của đơn vị)
	async function saveCustomLabels() {
	  const user = firebase.auth().currentUser;
	  if (!user) return;

	  const teacherLabel = document.getElementById("label-role-teacher").value.trim() || "Giáo viên";
	  const studentLabel = document.getElementById("label-role-student").value.trim() || "Giáo viên"; // Hoặc tùy chỉnh theo ý muốn

	  try {
		const orgId = await getCurrentAdminOrgId(user.uid);
		if (!orgId) return;

		const db = firebase.firestore();
		await db.collection("organizations").doc(orgId).set({
		  labels: {
			teacher: teacherLabel,
			student: studentLabel
		  }
		}, { merge: true });

		// Cập nhật ngay lập tức giao diện select dropdown mà không cần F5
		updateEntitySelectorOptions(teacherLabel, studentLabel);

		alert("Đã lưu cấu hình danh xưng thành công!");
	  } catch (error) {
		console.error("Lỗi lưu danh xưng:", error);
		alert("Lỗi khi lưu danh xưng: " + error.message);
	  }
	}
	
	// Tải cấu hình danh xưng đã lưu của đơn vị lên giao diện
		async function loadCustomLabelsConfig() {
	  const user = firebase.auth().currentUser;
	  if (!user) return;

	  try {
		const orgId = await getCurrentAdminOrgId(user.uid);
		if (!orgId) return;

		const db = firebase.firestore();
		const orgDoc = await db.collection("organizations").doc(orgId).get();
		
		let teacherLabel = "Giáo viên";
		let studentLabel = "Học sinh";

		if (orgDoc.exists && orgDoc.data().labels) {
		  const labels = orgDoc.data().labels;
		  if (labels.teacher) teacherLabel = labels.teacher;
		  if (labels.student) studentLabel = labels.student;
		}

		// Đưa giá trị vào ô input cấu hình
		document.getElementById("label-role-teacher").value = teacherLabel;
		document.getElementById("label-role-student").value = studentLabel;

		// Cập nhật ngay văn bản hiển thị trong khung chọn loại đối tượng (Thẻ 1.2)
		updateEntitySelectorOptions(teacherLabel, studentLabel);

	  } catch (error) {
		console.error("Lỗi tải danh xưng:", error);
	  }
	}
	
	// Hàm cập nhật chữ hiển thị cho select chọn loại đối tượng dựa theo danh xưng tùy chỉnh
	function updateEntitySelectorOptions(teacherLabel, studentLabel) {
	  const select = document.getElementById("entity-type-selector");
	  if (!select) return;

	  // Cập nhật option thứ nhất (Chủ thể)
	  if (select.options[0]) {
		select.options[0].text = `${teacherLabel} (Phân nhóm theo Tổ/Đơn vị)`;
	  }
	  // Cập nhật option thứ hai (Khách thể)
	  if (select.options[1]) {
		select.options[1].text = `${studentLabel} (Phân nhóm theo Lớp/Nhóm)`;
	  }
	}

	// Lấy orgId của Admin đang đăng nhập
	async function getCurrentAdminOrgId(uid) {
	  const db = firebase.firestore();
	  const orgsSnap = await db.collection("organizations").get();
	  for (let doc of orgsSnap.docs) {
		const userDoc = await db.collection("organizations").doc(doc.id).collection("users").doc(uid).get();
		if (userDoc.exists) {
		  return doc.id;
		}
	  }
	  return null;
	}
	
	// ==========================================
	// 1.2 IMPORT & QUẢN LÝ DANH SÁCH THỰC THỂ
	// ==========================================

	// Tải mẫu Excel động dựa trên loại đối tượng đang chọn (Giáo viên / Học sinh)
	function downloadDynamicExcelTemplate() {
	  const entityType = document.getElementById("entity-type-selector").value;
	  let templateData = [];

	  if (entityType === "TEACHER") {
		templateData = [
		  { "Mã Định Danh": "GV001", "Họ và Tên": "Nguyễn Văn A", "Tổ / Lớp / Đơn vị": "Toán", "Email": "nguyenvana@truong.edu.vn" },
		  { "Mã Định Danh": "GV002", "Họ và Tên": "Trần Thị B", "Tổ / Lớp / Đơn vị": "Văn", "Email": "tranthib@truong.edu.vn" }
		];
	  } else {
		templateData = [
		  { "Mã Định Danh": "HS1001", "Họ và Tên": "Lê Văn C", "Tổ / Lớp / Đơn vị": "10A1", "Email": "levanc@truong.edu.vn" },
		  { "Mã Định Danh": "HS1002", "Họ và Tên": "Phạm Thị D", "Tổ / Lớp / Đơn vị": "10A1", "Email": "phamthid@truong.edu.vn" }
		];
	  }

	  const worksheet = XLSX.utils.json_to_sheet(templateData);
	  const workbook = XLSX.utils.book_new();
	  XLSX.utils.book_append_sheet(workbook, worksheet, "DanhSach");
	  XLSX.writeFile(workbook, `Mau_Import_${entityType}.xlsx`);
	}
	
	// Xử lý Import file Excel vào sub-collection users của đơn vị
	
	async function uploadEntityExcel() {
		const fileInput = document.getElementById("excel-file-input");
		const entityTypeElem = document.getElementById("entity-type-selector");

		if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
			alert("Vui lòng chọn một tệp Excel để import!");
			return;
		}

		if (!entityTypeElem) {
			alert("Không tìm thấy bộ chọn loại thực thể (entity-type-selector)!");
			return;
		}

		const entityType = entityTypeElem.value; // "TEACHER" hoặc "STUDENT"
		const orgId = window.currentOrgIdGlobal;

		if (!orgId) {
			alert("Không tìm thấy thông tin tổ chức! Vui lòng tải lại trang.");
			return;
		}

		// 🌟 Lấy năm học: Ưu tiên dropdown, nếu không có thì lấy phần tử cuối của mảng window.currentAcademicYearsGlobal
		const academicYearSelect = document.getElementById("emp-academic-year-select");
		let academicYearId = "";

		if (academicYearSelect && academicYearSelect.value) {
			academicYearId = String(academicYearSelect.value).trim();
		} else if (Array.isArray(window.currentAcademicYearsGlobal) && window.currentAcademicYearsGlobal.length > 0) {
			const lastYearItem = window.currentAcademicYearsGlobal[window.currentAcademicYearsGlobal.length - 1];
			if (typeof lastYearItem === 'object' && lastYearItem !== null) {
				academicYearId = String(lastYearItem.id || lastYearItem.name || lastYearItem.year || "").trim();
			} else {
				academicYearId = String(lastYearItem).trim();
			}
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			alert("Không xác định được năm học hiện tại! Vui lòng chọn năm học trước khi import.");
			return;
		}

		const file = fileInput.files[0];
		const reader = new FileReader();

		reader.onload = async function (e) {
			try {
				const data = new Uint8Array(e.target.result);
				const workbook = XLSX.read(data, { type: "array" });
				const firstSheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[firstSheetName];
				const rows = XLSX.utils.sheet_to_json(worksheet);

				if (rows.length === 0) {
					alert("Tệp Excel không có dữ liệu!");
					return;
				}

				// Hàm hỗ trợ tìm kiếm tên cột trong Excel không phân biệt hoa/thường hay khoảng trắng
				const getRowValue = (row, possibleKeys) => {
					for (let excelKey of Object.keys(row)) {
						const cleanExcelKey = excelKey.trim().toLowerCase();
						for (let pk of possibleKeys) {
							if (cleanExcelKey === pk.toLowerCase()) {
								return String(row[excelKey] || "").trim();
							}
						}
					}
					return "";
				};

				const db = firebase.firestore();
				let countSuccess = 0;

				for (let row of rows) {
					const code = getRowValue(row, ["Mã Định Danh", "Ma", "ID", "Mã", "Mã HS", "Mã GV"]);
					const name = getRowValue(row, ["Họ và Tên", "HoTen", "Ten", "Họ tên", "Tên đầy đủ"]);
					const rawCategory = getRowValue(row, ["Tổ / Lớp / Đơn vị", "ToLop", "DonVi", "Tổ", "Lớp", "Đơn vị", "Phòng ban"]);
					
					// Ép kiểu an toàn category thành chuỗi string
					const category = String(rawCategory || "").trim();
					const email = getRowValue(row, ["Email", "Thư điện tử", "Mail"]);

					if (code && name) {
						// 1. Lưu nhân sự/học sinh vào collection users
						await db.collection("organizations").doc(orgId).collection("users").doc(code).set({
							uid: code,
							fullName: name,
							category: category,
							email: email,
							role: entityType, // "TEACHER" hoặc "STUDENT"
							activated: false,
							orgId: orgId,
							updatedAt: getVietnamTimestamp()
						}, { merge: true });

						// 2. Lưu danh mục Tổ / Lớp vào collection `categories` theo đúng năm học cuối mảng
						if (category) {
							const categoryDocRef = db.collection("organizations")
								.doc(orgId)
								.collection("academicYears")
								.doc(academicYearId)
								.collection("categories")
								.doc(category);

							await categoryDocRef.set({
								name: category,
								type: entityType, // "TEACHER" hoặc "STUDENT"
								updatedAt: getVietnamTimestamp()
							}, { merge: true });
						}

						countSuccess++;
					}
				}

				if (countSuccess === 0) {
					alert("Không tìm thấy dữ liệu hợp lệ! Vui lòng kiểm tra lại tên cột trong file Excel (Cần có cột chứa Mã và Tên).");
				} else {
					alert(`Import thành công ${countSuccess} bản ghi và cập nhật danh mục Tổ/Lớp vào năm học [${academicYearId}]!`);
					fileInput.value = "";
					
					// Làm mới cache và render lại bảng
					window.isEntitiesCacheLoaded = false;
					if (typeof reloadAndRenderAdminEntityList === 'function') {
						await reloadAndRenderAdminEntityList(true);
					}
				}

			} catch (error) {
				console.error("Lỗi đọc file Excel:", error);
				alert("Lỗi khi xử lý file Excel: " + error.message);
			}
		};

		reader.readAsArrayBuffer(file);
	}

		// Ví dụ hàm đọc danh mục Lớp/Tổ từ collection categories thay vì quét toàn bộ users
	async function fetchCategoriesFromFirestore(orgId, academicYearId) {
		const db = firebase.firestore();
		const categoriesSnap = await db.collection("organizations")
			.doc(orgId)
			.collection("academicYears")
			.doc(academicYearId)
			.collection("categories")
			.get();

		let homeroomOptions = [];
		let teachingOptions = [];

		categoriesSnap.forEach(doc => {
			const data = doc.data();
			const name = data.name;
			const type = data.type; // "TEACHER" hoặc "STUDENT"

			// Phân loại dựa theo type lúc import Excel
			if (type === "STUDENT") {
				homeroomOptions.push(name);
				teachingOptions.push(name);
			} else if (type === "TEACHER") {
				homeroomOptions.push(name); // Hoặc lưu ý tùy logic ma trận của bạn
			}
		});

		return { homeroomOptions, teachingOptions };
	}
	// Biến cờ đánh dấu trạng thái cache của Thẻ 1
	let isEntitiesCacheLoaded = false;

	// Nạp danh sách thực thể (Đã tối ưu dùng Cache, có tham số forceRefresh để ép tải mới)
	async function reloadAndRenderAdminEntityList(forceRefresh = false) {
		const tbody = document.getElementById("entity-table-body");
		if (!tbody) return;

		// 1. NẾU ĐÃ CÓ CACHE VÀ KHÔNG ÉP LÀM MỚI -> Dùng luôn dữ liệu trong RAM (Tiết kiệm băng thông)
		if (!forceRefresh && window.isEntitiesCacheLoaded && Array.isArray(window.currentLoadedEntities) && window.currentLoadedEntities.length > 0) {
			renderEntityTableRows(window.currentLoadedEntities);
			return;
		}

		tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6c757d;">Đang tải dữ liệu từ máy chủ...</td></tr>';

		try {
			// Lấy trực tiếp orgId từ biến toàn cục
			const orgId = window.currentOrgIdGlobal;
			if (!orgId) {
				tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Không tìm thấy thông tin tổ chức!</td></tr>';
				return;
			}

			const db = firebase.firestore();
			// Truy vấn trực tiếp theo cấu trúc: organizations/{orgId}/users
			const snapshot = await db.collection("organizations").doc(orgId).collection("users").get();

			window.currentLoadedEntities = [];
			snapshot.forEach(doc => {
				const data = doc.data();
				const role = (data.role || "").toUpperCase();
				
				// Lọc các vai trò TEACHER hoặc STUDENT
				if (role === "TEACHER" || role === "STUDENT") {
					window.currentLoadedEntities.push({ id: doc.id, ...data });
				}
			});

			// Đánh dấu đã tải cache thành công trên window để các hàm khác dễ dùng chung
			window.isEntitiesCacheLoaded = true;
			renderEntityTableRows(window.currentLoadedEntities);

		} catch (error) {
			console.error("Lỗi tải danh sách thực thể:", error);
			tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Lỗi tải dữ liệu từ cơ sở dữ liệu.</td></tr>';
		}
	}

	
	// ==========================================
	// SỬA THÔNG TIN
	// ==========================================
	function renderEntityTableRows(entities) {
	  const tbody = document.getElementById("entity-table-body");
	  if (!tbody) return;

	  if (entities.length === 0) {
		tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6c757d;">Chưa có dữ liệu thực thể nào.</td></tr>';
		return;
	  }

	  tbody.innerHTML = "";
	  entities.forEach(item => {
		const tr = document.createElement("tr");
		const isActivated = item.activated === true;
		
		tr.innerHTML = `
		  <td style="font-family: monospace; font-weight: bold;">${item.id || ""}</td>
		  <td>${item.fullName || ""}</td>
		  <td><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${item.category || ""}</span></td>
		  <td>${item.email || "<i>Chưa có</i>"}</td>
		  <td style="text-align: center;">
			<span style="display: inline-block; padding: 2px 6px; font-size: 0.75em; font-weight: bold; border-radius: 3px; background: ${isActivated ? '#d1e7dd; color: #0f5132;' : '#f8d7da; color: #842029;'} margin-bottom: 4px;">
			  ${isActivated ? 'Đã kích hoạt' : 'Chưa kích hoạt'}
			</span><br>
			<!-- NÚT SỬA -->
			<button type="button" onclick="openEditEntityModal('${item.id}')" style="padding: 3px 6px; background: #ffc107; color: #000; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8em; margin-right: 4px;" title="Sửa thông tin">
			  <i class="fa-solid fa-pen"></i>
			</button>
			<!-- NÚT XÓA -->
			<button type="button" onclick="deleteEntityRecord('${item.id}')" style="padding: 3px 6px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8em;" title="Xóa">
			  <i class="fa-solid fa-trash"></i>
			</button>
		  </td>
		`;
		tbody.appendChild(tr);
	  });
	}


	// Xóa nhân sự và Hủy kích hoạt
	async function deleteEntityRecord(docId) {
		// 1. Hộp thoại xác nhận trước khi xóa tránh bấm nhầm
		if (!confirm(`Bạn có chắc chắn muốn xóa bản ghi [${docId}] này không?`)) {
			return;
		}

		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			alert("Không tìm thấy thông tin tổ chức!");
			return;
		}

		try {
			const db = firebase.firestore();

			// 2. Thực hiện lệnh xóa document khỏi Firestore
			// (Đường dẫn này tương ứng với lúc bạn lấy danh sách users trong tổ chức)
			await db.collection("organizations")
				.doc(orgId)
				.collection("users")
				.doc(docId)
				.delete();

			alert(`Đã xóa thành công bản ghi [${docId}]!`);

			// 3. 🌟 Gọi trực tiếp hàm tải và vẽ lại bảng quản trị thực thể
			if (typeof reloadAndRenderAdminEntityList === 'function') {
				await reloadAndRenderAdminEntityList(true); // Truyền true để ép buộc tải mới từ Firestore
			} else {
				// Dự phòng nếu tên hàm khác
				location.reload(); 
			}

		} catch (err) {
			console.error("Lỗi khi xóa bản ghi:", err);
			alert("Không thể xóa bản ghi: " + err.message);
		}
	}
	
	// Mở modal sửa thông tin và điền sẵn dữ liệu cũ
	async function openEditEntityModal(docId) {
		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			alert("Không tìm thấy thông tin tổ chức!");
			return;
		}

		try {
			const db = firebase.firestore();
			// Trực tiếp truy vấn document của thực thể này trên Firestore theo docId
			const docSnap = await db.collection("organizations")
				.doc(orgId)
				.collection("users")
				.doc(docId)
				.get();

			if (!docSnap.exists) {
				alert("Không tìm thấy thông tin thực thể trên cơ sở dữ liệu!");
				return;
			}

			const entity = docSnap.data();

			// Đổ dữ liệu vào các ô input trong Modal
			document.getElementById("edit-entity-old-id").value = docId;
			
			const idInput = document.getElementById("edit-entity-id");
			if (idInput) idInput.value = docId;

			const nameInput = document.getElementById("edit-entity-name");
			if (nameInput) nameInput.value = entity.fullName || "";

			const categoryInput = document.getElementById("edit-entity-category");
			if (categoryInput) categoryInput.value = entity.category || "";

			const emailInput = document.getElementById("edit-entity-email");
			if (emailInput) emailInput.value = entity.email || "";

			// Hiển thị modal lên giao diện
			const modal = document.getElementById("edit-entity-modal");
			if (modal) {
				modal.style.display = "flex";
			}

		} catch (err) {
			console.error("Lỗi khi mở modal sửa thực thể:", err);
			alert("Không thể tải thông tin thực thể: " + err.message);
		}
	}

	// Đóng modal sửa
	function closeEditEntityModal() {
	  document.getElementById("edit-entity-modal").style.display = "none";
	}

	// Lưu thông tin sau khi sửa lên Firestore và cập nhật giao diện ngay lập tức
	async function saveEditedEntityRecord() {
	  const docId = document.getElementById("edit-entity-old-id").value;
	  const newName = document.getElementById("edit-entity-name").value.trim();
	  const newCategory = document.getElementById("edit-entity-category").value.trim();
	  const newEmail = document.getElementById("edit-entity-email").value.trim();

	  if (!newName) {
		alert("Họ và tên không được để trống!");
		return;
	  }

	  try {
		const user = firebase.auth().currentUser;
		if (!user) return;

		const orgId = await getCurrentAdminOrgId(user.uid);
		const db = firebase.firestore();

		const docRef = db.collection("organizations").doc(orgId).collection("users").doc(docId);

		// Cập nhật dữ liệu lên Firestore
		await docRef.update({
		  fullName: newName,
		  category: newCategory,
		  email: newEmail,
		  updatedAt: getVietnamTimestamp()
		});

		// Cập nhật trực tiếp vào mảng cache trong RAM (giúp không phải gọi đọc lại Firebase)
		const index = currentLoadedEntities.findIndex(item => item.id === docId);
		if (index !== -1) {
		  currentLoadedEntities[index].fullName = newName;
		  currentLoadedEntities[index].category = newCategory;
		  currentLoadedEntities[index].email = newEmail;
		}

		// Đóng modal và vẽ lại bảng ngay lập tức
		closeEditEntityModal();
		renderEntityTableRows(currentLoadedEntities);

		alert("Cập nhật thông tin thành công!");

	  } catch (error) {
		console.error("Lỗi khi cập nhật bản ghi:", error);
		alert("Lỗi khi lưu thay đổi: " + error.message);
	  }
	}
	// Tìm kiếm lọc cục bộ trên danh sách đang hiển thị
	function filterEntityListLocal() {
		const searchInput = document.getElementById("entity-search-input");
		const keyword = searchInput ? searchInput.value.toLowerCase().trim() : "";
		
		// Lấy danh sách từ RAM thông qua biến toàn cục trên window để tránh lỗi undefined
		const sourceList = window.currentLoadedEntities || [];

		// Nếu không nhập từ khóa, hiển thị lại toàn bộ danh sách hiện có
		if (!keyword) {
			if (typeof renderEntityTableRows === 'function') {
				renderEntityTableRows(sourceList);
			}
			return;
		}

		// Thực hiện lọc theo các trường: Mã ID, Họ tên, Tổ/Lớp (category), và Email
		const filtered = sourceList.filter(item => {
			const idMatch = item.id && String(item.id).toLowerCase().includes(keyword);
			const nameMatch = item.fullName && String(item.fullName).toLowerCase().includes(keyword);
			const catMatch = item.category && String(item.category).toLowerCase().includes(keyword);
			const emailMatch = item.email && String(item.email).toLowerCase().includes(keyword);
			
			return idMatch || nameMatch || catMatch || emailMatch;
		});

		// Render kết quả đã lọc thẳng vào tbody của bảng quản trị
		if (typeof renderEntityTableRows === 'function') {
			renderEntityTableRows(filtered);
		}
	}
	
	// Nút làm mới danh sách
	async function resetAndReloadAdminEntityList() {
	  document.getElementById("entity-search-input").value = "";
	  // Truyền true để xóa cache cũ và tải lại dữ liệu mới nhất từ Firebase
	  await reloadAndRenderAdminEntityList(true);
	}
	
	// ==========================================
	// 1.3 KÍCH HOẠT TÀI KHOẢN ĐĂNG NHẬP CHO DANH SÁCH LỌC
	// ==========================================
	async function activateFilteredAccounts() {
		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			alert("Không tìm thấy thông tin tổ chức! Vui lòng tải lại trang.");
			return;
		}

		// 🌟 1. Lấy danh sách từ mảng cache hiện tại trên RAM
		let sourceList = window.currentLoadedEntities || [];
		
		// Nếu mảng cache đang trống, thử quét ngược lại từ bảng HTML lên để dự phòng
		if (sourceList.length === 0) {
			const tbody = document.getElementById("entity-table-body");
			if (tbody) {
				tbody.querySelectorAll("tr").forEach(tr => {
					if (tr.querySelector("td[colspan]")) return;
					const cols = tr.querySelectorAll("td");
					if (cols.length >= 4) {
						sourceList.push({
							id: cols[0].textContent.trim(),
							fullName: cols[1].textContent.trim(),
							category: cols[2].textContent.trim(),
							email: cols[3].textContent.trim().toLowerCase() === "chưa có" ? "" : cols[3].textContent.trim(),
							role: "STUDENT" // Mặc định nếu quét từ bảng
						});
					}
				});
			}
		}

		if (sourceList.length === 0) {
			alert("Không có dữ liệu thực thể nào để kích hoạt!");
			return;
		}

		// 🌟 2. Áp dụng điều kiện lọc theo từ khóa từ ô tìm kiếm (#entity-search-input) nếu đang có giá trị gõ
		const searchInput = document.getElementById("entity-search-input");
		const keyword = searchInput ? searchInput.value.toLowerCase().trim() : "";
		
		let targetList = sourceList;
		if (keyword) {
			targetList = sourceList.filter(item => {
				const idMatch = (item.id || "").toLowerCase().includes(keyword);
				const nameMatch = (item.fullName || "").toLowerCase().includes(keyword);
				const catMatch = (item.category || "").toLowerCase().includes(keyword);
				const emailMatch = (item.email || "").toLowerCase().includes(keyword);
				return idMatch || nameMatch || catMatch || emailMatch;
			});
		}

		if (targetList.length === 0) {
			alert(`Không tìm thấy đối tượng nào khớp với từ khóa "${keyword}" trên bảng hiển thị!`);
			return;
		}

		// 🌟 3. Lọc tiếp các đối tượng thực sự có email hợp lệ
		const validAccounts = targetList.filter(item => item.email && item.email.includes("@"));
		if (validAccounts.length === 0) {
			alert(`Có ${targetList.length} bản ghi đang hiển thị nhưng không có bản ghi nào chứa email hợp lệ để tạo tài khoản đăng nhập!`);
			return;
		}

		// Thông báo xác nhận số lượng chính xác theo kết quả đang lọc
		const confirmMsg = keyword 
			? `Bạn có chắc chắn muốn kích hoạt tài khoản cho ${validAccounts.length} bản ghi đang hiển thị (theo từ khóa "${keyword}")? (Mật khẩu mặc định: 123456)`
			: `Bạn có chắc chắn muốn kích hoạt tài khoản cho toàn bộ ${validAccounts.length} bản ghi đang hiển thị trên bảng? (Mật khẩu mặc định: 123456)`;

		if (!confirm(confirmMsg)) {
			return;
		}

		const user = firebase.auth().currentUser;
		const db = firebase.firestore();

		// 🌟 4. Đọc trước mảng academicYears từ document `emails` của Admin đang đăng nhập
		let adminAcademicYears = [];
		try {
			if (user && user.email) {
				const adminEmailDoc = await db.collection("emails").doc(user.email.toLowerCase().trim()).get();
				if (adminEmailDoc.exists && Array.isArray(adminEmailDoc.data().academicYears)) {
					adminAcademicYears = adminEmailDoc.data().academicYears;
				}
			}
		} catch (e) {
			console.warn("Không lấy được academicYears của admin:", e);
		}

		let successCount = 0;
		let secondaryApp = null;

		try {
			const firebaseConfig = firebase.app().options;
			secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryAppForBatchActivation");
			const secondaryAuth = secondaryApp.auth();

			for (let acc of validAccounts) {
				const rawEmail = acc.email ? String(acc.email) : "";
				const standardizedEmail = rawEmail.toLowerCase().replace(/\s+/g, "").trim();

				if (!standardizedEmail || !standardizedEmail.includes("@") || !standardizedEmail.includes(".")) {
					console.warn(`Bỏ qua dòng có email không hợp lệ: "${acc.email}"`);
					continue;
				}

				const userRole = acc.role || "STUDENT";

				try {
					// Tạo tài khoản trên Firebase Auth với mật khẩu mặc định "123456"
					const userCred = await secondaryAuth.createUserWithEmailAndPassword(standardizedEmail, "123456");
					const newUid = userCred.user.uid;

					// Cập nhật document tại organizations > {orgId} > users
					await db.collection("organizations").doc(orgId).collection("users").doc(acc.id).set({
						authUid: newUid,
						activated: true,
						email: standardizedEmail,
						updatedAt: getVietnamTimestamp(),
						uid: acc.id
					}, { merge: true });

					// Cập nhật tại collection gốc `emails`
					await db.collection("emails").doc(standardizedEmail).set({
						orgId: orgId,
						role: userRole,
						fullName: acc.fullName || "",
						activated: true,
						academicYears: adminAcademicYears,
						updatedAt: getVietnamTimestamp(),
						uid: acc.id
					}, { merge: true });

					successCount++;
				} catch (err) {
					// Nếu email đã tồn tại trên hệ thống Auth chung, chỉ cập nhật trạng thái activated = true
					if (err.code === "auth/email-already-in-use") {
						await db.collection("organizations").doc(orgId).collection("users").doc(acc.id).set({
							activated: true,
							email: standardizedEmail,
							updatedAt: getVietnamTimestamp()
						}, { merge: true });

						await db.collection("emails").doc(standardizedEmail).set({
							orgId: orgId,
							role: userRole,
							fullName: acc.fullName || "",
							activated: true,
							academicYears: adminAcademicYears,
							updatedAt: getVietnamTimestamp(),
							uId: acc.id
						}, { merge: true });

						successCount++;
					} else {
						console.error(`Không thể kích hoạt email [${standardizedEmail}]:`, err.message);
					}
				}
			}

			alert(`Đã kích hoạt thành công ${successCount} tài khoản!`);
			
			// Làm mới lại bảng quản trị
			window.isEntitiesCacheLoaded = false;
			if (typeof reloadAndRenderAdminEntityList === 'function') {
				await reloadAndRenderAdminEntityList(true);
			}

		} catch (error) {
			console.error("Lỗi kích hoạt hàng loạt:", error);
			alert("Lỗi khi thực hiện kích hoạt: " + error.message);
		} finally {
			if (secondaryApp) {
				await secondaryApp.delete();
			}
		}
	}
	
	// Mở rộng hàm switchAdminTab để khi Admin bấm vào Thẻ 1 thì tự động nạp dữ liệu
	const originalSwitchAdminTab = window.switchAdminTab;
	window.switchAdminTab = function(tabName) {
	  if (typeof originalSwitchAdminTab === 'function') {
		originalSwitchAdminTab(tabName);
	  }
	  if (tabName === 'entities') {
		initAdminEntitiesTab();
	  }
	};
	
	// ==========================================
	// THẺ 2 - PHẦN 1: QUẢN LÝ DANH SÁCH & LỌC NHÂN SỰ PHÂN CÔNG
	// ==========================================

	// Biến cache lưu trữ dữ liệu nhân sự cho Thẻ 2
	let card2CachedMembers = [];
	let card2SelectedMemberId = null; // Lưu ID nhân sự đang được chọn hiện tại

	// Hàm khởi tạo khi Admin bấm chuyển sang Thẻ 2 (Assignments)
	async function initAdminAssignmentsTab() {
	  await loadCard2MembersData();
	  renderDefaultMatricesBoxes();
	}

	// 2. Hàm render sẵn khung checkbox cho 2 ma trận từ cache hiện có
	function renderDefaultMatricesBoxes(selectedHomeroom = [], selectedTeaching = []) {
		const homeroomContainer = document.getElementById("homeroom-classes-checkboxes");
		const teachingContainer = document.getElementById("teaching-classes-checkboxes");
		
		if (!homeroomContainer || !teachingContainer) return;

		// Sử dụng mảng cache toàn cục trên window
		const membersList = window.card2CachedMembers || [];

		if (membersList.length === 0) {
			homeroomContainer.innerHTML = '<i style="color:#6c757d; font-size:0.9em;">Chưa có dữ liệu danh mục thực thể.</i>';
			teachingContainer.innerHTML = '<i style="color:#6c757d; font-size:0.9em;">Chưa có dữ liệu danh mục thực thể.</i>';
			return;
		}

		let homeroomOptions = new Set();
		let teachingOptions = new Set();

		membersList.forEach(item => {
			const role = (item.role || "").toUpperCase();
			const category = item.category ? String(item.category).trim() : "";

			if (category) {
				// 🌟 1. Khung trái (Homeroom): Lấy TẤT CẢ các category của toàn bộ users
				homeroomOptions.add(category);

				// 🌟 2. Khung phải (Teaching): Chỉ lấy category của những user có role là STUDENT
				if (role === "STUDENT") {
					teachingOptions.add(category);
				}
			}
		});

		// Phòng trường hợp không có user nào đánh dấu role STUDENT rõ ràng mà chỉ có category chung, ta fallback lấy toàn bộ cho teaching để giao diện không bị trống
		if (teachingOptions.size === 0) {
			homeroomOptions.forEach(cat => teachingOptions.add(cat));
		}

		// Render HTML Checkbox với trạng thái checked tương ứng
		if (typeof renderCheckboxesToContainer === 'function') {
			renderCheckboxesToContainer(homeroomContainer, Array.from(homeroomOptions).sort(), selectedHomeroom, "chk_homeroom");
			renderCheckboxesToContainer(teachingContainer, Array.from(teachingOptions).sort(), selectedTeaching, "chk_teaching");
		}
	}
	// 1. Tải danh sách nhân sự từ Firebase (Có kết hợp Cache để tiết kiệm quota)
	async function loadCard2MembersData(forceRefresh = false) {
		const container = document.getElementById("assign-members-radio-container");
		if (!container) return;

		// Đảm bảo khởi tạo mảng cache toàn cục trên window nếu chưa có
		window.card2CachedMembers = window.card2CachedMembers || [];

		// Nếu đã có cache và không ép làm mới -> dùng luôn dữ liệu trong RAM
		if (!forceRefresh && window.card2CachedMembers.length > 0) {
			populateCard2Categories(window.card2CachedMembers);
			renderCard2MemberList(window.card2CachedMembers);
			return;
		}

		container.innerHTML = '<div style="padding: 10px; text-align: center; color: #6c757d;">Đang tải danh sách nhân sự...</div>';

		try {
			// Lấy trực tiếp từ biến toàn cục chuẩn
			const orgId = window.currentOrgIdGlobal;
			if (!orgId) {
				container.innerHTML = '<div style="padding: 10px; text-align: center; color: red;">Không tìm thấy thông tin tổ chức!</div>';
				return;
			}

			const db = firebase.firestore();
			const snapshot = await db.collection("organizations").doc(orgId).collection("users").get();

			window.card2CachedMembers = [];
			snapshot.forEach(doc => {
				const data = doc.data();
				const role = (data.role || "").toUpperCase();
				
				// Lọc các đối tượng không phải ADMIN
				if (role !== "ADMIN") {
					window.card2CachedMembers.push({ id: doc.id, ...data });
				}
			});

			populateCard2Categories(window.card2CachedMembers);
			renderCard2MemberList(window.card2CachedMembers);

		} catch (error) {
			console.error("Lỗi tải nhân sự cho Thẻ 2:", error);
			container.innerHTML = '<div style="padding: 10px; text-align: center; color: red;">Lỗi tải dữ liệu từ máy chủ.</div>';
		}
	}

	// 2. Tự động quét các giá trị "category" (Tổ / Lớp / Đơn vị) để điền vào Combox lọc bên trái
	function populateCard2Categories(members) {
	  const select = document.getElementById("select-group-category");
	  if (!select) return;

	  let categoriesSet = new Set();
	  members.forEach(m => {
		const cat = m.category ? String(m.category).trim() : "";
		// 🌟 CHỈ LẤY CÁC TỔ CHUYÊN MÔN (Loại bỏ các tên có dạng lớp học như 10A, 11A, 12A...)
		if (cat && !cat.startsWith("10") && !cat.startsWith("11") && !cat.startsWith("12")) {
		  categoriesSet.add(cat);
		}
	  });

	  const sortedCategories = Array.from(categoriesSet).sort();
	  
	  select.innerHTML = '<option value="">-- Tất cả Tổ chuyên môn --</option>';
	  sortedCategories.forEach(cat => {
		const opt = document.createElement("option");
		opt.value = cat;
		opt.textContent = cat;
		select.appendChild(opt);
	  });
	}

	// 3. Render danh sách nhân sự dạng Radio Listbox vào khung bên phải
	function renderCard2MemberList(membersToRender) {
	  const container = document.getElementById("assign-members-radio-container");
	  if (!container) return;

	  // 🌟 LỌC THEO QUY TẮC: Đọc role trước để xác định giáo viên, sau đó kiểm tra category là Tổ chuyên môn
	  const teacherMembers = membersToRender.filter(item => {
		const role = (item.role || "").toUpperCase();
		const category = item.category ? String(item.category).trim() : "";

		// 1. Kiểm tra role: Phải là giáo viên/nhân sự (loại bỏ ADMIN, STUDENT, học sinh...)
		const isTeacherRole = role !== "ADMIN" && role !== "STUDENT" && role !== "HỌC SINH";
		
		// 2. Đọc và kiểm tra category: Phải là Tổ chuyên môn, loại bỏ tuyệt đối các tên lớp học (10A, 11A, 12A...)
		const isDepartmentCategory = category && 
									 !category.startsWith("10") && 
									 !category.startsWith("11") && 
									 !category.startsWith("12");

		return isTeacherRole && isDepartmentCategory;
	  });

	  if (teacherMembers.length === 0) {
		container.innerHTML = '<div style="padding: 10px; text-align: center; color: #6c757d; font-style: italic;">Không tìm thấy giáo viên thuộc tổ chuyên môn phù hợp.</div>';
		return;
	  }

	  // Sắp xếp danh sách giáo viên theo tên alphabet
	  const sortedTeachers = [...teacherMembers].sort((a, b) => {
		const nameA = (a.fullName || "").toLowerCase();
		const nameB = (b.fullName || "").toLowerCase();
		return nameA.localeCompare(nameB);
	  });

	  container.innerHTML = "";

	  sortedTeachers.forEach(item => {
		const isChecked = card2SelectedMemberId === item.id;
		const label = document.createElement("label");
		label.className = "assign-member-item";
		label.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 3px; cursor: pointer; border-radius: 4px; transition: background 0.2s; background: ${isChecked ? '#e7f1ff' : 'transparent'}; border: ${isChecked ? '1px solid #b6d4fe' : '1px solid transparent'};`;
		
		label.onmouseover = function() { if(!this.querySelector('input').checked) this.style.background = '#f0f4f9'; };
		label.onmouseout = function() { if(!this.querySelector('input').checked) this.style.background = isChecked ? '#e7f1ff' : 'transparent'; };

		label.innerHTML = `
		  <div style="display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
			<input type="radio" name="assign_member_radio" class="rb-assign-member" value="${item.id}" ${isChecked ? 'checked' : ''} onchange="onAssignMemberRadioChange('${item.id}', this)" style="margin-right: 8px;">
			<b style="margin-right: 5px;">[${item.id}]</b> <span style="overflow: hidden; text-overflow: ellipsis;">${item.fullName || ''}</span>
		  </div>
		  <span style="font-size: 0.75em; background: #e9ecef; color: #495057; padding: 1px 6px; border-radius: 3px; flex-shrink: 0; margin-left: 5px;">${item.category}</span>
		`;

		container.appendChild(label);
	  });
	}

	// 4. Sự kiện lọc theo Combox Tổ/Đơn vị (Cột 1)
	function filterMembersByCategoryList() {
		const categorySelect = document.getElementById("select-group-category");
		const searchInput = document.getElementById("assign-member-search");
		
		const selectedCategory = categorySelect ? categorySelect.value.trim() : "";
		const keyword = searchInput ? searchInput.value.toLowerCase().trim() : "";

		// Sử dụng mảng cache trên window, nếu chưa có thì lấy mảng rỗng để tránh lỗi
		let sourceList = window.card2CachedMembers || [];
		let filtered = sourceList;

		// 1. Lọc theo category nếu được chọn (và khác giá trị "tất cả" hoặc rỗng)
		if (selectedCategory && selectedCategory !== "" && selectedCategory !== "all") {
			filtered = filtered.filter(m => String(m.category || "").trim() === selectedCategory);
		}

		// 2. Lọc kết hợp thêm từ khóa tìm kiếm (nếu có) theo ID hoặc Họ tên
		if (keyword) {
			filtered = filtered.filter(m => {
				const idMatch = m.id && String(m.id).toLowerCase().includes(keyword);
				const nameMatch = m.fullName && String(m.fullName).toLowerCase().includes(keyword);
				return idMatch || nameMatch;
			});
		}

		// 3. Vẽ lại danh sách sau khi lọc lên container của Thẻ 2
		renderCard2MemberList(filtered);
	}

	// 5. Sự kiện tìm kiếm nhanh theo từ khóa (Ô tìm kiếm cột 2)
	function filterMembersByKeywordList() {
	  filterMembersByCategoryList(); // Tận dụng chung logic lọc kết hợp với combox
	}

	// 6. Xử lý khi click chọn 1 radio nhân sự
	async function onAssignMemberRadioChange(memberId, radioElement) {
		card2SelectedMemberId = memberId;

		// Highlight giao diện radio item
		document.querySelectorAll('.assign-member-item').forEach(lbl => {
			lbl.style.background = 'transparent';
			lbl.style.border = '1px solid transparent';
		});
		if (radioElement && radioElement.closest('label')) {
			const parentLabel = radioElement.closest('label');
			parentLabel.style.background = '#e7f1ff';
			parentLabel.style.border = '1px solid #b6d4fe';
		}

		const orgId = window.currentOrgIdGlobal;
		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!orgId || !academicYearId || !memberId) return;

		try {
			const db = firebase.firestore();
			const assignDoc = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("assignments")
				.doc(memberId)
				.get();

			// 🌟 QUAN TRỌNG: Đảm bảo reset và tích chọn được chạy sau cùng (bọc trong microtask / setTimeout nếu cần render DOM)
			setTimeout(() => {
				// Reset toàn bộ
				document.querySelectorAll('input[name="chk_homeroom"]').forEach(chk => chk.checked = false);
				document.querySelectorAll('input[name="chk_teaching"]').forEach(chk => chk.checked = false);

				if (!assignDoc.exists) return;

				const assignData = assignDoc.data();
				
				let hrRaw = assignData.homeroom || assignData.homeroomClasses || [];
				let homeroomList = typeof hrRaw === 'string' ? hrRaw.split(',').map(s => s.trim()).filter(Boolean) : (Array.isArray(hrRaw) ? hrRaw : []);

				let teachRaw = assignData.teaching || [];
				let teachingList = typeof teachRaw === 'string' ? teachRaw.split(',').map(s => s.trim()).filter(Boolean) : (Array.isArray(teachRaw) ? teachRaw : []);

				// Tích chọn chính xác
				document.querySelectorAll('input[name="chk_homeroom"]').forEach(chk => {
					if (homeroomList.includes(chk.value)) chk.checked = true;
				});

				document.querySelectorAll('input[name="chk_teaching"]').forEach(chk => {
					if (teachingList.includes(chk.value)) chk.checked = true;
				});

				console.log(`✅ Đã đồng bộ checkbox cho [${memberId}]`);
			}, 50); // Độ trễ nhỏ 50ms để nhường chỗ cho các render khác chạy xong trước

		} catch (error) {
			console.error("❌ Lỗi tải phân công:", error);
		}
	}async function onAssignMemberRadioChange(memberId, radioElement) {
		card2SelectedMemberId = memberId;

		// Highlight giao diện radio item
		document.querySelectorAll('.assign-member-item').forEach(lbl => {
			lbl.style.background = 'transparent';
			lbl.style.border = '1px solid transparent';
		});
		if (radioElement && radioElement.closest('label')) {
			const parentLabel = radioElement.closest('label');
			parentLabel.style.background = '#e7f1ff';
			parentLabel.style.border = '1px solid #b6d4fe';
		}

		const orgId = window.currentOrgIdGlobal;
		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!orgId || !academicYearId || !memberId) return;

		try {
			const db = firebase.firestore();
			const assignDoc = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("assignments")
				.doc(memberId)
				.get();

			// 🌟 QUAN TRỌNG: Đảm bảo reset và tích chọn được chạy sau cùng (bọc trong microtask / setTimeout nếu cần render DOM)
			setTimeout(() => {
				// Reset toàn bộ
				document.querySelectorAll('input[name="chk_homeroom"]').forEach(chk => chk.checked = false);
				document.querySelectorAll('input[name="chk_teaching"]').forEach(chk => chk.checked = false);

				if (!assignDoc.exists) return;

				const assignData = assignDoc.data();
				
				let hrRaw = assignData.homeroom || assignData.homeroomClasses || [];
				let homeroomList = typeof hrRaw === 'string' ? hrRaw.split(',').map(s => s.trim()).filter(Boolean) : (Array.isArray(hrRaw) ? hrRaw : []);

				let teachRaw = assignData.teaching || [];
				let teachingList = typeof teachRaw === 'string' ? teachRaw.split(',').map(s => s.trim()).filter(Boolean) : (Array.isArray(teachRaw) ? teachRaw : []);

				// Tích chọn chính xác
				document.querySelectorAll('input[name="chk_homeroom"]').forEach(chk => {
					if (homeroomList.includes(chk.value)) chk.checked = true;
				});

				document.querySelectorAll('input[name="chk_teaching"]').forEach(chk => {
					if (teachingList.includes(chk.value)) chk.checked = true;
				});

				console.log(`✅ Đã đồng bộ checkbox cho [${memberId}]`);
			}, 50); // Độ trễ nhỏ 50ms để nhường chỗ cho các render khác chạy xong trước

		} catch (error) {
			console.error("❌ Lỗi tải phân công:", error);
		}
	}

	// Mở rộng bộ chuyển tab của Admin để tự động kích hoạt Thẻ 2 khi bấm vào
	const existingSwitchAdminTab = window.switchAdminTab;
	window.switchAdminTab = function(tabName) {
	  if (typeof existingSwitchAdminTab === 'function') {
		existingSwitchAdminTab(tabName);
	  }
	  if (tabName === 'assignments') {
		initAdminAssignmentsTab();
	  }
	};
	
	// ==========================================
	// THẺ 2 - PHẦN 2: MA TRẬN PHÂN CÔNG CHỦ NHIỆM & GIẢNG DẠY
	// ==========================================

	// Biến lưu trữ dữ liệu phân công hiện tại của nhân sự đang được chọn
	let currentMemberAssignments = {
	  homeroom: [], // Lưu danh sách mã lớp/tổ chủ nhiệm
	  teaching: []  // Lưu danh sách mã lớp giảng dạy
	};

	// 1. Ghi đè sự kiện chọn nhân sự ở Phần 1 để tự động nạp dữ liệu phân công tương ứng vào 2 ma trận bên dưới
	const originalOnAssignMemberRadioChange = window.onAssignMemberRadioChange;
	window.onAssignMemberRadioChange = async function(memberId, radioElement) {
		if (typeof originalOnAssignMemberRadioChange === 'function') {
			originalOnAssignMemberRadioChange(memberId, radioElement);
		}
		
		// Nạp danh mục từ categories (đã tối ưu ở bước trước)
		await loadMatricesDataForSelectedMember(memberId);
	};

	// ==========================================
	// HÀM TẢI VÀ PHÂN LOẠI DANH MỤC CHO THẺ 2 (ĐỌC TỪ CATEGORIES)
	// ==========================================

	// Biến lưu trữ toàn bộ phân công của tất cả giáo viên (Dạng Map: memberId -> { homeroom: [], teaching: [] })
	window.allAssignmentsCache = window.allAssignmentsCache || {};
	window.isAssignmentsCacheLoaded = false;
	
	async function preloadAllAssignmentsCache(orgId, academicYearId) {
		if (window.isAssignmentsCacheLoaded) return; // Nếu đã tải rồi thì bỏ qua

		try {
			const db = firebase.firestore();
			const snap = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("assignments")
				.get();

			window.allAssignmentsCache = {};
			snap.forEach(doc => {
				const data = doc.data();
				window.allAssignmentsCache[doc.id] = {
					homeroom: data.homeroom || [],
					teaching: data.teaching || []
				};
			});

			window.isAssignmentsCacheLoaded = true;
			console.log("⚡ Đã nạp toàn bộ phân công vào Cache thành công!");
		} catch (err) {
			console.error("❌ Lỗi preload assignments cache:", err);
		}
	}
	
	
	// 2. Hàm nạp danh sách các Lớp / Tổ vào khung cuộn Checkbox của 2 Ma trận (Sử dụng Cache)
	async function loadMatricesDataForSelectedMember(memberId) {
		const homeroomContainer = document.getElementById("homeroom-classes-checkboxes");
		const teachingContainer = document.getElementById("teaching-classes-checkboxes");
		
		if (!homeroomContainer || !teachingContainer) return;

		homeroomContainer.innerHTML = '<i style="color:#6c757d; font-size:0.9em;">Đang tải danh mục từ cơ sở dữ liệu...</i>';
		teachingContainer.innerHTML = '<i style="color:#6c757d; font-size:0.9em;">Đang tải danh mục từ cơ sở dữ liệu...</i>';

		const orgId = window.currentOrgIdGlobal;
		let academicYearId = currentAcademicYear || "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		}

		if (!orgId || !academicYearId) {
			homeroomContainer.innerHTML = '<i style="color:red; font-size:0.9em;">Chưa xác định được đơn vị hoặc năm học.</i>';
			teachingContainer.innerHTML = '<i style="color:red; font-size:0.9em;">Chưa xác định được đơn vị hoặc năm học.</i>';
			return;
		}

		try {
			const db = firebase.firestore();

			// 1. Đọc trực tiếp collection `categories` của năm học hiện tại (Siêu nhanh, tiết kiệm tối đa lượt đọc)
			const categoriesSnap = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("categories")
				.get();

			let homeroomOptions = new Set(); // Dùng cho Ma trận Chủ nhiệm / Quản lý
			let teachingOptions = new Set(); // Dùng cho Ma trận Giảng dạy

			categoriesSnap.forEach(doc => {
				const catName = doc.id; // Hoặc doc.data().name
				if (!catName) return;

				// 🌟 Phân loại theo quy tắc: Có số -> Lớp học, Không có số -> Tổ chuyên môn
				const hasNumber = /\d/.test(catName);

				if (hasNumber) {
					// Là Lớp học (VD: 10A1, 11A2) -> Phù hợp cho cả Chủ nhiệm lớp lẫn Giảng dạy lớp
					homeroomOptions.add(catName);
					teachingOptions.add(catName);
				} else {
					// Là Tổ chuyên môn (VD: Hóa, Lý, Sinh) -> Thường dùng quản lý tổ hoặc phân công đặc thù
					homeroomOptions.add(catName);
				}
			});

			// 2. Lấy thông tin phân công đã lưu trước đó của nhân sự này từ Firestore
			await fetchExistingAssignmentsFromFirestore(memberId);

			// Khởi tạo biến dữ liệu phân công nếu chưa có
			window.currentMemberAssignments = window.currentMemberAssignments || { homeroom: [], teaching: [] };

			// 3. Render ra giao diện checkbox
			renderCheckboxesToContainer(
				homeroomContainer, 
				Array.from(homeroomOptions).sort(), 
				window.currentMemberAssignments.homeroom, 
				"chk_homeroom"
			);

			renderCheckboxesToContainer(
				teachingContainer, 
				Array.from(teachingOptions).sort(), 
				window.currentMemberAssignments.teaching, 
				"chk_teaching"
			);

		} catch (error) {
			console.error("Lỗi tải danh mục categories:", error);
			homeroomContainer.innerHTML = '<i style="color:red; font-size:0.9em;">Lỗi tải dữ liệu danh mục.</i>';
			teachingContainer.innerHTML = '<i style="color:red; font-size:0.9em;">Lỗi tải dữ liệu danh mục.</i>';
		}
	}

	// 4. Lấy dữ liệu phân công từ Cache (Siêu tốc, không query Firestore)
	async function fetchExistingAssignmentsFromFirestore(memberId) {
		const orgId = window.currentOrgIdGlobal;
		let academicYearId = currentAcademicYear || "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		}

		// Đảm bảo Cache đã được tải ít nhất 1 lần
		if (orgId && academicYearId && !window.isAssignmentsCacheLoaded) {
			await preloadAllAssignmentsCache(orgId, academicYearId);
		}

		// Lấy dữ liệu từ biến Cache toàn cục thay vì gọi db.get()
		const cachedData = window.allAssignmentsCache[memberId] || { homeroom: [], teaching: [] };
		
		currentMemberAssignments = {
			homeroom: [...cachedData.homeroom],
			teaching: [...cachedData.teaching]
		};
		window.currentMemberAssignments = currentMemberAssignments;
	}

	// 4. Hàm render danh sách checkbox dùng chung
	function renderCheckboxesToContainer(container, itemsArray, checkedValuesArray, inputNamePrefix) {
	  if (itemsArray.length === 0) {
		container.innerHTML = '<i style="color:#6c757d; font-size:0.9em;">Không có dữ liệu phù hợp.</i>';
		return;
	  }

	  container.innerHTML = "";
	  itemsArray.forEach(val => {
		const isChecked = checkedValuesArray.includes(val);
		const div = document.createElement("div");
		div.style.cssText = "margin-bottom: 4px;";
		
		div.innerHTML = `
		  <label style="cursor: pointer; display: flex; align-items: center; font-size: 0.9em; user-select: none;">
			<input type="checkbox" name="${inputNamePrefix}" value="${val}" ${isChecked ? 'checked' : ''} style="margin-right: 6px;">
			<span>${val}</span>
		  </label>
		`;
		container.appendChild(div);
	  });
	}

	// 5. Ô tìm kiếm thời gian thực (Realtime Search) cho các checkbox trong ma trận (Đã có sẵn trên HTML của bạn)
	function filterCheckboxesByKeyword(inputElement, containerId) {
	  const keyword = inputElement.value.toLowerCase().trim();
	  const container = document.getElementById(containerId);
	  if (!container) return;

	  const labels = container.getElementsByTagName("label");
	  for (let label of labels) {
		const text = label.textContent || label.innerText;
		if (text.toLowerCase().includes(keyword)) {
		  label.parentElement.style.display = "block";
		} else {
		  label.parentElement.style.display = "none";
		}
	  }
	}

	// 6. Lưu phân công chuyên môn lên Firebase
	// Hàm lưu phân công (Đã cập nhật thêm kiểm tra an toàn orgId)
	async function saveTeachingAssignments() {
		if (!card2SelectedMemberId) {
			alert("Vui lòng chọn một nhân sự/giáo viên ở khung bên trên trước khi lưu phân công!");
			return;
		}

		// 1. Lấy thông tin từ cache danh sách nhân sự (window.card2CachedMembers)
		const membersList = window.card2CachedMembers || [];
		const selectedMember = membersList.find(m => m.id === card2SelectedMemberId);
		
		if (!selectedMember || !selectedMember.email) {
			alert("Không tìm thấy email của nhân sự này. Vui lòng kiểm tra lại thông tin nhân sự!");
			return;
		}

		const teacherEmail = String(selectedMember.email).toLowerCase().trim();
		const teacherName = String(selectedMember.fullName || "").trim(); // 👈 Lấy thêm tên giáo viên

		// 2. Thu thập danh sách lớp chủ nhiệm & giảng dạy được tích chọn
		const homeroomSelected = [];
		document.querySelectorAll('input[name="chk_homeroom"]:checked').forEach(chk => {
			homeroomSelected.push(chk.value);
		});

		const teachingSelected = [];
		document.querySelectorAll('input[name="chk_teaching"]:checked').forEach(chk => {
			teachingSelected.push(chk.value);
		});

		try {
			const user = firebase.auth().currentUser;
			if (!user) return;

			const orgId = window.currentOrgIdGlobal || (typeof getCurrentAdminOrgId === 'function' ? await getCurrentAdminOrgId(user.uid) : null);
			if (!orgId) {
				alert("Không tìm thấy thông tin đơn vị!");
				return;
			}

			// Lấy ID năm học chuẩn xác
			let academicYearId = currentAcademicYear || "";
			const yearsArr = window.currentAcademicYearsGlobal;
			if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
				const lastYearItem = yearsArr[yearsArr.length - 1];
				academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
			}

			if (!academicYearId) {
				alert("Không xác định được năm học hiện tại.");
				return;
			}

			const db = firebase.firestore();

			// 3. Lưu phân công vào assignments với Document ID là EMAIL, kèm theo tên đầy đủ
			await db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicYearId)
					.collection("assignments")
					.doc(teacherEmail) 
					.set({
						email: teacherEmail,
						memberId: card2SelectedMemberId, 
						fullName: teacherName, // 👈 Lưu thêm tên ở đây để tiện tra cứu trực quan
						homeroom: homeroomSelected,
						teaching: teachingSelected,
						updatedAt: (typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString())
					}, { merge: true });

			alert(`Đã lưu thành công phân công cho giáo viên [${teacherName} - ${teacherEmail}]!`);

		} catch (error) {
			console.error("Lỗi lưu phân công chuyên môn:", error);
			alert("Lỗi khi lưu phân công: " + error.message);
		}
	}
	
	
	// ==========================================
	// THẺ 3 - PHẦN 1: ĐỊNH NGHĨA TRƯỜNG THÔNG TIN & KPI
	// ==========================================
	window.cachedSchemaFields = window.cachedSchemaFields || [];

	// 1.1 Hàm ẩn/hiện khối cấu hình KPI khi tích chọn checkbox
	function toggleKPISettings(isChecked) {
			const container = document.getElementById("kpi-settings-container");
			if (container) {
				container.style.display = isChecked ? "flex" : "none";
			}

			// 🌟 NẾU BẬT KPI LÊN VÀ KIỂU DỮ LIỆU ĐANG LÀ "options", TỰ ĐỘNG BẬT MA TRẬN LUÔN
			if (isChecked) {
				// (Lưu ý: Thay 'field-type-select' bằng ID thực tế của thẻ select chọn kiểu dữ liệu của bạn nếu khác ID này)
				const selectElem = document.getElementById("field-type-select") || document.querySelector("select[onchange*='handleFieldTypeChange']");
				const kpiOptionsMatrix = document.getElementById("kpi-options-matrix-container");
				const optionsGroup = document.getElementById("field-options-group");

				if (selectElem && selectElem.value === "options") {
					if (optionsGroup) optionsGroup.style.display = "block";
					if (kpiOptionsMatrix) kpiOptionsMatrix.style.display = "block";
					generateKpiOptionsRows();
				}
			}
		}
	
	// 1.2 Hàm tự động ẩn/hiện khung nhập tùy chọn dựa vào kiểu dữ liệu được chọn
	function handleFieldTypeChange(selectElem) {
		const optionsGroup = document.getElementById("field-options-group");
		const kpiOptionsMatrix = document.getElementById("kpi-options-matrix-container");
		const isKpiChecked = document.getElementById("field-is-kpi")?.checked || false;
		
		if (!optionsGroup) return;

		if (selectElem.value === "options") {
			optionsGroup.style.display = "block";
			
			// Chỉ hiển thị ma trận KPI nếu người dùng đã tích chọn "Đánh dấu là Trường tính điểm KPI"
			if (kpiOptionsMatrix && isKpiChecked) {
				kpiOptionsMatrix.style.display = "block";
				generateKpiOptionsRows();
			}
		} else {
			optionsGroup.style.display = "none";
			if (kpiOptionsMatrix) kpiOptionsMatrix.style.display = "none"; 
		}
	}

	function generateKpiOptionsRows() {
	  const rawText = document.getElementById("field-options-values").value;
	  const container = document.getElementById("kpi-options-rows-wrapper");
	  if (!container) return;

	  const options = rawText.split(",").map(i => i.trim()).filter(i => i.length > 0);

	  if (options.length === 0) {
		container.innerHTML = '<div style="color: #6c757d; font-size: 0.85em; font-style: italic;">Chưa có giá trị lựa chọn nào. Hãy nhập các giá trị ở trên (cách nhau bởi dấu phẩy).</div>';
		return;
	  }

	  let html = `
		<table style="width: 100%; font-size: 0.85em; border-collapse: collapse; margin-top: 6px;">
		  <thead>
			<tr style="background: #ffe5d0; color: #fd7e14; text-align: left;">
			  <th style="padding: 4px; border: 1px solid #ffab76;">Giá trị lựa chọn</th>
			  <th style="padding: 4px; border: 1px solid #ffab76; width: 80px;">Điểm (+/-)</th>
			  <th style="padding: 4px; border: 1px solid #ffab76; width: 90px;">Ngưỡng Tuần</th>
			  <th style="padding: 4px; border: 1px solid #ffab76; width: 90px;">Ngưỡng Tháng</th>
			</tr>
		  </thead>
		  <tbody>
	  `;

	  options.forEach((opt, index) => {
		html += `
		  <tr>
			<td style="padding: 4px; border: 1px solid #ddd; background: #fff; font-weight: 500;">${opt}</td>
			<td style="padding: 4px; border: 1px solid #ddd;"><input type="number" step="0.5" value="-1" class="kpi-opt-weight" data-option="${opt}" style="width: 100%; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px;"></td>
			<td style="padding: 4px; border: 1px solid #ddd;"><input type="number" value="3" class="kpi-opt-weekly" data-option="${opt}" style="width: 100%; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px;"></td>
			<td style="padding: 4px; border: 1px solid #ddd;"><input type="number" value="5" class="kpi-opt-monthly" data-option="${opt}" style="width: 100%; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px;"></td>
		  </tr>
		`;
	  });

	  html += `</tbody></table>`;
	  container.innerHTML = html;
	}
	// 2. Hàm khởi tạo khi Admin chuyển sang Thẻ 3 (Schema)
	async function initAdminSchemaFieldsTab() {
	  await loadSchemaFields();
	  // Khởi tạo trạng thái ẩn khối KPI ban đầu
	  toggleKPISettings(document.getElementById("field-is-kpi").checked);
	}

	// 3. Tải danh sách trường thông tin từ Firebase (Có kết hợp Cache)
	async function loadSchemaFields(forceRefresh = false) {
		const listContainer = document.getElementById("schema-fields-list");
		if (!listContainer) return;

		// 🌟 Đảm bảo biến cache toàn cục luôn tồn tại trên window
		window.cachedSchemaFields = window.cachedSchemaFields || [];

		// Nếu đã có cache và không ép làm mới -> dùng luôn dữ liệu trong RAM
		if (!forceRefresh && Array.isArray(window.cachedSchemaFields) && window.cachedSchemaFields.length > 0) {
			renderSchemaFieldsList(window.cachedSchemaFields);
			
			// 🌟 Tận dụng cache để render luôn cho checkbox ở các thẻ khác
			if (typeof renderModuleFieldsCheckboxes === 'function') {
				renderModuleFieldsCheckboxes();
			}
			return;
		}

		if (listContainer) {
			listContainer.innerHTML = '<li style="padding: 10px; text-align: center; color: #6c757d;">Đang tải danh sách trường thông tin...</li>';
		}

		try {
			const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : currentOrgIdGlobal;
			if (!orgId) {
				if (listContainer) {
					listContainer.innerHTML = '<li style="padding: 10px; text-align: center; color: red;">Chưa xác định được mã tổ chức (OrgId).</li>';
				}
				return;
			}

			const db = firebase.firestore();
			// Đường dẫn: HOME > organizations > {orgId} > fields > {fieldKey}
			const snapshot = await db.collection("organizations").doc(orgId).collection("fields").get();

			// 🌟 Lưu trực tiếp vào biến toàn cục window.cachedSchemaFields
			window.cachedSchemaFields = [];
			snapshot.forEach(doc => {
				window.cachedSchemaFields.push({ key: doc.id, ...doc.data() });
			});

			renderSchemaFieldsList(window.cachedSchemaFields);

			// 🌟 Sau khi tải xong từ Firebase và lưu vào cache, tự động cập nhật checkbox
			if (typeof renderModuleFieldsCheckboxes === 'function') {
				renderModuleFieldsCheckboxes();
			}

		} catch (error) {
			console.error("Lỗi tải danh sách trường thông tin:", error);
			if (listContainer) {
				listContainer.innerHTML = '<li style="padding: 10px; text-align: center; color: red;">Lỗi tải dữ liệu từ máy chủ.</li>';
			}
		}
	}

	// 4. Render danh sách trường ra giao diện thẻ <ul>
	function renderSchemaFieldsList(fields) {
		const listContainer = document.getElementById("schema-fields-list");
		if (!listContainer) return;

		if (!Array.isArray(fields) || fields.length === 0) {
			listContainer.innerHTML = '<li style="padding: 10px; text-align: center; color: #6c757d;">Chưa có trường thông tin nào được định nghĩa.</li>';
			return;
		}

		listContainer.innerHTML = "";
		fields.forEach(field => {
			const li = document.createElement("li");
			li.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 6px; border: 1px solid #dee2e6; border-radius: 4px; background: #fff;";

			// Lưu trữ object field vào dataset để các hàm Sửa/Xóa dễ dàng truy xuất khi cần
			li.dataset.fieldKey = field.key;

			const isKpiHtml = field.isKpi 
				? `<span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 3px; font-size: 0.75em; font-weight: bold; margin-left: 6px;" title="Điểm trọng số: ${field.scoreWeight || 0} | Ngưỡng Tuần: ${field.kpiWeekly || 0} | Ngưỡng Tháng: ${field.kpiMonthly || 0}">KPI (${field.scoreWeight || 0})</span>` 
				: '';

			// Hiển thị thêm thông tin nếu là kiểu options
			const optionsInfo = (field.type === 'options' && Array.isArray(field.options) && field.options.length > 0)
				? `<span style="color: #0d6efd; font-size: 0.75em; margin-left: 6px;">[${field.options.length} lựa chọn]</span>`
				: '';

			li.innerHTML = `
				<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">
					<b style="color: #333;">${field.label || field.key}</b> 
					<code style="background: #e9ecef; color: #d63384; padding: 2px 5px; border-radius: 3px; font-size: 0.85em; margin-left: 4px;">${field.key}</code>
					<span style="color: #6c757d; font-size: 0.8em; margin-left: 6px;">[Kiểu: ${field.type || 'text'}]</span>
					${optionsInfo}
					${isKpiHtml}
				</div>
				<div style="display: flex; gap: 5px; flex-shrink: 0;">
					<button type="button" onclick="editSchemaField('${field.key}')" style="padding: 3px 8px; background: #ffc107; color: #000; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85em;" title="Sửa trường">
						<i class="fa-solid fa-pen"></i>
					</button>
					<button type="button" onclick="deleteSchemaField('${field.key}')" style="padding: 3px 8px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85em;" title="Xóa trường">
						<i class="fa-solid fa-trash"></i>
					</button>
				</div>
			`;
			listContainer.appendChild(li);
		});
	}

	// 5. Tìm kiếm thời gian thực trên danh sách đã cache
	function filterSchemaFieldsList() {
	  const keyword = document.getElementById("schema-fields-search-input").value.toLowerCase().trim();
	  
	  if (!keyword) {
		renderSchemaFieldsList(cachedSchemaFields);
		return;
	  }

	  const filtered = cachedSchemaFields.filter(f => {
		const keyMatch = f.key && f.key.toLowerCase().includes(keyword);
		const labelMatch = f.label && f.label.toLowerCase().includes(keyword);
		return keyMatch || labelMatch;
	  });

	  renderSchemaFieldsList(filtered);
	}

	// 6. Xử lý Thêm mới hoặc Cập nhật Trường thông tin (Chỉ đẩy lên Firebase khi bấm Lưu/Thêm)
	async function handleFieldFormSubmit(event) {
		if (event) event.preventDefault();

		// 1. Lấy giá trị cơ bản từ form
		const keyInput = document.getElementById("field-key");
		const labelInput = document.getElementById("field-label");
		const typeSelect = document.getElementById("field-type");
		const isKpiCheckbox = document.getElementById("field-is-kpi");
		const scoreWeightInput = document.getElementById("field-score-weight");
		const kpiWeeklyInput = document.getElementById("field-kpi-weekly");
		const kpiMonthlyInput = document.getElementById("field-kpi-monthly");
		const optionsInput = document.getElementById("field-options-values");

		const fieldKey = keyInput ? keyInput.value.trim() : "";
		const fieldLabel = labelInput ? labelInput.value.trim() : "";
		const fieldType = typeSelect ? typeSelect.value : "text";
		const isKpi = isKpiCheckbox ? isKpiCheckbox.checked : false;

		if (!fieldKey || !fieldLabel) {
			alert("Vui lòng điền đầy đủ Mã trường (Key) và Tên hiển thị!");
			return;
		}

		// 2. Thu thập cấu hình KPI chung
		const scoreWeight = scoreWeightInput ? parseFloat(scoreWeightInput.value) || 0 : 0;
		const kpiWeekly = kpiWeeklyInput ? parseInt(kpiWeeklyInput.value) || 0 : 0;
		const kpiMonthly = kpiMonthlyInput ? parseInt(kpiMonthlyInput.value) || 0 : 0;

		// 3. Thu thập danh sách tùy chọn (nếu là kiểu 'options') và ma trận kpiOptions tương ứng
		let optionsArray = [];
		const kpiOptionsMap = {};

		if (fieldType === "options" && optionsInput && optionsInput.value.trim() !== "") {
			optionsArray = optionsInput.value.split(",").map(item => item.trim()).filter(item => item !== "");

			const optionRowElements = document.querySelectorAll("#kpi-options-rows-wrapper .kpi-option-row-item");
			optionRowElements.forEach(row => {
				const optValue = row.getAttribute("data-option-value");
				if (optValue) {
					const optWeight = row.querySelector(".opt-score-weight")?.value || scoreWeight;
					const optWeekly = row.querySelector(".opt-kpi-weekly")?.value || kpiWeekly;
					const optMonthly = row.querySelector(".opt-kpi-monthly")?.value || kpiMonthly;

					kpiOptionsMap[optValue] = {
						scoreWeight: parseFloat(optWeight) || 0,
						kpiWeekly: parseInt(optWeekly) || 0,
						kpiMonthly: parseInt(optMonthly) || 0
					};
				}
			});
		}

		// 4. Đóng gói object dữ liệu hoàn chỉnh
		const fieldData = {
			key: fieldKey,
			label: fieldLabel,
			type: fieldType,
			isKpi: isKpi,
			scoreWeight: scoreWeight,
			kpiWeekly: kpiWeekly,
			kpiMonthly: kpiMonthly,
			options: optionsArray,
			kpiOptions: kpiOptionsMap,
			updatedAt: getVietnamTimestamp()
		};

		try {
			const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : window.currentOrgIdGlobal;
			if (!orgId) {
				alert("Không tìm thấy thông tin đơn vị (OrgId)! Vui lòng kiểm tra lại phiên đăng nhập.");
				return;
			}

			const db = firebase.firestore();

			// Lưu vào Firestore
			await db.collection("organizations")
					.doc(orgId)
					.collection("fields")
					.doc(fieldKey)
					.set(fieldData, { merge: true });

			alert("Thêm / Cập nhật trường thông tin thành công!");

			// Reset form và trạng thái
			if (typeof resetFormFieldState === 'function') {
				resetFormFieldState();
			} else {
				document.getElementById("form-add-field")?.reset();
			}

			// 🌟 SỬA TẠI ĐÂY: Thống nhất sử dụng chung mảng cachedSchemaFields
			if (typeof cachedSchemaFields === 'undefined' || !Array.isArray(cachedSchemaFields)) {
				window.cachedSchemaFields = [];
			}
			
			// Kiểm tra xem trường này đã tồn tại trong mảng cache chưa (Sửa hay Thêm mới)
			const existingIndex = cachedSchemaFields.findIndex(f => f.key === fieldKey);
			if (existingIndex !== -1) {
				cachedSchemaFields[existingIndex] = fieldData;
			} else {
				cachedSchemaFields.push(fieldData);
			}

			// Gọi ngay hàm render giao diện với danh sách cache đã được bổ sung
			if (typeof renderSchemaFieldsList === 'function') {
				renderSchemaFieldsList(cachedSchemaFields);
			}

			// Cập nhật luôn cho checkbox ở Thẻ 4 nếu có hàm render tương ứng
			if (typeof renderModuleFieldsCheckboxes === 'function') {
				renderModuleFieldsCheckboxes();
			}

		} catch (error) {
			console.error("Lỗi khi lưu trường thông tin:", error);
			alert("Lỗi khi lưu trường thông tin: " + error.message);
		}
	}

	// 7. Đưa dữ liệu lên Form để Sửa trường
	function editSchemaField(key) {
	  const field = cachedSchemaFields.find(f => f.key === key);
	  if (!field) {
		alert("Không tìm thấy thông tin trường!");
		return;
	  }

	  document.getElementById("field-edit-mode").value = "EDIT";
	  
	  // Khóa ô Mã trường (Key) khi ở chế độ sửa để tránh lỗi lệch cấu trúc dữ liệu
	  const keyInput = document.getElementById("field-key");
	  keyInput.value = field.key;
	  keyInput.readOnly = true;
	  keyInput.style.background = "#e9ecef";

	  document.getElementById("field-label").value = field.label || "";
	  document.getElementById("field-type").value = field.type || "number";

	  const isKpiCheckbox = document.getElementById("field-is-kpi");
	  isKpiCheckbox.checked = !!field.isKpi;
	  toggleKPISettings(isKpiCheckbox.checked);

	  document.getElementById("field-score-weight").value = field.scoreWeight ?? -1;
	  document.getElementById("field-kpi-weekly").value = field.kpiWeekly ?? 3;
	  document.getElementById("field-kpi-monthly").value = field.kpiMonthly ?? 5;

	  // Đổi nhãn nút submit và hiển thị nút hủy
	  document.getElementById("btn-submit-field").textContent = "Cập nhật trường";
	  document.getElementById("btn-cancel-edit-field").style.display = "inline-block";

	  // Cuộn màn hình lên đầu form cho dễ thao tác
	  document.getElementById("form-add-field").scrollIntoView({ behavior: 'smooth' });
	}

	// 8. Hủy bỏ chế độ sửa, trả form về trạng thái thêm mới
	function resetFormFieldState() {
	  document.getElementById("field-edit-mode").value = "CREATE";
	  
	  const keyInput = document.getElementById("field-key");
	  keyInput.value = "";
	  keyInput.readOnly = false;
	  keyInput.style.background = "#fff";

	  document.getElementById("form-add-field").reset();
	  toggleKPISettings(false);

	  document.getElementById("btn-submit-field").textContent = "Thêm trường thông tin";
	  document.getElementById("btn-cancel-edit-field").style.display = "none";
	}

	// 9. Xóa trường thông tin trên Firebase và Cache
	async function deleteSchemaField(key) {
	  if (!confirm(`Bạn có chắc chắn muốn xóa trường thông tin [${key}] này không?`)) {
		return;
	  }

	  try {
		const user = firebase.auth().currentUser;
		if (!user) return;

		const orgId = await getCurrentAdminOrgId(user.uid);
		if (!orgId) return;

		const db = firebase.firestore();
		await db.collection("organizations").doc(orgId).collection("fields").doc(key).delete();

		// Cập nhật lại cache trong RAM
		cachedSchemaFields = cachedSchemaFields.filter(f => f.key !== key);
		renderSchemaFieldsList(cachedSchemaFields);

		alert("Đã xóa trường thông tin thành công!");

	  } catch (error) {
		console.error("Lỗi khi xóa trường:", error);
		alert("Lỗi khi xóa: " + error.message);
	  }
	}
	
	const previousSwitchAdminTab = window.switchAdminTab;
	window.switchAdminTab = function(tabName) {
	  if (typeof previousSwitchAdminTab === 'function') {
		previousSwitchAdminTab(tabName);
	  }
	  if (tabName === 'schema') {
		initAdminSchemaFieldsTab();
	  }
	};
	
	// ==========================================
	// TÍNH NĂNG IMPORT / EXPORT EXCEL CHO THẺ 3.1 (FIELD DEFINITIONS)
	// ==========================================

	// 1. Xuất file Excel mẫu khai báo trường thông tin
	function exportSchemaFieldsTemplateExcel() {
	  if (typeof XLSX === 'undefined') {
		alert("Thư viện Excel (SheetJS) chưa được tải!");
		return;
	  }

	  // Tạo dữ liệu mẫu mở rộng với đầy đủ 4-5 kiểu dữ liệu và hướng dẫn
	  const templateData = [
		{
		  "Mã trường (Key)": "loiDiMuon",
		  "Tên hiển thị": "Đi muộn",
		  "Kiểu dữ liệu (number/text/date/boolean/options)": "number",
		  "Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "",
		  "Tính KPI (TRUE/FALSE)": "TRUE",
		  "Trọng số điểm": -1,
		  "Ngưỡng Tuần": 3,
		  "Ngưỡng Tháng": 5
		},
		{
		  "Mã trường (Key)": "mucDoViPham",
		  "Tên hiển thị": "Mức độ vi phạm",
		  "Kiểu dữ liệu (number/text/date/boolean/options)": "options",
		  "Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "5 phút, 10 phút, 15 phút, 30 phút",
		  "Tính KPI (TRUE/FALSE)": "TRUE",
		  "Trọng số điểm": -1, // Trọng số mặc định hoặc cấu hình chi tiết
		  "Ngưỡng Tuần": 3,
		  "Ngưỡng Tháng": 5
		},
		{
		  "Mã trường (Key)": "nghiPhep",
		  "Tên hiển thị": "Nghỉ phép có phép",
		  "Kiểu dữ liệu (number/text/date/boolean/options)": "boolean",
		  "Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "",
		  "Tính KPI (TRUE/FALSE)": "FALSE",
		  "Trọng số điểm": 0,
		  "Ngưỡng Tuần": 0,
		  "Ngưỡng Tháng": 0
		},
		{
		  "Mã trường (Key)": "ghiChuViPham",
		  "Tên hiển thị": "Ghi chú chi tiết",
		  "Kiểu dữ liệu (number/text/date/boolean/options)": "text",
		  "Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "",
		  "Tính KPI (TRUE/FALSE)": "FALSE",
		  "Trọng số điểm": 0,
		  "Ngưỡng Tuần": 0,
		  "Ngưỡng Tháng": 0
		}
	  ];

	  const worksheet = XLSX.utils.json_to_sheet(templateData);

	  // Tùy chỉnh độ rộng cột Excel cho dễ nhìn (tuỳ chọn thêm)
	  worksheet['!cols'] = [
		{ wch: 20 }, // Mã trường
		{ wch: 22 }, // Tên hiển thị
		{ wch: 35 }, // Kiểu dữ liệu
		{ wch: 45 }, // Danh sách tùy chọn
		{ wch: 20 }, // Tính KPI
		{ wch: 15 }, // Trọng số điểm
		{ wch: 15 }, // Ngưỡng Tuần
		{ wch: 15 }  // Ngưỡng Tháng
	  ];

	  const workbook = XLSX.utils.book_new();
	  XLSX.utils.book_append_sheet(workbook, worksheet, "MauKhaiBaoTruong");

	  // Xuất file tải về
	  XLSX.writeFile(workbook, "Mau_Khai_Bao_Truong_Thong_Tin_Chuan.xlsx");
	}

	// 2. Import danh sách trường thông tin từ file Excel
	async function importSchemaFieldsFromExcel(event) {
	  const fileInput = event.target;
	  const file = fileInput.files[0];
	  if (!file) return;

	  if (typeof XLSX === 'undefined') {
		alert("Thư viện Excel (SheetJS) chưa được tải!");
		fileInput.value = "";
		return;
	  }

	  const reader = new FileReader();
	  reader.onload = async function (e) {
		try {
		  const data = new Uint8Array(e.target.result);
		  const workbook = XLSX.read(data, { type: 'array' });
		  const firstSheetName = workbook.SheetNames[0];
		  const worksheet = workbook.Sheets[firstSheetName];
		  const rows = XLSX.utils.sheet_to_json(worksheet);

		  if (!rows || rows.length === 0) {
			alert("File Excel không có dữ liệu!");
			fileInput.value = "";
			return;
		  }

		  const user = firebase.auth().currentUser;
		  if (!user) return;

		  const orgId = await getCurrentAdminOrgId(user.uid);
		  if (!orgId) {
			alert("Không tìm thấy thông tin đơn vị!");
			fileInput.value = "";
			return;
		  }

		  const db = firebase.firestore();
		  let countSuccess = 0;
		  const batch = db.batch(); // Dùng Firestore Batch để ghi hàng loạt cực nhanh

		  rows.forEach(row => {
			// Đọc các cột (có hỗ trợ fallback tên cột linh hoạt cho cả file mẫu mới và cũ)
			const key = String(row["Mã trường (Key)"] || row["key"] || "").trim();
			const label = String(row["Tên hiển thị"] || row["label"] || "").trim();
			if (!key || !label) return; // Bỏ qua nếu thiếu dữ liệu bắt buộc

			// Hỗ trợ đầy đủ 5 kiểu dữ liệu: number, text, date, boolean, options
			const rawType = String(row["Kiểu dữ liệu (number/text/date/boolean/options)"] || row["Kiểu dữ liệu (number/text/date)"] || row["type"] || "number").trim().toLowerCase();
			const validTypes = ["number", "text", "date", "boolean", "options"];
			const type = validTypes.includes(rawType) ? rawType : "number";

			// Xử lý danh sách tùy chọn nếu là kiểu options
			let optionsArray = [];
			let kpiOptionsConfig = {};
			if (type === "options") {
			  const rawOptionsText = String(row["Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)"] || row["options"] || "").trim();
			  if (rawOptionsText) {
				optionsArray = rawOptionsText.split(",").map(item => item.trim()).filter(item => item.length > 0);
			  }
			  
			  // Nếu có danh sách options và có tính KPI, tạm thời gán cấu hình mặc định cho từng option từ các cột chung nếu người dùng điền trong excel
			  const defaultWeight = parseFloat(row["Trọng số điểm"] || row["scoreWeight"]) || -1;
			  const defaultWeekly = parseInt(row["Ngưỡng Tuần"] || row["kpiWeekly"]) || 3;
			  const defaultMonthly = parseInt(row["Ngưỡng Tháng"] || row["kpiMonthly"]) || 5;

			  optionsArray.forEach(opt => {
				kpiOptionsConfig[opt] = {
				  scoreWeight: defaultWeight,
				  weeklyThreshold: defaultWeekly,
				  monthlyThreshold: defaultMonthly
				};
			  });
			}
			
			// Xử lý cờ KPI (nhận diện chữ TRUE, true, 1, '1'...)
			const rawIsKpi = String(row["Tính KPI (TRUE/FALSE)"] || row["isKpi"] || "").trim().toUpperCase();
			const isKpi = rawIsKpi === "TRUE" || rawIsKpi === "1" || rawIsKpi === "YES";

			const scoreWeight = parseFloat(row["Trọng số điểm"] || row["scoreWeight"]) || (isKpi ? -1 : 0);
			const kpiWeekly = parseInt(row["Ngưỡng Tuần"] || row["kpiWeekly"]) || (isKpi ? 3 : 0);
			const kpiMonthly = parseInt(row["Ngưỡng Tháng"] || row["kpiMonthly"]) || (isKpi ? 5 : 0);

			// Đóng gói dữ liệu chuẩn phân tách
			const fieldData = {
			  key,
			  label,
			  type,
			  options: optionsArray,
			  kpiOptions: kpiOptionsConfig,
			  isKpi,
			  scoreWeight: (type === "options") ? 0 : (isKpi ? scoreWeight : 0),
			  kpiWeekly: (type === "options") ? 0 : (isKpi ? kpiWeekly : 0),
			  kpiMonthly: (type === "options") ? 0 : (isKpi ? kpiMonthly : 0),
			  updatedAt: getVietnamTimestamp()
			};

			const docRef = db.collection("organizations").doc(orgId).collection("fields").doc(key);
			batch.set(docRef, fieldData, { merge: true });

			// Cập nhật hoặc thêm trực tiếp vào cache RAM
			const existingIndex = cachedSchemaFields.findIndex(f => f.key === key);
			if (existingIndex !== -1) {
			  cachedSchemaFields[existingIndex] = fieldData;
			} else {
			  cachedSchemaFields.push(fieldData);
			}

			countSuccess++;
		  });

		  if (countSuccess > 0) {
			await batch.commit(); // Thực thi ghi lên Firebase
			renderSchemaFieldsList(cachedSchemaFields);
			alert(`Đã import thành công ${countSuccess} trường thông tin từ Excel!`);
		  } else {
			alert("Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại tên cột theo file mẫu mới nhất!");
		  }

		} catch (error) {
		  console.error("Lỗi khi import Excel:", error);
		  alert("Lỗi khi đọc file Excel: " + error.message);
		} finally {
		  fileInput.value = ""; // Reset input file
		}
	  };

	  reader.readAsArrayBuffer(file);
	}
	
	
	//==========================
	//	THẺ 3 - PHẦN 2
	//==========================
	
	// 1. Render danh sách các trường thông tin từ cache cho phần tạo bài toán
	function renderModuleFieldsCheckboxes(selectedFieldKeys = []) {
		const container = document.getElementById("module-fields-checkboxes");
		if (!container) return;

		if (!cachedSchemaFields || cachedSchemaFields.length === 0) {
			container.innerHTML = '<i style="color: #6c757d; font-size: 0.9em;">Chưa có trường thông tin nào được tạo ở Thẻ 3.</i>';
			return;
		}

		let html = "";

		cachedSchemaFields.forEach(field => {
			const isChecked = selectedFieldKeys.includes(field.key) ? "checked" : "";
			const badgeType = field.type ? `(${field.type})` : "";
			const kpiIcon = field.isKpi ? '<span style="color: #fd7e14; font-size: 0.8em;" title="Có tính KPI">⭐</span>' : '';

			// 🌟 Chuyển toàn bộ object field thành chuỗi JSON để nhét an toàn vào thuộc tính data-field-obj
			const fieldJsonStr = JSON.stringify(field).replace(/"/g, '&quot;');

			html += `
			  <label class="module-field-item" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; margin-bottom: 3px; cursor: pointer; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">
				<div style="display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
				  <!-- 🌟 Đính kèm toàn bộ dữ liệu gốc vào input checkbox -->
				  <input type="checkbox" name="module_field_chk" value="${field.key}" data-field-obj="${fieldJsonStr}" ${isChecked} style="margin-right: 8px;">
				  <span style="font-weight: 500; color: #333; margin-right: 4px;">${field.label}</span>
				  <span style="color: #888; font-size: 0.8em; margin-right: 4px;">[${field.key}]</span>
				  ${kpiIcon}
				</div>
				<span style="font-size: 0.75em; background: #e9ecef; color: #495057; padding: 1px 5px; border-radius: 3px; flex-shrink: 0;">${badgeType}</span>
			  </label>
			`;
		});

		container.innerHTML = html;
	}

	// 2. Tìm kiếm thời gian thực (lọc các checkbox đang hiển thị)
	function filterModuleFieldsCheckboxes() {
	  const searchInput = document.getElementById("mod-fields-search-input");
	  if (!searchInput) return;

	  const keyword = searchInput.value.toLowerCase().trim();
	  const container = document.getElementById("module-fields-checkboxes");
	  if (!container) return;

	  const items = container.querySelectorAll(".module-field-item");

	  items.forEach(item => {
		const text = item.textContent.toLowerCase();
		if (text.includes(keyword)) {
		  item.style.display = "flex";
		} else {
		  item.style.display = "none";
		}
	  });
	}

	// 3. Thao tác nhanh: Chọn tất cả hoặc Bỏ chọn tất cả các trường đang hiện diện
	function selectAllModuleFields(selectStatus) {
	  const container = document.getElementById("module-fields-checkboxes");
	  if (!container) return;

	  // Chỉ tác động đến các checkbox đang hiển thị (phục vụ cả trường hợp đang lọc theo từ khóa)
	  const checkboxes = container.querySelectorAll(".module-field-item");
	  checkboxes.forEach(item => {
		if (item.style.display !== "none") {
		  const checkbox = item.querySelector("input[type='checkbox']");
		  if (checkbox) checkbox.checked = selectStatus;
		}
	  });
	}

	// 4. Xử lý lưu Bài toán Module lên Firestore và cập nhật Cache RAM
	async function createModule() {
		const modeInput = document.getElementById("module-edit-mode");
		const idInput = document.getElementById("mod-id");
		const nameInput = document.getElementById("mod-name");
		const targetTypeSelect = document.getElementById("mod-target-type");

		const mode = modeInput ? modeInput.value : "CREATE";
		const modId = idInput ? idInput.value.trim() : "";
		const modName = nameInput ? nameInput.value.trim() : "";
		const targetType = targetTypeSelect ? targetTypeSelect.value : "STUDENT";

		if (!modId || !modName) {
			alert("Vui lòng điền đầy đủ Mã bài toán và Tên bài toán thống kê!");
			if (idInput && !modId) idInput.focus();
			return;
		}

		// 🌟 Thu thập CHI TIẾT thông tin các trường thông tin được tích chọn qua dataset
		const selectedFields = [];
		const checkboxes = document.querySelectorAll("#module-fields-checkboxes input[name='module_field_chk']:checked");
		
		checkboxes.forEach(cb => {
			try {
				const fieldObjStr = cb.dataset.fieldObj;
				if (fieldObjStr) {
					const parsedField = JSON.parse(fieldObjStr);
					selectedFields.push(parsedField);
				}
			} catch (e) {
				console.error("Lỗi parse dữ liệu field:", e);
			}
		});

		if (selectedFields.length === 0) {
			alert("Vui lòng tích chọn ít nhất một trường thông tin cho bài toán này!");
			return;
		}

		// Chuẩn hóa hàm thời gian an toàn tuyệt đối
		const timestampValue = (typeof getVietnamTimestamp === 'function')
			? getVietnamTimestamp()
			: new Date().toISOString();

		const moduleData = {
			id: modId,
			name: modName,
			targetType: targetType, // "STUDENT" hoặc "TEACHER"
			fields: selectedFields, // 👈 Mảng các object chứa đầy đủ: key, label, type, options, cấu hình KPI...
			updatedAt: timestampValue
		};

		try {
			// Sử dụng đúng biến toàn cục window.currentOrgIdGlobal của Admin
			const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : window.currentOrgIdGlobal;
			if (!orgId) {
				alert("Không tìm thấy thông tin đơn vị (OrgId)! Vui lòng kiểm tra lại phiên đăng nhập.");
				return;
			}

			const db = firebase.firestore();

			// Lưu lên Firestore theo đường dẫn chuẩn: organizations/{orgId}/modules/{modId}
			await db.collection("organizations")
					.doc(orgId)
					.collection("modules")
					.doc(modId)
					.set(moduleData, { merge: true });

			// Cập nhật Cache RAM của danh sách module
			if (typeof cachedModulesList !== 'undefined' && Array.isArray(cachedModulesList)) {
				const existingIndex = cachedModulesList.findIndex(m => m.id === modId);
				if (existingIndex !== -1) {
					cachedModulesList[existingIndex] = moduleData;
				} else {
					cachedModulesList.push(moduleData);
				}
			}

			alert(mode === 'CREATE' ? "Khởi tạo Bài toán Module thành công!" : "Cập nhật Bài toán Module thành công!");
			
			// Reset form về trạng thái ban đầu
			if (typeof resetModuleFormState === 'function') {
				resetModuleFormState();
			}

			// 1. Render lại bảng danh sách bài toán ngay lập tức từ cache RAM
			if (typeof renderModulesTable === 'function' && typeof cachedModulesList !== 'undefined') {
				renderModulesTable(cachedModulesList);
			}

			// 2. Cập nhật lại các checkbox / filter gán module trên giao diện
			if (typeof renderAssignModulesCheckboxes === 'function') {
				renderAssignModulesCheckboxes([], true); 
			}

			// 🌟 3. Tự động làm mới và render lại bảng rà soát phân công ngay lập tức
			if (typeof loadAssignedUsersListByModule === 'function') {
				await loadAssignedUsersListByModule();
			}

		} catch (error) {
			console.error("Lỗi lưu bài toán module:", error);
			alert("Lỗi khi lưu bài toán: " + error.message);
		}
	}
	
	let cachedModulesList = []; // Kho chứa cache RAM cho danh sách bài toán

	async function loadModulesList(forceRefresh = false) {
	  console.log("👉 Đang chạy hàm loadModulesList()...");
	  
	  const container = document.getElementById("modules-list-container");
	  if (!container) {
		console.error("❌ Không tìm thấy phần tử HTML có id='modules-list-container' trên giao diện!");
		return;
	  }

	  // 1. Kiểm tra Cache RAM
	  if (!forceRefresh && Array.isArray(cachedModulesList) && cachedModulesList.length > 0) {
		console.log("⚡ Dùng dữ liệu từ Cache RAM:", cachedModulesList);
		renderModulesTable(cachedModulesList);
		return;
	  }

	  container.innerHTML = '<div style="padding: 10px; text-align: center; color: #6c757d; font-size: 0.9em;">Đang tải danh sách bài toán...</div>';

	  try {
		// 2. Lấy OrgId của đơn vị thông qua hàm phụ trợ và biến toàn cục
		const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : currentOrgIdGlobal;
		console.log("🏢 OrgId hiện tại:", orgId);
		
		if (!orgId) {
		  container.innerHTML = '<div style="padding: 10px; text-align: center; color: red; font-size: 0.9em;">Không tìm thấy thông tin đơn vị hoặc chưa đăng nhập.</div>';
		  return;
		}

		const db = firebase.firestore();
		// 🌟 Đường dẫn mới: organizations > {orgId} > modules (Ngang cấp với users, dùng chung cho mọi năm học)
		const path = `organizations/${orgId}/modules`;
		console.log("📂 Đang query Firestore tại đường dẫn:", path);

		// 3. Truy vấn Firestore
		const snapshot = await db.collection("organizations")
								 .doc(orgId)
								 .collection("modules")
								 .get();

		console.log("📦 Số lượng bài toán tìm thấy trong Firestore:", snapshot.size);

		cachedModulesList = [];
		snapshot.forEach(doc => {
		  cachedModulesList.push({ id: doc.id, ...doc.data() });
		});

		renderModulesTable(cachedModulesList);

	  } catch (error) {
		console.error("❌ Lỗi ngoại lệ khi tải danh sách bài toán:", error);
		container.innerHTML = `<div style="padding: 10px; text-align: center; color: red; font-size: 0.9em;">Lỗi tải: ${error.message}</div>`;
	  }
	}

	// Hàm render bảng giao diện bài toán
	function renderModulesTable(modulesToRender) {
	  const container = document.getElementById("modules-list-container");
	  if (!container) return;

	  if (modulesToRender.length === 0) {
		container.innerHTML = '<div style="padding: 10px; text-align: center; color: #6c757d; font-style: italic; font-size: 0.9em;">Chưa có bài toán module nào trong năm học này.</div>';
		return;
	  }

	  let html = `
		<table style="width: 100%; border-collapse: collapse; font-size: 0.85em; background: #fff;">
		  <thead>
			<tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6; text-align: left;">
			  <th style="padding: 6px; border: 1px solid #dee2e6;">Mã / Tên Bài Toán</th>
			  <th style="padding: 6px; border: 1px solid #dee2e6; width: 80px; text-align: center;">Đối tượng</th>
			  <th style="padding: 6px; border: 1px solid #dee2e6;">Trường cấu hình</th>
			  <th style="padding: 6px; border: 1px solid #dee2e6; width: 70px; text-align: center;">Thao tác</th>
			</tr>
		  </thead>
		  <tbody>
	  `;

	  modulesToRender.forEach(mod => {
		// 🌟 Xử lý chuyển đổi mảng fields (dù là dạng chuỗi hay dạng object đều hiển thị đẹp mắt)
		let fieldsText = "Không có";
		if (Array.isArray(mod.fields) && mod.fields.length > 0) {
			fieldsText = mod.fields.map(f => {
				if (typeof f === 'object' && f !== null) {
					return f.label || f.key || JSON.stringify(f);
				}
				return String(f);
			}).join(", ");
		} else if (typeof mod.fields === 'string') {
			fieldsText = mod.fields;
		}

		const targetBadge = mod.targetType === "TEACHER" 
		  ? '<span style="background: #e2e3e5; color: #383d41; padding: 1px 4px; border-radius: 3px;">Giáo viên</span>' 
		  : '<span style="background: #e7f1ff; color: #0d6efd; padding: 1px 4px; border-radius: 3px;">Học sinh</span>';

		html += `
		  <tr style="border-bottom: 1px solid #dee2e6;">
			<td style="padding: 6px; border: 1px solid #dee2e6;"><b>${mod.name || mod.id}</b><br><small style="color:#666;">${mod.id}</small></td>
			<td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">${targetBadge}</td>
			<td style="padding: 6px; border: 1px solid #dee2e6; color: #495057;">${fieldsText}</td>
			<td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; white-space: nowrap;">
			  <button type="button" onclick="editModule('${mod.id}')" style="padding: 2px 6px; background: #ffc107; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85em; font-weight: bold; margin-right: 4px;">Sửa</button>
			  <button type="button" onclick="deleteModule('${mod.id}')" style="padding: 2px 6px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85em; font-weight: bold;">Xóa</button>
			</td>
		  </tr>
		`;
	});

	  html += `</tbody></table>`;
	  container.innerHTML = html;
	}

	// 5. Reset trạng thái form bài toán về mặc định + cập nhật bài toán khi bấm nút Tạo bài toán
	function resetModuleFormState() {
	  const form = document.getElementById("form-create-module");
	  if (form) form.reset();

	  const modeInput = document.getElementById("module-edit-mode");
	  if (modeInput) modeInput.value = "CREATE";

	  const idInput = document.getElementById("mod-id");
	  if (idInput) idInput.disabled = false; // Cho phép sửa lại mã nếu tạo mới

	  const btnCancel = document.getElementById("btn-cancel-edit-module");
	  if (btnCancel) btnCancel.style.display = "none";

	  const btnSubmit = document.getElementById("btn-submit-module");
	  if (btnSubmit) btnSubmit.textContent = "Khởi tạo Bài toán Module";

	  // Reset lại danh sách checkbox (bỏ tích toàn bộ)
	  if (typeof renderModuleFieldsCheckboxes === 'function') {
		renderModuleFieldsCheckboxes([]);
	  }
	}
	
	//======SỬA XÓA BÀI TOÁN======//
	// Đổ thông tin bài toán ngược lại lên form để chỉnh sửa
	function editModule(modId) {
	  const mod = cachedModulesList.find(m => m.id === modId);
	  if (!mod) return;

	  // Chuyển chế độ form thành EDIT
	  const modeInput = document.getElementById("module-edit-mode");
	  if (modeInput) modeInput.value = "EDIT";

	  const idInput = document.getElementById("mod-id");
	  if (idInput) {
		idInput.value = mod.id;
		idInput.disabled = true; // Khóa mã bài toán không cho sửa khi đang ở chế độ chỉnh sửa
	  }

	  const nameInput = document.getElementById("mod-name");
	  if (nameInput) nameInput.value = mod.name || "";

	  const targetTypeSelect = document.getElementById("mod-target-type");
	  if (targetTypeSelect) targetTypeSelect.value = mod.targetType || "STUDENT";

	  // Render lại danh sách checkbox và tích chọn sẵn các trường đã lưu của bài toán này
	  if (typeof renderModuleFieldsCheckboxes === 'function') {
		renderModuleFieldsCheckboxes(mod.fields || []);
	  }

	  // Đổi nhãn nút submit và hiển thị nút hủy sửa
	  const btnSubmit = document.getElementById("btn-submit-module");
	  if (btnSubmit) btnSubmit.textContent = "Cập nhật Bài toán Module";

	  const btnCancel = document.getElementById("btn-cancel-edit-module");
	  if (btnCancel) btnCancel.style.display = "inline-block";

	  // Cuộn màn hình lên đầu form để dễ thao tác
	  const formElem = document.getElementById("form-create-module");
	  if (formElem) formElem.scrollIntoView({ behavior: 'smooth' });
	}
	
	// Xóa bài toán module khỏi Firestore và Cache RAM
	async function deleteModule(modId) {
	  if (!confirm(`Bạn có chắc chắn muốn xóa bài toán [${modId}] này không?`)) {
		return;
	  }

	  try {
		// 🌟 1. Dùng hàm phụ trợ để lấy OrgId đồng bộ như các hàm khác
		const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : currentOrgIdGlobal;
		if (!orgId) {
		  alert("Không tìm thấy thông tin đơn vị (OrgId)!");
		  return;
		}

		const db = firebase.firestore();

		// 🌟 2. Sửa lại đường dẫn xóa (Ngang cấp users, trỏ thẳng vào modules)
		await db.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.doc(modId)
				.delete();

		// 3. Xóa khỏi Cache RAM
		if (typeof cachedModulesList !== 'undefined') {
		  cachedModulesList = cachedModulesList.filter(m => m.id !== modId);
		}

		// 4. Vẽ lại bảng danh sách ngay lập tức từ cache RAM
		if (typeof renderModulesTable === 'function' && typeof cachedModulesList !== 'undefined') {
		  renderModulesTable(cachedModulesList);
		}

		alert("Đã xóa bài toán thành công!");

	  } catch (error) {
		console.error("Lỗi khi xóa bài toán:", error);
		alert("Lỗi khi xóa bài toán: " + error.message);
	  }
	  
	}
	
	
	//===========================
	//	THẺ 3 - PHẦN 3: PHÂN CÔNG NHIỆM VỤ
	//===========================
	//	3.0	Gọi tự động các hàm cập nhật bên dưới
	function initAssignmentCard3() {
	  loadCard3StaffMembers();       // Tự động bốc dữ liệu từ cache Thẻ 1, lọc TEACHER và đổ vào danh sách chọn
	  renderAssignModulesCheckboxes(); // Tự động đổ danh sách bài toán module đã tạo
	  loadAssignedUsersListByModule(); // Tự động tải bảng rà soát bên dưới
	}
	
	//	3.1. Khởi tạo danh sách nhân sự
	//===========================
	async function loadCard3StaffMembers() {
	  const radioContainer = document.getElementById("card3-members-radio-container");
	  const categorySelect = document.getElementById("select-card3-group-category");
	  if (!radioContainer) return;

	  // 🌟 Nếu cache ở Thẻ 1 chưa có, tự động gọi tải ngầm luôn không cần sang Thẻ 1
	  if (typeof currentLoadedEntities === 'undefined' || currentLoadedEntities.length === 0) {
		try {
		  const user = firebase.auth().currentUser;
		  if (!user) return;
		  const orgId = await getCurrentAdminOrgId(user.uid);
		  const db = firebase.firestore();
		  const snapshot = await db.collection("organizations").doc(orgId).collection("users").get();

		  currentLoadedEntities = [];
		  snapshot.forEach(doc => {
			const data = doc.data();
			const role = (data.role || "").toUpperCase();
			if (role === "TEACHER" || role === "STUDENT") {
			  currentLoadedEntities.push({ id: doc.id, ...data });
			}
		  });
		  isEntitiesCacheLoaded = true;
		} catch (e) {
		  console.error("Lỗi tự động tải nhân sự:", e);
		}
	  }

	  // Lọc chỉ lấy giáo viên (TEACHER)
	  const teacherList = currentLoadedEntities.filter(item => (item.role || "").toUpperCase() === "TEACHER");

	  if (teacherList.length === 0) {
		radioContainer.innerHTML = '<i style="color: #6c757d; font-size: 0.9em;">Không tìm thấy nhân sự giáo viên nào trong hệ thống.</i>';
		return;
	  }

	  // Đổ dữ liệu tổ chuyên môn vào ô select lọc
	  const categoriesSet = new Set();
	  teacherList.forEach(staff => {
		if (staff.category || staff.organizationUnit) {
		  categoriesSet.add(staff.category || staff.organizationUnit);
		}
	  });

	  if (categorySelect) {
		let catHtml = '<option value="">-- Tất cả Tổ/Đơn vị --</option>';
		categoriesSet.forEach(cat => {
		  catHtml += `<option value="${cat}">${cat}</option>`;
		});
		categorySelect.innerHTML = catHtml;
	  }

	  renderCard3StaffRadio(teacherList);
	}

	// Render danh sách Radio nhân sự ra giao diện
	function renderCard3StaffRadio(staffArray) {
	  const radioContainer = document.getElementById("card3-members-radio-container");
	  if (!radioContainer) return;

	  if (staffArray.length === 0) {
		radioContainer.innerHTML = '<i style="color: #6c757d; font-size: 0.9em;">Không tìm thấy nhân sự phù hợp.</i>';
		return;
	  }

	  let html = "";
	  staffArray.forEach(staff => {
		html += `
		  <label class="card3-staff-item" style="display: flex; align-items: center; padding: 4px 6px; margin-bottom: 2px; cursor: pointer; border-radius: 3px;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">
			<input type="radio" name="selected_staff_radio" value="${staff.id}" data-name="${staff.fullName || ''}" data-email="${staff.email || ''}" data-role="${staff.role || 'TEACHER'}" onchange="onCard3StaffRadioChange(this)" style="margin-right: 8px;">
			<div>
			  <span style="font-weight: 500; color: #333;">${staff.fullName || "Chưa đặt tên"}</span>
			  <small style="color: #666; margin-left: 6px;">(${staff.email || "Chưa có email"})</small>
			</div>
		  </label>
		`;
	  });

	  radioContainer.innerHTML = html;
	}
	
	//	Reset sạch toàn bộ các checkbox module về trạng thái chưa tích.

	// 	Đọc dữ liệu phân công cũ của giáo viên mới chọn từ Firestore và tích lại chính xác.
	async function onCard3StaffRadioChange(radioElement) {
		const memberId = radioElement.value;
		const teacherEmail = radioElement.getAttribute("data-email");
		
		// 🌟 Dùng chung biến với Thẻ 2
		card2SelectedMemberId = memberId; 

		// 1. Reset sạch toàn bộ các checkbox phân công module ở Thẻ 3
		document.querySelectorAll('input[name="chk_assign_module"]').forEach(chk => {
			chk.checked = false;
		});

		if (!teacherEmail) return;

		try {
			const orgId = window.currentOrgIdGlobal;
			let academicYearId = currentAcademicYear || "";
			const yearsArr = window.currentAcademicYearsGlobal;
			if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
				const lastYearItem = yearsArr[yearsArr.length - 1];
				academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
			}

			if (!orgId || !academicYearId) return;

			const db = firebase.firestore();
			// Đọc bản ghi phân công của giáo viên này (theo email làm doc ID như chúng ta đã thống nhất)
			const docSnap = await db.collection("organizations")
									.doc(orgId)
									.collection("academicYears")
									.doc(academicYearId)
									.collection("assignments")
									.doc(teacherEmail.toLowerCase().trim())
									.get();

			if (docSnap.exists) {
				const data = docSnap.data();
				const assignedModules = Array.isArray(data.modules) ? data.modules : [];

				// 2. Tích chọn lại đúng các module mà giáo viên này đã được gán trước đó
				document.querySelectorAll('input[name="chk_assign_module"]').forEach(chk => {
					if (assignedModules.includes(chk.value)) {
						chk.checked = true;
					}
				});
			}

		} catch (error) {
			console.error("Lỗi tải phân công module của giáo viên:", error);
		}
	}

	// Lọc theo Tổ/Đơn vị
	function filterCard3MembersByCategory() {
	  const categorySelect = document.getElementById("select-card3-group-category");
	  const selectedCat = categorySelect ? categorySelect.value : "";

	  // Lấy danh sách giáo viên từ cache Thẻ 1
	  const teacherList = (typeof currentLoadedEntities !== 'undefined') 
		? currentLoadedEntities.filter(item => (item.role || "").toUpperCase() === "TEACHER") 
		: [];

	  const filtered = selectedCat 
		? teacherList.filter(s => s.category === selectedCat)
		: teacherList;

	  renderCard3StaffRadio(filtered);
	}

	// Tìm kiếm nhân sự thời gian thực theo tên hoặc email
	function filterCard3MembersByKeyword() {
	  const searchInput = document.getElementById("card3-member-search");
	  const keyword = searchInput ? searchInput.value.toLowerCase().trim() : "";

	  const container = document.getElementById("card3-members-radio-container");
	  if (!container) return;

	  const items = container.querySelectorAll(".card3-staff-item");
	  items.forEach(item => {
		const text = item.textContent.toLowerCase();
		item.style.display = text.includes(keyword) ? "flex" : "none";
	  });
	}
	//  CẬP NHẬT DANH SÁCH BÀI TOÁN
	// Hàm render danh sách checkbox bài toán cho Phần 3.3 (Dùng chung cachedModulesList)
	async function renderAssignModulesCheckboxes(selectedModuleIds = [], forceRefresh = false) {
	  const container = document.getElementById("assign-modules-checkboxes");
	  const filterSelect = document.getElementById("select-assigned-filter-module");
	  if (!container) return;

	  // 🌟 Chuẩn hóa mảng selectedIds an toàn
	  const selectedIds = Array.isArray(selectedModuleIds) ? selectedModuleIds : [];

	  // 🌟 Nếu ép tải mới (forceRefresh = true) hoặc cache trống, gọi loadModulesList để lấy dữ liệu từ server
	  if (forceRefresh || !Array.isArray(cachedModulesList) || cachedModulesList.length === 0) {
		if (typeof loadModulesList === 'function') {
		  container.innerHTML = '<p style="color: #6c757d; margin: 0; font-size: 0.9em;"><i>Đang đồng bộ danh sách bài toán...</i></p>';
		  await loadModulesList(forceRefresh); // Chờ tải xong dữ liệu mới chạy tiếp
		}
	  }

	  // Kiểm tra lại sau khi nạp cache
	  if (!Array.isArray(cachedModulesList) || cachedModulesList.length === 0) {
		container.innerHTML = '<p style="color: #6c757d; margin: 0; font-size: 0.9em;"><i>Chưa có bài toán module nào</i></p>';
		if (filterSelect) filterSelect.innerHTML = '<option value="">-- Không có module nào --</option>';
		return;
	  }

	  let chkHtml = "";
	  let selectHtml = '<option value="">-- Tất cả các Module --</option>';

	  cachedModulesList.forEach(mod => {
		const isChecked = selectedIds.includes(mod.id) ? "checked" : "";
		chkHtml += `
		  <label class="assign-mod-item" style="display: flex; align-items: center; padding: 4px 6px; margin-bottom: 2px; cursor: pointer; border-radius: 3px;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">
			<input type="checkbox" name="chk_assign_module" value="${mod.id}" ${isChecked} style="margin-right: 8px;">
			<div>
			  <span style="font-weight: 500; color: #333;">${mod.name || mod.id}</span>
			  <small style="color: #666; margin-left: 6px;">[${mod.id}]</small>
			</div>
		  </label>
		`;
		selectHtml += `<option value="${mod.id}">${mod.name || mod.id} [${mod.id}]</option>`;
	  });

	  container.innerHTML = chkHtml;
	  if (filterSelect) filterSelect.innerHTML = selectHtml;
	}
	//===========================
	//	LƯU PHÂN CÔNG NHIỆM VỤ
	//===========================
	document.getElementById("form-assign-permission").addEventListener("submit", async function(event) {
		event.preventDefault();

		const selectedRadio = document.querySelector("input[name='selected_staff_radio']:checked");
		if (!selectedRadio) {
			alert("Vui lòng chọn một nhân sự/giáo viên cần phân công!");
			return;
		}

		const staffUid = selectedRadio.value;
		const staffName = selectedRadio.getAttribute("data-name");
		const staffEmail = selectedRadio.getAttribute("data-email");
		const staffRole = selectedRadio.getAttribute("data-role");

		if (!staffEmail) {
			alert("Nhân sự này chưa có email, không thể lưu phân công theo hệ thống chuẩn!");
			return;
		}

		const teacherEmail = String(staffEmail).toLowerCase().trim();

		// Thu thập danh sách các bài toán module được tích chọn (khớp với name='chk_assign_module')
		const selectedModules = [];
		const moduleCheckboxes = document.querySelectorAll("#assign-modules-checkboxes input[name='chk_assign_module']:checked");
		moduleCheckboxes.forEach(chk => {
			selectedModules.push(chk.value);
		});

		if (selectedModules.length === 0) {
			alert("Vui lòng tích chọn ít nhất một Bài toán Module cấp quyền!");
			return;
		}

		const msgElem = document.getElementById("assign-msg");
		if (msgElem) {
			msgElem.style.color = "blue";
			msgElem.textContent = "Đang lưu phân công nhiệm vụ...";
		}

		try {
			const user = firebase.auth().currentUser;
			if (!user) return;
			const orgId = await getCurrentAdminOrgId(user.uid);
			if (!orgId) return;

			// Lấy ID năm học chuẩn từ biến mảng window.currentAcademicYearIdGlobal hoặc currentAcademicYear
			let academicYearId = currentAcademicYear || "";
			const yearsArr = window.currentAcademicYearIdGlobal;
			if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
				const lastYearItem = yearsArr[yearsArr.length - 1];
				academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
			}

			if (!academicYearId) {
				alert("Không xác định được năm học hiện tại.");
				return;
			}

			const db = firebase.firestore();
			
			// 🌟 GỘP CHUNG VÀO DOCUMENT CÓ ID LÀ EMAIL (SỬ DỤNG { merge: true })
			// Đường dẫn: /organizations/{orgId}/academicYears/{academicYearId}/assignments/{teacherEmail}
			await db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicYearId)
					.collection("assignments")
					.doc(teacherEmail) // 👈 Lấy email làm Document ID thống nhất
					.set({
						email: teacherEmail,
						memberId: staffUid,
						fullName: staffName,
						role: staffRole,
						modules: selectedModules, // 👈 Đính kèm/cập nhật mảng module chuyên môn vào chung document
						updatedAt: getVietnamTimestamp()
					}, { merge: true }); // 👈 Merge giúp giữ nguyên các trường homeroom/teaching đã lưu trước đó (nếu có)

			if (msgElem) {
				msgElem.style.color = "green";
				msgElem.textContent = `Phân công module cho [${staffName}] thành công!`;
			}

			if (typeof loadAssignedUsersListByModule === 'function') {
				loadAssignedUsersListByModule();
			}

		} catch (error) {
			console.error("Lỗi lưu phân công:", error);
			if (msgElem) {
				msgElem.style.color = "red";
				msgElem.textContent = "Lỗi: " + error.message;
			}
		}
	});
	
	let cachedAssignmentsList = [];


	async function loadAssignedUsersListByModule() {
	  const tableBody = document.getElementById("assigned-users-table-body");
	  const filterModuleSelect = document.getElementById("select-assigned-filter-module");
	  if (!tableBody) return;

	  const selectedFilterMod = filterModuleSelect ? filterModuleSelect.value : "";
	  tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6c757d;">Đang tải dữ liệu rà soát...</td></tr>';

	  try {
		// 🌟 Sử dụng ensureOrgId() để lấy OrgId chuẩn xác
		const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : currentOrgIdGlobal;
		if (!orgId) {
		  tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị.</td></tr>';
		  return;
		}

		const activeYear = window.currentAcademicYear || currentAcademicYear;
		if (!activeYear) {
		  tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Chưa chọn năm học hiện tại.</td></tr>';
		  return;
		}

		const db = firebase.firestore();
		// Giữ nguyên đường dẫn phân công theo năm học (hoặc bạn có thể bỏ academicYears nếu muốn đưa ra ngoài)
		const snapshot = await db.collection("organizations")
								 .doc(orgId)
								 .collection("academicYears")
								 .doc(activeYear)
								 .collection("assignments")
								 .get();

		cachedAssignmentsList = [];
		snapshot.forEach(doc => {
		  cachedAssignmentsList.push({ id: doc.id, ...doc.data() });
		});

		// Chỉ lọc lấy những giáo viên thực sự có gán ít nhất 1 module ở Thẻ 3 này
		let displayList = cachedAssignmentsList.filter(item => Array.isArray(item.modules) && item.modules.length > 0);

		// Lọc theo module cụ thể nếu người dùng chọn trên ô select rà soát
		if (selectedFilterMod) {
		  displayList = displayList.filter(item => item.modules.includes(selectedFilterMod));
		}

		renderAssignedUsersTable(displayList);

	  } catch (error) {
		console.error("Lỗi tải rà soát phân công:", error);
		tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Lỗi tải dữ liệu rà soát.</td></tr>';
	  }
	}

	// RENDER BẢNG PHÂN CÔNG NHIỆM VỤ BỔ sung
	function renderAssignedUsersTable(listToRender) {
	  const tableBody = document.getElementById("assigned-users-table-body");
	  if (!tableBody) return;

	  if (listToRender.length === 0) {
		tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; font-style: italic; color: #6c757d;">Chưa có phân công module nào được thiết lập.</td></tr>';
		return;
	  }

	  let html = "";
	  listToRender.forEach(item => {
		// Tìm kiếm thông tin Tổ/Đơn vị từ cache nhân sự ở Thẻ 1
		let staffCategory = "Chưa phân tổ";
		if (typeof currentLoadedEntities !== 'undefined' && currentLoadedEntities.length > 0) {
		  const foundStaff = currentLoadedEntities.find(e => e.id === item.id);
		  if (foundStaff) {
			staffCategory = foundStaff.category || foundStaff.organizationUnit || foundStaff.department || "Chưa phân tổ";
		  }
		}

		// Tạo danh sách các badge module kèm nút x nhỏ để xóa trực tiếp từng module
		const modulesHtml = Array.isArray(item.modules) && item.modules.length > 0 
		  ? item.modules.map(modId => `
			  <span style="background: #e7f1ff; color: #0d6efd; padding: 3px 6px; border-radius: 4px; font-size: 0.85em; display: inline-flex; align-items: center; margin: 2px; border: 1px solid #b6d4fe;">
				<b>${modId}</b>
				<button type="button" onclick="removeModuleFromStaff('${item.id}', '${modId}')" title="Xóa module này" style="background: none; border: none; color: #dc3545; cursor: pointer; font-weight: bold; margin-left: 5px; padding: 0; font-size: 1.1em;">&times;</button>
			  </span>`).join("")
		  : '<span style="color: #888; font-style: italic;">Chưa gán module</span>';

		html += `
		  <tr style="border-bottom: 1px solid #dee2e6;">
			<td style="padding: 8px;"><b>${item.fullName || "Không tên"}</b><br><small style="color:#666;">${item.email || ""}</small></td>
			<td style="padding: 8px;"><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${staffCategory}</span></td>
			<td style="padding: 8px;">${modulesHtml}</td>
		  </tr>
		`;
	  });

	  tableBody.innerHTML = html;
	}
	
	//=====================
	//	GỠ PHÂN CÔNG BÀI TOÁN
	// Hàm xử lý khi bấm nút '×' để gỡ bỏ module được phân công của giáo viên
	async function removeModuleFromStaff(staffUid, modId) {
	  // Hiển thị hộp thoại xác nhận thân thiện
	  if (!confirm(`Bạn có chắc chắn muốn gỡ bỏ bài toán module [${modId}] khỏi nhân sự này không?`)) {
		return;
	  }

	  try {
		const user = firebase.auth().currentUser;
		if (!user) {
		  alert("Vui lòng đăng nhập lại hệ thống!");
		  return;
		}

		const orgId = await getCurrentAdminOrgId(user.uid);
		if (!orgId) {
		  alert("Không tìm thấy thông tin đơn vị!");
		  return;
		}

		// Tìm giáo viên trong mảng cache hiện tại để lọc bỏ module cần xóa
		const staff = cachedAssignmentsList.find(s => s.id === staffUid);
		if (!staff) {
		  alert("Không tìm thấy thông tin phân công của nhân sự này trong bộ nhớ tạm!");
		  return;
		}

		// Lọc mảng modules, loại bỏ module bị bấm xóa
		const updatedModules = (staff.modules || []).filter(m => m !== modId);

		const db = firebase.firestore();
		
		// Ghi đè lại mảng modules mới lên Firestore (giữ nguyên các thông tin khác nhờ { merge: true })
		await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(currentAcademicYear)
				.collection("assignments")
				.doc(staffUid)
				.set({
				  modules: updatedModules,
				  updatedAt: getVietnamTimestamp()
				}, { merge: true });

		// Cập nhật lại giá trị trong cache RAM ngay lập tức
		staff.modules = updatedModules;

		// Vẽ lại bảng rà soát để giao diện cập nhật ngay lập tức mà không cần tải lại trang
		if (typeof loadAssignedUsersListByModule === 'function') {
		  loadAssignedUsersListByModule();
		} else {
		  renderAssignedUsersTable(cachedAssignmentsList);
		}

	  } catch (error) {
		console.error("Lỗi khi gỡ module:", error);
		alert("Lỗi khi gỡ module: " + error.message);
	  }
	}
	
	// Hàm chọn tất cả hoặc bỏ chọn tất cả các module trong Thẻ 3.3
	function selectAllAssignModules(isSelectAll) {
		const checkboxes = document.querySelectorAll('input[name="chk_assign_module"]');
		checkboxes.forEach(chk => {
			// Chỉ tác động đến các checkbox đang hiển thị (phục vụ cả trường hợp đang gõ tìm kiếm)
			if (chk.closest('div').style.display !== 'none') {
				chk.checked = isSelectAll;
			}
		});
	}
	
	//====================
	//	THẺ 4 - KPI cấu hình
	//====================
	// ==========================================
	// 4.1. HÀM TẢI CẤU HÌNH MA TRẬN NGƯỠNG KPI
	// ==========================================
	async function loadMonthlyKPIRulesConfig() {
	  try {
		// 🌟 Sử dụng ensureOrgId() kết hợp biến cục bộ currentOrgIdGlobal
		const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : currentOrgIdGlobal;
		if (!orgId) return;

		const activeYear = window.currentAcademicYear || currentAcademicYear;
		if (!activeYear) return;

		const db = firebase.firestore();
		const configCollectionRef = db.collection("organizations")
									  .doc(orgId)
									  .collection("academicYears")
									  .doc(activeYear)
									  .collection("KPIconfig");

		// Tải đồng thời dữ liệu của cả Học sinh và Giáo viên từ sub-collection KPIconfig
		const [studentDoc, teacherDoc] = await Promise.all([
		  configCollectionRef.doc("student").get(),
		  configCollectionRef.doc("teacher").get()
		]);

		// Bind dữ liệu cho Học sinh
		if (studentDoc.exists) {
		  const sData = studentDoc.data();
		  document.getElementById("cfg-student-kha-weeks").value = sData.kha_weeks ?? 1;
		  document.getElementById("cfg-student-kha-count").value = sData.kha_count ?? 5;
		  document.getElementById("cfg-student-kha-score").value = sData.kha_score ?? 5;

		  document.getElementById("cfg-student-dat-weeks").value = sData.dat_weeks ?? 2;
		  document.getElementById("cfg-student-dat-count").value = sData.dat_count ?? 10;
		  document.getElementById("cfg-student-dat-score").value = sData.dat_score ?? 10;

		  document.getElementById("cfg-student-chuadat-weeks").value = sData.chuadat_weeks ?? 3;
		  document.getElementById("cfg-student-chuadat-count").value = sData.chuadat_count ?? 15;
		  document.getElementById("cfg-student-chuadat-score").value = sData.chuadat_score ?? 15;
		}

		// Bind dữ liệu cho Giáo viên / Nhân sự
		if (teacherDoc.exists) {
		  const tData = teacherDoc.data();
		  document.getElementById("cfg-teacher-kha-weeks").value = tData.kha_weeks ?? 1;
		  document.getElementById("cfg-teacher-kha-count").value = tData.kha_count ?? 2;
		  document.getElementById("cfg-teacher-kha-score").value = tData.kha_score ?? 2;

		  document.getElementById("cfg-teacher-dat-weeks").value = tData.dat_weeks ?? 2;
		  document.getElementById("cfg-teacher-dat-count").value = tData.dat_count ?? 4;
		  document.getElementById("cfg-teacher-dat-score").value = tData.dat_score ?? 4;

		  document.getElementById("cfg-teacher-chuadat-weeks").value = tData.chuadat_weeks ?? 3;
		  document.getElementById("cfg-teacher-chuadat-count").value = tData.chuadat_count ?? 6;
		  document.getElementById("cfg-teacher-chuadat-score").value = tData.chuadat_score ?? 6;
		}

	  } catch (error) {
		console.error("Lỗi tải cấu hình KPI:", error);
	  }
	}
  

	// ==========================================
	// 4.2. HÀM LƯU CẤU HÌNH MA TRẬN NGƯỠNG KPI
	// ==========================================
	async function saveMonthlyKPIRulesConfig() {
	  try {
		// 🌟 1. Sử dụng ensureOrgId() để lấy OrgId chuẩn xác
		const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : currentOrgIdGlobal;
		if (!orgId) {
		  alert("Chưa xác định được thông tin đơn vị (OrgId). Vui lòng kiểm tra lại đăng nhập!");
		  return;
		}

		const activeYear = window.currentAcademicYear || currentAcademicYear;
		if (!activeYear) {
		  alert("Chưa chọn năm học hiện tại!");
		  return;
		}

		// 🌟 2. Đóng gói dữ liệu cho Học sinh
		const studentRules = {
		  kha_weeks: Number(document.getElementById("cfg-student-kha-weeks").value) || 1,
		  kha_count: Number(document.getElementById("cfg-student-kha-count").value) || 5,
		  kha_score: Number(document.getElementById("cfg-student-kha-score").value) || 5,
		  dat_weeks: Number(document.getElementById("cfg-student-dat-weeks").value) || 2,
		  dat_count: Number(document.getElementById("cfg-student-dat-count").value) || 10,
		  dat_score: Number(document.getElementById("cfg-student-dat-score").value) || 10,
		  chuadat_weeks: Number(document.getElementById("cfg-student-chuadat-weeks").value) || 3,
		  chuadat_count: Number(document.getElementById("cfg-student-chuadat-count").value) || 15,
		  chuadat_score: Number(document.getElementById("cfg-student-chuadat-score").value) || 15,
		  updatedAt: getVietnamTimestamp()
		};

		// 🌟 3. Đóng gói dữ liệu cho Giáo viên / Nhân sự
		const teacherRules = {
		  kha_weeks: Number(document.getElementById("cfg-teacher-kha-weeks").value) || 1,
		  kha_count: Number(document.getElementById("cfg-teacher-kha-count").value) || 2,
		  kha_score: Number(document.getElementById("cfg-teacher-kha-score").value) || 2,
		  dat_weeks: Number(document.getElementById("cfg-teacher-dat-weeks").value) || 2,
		  dat_count: Number(document.getElementById("cfg-teacher-dat-count").value) || 4,
		  dat_score: Number(document.getElementById("cfg-teacher-dat-score").value) || 4,
		  chuadat_weeks: Number(document.getElementById("cfg-teacher-chuadat-weeks").value) || 3,
		  chuadat_count: Number(document.getElementById("cfg-teacher-chuadat-count").value) || 6,
		  chuadat_score: Number(document.getElementById("cfg-teacher-chuadat-score").value) || 6,
		  updatedAt: getVietnamTimestamp()
		};

		const db = firebase.firestore();
		const configCollectionRef = db.collection("organizations")
									  .doc(orgId)
									  .collection("academicYears")
									  .doc(activeYear)
									  .collection("KPIconfig");

		// 🌟 4. Lưu đồng thời 2 document vào sub-collection KPIconfig (student và teacher)
		await Promise.all([
		  configCollectionRef.doc("student").set(studentRules, { merge: true }),
		  configCollectionRef.doc("teacher").set(teacherRules, { merge: true })
		]);

		alert("💾 Lưu Ma trận Ngưỡng cho cả Học sinh và Giáo viên thành công!");
	  } catch (error) {
		console.error("Lỗi lưu ma trận KPI:", error);
		alert("Lỗi: " + error.message);
	  }
	}

	// ==========================================
	// 4.3. HÀM KHỞI TẠO TỔNG HỢP CHO THẺ 4
	// ==========================================
	function initMonthlyKPIConfigCard4() {
	  loadMonthlyKPIRulesConfig();
	}
	
	//===========================================
	//	THẺ 5
	//===========================================



	// ==========================================
	// CÁC BIẾN CACHE TOÀN CỤC CHO THẺ 5
	// ==========================================
	let cachedGridWeeklyData = {};   // Cache dữ liệu tuần
	let cachedGridMonthlyData = {};  // Cache dữ liệu tháng
	let currentDailyUnsubscribe = null; // Quản lý luồng realtime phần Ngày

	// 1. KHỞI TẠO THẺ 5
async function initGridCard5() {
    console.log("➡️ Bắt đầu chạy initGridCard5()...");

    // 1. Điền ngày hiện tại vào các ô input date/month mặc định
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

    const sec1DateEl = document.getElementById("grid-sec1-date-select");
    const sec2DateEl = document.getElementById("grid-sec2-date-select");
    const sec3MonthEl = document.getElementById("grid-sec3-month-select");

    if (sec1DateEl && !sec1DateEl.value) sec1DateEl.value = todayStr;
    if (sec2DateEl && !sec2DateEl.value) sec2DateEl.value = todayStr;
    if (sec3MonthEl && !sec3MonthEl.value) sec3MonthEl.value = currentMonthStr;

    const gridModuleSelect = document.getElementById("select-grid-module");
    if (!gridModuleSelect) {
        console.warn("⚠️ Không tìm thấy phần tử DOM #select-grid-module trên giao diện!");
        return;
    }

    // 2. Xác định OrgId chuẩn xác
    let orgId = window.currentOrgIdGlobal;
    if (!orgId && typeof ensureOrgId === 'function') {
        orgId = await ensureOrgId();
    }

    if (!orgId) {
        console.error("❌ Không tìm thấy OrgId để tải module!");
        gridModuleSelect.innerHTML = '<option value="">-- Lỗi: Chưa có thông tin đơn vị --</option>';
        return;
    }

    console.log("🏢 Đang tải danh sách module trực tiếp từ Firestore cho đơn vị:", orgId);

    // 3. Luôn luôn lấy dữ liệu trực tiếp từ Firestore
    let modulesList = [];
    try {
        const db = firebase.firestore();
        const snapshot = await db.collection("organizations").doc(orgId).collection("modules").get();
        
        snapshot.forEach(doc => {
            modulesList.push({ id: doc.id, ...doc.data() });
        });

        // Cập nhật luôn vào biến RAM toàn cục phòng hờ các module khác cần dùng
        window.cachedModulesList = modulesList;

        console.log(`✅ Đã tải thành công ${modulesList.length} bài toán module từ Firestore.`);
    } catch (error) {
        console.error("❌ Lỗi tải danh sách module từ Firestore:", error);
    }

    // 4. Nạp danh sách bài toán module vào ô select chung của Thẻ 5
    if (modulesList.length > 0) {
        let html = '<option value="">-- Chọn bài toán module --</option>';
        modulesList.forEach(mod => {
            html += `<option value="${mod.id}">${mod.name || mod.id} [${mod.id}]</option>`;
        });
        gridModuleSelect.innerHTML = html;
        
        // Tự động chọn module đầu tiên nếu chưa được chọn trước đó
        if (!gridModuleSelect.value) {
            gridModuleSelect.value = modulesList[0].id;
        }
        console.log("✨ Đã render xong danh sách module vào #select-grid-module");
    } else {
        console.warn("⚠️ Không có bài toán module nào trong Firestore!");
        gridModuleSelect.innerHTML = '<option value="">-- Chưa có bài toán module --</option>';
    }

    // 5. Tải dữ liệu toàn bộ các section của Thẻ 5
    if (typeof reloadAllGridSections === 'function') {
        reloadAllGridSections(false);
    }
}

	// 2. ĐIỀU PHỐI TỔNG (Khi đổi Module hoặc Góc nhìn)
	function reloadAllGridSections(forceRefresh = false) {
	  loadGridSection1Daily();
	  loadGridSection2Weekly(forceRefresh);
	  loadGridSection3Monthly(forceRefresh);
	}

	// ==========================================
	// 3. SECTION 5.1: NHẬT KÝ THEO NGÀY (REALTIME REAL-TIME)
	// ==========================================
	// Chuyển "2026-09-04" thành "September 4, 2026"
	function formatDateToEnglish(dateString) {
		if (!dateString) return "";
		const parts = dateString.split("-");
		if (parts.length !== 3) return dateString;
		
		const year = parts[0];
		const month = parseInt(parts[1], 10) - 1; // Tháng trong JS tính từ 0-11
		const day = parseInt(parts[2], 10);
		
		const dateObj = new Date(year, month, day);
		
		// Format theo kiểu tiếng Anh: September 4, 2026
		return dateObj.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
	
	
	
	async function loadGridSection1Daily() {
		const tableBody = document.getElementById("grid-sec1-body-rows");
		const moduleSelect = document.getElementById("select-grid-module");
		const perspectiveSelect = document.getElementById("admin-grid-perspective");

		loadSchemaFields();
		if (!tableBody || !moduleSelect) return;

		const moduleId = moduleSelect.value;
		const perspective = perspectiveSelect ? perspectiveSelect.value : "TARGET";

		if (!moduleId) {
			tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #6c757d;">Vui lòng chọn Bài toán Module ở trên.</td></tr>';
			return;
		}

		tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #6c757d;">Đang kết nối lắng nghe nhật ký biến động (auditLogs)...</td></tr>';

		// Hủy lắng nghe realtime cũ nếu có để tránh chồng chéo
		if (typeof currentDailyUnsubscribe === 'function' && currentDailyUnsubscribe) {
			currentDailyUnsubscribe();
			currentDailyUnsubscribe = null;
		}

		try {
			// 1. Lấy OrgId và AcademicYearId từ biến toàn cục chuẩn
			const orgId = window.currentOrgIdGlobal;
			if (!orgId) {
				tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị (OrgId).</td></tr>';
				return;
			}

			let academicYearId = "";
			const yearsArr = window.currentAcademicYearsGlobal;
			if (Array.isArray(yearsArr) && yearsArr.length > 0) {
				const lastYearItem = yearsArr[yearsArr.length - 1];
				academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
			} else if (window.currentAcademicYearIdGlobal) {
				academicYearId = String(window.currentAcademicYearIdGlobal).trim();
			}

			if (!academicYearId) {
				tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Chưa xác định được năm học hiện tại.</td></tr>';
				return;
			}

			const db = firebase.firestore();

			// 2. Tải trước danh sách users để tra cứu họ tên và lớp chuẩn xác
			let usersMap = {};
			try {
				const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
				usersSnap.forEach(uDoc => {
					const uData = uDoc.data();
					usersMap[uDoc.id] = {
						fullName: uData.fullName || uDoc.id,
						category: uData.category || uData.className || ""
					};
				});
			} catch (e) {
				console.warn("Không tải được bảng users:", e);
			}

			// 🌟 2.5: Xây dựng bản đồ tra cứu nhanh từ Key -> Label của các trường (dựa vào Cache Thẻ 3)
			let fieldLabelMap = {};
			const currentFields = window.cachedSchemaFields || cachedSchemaFields || [];
			currentFields.forEach(f => {
				fieldLabelMap[f.key] = f.label || f.key;
			});

			// 3. Đường dẫn chuẩn xác tới auditLogs của module
			const auditLogsRef = db.collection("organizations")
								   .doc(orgId)
								   .collection("academicYears")
								   .doc(academicYearId)
								   .collection("modulesData")
								   .doc(moduleId)
								   .collection("auditLogs");

			// 4. Lắng nghe realtime collection `auditLogs`
			currentDailyUnsubscribe = auditLogsRef.onSnapshot(snapshot => {
				if (snapshot.empty) {
					tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; font-style: italic; color: #6c757d;">Chưa có lịch sử nhật ký biến động nào cho module này.</td></tr>`;
					return;
				}

				let aggregatedMap = {};
				let totalLogsCount = 0;

				snapshot.forEach(doc => {
					const data = doc.data();
					const entityId = data.entityId || "Unknown"; // Mã ID học sinh/nhân sự

					if (!aggregatedMap[entityId]) {
						const userInfo = usersMap[entityId] || {};
						const cachedUser = (window.currentLoadedEntities || []).find(u => u.id === entityId);
						
						aggregatedMap[entityId] = {
							id: entityId,
							name: userInfo.fullName || (cachedUser ? cachedUser.fullName : null) || data.updaterName || entityId,
							category: userInfo.category || (cachedUser ? cachedUser.category : null) || "",
							totalCount: 0,
							details: []
						};
					}

					// Tăng số lượt dựa trên số lượng bản ghi trong auditLogs (thêm, sửa, xóa)
					aggregatedMap[entityId].totalCount += Number(data.count || 1);
					totalLogsCount++;

					// Lấy thông tin người thực hiện và thời gian
					const updaterName = data.updaterName || data.updaterEmail || "Hệ thống";
					let timeStr = "vừa xong";
					if (data.timestamp && typeof data.timestamp.toDate === 'function') {
						timeStr = data.timestamp.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
					}

					// Trích xuất nội dung thay đổi từ trường `changes` theo đúng thứ tự yêu cầu
					const changesObj = data.changes || {};
					const changeKeys = Object.keys(changesObj);

					if (changeKeys.length > 0) {
						changeKeys.forEach(fieldKey => {
							const val = changesObj[fieldKey];
							const valStr = Array.isArray(val) ? val.join(", ") : String(val);
							
							// 🌟 Lấy tên hiển thị (Label) từ cache, nếu không có thì giữ nguyên fieldKey gốc
							const displayLabel = fieldLabelMap[fieldKey] || fieldKey;
							
							// Định dạng hiển thị kèm nhãn đẹp mắt
							aggregatedMap[entityId].details.push(
								`<li><b>${displayLabel}:</b> ${valStr} <span style="color: #6c757d; font-size: 0.85em;">(ghi/sửa bởi ${updaterName} lúc ${timeStr})</span></li>`
							);
						});
					} else {
						const actionName = data.action || "Cập nhật dữ liệu";
						aggregatedMap[entityId].details.push(
							`<li><b>${actionName}</b> <span style="color: #6c757d; font-size: 0.85em;">(ghi/sửa bởi ${updaterName} lúc ${timeStr})</span></li>`
						);
					}
				});

				// Render ra bảng HTML
				let html = "";
				for (const keyId in aggregatedMap) {
					const item = aggregatedMap[keyId];
					html += `
					  <tr style="border-bottom: 1px solid #dee2e6;">
						<td style="font-family: monospace; font-weight: bold;">${item.id}</td>
						<td>${item.name} ${item.category ? `(${item.category})` : ''}</td>
						<td style="text-align: center;"><span style="background: #e7f1ff; color: #0d6efd; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${item.totalCount} lượt</span></td>
						<td><ul style="margin: 0; padding-left: 15px; font-size: 0.9em; max-height: 120px; overflow-y: auto;">${item.details.join("")}</ul></td>
					  </tr>
					`;
				}

				tableBody.innerHTML = html;

				const badge = document.getElementById("sec1-cache-time-badge");
				if (badge) {
					badge.innerText = "📡 Cập nhật lúc: " + new Date().toLocaleTimeString() + ` (${totalLogsCount} biến động)`;
				}

			}, error => {
				console.error("Lỗi realtime auditLogs:", error);
				tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Lỗi kết nối thời gian thực bảng nhật ký.</td></tr>';
			});

		 } catch (error) {
			console.error("Lỗi khởi tạo:", error);
			tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Lỗi tải dữ liệu.</td></tr>';
		}
	}

	// ==========================================
	// 4. SECTION 5.2: BÁO CÁO TUẦN (CÓ CACHE)
	// ==========================================
	async function loadGridSection2Weekly(forceRefresh = false) {
		const tableBody = document.getElementById("grid-sec2-body-rows");
		const headerRow = document.getElementById("grid-sec2-header-row");
		const dateInput = document.getElementById("grid-sec2-date-select");
		const filterInput = document.getElementById("grid-sec2-filter-class");

		if (!tableBody || !dateInput) return;

		// Mặc định lấy ngày hôm nay nếu chưa chọn ngày
		if (!dateInput.value) {
			dateInput.value = new Date().toLocaleDateString('en-CA');
		}

		const selectedDateStr = dateInput.value;
		const filterKeyword = filterInput ? filterInput.value.trim().toLowerCase() : "";

		// 🌟 Tính toán ngày Đầu tuần (Thứ Hai) và Cuối tuần (Chủ Nhật) của ngày được chọn
		const inputDate = new Date(selectedDateStr);
		const dayOfWeek = inputDate.getDay(); // 0: Chủ nhật, 1: Thứ 2...
		const diffToMonday = inputDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		
		const monday = new Date(inputDate);
		monday.setDate(diffToMonday);
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);

		const mondayStr = monday.toLocaleDateString('en-CA');
		const sundayStr = sunday.toLocaleDateString('en-CA');

		// 🌟 1. Lấy OrgId chuẩn từ biến toàn cục
		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị (OrgId).</td></tr>';
			return;
		}

		// 🌟 2. Lấy AcademicYearId chuẩn
		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được năm học hiện tại.</td></tr>';
			return;
		}

		// 🌟 3. Nhận diện đối tượng (STUDENT hay TEACHER)
		const isTeacherQuery = typeof keywordIsTeacher === 'function' ? keywordIsTeacher(filterKeyword) : false;
		const targetType = isTeacherQuery ? "TEACHER" : "STUDENT";

		const cacheKey = `${academicYearId}_${targetType.toLowerCase()}_weekly_${mondayStr}_to_${sundayStr}`;
		
		if (!forceRefresh && typeof cachedGridWeeklyData !== 'undefined' && cachedGridWeeklyData[cacheKey]) {
			renderWeeklyTable(cachedGridWeeklyData[cacheKey], filterKeyword);
			const badge = document.getElementById("sec2-cache-time-badge");
			if (badge) badge.innerText = `⚡ Dùng Cache RAM (${targetType} - Tuần ${mondayStr} đến ${sundayStr})`;
			return;
		}

		tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d;">⏳ Đang tổng hợp dữ liệu tuần (${mondayStr} đến ${sundayStr})...</td></tr>`;

		try {
			const db = firebase.firestore();

			// 🌟 4. Lấy danh sách module phù hợp với targetType
			const modulesSnapshot = await db.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.where("targetType", "==", targetType)
				.get();

			if (modulesSnapshot.empty) {
				tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d;">Không tìm thấy bài toán module nào cho nhóm (${targetType}).</td></tr>`;
				return;
			}

			// Quét cấu hình KPI từ các module
			let kpiFieldsMap = {};
			modulesSnapshot.forEach(modDoc => {
				const modData = modDoc.data();
				const fieldsArr = Array.isArray(modData.fields) ? modData.fields : [];
				
				fieldsArr.forEach(fObj => {
					if (fObj && fObj.isKpi && fObj.key) {
						kpiFieldsMap[fObj.key] = {
							id: fObj.key,
							name: fObj.label || fObj.key,
							scoreWeight: Number(fObj.scoreWeight || -1),
							weeklyThreshold: Number(fObj.kpiWeekly || 0)
						};
					}
				});
			});

			const kpiFieldsList = Object.values(kpiFieldsMap);

			// 🌟 5. Dựng tiêu đề cột động
			let headerHtml = `
				<th style="width: 90px;">Mã định danh</th>
				<th style="width: 170px;">Họ và tên</th>
				<th style="width: 130px;">${targetType === "TEACHER" ? "Tổ chuyên môn" : "Lớp"}</th>
			`;
			
			kpiFieldsList.forEach(field => {
				headerHtml += `<th style="text-align: center; min-width: 100px;">${field.name}</th>`;
			});

			headerHtml += `
				<th style="width: 100px; text-align: center;">Tổng điểm trừ</th>
				<th style="width: 120px; text-align: center;">Xếp loại tuần</th>
			`;
			if (headerRow) headerRow.innerHTML = headerHtml;

			// 🌟 6.1: Tải bảng users để tra cứu tên và lớp
			let usersMap = {};
			try {
				const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
				usersSnap.forEach(uDoc => {
					const uData = uDoc.data();
					usersMap[uDoc.id] = {
						fullName: uData.fullName || uDoc.id,
						category: uData.category || uData.className || "Chưa phân loại"
					};
				});
			} catch (e) {
				console.warn("Không tải được bảng users:", e);
			}

			// 🌟 6.2: Lấy toàn bộ records và lọc theo khoảng thời gian trong tuần
			let allRecords = [];
			for (const modDoc of modulesSnapshot.docs) {
				const recordsSnap = await db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicYearId)
					.collection("modulesData")
					.doc(modDoc.id)
					.collection("records")
					.get();

				recordsSnap.forEach(recDoc => {
					const recData = recDoc.data();
					const recDate = recData.date || "";
					
					// Chỉ lấy các bản ghi nằm trong khoảng từ Thứ Hai đến Chủ Nhật của tuần
					if (recDate && recDate >= mondayStr && recDate <= sundayStr) {
						allRecords.push({ id: recDoc.id, ...recData });
					}
				});
			}

			// 🌟 7. Tổng hợp dữ liệu theo entityId
			let summaryMap = {};
			
			allRecords.forEach(data => {
				const entityId = data.entityId || data.targetId || data.id.split('_')[0];
				
				const userInfo = usersMap[entityId] || {};
				const entityName = userInfo.fullName || data.fullName || data.targetName || entityId;
				const entityClass = userInfo.category || data.className || data.category || data.targetClass || "Chưa phân loại";

				if (!summaryMap[entityId]) {
					summaryMap[entityId] = {
						id: entityId,
						name: entityName,
						className: entityClass,
						totalScore: 0,
						kpiCounts: {} 
					};
				}

				// Duyệt qua các cột KPI để tính tổng số lần phát sinh trong tuần
				kpiFieldsList.forEach(kpiField => {
					const fKey = kpiField.id;
					let val = data[fKey];

					if (val !== undefined && val !== null && val !== "") {
						let countInc = 0;
						if (Array.isArray(val)) {
							countInc = val.length; // Đếm số lượng mốc/lựa chọn trong mảng
						} else {
							countInc = 1;
						}

						summaryMap[entityId].kpiCounts[fKey] = (summaryMap[entityId].kpiCounts[fKey] || 0) + countInc;
						summaryMap[entityId].totalScore += countInc * kpiField.scoreWeight;
					}
				});
			});

			const resultList = { 
				fields: kpiFieldsList, 
				data: Object.values(summaryMap) 
			};

			if (typeof cachedGridWeeklyData !== 'undefined') {
				cachedGridWeeklyData[cacheKey] = resultList;
			}

			renderWeeklyTable(resultList, filterKeyword);
			
			const badge = document.getElementById("sec2-cache-time-badge");
			if (badge) badge.innerText = `🌐 Cập nhật tuần (${mondayStr} - ${sundayStr})`;

		} catch (error) {
			console.error("Lỗi tải tổng hợp tuần:", error);
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Lỗi tải dữ liệu tổng hợp tuần.</td></tr>';
		}
	}

	// Hàm phụ trợ nhận diện từ khóa giáo viên/tổ chuyên môn
	function keywordIsTeacher(keyword) {
	  if (!keyword) return false;
	  const teacherKeywords = ["tổ", "giáo viên", "gv", "nhân sự", "hóa", "lý", "toán", "văn", "anh", "sử", "địa", "sinh", "tin", "thể dục", "cô", "thầy"];
	  return teacherKeywords.some(k => keyword.toLowerCase().includes(k));
	}
	

	function filterGridSection2Table() {
	  const filterInput = document.getElementById("grid-sec2-filter-class");
	  if (!filterInput) return;

	  const keyword = filterInput.value.trim();

	  // Dùng debounce nhẹ 200ms để khi gõ nhanh không bị giật giao diện
	  clearTimeout(filterDebounceTimer);
	  filterDebounceTimer = setTimeout(() => {
		// Lấy dữ liệu từ cache RAM hiện tại ra lọc lại ngay lập tức cực kỳ mượt mà
		const activeYear = window.currentAcademicYear || currentAcademicYear;
		const dateInput = document.getElementById("grid-sec2-date-select");
		const cacheKey = `${activeYear}_student_weekly_${dateInput ? dateInput.value : ""}`;

		if (typeof cachedGridWeeklyData !== 'undefined' && cachedGridWeeklyData[cacheKey]) {
		  renderWeeklyTable(cachedGridWeeklyData[cacheKey], keyword);
		} else {
		  // Nếu chưa có cache thì gọi load lại
		  loadGridSection2Weekly(false);
		}
	  }, 200);
	}

	let filterDebounceTimer = null;

	function filterGridSection2Table() {
	  const filterInput = document.getElementById("grid-sec2-filter-class");
	  if (!filterInput) return;

	  const keyword = filterInput.value.trim().toLowerCase();

	  // Dùng debounce (độ trễ 300ms) để tránh việc load liên tục khi người dùng đang gõ phím nhanh
	  clearTimeout(filterDebounceTimer);
	  filterDebounceTimer = setTimeout(async () => {
		// Nhận diện ngữ cảnh: Nếu từ khóa có chứa các từ khóa giáo viên/tổ chuyên môn (hoặc bạn có thể tùy biến logic phân loại)
		// Ở đây ta sẽ cho phép hàm load tự động quét đúng loại target dựa trên từ khóa hoặc trạng thái hiện tại.
		// Hoặc đơn giản hơn: Ta truyền từ khóa lọc vào hàm tải dữ liệu để nó thông minh tự xử lý.
		
		await loadGridSection2Weekly(false, keyword);
	  }, 300);
	}

	function renderWeeklyTable(resultObj, filterKeyword = "") {
		const tableBody = document.getElementById("grid-sec2-body-rows");
		if (!tableBody) return;

		const kpiFields = resultObj.fields || [];
		const rawDataList = resultObj.data || [];
		
		// Lọc dữ liệu theo từ khóa tìm kiếm trên RAM
		const keyword = (filterKeyword || "").trim().toLowerCase();
		const dataList = rawDataList.filter(item => {
			if (!keyword) return true;
			const matchId = (item.id || "").toLowerCase().includes(keyword);
			const matchName = (item.name || "").toLowerCase().includes(keyword);
			const matchClass = (item.className || "").toLowerCase().includes(keyword);
			return matchId || matchName || matchClass;
		});

		const totalCols = 3 + kpiFields.length + 2;

		if (dataList.length === 0) {
			tableBody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align: center; font-style: italic; color: #6c757d; padding: 20px;">Không tìm thấy dữ liệu phát sinh trong tuần phù hợp.</td></tr>`;
			return;
		}

		let html = "";
		dataList.forEach(item => {
			let rowHtml = `
			  <tr style="border-bottom: 1px solid #dee2e6;">
				<td style="vertical-align: middle;"><b>${item.id}</b></td>
				<td style="vertical-align: middle;">${item.name}</td>
				<td style="vertical-align: middle; text-align: center;"><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${item.className || "Chưa phân loại"}</span></td>
			`;

			// Đổ số liệu đếm của từng trường KPI
			kpiFields.forEach(field => {
				const countVal = item.kpiCounts[field.id] || 0;
				const threshold = field.weeklyThreshold || 0;
				
				let warningIcon = "";
				if (threshold > 0 && countVal >= threshold) {
					warningIcon = ` <span title="Vượt ngưỡng tuần (>= ${threshold})" style="color: #d63384; font-size: 0.9em;">⚠️</span>`;
				}

				rowHtml += `
					<td style="text-align: center; vertical-align: middle;">
					  ${countVal > 0 ? `<span style="color: #0d6efd; font-weight: bold; font-size: 1.05em;">${countVal}</span>${warningIcon}` : '<span style="color: #ccc;">0</span>'}
					</td>
				`;
			});

			// Xếp loại tuần dựa trên tổng điểm trừ
			let xlText = "Đạt";
			let xlColor = "#198754";
			if (item.totalScore < 0) {
				xlText = "Cần lưu ý";
				xlColor = "#fd7e14";
			}
			if (item.totalScore <= -10) {
				xlText = "Chưa đạt";
				xlColor = "#dc3545";
			}

			rowHtml += `
				<td style="text-align: center; vertical-align: middle; color: #dc3545; font-weight: bold;">${item.totalScore}đ</td>
				<td style="text-align: center; vertical-align: middle;">
				  <span style="background: ${xlColor}20; color: ${xlColor}; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.88em;">
					${xlText}
				  </span>
				</td>
			  </tr>
			`;
			html += rowHtml;
		});

		tableBody.innerHTML = html;
	}

	// Hàm hỗ trợ gọi render kèm filter từ ô input
	function renderWeeklyTableWithFilter(resultObj, filterKeyword) {
	  renderWeeklyTable(resultObj, filterKeyword);
	}


	// ==========================================
	// 5. SECTION 5.3: BÁO CÁO THÁNG & ĐỐI CHƯỚC MA TRẬN KPI
	// ==========================================
	
	async function loadGridSection3Monthly(forceRefresh = false) {
		const tableBody = document.getElementById("grid-sec3-body-rows");
		const headerRow = document.getElementById("grid-sec3-header-row");
		const monthInput = document.getElementById("grid-sec3-month-select");
		const filterInput = document.getElementById("grid-sec3-filter-class");

		if (!tableBody || !monthInput) return;

		// Mặc định lấy tháng hiện tại (định dạng YYYY-MM) nếu chưa chọn
		if (!monthInput.value) {
			monthInput.value = new Date().toLocaleDateString('en-CA').substring(0, 7);
		}

		const selectedMonth = monthInput.value; // Ví dụ: "2026-09"
		const filterKeyword = filterInput ? filterInput.value.trim().toLowerCase() : "";

		// 🌟 1. Lấy OrgId chuẩn
		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị (OrgId).</td></tr>';
			return;
		}

		// 🌟 2. Lấy AcademicYearId chuẩn
		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được năm học hiện tại.</td></tr>';
			return;
		}

		// 🌟 3. Nhận diện đối tượng (STUDENT hay TEACHER)
		const isTeacherQuery = typeof keywordIsTeacher === 'function' ? keywordIsTeacher(filterKeyword) : false;
		const targetType = isTeacherQuery ? "TEACHER" : "STUDENT";

		const cacheKey = `${academicYearId}_${targetType.toLowerCase()}_monthly_${selectedMonth}`;
		
		if (!forceRefresh && typeof cachedGridMonthlyData !== 'undefined' && cachedGridMonthlyData[cacheKey]) {
			renderMonthlyTable(cachedGridMonthlyData[cacheKey], filterKeyword);
			const badge = document.getElementById("sec3-cache-time-badge");
			if (badge) badge.innerText = `⚡ Dùng Cache RAM (${targetType} - Tháng ${selectedMonth})`;
			return;
		}

		tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d;">⏳ Đang quét dữ liệu tháng ${selectedMonth}...</td></tr>`;

		try {
			const db = firebase.firestore();

			const yearDocRef = db.collection("organizations").doc(orgId).collection("academicYears").doc(academicYearId);
			const yearDocSnap = await yearDocRef.get();
			const kpiRules = yearDocSnap.exists ? (yearDocSnap.data().monthlyKpiRules || {}) : {};

			// 🌟 4. Lấy danh sách module thuộc tổ chức có targetType phù hợp
			const modulesSnapshot = await db.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.where("targetType", "==", targetType)
				.get();

			if (modulesSnapshot.empty) {
				tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d;">Không tìm thấy bài toán module nào cho nhóm (${targetType}).</td></tr>`;
				return;
			}

			let kpiFieldsMap = {};
			modulesSnapshot.forEach(modDoc => {
				const modData = modDoc.data();
				const fieldsArr = Array.isArray(modData.fields) ? modData.fields : [];
				
				fieldsArr.forEach(fObj => {
					if (fObj && fObj.isKpi && fObj.key) {
						kpiFieldsMap[fObj.key] = {
							id: fObj.key,
							name: fObj.label || fObj.key,
							scoreWeight: Number(fObj.scoreWeight || -1),
							monthlyThreshold: Number(fObj.kpiMonthly || 0)
						};
					}
				});
			});

			const kpiFieldsList = Object.values(kpiFieldsMap);

			// 🌟 5. Dựng tiêu đề cột động cho bảng Tháng
			let headerHtml = `
				<th style="width: 90px;">Mã ID</th>
				<th style="width: 170px;">Thực thể</th>
				<th style="width: 130px;">${targetType === "TEACHER" ? "Tổ chuyên môn" : "Lớp"}</th>
			`;
			kpiFieldsList.forEach(field => {
				headerHtml += `<th style="text-align: center; min-width: 100px;">${field.name}</th>`;
			});
			headerHtml += `
				<th style="width: 100px; text-align: center;">Tổng lượt</th>
				<th style="width: 100px; text-align: center;">Tổng điểm trừ</th>
				<th style="width: 130px; text-align: center;">Xếp loại Tháng</th>
			`;
			if (headerRow) headerRow.innerHTML = headerHtml;

			// 🌟 6.1: Tải trước bảng users để tra cứu tên và lớp chuẩn xác
			let usersMap = {};
			try {
				const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
				usersSnap.forEach(uDoc => {
					const uData = uDoc.data();
					usersMap[uDoc.id] = {
						fullName: uData.fullName || uDoc.id,
						category: uData.category || uData.className || "Chưa phân loại"
					};
				});
			} catch (e) {
				console.warn("Không tải được bảng users:", e);
			}

			// 🌟 6.2: Lấy records và LỌC theo tháng được chọn (dựa vào trường `date` định dạng YYYY-MM-DD bắt đầu bằng `selectedMonth`)
			let allRecords = [];
			for (const modDoc of modulesSnapshot.docs) {
				const recordsSnap = await yearDocRef.collection("modulesData").doc(modDoc.id).collection("records").get();
				recordsSnap.forEach(recDoc => {
					const recData = recDoc.data();
					const recDate = recData.date || ""; // Chuỗi "YYYY-MM-DD"
					
					// Chỉ lấy các bản ghi có ngày thuộc tháng được chọn (ví dụ "2026-09")
					if (recDate && recDate.startsWith(selectedMonth)) {
						allRecords.push({ id: recDoc.id, ...recData });
					}
				});
			}

			// 🌟 7. Tổng hợp dữ liệu theo thực thể và tính số tuần vi phạm thực tế
            let summaryMap = {};
            
            allRecords.forEach(data => {
                const entityId = data.entityId || data.targetId || data.id.split('_')[0];
                const recDate = data.date || ""; // Định dạng "YYYY-MM-DD"
                
                const userInfo = usersMap[entityId] || {};
                const entityName = userInfo.fullName || data.fullName || data.targetName || entityId;
                const entityClass = userInfo.category || data.className || data.category || data.targetClass || "Chưa phân loại";

                if (!summaryMap[entityId]) {
                    summaryMap[entityId] = {
                        id: entityId,
                        name: entityName,
                        className: entityClass,
                        totalCount: 0,
                        totalScore: 0,
                        distinctWeeks: new Set(), // Dùng Set để lưu các tuần có phát sinh vi phạm
                        kpiCounts: {}
                    };
                }

                // Tính số tuần trong năm từ ngày phát sinh (ISO week number đơn giản hoặc gom theo tuần)
                if (recDate) {
                    const d = new Date(recDate);
                    // Lấy số tuần trong năm (hoặc dùng tuần của tháng)
                    const weekNum = Math.ceil(d.getDate() / 7); 
                    summaryMap[entityId].distinctWeeks.add(`${selectedMonth}-W${weekNum}`);
                }

                // Duyệt qua các trường KPI
                kpiFieldsList.forEach(kpiField => {
                    const fKey = kpiField.id;
                    let val = data[fKey];

                    if (val !== undefined && val !== null && val !== "") {
                        let countInc = Array.isArray(val) ? val.length : 1;
                        summaryMap[entityId].totalCount += countInc;
                        summaryMap[entityId].totalScore += countInc * kpiField.scoreWeight;
                        summaryMap[entityId].kpiCounts[fKey] = (summaryMap[entityId].kpiCounts[fKey] || 0) + countInc;
                    }
                });
            });

            // 🌟 Tự động nhận diện tiền tố ID ô input dựa vào đối tượng (TEACHER hay STUDENT)
            const prefix = targetType === "TEACHER" ? "cfg-teacher" : "cfg-student";
			
			// 🌟 Ưu tiên đọc trực tiếp từ Firestore (kpiRules), nếu chưa có mới fallback về ô input hoặc giá trị mặc định
            const khaRule = kpiRules.kha || {};
            const datRule = kpiRules.dat || {};
            const chuadatRule = kpiRules.chuadat || {};

            const ruleKhaWeeks = Number(khaRule.weeks) || Number(document.getElementById("cfg-student-kha-weeks")?.value) || 2;
            const ruleKhaCount = Number(khaRule.count) || Number(document.getElementById("cfg-student-kha-count")?.value) || 5;
            const ruleKhaScore = Number(khaRule.score) || Number(document.getElementById("cfg-student-kha-score")?.value) || 5;

            const ruleDatWeeks = Number(datRule.weeks) || Number(document.getElementById("cfg-student-dat-weeks")?.value) || 3;
            const ruleDatCount = Number(datRule.count) || Number(document.getElementById("cfg-student-dat-count")?.value) || 10;
            const ruleDatScore = Number(datRule.score) || Number(document.getElementById("cfg-student-dat-score")?.value) || 10;

            const ruleChuadatWeeks = Number(chuadatRule.weeks) || Number(document.getElementById("cfg-student-chuadat-weeks")?.value) || 4;
            const ruleChuadatCount = Number(chuadatRule.count) || Number(document.getElementById("cfg-student-chuadat-count")?.value) || 15;
            const ruleChuadatScore = Number(chuadatRule.score) || Number(document.getElementById("cfg-student-chuadat-score")?.value) || 15;

            // Soi chiếu Ma trận Ngưỡng để xếp loại chuẩn xác
            const processedList = Object.values(summaryMap).map(item => {
                let rank = "🟢 Tốt";
                let badgeStyle = "background: #d1e7dd; color: #0f5132;";

                const weeksCount = item.distinctWeeks.size; // Số tuần thực tế có vi phạm
                const absScore = Math.abs(item.totalScore);

                // Kiểm tra mức: Chưa đạt -> Đạt -> Khá -> Tốt
                if (weeksCount >= ruleChuadatWeeks || item.totalCount >= ruleChuadatCount || absScore >= ruleChuadatScore) {
                    rank = "🔴 Chưa đạt";
                    badgeStyle = "background: #f8d7da; color: #842029;";
                } else if (weeksCount >= ruleDatWeeks || item.totalCount >= ruleDatCount || absScore >= ruleDatScore) {
                    rank = "🟠 Đạt";
                    badgeStyle = "background: #fff3cd; color: #664d03;";
                } else if (weeksCount >= ruleKhaWeeks || item.totalCount >= ruleKhaCount || absScore >= ruleKhaScore) {
                    rank = "🔵 Khá";
                    badgeStyle = "background: #cff4fc; color: #055160;";
                }

                return { ...item, weeks: weeksCount, rank, badgeStyle };
            });

			const resultObj = { fields: kpiFieldsList, data: processedList };
			
			if (typeof cachedGridMonthlyData !== 'undefined') {
				cachedGridMonthlyData[cacheKey] = resultObj;
			}

			renderMonthlyTable(resultObj, filterKeyword);
			
			const badge = document.getElementById("sec3-cache-time-badge");
			if (badge) badge.innerText = `🌐 Cập nhật tháng ${selectedMonth}: ` + new Date().toLocaleTimeString();

		} catch (error) {
			console.error("Lỗi tính KPI tháng:", error);
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Lỗi tính toán ma trận KPI tháng.</td></tr>';
		}
	}

	// Hàm render bảng tháng kèm hỗ trợ lọc theo từ khóa
	function renderMonthlyTable(resultObj, filterKeyword = "") {
		const tableBody = document.getElementById("grid-sec3-body-rows");
		if (!tableBody) return;

		const kpiFields = resultObj.fields || [];
		const rawDataList = resultObj.data || [];

		const keyword = (filterKeyword || "").trim().toLowerCase();
		const dataList = rawDataList.filter(item => {
			if (!keyword) return true;
			const matchId = (item.id || "").toLowerCase().includes(keyword);
			const matchName = (item.name || "").toLowerCase().includes(keyword);
			const matchClass = (item.className || "").toLowerCase().includes(keyword);
			return matchId || matchName || matchClass;
		});

		const totalCols = 3 + kpiFields.length + 3;

		if (dataList.length === 0) {
			tableBody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align: center; font-style: italic; color: #6c757d; padding: 20px;">Không tìm thấy dữ liệu phù hợp trong tháng này.</td></tr>`;
			return;
		}

		let html = "";
		dataList.forEach(item => {
			let rowHtml = `
			  <tr style="border-bottom: 1px solid #dee2e6;">
				<td style="vertical-align: middle;"><b>${item.id}</b></td>
				<td style="vertical-align: middle;">${item.name}</td>
				<td style="vertical-align: middle; text-align: center;"><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${item.className || "Chưa phân loại"}</span></td>
			`;

			kpiFields.forEach(field => {
				const countVal = item.kpiCounts[field.id] || 0;
				rowHtml += `<td style="text-align: center; vertical-align: middle;">${countVal > 0 ? `<span style="color: #dc3545; font-weight: bold; font-size: 1.05em;">${countVal}</span>` : '<span style="color: #ccc;">0</span>'}</td>`;
			});

			rowHtml += `
				<td style="text-align: center; vertical-align: middle; font-weight: bold;">${item.totalCount}</td>
				<td style="text-align: center; vertical-align: middle; color: #dc3545; font-weight: bold;">${item.totalScore}đ</td>
				<td style="text-align: center; vertical-align: middle;"><span style="${item.badgeStyle} padding: 3px 10px; border-radius: 4px; font-weight: bold; display: inline-block;">${item.rank}</span></td>
			  </tr>
			`;
			html += rowHtml;
		});
		tableBody.innerHTML = html;
	}

	// Hàm debounce lọc trực tiếp trên RAM khi gõ ở ô input tháng
	let filterMonthDebounceTimer = null;

	// 🌟 Hàm lọc tối ưu: Chỉ thao tác trực tiếp trên dữ liệu RAM đã cache, KHÔNG gọi lại Firebase khi đang gõ
	function filterGridSection3Table(event) {
	  const filterInput = document.getElementById("grid-sec3-filter-class");
	  if (!filterInput) return;

	  const keyword = filterInput.value.trim();
	  
	  // Nếu người dùng nhấn Enter, có thể cho phép gọi ép buộc tải lại nếu cần
	  if (event && event.key === 'Enter') {
		loadGridSection3Monthly(false);
		return;
	  }

	  const activeYear = window.currentAcademicYear || currentAcademicYear;
	  const monthInput = document.getElementById("grid-sec3-month-select");
	  
	  // Xác định nhóm đối tượng dựa trên từ khóa hiện tại
	  const isTeacherQuery = typeof keywordIsTeacher === 'function' ? keywordIsTeacher(keyword.toLowerCase()) : false;
	  const targetType = isTeacherQuery ? "teacher" : "student";

	  const cacheKey = `${activeYear}_${targetType}_monthly_${monthInput ? monthInput.value : ""}`;

	  // Kiểm tra xem đã có cache RAM của tháng này chưa
	  if (typeof cachedGridMonthlyData !== 'undefined' && cachedGridMonthlyData[cacheKey]) {
		// ⚡ CHỈ LỌC HIỂN THỊ LẠI CÁC DÒNG TRÊN BẢNG HIỆN TẠI (0 đồng quota Firebase)
		renderMonthlyTable(cachedGridMonthlyData[cacheKey], keyword);
	  } else {
		// Nếu chưa có cache (ví dụ mới đổi tháng hoặc đổi nhóm), bảng sẽ chờ người dùng bấm nút "Cập nhật Tháng" thủ công
		// thay vì tự động gọi ngầm gây tốn quota.
		const tableBody = document.getElementById("grid-sec3-body-rows");
		if (tableBody && keyword.length > 2) {
		  // Hiển thị nhẹ thông báo gợi ý bấm nút cập nhật
		  console.log("Chưa có cache cho từ khóa này, vui lòng bấm nút 'Cập nhật Tháng' để tải dữ liệu.");
		}
	  }
	}

	// ==========================================
	// 6. SECTION 5.4: TRA CỨU & IN PHIẾU ĐỐI SOÁT
	// ==========================================
	async function searchIndividualAuditSheet() {
		const keywordInput = document.getElementById("lookup-entity-keyword");
		if (!keywordInput) return;
		
		const keyword = keywordInput.value.trim().toLowerCase();
		if (!keyword) {
			alert("Vui lòng nhập Mã định danh hoặc Tên cá nhân cần tra cứu!");
			return;
		}

		const nameEl = document.getElementById("sheet-entity-name");
		const categoryEl = document.getElementById("sheet-entity-category");
		const idEl = document.getElementById("sheet-entity-id");
		const rankEl = document.getElementById("sheet-entity-rank");
		const violationsListEl = document.getElementById("sheet-violations-list");

		if (violationsListEl) {
			violationsListEl.innerHTML = '<div style="color: #6c757d; font-style: italic;">Đang tra cứu dữ liệu từ hệ thống...</div>';
		}

		try {
			const orgId = window.currentOrgIdGlobal;
			if (!orgId) {
				alert("Chưa xác định được thông tin đơn vị (OrgId).");
				return;
			}

			let academicYearId = "";
			const yearsArr = window.currentAcademicYearsGlobal;
			if (Array.isArray(yearsArr) && yearsArr.length > 0) {
				const lastYearItem = yearsArr[yearsArr.length - 1];
				academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
			} else if (window.currentAcademicYearIdGlobal) {
				academicYearId = String(window.currentAcademicYearIdGlobal).trim();
			}

			if (!academicYearId) {
				alert("Chưa xác định được năm học hiện tại.");
				return;
			}

			const db = firebase.firestore();

			// 🌟 1. Ưu tiên tìm trong RAM Cache trước (window.card2CachedMembers hoặc window.currentLoadedEntities) để siêu tốc
			let foundUser = null;
			const preloadedEntities = window.card2CachedMembers || window.currentLoadedEntities || [];
			
			if (preloadedEntities.length > 0) {
				foundUser = preloadedEntities.find(u => {
					const uId = String(u.id || "").toLowerCase();
					const uName = String(u.fullName || "").toLowerCase();
					return uId === keyword || uName.includes(keyword);
				});
			}

			// Nếu cache chưa có, tiến hành đọc từ Firestore collection `users`
			if (!foundUser) {
				const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
				usersSnap.forEach(uDoc => {
					const uData = uDoc.data();
					const uId = uDoc.id.toLowerCase();
					const uName = (uData.fullName || "").toLowerCase();
					
					if (uId === keyword || uName.includes(keyword)) {
						foundUser = {
							id: uDoc.id,
							fullName: uData.fullName || uDoc.id,
							category: uData.category || uData.className || "Chưa phân loại"
						};
					}
				});
			}

			if (!foundUser) {
				if (nameEl) nameEl.innerText = "Không tìm thấy";
				if (categoryEl) categoryEl.innerText = "---";
				if (idEl) idEl.innerText = keyword.toUpperCase();
				if (rankEl) rankEl.innerText = "---";
				if (violationsListEl) violationsListEl.innerHTML = '<div style="color: red; font-style: italic;">Không tìm thấy thông tin cá nhân phù hợp với từ khóa.</div>';
				return;
			}

			// Hiển thị thông tin cơ bản tìm được
			if (nameEl) nameEl.innerText = foundUser.fullName;
			if (categoryEl) categoryEl.innerText = foundUser.category || foundUser.className || "Chưa phân loại";
			if (idEl) idEl.innerText = foundUser.id;

			// 🌟 2. Xây dựng bản đồ tra cứu nhãn từ `window.cachedSchemaFields` (Thẻ 3) để dịch Key -> Label tiếng Việt
			let fieldLabelMap = {};
			const currentFields = window.cachedSchemaFields || [];
			currentFields.forEach(f => {
				fieldLabelMap[f.key] = f.label || f.key;
			});

			// 3. Lấy danh sách các module để quét lịch sử biến động (auditLogs)
			const modulesSnap = await db.collection("organizations").doc(orgId).collection("modules").get();
			
			let allViolations = [];

			for (const modDoc of modulesSnap.docs) {
				const logsSnap = await db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicYearId)
					.collection("modulesData")
					.doc(modDoc.id)
					.collection("auditLogs")
					.where("entityId", "==", foundUser.id)
					.get();

				logsSnap.forEach(logDoc => {
					const logData = logDoc.data();
					
					// Định dạng thời gian chuẩn Việt Nam
					let timeStr = "Gần đây";
					if (logData.timestamp && typeof logData.timestamp.toDate === 'function') {
						timeStr = logData.timestamp.toDate().toLocaleDateString('vi-VN');
					}

					// Trích xuất nội dung thay đổi và ánh xạ sang nhãn thân thiện
					const changes = logData.changes || {};
					const changeKeys = Object.keys(changes);

					if (changeKeys.length > 0) {
						changeKeys.forEach(fieldKey => {
							const val = changes[fieldKey];
							const valStr = Array.isArray(val) ? val.join(", ") : String(val);
							
							// Dịch key sang label (VD: loiDiMuon -> Đi muộn)
							const displayLabel = fieldLabelMap[fieldKey] || fieldKey;

							allViolations.push({
								date: timeStr,
								content: `<b>${displayLabel}:</b> ${valStr}`,
								updater: logData.updaterName || logData.updaterEmail || "Hệ thống"
							});
						});
					} else {
						const actionName = logData.action || "Cập nhật dữ liệu";
						allViolations.push({
							date: timeStr,
							content: `<b>${actionName}</b>`,
							updater: logData.updaterName || logData.updaterEmail || "Hệ thống"
						});
					}
				});
			}

			// 4. Render danh sách nhật ký/vi phạm ra phiếu đối soát
			if (allViolations.length > 0) {
				let html = "";
				allViolations.forEach(v => {
					html += `<div style="padding: 6px 0; border-bottom: 1px solid #eee;">• [${v.date}] ${v.content} <span style="color: #6c757d; font-size: 0.85em;">(Ghi bởi: ${v.updater})</span></div>`;
				});
				if (violationsListEl) violationsListEl.innerHTML = html;
				if (rankEl) rankEl.innerText = `🔴 Có ${allViolations.length} lượt ghi nhận`;
			} else {
				if (violationsListEl) violationsListEl.innerHTML = `<div style="color: #198754; font-style: italic;">🎉 Không có ghi nhận biến động nào trong kỳ này.</div>`;
				if (rankEl) rankEl.innerText = "🟢 Tốt";
			}

		} catch (error) {
			console.error("Lỗi tra cứu phiếu đối soát:", error);
			if (violationsListEl) {
				violationsListEl.innerHTML = '<div style="color: red; font-style: italic;">Lỗi kết nối khi tải dữ liệu đối soát.</div>';
			}
		}
	}

	function printIndividualAuditSheet() {
	  const printContents = document.getElementById("printable-audit-sheet").innerHTML;
	  const originalContents = document.body.innerHTML;

	  document.body.innerHTML = printContents;
	  window.print();
	  document.body.innerHTML = originalContents;
	  window.location.reload(); // Khôi phục trạng thái trang sau khi in
	}

	// ==========================================
	// 7. TIỆN ÍCH XUẤT EXCEL (CSV)
	// ==========================================
	function exportGridTableToExcel(sectionKey) {
	  let tableId = "grid-sec1-table";
	  if (sectionKey === 'sec2') tableId = "grid-sec2-table";
	  if (sectionKey === 'sec3') tableId = "grid-sec3-table";

	  const table = document.getElementById(tableId);
	  if (!table) {
		alert("Không tìm thấy dữ liệu bảng để xuất!");
		return;
	  }

	  let csv = [];
	  const rows = table.querySelectorAll("tr");
	  
	  rows.forEach(row => {
		let cols = row.querySelectorAll("th, td");
		let data = [];
		cols.forEach(col => data.push('"' + col.innerText.replace(/"/g, '""') + '"'));
		csv.push(data.join(","));
	  });

	  const csvFile = new Blob(["\ufeff" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
	  const downloadLink = document.createElement("a");
	  downloadLink.href = URL.createObjectURL(csvFile);
	  downloadLink.download = `Bao_Cao_KPI_${sectionKey.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`;
	  document.body.appendChild(downloadLink);
	  downloadLink.click();
	  document.body.removeChild(downloadLink);
	}
	
	
	//=========================================
	//	EMPLOYEE panel
	//=========================================
	// 🌟 1. Chuyển đổi qua lại giữa các Tab của Nhân viên (Từ 1 đến 5)
	function switchEmpTab(tabIndex) {
	  for (let i = 1; i <= 5; i++) {
		const tabContent = document.getElementById(`emp-tab-sec-${i}`);
		const tabBtn = document.getElementById(`btn-emp-tab-${i}`);
		
		if (tabContent) tabContent.style.display = "none";
		if (tabBtn) {
		  tabBtn.style.background = "#e9ecef";
		  tabBtn.style.color = "#333";
		}
	  }

	  // Hiển thị thẻ được chọn
	  const activeContent = document.getElementById(`emp-tab-sec-${tabIndex}`);
	  const activeBtn = document.getElementById(`btn-emp-tab-${tabIndex}`);
	  
	  if (activeContent) activeContent.style.display = "block";
	  if (activeBtn) {
		activeBtn.style.background = "#0d6efd";
		activeBtn.style.color = "white";
	  }

	  // Gọi hàm load dữ liệu tương ứng cho từng tab nếu cần
	  if (tabIndex === 1) {
		// Tải dữ liệu nhập liệu hàng ngày
		if (typeof loadEmployeeEntryData === 'function') loadEmployeeEntryData();
	  
	  } else if (tabIndex === 4) {
		// Tải dữ liệu lớp chủ nhiệm
		if (typeof loadHomeroomClassData === 'function') loadHomeroomClassData();
	  
	  }	else if (tabIndex === 3) {
		// Tải log
			loadAuditLogsTimeline();
	  
	  } else if (tabIndex === 5) {
		// Tải dữ liệu tổ chuyên môn
		if (typeof loadDepartmentData === 'function') loadDepartmentData();
	  }
	}

	// 🌟 2. Hàm kiểm tra quyền và hiển thị Tab 4, Tab 5 động khi nhân viên đăng nhập thành công
	async function checkAndShowEmployeeSpecialTabs() {
		const btnTab4 = document.getElementById("btn-emp-tab-4");
		const btnTab5 = document.getElementById("btn-emp-tab-5");

		// Mặc định ẩn 2 thẻ đi
		if (btnTab4) btnTab4.style.display = "none";
		if (btnTab5) btnTab5.style.display = "none";

		const authUser = firebase.auth().currentUser;
		if (!authUser || !authUser.email) return;

		const email = authUser.email.toLowerCase().trim();
		const db = firebase.firestore();

		try {
			// 1. Lấy thông tin user ở collection ngang cấp `users` để lấy uId (memberId) và orgId
			const usersSnap = await db.collection("users")
									  .where("email", "==", email)
									  .limit(1)
									  .get();

			let orgId = window.currentOrgIdGlobal;
			let memberId = "";
			if (!usersSnap.empty) {
				const userData = usersSnap.docs[0].data();
				orgId = userData.orgId || orgId;
				memberId = userData.uId || ""; // Lấy uId (ví dụ: "GV001")
			}

			if (!orgId) return;

			// 2. Lấy năm học hiện tại chuẩn xác
			let academicYearId = currentAcademicYear || "";
			const yearsArr = window.currentAcademicYearsGlobal;
			if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
				const lastYearItem = yearsArr[yearsArr.length - 1];
				academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
			}

			if (!academicYearId) return;

			const assignmentsRef = db.collection("organizations")
									 .doc(orgId)
									 .collection("academicYears")
									 .doc(academicYearId)
									 .collection("assignments");

			// 3. 🌟 THỬ ĐỌC THEO EMAIL TRƯỚC, NẾU KHÔNG TỒN TẠI THÌ ĐỌC THEO MEMBERID (uId)
			let assignDocSnap = await assignmentsRef.doc(email).get();
			
			if (!assignDocSnap.exists && memberId) {
				assignDocSnap = await assignmentsRef.doc(memberId).get();
			}

			if (assignDocSnap.exists) {
				const assignData = assignDocSnap.data();
				const homeroomList = Array.isArray(assignData.homeroom) ? assignData.homeroom : [];
				const teachingList = Array.isArray(assignData.teaching) ? assignData.teaching : [];

				// 🌟 Nếu có lớp chủ nhiệm -> Hiển thị Thẻ 4 (Lớp Chủ nhiệm)
				if (homeroomList.length > 0 && btnTab4) {
					btnTab4.style.display = "inline-block";
				}

				// 🌟 Nếu có phân công giảng dạy/tổ -> Hiển thị Thẻ 5 (Tổ chuyên môn)
				if (teachingList.length > 0 && btnTab5) {
					btnTab5.style.display = "inline-block";
				}
			}

		} catch (error) {
			console.error("Lỗi kiểm tra hiển thị thẻ đặc biệt cho employee:", error);
		}
	}
	
	
	// Hàm khởi tạo danh sách năm học cho Employee Panel đọc trực tiếp từ sub-collection `academicYears`
	async function initEmployeeAcademicYears(orgId) {
		const selectElement = document.getElementById("emp-academic-year-select");
		if (!selectElement) return;

		selectElement.innerHTML = `<option value="">Đang tải năm học...</option>`;

		let academicYearsList = [];

		try {
			const db = firebase.firestore();
			// Truy vấn vào sub-collection academicYears của tổ chức
			const snapshot = await db.collection("organizations").doc(orgId).collection("academicYears").get();

			if (!snapshot.empty) {
				snapshot.forEach(doc => {
					// Lấy ID của document (hoặc một trường tên là id/name tùy cấu trúc bạn lưu)
					academicYearsList.push(doc.id);
				});
			}
		} catch (err) {
			console.error("Lỗi khi tải danh sách năm học:", err);
		}

		selectElement.innerHTML = "";

		if (academicYearsList.length === 0) {
			selectElement.innerHTML = `<option value="">Chưa có năm học nào được cấu hình</option>`;
			return;
		}

		// Sắp xếp danh sách năm học nếu cần (ví dụ từ mới nhất đến cũ hơn)
		academicYearsList.sort().reverse();

		// Lưu vào biến toàn cục để các hàm khác có thể dùng chung
		window.currentAcademicYearsGlobal = academicYearsList;

		// Đổ danh sách năm học vào thẻ select
		academicYearsList.forEach((yearId, index) => {
			const option = document.createElement("option");
			option.value = yearId;
			option.textContent = yearId; // Hiển thị tên năm học (ví dụ: 2026-2027)
			if (index === 0) option.selected = true;
			selectElement.appendChild(option);
		});

		// Sau khi nạp xong năm học, tiến hành khởi tạo tiếp các module/nhiệm vụ
		await initEmployeeModules();
	}
	
	// 1. Hàm khởi tạo danh sách nhiệm vụ / module từ collection `modules` của tổ chức
	async function initEmployeeModules() {
		const moduleSelect = document.getElementById("emp-module-select");
		if (!moduleSelect) return;

		moduleSelect.innerHTML = `<option value="">Đang tải nhiệm vụ...</option>`;

		const orgId = window.currentOrgIdGlobal;
		const authUser = firebase.auth().currentUser;

		if (!orgId || !authUser || !authUser.email) {
			moduleSelect.innerHTML = `<option value="">Chưa chọn tổ chức hoặc chưa đăng nhập</option>`;
			return;
		}

		const teacherEmail = authUser.email.toLowerCase().trim();

		let academicYearId = currentAcademicYear || "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		}

		if (!academicYearId) {
			moduleSelect.innerHTML = `<option value="">Chưa xác định năm học</option>`;
			return;
		}

		let allowedModuleIds = new Set();

		try {
			const db = firebase.firestore();
			const academicYearRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId);

			// 1. Lấy danh sách module từ phân công chính thức (assignments)
			const assignDoc = await academicYearRef.collection("assignments").doc(teacherEmail).get();
			if (assignDoc.exists) {
				const data = assignDoc.data();
				const mods = Array.isArray(data.modules) ? data.modules : [];
				mods.forEach(m => allowedModuleIds.add(m));
			}

			// 2. Lấy danh sách module được ủy quyền hợp lệ từ supporters (chưa hết hạn)
			const now = Date.now();
			const supportersSnap = await academicYearRef.collection("supporters")
				.where("assistantEmail", "==", teacherEmail)
				.where("expiresAt", ">", now)
				.get();

			supportersSnap.forEach(doc => {
				const data = doc.data();
				if (data.moduleId) {
					allowedModuleIds.add(data.moduleId);
				}
			});

		} catch (err) {
			console.error("Lỗi kiểm tra quyền module của nhân viên:", err);
		}

		// Nếu không có quyền module nào
		if (allowedModuleIds.size === 0) {
			moduleSelect.innerHTML = `<option value="">Không có nhiệm vụ nào được phân công hoặc hỗ trợ</option>`;
			const contentContainer = document.getElementById("employee-assignment-content");
			if (contentContainer) contentContainer.innerHTML = `<p style="padding: 15px; color: #dc3545;">Bạn không có quyền truy cập nhiệm vụ nào trong năm học này.</p>`;
			return;
		}

		let modulesList = [];

		try {
			const db = firebase.firestore();
			// Chỉ lấy thông tin các module nằm trong danh sách ĐÃ ĐƯỢC PHÉP (allowedModuleIds)
			const snapshot = await db.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.get();

			snapshot.forEach(doc => {
				if (allowedModuleIds.has(doc.id)) {
					const data = doc.data();
					modulesList.push({
						id: doc.id,
						title: data.title || data.name || doc.id
					});
				}
			});
		} catch (err) {
			console.error("Lỗi khi tải chi tiết modules:", err);
		}

		moduleSelect.innerHTML = "";

		if (modulesList.length === 0) {
			moduleSelect.innerHTML = `<option value="">Không có nhiệm vụ khả dụng</option>`;
			const contentContainer = document.getElementById("employee-assignment-content");
			if (contentContainer) contentContainer.innerHTML = `<p style="padding: 15px; color: #66c;">Không có nội dung hiển thị.</p>`;
			return;
		}

		// Đổ danh sách vào thẻ select
		modulesList.forEach((item, index) => {
			const option = document.createElement("option");
			option.value = item.id;
			option.textContent = item.title;
			if (index === 0) option.selected = true;
			moduleSelect.appendChild(option);
		});

		// Kích hoạt hiển thị dữ liệu cho nhiệm vụ đầu tiên vừa nạp
		switchEmployeeModule();
	}

	// 2. Sự kiện khi thay đổi Nhiệm vụ / Module trên giao diện
	function switchEmployeeModule() {
		const selectedModuleId = document.getElementById("emp-module-select").value;
		
		// 🌟 Lưu thẳng vào biến toàn cục để các hàm khác dùng chung
		window.currentModuleIdGlobal = selectedModuleId;

		const selectedAcademicYear = document.getElementById("emp-academic-year-select")?.value;
		const orgId = window.currentOrgIdGlobal;

		console.log(`Đã chọn module ID: [${window.currentModuleIdGlobal}] trong năm học [${selectedAcademicYear}]`);

		if (!selectedModuleId) return;

		// Gọi hàm tải và vẽ bảng dữ liệu
		if (typeof refreshAndRenderEmployeeData === 'function') {
			refreshAndRenderEmployeeData();
		}
		
		if (typeof loadModuleDetails === 'function') {
			loadModuleDetails(orgId, selectedModuleId, selectedAcademicYear);
		}
	}

	// 3. Hàm tải chi tiết nội dung module
	async function loadModuleDetails(orgId, moduleId, academicId) {
		const contentContainer = document.getElementById("employee-assignment-content"); 
		if (!contentContainer) return;

		contentContainer.innerHTML = `<p style="padding: 15px;">Đang tải chi tiết nhiệm vụ...</p>`;

		try {
			const db = firebase.firestore();
			const docRef = await db.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.doc(moduleId)
				.get();

			if (docRef.exists) {
				const data = docRef.data();
				contentContainer.innerHTML = `
					<div style="background: #fff; padding: 20px; border-radius: 6px; border: 1px solid #ddd;">
						<h3 style="color: #084298; margin-top: 0;">${data.title || moduleId}</h3>
						<p><strong>Năm học đang chọn:</strong> <span style="color: #d63384; font-weight: bold;">${academicId || "Chưa chọn"}</span></p>
						<p><strong>Mô tả:</strong> ${data.description || "Không có mô tả chi tiết."}</p>
					</div>
				`;
			} else {
				contentContainer.innerHTML = `<p style="padding: 15px; color: red;">Không tìm thấy thông tin nhiệm vụ này.</p>`;
			}
		} catch (err) {
			console.error("Lỗi tải chi tiết module:", err);
			contentContainer.innerHTML = `<p style="padding: 15px; color: red;">Lỗi tải dữ liệu: ${err.message}</p>`;
		}
	}
	
	
	// Bảng số liệu
	let currentEmployeeEntities = [];
	let currentModuleConfig = null;

	async function refreshAndRenderEmployeeData() {
		const orgId = window.currentOrgIdGlobal;
		
		const academicSelect = document.getElementById("emp-academic-year-select");
		let academicId = academicSelect ? academicSelect.value : "";
		if (!academicId && Array.isArray(window.currentAcademicYearsGlobal) && window.currentAcademicYearsGlobal.length > 0) {
			academicId = window.currentAcademicYearsGlobal[window.currentAcademicYearsGlobal.length - 1];
		}

		const moduleSelectEl = document.getElementById("emp-module-select");
		const moduleId = (moduleSelectEl && moduleSelectEl.value) ? moduleSelectEl.value : window.currentModuleIdGlobal;
		
		if (moduleId) {
			window.currentModuleIdGlobal = moduleId; 
		}

		const tableBody = document.getElementById("emp-entry-table-body");
		if (!tableBody) return;

		if (!orgId || !academicId || !moduleId) {
			tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: red; padding: 20px;">Vui lòng chọn đầy đủ Tổ chức, Năm học và Nhiệm vụ!</td></tr>`;
			return;
		}

		try {
			const db = firebase.firestore();
			const todayStr = new Date().toLocaleDateString('en-CA'); // Lấy ngày hiện tại "YYYY-MM-DD"

			const moduleDoc = await db.collection("organizations").doc(orgId).collection("modules").doc(moduleId).get();
			currentModuleConfig = moduleDoc.exists ? moduleDoc.data() : {};
			const targetType = currentModuleConfig.targetType || "";

			// 1. Lấy danh sách nhân sự / học sinh
			const usersSnapshot = await db.collection("organizations").doc(orgId).collection("users").get();
			let entities = [];
			usersSnapshot.forEach(doc => {
				const userData = doc.data();
				if (!targetType || userData.role === targetType) {
					entities.push({ id: doc.id, ...userData });
				}
			});

			// 2. 🌟 CHỈ LẤY DỮ LIỆU CỦA ĐÚNG HÔM NAY (Tiết kiệm băng thông, không đọc rác cũ)
			const recordsSnapshot = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("records")
				.where("date", "==", todayStr)
				.get();

			const recordsMap = {};
			recordsSnapshot.forEach(doc => {
				const data = doc.data();
				const entityId = data.entityId || doc.id.split('_')[0];
				recordsMap[entityId] = data;
			});

			currentEmployeeEntities = entities.map(item => ({
				...item,
				savedRecord: recordsMap[item.id] || {}
			}));

			// Lưu ngữ cảnh toàn cục phục vụ hiển thị
			window.currentUserEmailGlobal = window.currentUserEmailGlobal || firebase.auth().currentUser?.email || "";
			window.currentTodayStrGlobal = todayStr;

			// Vẽ bảng giao diện
			renderEmployeeTable(currentEmployeeEntities, currentModuleConfig);

		} catch (err) {
			console.error("Lỗi tải dữ liệu bảng:", err);
			tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: red; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
		}
	}

	window.currentDynamicFieldsGlobal = null;

	async function renderEmployeeTable(listToRender, moduleConfig) {
		const tableBody = document.getElementById("emp-entry-table-body");
		const tableHeader = document.getElementById("emp-entry-table-header");
		if (!tableBody || !tableHeader) return;

		// 🌟 1. Đảm bảo kho schema toàn cục đã được nạp dữ liệu.
		if ((!window.cachedSchemaFields || window.cachedSchemaFields.length === 0) && typeof loadSchemaFields === 'function') {
			await loadSchemaFields(false);
		}

		window.currentDynamicFieldsGlobal = moduleConfig?.fields;
		let rawFields = window.currentDynamicFieldsGlobal;
		
		if (!Array.isArray(rawFields) || rawFields.length === 0) {
			rawFields = [{ key: 'value', label: 'Giá trị / Đánh giá' }];
		}

		// 🌟 2. Chuẩn hóa mảng trường: Tự động ghép nối type và options từ window.cachedSchemaFields dựa vào key
		let dynamicFields = rawFields.map(f => {
			let fieldKey = '';
			let fieldObj = {};

			if (typeof f === 'string') {
				fieldKey = f;
				fieldObj = { key: f, label: f, type: 'text' };
			} else if (typeof f === 'object' && f !== null) {
				fieldKey = f.key;
				fieldObj = { ...f };
			}

			if (fieldKey && window.cachedSchemaFields) {
				const schemaMatch = window.cachedSchemaFields.find(s => s.key === fieldKey);
				if (schemaMatch) {
					fieldObj.type = fieldObj.type || schemaMatch.type || 'text';
					fieldObj.options = fieldObj.options || schemaMatch.options || [];
					fieldObj.label = fieldObj.label || schemaMatch.label || fieldKey;
				}
			}

			fieldObj.type = fieldObj.type || 'text';
			return fieldObj;
		});

		window.currentDynamicFieldsGlobal = dynamicFields;

		// Dựng phần Header cho bảng
		let headerHtml = `
			<th style="width: 100px; text-align: center;">Mã ID</th>
			<th style="width: 180px;">Họ và Tên</th>
			<th style="width: 100px; text-align: center;">Tổ / Lớp</th>
		`;

		dynamicFields.forEach(field => {
			const headerText = field.label || field.key || 'Trường dữ liệu';
			headerHtml += `<th style="min-width: 180px; text-align: center;">${headerText}</th>`;
		});

		headerHtml += `<th style="width: 110px; text-align: center;">Thao tác</th>`;
		tableHeader.innerHTML = headerHtml;

		if (listToRender.length === 0) {
			let totalCols = 4 + dynamicFields.length;
			tableBody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align: center; color: #6c757d; padding: 20px;">Không tìm thấy đối tượng nào phù hợp.</td></tr>`;
			return;
		}

		let bodyHtml = "";
		const myEmail = (window.currentUserEmailGlobal || firebase.auth().currentUser?.email || "").toLowerCase().trim();

		listToRender.forEach((item) => {
			const savedData = item.savedRecord || {};

			bodyHtml += `<tr data-id="${item.id}">
				<td style="font-weight: bold; text-align: center; vertical-align: middle;">${item.id}</td>
				<td style="vertical-align: middle;">${item.fullName || "Chưa cập nhật"}</td>
				<td style="text-align: center; vertical-align: middle;">${item.category || item.classOrGroup || "-"}</td>`;

			dynamicFields.forEach(field => {
				const fieldType = field.type; 
				const fieldKey = field.key;
				const storedValue = savedData[fieldKey] !== undefined ? savedData[fieldKey] : '';
				
				const fieldEmail = (savedData[`${fieldKey}_email`] || "").toLowerCase().trim();
				const fieldLabelBy = savedData[`${fieldKey}_by`] || "";

				let cellHtml = `<div style="display: flex; flex-direction: column; gap: 6px; align-items: stretch; text-align: left;">`;

				// 1. XỬ LÝ CHO KIỂU DỮ LIỆU NHIỀU LỰA CHỌN (OPTIONS / CHECKBOX) - PHÂN QUYỀN RẠCH RÒI
				if (fieldType === 'options' && Array.isArray(field.options) && field.options.length > 0) {
					// Hỗ trợ cả cấu trúc cũ (mảng chuỗi) hoặc cấu trúc mới (mảng đối tượng lưu chi tiết email)
					const storedValueRaw = storedValue;
					let storedOptionsList = []; // Danh sách các lựa chọn kèm theo metadata người tích

					if (Array.isArray(storedValueRaw)) {
						storedOptionsList = storedValueRaw.map(item => {
							if (typeof item === 'object' && item !== null) return item;
							return { value: item, email: fieldEmail, by: fieldLabelBy }; // Tương thích dữ liệu cũ
						});
					} else if (storedValueRaw) {
						storedOptionsList = [{ value: storedValueRaw, email: fieldEmail, by: fieldLabelBy }];
					}

					cellHtml += `<div style="display: flex; flex-direction: column; gap: 4px; background: #f8f9fa; padding: 6px; border-radius: 4px; border: 1px solid #dee2e6;">`;
					
					field.options.forEach(opt => {
						// Tìm xem option này đã được ai tích chưa
						const matchRecord = storedOptionsList.find(x => x.value === opt);
						const isChecked = !!matchRecord;
						
						// Kiểm tra xem option này có phải do CHÍNH MÌNH tích không
						const recordEmail = matchRecord ? (matchRecord.email || "").toLowerCase().trim() : "";
						const isMyOptToday = isChecked && (recordEmail === myEmail);

						// Điều kiện khóa: Nếu đã được tích bởi người khác -> Khóa (disabled)
						// Nếu chưa tích hoặc do chính mình tích -> Cho phép tương tác
						const isDisabled = isChecked && !isMyOptToday;
						const disabledAttr = isDisabled ? 'disabled' : '';
						const opacityStyle = isDisabled ? 'opacity: 0.6; cursor: not-allowed;' : 'cursor: pointer;';

						cellHtml += `
							<label style="font-size: 0.85em; display: flex; align-items: center; gap: 5px; ${opacityStyle}" title="${isDisabled ? 'Đã tích bởi: ' + (matchRecord.by || recordEmail) : ''}">
								<input type="checkbox" class="emp-dynamic-checkbox" 
									data-id="${item.id}" 
									data-field="${fieldKey}" 
									value="${opt}" 
									${isChecked ? 'checked' : ''} 
									${disabledAttr}> 
								<span ${isDisabled ? 'style="color: #6c757d; text-decoration: line-through;"' : ''}>${opt}</span>
								${isDisabled ? `<small style="font-size: 0.75em; color: #dc3545; margin-left: auto;">(${matchRecord.by || 'Khác'})</small>` : ''}
							</label>
						`;
					});
					
					cellHtml += `</div>`;
				}
				// 2. XỬ LÝ CHO KIỂU DỮ LIỆU VĂN BẢN / SỐ (TEXT / NUMBER) - Duyệt mảng nhiều mốc trong ngày
				else {
					let logsArray = Array.isArray(storedValue) ? storedValue : (storedValue ? [{ id: 'legacy', content: storedValue, email: fieldEmail, by: fieldLabelBy, time: 'Hôm nay' }] : []);

					if (logsArray.length > 0) {
						logsArray.forEach(logItem => {
							const isMyLog = (logItem.email && logItem.email.toLowerCase() === myEmail);

							if (isMyLog) {
								cellHtml += `
									<div style="background: #e7f1ff; padding: 6px; border-radius: 4px; border: 1px solid #b6d4fe; margin-bottom: 4px;">
										<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
											<small style="color: #0d6efd; font-weight: bold;">Do bạn ghi (${logItem.time || 'Hôm nay'})</small>
											<button type="button" onclick="clearSingleLogEntry('${item.id}', '${fieldKey}', '${logItem.id}')" style="color: red; background: none; border: none; cursor: pointer; font-size: 0.85em; font-weight: bold;" title="Xóa mốc này">
												<i class="fa-solid fa-trash"></i> Xóa
											</button>
										</div>
										<div style="color: #084298; font-weight: 500; font-size: 0.9em;">${logItem.content}</div>
									</div>
								`;
							} else {
								cellHtml += `
									<div style="background: #e9ecef; padding: 6px; border-radius: 4px; border: 1px solid #ced4da; margin-bottom: 4px; font-size: 0.85em;">
										<div style="color: #495057;">🔒 <b>${logItem.content}</b></div>
										<small style="color: #6c757d; display: block; margin-top: 2px;">
											<i>${logItem.by || 'Ghi nhận trước đó'}</i>
										</small>
									</div>
								`;
							}
						});
					}

					// Ô input luôn sẵn sàng để nhập thêm mốc mới trong ngày
					cellHtml += `
						<input type="text" class="emp-dynamic-input" 
							data-id="${item.id}" 
							data-field="${fieldKey}" 
							value="" 
							placeholder="+ Nhập bổ sung (tiết mới)..." 
							style="width: 100%; padding: 5px 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 0.9em; margin-top: 4px;">
					`;
				}

				cellHtml += `</div>`;

				bodyHtml += `
					<td style="vertical-align: middle; padding: 6px;">
						${cellHtml}
					</td>
				`;
			});

			// Cột thao tác với nút Lưu từng dòng riêng biệt
			bodyHtml += `
				<td style="text-align: center; vertical-align: middle;">
					<button type="button" onclick="saveSingleEmployeeEntry('${item.id}')" style="padding: 6px 12px; background: #198754; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;" title="Lưu dòng này">
						<i class="fa-solid fa-floppy-disk"></i> Lưu
					</button>
				</td>
			</tr>`;
		});

		tableBody.innerHTML = bodyHtml;
	}

	
	
	//Hàm cho phép người nhập liệu xóa dữ liệu nhập sai trong ngày
	async function clearSingleCellData(entityId, fieldKey) {
		if (!confirm("Bạn có chắc chắn muốn xóa dữ liệu này để nhập lại không?")) return;

		const orgId = window.currentOrgIdGlobal;
		const academicId = document.getElementById("emp-academic-year-select")?.value;
		const moduleId = document.getElementById("emp-module-select")?.value;

		if (!orgId || !academicId || !moduleId) return;

		try {
			const db = firebase.firestore();
			const docRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("records")
				.doc(entityId);

			// Dùng FieldValue.delete() để xóa sạch trường fieldKey đó trên Firestore
			await docRef.update({
				[fieldKey]: firebase.firestore.FieldValue.delete(),
				updatedAt: getVietnamTimestamp()
			});

			alert("Đã xóa dữ liệu cũ thành công! Bạn có thể nhập lại giá trị mới.");
			
			// Tải lại bảng ngay lập tức
			if (typeof refreshAndRenderEmployeeData === 'function') {
				refreshAndRenderEmployeeData();
			}
		} catch (err) {
			console.error("Lỗi khi xóa dữ liệu ô:", err);
			alert("Không thể xóa: " + err.message);
		}
	}

	// 3. Hàm tìm kiếm trực tiếp trên bảng (Live Search)
	function searchAndRenderTodayPersonnelRecords() {
		const keyword = document.getElementById("emp-live-search-input").value.toLowerCase().trim();
		
		if (!keyword) {
			renderEmployeeTable(currentEmployeeEntities, currentModuleConfig);
			return;
		}

		const filtered = currentEmployeeEntities.filter(item => {
			const id = (item.id || "").toLowerCase();
			const name = (item.fullName || "").toLowerCase();
			const category = (item.category || "").toLowerCase();
			return id.includes(keyword) || name.includes(keyword) || category.includes(keyword);
		});

		renderEmployeeTable(filtered, currentModuleConfig);
	}

	// 4. Hàm lưu TẤT CẢ thay đổi trên bảng (Nút "LƯU TẤT CẢ THAY ĐỔI")
	async function saveAllEmployeeEntries() {
		const orgId = window.currentOrgIdGlobal;
		const academicId = document.getElementById("emp-academic-year-select")?.value;
		const moduleId = document.getElementById("emp-module-select")?.value;
		const msgEl = document.getElementById("emp-save-msg");

		if (!orgId || !academicId || !moduleId) {
			alert("Thiếu thông tin tổ chức, năm học hoặc nhiệm vụ!");
			return;
		}

		if (msgEl) {
			msgEl.style.color = "#0d6efd";
			msgEl.textContent = `⏳ Đang xử lý lưu tất cả bảng, vui lòng chờ...`;
		}

		try {
			const db = firebase.firestore();
			const updaterName = window.currentUserNameGlobal || "Giáo viên";
			const updaterEmail = window.currentUserEmailGlobal || firebase.auth().currentUser?.email || "unknown@school.edu.vn";
			const todayStr = new Date().toLocaleDateString('en-CA');

			// Lấy thời gian hiển thị nhãn
			const now = new Date();
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const year = now.getFullYear();
			const timeString = `${hours}:${minutes} ngày ${day}/${month}/${year}`;
			const labelText = `Ghi bởi ${updaterName} lúc ${timeString}`;
			const timeStr = `${hours}:${minutes}`;

			// Lấy danh sách tất cả các hàng (tr) đang hiển thị trên bảng
			const tableRows = document.querySelectorAll("#emp-entry-table-body tr[data-id]");
			if (tableRows.length === 0) {
				alert("Không có dữ liệu trên bảng để lưu!");
				if (msgEl) msgEl.textContent = "";
				return;
			}

			const batch = db.batch();
			let totalUpdatedRows = 0;

			for (const row of tableRows) {
				const entityId = row.getAttribute("data-id");
				if (!entityId) continue;

				const dailyDocId = `${entityId}_${todayStr}`;
				const docRef = db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicId)
					.collection("modulesData")
					.doc(moduleId)
					.collection("records")
					.doc(dailyDocId);

				const docSnap = await docRef.get();
				const existingData = docSnap.exists ? docSnap.data() : {};

				let rowHasChanges = false;
				let updatedFields = { ...existingData };
				let auditChanges = {};

				// 1. Quét các ô input văn bản của dòng này
				const rowInputs = row.querySelectorAll(`.emp-dynamic-input[data-id="${entityId}"]`);
				rowInputs.forEach(input => {
					const fieldKey = input.getAttribute("data-field");
					const val = input.value.trim();

					if (val !== "") {
						rowHasChanges = true;
						if (!Array.isArray(updatedFields[fieldKey])) {
							updatedFields[fieldKey] = [];
						}

						const logEntryId = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
						updatedFields[fieldKey].push({
							id: logEntryId,
							content: val,
							email: updaterEmail,
							by: labelText,
							time: timeStr
						});

						auditChanges[fieldKey] = `Thêm mới: "${val}"`;
						input.value = ""; // Reset ô input sau khi gom
					}
				});

				// 2. Quét các ô checkbox / options của dòng này
				const allCheckboxesInRow = row.querySelectorAll(`.emp-dynamic-checkbox[data-id="${entityId}"]`);
				if (allCheckboxesInRow.length > 0) {
					const currentMyCheckedMap = {};
					const affectedFields = new Set();

					allCheckboxesInRow.forEach(chk => {
						const fieldKey = chk.getAttribute("data-field");
						affectedFields.add(fieldKey);
						if (chk.checked && !chk.disabled) {
							if (!currentMyCheckedMap[fieldKey]) {
								currentMyCheckedMap[fieldKey] = [];
							}
							currentMyCheckedMap[fieldKey].push(chk.value);
						}
					});

					affectedFields.forEach(fieldKey => {
						const mySelectedValues = currentMyCheckedMap[fieldKey] || [];
						const oldFieldData = Array.isArray(existingData[fieldKey]) ? existingData[fieldKey] : [];

						// Giữ lại phần tích của giáo viên khác
						const otherPeopleOpts = oldFieldData.filter(item => {
							const itemEmail = (typeof item === 'object' && item !== null) ? (item.email || "") : "";
							return itemEmail.toLowerCase() !== updaterEmail.toLowerCase();
						});

						// Tạo mảng giá trị tích mới của chính mình
						const myNewOptsObjects = mySelectedValues.map(val => ({
							value: val,
							email: updaterEmail,
							by: labelText,
							time: timeStr
						}));

						const combinedOpts = [...otherPeopleOpts, ...myNewOptsObjects];

						const oldMyValues = oldFieldData
							.filter(item => (typeof item === 'object' && item !== null ? (item.email || "").toLowerCase() === updaterEmail.toLowerCase() : false))
							.map(item => item.value);

						if (JSON.stringify(oldMyValues.sort()) !== JSON.stringify(mySelectedValues.sort())) {
							rowHasChanges = true;
							updatedFields[fieldKey] = combinedOpts;
							auditChanges[fieldKey] = `Cập nhật options: [${mySelectedValues.join(', ')}]`;
						}
					});
				}

				// Nếu dòng này có sự thay đổi, tiến hành đưa vào batch
				if (rowHasChanges) {
					totalUpdatedRows++;
					const payload = {
						...updatedFields,
						entityId: entityId,
						date: todayStr,
						updatedAt: getVietnamTimestamp()
					};

					if (!docSnap.exists) {
						payload.createdDate = todayStr;
					}

					batch.set(docRef, payload, { merge: true });

					// Ghi log audit cho từng đối tượng thay đổi
					const auditLogsRef = db.collection("organizations")
						.doc(orgId)
						.collection("academicYears")
						.doc(academicId)
						.collection("modulesData")
						.doc(moduleId)
						.collection("auditLogs");

					const newLogRef = auditLogsRef.doc();
					batch.set(newLogRef, {
						entityId: entityId,
						updaterEmail: updaterEmail,
						updaterName: updaterName,
						action: "Lưu hàng loạt (Save All)",
						changes: auditChanges,
						date: todayStr,
						timestamp: getVietnamTimestamp()
					});
				}
			}

			if (totalUpdatedRows === 0) {
				alert("Không có thay đổi hoặc nội dung mới nào trên bảng để lưu!");
				if (msgEl) msgEl.textContent = "";
				return;
			}

			// Thực hiện ghi toàn bộ batch lên Firestore trong 1 transaction duy nhất
			await batch.commit();

			if (msgEl) {
				msgEl.style.color = "#198754";
				msgEl.textContent = `✅ Đã lưu thành công ${totalUpdatedRows} bản ghi thay đổi!`;
				setTimeout(() => { msgEl.textContent = ""; }, 3000);
			}

			if (typeof refreshAndRenderEmployeeData === 'function') {
				refreshAndRenderEmployeeData();
			}

		} catch (err) {
			console.error("Lỗi khi lưu tất cả:", err);
			alert("Lỗi khi lưu hàng loạt: " + err.message);
			if (msgEl) msgEl.textContent = "";
		}
	}

	//	SAVE DỮ LIỆU ĐƠN
	
	async function saveSingleEmployeeEntry(entityId) {
		const orgId = window.currentOrgIdGlobal;
		const academicId = document.getElementById("emp-academic-year-select")?.value;
		const moduleId = document.getElementById("emp-module-select")?.value;
		const msgEl = document.getElementById("emp-save-msg");

		if (!orgId || !academicId || !moduleId) {
			alert("Thiếu thông tin tổ chức, năm học hoặc nhiệm vụ!");
			return;
		}

		if (msgEl) {
			msgEl.style.color = "#0d6efd";
			msgEl.textContent = `⏳ Đang lưu bản ghi [${entityId}], vui lòng chờ...`;
		}

		try {
			const db = firebase.firestore();
			const updaterName = window.currentUserNameGlobal || "Giáo viên";
			const updaterEmail = window.currentUserEmailGlobal || firebase.auth().currentUser?.email || "unknown@school.edu.vn";
			const todayStr = new Date().toLocaleDateString('en-CA');
			const dailyDocId = `${entityId}_${todayStr}`;

			const docRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("records")
				.doc(dailyDocId);

			const auditLogsRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("auditLogs");

			const docSnap = await docRef.get();
			const existingData = docSnap.exists ? docSnap.data() : {};

			// Lấy thời gian hiển thị
			const now = new Date();
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const year = now.getFullYear();
			const timeString = `${hours}:${minutes} ngày ${day}/${month}/${year}`;
			const labelText = `Ghi bởi ${updaterName} lúc ${timeString}`;
			const timeStr = `${hours}:${minutes}`;

			let newEntriesFound = false;
			let updatedFields = { ...existingData };
			let auditChanges = {};

			// 1. Xử lý các ô input văn bản (Thêm bổ sung vào mảng logs)
			const rowInputs = document.querySelectorAll(`.emp-dynamic-input[data-id="${entityId}"]`);
			rowInputs.forEach(input => {
				const fieldKey = input.getAttribute("data-field");
				const val = input.value.trim();
				
				if (val !== "") {
					newEntriesFound = true;
					
					if (!Array.isArray(updatedFields[fieldKey])) {
						updatedFields[fieldKey] = [];
					}

					const logEntryId = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
					
					updatedFields[fieldKey].push({
						id: logEntryId,
						content: val,
						email: updaterEmail,
						by: labelText,
						time: timeStr
					});

					auditChanges[fieldKey] = `Thêm mới: "${val}"`;
					input.value = ""; 
				}
			});

			// 2. Xử lý checkbox / options (Lưu kèm metadata chi tiết, bảo vệ phần của giáo viên khác)
			const allCheckboxesInRow = document.querySelectorAll(`.emp-dynamic-checkbox[data-id="${entityId}"]`);
			if (allCheckboxesInRow.length > 0) {
				const currentMyCheckedMap = {};
				const affectedFields = new Set();

				allCheckboxesInRow.forEach(chk => {
					const fieldKey = chk.getAttribute("data-field");
					affectedFields.add(fieldKey);
					if (chk.checked && !chk.disabled) { // Chỉ lấy các ô được tích và không bị khóa
						if (!currentMyCheckedMap[fieldKey]) {
							currentMyCheckedMap[fieldKey] = [];
						}
						currentMyCheckedMap[fieldKey].push(chk.value);
					}
				});

				affectedFields.forEach(fieldKey => {
					const mySelectedValues = currentMyCheckedMap[fieldKey] || [];
					const oldFieldData = Array.isArray(existingData[fieldKey]) ? existingData[fieldKey] : [];

					// Tách phần dữ liệu do NGƯỜI KHÁC tích từ trước (để giữ nguyên không làm mất)
					const otherPeopleOpts = oldFieldData.filter(item => {
						const itemEmail = (typeof item === 'object' && item !== null) ? (item.email || "") : "";
						return itemEmail.toLowerCase() !== updaterEmail.toLowerCase();
					});

					// Tạo danh sách đối tượng chi tiết cho phần mới tích của CHÍNH MÌNH
					const myNewOptsObjects = mySelectedValues.map(val => ({
						value: val,
						email: updaterEmail,
						by: labelText,
						time: timeStr
					}));

					// Gộp lại: Phần của người khác + Phần mới của mình
					const combinedOpts = [...otherPeopleOpts, ...myNewOptsObjects];

					// Kiểm tra xem có sự thay đổi thực sự so với cũ không
					const oldMyValues = oldFieldData
						.filter(item => (typeof item === 'object' && item !== null ? (item.email || "").toLowerCase() === updaterEmail.toLowerCase() : false))
						.map(item => item.value);

					if (JSON.stringify(oldMyValues.sort()) !== JSON.stringify(mySelectedValues.sort())) {
						newEntriesFound = true;
						updatedFields[fieldKey] = combinedOpts;
						auditChanges[fieldKey] = `Cập nhật options: [${mySelectedValues.join(', ')}]`;
					}
				});
			}

			if (!newEntriesFound) {
				alert("Vui lòng nhập nội dung mới hoặc thay đổi lựa chọn trước khi lưu!");
				if (msgEl) msgEl.textContent = "";
				return;
			}

			const payload = {
				...updatedFields,
				entityId: entityId,
				date: todayStr,
				updatedAt: getVietnamTimestamp()
			};

			if (!docSnap.exists) {
				payload.createdDate = todayStr;
			}

			const batch = db.batch();
			batch.set(docRef, payload, { merge: true });

			const newLogRef = auditLogsRef.doc();
			batch.set(newLogRef, {
				entityId: entityId,
				updaterEmail: updaterEmail,
				updaterName: updaterName,
				action: "Cập nhật / Bổ sung dữ liệu trong ngày",
				changes: auditChanges,
				date: todayStr,
				timestamp: getVietnamTimestamp()
			});

			await batch.commit();

			if (msgEl) {
				msgEl.style.color = "#198754";
				msgEl.textContent = `✅ Đã lưu thành công bản ghi [${entityId}]!`;
				setTimeout(() => { msgEl.textContent = ""; }, 3000);
			}

			if (typeof refreshAndRenderEmployeeData === 'function') {
				refreshAndRenderEmployeeData();
			}

		} catch (err) {
			console.error("Lỗi lưu bổ sung:", err);
			alert("Lỗi khi lưu: " + err.message);
			if (msgEl) msgEl.textContent = "";
		}
	}
	
	async function clearSingleLogEntry(entityId, fieldKey, logEntryId) {
		if (!confirm("Bạn có chắc chắn muốn xóa mốc ghi nhận này không?")) return;

		const orgId = window.currentOrgIdGlobal;
		const academicId = document.getElementById("emp-academic-year-select")?.value;
		const moduleId = document.getElementById("emp-module-select")?.value;
		const todayStr = new Date().toLocaleDateString('en-CA');
		const dailyDocId = `${entityId}_${todayStr}`;

		const db = firebase.firestore();
		const docRef = db.collection("organizations")
			.doc(orgId)
			.collection("academicYears")
			.doc(academicId)
			.collection("modulesData")
			.doc(moduleId)
			.collection("records")
			.doc(dailyDocId);

		try {
			const docSnap = await docRef.get();
			if (!docSnap.exists) return;

			const data = docSnap.data();
			const currentList = data[fieldKey];

			if (Array.isArray(currentList)) {
				// Lọc bỏ phần tử có id trùng khớp
				const updatedList = currentList.filter(item => item.id !== logEntryId);

				await docRef.update({
					[fieldKey]: updatedList,
					updatedAt: getVietnamTimestamp()
				});

				alert("Đã xóa thành công mốc ghi nhận!");
				refreshAndRenderEmployeeData();
			}
		} catch (err) {
			console.error("Lỗi khi xóa mốc log:", err);
			alert("Lỗi khi xóa: " + err.message);
		}
	}
	
	async function writeAuditLog(orgId, academicId, actionType, moduleId, targetEntityId, changesData) {
		try {
			const user = firebase.auth().currentUser;
			if (!user) return;

			const db = firebase.firestore();
			const now = new Date();
			const dateStr = now.toISOString().split('T')[0]; // Lấy chuỗi "YYYY-MM-DD"

			// Lấy thông tin user hiện tại từ cache hoặc localStorage nếu có, hoặc dùng trực tiếp email
			const userEmail = user.email || "";

			await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("auditlogs")
				.add({
					timestamp: getVietnamTimestamp(),
					date: dateStr,
					userEmail: userEmail,
					action: actionType, // "UPDATE", "INSERT", "DELETE"
					moduleId: moduleId || "",
					targetEntityId: targetEntityId || "",
					changes: changesData || {},
					createdAt: now.toISOString()
				});
		} catch (err) {
			console.error("Không thể ghi audit log:", err);
			// Không chặn luồng chính của người dùng nếu log lỗi
		}
	}
	
	async function loadModulesIntoSelect() {
		const selectEl = document.getElementById("select-grid-module");
		if (!selectEl) return;

		let orgId = window.currentOrgIdGlobal;
		if (!orgId && typeof ensureOrgId === 'function') {
			orgId = await ensureOrgId();
		}

		if (!orgId) {
			console.warn("⚠️ Chưa có OrgId để tải module.");
			return;
		}

		try {
			const db = firebase.firestore();
			const snapshot = await db.collection("organizations").doc(orgId).collection("modules").get();
			
			let modulesList = [];
			snapshot.forEach(doc => {
				modulesList.push({ id: doc.id, ...doc.data() });
			});

			// Lưu vào cache RAM toàn cục
			window.cachedModulesList = modulesList;

			if (modulesList.length > 0) {
				const currentValue = selectEl.value;

				let html = '<option value="">-- Chọn bài toán module --</option>';
				modulesList.forEach(mod => {
					html += `<option value="${mod.id}">${mod.name || mod.id} [${mod.id}]</option>`;
				});
				selectEl.innerHTML = html;

				// Xác định giá trị sẽ chọn
				let targetValue = "";
				if (currentValue && modulesList.some(m => m.id === currentValue)) {
					targetValue = currentValue;
				} else {
					targetValue = modulesList[0].id;
				}

				// Gán giá trị và lưu vào biến toàn cục
				selectEl.value = targetValue;
				window.currentModuleIdGlobal = targetValue;

				// 🌟 KÍCH HOẠT NGAY LẬP TỨC: Gọi luôn hàm load dữ liệu mà không cần đợi người dùng phải bấm chọn lại
				if (targetValue && typeof reloadAllGridSections === 'function') {
					reloadAllGridSections(true);
				}
			} else {
				selectEl.innerHTML = '<option value="">-- Chưa có bài toán module --</option>';
			}
		} catch (error) {
			console.error("❌ Lỗi tải danh sách module khi click select:", error);
		}
	}
	
	async function initSelectDefaultModule() {
		const selectEl = document.getElementById("select-grid-module");
		if (!selectEl) return;

		let orgId = window.currentOrgIdGlobal;
		if (!orgId && typeof ensureOrgId === 'function') {
			orgId = await ensureOrgId();
		}
		if (!orgId) return;

		try {
			const db = firebase.firestore();
			const snapshot = await db.collection("organizations").doc(orgId).collection("modules").get();
			
			let modulesList = [];
			snapshot.forEach(doc => {
				modulesList.push({ id: doc.id, ...doc.data() });
			});

			// Lưu vào cache RAM toàn cục
			window.cachedModulesList = modulesList;

			if (modulesList.length > 0) {
				let html = '';
				modulesList.forEach(mod => {
					html += `<option value="${mod.id}">${mod.name || mod.id} [${mod.id}]</option>`;
				});
				selectEl.innerHTML = html;

				// 🌟 Đặt mặc định giá trị là phần tử đầu tiên và gán vào biến toàn cục
				const firstModuleId = modulesList[0].id;
				selectEl.value = firstModuleId;
				window.currentModuleIdGlobal = firstModuleId;

				console.log("🎯 Đã đặt mặc định module đầu tiên:", firstModuleId);
			} else {
				selectEl.innerHTML = '<option value="">-- Chưa có bài toán module --</option>';
			}
		} catch (error) {
			console.error("❌ Lỗi khởi tạo mặc định module:", error);
		}
	}
	
	//	THẺ 4 - LỚP CHỦ NHIỆM
	async function loadHomeroomClassData(forceRefresh = false) {
		const tableBody = document.getElementById("emp-homeroom-body-rows");
		const headerRow = document.getElementById("emp-homeroom-header-row");
		const classNameSpan = document.getElementById("emp-homeroom-class-name");
		const modeSelect = document.getElementById("emp-homeroom-mode-select");
		const badge = document.getElementById("emp-homeroom-cache-badge");

		if (!tableBody) return;

		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị (OrgId).</td></tr>';
			return;
		}

		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được năm học hiện tại.</td></tr>';
			return;
		}

		const authUser = firebase.auth().currentUser;
		if (!authUser) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa đăng nhập hệ thống.</td></tr>';
			return;
		}
		const teacherId = authUser.uid;
		const mode = modeSelect ? modeSelect.value : "daily"; // Lấy chế độ: daily, weekly, monthly

		tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d;">Đang tải dữ liệu lớp chủ nhiệm theo chế độ (${mode === 'monthly' ? 'Tháng' : mode === 'weekly' ? 'Tuần' : 'Ngày'})...</td></tr>`;

		try {
			const db = firebase.firestore();

			// 🌟 BƯỚC 1: Lấy thông tin lớp chủ nhiệm (Sử dụng logic tìm kiếm chuẩn xác theo ID nhân sự và lọc phân tách thông minh)
			let homeroomClasses = window.currentTeacherHomerooms || [];
			if (homeroomClasses.length === 0 || forceRefresh) {
				try {
					const assignRef = db.collection("organizations")
						.doc(orgId)
						.collection("academicYears")
						.doc(academicYearId)
						.collection("assignments");

					let assignData = null;

					// 1. Thử lấy thông tin từ document emails được lưu lúc đăng nhập (chứa userId chính là "GV001")
					// Hoặc ta có thể quét toàn bộ collection assignments trong năm học để tìm bản ghi khớp email hoặc memberId
					const allAssigns = await assignRef.get();
					
					// Lấy email của user đang đăng nhập để so khớp dự phòng
					const currentEmail = (window.currentUserEmailGlobal || authUser.email || "").toLowerCase().trim();

					allAssigns.forEach(d => {
						const data = d.data();
						// Nếu ID của doc trùng với authUser.uid HOẶC memberId trùng, hoặc email trùng khớp
						if (d.id === teacherId || data.memberId === teacherId || (data.email && data.email.toLowerCase().trim() === currentEmail)) {
							assignData = data;
						}
					});

					if (assignData) {
						let rawData = assignData.homeroom || assignData.homeroomClasses || assignData.classes || [];
						let itemsList = [];

						if (typeof rawData === 'string') {
							itemsList = rawData.split(',').map(s => s.trim()).filter(Boolean);
						} else if (Array.isArray(rawData)) {
							itemsList = rawData;
						}

						let parsedHomerooms = [];
						let parsedDepartments = [];

						// 🌟 Lọc thông minh: Có số -> Lớp chủ nhiệm (VD: "10A1"), Không số -> Tổ chuyên môn (VD: "Hóa")
						itemsList.forEach(item => {
							const val = String(item).trim();
							if (/\d/.test(val)) {
								parsedHomerooms.push(val);
							} else {
								parsedDepartments.push(val);
							}
						});

						homeroomClasses = parsedHomerooms;
						window.currentTeacherHomerooms = parsedHomerooms;
						window.currentTeacherDepartments = parsedDepartments;
					}
				} catch (err) {
					console.warn("⚠️ Không thể đọc phân công lớp chủ nhiệm từ Firestore:", err);
				}
			}

			if (homeroomClasses.length === 0) {
				if (classNameSpan) classNameSpan.innerText = "Không có lớp chủ nhiệm";
				tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6c757d; font-style: italic;">Bạn không được phân công chủ nhiệm lớp nào trong năm học này (hoặc chưa cấu hình trong bảng assignments).</td></tr>';
				return;
			}

			if (classNameSpan) classNameSpan.innerText = homeroomClasses.join(", ");

			// 2. Lấy danh sách học sinh thuộc lớp chủ nhiệm từ cachedUsersMap hoặc query
			if (!window.cachedUsersMap || Object.keys(window.cachedUsersMap).length === 0) {
				const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
				window.cachedUsersMap = {};
				usersSnap.forEach(uDoc => {
					const uData = uDoc.data();
					window.cachedUsersMap[uDoc.id] = {
						fullName: uData.fullName || uDoc.id,
						category: uData.category || uData.className || ""
					};
				});
			}

			let homeroomStudents = [];
			for (const [uId, uInfo] of Object.entries(window.cachedUsersMap)) {
				if (homeroomClasses.includes(uInfo.category)) {
					homeroomStudents.push({
						id: uId,
						name: uInfo.fullName,
						category: uInfo.category
					});
				}
			}

			if (homeroomStudents.length === 0) {
				tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d; font-style: italic;">Không tìm thấy học sinh nào thuộc lớp chủ nhiệm (${homeroomClasses.join(", ")}).</td></tr>`;
				return;
			}

			// 3. Đọc cấu hình KPI rules từ KPIconfig/student (dùng cho chế độ monthly)
			const kpiConfigDoc = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("KPIconfig")
				.doc("student")
				.get();
			const kpiRules = kpiConfigDoc.exists ? kpiConfigDoc.data() : {};

			// 4. Lấy danh sách module targetType == "STUDENT"
			const modulesSnap = await db.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.where("targetType", "==", "STUDENT")
				.get();

			let kpiFieldsMap = {};
			modulesSnap.forEach(modDoc => {
				const modData = modDoc.data();
				const fieldsArr = Array.isArray(modData.fields) ? modData.fields : [];
				fieldsArr.forEach(fObj => {
					if (fObj && fObj.isKpi && fObj.key) {
						kpiFieldsMap[fObj.key] = {
							id: fObj.key,
							name: fObj.label || fObj.key,
							scoreWeight: Number(fObj.scoreWeight || -1)
						};
					}
				});
			});

			const kpiFieldsList = Object.values(kpiFieldsMap);

			// 5. Dựng tiêu đề bảng động tùy theo chế độ xem
			let headerHtml = `
				<th style="width: 90px;">Mã ID</th>
				<th style="width: 170px;">Họ và Tên</th>
				<th style="width: 100px;">Lớp</th>
			`;
			kpiFieldsList.forEach(field => {
				headerHtml += `<th style="text-align: center; min-width: 90px;">${field.name}</th>`;
			});
			
			if (mode === "monthly") {
				headerHtml += `
					<th style="width: 110px; text-align: center;">Tổng lượt</th>
					<th style="width: 100px; text-align: center;">Tổng điểm</th>
					<th style="width: 120px; text-align: center;">Xếp loại Tháng</th>
				`;
			} else {
				headerHtml += `
					<th style="width: 110px; text-align: center;">Tổng lượt vi phạm</th>
				`;
			}
			if (headerRow) headerRow.innerHTML = headerHtml;

			// 6. Lấy dữ liệu từ modulesData cho từng học sinh
			let studentStatsMap = {};
			homeroomStudents.forEach(st => {
				studentStatsMap[st.id] = {
					id: st.id,
					name: st.name,
					className: st.category,
					totalCount: 0,
					totalScore: 0,
					kpiCounts: {}
				};
			});

			for (const modDoc of modulesSnap.docs) {
				const recordsSnap = await db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicYearId)
					.collection("modulesData")
					.doc(modDoc.id)
					.collection("records")
					.get();

				recordsSnap.forEach(recDoc => {
					const data = recDoc.data();
					const entityId = data.entityId || recDoc.id;

					if (studentStatsMap[entityId]) {
						kpiFieldsList.forEach(kpiField => {
							const fKey = kpiField.id;
							let val = data[fKey];
							if (val === undefined && data.changes && data.changes[fKey] !== undefined) {
								val = data.changes[fKey];
							}

							if (val !== undefined && val !== null && val !== "") {
								const countInc = Array.isArray(val) ? val.length : 1;
								studentStatsMap[entityId].totalCount += countInc;
								studentStatsMap[entityId].totalScore += countInc * kpiField.scoreWeight;
								studentStatsMap[entityId].kpiCounts[fKey] = (studentStatsMap[entityId].kpiCounts[fKey] || 0) + countInc;
							}
						});
					}
				});
			}

			const processedList = Object.values(studentStatsMap).map(item => {
				let rank = "🟢 Tốt";
				let badgeStyle = "background: #d1e7dd; color: #0f5132;";

				if (mode === "monthly") {
					const chuadatCount = Number(kpiRules.chuadat_count || 15);
					const chuadatScore = Number(kpiRules.chuadat_score || 15);
					const datCount = Number(kpiRules.dat_count || 10);
					const datScore = Number(kpiRules.dat_score || 10);
					const khaCount = Number(kpiRules.kha_count || 5);
					const khaScore = Number(kpiRules.kha_score || 5);

					if (item.totalCount >= chuadatCount || Math.abs(item.totalScore) >= chuadatScore) {
						rank = "🔴 Chưa đạt";
						badgeStyle = "background: #f8d7da; color: #842029;";
					} else if (item.totalCount >= datCount || Math.abs(item.totalScore) >= datScore) {
						rank = "🟠 Đạt";
						badgeStyle = "background: #fff3cd; color: #664d03;";
					} else if (item.totalCount >= khaCount || Math.abs(item.totalScore) >= khaScore) {
						rank = "🔵 Khá";
						badgeStyle = "background: #cff4fc; color: #055160;";
					}
				}

				return { ...item, rank, badgeStyle };
			});

			// 7. Render ra bảng HTML
			if (processedList.length === 0) {
				tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d; font-style: italic;">Chưa có dữ liệu vi phạm nào trong lớp chủ nhiệm.</td></tr>`;
				return;
			}

			let html = "";
			processedList.forEach(item => {
				html += `
					<tr style="border-bottom: 1px solid #dee2e6;">
						<td style="font-family: monospace; font-weight: bold;">${item.id}</td>
						<td>${item.name}</td>
						<td><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${item.className}</span></td>
				`;

				kpiFieldsList.forEach(field => {
					const countVal = item.kpiCounts[field.id] || 0;
					html += `<td style="text-align: center;">${countVal > 0 ? `<span style="color: #dc3545; font-weight: bold;">${countVal}</span>` : '<span style="color: #ccc;">0</span>'}</td>`;
				});

				if (mode === "monthly") {
					html += `
						<td style="text-align: center; font-weight: bold;">${item.totalCount}</td>
						<td style="text-align: center; color: #dc3545; font-weight: bold;">${item.totalScore}đ</td>
						<td style="text-align: center;"><span style="${item.badgeStyle} padding: 3px 10px; border-radius: 4px; font-weight: bold; display: inline-block;">${item.rank}</span></td>
					`;
				} else {
					html += `
						<td style="text-align: center; font-weight: bold; color: #0d6efd;">${item.totalCount} lượt</td>
					`;
				}

				html += `</tr>`;
			});

			tableBody.innerHTML = html;
			if (badge) badge.innerText = "🌐 Cập nhật lúc: " + new Date().toLocaleTimeString();

		} catch (error) {
			console.error("Lỗi tải dữ liệu lớp chủ nhiệm:", error);
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Lỗi tải dữ liệu lớp chủ nhiệm.</td></tr>';
		}
	}
	
	//	THẺ 5
	async function loadDepartmentData(forceRefresh = false) {
		const tableBody = document.getElementById("emp-dept-body-rows");
		const headerRow = document.getElementById("emp-dept-header-row");

		if (!tableBody) return;

		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị (OrgId).</td></tr>';
			return;
		}

		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được năm học hiện tại.</td></tr>';
			return;
		}

		const authUser = firebase.auth().currentUser;
		if (!authUser) {
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Chưa đăng nhập hệ thống.</td></tr>';
			return;
		}

		tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6c757d;">Đang tải dữ liệu tổ chuyên môn...</td></tr>';

		try {
			const db = firebase.firestore();

			// 1. Tải toàn bộ danh sách users nếu chưa có cache
			if (!window.cachedUsersMap || Object.keys(window.cachedUsersMap).length === 0 || forceRefresh) {
				const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
				window.cachedUsersMap = {};
				usersSnap.forEach(uDoc => {
					const uData = uDoc.data();
					window.cachedUsersMap[uDoc.id] = {
						uid: uData.uid || uDoc.id,
						fullName: uData.fullName || uDoc.id,
						category: uData.category || "", // Tổ chuyên môn (VD: "Hóa")
						email: (uData.email || "").toLowerCase().trim(),
						role: uData.role || ""
					};
				});
			}

			// 2. Tìm thông tin (Tổ chuyên môn / category) của giáo viên đang đăng nhập
			const currentEmail = (window.currentUserEmailGlobal || authUser.email || "").toLowerCase().trim();
			let myCategory = "";

			for (const [uId, uInfo] of Object.entries(window.cachedUsersMap)) {
				if (uInfo.email === currentEmail || uId === authUser.uid) {
					myCategory = uInfo.category;
					break;
				}
			}

			// Dự phòng nếu chưa tìm thấy qua email, lấy từ biến toàn cục
			if (!myCategory && window.currentTeacherDepartments && window.currentTeacherDepartments.length > 0) {
				myCategory = window.currentTeacherDepartments[0];
			}

			if (!myCategory) {
				tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6c757d; font-style: italic;">Không xác định được tổ chuyên môn (category) của bạn.</td></tr>';
				return;
			}

			// 3. Lọc toàn bộ giáo viên/nhân sự trong cachedUsersMap có `category` trùng khớp
			let departmentColleagues = [];
			for (const [uId, uInfo] of Object.entries(window.cachedUsersMap)) {
				if (uInfo.category && uInfo.category.toLowerCase() === myCategory.toLowerCase()) {
					departmentColleagues.push({
						id: uInfo.uid || uId, // Sử dụng trường uid (MemberId) làm ID chính
						name: uInfo.fullName,
						department: uInfo.category
					});
				}
			}

			if (departmentColleagues.length === 0) {
				tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #6c757d; font-style: italic;">Không tìm thấy thành viên nào thuộc tổ chuyên môn (${myCategory}).</td></tr>`;
				return;
			}

			// 4. Lấy danh sách module đánh giá dành cho Giáo viên/Nhân sự (targetType == "TEACHER" hoặc "EMPLOYEE")
			const modulesSnap = await db.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.where("targetType", "in", ["TEACHER", "EMPLOYEE"])
				.get();

			let kpiFieldsMap = {};
			modulesSnap.forEach(modDoc => {
				const modData = modDoc.data();
				const fieldsArr = Array.isArray(modData.fields) ? modData.fields : [];
				fieldsArr.forEach(fObj => {
					if (fObj && fObj.isKpi && fObj.key) {
						kpiFieldsMap[fObj.key] = {
							id: fObj.key,
							name: fObj.label || fObj.key,
							scoreWeight: Number(fObj.scoreWeight || -1)
						};
					}
				});
			});

			const kpiFieldsList = Object.values(kpiFieldsMap);

			// 5. Dựng tiêu đề bảng động cho Thẻ 5
			let headerHtml = `
				<th style="width: 100px;">Mã ID</th>
				<th style="width: 180px;">Họ và Tên</th>
				<th style="width: 120px;">Tổ chuyên môn</th>
			`;
			kpiFieldsList.forEach(field => {
				headerHtml += `<th style="text-align: center; min-width: 90px;">${field.name}</th>`;
			});
			headerHtml += `
				<th style="width: 120px; text-align: center;">Tổng số lỗi</th>
			`;
			if (headerRow) headerRow.innerHTML = headerHtml;

			// 6. Tổng hợp dữ liệu vi phạm từ modulesData cho tất cả thành viên trong tổ
			let statsMap = {};
			departmentColleagues.forEach(c => {
				statsMap[c.id] = {
					id: c.id,
					name: c.name,
					department: c.department,
					totalErrors: 0,
					kpiCounts: {}
				};
			});

			for (const modDoc of modulesSnap.docs) {
				const recordsSnap = await db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicYearId)
					.collection("modulesData")
					.doc(modDoc.id)
					.collection("records")
					.get();

				recordsSnap.forEach(recDoc => {
					const data = recDoc.data();
					const entityId = data.entityId || recDoc.id;

					if (statsMap[entityId]) {
						kpiFieldsList.forEach(kpiField => {
							const fKey = kpiField.id;
							let val = data[fKey];
							if (val === undefined && data.changes && data.changes[fKey] !== undefined) {
								val = data.changes[fKey];
							}

							if (val !== undefined && val !== null && val !== "") {
								const countInc = Array.isArray(val) ? val.length : 1;
								statsMap[entityId].totalErrors += countInc;
								statsMap[entityId].kpiCounts[fKey] = (statsMap[entityId].kpiCounts[fKey] || 0) + countInc;
							}
						});
					}
				});
			}

			const processedList = Object.values(statsMap);

			// 7. Render ra bảng HTML Thẻ 5
			if (processedList.length === 0) {
				tableBody.innerHTML = `<tr><td colspan="${3 + kpiFieldsList.length + 1}" style="text-align: center; color: #6c757d; font-style: italic;">Chưa có dữ liệu thi đua nào trong tổ chuyên môn.</td></tr>`;
				return;
			}

			let html = "";
			processedList.forEach(item => {
				html += `
					<tr style="border-bottom: 1px solid #dee2e6;">
						<td style="font-family: monospace; font-weight: bold;">${item.id}</td>
						<td>${item.name}</td>
						<td><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${item.department}</span></td>
				`;

				kpiFieldsList.forEach(field => {
					const countVal = item.kpiCounts[field.id] || 0;
					html += `<td style="text-align: center;">${countVal > 0 ? `<span style="color: #dc3545; font-weight: bold;">${countVal}</span>` : '<span style="color: #ccc;">0</span>'}</td>`;
				});

				html += `
						<td style="text-align: center; font-weight: bold; color: ${item.totalErrors > 0 ? '#dc3545' : '#198754'};">${item.totalErrors} lỗi</td>
					</tr>
				`;
			});

			tableBody.innerHTML = html;

		} catch (error) {
			console.error("Lỗi tải dữ liệu tổ chuyên môn:", error);
			tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Lỗi tải dữ liệu tổ chuyên môn.</td></tr>';
		}
	}
	
	//	GỌI HỖ TRỢ
	
	// ==========================================
	// 1. MỞ MODAL & PHÂN TÁCH QUYỀN (CHỦ THỂ GỐC HAY NGƯỜI HỖ TRỢ)
	// ==========================================
	async function openHelpModal() {
		const orgId = window.currentOrgIdGlobal;
		const moduleId = window.currentModuleIdGlobal;
		const authUser = firebase.auth().currentUser;

		if (!orgId || !moduleId) {
			alert("Chưa xác định được thông tin đơn vị hoặc bài toán module hiện tại!");
			return;
		}

		if (!authUser || !authUser.email) {
			alert("Vui lòng đăng nhập lại hệ thống.");
			return;
		}

		const teacherEmail = authUser.email.toLowerCase().trim();

		// Lấy ID năm học hiện tại từ biến chuẩn window.currentAcademicYearsGlobal
		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			alert("Chưa xác định được năm học hiện tại.");
			return;
		}

		// Hiển thị modal
		document.getElementById("help-modal").style.display = "flex";
		
		const primaryView = document.getElementById("primary-owner-view");
		const assistantView = document.getElementById("assistant-only-view");
		
		if (primaryView) primaryView.style.display = "none";
		if (assistantView) assistantView.style.display = "none";

		try {
			const db = firebase.firestore();
			
			// 🌟 Lấy uId / memberId để phục vụ việc gửi nhờ (nếu cần cho các hàm con)
			const memberId = window.currentUserIdGlobal || authUser.uid; 

			// 🌟 KIỂM TRA BẰNG EMAIL (Đúng chuẩn Document ID của assignments mà chúng ta đã thống nhất)
			const assignDoc = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("assignments")
				.doc(teacherEmail) // 👈 Dùng email làm doc ID thay vì memberId
				.get();

			let isPrimary = false;
			if (assignDoc.exists) {
				const data = assignDoc.data();
				const modulesArr = Array.isArray(data.modules) ? data.modules : [];
				if (modulesArr.includes(moduleId)) {
					isPrimary = true;
				}
			}

			if (isPrimary) {
				// Trường hợp 1: Là Chủ thể gốc -> Hiện tab Gửi nhờ & Danh sách đang hỗ trợ
				if (primaryView) primaryView.style.display = "block";
				if (typeof switchHelpSubTab === 'function') switchHelpSubTab(1);
				
				if (typeof loadPotentialAssistantsForHelp === 'function') {
					await loadPotentialAssistantsForHelp(orgId, academicYearId, moduleId, memberId);
            }
            if (typeof loadActiveAssistantsList === 'function') {
                await loadActiveAssistantsList(orgId, academicYearId, moduleId, memberId);
            }
        } else {
            // Trường hợp 2: Là Người hỗ trợ (hoặc không được phân công gốc) -> Hiện khung tự rút lui
            if (assistantView) assistantView.style.display = "block";
        }

    } catch (error) {
        console.error("Lỗi kiểm tra quyền trợ giúp:", error);
        alert("Lỗi khi mở giao diện trợ giúp: " + error.message);
    }
}	

function closeHelpModal() {
    document.getElementById("help-modal").style.display = "none";
}

function switchHelpSubTab(tabIndex) {
    const tab1 = document.getElementById("help-sub-tab-1");
    const tab2 = document.getElementById("help-sub-tab-2");
    const btn1 = document.getElementById("btn-help-tab-1");
    const btn2 = document.getElementById("btn-help-tab-2");

    if (tabIndex === 1) {
        tab1.style.display = "block";
        tab2.style.display = "none";
        btn1.style.borderBottom = "3px solid #0d6efd";
        btn1.style.color = "#0d6efd";
        btn2.style.borderBottom = "none";
        btn2.style.color = "#6c757d";
    } else {
        tab1.style.display = "none";
        tab2.style.display = "block";
        btn2.style.borderBottom = "3px solid #0d6efd";
        btn2.style.color = "#0d6efd";
        btn1.style.borderBottom = "none";
        btn1.style.color = "#6c757d";
    }
}


// ==========================================
// 2. TẢI DANH SÁCH ĐỒNG NGHIỆP ĐỂ GỬI NHỜ
// ==========================================
async function loadPotentialAssistantsForHelp(orgId, academicYearId, moduleId, currentMemberId) {
    const container = document.getElementById("help-user-list-container");
    container.innerHTML = '<i style="color: #6c757d; font-size: 0.9em;">Đang tải danh sách đồng nghiệp...</i>';

    try {
        const db = firebase.firestore();
        const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
        
        let html = "";
        usersSnap.forEach(uDoc => {
            const uData = uDoc.data();
            const uId = uData.uid || uDoc.id;
            
            // Không hiển thị chính mình trong danh sách nhờ giúp
            if (uId === currentMemberId) return;

            const fullName = uData.fullName || uId;
            const email = uData.email || "";
            const category = uData.category || "";

            html += `
                <div style="display: flex; align-items: center; padding: 6px 8px; border-bottom: 1px solid #f1f3f5; gap: 10px;">
                    <input type="checkbox" name="chk_help_assistant" value="${uId}" data-name="${fullName}" style="cursor: pointer; width: 16px; height: 16px;">
                    <div style="flex: 1; font-size: 0.9em;">
                        <strong>${fullName}</strong> <span style="color: #6c757d;">(${uId})</span>
                        <div style="font-size: 0.8em; color: #adb5bd;">Tổ/Lớp: ${category} | ${email}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<i style="color: #6c757d;">Không tìm thấy đồng nghiệp nào khác.</i>';
    } catch (err) {
        console.error("Lỗi tải danh sách đồng nghiệp:", err);
        container.innerHTML = '<i style="color: red;">Lỗi tải danh sách.</i>';
    }
}

function filterHelpUserList() {
    const keyword = document.getElementById("help-user-search-input").value.toLowerCase().trim();
    const container = document.getElementById("help-user-list-container");
    const items = container.querySelectorAll("div[style*='display: flex']");

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(keyword)) {
            item.style.display = "flex";
        } else {
            item.style.display = "none";
        }
    });
}


// ==========================================
// 3. GỬI YÊU CẦU HỖ TRỢ (CẤP QUYỀN + THỜI HẠN 30 PHÚT)
// ==========================================
	async function confirmSendHelpRequest() {
		const selectedCheckboxes = document.querySelectorAll('input[name="chk_help_assistant"]:checked');
		if (selectedCheckboxes.length === 0) {
			alert("Vui lòng chọn ít nhất một đồng nghiệp để nhờ hỗ trợ!");
			return;
		}

		const orgId = window.currentOrgIdGlobal;
		const moduleId = window.currentModuleIdGlobal;
		const authUser = firebase.auth().currentUser;

		if (!authUser || !authUser.email) {
			alert("Vui lòng đăng nhập lại hệ thống.");
			return;
		}

		const ownerEmail = authUser.email.toLowerCase().trim();

		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			alert("Chưa xác định được năm học hiện tại.");
			return;
		}

		try {
			const db = firebase.firestore();
			const batch = db.batch(); // Dùng Batch để gom lệnh ghi tối ưu và an toàn

			const assignmentsRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("assignments");

			supportersRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("supporters");

			const now = Date.now();
			const expiresAt = now + 30 * 60 * 1000; // Thời hạn 30 phút

			for (const chk of selectedCheckboxes) {
				const assistantEmail = chk.value.toLowerCase().trim(); // Email người được nhờ
				const assistantName = chk.getAttribute("data-name");

				// 1. Cập nhật phân quyền module cho người hỗ trợ trong bảng assignments
				const assistantDocRef = assignmentsRef.doc(assistantEmail);
				const docSnap = await assistantDocRef.get();

				let currentModules = [];
				if (docSnap.exists) {
					const data = docSnap.data();
					currentModules = Array.isArray(data.modules) ? data.modules : [];
				}

				if (!currentModules.includes(moduleId)) {
					currentModules.push(moduleId);
				}

				batch.set(assistantDocRef, {
					email: assistantEmail,
					modules: currentModules,
					isAssistant: true,
					updatedAt: typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString()
				}, { merge: true });

				// 2. Tạo biên bản ủy quyền trong collection supporters riêng biệt
				// ID ghép nối: [timestamp]_[ownerEmail]_[assistantEmail] -> Đảm bảo duy nhất 100%, không bao giờ ghi đè
				const supportDocId = `${now}_${ownerEmail}_${assistantEmail}`;
				const supportDocRef = supportersRef.doc(supportDocId);

				batch.set(supportDocRef, {
					id: supportDocId,
					ownerEmail: ownerEmail,
					assistantEmail: assistantEmail,
					assistantName: assistantName,
					moduleId: moduleId,
					createdAt: now,
					expiresAt: expiresAt,
					updatedAt: typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString()
				});
			}

			// Thực thi toàn bộ lệnh ghi hàng loạt lên Firestore
			await batch.commit();

			alert(`Đã gửi yêu cầu hỗ trợ thành công cho ${selectedCheckboxes.length} đồng nghiệp! Quyền hạn có hiệu lực trong 30 phút.`);
			if (typeof closeHelpModal === 'function') closeHelpModal();

		} catch (error) {
			console.error("Lỗi gửi yêu cầu hỗ trợ:", error);
			alert("Lỗi: " + error.message);
		}
	}


// ==========================================
// 4. QUẢN LÝ & THU HỒI QUYỀN HỖ TRỢ
// ==========================================

	async function loadActiveAssistantsList(orgId, academicYearId, moduleId, memberId) {
		const container = document.getElementById("active-assistants-container");
		container.innerHTML = '<i style="color: #6c757d; font-size: 0.9em;">Đang tải danh sách...</i>';

		try {
			const db = firebase.firestore();
			const authUser = firebase.auth().currentUser;
			const ownerEmail = authUser && authUser.email ? authUser.email.toLowerCase().trim() : memberId;

			// Truy vấn từ collection supporters độc lập
			const supportersSnap = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("supporters")
				.where("ownerEmail", "==", ownerEmail)
				.where("moduleId", "==", moduleId)
				.get();

			if (supportersSnap.empty) {
				container.innerHTML = '<i style="color: #6c757d;">Chưa có đồng nghiệp nào đang hỗ trợ bài toán này.</i>';
				return;
			}

			let html = "";
			const now = Date.now();

			supportersSnap.forEach(doc => {
				const ast = doc.data();
				const expiresAt = Number(ast.expiresAt || 0);
				const timeLeftMins = Math.max(0, Math.ceil((expiresAt - now) / (60 * 1000)));
				const isExpired = now > expiresAt;

				// Hỗ trợ nhận diện supporter qua assistantId (memberId) hoặc assistantEmail
				const identifier = ast.assistantId || ast.assistantEmail;

				html += `
					<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #f1f3f5;">
						<div>
							<strong>${ast.assistantName}</strong> <span style="color: #6c757d; font-size: 0.85em;">(${identifier})</span>
							<div style="font-size: 0.8em; color: ${isExpired ? 'red' : '#198754'};">
								${isExpired ? '🔴 Đã hết hạn 30 phút' : `🟢 Còn lại: khoảng ${timeLeftMins} phút`}
							</div>
						</div>
						<button type="button" onclick="revokeAssistantAccess('${identifier}', '${moduleId}')" style="padding: 4px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em; font-weight: bold;">
							Thu hồi
						</button>
					</div>
				`;
			});

			container.innerHTML = html;
		} catch (err) {
			console.error("Lỗi tải danh sách đang hỗ trợ:", err);
			container.innerHTML = '<i style="color: red;">Lỗi tải dữ liệu.</i>';
		}
	}


// 1. TỰ DỪNG HỖ TRỢ (Phía người trợ giúp)
	async function selfQuitSupport() {
		if (!confirm("Bạn có chắc chắn muốn dừng hỗ trợ và trả lại nhiệm vụ này không?")) {
			return;
		}

		const orgId = window.currentOrgIdGlobal;
		const moduleId = window.currentModuleIdGlobal;
		const authUser = firebase.auth().currentUser;

		if (!authUser || !authUser.email) {
			alert("Không xác định được tài khoản người dùng hiện tại.");
			return;
		}

		const teacherEmail = authUser.email.toLowerCase().trim();

		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			alert("Chưa xác định được năm học hiện tại.");
			return;
		}

		try {
			const db = firebase.firestore();
			const batch = db.batch();

			const academicYearRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId);

			// 1. Gỡ module khỏi bảng assignments của người trợ giúp
			const assistantDocRef = academicYearRef.collection("assignments").doc(teacherEmail);
			const docSnap = await assistantDocRef.get();
			if (docSnap.exists) {
				const data = docSnap.data();
				let mods = Array.isArray(data.modules) ? data.modules : [];
				mods = mods.filter(m => m !== moduleId);

				// 🌟 NẾU KHÔNG CÒN MODULE NÀO -> XÓA HẲN DOCUMENT ASSIGNMENT ĐỂ LÀM SẠCH CSDL
				if (mods.length === 0) {
					batch.delete(assistantDocRef);
				} else {
					batch.set(assistantDocRef, {
						modules: mods,
						isAssistant: false,
						updatedAt: typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString()
					}, { merge: true });
				}
			}

			// 2. Tìm và xóa các biên bản trong collection supporters tương ứng
			const supportersSnap = await academicYearRef.collection("supporters")
				.where("assistantEmail", "==", teacherEmail)
				.where("moduleId", "==", moduleId)
				.get();

			supportersSnap.forEach(doc => {
				batch.delete(doc.ref);
			});

			await batch.commit();

			alert("Đã dừng hỗ trợ thành công. Giao diện sẽ được làm mới.");
			if (typeof closeHelpModal === 'function') closeHelpModal();
			location.reload();

		} catch (error) {
			console.error("Lỗi tự dừng hỗ trợ:", error);
			alert("Lỗi: " + error.message);
		}
	}
	
	// 2. THU HỒI ỦY QUYỀN (Phía chủ thể gốc)
	async function revokeAssistantAccess(assistantEmail, moduleId) {
		if (!confirm("Bạn có chắc chắn muốn thu hồi quyền hỗ trợ module này của đồng nghiệp không?")) {
			return;
		}

		const orgId = window.currentOrgIdGlobal;
		const authUser = firebase.auth().currentUser;
		if (!authUser || !authUser.email) return;

		const ownerEmail = authUser.email.toLowerCase().trim();

		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			alert("Chưa xác định được năm học hiện tại.");
			return;
		}

		try {
			const db = firebase.firestore();
			const batch = db.batch();

			const academicYearRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId);

			// 1. Gỡ module khỏi bảng assignments của người trợ giúp
			const assistantDocRef = academicYearRef.collection("assignments").doc(assistantEmail);
			const docSnap = await assistantDocRef.get();
			if (docSnap.exists) {
				const data = docSnap.data();
				let mods = Array.isArray(data.modules) ? data.modules : [];
				mods = mods.filter(m => m !== moduleId);

				// 🌟 NẾU KHÔNG CÒN MODULE NÀO -> XÓA HẲN DOCUMENT ASSIGNMENT ĐỂ LÀM SẠCH CSDL
				if (mods.length === 0) {
					batch.delete(assistantDocRef);
				} else {
					batch.set(assistantDocRef, {
						modules: mods,
						isAssistant: false,
						updatedAt: typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString()
					}, { merge: true });
				}
			}

			// 2. Xóa biên bản trong collection supporters
			const supportersSnap = await academicYearRef.collection("supporters")
				.where("ownerEmail", "==", ownerEmail)
				.where("assistantEmail", "==", assistantEmail)
				.where("moduleId", "==", moduleId)
				.get();

			supportersSnap.forEach(doc => {
				batch.delete(doc.ref);
			});

			await batch.commit();

			alert("Đã thu hồi quyền hỗ trợ thành công!");
			
			// Làm mới lại giao diện danh sách đang hỗ trợ
			if (typeof loadActiveAssistantsList === 'function') {
				loadActiveAssistantsList(orgId, academicYearId, moduleId, ownerEmail);
			}

		} catch (error) {
			console.error("Lỗi thu hồi quyền hỗ trợ:", error);
			alert("Lỗi khi thu hồi: " + error.message);
		}
	}

	// 3. QUÉT DỌN TỰ ĐỘNG HẾT HẠN (30 phút)
	async function checkAndExpireSupporters() {
		const orgId = window.currentOrgIdGlobal;
		if (!orgId) return;

		let academicYearId = currentAcademicYear || "";
		const yearsArr = window.currentAcademicYearsGlobal;
		if (!academicYearId && Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(typeof lastYearItem === 'object' && lastYearItem !== null ? (lastYearItem.id || lastYearItem.name || lastYearItem.year) : lastYearItem).trim();
		}

		if (!academicYearId) return;

		try {
			const db = firebase.firestore();
			const academicYearRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId);

			const now = Date.now();
			const expiredSnap = await academicYearRef.collection("supporters")
				.where("expiresAt", "<", now)
				.get();

			if (expiredSnap.empty) return;

			const batch = db.batch();

			for (const doc of expiredSnap.docs) {
				const data = doc.data();
				const assistantEmail = data.assistantEmail;
				const moduleId = data.moduleId;

				if (assistantEmail && moduleId) {
					const assistantDocRef = academicYearRef.collection("assignments").doc(assistantEmail);
					const assistantDoc = await assistantDocRef.get();
					if (assistantDoc.exists) {
						const asstData = assistantDoc.data();
						let mods = Array.isArray(asstData.modules) ? asstData.modules : [];
						mods = mods.filter(m => m !== moduleId);

						// 🌟 NẾU KHÔNG CÒN MODULE NÀO -> XÓA HẲN DOCUMENT ASSIGNMENT
						if (mods.length === 0) {
							batch.delete(assistantDocRef);
						} else {
							batch.set(assistantDocRef, {
								modules: mods,
								isAssistant: false,
								updatedAt: typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString()
							}, { merge: true });
						}
					}
				}

				batch.delete(doc.ref);
			}

			await batch.commit();
			console.log(`Đã tự động thu hồi và dọn dẹp ${expiredSnap.size} biên bản trợ giúp quá hạn.`);

		} catch (error) {
			console.error("Lỗi khi quét dọn biên bản hết hạn:", error);
		}
	}	
	
	// 	EMPLOYEE PANEL - THẺ 2
	async function loadMyAuditLogsTimeline() {
		const container = document.getElementById('my-audit-logs-timeline');
		const dateInput = document.getElementById('emp-my-audit-date-select');
		if (!container) return;

		const orgId = window.currentOrgIdGlobal;
		
		// Lấy năm học đang chọn từ select trên giao diện
		const academicSelect = document.getElementById("emp-academic-year-select");
		let academicId = academicSelect ? academicSelect.value : "";
		if (!academicId && Array.isArray(window.currentAcademicYearsGlobal) && window.currentAcademicYearsGlobal.length > 0) {
			academicId = window.currentAcademicYearsGlobal[window.currentAcademicYearsGlobal.length - 1];
		}

		// Lấy moduleId chuẩn từ biến toàn cục hoặc select
		const moduleSelectEl = document.getElementById("emp-module-select");
		const moduleId = window.currentModuleIdGlobal || (moduleSelectEl ? moduleSelectEl.value : "");

		// Lấy email người đang đăng nhập
		const myEmail = (window.currentUserEmailGlobal || firebase.auth().currentUser?.email || "").toLowerCase().trim();

		if (!orgId || !academicId || !moduleId) {
			container.innerHTML = '<p style="color:red; text-align: center; padding: 15px;">Vui lòng chọn đầy đủ Tổ chức, Năm học và Nhiệm vụ trước khi xem nhật ký cá nhân.</p>';
			return;
		}

		if (!myEmail) {
			container.innerHTML = '<p style="color:red; text-align: center; padding: 15px;">Không xác định được thông tin tài khoản đăng nhập của bạn.</p>';
			return;
		}

		// Mặc định lấy ngày hôm nay nếu chưa chọn ngày trên ô input
		if (dateInput && !dateInput.value) {
			dateInput.value = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
		}

		const selectedDateStr = dateInput ? dateInput.value : new Date().toLocaleDateString('en-CA');

		try {
			container.innerHTML = `<p style="color:#0d6efd; text-align: center; padding: 15px;">⏳ Đang tải lịch sử thao tác cá nhân ngày <b>${selectedDateStr}</b>...</p>`;

			const db = firebase.firestore();
			
			// Truy vấn vào collection auditLogs của module hiện tại
			const snapshot = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("auditLogs")
				.get();

			const myLogs = [];

			snapshot.forEach(doc => {
				const log = doc.data();
				
				// Kiểm tra khớp email cá nhân
				const logEmail = (log.updaterEmail || "").toLowerCase().trim();
				if (logEmail !== myEmail) return; // Bỏ qua nếu không phải log của mình

				// Xử lý chuyển đổi Firestore Timestamp sang dạng YYYY-MM-DD
				let logDateStr = '';
				if (log.timestamp) {
					const logDate = typeof log.timestamp.toDate === 'function' ? log.timestamp.toDate() : new Date(log.timestamp);
					const y = logDate.getFullYear();
					const m = String(logDate.getMonth() + 1).padStart(2, '0');
					const d = String(logDate.getDate()).padStart(2, '0');
					logDateStr = `${y}-${m}-${d}`;
				}

				// Lọc đúng log của ngày được chọn
				if (logDateStr === selectedDateStr) {
					myLogs.push(log);
				}
			});

			container.innerHTML = '';

			if (myLogs.length === 0) {
				container.innerHTML = `<p style="color:#6c757d; font-style:italic; text-align: center; padding: 15px;">Bạn chưa thực hiện thao tác nhập liệu nào trong ngày <b>${selectedDateStr}</b>.</p>`;
				return;
			}

			// Sắp xếp log theo thời gian mới nhất lên đầu
			myLogs.sort((a, b) => {
				const timeA = a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
				const timeB = b.timestamp && typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
				return timeB - timeA;
			});

			const cardDiv = document.createElement('div');
			cardDiv.style.cssText = "background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

			let logsHtml = `
				<div style="border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
					<b style="color: #084298; font-size: 1.05em;"><i class="fa-solid fa-user-pen"></i> Lịch sử thao tác của bạn</b>
					<span style="background: #e7f1ff; color: #0d6efd; padding: 2px 8px; border-radius: 10px; font-weight: bold; font-size: 0.85em;">${myLogs.length} lượt thao tác</span>
				</div>
				<ul style="margin: 0; padding-left: 18px; font-size: 0.9em; color: #333;">
			`;

			myLogs.forEach(log => {
				const logDateObj = log.timestamp && typeof log.timestamp.toDate === 'function' ? log.timestamp.toDate() : new Date(log.timestamp || Date.now());
				const timeStr = logDateObj.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
				
				const actionTitle = log.action || "Cập nhật dữ liệu";
				const entityId = log.entityId || "Không rõ";

				// Lấy thông tin tên học sinh/nhân sự tương ứng từ danh sách hiện có
				const entityInfo = (typeof currentEmployeeEntities !== 'undefined' ? currentEmployeeEntities : []).find(e => e.id === entityId || e.entityId === entityId) || {};
				const entityName = entityInfo.name || entityInfo.fullName || entityId;

				// Hiển thị chi tiết thay đổi
				let changeDetailsStr = "";
				if (log.changes && typeof log.changes === 'object') {
					const changedFields = Object.keys(log.changes);
					changeDetailsStr = changedFields.map(f => `<b>${f}</b>: "${log.changes[f]}"`).join("; ");
				}

				logsHtml += `
					<li style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #f1f1f1;">
						<span style="color: #198754; font-weight: bold;">[${actionTitle}]</span> 
						Lúc <b>${timeStr}</b> cho học sinh/nhân sự: <b style="color: #0d6efd;">${entityName} (Mã: ${entityId})</b>
						${changeDetailsStr ? `<br><span style="color: #666; font-size: 0.95em; padding-left: 15px;">👉 Nội dung: ${changeDetailsStr}</span>` : ''}
					</li>
				`;
			});

			logsHtml += '</ul>';
			cardDiv.innerHTML = logsHtml;
			container.appendChild(cardDiv);

		} catch (error) {
			console.error("Lỗi nạp nhật ký cá nhân:", error);
			container.innerHTML = `<p style="color:red; text-align: center; padding: 15px;">Lỗi tải nhật ký cá nhân: ${error.message}</p>`;
		}
	}
	//	EMPLOYEE PANEL - THẺ 3
	async function loadAuditLogsTimeline() {
		const container = document.getElementById('audit-logs-timeline');
		const dateInput = document.getElementById('emp-audit-date-select');
		if (!container) return;

		const orgId = window.currentOrgIdGlobal;
		
		// Lấy năm học đang chọn từ select trên giao diện
		const academicSelect = document.getElementById("emp-academic-year-select");
		let academicId = academicSelect ? academicSelect.value : "";
		if (!academicId && Array.isArray(window.currentAcademicYearsGlobal) && window.currentAcademicYearsGlobal.length > 0) {
			academicId = window.currentAcademicYearsGlobal[window.currentAcademicYearsGlobal.length - 1];
		}

		// Lấy moduleId chuẩn từ biến toàn cục hoặc select
		const moduleSelectEl = document.getElementById("emp-module-select");
		const moduleId = window.currentModuleIdGlobal || (moduleSelectEl ? moduleSelectEl.value : "");

		if (!orgId || !academicId || !moduleId) {
			container.innerHTML = '<p style="color:red; text-align: center; padding: 15px;">Vui lòng chọn đầy đủ Tổ chức, Năm học và Nhiệm vụ trước khi xem nhật ký.</p>';
			return;
		}

		// Mặc định lấy ngày hôm nay nếu người dùng chưa chọn ngày trên ô input
		if (dateInput && !dateInput.value) {
			dateInput.value = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD theo giờ local
		}

		const selectedDateStr = dateInput ? dateInput.value : new Date().toLocaleDateString('en-CA');

		try {
			container.innerHTML = `<p style="color:#0d6efd; text-align: center; padding: 15px;">⏳ Đang tải nhật ký biến động ngày <b>${selectedDateStr}</b>...</p>`;

			const db = firebase.firestore();
			
			// Truy vấn chính xác vào collection auditLogs của module hiện tại
			const snapshot = await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("auditLogs")
				.get();

			// GOM NHÓM LOG THEO ENTITY_ID (Mã học sinh/nhân sự)
			const groupedLogs = {};

			snapshot.forEach(doc => {
				const log = doc.data();
				
				let logDateStr = '';
				if (log.timestamp) {
					// Xử lý chuyển đổi Firestore Timestamp sang dạng YYYY-MM-DD
					const logDate = typeof log.timestamp.toDate === 'function' ? log.timestamp.toDate() : new Date(log.timestamp);
					const y = logDate.getFullYear();
					const m = String(logDate.getMonth() + 1).padStart(2, '0');
					const d = String(logDate.getDate()).padStart(2, '0');
					logDateStr = `${y}-${m}-${d}`;
				}

				// Lọc đúng log của ngày được chọn trên giao diện
				if (logDateStr === selectedDateStr) {
					if (!groupedLogs[log.entityId]) {
						groupedLogs[log.entityId] = [];
					}
					groupedLogs[log.entityId].push(log);
				}
			});

			container.innerHTML = '';
			const entityKeys = Object.keys(groupedLogs);

			if (entityKeys.length === 0) {
				container.innerHTML = `<p style="color:#6c757d; font-style:italic; text-align: center; padding: 15px;">Không có biến động nào trong ngày <b>${selectedDateStr}</b>.</p>`;
				return;
			}

			// RENDER THẺ CỦA TỪNG ĐỐI TƯỢNG ĐÃ CÓ BIẾN ĐỘNG TRONG NGÀY
			entityKeys.forEach(entityId => {
				const logsList = groupedLogs[entityId];
				
				// Tìm thông tin tên học sinh/nhân sự từ mảng currentEmployeeEntities (nếu đã load sẵn)
				const entityInfo = (typeof currentEmployeeEntities !== 'undefined' ? currentEmployeeEntities : []).find(e => e.id === entityId || e.entityId === entityId) || {};
				const entityName = entityInfo.name || entityInfo.fullName || entityId;

				const cardDiv = document.createElement('div');
				cardDiv.style.cssText = "background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

				let logsHtml = `
					<div style="border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
						<b style="color: #084298; font-size: 1.05em;"><i class="fa-solid fa-user-graduate"></i> [Mã: ${entityId}] ${entityName}</b>
						<span style="background: #e7f1ff; color: #0d6efd; padding: 2px 8px; border-radius: 10px; font-weight: bold; font-size: 0.85em;">${logsList.length} lượt biến động</span>
					</div>
					<ul style="margin: 0; padding-left: 18px; font-size: 0.9em; color: #333;">
				`;

				logsList.forEach(log => {
					const logDateObj = log.timestamp && typeof log.timestamp.toDate === 'function' ? log.timestamp.toDate() : new Date(log.timestamp || Date.now());
					const timeStr = logDateObj.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
					
					const actionTitle = log.action || "Cập nhật dữ liệu";
					const updater = log.updaterName || log.updaterEmail || "Hệ thống";

					// Hiển thị chi tiết thay đổi (changes map)
					let changeDetailsStr = "";
					if (log.changes && typeof log.changes === 'object') {
						const changedFields = Object.keys(log.changes);
						changeDetailsStr = changedFields.map(f => `<b>${f}</b>: "${log.changes[f]}"`).join("; ");
					}

					logsHtml += `
						<li style="margin-bottom: 6px;">
							<span style="color: #198754; font-weight: bold;">[${actionTitle}]</span> 
							Lúc <b>${timeStr}</b> bởi <b>${updater}</b>
							${changeDetailsStr ? `<br><span style="color: #666; font-size: 0.95em; padding-left: 15px;">👉 Thay đổi: ${changeDetailsStr}</span>` : ''}
						</li>
					`;
				});

				logsHtml += '</ul>';
				cardDiv.innerHTML = logsHtml;
				container.appendChild(cardDiv);
			});

		} catch (error) {
			console.error("Lỗi nạp nhật ký biến động:", error);
			container.innerHTML = `<p style="color:red; text-align: center; padding: 15px;">Lỗi tải nhật ký: ${error.message}</p>`;
		}
	}