/**
 * 사용자 인증 관리 모듈 (토큰 및 세션 확인)
 */

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
});

/**
 * 로그인 세션 상태 검증 함수
 */
function checkAuth() {
  const path = window.location.pathname;
  const isLoginPage = path.endsWith("index.html") || path.endsWith("/") || path === "";
  
  const token = localStorage.getItem("admin_token");
  const expiresStr = localStorage.getItem("admin_token_expires");
  
  const now = new Date().getTime();
  const isValid = token && expiresStr && now < parseInt(expiresStr);

  if (isLoginPage) {
    // 로그인 페이지인데 토큰이 유효하면 대시보드로 이동
    if (isValid) {
      window.location.href = "dashboard.html";
    }
  } else {
    // 대시보드 및 관리 페이지인데 토큰이 없거나 유효하지 않으면 로그인 페이지로 튕김
    if (!isValid) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_token_expires");
      window.location.href = "index.html";
    }
  }
}

/**
 * 로그아웃 수행 함수
 */
function logout() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_token_expires");
  showToast("로그아웃 되었습니다.", "success");
  setTimeout(() => {
    window.location.href = "index.html";
  }, 1000);
}
