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

console.log("Bắt đầu phân quyền cho user:");
		
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
		console.error("❌ Lỗi đăng nhập chi tiết từ Firebase Auth:", error.code, error.message);
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
		console.log("🔍 [DEBUG LOGIN] Bắt đầu phân quyền cho user:", {
			uid: user.uid,
			email: user.email
		});

		const db = firebase.firestore();
		const email = user.email ? user.email.toLowerCase().trim() : "";

		// Gán thông tin cơ bản định danh người dùng ngay từ đầu
		window.currentUserEmailGlobal = email;
		window.currentUserUid = user.uid;

		try {
			// Bước 1: Kiểm tra System Owner
			console.log("🔍 [DEBUG LOGIN] Đang kiểm tra collection gốc /users/{uid}...");
			const ownerDoc = await db.collection("users").doc(user.uid).get();
			console.log("🔍 [DEBUG LOGIN] Kết quả /users/{uid} exists:", ownerDoc.exists);
			
			if (ownerDoc.exists && ownerDoc.data().role === "OWNER") {
				console.log("👑 [DEBUG LOGIN] Phát hiện System Owner!");
				window.currentOrgIdGlobal = null;
				window.currentUserRoleGlobal = "OWNER";
				window.currentAcademicYearsGlobal = [];
				window.currentUserNameGlobal = ownerDoc.data().fullName || user.email;

				setupOwnerUI(ownerDoc.data(), user);
				return;
			}

			// Bước 2: Đọc phân quyền từ collection gốc "emails"
			console.log("🔍 [DEBUG LOGIN] Đang đọc collection gốc /emails với docId:", email);
			const emailDoc = await db.collection("emails").doc(email).get();
			console.log("🔍 [DEBUG LOGIN] Kết quả /emails/{email} exists:", emailDoc.exists);

			if (emailDoc.exists) {
				const userData = emailDoc.data();
				console.log("✅ [DEBUG LOGIN] Dữ liệu đọc được từ bảng emails:", userData);
				
				const orgId = userData.orgId;
				const role = userData.role || "EMPLOYEE"; // "ADMIN" hoặc "EMPLOYEE" / "TEACHER"
				const academicYears = userData.academicYears || [];
				const fullName = userData.fullName || user.email;

				// Gán trọn bộ biến toàn cục cốt lõi
				window.currentOrgIdGlobal = orgId;
				window.currentUserRoleGlobal = role;
				window.currentAcademicYearsGlobal = academicYears;
				window.currentUserNameGlobal = fullName;

				if (typeof currentOrgIdGlobal !== 'undefined') currentOrgIdGlobal = orgId;
				if (typeof currentUserRoleGlobal !== 'undefined') currentUserRoleGlobal = role;
				if (typeof currentAcademicYearsGlobal !== 'undefined') currentAcademicYearsGlobal = academicYears;

				// Tải sẵn bản đồ `cachedUsersMap` cho toàn tổ chức
				try {
					console.log("🔍 [DEBUG LOGIN] Đang tải danh sách users của tổ chức (orgId):", orgId);
					const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
					console.log("✅ [DEBUG LOGIN] Tải thành công users, tổng số lượng:", usersSnap.size);
					
					window.cachedUsersMap = {};
					usersSnap.forEach(uDoc => {
						const uData = uDoc.data();
						window.cachedUsersMap[uDoc.id] = {
							fullName: uData.fullName || uDoc.id,
							category: uData.category || uData.className || ""
						};
					});
				} catch (err) {
					console.warn("⚠️ [DEBUG LOGIN] Lỗi khi cache bảng users:", err);
				}

				// Nếu là Giáo viên/Nhân sự (Employee), tải trước thông tin phân công lớp chủ nhiệm
				if (role !== "ADMIN" && academicYears.length > 0) {
					const activeYearItem = academicYears[academicYears.length - 1];
					const activeYearId = String(typeof activeYearItem === 'object' && activeYearItem !== null ? (activeYearItem.id || activeYearItem.name || activeYearItem.year) : activeYearItem).trim();

					if (activeYearId) {
						try {
							console.log("🔍 [DEBUG LOGIN] Đang tải phân công cho giáo viên với email/uid năm học:", activeYearId);
							// Thử truy vấn assignments bằng email (vì hệ thống thường dùng email làm docId cho assignments)
							const assignDoc = await db.collection("organizations")
								.doc(orgId)
								.collection("academicYears")
								.doc(activeYearId)
								.collection("assignments")
								.doc(email) // Sử dụng email chuẩn hóa
								.get();

							console.log("🔍 [DEBUG LOGIN] Kết quả document assignments exists:", assignDoc.exists);
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
							console.warn("⚠️ [DEBUG LOGIN] Lỗi tải thông tin phân công:", assignErr);
						}
					}
				}

				// Gọi hàm dựng giao diện Member
				console.log("🚀 [DEBUG LOGIN] Đang gọi setupMemberUI...");
				setupMemberUI(userData, orgId, user);

			} else {
				console.warn("❌ [DEBUG LOGIN] Không tìm thấy email này trong collection 'emails':", email);
				document.getElementById("login-error").textContent = "Tài khoản chưa được cấu hình phân quyền trong hệ thống!";
				await firebase.auth().signOut();
			}

		} catch (error) {
			console.error("❌ [DEBUG LOGIN] Lỗi catch nghiêm trọng trong phân quyền người dùng:", error);
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

    // 1. LƯU THÔNG TIN PHIÊN ĐĂNG NHẬP
    window.currentOrgIdGlobal = orgId;
    window.currentUserRoleGlobal = userData.role || "EMPLOYEE";
    window.currentAcademicYearsGlobal = userData.academicYears || [];

    currentOrgIdGlobal = orgId;
    currentUserRoleGlobal = userData.role || "EMPLOYEE";
    currentAcademicYearsGlobal = userData.academicYears || [];

    // 2. THÔNG TIN NGƯỜI DÙNG
    document.getElementById("user-display-name").textContent =
        userData.fullName || authUser.email;

    let roleText = "Giáo viên / Nhân sự";

    if (userData.role === "ADMIN") {
        roleText = "Quản trị viên Trường";
    } else if (userData.role === "STUDENT") {
        roleText = "Học sinh";
    }

    document.getElementById("user-role").textContent = roleText;
    document.getElementById("user-org").textContent = orgId;

    // 3. HIỂN THỊ TAB 5 CHO GIÁO VIÊN / NHÂN SỰ
    // Không áp dụng cho ADMIN và STUDENT.
    const userRole = String(userData.role || "EMPLOYEE")
        .trim()
        .toUpperCase();

    const canViewDepartmentTab =
        userRole !== "ADMIN" &&
        userRole !== "STUDENT";

    const departmentTabButton =
        document.getElementById("btn-emp-tab-5");

    const departmentTabContent =
        document.getElementById("emp-tab-sec-5");

    if (departmentTabButton) {
        departmentTabButton.style.display =
            canViewDepartmentTab ? "" : "none";
    }

    if (!canViewDepartmentTab && departmentTabContent) {
        departmentTabContent.style.display = "none";
    }

    // 4. OWNER PANEL
    document.getElementById("owner-panel").style.display = "none";

    // 5. ADMIN
    if (userData.role === "ADMIN") {
        adminPanel.style.display = "block";
        employeePanel.style.display = "none";

        await initAcademicYears(orgId);
        await preloadAdminModules(orgId);

        if (typeof switchAdminTab === "function") {
            switchAdminTab("grid");
        }

        if (typeof initGridCard5 === "function") {
            await initGridCard5();
        }
    }

    // 6. GIÁO VIÊN / NHÂN SỰ / HỌC SINH
    else {
        adminPanel.style.display = "none";
        employeePanel.style.display = "block";

        if (typeof initEmployeeAcademicYears === "function") {
            await initEmployeeAcademicYears(orgId);
        }

        // Giữ kiểm tra khi đăng nhập để đồng bộ trạng thái ban đầu.
        // Kiểm tra bắt buộc trước khi ghi dữ liệu sẽ xử lý riêng
        // trong saveSingle / saveAll.
        if (typeof checkAndExpireSupporters === "function") {
            await checkAndExpireSupporters();
        }

        // Mặc định mở Tab 1.
        if (typeof switchEmpTab === "function") {
            await switchEmpTab(1);
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
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";
  const initialYear = initialYearInput ? initialYearInput.value.trim() : "";

  if (!orgId || !fullName || !email || !password || !initialYear) {
    alert("Vui lòng điền đầy đủ tất cả các trường thông tin và năm học!");
    return;
  }

  const msgElem = document.getElementById("admin-msg");
  if (msgElem) {
    msgElem.style.color = "green";
    msgElem.textContent = "Đang gửi yêu cầu tạo tài khoản bảo mật lên đám mây...";
  }

  try {
    // 1. Lấy Token xác thực của System Owner đang đăng nhập
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) throw new Error("Bạn chưa đăng nhập với tư cách System Owner!");
    const idToken = await currentUser.getIdToken();

    // 2. Thay thế URL dưới đây bằng Function URL thực tế mà Firebase trả về cho bạn sau khi deploy
    const functionUrl = "https://api-xxxxxxx-uc.a.run.app/create-school-admin"; 

    // 3. Gọi API bảo mật phía Cloud Functions
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}` // Truyền Token để Server kiểm tra quyền
      },
      body: JSON.stringify({ orgId, fullName, email, password, initialYear })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Lỗi không xác định từ Server");

    if (msgElem) {
      msgElem.style.color = "green";
      msgElem.textContent = result.message;
    }

    // Reset form sau khi tạo thành công
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
	
	// ============================================================
	// CẤU HÌNH KỲ THỜI GIAN BÁO CÁO - CẤP ORGANIZATION
	// HTML tương ứng:
	//   #reporting-period-month-start-day       : input type="date"
	//   #reporting-period-month-start-day-value : hidden value
	//   #reporting-period-config-selected-day
	//   #reporting-period-config-preview
	//   #reporting-period-config-msg
	//
	// Cấu hình được lưu tại:
	// organizations/{orgId}
	// field:
	// reportingPeriod.monthly.startDay
	//
	// Mặc định nếu chưa có cấu hình: ngày 1.
	// ============================================================

	window.currentReportingPeriodConfig =
		window.currentReportingPeriodConfig || null;


	// ------------------------------------------------------------
	// Lấy OrgId hiện tại
	// ------------------------------------------------------------
	async function getReportingPeriodOrgId() {
		let orgId = String(window.currentOrgIdGlobal || "").trim();

		if (orgId) {
			return orgId;
		}

		if (typeof ensureOrgId === "function") {
			try {
				orgId = String(await ensureOrgId() || "").trim();
			} catch (error) {
				console.warn("Không thể lấy OrgId bằng ensureOrgId():", error);
			}
		}

		if (!orgId && typeof getCurrentAdminOrgId === "function") {
			const user = firebase.auth().currentUser;

			if (user?.uid) {
				try {
					orgId = String(
						await getCurrentAdminOrgId(user.uid) || ""
					).trim();
				} catch (error) {
					console.warn("Không thể lấy OrgId từ getCurrentAdminOrgId():", error);
				}
			}
		}

		return orgId;
	}


	// ------------------------------------------------------------
	// Chuẩn hóa ngày bắt đầu kỳ tháng
	// ------------------------------------------------------------
	function normalizeReportingPeriodStartDay(value) {
		const day = Number(value);

		if (!Number.isFinite(day)) {
			return 1;
		}

		return Math.min(31, Math.max(1, Math.floor(day)));
	}


	// ------------------------------------------------------------
	// Cập nhật giao diện khi người dùng chọn ngày trên lịch
	//
	// Ví dụ chọn 21/10/2026:
	// chỉ lấy số 21 làm cấu hình.
	// Tháng/năm của ô lịch KHÔNG được lưu.
	// ------------------------------------------------------------
	function updateReportingPeriodDayFromCalendar() {
		const dateInput =
			document.getElementById("reporting-period-month-start-day");

		const hiddenInput =
			document.getElementById("reporting-period-month-start-day-value");

		const selectedDayElem =
			document.getElementById("reporting-period-config-selected-day");

		const previewElem =
			document.getElementById("reporting-period-config-preview");

		if (!dateInput) {
			return;
		}

		const rawValue = String(dateInput.value || "").trim();

		if (!rawValue) {
			const defaultDay = normalizeReportingPeriodStartDay(
				hiddenInput?.value || 1
			);

			if (hiddenInput) {
				hiddenInput.value = String(defaultDay);
			}

			if (selectedDayElem) {
				selectedDayElem.textContent =
					`Ngày bắt đầu kỳ tháng: ngày ${defaultDay}`;
			}

			return;
		}

		// input type="date" có dạng YYYY-MM-DD
		const parts = rawValue.split("-");

		let selectedDay = Number(parts[2]);

		if (!Number.isFinite(selectedDay)) {
			const date = new Date(rawValue + "T00:00:00");

			if (!Number.isNaN(date.getTime())) {
				selectedDay = date.getDate();
			}
		}

		selectedDay = normalizeReportingPeriodStartDay(selectedDay);

		if (hiddenInput) {
			hiddenInput.value = String(selectedDay);
		}

		if (selectedDayElem) {
			selectedDayElem.textContent =
				`Ngày bắt đầu kỳ tháng: ngày ${selectedDay}`;
		}

		if (previewElem) {
			if (selectedDay === 1) {
				previewElem.textContent =
					"Kỳ tháng được tính từ ngày 1 đến ngày cuối cùng của tháng.";
			} else {
				const previousDay = selectedDay - 1;

				previewElem.textContent =
					`Ví dụ: nếu chọn ngày ${selectedDay}, ` +
					`kỳ tháng sẽ được tính từ ngày ${selectedDay} ` +
					`tháng trước đến ngày ${previousDay} tháng hiện tại.`;
			}
		}
	}


	// ------------------------------------------------------------
	// Hiển thị cấu hình lên giao diện
	// ------------------------------------------------------------
	function renderReportingPeriodConfig(config) {
		const startDay = normalizeReportingPeriodStartDay(
			config?.monthly?.startDay ?? 1
		);

		window.currentReportingPeriodConfig = {
			monthly: {
				type: "DAY_OF_MONTH",
				startDay
			}
		};

		const hiddenInput =
			document.getElementById("reporting-period-month-start-day-value");

		const dateInput =
			document.getElementById("reporting-period-month-start-day");

		const selectedDayElem =
			document.getElementById("reporting-period-config-selected-day");

		const previewElem =
			document.getElementById("reporting-period-config-preview");

		if (hiddenInput) {
			hiddenInput.value = String(startDay);
		}

		// input type="date" cần một ngày/tháng/năm để hiển thị.
		// Chọn một ngày mẫu cố định, chỉ dùng phần ngày.
		if (dateInput) {
			const now = new Date();

			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, "0");

			// Tránh ngày không tồn tại như 31/02.
			const maxDayThisMonth =
				new Date(year, now.getMonth() + 1, 0).getDate();

			const displayDay =
				Math.min(startDay, maxDayThisMonth);

			dateInput.value =
				`${year}-${month}-${String(displayDay).padStart(2, "0")}`;
		}

		if (selectedDayElem) {
			selectedDayElem.textContent =
				`Ngày bắt đầu kỳ tháng: ngày ${startDay}`;
		}

		if (previewElem) {
			if (startDay === 1) {
				previewElem.textContent =
					"Kỳ tháng được tính từ ngày 1 đến ngày cuối cùng của tháng.";
			} else {
				previewElem.textContent =
					`Ví dụ: nếu chọn ngày ${startDay}, ` +
					`kỳ tháng sẽ được tính từ ngày ${startDay} ` +
					`tháng trước đến ngày ${startDay - 1} tháng hiện tại.`;
			}
		}
	}


	// ------------------------------------------------------------
	// Đọc cấu hình từ Firestore
	// ------------------------------------------------------------
	async function loadReportingPeriodConfig() {
		const msgElem =
			document.getElementById("reporting-period-config-msg");

		try {
			const orgId = await getReportingPeriodOrgId();

			if (!orgId) {
				renderReportingPeriodConfig({
					monthly: {
						type: "DAY_OF_MONTH",
						startDay: 1
					}
				});

				if (msgElem) {
					msgElem.style.color = "#b26a00";
					msgElem.textContent =
						"Chưa xác định được đơn vị. Đang sử dụng mặc định ngày 1.";
				}

				return null;
			}

			const db = firebase.firestore();

			const snap = await db
				.collection("organizations")
				.doc(orgId)
				.get();

			const data = snap.exists
				? (snap.data() || {})
				: {};

			const config =
				data.reportingPeriod ||
				{};

			renderReportingPeriodConfig(config);

			if (msgElem) {
				msgElem.style.color = "#198754";
				msgElem.textContent =
					snap.exists && config.monthly?.startDay
						? `Đã tải cấu hình ngày ${normalizeReportingPeriodStartDay(config.monthly.startDay)}.`
						: "Chưa có cấu hình. Đang sử dụng mặc định ngày 1.";
			}

			return window.currentReportingPeriodConfig;

		} catch (error) {
			console.error(
				"Lỗi tải cấu hình kỳ thời gian báo cáo:",
				error
			);

			renderReportingPeriodConfig({
				monthly: {
					type: "DAY_OF_MONTH",
					startDay: 1
				}
			});

			if (msgElem) {
				msgElem.style.color = "red";
				msgElem.textContent =
					"Không tải được cấu hình. Đang sử dụng mặc định ngày 1.";
			}

			return null;
		}
	}


	// ------------------------------------------------------------
	// Lưu cấu hình
	// ------------------------------------------------------------
	async function saveReportingPeriodConfig() {
		const msgElem =
			document.getElementById("reporting-period-config-msg");

		try {
			const hiddenInput =
				document.getElementById("reporting-period-month-start-day-value");

			const dateInput =
				document.getElementById("reporting-period-month-start-day");

			let startDay = Number(
				hiddenInput?.value || 0
			);

			// Nếu hidden chưa được cập nhật thì lấy trực tiếp từ lịch.
			if (!Number.isFinite(startDay) || startDay < 1) {
				const rawDate = String(dateInput?.value || "");

				if (rawDate) {
					const parts = rawDate.split("-");
					startDay = Number(parts[2]);
				}
			}

			startDay = normalizeReportingPeriodStartDay(startDay);

			if (startDay < 1 || startDay > 31) {
				alert("Ngày bắt đầu kỳ tháng không hợp lệ.");
				return;
			}

			const orgId = await getReportingPeriodOrgId();

			if (!orgId) {
				alert(
					"Không xác định được đơn vị (OrgId), " +
					"không thể lưu cấu hình."
				);
				return;
			}

			const user = firebase.auth().currentUser;

			if (!user) {
				alert("Vui lòng đăng nhập lại!");
				return;
			}

			if (msgElem) {
				msgElem.style.color = "blue";
				msgElem.textContent =
					"Đang lưu cấu hình kỳ thời gian báo cáo...";
			}

			const db = firebase.firestore();

			await db
				.collection("organizations")
				.doc(orgId)
				.set({
					reportingPeriod: {
						monthly: {
							type: "DAY_OF_MONTH",
							startDay
						}
					}
				}, {
					merge: true
				});

			window.currentReportingPeriodConfig = {
				monthly: {
					type: "DAY_OF_MONTH",
					startDay
				}
			};

			// Cập nhật lại giao diện sau khi lưu.
			renderReportingPeriodConfig(
				window.currentReportingPeriodConfig
			);

			if (msgElem) {
				msgElem.style.color = "green";
				msgElem.textContent =
					`Đã lưu cấu hình: ngày ${startDay} là ngày bắt đầu kỳ tháng.`;
			}

		} catch (error) {
			console.error(
				"Lỗi lưu cấu hình kỳ thời gian báo cáo:",
				error
			);

			if (msgElem) {
				msgElem.style.color = "red";

				if (
					error.code === "permission-denied" ||
					String(error.message || "")
						.includes("Missing or insufficient permissions")
				) {
					msgElem.textContent =
						"Lỗi phân quyền: tài khoản không có quyền lưu cấu hình đơn vị.";
				} else {
					msgElem.textContent =
						"Lỗi: " + (error.message || error);
				}
			}
		}
	}


	// ------------------------------------------------------------
	// Tự tải cấu hình khi mở Thẻ 1
	//
	// Không sửa switchAdminTab gốc.
	// Chỉ bọc lại để khi tab entities được mở,
	// cấu hình kỳ báo cáo được đọc từ Firestore.
	// ------------------------------------------------------------
	(function initReportingPeriodConfigAutoLoad() {
		if (typeof window === "undefined") {
			return;
		}

		const originalSwitchAdminTab =
			window.switchAdminTab;

		if (
			typeof originalSwitchAdminTab !== "function" ||
			originalSwitchAdminTab.__reportingPeriodWrapped
		) {
			return;
		}

		function wrappedSwitchAdminTab(tabName) {
			const result =
				originalSwitchAdminTab.apply(this, arguments);

			if (tabName === "entities") {
				setTimeout(() => {
					loadReportingPeriodConfig();
				}, 0);
			}

			return result;
		}

		wrappedSwitchAdminTab.__reportingPeriodWrapped = true;

		window.switchAdminTab =
			wrappedSwitchAdminTab;
	})();

	
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
	
	
	// 🌟 Hàm hiển thị Hộp thoại tiến trình
	function showImportProgressModal() {
		let modal = document.getElementById("import-progress-modal");
		if (!modal) {
			modal = document.createElement("div");
			modal.id = "import-progress-modal";
			modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;";
			modal.innerHTML = `
				<div style="background: white; padding: 25px; border-radius: 8px; width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); text-align: center; font-family: sans-serif;">
					<h3 style="margin-top: 0; color: #333;">Đang import dữ liệu...</h3>
					<p id="import-progress-text" style="font-size: 14px; color: #666; margin-bottom: 15px;">Đang chuẩn bị...</p>
					<div style="background: #e9ecef; border-radius: 4px; overflow: hidden; height: 20px; width: 100%;">
						<div id="import-progress-bar" style="background: #0d6efd; width: 0%; height: 100%; transition: width 0.1s ease;"></div>
					</div>
					<p id="import-progress-percent" style="font-weight: bold; color: #0d6efd; margin-top: 10px;">0%</p>
				</div>
			`;
			document.body.appendChild(modal);
		}
		modal.style.display = "flex";
	}

	// 🌟 Hàm cập nhật thông số tiến trình
	function updateImportProgress(percent, text) {
		const bar = document.getElementById("import-progress-bar");
		const perText = document.getElementById("import-progress-percent");
		const statusText = document.getElementById("import-progress-text");
		if (bar) bar.style.width = percent + "%";
		if (perText) perText.innerText = percent + "%";
		if (statusText && text) statusText.innerText = text;
	}

	// 🌟 Hàm ẩn Hộp thoại tiến trình
	function hideImportProgressModal() {
		const modal = document.getElementById("import-progress-modal");
		if (modal) {
			modal.style.display = "none";
		}
	}

	// 🌟 Hàm chính thực hiện import file Excel có kèm tiến trình %
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

		// Lấy năm học
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
				showImportProgressModal();
				updateImportProgress(5, "Đang đọc tệp Excel...");

				const data = new Uint8Array(e.target.result);
				const workbook = XLSX.read(data, { type: "array" });
				const firstSheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[firstSheetName];
				
				const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

				if (!rawRows || rawRows.length === 0) {
					hideImportProgressModal();
					alert("Tệp Excel không có dữ liệu!");
					return;
				}

				let startIndex = 0;
				let colMap = { code: 0, name: 1, category: 2, email: 3 };

				const firstRow = rawRows[0].map(cell => String(cell || "").trim().toLowerCase());
				const hasHeader = firstRow.some(cell => 
					cell.includes("mã") || cell.includes("họ") || cell.includes("tên") || cell.includes("email") || cell.includes("tổ") || cell.includes("lớp")
				);

				if (hasHeader) {
					startIndex = 1;
					rawRows[0].forEach((headerName, idx) => {
						const h = String(headerName || "").trim().toLowerCase();
						if (h.includes("mã") || h.includes("id")) colMap.code = idx;
						else if (h.includes("họ") || h.includes("tên")) colMap.name = idx;
						else if (h.includes("tổ") || h.includes("lớp") || h.includes("đơn vị") || h.includes("phòng")) colMap.category = idx;
						else if (h.includes("email") || h.includes("mail") || h.includes("thư")) colMap.email = idx;
					});
				}

				// Lọc ra các dòng hợp lệ trước để tính tổng khối lượng (%)
				const validRows = [];
				for (let i = startIndex; i < rawRows.length; i++) {
					const r = rawRows[i];
					if (!r || r.length === 0) continue;
					const code = String(r[colMap.code] ?? "").trim();
					const name = String(r[colMap.name] ?? "").trim();
					if (code && name) {
						validRows.push({
							code: code,
							fullName: name,
							category: String(r[colMap.category] ?? "").trim(),
							email: String(r[colMap.email] ?? "").trim().toLowerCase()
						});
					}
				}

				if (validRows.length === 0) {
					hideImportProgressModal();
					alert("Không tìm thấy dữ liệu hợp lệ! Vui lòng kiểm tra lại cấu trúc file Excel.");
					return;
				}

				const db = firebase.firestore();
				let countSuccess = 0;
				const totalRows = validRows.length;

				// Tiến hành vòng lặp đẩy dữ liệu lên Firestore và cập nhật % tiến trình
				for (let index = 0; index < totalRows; index++) {
					const item = validRows[index];
					const percent = Math.round(((index + 1) / totalRows) * 90) + 5; // Chạy từ 5% đến 95%
					updateImportProgress(percent, `Đang xử lý dòng ${index + 1} / ${totalRows}: ${item.fullName}`);

					// 1. Tạo document trong subcollection users[cite: 4]
					const userRef = db.collection("organizations").doc(orgId).collection("users").doc();
					await userRef.set({
						id: userRef.id,
						code: item.code,
						fullName: item.fullName,
						category: item.category,
						email: item.email,
						role: entityType,
						activated: Boolean(item.email),
						orgId: orgId,
						updatedAt: (typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString())
					}, { merge: true });

					// 2. Đồng bộ bảng emails gốc nếu có email[cite: 4]
					if (item.email) {
						const emailRef = db.collection("emails").doc(item.email);
						await emailRef.set({
							email: item.email,
							orgId: orgId,
							role: entityType === "TEACHER" ? "TEACHER" : "EMPLOYEE",
							fullName: item.fullName,
							academicYears: [academicYearId],
							updatedAt: (typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString())
						}, { merge: true });
					}

					// 3. Lưu danh mục Tổ / Lớp[cite: 4]
					if (item.category) {
						const categoryDocRef = db.collection("organizations")
							.doc(orgId)
							.collection("academicYears")
							.doc(academicYearId)
							.collection("categories")
							.doc(item.category);

						await categoryDocRef.set({
							name: item.category,
							type: entityType,
							updatedAt: (typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString())
						}, { merge: true });
					}

					countSuccess++;
				}

				updateImportProgress(100, "Hoàn tất đồng bộ dữ liệu!");
				setTimeout(async () => {
					hideImportProgressModal();
					alert(`Import thành công ${countSuccess} bản ghi vào tổ chức và đồng bộ hệ thống thành công![cite: 4]`);
					fileInput.value = "";
					
					window.isEntitiesCacheLoaded = false;
					if (typeof reloadAndRenderAdminEntityList === 'function') {
						await reloadAndRenderAdminEntityList(true);
					}
				}, 300);

			} catch (error) {
				hideImportProgressModal();
				console.error("Lỗi đọc file Excel:", error);
				alert("Lỗi khi xử lý file Excel: " + error.message);
			}
		};

		reader.readAsArrayBuffer(file);
		syncAdminAssignmentsCacheFromEntities();		
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

		// ============================================================
		// 1. DÙNG CACHE RAM KHI ĐÃ CÓ
		//    [] cũng là một cache hợp lệ, không cần đọc lại Firestore.
		// ============================================================
		if (
			!forceRefresh &&
			window.isEntitiesCacheLoaded === true &&
			Array.isArray(window.currentLoadedEntities)
		) {
			renderEntityTableRows(window.currentLoadedEntities);
			return;
		}

		// ============================================================
		// 2. HIỂN THỊ TRẠNG THÁI ĐANG TẢI
		// ============================================================
		tbody.innerHTML =
			'<tr><td colspan="5" style="text-align: center; color: #6c757d;">Đang tải dữ liệu từ máy chủ...</td></tr>';

		try {
			const orgId = window.currentOrgIdGlobal;

			if (!orgId) {
				window.isEntitiesCacheLoaded = false;
				window.currentLoadedEntities = [];

				tbody.innerHTML =
					'<tr><td colspan="5" style="text-align: center; color: red;">Không tìm thấy thông tin tổ chức!</td></tr>';
				return;
			}

			const db = firebase.firestore();

			// ========================================================
			// 3. ĐỌC FIRESTORE CHỈ KHI CACHE KHÔNG CÓ
			//    HOẶC forceRefresh = true
			// ========================================================
			const snapshot = await db
				.collection("organizations")
				.doc(orgId)
				.collection("users")
				.get();

			const loadedEntities = [];

			snapshot.forEach(doc => {
				const data = doc.data() || {};
				const role = String(data.role || "").trim().toUpperCase();

				// Thẻ 1 hiện chỉ quản lý TEACHER và STUDENT.
				if (role !== "TEACHER" && role !== "STUDENT") {
					return;
				}

				loadedEntities.push({
					...data,

					// Firebase document ID luôn giữ ở id/docId.
					id: doc.id,
					docId: doc.id,

					// Mã nghiệp vụ dùng riêng ở code.
					code: String(data.code || data.memberId || "").trim(),

					// UID/Auth UID giữ riêng, không ghi đè code.
					uid: String(data.uid || "").trim(),
					authUid: String(data.authUid || "").trim(),

					fullName:
						data.fullName ||
						data.displayName ||
						data.name ||
						"",

					category: String(data.category || "").trim(),
					email: String(data.email || "").trim().toLowerCase(),
					role: role
				});
			});

			// ========================================================
			// 4. GHI CACHE THẺ 1
			// ========================================================
			window.currentLoadedEntities = loadedEntities;
			window.isEntitiesCacheLoaded = true;

			// ========================================================
			// 5. ĐỒNG BỘ CACHE USERS CHUNG
			// ========================================================
			if (
				!window.cachedUsersMap ||
				typeof window.cachedUsersMap !== "object"
			) {
				window.cachedUsersMap = {};
			}

			loadedEntities.forEach(item => {
				const cacheItem = {
					...item,
					id: item.docId,
					docId: item.docId,
					code: item.code,
					uid: item.uid,
					authUid: item.authUid,
					fullName: item.fullName,
					category: item.category,
					email: item.email,
					role: item.role
				};

				// Ưu tiên document ID.
				if (item.docId) {
					window.cachedUsersMap[item.docId] = cacheItem;
				}

				// Cho phép tra cứu thêm theo code.
				if (item.code) {
					window.cachedUsersMap[item.code] = cacheItem;
				}

				// Cho phép tra cứu legacy theo uid.
				if (item.uid) {
					window.cachedUsersMap[item.uid] = cacheItem;
				}
			});

			// ========================================================
			// 6. ĐỒNG BỘ CACHE SECTION 1 DAILY
			// ========================================================
			if (!window._sec1DailyUsersCache) {
				window._sec1DailyUsersCache = {};
			}

			window._sec1DailyUsersCache[orgId] =
				window._sec1DailyUsersCache[orgId] || {
					byId: {},
					byUid: {},
					byCode: {}
				};

			const sec1Cache = window._sec1DailyUsersCache[orgId];

			sec1Cache.byId = {};
			sec1Cache.byUid = {};
			sec1Cache.byCode = {};

			loadedEntities.forEach(item => {
				if (item.docId) {
					sec1Cache.byId[item.docId] = item;
				}

				if (item.uid) {
					sec1Cache.byUid[item.uid] = item;
				}

				if (item.code) {
					sec1Cache.byCode[item.code] = item;
				}
			});

			// ========================================================
			// 7. ĐỒNG BỘ CACHE SECTION 2 WEEKLY
			// ========================================================
			if (!window._sec2UsersCache) {
				window._sec2UsersCache = {};
			}

			window._sec2UsersCache[orgId] =
				window._sec2UsersCache[orgId] || {
					byId: {},
					byUid: {},
					byCode: {}
				};

			const sec2Cache = window._sec2UsersCache[orgId];

			sec2Cache.byId = {};
			sec2Cache.byUid = {};
			sec2Cache.byCode = {};

			loadedEntities.forEach(item => {
				if (item.docId) {
					sec2Cache.byId[item.docId] = item;
				}

				if (item.uid) {
					sec2Cache.byUid[item.uid] = item;
				}

				if (item.code) {
					sec2Cache.byCode[item.code] = item;
				}
			});

			// ========================================================
			// 8. ĐỒNG BỘ CACHE ASSIGNMENT
			//    Nếu đã có hàm chuyên dụng thì dùng nó.
			// ========================================================
			if (
				typeof syncAdminAssignmentsCacheFromEntities === "function"
			) {
				try {
					syncAdminAssignmentsCacheFromEntities();
				} catch (syncError) {
					console.warn(
						"Không thể đồng bộ cache Assignment:",
						syncError
					);
				}
			} else {
				// Fallback: đồng bộ card2/card3 trực tiếp.
				const assignmentMembers = loadedEntities.map(item => ({
					...item,
					id: item.code || item.docId,
					docId: item.docId,
					code: item.code,
					uid: item.uid
				}));

				if (Array.isArray(window.card2CachedMembers)) {
					window.card2CachedMembers = assignmentMembers.map(item => ({
						...item
					}));
				}

				if (Array.isArray(window.card3CachedMembers)) {
					window.card3CachedMembers = assignmentMembers.map(item => ({
						...item
					}));
				}
			}

			// ========================================================
			// 9. RENDER THẺ 1
			// ========================================================
			renderEntityTableRows(window.currentLoadedEntities);

		} catch (error) {
			console.error("Lỗi tải danh sách thực thể:", error);

			// Không phá cache cũ nếu đã có cache hợp lệ.
			if (
				!window.isEntitiesCacheLoaded ||
				!Array.isArray(window.currentLoadedEntities)
			) {
				window.isEntitiesCacheLoaded = false;
				window.currentLoadedEntities = [];
			}

			tbody.innerHTML =
				'<tr><td colspan="5" style="text-align: center; color: red;">Lỗi tải dữ liệu từ cơ sở dữ liệu.</td></tr>';
		}
	}

	// Cho phép gọi từ HTML hoặc script type="module".
	window.reloadAndRenderAdminEntityList = reloadAndRenderAdminEntityList;


	
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
		
		// 🌟 Kiểm tra điều kiện kích hoạt: Phải có email và được cấu hình trong hệ thống (hoặc activated = true tùy logic thực tế)
		const hasEmail = Boolean(item.email && item.email.trim() !== "");
		const isActivated = item.activated === true && hasEmail;
		
		tr.innerHTML = `
		  <td style="font-family: monospace; font-weight: bold;">${item.code || item.id || ""}</td>
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
		if (!docId) {
			alert("Không xác định được ID bản ghi cần xóa!");
			return;
		}

		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			alert("Không xác định được tổ chức hiện tại!");
			return;
		}

		const entityId = String(docId).trim();
		if (!entityId) {
			alert("ID bản ghi không hợp lệ!");
			return;
		}

		if (!confirm(
			`Bạn có chắc chắn muốn xóa bản ghi [${entityId}] không?\n\n` +
			"Thao tác này chỉ xóa hồ sơ trong danh sách thực thể."
		)) {
			return;
		}

		try {
			const db = firebase.firestore();

			// 1. Xóa trực tiếp trên Firestore
			await db.collection("organizations")
				.doc(orgId)
				.collection("users")
				.doc(entityId)
				.delete();

			// 2. Cập nhật cache danh sách thực thể hiện tại
			if (Array.isArray(window.currentLoadedEntities)) {
				window.currentLoadedEntities =
					window.currentLoadedEntities.filter(item => {
						const itemId = String(item?.id || "").trim();
						const itemUid = String(item?.uid || "").trim();
						const itemCode = String(
							item?.code || item?.memberId || ""
						).trim();

						return (
							itemId !== entityId &&
							itemUid !== entityId &&
							itemCode !== entityId
						);
					});
			}

			// 3. Cập nhật cache chung cachedUsersMap
			if (
				window.cachedUsersMap &&
				typeof window.cachedUsersMap === "object"
			) {
				const cachedMap = window.cachedUsersMap;

				Object.keys(cachedMap).forEach(key => {
					const item = cachedMap[key];

					if (!item || typeof item !== "object") {
						return;
					}

					const itemKey = String(key).trim();
					const itemId = String(item.id || "").trim();
					const itemUid = String(item.uid || "").trim();
					const itemCode = String(
						item.code || item.memberId || ""
					).trim();

					if (
						itemKey === entityId ||
						itemId === entityId ||
						itemUid === entityId ||
						itemCode === entityId
					) {
						delete cachedMap[key];
					}
				});
			}

			// 4. Cập nhật cache riêng của Section 2 Weekly
			if (
				window._sec2UsersCache &&
				window._sec2UsersCache[orgId]
			) {
				const sec2Cache = window._sec2UsersCache[orgId];

				if (
					sec2Cache.byCode &&
					typeof sec2Cache.byCode === "object"
				) {
					Object.keys(sec2Cache.byCode).forEach(code => {
						const user = sec2Cache.byCode[code];

						if (!user || typeof user !== "object") {
							return;
						}

						const userCode = String(
							user.code || code || ""
						).trim();

						const userUid = String(
							user.uid || ""
						).trim();

						if (
							String(code).trim() === entityId ||
							userCode === entityId ||
							userUid === entityId
						) {
							delete sec2Cache.byCode[code];
						}
					});
				}

				if (
					sec2Cache.byUid &&
					typeof sec2Cache.byUid === "object"
				) {
					Object.keys(sec2Cache.byUid).forEach(uid => {
						const user = sec2Cache.byUid[uid];

						if (!user || typeof user !== "object") {
							return;
						}

						const userUid = String(
							user.uid || uid || ""
						).trim();

						const userCode = String(
							user.code || ""
						).trim();

						if (
							String(uid).trim() === entityId ||
							userUid === entityId ||
							userCode === entityId
						) {
							delete sec2Cache.byUid[uid];
						}
					});
				}
			}

			// 5. Render lại bảng từ RAM, không đọc lại Firestore
			
			if (
				typeof renderEntityTableRows === "function" &&
				Array.isArray(window.currentLoadedEntities)
			) {
				renderEntityTableRows(
					window.currentLoadedEntities
				);
			}

			// Cache hiện tại vẫn hợp lệ vì đã loại đúng phần tử vừa xóa
			window.isEntitiesCacheLoaded = true;

			alert(`Đã xóa thành công bản ghi [${entityId}].`);
			syncAdminAssignmentsCacheFromEntities();
			
		} catch (error) {
			console.error(
				"❌ Lỗi deleteEntityRecord():",
				error
			);

			alert(
				"Không thể xóa bản ghi.\n\n" +
				(error?.message || error)
			);
		}
	}
	
	// 1. KIỂM TRA USER CÓ ĐANG HOẠT ĐỘNG KHÔNG
	function isAdminAssignmentMemberActive(member) {
		if (!member || typeof member !== "object") {
			return false;
		}

		// Nếu có cờ boolean thì ưu tiên cờ boolean
		if (member.isActive === false) return false;
		if (member.active === false) return false;

		const status = String(
			member.status ||
			member.statusCode ||
			member.accountStatus ||
			""
		).trim().toUpperCase();

		if (
			status === "INACTIVE" ||
			status === "DISABLED" ||
			status === "DEACTIVATED" ||
			status === "LOCKED" ||
			status === "NGUNG_HOAT_DONG" ||
			status === "NGỪNG HOẠT ĐỘNG"
		) {
			return false;
		}

		return true;
	}

	// 2. CHUẨN HÓA 1 USER TỪ CACHE THẺ 1
	function normalizeAdminAssignmentMember(item) {
		if (!item || typeof item !== "object") {
			return null;
		}

		const docId = String(
			item.docId ||
			item.id ||
			item.uid ||
			""
		).trim();

		const uid = String(
			item.uid ||
			""
		).trim();

		const code = String(
			item.code ||
			item.memberId ||
			(
				item.id &&
				item.id !== uid
					? item.id
					: ""
			) ||
			""
		).trim();

		const fullName = String(
			item.fullName ||
			item.displayName ||
			item.name ||
			docId ||
			code ||
			uid
		).trim();

		return {
			...item,

			// docId dùng cho update/delete Firestore
			docId: docId,

			// code dùng làm mã nghiệp vụ / hiển thị
			id: code || docId || uid,

			uid: uid,

			code: code,

			fullName: fullName,

			category: String(
				item.category ||
				item.className ||
				""
			).trim(),

			email: String(
				item.email ||
				""
			).trim().toLowerCase()
		};
	}

	// 3. ĐỒNG BỘ CARD2 CACHE TỪ CACHE THẺ 1
	//
	// Thẻ 1:
	//   window.currentLoadedEntities
	//
	// Thẻ 5 / Assignments:
	//   window.card2CachedMembers
	//
	// Không đọc Firestore ở đây.
	// =============================================================
	function syncCard2MembersFromEntityCache() {
		const source =
			Array.isArray(window.currentLoadedEntities)
				? window.currentLoadedEntities
				: null;

		if (!source) {
			return false;
		}

		const result = [];
		const seen = new Set();

		source.forEach(item => {
			if (!item) return;

			const normalized =
				normalizeAdminAssignmentMember(item);

			if (!normalized) return;

			// Không cho ADMIN vào danh sách phân công
			const role = String(
				normalized.role || ""
			).trim().toUpperCase();

			if (role === "ADMIN") {
				return;
			}

			// Loại user đã hủy kích hoạt
			if (!isAdminAssignmentMemberActive(normalized)) {
				return;
			}

			const uniqueKey =
				normalized.docId ||
				normalized.uid ||
				normalized.code ||
				normalized.id;

			if (!uniqueKey || seen.has(uniqueKey)) {
				return;
			}

			seen.add(uniqueKey);
			result.push(normalized);
		});

		window.card2CachedMembers = result;

		// Đồng bộ luôn Card 3 vì Card 3 dùng lại cache này
		window.card3CachedMembers = result;

		return true;
	}
	
	// 4. RENDER LẠI GIAO DIỆN ASSIGNMENTS TỪ CACHE
	function renderAdminAssignmentsFromCache() {
		const members =
			Array.isArray(window.card2CachedMembers)
				? window.card2CachedMembers
				: [];

		if (typeof populateCard2Categories === "function") {
			populateCard2Categories(members);
		}

		if (typeof renderCard2MemberList === "function") {
			renderCard2MemberList(members);
		}

		if (typeof renderDefaultMatricesBoxes === "function") {
			renderDefaultMatricesBoxes();
		}

		// Card 3 dùng cùng nguồn cache
		if (
			typeof renderCard3MembersList === "function"
		) {
			renderCard3MembersList(members);
		}
	}


	// =============================================================
	// 7. ĐỒNG BỘ KHI CACHE THẺ 1 THAY ĐỔI
	//
	// Gọi hàm này sau khi Thẻ 1:
	// - thêm user
	// - sửa user
	// - xóa user
	// - thay đổi trạng thái hoạt động
	//
	// Nếu Thẻ Assignments đang hiển thị thì render lại ngay.
	// =============================================================
	function syncAdminAssignmentsCacheFromEntities() {
		if (
			!window.isEntitiesCacheLoaded ||
			!Array.isArray(window.currentLoadedEntities)
		) {
			return;
		}

		syncCard2MembersFromEntityCache();

		const assignmentsSection =
			document.getElementById(
				"admin-sec-assignments"
			);

		// Chỉ render khi section Assignments đang tồn tại trên DOM
		if (assignmentsSection) {
			renderAdminAssignmentsFromCache();
		}
	}


	// =============================================================
	// 8. PUBLIC API
	// =============================================================
	window.isAdminAssignmentMemberActive =
		isAdminAssignmentMemberActive;

	window.syncCard2MembersFromEntityCache =
		syncCard2MembersFromEntityCache;

	window.renderAdminAssignmentsFromCache =
		renderAdminAssignmentsFromCache;

	window.loadCard2MembersData =
		loadCard2MembersData;

	window.initAdminAssignmentsTab =
		initAdminAssignmentsTab;

	window.syncAdminAssignmentsCacheFromEntities =
		syncAdminAssignmentsCacheFromEntities;


	// Cần thiết nếu app.js chạy dạng ES module,
	// để onclick="deleteEntityRecord(...)" vẫn gọi được.
	window.deleteEntityRecord = deleteEntityRecord;

	
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
		syncAdminAssignmentsCacheFromEntities();
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

		// ============================================================
		// 1. LẤY DANH SÁCH TỪ CACHE THẺ 1
		// ============================================================
		let sourceList = Array.isArray(window.currentLoadedEntities)
			? window.currentLoadedEntities
			: [];

		// Dự phòng: nếu cache chưa có thì đọc từ bảng HTML hiện tại.
		if (sourceList.length === 0) {
			const tbody = document.getElementById("entity-table-body");

			if (tbody) {
				const fallbackList = [];

				tbody.querySelectorAll("tr").forEach(tr => {
					if (tr.querySelector("td[colspan]")) return;

					const cols = tr.querySelectorAll("td");

					if (cols.length >= 4) {
						fallbackList.push({
							id: cols[0].textContent.trim(),
							code: cols[0].textContent.trim(),
							fullName: cols[1].textContent.trim(),
							category: cols[2].textContent.trim(),
							email:
								cols[3].textContent.trim().toLowerCase() === "chưa có"
									? ""
									: cols[3].textContent.trim(),
							role: "STUDENT"
						});
					}
				});

				sourceList = fallbackList;
			}
		}

		if (sourceList.length === 0) {
			alert("Không có dữ liệu thực thể nào để kích hoạt!");
			return;
		}

		// ============================================================
		// 2. LỌC THEO Ô TÌM KIẾM CỦA THẺ 1
		// ============================================================
		const searchInput = document.getElementById("entity-search-input");
		const keyword = searchInput
			? String(searchInput.value || "").toLowerCase().trim()
			: "";

		let targetList = sourceList;

		if (keyword) {
			targetList = sourceList.filter(item => {
				const idMatch = String(item.id || "").toLowerCase().includes(keyword);
				const codeMatch = String(item.code || "").toLowerCase().includes(keyword);
				const nameMatch = String(item.fullName || "").toLowerCase().includes(keyword);
				const catMatch = String(item.category || "").toLowerCase().includes(keyword);
				const emailMatch = String(item.email || "").toLowerCase().includes(keyword);

				return idMatch || codeMatch || nameMatch || catMatch || emailMatch;
			});
		}

		if (targetList.length === 0) {
			alert(
				`Không tìm thấy đối tượng nào khớp với từ khóa "${keyword}" trên bảng hiển thị!`
			);
			return;
		}

		// ============================================================
		// 3. CHỈ XỬ LÝ NHỮNG BẢN GHI CÓ EMAIL HỢP LỆ
		// ============================================================
		const validAccounts = targetList.filter(item => {
			const email = String(item.email || "").trim();
			return email.includes("@");
		});

		if (validAccounts.length === 0) {
			alert(
				`Có ${targetList.length} bản ghi đang hiển thị nhưng không có bản ghi nào chứa email hợp lệ để tạo tài khoản đăng nhập!`
			);
			return;
		}

		const confirmMsg = keyword
			? `Bạn có chắc chắn muốn kích hoạt tài khoản cho ${validAccounts.length} bản ghi đang hiển thị (theo từ khóa "${keyword}")? (Mật khẩu mặc định: 123456)`
			: `Bạn có chắc chắn muốn kích hoạt tài khoản cho toàn bộ ${validAccounts.length} bản ghi đang hiển thị trên bảng? (Mật khẩu mặc định: 123456)`;

		if (!confirm(confirmMsg)) {
			return;
		}

		const user = firebase.auth().currentUser;
		const db = firebase.firestore();

		// ============================================================
		// 4. LẤY ACADEMIC YEARS CỦA ADMIN
		// ============================================================
		let adminAcademicYears = [];

		try {
			if (user && user.email) {
				const adminEmailDoc = await db
					.collection("emails")
					.doc(user.email.toLowerCase().trim())
					.get();

				if (
					adminEmailDoc.exists &&
					Array.isArray(adminEmailDoc.data().academicYears)
				) {
					adminAcademicYears = adminEmailDoc.data().academicYears;
				}
			}
		} catch (e) {
			console.warn("Không lấy được academicYears của admin:", e);
		}

		// ============================================================
		// 5. CÁC HÀM ĐỒNG BỘ CACHE
		// ============================================================
		function normalizeMember(item) {
			if (!item) return null;

			const docId = String(
				item.docId ||
				item.userDocId ||
				item.id ||
				item.uid ||
				item.code ||
				""
			).trim();

			const code = String(
				item.code ||
				item.memberId ||
				item.id ||
				""
			).trim();

			const uid = String(
				item.uid ||
				item.authUid ||
				""
			).trim();

			if (!docId && !code) return null;

			return {
				...item,
				id: docId || code,
				docId: docId || code,
				code: code,
				uid: uid,
				fullName: item.fullName || item.displayName || item.name || "",
				category: item.category || "",
				email: item.email || "",
				role: item.role || "",
				activated: item.activated === true,
				authUid: item.authUid || ""
			};
		}

		function updateArrayItem(array, updatedItem) {
			if (!Array.isArray(array) || !updatedItem) return array;

			const normalized = normalizeMember(updatedItem);
			if (!normalized) return array;

			const index = array.findIndex(item => {
				const itemDocId = String(
					item.docId ||
					item.userDocId ||
					item.id ||
					""
				).trim();

				const itemCode = String(item.code || "").trim();

				return (
					(normalized.docId && itemDocId === normalized.docId) ||
					(normalized.code && itemCode === normalized.code)
				);
			});

			if (index >= 0) {
				array[index] = {
					...array[index],
					...normalized
				};
			} else {
				array.push(normalized);
			}

			return array;
		}

		function syncOneUserToCaches(updatedUser) {
			const normalized = normalizeMember(updatedUser);
			if (!normalized) return;

			// --------------------------------------------------------
			// CACHE THẺ 1
			// --------------------------------------------------------
			if (Array.isArray(window.currentLoadedEntities)) {
				updateArrayItem(window.currentLoadedEntities, normalized);
			}

			// --------------------------------------------------------
			// CACHE USERS CHUNG
			// --------------------------------------------------------
			if (window.cachedUsersMap && typeof window.cachedUsersMap === "object") {
				const possibleKeys = [
					normalized.docId,
					normalized.id,
					normalized.code,
					normalized.uid
				].filter(Boolean);

				let existingKey = possibleKeys.find(key =>
					Object.prototype.hasOwnProperty.call(
						window.cachedUsersMap,
						key
					)
				);

				if (!existingKey) {
					existingKey = normalized.docId || normalized.code;
				}

				if (existingKey) {
					window.cachedUsersMap[existingKey] = {
						...(window.cachedUsersMap[existingKey] || {}),
						...normalized
					};
				}
			}

			// --------------------------------------------------------
			// CACHE THẺ 2
			// --------------------------------------------------------
			if (Array.isArray(window.card2CachedMembers)) {
				updateArrayItem(window.card2CachedMembers, normalized);
			}

			// --------------------------------------------------------
			// CACHE THẺ 3
			// --------------------------------------------------------
			if (Array.isArray(window.card3CachedMembers)) {
				updateArrayItem(window.card3CachedMembers, normalized);
			}

			// --------------------------------------------------------
			// CACHE SECTION 2 WEEKLY
			// --------------------------------------------------------
			const sec2Cache =
				window._sec2UsersCache &&
				window._sec2UsersCache[orgId];

			if (sec2Cache) {
				sec2Cache.byId = sec2Cache.byId || {};
				sec2Cache.byUid = sec2Cache.byUid || {};
				sec2Cache.byCode = sec2Cache.byCode || {};

				if (normalized.docId) {
					sec2Cache.byId[normalized.docId] = normalized;
				}

				if (normalized.uid) {
					sec2Cache.byUid[normalized.uid] = normalized;
				}

				if (normalized.code) {
					sec2Cache.byCode[normalized.code] = normalized;
				}
			}

			// --------------------------------------------------------
			// CACHE SECTION 1 DAILY
			// --------------------------------------------------------
			const sec1Cache =
				window._sec1DailyUsersCache &&
				window._sec1DailyUsersCache[orgId];

			if (sec1Cache) {
				sec1Cache.byId = sec1Cache.byId || {};
				sec1Cache.byUid = sec1Cache.byUid || {};
				sec1Cache.byCode = sec1Cache.byCode || {};

				if (normalized.docId) {
					sec1Cache.byId[normalized.docId] = normalized;
				}

				if (normalized.uid) {
					sec1Cache.byUid[normalized.uid] = normalized;
				}

				if (normalized.code) {
					sec1Cache.byCode[normalized.code] = normalized;
				}
			}
		}

		// ============================================================
		// 6. KÍCH HOẠT FIREBASE AUTH + CẬP NHẬT FIRESTORE
		// ============================================================
		let successCount = 0;
		let secondaryApp = null;

		try {
			const firebaseConfig = firebase.app().options;

			// Tránh lỗi nếu app phụ đã tồn tại từ lần chạy trước.
			try {
				secondaryApp = firebase.app("SecondaryAppForBatchActivation");
			} catch (e) {
				secondaryApp = firebase.initializeApp(
					firebaseConfig,
					"SecondaryAppForBatchActivation"
				);
			}

			const secondaryAuth = secondaryApp.auth();

			for (const acc of validAccounts) {
				const rawEmail = acc.email ? String(acc.email) : "";
				const standardizedEmail = rawEmail
					.toLowerCase()
					.replace(/\s+/g, "")
					.trim();

				if (
					!standardizedEmail ||
					!standardizedEmail.includes("@") ||
					!standardizedEmail.includes(".")
				) {
					console.warn(
						`Bỏ qua dòng có email không hợp lệ: "${acc.email}"`
					);
					continue;
				}

				// acc.id trong bảng Thẻ 1 là document ID của users.
				const userDocId = String(
					acc.docId ||
					acc.userDocId ||
					acc.id ||
					acc.uid ||
					acc.code ||
					""
				).trim();

				if (!userDocId) {
					console.warn(
						`Không xác định được document ID của user: ${acc.fullName || standardizedEmail}`
					);
					continue;
				}

				const userRole = acc.role || "STUDENT";

				let activationSucceeded = false;

				try {
					// ------------------------------------------------
					// Tạo Firebase Auth account
					// ------------------------------------------------
					const userCred =
						await secondaryAuth.createUserWithEmailAndPassword(
							standardizedEmail,
							"123456"
						);

					const newUid = userCred.user.uid;

					// ------------------------------------------------
					// Cập nhật users/{docId}
					// ------------------------------------------------
					await db
						.collection("organizations")
						.doc(orgId)
						.collection("users")
						.doc(userDocId)
						.set(
							{
								authUid: newUid,
								activated: true,
								email: standardizedEmail,
								updatedAt: getVietnamTimestamp(),

								// Giữ uid nghiệp vụ cũ theo logic hiện tại.
								uid: acc.uid || acc.id || userDocId
							},
							{ merge: true }
						);

					activationSucceeded = true;

				} catch (err) {
					// ------------------------------------------------
					// Email đã tồn tại trong Firebase Auth
					// ------------------------------------------------
					if (err.code === "auth/email-already-in-use") {
						await db
							.collection("organizations")
							.doc(orgId)
							.collection("users")
							.doc(userDocId)
							.set(
								{
									activated: true,
									email: standardizedEmail,
									updatedAt: getVietnamTimestamp()
								},
								{ merge: true }
							);

						activationSucceeded = true;
					} else {
						console.error(
							`Không thể kích hoạt email [${standardizedEmail}]:`,
							err.message
						);
					}
				}

				if (!activationSucceeded) {
					continue;
				}

				// ----------------------------------------------------
				// Cập nhật collection emails
				// ----------------------------------------------------
				try {
					await db
						.collection("emails")
						.doc(standardizedEmail)
						.set(
							{
								orgId: orgId,
								role: userRole,
								fullName: acc.fullName || "",
								activated: true,
								academicYears: adminAcademicYears,
								updatedAt: getVietnamTimestamp(),
								uid: acc.uid || acc.id || userDocId
							},
							{ merge: true }
						);
				} catch (emailErr) {
					console.warn(
						`Đã kích hoạt user nhưng không cập nhật được emails/${standardizedEmail}:`,
						emailErr
					);
				}

				// ----------------------------------------------------
				// CẬP NHẬT CACHE RAM NGAY LẬP TỨC
				// ----------------------------------------------------
				syncOneUserToCaches({
					...acc,
					id: userDocId,
					docId: userDocId,
					code: acc.code || "",
					uid: acc.uid || acc.id || userDocId,
					authUid: acc.authUid || "",
					email: standardizedEmail,
					activated: true,
					role: userRole,
					fullName: acc.fullName || "",
					category: acc.category || ""
				});

				successCount++;
			}

			alert(`Đã kích hoạt thành công ${successCount} tài khoản!`);

			// ========================================================
			// 7. RENDER LẠI TỪ CACHE RAM — KHÔNG ĐỌC LẠI FIRESTORE
			// ========================================================

			// Thẻ 1
			if (typeof renderEntityTableRows === "function") {
				renderEntityTableRows(
					Array.isArray(window.currentLoadedEntities)
						? window.currentLoadedEntities
						: []
				);
			}

			// Thẻ 2
			if (
				typeof populateCard2Categories === "function" &&
				Array.isArray(window.card2CachedMembers)
			) {
				populateCard2Categories(window.card2CachedMembers);
			}

			if (
				typeof renderCard2MemberList === "function" &&
				Array.isArray(window.card2CachedMembers)
			) {
				renderCard2MemberList(window.card2CachedMembers);
			}

			// Ma trận phân công
			if (typeof renderDefaultMatricesBoxes === "function") {
				renderDefaultMatricesBoxes();
			}

			// Thẻ 3 nếu đang có danh sách cache
			if (
				typeof renderCard3MembersList === "function" &&
				Array.isArray(window.card3CachedMembers)
			) {
				renderCard3MembersList(window.card3CachedMembers);
			}

			// Nếu hệ thống đã có hàm đồng bộ chuyên dụng thì gọi thêm
			// để bảo đảm toàn bộ UI assignment dùng chung cache.
			if (
				typeof syncAdminAssignmentsCacheFromEntities === "function"
			) {
				try {
					syncAdminAssignmentsCacheFromEntities();
				} catch (syncErr) {
					console.warn(
						"Không thể đồng bộ cache Assignment sau khi kích hoạt:",
						syncErr
					);
				}
			}

		} catch (error) {
			console.error("Lỗi kích hoạt hàng loạt:", error);
			alert("Lỗi khi thực hiện kích hoạt: " + error.message);

		} finally {
			if (secondaryApp) {
				try {
					await secondaryApp.delete();
				} catch (e) {
					console.warn("Không thể đóng SecondaryApp:", e);
				}
			}
		}
	}

	// Nếu app đang chạy bằng <script type="module">
	// thì vẫn cho phép HTML onclick gọi được hàm.
	window.activateFilteredAccounts = activateFilteredAccounts;

	
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
		await loadCard2MembersData(false);

		if (typeof renderDefaultMatricesBoxes === "function") {
			renderDefaultMatricesBoxes();
		}
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
		const container =
			document.getElementById(
				"assign-members-radio-container"
			);

		if (!container) return;

		window.card2CachedMembers =
			window.card2CachedMembers || [];

		// =========================================================
		// A. Nếu Thẻ 1 đã có cache thì dùng cache Thẻ 1
		// =========================================================
		if (
			!forceRefresh &&
			window.isEntitiesCacheLoaded === true &&
			Array.isArray(window.currentLoadedEntities)
		) {
			syncCard2MembersFromEntityCache();
			renderAdminAssignmentsFromCache();
			return;
		}

		// =========================================================
		// B. Nếu Card2 đã có cache thì dùng RAM
		// =========================================================
		if (
			!forceRefresh &&
			window.card2CachedMembers.length > 0
		) {
			// Vẫn lọc lại trạng thái active để tránh giữ user
			// vừa bị đánh dấu inactive trong cache.
			const before =
				window.card2CachedMembers;

			window.card2CachedMembers =
				before
					.map(normalizeAdminAssignmentMember)
					.filter(Boolean)
					.filter(isAdminAssignmentMemberActive)
					.filter(item =>
						String(item.role || "")
							.trim()
							.toUpperCase() !== "ADMIN"
					);

			window.card3CachedMembers =
				window.card2CachedMembers;

			renderAdminAssignmentsFromCache();
			return;
		}

		// =========================================================
		// C. Chỉ đọc Firestore khi thực sự chưa có cache
		// =========================================================
		container.innerHTML =
			'<div style="padding: 10px; text-align: center; color: #6c757d;">Đang tải danh sách nhân sự...</div>';

		try {
			const orgId =
				window.currentOrgIdGlobal;

			if (!orgId) {
				container.innerHTML =
					'<div style="padding: 10px; text-align: center; color: red;">Không tìm thấy thông tin tổ chức!</div>';
				return;
			}

			const db =
				firebase.firestore();

			const snapshot =
				await db
					.collection("organizations")
					.doc(orgId)
					.collection("users")
					.get();

			const members = [];

			snapshot.forEach(doc => {
				const data =
					doc.data() || {};

				const role =
					String(data.role || "")
						.trim()
						.toUpperCase();

				if (role === "ADMIN") {
					return;
				}

				const item =
					normalizeAdminAssignmentMember({
						...data,
						id:
							data.code ||
							data.id ||
							doc.id,
						docId: doc.id
					});

				if (!item) return;

				if (!isAdminAssignmentMemberActive(item)) {
					return;
				}

				members.push(item);
			});

			window.card2CachedMembers =
				members;

			window.card3CachedMembers =
				members;

			// Đồng bộ ngược vào cache chung nếu cache chung tồn tại
			if (
				window.cachedUsersMap &&
				typeof window.cachedUsersMap === "object"
			) {
				members.forEach(member => {
					const key =
						member.docId ||
						member.uid;

					if (!key) return;

					window.cachedUsersMap[key] =
						member;
				});
			}

			renderAdminAssignmentsFromCache();

		} catch (error) {
			console.error(
				"Lỗi tải nhân sự cho Thẻ Assignments:",
				error
			);

			container.innerHTML =
				'<div style="padding: 10px; text-align: center; color: red;">Lỗi tải dữ liệu từ máy chủ.</div>';
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
			<span style="overflow: hidden; text-overflow: ellipsis;">${item.fullName || ''}</span>
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
	}
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

	function generateKpiOptionsRows(existingKpiOptions = {}) {
	  const rawText = document.getElementById("field-options-values")?.value || "";
	  const container = document.getElementById("kpi-options-rows-wrapper");

	  if (!container) return;

	  const options = rawText
		.split(",")
		.map(item => item.trim())
		.filter(item => item.length > 0);

	  if (options.length === 0) {
		container.innerHTML = `
		  <div style="color: #6c757d; font-size: 0.85em; font-style: italic;">
			Chưa có giá trị lựa chọn nào. Hãy nhập các giá trị ở trên (cách nhau bởi dấu phẩy).
		  </div>
		`;
		return;
	  }

	  let html = `
		<table style="
		  width: 100%;
		  border-collapse: collapse;
		  margin-top: 10px;
		  font-size: 0.9em;
		">
		  <thead>
			<tr style="background: #f8f9fa;">
			  <th style="
				border: 1px solid #dee2e6;
				padding: 8px;
				text-align: left;
			  ">
				Giá trị lựa chọn
			  </th>

			  <th style="
				border: 1px solid #dee2e6;
				padding: 8px;
				text-align: center;
			  ">
				Điểm (+/-)
			  </th>

			  <th style="
				border: 1px solid #dee2e6;
				padding: 8px;
				text-align: center;
			  ">
				Ngưỡng Tuần
			  </th>

			  <th style="
				border: 1px solid #dee2e6;
				padding: 8px;
				text-align: center;
			  ">
				Ngưỡng Tháng
			  </th>
			</tr>
		  </thead>

		  <tbody>
	  `;

	  options.forEach((opt) => {
		const existing = existingKpiOptions[opt] || {};

		const scoreWeight =
		  existing.scoreWeight !== undefined
			? existing.scoreWeight
			: -1;

		const kpiWeekly =
		  existing.kpiWeekly !== undefined
			? existing.kpiWeekly
			: 3;

		const kpiMonthly =
		  existing.kpiMonthly !== undefined
			? existing.kpiMonthly
			: 5;

		html += `
		  <tr
			class="kpi-option-row-item"
			data-option-value="${opt.replace(/"/g, '&quot;')}"
		  >
			<td style="
			  border: 1px solid #dee2e6;
			  padding: 8px;
			">
			  ${opt}
			</td>

			<td style="
			  border: 1px solid #dee2e6;
			  padding: 8px;
			  text-align: center;
			">
			  <input
				type="number"
				step="0.5"
				value="${scoreWeight}"
				class="opt-score-weight"
				data-option="${opt.replace(/"/g, '&quot;')}"
				style="
				  width: 80px;
				  padding: 4px;
				  box-sizing: border-box;
				"
			  >
			</td>

			<td style="
			  border: 1px solid #dee2e6;
			  padding: 8px;
			  text-align: center;
			">
			  <input
				type="number"
				value="${kpiWeekly}"
				class="opt-kpi-weekly"
				data-option="${opt.replace(/"/g, '&quot;')}"
				style="
				  width: 80px;
				  padding: 4px;
				  box-sizing: border-box;
				"
			  >
			</td>

			<td style="
			  border: 1px solid #dee2e6;
			  padding: 8px;
			  text-align: center;
			">
			  <input
				type="number"
				value="${kpiMonthly}"
				class="opt-kpi-monthly"
				data-option="${opt.replace(/"/g, '&quot;')}"
				style="
				  width: 80px;
				  padding: 4px;
				  box-sizing: border-box;
				"
			  >
			</td>
		  </tr>
		`;
	  });

	  html += `
		  </tbody>
		</table>
	  `;

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
	
	// 5.x Xuất Các trường dữ liệu đã định nghĩa để share
	function exportVisibleSchemaFieldsExcel() {

		if (typeof XLSX === "undefined") {
			alert("Thư viện Excel (SheetJS) chưa được tải!");
			return;
		}

		/*
		 * ============================================================
		 * 1. LẤY TỪ KHÓA ĐANG TÌM KIẾM
		 * ============================================================
		 */

		const searchInput = document.getElementById(
			"schema-fields-search-input"
		);

		const keyword = searchInput
			? searchInput.value.toLowerCase().trim()
			: "";

		/*
		 * ============================================================
		 * 2. LẤY ĐÚNG DANH SÁCH ĐANG HIỂN THỊ
		 *
		 * Phải sử dụng cùng logic với filterSchemaFieldsList()
		 * ============================================================
		 */

		const sourceFields = Array.isArray(window.cachedSchemaFields)
			? window.cachedSchemaFields
			: [];

		const visibleFields = !keyword
			? sourceFields
			: sourceFields.filter(f => {

				const keyMatch =
					f.key &&
					String(f.key)
						.toLowerCase()
						.includes(keyword);

				const labelMatch =
					f.label &&
					String(f.label)
						.toLowerCase()
						.includes(keyword);

				return keyMatch || labelMatch;
			});

		/*
		 * ============================================================
		 * 3. KIỂM TRA DỮ LIỆU
		 * ============================================================
		 */

		if (visibleFields.length === 0) {
			alert("Không có trường dữ liệu nào đang hiển thị để xuất!");
			return;
		}

		/*
		 * ============================================================
		 * 4. CHUYỂN CẤU TRÚC FIELD SANG FORMAT EXCEL
		 *
		 * Giữ nguyên cấu trúc tương thích với
		 * importSchemaFieldsFromExcel()
		 * ============================================================
		 */

		const exportData = visibleFields.map(field => {

			/*
			 * Chuyển options thành chuỗi phân cách bằng dấu phẩy.
			 */

			const optionsText =
				Array.isArray(field.options)
					? field.options.join(", ")
					: "";

			/*
			 * Giữ nguyên cấu hình KPI từng option dưới dạng JSON.
			 */

			let kpiOptionsJson = "";

			if (
				field.kpiOptions &&
				typeof field.kpiOptions === "object" &&
				Object.keys(field.kpiOptions).length > 0
			) {
				try {
					kpiOptionsJson = JSON.stringify(
						field.kpiOptions
					);
				} catch (error) {
					console.warn(
						"Không thể chuyển kpiOptions sang JSON:",
						field.key,
						error
					);
				}
			}

			return {
				"Mã trường (Key)": field.key || "",

				"Tên hiển thị": field.label || "",

				"Kiểu dữ liệu (number/text/date/boolean/options)":
					field.type || "text",

				"Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)":
					optionsText,

				"Tính KPI (TRUE/FALSE)":
					field.isKpi ? "TRUE" : "FALSE",

				"Trọng số điểm":
					Number(field.scoreWeight || 0),

				"Ngưỡng Tuần":
					Number(field.kpiWeekly || 0),

				"Ngưỡng Tháng":
					Number(field.kpiMonthly || 0),

				"Cấu hình KPI từng tùy chọn (JSON)":
					kpiOptionsJson
			};
		});

		/*
		 * ============================================================
		 * 5. TẠO WORKSHEET
		 * ============================================================
		 */

		const worksheet = XLSX.utils.json_to_sheet(
			exportData
		);

		/*
		 * ============================================================
		 * 6. ĐỘ RỘNG CỘT
		 * ============================================================
		 */

		worksheet["!cols"] = [
			{ wch: 24 },
			{ wch: 28 },
			{ wch: 48 },
			{ wch: 55 },
			{ wch: 22 },
			{ wch: 18 },
			{ wch: 16 },
			{ wch: 17 },
			{ wch: 90 }
		];

		/*
		 * ============================================================
		 * 7. TẠO WORKBOOK
		 * ============================================================
		 */

		const workbook = XLSX.utils.book_new();

		XLSX.utils.book_append_sheet(
			workbook,
			worksheet,
			"DanhSachTruong"
		);

		/*
		 * ============================================================
		 * 8. TÊN FILE
		 * ============================================================
		 */

		const dateStr =
			new Date().toISOString().slice(0, 10);

		let fileName;

		if (keyword) {
			fileName =
				`Danh_Sach_Truong_Loc_${dateStr}.xlsx`;
		} else {
			fileName =
				`Danh_Sach_Truong_${dateStr}.xlsx`;
		}

		/*
		 * ============================================================
		 * 9. TẢI FILE
		 * ============================================================
		 */

		XLSX.writeFile(
			workbook,
			fileName
		);
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

	// 7. Đưa 	dữ liệu lên Form để Sửa trường
	function editSchemaField(key) {
	  console.log("=== EDIT SCHEMA FIELD ===");
	  console.log("Key cần sửa:", key);

	  // ==========================================
	  // 1. Tìm field trong danh sách đã cache
	  // ==========================================
	  const field = cachedSchemaFields.find(
		f => f.key === key
	  );

	  if (!field) {
		console.error("Không tìm thấy field:", key);
		alert("Không tìm thấy trường thông tin cần sửa!");
		return;
	  }

	  console.log("Field tìm được:", field);

	  // ==========================================
	  // 2. Chuyển form sang chế độ EDIT
	  // ==========================================
	  const editModeInput =
		document.getElementById("field-edit-mode");

	  if (editModeInput) {
		editModeInput.value = "EDIT";
	  }

	  // ==========================================
	  // 3. Nạp KEY
	  // ==========================================
	  const keyInput =
		document.getElementById("field-key");

	  if (keyInput) {
		keyInput.value = field.key || "";

		// Khi sửa không cho thay đổi key
		keyInput.readOnly = true;
		keyInput.style.background = "#e9ecef";
		keyInput.style.cursor = "not-allowed";
	  }

	  // ==========================================
	  // 4. Nạp LABEL
	  // ==========================================
	  const labelInput =
		document.getElementById("field-label");

	  if (labelInput) {
		labelInput.value = field.label || "";
	  }

	  // ==========================================
	  // 5. Nạp TYPE
	  // ==========================================
	  const typeSelect =
		document.getElementById("field-type");

	  if (typeSelect) {
		typeSelect.value = field.type || "text";
	  }

	  // ==========================================
	  // 6. Nạp trạng thái KPI
	  // ==========================================
	  const isKpiCheckbox =
		document.getElementById("field-is-kpi");

	  if (isKpiCheckbox) {
		isKpiCheckbox.checked = !!field.isKpi;

		// Hiện/ẩn khu vực KPI
		toggleKPISettings(isKpiCheckbox.checked);
	  }

	  // ==========================================
	  // 7. Nạp Score Weight mặc định
	  // ==========================================
	  const scoreWeightInput =
		document.getElementById("field-score-weight");

	  if (scoreWeightInput) {
		scoreWeightInput.value =
		  field.scoreWeight !== undefined &&
		  field.scoreWeight !== null
			? field.scoreWeight
			: -1;
	  }

	  // ==========================================
	  // 8. Nạp KPI Weekly mặc định
	  // ==========================================
	  const kpiWeeklyInput =
		document.getElementById("field-kpi-weekly");

	  if (kpiWeeklyInput) {
		kpiWeeklyInput.value =
		  field.kpiWeekly !== undefined &&
		  field.kpiWeekly !== null
			? field.kpiWeekly
			: 3;
	  }

	  // ==========================================
	  // 9. Nạp KPI Monthly mặc định
	  // ==========================================
	  const kpiMonthlyInput =
		document.getElementById("field-kpi-monthly");

	  if (kpiMonthlyInput) {
		kpiMonthlyInput.value =
		  field.kpiMonthly !== undefined &&
		  field.kpiMonthly !== null
			? field.kpiMonthly
			: 5;
	  }

	  // ==========================================
	  // 10. Nạp OPTIONS
	  // ==========================================
	  const optionsInput =
		document.getElementById("field-options-values");

	  if (optionsInput) {
		if (Array.isArray(field.options)) {
		  optionsInput.value = field.options.join(", ");
		} else {
		  optionsInput.value = "";
		}
	  }

	  // ==========================================
	  // 11. Xử lý hiển thị khu vực OPTIONS
	  // ==========================================
	  const optionsGroup =
		document.getElementById("field-options-group");

	  if (optionsGroup) {
		if (field.type === "options") {
		  optionsGroup.style.display = "block";
		} else {
		  optionsGroup.style.display = "none";
		}
	  }

	  // ==========================================
	  // 12. Tạo lại ma trận KPI OPTIONS
	  // ==========================================
	  const kpiMatrix =
		document.getElementById("kpi-options-rows-wrapper");

	  if (
		field.type === "options" &&
		field.isKpi
	  ) {
		if (kpiMatrix) {
		  kpiMatrix.style.display = "block";
		}

		// field.kpiOptions là dữ liệu đã lưu trên Firestore
		const existingKpiOptions =
		  field.kpiOptions &&
		  typeof field.kpiOptions === "object"
			? field.kpiOptions
			: {};

		console.log(
		  "KPI Options đã lưu:",
		  existingKpiOptions
		);

		// Nạp lại bảng KPI
		generateKpiOptionsRows(
		  existingKpiOptions
		);

	  } else {
		if (kpiMatrix) {
		  kpiMatrix.innerHTML = "";
		}
	  }

	  // ==========================================
	  // 13. Đổi tên nút Submit
	  // ==========================================
	  const submitButton =
		document.getElementById("btn-submit-field");

	  if (submitButton) {
		submitButton.textContent = "Cập nhật trường";
	  }

	  // ==========================================
	  // 14. Hiện nút Hủy sửa
	  // ==========================================
	  const cancelButton =
		document.getElementById(
		  "btn-cancel-edit-field"
		);

	  if (cancelButton) {
		cancelButton.style.display = "inline-block";
	  }

	  // ==========================================
	  // 15. Cuộn lên form
	  // ==========================================
	  const form =
		document.getElementById("form-add-field");

	  if (form) {
		form.scrollIntoView({
		  behavior: "smooth",
		  block: "start"
		});
	  }

	  console.log("=== ĐÃ NẠP DỮ LIỆU SỬA FIELD ===");
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
			if (!user) {
				alert("Vui lòng đăng nhập lại!");
				return;
			}

			// Lấy đúng orgId bằng cách đồng bộ với hàm handleFieldFormSubmit
			const orgId = typeof ensureOrgId === 'function' ? await ensureOrgId() : window.currentOrgIdGlobal;
			if (!orgId) {
				alert("Không tìm thấy thông tin đơn vị (OrgId)! Vui lòng kiểm tra lại phiên đăng nhập.");
				return;
			}

			const db = firebase.firestore();

			// Thực hiện xóa document field trên Firestore đúng đường dẫn tổ chức
			await db.collection("organizations")
					.doc(orgId)
					.collection("fields")
					.doc(key)
					.delete();

			// Cập nhật lại cache trong RAM
			if (typeof cachedSchemaFields !== 'undefined' && Array.isArray(cachedSchemaFields)) {
				cachedSchemaFields = cachedSchemaFields.filter(f => f.key !== key);
				if (typeof renderSchemaFieldsList === 'function') {
					renderSchemaFieldsList(cachedSchemaFields);
				}
			}

			// Cập nhật lại các checkbox của module nếu cần
			if (typeof renderModuleFieldsCheckboxes === 'function') {
				renderModuleFieldsCheckboxes();
			}

			alert("Đã xóa trường thông tin thành công!");

		} catch (error) {
			console.error("Lỗi khi xóa trường:", error);
			if (error.code === 'permission-denied' || error.message.includes("Missing or insufficient permissions")) {
				alert("Lỗi phân quyền: Tài khoản của bạn không có quyền xóa trường này. Vui lòng kiểm tra lại quyền Admin!");
			} else {
				alert("Lỗi khi xóa: " + error.message);
			}
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
		if (typeof XLSX === "undefined") {
			alert("Thư viện Excel (SheetJS) chưa được tải!");
			return;
		}

		/*
		 * ============================================================
		 * MẪU KHAI BÁO TRƯỜNG DỮ LIỆU
		 *
		 * Cấu trúc tương ứng với:
		 * organizations/{orgId}/fields/{fieldKey}
		 *
		 * Đặc biệt:
		 * - options: danh sách lựa chọn
		 * - kpiOptions: cấu hình KPI riêng cho từng option
		 * ============================================================
		 */

		const templateData = [
			{
				"Mã trường (Key)": "loiDiMuon",
				"Tên hiển thị": "Đi muộn",
				"Kiểu dữ liệu (number/text/date/boolean/options)": "number",
				"Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "",
				"Tính KPI (TRUE/FALSE)": "TRUE",
				"Trọng số điểm": -1,
				"Ngưỡng Tuần": 3,
				"Ngưỡng Tháng": 5,
				"Cấu hình KPI từng tùy chọn (JSON)": ""
			},

			{
				"Mã trường (Key)": "mucDoViPham",
				"Tên hiển thị": "Mức độ vi phạm",
				"Kiểu dữ liệu (number/text/date/boolean/options)": "options",
				"Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "5 phút, 10 phút, 15 phút, 30 phút",
				"Tính KPI (TRUE/FALSE)": "TRUE",
				"Trọng số điểm": -1,
				"Ngưỡng Tuần": 3,
				"Ngưỡng Tháng": 5,
				"Cấu hình KPI từng tùy chọn (JSON)": JSON.stringify({
					"5 phút": {
						scoreWeight: -1,
						kpiWeekly: 3,
						kpiMonthly: 5
					},
					"10 phút": {
						scoreWeight: -2,
						kpiWeekly: 2,
						kpiMonthly: 4
					},
					"15 phút": {
						scoreWeight: -3,
						kpiWeekly: 2,
						kpiMonthly: 3
					},
					"30 phút": {
						scoreWeight: -5,
						kpiWeekly: 1,
						kpiMonthly: 2
					}
				})
			},

			{
				"Mã trường (Key)": "nghiPhep",
				"Tên hiển thị": "Nghỉ phép có phép",
				"Kiểu dữ liệu (number/text/date/boolean/options)": "boolean",
				"Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "",
				"Tính KPI (TRUE/FALSE)": "FALSE",
				"Trọng số điểm": 0,
				"Ngưỡng Tuần": 0,
				"Ngưỡng Tháng": 0,
				"Cấu hình KPI từng tùy chọn (JSON)": ""
			},

			{
				"Mã trường (Key)": "ghiChuViPham",
				"Tên hiển thị": "Ghi chú chi tiết",
				"Kiểu dữ liệu (number/text/date/boolean/options)": "text",
				"Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "",
				"Tính KPI (TRUE/FALSE)": "FALSE",
				"Trọng số điểm": 0,
				"Ngưỡng Tuần": 0,
				"Ngưỡng Tháng": 0,
				"Cấu hình KPI từng tùy chọn (JSON)": ""
			},

			{
				"Mã trường (Key)": "ngayCapNhat",
				"Tên hiển thị": "Ngày cập nhật",
				"Kiểu dữ liệu (number/text/date/boolean/options)": "date",
				"Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)": "",
				"Tính KPI (TRUE/FALSE)": "FALSE",
				"Trọng số điểm": 0,
				"Ngưỡng Tuần": 0,
				"Ngưỡng Tháng": 0,
				"Cấu hình KPI từng tùy chọn (JSON)": ""
			}
		];

		const worksheet = XLSX.utils.json_to_sheet(templateData);

		/*
		 * ============================================================
		 * ĐỘ RỘNG CỘT
		 * ============================================================
		 */

		worksheet["!cols"] = [
			{ wch: 24 }, // Mã trường
			{ wch: 28 }, // Tên hiển thị
			{ wch: 48 }, // Kiểu dữ liệu
			{ wch: 55 }, // Danh sách tùy chọn
			{ wch: 22 }, // Tính KPI
			{ wch: 18 }, // Trọng số điểm
			{ wch: 16 }, // Ngưỡng Tuần
			{ wch: 17 }, // Ngưỡng Tháng
			{ wch: 90 }  // KPI Options JSON
		];

		/*
		 * ============================================================
		 * TẠO SHEET HƯỚNG DẪN
		 * ============================================================
		 */

		const guideData = [
			{
				"Trường": "Mã trường (Key)",
				"Hướng dẫn": "Bắt buộc. Dùng làm key và document ID trong organizations/{orgId}/fields/{fieldKey}."
			},
			{
				"Trường": "Tên hiển thị",
				"Hướng dẫn": "Bắt buộc. Tên hiển thị của trường trên giao diện."
			},
			{
				"Trường": "Kiểu dữ liệu",
				"Hướng dẫn": "Các kiểu được hỗ trợ: number, text, date, boolean, options."
			},
			{
				"Trường": "Danh sách tùy chọn",
				"Hướng dẫn": "Chỉ sử dụng khi kiểu dữ liệu là options. Các giá trị cách nhau bằng dấu phẩy."
			},
			{
				"Trường": "Tính KPI",
				"Hướng dẫn": "TRUE nếu trường tham gia tính KPI; FALSE nếu không."
			},
			{
				"Trường": "Trọng số điểm",
				"Hướng dẫn": "scoreWeight chung của trường. Với options, có thể cấu hình riêng cho từng option."
			},
			{
				"Trường": "Ngưỡng Tuần",
				"Hướng dẫn": "kpiWeekly chung của trường. Với options, có thể cấu hình riêng cho từng option."
			},
			{
				"Trường": "Ngưỡng Tháng",
				"Hướng dẫn": "kpiMonthly chung của trường. Với options, có thể cấu hình riêng cho từng option."
			},
			{
				"Trường": "Cấu hình KPI từng tùy chọn (JSON)",
				"Hướng dẫn": "Chỉ dùng cho type=options. Mỗi option có scoreWeight, kpiWeekly và kpiMonthly riêng."
			},
			{
				"Trường": "Ví dụ JSON",
				"Hướng dẫn": '{"5 phút":{"scoreWeight":-1,"kpiWeekly":3,"kpiMonthly":5},"10 phút":{"scoreWeight":-2,"kpiWeekly":2,"kpiMonthly":4}}'
			}
		];

		const guideWorksheet = XLSX.utils.json_to_sheet(guideData);

		guideWorksheet["!cols"] = [
			{ wch: 35 },
			{ wch: 110 }
		];

		/*
		 * ============================================================
		 * TẠO WORKBOOK
		 * ============================================================
		 */

		const workbook = XLSX.utils.book_new();

		XLSX.utils.book_append_sheet(
			workbook,
			worksheet,
			"MauKhaiBaoTruong"
		);

		XLSX.utils.book_append_sheet(
			workbook,
			guideWorksheet,
			"HuongDan"
		);

		/*
		 * ============================================================
		 * XUẤT FILE
		 * ============================================================
		 */

		XLSX.writeFile(
			workbook,
			"Mau_Khai_Bao_Truong_Thong_Tin_Chuan.xlsx"
		);
	}

	// 2. Import danh sách trường thông tin từ file Excel
	async function importSchemaFieldsFromExcel(event) {
		const fileInput = event.target;
		const file = fileInput.files[0];

		if (!file) return;

		if (typeof XLSX === "undefined") {
			alert("Thư viện Excel (SheetJS) chưa được tải!");
			fileInput.value = "";
			return;
		}

		const reader = new FileReader();

		reader.onload = async function (e) {
			try {
				const data = new Uint8Array(e.target.result);

				const workbook = XLSX.read(data, {
					type: "array"
				});

				/*
				 * ============================================================
				 * 1. TÌM SHEET DỮ LIỆU
				 *
				 * Ưu tiên sheet:
				 * MauKhaiBaoTruong
				 *
				 * Không lấy sheet HuongDan.
				 * ============================================================
				 */

				let sheetName = workbook.SheetNames.find(
					name => name === "MauKhaiBaoTruong"
				);

				if (!sheetName) {
					sheetName = workbook.SheetNames[0];
				}

				const worksheet = workbook.Sheets[sheetName];

				if (!worksheet) {
					alert("Không tìm thấy Sheet dữ liệu trong file Excel!");
					fileInput.value = "";
					return;
				}

				const rows = XLSX.utils.sheet_to_json(worksheet, {
					defval: ""
				});

				if (!rows || rows.length === 0) {
					alert("File Excel không có dữ liệu!");
					fileInput.value = "";
					return;
				}

				/*
				 * ============================================================
				 * 2. XÁC ĐỊNH ĐƠN VỊ
				 * ============================================================
				 */

				const user = firebase.auth().currentUser;

				if (!user) {
					alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
					fileInput.value = "";
					return;
				}

				const orgId =
					typeof ensureOrgId === "function"
						? await ensureOrgId()
						: await getCurrentAdminOrgId(user.uid);

				if (!orgId) {
					alert("Không tìm thấy thông tin đơn vị!");
					fileInput.value = "";
					return;
				}

				const db = firebase.firestore();

				/*
				 * ============================================================
				 * 3. CHUẨN BỊ FIRESTORE BATCH
				 * ============================================================
				 */

				let batch = db.batch();

				let batchOperationCount = 0;
				let countSuccess = 0;
				let countSkipped = 0;

				/*
				 * Firestore giới hạn batch 500 operations.
				 *
				 * Dùng mảng các batch để có thể import > 500 trường.
				 */

				const batches = [];

				function getNewBatch() {
					const newBatch = db.batch();

					batches.push({
						batch: newBatch,
						count: 0
					});

					return batches[batches.length - 1];
				}

				let currentBatch = getNewBatch();

				/*
				 * ============================================================
				 * 4. ĐẢM BẢO CACHE TỒN TẠI
				 * ============================================================
				 */

				if (
					typeof window.cachedSchemaFields === "undefined" ||
					!Array.isArray(window.cachedSchemaFields)
				) {
					window.cachedSchemaFields = [];
				}

				/*
				 * ============================================================
				 * 5. HÀM PARSE BOOLEAN
				 * ============================================================
				 */

				function parseBooleanKpi(value) {
					const text = String(value ?? "")
						.trim()
						.toUpperCase();

					return (
						text === "TRUE" ||
						text === "1" ||
						text === "YES"
					);
				}

				/*
				 * ============================================================
				 * 6. HÀM PARSE NUMBER
				 * ============================================================
				 */

				function parseNumber(value, defaultValue = 0) {
					if (
						value === null ||
						value === undefined ||
						String(value).trim() === ""
					) {
						return defaultValue;
					}

					const number = Number(value);

					return Number.isFinite(number)
						? number
						: defaultValue;
				}

				/*
				 * ============================================================
				 * 7. HÀM PARSE INTEGER
				 * ============================================================
				 */

				function parseInteger(value, defaultValue = 0) {
					if (
						value === null ||
						value === undefined ||
						String(value).trim() === ""
					) {
						return defaultValue;
					}

					const number = parseInt(value, 10);

					return Number.isFinite(number)
						? number
						: defaultValue;
				}

				/*
				 * ============================================================
				 * 8. HÀM PARSE KPI OPTIONS JSON
				 *
				 * Hỗ trợ:
				 *
				 * {
				 *   "5 phút": {
				 *      scoreWeight: -1,
				 *      kpiWeekly: 3,
				 *      kpiMonthly: 5
				 *   }
				 * }
				 *
				 * Đồng thời hỗ trợ tên thuộc tính cũ:
				 * weeklyThreshold
				 * monthlyThreshold
				 * ============================================================
				 */

				function parseKpiOptionsJson(rawValue) {
					if (
						rawValue === null ||
						rawValue === undefined ||
						String(rawValue).trim() === ""
					) {
						return {};
					}

					let parsed = rawValue;

					/*
					 * Nếu Excel trả về string JSON thì parse.
					 */

					if (typeof rawValue === "string") {
						try {
							parsed = JSON.parse(rawValue);
						} catch (jsonError) {
							console.warn(
								"Không thể parse KPI Options JSON:",
								rawValue
							);

							return {};
						}
					}

					if (
						!parsed ||
						typeof parsed !== "object" ||
						Array.isArray(parsed)
					) {
						return {};
					}

					const result = {};

					Object.keys(parsed).forEach(optionValue => {
						const config = parsed[optionValue];

						if (
							!config ||
							typeof config !== "object"
						) {
							return;
						}

						/*
						 * Ưu tiên cấu trúc chuẩn hiện tại:
						 *
						 * scoreWeight
						 * kpiWeekly
						 * kpiMonthly
						 *
						 * Nhưng vẫn hỗ trợ cấu trúc cũ:
						 *
						 * weeklyThreshold
						 * monthlyThreshold
						 */

						result[optionValue] = {
							scoreWeight: parseNumber(
								config.scoreWeight,
								0
							),

							kpiWeekly: parseInteger(
								config.kpiWeekly ??
								config.weeklyThreshold,
								0
							),

							kpiMonthly: parseInteger(
								config.kpiMonthly ??
								config.monthlyThreshold,
								0
							)
						};
					});

					return result;
				}

				/*
				 * ============================================================
				 * 9. DUYỆT TỪNG DÒNG EXCEL
				 * ============================================================
				 */

				rows.forEach(row => {

					/*
					 * --------------------------------------------------------
					 * Mã trường
					 * --------------------------------------------------------
					 */

					const key = String(
						row["Mã trường (Key)"] ??
						row["key"] ??
						""
					).trim();

					/*
					 * --------------------------------------------------------
					 * Tên hiển thị
					 * --------------------------------------------------------
					 */

					const label = String(
						row["Tên hiển thị"] ??
						row["label"] ??
						""
					).trim();

					/*
					 * Key và label là bắt buộc.
					 */

					if (!key || !label) {
						countSkipped++;
						return;
					}

					/*
					 * --------------------------------------------------------
					 * Kiểu dữ liệu
					 * --------------------------------------------------------
					 */

					const rawType = String(
						row[
							"Kiểu dữ liệu (number/text/date/boolean/options)"
						] ??
						row[
							"Kiểu dữ liệu (number/text/date)"
						] ??
						row["type"] ??
						"text"
					)
						.trim()
						.toLowerCase();

					const validTypes = [
						"number",
						"text",
						"date",
						"boolean",
						"options"
					];

					const type = validTypes.includes(rawType)
						? rawType
						: "text";

					/*
					 * --------------------------------------------------------
					 * KPI
					 * --------------------------------------------------------
					 */

					const isKpi = parseBooleanKpi(
						row["Tính KPI (TRUE/FALSE)"] ??
						row["isKpi"]
					);

					/*
					 * --------------------------------------------------------
					 * Cấu hình KPI chung
					 * --------------------------------------------------------
					 */

					const importedScoreWeight = parseNumber(
						row["Trọng số điểm"] ??
						row["scoreWeight"],
						0
					);

					const importedKpiWeekly = parseInteger(
						row["Ngưỡng Tuần"] ??
						row["kpiWeekly"],
						0
					);

					const importedKpiMonthly = parseInteger(
						row["Ngưỡng Tháng"] ??
						row["kpiMonthly"],
						0
					);

					/*
					 * Nếu isKpi = false thì các thông số KPI chung = 0.
					 */

					const scoreWeight = isKpi
						? importedScoreWeight
						: 0;

					const kpiWeekly = isKpi
						? importedKpiWeekly
						: 0;

					const kpiMonthly = isKpi
						? importedKpiMonthly
						: 0;

					/*
					 * --------------------------------------------------------
					 * OPTIONS
					 * --------------------------------------------------------
					 */

					let optionsArray = [];
					let kpiOptionsConfig = {};

					if (type === "options") {

						const rawOptionsText = String(
							row[
								"Danh sách tùy chọn (nếu là options, cách nhau bằng dấu phẩy)"
							] ??
							row["options"] ??
							""
						).trim();

						if (rawOptionsText) {
							optionsArray = rawOptionsText
								.split(",")
								.map(item => item.trim())
								.filter(item => item !== "");
						}

						/*
						 * ----------------------------------------------------
						 * Đọc JSON KPI Options từ Excel
						 * ----------------------------------------------------
						 */

						const rawKpiOptionsJson =
							row[
								"Cấu hình KPI từng tùy chọn (JSON)"
							];

						kpiOptionsConfig =
							parseKpiOptionsJson(
								rawKpiOptionsJson
							);

						/*
						 * ----------------------------------------------------
						 * Nếu Excel không có JSON KPI Options,
						 * tạo cấu hình mặc định cho từng option.
						 *
						 * Đây là cơ chế tương thích file Excel cũ.
						 * ----------------------------------------------------
						 */

						optionsArray.forEach(optionValue => {

							if (
								!kpiOptionsConfig[
									optionValue
								]
							) {
								kpiOptionsConfig[
									optionValue
								] = {
									scoreWeight: isKpi
										? scoreWeight
										: 0,

									kpiWeekly: isKpi
										? kpiWeekly
										: 0,

									kpiMonthly: isKpi
										? kpiMonthly
										: 0
								};
							}
						});

						/*
						 * ----------------------------------------------------
						 * Loại bỏ KPI Options không tồn tại trong options.
						 *
						 * Tránh lưu cấu hình thừa.
						 * ----------------------------------------------------
						 */

						const cleanedKpiOptions = {};

						optionsArray.forEach(optionValue => {

							const config =
								kpiOptionsConfig[
									optionValue
								];

							if (!config) {
								return;
							}

							cleanedKpiOptions[
								optionValue
							] = {
								scoreWeight: parseNumber(
									config.scoreWeight,
									0
								),

								kpiWeekly: parseInteger(
									config.kpiWeekly ??
									config.weeklyThreshold,
									0
								),

								kpiMonthly: parseInteger(
									config.kpiMonthly ??
									config.monthlyThreshold,
									0
								)
							};
						});

						kpiOptionsConfig =
							cleanedKpiOptions;
					}

					/*
					 * ========================================================
					 * 10. ĐÓNG GÓI FIELD DATA
					 *
					 * Đây là cấu trúc tương thích với
					 * handleFieldFormSubmit().
					 * ========================================================
					 */

					const fieldData = {
						key: key,
						label: label,
						type: type,
						isKpi: isKpi,

						/*
						 * Với options:
						 * scoreWeight / kpiWeekly / kpiMonthly
						 * vẫn lưu cấu hình chung.
						 *
						 * Cấu hình riêng của option nằm trong kpiOptions.
						 */

						scoreWeight: scoreWeight,
						kpiWeekly: kpiWeekly,
						kpiMonthly: kpiMonthly,

						options: optionsArray,

						kpiOptions: kpiOptionsConfig,

						updatedAt: getVietnamTimestamp()
					};

					/*
					 * ========================================================
					 * 11. THÊM VÀO FIRESTORE BATCH
					 * ========================================================
					 */

					const docRef = db
						.collection("organizations")
						.doc(orgId)
						.collection("fields")
						.doc(key);

					/*
					 * Nếu batch hiện tại đủ 500 operation,
					 * tạo batch mới.
					 */

					if (currentBatch.count >= 500) {
						currentBatch = getNewBatch();
					}

					currentBatch.batch.set(
						docRef,
						fieldData,
						{
							merge: true
						}
					);

					currentBatch.count++;

					countSuccess++;

					/*
					 * ========================================================
					 * 12. CẬP NHẬT CACHE RAM
					 * ========================================================
					 */

					const existingIndex =
						window.cachedSchemaFields.findIndex(
							f => f.key === key
						);

					if (existingIndex !== -1) {

						window.cachedSchemaFields[
							existingIndex
						] = fieldData;

					} else {

						window.cachedSchemaFields.push(
							fieldData
						);
					}
				});

				/*
				 * ============================================================
				 * 13. KHÔNG CÓ DÒNG HỢP LỆ
				 * ============================================================
				 */

				if (countSuccess === 0) {

					alert(
						"Không tìm thấy dữ liệu hợp lệ trong file Excel. " +
						"Vui lòng kiểm tra lại file mẫu!"
					);

					fileInput.value = "";
					return;
				}

				/*
				 * ============================================================
				 * 14. COMMIT TẤT CẢ BATCH
				 * ============================================================
				 */

				await Promise.all(
					batches
						.filter(item => item.count > 0)
						.map(item =>
							item.batch.commit()
						)
				);

				/*
				 * ============================================================
				 * 15. RENDER LẠI DANH SÁCH TRƯỜNG
				 * ============================================================
				 */

				if (
					typeof renderSchemaFieldsList ===
					"function"
				) {
					renderSchemaFieldsList(
						window.cachedSchemaFields
					);
				}

				/*
				 * Cập nhật checkbox module nếu hàm tồn tại.
				 */

				if (
					typeof renderModuleFieldsCheckboxes ===
					"function"
				) {
					renderModuleFieldsCheckboxes();
				}

				/*
				 * ============================================================
				 * 16. THÔNG BÁO
				 * ============================================================
				 */

				let message =
					`Đã import thành công ${countSuccess} trường thông tin từ Excel!`;

				if (countSkipped > 0) {
					message +=
						`\nBỏ qua ${countSkipped} dòng không hợp lệ.`;
				}

				alert(message);

			} catch (error) {

				console.error(
					"Lỗi khi import Excel:",
					error
				);

				alert(
					"Lỗi khi đọc file Excel: " +
					error.message
				);

			} finally {

				/*
				 * Reset input để có thể chọn lại cùng một file.
				 */

				fileInput.value = "";
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
			container.innerHTML =
				'<i style="color: #6c757d; font-size: 0.9em;">Chưa có trường thông tin nào được tạo ở Thẻ 3.</i>';
			return;
		}

		let html = "";

		cachedSchemaFields.forEach(field => {

			const isChecked =
				selectedFieldKeys.includes(field.key)
					? "checked"
					: "";

			const badgeType =
				field.type
					? `(${field.type})`
					: "";

			const kpiIcon =
				field.isKpi
					? '<span style="color: #fd7e14; font-size: 0.8em;" title="Có tính KPI">⭐</span>'
					: "";

			/*
			 * Chuyển toàn bộ object field thành JSON
			 * để gắn vào checkbox.
			 */
			const fieldJsonStr =
				JSON.stringify(field)
					.replace(/"/g, "&quot;");

			html += `
				<label
					class="module-field-item"
					style="
						display: flex;
						width: 100%;
						max-width: 100%;
						box-sizing: border-box;
						align-items: center;
						justify-content: space-between;
						gap: 8px;
						padding: 5px 6px;
						margin: 0 0 3px 0;
						cursor: pointer;
						border-radius: 4px;
						transition: background 0.2s;
					"
					onmouseover="this.style.background='#f8f9fa'"
					onmouseout="this.style.background='transparent'"
				>

					<div
						style="
							display: flex;
							align-items: center;
							flex: 1 1 auto;
							min-width: 0;
							width: 100%;
							overflow: hidden;
						"
					>

						<input
							type="checkbox"
							name="module_field_chk"
							value="${field.key}"
							data-field-obj="${fieldJsonStr}"
							${isChecked}
							style="
								flex: 0 0 auto;
								margin-right: 8px;
							"
						>

						<span
							style="
								font-weight: 500;
								color: #333;
								margin-right: 4px;
								overflow: hidden;
								text-overflow: ellipsis;
								
							"
							title="${field.label || ""}"
						>
							${field.label || ""}
						</span>

						<span
							style="
								color: #888;
								font-size: 0.8em;
								margin-right: 4px;
								flex: 0 0 auto;
								
							"
						>
							[${field.key || ""}]
						</span>

						${kpiIcon}

					</div>

					<span
						style="
							font-size: 0.75em;
							background: #e9ecef;
							color: #495057;
							padding: 1px 5px;
							border-radius: 3px;
							flex: 0 0 auto;
							white-space: nowrap;
						"
					>
						${badgeType}
					</span>

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
	  console.log("=== EDIT MODULE ===");
	  console.log("Module ID:", modId);

	  // ==========================================
	  // 1. Tìm bài toán trong cache
	  // ==========================================
	  const mod = cachedModulesList.find(
		m => m.id === modId
	  );

	  if (!mod) {
		console.error("Không tìm thấy bài toán:", modId);
		alert("Không tìm thấy bài toán module cần sửa!");
		return;
	  }

	  console.log("Module tìm được:", mod);

	  // ==========================================
	  // 2. Chuyển form sang chế độ EDIT
	  // ==========================================
	  const modeInput =
		document.getElementById("module-edit-mode");

	  if (modeInput) {
		modeInput.value = "EDIT";
	  }

	  // ==========================================
	  // 3. Nạp MÃ BÀI TOÁN
	  // ==========================================
	  const idInput =
		document.getElementById("mod-id");

	  if (idInput) {
		idInput.value = mod.id || "";

		// Không cho sửa mã bài toán khi đang EDIT
		idInput.disabled = true;
	  }

	  // ==========================================
	  // 4. Nạp TÊN BÀI TOÁN
	  // ==========================================
	  const nameInput =
		document.getElementById("mod-name");

	  if (nameInput) {
		nameInput.value = mod.name || "";
	  }

	  // ==========================================
	  // 5. Nạp ĐỐI TƯỢNG
	  // ==========================================
	  const targetTypeSelect =
		document.getElementById("mod-target-type");

	  if (targetTypeSelect) {
		targetTypeSelect.value =
		  mod.targetType || "STUDENT";
	  }

	  // ==========================================
	  // 6. LẤY DANH SÁCH KEY CÁC TRƯỜNG ĐÃ LƯU
	  // ==========================================
	  //
	  // mod.fields hiện đang được lưu dạng:
	  //
	  // [
	  //   {
	  //     key: "ho_ten",
	  //     label: "Họ và tên",
	  //     type: "text",
	  //     ...
	  //   },
	  //   {
	  //     key: "lop",
	  //     label: "Lớp",
	  //     type: "options",
	  //     ...
	  //   }
	  // ]
	  //
	  // Nhưng renderModuleFieldsCheckboxes()
	  // cần mảng:
	  //
	  // ["ho_ten", "lop"]
	  //
	  // ==========================================

	  let selectedFieldKeys = [];

	  if (Array.isArray(mod.fields)) {

		selectedFieldKeys = mod.fields
		  .map(field => {

			// Trường hợp field được lưu dạng object
			if (
			  field &&
			  typeof field === "object"
			) {
			  return field.key || null;
			}

			// Trường hợp dữ liệu cũ chỉ lưu key dạng string
			if (typeof field === "string") {
			  return field;
			}

			return null;
		  })
		  .filter(key => key);

	  }

	  console.log(
		"Các field đã lưu của module:",
		selectedFieldKeys
	  );

	  // ==========================================
	  // 7. RENDER TOÀN BỘ DANH SÁCH FIELD
	  // ==========================================
	  //
	  // Đây là điểm quan trọng:
	  //
	  // KHÔNG chỉ render các field đã chọn.
	  //
	  // Phải render toàn bộ cachedSchemaFields.
	  //
	  // Các field đã có trong module -> được CHECKED
	  // Các field chưa có -> để trống
	  //
	  // Admin có thể:
	  // + Tích thêm field
	  // + Bỏ tích field cũ
	  // + Giữ nguyên field đang có
	  //
	  // ==========================================

	  if (
		typeof renderModuleFieldsCheckboxes ===
		"function"
	  ) {
		renderModuleFieldsCheckboxes(
		  selectedFieldKeys
		);
	  }

	  // ==========================================
	  // 8. Đổi tên nút SUBMIT
	  // ==========================================
	  const btnSubmit =
		document.getElementById(
		  "btn-submit-module"
		);

	  if (btnSubmit) {
		btnSubmit.textContent =
		  "Cập nhật Bài toán Module";
	  }

	  // ==========================================
	  // 9. Hiện nút HỦY SỬA
	  // ==========================================
	  const btnCancel =
		document.getElementById(
		  "btn-cancel-edit-module"
		);

	  if (btnCancel) {
		btnCancel.style.display =
		  "inline-block";
	  }

	  // ==========================================
	  // 10. Cuộn lên form
	  // ==========================================
	  const formElem =
		document.getElementById(
		  "form-create-module"
		);

	  if (formElem) {
		formElem.scrollIntoView({
		  behavior: "smooth",
		  block: "start"
		});
	  }

	  console.log(
		"=== ĐÃ NẠP MODULE VÀO FORM ==="
	  );
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
async function loadCard3StaffMembers(forceRefresh = false) {
    const container = document.getElementById("card3-members-checkbox-container");
    const summary = document.getElementById("card3-selected-summary");

    if (!container) return;

    try {
        container.innerHTML = `
            <div style="padding: 10px; text-align: center; color: #6c757d;">
                <i>Đang tải danh sách nhân sự...</i>
            </div>
        `;

        // --------------------------------------------------------
        // 1. Dùng chung cache nhân sự của Thẻ 2
        // --------------------------------------------------------
        window.card2CachedMembers = window.card2CachedMembers || [];

        // Nếu chưa có cache hoặc người dùng yêu cầu làm mới,
        // gọi đúng hàm nạp dữ liệu của Thẻ 2.
        if (
            forceRefresh ||
            !Array.isArray(window.card2CachedMembers) ||
            window.card2CachedMembers.length === 0
        ) {
            if (typeof loadCard2MembersData === "function") {
                await loadCard2MembersData(forceRefresh);
            }
        }

        const members = Array.isArray(window.card2CachedMembers)
            ? window.card2CachedMembers
            : [];

        // --------------------------------------------------------
        // 2. Lọc nhân sự phù hợp cho Thẻ 3
        //    Giữ logic giống Thẻ 2:
        //    - Không lấy ADMIN
        //    - Không lấy STUDENT / HỌC SINH
        // --------------------------------------------------------
        const staffMembers = members
            .filter(member => {
                const role = String(member.role || "").trim().toUpperCase();
                const category = String(member.category || "").trim().toUpperCase();

                if (role === "ADMIN") return false;
                if (role === "STUDENT") return false;
                if (category === "HỌC SINH") return false;

                return true;
            })
            .map(member => {
                const code = String(
                    member.code ||
                    member.memberId ||
                    member.id ||
                    member.docId ||
                    ""
                ).trim();

                const uid = String(
                    member.uid ||
                    member.docId ||
                    member.id ||
                    ""
                ).trim();

                return {
                    ...member,
                    id: code || uid,
                    code: code,
                    uid: uid,
                    docId: member.docId || member.id || ""
                };
            })
            .filter(member => member.id);

        // --------------------------------------------------------
        // 3. Không có nhân sự
        // --------------------------------------------------------
        if (staffMembers.length === 0) {
            container.innerHTML = `
                <div style="padding: 12px; text-align: center; color: #6c757d; font-style: italic;">
                    Không tìm thấy nhân sự phù hợp.
                </div>
            `;

            if (summary) {
                summary.textContent = "Đã chọn: 0 nhân sự";
            }

            return;
        }

        // --------------------------------------------------------
        // 4. Lưu cache dùng riêng cho Thẻ 3 nhưng lấy nguồn từ
        //    cache chung của Thẻ 2.
        // --------------------------------------------------------
        window.card3CachedMembers = staffMembers;

        // --------------------------------------------------------
        // 5. Render checkbox nhân sự
        // --------------------------------------------------------
        renderCard3StaffCheckboxes(staffMembers);

        // Cập nhật số lượng đã chọn sau khi render
        if (typeof updateCard3SelectedMembersSummary === "function") {
            updateCard3SelectedMembersSummary();
        } else if (summary) {
            summary.textContent = "Đã chọn: 0 nhân sự";
        }

    } catch (error) {
        console.error("Lỗi tải nhân sự cho Thẻ 3:", error);

        container.innerHTML = `
            <div style="padding: 12px; text-align: center; color: #dc3545;">
                Không thể tải danh sách nhân sự.
            </div>
        `;

        if (summary) {
            summary.textContent = "Đã chọn: 0 nhân sự";
        }
    }
}

// ============================================================
// 3.2. RENDER CHECKBOX NHÂN SỰ
// ============================================================
function renderCard3StaffCheckboxes(membersToRender = null) {
    const container = document.getElementById("card3-members-checkbox-container");
    if (!container) return;

    const members = Array.isArray(membersToRender)
        ? membersToRender
        : (Array.isArray(window.card3CachedMembers)
            ? window.card3CachedMembers
            : []);

    if (members.length === 0) {
        container.innerHTML = `
            <div style="padding: 10px; text-align: center; color: #6c757d;">
                Không có nhân sự để hiển thị.
            </div>
        `;
        return;
    }

    const html = members
        .slice()
        .sort((a, b) =>
            String(a.fullName || a.displayName || a.name || "")
                .localeCompare(
                    String(b.fullName || b.displayName || b.name || ""),
                    "vi"
                )
        )
        .map(member => {
            const code = String(
                member.code ||
                member.memberId ||
                member.id ||
                member.docId ||
                ""
            ).trim();

            const uid = String(
                member.uid ||
                member.docId ||
                ""
            ).trim();

            const fullName = String(
                member.fullName ||
                member.displayName ||
                member.name ||
                "Chưa có tên"
            ).trim();

            const email = String(member.email || "").trim();
            const category = String(
                member.category ||
                member.homeroom ||
                member.department ||
                ""
            ).trim();

            return `
                <label
                    class="card3-member-item"
                    data-member-code="${escapeHtmlCard3(code)}"
                    data-member-name="${escapeHtmlCard3(fullName)}"
                    data-member-email="${escapeHtmlCard3(email)}"
                    style="
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        padding: 8px;
                        margin-bottom: 4px;
                        border-radius: 4px;
                        cursor: pointer;
                        border-bottom: 1px solid #f1f1f1;
                    "
                    onmouseover="this.style.background='#f8f9fa'"
                    onmouseout="this.style.background='transparent'"
                >
                    <input
                        type="checkbox"
                        name="chk_assign_member"
                        value="${escapeHtmlCard3(code)}"
                        data-member-code="${escapeHtmlCard3(code)}"
                        data-member-uid="${escapeHtmlCard3(uid)}"
                        data-member-email="${escapeHtmlCard3(email)}"
                        data-member-name="${escapeHtmlCard3(fullName)}"
                        onchange="updateCard3SelectedMembersSummary()"
                        style="margin-top: 3px;"
                    >

                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #212529;">
                            ${escapeHtmlCard3(fullName)}
                        </div>

                        <div style="font-size: 0.85em; color: #6c757d; margin-top: 2px;">
                            <span>Mã: <b>${escapeHtmlCard3(code || "—")}</b></span>
                            ${email
                                ? `<span style="margin-left: 12px;">Email: ${escapeHtmlCard3(email)}</span>`
                                : ""}
                            ${category
                                ? `<span style="margin-left: 12px;">Tổ/Lớp: ${escapeHtmlCard3(category)}</span>`
                                : ""}
                        </div>
                    </div>
                </label>
            `;
        })
        .join("");

    container.innerHTML = html;
}

// ============================================================
// 3.3. HÀM ESCAPE HTML AN TOÀN
// ============================================================
function escapeHtmlCard3(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// 3.4. CẬP NHẬT SỐ LƯỢNG NHÂN SỰ ĐÃ CHỌN
// ============================================================
function updateCard3SelectedMembersSummary() {
    const summary = document.getElementById("card3-selected-summary");
    const container = document.getElementById("card3-members-checkbox-container");

    if (!container) return;

    const checked = container.querySelectorAll(
        'input[name="chk_assign_member"]:checked'
    );

    if (summary) {
        summary.textContent = `Đã chọn: ${checked.length} nhân sự`;
    }
}


	// Hàm phụ trợ đổ dữ liệu tổ chuyên môn vào ô select của Thẻ 3
	function populateCard3Categories(teacherList, categorySelect) {
		if (!categorySelect) return;

		const categoriesSet = new Set();
		teacherList.forEach(staff => {
			const cat = String(staff.category || staff.organizationUnit || "").trim();
			if (cat) {
				categoriesSet.add(cat);
			}
		});

		let catHtml = '<option value="">-- Tất cả Tổ/Đơn vị --</option>';
		Array.from(categoriesSet).sort().forEach(cat => {
			catHtml += `<option value="${cat}">${cat}</option>`;
		});
		categorySelect.innerHTML = catHtml;
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

// ============================================================
// 3.5. TÌM NHÂN SỰ THEO HỌ TÊN / EMAIL / MÃ ĐỊNH DANH
// ============================================================
function filterCard3MembersByKeyword() {
    const input = document.getElementById("card3-member-search");
    const container = document.getElementById("card3-members-checkbox-container");

    if (!input || !container) return;

    const keyword = String(input.value || "")
        .trim()
        .toLowerCase();

    const items = container.querySelectorAll(".card3-member-item");

    items.forEach(item => {
        const name = String(item.dataset.memberName || "").toLowerCase();
        const email = String(item.dataset.memberEmail || "").toLowerCase();
        const code = String(item.dataset.memberCode || "").toLowerCase();

        const matched =
            !keyword ||
            name.includes(keyword) ||
            email.includes(keyword) ||
            code.includes(keyword);

        item.style.display = matched ? "flex" : "none";
    });
}

// ============================================================
// 3.6. CHỌN TẤT CẢ / BỎ CHỌN TẤT CẢ NHÂN SỰ
// ============================================================
function selectAllCard3Members(selectAll = true) {
    const container = document.getElementById("card3-members-checkbox-container");
    if (!container) return;

    const checkboxes = container.querySelectorAll(
        'input[name="chk_assign_member"]'
    );

    checkboxes.forEach(checkbox => {
        checkbox.checked = !!selectAll;
    });

    updateCard3SelectedMembersSummary();
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
		<div>
		  <label class="assign-mod-item" style="display: flex; align-items: center; padding: 4px 6px; margin-bottom: 2px; cursor: pointer; border-radius: 3px;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">
			<input type="checkbox" name="chk_assign_module" value="${mod.id}" ${isChecked} style="margin-right: 8px;">
			  <span style="font-weight: 500; color: #333;">${mod.name || mod.id}</span>
			  <small style="color: #666; margin-left: 6px;">[${mod.id}]</small>
		  </label>
		</div>
		`;
		selectHtml += `<option value="${mod.id}">${mod.name || mod.id} [${mod.id}]</option>`;
	  });

	  container.innerHTML = chkHtml;
	  if (filterSelect) filterSelect.innerHTML = selectHtml;
	}
	
	function filterAssignModulesCheckboxes() {
		const input = document.getElementById("assign-mod-search-input");
		const container = document.getElementById("assign-modules-checkboxes");

		if (!input || !container) return;

		const normalizeText = value =>
			String(value || "")
				.trim()
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "");

		const keyword = normalizeText(input.value);
		const items = Array.from(container.children);

		let visibleCount = 0;

		items.forEach(item => {
			const checkbox = item.querySelector('input[type="checkbox"]');

			// Bỏ qua dòng "Đang tải..." / "Chưa có dữ liệu..."
			if (!checkbox) {
				item.style.display = keyword ? "none" : "";
				return;
			}

			// Nếu renderAssignModulesCheckboxes() có gắn data-* thì ưu tiên dùng.
			const code =
				checkbox.dataset.moduleCode ||
				checkbox.dataset.code ||
				item.dataset.moduleCode ||
				item.dataset.code ||
				"";

			const name =
				checkbox.dataset.moduleName ||
				checkbox.dataset.name ||
				item.dataset.moduleName ||
				item.dataset.name ||
				"";

			// Fallback: tìm trên toàn bộ nội dung hiển thị của module.
			const searchText = normalizeText(
				`${code} ${name} ${item.textContent || ""}`
			);

			const matched = !keyword || searchText.includes(keyword);

			item.style.display = matched ? "" : "none";

			if (matched) visibleCount++;
		});

		// Không bắt buộc phải có phần tử này.
		const countElement = document.getElementById("assign-mod-search-count");

		if (countElement) {
			countElement.textContent = keyword
				? `Hiển thị ${visibleCount} module`
				: "";
		}
	}

	window.filterAssignModulesCheckboxes = filterAssignModulesCheckboxes;

	//===========================
	//	LƯU PHÂN CÔNG NHIỆM VỤ
	//===========================
document.getElementById("form-assign-permission").addEventListener("submit", async function(event) {
    event.preventDefault();

    // =========================================================
    // 1. LẤY NHIỀU NHÂN SỰ ĐƯỢC CHỌN
    //    Logic mới: 1 Module -> nhiều nhân sự
    // =========================================================
    const selectedStaffCheckboxes = document.querySelectorAll(
        "#card3-members-checkbox-container input[type='checkbox']:checked"
    );

    if (!selectedStaffCheckboxes.length) {
        alert("Vui lòng chọn ít nhất một nhân sự/giáo viên cần phân công!");
        return;
    }

    // =========================================================
    // 2. LẤY CÁC MODULE ĐƯỢC CHỌN
    // =========================================================
    const selectedModules = [];

    const moduleCheckboxes = document.querySelectorAll(
        "#assign-modules-checkboxes input[name='chk_assign_module']:checked"
    );

    moduleCheckboxes.forEach(chk => {
        const moduleId = String(chk.value || "").trim();
        if (moduleId && !selectedModules.includes(moduleId)) {
            selectedModules.push(moduleId);
        }
    });

    if (!selectedModules.length) {
        alert("Vui lòng tích chọn ít nhất một Bài toán Module cấp quyền!");
        return;
    }

    // =========================================================
    // 3. CHUẨN HÓA THÔNG TIN NHÂN SỰ
    // =========================================================
    const selectedStaff = [];

    selectedStaffCheckboxes.forEach(chk => {
        const memberId = String(
            chk.getAttribute("data-member-code") ||
            chk.getAttribute("data-code") ||
            chk.getAttribute("data-member-id") ||
            chk.value ||
            ""
        ).trim();

        const fullName = String(
            chk.getAttribute("data-member-name") ||
            chk.getAttribute("data-name") ||
            ""
        ).trim();

        const email = String(
            chk.getAttribute("data-member-email") ||
            chk.getAttribute("data-email") ||
            ""
        ).trim().toLowerCase();

        const role = String(
            chk.getAttribute("data-role") ||
            ""
        ).trim();

        const uid = String(
            chk.getAttribute("data-member-uid") ||
            chk.getAttribute("data-uid") ||
            chk.getAttribute("data-user-uid") ||
            ""
        ).trim();

        if (!memberId && !email) return;

        selectedStaff.push({
            memberId,
            fullName,
            email,
            role,
            uid
        });
    });

    if (!selectedStaff.length) {
        alert("Không lấy được thông tin nhân sự đã chọn. Vui lòng kiểm tra lại danh sách nhân sự.");
        return;
    }

    // Kiểm tra email vì cấu trúc assignments hiện tại dùng email làm document ID.
    const staffWithoutEmail = selectedStaff.filter(item => !item.email);

    if (staffWithoutEmail.length) {
        const names = staffWithoutEmail
            .map(item => item.fullName || item.memberId || "Nhân sự không xác định")
            .join(", ");

        alert(
            "Các nhân sự sau chưa có email nên không thể lưu theo cấu trúc phân công hiện tại:\n\n" +
            names
        );
        return;
    }

    const msgElem = document.getElementById("assign-msg");

    if (msgElem) {
        msgElem.style.color = "blue";
        msgElem.textContent =
            `Đang lưu ${selectedModules.length} module cho ${selectedStaff.length} nhân sự...`;
    }

    try {
        // =====================================================
        // 4. KIỂM TRA ĐĂNG NHẬP
        // =====================================================
        const user = firebase.auth().currentUser;

        if (!user) {
            alert("Vui lòng đăng nhập lại!");
            return;
        }

        // =====================================================
        // 5. LẤY ORG ID
        // =====================================================
        const orgId =
            window.currentOrgIdGlobal ||
            (
                typeof getCurrentAdminOrgId === "function"
                    ? await getCurrentAdminOrgId(user.uid)
                    : null
            );

        if (!orgId) {
            alert("Không tìm thấy thông tin đơn vị (OrgId)! Vui lòng kiểm tra lại phiên đăng nhập.");

            if (msgElem) {
                msgElem.style.color = "red";
                msgElem.textContent = "Lỗi: Không tìm thấy thông tin đơn vị.";
            }

            return;
        }

        // =====================================================
        // 6. LẤY NĂM HỌC
        // =====================================================
        let academicYearId =
            window.currentAcademicYear ||
            window.currentAcademicYearIdGlobal ||
            "";

        if (typeof academicYearId === "object" && academicYearId !== null) {
            academicYearId =
                academicYearId.id ||
                academicYearId.name ||
                academicYearId.year ||
                "";
        }

        if (!academicYearId) {
            const yearsArr = window.currentAcademicYearsGlobal;

            if (Array.isArray(yearsArr) && yearsArr.length > 0) {
                const lastYearItem = yearsArr[yearsArr.length - 1];

                academicYearId =
                    typeof lastYearItem === "object" && lastYearItem !== null
                        ? (
                            lastYearItem.id ||
                            lastYearItem.name ||
                            lastYearItem.year ||
                            ""
                        )
                        : lastYearItem;
            }
        }

        academicYearId = String(academicYearId || "").trim();

        if (!academicYearId) {
            alert("Không xác định được năm học hiện tại!");
            return;
        }

        // =====================================================
        // 7. GHI PHÂN CÔNG CHO TỪNG NHÂN SỰ
        //
        // Một người có thể nhận nhiều module.
        // Nhiều người có thể cùng nhận một module.
        //
        // Giữ nguyên cấu trúc dữ liệu cũ:
        // assignments/{email}
        // {
        //    email,
        //    memberId,
        //    fullName,
        //    role,
        //    modules: [...]
        // }
        // =====================================================
        const db = firebase.firestore();

        const assignmentsRef = db
            .collection("organizations")
            .doc(orgId)
            .collection("academicYears")
            .doc(academicYearId)
            .collection("assignments");

        let successCount = 0;
        const failedStaff = [];

        for (const staff of selectedStaff) {
            try {
                const teacherEmail = String(staff.email || "").trim().toLowerCase();

                if (!teacherEmail) {
                    failedStaff.push({
                        name: staff.fullName || staff.memberId,
                        error: "Thiếu email"
                    });
                    continue;
                }

                // Đọc phân công hiện tại của nhân sự.
                // Mục tiêu: BỔ SUNG module mới, tuyệt đối không xóa module cũ.
                const assignmentRef = assignmentsRef.doc(teacherEmail);
                const existingSnap = await assignmentRef.get();

                const existingData = existingSnap.exists
                    ? (existingSnap.data() || {})
                    : {};

                const oldModules = Array.isArray(existingData.modules)
                    ? existingData.modules.map(id => String(id || "").trim()).filter(Boolean)
                    : [];

                // Hợp nhất Module cũ + Module mới, đồng thời loại bỏ trùng.
                const mergedModules = [
                    ...new Set([
                        ...oldModules,
                        ...selectedModules
                    ])
                ];

                await assignmentRef.set({
                    email: teacherEmail,

                    // Ưu tiên mã định danh làm memberId.
                    // UID chỉ lưu dự phòng cho dữ liệu mới.
                    memberId:
                        staff.memberId ||
                        existingData.memberId ||
                        staff.uid ||
                        existingData.uid ||
                        "",

                    uid:
                        staff.uid ||
                        existingData.uid ||
                        "",

                    fullName:
                        staff.fullName ||
                        existingData.fullName ||
                        "",

                    role:
                        staff.role ||
                        existingData.role ||
                        "TEACHER",

                    // QUAN TRỌNG:
                    // Không thay thế danh sách Module cũ.
                    // Chỉ bổ sung các Module mới được chọn.
                    modules: mergedModules,

                    updatedAt: (
                        typeof getVietnamTimestamp === "function"
                            ? getVietnamTimestamp()
                            : new Date().toISOString()
                    )
                }, {
                    merge: true
                });

                successCount++;

            } catch (staffError) {
                console.error(
                    "Lỗi lưu phân công cho nhân sự:",
                    staff,
                    staffError
                );

                failedStaff.push({
                    name: staff.fullName || staff.memberId || staff.email,
                    error: staffError.message || "Lỗi không xác định"
                });
            }
        }

        // =====================================================
        // 8. THÔNG BÁO KẾT QUẢ
        // =====================================================
        if (failedStaff.length === 0) {
            if (msgElem) {
                msgElem.style.color = "green";
                msgElem.textContent =
                    `Phân công thành công ${selectedModules.length} module cho ${successCount} nhân sự.`;
            }
        } else if (successCount > 0) {
            const failedNames = failedStaff
                .map(item => item.name)
                .join(", ");

            if (msgElem) {
                msgElem.style.color = "#b26a00";
                msgElem.textContent =
                    `Đã lưu ${successCount} nhân sự, nhưng có ${failedStaff.length} nhân sự lỗi: ${failedNames}`;
            }
        } else {
            if (msgElem) {
                msgElem.style.color = "red";
                msgElem.textContent =
                    "Không lưu được phân công cho nhân sự nào.";
            }
        }

        // =====================================================
        // 9. CẬP NHẬT CACHE PHÂN CÔNG NẾU ĐANG CÓ
        // =====================================================
        if (typeof window.allAssignmentsCache === "object" &&
            window.allAssignmentsCache !== null) {

            for (const staff of selectedStaff) {
                const teacherEmail = String(staff.email || "").trim().toLowerCase();

                if (!teacherEmail) continue;

                window.allAssignmentsCache[teacherEmail] = {
                    ...(window.allAssignmentsCache[teacherEmail] || {}),
                    email: teacherEmail,
                    memberId: staff.memberId || staff.uid || "",
                    uid: staff.uid || "",
                    fullName: staff.fullName || "",
                    role: staff.role || "TEACHER",
                    modules: (() => {
                        const cachedOldModules =
                            Array.isArray(window.allAssignmentsCache[teacherEmail]?.modules)
                                ? window.allAssignmentsCache[teacherEmail].modules
                                : [];

                        return [
                            ...new Set([
                                ...cachedOldModules,
                                ...selectedModules
                            ])
                        ];
                    })(),
                    updatedAt: (
                        typeof getVietnamTimestamp === "function"
                            ? getVietnamTimestamp()
                            : new Date().toISOString()
                    )
                };
            }
        }

        // =====================================================
        // 10. TẢI LẠI BẢNG RÀ SOÁT
        // =====================================================
        if (typeof loadAssignedUsersListByModule === "function") {
            await loadAssignedUsersListByModule();
        }

    } catch (error) {
        console.error("Lỗi lưu phân công:", error);

        if (msgElem) {
            msgElem.style.color = "red";

            if (
                error.code === "permission-denied" ||
                String(error.message || "").includes("Missing or insufficient permissions")
            ) {
                msgElem.textContent =
                    "Lỗi phân quyền: Tài khoản của bạn không đủ quyền Admin để thực hiện thao tác này.";
            } else {
                msgElem.textContent = "Lỗi: " + (error.message || error);
            }
        }
    }
});

// ============================================================
// LỌC BẢNG RÀ SOÁT PHÂN CÔNG THEO HỌ TÊN + TỔ/LỚP
// Dùng cùng HTML:
//   #assigned-users-search-name
//   #assigned-users-search-category
//   #assigned-users-filter-count
// ============================================================
function filterAssignedUsersTable() {
    const nameInput = document.getElementById("assigned-users-search-name");
    const categoryInput = document.getElementById("assigned-users-search-category");
    const tableBody = document.getElementById("assigned-users-table-body");
    const countElem = document.getElementById("assigned-users-filter-count");

    if (!tableBody) return;

    const nameKeyword = String(nameInput?.value || "")
        .trim()
        .toLowerCase();

    const categoryKeyword = String(categoryInput?.value || "")
        .trim()
        .toLowerCase();

    const rows = Array.from(tableBody.querySelectorAll("tr"));

    let visibleCount = 0;
    let totalDataRows = 0;

    rows.forEach(row => {
        const cells = row.querySelectorAll("td");

        // Bỏ qua dòng thông báo "Đang tải...", "Không có dữ liệu..."...
        if (cells.length < 3) {
            return;
        }

        totalDataRows++;

        const fullName = String(cells[0].textContent || "")
            .trim()
            .toLowerCase();

        const category = String(cells[1].textContent || "")
            .trim()
            .toLowerCase();

        const matchName =
            !nameKeyword ||
            fullName.includes(nameKeyword);

        const matchCategory =
            !categoryKeyword ||
            category.includes(categoryKeyword);

        const visible = matchName && matchCategory;

        row.style.display = visible ? "" : "none";

        if (visible) {
            visibleCount++;
        }
    });

    if (countElem) {
        if (!nameKeyword && !categoryKeyword) {
            countElem.textContent =
                totalDataRows > 0
                    ? `Tổng: ${totalDataRows} người`
                    : "";
        } else {
            countElem.textContent =
                `Hiển thị: ${visibleCount}/${totalDataRows} người`;
        }
    }
}


// ============================================================
// HỖ TRỢ: XÓA BỘ LỌC TÌM KIẾM
// Có thể gọi từ nút khác nếu cần.
// ============================================================
function clearAssignedUsersTableFilters() {
    const nameInput = document.getElementById("assigned-users-search-name");
    const categoryInput = document.getElementById("assigned-users-search-category");

    if (nameInput) nameInput.value = "";
    if (categoryInput) categoryInput.value = "";

    filterAssignedUsersTable();
}


// ============================================================
// QUAN TRỌNG:
// Sau khi loadAssignedUsersListByModule() render lại tbody,
// tự áp dụng lại bộ lọc hiện tại.
// ============================================================
function wrapLoadAssignedUsersListByModuleForFilter() {
    if (typeof window === "undefined") return;

    const originalLoad =
        window.loadAssignedUsersListByModule;

    if (typeof originalLoad !== "function") {
        return;
    }

    // Tránh bọc hàm nhiều lần.
    if (originalLoad.__assignedUsersFilterWrapped) {
        return;
    }

    async function wrappedLoadAssignedUsersListByFilter(...args) {
        const result = await originalLoad.apply(this, args);

        // Cho DOM hoàn tất việc render tbody trước khi lọc.
        setTimeout(() => {
            filterAssignedUsersTable();
        }, 0);

        return result;
    }

    wrappedLoadAssignedUsersListByModule.__assignedUsersFilterWrapped = true;

    window.loadAssignedUsersListByModule =
        wrappedLoadAssignedUsersListByFilter;
};


	
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
		// Tìm kiếm thông tin Tổ/Đơn vị từ cache nhân sự (ưu tiên so sánh theo email hoặc memberId)
		let staffCategory = "Chưa phân tổ";
		
		// Gom các nguồn cache nhân sự có sẵn để tra cứu chính xác nhất
		const allMembers = (typeof currentLoadedEntities !== 'undefined' ? currentLoadedEntities : [])
		  .concat(window.card3CachedMembers || [])
		  .concat(window.card2CachedMembers || []);

		const foundStaff = allMembers.find(e => 
		  (e.email && item.email && String(e.email).toLowerCase().trim() === String(item.email).toLowerCase().trim()) || 
		  (e.id === item.memberId)
		);

		if (foundStaff) {
		  staffCategory = foundStaff.category || foundStaff.organizationUnit || foundStaff.department || "Chưa phân tổ";
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

		// 🌟 Đồng bộ cách lấy orgId an toàn giống các hàm khác
		const orgId = window.currentOrgIdGlobal || (typeof getCurrentAdminOrgId === 'function' ? await getCurrentAdminOrgId(user.uid) : null);
		if (!orgId) {
		  alert("Không tìm thấy thông tin đơn vị (OrgId)! Vui lòng kiểm tra lại phiên đăng nhập.");
		  return;
		}

		const activeYear = window.currentAcademicYear || currentAcademicYear;
		if (!activeYear) {
		  alert("Không xác định được năm học hiện tại.");
		  return;
		}

		// Tìm giáo viên trong mảng cache hiện tại (chuẩn hóa so sánh email/id)
		const targetId = String(staffUid).toLowerCase().trim();
		const staff = cachedAssignmentsList.find(s => String(s.id || s.email).toLowerCase().trim() === targetId);
		
		if (!staff) {
		  alert("Không tìm thấy thông tin phân công của nhân sự này trong bộ nhớ tạm!");
		  return;
		}

		// Lọc mảng modules, loại bỏ module bị bấm xóa
		const updatedModules = (staff.modules || []).filter(m => m !== modId);

		const db = firebase.firestore();
		
		// Ghi đè lại mảng modules mới lên Firestore
		await db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(activeYear)
				.collection("assignments")
				.doc(staff.id) // Dùng chính xác id của document (email)
				.set({
				  modules: updatedModules,
				  updatedAt: (typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString())
				}, { merge: true });

		// Cập nhật lại giá trị trong cache RAM ngay lập tức
		staff.modules = updatedModules;

		// Vẽ lại bảng rà soát
		if (typeof loadAssignedUsersListByModule === 'function') {
		  loadAssignedUsersListByModule();
		} else {
		  renderAssignedUsersTable(cachedAssignmentsList);
		}

		alert("Đã gỡ bỏ module thành công!");

	  } catch (error) {
		console.error("Lỗi khi gỡ module:", error);
		if (error.code === 'permission-denied' || error.message.includes("Missing or insufficient permissions")) {
			alert("Lỗi phân quyền: Tài khoản của bạn không đủ quyền Admin để thực hiện thao tác này.");
		} else {
			alert("Lỗi khi gỡ module: " + error.message);
		}
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
			const orgId =
				typeof ensureOrgId === 'function'
					? await ensureOrgId()
					: currentOrgIdGlobal;

			if (!orgId) return;

			const activeYear =
				window.currentAcademicYear ||
				currentAcademicYear;

			if (!activeYear) return;

			const db = firebase.firestore();

			const configCollectionRef = db
				.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(activeYear)
				.collection("KPIconfig");


			// Tải đồng thời cấu hình Học sinh + Giáo viên
			const [studentDoc, teacherDoc] =
				await Promise.all([
					configCollectionRef
						.doc("student")
						.get(),

					configCollectionRef
						.doc("teacher")
						.get()
				]);


			// =========================================================
			// HỌC SINH
			// =========================================================

			if (studentDoc.exists) {

				const sData =
					studentDoc.data() || {};


				const studentBasePoint =
					document.getElementById(
						"cfg-student-basepoint"
					);

				if (studentBasePoint) {
					studentBasePoint.value =
						sData.BasePoint ?? "";
				}


				document.getElementById(
					"cfg-student-kha-weeks"
				).value =
					sData.kha_weeks ?? 1;

				document.getElementById(
					"cfg-student-kha-count"
				).value =
					sData.kha_count ?? 5;

				document.getElementById(
					"cfg-student-kha-score"
				).value =
					sData.kha_score ?? 5;


				document.getElementById(
					"cfg-student-dat-weeks"
				).value =
					sData.dat_weeks ?? 2;

				document.getElementById(
					"cfg-student-dat-count"
				).value =
					sData.dat_count ?? 10;

				document.getElementById(
					"cfg-student-dat-score"
				).value =
					sData.dat_score ?? 10;


				document.getElementById(
					"cfg-student-chuadat-weeks"
				).value =
					sData.chuadat_weeks ?? 3;

				document.getElementById(
					"cfg-student-chuadat-count"
				).value =
					sData.chuadat_count ?? 15;

				document.getElementById(
					"cfg-student-chuadat-score"
				).value =
					sData.chuadat_score ?? 15;
			}


			// =========================================================
			// GIÁO VIÊN / NHÂN SỰ
			// =========================================================

			if (teacherDoc.exists) {

				const tData =
					teacherDoc.data() || {};


				const teacherBasePoint =
					document.getElementById(
						"cfg-teacher-basepoint"
					);

				if (teacherBasePoint) {
					teacherBasePoint.value =
						tData.BasePoint ?? "";
				}


				document.getElementById(
					"cfg-teacher-kha-weeks"
				).value =
					tData.kha_weeks ?? 1;

				document.getElementById(
					"cfg-teacher-kha-count"
				).value =
					tData.kha_count ?? 2;

				document.getElementById(
					"cfg-teacher-kha-score"
				).value =
					tData.kha_score ?? 2;


				document.getElementById(
					"cfg-teacher-dat-weeks"
				).value =
					tData.dat_weeks ?? 2;

				document.getElementById(
					"cfg-teacher-dat-count"
				).value =
					tData.dat_count ?? 4;

				document.getElementById(
					"cfg-teacher-dat-score"
				).value =
					tData.dat_score ?? 4;


				document.getElementById(
					"cfg-teacher-chuadat-weeks"
				).value =
					tData.chuadat_weeks ?? 3;

				document.getElementById(
					"cfg-teacher-chuadat-count"
				).value =
					tData.chuadat_count ?? 6;

				document.getElementById(
					"cfg-teacher-chuadat-score"
				).value =
					tData.chuadat_score ?? 6;
			}


		} catch (error) {

			console.error(
				"Lỗi tải cấu hình KPI:",
				error
			);
		}
	}
  

	// ==========================================
	// 4.2. HÀM LƯU CẤU HÌNH MA TRẬN NGƯỠNG KPI
	// ==========================================
	async function saveMonthlyKPIRulesConfig() {
		try {

			const orgId =
				typeof ensureOrgId === 'function'
					? await ensureOrgId()
					: currentOrgIdGlobal;


			if (!orgId) {

				alert(
					"Chưa xác định được thông tin đơn vị (OrgId). Vui lòng kiểm tra lại đăng nhập!"
				);

				return;
			}


			const activeYear =
				window.currentAcademicYear ||
				currentAcademicYear;


			if (!activeYear) {

				alert(
					"Chưa chọn năm học hiện tại!"
				);

				return;
			}


			// =========================================================
			// HÀM ĐỌC BASE POINT
			// =========================================================

			const readBasePoint = id => {

				const el =
					document.getElementById(id);


				if (!el) {
					return 0;
				}


				const value =
					Number(el.value);


				return Number.isFinite(value)
					? value
					: 0;
			};


			// =========================================================
			// HỌC SINH
			// =========================================================

			const studentRules = {

				// Điểm gốc của nhóm Học sinh
				BasePoint:
					readBasePoint(
						"cfg-student-basepoint"
					),


				kha_weeks:
					Number(
						document.getElementById(
							"cfg-student-kha-weeks"
						).value
					) || 1,


				kha_count:
					Number(
						document.getElementById(
							"cfg-student-kha-count"
						).value
					) || 5,


				kha_score:
					Number(
						document.getElementById(
							"cfg-student-kha-score"
						).value
					) || 5,


				dat_weeks:
					Number(
						document.getElementById(
							"cfg-student-dat-weeks"
						).value
					) || 2,


				dat_count:
					Number(
						document.getElementById(
							"cfg-student-dat-count"
						).value
					) || 10,


				dat_score:
					Number(
						document.getElementById(
							"cfg-student-dat-score"
						).value
					) || 10,


				chuadat_weeks:
					Number(
						document.getElementById(
							"cfg-student-chuadat-weeks"
						).value
					) || 3,


				chuadat_count:
					Number(
						document.getElementById(
							"cfg-student-chuadat-count"
						).value
					) || 15,


				chuadat_score:
					Number(
						document.getElementById(
							"cfg-student-chuadat-score"
						).value
					) || 15,


				updatedAt:
					getVietnamTimestamp()
			};


			// =========================================================
			// GIÁO VIÊN / NHÂN SỰ
			// =========================================================

			const teacherRules = {

				// Điểm gốc của nhóm Giáo viên / Nhân sự
				BasePoint:
					readBasePoint(
						"cfg-teacher-basepoint"
					),


				kha_weeks:
					Number(
						document.getElementById(
							"cfg-teacher-kha-weeks"
						).value
					) || 1,


				kha_count:
					Number(
						document.getElementById(
							"cfg-teacher-kha-count"
						).value
					) || 2,


				kha_score:
					Number(
						document.getElementById(
							"cfg-teacher-kha-score"
						).value
					) || 0,


				dat_weeks:
					Number(
						document.getElementById(
							"cfg-teacher-dat-weeks"
						).value
					) || 2,


				dat_count:
					Number(
						document.getElementById(
							"cfg-teacher-dat-count"
						).value
					) || 4,


				dat_score:
					Number(
						document.getElementById(
							"cfg-teacher-dat-score"
						).value
					) || 4,


				chuadat_weeks:
					Number(
						document.getElementById(
							"cfg-teacher-chuadat-weeks"
						).value
					) || 3,


				chuadat_count:
					Number(
						document.getElementById(
							"cfg-teacher-chuadat-count"
						).value
					) || 6,


				chuadat_score:
					Number(
						document.getElementById(
							"cfg-teacher-chuadat-score"
						).value
					) || 6,


				updatedAt:
					getVietnamTimestamp()
			};


			// =========================================================
			// FIRESTORE
			// =========================================================

			const db =
				firebase.firestore();


			const configCollectionRef =
				db
					.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(activeYear)
					.collection("KPIconfig");


			await Promise.all([

				configCollectionRef
					.doc("student")
					.set(
						studentRules,
						{ merge: true }
					),

				configCollectionRef
					.doc("teacher")
					.set(
						teacherRules,
						{ merge: true }
					)
			]);


			alert(
				"💾 Lưu Ma trận Ngưỡng và Điểm gốc KPI cho Học sinh và Giáo viên thành công!"
			);


		} catch (error) {

			console.error(
				"Lỗi lưu ma trận KPI:",
				error
			);


			alert(
				"Lỗi: " +
				error.message
			);
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
			tableBody.innerHTML =
				'<tr><td colspan="4" style="text-align: center; color: #6c757d;">Vui lòng chọn Bài toán Module ở trên.</td></tr>';
			return;
		}

		tableBody.innerHTML =
			'<tr><td colspan="4" style="text-align: center; color: #6c757d;">Đang kết nối lắng nghe nhật ký biến động (auditLogs)...</td></tr>';

		// =========================================================
		// 1. HỦY CÁC LISTENER CŨ
		// =========================================================
		if (
			typeof window.currentDailyUnsubscribe === "function"
		) {
			try {
				window.currentDailyUnsubscribe();
			} catch (e) {
				console.warn("Không thể hủy listener auditLogs cũ:", e);
			}
			window.currentDailyUnsubscribe = null;
		}

		if (
			typeof window.currentDailyUsersUnsubscribe === "function"
		) {
			try {
				window.currentDailyUsersUnsubscribe();
			} catch (e) {
				console.warn("Không thể hủy listener users cũ:", e);
			}
			window.currentDailyUsersUnsubscribe = null;
		}

		try {
			// =====================================================
			// 2. ORG + ACADEMIC YEAR
			// =====================================================
			const orgId = window.currentOrgIdGlobal;

			if (!orgId) {
				tableBody.innerHTML =
					'<tr><td colspan="4" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị (OrgId).</td></tr>';
				return;
			}

			let academicYearId = "";
			const yearsArr = window.currentAcademicYearsGlobal;

			if (Array.isArray(yearsArr) && yearsArr.length > 0) {
				const lastYearItem = yearsArr[yearsArr.length - 1];

				academicYearId = String(
					typeof lastYearItem === "object" && lastYearItem !== null
						? (
							lastYearItem.id ||
							lastYearItem.name ||
							lastYearItem.year
						)
						: lastYearItem
				).trim();
			} else if (window.currentAcademicYearIdGlobal) {
				academicYearId =
					String(window.currentAcademicYearIdGlobal).trim();
			}

			if (!academicYearId) {
				tableBody.innerHTML =
					'<tr><td colspan="4" style="text-align: center; color: red;">Chưa xác định được năm học hiện tại.</td></tr>';
				return;
			}

			const db = firebase.firestore();

			// =====================================================
			// 3. NGÀY ĐƯỢC CHỌN
			// =====================================================
			const dateInput =
				document.getElementById("grid-sec1-date-select") ||
				document.getElementById("grid-sec2-date-select");

			const selectedDateStr = dateInput
				? dateInput.value
				: new Date().toLocaleDateString("en-CA");

			if (!selectedDateStr) {
				tableBody.innerHTML =
					'<tr><td colspan="4" style="text-align: center; color: red;">Vui lòng chọn ngày cần xem nhật ký.</td></tr>';
				return;
			}

			// =====================================================
			// 4. CACHE USERS DÙNG CHUNG CHO DAILY
			//
			// Không dùng users.get() nữa.
			// users.onSnapshot() sẽ:
			// - nhận added
			// - nhận modified
			// - nhận removed
			//
			// Đồng thời giữ cache tra cứu theo:
			// - document ID
			// - UID
			// - CODE
			// =====================================================
			const usersCache = {
				byId: {},
				byUid: {},
				byCode: {},
				loaded: false,
				updatedAt: 0
			};

			// Nếu đã có cache Daily trước đó thì tận dụng ngay,
			// sau đó listener users sẽ đồng bộ tiếp.
			const oldUsersCache =
				window._sec1DailyUsersCache &&
				window._sec1DailyUsersCache[orgId];

			if (
				oldUsersCache &&
				oldUsersCache.byId &&
				typeof oldUsersCache.byId === "object"
			) {
				usersCache.byId = { ...oldUsersCache.byId };
			}

			if (
				oldUsersCache &&
				oldUsersCache.byUid &&
				typeof oldUsersCache.byUid === "object"
			) {
				usersCache.byUid = { ...oldUsersCache.byUid };
			}

			if (
				oldUsersCache &&
				oldUsersCache.byCode &&
				typeof oldUsersCache.byCode === "object"
			) {
				usersCache.byCode = { ...oldUsersCache.byCode };
			}

			window._sec1DailyUsersCache =
				window._sec1DailyUsersCache || {};

			window._sec1DailyUsersCache[orgId] = usersCache;

			// =====================================================
			// 5. HÀM CẬP NHẬT CACHE USER
			// =====================================================
			function rebuildDailyUserIndexes() {
				usersCache.byUid = {};
				usersCache.byCode = {};

				Object.keys(usersCache.byId).forEach(docId => {
					const user = usersCache.byId[docId];

					if (!user) return;

					const uid = String(user.uid || "").trim();

					const code = String(
						user.code ||
						user.memberId ||
						""
					).trim();

					if (uid) {
						usersCache.byUid[uid] = user;
					}

					if (code) {
						usersCache.byCode[code] = user;
					}
				});

				usersCache.loaded = true;
				usersCache.updatedAt = Date.now();
			}

			// =====================================================
			// 6. HÀM TRA CỨU USER
			//
			// Ưu tiên:
			// entityId -> document ID
			// entityId -> CODE
			// entityId -> UID
			// sau đó mới fallback currentLoadedEntities
			// =====================================================
			function getDailyUserInfo(entityId) {
				const key = String(entityId || "").trim();

				if (!key) return null;

				return (
					usersCache.byId[key] ||
					usersCache.byCode[key] ||
					usersCache.byUid[key] ||
					null
				);
			}

			// =====================================================
			// 7. FIELD LABEL MAP
			// =====================================================
			let fieldLabelMap = {};

			const currentFields =
				window.cachedSchemaFields ||
				(typeof cachedSchemaFields !== "undefined"
					? cachedSchemaFields
					: []) ||
				[];

			currentFields.forEach(f => {
				fieldLabelMap[f.key] = f.label || f.key;
			});

			// =====================================================
			// 8. LƯU SNAPSHOT AUDIT LOG HIỆN TẠI
			//
			// Khi users thay đổi, không đọc auditLogs lại.
			// Chỉ render lại snapshot đang có trong RAM.
			// =====================================================
			let currentAuditSnapshot = null;

			function renderDailyFromSnapshot(snapshot) {
				if (!snapshot) return;

				if (snapshot.empty) {
					tableBody.innerHTML =
						'<tr><td colspan="4" style="text-align: center; font-style: italic; color: #6c757d;">Chưa có lịch sử nhật ký biến động nào cho module này.</td></tr>';

					const badge =
						document.getElementById("sec1-cache-time-badge");

					if (badge) {
						badge.innerText =
							"📡 Đang theo dõi realtime (0 biến động)";
					}

					return;
				}

				let aggregatedMap = {};
				let totalLogsCount = 0;

				snapshot.forEach(doc => {
					const data = doc.data();

					const entityId =
						data.entityId || "Unknown";

					if (!aggregatedMap[entityId]) {
						const userInfo =
							getDailyUserInfo(entityId) || {};

						const currentLoaded =
							Array.isArray(window.currentLoadedEntities)
								? window.currentLoadedEntities.find(u =>
									String(u?.id || "").trim() ===
									String(entityId).trim() ||
									String(u?.uid || "").trim() ===
									String(entityId).trim() ||
									String(u?.code || u?.memberId || "").trim() ===
									String(entityId).trim()
								)
								: null;

						aggregatedMap[entityId] = {
							id: entityId,

							name:
								userInfo.fullName ||
								(currentLoaded
									? currentLoaded.fullName
									: null) ||
								data.updaterName ||
								entityId,

							category:
								userInfo.category ||
								userInfo.className ||
								(currentLoaded
									? (
										currentLoaded.category ||
										currentLoaded.className ||
										""
									)
									: "") ||
								"",

							totalCount: 0,
							details: []
						};
					}

					// Tăng số lượt theo count của audit log
					aggregatedMap[entityId].totalCount +=
						Number(data.count || 1);

					totalLogsCount++;

					// Người thực hiện + thời gian
					const updaterName =
						data.updaterName ||
						data.updaterEmail ||
						"Hệ thống";

					let timeStr = "vừa xong";

					if (
						data.timestamp &&
						typeof data.timestamp.toDate === "function"
					) {
						timeStr =
							data.timestamp
								.toDate()
								.toLocaleTimeString(
									"vi-VN",
									{
										hour: "2-digit",
										minute: "2-digit"
									}
								);
					}

					// Nội dung thay đổi
					const changesObj =
						data.changes || {};

					const changeKeys =
						Object.keys(changesObj);

					if (changeKeys.length > 0) {
						changeKeys.forEach(fieldKey => {
							const val =
								changesObj[fieldKey];

							const valStr =
								Array.isArray(val)
									? val.join(", ")
									: String(val);

							const displayLabel =
								fieldLabelMap[fieldKey] ||
								fieldKey;

							aggregatedMap[entityId]
								.details
								.push(
									`<li><b>${displayLabel}:</b> ${valStr} <span style="color: #6c757d; font-size: 0.85em;">(ghi/sửa bởi ${updaterName} lúc ${timeStr})</span></li>`
								);
						});
					} else {
						const actionName =
							data.action ||
							"Cập nhật dữ liệu";

						aggregatedMap[entityId]
							.details
							.push(
								`<li><b>${actionName}</b> <span style="color: #6c757d; font-size: 0.85em;">(ghi/sửa bởi ${updaterName} lúc ${timeStr})</span></li>`
							);
					}
				});

				// =================================================
				// 9. RENDER BẢNG
				// =================================================
				let html = "";

				for (const keyId in aggregatedMap) {
					const item =
						aggregatedMap[keyId];

					html += `
						<tr style="border-bottom: 1px solid #dee2e6;">
							<td style="font-family: monospace; font-weight: bold;">
								${item.id}
							</td>

							<td>
								${item.name}
								${item.category
									? `(${item.category})`
									: ""}
							</td>

							<td style="text-align: center;">
								<span style="background: #e7f1ff; color: #0d6efd; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
									${item.totalCount} lượt
								</span>
							</td>

							<td>
								<ul style="margin: 0; padding-left: 15px; font-size: 0.9em; max-height: 120px; overflow-y: auto;">
									${item.details.join("")}
								</ul>
							</td>
						</tr>
					`;
				}

				tableBody.innerHTML = html;

				const badge =
					document.getElementById(
						"sec1-cache-time-badge"
					);

				if (badge) {
					badge.innerText =
						"📡 Cập nhật lúc: " +
						new Date().toLocaleTimeString() +
						` (${totalLogsCount} biến động)`;
				}
			}

			// =====================================================
			// 10. LISTENER USERS - REALTIME
			//
			// Đây là phần thay thế users.get().
			//
			// Khi:
			// - thêm user
			// - sửa user
			// - xóa user
			//
			// cache sẽ tự cập nhật.
			// =====================================================
			const usersRef = db
				.collection("organizations")
				.doc(orgId)
				.collection("users");

			window.currentDailyUsersUnsubscribe =
				usersRef.onSnapshot(
					snapshot => {
						snapshot.docChanges().forEach(change => {
							const docId =
								change.doc.id;

							if (change.type === "removed") {
								delete usersCache.byId[docId];
								return;
							}

							const uData =
								change.doc.data() || {};

							usersCache.byId[docId] = {
								id: docId,

								uid:
									uData.uid ||
									docId,

								code:
									uData.code ||
									uData.memberId ||
									"",

								fullName:
									uData.fullName ||
									uData.displayName ||
									uData.name ||
									docId,

								category:
									uData.category ||
									uData.className ||
									"",

								className:
									uData.className ||
									uData.category ||
									"",

								email:
									uData.email ||
									"",

								role:
									uData.role ||
									""
							};
						});

						rebuildDailyUserIndexes();

						// Nếu audit snapshot đã có thì chỉ render lại
						// từ snapshot RAM, không đọc Firestore lần nữa.
						if (currentAuditSnapshot) {
							renderDailyFromSnapshot(
								currentAuditSnapshot
							);
						}
					},
					error => {
						console.error(
							"Lỗi realtime users Section 1:",
							error
						);
					}
				);

			// =====================================================
			// 11. ĐƯỜNG DẪN AUDIT LOGS
			// =====================================================
			const auditLogsRef = db
				.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("auditLogs")
				.where(
					"date",
					"==",
					selectedDateStr
				);

			// =====================================================
			// 12. LISTENER AUDIT LOGS - REALTIME
			// =====================================================
			window.currentDailyUnsubscribe =
				auditLogsRef.onSnapshot(
					snapshot => {
						currentAuditSnapshot =
							snapshot;

						renderDailyFromSnapshot(
							snapshot
						);
					},
					error => {
						console.error(
							"Lỗi realtime auditLogs:",
							error
						);

						tableBody.innerHTML =
							'<tr><td colspan="4" style="text-align: center; color: red;">Lỗi kết nối thời gian thực bảng nhật ký.</td></tr>';
					}
				);

		} catch (error) {
			console.error(
				"Lỗi khởi tạo Section 1 Daily:",
				error
			);

			tableBody.innerHTML =
				'<tr><td colspan="4" style="text-align: center; color: red;">Lỗi tải dữ liệu.</td></tr>';
		}
	}

	// =============================================================
	// EXPOSE RA WINDOW
	// Nếu app.js chạy dạng ES module thì onclick/onchange
	// từ HTML vẫn gọi được hàm.
	// =============================================================
	window.loadGridSection1Daily =
		loadGridSection1Daily;


	// ==========================================
	// 4. SECTION 5.2: BÁO CÁO TUẦN (CÓ CACHE)
	// ==========================================

	async function loadGridSection2Weekly(
		forceRefresh = false,
		filterKeywordFromCaller = ""
	) {

		const tableBody =
			document.getElementById("grid-sec2-body-rows");

		const headerRow =
			document.getElementById("grid-sec2-header-row");

		const dateInput =
			document.getElementById("grid-sec2-date-select");

		const filterInput =
			document.getElementById("grid-sec2-filter-class");

		const targetTypeSelect =
			document.getElementById("grid-sec2-target-type");

		const badge =
			document.getElementById("sec2-cache-time-badge");


		if (!tableBody || !dateInput) {
			console.error(
				"❌ Không tìm thấy control của Section 5.2"
			);
			return;
		}


		// =========================================================
		// 1. NGÀY
		// =========================================================

		if (!dateInput.value) {

			const now = new Date();

			dateInput.value =
				now.toLocaleDateString("en-CA");
		}


		const selectedDateStr =
			dateInput.value.trim();


		const filterKeyword =
			String(
				filterKeywordFromCaller ||
				(
					filterInput
						? filterInput.value
						: ""
				) ||
				""
			)
			.trim()
			.toLowerCase();


		// =========================================================
		// 2. TARGET TYPE
		// =========================================================

		const targetType =
			targetTypeSelect
				? String(
					targetTypeSelect.value ||
					"STUDENT"
				)
					.trim()
					.toUpperCase()
				: "STUDENT";


		// =========================================================
		// 3. TÍNH TUẦN
		// =========================================================

		const inputDate =
			new Date(
				`${selectedDateStr}T00:00:00`
			);


		if (isNaN(inputDate.getTime())) {

			tableBody.innerHTML = `
				<tr>
					<td colspan="30"
						style="
							text-align:center;
							color:red;
							padding:20px;
						">
						Ngày được chọn không hợp lệ.
					</td>
				</tr>
			`;

			return;
		}


		const dayOfWeek =
			inputDate.getDay();


		const diffToMonday =
			dayOfWeek === 0
				? -6
				: 1 - dayOfWeek;


		const monday =
			new Date(inputDate);


		monday.setDate(
			monday.getDate() +
			diffToMonday
		);


		const sunday =
			new Date(monday);


		sunday.setDate(
			monday.getDate() + 6
		);


		function formatDateYYYYMMDD(date) {

			return [
				date.getFullYear(),

				String(
					date.getMonth() + 1
				).padStart(2, "0"),

				String(
					date.getDate()
				).padStart(2, "0")

			].join("-");
		}


		const mondayStr =
			formatDateYYYYMMDD(monday);

		const sundayStr =
			formatDateYYYYMMDD(sunday);


		// =========================================================
		// 4. ORG
		// =========================================================

		const orgId =
			window.currentOrgIdGlobal;


		if (!orgId) {

			tableBody.innerHTML = `
				<tr>
					<td colspan="30"
						style="
							text-align:center;
							color:red;
							padding:20px;
						">
						Chưa xác định được OrgId.
					</td>
				</tr>
			`;

			return;
		}


		// =========================================================
		// 5. NĂM HỌC
		// =========================================================

		let academicYearId = "";


		if (
			window.currentAcademicYearIdGlobal
		) {

			academicYearId =
				String(
					window.currentAcademicYearIdGlobal
				).trim();

		} else if (
			window.currentAcademicYear
		) {

			academicYearId =
				String(
					window.currentAcademicYear
				).trim();

		} else {

			const yearsArr =
				window.currentAcademicYearsGlobal;


			if (
				Array.isArray(yearsArr) &&
				yearsArr.length > 0
			) {

				const yearItem =
					yearsArr.find(
						item => !!item
					);


				if (yearItem) {

					academicYearId =
						String(

							typeof yearItem === "object"
								? (
									yearItem.id ||
									yearItem.name ||
									yearItem.year ||
									""
								)
								: yearItem

						).trim();
				}
			}
		}


		if (!academicYearId) {

			tableBody.innerHTML = `
				<tr>
					<td colspan="30"
						style="
							text-align:center;
							color:red;
							padding:20px;
						">
						Chưa xác định được năm học.
					</td>
				</tr>
			`;

			return;
		}


		// =========================================================
		// 6. CACHE
		// =========================================================

		const cacheKey =
			`${academicYearId}_` +
			`${targetType.toLowerCase()}_` +
			`weekly_${mondayStr}_to_${sundayStr}_v4`;


		if (
			!forceRefresh &&
			typeof cachedGridWeeklyData !== "undefined" &&
			cachedGridWeeklyData[cacheKey]
		) {

			renderWeeklyTable(
				cachedGridWeeklyData[cacheKey],
				filterKeyword
			);


			if (badge) {

				badge.innerText =
					`⚡ Dùng Cache RAM (` +
					`${targetType === "TEACHER"
						? "Giáo viên"
						: "Học sinh"} - ` +
					`Tuần ${mondayStr} đến ${sundayStr})`;
			}


			return;
		}


		// =========================================================
		// 7. LOADING
		// =========================================================

		tableBody.innerHTML = `
			<tr>
				<td colspan="30"
					style="
						text-align:center;
						color:#6c757d;
						padding:20px;
					">
					⏳ Đang tổng hợp dữ liệu tuần
					${mondayStr} → ${sundayStr}...
				</td>
			</tr>
		`;


		try {

			const db =
				firebase.firestore();


			// =====================================================
			// 8. CACHE USERS
			// =====================================================

			window._sec2UsersCache =
				window._sec2UsersCache || {};


			let usersCache =
				window._sec2UsersCache[orgId];


			const cacheInvalid =
				!usersCache ||
				!usersCache.byCode ||
				!usersCache.byUid;


			if (
				forceRefresh ||
				cacheInvalid
			) {

				const usersSnapshot =
					await db
						.collection("organizations")
						.doc(orgId)
						.collection("users")
						.get();


				const byCode = {};
				const byUid = {};


				usersSnapshot.forEach(
					userDoc => {

						const userData =
							userDoc.data() || {};


						const uid =
							String(
								userData.uid ||
								userDoc.id ||
								""
							).trim();


						const code =
							String(
								userData.code ||
								userData.memberId ||
								""
							).trim();


						const role =
							String(
								userData.role ||
								""
							)
								.trim()
								.toUpperCase();


						// Chỉ lấy đúng targetType

						if (
							role !== targetType
						) {
							return;
						}


						const userInfo = {

							id:
								code || uid,

							uid:
								uid,

							code:
								code,

							fullName:
								userData.fullName ||
								userData.displayName ||
								uid,

							category:
								userData.category ||
								userData.className ||
								userData.organizationUnit ||
								"Chưa phân loại",

							role:
								role
						};


						// KEY CHÍNH = CODE

						if (code) {

							byCode[code] =
								userInfo;
						}


						// KEY PHỤ = UID

						if (uid) {

							byUid[uid] =
								userInfo;
						}
					}
				);


				usersCache = {

					byCode:
						byCode,

					byUid:
						byUid,

					cachedAt:
						Date.now()
				};


				window._sec2UsersCache[
					orgId
				] =
					usersCache;


				// Đồng bộ với cache chung nếu cần

				window.cachedUsersMap =
					window.cachedUsersMap || {};

			}


			const usersByCode =
				usersCache.byCode || {};

			const usersByUid =
				usersCache.byUid || {};


			// =====================================================
			// 9. MODULES
			// =====================================================

			window._sec2ModulesCache =
				window._sec2ModulesCache || {};


			let modulesCache =
				window._sec2ModulesCache[
					orgId
				];


			if (
				!modulesCache ||
				forceRefresh
			) {

				const modulesSnapshot =
					await db
						.collection("organizations")
						.doc(orgId)
						.collection("modules")
						.get();


				modulesCache =
					modulesSnapshot.docs.map(
						modDoc => ({

							id:
								modDoc.id,

							data:
								modDoc.data() || {}
						})
					);


				window._sec2ModulesCache[
					orgId
				] =
					modulesCache;
			}


			const targetModules =
				modulesCache.filter(
					module => {

						const modTargetType =
							String(
								module.data.targetType ||
								""
							)
								.trim()
								.toUpperCase();


						return (
							modTargetType ===
							targetType
						);
					}
				);


			if (
				targetModules.length === 0
			) {

				tableBody.innerHTML = `
					<tr>
						<td colspan="30"
							style="
								text-align:center;
								color:#6c757d;
								padding:20px;
							">
							Không tìm thấy module cho
							${
								targetType === "TEACHER"
									? "Giáo viên"
									: "Học sinh"
							}.
						</td>
					</tr>
				`;

				return;
			}


			// =====================================================
			// 10. KPI FIELDS
			// =====================================================

			const kpiFieldsMap = {};


			targetModules.forEach(
				module => {

					const fieldsArr =
						Array.isArray(
							module.data.fields
						)
							? module.data.fields
							: [];


					fieldsArr.forEach(
						fieldObj => {

							if (!fieldObj) {
								return;
							}


							const fieldKey =
								String(
									fieldObj.key ||
									fieldObj.id ||
									fieldObj.fieldKey ||
									""
								).trim();


							if (!fieldKey) {
								return;
							}


							kpiFieldsMap[
								fieldKey
							] = {

								id:
									fieldKey,

								key:
									fieldKey,

								name:
									fieldObj.label ||
									fieldObj.name ||
									fieldKey,

								label:
									fieldObj.label ||
									fieldObj.name ||
									fieldKey,

								type:
									fieldObj.type ||
									"text",

								scoreWeight:
									Number(
										fieldObj.scoreWeight ??
										0
									),

								weeklyThreshold:
									Number(
										fieldObj.kpiWeekly ??
										fieldObj.weeklyThreshold ??
										0
									),

								kpiOptions:
									(
										fieldObj.kpiOptions &&
										typeof fieldObj.kpiOptions === "object"
									)
										? fieldObj.kpiOptions
										: {},

								options:
									Array.isArray(
										fieldObj.options
									)
										? fieldObj.options
										: []
							};
						}
					);
				}
			);


			const kpiFieldsList =
				Object.values(
					kpiFieldsMap
				);


			// =====================================================
			// 11. HEADER
			// =====================================================

			let headerHtml = `

				<th style="width:90px;">
					Mã định danh
				</th>

				<th style="width:170px;">
					Họ và tên
				</th>

				<th style="width:130px;">
					${
						targetType === "TEACHER"
							? "Tổ chuyên môn"
							: "Lớp"
					}
				</th>
			`;


			kpiFieldsList.forEach(
				field => {

					headerHtml += `

						<th style="
							text-align:center;
							min-width:105px;
						">
							${field.name}
						</th>
					`;
				}
			);


			headerHtml += `

				<th style="
					width:110px;
					text-align:center;
				">
					Tổng điểm trừ
				</th>

				<th style="
					width:130px;
					text-align:center;
				">
					Cảnh báo Tuần
				</th>
			`;


			if (headerRow) {

				headerRow.innerHTML =
					headerHtml;
			}


			// =====================================================
			// 12. SUMMARY
			// =====================================================

			const summaryMap = {};


			Object.entries(
				usersByCode
			).forEach(
				([code, user]) => {

					summaryMap[code] = {

						id:
							code,

						code:
							user.code,

						uid:
							user.uid,

						name:
							user.fullName ||
							code,

						className:
							user.category ||
							"Chưa phân loại",

						totalCount:
							0,

						totalPenalty:
							0,

						totalBonus:
							0,

						totalScore:
							0,

						negativeCount:
							0,

						negativeWeeks:
							new Set(),

						kpiCounts:
							{}
					};
				}
			);


			// =====================================================
			// 13. HÀM TÌM SUMMARY
			// =====================================================

			function getSummaryByEntityId(
				rawEntityId
			) {

				const entityId =
					String(
						rawEntityId || ""
					).trim();


				if (!entityId) {
					return null;
				}


				// -----------------------------------------------
				// 1. Ưu tiên CODE
				// -----------------------------------------------

				if (
					summaryMap[entityId]
				) {

					return summaryMap[
						entityId
					];
				}


				// -----------------------------------------------
				// 2. Fallback UID cho record cũ
				// -----------------------------------------------

				const oldUser =
					usersByUid[
						entityId
					];


				if (
					oldUser &&
					oldUser.code &&
					summaryMap[
						oldUser.code
					]
				) {

					return summaryMap[
						oldUser.code
					];
				}


				return null;
			}


			// =====================================================
			// 14. ĐỌC RECORDS
			// =====================================================

			for (
				const module
				of targetModules
			) {

				const recordsSnapshot =
					await db
						.collection("organizations")
						.doc(orgId)
						.collection("academicYears")
						.doc(academicYearId)
						.collection("modulesData")
						.doc(module.id)
						.collection("records")
						.get();


				recordsSnapshot.forEach(
					recordDoc => {

						const data =
							recordDoc.data() || {};


						// -------------------------------------------------
						// ENTITY ID
						// -------------------------------------------------

						let entityId =
							data.entityId ||
							data.entityID ||
							data.targetId ||
							"";


						if (!entityId) {

							const recordId =
								String(
									recordDoc.id ||
									""
								);


							entityId =
								recordId.split("_")[0];
						}


						entityId =
							String(
								entityId || ""
							).trim();


						const summary =
							getSummaryByEntityId(
								entityId
							);


						if (!summary) {
							return;
						}


						// -------------------------------------------------
						// DATE
						// -------------------------------------------------

						const recordDate =
							String(
								data.date || ""
							).trim();


						if (
							!recordDate ||
							recordDate < mondayStr ||
							recordDate > sundayStr
						) {

							return;
						}


						// Một record thuộc tuần này

						const weekKey =
							mondayStr;


						// =================================================
						// TỪNG FIELD KPI
						// =================================================

						kpiFieldsList.forEach(
							kpiField => {

								const fieldKey =
									kpiField.key;


								let value =
									data[fieldKey];


								// Fallback changes

								if (
									value === undefined &&
									data.changes &&
									data.changes[fieldKey] !== undefined
								) {

									value =
										data.changes[
											fieldKey
										];
								}


								if (
									value === undefined ||
									value === null ||
									value === ""
								) {

									return;
								}


								// =================================================
								// A. KPI LƯU DƯỚI DẠNG ARRAY
								// =================================================
								//
								// Ví dụ:
								//
								// [
								//   {
								//      value: "...",
								//      by: "...",
								//      email: "...",
								//      time: "..."
								//   }
								// ]
								//
								// Mỗi phần tử = 1 lần ghi lỗi.
								// =================================================

								if (
									Array.isArray(value)
								) {

									value.forEach(
										item => {

											let optionValue =
												item;


											if (
												item &&
												typeof item === "object"
											) {

												optionValue =
													item.value !== undefined
														? item.value
														: item.label !== undefined
															? item.label
															: item.name !== undefined
																? item.name
																: "";
											}


											optionValue =
												String(
													optionValue || ""
												).trim();


											// Không tính phần tử rỗng

											if (
												!optionValue
											) {
												return;
											}


											// -----------------------------------------
											// SCORE WEIGHT
											// -----------------------------------------

											const optionConfig =
												kpiField.kpiOptions &&
												typeof kpiField.kpiOptions === "object"
													? kpiField.kpiOptions[
														optionValue
													]
													: null;


											let scoreWeight;


											if (
												optionConfig &&
												optionConfig.scoreWeight !== undefined &&
												optionConfig.scoreWeight !== null
											) {

												scoreWeight =
													Number(
														optionConfig.scoreWeight
													);

											} else {

												scoreWeight =
													Number(
														kpiField.scoreWeight ||
														0
													);
											}


											if (
												!Number.isFinite(
													scoreWeight
												)
											) {

												scoreWeight =
													0;
											}


											// -----------------------------------------
											// MỖI LOG = 1 LƯỢT
											// -----------------------------------------

											summary.totalCount++;


											summary.kpiCounts[
												fieldKey
											] = (
												summary.kpiCounts[
													fieldKey
												] || 0
											) + 1;


											// -----------------------------------------
											// ĐIỂM ÂM
											// -----------------------------------------

											if (
												scoreWeight < 0
											) {

												// FIX:
												// trước đây là totalx
												summary.totalPenalty +=
													Math.abs(
														scoreWeight
													);


												summary.negativeCount++;


												summary.negativeWeeks.add(
													weekKey
												);


											} else if (
												scoreWeight > 0
											) {

												// -----------------------------------------
												// ĐIỂM DƯƠNG
												// -----------------------------------------

												summary.totalBonus +=
													scoreWeight;
											}


											// -----------------------------------------
											// ĐIỂM RÒNG
											// -----------------------------------------

											summary.totalScore +=
												scoreWeight;
										}
									);


									return;
								}


								// =================================================
								// B. KPI LƯU DẠNG OBJECT
								// =================================================

								if (
									typeof value === "object" &&
									!Array.isArray(value)
								) {

									const optionValue =
										String(
											value.value ??
											value.label ??
											value.name ??
											""
										).trim();


									if (
										!optionValue
									) {
										return;
									}


									const optionConfig =
										kpiField.kpiOptions &&
										typeof kpiField.kpiOptions === "object"
											? kpiField.kpiOptions[
												optionValue
											]
											: null;


									let scoreWeight =
										optionConfig &&
										optionConfig.scoreWeight !== undefined

											? Number(
												optionConfig.scoreWeight
											)

											: Number(
												kpiField.scoreWeight ||
												0
											);


									if (
										!Number.isFinite(
											scoreWeight
										)
									) {

										scoreWeight = 0;
									}


									summary.totalCount++;


									summary.kpiCounts[
										fieldKey
									] = (
										summary.kpiCounts[
											fieldKey
										] || 0
									) + 1;


									summary.totalScore +=
										scoreWeight;


									if (
										scoreWeight < 0
									) {

										summary.totalPenalty +=
											Math.abs(
												scoreWeight
											);

										summary.negativeCount++;

										summary.negativeWeeks.add(
											weekKey
										);

									} else if (
										scoreWeight > 0
									) {

										summary.totalBonus +=
											scoreWeight;
									}


									return;
								}


								// =================================================
								// C. KPI THƯỜNG
								// =================================================

								const scoreWeight =
									Number(
										kpiField.scoreWeight ||
										0
									);


								const safeScore =
									Number.isFinite(
										scoreWeight
									)
										? scoreWeight
										: 0;


								summary.totalCount++;


								summary.kpiCounts[
									fieldKey
								] = (
									summary.kpiCounts[
										fieldKey
									] || 0
								) + 1;


								summary.totalScore +=
									safeScore;


								if (
									safeScore < 0
								) {

									summary.totalPenalty +=
										Math.abs(
											safeScore
										);


									summary.negativeCount++;


									summary.negativeWeeks.add(
										weekKey
									);


								} else if (
									safeScore > 0
								) {

									summary.totalBonus +=
										safeScore;
								}

							}
						);
					}
				);
			}


			// =====================================================
			// 15. RESULT
			// =====================================================

			const processedList =
				Object.values(
					summaryMap
				).map(
					item => {

						const totalPenalty =
							Number(
								item.totalPenalty ||
								0
							);


						const totalBonus =
							Number(
								item.totalBonus ||
								0
							);


						const totalScore =
							Number(
								item.totalScore ||
								0
							);


						const totalCount =
							Number(
								item.totalCount ||
								0
							);


						const negativeCount =
							Number(
								item.negativeCount ||
								0
							);


						const negativeWeeks =
							item.negativeWeeks instanceof Set
								? item.negativeWeeks.size
								: 0;


						// =================================================
						// CẢNH BÁO
						// =================================================

						const warningFields = [];


						kpiFieldsList.forEach(
							field => {

								const count =
									Number(
										item.kpiCounts[
											field.id
										] || 0
									);


								const threshold =
									Number(
										field.weeklyThreshold ||
										0
									);


								if (
									threshold > 0 &&
									count >= threshold
								) {

									warningFields.push({

										fieldId:
											field.id,

										fieldName:
											field.name,

										count:
											count,

										threshold:
											threshold
									});
								}
							}
						);


						let warningText =
							"Đạt";


						let warningStyle =
							"background:#d1e7dd;color:#0f5132;";


						if (
							warningFields.length > 0
						) {

							warningText =
								"⚠️ Cảnh báo";


							warningStyle =
								"background:#fff3cd;color:#664d03;";


						} else if (
							totalPenalty > 0
						) {

							warningText =
								"Cần lưu ý";


							warningStyle =
								"background:#ffe5d0;color:#9a3412;";
						}


						return {

							...item,

							totalCount:
								totalCount,

							totalPenalty:
								totalPenalty,

							totalBonus:
								totalBonus,

							totalScore:
								totalScore,

							negativeCount:
								negativeCount,

							negativeWeeks:
								negativeWeeks,

							warningFields:
								warningFields,

							warningText:
								warningText,

							warningStyle:
								warningStyle
						};
					}
				);


			// =====================================================
			// 16. RESULT OBJECT
			// =====================================================

			const resultList = {

				fields:
					kpiFieldsList,

				data:
					processedList
			};


			// =====================================================
			// 17. CACHE
			// =====================================================

			if (
				typeof cachedGridWeeklyData !==
				"undefined"
			) {

				cachedGridWeeklyData[
					cacheKey
				] =
					resultList;
			}


			// =====================================================
			// 18. RENDER
			// =====================================================

			renderWeeklyTable(
				resultList,
				filterKeyword
			);


			if (badge) {

				badge.innerText =
					`🌐 Cập nhật tuần ` +
					`(${mondayStr} - ${sundayStr})`;
			}


			// =====================================================
			// 19. DEBUG
			// =====================================================

			console.log(
				"📊 WEEKLY REPORT:",
				{
					academicYearId:
						academicYearId,

					targetType:
						targetType,

					monday:
						mondayStr,

					sunday:
						sundayStr,

					kpiFields:
						kpiFieldsList,

					users:
						Object.keys(
							usersByCode
						).length,

					recordsModules:
						targetModules.length,

					resultCount:
						processedList.length
				}
			);


		} catch (error) {

			console.error(
				"❌ Lỗi loadGridSection2Weekly():",
				error
			);


			tableBody.innerHTML = `
				<tr>
					<td colspan="30"
						style="
							text-align:center;
							color:red;
							padding:20px;
						">
						Lỗi tải dữ liệu tổng hợp tuần:
						${error.message || error}
					</td>
				</tr>
			`;
		}
	}



	// Hàm phụ trợ nhận diện từ khóa giáo viên/tổ chuyên môn
	function keywordIsTeacher(keyword) {
	  if (!keyword) return false;
	  const teacherKeywords = ["tổ", "giáo viên", "gv", "nhân sự", "hóa", "lý", "toán", "văn", "anh", "sử", "địa", "sinh", "tin", "thể dục", "cô", "thầy"];
	  return teacherKeywords.some(k => keyword.toLowerCase().includes(k));
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
			const matchId = (item.code || "").toLowerCase().includes(keyword);
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
				<td style="vertical-align: middle;"><b>${item.code || item.id}</b></td>
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

    // =========================================================
    // 1. LẤY ĐÚNG CONTROL CỦA SECTION 3
    // =========================================================

    const monthInput =
        document.getElementById("grid-sec3-month-select");

    const filterInput =
        document.getElementById("grid-sec3-filter-class");

    const targetTypeSelect =
        document.getElementById("grid-sec3-target-type");

    const badge =
        document.getElementById("sec3-cache-time-badge");

    if (!tableBody || !monthInput) {
        console.error(
            "❌ Không tìm thấy #grid-sec3-body-rows hoặc #grid-sec3-month-select"
        );
        return;
    }


    // =========================================================
    // 2. THÁNG ĐƯỢC CHỌN
    // =========================================================

    if (!monthInput.value) {
        const now = new Date();

        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");

        monthInput.value = `${y}-${m}`;
    }

    const selectedMonth = monthInput.value.trim();

    // YYYY-MM
    const monthMatch =
        /^(\d{4})-(\d{2})$/.exec(selectedMonth);

    if (!monthMatch) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="30"
                    style="text-align:center;color:red;padding:20px;">
                    Tháng được chọn không hợp lệ.
                </td>
            </tr>
        `;

        return;
    }

    const year = Number(monthMatch[1]);
    const monthNumber = Number(monthMatch[2]);

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(monthNumber) ||
        monthNumber < 1 ||
        monthNumber > 12
    ) {
        return;
    }


    // =========================================================
    // 3. ĐỐI TƯỢNG
    // =========================================================

    const targetType =
        targetTypeSelect
            ? String(targetTypeSelect.value || "STUDENT")
                .trim()
                .toUpperCase()
            : "STUDENT";


    // =========================================================
    // 5. FILTER
    // =========================================================

    const filterKeyword =
        filterInput
            ? String(filterInput.value || "")
                .trim()
                .toLowerCase()
            : "";


    // =========================================================
    // 6. ORG ID
    // =========================================================

    const orgId =
        window.currentOrgIdGlobal;

    if (!orgId) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="30"
                    style="text-align:center;color:red;padding:20px;">
                    Chưa xác định được OrgId.
                </td>
            </tr>
        `;

        return;
    }


    // =========================================================
    // 7. CẤU HÌNH KỲ BÁO CÁO THÁNG
    //
    // Đọc trực tiếp từ:
    // organizations/{orgId}.reportingPeriod.monthly.startDay
    //
    // Quy ước:
    // - startDay = 1  -> kỳ tháng dương lịch: 01 -> cuối tháng
    // - startDay = 21 -> Tháng 10/2026 = 21/09/2026 -> 20/10/2026
    //
    // Không dùng biến toàn cục để tránh cấu hình bị cũ/chưa tải.
    // =========================================================

    let monthlyStartDay = 1;

    try {
        const orgConfigDoc = await firebase.firestore()
            .collection("organizations")
            .doc(orgId)
            .get();

        if (orgConfigDoc.exists) {
            const orgConfigData = orgConfigDoc.data() || {};

            const configuredStartDay = Number(
                orgConfigData?.reportingPeriod?.monthly?.startDay
            );

            if (
                Number.isInteger(configuredStartDay) &&
                configuredStartDay >= 1 &&
                configuredStartDay <= 31
            ) {
                monthlyStartDay = configuredStartDay;
            }
        }
    } catch (configError) {
        console.warn(
            "⚠️ Không đọc được cấu hình kỳ báo cáo tháng. Dùng mặc định startDay = 1:",
            configError
        );
    }

    // Trả về số ngày của một tháng.
    function getDaysInMonth(yearValue, monthValue) {
        return new Date(yearValue, monthValue, 0).getDate();
    }

    // Tạo chuỗi YYYY-MM-DD, đồng thời tự giới hạn ngày
    // nếu tháng không có ngày 29/30/31.
    function makeSafeDateString(yearValue, monthValue, dayValue) {
        const safeDay = Math.min(
            Number(dayValue),
            getDaysInMonth(yearValue, monthValue)
        );

        return (
            `${yearValue}-` +
            `${String(monthValue).padStart(2, "0")}-` +
            `${String(safeDay).padStart(2, "0")}`
        );
    }

    let firstDayStr = "";
    let lastDayStr = "";

    if (monthlyStartDay === 1) {
        // Tháng dương lịch thông thường.
        firstDayStr = makeSafeDateString(
            year,
            monthNumber,
            1
        );

        lastDayStr = makeSafeDateString(
            year,
            monthNumber,
            getDaysInMonth(year, monthNumber)
        );
    } else {
        // Kỳ báo cáo được đặt tên theo tháng kết thúc.
        //
        // Ví dụ startDay = 21:
        // selectedMonth = 2026-10
        // firstDay = 2026-09-21
        // lastDay  = 2026-10-20
        //
        const previousMonthDate = new Date(
            year,
            monthNumber - 2,
            1
        );

        const previousYear = previousMonthDate.getFullYear();
        const previousMonthNumber =
            previousMonthDate.getMonth() + 1;

        firstDayStr = makeSafeDateString(
            previousYear,
            previousMonthNumber,
            monthlyStartDay
        );

        lastDayStr = makeSafeDateString(
            year,
            monthNumber,
            monthlyStartDay - 1
        );
    }

    console.log(
        "📅 [MONTHLY PERIOD]",
        {
            selectedMonth,
            monthlyStartDay,
            firstDayStr,
            lastDayStr,
            label: `${monthNumber}/${year}`
        }
    );


    // =========================================================
    // 8. ĐỐI TƯỢNG
    // =========================================================
    //
    // ƯU TIÊN:
    // currentAcademicYearIdGlobal
    // sau đó mới currentAcademicYear
    // =========================================================

    let academicYearId = "";

    if (window.currentAcademicYearIdGlobal) {

        academicYearId =
            String(
                window.currentAcademicYearIdGlobal
            ).trim();

    } else if (window.currentAcademicYear) {

        academicYearId =
            String(
                window.currentAcademicYear
            ).trim();

    } else if (
        Array.isArray(window.currentAcademicYearsGlobal) &&
        window.currentAcademicYearsGlobal.length > 0
    ) {

        const firstValidYear =
            window.currentAcademicYearsGlobal.find(item => {

                if (
                    item &&
                    typeof item === "object"
                ) {
                    return (
                        item.id ||
                        item.name ||
                        item.year
                    );
                }

                return item;
            });

        if (firstValidYear) {

            academicYearId =
                String(
                    typeof firstValidYear === "object"
                        ? (
                            firstValidYear.id ||
                            firstValidYear.name ||
                            firstValidYear.year
                        )
                        : firstValidYear
                ).trim();
        }
    }


    if (!academicYearId) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="30"
                    style="text-align:center;color:red;padding:20px;">
                    Chưa xác định được năm học.
                </td>
            </tr>
        `;

        return;
    }


    // =========================================================
    // 8. CACHE KEY
    //
    // PHẢI THỐNG NHẤT VỚI filterGridSection3Table()
    // =========================================================

    const cacheKey =
        `${academicYearId}_${targetType.toLowerCase()}_monthly_${selectedMonth}_sd${monthlyStartDay}_${firstDayStr}_${lastDayStr}`;


    // =========================================================
    // 9. DÙNG CACHE
    // =========================================================

    if (
        !forceRefresh &&
        typeof cachedGridMonthlyData !== "undefined" &&
        cachedGridMonthlyData[cacheKey]
    ) {

        renderMonthlyTable(
            cachedGridMonthlyData[cacheKey],
            filterKeyword
        );

        if (badge) {

            badge.innerText =
                `⚡ Dùng Cache RAM (${targetType === "TEACHER"
                    ? "Giáo viên"
                    : "Học sinh"} - ${monthNumber}/${year} (${firstDayStr} → ${lastDayStr})`;
        }

        return;
    }


    tableBody.innerHTML = `
        <tr>
            <td colspan="30"
                style="text-align:center;color:#6c757d;padding:20px;">
                ⏳ Đang tổng hợp kỳ báo cáo
                ${firstDayStr} → ${lastDayStr}...
            </td>
        </tr>
    `;


    try {

        const db = firebase.firestore();


        // =====================================================
        // 10. LẤY USERS
        //
        // users/{uid}
        //
        // uid chính là entityId
        // =====================================================

        const usersMap = {};
        const usersByUid = {};

        const usersSnapshot =
            await db
                .collection("organizations")
                .doc(orgId)
                .collection("users")
                .get();

        usersSnapshot.forEach(userDoc => {

            const userData =
                userDoc.data() || {};

            const role =
                String(
                    userData.role || ""
                )
                    .trim()
                    .toUpperCase();

            if (role !== targetType) {
                return;
            }

            const uid =
                String(
                    userData.uid ||
                    userDoc.id ||
                    ""
                ).trim();

            const code =
                String(
                    userData.code ||
                    ""
                ).trim();

            // Record mới dùng code làm entityId.
            // Nếu dữ liệu cũ chưa có code thì tạm dùng UID.
            const entityId = code || uid;

            if (!entityId) {
                return;
            }

            usersMap[entityId] = {
                id: entityId,
                code: code || uid,
                uid: uid,
                fullName: userData.fullName || entityId,
                category: userData.category || userData.className || "Chưa phân loại",
                role: role
            };

            if (uid) {
                usersByUid[uid] = entityId;
            }
        });


        // =====================================================
        // 11. LẤY FIELD KPI TRỰC TIẾP TỪ CÁC MODULE CỦA TARGET TYPE
        // =====================================================
        const kpiFieldsMap = {};

        const modulesSnapshot = await db
            .collection("organizations")
            .doc(orgId)
            .collection("modules")
            .where("targetType", "==", targetType) // Lọc đúng TEACHER hoặc STUDENT
            .get();

        // Duyệt qua từng module của đối tượng này để bóc tách mảng fields đã được gán lúc tạo module
        modulesSnapshot.forEach(modDoc => {
            const modData = modDoc.data() || {};
            const fieldsArr = Array.isArray(modData.fields) ? modData.fields : [];

            fieldsArr.forEach(fieldObj => {
                if (!fieldObj) return;

                const fieldKey = String(
                    fieldObj.key ||
                    fieldObj.id ||
                    fieldObj.fieldKey ||
                    ""
                ).trim();

                if (!fieldKey) return;

                // Đưa vào map để gom nhóm và lấy đúng cấu hình KPI chi tiết của trường đó
                kpiFieldsMap[fieldKey] = {
                    id: fieldKey,
                    key: fieldKey,
                    name: fieldObj.label || fieldObj.name || fieldKey,
                    label: fieldObj.label || fieldObj.name || fieldKey,
                    type: fieldObj.type || "text",
                    scoreWeight: Number(fieldObj.scoreWeight ?? 0),
                    kpiWeekly: Number(fieldObj.kpiWeekly ?? 0),
                    kpiMonthly: Number(fieldObj.kpiMonthly ?? 0),
                    kpiOptions: (fieldObj.kpiOptions && typeof fieldObj.kpiOptions === "object") ? fieldObj.kpiOptions : {},
                    options: Array.isArray(fieldObj.options) ? fieldObj.options : []
                };
            });
        });

        const kpiFieldsList = Object.values(kpiFieldsMap);

        console.log(
            "📊 [DEBUG] KPI fields chính thức lấy trực tiếp từ module cho " + targetType + ":",
            kpiFieldsList
        );


        // =====================================================
        // 12. DỰNG HEADER
        // =====================================================

        let headerHtml = `

            <th style="width:100px;">
                Mã định danh
            </th>

            <th style="width:180px;">
                Họ và tên
            </th>

            <th style="width:130px;">
                ${targetType === "TEACHER"
                    ? "Tổ chuyên môn"
                    : "Lớp"}
            </th>
        `;


        kpiFieldsList.forEach(field => {

            headerHtml += `

                <th style="
                    text-align:center;
                    min-width:110px;
                ">
                    ${field.name}
                </th>
            `;
        });


        headerHtml += `

            <th style="
                width:90px;
                text-align:center;
            ">
                Tổng lượt
            </th>

            <th style="
                width:110px;
                text-align:center;
            ">
                Số điểm bị trừ
            </th>

            <th style="
                width:110px;
                text-align:center;
            ">
                Tổng điểm tháng
            </th>

            <th style="
                width:120px;
                text-align:center;
            ">
                Xếp loại tháng
            </th>
        `;


        if (headerRow) {
            headerRow.innerHTML = headerHtml;
        }


        // =====================================================
        // 13. KHỞI TẠO SUMMARY CHO TẤT CẢ ENTITY
        // =====================================================

        const summaryMap = {};

        Object.keys(usersMap).forEach(entityId => {

            const user =
                usersMap[entityId];

            summaryMap[entityId] = {
				id: entityId,
				code: user.code, // 🌟 Truyền code vào đây
				name: user.fullName,
				className: user.category,

                // Tổng tất cả lượt KPI
                totalCount:
                    0,

                // Tổng điểm âm dạng dương
                totalPenalty:
                    0,

                // Tổng điểm dương
                totalBonus:
                    0,

                // Điểm ròng
                totalScore:
                    0,

                // Số lượt vi phạm âm
                negativeCount:
                    0,

                // Các tuần có ít nhất 1 KPI âm
                negativeWeeks:
                    new Set(),

                // Số lượt của từng KPI
                kpiCounts:
                    {}
            };
        });


        // =====================================================
        // 14. LẤY MODULE
        //
        // modules/{moduleId}
        // =====================================================

        //const modulesSnapshot =
        //    await db
        //        .collection("organizations")
        //        .doc(orgId)
        //        .collection("modules")
        //       .get();


        const moduleDocs =
            modulesSnapshot.docs.filter(modDoc => {

                const modData =
                    modDoc.data() || {};

                const modTargetType =
                    String(
                        modData.targetType || ""
                    )
                        .trim()
                        .toUpperCase();

                return modTargetType === targetType;
            });


        if (moduleDocs.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="30"
                        style="
                            text-align:center;
                            color:#6c757d;
                            padding:20px;
                        ">
                        Không tìm thấy module cho
                        ${targetType === "TEACHER"
                            ? "Giáo viên"
                            : "Học sinh"}.
                    </td>
                </tr>
            `;

            return;
        }


        // =====================================================
        // 15. ĐỌC RECORDS CỦA TỪNG MODULE
        //
        // Đường dẫn thực tế:
        //
        // academicYears/{year}/modulesData/{moduleId}/records
        //
        // Record:
        //
        // {
        //     entityId: "KL001",
        //     date: "2026-09-17",
        //     KetQuaKiemTraKhaoSat: [
        //         {
        //             value: "...",
        //             email: "...",
        //             by: "...",
        //             time: "..."
        //         }
        //     ]
        // }
        // =====================================================

        for (
            const moduleDoc
            of moduleDocs
        ) {

            const recordsSnapshot =
                await db
                    .collection("organizations")
                    .doc(orgId)
                    .collection("academicYears")
                    .doc(academicYearId)
                    .collection("modulesData")
                    .doc(moduleDoc.id)
                    .collection("records")
                    .get();


            recordsSnapshot.forEach(recordDoc => {

                const data =
                    recordDoc.data() || {};


                // -------------------------------------------------
                // XÁC ĐỊNH ENTITY ID
                // -------------------------------------------------

                let entityId =
                    data.entityId ||
                    data.targetId ||
                    "";


                if (!entityId) {

                    const recordId =
                        String(
                            recordDoc.id || ""
                        );

                    // Ví dụ:
                    // KL001_2026-09-17
                    entityId =
                        recordId.split("_")[0];
                }


                entityId =
                    String(
                        entityId || ""
                    ).trim();

                // Record mới lưu entityId = code.
                // Record cũ có thể vẫn lưu UID -> đổi UID về code.
                if (!summaryMap[entityId] && usersByUid[entityId]) {
                    entityId = usersByUid[entityId];
                }

                if (
                    !entityId ||
                    !summaryMap[entityId]
                ) {
                    return;
                }


                // -------------------------------------------------
                // CHỈ LẤY RECORD TRONG THÁNG
                // -------------------------------------------------

                const recordDate =
                    String(
                        data.date || ""
                    ).trim();


                if (
                    !recordDate ||
                    recordDate < firstDayStr ||
                    recordDate > lastDayStr
                ) {
                    return;
                }


                // -------------------------------------------------
                // TÍNH TUẦN THỨ HAI -> CHỦ NHẬT
                //
                // Chỉ thêm tuần khi tuần đó có KPI âm.
                // -------------------------------------------------

                function getMondayKey(dateString) {

                    const d =
                        new Date(
                            `${dateString}T00:00:00`
                        );

                    if (
                        isNaN(
                            d.getTime()
                        )
                    ) {
                        return "";
                    }

                    const day =
                        d.getDay();

                    const diff =
                        day === 0
                            ? -6
                            : 1 - day;

                    d.setDate(
                        d.getDate() + diff
                    );

                    return [
                        d.getFullYear(),
                        String(
                            d.getMonth() + 1
                        ).padStart(2, "0"),
                        String(
                            d.getDate()
                        ).padStart(2, "0")
                    ].join("-");
                }


                const weekKey =
                    getMondayKey(recordDate);


                // -------------------------------------------------
                // TỪNG FIELD KPI
                // -------------------------------------------------

                kpiFieldsList.forEach(kpiField => {

                    const fieldKey =
                        kpiField.key;


                    let value =
                        data[fieldKey];


                    // Fallback nếu record có changes
                    if (
                        value === undefined &&
                        data.changes &&
                        data.changes[fieldKey] !== undefined
                    ) {
                        value =
                            data.changes[fieldKey];
                    }


                    if (
                        value === undefined ||
                        value === null ||
                        value === ""
                    ) {
                        return;
                    }


                    // =================================================
                    // A. FIELD OPTIONS
                    //
                    // Record thực tế:
                    //
                    // [
                    //   {
                    //      value: "Chất lượng...",
                    //      email: "...",
                    //      by: "...",
                    //      time: "..."
                    //   }
                    // ]
                    // =================================================

                    if (
                        Array.isArray(value)
                    ) {

                        value.forEach(item => {

                            let optionValue =
                                item;


                            if (
                                item &&
                                typeof item === "object"
                            ) {

                                optionValue =
                                    item.value !== undefined
                                        ? item.value
                                        : item.label !== undefined
                                            ? item.label
                                            : item.name !== undefined
                                                ? item.name
                                                : "";
                            }


                            optionValue =
                                String(
                                    optionValue || ""
                                ).trim();


                            if (!optionValue) {
                                return;
                            }


                            // -----------------------------------------
                            // LẤY CẤU HÌNH OPTION
                            // -----------------------------------------

                            const optionConfig =
                                kpiField.kpiOptions &&
                                typeof kpiField.kpiOptions === "object"
                                    ? kpiField.kpiOptions[optionValue]
                                    : null;


                            let scoreWeight =
                                0;


                            if (
                                optionConfig &&
                                optionConfig.scoreWeight !== undefined
                            ) {

                                scoreWeight =
                                    Number(
                                        optionConfig.scoreWeight
                                    );

                            } else {

                                // fallback
                                scoreWeight =
                                    Number(
                                        kpiField.scoreWeight || 0
                                    );
                            }


                            if (
                                !Number.isFinite(
                                    scoreWeight
                                )
                            ) {
                                scoreWeight = 0;
                            }


                            // -----------------------------------------
                            // MỖI OPTION = 1 LƯỢT
                            // -----------------------------------------

                            summaryMap[entityId]
                                .totalCount++;


                            summaryMap[entityId]
                                .kpiCounts[fieldKey] =
                                (
                                    summaryMap[entityId]
                                        .kpiCounts[fieldKey] || 0
                                ) + 1;


                            // -----------------------------------------
                            // ĐIỂM ÂM
                            // -----------------------------------------

                            if (
                                scoreWeight < 0
                            ) {

                                summaryMap[entityId]
                                    .totalPenalty +=
                                    Math.abs(
                                        scoreWeight
                                    );


                                summaryMap[entityId]
                                    .negativeCount++;


                                if (weekKey) {

                                    summaryMap[entityId]
                                        .negativeWeeks
                                        .add(weekKey);
                                }
                            }


                            // -----------------------------------------
                            // ĐIỂM DƯƠNG
                            // -----------------------------------------

                            else if (
                                scoreWeight > 0
                            ) {

                                summaryMap[entityId]
                                    .totalBonus +=
                                    scoreWeight;
                            }


                            // -----------------------------------------
                            // ĐIỂM RÒNG
                            // -----------------------------------------

                            summaryMap[entityId]
                                .totalScore +=
                                scoreWeight;
                        });


                        return;
                    }


                    // =================================================
                    // B. FIELD KPI THƯỜNG
                    //
                    // Không phải options.
                    //
                    // Mỗi giá trị = 1 lượt.
                    // =================================================

                    const scoreWeight =
                        Number(
                            kpiField.scoreWeight || 0
                        );


                    const safeScore =
                        Number.isFinite(scoreWeight)
                            ? scoreWeight
                            : 0;


                    summaryMap[entityId]
                        .totalCount++;


                    summaryMap[entityId]
                        .kpiCounts[fieldKey] =
                        (
                            summaryMap[entityId]
                                .kpiCounts[fieldKey] || 0
                        ) + 1;


                    summaryMap[entityId]
                        .totalScore +=
                        safeScore;


                    if (
                        safeScore < 0
                    ) {

                        summaryMap[entityId]
                            .totalPenalty +=
                            Math.abs(
                                safeScore
                            );


                        summaryMap[entityId]
                            .negativeCount++;


                        if (weekKey) {

                            summaryMap[entityId]
                                .negativeWeeks
                                .add(weekKey);
                        }

                    } else if (
                        safeScore > 0
                    ) {

                        summaryMap[entityId]
                            .totalBonus +=
                            safeScore;
                    }

                });

            });
        }


        // =====================================================
        // 16. LẤY CẤU HÌNH XẾP LOẠI THÁNG
        //
        // KPIconfig/student
        // KPIconfig/teacher
        // =====================================================

        let kpiRules = {

            // Điểm gốc theo từng nhóm, lấy từ KPIconfig/student hoặc teacher.
            // 90 chỉ là fallback cho cấu hình cũ chưa có BasePoint.
            BasePoint: 90,

            kha_weeks: 1,
            kha_count: 5,
            kha_score: 5,

            dat_weeks: 2,
            dat_count: 10,
            dat_score: 10,

            chuadat_weeks: 3,
            chuadat_count: 15,
            chuadat_score: 15
        };


        try {

            const rulesDoc =
                await db
                    .collection("organizations")
                    .doc(orgId)
                    .collection("academicYears")
                    .doc(academicYearId)
                    .collection("KPIconfig")
                    .doc(
                        targetType === "TEACHER"
                            ? "teacher"
                            : "student"
                    )
                    .get();


            if (
                rulesDoc.exists
            ) {

                kpiRules = {
                    ...kpiRules,
                    ...rulesDoc.data()
                };
            }

        } catch (ruleError) {

            console.warn(
                "⚠️ Không đọc được KPIconfig, dùng mặc định:",
                ruleError
            );
        }


        // =====================================================
        // 17. XẾP LOẠI
        //
        // QUY TẮC:
        //
        // Mỗi hàng có 3 ngưỡng:
        // weeks / count / score
        //
        // CHẠM BẤT KỲ NGƯỠNG NÀO
        // => đạt hàng đó.
        //
        // Kiểm tra Chưa đạt -> Đạt -> Khá.
        // =====================================================

        function reachedAnyThreshold(
            weeks,
            count,
            score,
            rules,
            prefix
        ) {

            const weeksThreshold =
                Number(
                    rules[`${prefix}_weeks`]
                ) || 0;

            const countThreshold =
                Number(
                    rules[`${prefix}_count`]
                ) || 0;

            const scoreThreshold =
                Number(
                    rules[`${prefix}_score`]
                ) || 0;


            return (
                (
                    weeksThreshold > 0 &&
                    weeks >= weeksThreshold
                ) ||
                (
                    countThreshold > 0 &&
                    count >= countThreshold
                ) ||
                (
                    scoreThreshold > 0 &&
                    score >= scoreThreshold
                )
            );
        }


        const basePointRaw =
            Number(
                kpiRules.BasePoint ??
                kpiRules.basePoint ??
                90
            );

        const basePoint =
            Number.isFinite(basePointRaw)
                ? basePointRaw
                : 90;

        console.log(
            "🎯 BasePoint tháng:",
            {
                targetType,
                BasePoint: basePoint
            }
        );


        const processedList =
            Object.values(summaryMap)
                .map(item => {

                    // Tổng điểm KPI âm được lưu dưới dạng số dương
                    // để thể hiện số điểm bị trừ.
                    const totalPenalty =
                        Number(
                            item.totalPenalty || 0
                        );

                    // Tổng điểm KPI dương.
                    const totalBonus =
                        Number(
                            item.totalBonus || 0
                        );

                    const negativeCount =
                        Number(
                            item.negativeCount || 0
                        );

                    const negativeWeeks =
                        item.negativeWeeks instanceof Set
                            ? item.negativeWeeks.size
                            : 0;


                    // ---------------------------------------------
                    // ĐIỂM THÁNG
                    //
                    // Điểm gốc theo nhóm
                    // - Tổng điểm KPI âm
                    // + Tổng điểm KPI dương
                    //
                    // Ví dụ:
                    // BasePoint = 80
                    // KPI âm = 7
                    // KPI dương = 3
                    // => Điểm tháng = 76
                    // ---------------------------------------------

                    const totalPoints =
                        basePoint -
                        totalPenalty +
                        totalBonus;


                    // ---------------------------------------------
                    // XẾP LOẠI
                    //
                    // Ngưỡng score vẫn dùng tổng điểm KPI âm,
                    // không dùng điểm tháng cuối cùng.
                    // ---------------------------------------------

                    let rank =
                        "🟢 Tốt";

                    let badgeStyle =
                        "background:#d1e7dd;color:#0f5132;";


                    const actualPenalty =
                        totalPenalty;


                    // CHƯA ĐẠT
                    if (
                        reachedAnyThreshold(
                            negativeWeeks,
                            negativeCount,
                            actualPenalty,
                            kpiRules,
                            "chuadat"
                        )
                    ) {

                        rank = "🔴 Chưa đạt";

                        badgeStyle =
                            "background:#f8d7da;color:#842029;";
                    }

                    // ĐẠT
                    else if (
                        reachedAnyThreshold(
                            negativeWeeks,
                            negativeCount,
                            actualPenalty,
                            kpiRules,
                            "dat"
                        )
                    ) {

                        rank = "🟠 Đạt";

                        badgeStyle =
                            "background:#fff3cd;color:#664d03;";
                    }

                    // KHÁ
                    else if (
                        reachedAnyThreshold(
                            negativeWeeks,
                            negativeCount,
                            actualPenalty,
                            kpiRules,
                            "kha"
                        )
                    ) {

                        rank = "🟡 Khá";

                        badgeStyle =
                            "background:#fff3cd;color:#664d03;";
                    }


                    return {

                        ...item,

                        totalPenalty:
                            totalPenalty,

                        totalBonus:
                            totalBonus,

                        totalPoints:
                            totalPoints,

                        negativeCount:
                            negativeCount,

                        negativeWeeks:
                            negativeWeeks,

                        basePoint:
                            basePoint,

                        rank:
                            rank,

                        badgeStyle:
                            badgeStyle
                    };
                });


        // =====================================================
        // 18. RESULT
        // =====================================================

        const resultList = {

            fields:
                kpiFieldsList,

            data:
                processedList
        };


        // =====================================================
        // 19. CACHE
        // =====================================================

        if (
            typeof cachedGridMonthlyData !== "undefined"
        ) {

            cachedGridMonthlyData[cacheKey] =
                resultList;
        }


        // =====================================================
        // 20. RENDER
        // =====================================================

        renderMonthlyTable(
            resultList,
            filterKeyword
        );


        if (badge) {

            badge.innerText =
                `🌐 Cập nhật kỳ ${firstDayStr} → ${lastDayStr}`;
        }


        // =====================================================
        // 21. DEBUG
        // =====================================================

        const debugKL001 =
            processedList.find(
                item =>
                    item.code === "KL001" ||
                    item.id === "KL001"
            );


        if (debugKL001) {

            console.log(
                "🔎 KPI MONTHLY KL001:",
                {
                    totalCount:
                        debugKL001.totalCount,

                    kpiCounts:
                        debugKL001.kpiCounts,

                    totalPenalty:
                        debugKL001.totalPenalty,

                    totalBonus:
                        debugKL001.totalBonus,

                    totalPoints:
                        debugKL001.totalPoints,

                    negativeCount:
                        debugKL001.negativeCount,

                    negativeWeeks:
                        debugKL001.negativeWeeks,

                    rank:
                        debugKL001.rank
                }
            );
        }


    } catch (error) {

        console.error(
            "❌ Lỗi loadGridSection3Monthly():",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="30"
                    style="
                        text-align:center;
                        color:red;
                        padding:20px;
                    ">
                    Lỗi tải dữ liệu tổng hợp tháng:
                    ${error.message || error}
                </td>
            </tr>
        `;
    }
}



	
	
	

	// Hàm render bảng tháng kèm hỗ trợ lọc theo từ khóa
	function renderMonthlyTable(
		resultObj,
		filterKeyword = ""
	) {

		const tableBody =
			document.getElementById(
				"grid-sec3-body-rows"
			);


		if (!tableBody) return;


		// =====================================================
		// 1. DỮ LIỆU
		// =====================================================

		const kpiFields =
			resultObj.fields || [];


		const rawDataList =
			resultObj.data || [];


		// =====================================================
		// 2. LỌC THEO TỪ KHÓA
		// =====================================================

		const keyword =
			(filterKeyword || "")
				.trim()
				.toLowerCase();


		const dataList =
			rawDataList.filter(item => {

				if (!keyword) {
					return true;
				}


				const matchId =
					String(
						item.id || ""
					)
						.toLowerCase()
						.includes(keyword);


				const matchName =
					String(
						item.name || ""
					)
						.toLowerCase()
						.includes(keyword);


				const matchClass =
					String(
						item.className || ""
					)
						.toLowerCase()
						.includes(keyword);


				return (
					matchId ||
					matchName ||
					matchClass
				);
			});


		// =====================================================
		// 3. TỔNG SỐ CỘT
		//
		// 3 cột thông tin:
		//   Mã ID
		//   Họ và tên
		//   Lớp / Tổ
		//
		// + số KPI
		//
		// + 4 cột tổng:
		//   Tổng lượt
		//   Tổng điểm trừ
		//   Tổng điểm
		//   Xếp loại tháng
		// =====================================================

		const totalCols =
			3 +
			kpiFields.length +
			4;


		// =====================================================
		// 4. KHÔNG CÓ DỮ LIỆU
		// =====================================================

		if (dataList.length === 0) {

			tableBody.innerHTML = `

				<tr>

					<td
						colspan="${totalCols}"
						style="
							text-align:center;
							font-style:italic;
							color:#6c757d;
							padding:20px;
						"
					>
						Không tìm thấy dữ liệu phù hợp
						trong tháng này.
					</td>

				</tr>

			`;

			return;
		}


		// =====================================================
		// 5. RENDER
		// =====================================================

		let html = "";


		dataList.forEach(item => {

			let rowHtml = `
				<tr style="border-bottom:1px solid #dee2e6;">
					<!-- MÃ ID -->
					<td style="vertical-align:middle;">
						<b>${item.code || item.id || ""}</b>
					</td>
					<!-- HỌ VÀ TÊN -->
					<td style="vertical-align:middle;">
						${item.name || ""}
					</td>


					<!-- =====================================
						 LỚP / TỔ CHUYÊN MÔN
						 ===================================== -->

					<td
						style="
							vertical-align:middle;
							text-align:center;
						"
					>

						<span
							style="
								background:#e9ecef;
								padding:2px 6px;
								border-radius:4px;
								font-size:0.9em;
							"
						>
							${
								item.className ||
								"Chưa phân loại"
							}
						</span>

					</td>

			`;


			// =================================================
			// 6. CÁC CỘT KPI
			// =================================================

			kpiFields.forEach(field => {

				const countVal =
					(
						item.kpiCounts &&
						item.kpiCounts[field.id]
					) || 0;


				rowHtml += `

					<td
						style="
							text-align:center;
							vertical-align:middle;
						"
					>

						${
							countVal > 0

								? `
									<span
										style="
											color:#dc3545;
											font-weight:bold;
											font-size:1.05em;
										"
									>
										${countVal}
									</span>
								  `

								: `
									<span
										style="
											color:#ccc;
										"
									>
										0
									</span>
								  `
						}

					</td>

				`;
			});


			// =================================================
			// 7. TỔNG LƯỢT
			// =================================================

			const totalCount =
				Number(
					item.totalCount || 0
				);

			// =================================================
			// 9. TỔNG ĐIỂM THƯỞNG
			// =================================================

			const totalBonus =
				Number(
					item.totalBonus || 0
				);


			// =================================================
			// 8. TỔNG ĐIỂM TRỪ
			// =================================================

			const totalPenalty =
				Number(
					item.totalPenalty || 0
				)-totalBonus;


			
			// =================================================
			// 10. TỔNG ĐIỂM THÁNG
			//
			// Công thức:
			//
			// 90 - điểm lỗi + điểm thưởng
			//
			// Ví dụ:
			//
			// lỗi = 6
			// thưởng = 4
			//
			// 90 - 6 + 4 = 88
			//
			// Ưu tiên sử dụng totalPoints đã tính
			// trong loadGridSection3Monthly().
			// Nếu cache cũ chưa có totalPoints,
			// tự tính lại tại đây.
			// =================================================

			const totalPoints =
				item.totalPoints !== undefined &&
				item.totalPoints !== null

					? Number(
						item.totalPoints
					)

					: (
						90 - totalPenalty
						//totalPenalty +
						//totalBonus
					);


			// =================================================
			// 11. THÊM CÁC CỘT TỔNG
			// =================================================

			rowHtml += `

				<!-- =========================================
					 TỔNG LƯỢT
					 ========================================= -->

				<td
					style="
						text-align:center;
						vertical-align:middle;
						font-weight:bold;
					"
				>
					${totalCount}
				</td>


				<!-- =========================================
					 TỔNG ĐIỂM TRỪ
					 ========================================= -->

				<td
					style="
						text-align:center;
						vertical-align:middle;
						color:#dc3545;
						font-weight:bold;
					"
				>
					${totalPenalty}đ
				</td>


				<!-- =========================================
					 TỔNG ĐIỂM
					 ========================================= -->

				<td
					style="
						text-align:center;
						vertical-align:middle;
						font-weight:bold;
						font-size:1.05em;
					"
				>
					${totalPoints}đ
				</td>


				<!-- =========================================
					 XẾP LOẠI THÁNG
					 ========================================= -->

				<td
					style="
						text-align:center;
						vertical-align:middle;
					"
				>

					<span
						style="
							${item.badgeStyle || ""}
							padding:3px 10px;
							border-radius:4px;
							font-weight:bold;
							display:inline-block;
						"
					>
						${item.rank || "🟢 Tốt"}
					</span>

				</td>

			`;


			rowHtml += `
				</tr>
			`;


			html +=
				rowHtml;
		});


		// =====================================================
		// 12. ĐƯA HTML VÀO BẢNG
		// =====================================================

		tableBody.innerHTML =
			html;
	}

	// Hàm debounce lọc trực tiếp trên RAM khi gõ ở ô input tháng

	let filterSec3DebounceTimer;

	function filterGridSection3Table(event) {
		const filterInput = document.getElementById("grid-sec3-filter-class");
		const targetTypeSelect = document.getElementById("grid-sec3-target-type");
		const monthInput = document.getElementById("grid-sec3-month-select");

		if (!filterInput) return;

		const keyword = filterInput.value.trim();
		
		// Nếu người dùng nhấn Enter, cho phép ép buộc tải lại từ Firestore
		if (event && event.key === 'Enter') {
			loadGridSection3Monthly(false);
			return;
		}

		const targetType = targetTypeSelect ? targetTypeSelect.value : "STUDENT";
		const activeYear = window.currentAcademicYearIdGlobal || window.currentAcademicYear || "";
		
		const cacheKey = `${activeYear}_${targetType.toLowerCase()}_monthly_${monthInput ? monthInput.value : ""}`;

		clearTimeout(filterSec3DebounceTimer);
		filterSec3DebounceTimer = setTimeout(() => {
			if (typeof cachedGridMonthlyData !== 'undefined' && cachedGridMonthlyData[cacheKey]) {
				// ⚡ Lọc hiển thị trực tiếp trên RAM (0 đồng quota Firebase)
				renderMonthlyTable(cachedGridMonthlyData[cacheKey], keyword);
			} else {
				const tableBody = document.getElementById("grid-sec3-body-rows");
				if (tableBody && keyword.length > 0) {
					console.log("Chưa có cache cho đối tượng/tháng này, vui lòng bấm nút tải dữ liệu.");
				}
			}
		}, 200);
	}

	// ==========================================
	// 6. SECTION 5.4: TRA CỨU & IN PHIẾU ĐỐI SOÁT
	// ==========================================
	// ==========================================
async function searchIndividualAuditSheet(forceRefresh = false) {

	const keywordInput =
		document.getElementById("lookup-entity-keyword");

	if (!keywordInput) return;

	const rawKeyword =
		keywordInput.value.trim();

	if (!rawKeyword) {
		alert("Vui lòng nhập Mã định danh hoặc Tên cá nhân cần tra cứu!");
		return;
	}

	const keyword =
		rawKeyword.toLowerCase();

	const nameEl =
		document.getElementById("sheet-entity-name");

	const categoryEl =
		document.getElementById("sheet-entity-category");

	const idEl =
		document.getElementById("sheet-entity-id");

	const rankEl =
		document.getElementById("sheet-entity-rank");

	const violationsListEl =
		document.getElementById("sheet-violations-list");

	if (violationsListEl) {
		violationsListEl.innerHTML =
			'<div style="color:#6c757d;font-style:italic;">' +
			'Đang tra cứu dữ liệu từ hệ thống...' +
			'</div>';
	}

	try {

		const orgId =
			window.currentOrgIdGlobal;

		if (!orgId) {
			alert("Chưa xác định được thông tin đơn vị (OrgId).");
			return;
		}

		// =====================================================
		// 1. XÁC ĐỊNH NĂM HỌC
		// =====================================================

		let academicYearId = "";

		const yearsArr =
			window.currentAcademicYearsGlobal;

		if (
			Array.isArray(yearsArr) &&
			yearsArr.length > 0
		) {

			const lastYearItem =
				yearsArr[yearsArr.length - 1];

			academicYearId =
				String(
					typeof lastYearItem === "object" &&
					lastYearItem !== null
						? (
							lastYearItem.id ||
							lastYearItem.name ||
							lastYearItem.year
						)
						: lastYearItem
				).trim();

		} else if (
			window.currentAcademicYearIdGlobal
		) {

			academicYearId =
				String(
					window.currentAcademicYearIdGlobal
				).trim();
		}

		if (!academicYearId) {
			alert("Chưa xác định được năm học hiện tại.");
			return;
		}

		const db =
			firebase.firestore();

		// =====================================================
		// 2. KHỞI TẠO CACHE RAM
		// =====================================================

		window.individualAuditUserCache =
			window.individualAuditUserCache ||
			new Map();

		window.individualAuditModulesCache =
			window.individualAuditModulesCache ||
			new Map();

		window.individualAuditResultCache =
			window.individualAuditResultCache ||
			new Map();

		// =====================================================
		// 3. XÁC ĐỊNH KỲ TRA CỨU
		// =====================================================
		//
		// Ưu tiên ngày bắt đầu / kết thúc nếu giao diện đã nhập.
		// Nếu giao diện có bộ chọn tháng nhưng chưa nhập ngày,
		// tự đọc cấu hình:
		//
		// organizations/{orgId}.reportingPeriod.monthly.startDay
		//
		// Ví dụ startDay = 21:
		// Tháng 10/2026 => 21/09/2026 -> 20/10/2026.
		//
		// Nếu giao diện không có bộ chọn tháng và cũng không có
		// ngày bắt đầu/kết thúc thì giữ ALL để không làm thay đổi
		// hành vi tra cứu cũ.
		//

		const startDateEl =
			document.getElementById(
				"lookup-audit-start-date"
			);

		const endDateEl =
			document.getElementById(
				"lookup-audit-end-date"
			);

		let startDate =
			startDateEl?.value?.trim() || "";

		let endDate =
			endDateEl?.value?.trim() || "";

		// Hỗ trợ nhiều ID có thể được dùng cho bộ chọn tháng.
		const auditMonthEl =
			document.getElementById("lookup-audit-month-select") ||
			document.getElementById("lookup-audit-month") ||
			document.getElementById("emp-individual-month-select");

		const selectedAuditMonth =
			auditMonthEl?.value?.trim() || "";

		if (
			!startDate &&
			!endDate &&
			selectedAuditMonth &&
			/^\d{4}-\d{2}$/.test(selectedAuditMonth)
		) {
			const [selectedYear, selectedMonth] =
				selectedAuditMonth.split("-").map(Number);

			// Mặc định an toàn: tháng dương lịch.
			let monthlyStartDay = 1;

			try {
				const reportingConfigDoc =
					await db
						.collection("organizations")
						.doc(orgId)
						.get();

				const reportingConfig =
					reportingConfigDoc.exists
						? reportingConfigDoc.data()?.reportingPeriod
						: null;

				const configuredStartDay =
					Number(
						reportingConfig?.monthly?.startDay
					);

				if (
					Number.isInteger(configuredStartDay) &&
					configuredStartDay >= 1 &&
					configuredStartDay <= 31
				) {
					monthlyStartDay = configuredStartDay;
				}
			} catch (periodConfigError) {
				console.warn(
					"[AUDIT PERIOD] Không đọc được cấu hình kỳ báo cáo, dùng ngày 1:",
					periodConfigError
				);
			}

			// selectedAuditMonth được hiểu là tháng kết thúc kỳ.
			const selectedMonthLastDay =
				new Date(
					selectedYear,
					selectedMonth,
					0
				).getDate();

			// Ngày bắt đầu thuộc tháng ngay trước tháng được chọn.
			// Vì vậy phải lấy số ngày của tháng trước để xử lý
			// an toàn khi cấu hình là 29/30/31.
			const previousMonthLastDay =
				new Date(
					selectedYear,
					selectedMonth - 1,
					0
				).getDate();

			const actualStartDay =
				monthlyStartDay === 1
					? 1
					: Math.min(
						monthlyStartDay,
						previousMonthLastDay
					);

			const startDateObj =
				new Date(
					selectedYear,
					selectedMonth - 2,
					actualStartDay
				);

			const endDateObj =
				monthlyStartDay === 1
					? new Date(
						selectedYear,
						selectedMonth,
						0
					)
					: new Date(
						selectedYear,
						selectedMonth - 1,
						actualStartDay - 1
					);

			const formatDate =
				date => [
					date.getFullYear(),
					String(date.getMonth() + 1).padStart(2, "0"),
					String(date.getDate()).padStart(2, "0")
				].join("-");

			startDate = formatDate(startDateObj);
			endDate = formatDate(endDateObj);

			console.log(
				"[AUDIT PERIOD] Kỳ báo cáo:",
				{
					selectedMonth: selectedAuditMonth,
					startDay: monthlyStartDay,
					startDate,
					endDate,
					selectedMonthLastDay,
					previousMonthLastDay
				}
			);
		}

		// Nếu chỉ có một trong hai ngày được nhập thì không ép
		// thành kỳ tháng; giữ nguyên logic lọc hiện tại.
		
		// =====================================================
		// 4. CACHE KEY
		// =====================================================

		const cacheKey =
			[
				orgId,
				academicYearId,
				keyword,
				startDate || "ALL",
				endDate || "ALL"
			].join("__");

		if (
			!forceRefresh &&
			window.individualAuditResultCache.has(cacheKey)
		) {

			console.log(
				"[AUDIT CACHE] HIT:",
				cacheKey
			);

			const cachedResult =
				window.individualAuditResultCache.get(
					cacheKey
				);

			renderIndividualAuditSheet(cachedResult);

			return cachedResult;
		}

		console.log(
			"[AUDIT CACHE] MISS:",
			cacheKey
		);

		// =====================================================
		// 5. TÌM USER
		// =====================================================

		let foundUser = null;

		// -----------------------------------------------------
		// 5A. ƯU TIÊN CACHE THÀNH VIÊN
		// -----------------------------------------------------
		//
		// Mã định danh chính = code.
		// UID chỉ dùng để tương thích dữ liệu cũ.
		//

		const preloadedEntities =
		    window.card2CachedMembers ||
		    window.currentLoadedEntities ||
		    [];

		if (
		    Array.isArray(preloadedEntities) &&
		    preloadedEntities.length > 0
		) {

		    foundUser =
		        preloadedEntities.find(u => {

		            const uCode =
		                String(
		                    u.code || ""
		                ).trim().toLowerCase();

		            const uId =
		                String(
		                    u.id ||
		                    u.uid ||
		                    ""
		                ).trim().toLowerCase();

		            const uName =
		                String(
		                    u.fullName ||
		                    ""
		                ).trim().toLowerCase();

		            return (
		                uCode === keyword ||
		                uId === keyword ||
		                uName.includes(keyword)
		            );
		        });
		}


		// -----------------------------------------------------
		// 5B. CACHE USER RIÊNG
		// -----------------------------------------------------

		if (!foundUser) {

		    const cachedUser =
		        window.individualAuditUserCache.get(
		            keyword
		        );

		    if (cachedUser) {
		        foundUser = cachedUser;
		    }
		}


		// -----------------------------------------------------
		// 5C. TRA CỨU USERS COLLECTION
		// -----------------------------------------------------
		//
		// Tìm theo thứ tự:
		// code -> UID/document ID -> tên.
		//

		if (!foundUser) {

		    console.log(
		        "[AUDIT USER LOOKUP]:",
		        rawKeyword
		    );

		    const usersSnap =
		        await db
		            .collection("organizations")
		            .doc(orgId)
		            .collection("users")
		            .get();

		    usersSnap.forEach(uDoc => {

		        if (foundUser) return;

		        const uData =
		            uDoc.data() || {};

		        const code =
		            String(
		                uData.code || ""
		            ).trim();

		        const uid =
		            String(
		                uData.uid ||
		                uDoc.id ||
		                ""
		            ).trim();

		        const fullName =
		            String(
		                uData.fullName ||
		                uData.displayName ||
		                uData.name ||
		                ""
		            ).trim();

		        const codeLower =
		            code.toLowerCase();

		        const uidLower =
		            uid.toLowerCase();

		        const nameLower =
		            fullName.toLowerCase();

		        if (
		            codeLower === keyword ||
		            uidLower === keyword ||
		            nameLower.includes(keyword)
		        ) {

		            foundUser = {
		                // code là ID chính của hệ thống mới.
		                id:
		                    code ||
		                    uid,

		                code:
		                    code,

		                uid:
		                    uid,

		                fullName:
		                    fullName ||
		                    code ||
		                    uid,

		                category:
		                    uData.category ||
		                    uData.className ||
		                    "Chưa phân loại"
		            };
		        }
		    });
		}


		// Chuẩn hóa user tìm được.
		// code là mã dùng để hiển thị và truy vấn dữ liệu mới.
		if (foundUser) {
		    foundUser.code =
		        String(
		            foundUser.code ||
		            ""
		        ).trim();

		    foundUser.uid =
		        String(
		            foundUser.uid ||
		            foundUser.id ||
		            ""
		        ).trim();

		    foundUser.id =
		        foundUser.code ||
		        foundUser.id ||
		        foundUser.uid;
		}

		// =====================================================
		// 6. KHÔNG TÌM THẤY
		// =====================================================

		if (!foundUser) {

			if (nameEl)
				nameEl.innerText =
					"Không tìm thấy";

			if (categoryEl)
				categoryEl.innerText =
					"---";

			if (idEl)
				idEl.innerText =
					rawKeyword.toUpperCase();

			if (rankEl)
				rankEl.innerText =
					"---";

			if (violationsListEl) {

				violationsListEl.innerHTML =
					'<div style="color:red;font-style:italic;">' +
					'Không tìm thấy thông tin cá nhân phù hợp với từ khóa.' +
					'</div>';
			}

			return null;
		}
		// Cache theo code là khóa chính.
		if (foundUser.code) {
		    window.individualAuditUserCache.set(
		        String(foundUser.code).toLowerCase(),
		        foundUser
		    );
		}

		// Cache thêm UID để hỗ trợ dữ liệu lịch sử.
		if (foundUser.uid) {
		    window.individualAuditUserCache.set(
		        String(foundUser.uid).toLowerCase(),
		        foundUser
		    );
		}

		// =====================================================
		// 7. HIỂN THỊ THÔNG TIN CÁ NHÂN
		// =====================================================

		if (nameEl)
			nameEl.innerText =
				foundUser.fullName;

		if (categoryEl)
			categoryEl.innerText =
				foundUser.category ||
				foundUser.className ||
				"Chưa phân loại";

		if (idEl)
			idEl.innerText =
				foundUser.code || foundUser.id || "";

		// =====================================================
		// 8. FIELD LABEL MAP
		// =====================================================

		const fieldLabelMap = {};

		const currentFields =
			window.cachedSchemaFields || [];

		currentFields.forEach(f => {

			if (f?.key) {

				fieldLabelMap[f.key] =
					f.label ||
					f.key;
			}
		});

		// =====================================================
		// 9. MODULE CACHE
		// =====================================================

		const modulesCacheKey =
			`${orgId}__${academicYearId}`;

		let modules =
			window.individualAuditModulesCache.get(
				modulesCacheKey
			);

		if (modules) {

			console.log(
				"[AUDIT MODULE CACHE] HIT:",
				modules.length
			);

		} else {

			const modulesSnap =
				await db
					.collection("organizations")
					.doc(orgId)
					.collection("modules")
					.get();

			modules =
				modulesSnap.docs.map(doc => ({
					id: doc.id,
					...doc.data()
				}));

			window.individualAuditModulesCache.set(
				modulesCacheKey,
				modules
			);

			console.log(
				"[AUDIT MODULE READ] docs:",
				modules.length
			);
		}

		// =====================================================
		// 10. QUERY AUDIT LOGS
		// =====================================================
		//
		// Điểm quan trọng:
		//
		// Không còn:
		//
		//   .where("entityId", "==", foundUser.id)
		//   .get()
		//
		// nếu có khoảng ngày.
		//
		// Khi có start/end:
		//
		//   entityId == UID
		//   timestamp >= start
		//   timestamp < end + 1 ngày
		//
		// =====================================================

		const modulePromises =
		    modules.map(async mod => {

		        // Dữ liệu mới: auditLogs.entityId = code.
		        // Dữ liệu cũ: có thể vẫn là UID.
		        const primaryEntityId =
		            foundUser.code ||
		            foundUser.id;

		        let query =
		            db
		                .collection("organizations")
		                .doc(orgId)
		                .collection("academicYears")
		                .doc(academicYearId)
		                .collection("modulesData")
		                .doc(mod.id)
		                .collection("auditLogs")
		                .where(
		                    "entityId",
		                    "==",
		                    primaryEntityId
		                );

		        // ------------------------------------------------
		        // LỌC THỜI GIAN NGAY TẠI FIRESTORE
		        // ------------------------------------------------

		        if (
		            startDate &&
		            endDate
		        ) {

		            const startDateObj =
		                new Date(
		                    `${startDate}T00:00:00`
		                );

		            const endDateObj =
		                new Date(
		                    `${endDate}T00:00:00`
		                );

		            endDateObj.setDate(
		                endDateObj.getDate() + 1
		            );

		            const startTimestamp =
		                firebase.firestore.Timestamp.fromDate(
		                    startDateObj
		                );

		            const endTimestamp =
		                firebase.firestore.Timestamp.fromDate(
		                    endDateObj
		                );

		            query =
		                query
		                    .where(
		                        "timestamp",
		                        ">=",
		                        startTimestamp
		                    )
		                    .where(
		                        "timestamp",
		                        "<",
		                        endTimestamp
		                    );
		        }

		        let logsSnap =
		            await query.get();

		        let logsDocs =
		            logsSnap.docs;

		        // Nếu chưa có log theo code, thử UID của dữ liệu cũ.
		        if (
		            logsDocs.length === 0 &&
		            foundUser.uid &&
		            foundUser.uid !== primaryEntityId
		        ) {

		            let legacyQuery =
		                db
		                    .collection("organizations")
		                    .doc(orgId)
		                    .collection("academicYears")
		                    .doc(academicYearId)
		                    .collection("modulesData")
		                    .doc(mod.id)
		                    .collection("auditLogs")
		                    .where(
		                        "entityId",
		                        "==",
		                        foundUser.uid
		                    );

		            if (
		                startDate &&
		                endDate
		            ) {

		                const legacyStart =
		                    new Date(
		                        `${startDate}T00:00:00`
		                    );

		                const legacyEnd =
		                    new Date(
		                        `${endDate}T00:00:00`
		                    );

		                legacyEnd.setDate(
		                    legacyEnd.getDate() + 1
		                );

		                legacyQuery =
		                    legacyQuery
		                        .where(
		                            "timestamp",
		                            ">=",
		                            firebase.firestore.Timestamp.fromDate(
		                                legacyStart
		                            )
		                        )
		                        .where(
		                            "timestamp",
		                            "<",
		                            firebase.firestore.Timestamp.fromDate(
		                                legacyEnd
		                            )
		                        );
		            }

		            const legacySnap =
		                await legacyQuery.get();

		            logsDocs =
		                legacySnap.docs;
		        }

		        console.log(
		            "[AUDIT LOG READ]",
		            {
		                moduleId: mod.id,
		                entityId: primaryEntityId,
		                count: logsDocs.length,
		                period:
		                    startDate && endDate
		                        ? `${startDate} → ${endDate}`
		                        : "ALL"
		            }
		        );

		        return {
		            moduleId: mod.id,
		            docs: logsDocs
		        };
		    });

		// =====================================================
		// 11. ĐỌC CÁC MODULE SONG SONG
		// =====================================================

		const moduleResults =
			await Promise.all(
				modulePromises
			);

		// =====================================================
		// 12. GOM KẾT QUẢ
		// =====================================================

		const allViolations = [];

		let auditDocsRead = 0;

		moduleResults.forEach(moduleResult => {

			auditDocsRead +=
				moduleResult.docs.length;

			moduleResult.docs.forEach(logDoc => {

				const logData =
					logDoc.data() || {};

				// ---------------------------------------------
				// Thời gian
				// ---------------------------------------------

				let timeStr =
					"Gần đây";

				let sortTime = 0;

				if (
					logData.timestamp &&
					typeof logData.timestamp.toDate ===
						"function"
				) {

					const dateObj =
						logData.timestamp.toDate();

					sortTime =
						dateObj.getTime();

					timeStr =
						dateObj.toLocaleString(
							"vi-VN"
						);
				}

				// ---------------------------------------------
				// Changes
				// ---------------------------------------------

				const changes =
					logData.changes || {};

				const changeKeys =
					Object.keys(changes);

				if (changeKeys.length > 0) {

					changeKeys.forEach(fieldKey => {

						const val =
							changes[fieldKey];

						const valStr =
							Array.isArray(val)
								? val.join(", ")
								: String(val);

						const displayLabel =
							fieldLabelMap[fieldKey] ||
							fieldKey;

						allViolations.push({

							date:
								timeStr,

							sortTime:
								sortTime,

							content:
								`<b>${escapeHtmlAudit(displayLabel)}:</b> ${escapeHtmlAudit(valStr)}`,

							updater:
								logData.updaterName ||
								logData.updaterEmail ||
								"Hệ thống"
						});
					});

				} else {

					const actionName =
						logData.action ||
						"Cập nhật dữ liệu";

					allViolations.push({

						date:
							timeStr,

						sortTime:
							sortTime,

						content:
							`<b>${escapeHtmlAudit(actionName)}</b>`,

						updater:
							logData.updaterName ||
							logData.updaterEmail ||
							"Hệ thống"
					});
				}
			});
		});

		// =====================================================
		// 13. SẮP XẾP MỚI NHẤT → CŨ NHẤT
		// =====================================================

		allViolations.sort(
			(a, b) =>
				(b.sortTime || 0) -
				(a.sortTime || 0)
		);

		// =====================================================
		// 14. KẾT QUẢ
		// =====================================================

		const result = {

			user:
				foundUser,

			violations:
				allViolations,

			startDate:
				startDate || null,

			endDate:
				endDate || null,

			auditDocsRead:
				auditDocsRead,

			moduleCount:
				modules.length,

			loadedAt:
				Date.now()
		};

		// =====================================================
		// 15. CACHE KẾT QUẢ
		// =====================================================

		window.individualAuditResultCache.set(
			cacheKey,
			result
		);

		console.log(
			"======================================"
		);

		console.log(
			"[AUDIT RESULT]",
			{
				code:

				    foundUser.code || foundUser.id,


				uid:

				    foundUser.uid || "",

				name:
					foundUser.fullName,

				modules:
					modules.length,

				auditDocsRead:
					auditDocsRead,

				violations:
					allViolations.length,

				period:
					startDate && endDate
						? `${startDate} → ${endDate}`
						: "ALL"
			}
		);

		console.log(
			"======================================"
		);

		// =====================================================
		// 16. RENDER
		// =====================================================

		renderIndividualAuditSheet(result);

		return result;

	} catch (error) {

		console.error(
			"Lỗi tra cứu phiếu đối soát:",
			error
		);

		if (violationsListEl) {

			violationsListEl.innerHTML =
				'<div style="color:red;font-style:italic;">' +
				'Lỗi kết nối khi tải dữ liệu đối soát.' +
				'</div>';
		}

		return null;
	}
}



	// ==========================================
	// RENDER PHIẾU ĐỐI SOÁT
	// ==========================================
	function renderIndividualAuditSheet(result) {

		const nameEl =
			document.getElementById(
				"sheet-entity-name"
			);

		const categoryEl =
			document.getElementById(
				"sheet-entity-category"
			);

		const idEl =
			document.getElementById(
				"sheet-entity-id"
			);

		const rankEl =
			document.getElementById(
				"sheet-entity-rank"
			);

		const violationsListEl =
			document.getElementById(
				"sheet-violations-list"
			);

		if (!result || !result.user) {

			if (nameEl)
				nameEl.innerText =
					"Không tìm thấy";

			if (categoryEl)
				categoryEl.innerText =
					"---";

			if (idEl)
				idEl.innerText =
					"---";

			if (rankEl)
				rankEl.innerText =
					"---";

			return;
		}

		const user =
			result.user;

		const violations =
			result.violations || [];

		if (nameEl)
			nameEl.innerText =
				user.fullName ||
				user.id;

		if (categoryEl)
			categoryEl.innerText =
				user.category ||
				"Chưa phân loại";

		if (idEl)
			idEl.innerText =
				user.id;

		if (violations.length > 0) {

			let html = "";

			violations.forEach(v => {

				html +=
					`<div style="padding:6px 0;border-bottom:1px solid #eee;">` +
					`• [${v.date}] ${v.content} ` +
					`<span style="color:#6c757d;font-size:.85em;">` +
					`(Ghi bởi: ${escapeHtmlAudit(v.updater)})` +
					`</span>` +
					`</div>`;
			});

			if (violationsListEl)
				violationsListEl.innerHTML =
					html;

			if (rankEl)
				rankEl.innerText =
					`Có ${violations.length} lượt ghi nhận`;

		} else {

			if (violationsListEl) {

				violationsListEl.innerHTML =
					'<div style="color:#198754;font-style:italic;">' +
					'Không có ghi nhận biến động nào trong kỳ này.' +
					'</div>';
			}

			if (rankEl)
				rankEl.innerText =
					"Tốt";
		}
	}


	// ==========================================
	// ESCAPE HTML
	// ==========================================
	function escapeHtmlAudit(value) {

		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
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
	// ============================================================
	// GLOBAL STATE - EMPLOYEE TABLE
	// ============================================================

	window.currentEmployeeEntitiesGlobal = [];
	window.currentEmployeeModuleConfigGlobal = null;
	window.currentEmployeeDynamicFieldsGlobal = [];
	window.currentEmployeeModuleIdGlobal = "";
	window.currentEmployeeAcademicIdGlobal = "";
	window.currentEmployeeOrgIdGlobal = "";


	// 🌟 1. Chuyển đổi qua lại giữa các Tab của Nhân viên (Từ 1 đến 5)
	async function switchEmpTab(tabIndex) {

		// ============================================================
		// 1. ĐÓNG TẤT CẢ CÁC TAB
		// ============================================================

		for (let i = 1; i <= 5; i++) {

			const tabContent =
				document.getElementById(`emp-tab-sec-${i}`);

			const tabBtn =
				document.getElementById(`btn-emp-tab-${i}`);

			if (tabContent) {
				tabContent.style.display = "none";
			}

			if (tabBtn) {
				tabBtn.style.background = "#e9ecef";
				tabBtn.style.color = "#333";
			}
		}


		// ============================================================
		// 2. HIỂN THỊ TAB ĐƯỢC CHỌN
		// ============================================================

		const activeContent =
			document.getElementById(`emp-tab-sec-${tabIndex}`);

		const activeBtn =
			document.getElementById(`btn-emp-tab-${tabIndex}`);

		if (activeContent) {
			activeContent.style.display = "block";
		}

		if (activeBtn) {
			activeBtn.style.background = "#0d6efd";
			activeBtn.style.color = "white";
		}


		// ============================================================
		// 3. TAB EMPLOYEE ENTRY
		// ============================================================

		if (tabIndex === 1) {

			if (
				typeof refreshAndRenderEmployeeData === "function"
			) {
				await refreshAndRenderEmployeeData();
			}


			/*
			 * Sau khi load xong, bảo đảm các state toàn cục
			 * phản ánh đúng dữ liệu hiện tại.
			 */

			if (
				typeof currentEmployeeEntities !== "undefined"
			) {
				window.currentEmployeeEntitiesGlobal =
					Array.isArray(currentEmployeeEntities)
						? [...currentEmployeeEntities]
						: [];
			}

			if (
				typeof currentModuleConfig !== "undefined"
			) {
				window.currentEmployeeModuleConfigGlobal =
					currentModuleConfig || {};
			}

			if (
				window.currentEmployeeModuleConfigGlobal &&
				Array.isArray(
					window.currentEmployeeModuleConfigGlobal.fields
				)
			) {
				window.currentEmployeeDynamicFieldsGlobal =
					[
						...window.currentEmployeeModuleConfigGlobal.fields
					];
			}
		}


		// ============================================================
		// 4. TAB HOMEROOM
		// ============================================================

		else if (tabIndex === 4) {

			if (
				typeof loadHomeroomClassData === "function"
			) {
				await loadHomeroomClassData();
			}
		}


		// ============================================================
		// 5. TAB AUDIT LOG
		// ============================================================

		else if (tabIndex === 3) {
			await window.initEmployeeAuditMonitorTab();
		}


		// ============================================================
		// 6. TAB DEPARTMENT
		// ============================================================

		else if (tabIndex === 5) {

			if (
				typeof loadDepartmentData === "function"
			) {
				await loadDepartmentData();
			}
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
	
	
	// ============================================================
	// CACHE DỮ LIỆU NHÂN SỰ / RECORDS
	// Dùng chung cho các hàm:
	// - refreshAndRenderEmployeeData()
	// - saveAllEmployeeEntries()
	// - saveSingleEmployeeEntry()
	// - clearSingleCellData()
	// - clearSingleLogEntry()
	// ============================================================

	window.employeeDataCache = {
		orgId: null,
		academicId: null,

		// Danh sách users
		users: [],

		// Cấu hình các module
		modules: {},

		// Records theo module
		// Cấu trúc:
		// records[moduleId][dailyDocId] = dữ liệu record
		records: {},

		// Đánh dấu module nào đã tải records
		loadedModules: {},

		// Ngày mà records đang được cache
		todayStr: null
	};


	// ------------------------------------------------------------
	// Khởi tạo / reset cache khi tổ chức hoặc năm học thay đổi
	// ------------------------------------------------------------
	function resetEmployeeDataCache(orgId, academicId) {

		const cache = window.employeeDataCache;

		// Nếu tổ chức hoặc năm học thay đổi
		// thì dữ liệu cũ không còn phù hợp.
		if (
			cache.orgId !== orgId ||
			cache.academicId !== academicId
		) {

			cache.orgId = orgId;
			cache.academicId = academicId;

			cache.users = [];
			cache.modules = {};
			cache.records = {};
			cache.loadedModules = {};

			cache.todayStr = new Date().toLocaleDateString('en-CA');

			console.log(
				"[EmployeeCache] Đã reset cache:",
				{
					orgId,
					academicId,
					todayStr: cache.todayStr
				}
			);

		} else if (!cache.todayStr) {

			// Trường hợp cache đã có org/năm học
			// nhưng chưa có ngày.
			cache.todayStr = new Date().toLocaleDateString('en-CA');
		}
	}


	// ------------------------------------------------------------
	// Lấy record từ cache
	// ------------------------------------------------------------
	function getCachedEmployeeRecord(moduleId, dailyDocId) {

		const cache = window.employeeDataCache;

		if (!moduleId || !dailyDocId) {
			return null;
		}

		if (
			!cache.records[moduleId] ||
			!cache.records[moduleId][dailyDocId]
		) {
			return null;
		}

		return cache.records[moduleId][dailyDocId];
	}


	// ------------------------------------------------------------
	// Ghi / cập nhật record vào cache
	// ------------------------------------------------------------
	function setCachedEmployeeRecord(moduleId, dailyDocId, data) {

		const cache = window.employeeDataCache;

		if (!moduleId || !dailyDocId) {
			return;
		}

		if (!cache.records[moduleId]) {
			cache.records[moduleId] = {};
		}

		cache.records[moduleId][dailyDocId] = {
			...data
		};
	}


	// ------------------------------------------------------------
	// Xóa record khỏi cache
	// ------------------------------------------------------------
	function removeCachedEmployeeRecord(moduleId, dailyDocId) {

		const cache = window.employeeDataCache;

		if (
			!moduleId ||
			!dailyDocId ||
			!cache.records[moduleId]
		) {
			return;
		}

		delete cache.records[moduleId][dailyDocId];
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

			// 🌟 1) KIỂM TRA NHIỆM VỤ CHÍNH CHỦ (Admin phân công)
			// Document ID trong assignments chính là email của giáo viên
			const emailAssignDoc = await academicYearRef.collection("assignments").doc(teacherEmail).get();
			if (emailAssignDoc.exists) {
				const data = emailAssignDoc.data();
				const mods = Array.isArray(data.modules) ? data.modules : [];
				mods.forEach(m => allowedModuleIds.add(m));
			}

			// 🌟 2) KIỂM TRA NHIỆM VỤ TRỢ GIÚP (Document ID là memberId - xử lý không phân biệt hoa/thường)
			let teacherMemberId = "";
			try {
				const emailDocSnap = await db.collection("emails").doc(teacherEmail).get();
				if (emailDocSnap.exists) {
					const emailData = emailDocSnap.data();
					// Lấy code hoặc uid, sau đó ép về chữ thường (.toLowerCase()) để đồng nhất với assignments
					const rawMemberId = emailData.code || emailData.uid || "";
					if (rawMemberId) {
						teacherMemberId = String(rawMemberId).toLowerCase().trim();
					}
				}
			} catch (e) {
				console.warn("Không đọc được collection emails:", e);
			}

			// Nếu tìm thấy memberId, kiểm tra xem có document tương ứng trong assignments không
			if (teacherMemberId) {
				const memberAssignDoc = await academicYearRef.collection("assignments").doc(teacherMemberId).get();
				if (memberAssignDoc.exists) {
					const data = memberAssignDoc.data();
					const mods = Array.isArray(data.modules) ? data.modules : [];
					mods.forEach(m => allowedModuleIds.add(m));
				}
			}

			// 3) Bổ sung kiểm tra bảng supporters (biên bản 30 phút) để đảm bảo an toàn tuyệt đối
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

		modulesList.forEach((item, index) => {
			const option = document.createElement("option");
			option.value = item.id;
			option.textContent = item.title;
			if (index === 0) option.selected = true;
			moduleSelect.appendChild(option);
		});

		switchEmployeeModule();
	}

	// 2. Sự kiện khi thay đổi Nhiệm vụ / Module trên giao diện
	async function switchEmployeeModule() {

		const selectedModuleId =
			document.getElementById("emp-module-select")?.value || "";

		const selectedAcademicYear =
			document.getElementById("emp-academic-year-select")?.value || "";

		const orgId =
			window.currentOrgIdGlobal;


		// ============================================================
		// 1. CẬP NHẬT MODULE HIỆN TẠI
		// ============================================================

		window.currentModuleIdGlobal =
			selectedModuleId;


		if (!selectedModuleId) {
			return;
		}


		console.log(
			`Đã chọn module ID: [${selectedModuleId}] trong năm học [${selectedAcademicYear}]`
		);


		// ============================================================
		// 2. XÓA STATE CỦA MODULE CŨ
		// ============================================================

		window.currentEmployeeEntitiesGlobal = [];

		window.currentEmployeeModuleConfigGlobal = null;

		window.currentEmployeeDynamicFieldsGlobal = [];

		window.currentEmployeeModuleIdGlobal =
			selectedModuleId;

		window.currentEmployeeAcademicIdGlobal =
			selectedAcademicYear;

		window.currentEmployeeOrgIdGlobal =
			orgId;


		// ============================================================
		// 3. TẢI LẠI DỮ LIỆU MODULE MỚI
		// ============================================================

		if (
			typeof refreshAndRenderEmployeeData === "function"
		) {
			await refreshAndRenderEmployeeData();
		}


		// ============================================================
		// 4. TẢI CHI TIẾT MODULE MỚI
		// ============================================================

		if (
			typeof loadModuleDetails === "function"
		) {
			await loadModuleDetails(
				orgId,
				selectedModuleId,
				selectedAcademicYear
			);
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

	async function refreshAndRenderEmployeeData(forceRefresh = false) {

		const orgId = window.currentOrgIdGlobal;

		const academicSelect = document.getElementById("emp-academic-year-select");
		let academicId = academicSelect ? academicSelect.value : "";

		if (
			!academicId &&
			Array.isArray(window.currentAcademicYearsGlobal) &&
			window.currentAcademicYearsGlobal.length > 0
		) {
			academicId =
				window.currentAcademicYearsGlobal[
					window.currentAcademicYearsGlobal.length - 1
				];
		}

		const moduleSelectEl = document.getElementById("emp-module-select");
		const moduleId =
			(moduleSelectEl && moduleSelectEl.value)
				? moduleSelectEl.value
				: window.currentModuleIdGlobal;

		if (moduleId) {
			window.currentModuleIdGlobal = moduleId;
		}

		const tableBody = document.getElementById("emp-entry-table-body");

		if (!tableBody) return;

		// ============================================================
		// 1. KIỂM TRA THÔNG TIN CƠ BẢN
		// ============================================================

		if (!orgId || !academicId || !moduleId) {

			tableBody.innerHTML = `
				<tr>
					<td colspan="10"
						style="text-align: center; color: red; padding: 20px;">
						Vui lòng chọn đầy đủ Tổ chức, Năm học và Nhiệm vụ!
					</td>
				</tr>
			`;

			return;
		}


		try {

			const db = firebase.firestore();

			const todayStr = new Date().toLocaleDateString('en-CA');


			// ========================================================
			// 2. KHỞI TẠO / RESET CACHE KHI CẦN
			// ========================================================

			resetEmployeeDataCache(orgId, academicId);

			const cache = window.employeeDataCache;

			// Nếu sang ngày mới thì không dùng records của ngày hôm qua
			if (cache.todayStr !== todayStr) {

				cache.records = {};
				cache.loadedModules = {};
				cache.todayStr = todayStr;

				console.log(
					"[EmployeeCache] Sang ngày mới, đã reset records."
				);
			}


			// ========================================================
			// 3. TẢI DANH SÁCH USERS CHỈ 1 LẦN
			// ========================================================

			if (
				!Array.isArray(cache.users) ||
				cache.users.length === 0
			) {

				console.log(
					"[EmployeeCache] Đang tải danh sách users từ Firestore..."
				);

				const usersSnapshot = await db
					.collection("organizations")
					.doc(orgId)
					.collection("users")
					.get();

				cache.users = [];

				usersSnapshot.forEach(doc => {

					const userData = doc.data();

					cache.users.push({
						id: doc.id,
						code: userData.code || doc.id,
						...userData
					});
				});

				console.log(
					`[EmployeeCache] Đã cache ${cache.users.length} users.`
				);

			} else {

				console.log(
					`[EmployeeCache] Dùng ${cache.users.length} users từ RAM.`
				);
			}


			// ========================================================
			// 4. TẢI CONFIG MODULE
			//    Mỗi module chỉ đọc 1 lần
			// ========================================================

			let currentModuleConfig = null;

			if (
				!forceRefresh &&
				cache.modules &&
				cache.modules[moduleId]
			) {

				currentModuleConfig = cache.modules[moduleId];

				console.log(
					`[EmployeeCache] Dùng config module ${moduleId} từ RAM.`
				);

			} else {

				console.log(
					`[EmployeeCache] Đang tải config module ${moduleId}...`
				);

				const moduleDoc = await db
					.collection("organizations")
					.doc(orgId)
					.collection("modules")
					.doc(moduleId)
					.get();

				currentModuleConfig =
					moduleDoc.exists
						? moduleDoc.data()
						: {};

				cache.modules[moduleId] = currentModuleConfig;

				console.log(
					`[EmployeeCache] Đã cache config module ${moduleId}.`
				);
			}


			// Giữ lại biến toàn cục hiện tại của hệ thống
			currentModuleConfig = currentModuleConfig || {};

			window.currentModuleConfig = currentModuleConfig;


			const targetType =
				currentModuleConfig.targetType || "";


			// ========================================================
			// 5. LỌC USERS CHO MODULE HIỆN TẠI
			//    Không đọc Firestore ở bước này
			// ========================================================

			let entities = [];

			cache.users.forEach(userData => {

				if (
					!targetType ||
					userData.role === targetType
				) {

					entities.push({
						...userData
					});
				}
			});


			// ========================================================
			// 6. TẢI RECORDS CỦA MODULE
			//    CHỈ ĐỌC FIRESTORE LẦN ĐẦU
			// ========================================================

			if (!cache.records[moduleId]) {
				cache.records[moduleId] = {};
			}


			const moduleAlreadyLoaded =
				cache.loadedModules[moduleId] === todayStr;


			if (
				!forceRefresh &&
				moduleAlreadyLoaded
			) {

				console.log(
					`[EmployeeCache] Dùng records module ${moduleId} từ RAM.`
				);

			} else {

				console.log(
					`[EmployeeCache] Đang tải records module ${moduleId} ngày ${todayStr}...`
				);


				const recordsSnapshot = await db
					.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicId)
					.collection("modulesData")
					.doc(moduleId)
					.collection("records")
					.where("date", "==", todayStr)
					.get();


				// Khi forceRefresh thì xóa cache cũ của module
				cache.records[moduleId] = {};


				recordsSnapshot.forEach(doc => {

					const data = doc.data();

					const entityId =
						data.entityId ||
						doc.id.split('_')[0];


					cache.records[moduleId][doc.id] = {
						...data,

						// Đảm bảo luôn có entityId
						entityId: entityId,

						// Lưu document ID để sau này
						// save/delete có thể sử dụng trực tiếp
						_docId: doc.id
					};
				});


				cache.loadedModules[moduleId] = todayStr;


				console.log(
					`[EmployeeCache] Đã cache ${
						recordsSnapshot.size
					} records cho module ${moduleId}.`
				);
			}


			// ========================================================
			// 7. TẠO MAP RECORDS CHO MODULE HIỆN TẠI
			// ========================================================

			const recordsMap = {};


			const moduleRecords =
				cache.records[moduleId] || {};


			Object.keys(moduleRecords).forEach(docId => {

				const data = moduleRecords[docId];

				if (!data) return;


				const entityId =
					data.entityId ||
					docId.split('_')[0];


				recordsMap[entityId] = data;
			});


			// ========================================================
			// 8. GHÉP USERS + RECORDS
			// ========================================================

			currentEmployeeEntities = entities.map(item => {

				const memberId =
					item.code || item.id || "";

				return {
					...item,

					// Giữ Firebase document ID trong item.id
					// nhưng dùng MemberId/code để tìm record
					savedRecord:
						recordsMap[memberId] || {}
				};
			});
			
			


			// ========================================================
			// 9. LƯU THÔNG TIN TOÀN CỤC
			// ========================================================
			
			// ============================================================
			// LƯU EMPLOYEE STATE TOÀN CỤC
			// Đây là nguồn dữ liệu ổn định cho search / render lại.
			// ============================================================

			window.currentEmployeeEntitiesGlobal =
				[...currentEmployeeEntities];

			window.currentEmployeeModuleConfigGlobal =
				currentModuleConfig || {};

			window.currentEmployeeDynamicFieldsGlobal =
				Array.isArray(currentModuleConfig?.fields)
					? [...currentModuleConfig.fields]
					: [];

			window.currentEmployeeOrgIdGlobal =
				orgId;

			window.currentEmployeeAcademicIdGlobal =
				academicId;

			window.currentEmployeeModuleIdGlobal =
				moduleId;
				
			window.currentUserEmailGlobal =
				window.currentUserEmailGlobal ||
				firebase.auth().currentUser?.email ||
				"";

			window.currentTodayStrGlobal = todayStr;

			
			// ========================================================
			// 10. RENDER
			// ========================================================

			renderEmployeeTable(
				currentEmployeeEntities,
				currentModuleConfig
			);


			console.log(
				"[EmployeeCache] Render hoàn tất:",
				{
					moduleId: moduleId,
					users: entities.length,
					records: Object.keys(moduleRecords).length,
					fromCache: moduleAlreadyLoaded && !forceRefresh
				}
			);


		} catch (err) {

			console.error(
				"Lỗi tải dữ liệu bảng:",
				err
			);

			tableBody.innerHTML = `
				<tr>
					<td colspan="10"
						style="text-align: center; color: red; padding: 20px;">
						Lỗi tải dữ liệu: ${err.message}
					</td>
				</tr>
			`;
		}
	}

	window.currentDynamicFieldsGlobal = null;

	async function renderEmployeeTable(listToRender, moduleConfig) {

		const tableBody =
			document.getElementById("emp-entry-table-body");

		const tableHeader =
			document.getElementById("emp-entry-table-header");

		if (!tableBody || !tableHeader) return;


		// ============================================================
		// 1. ĐẢM BẢO SCHEMA ĐÃ ĐƯỢC LOAD
		// ============================================================

		if (
			(!window.cachedSchemaFields ||
				window.cachedSchemaFields.length === 0) &&
			typeof loadSchemaFields === "function"
		) {
			await loadSchemaFields(false);
		}


		window.currentDynamicFieldsGlobal =
			moduleConfig?.fields;

		let rawFields =
		Array.isArray(window.currentEmployeeDynamicFieldsGlobal) &&
		window.currentEmployeeDynamicFieldsGlobal.length > 0
			? [...window.currentEmployeeDynamicFieldsGlobal]
			: (
				Array.isArray(moduleConfig?.fields)
					? [...moduleConfig.fields]
					: []
			);


		if (
			!Array.isArray(rawFields) ||
			rawFields.length === 0
		) {
			rawFields = [
				{
					key: "value",
					label: "Giá trị / Đánh giá"
				}
			];
		}


		// ============================================================
		// 2. CHUẨN HÓA DYNAMIC FIELDS
		// ============================================================

		let dynamicFields =
			rawFields.map(f => {

				let fieldKey = "";
				let fieldObj = {};


				if (typeof f === "string") {

					fieldKey = f;

					fieldObj = {
						key: f,
						label: f,
						type: "text"
					};

				} else if (
					typeof f === "object" &&
					f !== null
				) {

					fieldKey = f.key;

					fieldObj = {
						...f
					};
				}


				if (
					fieldKey &&
					window.cachedSchemaFields
				) {

					const schemaMatch =
						window.cachedSchemaFields.find(
							s => s.key === fieldKey
						);


					if (schemaMatch) {

						fieldObj.type =
							fieldObj.type ||
							schemaMatch.type ||
							"text";

						fieldObj.options =
							fieldObj.options ||
							schemaMatch.options ||
							[];

						fieldObj.label =
							fieldObj.label ||
							schemaMatch.label ||
							fieldKey;
					}
				}


				fieldObj.type =
					fieldObj.type ||
					"text";


				return fieldObj;
			});


		window.currentDynamicFieldsGlobal =
			dynamicFields;
		window.currentEmployeeDynamicFieldsGlobal =
			[...dynamicFields];

		window.currentDynamicFieldsGlobal = 
			[...dynamicFields];

		// ============================================================
		// 3. HEADER
		// ============================================================

		let headerHtml = `
			<th style="width: 100px; text-align: center;">
				Mã ID
			</th>

			<th style="width: 180px;">
				Họ và Tên
			</th>

			<th style="width: 100px; text-align: center;">
				Tổ / Lớp
			</th>
		`;


		dynamicFields.forEach(field => {

			const headerText =
				field.label ||
				field.key ||
				"Trường dữ liệu";


			headerHtml += `
				<th style="min-width: 180px; text-align: center;">
					${headerText}
				</th>
			`;
		});


		headerHtml += `
			<th style="width: 110px; text-align: center;">
				Thao tác
			</th>
		`;


		tableHeader.innerHTML =
			headerHtml;


		// ============================================================
		// 4. KHÔNG CÓ DỮ LIỆU
		// ============================================================

		if (listToRender.length === 0) {

			const totalCols =
				4 + dynamicFields.length;


			tableBody.innerHTML = `
				<tr>
					<td
						colspan="${totalCols}"
						style="
							text-align: center;
							color: #6c757d;
							padding: 20px;
						"
					>
						Không tìm thấy đối tượng nào phù hợp.
					</td>
				</tr>
			`;

			return;
		}


		// ============================================================
		// 5. RENDER BODY
		// ============================================================

		let bodyHtml = "";


		const myEmail =
			(
				window.currentUserEmailGlobal ||
				firebase.auth().currentUser?.email ||
				""
			)
			.toLowerCase()
			.trim();


		listToRender.forEach(item => {

			const savedData =
				item.savedRecord || {};


			// ========================================================
			// QUAN TRỌNG
			//
			// item.id   = Firebase UID
			// item.code = MemberId
			//
			// Record nghiệp vụ sử dụng MemberId.
			// ========================================================

			const memberId =
				item.code || "";


			const firebaseUid =
				item.id || "";


			// Nếu không có MemberId thì không render row
			// để tránh tạo record sai ID.
			if (!memberId) {

				console.warn(
					"[EmployeeTable] Không có MemberId:",
					item
				);

				return;
			}


			// ========================================================
			// ROW
			//
			// data-id = MemberId
			// ========================================================

			bodyHtml += `
				<tr data-id="${memberId}">

					<td
						style="
							font-weight: bold;
							text-align: center;
							vertical-align: middle;
						"
					>
						${memberId}
					</td>

					<td
						style="
							vertical-align: middle;
						"
					>
						${item.fullName || "Chưa cập nhật"}
					</td>

					<td
						style="
							text-align: center;
							vertical-align: middle;
						"
					>
						${
							item.category ||
							item.classOrGroup ||
							"-"
						}
					</td>
			`;


			// ========================================================
			// 6. DYNAMIC FIELDS
			// ========================================================

			dynamicFields.forEach(field => {

				const fieldType =
					field.type;

				const fieldKey =
					field.key;


				const storedValue =
					savedData[fieldKey] !== undefined
						? savedData[fieldKey]
						: "";


				const fieldEmail =
					(
						savedData[`${fieldKey}_email`] ||
						""
					)
					.toLowerCase()
					.trim();


				const fieldLabelBy =
					savedData[`${fieldKey}_by`] ||
					"";


				let cellHtml = `
					<div
						style="
							display: flex;
							flex-direction: column;
							gap: 6px;
							align-items: stretch;
							text-align: left;
						"
					>
				`;


				// ====================================================
				// 6A. OPTIONS / CHECKBOX
				// ====================================================

				if (
					fieldType === "options" &&
					Array.isArray(field.options) &&
					field.options.length > 0
				) {

					const storedValueRaw =
						storedValue;


					let storedOptionsList = [];


					if (
						Array.isArray(
							storedValueRaw
						)
					) {

						storedOptionsList =
							storedValueRaw.map(
								optItem => {

									if (
										typeof optItem === "object" &&
										optItem !== null
									) {
										return optItem;
									}


									return {
										value: optItem,
										email: fieldEmail,
										by: fieldLabelBy
									};
								}
							);

					} else if (storedValueRaw) {

						storedOptionsList = [
							{
								value: storedValueRaw,
								email: fieldEmail,
								by: fieldLabelBy
							}
						];
					}


					cellHtml += `
						<div
							style="
								display: flex;
								flex-direction: column;
								gap: 4px;
								background: #f8f9fa;
								padding: 6px;
								border-radius: 4px;
								border: 1px solid #dee2e6;
							"
						>
					`;


					field.options.forEach(opt => {

						const matchRecord =
							storedOptionsList.find(
								x => x.value === opt
							);


						const isChecked =
							!!matchRecord;


						const recordEmail =
							matchRecord
								? (
									matchRecord.email ||
									""
								)
								.toLowerCase()
								.trim()
								: "";


						const isMyOptToday =
							isChecked &&
							recordEmail === myEmail;


						const isDisabled =
							isChecked &&
							!isMyOptToday;


						const disabledAttr =
							isDisabled
								? "disabled"
								: "";


						const opacityStyle =
							isDisabled
								? "opacity: 0.6; cursor: not-allowed;"
								: "cursor: pointer;";


						cellHtml += `
							<label
								style="
									font-size: 0.85em;
									display: flex;
									align-items: center;
									gap: 5px;
									${opacityStyle}
								"
								title="${
									isDisabled
										? "Đã tích bởi: " +
										  (
											  matchRecord.by ||
											  recordEmail
										  )
										: ""
								}"
							>

								<input
									type="checkbox"
									class="emp-dynamic-checkbox"

									data-id="${memberId}"

									data-field="${fieldKey}"

									value="${opt}"

									${
										isChecked
											? "checked"
											: ""
									}

									${disabledAttr}
								>

								<span
									${
										isDisabled
											? 'style="color: #6c757d; text-decoration: line-through;"'
											: ""
									}
								>
									${opt}
								</span>

								${
									isDisabled
										? `
											<small
												style="
													font-size: 0.75em;
													color: #dc3545;
													margin-left: auto;
												"
											>
												${
													matchRecord.by ||
													"Khác"
												}
											</small>
										`
										: ""
								}

							</label>
						`;
					});


					cellHtml += `
						</div>
					`;


				// ====================================================
				// 6B. TEXT / NUMBER
				// ====================================================

				} else {

					let logsArray =
						Array.isArray(storedValue)
							? storedValue
							: (
								storedValue
									? [
										{
											id: "legacy",
											content: storedValue,
											email: fieldEmail,
											by: fieldLabelBy,
											time: "Hôm nay"
										}
									]
									: []
							);


					if (logsArray.length > 0) {

						logsArray.forEach(logItem => {

							const isMyLog =
								(
									logItem.email &&
									logItem.email
										.toLowerCase() ===
									myEmail
								);


							if (isMyLog) {

								cellHtml += `
									<div
										style="
											background: #e7f1ff;
											padding: 6px;
											border-radius: 4px;
											border: 1px solid #b6d4fe;
											margin-bottom: 4px;
										"
									>

										<div
											style="
												display: flex;
												justify-content: space-between;
												align-items: center;
												margin-bottom: 2px;
											"
										>

											<small
												style="
													color: #0d6efd;
													font-weight: bold;
												"
											>
												Do bạn ghi
												(
													${
														logItem.time ||
														"Hôm nay"
													}
												)
											</small>


											<button
												type="button"

												onclick="
													clearSingleLogEntry(
														'${memberId}',
														'${fieldKey}',
														'${logItem.id}'
													)
												"

												style="
													color: red;
													background: none;
													border: none;
													cursor: pointer;
													font-size: 0.85em;
													font-weight: bold;
												"

												title="Xóa mốc này"
											>
												<i class="fa-solid fa-trash"></i>
												Xóa
											</button>

										</div>


										<div
											style="
												color: #084298;
												font-weight: 500;
												font-size: 0.9em;
											"
										>
											${logItem.content}
										</div>

									</div>
								`;

							} else {

								cellHtml += `
									<div
										style="
											background: #e9ecef;
											padding: 6px;
											border-radius: 4px;
											border: 1px solid #ced4da;
											margin-bottom: 4px;
											font-size: 0.85em;
										"
									>

										<div
											style="
												color: #495057;
											"
										>
											🔒
											<b>
												${logItem.content}
											</b>
										</div>

										<small
											style="
												color: #6c757d;
												display: block;
												margin-top: 2px;
											"
										>
											<i>
												${
													logItem.by ||
													"Ghi nhận trước đó"
												}
											</i>
										</small>

									</div>
								`;
							}
						});
					}


					// =================================================
					// INPUT MỚI
					//
					// data-id = MemberId
					// =================================================

					cellHtml += `
						<input
							type="text"
							class="emp-dynamic-input"

							data-id="${memberId}"

							data-field="${fieldKey}"

							value=""

							placeholder="+ Nhập bổ sung (tiết mới)..."

							style="
								width: 100%;
								padding: 5px 6px;
								border: 1px solid #ccc;
								border-radius: 4px;
								box-sizing: border-box;
								font-size: 0.9em;
								margin-top: 4px;
							"
						>
					`;
				}


				cellHtml += `
					</div>
				`;


				bodyHtml += `
					<td
						style="
							vertical-align: middle;
							padding: 6px;
						"
					>
						${cellHtml}
					</td>
				`;
			});


			// ========================================================
			// 7. NÚT SAVE TỪNG DÒNG
			//
			// QUAN TRỌNG:
			// Truyền MemberId, KHÔNG truyền Firebase UID.
			// ========================================================

			bodyHtml += `
				<td
					style="
						text-align: center;
						vertical-align: middle;
					"
				>

					<button
						type="button"

						onclick="
							saveSingleEmployeeEntry('${memberId}')
						"

						style="
							padding: 6px 12px;
							background: #198754;
							color: white;
							border: none;
							border-radius: 4px;
							cursor: pointer;
							font-weight: bold;
						"

						title="Lưu dòng này"
					>
						<i class="fa-solid fa-floppy-disk"></i>
						Lưu
					</button>

				</td>
			`;


			bodyHtml += `
				</tr>
			`;
		});


		// ============================================================
		// 8. ĐƯA HTML VÀO BẢNG
		// ============================================================

		tableBody.innerHTML =
			bodyHtml;
	}

	async function clearSingleLogEntry(entityId, moduleId, fieldId) {
		try {
			const orgId = document.getElementById("orgSelect")?.value;
			const academicId = document.getElementById("academicYearSelect")?.value;

			if (!orgId || !academicId || !moduleId || !entityId) {
				console.warn("Thiếu thông tin để xóa dữ liệu.");
				return;
			}

			const todayStr = new Date().toISOString().split("T")[0];
			const dailyDocId = `${entityId}_${todayStr}`;

			// Lấy record từ CACHE — không đọc Firestore
			const cachedRecord = getCachedEmployeeRecord(moduleId, dailyDocId);

			if (!cachedRecord) {
				console.warn("Không tìm thấy record trong cache:", dailyDocId);
				return;
			}

			// Clone để không sửa trực tiếp object trong cache
			const updatedData = JSON.parse(JSON.stringify(cachedRecord));

			// Tìm field cần xóa
			if (updatedData[fieldId]) {
				if (Array.isArray(updatedData[fieldId])) {
					// Xóa dữ liệu của đúng MemberId
					updatedData[fieldId] = updatedData[fieldId].filter(
						item => item?.entityId !== entityId
					);

					// Nếu không còn dữ liệu thì xóa luôn field
					if (updatedData[fieldId].length === 0) {
						delete updatedData[fieldId];
					}
				}
			}

			// Giữ entityId của document
			updatedData.entityId = entityId;

			const docRef = db
				.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("records")
				.doc(dailyDocId);

			// Ghi Firestore
			await docRef.set(updatedData, { merge: false });

			// Cập nhật CACHE sau khi Firestore thành công
			setCachedEmployeeRecord(
				moduleId,
				dailyDocId,
				updatedData
			);

			// Render lại từ cache — KHÔNG đọc Firestore
			await renderEmployeeTable();

			console.log(
				`Đã xóa ${fieldId} của ${entityId} và cập nhật cache.`
			);

		} catch (error) {
			console.error("Lỗi clearSingleLogEntry:", error);
			alert("Không thể xóa dữ liệu. Vui lòng thử lại.");
		}
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

		const input =
			document.getElementById("emp-live-search-input");

		const keyword =
			(input?.value || "")
				.toLowerCase()
				.trim();

		console.log(
			"[EmployeeSearch] keyword:",
			keyword
		);

		// ============================================================
		// LẤY STATE ĐÃ ĐƯỢC refreshAndRenderEmployeeData() LƯU
		// ============================================================

		const entities =
			Array.isArray(window.currentEmployeeEntitiesGlobal)
				? window.currentEmployeeEntitiesGlobal
				: [];

		const moduleConfig =
			window.currentEmployeeModuleConfigGlobal || {};


		// ============================================================
		// KHÔNG NHẬP TỪ KHÓA → RENDER TOÀN BỘ
		// ============================================================

		if (!keyword) {

			renderEmployeeTable(
				entities,
				moduleConfig
			);

			return;
		}


		// ============================================================
		// LỌC NHÂN SỰ
		// ============================================================

		const filtered =
			entities.filter(item => {

				const id =
					(item.code || "")
						.toLowerCase();

				const name =
					(item.fullName || "")
						.toLowerCase();

				const category =
					(
						item.category ||
						item.classOrGroup ||
						""
					).toLowerCase();

				return (
					id.includes(keyword) ||
					name.includes(keyword) ||
					category.includes(keyword)
				);
			});


		// ============================================================
		// RENDER KẾT QUẢ
		// ============================================================

		renderEmployeeTable(
			filtered,
			moduleConfig
		);
	}

	// 4. Hàm lưu TẤT CẢ thay đổi trên bảng (Nút "LƯU TẤT CẢ THAY ĐỔI")
	async function saveAllEmployeeEntries() {

		const orgId = window.currentOrgIdGlobal;

		const academicId =
			document.getElementById("emp-academic-year-select")?.value;

		const moduleId =
			document.getElementById("emp-module-select")?.value;

		const msgEl =
			document.getElementById("emp-save-msg");


		// ============================================================
		// 1. KIỂM TRA THÔNG TIN CƠ BẢN
		// ============================================================

		if (!orgId || !academicId || !moduleId) {

			alert("Thiếu thông tin tổ chức, năm học hoặc nhiệm vụ!");

			return;
		}


		if (msgEl) {

			msgEl.style.color = "#0d6efd";

			msgEl.textContent =
				"⏳ Đang kiểm tra các thay đổi...";
		}


		try {

			const db = firebase.firestore();

			const updaterName =
				window.currentUserNameGlobal || "Giáo viên";

			const updaterEmail =
				(
					window.currentUserEmailGlobal ||
					firebase.auth().currentUser?.email ||
					"unknown@school.edu.vn"
				).toLowerCase().trim();


			const todayStr =
				new Date().toLocaleDateString("en-CA");


		await checkAndExpireSupporters(academicId);
			// ========================================================
			// 2. LẤY CACHE
			// ========================================================

			const cache =
				window.employeeDataCache;


			if (!cache) {

				alert(
					"Chưa khởi tạo bộ nhớ dữ liệu. Vui lòng tải lại bảng trước khi lưu!"
				);

				if (msgEl) {
					msgEl.textContent = "";
				}

				return;
			}


			if (
				cache.orgId !== orgId ||
				cache.academicId !== academicId
			) {

				alert(
					"Dữ liệu bộ nhớ không khớp với tổ chức hoặc năm học hiện tại. Vui lòng tải lại bảng!"
				);

				if (msgEl) {
					msgEl.textContent = "";
				}

				return;
			}


			if (!cache.records[moduleId]) {
				cache.records[moduleId] = {};
			}


			// ========================================================
			// 3. LẤY CÁC ROW ĐANG HIỂN THỊ
			//
			// QUAN TRỌNG:
			// row[data-id] = MEMBER ID
			// ========================================================

			const tableRows =
				document.querySelectorAll(
					"#emp-entry-table-body tr[data-id]"
				);


			if (tableRows.length === 0) {

				alert("Không có dữ liệu trên bảng để lưu!");

				if (msgEl) {
					msgEl.textContent = "";
				}

				return;
			}


			// ========================================================
			// 4. CHUẨN BỊ FIRESTORE BATCH
			// ========================================================

			const batch = db.batch();

			const pendingCacheUpdates = [];

			let totalUpdatedRows = 0;


			// ========================================================
			// 5. DUYỆT TỪNG ROW
			// ========================================================

			for (const row of tableRows) {

				// row[data-id] chính là MemberId
				const memberId =
					row.getAttribute("data-id");


				if (!memberId) {
					continue;
				}


				// ====================================================
				// DOCUMENT ID:
				// MemberId_YYYY-MM-DD
				// ====================================================

				const dailyDocId =
					`${memberId}_${todayStr}`;


				const docRef =
					db.collection("organizations")
						.doc(orgId)
						.collection("academicYears")
						.doc(academicId)
						.collection("modulesData")
						.doc(moduleId)
						.collection("records")
						.doc(dailyDocId);


				// ====================================================
				// 6. LẤY DỮ LIỆU CŨ TỪ CACHE
				//
				// KHÔNG gọi docRef.get()
				// ====================================================

				const cachedRecord =
					getCachedEmployeeRecord(
						moduleId,
						dailyDocId
					);


				const existingData =
					cachedRecord
						? { ...cachedRecord }
						: {};


				let rowHasChanges = false;

				const updatedFields = {
					...existingData
				};

				const auditChanges = {};


				// ====================================================
				// 7. XỬ LÝ INPUT TEXT
				// ====================================================

				const rowInputs =
					row.querySelectorAll(
						".emp-dynamic-input"
					);


				rowInputs.forEach(input => {

					const fieldKey =
						input.getAttribute("data-field");

					const val =
						input.value.trim();


					if (val === "") {
						return;
					}


					rowHasChanges = true;


					if (!Array.isArray(updatedFields[fieldKey])) {

						updatedFields[fieldKey] = [];
					}


					const logEntryId =
						"log_" +
						Date.now() +
						"_" +
						Math.random()
							.toString(36)
							.substring(2, 7);


					updatedFields[fieldKey].push({

						id: logEntryId,

						content: val,

						email: updaterEmail,

						by:
							`Ghi bởi ${updaterName} lúc ` +
							new Date().toLocaleTimeString(
								"vi-VN",
								{
									hour: "2-digit",
									minute: "2-digit"
								}
							),

						time:
							new Date().toLocaleTimeString(
								"vi-VN",
								{
									hour: "2-digit",
									minute: "2-digit"
								}
							)
					});


					auditChanges[fieldKey] =
						`Thêm mới: "${val}"`;


					// Xóa nội dung input sau khi đã đưa vào payload
					input.value = "";
				});


				// ====================================================
				// 8. XỬ LÝ CHECKBOX / OPTIONS
				// ====================================================

				const allCheckboxesInRow =
					row.querySelectorAll(
						".emp-dynamic-checkbox"
					);


				if (allCheckboxesInRow.length > 0) {

					const currentMyCheckedMap = {};

					const affectedFields = new Set();


					allCheckboxesInRow.forEach(chk => {

						const fieldKey =
							chk.getAttribute("data-field");


						if (!fieldKey) {
							return;
						}


						affectedFields.add(fieldKey);


						if (
							chk.checked &&
							!chk.disabled
						) {

							if (
								!currentMyCheckedMap[fieldKey]
							) {

								currentMyCheckedMap[fieldKey] = [];
							}


							currentMyCheckedMap[fieldKey].push(
								chk.value
							);
						}
					});


					// ==================================================
					// 9. SO SÁNH CHECKBOX CỦA GIÁO VIÊN HIỆN TẠI
					// ==================================================

					affectedFields.forEach(fieldKey => {

						const mySelectedValues =
							currentMyCheckedMap[fieldKey] || [];


						const oldFieldData =
							Array.isArray(existingData[fieldKey])
								? existingData[fieldKey]
								: [];


						// ------------------------------------------------
						// Giữ nguyên lựa chọn của giáo viên khác
						// ------------------------------------------------

						const otherPeopleOpts =
							oldFieldData.filter(item => {

								const itemEmail =
									(
										typeof item === "object" &&
										item !== null
									)
										? (item.email || "")
										: "";


								return (
									itemEmail.toLowerCase() !==
									updaterEmail.toLowerCase()
								);
							});


						// ------------------------------------------------
						// Tạo dữ liệu mới của giáo viên hiện tại
						// ------------------------------------------------

						const myNewOptsObjects =
							mySelectedValues.map(value => ({

								value: value,

								email: updaterEmail,

								by:
									`Ghi bởi ${updaterName}`,

								time:
									new Date().toLocaleTimeString(
										"vi-VN",
										{
											hour: "2-digit",
											minute: "2-digit"
										}
									)
							}));


						const combinedOpts = [
							...otherPeopleOpts,
							...myNewOptsObjects
						];


						// ------------------------------------------------
						// Lấy các option cũ của chính giáo viên này
						// ------------------------------------------------

						const oldMyValues =
							oldFieldData
								.filter(item => {

									return (
										typeof item === "object" &&
										item !== null &&
										(item.email || "")
											.toLowerCase() ===
										updaterEmail.toLowerCase()
									);
								})
								.map(item => item.value)
								.sort();


						const newMyValues =
							[...mySelectedValues].sort();


						// ------------------------------------------------
						// Chỉ đánh dấu thay đổi nếu thực sự khác
						// ------------------------------------------------

						if (
							JSON.stringify(oldMyValues) !==
							JSON.stringify(newMyValues)
						) {

							rowHasChanges = true;


							updatedFields[fieldKey] =
								combinedOpts;


							auditChanges[fieldKey] =
								`Cập nhật options: [${mySelectedValues.join(", ")}]`;
						}
					});
				}


				// ====================================================
				// 10. ROW KHÔNG THAY ĐỔI
				// ====================================================

				if (!rowHasChanges) {
					continue;
				}


				// ====================================================
				// 11. TẠO PAYLOAD
				// ====================================================

				totalUpdatedRows++;


				const payload = {

					...updatedFields,

					// Luôn lưu MemberId
					entityId: memberId,

					date: todayStr,

					updatedAt:
						getVietnamTimestamp()
				};


				// Nếu cache chưa có record
				if (!cachedRecord) {

					payload.createdDate =
						todayStr;
				}


				// ====================================================
				// 12. CHỈ GHI RECORD THAY ĐỔI
				// ====================================================

				batch.set(
					docRef,
					payload,
					{ merge: true }
				);


				// ====================================================
				// 13. GHI AUDIT LOG
				// ====================================================

				const auditLogsRef =
					db.collection("organizations")
						.doc(orgId)
						.collection("academicYears")
						.doc(academicId)
						.collection("modulesData")
						.doc(moduleId)
						.collection("auditLogs");


				const newLogRef =
					auditLogsRef.doc();


				batch.set(
					newLogRef,
					{

						entityId: memberId,

						updaterEmail: updaterEmail,

						updaterName: updaterName,

						action:
							"Lưu hàng loạt (Save All)",

						changes: auditChanges,

						date: todayStr,

						timestamp:
							getVietnamTimestamp()
					}
				);


				// ====================================================
				// 14. CHƯA SỬA CACHE NGAY
				//
				// Chỉ đưa vào danh sách chờ.
				// Nếu batch.commit() lỗi thì cache vẫn đúng.
				// ====================================================

				pendingCacheUpdates.push({

					moduleId: moduleId,

					dailyDocId: dailyDocId,

					payload: payload
				});
			}


			// ========================================================
			// 15. KHÔNG CÓ THAY ĐỔI
			// ========================================================

			if (totalUpdatedRows === 0) {

				alert(
					"Không có thay đổi hoặc nội dung mới nào trên bảng để lưu!"
				);

				if (msgEl) {
					msgEl.textContent = "";
				}

				return;
			}


			// ========================================================
			// 16. COMMIT FIRESTORE
			// ========================================================

			await batch.commit();


			// ========================================================
			// 17. FIRESTORE THÀNH CÔNG
			//     → BÂY GIỜ MỚI CẬP NHẬT CACHE
			// ========================================================

			pendingCacheUpdates.forEach(item => {

				setCachedEmployeeRecord(
					item.moduleId,
					item.dailyDocId,
					item.payload
				);
			});


			// ========================================================
			// 18. THÔNG BÁO
			// ========================================================

			if (msgEl) {

				msgEl.style.color = "#198754";

				msgEl.textContent =
					`✅ Đã lưu thành công ${totalUpdatedRows} bản ghi thay đổi!`;

				setTimeout(() => {

					msgEl.textContent = "";

				}, 3000);
			}


			console.log(
				`[EmployeeCache] Save All hoàn tất. ` +
				`Đã ghi ${totalUpdatedRows} records thay đổi.`
			);


		} catch (err) {

			console.error(
				"Lỗi khi lưu tất cả:",
				err
			);


			alert(
				"Lỗi khi lưu hàng loạt: " +
				err.message
			);


			if (msgEl) {
				msgEl.textContent = "";
			}
		}
	}


	window.saveAllEmployeeEntries = saveAllEmployeeEntries;
	//	SAVE DỮ LIỆU ĐƠN
	
	async function saveSingleEmployeeEntry(entityId) {

		const orgId = window.currentOrgIdGlobal;

		const academicId =
			document.getElementById("emp-academic-year-select")?.value;

		const moduleId =
			document.getElementById("emp-module-select")?.value;

		const msgEl =
			document.getElementById("emp-save-msg");


		// ============================================================
		// 1. KIỂM TRA THÔNG TIN
		// ============================================================

		if (!orgId || !academicId || !moduleId) {

			alert("Thiếu thông tin tổ chức, năm học hoặc nhiệm vụ!");

			return;
		}

		// KIỂM TRA THU HỒI QUYỀN NHẬP LIỆU CHO SUPPORTER KHI QUÁ HẠN
		if (typeof checkAndExpireSupporters === "function") {
			await checkAndExpireSupporters(academicId);
		}


		if (!entityId) {

			alert("Không xác định được MemberId của đối tượng cần lưu!");

			return;
		}


		if (msgEl) {

			msgEl.style.color = "#0d6efd";

			msgEl.textContent =
				`⏳ Đang lưu bản ghi [${entityId}], vui lòng chờ...`;
		}


		try {

			const db = firebase.firestore();

			const updaterName =
				window.currentUserNameGlobal || "Giáo viên";

			const updaterEmail =
				(
					window.currentUserEmailGlobal ||
					firebase.auth().currentUser?.email ||
					"unknown@school.edu.vn"
				).toLowerCase().trim();


			const todayStr =
				new Date().toLocaleDateString("en-CA");


			// ========================================================
			// 2. KIỂM TRA CACHE
			// ========================================================

			const cache =
				window.employeeDataCache;


			if (!cache) {

				alert(
					"Chưa khởi tạo bộ nhớ dữ liệu. Vui lòng tải lại bảng trước khi lưu!"
				);

				if (msgEl) {
					msgEl.textContent = "";
				}

				return;
			}


			if (
				cache.orgId !== orgId ||
				cache.academicId !== academicId
			) {

				alert(
					"Dữ liệu bộ nhớ không khớp với tổ chức hoặc năm học hiện tại. Vui lòng tải lại bảng!"
				);

				if (msgEl) {
					msgEl.textContent = "";
				}

				return;
			}


			if (!cache.records[moduleId]) {
				cache.records[moduleId] = {};
			}


			// ========================================================
			// 3. DOCUMENT ID = MEMBER ID + NGÀY
			// ========================================================

			const dailyDocId =
				`${entityId}_${todayStr}`;


			const docRef =
				db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicId)
					.collection("modulesData")
					.doc(moduleId)
					.collection("records")
					.doc(dailyDocId);


			// ========================================================
			// 4. LẤY RECORD CŨ TỪ CACHE
			//
			// KHÔNG docRef.get()
			// ========================================================

			const cachedRecord =
				getCachedEmployeeRecord(
					moduleId,
					dailyDocId
				);


			const existingData =
				cachedRecord
					? { ...cachedRecord }
					: {};


			// ========================================================
			// 5. THỜI GIAN
			// ========================================================

			const now = new Date();

			const hours =
				String(now.getHours()).padStart(2, "0");

			const minutes =
				String(now.getMinutes()).padStart(2, "0");

			const day =
				String(now.getDate()).padStart(2, "0");

			const month =
				String(now.getMonth() + 1).padStart(2, "0");

			const year =
				now.getFullYear();


			const timeString =
				`${hours}:${minutes} ngày ${day}/${month}/${year}`;


			const labelText =
				`Ghi bởi ${updaterName} lúc ${timeString}`;


			const timeStr =
				`${hours}:${minutes}`;


			// ========================================================
			// 6. CHUẨN BỊ DỮ LIỆU
			// ========================================================

			let rowHasChanges = false;

			const updatedFields = {
				...existingData
			};

			const auditChanges = {};


			// ========================================================
			// 7. XỬ LÝ INPUT TEXT
			// ========================================================

			const rowInputs =
				document.querySelectorAll(
					`.emp-dynamic-input[data-id="${entityId}"]`
				);


			rowInputs.forEach(input => {

				const fieldKey =
					input.getAttribute("data-field");

				const val =
					input.value.trim();


				if (!fieldKey || val === "") {
					return;
				}


				rowHasChanges = true;


				if (!Array.isArray(updatedFields[fieldKey])) {

					updatedFields[fieldKey] = [];
				}


				const logEntryId =
					"log_" +
					Date.now() +
					"_" +
					Math.random()
						.toString(36)
						.substring(2, 7);


				updatedFields[fieldKey].push({

					id: logEntryId,

					content: val,

					email: updaterEmail,

					by: labelText,

					time: timeStr
				});


				auditChanges[fieldKey] =
					`Thêm mới: "${val}"`;


				input.value = "";
			});


			// ========================================================
			// 8. XỬ LÝ CHECKBOX / OPTIONS
			// ========================================================

			const allCheckboxesInRow =
				document.querySelectorAll(
					`.emp-dynamic-checkbox[data-id="${entityId}"]`
				);


			if (allCheckboxesInRow.length > 0) {

				const currentMyCheckedMap = {};

				const affectedFields = new Set();


				allCheckboxesInRow.forEach(chk => {

					const fieldKey =
						chk.getAttribute("data-field");


					if (!fieldKey) {
						return;
					}


					affectedFields.add(fieldKey);


					if (
						chk.checked &&
						!chk.disabled
					) {

						if (!currentMyCheckedMap[fieldKey]) {

							currentMyCheckedMap[fieldKey] = [];
						}


						currentMyCheckedMap[fieldKey].push(
							chk.value
						);
					}
				});


				// ====================================================
				// 9. SO SÁNH TỪNG FIELD OPTIONS
				// ====================================================

				affectedFields.forEach(fieldKey => {

					const mySelectedValues =
						currentMyCheckedMap[fieldKey] || [];


					const oldFieldData =
						Array.isArray(existingData[fieldKey])
							? existingData[fieldKey]
							: [];


					// -----------------------------------------------
					// Giữ lại option của giáo viên khác
					// -----------------------------------------------

					const otherPeopleOpts =
						oldFieldData.filter(item => {

							const itemEmail =
								(
									typeof item === "object" &&
									item !== null
								)
									? (item.email || "")
									: "";


							return (
								itemEmail.toLowerCase() !==
								updaterEmail.toLowerCase()
							);
						});


					// -----------------------------------------------
					// Tạo option mới của giáo viên hiện tại
					// -----------------------------------------------

					const myNewOptsObjects =
						mySelectedValues.map(value => ({

							value: value,

							email: updaterEmail,

							by: labelText,

							time: timeStr
						}));


					const combinedOpts = [
						...otherPeopleOpts,
						...myNewOptsObjects
					];


					// -----------------------------------------------
					// Các option cũ của chính mình
					// -----------------------------------------------

					const oldMyValues =
						oldFieldData
							.filter(item => {

								return (
									typeof item === "object" &&
									item !== null &&
									(item.email || "")
										.toLowerCase() ===
									updaterEmail.toLowerCase()
								);
							})
							.map(item => item.value)
							.sort();


					const newMyValues =
						[...mySelectedValues].sort();


					// -----------------------------------------------
					// Chỉ đánh dấu thay đổi nếu thực sự khác
					// -----------------------------------------------

					if (
						JSON.stringify(oldMyValues) !==
						JSON.stringify(newMyValues)
					) {

						rowHasChanges = true;


						updatedFields[fieldKey] =
							combinedOpts;


						auditChanges[fieldKey] =
							`Cập nhật options: [${mySelectedValues.join(", ")}]`;
					}
				});
			}


			// ========================================================
			// 10. KHÔNG CÓ THAY ĐỔI
			// ========================================================

			if (!rowHasChanges) {

				alert(
					"Vui lòng nhập nội dung mới hoặc thay đổi lựa chọn trước khi lưu!"
				);

				if (msgEl) {
					msgEl.textContent = "";
				}

				return;
			}


			// ========================================================
			// 11. TẠO PAYLOAD
			// ========================================================

			const payload = {

				...updatedFields,

				// QUAN TRỌNG:
				// Đây là MemberId, không phải Firebase UID
				entityId: entityId,

				date: todayStr,

				updatedAt:
					getVietnamTimestamp()
			};


			if (!cachedRecord) {

				payload.createdDate =
					todayStr;
			}


			// ========================================================
			// 12. BATCH
			// ========================================================

			const batch =
				db.batch();


			// Record chính
			batch.set(
				docRef,
				payload,
				{ merge: true }
			);


			// ========================================================
			// 13. AUDIT LOG
			// ========================================================

			const auditLogsRef =
				db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicId)
					.collection("modulesData")
					.doc(moduleId)
					.collection("auditLogs");


			const newLogRef =
				auditLogsRef.doc();


			batch.set(
				newLogRef,
				{

					entityId: entityId,

					updaterEmail: updaterEmail,

					updaterName: updaterName,

					action:
						"Cập nhật / Bổ sung dữ liệu trong ngày",

					changes: auditChanges,

					date: todayStr,

					timestamp:
						getVietnamTimestamp()
				}
			);


			// ========================================================
			// 14. COMMIT FIRESTORE
			// ========================================================

			await batch.commit();


			// ========================================================
			// 15. FIRESTORE THÀNH CÔNG
			//     → CẬP NHẬT CACHE
			// ========================================================

			setCachedEmployeeRecord(
				moduleId,
				dailyDocId,
				payload
			);


			// ========================================================
			// 16. THÔNG BÁO
			// ========================================================

			if (msgEl) {

				msgEl.style.color = "#198754";

				msgEl.textContent =
					`✅ Đã lưu thành công bản ghi [${entityId}]!`;

				setTimeout(() => {

					msgEl.textContent = "";

				}, 3000);
			}


			console.log(
				`[EmployeeCache] Đã lưu ${dailyDocId} ` +
				`và cập nhật cache.`
			);


		} catch (err) {

			console.error(
				"Lỗi lưu bổ sung:",
				err
			);


			alert(
				"Lỗi khi lưu: " +
				err.message
			);


			if (msgEl) {
				msgEl.textContent = "";
			}
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
	
	//  THẺ 3 - NHẬT KÝ BIẾN ĐỘNG
	

	window.auditMonitorFilterState=window.auditMonitorFilterState||{
	  currentType:"",
	  options:{updater:[],module:[]},
	  selected:{updater:[],module:[]},
	  draft:{updater:[],module:[]}
	};

	function normalizeText(v){
	  return String(v||"").trim().toLowerCase()
		.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
	}

	function escapeHtml(v){
	  return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
		.replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
	}

	function filterInfo(type){
	  if(type==="updater") return {
		title:"Chọn người nhập liệu",
		icon:"fa-solid fa-user-pen",
		placeholder:"Tìm theo tên hoặc email..."
	  };
	  return {
		title:"Chọn bài toán được phân công",
		icon:"fa-solid fa-list-check",
		placeholder:"Tìm theo mã hoặc tên bài toán..."
	  };
	}

	window.openAuditMonitorFilterForm=function(type){
	  if(type!=="updater"&&type!=="module")return;
	  const s=window.auditMonitorFilterState;
	  s.currentType=type;
	  s.draft[type]=[...(s.selected[type]||[])];

	  const info=filterInfo(type);
	  const modal=document.getElementById("audit-monitor-filter-modal");
	  const title=document.getElementById("audit-monitor-filter-title");
	  const icon=document.getElementById("audit-monitor-filter-title-icon");
	  const search=document.getElementById("audit-monitor-filter-search");
	  if(!modal)return;

	  if(title)title.textContent=info.title;
	  if(icon)icon.className=info.icon;
	  if(search){search.placeholder=info.placeholder;search.value=""}

	  renderAuditMonitorFilterList();
	  modal.style.display="block";
	  document.body.classList.add("audit-monitor-filter-modal-open");
	  setTimeout(()=>search?.focus(),50);
	};

	window.closeAuditMonitorFilterForm=function(){
	  const modal=document.getElementById("audit-monitor-filter-modal");
	  if(modal)modal.style.display="none";
	  document.body.classList.remove("audit-monitor-filter-modal-open");
	};

	function renderAuditMonitorFilterList(){
	  const s=window.auditMonitorFilterState;
	  const type=s.currentType;
	  const box=document.getElementById("audit-monitor-filter-list");
	  if(!box||!type)return;

	  const options=Array.isArray(s.options[type])?s.options[type]:[];
	  const selected=Array.isArray(s.draft[type])?s.draft[type]:[];

	  if(!options.length){
		box.innerHTML='<div class="audit-monitor-filter-empty">Chưa có dữ liệu.</div>';
		updateSelectedCount();
		return;
	  }

	  let html="";
	  options.forEach(item=>{
		item=(typeof item==="object"&&item)?item:{id:String(item)};
		const id=String(item.id||item.email||item.code||item.moduleId||"").trim();
		if(!id)return;

		const title=String(
		  type==="updater"
			? (item.name||item.fullName||item.updaterName||item.email||id)
			: (item.name||item.title||item.moduleName||id)
		).trim();

		const subtitle=String(
		  type==="updater"
			? (item.email||"")
			: (item.id||item.moduleId||"")
		).trim();

		const checked=selected.includes(id)?"checked":"";
		const searchText=escapeHtml(normalizeText(`${title} ${subtitle} ${id}`));

		html+=`
		  <label class="audit-monitor-filter-item"
				 data-filter-search="${searchText}">
			<input type="checkbox" value="${escapeHtml(id)}" ${checked}
				   onchange="updateAuditMonitorFilterSelectedCount()">
			<span class="audit-monitor-filter-item-content">
			  <span class="audit-monitor-filter-item-title">${escapeHtml(title)||escapeHtml(id)}</span>
			  ${subtitle?`<span class="audit-monitor-filter-item-subtitle">${escapeHtml(subtitle)}</span>`:""}
			</span>
		  </label>`;
	  });

	  box.innerHTML=html||'<div class="audit-monitor-filter-empty">Chưa có dữ liệu.</div>';
	  updateSelectedCount();
	}

	window.filterAuditMonitorFilterList=function(){
	  const search=document.getElementById("audit-monitor-filter-search");
	  const box=document.getElementById("audit-monitor-filter-list");
	  if(!search||!box)return;
	  const keyword=normalizeText(search.value);

	  box.querySelectorAll(".audit-monitor-filter-item").forEach(item=>{
		const text=item.getAttribute("data-filter-search")||"";
		item.style.display=(!keyword||text.includes(keyword))?"flex":"none";
	  });
	};

	window.selectAllAuditMonitorFilterItems=function(yes){
	  const s=window.auditMonitorFilterState;
	  const type=s.currentType;
	  const box=document.getElementById("audit-monitor-filter-list");
	  if(!type||!box)return;

	  const draft=[...(s.draft[type]||[])];

	  box.querySelectorAll(".audit-monitor-filter-item").forEach(item=>{
		if(item.style.display==="none")return;
		const cb=item.querySelector("input[type=checkbox]");
		if(!cb)return;
		const id=String(cb.value||"").trim();
		cb.checked=yes;
		const idx=draft.indexOf(id);
		if(yes&&idx===-1)draft.push(id);
		if(!yes&&idx!==-1)draft.splice(idx,1);
	  });

	  s.draft[type]=[...new Set(draft)];
	  updateSelectedCount();
	};

	window.updateAuditMonitorFilterSelectedCount=function(){
	  updateSelectedCount();
	};

	function updateSelectedCount(){
	  const s=window.auditMonitorFilterState;
	  const type=s.currentType;
	  const box=document.getElementById("audit-monitor-filter-list");
	  const count=document.getElementById("audit-monitor-filter-selected-count");
	  if(!type||!box||!count)return;

	  const old=[...(s.draft[type]||[])];
	  const visibleIds=[];
	  const visibleChecked=[];

	  box.querySelectorAll(".audit-monitor-filter-item").forEach(item=>{
		if(item.style.display==="none")return;
		const cb=item.querySelector("input[type=checkbox]");
		if(!cb)return;
		const id=String(cb.value||"").trim();
		if(id)visibleIds.push(id);
		if(cb.checked&&id)visibleChecked.push(id);
	  });

	  const hiddenSelected=old.filter(id=>!visibleIds.includes(id));
	  s.draft[type]=[...new Set([...hiddenSelected,...visibleChecked])];
	  count.textContent=`Đã chọn: ${s.draft[type].length}`;
	}

	window.applyAuditMonitorFilterForm=function(){
	  const s=window.auditMonitorFilterState;
	  const type=s.currentType;
	  if(!type){closeAuditMonitorFilterForm();return;}

	  s.selected[type]=[...(s.draft[type]||[])];

	  const badge=document.getElementById(
		type==="updater"?"audit-filter-updater-count":"audit-filter-module-count"
	  );
	  if(badge)badge.textContent=s.selected[type].length;

	  closeAuditMonitorFilterForm();

	  if(typeof window.applyEmployeeAuditMonitorFilters==="function"){
		window.applyEmployeeAuditMonitorFilters();
	  }
	};

	window.setAuditMonitorFilterOptions=function(data){
	  const s=window.auditMonitorFilterState;
	  data=data||{};
	  s.options.updater=Array.isArray(data.updater)?data.updater:[];
	  s.options.module=Array.isArray(data.module)?data.module:[];

	  ["updater","module"].forEach(type=>{
		const ids=s.options[type].map(item=>{
		  if(typeof item==="string"||typeof item==="number")return String(item);
		  item=item||{};
		  return String(item.id||item.email||item.code||item.moduleId||"").trim();
		}).filter(Boolean);

		s.selected[type]=(s.selected[type]||[]).filter(id=>ids.includes(id));
		s.draft[type]=(s.draft[type]||[]).filter(id=>ids.includes(id));

		const badge=document.getElementById(
		  type==="updater"?"audit-filter-updater-count":"audit-filter-module-count"
		);
		if(badge)badge.textContent=s.selected[type].length;
	  });

	  if(s.currentType&&document.getElementById("audit-monitor-filter-modal")?.style.display!=="none"){
		renderAuditMonitorFilterList();
	  }
	};

	window.getAuditMonitorFilterValues=function(){
	  const s=window.auditMonitorFilterState;
	  return {
		updater:[...(s.selected.updater||[])],
		module:[...(s.selected.module||[])]
	  };
	};

	document.addEventListener("keydown",function(e){
	  if(e.key==="Escape"){
		const modal=document.getElementById("audit-monitor-filter-modal");
		if(modal&&modal.style.display!=="none")window.closeAuditMonitorFilterForm();
	  }
	});

	/* ============================================================
	   1. STATE
	============================================================ */

	window.employeeAuditMonitorState =
		window.employeeAuditMonitorState || {
			rows: [],
			allRows: [],
			loading: false,
			initialized: false,
			lastQueryKey: "",
			usersByCode: {},
			usersByUid: {},
			usersByEmail: {},
			modulesById: {},
			assignmentsByEmail: {},
			moduleAssignedPeople: {}
		};


	/* ============================================================
	   2. CHUẨN HÓA TEXT
	============================================================ */

	function normalizeEmployeeAuditMonitorText(value) {
		return String(value || "")
			.trim()
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
	}


	/* ============================================================
	   3. ESCAPE HTML
	============================================================ */

	function escapeEmployeeAuditMonitorHtml(value) {
		return String(value || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}


	/* ============================================================
	   4. LẤY ORG / NĂM HỌC
	============================================================ */

	async function getEmployeeAuditMonitorContext() {

		let orgId =
			window.currentEmployeeOrgIdGlobal ||
			window.currentOrgIdGlobal ||
			"";

		if (!orgId && typeof ensureOrgId === "function") {
			orgId = await ensureOrgId();
		}

		let academicId =
			window.currentEmployeeAcademicIdGlobal ||
			window.currentAcademicYearIdGlobal ||
			window.currentAcademicYear ||
			"";

		if (typeof academicId === "object" && academicId !== null) {
			academicId =
				academicId.id ||
				academicId.name ||
				academicId.year ||
				"";
		}

		if (!academicId) {
			const years =
				window.currentAcademicYearsGlobal;

			if (Array.isArray(years) && years.length > 0) {

				const item =
					years[years.length - 1];

				academicId =
					typeof item === "object" && item !== null
						? (
							item.id ||
							item.name ||
							item.year ||
							""
						)
						: item;
			}
		}

		return {
			orgId: String(orgId || "").trim(),
			academicId: String(academicId || "").trim()
		};
	}


	/* ============================================================
	   5. LẤY CACHE NHÂN SỰ
	============================================================ */

	function buildEmployeeAuditMonitorUserCache() {

		const state =
			window.employeeAuditMonitorState;

		state.usersByCode = {};
		state.usersByUid = {};
		state.usersByEmail = {};

		let users = [];

		/*
		 * Ưu tiên employeeDataCache.users vì đây là cache
		 * đang được khối nhập liệu sử dụng.
		 */
		const employeeCache =
			window.employeeDataCache;

		if (
			employeeCache &&
			Array.isArray(employeeCache.users)
		) {
			users = employeeCache.users;
		}

		/*
		 * Nếu cache trên chưa có thì dùng currentEmployeeEntitiesGlobal.
		 */
		if (
			!users.length &&
			Array.isArray(window.currentEmployeeEntitiesGlobal)
		) {
			users =
				window.currentEmployeeEntitiesGlobal;
		}

		/*
		 * Nếu hệ thống đã có currentLoadedEntities thì bổ sung.
		 */
		if (
			!users.length &&
			Array.isArray(window.currentLoadedEntities)
		) {
			users =
				window.currentLoadedEntities;
		}


		users.forEach(function (user) {

			user = user || {};

			const code =
				String(
					user.code ||
					user.memberId ||
					""
				).trim();

			const uid =
				String(
					user.uid ||
					user.authUid ||
					user.id ||
					user.docId ||
					""
				).trim();

			const email =
				String(
					user.email ||
					""
				).trim().toLowerCase();

			const normalized = {
				...user,
				code: code,
				uid: uid,
				email: email,
				fullName:
					user.fullName ||
					user.displayName ||
					user.name ||
					code ||
					uid,
				category:
					user.category ||
					user.group ||
					user.className ||
					""
			};


			if (code) {
				state.usersByCode[code] =
					normalized;
			}

			if (uid) {
				state.usersByUid[uid] =
					normalized;
			}

			if (email) {
				state.usersByEmail[email] =
					normalized;
			}

		});

		return state;
	}


	/* ============================================================
	   6. LẤY CACHE MODULE
	============================================================ */

	window.employeeAuditMonitorModulesCache =
    window.employeeAuditMonitorModulesCache &&
    !Array.isArray(window.employeeAuditMonitorModulesCache)
        ? window.employeeAuditMonitorModulesCache
        : {};


async function buildEmployeeAuditMonitorModuleCache(forceRefresh = false) {

    const state = window.employeeAuditMonitorState =
        window.employeeAuditMonitorState || {
            rows: [],
            allRows: [],
            loading: false,
            initialized: false,
            lastQueryKey: "",
            usersByCode: {},
            usersByUid: {},
            usersByEmail: {},
            modulesById: {},
            assignmentsByEmail: {},
            moduleAssignedPeople: {}
        };

    const orgId =
        String(window.currentOrgIdGlobal || "").trim();

    if (!orgId) {
        state.modulesById = {};
        window.employeeAuditMonitorModulesCache = {};
        return {};
    }

    if (
        !forceRefresh &&
        window.employeeAuditMonitorModulesCache &&
        Object.keys(window.employeeAuditMonitorModulesCache).length > 0
    ) {
        state.modulesById = {
            ...window.employeeAuditMonitorModulesCache
        };
        return state.modulesById;
    }

    const db = firebase.firestore();

    const snapshot =
        await db
            .collection("organizations")
            .doc(orgId)
            .collection("modules")
            .get();

    const modulesById = {};

    snapshot.forEach(function (moduleDoc) {

        const data = moduleDoc.data() || {};

        const fields =
            Array.isArray(data.fields)
                ? data.fields
                : [];

        /*
         * Chỉ nhận module có ít nhất 1 trường dữ liệu KPI.
         * Field hợp lệ khi có key / id / fieldKey.
         */
        const hasKpiFields =
            fields.some(function (fieldObj) {

                if (
                    !fieldObj ||
                    typeof fieldObj !== "object"
                ) {
                    return false;
                }

                const fieldKey =
                    String(
                        fieldObj.key ||
                        fieldObj.id ||
                        fieldObj.fieldKey ||
                        ""
                    ).trim();

                return !!fieldKey;
            });

        if (!hasKpiFields) {
            return;
        }

        const moduleId =
            String(
                moduleDoc.id ||
                data.id ||
                data.moduleId ||
                ""
            ).trim();

        if (!moduleId) {
            return;
        }

        modulesById[moduleId] = {
            id: moduleId,

            code:
                String(
                    data.code ||
                    moduleId
                ).trim(),

            name:
                String(
                    data.name ||
                    data.title ||
                    data.moduleName ||
                    data.displayName ||
                    moduleId
                ).trim(),

            title:
                String(
                    data.title ||
                    data.name ||
                    data.moduleName ||
                    data.displayName ||
                    moduleId
                ).trim(),

            targetType:
                String(
                    data.targetType || ""
                ).trim().toUpperCase(),

            fields: fields
        };
    });

    state.modulesById = modulesById;

    window.employeeAuditMonitorModulesCache = {
        ...modulesById
    };

    return modulesById;
}



	async function getEmployeeAuditMonitorModuleIdsForQuery(
		selectedModuleIds = []
	) {

		const selected =
			Array.isArray(selectedModuleIds)
				? selectedModuleIds
					.map(function (id) {
						return String(id || "").trim();
					})
					.filter(Boolean)
				: [];

		/*
		 * Nếu người dùng chọn module:
		 * chỉ đọc các module được chọn.
		 */
		if (selected.length) {
			return [...new Set(selected)];
		}

		/*
		 * Nếu không chọn:
		 * đọc TOÀN BỘ module KPI công khai.
		 */
		const modules =
			await buildEmployeeAuditMonitorModuleCache(false);

		return Object.keys(modules);
	}


	/* ============================================================
	   7. LẤY CACHE PHÂN CÔNG
	============================================================ */

	function buildEmployeeAuditMonitorAssignmentCache() {

		const state =
			window.employeeAuditMonitorState;

		state.assignmentsByEmail = {};
		state.moduleAssignedPeople = {};

		const assignments =
			Array.isArray(window.cachedAssignmentsList)
				? window.cachedAssignmentsList
				: [];


		assignments.forEach(function (assignment) {

			assignment = assignment || {};

			const email =
				String(
					assignment.email ||
					assignment.id ||
					""
				).trim().toLowerCase();

			const memberId =
				String(
					assignment.memberId ||
					assignment.code ||
					assignment.uid ||
					""
				).trim();

			const uid =
				String(
					assignment.uid ||
					""
				).trim();

			const fullName =
				String(
					assignment.fullName ||
					""
				).trim();

			const modules =
				Array.isArray(assignment.modules)
					? assignment.modules
						.map(id => String(id || "").trim())
						.filter(Boolean)
					: [];


			if (!email) return;


			const item = {
				...assignment,
				email: email,
				memberId: memberId,
				uid: uid,
				fullName: fullName,
				modules: modules
			};


			state.assignmentsByEmail[email] =
				item;


			modules.forEach(function (moduleId) {

				if (!state.moduleAssignedPeople[moduleId]) {
					state.moduleAssignedPeople[moduleId] = [];
				}


				state.moduleAssignedPeople[moduleId].push({
					email: email,
					memberId: memberId,
					uid: uid,
					fullName: fullName
				});

			});

		});


		return state;
	}


	/* ============================================================
	   8. CHUẨN BỊ TOÀN BỘ CACHE CHO FORM LỌC
	============================================================ */

	window.prepareEmployeeAuditMonitorCaches =
		function () {

			buildEmployeeAuditMonitorUserCache();

			buildEmployeeAuditMonitorModuleCache();

			buildEmployeeAuditMonitorAssignmentCache();

			return window.employeeAuditMonitorState;
		};


	/* ============================================================
	   9. TẠO DANH SÁCH NGƯỜI NHẬP LIỆU
	============================================================ */

	function buildEmployeeAuditMonitorUpdaterOptions() {

		const state =
			window.employeeAuditMonitorState;

		const result = {};

		/*
		 * Người nhập liệu được lấy từ assignment cache.
		 * Như vậy nhân sự được phân công nhưng chưa từng nhập
		 * vẫn có thể được chọn để theo dõi.
		 */
		Object.keys(state.assignmentsByEmail)
			.forEach(function (email) {

				const assignment =
					state.assignmentsByEmail[email];

				const user =
					state.usersByEmail[email] ||
					state.usersByCode[
						assignment.memberId
					] ||
					state.usersByUid[
						assignment.uid
					] ||
					{};


				const id =
					email;

				if (!id) return;


				result[id] = {

					id: id,

					name:
						user.fullName ||
						assignment.fullName ||
						email,

					email: email,

					code:
						user.code ||
						assignment.memberId ||
						"",

					category:
						user.category ||
						""

				};

			});


		/*
		 * Nếu assignment cache chưa có,
		 * fallback sang danh sách nhân sự.
		 */
		if (!Object.keys(result).length) {

			Object.keys(state.usersByEmail)
				.forEach(function (email) {

					const user =
						state.usersByEmail[email];

					result[email] = {

						id: email,

						name:
							user.fullName ||
							email,

						email: email,

						code:
							user.code ||
							"",

						category:
							user.category ||
							""

					};

				});

		}


		return Object.values(result)
			.sort(function (a, b) {

				return normalizeEmployeeAuditMonitorText(
					a.name
				).localeCompare(
					normalizeEmployeeAuditMonitorText(
						b.name
					)
				);

			});

	}


	/* ============================================================
	   10. TẠO DANH SÁCH MODULE ĐƯỢC PHÂN CÔNG
	============================================================ */

	function buildEmployeeAuditMonitorModuleOptions() {

		const state =
			window.employeeAuditMonitorState;

		const modulesById =
			state.modulesById || {};

		return Object.values(modulesById)
			.filter(function (module) {
				return module && module.id;
			})
			.sort(function (a, b) {

				const nameA =
					String(
						a.name ||
						a.title ||
						a.id ||
						""
					).toLowerCase();

				const nameB =
					String(
						b.name ||
						b.title ||
						b.id ||
						""
					).toLowerCase();

				return nameA.localeCompare(
					nameB,
					"vi"
				);
			})
			.map(function (module) {

				return {
					id:
						String(module.id),

					label:
						String(
							module.name ||
							module.title ||
							module.id
						),

					name:
						String(
							module.name ||
							module.title ||
							module.id
						),

					code:
						String(
							module.code ||
							module.id
						),

					targetType:
						String(
							module.targetType || ""
						)
				};
			});
	}




	/* ============================================================
	   11. ĐỔ DỮ LIỆU VÀO FORM LỌC
	============================================================ */
	window.openAuditMonitorFilterForm=function(type){
	  if(type!=="updater"&&type!=="module")return;
	  const s=window.auditMonitorFilterState;
	  s.currentType=type;
	  s.draft[type]=[...(s.selected[type]||[])];

	  const info=filterInfo(type);
	  const modal=document.getElementById("audit-monitor-filter-modal");
	  const title=document.getElementById("audit-monitor-filter-title");
	  const icon=document.getElementById("audit-monitor-filter-title-icon");
	  const search=document.getElementById("audit-monitor-filter-search");
	  if(!modal)return;

	  if(title)title.textContent=info.title;
	  if(icon)icon.className=info.icon;
	  if(search){search.placeholder=info.placeholder;search.value=""}

	  renderAuditMonitorFilterList();
	  modal.style.display="block";
	  document.body.classList.add("audit-monitor-filter-modal-open");
	  setTimeout(()=>search?.focus(),50);
	};



	window.loadEmployeeAuditMonitorFilterOptions =
		async function (forceRefresh = false) {

			try {

				/*
				 * Không đổi logic cache nhân sự / assignment hiện có.
				 */
				if (
					typeof window.prepareEmployeeAuditMonitorCaches ===
					"function"
				) {
					window.prepareEmployeeAuditMonitorCaches();
				}

				const updaters =
					typeof buildEmployeeAuditMonitorUpdaterOptions ===
					"function"
						? buildEmployeeAuditMonitorUpdaterOptions()
						: [];

				/*
				 * Module phải đọc từ Firestore riêng cho Thẻ 3.
				 * Không phụ thuộc assignment.
				 */
				await buildEmployeeAuditMonitorModuleCache(
					forceRefresh
				);

				const modules =
					buildEmployeeAuditMonitorModuleOptions();

				if (
					typeof window.setAuditMonitorFilterOptions ===
					"function"
				) {
					window.setAuditMonitorFilterOptions({
						updater: updaters,
						module: modules
					});
				}

				return {
					updaters: updaters,
					modules: modules
				};

			} catch (error) {

				console.error(
					"[AuditMonitor] Lỗi load filter options:",
					error
				);

				if (
					typeof window.setAuditMonitorFilterOptions ===
					"function"
				) {
					window.setAuditMonitorFilterOptions({
						updater: [],
						module: []
					});
				}

				return {
					updaters: [],
					modules: []
				};
			}
		};




	/* ============================================================
	   12. LẤY KHOẢNG NGÀY
	============================================================ */

	function getEmployeeAuditMonitorDateRange() {

		const startEl =
			document.getElementById(
				"audit-monitor-start-date"
			);

		const endEl =
			document.getElementById(
				"audit-monitor-end-date"
			);


		let start =
			String(
				startEl?.value ||
				""
			).trim();

		let end =
			String(
				endEl?.value ||
				""
			).trim();


		/*
		 * Nếu người dùng bỏ trống:
		 * - start = ngày hiện tại
		 * - end = ngày hiện tại
		 */
		const today =
			new Date()
				.toLocaleDateString("en-CA");


		if (!start) {
			start = today;
		}

		if (!end) {
			end = today;
		}


		if (start > end) {

			const temp = start;

			start = end;
			end = temp;

		}


		return {
			startDate: start,
			endDate: end
		};

	}


	/* ============================================================
	   13. LẤY BỘ LỌC HIỆN TẠI
	============================================================ */

	function getEmployeeAuditMonitorSelectedFilters() {

		if (
			typeof window.getAuditMonitorFilterValues ===
			"function"
		) {

			return window.getAuditMonitorFilterValues();

		}


		return {
			updater: [],
			module: []
		};

	}


	/* ============================================================
	   14. TẠO QUERY KEY
	============================================================ */

	function createEmployeeAuditMonitorQueryKey(
		context,
		dateRange,
		filters
	) {

		return JSON.stringify({

			orgId:
				context.orgId,

			academicId:
				context.academicId,

			start:
				dateRange.startDate,

			end:
				dateRange.endDate,

			updater:
				[...(filters.updater || [])].sort(),

			module:
				[...(filters.module || [])].sort()

		});

	}


	/* ============================================================
	   15. CHUYỂN CHANGES THÀNH "CHI TIẾT"
	============================================================ */

	function formatEmployeeAuditMonitorChanges(
		changes
	) {

		if (!changes) {
			return "";
		}


		/*
		 * Trường hợp changes là string.
		 */
		if (typeof changes === "string") {
			return changes.trim();
		}


		if (Array.isArray(changes)) {

			return changes
				.map(function (item) {

					if (
						item &&
						typeof item === "object"
					) {

						return (
							item.content ||
							item.value ||
							item.label ||
							JSON.stringify(item)
						);

					}

					return String(item || "");

				})
				.filter(Boolean)
				.join("; ");

		}


		if (
			typeof changes !== "object"
		) {

			return String(changes || "");

		}


		const details = [];


		Object.keys(changes)
			.forEach(function (fieldKey) {

				const value =
					changes[fieldKey];


				if (
					value === null ||
					value === undefined ||
					value === ""
				) {
					return;
				}


				let text = "";


				if (
					Array.isArray(value)
				) {

					text =
						value
							.map(function (item) {

								if (
									item &&
									typeof item === "object"
								) {

									return (
										item.content ||
										item.value ||
										item.label ||
										JSON.stringify(item)
									);

								}

								return String(item || "");

							})
							.filter(Boolean)
							.join(", ");

				} else if (
					typeof value === "object"
				) {

					text =
						value.content ||
						value.value ||
						value.label ||
						JSON.stringify(value);

				} else {

					text =
						String(value);

				}


				if (text) {

					details.push(
						`${fieldKey}: ${text}`
					);

				}

			});


		return details.join(" | ");

	}


	/* ============================================================
	   16. CHUYỂN TIMESTAMP THÀNH THỜI GIAN HIỂN THỊ
	============================================================ */

	function formatEmployeeAuditMonitorTime(
		timestamp,
		fallbackDate
	) {

		let date = null;


		if (
			timestamp &&
			typeof timestamp.toDate === "function"
		) {

			date =
				timestamp.toDate();

		} else if (
			timestamp instanceof Date
		) {

			date =
				timestamp;

		} else if (
			typeof timestamp === "string" ||
			typeof timestamp === "number"
		) {

			const parsed =
				new Date(timestamp);

			if (
				!Number.isNaN(
					parsed.getTime()
				)
			) {

				date = parsed;

			}

		}


		if (!date && fallbackDate) {

			/*
			 * date của audit log chỉ là YYYY-MM-DD.
			 */
			const parsed =
				new Date(
					`${fallbackDate}T00:00:00`
				);

			if (
				!Number.isNaN(
					parsed.getTime()
				)
			) {

				date = parsed;

			}

		}


		if (!date) {
			return fallbackDate || "";
		}


		const day =
			String(
				date.getDate()
			).padStart(2, "0");

		const month =
			String(
				date.getMonth() + 1
			).padStart(2, "0");

		const year =
			date.getFullYear();


		const hour =
			String(
				date.getHours()
			).padStart(2, "0");

		const minute =
			String(
				date.getMinutes()
			).padStart(2, "0");


		return `${hour}:${minute} ${day}/${month}/${year}`;

	}


	/* ============================================================
	   17. TRA NHÂN SỰ THEO ENTITY ID
	============================================================ */

	function findEmployeeAuditMonitorEntity(
		entityId
	) {

		const state =
			window.employeeAuditMonitorState;


		const id =
			String(
				entityId || ""
			).trim();


		if (!id) {
			return {};
		}


		return (
			state.usersByCode[id] ||
			state.usersByUid[id] ||
			{}
		);

	}


	/* ============================================================
	   18. ĐỌC AUDIT LOG CỦA MỘT MODULE
	============================================================ */

	async function loadEmployeeAuditMonitorLogsForModule(
		db,
		orgId,
		academicId,
		moduleId,
		startDate,
		endDate
	) {

		const collectionRef =
			db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicId)
				.collection("modulesData")
				.doc(moduleId)
				.collection("auditLogs");


		/*
		 * Audit log hiện có trường date dạng YYYY-MM-DD,
		 * nên ưu tiên query theo date để tránh tải toàn bộ lịch sử.
		 */
		const snapshot =
			await collectionRef
				.where(
					"date",
					">=",
					startDate
				)
				.where(
					"date",
					"<=",
					endDate
				)
				.get();


		const rows = [];


		snapshot.forEach(function (doc) {

			const log =
				doc.data() || {};


			const entityId =
				String(
					log.entityId ||
					""
				).trim();


			const updaterEmail =
				String(
					log.updaterEmail ||
					""
				).trim()
				.toLowerCase();


			const updaterName =
				String(
					log.updaterName ||
					""
				).trim();


			const entity =
				findEmployeeAuditMonitorEntity(
					entityId
				);


			const detail =
				formatEmployeeAuditMonitorChanges(
					log.changes
				);


			/*
			 * Nếu changes không có thì không bỏ log.
			 * Nhưng bảng Chi tiết sẽ dùng action nếu cần
			 * để tránh một dòng hoàn toàn trống.
			 */
			const finalDetail =
				detail ||
				String(
					log.action ||
					""
				).trim();


			rows.push({

				logId:
					doc.id,

				moduleId:
					moduleId,

				moduleName:
					window.employeeAuditMonitorState
						.modulesById[moduleId]
						?.name ||
					moduleId,

				entityId:
					entityId,

				employeeName:
					entity.fullName ||
					entity.name ||
					entity.displayName ||
					entityId,

				employeeCode:
					entity.code ||
					entityId,

				employeeCategory:
					entity.category ||
					"",

				updaterEmail:
					updaterEmail,

				updaterName:
					updaterName ||
					updaterEmail,

				detail:
					finalDetail,

				date:
					String(
						log.date ||
						""
					),

				time:
					formatEmployeeAuditMonitorTime(
						log.timestamp,
						log.date
					),

				timestamp:
					log.timestamp || null

			});

		});


		return rows;

	}


	/* ============================================================
	   19. LOAD + LỌC + RENDER TOÀN BỘ
	============================================================ */
window.loadEmployeeAuditMonitorData =
	async function (
		forceRefresh = false
	) {

		const tableBody =
			document.getElementById(
				"audit-monitor-table-body"
			);


		if (!tableBody) {

			console.warn(
				"[AuditMonitor] Không tìm thấy #audit-monitor-table-body"
			);

			return;

		}


		const context =
			await getEmployeeAuditMonitorContext();


		if (
			!context.orgId ||
			!context.academicId
		) {

			renderEmployeeAuditMonitorMessage(
				"Chưa xác định được tổ chức hoặc năm học."
			);

			return;

		}


		const dateRange =
			getEmployeeAuditMonitorDateRange();


		const filters =
			getEmployeeAuditMonitorSelectedFilters();


		const state =
			window.employeeAuditMonitorState;


		const queryKey =
			createEmployeeAuditMonitorQueryKey(
				context,
				dateRange,
				filters
			);


		if (
			!forceRefresh &&
			state.lastQueryKey === queryKey &&
			Array.isArray(state.rows)
		) {

			renderEmployeeAuditMonitorTable(
				state.rows
			);

			return;

		}


		state.loading = true;


		tableBody.innerHTML =
			`
			<tr>
				<td colspan="5"
					style="text-align:center;color:#6c757d;padding:18px;">
					Đang tải dữ liệu theo dõi...
				</td>
			</tr>
			`;


		try {

			/*
			 * Chuyển field key trong Chi tiết sang LABEL tự nhiên.
			 *
			 * Ví dụ:
			 *   CLGD9_onLuyen: Có
			 *
			 * thành:
			 *   Giao nhiệm vụ và đánh giá học sinh trên phần mềm ôn luyện: Có
			 *
			 * Hàm được đặt bên trong loadEmployeeAuditMonitorData()
			 * để không tạo thêm tên hàm global, tránh trùng với các
			 * hàm đang có trong file Thẻ 3.
			 */
			const convertAuditDetailToLabel =
				function (detail, moduleId) {

					if (!detail) {
						return "";
					}

					const rawDetail =
						String(detail).trim();

					if (!rawDetail) {
						return "";
					}


					/*
					 * Tìm module hiện tại từ các cache đang có.
					 * Ưu tiên state.modulesById.
					 */
					let moduleItem = null;


					if (
						state.modulesById &&
						typeof state.modulesById === "object"
					) {

						moduleItem =
							state.modulesById[moduleId] ||
							null;

					}


					/*
					 * Fallback cache module của Thẻ 3.
					 */
					if (!moduleItem) {

						const moduleCache =
							window.employeeAuditMonitorModulesCache;

						if (Array.isArray(moduleCache)) {

							moduleItem =
								moduleCache.find(
									function (item) {
										return String(
											item?.id || ""
										).trim() === String(
											moduleId || ""
										).trim();
									}
								) || null;

						} else if (
							moduleCache &&
							typeof moduleCache === "object"
						) {

							moduleItem =
								moduleCache[moduleId] ||
								null;

						}

					}


					/*
					 * Fallback cachedModulesList nếu hệ thống hiện tại
					 * vẫn đang dùng cache module cũ.
					 */
					if (!moduleItem) {

						const modules =
							Array.isArray(window.cachedModulesList)
								? window.cachedModulesList
								: [];


						moduleItem =
							modules.find(
								function (item) {
									return String(
										item?.id || ""
									).trim() === String(
										moduleId || ""
									).trim();
								}
							) || null;

					}


					if (!moduleItem) {
						return rawDetail;
					}


					/*
					 * Có thể module cache dùng fields hoặc kpiFields.
					 */
					const fields =
						Array.isArray(moduleItem.fields)
							? moduleItem.fields
							: Array.isArray(moduleItem.kpiFields)
								? moduleItem.kpiFields
								: [];


					if (!fields.length) {
						return rawDetail;
					}


					const labelMap = {};


					fields.forEach(
						function (field) {

							if (
								!field ||
								typeof field !== "object"
							) {
								return;
							}


							const key =
								String(
									field.key ||
									field.id ||
									field.fieldKey ||
									""
								).trim();


							if (!key) {
								return;
							}


							const label =
								String(
									field.label ||
									field.title ||
									field.name ||
									field.displayName ||
									key
								).trim();


							labelMap[key] =
								label || key;

						}
					);


					/*
					 * Detail hiện tại được tạo theo dạng:
					 *   fieldKey: value | fieldKey2: value2
					 *
					 * Thay đúng phần fieldKey ở đầu mỗi segment.
					 */
					return rawDetail
						.split(" | ")
						.map(
							function (part) {

								const text =
									String(part || "").trim();


								if (!text) {
									return "";
								}


								const separatorIndex =
									text.indexOf(":");


								if (separatorIndex <= 0) {
									return text;
								}


								const fieldKey =
									text
										.slice(0, separatorIndex)
										.trim();


								const value =
									text
										.slice(separatorIndex + 1)
										.trim();


								const label =
									labelMap[fieldKey] ||
									fieldKey;


								return value
									? `${label}: ${value}`
									: label;

							}
						)
						.filter(Boolean)
						.join(" | ");

				};


			/*
			 * Lấy lại filters sau khi cache được chuẩn bị.
			 */
			const activeFilters =
				getEmployeeAuditMonitorSelectedFilters();


			/*
			 * Module được chọn:
			 * - Nếu có chọn: chỉ đọc module đó.
			 * - Nếu không chọn: đọc tất cả module được phân công.
			 */
			let moduleIds =
				Array.isArray(
					activeFilters.module
				)
					? [
						...activeFilters.module
					]
					: [];


			if (!moduleIds.length) {

				moduleIds =
					buildEmployeeAuditMonitorModuleOptions()
						.map(
							item => item.id
						);

			}


			/*
			 * Không có module thì bảng rỗng.
			 */
			if (!moduleIds.length) {

				state.rows = [];
				state.allRows = [];
				state.lastQueryKey = queryKey;

				renderEmployeeAuditMonitorMessage(
					"Chưa có bài toán được phân công."
				);

				return;

			}


			const db =
				firebase.firestore();


			const allRows = [];


			/*
			 * Đọc auditLogs từng module.
			 */
			for (
				const moduleId
				of moduleIds
			) {

				const rows =
					await loadEmployeeAuditMonitorLogsForModule(
						db,
						context.orgId,
						context.academicId,
						moduleId,
						dateRange.startDate,
						dateRange.endDate
					);


				/*
				 * Đổi field key -> label ngay sau khi lấy log,
				 * đồng thời tách mỗi cập nhật thành một dòng riêng.
				 * Không sửa object log gốc trong Firestore.
				 */
				/*
				 * Đổi field key -> label và tách MỖI cập nhật thành MỘT ROW.
				 *
				 * Ví dụ một log có:
				 *   CLGD9_onLuyen: Có | DiHocMuon: 2 | KhongDongPhuc: 1
				 *
				 * sẽ trở thành 3 dòng riêng trong bảng và Excel.
				 */
				rows.forEach(
					function (row) {

						if (!row) {
							return;
						}

						const labeledDetail =
							convertAuditDetailToLabel(
								row.detail,
								moduleId
							);

						/*
						 * Detail được tạo từ format cũ bằng dấu " | ".
						 * Tách từng phần để mỗi cập nhật là một dòng.
						 *
						 * Không dùng <br> vì dữ liệu này còn được dùng
						 * trực tiếp cho chức năng xuất Excel.
						 */
						const detailItems =
							String(labeledDetail || "")
								.split(/\s*\|\s*/)
								.map(
									function (item) {
										return String(item || "").trim();
									}
								)
								.filter(Boolean);

						/*
						 * Trường hợp không có chi tiết vẫn giữ nguyên
						 * một dòng log để không làm mất bản ghi.
						 */
						if (!detailItems.length) {
							allRows.push({
								...row,
								detail: ""
							});
							return;
						}

						/*
						 * Mỗi detailItem = một row.
						 * Các thông tin thời gian, nhân sự, người nhập,
						 * module... được giữ nguyên.
						 */
						detailItems.forEach(
							function (detailItem) {

								allRows.push({
									...row,
									detail: detailItem
								});

							}
						);

					}
				);

			}


			/*
			 * Lọc Người nhập liệu.
			 */
			const updaterFilter =
				Array.isArray(
					activeFilters.updater
				)
					? activeFilters.updater
						.map(
							value =>
								String(
									value || ""
								)
								.trim()
								.toLowerCase()
						)
						.filter(Boolean)
					: [];


			let filteredRows =
				allRows;


			if (updaterFilter.length) {

				const updaterSet =
					new Set(
						updaterFilter
					);


				filteredRows =
					filteredRows.filter(
						row =>
							updaterSet.has(
								String(
									row.updaterEmail ||
									""
								)
								.trim()
								.toLowerCase()
							)
					);

			}


			/*
			 * Sắp xếp:
			 * mới nhất lên đầu.
			 */
			filteredRows.sort(
				function (a, b) {

					const ta =
						getEmployeeAuditMonitorTimestampValue(
							a.timestamp,
							a.date
						);

					const tb =
						getEmployeeAuditMonitorTimestampValue(
							b.timestamp,
							b.date
						);

					return tb - ta;

				}
			);


			state.allRows =
				allRows;

			state.rows =
				filteredRows;

			state.lastQueryKey =
				queryKey;

			state.loading =
				false;


			renderEmployeeAuditMonitorTable(
				filteredRows
			);


		} catch (error) {

			state.loading = false;

			console.error(
				"[AuditMonitor] Lỗi tải dữ liệu:",
				error
			);


			renderEmployeeAuditMonitorMessage(
				"Lỗi tải dữ liệu: " +
				(
					error?.message ||
					error
				)
			);

		}

	};



	/* ============================================================
	   20. TIMESTAMP -> NUMBER ĐỂ SORT
	============================================================ */

	function getEmployeeAuditMonitorTimestampValue(
		timestamp,
		fallbackDate
	) {

		if (
			timestamp &&
			typeof timestamp.toDate === "function"
		) {

			return timestamp
				.toDate()
				.getTime();

		}


		if (timestamp instanceof Date) {
			return timestamp.getTime();
		}


		if (
			typeof timestamp === "string" ||
			typeof timestamp === "number"
		) {

			const parsed =
				new Date(timestamp);

			if (
				!Number.isNaN(
					parsed.getTime()
				)
			) {

				return parsed.getTime();

			}

		}


		if (fallbackDate) {

			const parsed =
				new Date(
					`${fallbackDate}T00:00:00`
				);

			if (
				!Number.isNaN(
					parsed.getTime()
				)
			) {

				return parsed.getTime();

			}

		}


		return 0;

	}


	/* ============================================================
	   21. RENDER THÔNG BÁO
	============================================================ */

	function renderEmployeeAuditMonitorMessage(
		message
	) {

		const tbody =
			document.getElementById(
				"audit-monitor-table-body"
			);


		if (!tbody) return;


		tbody.innerHTML =
			`
			<tr>
				<td colspan="5"
					style="text-align:center;color:#6c757d;padding:18px;">
					${escapeEmployeeAuditMonitorHtml(message)}
				</td>
			</tr>
			`;

	}


	/* ============================================================
	   22. RENDER BẢNG
	============================================================ */

	window.renderEmployeeAuditMonitorTable =
		function (rows) {

			const tbody =
				document.getElementById(
					"audit-monitor-table-body"
				);


			if (!tbody) {
				return;
			}


			if (
				!Array.isArray(rows) ||
				!rows.length
			) {

				renderEmployeeAuditMonitorMessage(
					"Không có dữ liệu phù hợp với bộ lọc."
				);

				return;

			}


			let html = "";


			rows.forEach(function (row) {

				const time =
					escapeEmployeeAuditMonitorHtml(
						row.time ||
						row.date ||
						""
					);


				const employeeName =
					escapeEmployeeAuditMonitorHtml(
						row.employeeName ||
						row.entityId ||
						""
					);


				const employeeCode =
					escapeEmployeeAuditMonitorHtml(
						row.employeeCode ||
						row.entityId ||
						""
					);


				const updater =
					escapeEmployeeAuditMonitorHtml(
						row.updaterName ||
						row.updaterEmail ||
						""
					);


				const detail =
					escapeEmployeeAuditMonitorHtml(
						row.detail ||
						""
					);


				html +=
					`
					<tr>

						<td>
							${time}
						</td>

						<td>
							<div style="font-weight:600;">
								${employeeName}
							</div>
							${
								row.employeeCategory
									? `
										<div style="
											font-size:.7rem;
											color:#6c757d;
											margin-top:2px;
										">
											${escapeEmployeeAuditMonitorHtml(
												row.employeeCategory
											)}
										</div>
									  `
									: ""
							}
						</td>

						<td>
							${employeeCode}
						</td>

						<td>
							<div style="font-weight:600;">
								${updater}
							</div>
							${
								row.updaterEmail
									? `
										<div style="
											font-size:.7rem;
											color:#6c757d;
											margin-top:2px;
										">
											${escapeEmployeeAuditMonitorHtml(
												row.updaterEmail
											)}
										</div>
									  `
									: ""
							}
						</td>

						<td>
							${detail}
						</td>

					</tr>
					`;

			});


			tbody.innerHTML =
				html;

		};


	/* ============================================================
	   23. ÁP DỤNG FILTER -> LOAD BẢNG
	============================================================ */

	window.applyEmployeeAuditMonitorFilters =
		function () {

			/*
			 * Khi người dùng bấm "Áp dụng" trên modal,
			 * gọi lại dữ liệu.
			 */
			window.loadEmployeeAuditMonitorData(
				true
			);

		};


	/* ============================================================
	   24. GẮN SỰ KIỆN CHO NGÀY
	============================================================ */

	function initEmployeeAuditMonitorDateEvents() {

		const start =
			document.getElementById(
				"audit-monitor-start-date"
			);

		const end =
			document.getElementById(
				"audit-monitor-end-date"
			);


		[start, end]
			.forEach(function (element) {

				if (!element) return;


				if (
					element.dataset.auditMonitorBound ===
					"1"
				) {
					return;
				}


				element.dataset.auditMonitorBound =
					"1";


				element.addEventListener(
					"change",
					function () {

						window.loadEmployeeAuditMonitorData(
							true
						);

					}
				);

			});

	}


	/* ============================================================
	   25. KHỞI TẠO THẺ 3
	============================================================ */

	window.initEmployeeAuditMonitorTab =
    async function () {

        const tab =
            document.getElementById(
                "emp-tab-sec-3"
            );

        if (!tab) {

            console.warn(
                "[AuditMonitor] Không tìm thấy #emp-tab-sec-3"
            );

            return;
        }

        try {

            if (
                typeof window.initEmployeeAuditMonitorDateEvents ===
                "function"
            ) {
                window.initEmployeeAuditMonitorDateEvents();
            }

            /*
             * Nạp updater + toàn bộ module KPI.
             */
            await window.loadEmployeeAuditMonitorFilterOptions(
                false
            );

            /*
             * Đọc audit log.
             */
            await window.loadEmployeeAuditMonitorData(
                false
            );

            if (
                window.employeeAuditMonitorState &&
                typeof window.employeeAuditMonitorState ===
                    "object"
            ) {
                window.employeeAuditMonitorState.initialized =
                    true;
            }

        } catch (error) {

            console.error(
                "[AuditMonitor] Lỗi khởi tạo Thẻ 3:",
                error
            );

            if (
                window.employeeAuditMonitorState
            ) {
                window.employeeAuditMonitorState.loading =
                    false;
            }

            if (
                typeof renderEmployeeAuditMonitorMessage ===
                "function"
            ) {
                renderEmployeeAuditMonitorMessage(
                    "Không thể tải dữ liệu theo dõi người nhập liệu."
                );
            }
        }
    };

		


	/* ============================================================
	   26. REFRESH THỦ CÔNG
	============================================================ */

	window.refreshEmployeeAuditMonitor =
		async function () {

			const state =
				window.employeeAuditMonitorState;

			if (state) {
				state.lastQueryKey = "";
			}

			/*
			 * Force reload module KPI + updater options.
			 */
			await window.loadEmployeeAuditMonitorFilterOptions(
				true
			);

			/*
			 * Force reload audit logs.
			 */
			await window.loadEmployeeAuditMonitorData(
				true
			);
		};




	/* ============================================================
	   27. TỰ ĐỒNG BỘ CACHE KHI MỞ THẺ 3
	============================================================ */

	document.addEventListener(
		"DOMContentLoaded",
		function () {

			/*
			 * Chỉ gắn event ngày.
			 * Không tự load Firestore khi trang vừa mở.
			 */
			initEmployeeAuditMonitorDateEvents();

		}
	);


	/* ============================================================
	   28. KHI CÁC CACHE PHÂN CÔNG / MODULE THAY ĐỔI
		   CÓ THỂ GỌI HÀM NÀY TỪ TAB QUẢN TRỊ
	============================================================ */

	window.syncEmployeeAuditMonitorFilterCache =
		async function () {

			await window.loadEmployeeAuditMonitorFilterOptions(
				true
			);

			return window.employeeAuditMonitorState;
		};



	/* ============================================================
	   29. HÀM TIỆN ÍCH KIỂM TRA DỮ LIỆU
	============================================================ */

	window.getEmployeeAuditMonitorState =
		function () {

			return window.employeeAuditMonitorState;

		};

	
	

	// KHỐI XUẤT DỮ LIỆU CHÍNH RA FILE EXCEL
	
		/* ============================================================
	   THẺ 3 - XUẤT DỮ LIỆU EXCEL
	   ============================================================
	   Nút HTML:
	   onclick="exportEmployeeAuditMonitorExcel()"

	   Logic:
	   - Xuất đúng dữ liệu đang hiển thị sau bộ lọc Thời gian /
		 Người nhập / Module.
	   - 1 người nhập  -> 1 file XLSX, mỗi module 1 sheet.
	   - Nhiều người   -> 1 file ZIP, mỗi người 1 file XLSX.
	   - Không có dữ liệu -> thông báo, không tạo file.
	   - Ưu tiên SheetJS (XLSX) và JSZip nếu đã được nạp.
	   ============================================================ */

	

		function getExportRows() {
			const state = window.employeeAuditMonitorState || {};
			return Array.isArray(state.rows) ? [...state.rows] : [];
		}

		function getExportFilters() {
			if (typeof window.getAuditMonitorFilterValues === "function") {
				return window.getAuditMonitorFilterValues();
			}

			return {
				updater: [],
				module: []
			};
		}

		function getExportDateRange() {
			const startEl = document.getElementById("audit-monitor-start-date");
			const endEl = document.getElementById("audit-monitor-end-date");

			let start = String(startEl?.value || "").trim();
			let end = String(endEl?.value || "").trim();

			const today = new Date().toLocaleDateString("en-CA");

			if (!start) start = today;
			if (!end) end = today;

			if (start > end) {
				const temp = start;
				start = end;
				end = temp;
			}

			return {
				startDate: start,
				endDate: end
			};
		}

		function safeFileName(value, fallback) {
			const text = String(value || fallback || "")
				.trim()
				.replace(/[\\/:*?"<>|]/g, "_")
				.replace(/\s+/g, " ");

			return text || fallback || "export";
		}

		function safeSheetName(value, fallback) {
			let name = String(value || fallback || "Sheet")
				.trim()
				.replace(/[\\/*?:[\]]/g, " ")
				.replace(/\s+/g, " ");

			if (!name) name = fallback || "Sheet";

			/* Excel giới hạn tên sheet tối đa 31 ký tự. */
			return name.substring(0, 31);
		}

		function uniqueSheetName(workbook, desiredName) {
			const base = safeSheetName(desiredName, "Module");
			let name = base;
			let index = 2;

			while (workbook.SheetNames.includes(name)) {
				const suffix = ` (${index})`;
				name = base.substring(0, 31 - suffix.length) + suffix;
				index++;
			}

			return name;
		}

		function formatExportDetail(row) {
			return String(
				row?.detail ||
				""
			).trim();
		}

		function rowToExcelArray(row) {
			return [
				row?.time || row?.date || "",
				row?.employeeName || row?.entityId || "",
				row?.employeeCode || row?.entityId || "",
				row?.updaterName || row?.updaterEmail || "",
				row?.updaterEmail || "",
				row?.moduleName || row?.moduleId || "",
				formatExportDetail(row)
			];
		}

		function getExcelHeaders() {
			return [
				"Thời gian",
				"Họ và tên",
				"Mã định danh",
				"Người nhập",
				"Email người nhập",
				"Module nhiệm vụ",
				"Chi tiết"
			];
		}

		function buildWorkbookForRows(rows, employeeName) {
			if (
				typeof XLSX === "undefined" ||
				!XLSX.utils
			) {
				throw new Error(
					"Chưa nạp thư viện Excel (SheetJS/XLSX)."
				);
			}

			const workbook = XLSX.utils.book_new();

			/*
			 * Gom theo module.
			 * Mỗi module = một sheet.
			 */
			const groups = {};

			rows.forEach(function (row) {
				const moduleId = String(
					row?.moduleId || "unknown"
				).trim();

				const moduleName = String(
					row?.moduleName ||
					moduleId ||
					"Module"
				).trim();

				const key = moduleId || moduleName;

				if (!groups[key]) {
					groups[key] = {
						moduleName: moduleName,
						rows: []
					};
				}

				groups[key].rows.push(row);
			});

			const groupList = Object.values(groups);

			/*
			 * Nếu vì lý do nào đó không có module,
			 * vẫn tạo một sheet Tổng hợp.
			 */
			if (!groupList.length) {
				groupList.push({
					moduleName: "Tổng hợp",
					rows: rows
				});
			}

			/*
			 * Sheet Tổng hợp luôn đặt đầu tiên.
			 */
			const summaryRows = [
				getExcelHeaders(),
				...rows.map(rowToExcelArray)
			];

			const summarySheet =
				XLSX.utils.aoa_to_sheet(summaryRows);

			summarySheet["!cols"] = [
				{ wch: 20 },
				{ wch: 24 },
				{ wch: 14 },
				{ wch: 24 },
				{ wch: 30 },
				{ wch: 28 },
				{ wch: 70 }
			];

			XLSX.utils.book_append_sheet(
				workbook,
				summarySheet,
				"Tổng hợp"
			);

			groupList.forEach(function (group) {
				const data = [
					getExcelHeaders(),
					...group.rows.map(rowToExcelArray)
				];

				const sheet =
					XLSX.utils.aoa_to_sheet(data);

				sheet["!cols"] = [
					{ wch: 20 },
					{ wch: 24 },
					{ wch: 14 },
					{ wch: 24 },
					{ wch: 30 },
					{ wch: 28 },
					{ wch: 70 }
				];

				const sheetName =
					uniqueSheetName(
						workbook,
						group.moduleName
					);

				XLSX.utils.book_append_sheet(
					workbook,
					sheet,
					sheetName
				);
			});

			return workbook;
		}

		function writeWorkbookToBlob(workbook) {
			const arrayBuffer = XLSX.write(
				workbook,
				{
					bookType: "xlsx",
					type: "array"
				}
			);

			return new Blob(
				[arrayBuffer],
				{
					type:
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				}
			);
		}

		function downloadBlob(blob, fileName) {
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");

			anchor.href = url;
			anchor.download = fileName;
			anchor.style.display = "none";

			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();

			setTimeout(function () {
				URL.revokeObjectURL(url);
			}, 1500);
		}

		function groupRowsByUpdater(rows) {
			const groups = {};

			rows.forEach(function (row) {
				const email = String(
					row?.updaterEmail ||
					""
				).trim().toLowerCase();

				/*
				 * Nếu audit log cũ không có email,
				 * dùng updaterName làm khóa tạm.
				 */
				const key =
					email ||
					String(
						row?.updaterName ||
						"unknown"
					).trim() ||
					"unknown";

				if (!groups[key]) {
					groups[key] = {
						email: email,
						name:
							String(
								row?.updaterName ||
								email ||
								"Người nhập dữ liệu"
							).trim(),
						rows: []
					};
				}

				groups[key].rows.push(row);
			});

			return Object.values(groups);
		}

		function showExportMessage(message) {
			/*
			 * Nếu project có toast riêng thì ưu tiên dùng.
			 */
			if (
				typeof window.showToast === "function"
			) {
				window.showToast(message);
				return;
			}

			if (
				typeof window.showNotification === "function"
			) {
				window.showNotification(message);
				return;
			}

			alert(message);
		}

		function setExportButtonBusy(isBusy) {
			const button =
				document.querySelector(
					".audit-monitor-export-btn"
				) ||
				document.querySelector(
					'[onclick*="exportEmployeeAuditMonitorExcel"]'
				);

			if (!button) return;

			if (isBusy) {
				if (!button.dataset.oldHtml) {
					button.dataset.oldHtml =
						button.innerHTML;
				}

				button.disabled = true;
				button.innerHTML =
					'<i class="fa-solid fa-spinner fa-spin"></i>';
				button.style.opacity = "0.65";
				button.style.pointerEvents = "none";
			} else {
				button.disabled = false;

				if (button.dataset.oldHtml) {
					button.innerHTML =
						button.dataset.oldHtml;
					delete button.dataset.oldHtml;
				}

				button.style.opacity = "";
				button.style.pointerEvents = "";
			}
		}

		async function exportOneEmployeeToXlsx(
			employeeGroup,
			dateRange
		) {
			const workbook =
				buildWorkbookForRows(
					employeeGroup.rows,
					employeeGroup.name
				);

			const safeName =
				safeFileName(
					employeeGroup.name,
					"Nguoi_nhap"
				);

			const fileName =
				`Theo_doi_${safeName}_${dateRange.startDate}_${dateRange.endDate}.xlsx`;

			const blob =
				writeWorkbookToBlob(workbook);

			downloadBlob(blob, fileName);

			return fileName;
		}

		async function exportMultipleEmployeesToZip(
			employeeGroups,
			dateRange
		) {
			if (typeof JSZip === "undefined") {
				throw new Error(
					"Chưa nạp thư viện ZIP (JSZip)."
				);
			}

			const zip = new JSZip();

			employeeGroups.forEach(function (group) {
				const workbook =
					buildWorkbookForRows(
						group.rows,
						group.name
					);

				const arrayBuffer =
					XLSX.write(
						workbook,
						{
							bookType: "xlsx",
							type: "array"
						}
					);

				const safeName =
					safeFileName(
						group.name,
						"Nguoi_nhap"
					);

				const fileName =
					`Theo_doi_${safeName}_${dateRange.startDate}_${dateRange.endDate}.xlsx`;

				zip.file(
					fileName,
					arrayBuffer
				);
			});

			const zipBlob =
				await zip.generateAsync({
					type: "blob",
					compression: "DEFLATE",
					compressionOptions: {
						level: 6
					}
				});

			const zipName =
				`Theo_doi_nguoi_nhap_${dateRange.startDate}_${dateRange.endDate}.zip`;

			downloadBlob(
				zipBlob,
				zipName
			);

			return zipName;
		}

		/*
		 * ============================================================
		 * HÀM CHÍNH - GỌI TỪ NÚT EXCEL
		 * ============================================================
		 */
		window.exportEmployeeAuditMonitorExcel =
			async function () {
				if (
					typeof XLSX === "undefined"
				) {
					showExportMessage(
						"Chưa nạp thư viện Excel (SheetJS/XLSX)."
					);
					return;
				}

				const rows =
					getExportRows();

				if (!rows.length) {
					showExportMessage(
						"Không có dữ liệu để xuất."
					);
					return;
				}

				const dateRange =
					getExportDateRange();

				const filters =
					getExportFilters();

				setExportButtonBusy(true);

				try {
					/*
					 * Kiểm tra bộ lọc thực tế.
					 *
					 * Dữ liệu state.rows chính là dữ liệu đã
					 * được lọc theo thời gian + người nhập + module.
					 *
					 * Vì vậy không query Firestore lần nữa.
					 */
					const employeeGroups =
						groupRowsByUpdater(rows);

					if (!employeeGroups.length) {
						showExportMessage(
							"Không xác định được người nhập dữ liệu."
						);
						return;
					}

					/*
					 * ------------------------------------------------
					 * TRƯỜNG HỢP CHỈ CÓ 1 NGƯỜI
					 * ------------------------------------------------
					 *
					 * Xuất trực tiếp 1 XLSX.
					 */
					if (
						employeeGroups.length === 1
					) {
						await exportOneEmployeeToXlsx(
							employeeGroups[0],
							dateRange
						);

						return;
					}

					/*
					 * ------------------------------------------------
					 * NHIỀU NGƯỜI
					 * ------------------------------------------------
					 *
					 * Nếu có nhiều người thì tạo ZIP,
					 * bên trong mỗi người là một file XLSX.
					 */
					await exportMultipleEmployeesToZip(
						employeeGroups,
						dateRange
					);

				} catch (error) {
					console.error(
						"[AuditMonitor] Lỗi xuất Excel:",
						error
					);

					showExportMessage(
						"Không thể xuất dữ liệu: " +
						(
							error?.message ||
							error
						)
					);
				} finally {
					setExportButtonBusy(false);
				}
			};



	//	THẺ 4 - LỚP CHỦ NHIỆM
async function loadHomeroomClassData(forceRefresh = false) {
    const tableBody = document.getElementById("emp-homeroom-body-rows");
    const headerRow = document.getElementById("emp-homeroom-header-row");
    const classNameSpan = document.getElementById("emp-homeroom-class-name");
    const modeSelect = document.getElementById("emp-homeroom-mode-select");
    const badge = document.getElementById("emp-homeroom-cache-badge");

    if (!tableBody) return;

    const orgId = String(window.currentOrgIdGlobal || "").trim();

    if (!orgId) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center;color:red;">
                    Chưa xác định được thông tin đơn vị (OrgId).
                </td>
            </tr>
        `;
        return;
    }

    // ============================================================
    // 1. XÁC ĐỊNH NĂM HỌC
    // ============================================================

    let academicYearId = "";
    const yearsArr = window.currentAcademicYearsGlobal;

    if (Array.isArray(yearsArr) && yearsArr.length > 0) {
        const lastYearItem = yearsArr[yearsArr.length - 1];

        academicYearId = String(
            typeof lastYearItem === "object" && lastYearItem !== null
                ? (
                    lastYearItem.id ||
                    lastYearItem.name ||
                    lastYearItem.year ||
                    ""
                )
                : lastYearItem
        ).trim();
    }

    if (!academicYearId) {
        academicYearId = String(
            window.currentAcademicYearIdGlobal || ""
        ).trim();
    }

    if (!academicYearId) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center;color:red;">
                    Chưa xác định được năm học hiện tại.
                </td>
            </tr>
        `;
        return;
    }

    // ============================================================
    // 2. USER ĐĂNG NHẬP
    // ============================================================

    const authUser = firebase.auth().currentUser;

    if (!authUser) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center;color:red;">
                    Chưa đăng nhập hệ thống.
                </td>
            </tr>
        `;
        return;
    }

    const teacherUid = String(authUser.uid || "").trim();

    const currentEmail = String(
        window.currentUserEmailGlobal ||
        authUser.email ||
        ""
    ).trim().toLowerCase();

    const mode = modeSelect?.value || "daily";

    tableBody.innerHTML = `
        <tr>
            <td colspan="10" style="text-align:center;color:#6c757d;">
                Đang tải dữ liệu lớp chủ nhiệm theo chế độ
                ${
                    mode === "monthly"
                        ? "Tháng"
                        : mode === "weekly"
                            ? "Tuần"
                            : "Ngày"
                }...
            </td>
        </tr>
    `;

    try {
        const db = firebase.firestore();

        // ============================================================
        // 3. CACHE PHÂN CÔNG LỚP CHỦ NHIỆM
        // ============================================================

        window._homeroomAssignmentCache =
            window._homeroomAssignmentCache || {};

        const assignmentCacheKey =
            `${orgId}__${academicYearId}__${teacherUid}`;

        let assignmentCache =
            window._homeroomAssignmentCache[assignmentCacheKey];

        let homeroomClasses = [];
        let teacherDepartments = [];

        if (assignmentCache && !forceRefresh) {
            homeroomClasses =
                Array.isArray(assignmentCache.homeroomClasses)
                    ? [...assignmentCache.homeroomClasses]
                    : [];

            teacherDepartments =
                Array.isArray(assignmentCache.departments)
                    ? [...assignmentCache.departments]
                    : [];
        } else {
            const assignRef = db
                .collection("organizations")
                .doc(orgId)
                .collection("academicYears")
                .doc(academicYearId)
                .collection("assignments");

            const allAssigns = await assignRef.get();

            let assignData = null;

            allAssigns.forEach(d => {
                const data = d.data() || {};

                const dataUid = String(
                    data.uid ||
                    data.userId ||
                    data.memberId ||
                    ""
                ).trim();

                const dataEmail = String(
                    data.email || ""
                ).trim().toLowerCase();

                if (
                    d.id === teacherUid ||
                    dataUid === teacherUid ||
                    (
                        currentEmail &&
                        dataEmail === currentEmail
                    )
                ) {
                    assignData = data;
                }
            });

            if (assignData) {
                const rawData =
                    assignData.homeroom ||
                    assignData.homeroomClasses ||
                    assignData.classes ||
                    [];

                let itemsList = [];

                if (typeof rawData === "string") {
                    itemsList = rawData
                        .split(",")
                        .map(s => s.trim())
                        .filter(Boolean);
                } else if (Array.isArray(rawData)) {
                    itemsList = rawData;
                }

                itemsList.forEach(item => {
                    const val = String(item).trim();

                    if (!val) return;

                    if (/\d/.test(val)) {
                        homeroomClasses.push(val);
                    } else {
                        teacherDepartments.push(val);
                    }
                });
            }

            assignmentCache = {
                homeroomClasses: [...homeroomClasses],
                departments: [...teacherDepartments],
                cachedAt: Date.now()
            };

            window._homeroomAssignmentCache[assignmentCacheKey] =
                assignmentCache;

            window.currentTeacherHomerooms = [...homeroomClasses];
            window.currentTeacherDepartments = [...teacherDepartments];
        }

        if (homeroomClasses.length === 0) {
            if (classNameSpan) {
                classNameSpan.innerText = "Không có lớp chủ nhiệm";
            }

            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="
                        text-align:center;
                        color:#6c757d;
                        font-style:italic;
                    ">
                        Bạn không được phân công chủ nhiệm lớp nào trong năm học này.
                    </td>
                </tr>
            `;
            return;
        }

        if (classNameSpan) {
            classNameSpan.innerText = homeroomClasses.join(", ");
        }

        // ============================================================
        // 4. CACHE USERS
        // ============================================================

        window._usersCacheByOrg = window._usersCacheByOrg || {};

        let usersCache = window._usersCacheByOrg[orgId];

        let cachedUsersNeedRefresh =
            !usersCache ||
            !usersCache.users ||
            Object.keys(usersCache.users).length === 0;

        if (!cachedUsersNeedRefresh) {
            const cachedList = Object.values(usersCache.users);

            cachedUsersNeedRefresh = cachedList.some(
                user => user.code === undefined
            );
        }

        if (
            window.cachedUsersMap &&
            Object.keys(window.cachedUsersMap).length > 0
        ) {
            const globalCachedList =
                Object.values(window.cachedUsersMap);

            const globalMissingCode =
                globalCachedList.some(
                    user => user.code === undefined
                );

            if (globalMissingCode) {
                cachedUsersNeedRefresh = true;
            }
        }

        if (forceRefresh || cachedUsersNeedRefresh) {
            const usersSnap = await db
                .collection("organizations")
                .doc(orgId)
                .collection("users")
                .get();

            const usersMap = {};

            usersSnap.forEach(uDoc => {
                const uData = uDoc.data() || {};

                const code = String(
                    uData.code ||
                    uData.memberId ||
                    ""
                ).trim();

                const uid = String(
                    uData.uid ||
                    uData.id ||
                    uDoc.id ||
                    ""
                ).trim();

                const fullName =
                    uData.fullName ||
                    uData.displayName ||
                    uData.name ||
                    uDoc.id;

                const category = String(
                    uData.category ||
                    uData.className ||
                    ""
                ).trim();

                usersMap[uDoc.id] = {
                    id: uDoc.id,
                    uid,
                    code,
                    fullName,
                    category,
                    email: String(
                        uData.email || ""
                    ).trim().toLowerCase(),
                    role: uData.role || ""
                };
            });

            usersCache = {
                users: usersMap,
                cachedAt: Date.now()
            };

            window._usersCacheByOrg[orgId] = usersCache;
            window.cachedUsersMap = usersMap;
        } else {
            window.cachedUsersMap = usersCache.users;
        }

        const usersMap = window.cachedUsersMap || {};

        // ============================================================
        // 5. DANH SÁCH HỌC SINH
        // ============================================================

        const homeroomStudents = [];

        for (const [uId, uInfo] of Object.entries(usersMap)) {
            if (!uInfo || !uInfo.category) continue;

            if (
                !homeroomClasses.includes(
                    String(uInfo.category).trim()
                )
            ) {
                continue;
            }

            const code = String(uInfo.code || "").trim();

            const uid = String(
                uInfo.uid ||
                uInfo.id ||
                uId ||
                ""
            ).trim();

            homeroomStudents.push({
                id: code || uid,
                code,
                uid,
                name:
                    uInfo.fullName ||
                    uInfo.displayName ||
                    uInfo.name ||
                    uId,
                category: String(uInfo.category).trim()
            });
        }

        if (homeroomStudents.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="
                        text-align:center;
                        color:#6c757d;
                        font-style:italic;
                    ">
                        Không tìm thấy học sinh nào thuộc lớp chủ nhiệm
                        (${homeroomClasses.join(", ")}).
                    </td>
                </tr>
            `;
            return;
        }

        // ============================================================
        // 6. CACHE KPI CONFIG - HỌC SINH
        // ============================================================

        window._homeroomKpiConfigCache =
            window._homeroomKpiConfigCache || {};

        const kpiCacheKey =
            `${orgId}__${academicYearId}`;

        let kpiRules =
            window._homeroomKpiConfigCache[kpiCacheKey];

        if (!kpiRules || forceRefresh) {
            const kpiConfigDoc = await db
                .collection("organizations")
                .doc(orgId)
                .collection("academicYears")
                .doc(academicYearId)
                .collection("KPIconfig")
                .doc("student")
                .get();

            kpiRules =
                kpiConfigDoc.exists
                    ? (kpiConfigDoc.data() || {})
                    : {};

            window._homeroomKpiConfigCache[kpiCacheKey] =
                kpiRules;
        }

        // ============================================================
        // 7. ĐIỂM GỐC HỌC SINH
        // ============================================================
        //
        // Ưu tiên tuyệt đối trường BasePoint trong KPIconfig/student.
        // Không cộng BasePoint lặp lại theo từng record/KPI.
        //
        // Công thức tháng:
        // BasePoint - tổng điểm âm + tổng điểm dương
        // ============================================================

        const basePointRaw =
            kpiRules.BasePoint ??
            kpiRules.basePoint ??
            90;

        const basePointNumber =
            Number(basePointRaw);

        const studentBasePoint =
            Number.isFinite(basePointNumber)
                ? basePointNumber
                : 90;

        // ============================================================
        // 8. CACHE MODULE STUDENT
        // ============================================================

        window._homeroomStudentModulesCache =
            window._homeroomStudentModulesCache || {};

        const moduleCacheKey =
            `${orgId}__${academicYearId}__student`;

        let cachedModules =
            window._homeroomStudentModulesCache[moduleCacheKey];

        if (
            !cachedModules ||
            !Array.isArray(cachedModules.modules) ||
            forceRefresh
        ) {
            const snap = await db
                .collection("organizations")
                .doc(orgId)
                .collection("modules")
                .where("targetType", "==", "STUDENT")
                .get();

            cachedModules = {
                modules: snap.docs.map(doc => ({
                    id: doc.id,
                    data: doc.data() || {}
                })),
                cachedAt: Date.now()
            };

            window._homeroomStudentModulesCache[moduleCacheKey] =
                cachedModules;
        }

        const studentModules =
            cachedModules?.modules || [];

        // ============================================================
        // 9. KPI FIELDS
        // ============================================================

        const kpiFieldsMap = {};

        studentModules.forEach(mod => {
            const modData = mod.data || {};

            const fieldsArr =
                Array.isArray(modData.fields)
                    ? modData.fields
                    : [];

            fieldsArr.forEach(fObj => {
                if (
                    fObj &&
                    fObj.isKpi &&
                    fObj.key
                ) {
                    const rawOptions =
                        fObj.kpiOptions ||
                        fObj.options ||
                        {};

                    let optionsMap = {};

                    if (
                        Array.isArray(rawOptions)
                    ) {
                        rawOptions.forEach(opt => {
                            if (!opt) return;

                            const optionKey = String(
                                opt.value ??
                                opt.key ??
                                opt.id ??
                                opt.label ??
                                opt.name ??
                                ""
                            ).trim();

                            if (!optionKey) return;

                            optionsMap[optionKey] = opt;
                        });
                    } else if (
                        rawOptions &&
                        typeof rawOptions === "object"
                    ) {
                        optionsMap = rawOptions;
                    }

                    const fieldWeightRaw =
                        Number(fObj.scoreWeight);

                    kpiFieldsMap[fObj.key] = {
                        id: fObj.key,
                        name:
                            fObj.label ||
                            fObj.key,
                        scoreWeight:
                            Number.isFinite(fieldWeightRaw)
                                ? fieldWeightRaw
                                : -1,
                        kpiOptions: optionsMap
                    };
                }
            });
        });

        const kpiFieldsList =
            Object.values(kpiFieldsMap);

        // ============================================================
        // 10. HEADER
        // ============================================================

        let headerHtml = `
            <th style="
                width:100px;
                text-align:center;
            ">
                Mã định danh
            </th>

            <th style="width:170px;">
                Họ và Tên
            </th>

            <th style="
                width:100px;
                text-align:center;
            ">
                Lớp
            </th>
        `;

        kpiFieldsList.forEach(field => {
            headerHtml += `
                <th style="
                    text-align:center;
                    min-width:90px;
                ">
                    ${field.name}
                </th>
            `;
        });

        if (mode === "monthly") {
            headerHtml += `
                <th style="
                    width:100px;
                    text-align:center;
                ">
                    Tổng lượt
                </th>

                <th style="
                    width:110px;
                    text-align:center;
                ">
                    Điểm trừ
                </th>

                <th style="
                    width:110px;
                    text-align:center;
                ">
                    Điểm cộng
                </th>

                <th style="
                    width:110px;
                    text-align:center;
                ">
                    Điểm tháng
                </th>

                <th style="
                    width:120px;
                    text-align:center;
                ">
                    Xếp loại Tháng
                </th>
            `;
        } else {
            headerHtml += `
                <th style="
                    width:110px;
                    text-align:center;
                ">
                    Tổng lượt vi phạm
                </th>
            `;
        }

        if (headerRow) {
            headerRow.innerHTML = headerHtml;
        }

        // ============================================================
        // 11. KHỞI TẠO THỐNG KÊ
        // ============================================================

        const studentStatsMap = {};

        homeroomStudents.forEach(student => {
            const studentKey =
                student.code ||
                student.uid;

            studentStatsMap[studentKey] = {
                id: studentKey,
                uid: student.uid,
                code: student.code,
                name: student.name,
                className: student.category,

                totalCount: 0,

                // Tổng score ròng, giữ để tương thích.
                totalScore: 0,

                // Tách riêng giống bảng tổng hợp tháng.
                totalPenalty: 0,
                totalBonus: 0,

                kpiCounts: {}
            };
        });

        // ============================================================
        // 12. KHOẢNG THỜI GIAN
        // ============================================================

        const formatDateLocal = date => {
            const y = date.getFullYear();

            const m = String(
                date.getMonth() + 1
            ).padStart(2, "0");

            const d = String(
                date.getDate()
            ).padStart(2, "0");

            return `${y}-${m}-${d}`;
        };

        const now = new Date();

        const todayStr =
            formatDateLocal(now);

        let startDateStr = todayStr;
        let endDateStr = todayStr;

        if (mode === "weekly") {
            const dayOfWeek = now.getDay();

            const diffToMonday =
                dayOfWeek === 0
                    ? -6
                    : 1 - dayOfWeek;

            const monday = new Date(now);

            monday.setDate(
                now.getDate() +
                diffToMonday
            );

            const sunday = new Date(monday);

            sunday.setDate(
                monday.getDate() + 6
            );

            startDateStr =
                formatDateLocal(monday);

            endDateStr =
                formatDateLocal(sunday);

        } else if (mode === "monthly") {
            // ========================================================
            // KỲ BÁO CÁO THÁNG THEO CẤU HÌNH CỦA TỔ CHỨC
            //
            // Đọc trực tiếp:
            // organizations/{orgId}.reportingPeriod.monthly.startDay
            //
            // Ví dụ startDay = 21:
            // - Nếu hôm nay 04/10/2026
            //   => kỳ hiện tại: 21/09/2026 -> 20/10/2026
            // - Nếu hôm nay 25/10/2026
            //   => kỳ hiện tại: 21/10/2026 -> 20/11/2026
            //
            // Nếu startDay = 1:
            //   => kỳ tháng theo lịch: ngày 01 -> ngày cuối tháng.
            // ========================================================

            let reportingStartDay = 1;

            try {
                const orgDoc = await db
                    .collection("organizations")
                    .doc(orgId)
                    .get();

                if (orgDoc.exists) {
                    const orgData =
                        orgDoc.data() || {};

                    const configuredStartDay =
                        orgData?.reportingPeriod?.monthly?.startDay;

                    const parsedStartDay =
                        Number(configuredStartDay);

                    if (
                        Number.isFinite(parsedStartDay) &&
                        parsedStartDay >= 1 &&
                        parsedStartDay <= 31
                    ) {
                        reportingStartDay =
                            Math.floor(parsedStartDay);
                    }
                }
            } catch (periodConfigError) {
                console.warn(
                    "Không đọc được cấu hình kỳ báo cáo tháng, dùng ngày 01:",
                    periodConfigError
                );

                reportingStartDay = 1;
            }

            // Tạo ngày nhưng giới hạn ngày bắt đầu theo số ngày thực tế
            // của tháng, tránh trường hợp startDay = 31 ở tháng ngắn.
            const createClampedDate = (
                year,
                monthIndex,
                day
            ) => {
                const lastDayOfMonth =
                    new Date(
                        year,
                        monthIndex + 1,
                        0
                    ).getDate();

                const safeDay =
                    Math.min(
                        Math.max(
                            Number(day) || 1,
                            1
                        ),
                        lastDayOfMonth
                    );

                return new Date(
                    year,
                    monthIndex,
                    safeDay
                );
            };

            let periodStart;

            if (
                now.getDate() >=
                reportingStartDay
            ) {
                // Đã đến ngày bắt đầu kỳ của tháng hiện tại.
                periodStart =
                    createClampedDate(
                        now.getFullYear(),
                        now.getMonth(),
                        reportingStartDay
                    );
            } else {
                // Chưa đến ngày bắt đầu kỳ:
                // kỳ hiện tại bắt đầu từ tháng trước.
                periodStart =
                    createClampedDate(
                        now.getFullYear(),
                        now.getMonth() - 1,
                        reportingStartDay
                    );
            }

            // Kỳ kết thúc vào ngày ngay trước ngày bắt đầu
            // của kỳ kế tiếp.
            const nextPeriodStart =
                createClampedDate(
                    periodStart.getFullYear(),
                    periodStart.getMonth() + 1,
                    reportingStartDay
                );

            const periodEnd =
                new Date(nextPeriodStart);

            periodEnd.setDate(
                periodEnd.getDate() - 1
            );

            startDateStr =
                formatDateLocal(periodStart);

            endDateStr =
                formatDateLocal(periodEnd);

            console.log(
                "[Homeroom] Kỳ báo cáo tháng:",
                {
                    startDay: reportingStartDay,
                    startDate: startDateStr,
                    endDate: endDateStr
                }
            );
        }

        // ============================================================
        // 13. HÀM PHÂN TÍCH ĐIỂM KPI
        // ============================================================
        //
        // Quy tắc:
        // - Mỗi phần tử có nội dung trong mảng = 1 lượt.
        // - Nếu option có scoreWeight -> dùng scoreWeight của option.
        // - Nếu không có option -> dùng scoreWeight của field.
        // - score < 0 -> totalPenalty += abs(score)
        // - score > 0 -> totalBonus += score
        // - score = 0 -> không cộng trừ điểm nhưng vẫn là 1 lượt.
        //
        // Các dạng dữ liệu được hỗ trợ:
        // 1. scalar
        // 2. object { value, label, name, scoreWeight }
        // 3. array các scalar/object
        // ============================================================

        const normalizeOptionKey = value => {
            if (
                value === undefined ||
                value === null
            ) {
                return "";
            }

            if (
                typeof value === "object"
            ) {
                return String(
                    value.value ??
                    value.key ??
                    value.id ??
                    value.label ??
                    value.name ??
                    ""
                ).trim();
            }

            return String(value).trim();
        };

        const findOptionConfig = (
            field,
            item
        ) => {
            const options =
                field.kpiOptions || {};

            const candidates = [];

            if (
                item &&
                typeof item === "object"
            ) {
                candidates.push(
                    item.value,
                    item.key,
                    item.id,
                    item.label,
                    item.name
                );
            } else {
                candidates.push(item);
            }

            for (const candidate of candidates) {
                const key =
                    normalizeOptionKey(
                        candidate
                    );

                if (!key) continue;

                if (
                    Object.prototype.hasOwnProperty.call(
                        options,
                        key
                    )
                ) {
                    return options[key];
                }

                const matchedKey =
                    Object.keys(options).find(
                        optionKey =>
                            String(optionKey)
                                .trim()
                                .toLowerCase() ===
                            key.toLowerCase()
                    );

                if (matchedKey) {
                    return options[matchedKey];
                }
            }

            return null;
        };

        const getKpiScore = (
            field,
            item
        ) => {
            const optionConfig =
                findOptionConfig(
                    field,
                    item
                );

            if (
                optionConfig &&
                typeof optionConfig === "object"
            ) {
                const optionWeight =
                    Number(
                        optionConfig.scoreWeight ??
                        optionConfig.weight ??
                        optionConfig.score
                    );

                if (
                    Number.isFinite(
                        optionWeight
                    )
                ) {
                    return optionWeight;
                }
            }

            if (
                item &&
                typeof item === "object"
            ) {
                const itemWeight =
                    Number(
                        item.scoreWeight ??
                        item.weight ??
                        item.score
                    );

                if (
                    Number.isFinite(
                        itemWeight
                    )
                ) {
                    return itemWeight;
                }
            }

            const fieldWeight =
                Number(field.scoreWeight);

            return Number.isFinite(
                fieldWeight
            )
                ? fieldWeight
                : -1;
        };

        const getKpiItems = value => {
            if (Array.isArray(value)) {
                return value.filter(item => {
                    if (
                        item === undefined ||
                        item === null
                    ) {
                        return false;
                    }

                    if (
                        typeof item === "string"
                    ) {
                        return item.trim() !== "";
                    }

                    if (
                        typeof item === "object"
                    ) {
                        return Object.values(item).some(
                            v =>
                                v !== undefined &&
                                v !== null &&
                                String(v).trim() !== ""
                        );
                    }

                    return true;
                });
            }

            return [
                value
            ];
        };

        const processKpiValue = (
            stats,
            field,
            value
        ) => {
            if (
                value === undefined ||
                value === null ||
                value === ""
            ) {
                return;
            }

            const items =
                getKpiItems(value);

            for (const item of items) {
                const score =
                    getKpiScore(
                        field,
                        item
                    );

                // Mỗi mục KPI là 1 lượt.
                stats.totalCount += 1;

                stats.kpiCounts[field.id] =
                    (
                        stats.kpiCounts[
                            field.id
                        ] || 0
                    ) + 1;

                if (score < 0) {
                    stats.totalPenalty +=
                        Math.abs(score);
                } else if (score > 0) {
                    stats.totalBonus +=
                        score;
                }
            }

            stats.totalScore =
                -stats.totalPenalty +
                stats.totalBonus;
        };

        // ============================================================
        // 14. PROCESS RECORD
        // ============================================================

        const processRecord = recDoc => {
            const data =
                recDoc.data() || {};

            const rawEntityId =
                data.entityId ||
                data.entityID ||
                String(recDoc.id)
                    .split("_")[0];

            const entityId =
                String(
                    rawEntityId || ""
                ).trim();

            if (!entityId) return;

            // CODE trước.
            let stats =
                studentStatsMap[
                    entityId
                ];

            // UID chỉ fallback dữ liệu cũ.
            if (!stats) {
                const student =
                    homeroomStudents.find(
                        s =>
                            s.uid === entityId
                    );

                if (student) {
                    stats =
                        studentStatsMap[
                            student.code ||
                            student.uid
                        ];
                }
            }

            if (!stats) return;

            kpiFieldsList.forEach(
                kpiField => {
                    const fKey =
                        kpiField.id;

                    let val =
                        data[fKey];

                    if (
                        val === undefined &&
                        data.changes &&
                        data.changes[fKey] !== undefined
                    ) {
                        val =
                            data.changes[fKey];
                    }

                    processKpiValue(
                        stats,
                        kpiField,
                        val
                    );
                }
            );
        };

        // ============================================================
        // 15. ĐỌC RECORDS
        // ============================================================

        for (const mod of studentModules) {
            const moduleId = mod.id;

            const recordsRef = db
                .collection("organizations")
                .doc(orgId)
                .collection("academicYears")
                .doc(academicYearId)
                .collection("modulesData")
                .doc(moduleId)
                .collection("records");

            // --------------------------------------------------------
            // NGÀY
            // --------------------------------------------------------

            if (mode === "daily") {
                const dailyPromises =
                    homeroomStudents.map(
                        async student => {
                            const primaryId =
                                student.code ||
                                student.uid;

                            const primaryRecordId =
                                `${primaryId}_${todayStr}`;

                            let recDoc =
                                await recordsRef
                                    .doc(
                                        primaryRecordId
                                    )
                                    .get();

                            // Fallback record cũ dùng UID.
                            if (
                                !recDoc.exists &&
                                student.uid &&
                                student.uid !== student.code
                            ) {
                                const oldRecordId =
                                    `${student.uid}_${todayStr}`;

                                recDoc =
                                    await recordsRef
                                        .doc(
                                            oldRecordId
                                        )
                                        .get();
                            }

                            if (recDoc.exists) {
                                processRecord(
                                    recDoc
                                );
                            }
                        }
                    );

                await Promise.all(
                    dailyPromises
                );

            } else {
                // ----------------------------------------------------
                // TUẦN / THÁNG
                // ----------------------------------------------------
                //
                // Query cả CODE và UID để không bỏ sót dữ liệu cũ.
                // ----------------------------------------------------

                const studentIds = [
                    ...new Set(
                        homeroomStudents
                            .flatMap(student => [
                                student.code,
                                student.uid
                            ])
                            .map(id =>
                                String(
                                    id || ""
                                ).trim()
                            )
                            .filter(Boolean)
                    )
                ];

                const chunks = [];

                for (
                    let i = 0;
                    i < studentIds.length;
                    i += 30
                ) {
                    chunks.push(
                        studentIds.slice(
                            i,
                            i + 30
                        )
                    );
                }

                const queryPromises =
                    chunks.map(
                        async ids => {
                            const snap =
                                await recordsRef
                                    .where(
                                        "entityId",
                                        "in",
                                        ids
                                    )
                                    .where(
                                        "date",
                                        ">=",
                                        startDateStr
                                    )
                                    .where(
                                        "date",
                                        "<=",
                                        endDateStr
                                    )
                                    .get();

                            snap.forEach(
                                recDoc => {
                                    processRecord(
                                        recDoc
                                    );
                                }
                            );
                        }
                    );

                await Promise.all(
                    queryPromises
                );
            }
        }

        // ============================================================
        // 16. TÍNH ĐIỂM THÁNG / XẾP LOẠI
        // ============================================================

        const processedList =
            Object.values(
                studentStatsMap
            ).map(item => {
                const totalPenalty =
                    Number(
                        item.totalPenalty || 0
                    );

                const totalBonus =
                    Number(
                        item.totalBonus || 0
                    );

                // ĐIỂM THÁNG:
                // BasePoint - điểm âm + điểm dương
                const monthlyScore =
                    mode === "monthly"
                        ? (
                            studentBasePoint -
                            totalPenalty +
                            totalBonus
                        )
                        : (
                            -totalPenalty +
                            totalBonus
                        );

                let rank = "🟢 Tốt";
                let badgeStyle =
                    "background:#d1e7dd;color:#0f5132;";

                if (mode === "monthly") {
                    const chuadatCount =
                        Number(
                            kpiRules.chuadat_count ??
                            15
                        );

                    const chuadatScore =
                        Number(
                            kpiRules.chuadat_score ??
                            15
                        );

                    const datCount =
                        Number(
                            kpiRules.dat_count ??
                            10
                        );

                    const datScore =
                        Number(
                            kpiRules.dat_score ??
                            10
                        );

                    const khaCount =
                        Number(
                            kpiRules.kha_count ??
                            5
                        );

                    const khaScore =
                        Number(
                            kpiRules.kha_score ??
                            5
                        );

                    // Xếp loại dựa trên mức VI PHẠM:
                    // - số lượt
                    // - tổng điểm bị trừ
                    //
                    // Không dùng Math.abs(monthlyScore),
                    // vì điểm cộng không được làm giảm mức vi phạm.
                    if (
                        item.totalCount >=
                            chuadatCount ||
                        totalPenalty >=
                            chuadatScore
                    ) {
                        rank = "🔴 Chưa đạt";
                        badgeStyle =
                            "background:#f8d7da;color:#842029;";
                    } else if (
                        item.totalCount >=
                            datCount ||
                        totalPenalty >=
                            datScore
                    ) {
                        rank = "🟠 Đạt";
                        badgeStyle =
                            "background:#fff3cd;color:#664d03;";
                    } else if (
                        item.totalCount >=
                            khaCount ||
                        totalPenalty >=
                            khaScore
                    ) {
                        rank = "🔵 Khá";
                        badgeStyle =
                            "background:#cff4fc;color:#055160;";
                    }
                }

                return {
                    ...item,

                    totalPenalty,
                    totalBonus,

                    // Điểm ròng của KPI.
                    totalScore:
                        -totalPenalty +
                        totalBonus,

                    // Điểm cuối tháng.
                    monthlyScore,

                    rank,
                    badgeStyle
                };
            });

        // ============================================================
        // 17. RENDER
        // ============================================================

        if (processedList.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="
                        text-align:center;
                        color:#6c757d;
                        font-style:italic;
                    ">
                        Chưa có dữ liệu vi phạm nào trong lớp chủ nhiệm.
                    </td>
                </tr>
            `;
            return;
        }

        let html = "";

        processedList.forEach(item => {
            html += `
                <tr style="
                    border-bottom:1px solid #dee2e6;
                ">
                    <td style="
                        font-family:monospace;
                        font-weight:bold;
                        text-align:center;
                    ">
                        ${item.code || "--"}
                    </td>

                    <td>
                        ${item.name}
                    </td>

                    <td style="
                        text-align:center;
                    ">
                        <span style="
                            background:#e9ecef;
                            padding:2px 6px;
                            border-radius:4px;
                            font-size:0.9em;
                        ">
                            ${item.className}
                        </span>
                    </td>
            `;

            kpiFieldsList.forEach(
                field => {
                    const countVal =
                        item.kpiCounts[
                            field.id
                        ] || 0;

                    html += `
                        <td style="
                            text-align:center;
                        ">
                            ${
                                countVal > 0
                                    ? `
                                        <span style="
                                            color:#dc3545;
                                            font-weight:bold;
                                        ">
                                            ${countVal}
                                        </span>
                                    `
                                    : `
                                        <span style="
                                            color:#ccc;
                                        ">
                                            0
                                        </span>
                                    `
                            }
                        </td>
                    `;
                }
            );

            if (mode === "monthly") {
                html += `
                    <td style="
                        text-align:center;
                        font-weight:bold;
                    ">
                        ${item.totalCount}
                    </td>

                    <td style="
                        text-align:center;
                        color:#dc3545;
                        font-weight:bold;
                    ">
                        -${item.totalPenalty}
                    </td>

                    <td style="
                        text-align:center;
                        color:#198754;
                        font-weight:bold;
                    ">
                        +${item.totalBonus}
                    </td>

                    <td style="
                        text-align:center;
                        font-weight:bold;
                        color:${
                            item.monthlyScore < studentBasePoint
                                ? "#dc3545"
                                : "#198754"
                        };
                    ">
                        ${item.monthlyScore}
                    </td>

                    <td style="
                        text-align:center;
                    ">
                        <span style="
                            ${item.badgeStyle}
                            padding:3px 10px;
                            border-radius:4px;
                            font-weight:bold;
                            display:inline-block;
                        ">
                            ${item.rank}
                        </span>
                    </td>
                `;
            } else {
                html += `
                    <td style="
                        text-align:center;
                        font-weight:bold;
                        color:#0d6efd;
                    ">
                        ${item.totalCount} lượt
                    </td>
                `;
            }

            html += `
                </tr>
            `;
        });

        tableBody.innerHTML = html;

        // ============================================================
        // 18. CACHE BADGE
        // ============================================================

        if (badge) {
            badge.innerText =
                forceRefresh
                    ? "🔄 Đã làm mới dữ liệu: " +
                      new Date().toLocaleTimeString()
                    : "⚡ Dùng cache: " +
                      new Date().toLocaleTimeString();
        }

    } catch (error) {
        console.error(
            "Lỗi tải dữ liệu lớp chủ nhiệm:",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="10" style="
                    text-align:center;
                    color:red;
                ">
                    Lỗi tải dữ liệu lớp chủ nhiệm.
                    <div style="
                        margin-top:5px;
                        font-size:0.85em;
                    ">
                        ${error.message || ""}
                    </div>
                </td>
            </tr>
        `;
    }
}

async function exportHomeroomMonthlyWord() {
    const btn = document.querySelector(
        'button[onclick="exportHomeroomMonthlyWord()"]'
    );

    const oldHtml = btn ? btn.innerHTML : "";

    // ============================================================
    // HỘP CHỌN THÁNG BÁO CÁO
    // ============================================================
    const chooseReportingMonth = () => {
        return new Promise(resolve => {
            const existing = document.getElementById(
                "homeroom-word-month-modal"
            );

            if (existing) existing.remove();

            const now = new Date();

            const monthNames = [
                "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
                "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
                "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
            ];

            // Tạo danh sách 12 tháng gần nhất, mặc định tháng hiện tại.
            const options = [];

            for (let i = 0; i < 12; i++) {
                const d = new Date(
                    now.getFullYear(),
                    now.getMonth() - i,
                    1
                );

                const value =
                    `${d.getFullYear()}-${String(
                        d.getMonth() + 1
                    ).padStart(2, "0")}`;

                options.push({
                    value,
                    label:
                        `${monthNames[d.getMonth()]}/${d.getFullYear()}`
                });
            }

            const overlay = document.createElement("div");
            overlay.id = "homeroom-word-month-modal";

            overlay.innerHTML = `
                <div style="
                    position:fixed;
                    inset:0;
                    background:rgba(0,0,0,.45);
                    z-index:100000;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    padding:16px;
                ">
                    <div style="
                        width:100%;
                        max-width:430px;
                        background:#fff;
                        border-radius:10px;
                        box-shadow:0 10px 35px rgba(0,0,0,.25);
                        overflow:hidden;
                    ">
                        <div style="
                            padding:14px 16px;
                            background:#198754;
                            color:#fff;
                            font-weight:600;
                            font-size:16px;
                        ">
                            <i class="fa-solid fa-file-word"></i>
                            Chọn tháng báo cáo
                        </div>

                        <div style="padding:18px 16px;">
                            <label style="
                                display:block;
                                margin-bottom:6px;
                                font-weight:600;
                            ">
                                Tháng báo cáo
                            </label>

                            <select
                                id="homeroom-word-month-select"
                                style="
                                    width:100%;
                                    padding:9px 10px;
                                    border:1px solid #ced4da;
                                    border-radius:6px;
                                    font-size:14px;
                                    box-sizing:border-box;
                                "
                            >
                                ${options.map((item, index) => `
                                    <option
                                        value="${item.value}"
                                        ${index === 0 ? "selected" : ""}
                                    >
                                        ${item.label}
                                    </option>
                                `).join("")}
                            </select>

                            <div
                                id="homeroom-word-period-preview"
                                style="
                                    margin-top:12px;
                                    padding:10px 12px;
                                    background:#f8f9fa;
                                    border:1px solid #e9ecef;
                                    border-radius:6px;
                                    font-size:13px;
                                    color:#495057;
                                "
                            >
                                    Đang xác định kỳ báo cáo...
                            </div>

                            <div style="
                                margin-top:10px;
                                font-size:12px;
                                color:#6c757d;
                            ">
                                Kỳ báo cáo được tính theo ngày bắt đầu
                                tháng đã cấu hình cho đơn vị.
                            </div>
                        </div>

                        <div style="
                            display:flex;
                            justify-content:flex-end;
                            gap:8px;
                            padding:12px 16px;
                            border-top:1px solid #e9ecef;
                        ">
                            <button
                                type="button"
                                id="homeroom-word-month-cancel"
                                style="
                                    padding:7px 12px;
                                    border:1px solid #6c757d;
                                    background:#fff;
                                    color:#495057;
                                    border-radius:5px;
                                    cursor:pointer;
                                "
                            >
                                Hủy
                            </button>

                            <button
                                type="button"
                                id="homeroom-word-month-confirm"
                                style="
                                    padding:7px 12px;
                                    border:none;
                                    background:#198754;
                                    color:#fff;
                                    border-radius:5px;
                                    cursor:pointer;
                                "
                            >
                                <i class="fa-solid fa-file-word"></i>
                                Xuất Word
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const select = document.getElementById(
                "homeroom-word-month-select"
            );

            const preview = document.getElementById(
                "homeroom-word-period-preview"
            );

            const getPeriodFromSelectedMonth = (
                selectedValue,
                startDay
            ) => {
                const [year, month] =
                    String(selectedValue).split("-").map(Number);

                if (!year || !month) return null;

                const safeStartDay = Math.min(
                    Math.max(Number(startDay) || 1, 1),
                    31
                );

                if (safeStartDay === 1) {
                    const start = new Date(
                        year,
                        month - 1,
                        1
                    );

                    const end = new Date(
                        year,
                        month,
                        0
                    );

                    return { start, end };
                }

                // Tháng được chọn là tháng KẾT THÚC kỳ.
                // Ví dụ tháng 10 + startDay 21:
                // 21/09 -> 20/10.
                const end = new Date(
                    year,
                    month - 1,
                    safeStartDay - 1
                );

                const start = new Date(
                    year,
                    month - 2,
                    safeStartDay
                );

                return { start, end };
            };

            let reportingStartDay = 1;

            const loadPreview = async () => {
                try {
                    const orgId = String(
                        window.currentOrgIdGlobal || ""
                    ).trim();

                    if (!orgId) {
                        throw new Error(
                            "Chưa xác định được tổ chức."
                        );
                    }

                    const db = firebase.firestore();

                    const orgSnap = await db
                        .collection("organizations")
                        .doc(orgId)
                        .get();

                    const orgData = orgSnap.exists
                        ? (orgSnap.data() || {})
                        : {};

                    const configured =
                        Number(
                            orgData?.reportingPeriod
                                ?.monthly
                                ?.startDay
                        );

                    if (
                        Number.isFinite(configured) &&
                        configured >= 1 &&
                        configured <= 31
                    ) {
                        reportingStartDay =
                            Math.floor(configured);
                    } else {
                        reportingStartDay = 1;
                    }
                } catch (error) {
                    console.warn(
                        "Không đọc được cấu hình kỳ báo cáo, dùng ngày 1:",
                        error
                    );

                    reportingStartDay = 1;
                }

                const period =
                    getPeriodFromSelectedMonth(
                        select.value,
                        reportingStartDay
                    );

                if (!period) return;

                const pad = n =>
                    String(n).padStart(2, "0");

                const startText =
                    `${pad(period.start.getDate())}/` +
                    `${pad(period.start.getMonth() + 1)}/` +
                    `${period.start.getFullYear()}`;

                const endText =
                    `${pad(period.end.getDate())}/` +
                    `${pad(period.end.getMonth() + 1)}/` +
                    `${period.end.getFullYear()}`;

                preview.innerHTML = `
                    <b>Kỳ báo cáo:</b>
                    ${startText} → ${endText}
                    <br>
                    <span style="color:#6c757d;">
                        Ngày bắt đầu kỳ: ${reportingStartDay}
                    </span>
                `;
            };

            select.addEventListener(
                "change",
                loadPreview
            );

            document.getElementById(
                "homeroom-word-month-cancel"
            ).onclick = () => {
                overlay.remove();
                resolve(null);
            };

            document.getElementById(
                "homeroom-word-month-confirm"
            ).onclick = () => {
                const selectedValue =
                    String(select.value || "").trim();

                overlay.remove();

                resolve({
                    monthValue: selectedValue,
                    startDay: reportingStartDay
                });
            };

            overlay.addEventListener(
                "click",
                event => {
                    if (
                        event.target ===
                        overlay.firstElementChild
                    ) {
                        overlay.remove();
                        resolve(null);
                    }
                }
            );

            loadPreview();
        });
    };

    let selectedReport = null;

    try {
        selectedReport = await chooseReportingMonth();

        if (!selectedReport) {
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';
        }

        const db = firebase.firestore();

        const orgId = String(
            window.currentOrgIdGlobal || ""
        ).trim();

        // ========================================================
        // 1. XÁC ĐỊNH NĂM HỌC
        // ========================================================
        let academicYearId = "";

        const yearsArr =
            window.currentAcademicYearsGlobal;

        if (
            Array.isArray(yearsArr) &&
            yearsArr.length > 0
        ) {
            const lastYearItem =
                yearsArr[yearsArr.length - 1];

            academicYearId = String(
                typeof lastYearItem === "object" &&
                lastYearItem !== null
                    ? (
                        lastYearItem.id ||
                        lastYearItem.name ||
                        lastYearItem.year ||
                        ""
                    )
                    : lastYearItem
            ).trim();
        }

        if (!academicYearId) {
            academicYearId = String(
                window.currentAcademicYearIdGlobal ||
                ""
            ).trim();
        }

        // Lấy UID trực tiếp từ Firebase Auth.
        const authUser =
            firebase.auth().currentUser;

        const teacherUid = String(
            authUser?.uid || ""
        ).trim();

        const currentEmail = String(
            window.currentUserEmailGlobal ||
            (
                firebase.auth().currentUser
                    ? firebase.auth().currentUser.email
                    : ""
            ) ||
            ""
        ).trim().toLowerCase();

        if (
            !orgId ||
            !academicYearId ||
            !teacherUid
        ) {
            throw new Error(
                "Không xác định được tổ chức, năm học hoặc giáo viên đang đăng nhập."
            );
        }

        // ========================================================
        // 2. XÁC ĐỊNH LỚP CHỦ NHIỆM
        // ========================================================
        let homeroomClasses = [];

        const assignmentRef = db
            .collection("organizations")
            .doc(orgId)
            .collection("academicYears")
            .doc(academicYearId)
            .collection("assignments");

        const assignmentsSnap =
            await assignmentRef.get();

        assignmentsSnap.forEach(doc => {
            const data = doc.data() || {};

            const dataUid = String(
                data.uid ||
                data.userId ||
                data.memberId ||
                ""
            ).trim();

            const dataEmail = String(
                data.email || ""
            ).trim().toLowerCase();

            if (
                doc.id === teacherUid ||
                dataUid === teacherUid ||
                (
                    currentEmail &&
                    dataEmail === currentEmail
                )
            ) {
                const raw =
                    data.homeroom ||
                    data.homeroomClasses ||
                    data.classes ||
                    [];

                if (typeof raw === "string") {
                    homeroomClasses = raw
                        .split(",")
                        .map(x => String(x).trim())
                        .filter(Boolean);
                } else if (Array.isArray(raw)) {
                    homeroomClasses = raw
                        .map(x => String(x).trim())
                        .filter(Boolean);
                }
            }
        });

        homeroomClasses = [
            ...new Set(homeroomClasses)
        ];

        if (homeroomClasses.length === 0) {
            throw new Error(
                "Bạn không được phân công lớp chủ nhiệm trong năm học này."
            );
        }

        // ========================================================
        // 3. ĐỌC USERS - CODE LÀ MÃ CHÍNH
        // ========================================================
        let usersMap = {};

        if (
            window.cachedUsersMap &&
            Object.keys(window.cachedUsersMap).length > 0
        ) {
            usersMap = window.cachedUsersMap;
        } else {
            const usersSnap = await db
                .collection("organizations")
                .doc(orgId)
                .collection("users")
                .get();

            usersSnap.forEach(doc => {
                const data = doc.data() || {};

                const uid = String(
                    data.uid ||
                    data.id ||
                    doc.id ||
                    ""
                ).trim();

                const code = String(
                    data.code ||
                    data.memberId ||
                    ""
                ).trim();

                usersMap[doc.id] = {
                    id: doc.id,
                    uid,
                    code,
                    fullName:
                        data.fullName ||
                        data.displayName ||
                        data.name ||
                        doc.id,
                    category: String(
                        data.category ||
                        data.className ||
                        ""
                    ).trim()
                };
            });
        }

        const students = [];

        Object.entries(usersMap).forEach(
            ([docId, u]) => {
                if (!u) return;

                const category = String(
                    u.category || ""
                ).trim();

                if (
                    !homeroomClasses.includes(category)
                ) {
                    return;
                }

                const code = String(
                    u.code || ""
                ).trim();

                const uid = String(
                    u.uid ||
                    u.id ||
                    docId ||
                    ""
                ).trim();

                students.push({
                    code,
                    uid,
                    name:
                        u.fullName ||
                        u.displayName ||
                        u.name ||
                        docId,
                    className: category
                });
            }
        );

        students.sort((a, b) =>
            String(a.name).localeCompare(
                String(b.name),
                "vi"
            )
        );

        if (students.length === 0) {
            throw new Error(
                "Không tìm thấy học sinh thuộc lớp chủ nhiệm."
            );
        }

        // ========================================================
        // 4. KPI CONFIG - HỌC SINH
        // ========================================================
        const kpiConfigSnap = await db
            .collection("organizations")
            .doc(orgId)
            .collection("academicYears")
            .doc(academicYearId)
            .collection("KPIconfig")
            .doc("student")
            .get();

        const kpiRules = kpiConfigSnap.exists
            ? (kpiConfigSnap.data() || {})
            : {};

        const basePointRaw =
            kpiRules.BasePoint ??
            kpiRules.basePoint ??
            90;

        const basePointNumber =
            Number(basePointRaw);

        const basePoint =
            Number.isFinite(basePointNumber)
                ? basePointNumber
                : 90;

        const chuadatCount = Number(
            kpiRules.chuadat_count ?? 15
        );

        const chuadatScore = Number(
            kpiRules.chuadat_score ?? 15
        );

        const datCount = Number(
            kpiRules.dat_count ?? 10
        );

        const datScore = Number(
            kpiRules.dat_score ?? 10
        );

        const khaCount = Number(
            kpiRules.kha_count ?? 5
        );

        const khaScore = Number(
            kpiRules.kha_score ?? 5
        );

        // ========================================================
        // 5. ĐỌC MODULE STUDENT + CÁC TRƯỜNG KPI
        // ========================================================
        const modulesSnap = await db
            .collection("organizations")
            .doc(orgId)
            .collection("modules")
            .where("targetType", "==", "STUDENT")
            .get();

        const studentModules =
            modulesSnap.docs.map(doc => ({
                id: doc.id,
                data: doc.data() || {}
            }));

        const kpiFieldsMap = {};

        studentModules.forEach(mod => {
            const fields = Array.isArray(
                mod.data.fields
            )
                ? mod.data.fields
                : [];

            fields.forEach(field => {
                if (
                    !field ||
                    !field.isKpi ||
                    !field.key
                ) {
                    return;
                }

                const rawOptions =
                    field.kpiOptions ||
                    field.options ||
                    {};

                let optionsMap = {};

                if (Array.isArray(rawOptions)) {
                    rawOptions.forEach(opt => {
                        if (!opt) return;

                        const optionKey = String(
                            opt.value ??
                            opt.key ??
                            opt.id ??
                            opt.label ??
                            opt.name ??
                            ""
                        ).trim();

                        if (!optionKey) return;

                        optionsMap[optionKey] = opt;
                    });
                } else if (
                    rawOptions &&
                    typeof rawOptions === "object"
                ) {
                    optionsMap = rawOptions;
                }

                const fieldWeight =
                    Number(field.scoreWeight);

                kpiFieldsMap[field.key] = {
                    id: field.key,
                    name:
                        field.label ||
                        field.key,
                    scoreWeight:
                        Number.isFinite(fieldWeight)
                            ? fieldWeight
                            : -1,
                    kpiOptions: optionsMap
                };
            });
        });

        const kpiFields =
            Object.values(kpiFieldsMap);

        // ========================================================
        // 6. HÀM XÁC ĐỊNH ITEM KPI + ĐIỂM
        // ========================================================
        const getKpiItems = value => {
            if (
                value === undefined ||
                value === null ||
                value === ""
            ) {
                return [];
            }

            if (Array.isArray(value)) {
                return value.filter(item => {
                    if (
                        item === undefined ||
                        item === null ||
                        item === ""
                    ) {
                        return false;
                    }

                    if (
                        typeof item === "object"
                    ) {
                        return Object.values(item).some(
                            v =>
                                v !== undefined &&
                                v !== null &&
                                String(v).trim() !== ""
                        );
                    }

                    return String(item).trim() !== "";
                });
            }

            return [value];
        };

        const getKpiScore = (
            field,
            item
        ) => {
            let option = null;

            if (
                item !== null &&
                typeof item === "object"
            ) {
                const optionKey = String(
                    item.value ??
                    item.key ??
                    item.id ??
                    item.label ??
                    item.name ??
                    ""
                ).trim();

                if (
                    optionKey &&
                    field.kpiOptions &&
                    field.kpiOptions[optionKey]
                ) {
                    option =
                        field.kpiOptions[
                            optionKey
                        ];
                }
            } else {
                const optionKey =
                    String(item).trim();

                if (
                    optionKey &&
                    field.kpiOptions &&
                    field.kpiOptions[optionKey]
                ) {
                    option =
                        field.kpiOptions[
                            optionKey
                        ];
                }
            }

            const optionWeight =
                option
                    ? Number(
                        option.scoreWeight
                    )
                    : NaN;

            if (
                Number.isFinite(optionWeight)
            ) {
                return optionWeight;
            }

            if (
                item &&
                typeof item === "object"
            ) {
                const itemWeight =
                    Number(
                        item.scoreWeight
                    );

                if (
                    Number.isFinite(
                        itemWeight
                    )
                ) {
                    return itemWeight;
                }
            }

            const fieldWeight =
                Number(field.scoreWeight);

            return Number.isFinite(
                fieldWeight
            )
                ? fieldWeight
                : 0;
        };

        // ========================================================
        // 7. KHỞI TẠO THỐNG KÊ + CHI TIẾT
        // ========================================================
        const studentMap = {};

        students.forEach(student => {
            const key =
                student.code ||
                student.uid;

            studentMap[key] = {
                ...student,
                totalCount: 0,
                totalPenalty: 0,
                totalBonus: 0,
                monthlyScore: basePoint,
                rank: "🟢 Tốt",
                details: []
            };
        });

        const resolveStudent = entityId => {
            const raw =
                String(entityId || "").trim();

            if (!raw) return null;

            if (studentMap[raw]) {
                return studentMap[raw];
            }

            const found = students.find(
                s =>
                    s.uid === raw ||
                    s.code === raw
            );

            if (!found) return null;

            return studentMap[
                found.code ||
                found.uid
            ] || null;
        };

        const processRecord = (
            recDoc,
            moduleId
        ) => {
            const data =
                recDoc.data() || {};

            const entityId = String(
                data.entityId ||
                data.entityID ||
                String(recDoc.id)
                    .split("_")[0] ||
                ""
            ).trim();

            const student =
                resolveStudent(entityId);

            if (!student) return;

            const recordDate = String(
                data.date ||
                ""
            ).trim();

            kpiFields.forEach(field => {
                let value =
                    data[field.id];

                if (
                    value === undefined &&
                    data.changes &&
                    data.changes[field.id] !== undefined
                ) {
                    value =
                        data.changes[field.id];
                }

                const items =
                    getKpiItems(value);

                items.forEach(item => {
                    const score =
                        getKpiScore(
                            field,
                            item
                        );

                    student.totalCount += 1;

                    if (score < 0) {
                        student.totalPenalty +=
                            Math.abs(score);
                    } else if (score > 0) {
                        student.totalBonus +=
                            score;
                    }

                    let itemText = "";

                    if (
                        item !== null &&
                        typeof item === "object"
                    ) {
                        itemText =
                            String(
                                item.label ??
                                item.name ??
                                item.value ??
                                item.key ??
                                item.id ??
                                ""
                            ).trim();
                    } else {
                        itemText =
                            String(item).trim();
                    }

                    student.details.push({
                        date: recordDate,
                        moduleId,
                        fieldName:
                            field.name,
                        itemText,
                        score
                    });
                });
            });
        };

        // ========================================================
        // 8. XÁC ĐỊNH KỲ BÁO CÁO THEO THÁNG ĐƯỢC CHỌN
        // ========================================================
        const [selectedYear, selectedMonth] =
            String(
                selectedReport.monthValue
            ).split("-")
             .map(Number);

        if (
            !selectedYear ||
            !selectedMonth
        ) {
            throw new Error(
                "Tháng báo cáo được chọn không hợp lệ."
            );
        }

        // Đọc lại cấu hình trực tiếp từ Firestore để bảo đảm
        // dữ liệu xuất dùng đúng cấu hình hiện tại của tổ chức.
        let reportingStartDay = 1;

        try {
            const orgSnap = await db
                .collection("organizations")
                .doc(orgId)
                .get();

            const orgData = orgSnap.exists
                ? (orgSnap.data() || {})
                : {};

            const configuredStartDay =
                Number(
                    orgData?.reportingPeriod
                        ?.monthly
                        ?.startDay
                );

            if (
                Number.isFinite(configuredStartDay) &&
                configuredStartDay >= 1 &&
                configuredStartDay <= 31
            ) {
                reportingStartDay =
                    Math.floor(configuredStartDay);
            }
        } catch (periodError) {
            console.warn(
                "Không đọc được cấu hình kỳ báo cáo, dùng ngày 1:",
                periodError
            );
        }

        const safeStartDay =
            Math.min(
                Math.max(reportingStartDay, 1),
                31
            );

        let periodStartDate;
        let periodEndDate;

        if (safeStartDay === 1) {
            periodStartDate = new Date(
                selectedYear,
                selectedMonth - 1,
                1,
                0, 0, 0, 0
            );

            periodEndDate = new Date(
                selectedYear,
                selectedMonth,
                0,
                0, 0, 0, 0
            );
        } else {
            // Tháng được chọn là tháng KẾT THÚC kỳ.
            //
            // Ví dụ:
            // chọn tháng 10/2026 + startDay 21
            // => 21/09/2026 -> 20/10/2026.
            periodStartDate = new Date(
                selectedYear,
                selectedMonth - 2,
                safeStartDay,
                0, 0, 0, 0
            );

            periodEndDate = new Date(
                selectedYear,
                selectedMonth - 1,
                safeStartDay - 1,
                0, 0, 0, 0
            );
        }

        const pad = n =>
            String(n).padStart(2, "0");

        const startDateStr =
            `${periodStartDate.getFullYear()}-` +
            `${pad(periodStartDate.getMonth() + 1)}-` +
            `${pad(periodStartDate.getDate())}`;

        const endDateStr =
            `${periodEndDate.getFullYear()}-` +
            `${pad(periodEndDate.getMonth() + 1)}-` +
            `${pad(periodEndDate.getDate())}`;

        const monthLabel =
            `${pad(selectedMonth)}/${selectedYear}`;

        const periodLabel =
            `${pad(periodStartDate.getDate())}/` +
            `${pad(periodStartDate.getMonth() + 1)}/` +
            `${periodStartDate.getFullYear()}` +
            ` → ` +
            `${pad(periodEndDate.getDate())}/` +
            `${pad(periodEndDate.getMonth() + 1)}/` +
            `${periodEndDate.getFullYear()}`;

        // ========================================================
        // 9. ĐỌC RECORDS TRONG KỲ ĐÃ CHỌN
        // ========================================================
        const allStudentIds = [
            ...new Set(
                students
                    .flatMap(s => [
                        s.code,
                        s.uid
                    ])
                    .map(x =>
                        String(
                            x || ""
                        ).trim()
                    )
                    .filter(Boolean)
            )
        ];

        const chunks = [];

        for (
            let i = 0;
            i < allStudentIds.length;
            i += 30
        ) {
            chunks.push(
                allStudentIds.slice(
                    i,
                    i + 30
                )
            );
        }

        for (const module of studentModules) {
            const recordsRef = db
                .collection("organizations")
                .doc(orgId)
                .collection("academicYears")
                .doc(academicYearId)
                .collection("modulesData")
                .doc(module.id)
                .collection("records");

            for (const ids of chunks) {
                if (!ids.length) continue;

                const snap =
                    await recordsRef
                        .where(
                            "entityId",
                            "in",
                            ids
                        )
                        .where(
                            "date",
                            ">=",
                            startDateStr
                        )
                        .where(
                            "date",
                            "<=",
                            endDateStr
                        )
                        .get();

                snap.forEach(recDoc => {
                    processRecord(
                        recDoc,
                        module.id
                    );
                });
            }
        }

        // ========================================================
        // 10. TÍNH ĐIỂM + XẾP LOẠI
        // ========================================================
        const resultList =
            Object.values(studentMap)
                .map(student => {
                    student.monthlyScore =
                        basePoint -
                        student.totalPenalty +
                        student.totalBonus;

                    if (
                        student.totalCount >=
                            chuadatCount ||
                        student.totalPenalty >=
                            chuadatScore
                    ) {
                        student.rank =
                            "🔴 Chưa đạt";
                    } else if (
                        student.totalCount >=
                            datCount ||
                        student.totalPenalty >=
                            datScore
                    ) {
                        student.rank =
                            "🟠 Đạt";
                    } else if (
                        student.totalCount >=
                            khaCount ||
                        student.totalPenalty >=
                            khaScore
                    ) {
                        student.rank =
                            "🔵 Khá";
                    } else {
                        student.rank =
                            "🟢 Tốt";
                    }

                    student.details.sort(
                        (a, b) =>
                            String(a.date)
                                .localeCompare(
                                    String(b.date)
                                )
                    );

                    return student;
                });

        // Xếp hạng trong lớp theo điểm tháng giảm dần.
        const rankingList =
            [...resultList].sort(
                (a, b) =>
                    Number(b.monthlyScore) -
                    Number(a.monthlyScore)
            );

        rankingList.forEach(
            (student, index) => {
                student.rankNo =
                    index + 1;
            }
        );

        // ========================================================
        // 11. TẠO HTML WORD
        // ========================================================
        const esc = value =>
            String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");

        const numberText = value =>
            Number.isInteger(
                Number(value)
            )
                ? String(value)
                : Number(value).toFixed(2);

        let summaryRows = "";

        resultList.forEach(student => {
            summaryRows += `
                <tr>
                    <td>${esc(student.rankNo)}</td>
                    <td>${esc(student.code || "--")}</td>
                    <td>${esc(student.name)}</td>
                    <td>${esc(student.className)}</td>
                    <td>${esc(student.totalCount)}</td>
                    <td>${esc(numberText(student.totalPenalty))}</td>
                    <td>${esc(numberText(student.totalBonus))}</td>
                    <td><b>${esc(numberText(student.monthlyScore))}</b></td>
                    <td>${esc(student.rank)}</td>
                </tr>
            `;
        });

        let detailSections = "";

        resultList.forEach(student => {
            let detailRows = "";

            if (student.details.length === 0) {
                detailRows = `
                    <tr>
                        <td colspan="5"
                            style="text-align:center;">
                            Không có lượt KPI được ghi nhận trong kỳ báo cáo.
                        </td>
                    </tr>
                `;
            } else {
                student.details.forEach(
                    (detail, index) => {
                        detailRows += `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${esc(detail.date)}</td>
                                <td>${esc(detail.fieldName)}</td>
                                <td>${esc(detail.itemText)}</td>
                                <td>${esc(numberText(detail.score))}</td>
                            </tr>
                        `;
                    }
                );
            }

            detailSections += `
                <div class="student-detail">
                    <h2>
                        ${esc(student.name)}
                        - Mã: ${esc(student.code || "--")}
                    </h2>

                    <table class="info-table">
                        <tr>
                            <td><b>Lớp</b></td>
                            <td>${esc(student.className)}</td>
                            <td><b>Xếp hạng</b></td>
                            <td>${esc(student.rankNo)}</td>
                        </tr>
                        <tr>
                            <td><b>Tổng lượt</b></td>
                            <td>${esc(student.totalCount)}</td>
                            <td><b>Xếp loại</b></td>
                            <td>${esc(student.rank)}</td>
                        </tr>
                        <tr>
                            <td><b>Điểm trừ</b></td>
                            <td>-${esc(numberText(student.totalPenalty))}</td>
                            <td><b>Điểm cộng</b></td>
                            <td>+${esc(numberText(student.totalBonus))}</td>
                        </tr>
                        <tr>
                            <td><b>Điểm tháng</b></td>
                            <td colspan="3">
                                <b>${esc(
                                    numberText(
                                        student.monthlyScore
                                    )
                                )}</b>
                            </td>
                        </tr>
                    </table>

                    <h3>Chi tiết các lượt KPI trong kỳ báo cáo</h3>

                    <table>
                        <thead>
                            <tr>
                                <th>STT</th>
                                <th>Ngày</th>
                                <th>Nội dung KPI</th>
                                <th>Giá trị ghi nhận</th>
                                <th>Điểm</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${detailRows}
                        </tbody>
                    </table>
                </div>
            `;
        });

        const titleClass =
            homeroomClasses.join(", ");

        const wordHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>
    Báo cáo lớp chủ nhiệm tháng ${esc(monthLabel)}
</title>
<style>
    @page {
        size: A4;
        margin: 1.5cm;
    }

    body {
        font-family: Arial, "Times New Roman", sans-serif;
        font-size: 11pt;
        color: #000;
        line-height: 1.4;
    }

    h1 {
        text-align: center;
        font-size: 18pt;
        margin-bottom: 6px;
    }

    h2 {
        font-size: 14pt;
        margin-top: 18px;
        margin-bottom: 8px;
        border-bottom: 1px solid #999;
        padding-bottom: 4px;
    }

    h3 {
        font-size: 12pt;
        margin-top: 12px;
    }

    p {
        margin: 4px 0;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0 16px 0;
    }

    th,
    td {
        border: 1px solid #444;
        padding: 5px 6px;
        vertical-align: middle;
    }

    th {
        text-align: center;
        font-weight: bold;
        background: #e9ecef;
    }

    .title-info {
        text-align: center;
        margin-bottom: 18px;
    }

    .info-table {
        width: 70%;
    }

    .info-table td {
        border: 1px solid #777;
    }

    .student-detail {
        page-break-before: always;
    }

    .student-detail:first-child {
        page-break-before: auto;
    }

    .note {
        font-size: 9pt;
        color: #555;
        margin-top: 10px;
    }
</style>
</head>

<body>

<h1>BÁO CÁO TỔNG HỢP KPI LỚP CHỦ NHIỆM</h1>

<div class="title-info">
    <p><b>Lớp:</b> ${esc(titleClass)}</p>
    <p><b>Tháng báo cáo:</b> ${esc(monthLabel)}</p>
    <p><b>Kỳ báo cáo:</b> ${esc(periodLabel)}</p>
    <p>
        <b>Ngày bắt đầu kỳ:</b>
        ${esc(safeStartDay)}
    </p>
    <p>
        <b>Công thức điểm tháng:</b>
        BasePoint (${esc(basePoint)})
        - Điểm trừ
        + Điểm cộng
    </p>
</div>

<h2>I. BẢNG TỔNG HỢP CẢ LỚP</h2>

<table>
    <thead>
        <tr>
            <th>Hạng</th>
            <th>Mã HS</th>
            <th>Họ và tên</th>
            <th>Lớp</th>
            <th>Tổng lượt</th>
            <th>Điểm trừ</th>
            <th>Điểm cộng</th>
            <th>Điểm tháng</th>
            <th>Xếp loại</th>
        </tr>
    </thead>
    <tbody>
        ${summaryRows}
    </tbody>
</table>

<h2>II. CHI TIẾT TỪNG HỌC SINH</h2>

${detailSections}


</body>
</html>
        `;

        // ========================================================
        // 12. TẢI FILE WORD
        // ========================================================
        const blob = new Blob(
            [
                "\ufeff",
                wordHtml
            ],
            {
                type:
                    "application/msword;charset=utf-8"
            }
        );

        const safeMonthFile =
            monthLabel.replace(
                "/",
                "-"
            );

        const fileName =
            `Bao_cao_KPI_${titleClass.replace(
                /[\\/:*?"<>|,\s]+/g,
                "_"
            )}_Thang_${safeMonthFile}.doc`;

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = url;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(
            () => URL.revokeObjectURL(url),
            2000
        );

        if (typeof showToast === "function") {
            showToast(
                `Đã xuất báo cáo Word tháng ${monthLabel} (${periodLabel}).`,
                "success"
            );
        } else {
            alert(
                `Đã xuất báo cáo Word tháng ${monthLabel} (${periodLabel}).`
            );
        }

    } catch (error) {
        console.error(
            "Lỗi xuất báo cáo lớp chủ nhiệm:",
            error
        );

        if (typeof showToast === "function") {
            showToast(
                "Không thể xuất báo cáo: " +
                (error.message || ""),
                "error"
            );
        } else {
            alert(
                "Không thể xuất báo cáo: " +
                (error.message || "")
            );
        }

    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldHtml;
        }
    }
}

	async function searchEmployeeIndividualAuditSheet(forceRefresh = false) {
	const keywordInput = document.getElementById("emp-lookup-entity-keyword");
	if (!keywordInput) return;

	const rawKeyword = keywordInput.value.trim();
	if (!rawKeyword) {
		alert("Vui lòng nhập Mã định danh hoặc Tên học sinh cần tra cứu!");
		return;
	}

	const keyword = rawKeyword.toLowerCase();

	const nameEl = document.getElementById("sheet-entity-name");
	const categoryEl = document.getElementById("sheet-entity-category");
	const idEl = document.getElementById("sheet-entity-id");
	const rankEl = document.getElementById("sheet-entity-rank");
	const violationsListEl = document.getElementById("sheet-violations-list");

	if (violationsListEl) {
		violationsListEl.innerHTML =
			'<div style="color:#6c757d;font-style:italic;">Đang kiểm tra phân công và tra cứu dữ liệu từ hệ thống...</div>';
	}

	try {
		const orgId = window.currentOrgIdGlobal;
		if (!orgId) {
			alert("Chưa xác định được thông tin đơn vị (OrgId).");
			return;
		}

		const authUser = firebase.auth().currentUser;
		if (!authUser || !authUser.email) {
			alert("Vui lòng đăng nhập lại tài khoản giáo viên.");
			return;
		}

		const email = authUser.email.toLowerCase().trim();
		const teacherId = authUser.uid;
		const db = firebase.firestore();

		// =====================================================
		// 1. XÁC ĐỊNH NĂM HỌC
		// =====================================================
		let academicYearId = "";
		const yearsArr = window.currentAcademicYearsGlobal;

		if (Array.isArray(yearsArr) && yearsArr.length > 0) {
			const lastYearItem = yearsArr[yearsArr.length - 1];
			academicYearId = String(
				typeof lastYearItem === 'object' && lastYearItem !== null
					? (lastYearItem.id || lastYearItem.name || lastYearItem.year)
					: lastYearItem
			).trim();
		} else if (window.currentAcademicYearIdGlobal) {
			academicYearId = String(window.currentAcademicYearIdGlobal).trim();
		}

		if (!academicYearId) {
			alert("Chưa xác định được năm học hiện tại.");
			return;
		}

		// =====================================================
		// 2. LẤY DANH SÁCH LỚP CHỦ NHIỆM (PHÂN QUYỀN EMPLOYEE)
		// =====================================================
		let allowedHomerooms = window.currentTeacherHomerooms || [];

		if (allowedHomerooms.length === 0) {
			try {
				const assignRef = db.collection("organizations")
					.doc(orgId)
					.collection("academicYears")
					.doc(academicYearId)
					.collection("assignments");

				const allAssigns = await assignRef.get();
				let assignData = null;

				allAssigns.forEach(d => {
					const data = d.data();
					if (
						d.id === teacherId ||
						data.memberId === teacherId ||
						(data.email && data.email.toLowerCase().trim() === email)
					) {
						assignData = data;
					}
				});

				if (assignData) {
					let rawData = assignData.homeroom || assignData.homeroomClasses || assignData.classes || [];
					let itemsList = [];
					if (typeof rawData === "string") {
						itemsList = rawData.split(",").map(s => s.trim()).filter(Boolean);
					} else if (Array.isArray(rawData)) {
						itemsList = rawData;
					}
					allowedHomerooms = itemsList.filter(val => /\d/.test(val));
					window.currentTeacherHomerooms = allowedHomerooms;
				}
			} catch (err) {
				console.warn("⚠️ Không thể đọc phân công lớp chủ nhiệm:", err);
			}
		}

		if (allowedHomerooms.length === 0) {
			alert("Bạn không được phân công chủ nhiệm lớp nào trong năm học này.");
			if (violationsListEl) {
				violationsListEl.innerHTML = '<div style="color:red;font-style:italic;">Không có quyền truy cập dữ liệu học sinh (Thiếu phân công lớp chủ nhiệm).</div>';
			}
			return;
		}

		// =====================================================
		// 3. KHỞI TẠO CACHE RAM RIÊNG CHO EMPLOYEE
		// =====================================================
		window.employeeAuditUserCache = window.employeeAuditUserCache || new Map();
		window.employeeAuditModulesCache = window.employeeAuditModulesCache || new Map();
		window.employeeAuditResultCache = window.employeeAuditResultCache || new Map();

		const startDateEl = document.getElementById("lookup-audit-start-date");
		const endDateEl = document.getElementById("lookup-audit-end-date");
		const startDate = startDateEl?.value?.trim() || "";
		const endDate = endDateEl?.value?.trim() || "";

		const cacheKey = [orgId, academicYearId, keyword, startDate || "ALL", endDate || "ALL"].join("__");

		if (!forceRefresh && window.employeeAuditResultCache.has(cacheKey)) {
			const cachedResult = window.employeeAuditResultCache.get(cacheKey);
			if (cachedResult && cachedResult.user && allowedHomerooms.includes(String(cachedResult.user.category).toLowerCase())) {
				renderIndividualAuditSheet(cachedResult);
				return cachedResult;
			}
		}

		// =====================================================
		// 4. TÌM USER (CHỈ TRONG PHẠM VI LỚP CHỦ NHIỆM)
		// =====================================================
		let foundUser = null;

		// 4A. Kiểm tra từ cache người dùng toàn cục nếu có sẵn
		if (window.cachedUsersMap && Object.keys(window.cachedUsersMap).length > 0) {
			for (const [uId, uData] of Object.entries(window.cachedUsersMap)) {
				const uClass = String(uData.category || "").trim().toLowerCase();
				if (allowedHomerooms.map(r => r.toLowerCase()).includes(uClass)) {
					const cleanId = uId.toLowerCase();
					const cleanName = String(uData.fullName || "").toLowerCase();
					if (cleanId === keyword || cleanName.includes(keyword)) {
						foundUser = {
							id: uId,
							uid: uData.uid || uId,
							fullName: uData.fullName || uId,
							category: uData.category || "Chưa phân loại"
						};
						break;
					}
				}
			}
		}

		// 4B. Nếu chưa thấy, tiến hành truy vấn collection users trên Firestore và kiểm tra chéo lớp
		if (!foundUser) {
			const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
			usersSnap.forEach(uDoc => {
				if (foundUser) return;
				const uData = uDoc.data() || {};
				const uClass = String(uData.category || uData.className || "").trim().toLowerCase();

				if (allowedHomerooms.map(r => r.toLowerCase()).includes(uClass)) {
					const uId = uDoc.id.toLowerCase();
					const uName = String(uData.fullName || "").toLowerCase();
					if (uId === keyword || uName.includes(keyword)) {
						foundUser = {
							id: uDoc.id,
							uid: uData.uid || uDoc.id,
							fullName: uData.fullName || uDoc.id,
							category: uData.category || uData.className || "Chưa phân loại"
						};
					}
				}
			});
		}

		// =====================================================
		// 5. XỬ LÝ KHI KHÔNG TÌM THẤY
		// =====================================================
		if (!foundUser) {
			if (nameEl) nameEl.innerText = "Không tìm thấy";
			if (categoryEl) categoryEl.innerText = "---";
			if (idEl) idEl.innerText = rawKeyword.toUpperCase();
			if (rankEl) rankEl.innerText = "---";

			if (violationsListEl) {
				violationsListEl.innerHTML = '<div style="color:red;font-style:italic;">Không tìm thấy học sinh phù hợp hoặc học sinh này không thuộc các lớp chủ nhiệm của bạn.</div>';
			}
			return null;
		}

		window.employeeAuditUserCache.set(String(foundUser.id).toLowerCase(), foundUser);

		// Hiển thị thông tin cá nhân lên phiếu
		if (nameEl) nameEl.innerText = foundUser.fullName;
		if (categoryEl) categoryEl.innerText = foundUser.category || "Chưa phân loại";
		if (idEl) idEl.innerText = foundUser.id;

		// =====================================================
		// 6. FIELD LABEL MAP & MODULES
		// =====================================================
		const fieldLabelMap = {};
		const currentFields = window.cachedSchemaFields || [];
		currentFields.forEach(f => {
			if (f?.key) fieldLabelMap[f.key] = f.label || f.key;
		});

		const modulesCacheKey = `${orgId}__${academicYearId}`;
		let modules = window.employeeAuditModulesCache.get(modulesCacheKey);

		if (!modules) {
			const modulesSnap = await db.collection("organizations").doc(orgId).collection("modules").get();
			modules = modulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
			window.employeeAuditModulesCache.set(modulesCacheKey, modules);
		}

		// =====================================================
		// 7. QUERY AUDIT LOGS SONG SONG
		// =====================================================
		const modulePromises = modules.map(async mod => {
			let query = db
				.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("modulesData")
				.doc(mod.id)
				.collection("auditLogs")
				.where("entityId", "==", foundUser.id);

			if (startDate && endDate) {
				const startDateObj = new Date(`${startDate}T00:00:00`);
				const endDateObj = new Date(`${endDate}T00:00:00`);
				endDateObj.setDate(endDateObj.getDate() + 1);

				const startTimestamp = firebase.firestore.Timestamp.fromDate(startDateObj);
				const endTimestamp = firebase.firestore.Timestamp.fromDate(endDateObj);

				query = query.where("timestamp", ">=", startTimestamp).where("timestamp", "<", endTimestamp);
			}

			const logsSnap = await query.get();
			return { moduleId: mod.id, docs: logsSnap.docs };
		});

		const moduleResults = await Promise.all(modulePromises);

		const allViolations = [];
		let auditDocsRead = 0;

		moduleResults.forEach(moduleResult => {
			auditDocsRead += moduleResult.docs.length;
			moduleResult.docs.forEach(logDoc => {
				const logData = logDoc.data() || {};
				let timeStr = "Gần đây";
				let sortTime = 0;

				if (logData.timestamp && typeof logData.timestamp.toDate === "function") {
					const dateObj = logData.timestamp.toDate();
					sortTime = dateObj.getTime();
					timeStr = dateObj.toLocaleString("vi-VN");
				}

				const changes = logData.changes || {};
				const changeKeys = Object.keys(changes);

				if (changeKeys.length > 0) {
					changeKeys.forEach(fieldKey => {
						const val = changes[fieldKey];
						const valStr = Array.isArray(val) ? val.join(", ") : String(val);
						const displayLabel = fieldLabelMap[fieldKey] || fieldKey;

						allViolations.push({
							date: timeStr,
							sortTime: sortTime,
							content: `<b>${escapeHtmlAudit(displayLabel)}:</b> ${escapeHtmlAudit(valStr)}`,
							updater: logData.updaterName || logData.updaterEmail || "Hệ thống"
						});
					});
				} else {
					const actionName = logData.action || "Cập nhật dữ liệu";
					allViolations.push({
						date: timeStr,
						sortTime: sortTime,
						content: `<b>${escapeHtmlAudit(actionName)}</b>`,
						updater: logData.updaterName || logData.updaterEmail || "Hệ thống"
					});
				}
			});
		});

		allViolations.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));

		const result = {
			user: foundUser,
			violations: allViolations,
			startDate: startDate || null,
			endDate: endDate || null,
			auditDocsRead: auditDocsRead,
			moduleCount: modules.length,
			loadedAt: Date.now()
		};

		window.employeeAuditResultCache.set(cacheKey, result);

		// Render kết quả lên phiếu đối soát (dùng chung hàm render có sẵn của hệ thống)
		renderEmployeeIndividualAuditSheet(result);
		return result;

	} catch (error) {
		console.error("Lỗi tra cứu phiếu đối soát cho GVCN:", error);
		if (violationsListEl) {
			violationsListEl.innerHTML = '<div style="color:red;font-style:italic;">Lỗi kết nối khi tải dữ liệu đối soát.</div>';
		}
		return null;
	}
}




// Hàm render dữ liệu tra cứu lên phiếu của Employee
function renderEmployeeIndividualAuditSheet(result) {
	if (!result) return;

	const nameEl = document.getElementById("emp-sheet-entity-name");
	const categoryEl = document.getElementById("emp-sheet-entity-category");
	const idEl = document.getElementById("emp-sheet-entity-id");
	const rankEl = document.getElementById("emp-sheet-entity-rank");
	const violationsListEl = document.getElementById("emp-sheet-violations-list");
	const dateRangeLabel = document.getElementById("emp-sheet-date-range-label");

	if (nameEl) nameEl.innerText = result.user.fullName || "--";
	if (categoryEl) categoryEl.innerText = result.user.category || "--";
	if (idEl) idEl.innerText = result.user.id || "--";

	// Hiển thị nhãn kỳ đối soát
	if (dateRangeLabel) {
		if (result.startDate && result.endDate) {
			dateRangeLabel.innerText = `(Kỳ đối soát: Từ ngày ${result.startDate} đến ${result.endDate})`;
		} else {
			dateRangeLabel.innerText = "(Kỳ đối soát: Tất cả dữ liệu)";
		}
	}

	// Tổng kết thi đua sơ bộ dựa trên số lỗi
	if (rankEl) {
		const totalVio = result.violations.length;
		if (totalVio === 0) {
			rankEl.innerHTML = '<span style="color: #198754; font-weight: bold;">🟢 Không có vi phạm (Tốt)</span>';
		} else {
			rankEl.innerHTML = `<span style="color: #dc3545; font-weight: bold;">⚠️ Ghi nhận ${totalVio} lượt sự việc / lỗi</span>`;
		}
	}

	// Đổ danh sách lỗi chi tiết
	if (violationsListEl) {
		if (!result.violations || result.violations.length === 0) {
			violationsListEl.innerHTML = '<div style="color: #198754; font-style: italic;">Tuyệt vời! Học sinh không có lỗi vi phạm nào trong kỳ đối soát này.</div>';
			return;
		}

		let html = "";
		result.violations.forEach((v, index) => {
			html += `
				<div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dotted #eee; font-size: 0.95em;">
					<b>${index + 1}. [${v.date}]</b> ${v.content} 
					<small style="color: #6c757d; display: block;">(Người ghi nhận: ${v.updater})</small>
				</div>
			`;
		});
		violationsListEl.innerHTML = html;
	}
}

// Hàm in phiếu đối soát của Employee
function printEmployeeIndividualAuditSheet() {
	const printContents = document.getElementById("emp-printable-audit-sheet").innerHTML;
	const originalContents = document.body.innerHTML;

	document.body.innerHTML = printContents;
	window.print();
	document.body.innerHTML = originalContents;
	window.location.reload(); // Khôi phục lại trạng thái trang sau khi in xong
}

	
	//	THẺ 5
async function loadDepartmentData(forceRefresh = false) {
	const tableBody = document.getElementById("emp-dept-body-rows");
	const headerRow = document.getElementById("emp-dept-header-row");

	if (!tableBody) return;

	const orgId = window.currentOrgIdGlobal;

	if (!orgId) {
		tableBody.innerHTML =
			'<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được thông tin đơn vị (OrgId).</td></tr>';
		return;
	}

	// =========================================================
	// 1. XÁC ĐỊNH NĂM HỌC
	// =========================================================
	let academicYearId = "";
	const yearsArr = window.currentAcademicYearsGlobal;

	if (Array.isArray(yearsArr) && yearsArr.length > 0) {
		const lastYearItem = yearsArr[yearsArr.length - 1];

		academicYearId = String(
			typeof lastYearItem === "object" && lastYearItem !== null
				? (
					lastYearItem.id ||
					lastYearItem.name ||
					lastYearItem.year ||
					""
				)
				: lastYearItem
		).trim();
	} else if (window.currentAcademicYearIdGlobal) {
		academicYearId = String(
			window.currentAcademicYearIdGlobal
		).trim();
	}

	if (!academicYearId) {
		tableBody.innerHTML =
			'<tr><td colspan="10" style="text-align: center; color: red;">Chưa xác định được năm học hiện tại.</td></tr>';
		return;
	}

	// =========================================================
	// 2. XÁC ĐỊNH TÀI KHOẢN ĐANG ĐĂNG NHẬP
	// =========================================================
	const authUser = firebase.auth().currentUser;

	if (!authUser) {
		tableBody.innerHTML =
			'<tr><td colspan="10" style="text-align: center; color: red;">Chưa đăng nhập hệ thống.</td></tr>';
		return;
	}

	const currentUid = String(authUser.uid || "").trim();

	const currentEmail = String(
		window.currentUserEmailGlobal ||
		authUser.email ||
		""
	).trim().toLowerCase();

	tableBody.innerHTML =
		'<tr><td colspan="10" style="text-align: center; color: #6c757d;">Đang tải dữ liệu tổ chuyên môn...</td></tr>';

	try {
		const db = firebase.firestore();

		// =====================================================
		// 3. TẢI CACHE USERS
		//    CODE là mã định danh chính.
		//    UID chỉ dùng để tương thích dữ liệu cũ.
		// =====================================================
		let cachedUsers = window.cachedUsersMap || {};
		const cachedUserList = Object.values(cachedUsers);

		const cacheNeedsCodeRefresh =
			cachedUserList.length === 0 ||
			cachedUserList.some(user =>
				user.code === undefined
			);

		if (
			!window.cachedUsersMap ||
			Object.keys(window.cachedUsersMap).length === 0 ||
			forceRefresh ||
			cacheNeedsCodeRefresh
		) {
			const usersSnap = await db
				.collection("organizations")
				.doc(orgId)
				.collection("users")
				.get();

			window.cachedUsersMap = {};

			usersSnap.forEach(uDoc => {
				const uData = uDoc.data() || {};

				window.cachedUsersMap[uDoc.id] = {
					uid: String(
						uData.uid ||
						uDoc.id ||
						""
					).trim(),

					code: String(
						uData.code ||
						uData.memberId ||
						""
					).trim(),

					fullName:
						uData.fullName ||
						uData.displayName ||
						uData.name ||
						uDoc.id,

					category: String(
						uData.category ||
						""
					).trim(),

					email: String(
						uData.email ||
						""
					).trim().toLowerCase(),

					role: uData.role || ""
				};
			});
		}

		cachedUsers = window.cachedUsersMap || {};

		// =====================================================
		// 4. TÌM USER ĐANG ĐĂNG NHẬP
		// =====================================================
		let currentUserInfo = null;

		for (const [uId, uInfo] of Object.entries(cachedUsers)) {
			const cachedUid = String(
				uInfo.uid ||
				uId ||
				""
			).trim();

			const cachedEmail = String(
				uInfo.email ||
				""
			).trim().toLowerCase();

			if (
				(currentUid && cachedUid === currentUid) ||
				(currentEmail && cachedEmail === currentEmail)
			) {
				currentUserInfo = {
					...uInfo,
					_mapId: uId
				};
				break;
			}
		}

		// -----------------------------------------------------
		// 4.1. Fallback Firestore theo UID
		// -----------------------------------------------------
		if (!currentUserInfo && currentUid) {
			const uidSnap = await db
				.collection("organizations")
				.doc(orgId)
				.collection("users")
				.where("uid", "==", currentUid)
				.limit(1)
				.get();

			if (!uidSnap.empty) {
				const uDoc = uidSnap.docs[0];
				const uData = uDoc.data() || {};

				currentUserInfo = {
					uid: String(
						uData.uid ||
						uDoc.id ||
						currentUid
					).trim(),

					code: String(
						uData.code ||
						uData.memberId ||
						""
					).trim(),

					fullName:
						uData.fullName ||
						uData.displayName ||
						uData.name ||
						uData.email ||
						currentEmail,

					category: String(
						uData.category ||
						""
					).trim(),

					email: String(
						uData.email ||
						currentEmail ||
						""
					).trim().toLowerCase(),

					role: uData.role || "",
					_mapId: uDoc.id
				};
			}
		}

		// -----------------------------------------------------
		// 4.2. Fallback Firestore theo email
		// -----------------------------------------------------
		if (!currentUserInfo && currentEmail) {
			const emailSnap = await db
				.collection("organizations")
				.doc(orgId)
				.collection("users")
				.where("email", "==", currentEmail)
				.limit(1)
				.get();

			if (!emailSnap.empty) {
				const uDoc = emailSnap.docs[0];
				const uData = uDoc.data() || {};

				currentUserInfo = {
					uid: String(
						uData.uid ||
						uDoc.id ||
						currentUid
					).trim(),

					code: String(
						uData.code ||
						uData.memberId ||
						""
					).trim(),

					fullName:
						uData.fullName ||
						uData.displayName ||
						uData.name ||
						uData.email ||
						currentEmail,

					category: String(
						uData.category ||
						""
					).trim(),

					email: String(
						uData.email ||
						currentEmail ||
						""
					).trim().toLowerCase(),

					role: uData.role || "",
					_mapId: uDoc.id
				};
			}
		}

		if (currentUserInfo) {
			window.cachedUsersMap[
				currentUserInfo._mapId ||
				currentUserInfo.uid
			] = {
				uid: currentUserInfo.uid,
				code: currentUserInfo.code || "",
				fullName: currentUserInfo.fullName,
				category: currentUserInfo.category,
				email: currentUserInfo.email,
				role: currentUserInfo.role
			};
		}

		// =====================================================
		// 5. XÁC ĐỊNH CATEGORY / TỔ CHUYÊN MÔN
		// =====================================================
		let myCategory = String(
			currentUserInfo?.category ||
			""
		).trim();

		if (
			!myCategory &&
			Array.isArray(window.currentTeacherDepartments) &&
			window.currentTeacherDepartments.length > 0
		) {
			myCategory = String(
				window.currentTeacherDepartments[0] ||
				""
			).trim();
		}

		if (!currentUserInfo && !myCategory) {
			tableBody.innerHTML =
				'<tr><td colspan="10" style="text-align: center; color: red;">Không tìm thấy thông tin tài khoản của bạn trong danh sách người dùng.</td></tr>';
			return;
		}

		if (!myCategory) {
			myCategory = "Chưa xác định";
		}

		// =====================================================
		// 6. LẤY THÀNH VIÊN TRONG TỔ
		// =====================================================
		const normalizedMyCategory = myCategory.toLowerCase().trim();
		const departmentColleagues = [];

		for (const [uId, uInfo] of Object.entries(
			window.cachedUsersMap || {}
		)) {
			const userUid = String(
				uInfo.uid ||
				uId ||
				""
			).trim();

			const userCode = String(
				uInfo.code ||
				""
			).trim();

			const userEmail = String(
				uInfo.email ||
				""
			).trim().toLowerCase();

			const userCategory = String(
				uInfo.category ||
				""
			).trim();

			const isCurrentUser =
				(currentUid && userUid === currentUid) ||
				(currentEmail && userEmail === currentEmail);

			const isSameDepartment =
				normalizedMyCategory !== "chưa xác định" &&
				userCategory.toLowerCase().trim() ===
				normalizedMyCategory;

			if (isSameDepartment || isCurrentUser) {
				departmentColleagues.push({
					id: userCode || userUid || uId,
					code: userCode,
					uid: userUid,
					email: userEmail,
					name:
						uInfo.fullName ||
						uInfo.email ||
						userCode ||
						userUid ||
						uId,
					department:
						userCategory ||
						myCategory,
					isCurrentUser
				});
			}
		}

		// Đảm bảo user hiện tại luôn có trong danh sách.
		if (currentUserInfo) {
			const currentCode = String(
				currentUserInfo.code ||
				currentUserInfo.memberId ||
				""
			).trim();

			const alreadyExists = departmentColleagues.some(item => {
				const itemCode = String(
					item.code ||
					""
				).trim();

				const itemUid = String(
					item.uid ||
					item.id ||
					""
				).trim();

				return (
					(currentCode && itemCode === currentCode) ||
					(!currentCode && currentUid && itemUid === currentUid)
				);
			});

			if (!alreadyExists) {
				departmentColleagues.unshift({
					id: currentCode || currentUserInfo.uid || currentUid,
					code: currentCode,
					uid: currentUserInfo.uid || currentUid,
					email: currentUserInfo.email || currentEmail,
					name:
						currentUserInfo.fullName ||
						currentUserInfo.email ||
						currentCode ||
						currentUid,
					department:
						currentUserInfo.category ||
						myCategory ||
						"Chưa xác định",
					isCurrentUser: true
				});
			}
		}

		// Loại bỏ trùng: CODE trước, UID là fallback.
		const uniqueMap = {};

		departmentColleagues.forEach(item => {
			const key =
				String(item.code || "").trim() ||
				`uid:${String(item.uid || "").trim()}`;

			if (key && !uniqueMap[key]) {
				uniqueMap[key] = item;
			}
		});

		const uniqueDepartmentColleagues =
			Object.values(uniqueMap);

		// =====================================================
		// 7. LẤY CÁC MODULE DÀNH CHO GIÁO VIÊN / NHÂN SỰ
		// =====================================================
		const modulesSnap = await db
			.collection("organizations")
			.doc(orgId)
			.collection("modules")
			.where(
				"targetType",
				"in",
				["TEACHER", "EMPLOYEE"]
			)
			.get();

		// =====================================================
		// 8. LẤY TOÀN BỘ KPI FIELD
		//    Giữ cả kpiOptions để tính điểm âm/dương giống
		//    phần Tổng hợp tháng của Admin.
		// =====================================================
		const kpiFieldsMap = {};

		modulesSnap.forEach(modDoc => {
			const modData = modDoc.data() || {};

			const fieldsArr =
				Array.isArray(modData.fields)
					? modData.fields
					: [];

			fieldsArr.forEach(fObj => {
				if (
					!fObj ||
					!fObj.isKpi ||
					!fObj.key
				) {
					return;
				}

				const options =
					fObj.kpiOptions ||
					fObj.options ||
					{};

				kpiFieldsMap[fObj.key] = {
					id: fObj.key,
					name:
						fObj.label ||
						fObj.name ||
						fObj.key,
					scoreWeight: Number(
						fObj.scoreWeight ?? -1
					),
					kpiWeekly:
						fObj.kpiWeekly,
					kpiMonthly:
						fObj.kpiMonthly,
					kpiOptions: options,
					options
				};
			});
		});

		const kpiFieldsList =
			Object.values(kpiFieldsMap);

		// =====================================================
		// 9. LẤY KPI CONFIG NHÓM TEACHER
		// =====================================================
		let kpiRules = {};

		try {
			const kpiConfigRef = db
				.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("KPIconfig")
				.doc("teacher");

			const kpiConfigSnap =
				await kpiConfigRef.get();

			if (kpiConfigSnap.exists) {
				kpiRules = kpiConfigSnap.data() || {};
			}
		} catch (configError) {
			console.warn(
				"Không đọc được KPIconfig/teacher:",
				configError
			);
		}

		const basePointRaw = Number(
			kpiRules.BasePoint ??
			kpiRules.basePoint ??
			90
		);

		const basePoint =
			Number.isFinite(basePointRaw)
				? basePointRaw
				: 90;

		// =====================================================
		// 10. XÁC ĐỊNH KHOẢNG THỜI GIAN THÁNG HIỆN TẠI
		//     Cấu trúc theo Tổng hợp tháng Admin.
		// =====================================================
		const now = new Date();

		// Đọc cấu hình kỳ báo cáo tháng trực tiếp từ tổ chức.
		// startDay = 21 => kỳ hiện tại: 21 tháng trước -> 20 tháng này.
		let reportingStartDay = 1;

		try {
			const orgConfigSnap = await db
				.collection("organizations")
				.doc(orgId)
				.get();

			const orgConfigData = orgConfigSnap.exists
				? (orgConfigSnap.data() || {})
				: {};

			const configuredStartDay =
				orgConfigData?.reportingPeriod?.monthly?.startDay;

			const parsedStartDay = Number(configuredStartDay);

			if (
				Number.isFinite(parsedStartDay) &&
				parsedStartDay >= 1 &&
				parsedStartDay <= 31
			) {
				reportingStartDay = Math.floor(parsedStartDay);
			}
		} catch (periodError) {
			console.warn(
				"Không đọc được cấu hình kỳ báo cáo tháng, dùng ngày 1:",
				periodError
			);
		}

		let periodStartDate;
		let periodEndExclusiveDate;

		if (reportingStartDay === 1) {
			periodStartDate = new Date(
				now.getFullYear(),
				now.getMonth(),
				1,
				0,
				0,
				0,
				0
			);

			periodEndExclusiveDate = new Date(
				now.getFullYear(),
				now.getMonth() + 1,
				1,
				0,
				0,
				0,
				0
			);
		} else {
			// Kỳ được đặt tên theo tháng kết thúc.
			// Ví dụ ngày bắt đầu = 21, tháng hiện tại = 10/2026:
			// 21/09/2026 -> 20/10/2026.
			const candidateStartThisMonth = new Date(
				now.getFullYear(),
				now.getMonth(),
				reportingStartDay,
				0,
				0,
				0,
				0
			);

			if (now >= candidateStartThisMonth) {
				periodStartDate = candidateStartThisMonth;
			} else {
				periodStartDate = new Date(
					now.getFullYear(),
					now.getMonth() - 1,
					reportingStartDay,
					0,
					0,
					0,
					0
				);
			}

			periodEndExclusiveDate = new Date(periodStartDate);
			periodEndExclusiveDate.setMonth(
				periodEndExclusiveDate.getMonth() + 1
			);
		}

		const monthStart = periodStartDate;
		const nextMonthStart = periodEndExclusiveDate;


		const getRecordDate = data => {
			const candidates = [
				data.time,
				data.timestamp,
				data.createdAt,
				data.updatedAt,
				data.date,
				data.recordDate,
				data.createdDate
			];

			for (const value of candidates) {
				if (!value) continue;

				try {
					if (
						value &&
						typeof value.toDate === "function"
					) {
						const d = value.toDate();
						if (!Number.isNaN(d.getTime())) {
							return d;
						}
					}

					if (value instanceof Date) {
						if (!Number.isNaN(value.getTime())) {
							return value;
						}
					}

					const d = new Date(value);
					if (!Number.isNaN(d.getTime())) {
						return d;
					}
				} catch (_) {}
			}

			return null;
		};

		const isInReportingPeriod = data => {
			// Nếu record không có trường ngày,
			// giữ lại để tương thích dữ liệu cũ.
			const recordDate = getRecordDate(data);

			if (!recordDate) {
				return true;
			}

			return (
				recordDate >= monthStart &&
				recordDate < nextMonthStart
			);
		};

		// =====================================================
		// 11. HÀM TÌM USER THEO ENTITY ID
		//     CODE là chính; UID chỉ fallback record cũ.
		// =====================================================
		const colleagueByCode = {};
		const colleagueByUid = {};

		uniqueDepartmentColleagues.forEach(colleague => {
			const code = String(
				colleague.code || ""
			).trim();

			const uid = String(
				colleague.uid ||
				""
			).trim();

			if (code) {
				colleagueByCode[code] = colleague;
			}

			if (uid) {
				colleagueByUid[uid] = colleague;
			}
		});

		const resolveColleague = entityId => {
			const key = String(
				entityId || ""
			).trim();

			if (!key) return null;

			return (
				colleagueByCode[key] ||
				colleagueByUid[key] ||
				null
			);
		};

		// =====================================================
		// 12. KHỞI TẠO STATS
		// =====================================================
		const statsMap = {};

		uniqueDepartmentColleagues.forEach(c => {
			const primaryKey =
				String(c.code || "").trim() ||
				String(c.uid || "").trim();

			if (!primaryKey) return;

			statsMap[primaryKey] = {
				id: primaryKey,
				code: c.code || "",
				uid: c.uid || "",
				name: c.name,
				department: c.department,

				totalErrors: 0,
				totalPenalty: 0,
				totalBonus: 0,
				negativeCount: 0,
				positiveCount: 0,

				kpiCounts: {},
				negativeWeeks: new Set()
			};
		});

		// =====================================================
		// 13. HÀM CHUẨN HÓA GIÁ TRỊ KPI
		//     Mỗi item thực sự có nội dung = 1 lượt KPI.
		//     Item rỗng/null không được tính.
		// =====================================================
		const isMeaningfulKpiItem = item => {
			if (item === undefined || item === null) {
				return false;
			}

			if (typeof item === "string") {
				return item.trim() !== "";
			}

			if (typeof item === "number") {
				return !Number.isNaN(item);
			}

			if (typeof item === "boolean") {
				return true;
			}

			if (typeof item === "object") {
				return Object.values(item).some(value => {
					if (
						value === undefined ||
						value === null
					) {
						return false;
					}

					if (
						typeof value === "string"
					) {
						return value.trim() !== "";
					}

					return true;
				});
			}

			return true;
		};

		const getKpiItems = value => {
			if (Array.isArray(value)) {
				return value.filter(
					isMeaningfulKpiItem
				);
			}

			return isMeaningfulKpiItem(value)
				? [value]
				: [];
		};

		// =====================================================
		// 14. LẤY SCORE WEIGHT CỦA TỪNG ITEM KPI
		// =====================================================
		const getOptionKey = item => {
			if (
				item &&
				typeof item === "object"
			) {
				return String(
					item.value ??
					item.label ??
					item.name ??
					item.option ??
					item.key ??
					""
				).trim();
			}

			return String(
				item ?? ""
			).trim();
		};

		const getScoreWeight = (
			kpiField,
			item
		) => {
			const defaultWeight = Number(
				kpiField.scoreWeight
			);

			const optionKey = getOptionKey(item);

			const options =
				kpiField.kpiOptions ||
				kpiField.options ||
				{};

			let optionConfig = null;

			if (
				optionKey &&
				options &&
				typeof options === "object"
			) {
				optionConfig =
					options[optionKey];

				if (
					optionConfig === undefined
				) {
					const lowerKey =
						optionKey.toLowerCase();

					const matchedKey =
						Object.keys(options).find(
							key =>
								String(key)
									.toLowerCase() ===
								lowerKey
						);

					if (matchedKey) {
						optionConfig =
							options[matchedKey];
					}
				}
			}

			if (
				optionConfig !== null &&
				optionConfig !== undefined
			) {
				if (
					typeof optionConfig === "number"
				) {
					return Number(
						optionConfig
					);
				}

				if (
					typeof optionConfig === "object"
				) {
					const optionWeight = Number(
						optionConfig.scoreWeight ??
						optionConfig.weight ??
						optionConfig.points ??
						optionConfig.point
					);

					if (
						Number.isFinite(
							optionWeight
						)
					) {
						return optionWeight;
					}
				}
			}

			return Number.isFinite(
				defaultWeight
			)
				? defaultWeight
				: -1;
		};

		const getWeekKey = data => {
			const date = getRecordDate(data);

			if (!date) return "";

			const firstDay = new Date(
				date.getFullYear(),
				date.getMonth(),
				1
			);

			const diffDays = Math.floor(
				(date - firstDay) /
				86400000
			);

			return `W${Math.floor(
				diffDays / 7
			) + 1}`;
		};

		// =====================================================
		// 15. ĐỌC RECORDS CỦA TỪNG MODULE
		// =====================================================
		for (const modDoc of modulesSnap.docs) {
			const recordsSnap = await db
				.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("modulesData")
				.doc(modDoc.id)
				.collection("records")
				.get();

			recordsSnap.forEach(recDoc => {
				const data =
					recDoc.data() || {};

				if (!isInReportingPeriod(data)) {
					return;
				}

				const entityId = String(
					data.entityId ||
					recDoc.id ||
					""
				).trim();

				const colleague =
					resolveColleague(entityId);

				if (!colleague) {
					return;
				}

				const statsKey =
					String(
						colleague.code ||
						colleague.uid ||
						""
					).trim();

				const stats =
					statsMap[statsKey];

				if (!stats) {
					return;
				}

				kpiFieldsList.forEach(
					kpiField => {
						const fKey =
							kpiField.id;

						let val =
							data[fKey];

						if (
							val === undefined &&
							data.changes &&
							data.changes[fKey] !==
								undefined
						) {
							val =
								data.changes[fKey];
						}

						const items =
							getKpiItems(val);

						if (
							items.length === 0
						) {
							return;
						}

						// Mỗi item KPI có nội dung
						// được tính là 1 lượt.
						stats.totalErrors +=
							items.length;

						stats.kpiCounts[fKey] =
							(
								stats.kpiCounts[fKey] ||
								0
							) + items.length;

						items.forEach(item => {
							const score =
								getScoreWeight(
									kpiField,
									item
								);

							if (
								score < 0
							) {
								stats.totalPenalty +=
									Math.abs(score);

								stats.negativeCount++;

								const weekKey =
									getWeekKey(data);

								if (weekKey) {
									stats.negativeWeeks.add(
										weekKey
									);
								}
							} else if (
								score > 0
							) {
								stats.totalBonus +=
									score;

								stats.positiveCount++;
							}
						});
					}
				);
			});
		}

		// =====================================================
		// 16. TÍNH ĐIỂM THÁNG
		//     BasePoint - điểm KPI âm + điểm KPI dương
		// =====================================================
		const processedList =
			Object.values(statsMap).map(item => {
				item.negativeWeeks =
					item.negativeWeeks instanceof Set
						? item.negativeWeeks.size
						: Number(
							item.negativeWeeks || 0
						);

				item.totalPoints =
					basePoint -
					Number(
						item.totalPenalty || 0
					) +
					Number(
						item.totalBonus || 0
					);

				return item;
			});

		// Sắp xếp theo tên để bảng ổn định.
		processedList.sort(
			(a, b) =>
				String(a.name || "")
					.localeCompare(
						String(b.name || ""),
						"vi"
					)
		);

		// =====================================================
		// 17. DỰNG HEADER
		// =====================================================
		let headerHtml = `
			<th style="width: 100px;">Mã định danh</th>
			<th style="width: 180px;">Họ và Tên</th>
			<th style="width: 120px;">Tổ chuyên môn</th>
		`;

		kpiFieldsList.forEach(field => {
			headerHtml += `
				<th style="text-align: center; min-width: 90px;">
					${field.name}
				</th>
			`;
		});

		headerHtml += `
			<th style="width: 100px; text-align: center;">
				Tổng lỗi
			</th>
			<th style="width: 100px; text-align: center;">
				Điểm trừ
			</th>
			<th style="width: 100px; text-align: center;">
				Điểm cộng
			</th>
			<th style="width: 120px; text-align: center;">
				Tổng điểm tháng
			</th>
		`;

		if (headerRow) {
			headerRow.innerHTML =
				headerHtml;
		}

		// =====================================================
		// 18. RENDER BẢNG
		// =====================================================
		if (processedList.length === 0) {
			tableBody.innerHTML =
				`<tr>
					<td colspan="${3 + kpiFieldsList.length + 4}"
						style="text-align: center; color: #6c757d; font-style: italic;">
						Chưa có thành viên trong tổ chuyên môn.
					</td>
				</tr>`;

			return;
		}

		let html = "";

		processedList.forEach(item => {
			const totalErrors =
				Number(
					item.totalErrors || 0
				);

			const totalPenalty =
				Number(
					item.totalPenalty || 0
				);

			const totalBonus =
				Number(
					item.totalBonus || 0
				);

			const totalPoints =
				Number(
					item.totalPoints || 0
				);

			html += `
				<tr style="border-bottom: 1px solid #dee2e6;">

					<td style="font-family: monospace; font-weight: bold;">
						${item.code || item.uid || item.id}
					</td>

					<td>
						${item.name || ""}
					</td>

					<td>
						<span style="
							background: #e9ecef;
							padding: 2px 6px;
							border-radius: 4px;
							font-size: 0.9em;
						">
							${item.department || ""}
						</span>
					</td>
			`;

			kpiFieldsList.forEach(field => {
				const countVal =
					Number(
						item.kpiCounts[field.id] ||
						0
					);

				html += `
					<td style="text-align: center;">
						${
							countVal > 0
								? `<span style="color: #dc3545; font-weight: bold;">
									${countVal}
								   </span>`
								: `<span style="color: #ccc;">
									0
								   </span>`
						}
					</td>
				`;
			});

			html += `
					<td style="
						text-align: center;
						font-weight: bold;
						color: ${
							totalErrors > 0
								? "#dc3545"
								: "#198754"
						};
					">
						${totalErrors}
					</td>

					<td style="
						text-align: center;
						font-weight: bold;
						color: ${
							totalPenalty > 0
								? "#dc3545"
								: "#198754"
						};
					">
						${totalPenalty}
					</td>

					<td style="
						text-align: center;
						font-weight: bold;
						color: ${
							totalBonus > 0
								? "#0d6efd"
								: "#6c757d"
						};
					">
						${totalBonus}
					</td>

					<td style="
						text-align: center;
						font-weight: bold;
						font-size: 1.05em;
						color: ${
							totalPoints < basePoint
								? "#dc3545"
								: "#198754"
						};
					">
						${totalPoints}
					</td>

				</tr>
			`;
		});

		tableBody.innerHTML = html;

	} catch (error) {
		console.error(
			"Lỗi tải dữ liệu tổ chuyên môn:",
			error
		);

		tableBody.innerHTML =
			'<tr><td colspan="10" style="text-align: center; color: red;">Lỗi tải dữ liệu tổ chuyên môn.</td></tr>';
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

	// Biến cache lưu toàn bộ danh sách nhân sự của đơn vị phục vụ tìm kiếm nhanh
	let cachedAllHelpUsers = [];

	// 1. Hàm tải trước và cache toàn bộ user của orgId
	async function loadAndCacheHelpUsers(orgId) {
		const container = document.getElementById("help-user-list-container");
		if (!container) return;

		if (cachedAllHelpUsers.length > 0) {
			renderHelpUserList(cachedAllHelpUsers);
			return;
		}

		container.innerHTML = `<i style="color: #6c757d; font-size: 0.9em;">⏳ Đang tải danh sách đồng nghiệp...</i>`;

		try {
			const db = firebase.firestore();
			const usersSnap = await db.collection("organizations").doc(orgId).collection("users").get();
			
			cachedAllHelpUsers = [];
			const authUser = firebase.auth().currentUser;
			const currentEmail = authUser && authUser.email ? authUser.email.toLowerCase().trim() : "";

			usersSnap.forEach(doc => {
				const data = doc.data();
				const email = (data.email || "").toLowerCase().trim();
				const fullName = data.fullName || doc.id;
				const category = data.category || data.className || data.role || "Nhân sự";

				// Không đưa chính tài khoản đang đăng nhập vào danh sách tự nhờ hỗ trợ
				if (email && email !== currentEmail) {
					cachedAllHelpUsers.push({
						id: doc.id,
						email: email,
						name: fullName,
						category: category
					});
				}
			});

			renderHelpUserList(cachedAllHelpUsers);

		} catch (error) {
			console.error("Lỗi tải danh sách người dùng hỗ trợ:", error);
			container.innerHTML = `<span style="color: red; font-size: 0.9em;">Không thể tải danh sách đồng nghiệp.</span>`;
		}
	}

	// 2. Hàm render danh sách ra container
	function renderHelpUserList(usersList) {
		const container = document.getElementById("help-user-list-container");
		if (!container) return;

		if (usersList.length === 0) {
			container.innerHTML = `<i style="color: #6c757d; font-size: 0.9em;">Không tìm thấy đồng nghiệp nào phù hợp.</i>`;
			return;
		}

		let html = "";
		usersList.forEach(u => {
			html += `
				<div style="display: flex; align-items: center; padding: 6px 8px; border-bottom: 1px solid #f1f3f5;">
					<input type="checkbox" name="chk_help_assistant" value="${u.email}" data-name="${u.name}" id="help_user_${u.id}" style="margin-right: 10px; cursor: pointer;">
					<label for="help_user_${u.id}" style="cursor: pointer; flex-grow: 1; font-size: 0.95em;">
						<b>${u.name}</b> <span style="color: #6c757d; font-size: 0.85em;">(${u.email}) - [${u.category}]</span>
					</label>
				</div>
			`;
		});
		container.innerHTML = html;
	}

	// 3. Hàm lọc theo từ khóa gõ vào (Dùng Cache RAM cực nhanh)
	function filterHelpUserList() {
		const searchInput = document.getElementById("help-user-search-input");
		if (!searchInput) return;

		const keyword = searchInput.value.toLowerCase().trim();

		if (!keyword) {
			renderHelpUserList(cachedAllHelpUsers);
			return;
		}

		const filtered = cachedAllHelpUsers.filter(u => 
			u.name.toLowerCase().includes(keyword) || 
			u.email.toLowerCase().includes(keyword) || 
			u.category.toLowerCase().includes(keyword)
		);

		renderHelpUserList(filtered);
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

			const supportersRef = db.collection("organizations")
				.doc(orgId)
				.collection("academicYears")
				.doc(academicYearId)
				.collection("supporters");

			const now = Date.now();
			const expiresAt = now + 30 * 60 * 1000; // Thời hạn 30 phút

			for (const chk of selectedCheckboxes) {
				const assistantEmail = chk.value.toLowerCase().trim(); // Email người được nhờ
				const assistantName = chk.getAttribute("data-name");

				// 🌟 1. TRA CỨU ĐỊNH DANH (CODE/UID) TỪ COLLECTION GỐC /emails/
				let teacherCode = "";
				try {
					const emailDocSnap = await db.collection("emails").doc(assistantEmail).get();
					if (emailDocSnap.exists) {
						const emailData = emailDocSnap.data();
						// Lấy code hoặc uid lưu trong bảng emails (nếu có), nếu không dùng phần đầu email làm fallback
						teacherCode = emailData.code || emailData.uid || assistantEmail.split('@')[0];
					} else {
						teacherCode = assistantEmail.split('@')[0];
					}
				} catch (err) {
					console.warn("Không đọc được collection emails, dùng fallback:", err);
					teacherCode = assistantEmail.split('@')[0];
				}

				// 2. Cập nhật phân quyền module cho người hỗ trợ trong bảng assignments
				const assistantDocRef = assignmentsRef.doc(teacherCode);
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

				// 3. Tạo biên bản ủy quyền trong collection supporters riêng biệt
				const supportDocId = `${now}_${ownerEmail}_${teacherCode}`;
				const supportDocRef = supportersRef.doc(supportDocId);

				batch.set(supportDocRef, {
					id: supportDocId,
					ownerEmail: ownerEmail,
					assistantEmail: assistantEmail,
					assistantCode: teacherCode,
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

			// 🌟 1. TRA CỨU MEMBERID (CHỮ THƯỜNG) CỦA NGƯỜI HỖ TRỢ TỪ /emails/
			let teacherMemberId = "";
			try {
				const emailDocSnap = await db.collection("emails").doc(teacherEmail).get();
				if (emailDocSnap.exists) {
					const emailData = emailDocSnap.data();
					const rawMemberId = emailData.code || emailData.uid || "";
					if (rawMemberId) {
						teacherMemberId = String(rawMemberId).toLowerCase().trim();
					}
				}
			} catch (e) {
				console.warn("Không đọc được collection emails:", e);
			}

			// Fallback an toàn nếu không tìm thấy trong emails
			if (!teacherMemberId) {
				teacherMemberId = teacherEmail;
			}

			// 2. Gỡ module khỏi bảng assignments của người trợ giúp bằng ĐÚNG teacherMemberId
			const assistantDocRef = academicYearRef.collection("assignments").doc(teacherMemberId);
			const docSnap = await assistantDocRef.get();
			if (docSnap.exists) {
				const data = docSnap.data();
				let mods = Array.isArray(data.modules) ? data.modules : [];
				mods = mods.filter(m => m !== moduleId);

				// NẾU KHÔNG CÒN MODULE NÀO -> XÓA HẲN DOCUMENT ASSIGNMENT ĐỂ LÀM SẠCH CSDL
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

			// 3. Tìm và xóa các biên bản trong collection supporters tương ứng
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

			// 🌟 1. TRA CỨU MEMBERID (CHỮ THƯỜNG) CỦA NGƯỜI TRỢ GIÚP TỪ /emails/
			let assistantMemberId = "";
			try {
				const emailDocSnap = await db.collection("emails").doc(assistantEmail).get();
				if (emailDocSnap.exists) {
					const emailData = emailDocSnap.data();
					const rawMemberId = emailData.code || emailData.uid || "";
					if (rawMemberId) {
						assistantMemberId = String(rawMemberId).toLowerCase().trim();
					}
				}
			} catch (e) {
				console.warn("Không đọc được collection emails:", e);
			}

			// Fallback an toàn nếu không tìm thấy trong emails
			if (!assistantMemberId) {
				assistantMemberId = assistantEmail;
			}

			// 2. Gỡ module khỏi bảng assignments bằng ĐÚNG assistantMemberId
			const assistantDocRef = academicYearRef.collection("assignments").doc(assistantMemberId);
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

			// 3. Xóa biên bản trong collection supporters
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
	async function checkAndExpireSupporters(academicIdOverride = "") {
    const orgId = window.currentOrgIdGlobal;
    if (!orgId) return;

    // ============================================================
    // 1. XÁC ĐỊNH NĂM HỌC
    //
    // Nếu caller truyền academicId thì ưu tiên tuyệt đối.
    // Điều này giúp saveSingle / saveAll kiểm tra đúng năm học
    // mà người dùng đang thao tác.
    // ============================================================

    let academicYearId = String(academicIdOverride || "").trim();

    if (!academicYearId) {
        academicYearId = String(currentAcademicYear || "").trim();
    }

    if (!academicYearId) {
        const yearsArr = window.currentAcademicYearsGlobal;

        if (Array.isArray(yearsArr) && yearsArr.length > 0) {
            const lastYearItem = yearsArr[yearsArr.length - 1];

            academicYearId = String(
                typeof lastYearItem === "object" && lastYearItem !== null
                    ? (
                        lastYearItem.id ||
                        lastYearItem.name ||
                        lastYearItem.year ||
                        ""
                    )
                    : lastYearItem
            ).trim();
        }
    }

    if (!academicYearId) {
        console.warn(
            "[Support] Không xác định được năm học, bỏ qua kiểm tra hết hạn."
        );
        return;
    }

    try {
        const db = firebase.firestore();

        const academicYearRef = db
            .collection("organizations")
            .doc(orgId)
            .collection("academicYears")
            .doc(academicYearId);

        // ========================================================
        // 2. TÌM CÁC SUPPORTER ĐÃ HẾT HẠN
        // ========================================================

        const now = Date.now();

        const expiredSnap = await academicYearRef
            .collection("supporters")
            .where("expiresAt", "<", now)
            .get();

        if (expiredSnap.empty) {
            return;
        }

        // ========================================================
        // 3. CHUẨN BỊ BATCH
        // ========================================================

        const batch = db.batch();

        for (const doc of expiredSnap.docs) {
            const data = doc.data() || {};

            const assistantEmail =
                String(data.assistantEmail || "")
                    .trim()
                    .toLowerCase();

            const moduleId =
                String(data.moduleId || "").trim();

            // ====================================================
            // 4. XÁC ĐỊNH MEMBER ID CỦA NGƯỜI TRỢ GIÚP
            //
            // Ưu tiên code, sau đó mới UID.
            // ====================================================

            if (assistantEmail && moduleId) {

                let assistantMemberId = "";

                try {
                    const emailDocSnap = await db
                        .collection("emails")
                        .doc(assistantEmail)
                        .get();

                    if (emailDocSnap.exists) {
                        const emailData = emailDocSnap.data() || {};

                        const rawMemberId =
                            emailData.code ||
                            emailData.uid ||
                            "";

                        if (rawMemberId) {
                            assistantMemberId =
                                String(rawMemberId)
                                    .toLowerCase()
                                    .trim();
                        }
                    }
                } catch (e) {
                    console.warn(
                        "Không đọc được collection emails:",
                        e
                    );
                }

                // Fallback về email nếu không tìm được code/UID.
                if (!assistantMemberId) {
                    assistantMemberId = assistantEmail;
                }

                // =================================================
                // 5. ĐỌC ASSIGNMENT CỦA NGƯỜI TRỢ GIÚP
                // =================================================

                const assistantDocRef = academicYearRef
                    .collection("assignments")
                    .doc(assistantMemberId);

                const assistantDoc =
                    await assistantDocRef.get();

                if (assistantDoc.exists) {
                    const asstData =
                        assistantDoc.data() || {};

                    let mods =
                        Array.isArray(asstData.modules)
                            ? asstData.modules
                            : [];

                    // Chỉ loại module đã hết hạn.
                    mods = mods.filter(
                        m => m !== moduleId
                    );

                    // =================================================
                    // 6. NẾU KHÔNG CÒN MODULE
                    //    → XÓA ASSIGNMENT
                    // =================================================

                    if (mods.length === 0) {

                        batch.delete(assistantDocRef);

                    } else {

                        batch.set(
                            assistantDocRef,
                            {
                                modules: mods,
                                isAssistant: false,
                                updatedAt:
                                    typeof getVietnamTimestamp === "function"
                                        ? getVietnamTimestamp()
                                        : new Date().toISOString()
                            },
                            { merge: true }
                        );
                    }
                }
            }

            // ========================================================
            // 7. XÓA BIÊN BẢN SUPPORT ĐÃ HẾT HẠN
            // ========================================================

            batch.delete(doc.ref);
        }

        // ========================================================
        // 8. COMMIT
        // ========================================================

        await batch.commit();

        console.log(
            `[Support] Đã tự động thu hồi và dọn dẹp ` +
            `${expiredSnap.size} biên bản trợ giúp quá hạn ` +
            `của năm học ${academicYearId}.`
        );

    } catch (error) {

        console.error(
            "[Support] Lỗi khi quét dọn biên bản hết hạn:",
            error
        );
    }
}
	
	
	// 	EMPLOYEE PANEL - THẺ 2
	async function loadPersonalStatusData(forceRefresh = false) {
		// ============================================================
		// THEO DÕI CÁ NHÂN
		// Nguồn dữ liệu: auditLogs
		// Chỉ lấy các field có isKpi === true.
		//
		// Bảng:
		//   Thời gian | Người ghi nhận | Lỗi ghi nhận
		//
		// "Lỗi ghi nhận" được ghép từ:
		//   field.label + option label
		//
		// Ví dụ:
		//   Đi học muộn – Có đi muộn
		//
		// Lưu ý:
		// - entityId ưu tiên CODE, UID chỉ dùng fallback cho dữ liệu cũ.
		// - AuditLog là nguồn dữ liệu chính, không lấy records để dựng
		//   danh sách lỗi.
		// ============================================================

		const listEl = document.getElementById("emp-personal-status-list");
		const moduleCountEl = document.getElementById("emp-personal-module-count");
		const errorCountEl = document.getElementById("emp-personal-error-count");
		const statusEl = document.getElementById("emp-personal-status");

		const nameEl = document.getElementById("emp-personal-user-name");
		const categoryEl = document.getElementById("emp-personal-user-category");
		const codeEl = document.getElementById("emp-personal-user-code");

		const periodSelect = document.getElementById("emp-personal-period-select");
		const periodType = periodSelect?.value || "week";

		if (!listEl) return;

		const escapeHtml = value => {
			return String(value ?? "")
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#039;");
		};

		const normalizeText = value =>
			String(value ?? "")
				.trim()
				.toLowerCase();

		const normalizeKey = value =>
			String(value ?? "")
				.trim()
				.toLowerCase();

		const formatDateTime = value => {
			if (!value) return "--";

			let date = null;

			try {
				if (value instanceof Date) {
					date = value;
				} else if (typeof value?.toDate === "function") {
					date = value.toDate();
				} else if (typeof value === "number") {
					date = new Date(value);
				} else if (typeof value === "string") {
					const text = value.trim();

					// ISO / chuỗi ngày giờ thông thường
					const parsed = new Date(text);
					if (!Number.isNaN(parsed.getTime())) {
						date = parsed;
					}
				}
			} catch (e) {
				console.warn("[PersonalStatus] Không parse được timestamp:", value, e);
			}

			if (!date || Number.isNaN(date.getTime())) {
				return String(value ?? "--");
			}

			return date.toLocaleString("vi-VN", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
		};

		const toDate = value => {
			if (!value) return null;

			try {
				if (value instanceof Date) return value;

				if (typeof value?.toDate === "function") {
					return value.toDate();
				}

				if (typeof value === "number") {
					const d = new Date(value);
					return Number.isNaN(d.getTime()) ? null : d;
				}

				if (typeof value === "string") {
					const d = new Date(value);
					return Number.isNaN(d.getTime()) ? null : d;
				}
			} catch (e) {
				return null;
			}

			return null;
		};

		// ------------------------------------------------------------
		// Lấy khoảng thời gian
		// ------------------------------------------------------------
		const getPeriodRange = async () => {
			const now = new Date();

			if (periodType === "week") {
				// Tuần hiện tại: Thứ 2 -> Chủ nhật
				const current = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate()
				);

				const day = current.getDay(); // CN = 0
				const diffToMonday = day === 0 ? 6 : day - 1;

				const start = new Date(current);
				start.setDate(current.getDate() - diffToMonday);
				start.setHours(0, 0, 0, 0);

				const end = new Date(start);
				end.setDate(start.getDate() + 7);
				end.setHours(0, 0, 0, 0);

				return {
					start,
					end,
					label: `Tuần này (${start.toLocaleDateString("vi-VN")} - ${new Date(end.getTime() - 1).toLocaleDateString("vi-VN")})`
				};
			}

			// --------------------------------------------------------
			// THÁNG:
			// Đọc ngày bắt đầu kỳ báo cáo từ organizations/{orgId}
			// reportingPeriod.monthly.startDay
			//
			// Ví dụ startDay = 21:
			// Tháng 10/2026 = 21/09/2026 -> 20/10/2026
			// --------------------------------------------------------
			const orgId =
				window.currentEmployeeOrgIdGlobal ||
				window.currentOrgIdGlobal;

			let startDay = 1;

			if (orgId) {
				try {
					const orgDoc = await firebase.firestore()
						.collection("organizations")
						.doc(orgId)
						.get();

					const reportingPeriod = orgDoc.exists
						? (orgDoc.data()?.reportingPeriod || {})
						: {};

					const monthly = reportingPeriod.monthly || {};
					const configuredStartDay = Number(monthly.startDay);

					if (
						Number.isFinite(configuredStartDay) &&
						configuredStartDay >= 1 &&
						configuredStartDay <= 31
					) {
						startDay = Math.floor(configuredStartDay);
					}
				} catch (e) {
					console.warn(
						"[PersonalStatus] Không đọc được reportingPeriod, dùng ngày 1.",
						e
					);
				}
			}

			const safeDay = Math.min(
				startDay,
				new Date(now.getFullYear(), now.getMonth(), 0).getDate()
			);

			let start;
			let end;

			if (startDay === 1) {
				start = new Date(now.getFullYear(), now.getMonth(), 1);
				end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
			} else if (now.getDate() >= startDay) {
				start = new Date(
					now.getFullYear(),
					now.getMonth(),
					safeDay
				);

				const nextMonthLastDay = new Date(
					now.getFullYear(),
					now.getMonth() + 2,
					0
				).getDate();

				const endDay = Math.min(startDay, nextMonthLastDay);

				end = new Date(
					now.getFullYear(),
					now.getMonth() + 1,
					endDay
				);
			} else {
				const previousMonthYear = now.getMonth() === 0
					? now.getFullYear() - 1
					: now.getFullYear();

				const previousMonth = now.getMonth() === 0
					? 11
					: now.getMonth() - 1;

				const previousMonthLastDay = new Date(
					previousMonthYear,
					previousMonth + 1,
					0
				).getDate();

				const previousSafeDay = Math.min(
					startDay,
					previousMonthLastDay
				);

				start = new Date(
					previousMonthYear,
					previousMonth,
					previousSafeDay
				);

				const currentMonthLastDay = new Date(
					now.getFullYear(),
					now.getMonth() + 1,
					0
				).getDate();

				end = new Date(
					now.getFullYear(),
					now.getMonth(),
					Math.min(startDay, currentMonthLastDay)
				);
			}

			start.setHours(0, 0, 0, 0);
			end.setHours(0, 0, 0, 0);

			return {
				start,
				end,
				label: `Kỳ báo cáo (${start.toLocaleDateString("vi-VN")} - ${new Date(end.getTime() - 1).toLocaleDateString("vi-VN")})`
			};
		};

		// ------------------------------------------------------------
		// Chuẩn hóa option
		//
		// Cấu trúc hiện tại:
		// field.options = ["VALUE_1", "VALUE_2", ...]
		// field.kpiOptions = {
		//    VALUE_1: { scoreWeight, kpiWeekly, kpiMonthly }
		// }
		//
		// Có hỗ trợ thêm trường hợp options là object để không làm
		// hỏng dữ liệu nếu sau này nâng cấp cấu trúc option.
		// ------------------------------------------------------------
		const getOptionLabel = (field, optionValue) => {
			if (optionValue === undefined || optionValue === null) {
				return "";
			}

			const rawValue = String(optionValue).trim();
			if (!rawValue) return "";

			const options = Array.isArray(field?.options)
				? field.options
				: [];

			const exactOption = options.find(option => {
				if (option && typeof option === "object") {
					const value =
						option.value ??
						option.key ??
						option.id ??
						option.code;

					return normalizeText(value) === normalizeText(rawValue);
				}

				return normalizeText(option) === normalizeText(rawValue);
			});

			if (exactOption && typeof exactOption === "object") {
				return String(
					exactOption.label ??
					exactOption.name ??
					exactOption.title ??
					exactOption.value ??
					exactOption.key ??
					rawValue
				).trim();
			}

			// Với cấu trúc hiện tại, option chính là chuỗi hiển thị.
			return exactOption !== undefined
				? String(exactOption).trim()
				: rawValue;
		};

		// ------------------------------------------------------------
		// Tách giá trị option từ:
		// "Cập nhật options: [value1, value2]"
		//
		// Có hỗ trợ:
		//   [value1, value2]
		//   value1, value2
		//   "value1", "value2"
		// ------------------------------------------------------------
		const extractOptionValues = changeValue => {
			if (changeValue === undefined || changeValue === null) {
				return [];
			}

			if (Array.isArray(changeValue)) {
				return changeValue
					.map(v => String(v ?? "").trim())
					.filter(Boolean);
			}

			if (typeof changeValue === "object") {
				const values =
					changeValue.values ??
					changeValue.options ??
					changeValue.value;

				if (Array.isArray(values)) {
					return values
						.map(v => String(v ?? "").trim())
						.filter(Boolean);
				}

				if (values !== undefined && values !== null) {
					return [String(values).trim()].filter(Boolean);
				}

				return [];
			}

			const text = String(changeValue).trim();

			// Dạng: Cập nhật options: [A, B]
			const bracketMatch = text.match(/\[([\s\S]*?)\]/);

			if (bracketMatch) {
				return bracketMatch[1]
					.split(",")
					.map(v => v.trim())
					.map(v => v.replace(/^["']|["']$/g, "").trim())
					.filter(Boolean);
			}

			// Nếu auditLog sau này ghi trực tiếp danh sách.
			const prefixMatch = text.match(
				/(?:options?|giá\s*trị)\s*:\s*(.+)$/i
			);

			if (prefixMatch) {
				const raw = prefixMatch[1].trim();

				if (raw.includes(",")) {
					return raw
						.split(",")
						.map(v => v.trim())
						.map(v => v.replace(/^["']|["']$/g, "").trim())
						.filter(Boolean);
				}

				return [
					raw.replace(/^["']|["']$/g, "").trim()
				].filter(Boolean);
			}

			return [];
		};

		// ------------------------------------------------------------
		// Dạng text:
		// "Thêm mới: "abc""
		//
		// Với field KPI dạng text, vẫn hiển thị giá trị sau khi
		// ghép với label của field.
		// ------------------------------------------------------------
		const extractTextValue = changeValue => {
			if (changeValue === undefined || changeValue === null) {
				return "";
			}

			if (typeof changeValue === "object") {
				const value =
					changeValue.value ??
					changeValue.content ??
					changeValue.text;

				return value === undefined || value === null
					? ""
					: String(value).trim();
			}

			const text = String(changeValue).trim();

			// "Thêm mới: "ABC""
			const addMatch = text.match(
				/thêm\s*mới\s*:\s*["“”']?([\s\S]*?)["“”']?\s*$/i
			);

			if (addMatch) {
				return addMatch[1].trim();
			}

			// Trường hợp audit khác nhưng vẫn có dấu :
			const colonIndex = text.indexOf(":");

			if (colonIndex >= 0) {
				const value = text
					.slice(colonIndex + 1)
					.trim()
					.replace(/^\[|\]$/g, "")
					.replace(/^["“”']|["“”']$/g, "")
					.trim();

				return value;
			}

			return text;
		};

		// ------------------------------------------------------------
		// Chuyển một audit change thành các dòng hiển thị.
		// Chỉ giữ field KPI.
		// ------------------------------------------------------------
		const buildKpiDetailsFromAudit = (auditData, moduleConfig) => {
			const changes = auditData?.changes;

			if (!changes || typeof changes !== "object") {
				return [];
			}

			const fields = Array.isArray(moduleConfig?.fields)
				? moduleConfig.fields
				: [];

			const fieldsByKey = {};

			fields.forEach(field => {
				if (!field || typeof field !== "object") return;

				const key =
					field.key ??
					field.id ??
					field.fieldKey;

				if (!key) return;

				fieldsByKey[normalizeKey(key)] = field;
			});

			const result = [];

			Object.entries(changes).forEach(([fieldKey, changeValue]) => {
				const field =
					fieldsByKey[normalizeKey(fieldKey)];

				// Chỉ trường KPI mới được đưa vào theo dõi cá nhân.
				if (!field || field.isKpi !== true) {
					return;
				}

				const fieldLabel =
					String(
						field.label ??
						field.title ??
						field.name ??
						fieldKey
					).trim();

				if (!fieldLabel) return;

				const isOptions =
					String(field.type || "").toLowerCase() === "options" ||
					Array.isArray(field.options);

				if (isOptions) {
					const optionValues =
						extractOptionValues(changeValue);

					if (optionValues.length > 0) {
						optionValues.forEach(optionValue => {
							const optionLabel =
								getOptionLabel(
									field,
									optionValue
								);

							const detail = optionLabel
								? `${fieldLabel} – ${optionLabel}`
								: fieldLabel;

							result.push({
								fieldKey,
								fieldLabel,
								optionValue,
								optionLabel,
								detail
							});
						});

						return;
					}
				}

				// KPI dạng text / số / kiểu khác.
				const textValue =
					extractTextValue(changeValue);

				const detail = textValue
					? `${fieldLabel} – ${textValue}`
					: fieldLabel;

				result.push({
					fieldKey,
					fieldLabel,
					optionValue: "",
					optionLabel: "",
					detail
				});
			});

			return result;
		};

		// ------------------------------------------------------------
		// HIỂN THỊ TRẠNG THÁI ĐANG TẢI
		// ------------------------------------------------------------
		listEl.innerHTML = `
			<div style="
				text-align:center;
				color:#6c757d;
				padding:20px;
			">
				<i class="fa-solid fa-spinner fa-spin"></i>
				Đang tải dữ liệu theo dõi cá nhân...
			</div>
		`;

		if (moduleCountEl) moduleCountEl.textContent = "0";
		if (errorCountEl) errorCountEl.textContent = "0";
		if (statusEl) {
			statusEl.textContent = "Đang tải...";
			statusEl.style.color = "#0d6efd";
		}

		try {
			const db = firebase.firestore();

			const user = firebase.auth().currentUser;

			if (!user) {
				throw new Error(
					"Không xác định được người dùng đang đăng nhập."
				);
			}

			const orgId =
				window.currentEmployeeOrgIdGlobal ||
				window.currentOrgIdGlobal;

			if (!orgId) {
				throw new Error(
					"Không xác định được đơn vị (OrgId)."
				);
			}

			// --------------------------------------------------------
			// 1. TÌM USER HIỆN TẠI
			// --------------------------------------------------------
			let currentUserData = null;

			const cachedUsers =
				window.employeeDataCache?.users;

			if (Array.isArray(cachedUsers) && cachedUsers.length > 0) {
				currentUserData =
					cachedUsers.find(u =>
						String(u.uid || "").trim() === user.uid
					) ||
					cachedUsers.find(u =>
						String(u.id || "").trim() === user.uid
					) ||
					cachedUsers.find(u =>
						normalizeText(u.email) ===
						normalizeText(user.email)
					);
			}

			if (!currentUserData) {
				const userById = await db
					.collection("organizations")
					.doc(orgId)
					.collection("users")
					.doc(user.uid)
					.get();

				if (userById.exists) {
					currentUserData = {
						id: userById.id,
						...userById.data()
					};
				}
			}

			// Fallback tìm theo email nếu document ID không phải UID.
			if (!currentUserData && user.email) {
				const emailSnap = await db
					.collection("organizations")
					.doc(orgId)
					.collection("users")
					.where("email", "==", user.email)
					.limit(1)
					.get();

				if (!emailSnap.empty) {
					const doc = emailSnap.docs[0];

					currentUserData = {
						id: doc.id,
						...doc.data()
					};
				}
			}

			if (!currentUserData) {
				throw new Error(
					"Không tìm thấy thông tin nhân sự trong đơn vị."
				);
			}

			const currentUid =
				String(
					currentUserData.uid ||
					currentUserData.id ||
					user.uid ||
					""
				).trim();

			const currentCode =
				String(
					currentUserData.code ||
					currentUserData.memberId ||
					""
				).trim();

			const currentEmail =
				String(
					currentUserData.email ||
					user.email ||
					""
				).trim().toLowerCase();

			const currentName =
				String(
					currentUserData.fullName ||
					currentUserData.displayName ||
					currentUserData.name ||
					user.displayName ||
					currentEmail ||
					currentCode ||
					currentUid
				).trim();

			const currentCategory =
				String(
					currentUserData.category ||
					currentUserData.className ||
					currentUserData.department ||
					""
				).trim();

			if (nameEl) nameEl.textContent = currentName || "--";
			if (categoryEl) categoryEl.textContent = currentCategory || "--";
			if (codeEl) codeEl.textContent =
				currentCode || currentUid || "--";

			// --------------------------------------------------------
			// 2. XÁC ĐỊNH KỲ THỜI GIAN
			// --------------------------------------------------------
			const period = await getPeriodRange();

			// --------------------------------------------------------
			// 3. ĐỌC TOÀN BỘ MODULE CÓ ÍT NHẤT 1 FIELD KPI
			//
			// Không phụ thuộc assignment để tránh bỏ sót auditLog.
			// --------------------------------------------------------
			const moduleSnapshot = await db
				.collection("organizations")
				.doc(orgId)
				.collection("modules")
				.get();

			const kpiModules = [];

			moduleSnapshot.forEach(doc => {
				const data = doc.data() || {};

				const fields =
					Array.isArray(data.fields)
						? data.fields
						: [];

				const kpiFields = fields.filter(
					field =>
						field &&
						typeof field === "object" &&
						field.isKpi === true
				);

				if (kpiFields.length === 0) {
					return;
				}

				kpiModules.push({
					id: doc.id,
					...data,
					fields: fields,
					kpiFields
				});
			});

			if (moduleCountEl) {
				moduleCountEl.textContent =
					String(kpiModules.length);
			}

			if (kpiModules.length === 0) {
				listEl.innerHTML = `
					<div style="
						text-align:center;
						color:#6c757d;
						padding:20px;
						border:1px dashed #ced4da;
						border-radius:6px;
					">
						Chưa có nhiệm vụ nào có trường KPI.
					</div>
				`;

				if (errorCountEl) errorCountEl.textContent = "0";
				if (statusEl) {
					statusEl.textContent = "Không có dữ liệu KPI";
					statusEl.style.color = "#6c757d";
				}

				return;
			}

			// --------------------------------------------------------
			// 4. ĐỌC AUDIT LOG CỦA TỪNG MODULE
			//
			// AuditLog nằm tại:
			// organizations/{orgId}
			//   /academicYears/{academicId}
			//   /modulesData/{moduleId}/auditLogs
			//
			// Ưu tiên tìm entityId = CODE.
			// Nếu không có CODE thì fallback UID/email.
			// --------------------------------------------------------
			let academicId =
				window.currentEmployeeAcademicIdGlobal ||
				document.getElementById(
					"emp-academic-year-select"
				)?.value ||
				"";

			if (
				!academicId &&
				Array.isArray(window.currentAcademicYearsGlobal) &&
				window.currentAcademicYearsGlobal.length > 0
			) {
				academicId =
					window.currentAcademicYearsGlobal[
						window.currentAcademicYearsGlobal.length - 1
					];
			}

			if (!academicId) {
				throw new Error(
					"Không xác định được năm học."
				);
			}

			const auditRows = [];

			// Tránh đọc trùng cùng một audit log nếu có nhiều
			// phương thức nhận diện entity.
			const seenAuditIds = new Set();

			for (const moduleConfig of kpiModules) {
				const moduleId = moduleConfig.id;

				let auditSnapshot = null;

				try {
					const auditRef = db
						.collection("organizations")
						.doc(orgId)
						.collection("academicYears")
						.doc(academicId)
						.collection("modulesData")
						.doc(moduleId)
						.collection("auditLogs");

					// AuditLog hiện tại có date dạng YYYY-MM-DD.
					// Query theo date trước để giảm số lượng đọc.
					const startDateStr =
						period.start.toLocaleDateString("en-CA");

					const endDateStr =
						new Date(period.end.getTime() - 1)
							.toLocaleDateString("en-CA");

					auditSnapshot = await auditRef
						.where("date", ">=", startDateStr)
						.where("date", "<=", endDateStr)
						.get();

				} catch (queryError) {
					// Một số dữ liệu audit cũ có thể thiếu date hoặc
					// Firestore có thể yêu cầu index. Fallback đọc audit
					// logs của module rồi lọc client-side.
					console.warn(
						`[PersonalStatus] Fallback auditLogs module ${moduleId}:`,
						queryError
					);

					const auditRef = db
						.collection("organizations")
						.doc(orgId)
						.collection("academicYears")
						.doc(academicId)
						.collection("modulesData")
						.doc(moduleId)
						.collection("auditLogs");

					auditSnapshot = await auditRef.get();
				}

				if (!auditSnapshot) continue;

				auditSnapshot.forEach(auditDoc => {
					const auditData = auditDoc.data() || {};

					const entityId =
						String(
							auditData.entityId ||
							auditData.memberId ||
							""
						).trim();

					const auditEmail =
						String(
							auditData.updaterEmail ||
							auditData.email ||
							auditData.by ||
							""
						).trim().toLowerCase();

					// ------------------------------------------------
					// Nhận diện đúng người:
					// CODE là khóa chính.
					// UID/email chỉ fallback cho dữ liệu cũ.
					// ------------------------------------------------
					const matchByCode =
						currentCode &&
						entityId &&
						entityId === currentCode;

					const matchByUid =
						!matchByCode &&
						currentUid &&
						entityId &&
						entityId === currentUid;

					const matchByEmail =
						!matchByCode &&
						!matchByUid &&
						currentEmail &&
						auditEmail &&
						auditEmail === currentEmail;

					if (
						!matchByCode &&
						!matchByUid &&
						!matchByEmail
					) {
						return;
					}

					// ------------------------------------------------
					// Lọc chính xác theo khoảng thời gian.
					// Query date đã lọc nhưng fallback có thể chưa.
					// ------------------------------------------------
					let auditDate = null;

					if (auditData.timestamp) {
						auditDate = toDate(auditData.timestamp);
					}

					if (!auditDate && auditData.time) {
						auditDate = toDate(auditData.time);
					}

					if (!auditDate && auditData.date) {
						auditDate = toDate(
							`${auditData.date}T00:00:00`
						);
					}

					if (auditDate) {
						if (
							auditDate < period.start ||
							auditDate >= period.end
						) {
							return;
						}
					}

					const detailItems =
						buildKpiDetailsFromAudit(
							auditData,
							moduleConfig
						);

					if (detailItems.length === 0) {
						return;
					}

					const auditKey =
						`${moduleId}__${auditDoc.id}`;

					if (seenAuditIds.has(auditKey)) {
						return;
					}

					seenAuditIds.add(auditKey);

					const recorderName =
						String(
							auditData.updaterName ||
							auditData.recorderName ||
							auditData.byName ||
							auditData.updaterEmail ||
							auditData.by ||
							"Không xác định"
						).trim();

					const timestamp =
						auditData.timestamp ||
						auditData.time ||
						auditData.date ||
						"";

					detailItems.forEach(detail => {
						auditRows.push({
							moduleId,
							moduleName:
								String(
									moduleConfig.name ||
									moduleConfig.title ||
									moduleId
								).trim(),
							auditId: auditDoc.id,
							timestamp,
							timestampDate: auditDate,
							recorderName,
							recorderEmail:
								String(
									auditData.updaterEmail ||
									auditData.email ||
									""
								).trim(),
							detail: detail.detail,
							fieldKey: detail.fieldKey,
							fieldLabel: detail.fieldLabel,
							optionValue: detail.optionValue,
							optionLabel: detail.optionLabel
						});
					});
				});
			}

			// --------------------------------------------------------
			// 5. SẮP XẾP MỚI NHẤT TRƯỚC
			// --------------------------------------------------------
			auditRows.sort((a, b) => {
				const da =
					a.timestampDate?.getTime?.() || 0;

				const dbTime =
					b.timestampDate?.getTime?.() || 0;

				return dbTime - da;
			});

			// --------------------------------------------------------
			// 6. TỔNG HỢP
			// --------------------------------------------------------
			if (errorCountEl) {
				errorCountEl.textContent =
					String(auditRows.length);
			}

			if (statusEl) {
				if (auditRows.length > 0) {
					statusEl.textContent =
						`Có ${auditRows.length} lỗi ghi nhận`;
					statusEl.style.color = "#dc3545";
				} else {
					statusEl.textContent =
						"Không có lỗi ghi nhận";
					statusEl.style.color = "#198754";
				}
			}

			// --------------------------------------------------------
			// 7. RENDER
			// --------------------------------------------------------
			if (auditRows.length === 0) {
				listEl.innerHTML = `
					<div style="
						text-align:center;
						color:#198754;
						padding:25px 15px;
						border:1px dashed #a3cfbb;
						border-radius:6px;
						background:#f6fffa;
					">
						<div style="
							font-size:1.6em;
							margin-bottom:6px;
						">
							<i class="fa-solid fa-circle-check"></i>
						</div>

						<strong>Không có lỗi KPI</strong>

						<div style="
							margin-top:5px;
							font-size:0.9em;
							color:#6c757d;
						">
							${escapeHtml(period.label)}
						</div>
					</div>
				`;

				return;
			}

			// Bảng đúng 3 cột theo yêu cầu:
			// Thời gian | Người ghi nhận | Lỗi ghi nhận
			const rowsHtml = auditRows.map(row => {
				const timeText =
					formatDateTime(row.timestamp);

				return `
					<tr>
						<td style="
							padding:9px 8px;
							border-bottom:1px solid #eee;
							white-space:nowrap;
							vertical-align:top;
						">
							${escapeHtml(timeText)}
						</td>

						<td style="
							padding:9px 8px;
							border-bottom:1px solid #eee;
							vertical-align:top;
						">
							<div style="font-weight:600;">
								${escapeHtml(row.recorderName)}
							</div>

							${
								row.recorderEmail
									? `
										<div style="
											font-size:0.78em;
											color:#6c757d;
											margin-top:2px;
										">
											${escapeHtml(row.recorderEmail)}
										</div>
									  `
									: ""
							}
						</td>

						<td style="
							padding:9px 8px;
							border-bottom:1px solid #eee;
							vertical-align:top;
						">
							<div style="
								font-weight:600;
								color:#dc3545;
							">
								${escapeHtml(row.detail)}
							</div>

							<div style="
								font-size:0.78em;
								color:#6c757d;
								margin-top:3px;
							">
								${escapeHtml(row.moduleName)}
							</div>
						</td>
					</tr>
				`;
			}).join("");

			listEl.innerHTML = `
				<div style="
					margin-bottom:8px;
					font-size:0.85em;
					color:#6c757d;
				">
					${escapeHtml(period.label)}
				</div>

				<div style="
					overflow-x:auto;
					border:1px solid #dee2e6;
					border-radius:6px;
				">
					<table style="
						width:100%;
						border-collapse:collapse;
						background:#fff;
						font-size:0.9em;
					">
						<thead>
							<tr style="
								background:#f8f9fa;
							">
								<th style="
									padding:10px 8px;
									text-align:left;
									border-bottom:2px solid #dee2e6;
									white-space:nowrap;
								">
									Thời gian
								</th>

								<th style="
									padding:10px 8px;
									text-align:left;
									border-bottom:2px solid #dee2e6;
									white-space:nowrap;
								">
									Người ghi nhận
								</th>

								<th style="
									padding:10px 8px;
									text-align:left;
									border-bottom:2px solid #dee2e6;
								">
									Lỗi ghi nhận
								</th>
							</tr>
						</thead>

						<tbody>
							${rowsHtml}
						</tbody>
					</table>
				</div>
			`;

			console.log(
				"[PersonalStatus] Đã tải dữ liệu:",
				{
					periodType,
					period,
					user: {
						uid: currentUid,
						code: currentCode,
						email: currentEmail
					},
					kpiModules: kpiModules.length,
					auditRows: auditRows.length,
					forceRefresh
				}
			);

		} catch (error) {
			console.error(
				"[PersonalStatus] Lỗi tải trạng thái cá nhân:",
				error
			);

			if (moduleCountEl) moduleCountEl.textContent = "0";
			if (errorCountEl) errorCountEl.textContent = "0";

			if (statusEl) {
				statusEl.textContent = "Lỗi tải dữ liệu";
				statusEl.style.color = "#dc3545";
			}

			listEl.innerHTML = `
				<div style="
					padding:15px;
					color:#842029;
					background:#f8d7da;
					border:1px solid #f5c2c7;
					border-radius:6px;
				">
					<strong>Không thể tải dữ liệu theo dõi cá nhân.</strong>

					<div style="
						margin-top:5px;
						font-size:0.9em;
					">
						${escapeHtml(error.message)}
					</div>
				</div>
			`;
		}
	}

	// Đảm bảo onclick="loadPersonalStatusData()" trong HTML
	// có thể gọi được ngay cả khi JS đang chạy ở module scope.
	window.loadPersonalStatusData = loadPersonalStatusData;



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
	
// ============================================================
// FULLSCREEN API
// ============================================================

async function toggleFullscreen() {
    try {
        // Đang ở fullscreen -> thoát
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }

        // Chưa fullscreen -> bật fullscreen
        const root = document.documentElement;

        if (root.requestFullscreen) {
            await root.requestFullscreen();
        } else if (root.webkitRequestFullscreen) {
            await root.webkitRequestFullscreen();
        } else if (root.msRequestFullscreen) {
            await root.msRequestFullscreen();
        } else {
            console.warn(
                "Trình duyệt không hỗ trợ Fullscreen API."
            );
        }

    } catch (error) {
        console.error(
            "Lỗi Fullscreen API:",
            error
        );
    }
}


// ============================================================
// CẬP NHẬT ICON NÚT FULLSCREEN
// ============================================================

function updateFullscreenButton() {
    const btn =
        document.getElementById("btn-full-screen");

    if (!btn) return;

    const icon =
        btn.querySelector("i");

    if (document.fullscreenElement) {

        btn.title =
            "Thoát toàn màn hình";

        if (icon) {
            icon.className =
                "fa-solid fa-compress";
        }

    } else {

        btn.title =
            "Toàn màn hình";

        if (icon) {
            icon.className =
                "fa-solid fa-expand";
        }
    }
}


// ============================================================
// THEO DÕI TRẠNG THÁI FULLSCREEN
// ============================================================

document.addEventListener(
    "fullscreenchange",
    updateFullscreenButton
);

document.addEventListener(
    "webkitfullscreenchange",
    updateFullscreenButton
);


// Cập nhật trạng thái ban đầu
document.addEventListener(
    "DOMContentLoaded",
    updateFullscreenButton
);