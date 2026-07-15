/**
 * 대시보드 비즈니스 로직 및 UI 제어
 */

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initForms();
  
  // 초기 탭 로딩
  const hash = window.location.hash || "#overview";
  switchTabByHash(hash);

  // 주기적 현황 갱신 (1분 간격)
  setInterval(() => {
    const activeTab = document.querySelector(".sidebar-menu-item.active").getAttribute("data-tab");
    if (activeTab === "tab-overview") {
      loadOverview();
    }
  }, 60000);
});

// 1. 탭 전환 처리
function initTabs() {
  const menuItems = document.querySelectorAll(".sidebar-menu-item");
  menuItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = item.getAttribute("data-tab");
      const hash = item.querySelector("a").getAttribute("href");
      
      // URL 해시 갱신 (비동기 히스토리)
      window.history.pushState(null, null, hash);
      
      activateTab(tabId);
    });
  });

  // 브라우저 뒤로가기/앞으로가기 대응
  window.addEventListener("popstate", () => {
    const hash = window.location.hash || "#overview";
    switchTabByHash(hash);
  });
}

function switchTabByHash(hash) {
  const targetItem = Array.from(document.querySelectorAll(".sidebar-menu-item"))
    .find(item => item.querySelector("a").getAttribute("href") === hash);
  
  if (targetItem) {
    const tabId = targetItem.getAttribute("data-tab");
    activateTab(tabId);
  }
}

function activateTab(tabId) {
  // 사이드바 클래스 정리
  document.querySelectorAll(".sidebar-menu-item").forEach(i => i.classList.remove("active"));
  const menuItem = document.querySelector(`[data-tab="${tabId}"]`);
  if (menuItem) menuItem.classList.add("active");

  // 패널 숨김/노출 정리
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add("active");

  // 각 탭별 필요한 데이터 자동 로드
  if (tabId === "tab-overview") {
    loadOverview();
  } else if (tabId === "tab-urls") {
    loadUrls();
  } else if (tabId === "tab-webhooks") {
    loadWebhooks();
  } else if (tabId === "tab-logs") {
    loadLogs();
  }
}

// 2. 종합 현황 데이터 로드
async function loadOverview() {
  const response = await callApi("status", {}, "GET");
  if (response && response.success) {
    const data = response.data;
    document.getElementById("statActiveUrls").innerText = `${data.activeUrlCount} / ${data.totalUrlCount}`;
    document.getElementById("statQueueCount").innerText = `${data.totalQueueCount} 건`;
    document.getElementById("statNextSend").innerText = data.nextSendTime || "-";
    document.getElementById("statLastCrawl").innerText = data.lastCrawlTime || "-";
  }
}

function refreshDashboard() {
  showToast("현황을 갱신합니다...", "info");
  loadOverview();
}

// 3. 모니터링 URL CRUD 제어
let urlListCache = [];

