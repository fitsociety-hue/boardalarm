/**
 * 강동어울림복지관 "이용상담문의" 모니터링 & 구글챗 알림 앱 백엔드 (Google Apps Script)
 */

// 1. API 라우터 (GET)
function doGet(e) {
  setupDatabase(); // 최초 실행 및 시트 무결성 보장
  try {
    var action = e.parameter.action;
    var token = e.parameter.token;

    // 인증 제외 액션
    if (action === "login") {
      return returnJson({ success: false, message: "Use POST for login." });
    }

    // 인증 검증
    if (!validateToken(token)) {
      return returnJson({ success: false, message: "AUTH_EXPIRED" });
    }

    switch (action) {
      case "listUrls":
        return returnJson({ success: true, data: getSheetRows("MonitorUrls") });
      case "listWebhooks":
        var webhooks = getSheetRows("Webhooks").map(function(row) {
          // 화면 노출을 위한 마스킹 처리된 URL 필드 추가
          var rawUrl = row.webhookUrl || "";
          var masked = rawUrl;
          if (rawUrl.length > 20) {
            masked = rawUrl.substring(0, 15) + "..." + rawUrl.substring(rawUrl.length - 10);
          }
          row.webhookUrlMasked = masked;
          return row;
        });
        return returnJson({ success: true, data: webhooks });
      case "status":
        return getStatusData();
      case "logs":
        return returnJson({
          success: true,
          data: {
            postLog: getSheetRows("PostLog").slice(-50).reverse(), // 최근 50개
            sendLog: getSheetRows("SendLog").slice(-50).reverse()
          }
        });
      default:
        return returnJson({ success: false, message: "Invalid action." });
    }
  } catch (error) {
    return returnJson({ success: false, message: error.toString() });
  }
}

