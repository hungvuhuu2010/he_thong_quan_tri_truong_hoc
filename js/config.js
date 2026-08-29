// =========================================================
// 1. CẤU HÌNH FIREBASE CONSOLE
// (Thay thế bằng cấu hình thực tế lấy từ Firebase Console -> Project Settings)
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyD8JZXIaqqLSv-or2jlqxLo42EqQoUKS2k",
  authDomain: "he-thong-quan-tri-nhan-su.firebaseapp.com",
  projectId: "he-thong-quan-tri-nhan-su",
  storageBucket: "he-thong-quan-tri-nhan-su.appspot.com",
  messagingSenderId: "1085551186756",
  appId: "1:1085551186756:web:25a6cc3a74ff14fac03d11"
};

// Khởi tạo Firebase App
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// =========================================================
// 2. BIẾN TRẠNG THÁI TOÀN CỤC (GLOBAL STATE)
// =========================================================
let currentUser = null;            // User Firebase Auth hiện tại
let currentUserProfile = null;     // Document data từ Firestore (users/{uid})
let currentOrgSchema = null;       // Schema định nghĩa trường của đơn vị hiện tại