async function loadUrls() {
  const response = await callApi("listUrls", {}, "GET");
  const tbody = document.getElementById("urlTableBody");
  
  if (response && response.success) {
    urlListCache = response.data;
    tbody.innerHTML = "";
    
    if (urlListCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">등록된 모니터링 대상이 없습니다.</td></tr>`;
      return;
    }

    urlListCache.forEach(item => {
      const isEnabled = item.enabled === true || item.enabled === "true" || item.enabled === 1;
      const statusBadge = isEnabled 
        ? `<span class="badge badge-success">감지중</span>`
        : `<span class="badge badge-danger">일시중지</span>`;
      
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 600;">${escapeHtml(item.label)}</td>
        <td><a href="${item.url}" target="_blank" style="color: var(--primary-blue); text-decoration: none;">${escapeHtml(item.url)}</a></td>
        <td>${statusBadge}</td>
        <td style="color: var(--text-secondary); font-size: 13px;">${formatDateString(item.createdAt)}</td>
        <td>
          <div class="action-buttons">
            <button onclick="editUrl('${item.id}')" class="btn btn-secondary btn-icon" title="수정"><i class="fa-solid fa-pen"></i></button>
            <button onclick="deleteUrl('${item.id}')" class="btn btn-danger btn-icon" title="삭제"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--error);">데이터 로딩 실패: ${response.message}</td></tr>`;
  }
}

function openUrlModal() {
  document.getElementById("urlForm").reset();
  document.getElementById("urlId").value = "";
  document.getElementById("urlModalTitle").innerText = "모니터링 대상 추가";
  document.getElementById("urlEnabledWrapper").style.display = "none";
  document.getElementById("urlModal").classList.add("active");
}

function closeUrlModal() {
  document.getElementById("urlModal").classList.remove("active");
}

function editUrl(id) {
  const item = urlListCache.find(u => String(u.id) === String(id));
  if (!item) return;

  document.getElementById("urlId").value = item.id;
  document.getElementById("urlLabel").value = item.label;
  document.getElementById("urlInput").value = item.url;
  
  const isEnabled = item.enabled === true || item.enabled === "true" || item.enabled === 1;
  document.getElementById("urlEnabled").checked = isEnabled;
  
  document.getElementById("urlModalTitle").innerText = "모니터링 대상 수정";
  document.getElementById("urlEnabledWrapper").style.display = "flex";
  document.getElementById("urlModal").classList.add("active");
}

async function deleteUrl(id) {
  if (confirm("정말로 이 모니터링 URL을 삭제하시겠습니까?")) {
    showToast("삭제 중...", "info");
    const response = await callApi("deleteUrl", { id: id });
    if (response && response.success) {
      showToast("삭제가 완료되었습니다.", "success");
      loadUrls();
    } else {
      showToast(`삭제 실패: ${response.message}`, "error");
    }
  }
}

// 4. 구글챗 웹훅 CRUD 제어
let webhookListCache = [];

async function loadWebhooks() {
  const response = await callApi("listWebhooks", {}, "GET");
  const tbody = document.getElementById("webhookTableBody");
  
  if (response && response.success) {
    webhookListCache = response.data;
    tbody.innerHTML = "";
    
    if (webhookListCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">등록된 구글챗 웹훅이 없습니다.</td></tr>`;
      return;
    }

    webhookListCache.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 600;">${escapeHtml(item.label)}</td>
        <td class="webhook-url-cell" data-raw-url="${escapeHtml(item.webhookUrl)}">
          <span class="masked-url">${escapeHtml(item.webhookUrlMasked)}</span>
          <button onclick="toggleUrlMask(this)" class="btn-mask"><i class="fa-solid fa-eye"></i></button>
        </td>
        <td style="color: var(--text-secondary); font-size: 13px;">${formatDateString(item.createdAt)}</td>
        <td>
          <div class="action-buttons">
            <button onclick="testWebhook('${item.id}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;"><i class="fa-solid fa-paper-plane"></i> 테스트 발송</button>
            <button onclick="editWebhook('${item.id}')" class="btn btn-secondary btn-icon" title="수정"><i class="fa-solid fa-pen"></i></button>
            <button onclick="deleteWebhook('${item.id}')" class="btn btn-danger btn-icon" title="삭제"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--error);">데이터 로딩 실패: ${response.message}</td></tr>`;
  }
}

function toggleUrlMask(btn) {
  const cell = btn.closest(".webhook-url-cell");
  const span = cell.querySelector(".masked-url");
  const icon = btn.querySelector("i");
  const isMasked = span.innerText.includes("...");

  if (isMasked) {
    span.innerText = cell.getAttribute("data-raw-url");
    icon.className = "fa-solid fa-eye-slash";
  } else {
    // 다시 마스킹
    const rawUrl = cell.getAttribute("data-raw-url");
    let masked = rawUrl;
    if (rawUrl.length > 20) {
      masked = rawUrl.substring(0, 15) + "..." + rawUrl.substring(rawUrl.length - 10);
    }
    span.innerText = masked;
    icon.className = "fa-solid fa-eye";
  }
}