// 2. API 라우터 (POST)
function doPost(e) {
  setupDatabase();
  try {
    var payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter;
    }

    var action = payload.action;
    var token = payload.token;

    // 로그인 처리 (인증 불필요)
    if (action === "login") {
      var id = payload.id;
      var pw = payload.pw;
      var props = PropertiesService.getScriptProperties();
      var savedId = props.getProperty("ADMIN_ID") || "admin";
      var savedPwHash = props.getProperty("ADMIN_PW_HASH");

      if (id === savedId && sha256(pw) === savedPwHash) {
        var newToken = generateUUID();
        var expires = new Date().getTime() + (12 * 60 * 60 * 1000); // 12시간 유효
        props.setProperty("SESSION_TOKEN", newToken);
        props.setProperty("SESSION_EXPIRES", String(expires));

        // Settings 시트에도 동기화
        updateOrAddSetting("SESSION_TOKEN", newToken);
        updateOrAddSetting("SESSION_EXPIRES", String(expires));

        return returnJson({ success: true, data: { token: newToken, expires: expires } });
      }
      return returnJson({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    // 인증 검증
    if (!validateToken(token)) {
      return returnJson({ success: false, message: "AUTH_EXPIRED" });
    }

    var props = PropertiesService.getScriptProperties();

    switch (action) {
      case "changePassword":
        var currentPw = payload.currentPw;
        var newPw = payload.newPw;
        var savedPwHash = props.getProperty("ADMIN_PW_HASH");
        if (sha256(currentPw) !== savedPwHash) {
          return returnJson({ success: false, message: "현재 비밀번호가 일치하지 않습니다." });
        }
        if (!newPw || newPw.length < 4) {
          return returnJson({ success: false, message: "새 비밀번호는 4자리 이상이어야 합니다." });
        }
        var newPwHash = sha256(newPw);
        props.setProperty("ADMIN_PW_HASH", newPwHash);
        updateOrAddSetting("ADMIN_PW_HASH", newPwHash);
        return returnJson({ success: true, message: "비밀번호가 성공적으로 변경되었습니다." });

      case "addUrl":
        var label = payload.label;
        var url = payload.url;
        if (!label || !url) return returnJson({ success: false, message: "이름과 URL은 필수 입력값입니다." });
        var newId = generateUUID();
        appendSheetRow("MonitorUrls", {
          id: newId,
          label: label,
          url: url,
          enabled: true,
          createdAt: getKstTimestamp()
        });
        return returnJson({ success: true, message: "모니터링 URL이 추가되었습니다." });

      case "updateUrl":
        var id = payload.id;
        var label = payload.label;
        var url = payload.url;
        var enabled = payload.enabled;
        var updated = updateSheetRow("MonitorUrls", "id", id, {
          label: label,
          url: url,
          enabled: enabled === true || enabled === "true" || enabled === 1
        });
        if (updated) return returnJson({ success: true, message: "수정 완료되었습니다." });
        return returnJson({ success: false, message: "대상을 찾을 수 없습니다." });

      case "deleteUrl":
        var id = payload.id;
        var deleted = deleteSheetRow("MonitorUrls", "id", id);
        if (deleted) return returnJson({ success: true, message: "삭제 완료되었습니다." });
        return returnJson({ success: false, message: "대상을 찾을 수 없습니다." });

      case "addWebhook":
        var label = payload.label;
        var webhookUrl = payload.webhookUrl;
        if (!label || !webhookUrl) return returnJson({ success: false, message: "이름과 Webhook URL은 필수 입력값입니다." });
        var newId = generateUUID();
        appendSheetRow("Webhooks", {
          id: newId,
          label: label,
          webhookUrl: webhookUrl,
          createdAt: getKstTimestamp()
        });
        return returnJson({ success: true, message: "웹훅이 추가되었습니다." });

      case "updateWebhook":
        var id = payload.id;
        var label = payload.label;
        var webhookUrl = payload.webhookUrl;
        var updated = updateSheetRow("Webhooks", "id", id, {
          label: label,
          webhookUrl: webhookUrl
        });
        if (updated) return returnJson({ success: true, message: "수정 완료되었습니다." });
        return returnJson({ success: false, message: "대상을 찾을 수 없습니다." });

      case "deleteWebhook":
        var id = payload.id;
        var deleted = deleteSheetRow("Webhooks", "id", id);
        if (deleted) return returnJson({ success: true, message: "삭제 완료되었습니다." });
        return returnJson({ success: false, message: "대상을 찾을 수 없습니다." });

      case "testWebhook":
        var id = payload.id;
        var webhooks = getSheetRows("Webhooks");
        var webhook = webhooks.find(function(w) { return String(w.id) === String(id); });
        if (!webhook) {
          return returnJson({ success: false, message: "웹훅을 찾을 수 없습니다." });
        }
        var message = {
          "text": "✅ **강동어울림복지관 모니터링 알림**\n\n구글 챗 웹훅 연동 테스트 메시지입니다. 정상적으로 수신되었습니다."
        };
        var result = sendToGoogleChat(message, webhook.webhookUrl);
        if (result.success) {
          // Log it
          appendSheetRow("SendLog", {
            id: generateUUID(),
            postId: "TEST",
            webhookId: id,
            sentAt: getKstTimestamp(),
            result: "success",
            errorMessage: ""
          });
          return returnJson({ success: true, message: "테스트 메시지가 발송되었습니다. 구글챗을 확인해 주십시오." });
        } else {
          appendSheetRow("SendLog", {
            id: generateUUID(),
            postId: "TEST",
            webhookId: id,
            sentAt: getKstTimestamp(),
            result: "failed",
            errorMessage: result.message
          });
          return returnJson({ success: false, message: "발송 실패: " + result.message });
        }

      default:
        return returnJson({ success: false, message: "Invalid post action." });
    }
  } catch (error) {
    return returnJson({ success: false, message: error.toString() });
  }
}

// 3. 주기적 게시판 체크 및 새 글 감지 (5분 주기 시간 트리거 등록용)
function checkNewPosts() {
  setupDatabase();
  
  // 큐 플러시 대상인지 체크 (모니터링 대상 URL 활성화 여부와 관계없이 9시에 큐는 비워야 함)
  flushQueueIfDue();

  var urls = getSheetRows("MonitorUrls").filter(function(row) { return row.enabled === true || row.enabled === "true" || row.enabled === 1; });
  if (urls.length === 0) return;

  var webhooks = getSheetRows("Webhooks");
  var postLogs = getSheetRows("PostLog");
  var existingIds = {};
  postLogs.forEach(function(row) {
    existingIds[row.postId] = true;
  });

  var now = new Date();
  var isBiz = isBusinessHours(now);
  var detectedAt = getKstTimestamp();

  urls.forEach(function(monitorRow) {
    try {
      var response = UrlFetchApp.fetch(monitorRow.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        muteHttpExceptions: true
      });
      var responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        throw new Error("HTTP 오류 코드: " + responseCode);
      }
      var htmlContent = response.getContentText("UTF-8");

      var parsedPosts = parsePostList(htmlContent, monitorRow.url);
      
      parsedPosts.forEach(function(post) {
        if (existingIds[post.id]) {
          return; // 이미 감지된 게시글
        }

        var status = "pending";
        if (webhooks.length === 0) {
          status = "no_webhook";
        } else if (isBiz) {
          status = "sending";
        } else {
          status = "queued";
        }

        // PostLog 기록
        appendSheetRow("PostLog", {
          postId: post.id,
          title: post.title,
          author: post.author,
          postedAt: post.date || detectedAt.substring(0, 10),
          detectedAt: detectedAt,
          status: status,
          sentAt: ""
        });

        // 큐 기록 또는 즉시 발송
        if (status === "queued") {
          appendSheetRow("Queue", {
            postId: post.id,
            title: post.title,
            author: post.author,
            postedAt: post.date || detectedAt.substring(0, 10),
            queuedAt: detectedAt,
            url: post.url
          });
        } else if (status === "sending") {
          // 즉시 발송 처리
          var msgText = "📩 **새로운 이용상담문의 게시글이 등록되었습니다.**\n\n" +
                        "• **제목**: " + post.title + "\n" +
                        "• **작성자**: " + post.author + "\n" +
                        "• **작성일**: " + post.date + "\n" +
                        "• **게시글 링크**: " + post.url;
          
          var successCount = 0;
          var errorMessages = [];

          webhooks.forEach(function(web) {
            var res = sendToGoogleChat({ text: msgText }, web.webhookUrl);
            appendSheetRow("SendLog", {
              id: generateUUID(),
              postId: post.id,
              webhookId: web.id,
              sentAt: getKstTimestamp(),
              result: res.success ? "success" : "fail",
              errorMessage: res.success ? "" : res.message
            });
            if (res.success) successCount++;
            else errorMessages.push(res.message);
          });

          updateSheetRow("PostLog", "postId", post.id, {
            status: successCount > 0 ? "sent" : "failed",
            sentAt: getKstTimestamp()
          });
        }
      });

    } catch (e) {
      Logger.log("Error crawling " + monitorRow.label + ": " + e.toString());
      appendSheetRow("SendLog", {
        id: generateUUID(),
        postId: "CRAWL_ERROR",
        webhookId: monitorRow.label,
        sentAt: getKstTimestamp(),
        result: "fail",
        errorMessage: e.toString()
      });
    }
  });

}

