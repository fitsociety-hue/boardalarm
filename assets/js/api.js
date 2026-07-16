/**
 * API 통신 모듈 (Google Apps Script Web App 연동)
 */

// 사용자가 배포한 Google Apps Script 웹앱 URL을 입력합니다.
const API_BASE = "https://script.google.com/macros/s/AKfycbzeMwiBjrVKlE5MK6E6KnvRij_2ziWJ42h6GfDgsOUYRwJ1hGpJ3DVXXZ9-Dwp2FmRN/exec";

/**
 * GAS Web App API 호출 공통 함수
 * @param {string} action - 실행할 액션명
 * @param {object} params - 전송할 파라미터 객체
 * @param {string} method - HTTP 메소드 ('GET' 또는 'POST')
 */
async function callApi(action, params = {}, method = 'POST') {
  const token = localStorage.getItem("admin_token");
  const payload = {
    action: action,
    token: token,
    ...params
  };

  try {
    let url = API_BASE;
    let options = {};

    if (method === 'GET') {
      // GET 방식은 쿼리 파라미터로 전달
      const queryParams = new URLSearchParams();
      for (const key in payload) {
        if (payload[key] !== undefined && payload[key] !== null) {
          queryParams.append(key, payload[key]);
        }
      }
      url = `${API_BASE}?${queryParams.toString()}`;
      options = {
        method: 'GET',
        mode: 'cors'
      };
    } else {
      // POST 방식 (CORS preflightOPTIONS 요청을 피하기 위해 Content-Type 헤더를 명시하지 않고 단순 텍스트로 보냄)
      options = {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(payload)
      };
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // 세션 만료 처리
    if (result && result.message === "AUTH_EXPIRED") {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_token_expires");
      showToast("세션이 만료되었습니다. 다시 로그인해 주십시오.", "error");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
      throw new Error("AUTH_EXPIRED");
    }

    return result;
  } catch (error) {
    if (error.message !== "AUTH_EXPIRED") {
      console.error("API Call Error:", error);
      showToast(`통신 오류가 발생했습니다: ${error.message}`, "error");
    }
    return { success: false, message: error.message };
  }
}

/**
 * 토스트 메시지 표시 함수 (화면에 팝업 알림 제공)
 */
function showToast(message, type = 'success') {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = '<i class="fa fa-check-circle"></i>';
  if (type === 'error') {
    icon = '<i class="fa fa-exclamation-circle"></i>';
  } else if (type === 'warning') {
    icon = '<i class="fa fa-exclamation-triangle"></i>';
  }

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  // 3초 후 삭제 애니메이션 및 DOM 제거
  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s ease reverse forwards";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}