function openWebhookModal() {
  document.getElementById("webhookForm").reset();
  document.getElementById("webhookId").value = "";
  document.getElementById("webhookModalTitle").innerText = "구글챗 웹훅 추가";
  document.getElementById("webhookModal").classList.add("active");
}

function closeWebhookModal() {
  document.getElementById("webhookModal").classList.remove("active");
}

function editWebhook(id) {
  const item = webhookListCache.find(w => String(w.id) === String(id));
  if (!item) return;

  document.getElementById("webhookId").value = item.id;
  document.getElementById("webhookLabel").value = item.label;
  document.getElementById("webhookUrlInput").value = item.webhookUrl;
  
  document.getElementById("webhookModalTitle").innerText = "구글챗 웹훅 수정";
  document.getElementById("webhookModal").classList.add("active");
}

async function deleteWebhook(id) {
  if (confirm("정말로 이 웹훅 설정을 삭제하시겠습니까?")) {
    showToast("삭제 중...", "info");
    const response = await callApi("deleteWebhook", { id: id });
    if (response && response.success) {
      showToast("삭제가 완료되었습니다.", "success");
      loadWebhooks();
    } else {
      showToast(`삭제 실패: ${response.message}`, "error");
    }
  }
}

async function testWebhook(id) {
  showToast("구글챗 테스트 메시지 발송 중...", "info");
  const response = await callApi("testWebhook", { id: id });
  if (response && response.success) {
    showToast(response.message, "success");
  } else {
    showToast(`테스트 발송 실패: ${response.message}`, "error");
  }
}