// 4. 큐 플러시 스케줄러 (평일 오전 9시 정각 ~ 09:10 사이 1회 일괄 발송)
function flushQueueIfDue() {
  var now = new Date();
  var kstStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy/MM/dd HH:mm:ss");
  var kstDate = new Date(kstStr);
  var dayOfWeek = kstDate.getDay(); // 0(Sun) ~ 6(Sat)
  var hour = kstDate.getHours();
  
  // 평일(월~금: 1~5) 오전 9시 시간대 검증
  if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 9) {
    var todayStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd");
    var props = PropertiesService.getScriptProperties();
    var lastFlushDate = props.getProperty("LAST_FLUSH_DATE");

    if (lastFlushDate !== todayStr) {
      props.setProperty("LAST_FLUSH_DATE", todayStr);
      updateOrAddSetting("LAST_FLUSH_DATE", todayStr);
      
      executeQueueFlush();
    }
  }
}

// 큐의 실제 발송 처리 함수
function executeQueueFlush() {
  var queueRows = getSheetRows("Queue");
  if (queueRows.length === 0) return;

  var webhooks = getSheetRows("Webhooks");
  if (webhooks.length === 0) return;

  // 알림 메시지 카드 생성
  var msgText = "📅 **[주말/업무시간 외 접수] 이용상담문의 요약 알림**\n" +
                "업무시간 외에 새로운 문의글이 **" + queueRows.length + "건** 접수되었습니다. 아래 목록을 확인해 주십시오.\n\n";

  queueRows.forEach(function(item, idx) {
    msgText += (idx + 1) + ". **" + item.title + "** (" + item.author + ", " + item.postedAt + ")\n" +
               "🔗 [게시글 열기](" + item.url + ")\n\n";
  });

  var successCount = 0;
  var errors = [];

  webhooks.forEach(function(web) {
    var res = sendToGoogleChat({ text: msgText }, web.webhookUrl);
    appendSheetRow("SendLog", {
      id: generateUUID(),
      postId: "QUEUE_FLUSH_" + getKstTimestamp().substring(0,10),
      webhookId: web.id,
      sentAt: getKstTimestamp(),
      result: res.success ? "success" : "fail",
      errorMessage: res.success ? "" : res.message
    });
    if (res.success) successCount++;
    else errors.push(res.message);
  });

  // 상태 업데이트 및 큐 비우기
  queueRows.forEach(function(item) {
    updateSheetRow("PostLog", "postId", item.postId, {
      status: successCount > 0 ? "sent" : "failed",
      sentAt: getKstTimestamp()
    });
  });

  // Queue 시트 비우기
  var ss = getSpreadsheet();
  var queueSheet = ss.getSheetByName("Queue");
  if (queueSheet && queueSheet.getLastRow() > 1) {
    queueSheet.deleteRows(2, queueSheet.getLastRow() - 1);
  }
}

// 5. 게시판 파싱 핵심 로직
function parsePostList(htmlContent, boardUrl) {
  var posts = [];
  var seenIds = {};

  // GNUBoard 게시판 tr 단위 파싱
  var rows = htmlContent.split(/<tr/i);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    
    // board.php?bo_table=counseling&amp;wr_id=103 패턴 추출 (작은따옴표, 큰따옴표 모두 처리)
    var linkMatch = row.match(/href=["']([^"']*bo_table=([^"&]+)(?:&amp;|&)wr_id=(\d+))["']/i);
    if (!linkMatch) continue;

    var fullLink = linkMatch[1];
    var bo_table = linkMatch[2];
    var wr_id = linkMatch[3];

    if (seenIds[wr_id]) continue;
    seenIds[wr_id] = true;

    // 제목 추출 (해당 wr_id를 포함한 a태그 텍스트)
    var titleRegex = new RegExp('<a[^>]*wr_id=' + wr_id + '[^>]*>([\\s\\S]*?)<\/a>', 'i');
    var titleMatch = row.match(titleRegex);
    var title = "";
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      title = unescapeHtml(title);
    }

    // 작성자 추출 (클래스 속성 쿼트 무관하게 처리)
    var author = "";
    var authorMatch = row.match(/class=["']sv_member["'][^>]*>([\s\S]*?)<\/span>/i);
    if (!authorMatch) {
      authorMatch = row.match(/class=["']sv_no_member["'][^>]*>([\s\S]*?)<\/span>/i);
    }
    if (!authorMatch) {
      authorMatch = row.match(/<span[^>]*class=["']sv_member["'][^>]*>([\s\S]*?)<\/span>/i);
    }
    if (!authorMatch) {
      authorMatch = row.match(/<li[^>]*class=["']name["'][^>]*>([\s\S]*?)<\/li>/i);
    }
    if (authorMatch) {
      author = authorMatch[1].replace(/<[^>]+>/g, '').trim();
      author = unescapeHtml(author);
    } else {
      author = "작성자 제한";
    }

    // 작성일 추출
    var dateStr = "";
    var dateMatch = row.match(/class=["']date["'][^>]*>.*?clock-o".*?>\s*<\/i>\s*([\d\-\:\s]+)/i);
    if (!dateMatch) {
      dateMatch = row.match(/class=["']date["'][^>]*>([\s\S]*?)<\/li>/i);
    }
    if (dateMatch) {
      dateStr = dateMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    var absoluteUrl = "https://gde.or.kr/bbs/board.php?bo_table=" + bo_table + "&wr_id=" + wr_id;

    posts.push({
      id: wr_id,
      title: title || "제목 없음",
      author: author || "익명",
      date: dateStr || "",
      url: absoluteUrl
    });
  }

  return posts;
}

// 6. 구글챗 Incoming Webhook 전송 함수
function sendToGoogleChat(payload, webhookUrl) {
  try {
    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };
    var response = UrlFetchApp.fetch(webhookUrl, options);
    var resCode = response.getResponseCode();
    if (resCode === 200 || resCode === 201) {
      return { success: true };
    } else {
      return { success: false, message: "Response Code: " + resCode + ", Body: " + response.getContentText() };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 7. 데이터베이스 초기화 및 시트 자동 생성
function setupDatabase() {
  var ss = getSpreadsheet();
  
  var sheetsDef = {
    "Settings": ["Key", "Value"],
    "MonitorUrls": ["id", "label", "url", "enabled", "createdAt"],
    "Webhooks": ["id", "label", "webhookUrl", "createdAt"],
    "PostLog": ["postId", "title", "author", "postedAt", "detectedAt", "status", "sentAt"],
    "Queue": ["postId", "title", "author", "postedAt", "queuedAt", "url"],
    "SendLog": ["id", "postId", "webhookId", "sentAt", "result", "errorMessage"]
  };
  
  for (var name in sheetsDef) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(sheetsDef[name]);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(sheetsDef[name]);
    }
  }

  // 기본 관리자 계정 설정 (Settings 시트 & Script Properties 이중화)
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_ID")) {
    props.setProperty("ADMIN_ID", "admin");
    props.setProperty("ADMIN_PW_HASH", sha256("1234"));
    
    updateOrAddSetting("ADMIN_ID", "admin");
    updateOrAddSetting("ADMIN_PW_HASH", sha256("1234"));
  }
  
  // 공휴일 기본 세팅 (설날/추석 등 확장을 위한 예시 가이드)
  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName("Settings");
  if (settingsSheet) {
    var settingsRows = getSheetRows("Settings");
    var hasHolidays = settingsRows.some(function(r) { return r.Key === "holidays"; });
    if (!hasHolidays) {
      updateOrAddSetting("holidays", "2026-08-15, 2026-10-03, 2026-12-25");
    }
  }
}

// 8. 헬퍼 유틸리티 함수군
function getSpreadsheet() {
  var ssId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (ssId) {
    return SpreadsheetApp.openById(ssId);
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    throw new Error("Spreadsheet not found. Bind this script to a Google Sheet, or set SPREADSHEET_ID in Properties.");
  }
}

function getSheetRows(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  return values.map(function(row) {
    var obj = {};
    headers.forEach(function(header, idx) {
      obj[header] = row[idx];
    });
    return obj;
  });
}

function appendSheetRow(sheetName, dataObj) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var row = headers.map(function(header) {
    return dataObj[header] !== undefined ? dataObj[header] : "";
  });
  sheet.appendRow(row);
}

function updateSheetRow(sheetName, idKey, idVal, updateObj) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  var idIdx = headers.indexOf(idKey);
  if (idIdx === -1) return false;
  
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idIdx]) === String(idVal)) {
      var rowNum = i + 2;
      for (var key in updateObj) {
        var colIdx = headers.indexOf(key);
        if (colIdx !== -1) {
          sheet.getRange(rowNum, colIdx + 1).setValue(updateObj[key]);
        }
      }
      return true;
    }
  }
  return false;
}

function deleteSheetRow(sheetName, idKey, idVal) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  var idIdx = headers.indexOf(idKey);
  if (idIdx === -1) return false;
  
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idIdx]) === String(idVal)) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function updateOrAddSetting(key, value) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) return;
  var rows = getSheetRows("Settings");
  var found = false;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Key === key) {
      sheet.getRange(i + 2, 2).setValue(value);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([key, value]);
  }
}