// 5. 로그 리스트 조회
async function loadLogs() {
  const response = await callApi("logs", {}, "GET");
  const postBody = document.getElementById("postLogTableBody");
  const sendBody = document.getElementById("sendLogTableBody");

  if (response && response.success) {
    const { postLog, sendLog } = response.data;

    // (1) 감지된 게시글 로그 렌더링
    postBody.innerHTML = "";
    if (postLog.length === 0) {
      postBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">감지 이력이 없습니다.</td></tr>`;
    } else {
      postLog.forEach(row => {
        let statusBadge = "";
        switch (row.status) {
          case "sent":
            statusBadge = `<span class="badge badge-success">발송 완료</span>`;
            break;
          case "queued":
            statusBadge = `<span class="badge badge-warning">큐 적재 (대기)</span>`;
            break;
          case "failed":
            statusBadge = `<span class="badge badge-danger">발송 실패</span>`;
            break;
          case "no_webhook":
            statusBadge = `<span class="badge badge-danger">웹훅 미설정</span>`;
            break;
          default:
            statusBadge = `<span class="badge badge-info">${row.status || "대기"}</span>`;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(row.postId)}</td>
          <td style="font-weight: 600;">${escapeHtml(row.title)}</td>
          <td>${escapeHtml(row.author)}</td>
          <td style="color: var(--text-secondary); font-size: 13px;">${formatDateString(row.postedAt)}</td>
          <td style="color: var(--text-secondary); font-size: 13px;">${formatDateString(row.detectedAt)}</td>
          <td>${statusBadge}</td>
          <td style="color: var(--text-secondary); font-size: 13px;">${formatDateString(row.sentAt) || "-"}</td>
        `;
        postBody.appendChild(tr);
      });
    }

    // (2) 알림 발송 결과 로그 렌더링
    sendBody.innerHTML = "";
    if (sendLog.length === 0) {
      sendBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">발송 내역이 없습니다.</td></tr>`;
    } else {
      sendLog.forEach(row => {
        const isSuccess = row.result === "success" || row.result === "true";
        const resultBadge = isSuccess
          ? `<span class="badge badge-success">성공</span>`
          : `<span class="badge badge-danger">실패</span>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.postId)}</td>
          <td style="font-weight: 600;">${escapeHtml(row.webhookId)}</td>
          <td style="color: var(--text-secondary); font-size: 13px;">${formatDateString(row.sentAt)}</td>
          <td>${resultBadge}</td>
          <td style="color: var(--error); font-size: 12px; font-weight: 500;">${escapeHtml(row.errorMessage) || "-"}</td>
        `;
        sendBody.appendChild(tr);
      });
    }

  } else {
    const errTr = `<tr><td colspan="7" style="text-align: center; color: var(--error);">로그 조회 실패: ${response.message}</td></tr>`;
    postBody.innerHTML = errTr;
    sendBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--error);">로그 조회 실패</td></tr>`;
  }
}

function refreshLogs() {
  showToast("로그를 갱신합니다...", "info");
  loadLogs();
}

// 6. 폼 이벤트 핸들러 초기화
function initForms() {
  // 모니터링 URL 폼 등록/수정
  document.getElementById("urlForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("urlId").value;
    const label = document.getElementById("urlLabel").value.trim();
    const url = document.getElementById("urlInput").value.trim();
    const enabled = document.getElementById("urlEnabled").checked;

    if (!label || !url) return;

    showToast("저장 중...", "info");
    let response;
    if (id) {
      // 수정
      response = await callApi("updateUrl", { id: id, label: label, url: url, enabled: enabled });
    } else {
      // 신규 등록
      response = await callApi("addUrl", { label: label, url: url });
    }

    if (response && response.success) {
      showToast(response.message, "success");
      closeUrlModal();
      loadUrls();
    } else {
      showToast(`저장 실패: ${response.message}`, "error");
    }
  });

  // 구글챗 웹훅 폼 등록/수정
  document.getElementById("webhookForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("webhookId").value;
    const label = document.getElementById("webhookLabel").value.trim();
    const webhookUrl = document.getElementById("webhookUrlInput").value.trim();

    if (!label || !webhookUrl) return;

    showToast("저장 중...", "info");
    let response;
    if (id) {
      // 수정
      response = await callApi("updateWebhook", { id: id, label: label, webhookUrl: webhookUrl });
    } else {
      // 신규 등록
      response = await callApi("addWebhook", { label: label, webhookUrl: webhookUrl });
    }

    if (response && response.success) {
      showToast(response.message, "success");
      closeWebhookModal();
      loadWebhooks();
    } else {
      showToast(`저장 실패: ${response.message}`, "error");
    }
  });

  // 비밀번호 변경 폼
  document.getElementById("changePasswordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentPw = document.getElementById("currentPw").value;
    const newPw = document.getElementById("newPw").value;
    const newPwConfirm = document.getElementById("newPwConfirm").value;

    if (newPw.length < 4) {
      showToast("새 비밀번호는 최소 4자리 이상이어야 합니다.", "warning");
      return;
    }
    if (newPw !== newPwConfirm) {
      showToast("새 비밀번호와 확인 값이 일치하지 않습니다.", "warning");
      return;
    }

    showToast("비밀번호 변경 중...", "info");
    const response = await callApi("changePassword", { currentPw: currentPw, newPw: newPw });

    if (response && response.success) {
      showToast(response.message, "success");
      document.getElementById("changePasswordForm").reset();
    } else {
      showToast(`변경 실패: ${response.message}`, "error");
    }
  });
}

// 7. 유틸리티 함수들
function escapeHtml(string) {
  if (!string) return "";
  return String(string)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateString(dateVal) {
  if (!dateVal) return "";
  try {
    let cleanDateVal = String(dateVal);
    // YYYY-MM-DD HH:mm:ss 형식이면 공백을 T로 바꾸어 Safari 등 브라우저 호환성 확보
    if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(cleanDateVal)) {
      cleanDateVal = cleanDateVal.replace(" ", "T");
    }
    const d = new Date(cleanDateVal);
    if (isNaN(d.getTime())) {
      // 파싱 불가능한 단순 문자열
      return dateVal;
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");

    // 시분이 00:00:00이면 YYYY-MM-DD 만 리턴
    if (hours === "00" && minutes === "00" && seconds === "00") {
      return `${year}-${month}-${day}`;
    }
    
    // 시분이 존재하면 YYYY-MM-DD HH:mm:ss 리턴
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateVal;
  }
}