// 9. 인증 및 암호 해싱 유틸
function validateToken(token) {
  if (!token) return false;
  var props = PropertiesService.getScriptProperties();
  var savedToken = props.getProperty("SESSION_TOKEN");
  var expiresStr = props.getProperty("SESSION_EXPIRES");
  if (!savedToken || !expiresStr) return false;
  
  var expires = parseInt(expiresStr);
  var now = new Date().getTime();
  
  if (token === savedToken && now < expires) {
    return true;
  }
  return false;
}

function sha256(value) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  var hexString = "";
  for (var i = 0; i < digest.length; i++) {
    var byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    var byteString = byteVal.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    hexString += byteString;
  }
  return hexString;
}

function generateUUID() {
  return Utilities.getUuid();
}

function returnJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getKstTimestamp() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
}

function isBusinessHours(date) {
  var kstStr = Utilities.formatDate(date, "Asia/Seoul", "yyyy/MM/dd HH:mm:ss");
  var kstDate = new Date(kstStr);
  var dayOfWeek = kstDate.getDay(); // 0(Sun) ~ 6(Sat)
  var hour = kstDate.getHours();
  
  // 주말 필터링 (0: 일요일, 6: 토요일)
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  
  // 공휴일 필터링 (v2 확장 포인트)
  try {
    var rows = getSheetRows("Settings");
    var holidaySetting = rows.find(function(r) { return r.Key === "holidays"; });
    if (holidaySetting && holidaySetting.Value) {
      var todayStr = Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd");
      var holidays = holidaySetting.Value.split(",").map(function(h) { return h.trim(); });
      if (holidays.indexOf(todayStr) !== -1) {
        return false; // 공휴일이므로 영업시간 외(큐 적재) 처리
      }
    }
  } catch (e) {
    // 설정 로드 에러 시 기존 평일/주말 및 시간 필터만 작동하도록 에러 전파 방지
  }
  
  // 평일(월~금) 09:00 ~ 18:00 (18:00 미만)
  return (hour >= 9 && hour < 18);
}

function unescapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 10. 대시보드 요약 정보 조회
function getStatusData() {
  var urls = getSheetRows("MonitorUrls");
  var queue = getSheetRows("Queue");
  var postLogs = getSheetRows("PostLog");
  var sendLogs = getSheetRows("SendLog");

  var activeUrlCount = urls.filter(function(u) { return u.enabled === true || u.enabled === "true" || u.enabled === 1; }).length;
  var totalQueueCount = queue.length;

  var lastCrawlTime = "-";
  var successCrawls = sendLogs.filter(function(l) { return l.postId === "TEST" || l.result === "success"; });
  if (postLogs.length > 0) {
    // 가장 최근 감지된 시간
    lastCrawlTime = postLogs[postLogs.length - 1].detectedAt;
  }

  // 다음 예정된 월요일/익일 오전 9시 계산
  var now = new Date();
  var nextSendKst = getNextSendTimeKst(now);

  return returnJson({
    success: true,
    data: {
      activeUrlCount: activeUrlCount,
      totalUrlCount: urls.length,
      totalQueueCount: totalQueueCount,
      lastCrawlTime: lastCrawlTime,
      nextSendTime: nextSendKst
    }
  });
}

// 다음 09:00 시간 추출 로직
function getNextSendTimeKst(now) {
  var kstStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy/MM/dd HH:mm:ss");
  var kstDate = new Date(kstStr);
  var dayOfWeek = kstDate.getDay(); // 0(Sun) ~ 6(Sat)
  var hour = kstDate.getHours();
  
  var target = new Date(now.getTime());
  
  // 지금이 평일 09:00 이전이면 오늘 09:00
  if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour < 9) {
    target.setHours(9, 0, 0, 0);
  } else {
    // 그 외에는 다음 날로 이동하며 평일을 찾음
    do {
      target.setDate(target.getDate() + 1);
      var targetKstStr = Utilities.formatDate(target, "Asia/Seoul", "yyyy/MM/dd HH:mm:ss");
      var targetKstDate = new Date(targetKstStr);
      dayOfWeek = targetKstDate.getDay(); // 0(Sun) ~ 6(Sat)
    } while (dayOfWeek === 0 || dayOfWeek === 6); // 0(Sun), 6(Sat) 이면 다시 하루 뒤
    target.setHours(9, 0, 0, 0);
  }
  
  return Utilities.formatDate(target, "Asia/Seoul", "yyyy-MM-dd 09:00:00");
}
